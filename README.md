# PRism Frontend

Vue 3 / TypeScript / Vite / Vue Router 개발 기반입니다. 현재 화면은 개발 환경 확인용이며 로그인·PR 목록·분석 화면은 아직 없습니다. Node 24와 npm을 사용하고 package-lock.json을 공유합니다.

## 실행

```bash
git clone https://github.com/oso7865-ship-it/Prism-Frontend.git prism-frontend
cd prism-frontend
npm ci
npm run dev
```

http://127.0.0.1:5173 에서 확인합니다. 연결 확인 버튼은 `/health/ready`를 호출합니다. 기본 프록시 대상은 http://127.0.0.1:8000 이며 백엔드와 PostgreSQL이 준비됐을 때만 연결 완료를 표시합니다. `config/development.example`의 API_PROXY_TARGET으로 로컬 대상만 바꿀 수 있습니다. 실제 응답이 없으면 가짜 성공을 표시하지 않습니다.

## 검증

```bash
npm run build
npm test
npm audit
```

build는 vue-tsc 타입 검사와 production bundle 생성을 포함합니다. 테스트는 readiness 성공·503·잘못된 응답을 검증합니다. 프록시는 Vite 개발 서버용이며 production Vercel rewrite와 도메인은 아직 구성하지 않았습니다. 서버 자격증명을 VITE_*에 넣지 않습니다.

src/app은 앱 진입·라우터·현재 준비 화면, src/shared/api는 기술 공통 API 계약을 소유합니다. 실제 화면 기능은 구현할 때 src/features에 생성합니다. 현 단계는 제품 디자인 확정이 아니라 실행 골격입니다. 다음 작업은 백엔드 인증 계약과 함께 로그인 흐름을 구현하는 것입니다.

## 하네스와 다른 PC에서 재개

이 저장소 루트의 AGENTS.md → PROJECT_HARNESS/00.PROJECT_CONTEXT.md → 작업별 문서 순서로 읽습니다. 공통 하네스는 [HARNESS](https://github.com/oso7865-ship-it/HARNESS)의 `0b7dcf9d567eaaa0c883eaee73620aa07cf60019` 사본입니다. 상위 폴더가 없어도 사용할 수 있습니다. 원본 유지보수 보고서는 출처 이력이며 현재 제품 상태는 GENERAL_HARNESS/05.WORKING_CONTEXT.md와 부착 프로젝트 최신 Report를 따릅니다.

[아키텍처 연결](docs/ARCHITECTURE.md)과 architecture.json으로 설계의 원본·기준 커밋을 추적합니다. 아키텍처를 바꾸면 원본 저장소에 ADR과 소유 문서를 갱신합니다. 각 저장소의 main이 통합 기준이며 이후 기능 작업은 별도 브랜치·PR·CI로 검증합니다. 초기 빈 저장소의 첫 커밋은 main으로 게시합니다. 브랜치 보호 설정 자체는 아직 적용하지 않았습니다.

작업 시작: git status로 로컬 변경 확인 → 깨끗한 상태에서 git pull --ff-only → 의존성 잠금 기준 설치 → 최신 Report의 미해결 항목 확인. 작업 종료: 검증 → Report/Working Context 갱신 → 커밋·푸시. 비밀 값과 가상환경·node_modules는 Git에 올리지 않습니다.

하네스 연결 검사: `node GENERAL_HARNESS/scripts/validate-project-adapter.mjs --project-root . --require-adapter --strict --json`.
