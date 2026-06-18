# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.0.4] - 2026-06-18

## [5.0.3] - 2026-06-17


### Added

-  add build script and typescript devDep to public package via sync
-  sync bundled VSIX to OSS and restore prepack with tsc step
-  sync scripts/out to OSS and fix prepack to skip tsc step


### Fixed

-  include vscode-extension in sync, adjust tsconfig and compile script for public release
-  publish script uses --skip-tests, sync publish scripts to simple npm publish for public release
-  strip prepack from public package, remove scripts/out from sync
-  strip vscode and badge scripts from OSS package.json


### Changed

-  add CONTRIBUTING.md with build pipeline and VSIX install target guide
-  include tsc in build:vscode, unify build pipeline across repos

## [5.0.2] - 2026-06-16


### Fixed

- **flow-ui:** 전체 티켓 카운트가 1로 표시되던 버그 — ticket list에 전체 카운트 동봉 ([#756](https://github.com/joygram/DeukAgentFlow/issues/756))

## [5.0.1] - 2026-06-16


### Fixed

- **vsix:** vscode-extension 버전이 루트 버전 자동 추종하도록 수정


### Changed

- **readme:** 5.0 로드맵 갱신 + Flow UI 스샷 자리 정비 (en/ko)

## [5.0.0] - 2026-06-16

> **Major release.** A full internal overhaul: skills moved to the home directory (`~/.deuk`), an XState-based ticket workflow engine, and the VS Code Flow UI (first release). Existing `.deuk-agent/` workspace data is migrated automatically — see the migration guide in the README for manual recovery if it fails.

### 🏠 홈 디렉토리 이동 · 마이그레이션

- **ticket:** cwd write 박멸 — report/knowledge/defrag 제거, 마이그레이션이 .deuk 통째삭제·.deuk-agent 흡수 ([#727](https://github.com/joygram/DeukAgentFlow/issues/727))
- .deuk-agent 하드코딩 에러메시지/스모크테스트 → .deuk 수정
- **vscode:** .deuk-agent → .deuk 홈 경로 수정
- remove workspace .deuk-agent/ dir, store PROJECT_RULE and memory in home ticket store
- **#669:** workspace marker .deuk-agent/ → .deuk-workspace-id 단일 파일로 교체
- **workspace:** 서브모듈 독립 등록 허용 — 자식에 .deuk-agent 직접 있으면 통과 ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))
- **skill:** home-only skills, no workspace spray, hash auto-sync
- **ticket:** relocate ticket storage to home with self-healing registry

### 🎭 스킬 시스템

- **persona-maid:** 이모지 표현 풀·로테이션·분석모드 톤유지 규칙 추가
- **webview:** workspace→skill→workspace 탭 복귀 시 스타일 깨짐 수정 ([#749](https://github.com/joygram/DeukAgentFlow/issues/749))
- **webview:** SKILL탭→WORKSPACE 복귀 스타일 깨짐 수정 + 드롭다운 active/total 카운트 표기 ([#748](https://github.com/joygram/DeukAgentFlow/issues/748))
- **#697:** ticket-status-surface 시스템 스킬 — 상태는 카드 한 줄(링크 항상 포함)
- **#694:** 스킬 노드 영역 바인딩 + rules 출력 축소 + CLI 자체 메시지 제거
- discard hint clarification + doc-sync v4.5.18 canonicalization
- raise TOTAL_MAX_SKILLS 5→6 to allow doc-sync exposure
- add doc-sync skill + fix executionEvidence phase2→3 blocking bug
- **persona-maid:** 텍스트 기호 하트→컬러 이모지 통일 + 카오모지 규칙 추가
- **persona-maid:** 단조로운 하트를 다양한 컬러 하트로 교체
- **persona-maid:** 메이드 페르소나 애교 폭발 버전으로 강화
- **skill:** native 스킬 노출을 <id>/SKILL.md 디렉토리 구조로 전환
- **skill:** native platform에 daf- prefix flat 파일로 배포
- **skill:** exposed/native-sync 전역 SSOT 통합
- **skill:** claude platform -> native ~/.claude/commands/ mode
- revert c4025da regressions — skill installed flag, quality gate bypass, emoji encoding
- auto-cleanup quality gate bypass and inline skills for AI platforms

### 🖥️ Flow UI (VS Code 확장 · 신규)

- **webview:** 스킬 조회 JSON이 명령출력 박스 오염시키는 문제 수정 ([#750](https://github.com/joygram/DeukAgentFlow/issues/750))
- **agentflow-ui:** 스킬 탭 복귀 시 티켓 뷰 깨짐 수정 + 카운트 active/total 표기 ([#747](https://github.com/joygram/DeukAgentFlow/issues/747))
- **statusbar:** 세션 쿠키 기준 워크스페이스·티켓 표시 ([#737](https://github.com/joygram/DeukAgentFlow/issues/737))
- **vscode:** UI 로딩 병목 전면 제거 — open 티켓만 파싱, 비선택 ws readdir 카운트만
- **vscode:** statusbar 초기 text 비어있음 + 전 워크스페이스 본문 전수로딩 회귀 수정
- **vscode-ext:** 앱 아이콘 agentflow-128.png 등록
- **devinstall:** ~/.deuk/dev/ vsix 마스터 배포 + 전 프로젝트 연동
- add code-server extensions dir to WSL vsix install targets
- **#676:** install VSIX to Windows .vscode/extensions via WSL wslpath
- agentflow UX 개선 — 티켓 표기 wp-id, UI 개선, Approval Gate 정밀화
- **vscode:** compact status bar format — workspace #num phN
- **vscode:** show active ticket in status bar
- **ui:** resolveWebviewView/openPanel 초기 로딩 트리거 추가

### 🌐 다국어 (i18n)

- **i18n:** 영어 로케일에서 phase 안내·게이트가 한글로 나오던 문제 수정

### 🎫 티켓 워크플로 엔진

- **ticket:** entry-node를 세션 쿠키 기반 단일 워크스페이스 조회로 전환 ([#743](https://github.com/joygram/DeukAgentFlow/issues/743))
- **ticket-link:** 파일 링크 회귀 수정 — 드라이브 경계서 안 열리던 절대경로 폴백 제거 ([#746](https://github.com/joygram/DeukAgentFlow/issues/746))
- **rules:** cwd 의존 제거 — registry 전체 스캔으로 active ticket 감지 + 다줄 블록 출력 제거
- **ticket-surface:** 카드 라벨 오조합·DocMeta 다줄·move 후 카드 미표시 버그 3종 수정
- **ticket-close:** .md status/phase 갱신 안 되던 버그 수정 ([#736](https://github.com/joygram/DeukAgentFlow/issues/736))
- **use:** ticket use 출력에 .md-aware 슬롯 현황 표기 ([#729](https://github.com/joygram/DeukAgentFlow/issues/729))
- **verify:** phase3/4 verify 스테이지에 은폐금지 게이트 주입 ([#728](https://github.com/joygram/DeukAgentFlow/issues/728))
- **ticketHome:** CLI resolveHomeTicketDirForWorkspace 로직과 통합 — 드리프트 제거
- **#691:** XState 기반 LangGraph 상태머신으로 티켓 워크플로 전이 엔진 전환
- getCloseWorkflowReasons accepts canonical Analysis/Direction headings
- **#675:** unify flow-cookie+claim into single cookie-{wp}-{ticketId}-{sessionId} touch file
- 에이전트 폭주 방지 — active ticket STOP 신호, Runaway Prevention 규칙 추가
- **plan-body:** phase1 plan-body 7섹션 → 4섹션 슬림화 ([#654](https://github.com/joygram/DeukAgentFlow/issues/654)) v4.5.8
- **ticket-create:** --plan-body 생략 시 summary 기반 auto-scaffold 생성 ([#653](https://github.com/joygram/DeukAgentFlow/issues/653)) v4.5.7
- **workspace:** rules·ticket dispatch의 cwd 워크스페이스 추정 박멸 ([#652](https://github.com/joygram/DeukAgentFlow/issues/652)) v4.5.5
- **workspace:** 세션 cookie를 홈 직속 저장으로 이전 — cwd 의존 완전 제거 (#871-followup) v4.5.2
- **workspace:** 세션 cookie 기반 active 도출로 멀티세션 티켓 강탈 박멸 (#871-followup)
- **ui:** 티켓 리뷰 링크 채팅 클릭 복원 + ticket --help 룰 오염 제거
- **workspace:** registry.json 폐기 + cwd 자동등록/폴백 제거로 ghost 워크스페이스 박멸 ([#645](https://github.com/joygram/DeukAgentFlow/issues/645))
- rules APC 서브헤딩 안내 추가 + ticket create Source 라인 출력 ([#644](https://github.com/joygram/DeukAgentFlow/issues/644))
- **rules:** --workspace 플래그로 runRulesShow workspace 컨텍스트 교체 ([#643](https://github.com/joygram/DeukAgentFlow/issues/643))
- **rules:** buildPhaseAdvanceHint 전체 transitions 표시 — 정방향·이탈·회귀·재오픈 라우트 모두 출력
- **workflow:** assertTicketWorkflowTransition 차단 시 허용 전환 목록 에러 메시지 추가
- **workflow:** FSM 에러 메시지에 허용 actions·전환·discard 이정표 추가, --to end named state 파싱 지원
- **ticket-home:** 티켓 경로 중첩·ghost 워크스페이스 근절 ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))
- **ticket-gate:** cli/ui 타입 구분 제거 및 워크스페이스 유령 등록 방지 ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))
- **rules:** narrow ticket-exempt to block gate bypass (v100, #631)
- **vscode:** 액티브 티켓을 claim-{id}.json에서 도출 ([#630](https://github.com/joygram/DeukAgentFlow/issues/630))
- **ticket:** 워크스페이스 정규화 충돌 타이브레이크 + cli 9섹션 사전 노출
- **ticket:** 타입 인지 Phase1 검증 + 확장 홈 티켓 경로 이전
- **ticket:** per-ticket claim model replaces global active marker
- **cli:** toSlug Hangul romanize fallback + rules-show section test
- || true 폴백 제거, active 마커 다중파일 정리, --plan-body 직접 인자 안내 통일
- **ticket:** active 마커 개념 제거 — status 폴백이 archived 거짓 노출하던 버그 수정
- **ticket:** discard approval_required 허용·INDEX 미등록 폐기·help 템플릿 복원·workspace 이동
- **ticket+ui:** INDEX 레거시 마이그레이션·ticket doctor·sanitize·archive lazy-load
- cwd-matched workspace resolution + ticket gate template sync
- **flow:** decouple active ticket marker logic from INDEX.json writer

### 🔧 빌드 · 인프라

- **707:** .mjs 44개 제거, .ts 단일 소스로 전환
- **bin:** tsc 빌드 출력(scripts/out/scripts/cli.js)으로 bin 교체
- **#707:** scripts/*.mjs → .ts 전환 — tsc 에러 0개 달성
- WSL2에서 winShell 오판정으로 PowerShell 블록 출력되던 버그 수정
- Windows PowerShell 호환 — isWindowsPlatform 분기, PS here-string 예시 출력

### Other

- **#673:** multi-agent session isolation via per-agent env var detection

## [4.4.70] - 2026-06-08

## [4.4.69] - 2026-06-08

## [4.4.68] - 2026-06-08

## [4.4.67] - 2026-06-08

## [4.4.66] - 2026-06-08

## [4.4.65] - 2026-06-08

## [4.4.64] - 2026-06-08

## [4.4.63] - 2026-06-08

## [4.4.62] - 2026-06-08

## [4.4.61] - 2026-06-08


### Added

- **skill-ui:** 스킬 탭 로딩 인디케이터 추가, fork 실패 시 CLI 출력 메시지 포함

## [4.4.60] - 2026-06-07


### Added

- **skill:** 컨텍스트 길이 600자 제한, 스킬 내용 단축, 카테고리 이모지 추가, CLI edit 커맨드

## [4.4.59] - 2026-06-07

## [4.4.58] - 2026-06-07

## [4.4.57] - 2026-06-07


### Added

- **skill-ux:** 스킬 탭 티켓UX 통일+캐시속도+전역 fork 편집+category 충돌경고
- **ticket:** auto-sanitize duplicate frontmatter on stringify and add ticket sanitize command

## [4.4.56] - 2026-06-07


### Added

- **vsix:** update UI locale expressions and agent flow panel


### Changed

-  add persona-maid skill install instructions to README and CHANGELOG

## [4.4.55] - 2026-06-07

## [4.4.54] - 2026-06-07


### Added

- **skills:** update persona-maid rules with enhanced subculture identity
  - Note: This skill is disabled by default (opt-in) in the official release.
  - To enable, users must manually install it via `deuk-agent-flow skill add --skill persona-maid`.

## [4.4.53] - 2026-06-07


### Fixed

- **cli:** prevent boot cycle from deleting local skill copies

## [4.4.52] - 2026-06-07


### Added

-  Add agent-specific global pointers

## [4.4.51] - 2026-06-07


### Added

-  Add agent-specific templates, fix workspace path logic, add rules locale emoji

## [4.4.50] - 2026-06-07


### Fixed

-  project-memory rules 출력 10줄 제한 — 비대화 방지

## [4.4.49] - 2026-06-07

## [4.4.48] - 2026-06-06


### Fixed

- **rules:** Approval Hard Stop → Approval Gate — 채팅 승인 시 에이전트가 직접 실행

## [4.4.47] - 2026-06-06


### Fixed

- **ticket-surface:** file:/// → 워크스페이스 상대경로로 교체 (Claude Code 클릭 가능)

## [4.4.46] - 2026-06-06

## [4.4.45] - 2026-06-06

## [4.4.44] - 2026-06-06

## [4.4.43] - 2026-06-06


### Added

- **rules:** v97 Approval Hard Stop — agent must never self-execute ticket move --approval approved

## [4.4.42] - 2026-06-06


### Changed

-  replace hardcoded file URI generation with toFileUri

## [4.4.41] - 2026-06-06


### Fixed

- **global-pointer:** 강제 복창·벌칙 루프 제거 → 마법 스크롤 상태 라인으로 대체

## [4.4.40] - 2026-06-06

## [4.4.39] - 2026-06-06

## [4.4.38] - 2026-06-06

## [4.4.37] - 2026-06-06


### Fixed

- **cli:** --help 빈 코어 섹션 복구 — root.md 플레이스홀더를 현재 AGENTS.md 헤딩으로 동기화
- **rules:** ticket create 가이드 셸 선택을 OS→실제 실행 셸 기준으로 교체


### Changed

- **cli-init:** cli-init-commands 단일 파일을 6개 모듈로 분리 + 배선 복구

## [4.4.36] - 2026-06-06

## [4.4.35] - 2026-06-06

## [4.4.34] - 2026-06-06

## [4.4.33] - 2026-06-06


### Added

-  add Antigravity Chain-of-Thought Hook to global pointer


### Fixed

- **ticket-flow:** ticket-workflow.mjs toWsRelativePath 통합 및 불필요 import 제거

## [4.4.32] - 2026-06-06


### Added

- **rules:** Windows에서 ticket create 예시를 PowerShell 방식으로 출력


### Fixed

- **cli:** revert target to GEMINI.md and strengthen mandatory pointers
- **dev-install:** stale global symlink 제거 후 tarball 설치
- **flow-surface:** 종료 티켓 status label을 조회 대신 종료로 표시
- **flow-surface:** invocationCwd 기준 상대경로로 티켓 링크 계산
-  meta.summary 비string 타입 시 .replace() TypeError 수정
- **ticket-flow:** 파일링크 기준을 process.cwd() → resolveWorkspaceContext(cwd).root 로 교체
-  ticketId 비string 타입 시 .split() TypeError 수정

## [4.4.31] - 2026-06-05


### Added

- **ticket:** archiveTicketEntry 완료 시 project-memory.md 자동 갱신

## [4.4.30] - 2026-06-05


### Added

-  phase4/end 프롬프트에 project-memory.md 업데이트 지시 추가

## [4.4.29] - 2026-06-05


### Added

-  project-memory 레이어 추가 + ticket use flow surface 채팅 UI 보강

## [4.4.28] - 2026-06-05

## [4.4.27] - 2026-06-05

## [4.4.26] - 2026-06-04


### Added

- **ticket-index:** activeTicketId -> activeTickets workspace-scoped map


### Fixed

- **ticket-surface:** restore absolute path links — revert 975cd7a relative-path change
- **ticket-surface:** use file:/// URI for flow surface links (multi-workspace compat)
- **ticket-surface:** use process.cwd() relative path for IDE link compat

## [4.4.24] - 2026-06-04

## [4.4.23] - 2026-06-03


### Fixed

- **init:** deploy & self-heal native rule spokes (was dead/removed)
- **init:** restore home-only spoke design — stop deploying spokes into workspaces
- **init:** strip deuk block from shared agent surfaces instead of blunt-deleting
- **ticket:** phase-advance hint loads state prompt/template from CLI surfaces


### Changed

- **init:** discard agentsMode — native rule spokes deploy by detection
- **roadmap:** separate AgentFlow (workflow) from Agent Retriever (rule/context)

## [4.4.22] - 2026-06-03

## [4.4.21] - 2026-06-03


### Added

- **surface:** flow 라인 🐶 마스코트 + 상태아이콘 + 클릭가능 상대경로 링크 개선


### Fixed

- **ticket:** flow surface 아이콘 🦸·🔍 교체 및 합성 금지 룰 명확화
- **ticket:** flow surface 아이콘 🦸→📦 변경


### Changed

- **ticket:** INDEX entries 캐시 제거 — .md 단일 소스 + 얇은 포인터

## [4.4.20] - 2026-06-03

## [4.4.19] - 2026-06-03

## [4.4.18] - 2026-06-03

## [4.4.17] - 2026-06-03

## [4.4.16] - 2026-06-03

## [4.4.15] - 2026-06-03

## [4.4.14] - 2026-06-03


### Fixed

- **pointer:** 글로벌 포인터를 MANDATORY 강제 문구로 강화 + active 포인터 sticky 버그 수정
- **rules,surface:** rules audit v96 정합화 + 진행 state flow surface 출력 (티켓 549)
- **rules:** Surface Discipline에 verbatim relay·중간보고 금지·환경 우선순위 강제 (티켓 493)
- **ticket:** show plan body inline in the approval surface


### Changed

- **ticket:** status에서 active 제거 — 단일 초점은 activeTicketId로만 표현

## [4.4.13] - 2026-06-02


### Fixed

- **pointer:** make global pointer an explicit run-rules instruction

## [4.4.12] - 2026-06-02

## [4.4.11] - 2026-06-02

## [4.4.10] - 2026-06-02


### Added

- **rules:** single-call composition with dynamic next-action

## [4.4.9] - 2026-06-02


### Added

- **path:** add makePath primitive; normalize constructed paths to platform-native


### Fixed

- **ticket:** auto-resolve workspace from cwd in ticket status when multiple are registered
- **ticket:** dedupe required_slots in workflow state surface
- **ticket:** surface fillable scaffold on plan-body guard + state surface on move


### Changed

- **home:** consolidate scattered home resolution into resolveUserHome()
- **path:** convert legacy CJS vsix scripts to ESM and route through makePath
- **path:** route all .mjs path construction through makePath

## [4.4.8] - 2026-06-01


### Added

- **dev:** add dev:install for internal global install, exclude vscode-extension from package

## [4.4.7] - 2026-06-01


### Added

- **rules:** add mandatory ticket-first gate enforcement (v95)
- **rules:** add ticket-exempt operations list (v96)


### Fixed

-  --cwd 없을 때 .deuk-agent 없는 디렉토리에서 단일 sibling workspace 자동 선택
-  enforce LF line endings across CLI file writes and add .gitattributes policy
-  normalize Windows path case in workspace registry to prevent duplicate entries


### Changed

-  export normalizeRegistryPath from cli-utils, remove duplicate in cli-init-commands

## [4.4.6] - 2026-05-26


### Added

-  add standalone agentflow vscode extension
- **cli:** add ticket phase surface, clickable link policy, and knowledge distill improvements
-  route context commands through Flow CLI
-  v4.3.0 AgentFlow Panel UI overhaul + README VSIX section + badge update
- **vsix:** ticket-click preview panel, telemetry rows, remove Command Session card


### Fixed

- **agents:** add WORKSPACE_ROOT resolution to boot sequence to prevent cross-repo ticket misrouting
-  allow commit-only flow without new tickets
-  allow empty workspace label in flow surface output
- **cli:** expose Claude settings changes in auto migration
- **cli:** hash Claude settings state for change detection
- **cli:** stop climbing for missing agent info
-  detect MCP projects from ingest registry
- **global-pointer:** remove legacy tags, add mandatory boot instruction
- **global-pointer:** restore DEUK_AGENT_FLOW_BEGIN/END tags, strip html tags as legacy
-  harden ticket index recovery and archiving
-  harden ticket lifecycle flow
-  honor gitignore sharing setting
- **init:** upsert/remove Claude UserPromptSubmit hook
-  isGeneratedDeukPointer가 새 한 줄 포인터 형식을 인식하도록 수정
-  pointer docs를 한 줄 포인터로 축소, workspace dispatch fallback 추가
-  refine AgentFlow command center ticket UX
-  rename DeukPack AgentFlow → Deuk Agent Flow, bump README version to v4.3.0
-  stabilize workspace detection and init cleanup behavior
- **ticket:** harden archive frontmatter handling
-  use ticket path to infer workspace label in flow surface


### Changed

-  add AgentFlow registry derivation flow
- **agent:** block test-surface shortcut reporting
-  AgentFlow 플러그인 로드맵 및 아키텍처 문서화
-  clarify MCP attachment model
- **documeta:** DeukMt → DocuMeta, .deukmt.md → .documeta 용어 통일
-  infer workspace from ticket path via .deuk-agent marker

## [4.4.4] - 2026-05-19

### Changed

- **cli:** removed runtime git probes from workspace detection and markdown lint target discovery so ordinary AgentFlow CLI commands no longer shell out to `git rev-parse`, `git diff`, or `git ls-files`.
- **ticket:** lifecycle quality gates now decide rules-audit scope from the actual lifecycle targets instead of querying the dirty git file list.

### Fixed

- **lint:** added a regression test proving `lint:md` default discovery does not invoke `git`.

## [4.4.3] - 2026-05-19

### Changed

- **ticket:** workspace-prefixed Flow surfaces now render as `flow:[workspace:상태]` so approval, adjustment, completion, and phase lines visibly carry the workspace name.
- **docs:** version headers and usage examples were aligned to the 4.4.3 release.

### Fixed

- **commentary:** updated harness and ticket command tests to validate the workspace-prefixed surfaces.

## [4.4.0] - 2026-05-18

### Changed

- **init:** switched automatic migration to single-target workspace cleanup so ordinary CLI use does not sweep sibling repositories.
- **rules:** made `core-rules/AGENTS.md` the only AgentFlow rule SSoT, including source checkouts; generated root `AGENTS.md` pointers are removed instead of preserved as package roots.
- **global:** replaced copied global rule bodies with hash-marked thin pointers that resolve the active package rules through `deuk-agent-flow rules path --path-only`.
- **project:** moved project-specific rules to `.deuk-agent/PROJECT_RULE.md` and kept local root pointers out of consumer workspaces.

### Fixed

- **ticket:** prevented `init`/automatic migration from running ticket archive, auto-close, or knowledge distillation lifecycle work.
- **workspace:** tightened workspace dispatch and matching behavior so ticket commands avoid accidental jumps to unrelated sibling workspaces.

## [4.3.22] - 2026-05-18

### Changed

- **agent-flow:** migrated fragmented local AgentFlow configuration into user-scoped global settings for Windows/Linux consumers.
- **init:** made workspace initialization clean up legacy local AgentFlow configuration under `/joy/workspace` so stale settings do not keep shadowing the user-level source of truth.

### Fixed

- **ticket:** normalized CLI-managed ticket markdown before lifecycle linting, so harmless formatting drift such as trailing whitespace in archived tickets no longer blocks new ticket creation or updates.
- **ticket:** made auto-archive and auto-close maintenance best-effort during ticket activity, preventing cleanup failures from aborting the active workflow while still pruning stale open-limit rows.

## [4.3.17] - 2026-05-17

### Added

- **vsix:** added a shared `npm run install:vscode` installer that deploys the bundled VSIX to both desktop VS Code and VS Code Server extension directories, prunes stale AgentFlow extension folders, and resets stale AgentFlow webview workspace state.

### Changed

- **rules:** replaced strict one-word running commentary enforcement with tool-owned workflow surfaces: ticket-start while pending, blockers when blocked, and final answers when done.
- **ticket:** made `ticket context` own the approved Phase 1 to Phase 2 durable transition before runtime `set_workflow_context` is recorded.

### Fixed

- **ticket:** added structured JSON repair payloads for `ticket create --json` validation failures, including missing sections, required headings, APC markers, and a compact skeleton for agent-neutral recovery.
- **vsix:** removed checkbox-based ticket multi-select and switched to Shift range selection plus Ctrl/Cmd toggles.
- **vsix:** hid handoff controls during multi-select and prevented hidden textarea access from freezing the webview.
- **vsix:** reduced ticket-click latency by avoiding full ticket rescans on preview/selection changes and by slimming the webview state payload.
- **vsix:** moved the ticket lifecycle/status control directly under `copy handoff` for single-ticket mode.

## [4.3.8] - 2026-05-17

### Fixed

- **init:** removed Deuk AgentContext MCP registration/status messages from the default `init` output and cleaned generated nested `AGENTS.md` pointer surfaces inside git repositories while preserving root pointers.
- **ticket:** treated `status: deprecated` as a non-execution lifecycle status so `ticket status` reports deprecated tickets directly instead of flagging missing Phase 1 execution planning.

## [4.3.2] - 2026-05-16

### Fixed

- **ticket:** `ticket close` now prints a single clickable archived link for the closed ticket, avoiding duplicate file-link cards and stale deleted paths in the close surface.

## [4.3.0] - 2026-05-14

### Added

- **vsix:** Introduced the **DeukAgentFlow AgentFlow Panel** VS Code extension (VSIX) — a sidebar panel that brings ticket-driven workflow directly into the editor without switching to the terminal.
  - Ticket list with compact columns: filename · m/s · phase · priority · snippet · date.
  - Status filter (Open / Close / All) with active-ticket highlight chip in the toolbar.
  - Full-text ticket search popup (id, title, summary, body) with live filtering.
  - Ticket preview panel: file path, phase, priority pills, and an **open** shortcut in one line — no word-wrap, no scrollbar.
  - **Copy handoff** button beside the chat textarea: copies `id / title / phase·status·priority / summary / continue ticket` to the clipboard for immediate paste into any AI chat.
  - Workspace selector supporting multi-root workspaces; nested workspace detection stops at the first agent-rule boundary.

### Fixed

- **vsix:** Status filter now maps legacy `active` values to `open` for backward compatibility; default filter changed from `active` to `all`.
- **vsix:** Preview panel falls back to the first ticket in the filtered list when the stored preview ticket is no longer visible after a filter change.
- **vsix:** Ticket item selection highlight replaced `outline`-based rendering (which clipped at list edges) with border-color + background-color tinting to prevent visual clipping.
- **cli:** Workspace discovery stops recursing when a `.deuk-agent` root is found, preventing nested workspace false-positives in `discoverAllWorkspaces`.

## [4.2.27] - 2026-05-13


### Added

-  add standalone agentflow vscode extension
-  route context commands through Flow CLI


### Fixed

-  detect MCP projects from ingest registry
-  harden ticket index recovery and archiving
-  refine AgentFlow command center ticket UX


### Changed

-  add AgentFlow registry derivation flow
- **agent:** block test-surface shortcut reporting
-  clarify MCP attachment model

## [4.2.2] - 2026-05-10

### Fixed

- **release:** keep release-context carry-over so version bumping does not drop `Unreleased` items.

## [4.2.1] - 2026-05-10

### Fixed

- **cli:** stop ticket discovery at the current agent-rule boundary instead of inheriting the parent workspace.
- **ticket:** enforce Phase 1 planning completeness in `status`, `guard`, and `move` checks to prevent silent Phase-1 bypass.
- **ticket:** coerce string phase values to numbers before phase transitions so moves can’t produce string-concatenation artifacts (for example, `"1" + 1 => "11"`).

## [4.0.38] - 2026-05-10

### Fixed

- **rules:** require approval-pending final answers to repeat the compact `Ticket start` surface, preventing final-only approval text from hiding the active ticket link.

## [4.0.37] - 2026-05-09

### Fixed

- **init:** restore a visible completion message after successful init and add the short first-use prompt guide ``이슈분석 티켓`이라고 해보세요.``

## [4.0.36] - 2026-05-09

### Fixed

- **init:** reduce first-run interactive setup to the workspace-purpose choice, infer the remaining defaults from the project directory, hide the Deuk AgentContext MCP choice, and avoid the post-choice stall that prevented setup completion.
- **rules:** require the clickable `Ticket start` line to stay visible after first ticket creation/use, preventing approval-only replies from hiding the active ticket.

## [4.0.35] - 2026-05-09

### Fixed

- **release:** make public package publish scripts skip source-only tests while still running the npm smoke check.
- **release:** require public commit subjects to describe the released feature, fix, docs, or release change instead of using `sync` as the main label.
- **release:** print the same public commit-message guidance from the export script so public history records product changes rather than transport mechanics.

## [4.0.34] - 2026-05-09

### Changed

- **init:** redesigned first-run prompts around workspace kind, technical surface, AI client pointers, and optional Deuk AgentContext MCP memory so non-coding and mixed workspaces are not forced into a coding-only setup.
- **docs:** simplified user-facing update instructions to `npm install -g deuk-agent-flow` followed by `deuk-agent-flow init`, with repo-root and workspace-root refresh guidance.

### Fixed

- **templates:** made package `templates/` the runtime SSoT and removed legacy `.deuk-agent/templates` copies during init/merge.
- **ticket:** normalized common Phase 1 heading-level mistakes during `ticket create` before strict template validation.
- **release:** narrowed public export to runtime files and cleaned stale release-tree artifacts such as old tarballs, `bundle/`, `node_modules/`, internal scripts, and tests.

## [4.0.21] - 2026-05-08

### Fixed

- **docs:** repaired the custom downloads badge endpoint payload so Shields accepts it, and restored the combined `deuk-flow` downloads badge at the top of the English and Korean README surfaces.
- **release:** copied `docs/badges/npm-downloads.json` into the public release tree and removed internal-only package payload leakage from the npm release surface.

## [4.0.20] - 2026-05-08

### Fixed

- **docs:** restored the combined npm downloads badge to the top of the English and Korean README surfaces while keeping the public `deuk-flow` label.
- **release:** copied `docs/badges/` into the public release tree so the README downloads badge survives public export and patch republish flow.

## [4.0.12] - 2026-05-07

### Fixed

- **init:** preserve AgentFlow spokes during migration by replacing installed legacy `CLAUDE.md` surfaces without creating `.bak` files, while still installing a default root `AGENTS.md` pointer for `.deuk-agent` projects without detected agent tool surfaces.
- **skill:** report installed skills from either the registry or on-disk `.deuk-agent/skills/<id>/SKILL.md` files so `deuk-agent-flow skill list` reflects migrated skill directories.
- **rules:** map AgentFlow skill-status questions to `deuk-agent-flow skill list` and use fully qualified `deuk-agent-flow ticket ...` command examples in the core agent rules.

## [4.0.11] - 2026-05-07

### Fixed

- **init/ticket:** restore the intended month-only archive policy by normalizing older deep archive layouts into the canonical month bucket layout, rebuilding archive shard indexes without obsolete archive-depth metadata, and preventing new non-canonical imports during `init`.

## [3.3.3] - 2026-05-06

### Fixed

- Restored the README language switch links so npm and GitHub readers can move between English and Korean documentation from the first screen.
- Published only public documentation links in the README tables while keeping internal research and growth notes out of the npm/Public surface.

## [3.3.2] - 2026-05-06

### Positioning

- Reframed the npm/GitHub identity around **AI coding agent guardrails for every repo**, with ticketed scope, verification, and shared `AGENTS.md` workflows visible in package metadata.
- Added README comparison against `AGENTS.md`, Copilot instructions, Cursor rules, Claude skills, agent harnesses, and general guardrail frameworks to show where DeukAgentFlow sits in the ecosystem.
- Added a short "What's Next" section to set expectations for clearer first-run checks, compact CLI/RAG reminders, and visible companion surfaces for active ticket, phase, open-ticket count, and DeukAgentContext memory status.


### Added

-  AGENTS.md v12 + summary mandatory guard + PROJECT_RULE optimization
- **cli:** add 'ticket next' command for instant task discovery (T[#295](https://github.com/joygram/DeukAgentFlow/issues/295))
- **cli:** enforce required frontmatter keys in lint:md (T-118)
-  harden ticket paths and add DeukPack RAG schemas
- **migration:** add summary/planLink/caution auto-enrichment for legacy tickets
-  Phase 0 search limiter - max 2 MCP calls, skip when context sufficient
-  replace legacy fill-in-the-blank rule check with Version Gating and Task Relevance check
- **rules:** enforce hard guardrails, add hotfix protocol and urgency response
- **rules:** harden document boundary workflow
- **spoke:** add fill-in completion template for rule enforcement
- **T-114:** 1-CALL ticket discovery rule + CLI max call limits
- **T-115:** HARD BLOCK on write tools without active ticket
- **T-116:** auto-close stale tickets on ticket create + Phase 4 NEVER skip
- **T-116:** smart close based on checklist + phase state
- **ticket:** enforce filled create flow and phase1 status guard
- **ticket:** enforce open ticket cleanup flow
- **ticket:** partition archive index by month


### Fixed

-  add Refactor Safety Guard and Halt-and-Replan hard rules
-  agent degradation remediation — planLink, inline TDW, token optimization
-  align ticket APC template with phase gate
- **docs:** correct frontmatter keys in AGENTS.md (remove fm_ prefix)
- **init:** deploy Antigravity spoke to project root AGENTS.md
-  register legitimate DR-04/DR-05 exceptions and update PROJECT_RULE.md
-  remove duplicate phase key in ticket template and repair broken tickets
- **rules:** announce active ticket at start
- **rules:** keep planlink free of progress checkboxes
- **rules:** make planlink capture agent analysis
- **rules:** separate ticket and plan content
- **spoke:** GLOBAL_AGENTS.md link text to actual filename AGENTS.md
-  SSOT — init removes .deuk-agent/templates/ unconditionally (bundle is single source of truth)
- **T-116:** parallel-safe auto-close - only close activeTicketId, warn others
- **T-116:** replace auto-close with activeTicketId switch + warning
- **ticket:** honor project and submodule filters
- **ticket:** Sync close/archive status to frontmatter to prevent rebuild reversion


### Changed

-  add Dependency Integrity Guard (HARD RULE) to AGENTS.md
-  add lite accessibility vision plan
-  add skill positioning release notes
-  add version frontmatter to AGENTS.md for rule loading optimization
-  align bad examples with plan/archive convention
-  archive bmt coordination ticket 142
-  archive bmt frontmatter cleanup ticket 144
-  archive bmt go ticket 140
-  archive bmt java ticket 139
-  archive bmt matrix ticket 133
-  archive bmt rust ticket 141
-  bump AGENTS.md to v15 and strengthen dependency guards
-  clarify ticket creation flow
-  document rationale for docs/plan and fix section numbering
-  Enforce strict rules for Scope Creep Handling
-  enhance main features and workflow intro for v3.2.0
-  optimize AGENTS.md — merge Dependency Integrity into Refactor Guard, compress Scope Creep
-  position agent guardrail growth loop
- **rules:** clarify phase one execution semantics
- **rules:** mandate enrich_frontmatter for all plan/report files (T-118)
- **spoke:** hard rule single directive
-  update legacy path guidance to plan/archive layout

## [3.3.0] - 2026-05-02

### Added

- **docs:** add AI coding agent guardrail positioning, vision, and organic growth research for VS Code, Open VSX, GitHub, and skill-driven discovery.
- **docs:** add a deep comparison of Karpathy-style skills, DeukAgentFlow, and DeukAgentContext, positioning skills as behavior playbooks, DeukAgentFlow as workflow/permission control, and DeukAgentContext as ticketed engineering memory.
- **seo:** add related-project positioning for `andrej-karpathy-skills` plus discovery keywords for Claude Code, AGENTS.md, Cursor rules, agent skills, and AI guardrails.

### Changed

- **ticket:** enforce a decision-first cleanup flow when open tickets exceed the configured limit, while allowing closed tickets to be archived automatically.
- **ticket:** organize archived tickets by year-month buckets to reduce active ticket repository clutter.
- **docs:** update README document indexes and GitHub topic guidance to emphasize the agent guardrail, instruction hub, skill registry, and project memory positioning.

### Fixed

- **ticket:** prevent open ticket growth from silently exceeding the intended operating limit by surfacing cleanup decisions before new work proceeds.

## [3.2.0] - 2026-04-28


### Added

- **agent:** implement platform coexistence and mode-aware workflow


### Changed

- **agents:** add Co-existence Protocol and Workflow Gate (T-120)
-  update usage, architecture, and principles for v3.1.0

## [3.1.0] - 2026-04-28


### Added

-  add ArchitectureGuard.test.mjs and create technical debt ticket T-103
-  add first-class copilot and codex support
- **arch:** implement APC v3 and simplify repository structure
- **cli:** restrict --skip-phase0 based on MCP server status and update rules
-  consolidate rule cleanup logic and enforce thin pointers for entry points
-  enforce unidirectional AGENTS.md single source of truth
-  enhance CLI reporting and add practical usage guide
-  implement strict phase-driven ticket workflow with APC validation
-  implement Zero-Copy architecture with absolute path pointing and frontmatter-based PROJECT_RULE.md
-  implement zero-token knowledge distillation on ticket archive and cleanup dead code
- **rules:** add AI Agent fallback guide to PROJECT_RULE.md template
- **rules:** normalize canonical rules and decouple DeukPack rules
- **telemetry:** add local-first telemetry CLI and update AGENTS.md
- **ticket:** implement --plan-body for filled Phase 1 ticket body input and update project rules


### Fixed

-  auto-detect client tool from model and config in telemetry
-  resolve agent loop on ticket navigation + archive 37 dead tickets
- **rules:** bilingual ko/en PROJECT_RULE.md template
- **rules:** remove redundant core rules link from PROJECT_RULE.md
- **rules:** restore frontmatter in PROJECT_RULE.md
- **rules:** restore mandatory ticket workflow and anti-shoveling rules
- **rules:** sync restored strict workflow AGENTS.md and unified templates


### Changed

-  add markdown lint policy and workflow docs
- **agent:** rename TDD to TDW, archive ticket 101, and remove DOMAIN_RULES
-  AGENTS.md full cleanup - eliminate redundancy, unify English, remove dead rules
-  finalize ticket 066 rule normalization
-  modernize CLI architecture, implement state-driven path resolution, and comprehensive audit cleanup
- **rules:** decouple DeukPack rules and fix merge injection logic
-  update principles and cli compiler to DeukAgentContext

## [3.0.0] - 2026-04-25

### 🚀 Major Breakthrough: Hub-Spoke Architecture
- **Canonical Rule Hub**: Introduced `AGENTS.md` as the single source of truth for all AI agents.
- **Thin Spoke Pointers**: IDE-specific rules (Cursor, Copilot, etc.) are now lightweight pointers to the central Hub, eliminating duplication and sync errors.
- **Global CLI Proxy**: Implemented a smart entry point that automatically detects and routes execution to local workspace sources, ensuring zero-latency development.

### 🧹 Zero-Legacy & Cleanliness
- **Auto-Purge**: `init` now unconditionally deletes deprecated `.cursorrules` files.
- **Smart Backups**: Added logic to detect custom user rules and rename files to `.bak` instead of deletion.
- **Submodule Scrubbing**: Automatically cleans empty submodule directory stubs and scrubs `.gitmodules`.

### 🏗️ Branding & Infrastructure
- **Identity Overhaul**: Rebranded as a "Zero-Latency, High-Signal AI Orchestration Protocol".
- **Documentation v3**: New high-end 3D visual infographics and overhauled conceptual guides (Architecture, Principles, How-it-works).
- **Domain Agnostic**: Generalized `bundle/AGENTS.md` to support any technology stack, removing domain-specific hardcoding.

### ⚙️ CLI Enhancements
- **Proxy Routing**: `bin/deuk-agent-rule.js` performs directory traversal to find local scripts.
- **Synchronized IO**: Refactored core logic to use synchronous FS operations for rock-solid CLI stability.

---

## [2.4.0] - 2026-04-18
- add Codex CLI support (.codexrules) and apply globally
- implement ticket chaining (--chain) for automated ticket linkage
- improve submodule isolation logic
## [4.0.19] - 2026-05-08

### Fixed

- **publish:** restore generated spoke replacement during init so legacy DeukAgentRules pointers do not survive beside the new DeukAgentFlow managed block
- **telemetry:** switch client-label normalization to the shared `toSlug` utility so architecture guard tests pass during release validation

### Changed

- **docs:** align the English and Korean maintainer publish sections around the dual-package npm flow and the combined downloads badge

## [4.0.18] - 2026-05-08

### Fixed

- **skills:** preserve `.deuk-agent/skills.json` and `usage.json` during init layout cleanup, and let `skill list` detect real Claude/Cursor exposure pointers even when registry state is stale
- **telemetry:** normalize model/client labels so analytics do not fragment across case and spacing variants
- **ticket:** prefer the newest open ticket when syncing the active ticket pointer so `ticket continue` follows the current work instead of an older open ticket
