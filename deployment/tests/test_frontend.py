import contextlib
import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "deploy", Path(__file__).parents[1] / "deploy_frontend.py"
)
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
IMAGE = deploy.REPOSITORY + "@sha256:" + "a" * 64
REVISION = "b" * 40


def archive(path, entries=None):
    with tarfile.open(path, "w") as bundle:
        for name, content, kind in entries or [
            ("index.html", b'<div id="app"></div>', tarfile.REGTYPE),
            ("assets/app.js", b"const app = 1;", tarfile.REGTYPE),
        ]:
            info = tarfile.TarInfo(name)
            info.type = kind
            info.size = len(content) if kind == tarfile.REGTYPE else 0
            if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                info.linkname = "/etc/passwd"
            bundle.addfile(info, io.BytesIO(content))


class FakeDocker:
    def archive(self, image, revision, path):
        archive(path)


class FrontendDeployTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.site = self.root / "site"
        self.old = self.site / "releases" / "old"
        self.old.mkdir(parents=True)
        (self.old / "index.html").write_text("previous")
        (self.site / "current").symlink_to(self.old)
        self.state = self.root / "state"
        self.state.mkdir()
        self.config = {"site_root": str(self.site), "state_dir": str(self.state)}

    def run_deploy(
        self, image=IMAGE, revision=REVISION, sequence=10, check=lambda manifest: None
    ):
        with contextlib.redirect_stdout(io.StringIO()):
            deploy.execute(
                self.config, image, revision, sequence, FakeDocker(), check=check
            )

    def test_success_switches_complete_release_and_retains_old(self):
        self.run_deploy()
        release = (self.site / "current").resolve()
        self.assertNotEqual(release, self.old)
        self.assertEqual((release / "assets/app.js").read_bytes(), b"const app = 1;")
        self.assertTrue((self.old / "index.html").exists())
        self.assertEqual(
            json.loads((self.state / "current.json").read_text())["status"], "SUCCESS"
        )

    def test_failed_health_restores_previous_and_reports_failure(self):
        def failure(manifest):
            raise deploy.DeployError("API_NOT_READY")

        with self.assertRaisesRegex(deploy.DeployError, "API_NOT_READY"):
            self.run_deploy(check=failure)
        self.assertEqual((self.site / "current").resolve(), self.old)
        result = json.loads((self.state / "attempt.json").read_text())
        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(result["rollback"], "RESTORED_PREVIOUS_LINK")

    def test_stale_sequence_never_replaces_current(self):
        self.run_deploy()
        current = (self.site / "current").resolve()
        with self.assertRaisesRegex(deploy.DeployError, "STALE"):
            self.run_deploy(sequence=9)
        with self.assertRaisesRegex(deploy.DeployError, "STALE"):
            self.run_deploy(image=deploy.REPOSITORY + "@sha256:" + "c" * 64)
        self.assertEqual((self.site / "current").resolve(), current)

    def test_tags_shell_injection_and_other_repository_rejected(self):
        for image in [
            deploy.REPOSITORY + ":latest",
            IMAGE + ";id",
            IMAGE.replace("prism-frontend", "other"),
        ]:
            with self.assertRaises(deploy.DeployError):
                self.run_deploy(image=image)
        self.assertEqual((self.site / "current").resolve(), self.old)

    def test_stale_next_link_does_not_break_atomic_switch(self):
        (self.site / "current.next").symlink_to(self.old)
        self.run_deploy()
        self.assertNotEqual((self.site / "current").resolve(), self.old)

    def test_unmanaged_current_rejected(self):
        (self.site / "current").unlink()
        (self.site / "current").symlink_to(self.root)
        with self.assertRaisesRegex(deploy.DeployError, "UNMANAGED"):
            self.run_deploy()

    def test_parallel_lock_rejected(self):
        with (self.state / "deploy.lock").open("w") as lock:
            deploy.fcntl.flock(lock, deploy.fcntl.LOCK_EX | deploy.fcntl.LOCK_NB)
            with self.assertRaisesRegex(deploy.DeployError, "ALREADY_RUNNING"):
                self.run_deploy()

    def test_malicious_archives_never_escape_release(self):
        for name, kind in [
            ("../outside.txt", tarfile.REGTYPE),
            ("/absolute.txt", tarfile.REGTYPE),
            (".env", tarfile.REGTYPE),
            ("assets/app.js.map", tarfile.REGTYPE),
            ("assets/key.pem", tarfile.REGTYPE),
            ("assets/link.js", tarfile.SYMTYPE),
            ("assets/hard.js", tarfile.LNKTYPE),
            ("assets/fifo.js", tarfile.FIFOTYPE),
        ]:
            with self.subTest(name=name, kind=kind):
                tar = self.root / "bad.tar"
                archive(
                    tar,
                    [
                        ("index.html", b'<div id="app"></div>', tarfile.REGTYPE),
                        (name, b"data", kind),
                    ],
                )
                dest = Path(tempfile.mkdtemp(dir=self.root))
                with self.assertRaises(deploy.DeployError):
                    deploy.unpack(tar, dest)
        self.assertFalse((self.root / "outside.txt").exists())

    def test_missing_or_invalid_index_rejected(self):
        for entries in [
            [("other.txt", b"ok", tarfile.REGTYPE)],
            [("index.html", b"wrong application", tarfile.REGTYPE)],
        ]:
            tar = self.root / "bad.tar"
            archive(tar, entries)
            with self.assertRaises(deploy.DeployError):
                deploy.unpack(tar, Path(tempfile.mkdtemp(dir=self.root)))

    def test_duplicate_entries_rejected(self):
        tar = self.root / "bad.tar"
        archive(tar, [("index.html", b'<div id="app"></div>', tarfile.REGTYPE)] * 2)
        with self.assertRaises(deploy.DeployError):
            deploy.unpack(tar, Path(tempfile.mkdtemp(dir=self.root)))


if __name__ == "__main__":
    unittest.main()
