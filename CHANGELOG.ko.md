# 변경 이력 (Changelog)

이 프로젝트의 모든 주목할 만한 변경 사항은 이 파일에 기록됩니다.

**English:** [CHANGELOG.md](CHANGELOG.md)

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 기반으로 하며, 이 프로젝트는 [유의적 버전(Semantic Versioning)](https://semver.org/spec/v2.0.0.html)을 준수합니다.

## [3.3.3] - 2026-05-06

### 수정됨 (Fixed)

- npm과 GitHub 첫 화면에서 영어/한국어 README를 바로 오갈 수 있도록 언어 전환 링크를 복구했습니다.
- README 문서 표에는 공개 문서 링크만 남기고, 내부 리서치와 성장 전략 문서는 npm/OSS 공개 표면에서 제외했습니다.

## [3.3.2] - 2026-05-06

### 포지셔닝 (Positioning)

- npm/GitHub에서 보이는 정체성을 **모든 레포를 위한 AI 코딩 에이전트 가드레일**로 재정리했습니다.
- `AGENTS.md`, Copilot instructions, Cursor rules, Claude skills, 에이전트 실행기, 일반 LLM/MCP 가드레일과 비교해 DeukAgentRules가 더하는 티켓 생명주기, 범위 계약, 검증, 아카이브 가능한 기억을 README에 드러냈습니다.
- 다음 개선 방향으로 첫 실행 점검, CLI/RAG 재각인 신호, active ticket/phase/open ticket count/DeukAgentContext memory status를 보여주는 companion 표면을 명시했습니다.

## [3.3.0] - 2026-05-02

### 추가됨 (Added)

- **docs:** VS Code, Open VSX, GitHub, skill 기반 발견 루프를 포함한 AI 코딩 에이전트 가드레일 포지셔닝, 비전, 오가닉 유입 리서치 문서를 추가했습니다.
- **docs:** Karpathy식 skill, DeukAgentRules, DeukAgentContext 심층 비교 문서를 추가했습니다. Skill은 행동 playbook, DeukAgentRules는 workflow/permission control, DeukAgentContext는 ticketed engineering memory로 포지셔닝했습니다.
- **seo:** `andrej-karpathy-skills` 관련 아이디어 링크와 Claude Code, AGENTS.md, Cursor rules, agent skills, AI guardrails 검색 유입 키워드를 보강했습니다.

### 변경됨 (Changed)

- **ticket:** 열린 티켓이 설정된 한도를 넘을 때 자동 정리 대신 사용자가 목록을 보고 결정할 수 있는 cleanup flow를 강화했습니다.
- **ticket:** 닫힌 티켓은 자동 아카이브할 수 있게 하고, 아카이브된 티켓은 년월/일 단위로 정리되도록 했습니다.
- **docs:** README 문서 목록과 GitHub topic 가이드를 agent guardrail, instruction hub, skill registry, project memory 포지셔닝에 맞게 갱신했습니다.

### 수정됨 (Fixed)

- **ticket:** 새 작업 진입 전에 정리 결정을 노출하여 열린 티켓 수가 의도한 운영 한도를 조용히 넘는 문제를 방지했습니다.

## [3.2.0] - 2026-04-29

### 추가됨 (Added)
- **agent:** 플랫폼 공존(Platform Coexistence) 및 모드 인지형(Mode-aware) 워크플로우 구현. (Plan Mode에서 TDW Phase 자동 매핑, `platform-coexistence.md` 규칙 추가, 수정 제어 및 `PROJECT_RULE.md` 포인터 연동 등)

### 변경됨 (Changed)
- **agents:** Co-existence Protocol 및 Workflow Gate 기능 도입 (T-120).
- v3.1.0 아키텍처 원칙 및 사용법 문서 개선.

## [3.1.0] - 2026-04-28

### 추가됨 (Added)
- **arch:** 제로카피(Zero-Copy) 포인터 아키텍처 도입 (`PROJECT_RULE.md` 연동) 및 구조 간소화
- **cli:** 엄격한 Phase 기반 티켓 워크플로우 및 APC(Agent Permission Contract) 검증 기능 추가
- **cli:** `--plan-body` 옵션을 통한 채워진 Phase 1 티켓 본문 입력 기능 추가
- **ticket:** 티켓 아카이브 시 불필요한 토큰 낭비를 막는 Zero-Token 지식 증류(Knowledge Distillation) 구현
- **telemetry:** 로컬 환경에 최적화된 Telemetry CLI 추가
- **rules:** `PROJECT_RULE.md` 템플릿 추가 (AI 에이전트 폴백 가이드 포함) 및 이중 언어(한/영) 지원

### 수정됨 (Fixed)
- **rules:** `PROJECT_RULE.md` 내 중복된 코어 룰 링크 제거 및 Frontmatter 렌더링 복구
- **telemetry:** 모델 및 설정에서 클라이언트 도구를 자동으로 감지하도록 수정
- **agent:** 티켓 탐색 중 에이전트 무한 루프 문제 해결

### 변경됨 (Changed)
- **agent:** TDD 용어를 TDW (Ticket-Driven Workflow)로 변경 및 전역 `AGENTS.md`에서 낡은 규칙 제거
- **cli:** 상태 기반(State-driven) 경로 탐색 로직으로 구조 개편 및 상세한 사용 가이드 추가

## [3.0.0] - 2026-04-25

### 🚀 대규모 업데이트: Hub-Spoke 아키텍처
- **Canonical Rule Hub**: 모든 AI 에이전트의 단일 진실 공급원(SSOT)으로 `AGENTS.md` 도입.
- **Thin Spoke Pointers**: IDE별 룰(Cursor, Copilot 등)을 중앙 Hub를 가리키는 가벼운 포인터로 변경하여 중복 및 동기화 오류 제거.
- **Global CLI Proxy**: 로컬 워크스페이스 소스를 자동 감지하여 실행을 위임하는 프록시 도입으로 지연 없는(Zero-latency) 개발 환경 구축.

### 🧹 제로 레거시 & 환경 정리
- **Auto-Purge**: `init` 실행 시 더 이상 사용되지 않는 레거시 `.cursorrules` 파일을 무조건 삭제.
- **Smart Backups**: 사용자 정의 규칙을 감지하여 삭제 대신 `.bak` 파일로 백업하는 로직 추가.
- **Submodule Scrubbing**: 비어 있는 서브모듈 디렉터리 스텁 및 `.gitmodules` 자동 정리 기능.

### 🏗️ 리브랜딩 & 인프라스텍
- **Identity Overhaul**: "Zero-Latency, High-Signal AI Orchestration Protocol"로 리브랜딩.
- **Documentation v3**: 고품질 3D 인포그래픽 및 구조, 원리, 작동 방식 등 개념 가이드 전면 개편.
- **Domain Agnostic**: 도메인별 하드코딩을 제거하고 모든 기술 스택을 지원하도록 `bundle/AGENTS.md` 일반화.

### ⚙️ CLI 개선 사항
- **Proxy Routing**: `bin/deuk-agent-rule.js`가 디렉터리를 탐색하여 로컬 스크립트를 찾아 실행하도록 수정.
- **Synchronized IO**: CLI의 안정성을 높이기 위해 핵심 로직을 동기적 파일 시스템 연산으로 리팩터링.
## [2.4.6] - 2026-04-19

### 수정됨 (Fixed)

- **cli:** 로컬 버전이 registry 버전 이상일 경우 업데이트 알림을 표시하지 않도록 수정 (로컬 개발 symlink 환경에서의 역방향 스팸 알림 해소)
- **ticket:** `NNN` 정규식을 최대 4자리로 제한하여 유닉스 타임스탬프가 티켓 순번으로 잘못 파싱되는 버그 수정 — 올바른 `NNN-topic-hostname` 포맷 생성 복원

## [2.4.4] - 2026-04-19

### 변경됨 (Changed)

- **rules:** 서브모듈 전용 규칙(DeukPack, C++, Unity)을 해당 워크스페이스의 `MODULE_RULE.md`로 이동하여 `AGENTS.md`를 일반화된 규약 중심으로 개편
- **templates:** `publish/` 소스에 맞춰 `bundle/` 내의 레거시 템플릿 정리

## [2.4.3] - 2026-04-18

### 변경됨 (Changed)
- **ticket:** 티켓 ID 포맷을 `NNN-topic-hostname` (예: `001-add-feature-joy-nucb`)으로 변경. 레거시 `ticket_NNN_hostname_topic` 형식 대체
- **ticket:** INDEX.json 파싱 시 기존 포맷과 신규 포맷 모두 역호환 지원

## [2.4.2] - 2026-04-18

### 수정됨 (Fixed)
- **ticket:** 파일명(File name)과 본문 내 티켓 ID 생성 로직 간의 불일치(Discrepancy) 해결 (단일 출처로 통합)

## [2.4.1] - 2026-04-18

### 추가됨 (Added)
- **cli:** NPM 최신 버전을 감지하여 터미널에 업데이트를 권고하는 알림 기능(Update Notifier) 추가

### 수정됨 (Fixed)
- **ticket:** 티켓 생성 시 호스트명 슬러그가 8글자로 엄격히 제한되지 않던 버그 수정

## [2.4.0] - 2026-04-18

### 추가됨 (Added)

- **init:** 깔끔한 마이그레이션을 위한 구버전 템플릿 자동 정리 기능 추가
- **rules:** `AGENTS.md` 문서 내 티켓 검증 단계(TICKET VERIFICATION RULE) 규약 추가
- **ticket:** 티켓에 우선순위(Priority) 속성 추가
- **ticket:** 순차 번호 및 호스트네임 기반의 티켓 식별자(ID) 자동 생성 도입 (`NNN-hostname-topic` 포맷)
- **ticket:** 호스트네임 길이 제한(8자) 및 자동 순번 부여 로직 개선

### 수정됨 (Fixed)

- **rules:** 전역 `npx` 캐시 이슈(과거 버전 실행 문제)를 우회하기 위해 로컬 최신 스크립트 호출을 강제/권장하도록 수정
- **scripts:** OSS 미러 저장소 동기화 시 잘못 표기되던 URL 예시 로그 메시지 정정

### 변경됨 (Changed)

- **docs:** 리드미(README) 파일에 [Step 4] 티켓 검증 안내 추가
- **docs:** 전역 설치(Global Install) 권장 안내 및 운영체제(OS)별 권한 제약 명확화
- **rules:** 구현 아티팩트(`implementation_plan.md` 등) 내 티켓 번호 참조 의무화

## [2.3.2] - 2026-04-17

### 수정됨 (Fixed)

- **cli:** 배포 환경에서 하드코딩된 `yaml` 의존성 경로 문제(`ERR_MODULE_NOT_FOUND`) 해결
- **dependencies:** `yaml`을 명시적 의존성 목록에 추가

## [2.3.1] - 2026-04-17

### 변경됨 (Changed)

- **readme:** 체인지로그 및 자동화된 릴리즈 프로세스 가이드 추가

## [2.3.0] - 2026-04-17

### 추가됨 (Added)

- AI 파이프라인 연동 기반 및 선택적 동기화 시스템 고도화
- **cli:** ticket list 명령에 --submodule 필터 추가
- **cli:** 티켓 아카이브 및 리포트 워크플로를 모듈형 아키텍처로 복구
- **rules:** Unity Client, WebApp, C++ 서버 하이브리드 환경을 위한 룰 고도화
- **ticket:** 분산형 티켓 관리 및 공유 정책 구현
- **ticket:** V2 YAML Front-matter 및 카테고리화된 리스트로 업그레이드

### 수정됨 (Fixed)

- **ticket:** LATEST.md를 폐기하고 ACTIVE_TICKET.md로 포인터 통일
- **ticket:** DeukAgentRules 현재 진행 중인 티켓 안 나오던 문제 해결

## [1.0.14] - 2026-04-02

### 추가됨 (Added)

- **cli:** 병합 도구 및 배포 문서 동기화 스크립트 확장
- **rules:** 커밋 제목 내 'sync' 금지 구문 룰 추가
- **handoff:** 인덱스 기반 Handoff 워크플로 및 CLI 신설
- **architecture:** 제로-터치 NPM 번들 스캐폴딩으로 템플릿 아키텍처 개편

### 수정됨 (Fixed)

- **cli:** 템플릿 생성기(init) 내부의 HTML 엔티티 문법 에러 핫픽스

### 변경됨 (Changed)

- **docs:** 외부 공개용 릴리즈 가이드 및 동기화 스크립트 주석 갱신
- **docs:** 리드미(README)에 토큰 비용 차단 메커니즘 설정 및 제로 터치 스캐폴딩 문서 개편
