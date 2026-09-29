"""Install a validated static artifact without executing the image."""

import argparse
import fcntl
import hashlib
import json
import os
import re
import resource
import stat
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import uuid
from pathlib import Path, PurePosixPath

REPOSITORY = "ghcr.io/oso7865-ship-it/prism-frontend"
SOURCE = "https://github.com/oso7865-ship-it/Prism-Frontend"
MAX_BYTES = 32 * 1024 * 1024


class DeployError(Exception):
    pass


def identity(image, revision, sequence):
    if not re.fullmatch(re.escape(REPOSITORY) + r"@sha256:[0-9a-f]{64}", image):
        raise DeployError("INVALID_IMAGE")
    if not re.fullmatch(r"[a-f0-9]{40}", revision):
        raise DeployError("INVALID_REVISION")
    if not isinstance(sequence, int) or not 1 <= sequence < 2**53:
        raise DeployError("INVALID_SEQUENCE")


def protected(path, secret=False):
    path = Path(path)
    for item in [path, *path.parents]:
        info = item.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise DeployError("UNSAFE_PATH")
    if secret and path.stat().st_mode & 0o077:
        raise DeployError("UNSAFE_SECRET_PERMISSIONS")
    return path


def load_config():
    config = json.loads(protected("/etc/prism/frontend-deploy.json", True).read_text())
    if config.get("enabled") is not True:
        raise DeployError("DEPLOYMENT_NOT_ACTIVATED")
    expected = {
        "image_repository": REPOSITORY,
        "docker_config": "/root/.docker",
        "site_root": "/srv/prism-frontend",
        "state_dir": "/var/lib/prism-frontend-deploy",
    }
    if any(config.get(key) != value for key, value in expected.items()):
        raise DeployError("UNEXPECTED_CONFIGURATION")
    protected(Path(config["docker_config"]) / "config.json", True)
    protected(config["site_root"])
    protected(Path(config["site_root"]) / "releases")
    protected(config["state_dir"], True)
    return config


def unpack(archive, destination):
    """Accept regular public web assets only; never call tar.extractall."""
    members = []
    seen = set()
    total = 0
    with tarfile.open(archive, mode="r:") as bundle:
        for member in bundle:
            name = member.name.removeprefix("./").rstrip("/")
            if name in {"", "."} and member.isdir():
                continue
            parts = PurePosixPath(name).parts
            if (
                not parts
                or any(p.startswith(".") for p in parts)
                or "\\" in name
                or name.startswith("/")
            ):
                raise DeployError("INVALID_ASSET_PATH")
            if name in seen or not re.fullmatch(r"[A-Za-z0-9_./-]+", name):
                raise DeployError("INVALID_ASSET_NAME")
            seen.add(name)
            if len(seen) > 2000:
                raise DeployError("ARTIFACT_TOO_LARGE")
            if member.isdir():
                continue
            if not member.isfile() or not re.search(
                r"\.(?:html|js|css|svg|png|jpg|jpeg|webp|ico|woff|woff2|txt)$", name
            ):
                raise DeployError("UNSAFE_ASSET_TYPE")
            if member.size < 0:
                raise DeployError("INVALID_ASSET_SIZE")
            total += member.size
            members.append((member, name))
            if total > MAX_BYTES or len(seen) > 2000:
                raise DeployError("ARTIFACT_TOO_LARGE")
        if "index.html" not in {name for _, name in members}:
            raise DeployError("INDEX_MISSING")
        manifest = {}
        for member, name in members:
            content = bundle.extractfile(member).read(member.size + 1)
            if len(content) != member.size:
                raise DeployError("ASSET_SIZE_MISMATCH")
            if name == "index.html" and b'id="app"' not in content:
                raise DeployError("INVALID_INDEX")
            target = destination / name
            target.parent.mkdir(parents=True, mode=0o755, exist_ok=True)
            with target.open("xb") as stream:
                stream.write(content)
            target.chmod(0o644)
            manifest[name] = hashlib.sha256(content).hexdigest()
    return manifest


def state_write(path, value):
    pending = path.with_suffix(".pending")
    fd = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(pending, path)


def switch(root, target):
    pending = root / ("current.next-" + uuid.uuid4().hex)
    pending.symlink_to(target, target_is_directory=True)
    os.replace(pending, root / "current")


class Docker:
    def __init__(self, config):
        self.env = {
            "PATH": "/usr/bin:/bin",
            "HOME": "/root",
            "DOCKER_CONFIG": config["docker_config"],
        }

    def run(self, args):
        result = subprocess.run(
            ["/usr/bin/docker", *args],
            env=self.env,
            capture_output=True,
            timeout=300,
            check=False,
        )
        if result.returncode:
            raise DeployError("DOCKER_OPERATION_FAILED")
        return result.stdout

    def archive(self, image, revision, path):
        self.run(["pull", image])
        labels = json.loads(
            self.run(["image", "inspect", "--format", "{{json .Config.Labels}}", image])
        )
        if (
            labels.get("org.opencontainers.image.source") != SOURCE
            or labels.get("org.opencontainers.image.revision") != revision
        ):
            raise DeployError("IMAGE_PROVENANCE_MISMATCH")
        container = self.run(["create", "--network", "none", image]).decode().strip()
        if not re.fullmatch(r"[a-f0-9]{64}", container):
            raise DeployError("INVALID_CONTAINER_ID")
        try:
            with path.open("xb") as output:
                result = subprocess.run(
                    ["/usr/bin/docker", "cp", container + ":/site/.", "-"],
                    env=self.env,
                    stdout=output,
                    stderr=subprocess.DEVNULL,
                    check=False,
                    timeout=60,
                    preexec_fn=lambda: resource.setrlimit(
                        resource.RLIMIT_FSIZE, (MAX_BYTES * 2, MAX_BYTES * 2)
                    ),
                )
            if result.returncode:
                raise DeployError("ARTIFACT_COPY_FAILED")
        finally:
            self.run(["rm", container])


def healthy(manifest):
    deadline = time.monotonic() + 120
    for name, expected in manifest.items():
        if time.monotonic() > deadline:
            raise DeployError("ASSET_CHECK_TIMEOUT")
        request = urllib.request.Request(
            "https://prismquest.p-e.kr/" + name, headers={"Cache-Control": "no-cache"}
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status != 200 or response.url != request.full_url:
                raise DeployError("ASSET_NOT_READY")
            if hashlib.sha256(response.read(MAX_BYTES + 1)).hexdigest() != expected:
                raise DeployError("ASSET_HASH_MISMATCH")
    with urllib.request.urlopen(
        "https://prismquest.p-e.kr/login", timeout=10
    ) as response:
        if (
            response.status != 200
            or hashlib.sha256(response.read(MAX_BYTES + 1)).hexdigest()
            != manifest["index.html"]
        ):
            raise DeployError("SPA_NOT_READY")
    with urllib.request.urlopen(
        "https://prismquest.p-e.kr/health/ready", timeout=10
    ) as response:
        if (
            response.status != 200
            or json.loads(response.read(4096)).get("status") != "ready"
        ):
            raise DeployError("API_NOT_READY")


def execute(config, image, revision, sequence, docker, check=healthy):
    identity(image, revision, sequence)
    root, state = Path(config["site_root"]), Path(config["state_dir"])
    fd = os.open(state / "deploy.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise DeployError("DEPLOYMENT_ALREADY_RUNNING") from exc
        attempt = state / "attempt.json"
        if attempt.exists():
            old = json.loads(attempt.read_text())
            if sequence < old["sequence"] or (
                sequence == old["sequence"] and image != old["image"]
            ):
                raise DeployError("STALE_DEPLOYMENT")
        previous = (root / "current").resolve(strict=True)
        if previous.parent != root / "releases" or not previous.is_dir():
            raise DeployError("UNMANAGED_CURRENT_RELEASE")
        record = {
            "image": image,
            "revision": revision,
            "sequence": sequence,
            "status": "RUNNING",
        }
        state_write(attempt, record)
        switched = False
        try:
            with tempfile.TemporaryDirectory(prefix="artifact-", dir=state) as temp:
                archive = Path(temp) / "site.tar"
                docker.archive(image, revision, archive)
                release = Path(
                    tempfile.mkdtemp(prefix=revision + "-", dir=root / "releases")
                )
                release.chmod(0o755)
                manifest = unpack(archive, release)
            switch(root, release)
            switched = True
            check(manifest)
            record.update(
                status="SUCCESS", release=str(release), previous=str(previous)
            )
            state_write(state / "current.json", record)
        except Exception:
            record["status"] = "FAILED"
            if switched:
                switch(root, previous)
                record["rollback"] = "RESTORED_PREVIOUS_LINK"
            raise
        finally:
            state_write(attempt, record)
            print(json.dumps(record), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--sequence", required=True, type=int)
    args = parser.parse_args()
    try:
        identity(args.image, args.revision, args.sequence)
        if os.geteuid() != 0:
            raise DeployError("ROOT_REQUIRED")
        config = load_config()
        execute(config, args.image, args.revision, args.sequence, Docker(config))
        return 0
    except (
        DeployError,
        OSError,
        ValueError,
        KeyError,
        subprocess.SubprocessError,
        tarfile.TarError,
    ) as exc:
        print(
            json.dumps(
                {
                    "status": "FAIL",
                    "reason": str(exc)
                    if isinstance(exc, DeployError)
                    else "DEPLOYMENT_FAILED",
                }
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
