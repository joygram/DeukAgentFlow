# 변경 이력 (Changelog)

이 프로젝트의 모든 주목할 만한 변경 사항은 이 파일에 기록됩니다.

**English:** [CHANGELOG.md](CHANGELOG.md)

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 기반으로 하며, 이 프로젝트는 [유의적 버전(Semantic Versioning)](https://semver.org/spec/v2.0.0.html)을 준수합니다.


## [5.0.2] - 2026-06-16

### Fixed

- **flow-ui:** 전체 티켓 카운트가 1로 표시되던 버그 — ticket list에 전체 카운트 동봉 ([#756](https://github.com/joygram/DeukAgentFlow/issues/756))

## [5.0.1] - 2026-06-16

### Fixed

- **vsix:** vscode-extension 버전이 루트 버전 자동 추종하도록 수정

### Changed

- **readme:** 5.0 로드맵 갱신 + Flow UI 스샷 자리 정비 (en/ko)

## [5.0.0] - 2026-06-16

> **메이저 릴리스.** 스킬을 홈 디렉토리(`~/.deuk`)로 이전하고, XState 기반 티켓 워크플로 엔진과 VS Code Flow UI(첫 배포)를 도입한 내부 시스템 전면 개편입니다. 기존 `.deuk-agent/` 워크스페이스 데이터는 자동 마이그레이션됩니다 — 실패 시 복구 절차는 README의 마이그레이션 가이드를 참고하세요.

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

### 기타

- **#673:** multi-agent session isolation via per-agent env var detection

## [4.4.54] - 2026-06-07

### 추가됨 (Added)

- **skills:** 서브컬처 메이드 페르소나(`persona-maid`) 스킬을 템플릿으로 추가했습니다.
  - 정식 배포 시 기본적으로는 **비활성(opt-in)** 상태입니다.
  - 사용자가 원할 경우 `deuk-agent-flow skill add --skill persona-maid` 명령으로 수동 장착할 수 있습니다.

## [4.4.4] - 2026-05-19

### 변경됨 (Changed)

- **cli:** workspace 감지와 markdown lint 대상 탐색에서 런타임 git probe를 제거해 일반 AgentFlow CLI 명령이 더 이상 `git rev-parse`, `git diff`, `git ls-files`를 실행하지 않도록 했습니다.
- **ticket:** lifecycle quality gate가 dirty git 파일 목록을 조회하지 않고 실제 lifecycle 대상만으로 rules audit 범위를 판단하도록 바꿨습니다.

### 수정됨 (Fixed)

- **lint:** `lint:md` 기본 대상 탐색이 `git`을 호출하지 않는다는 회귀 테스트를 추가했습니다.

## [4.4.3] - 2026-05-19

### 변경됨 (Changed)

- **ticket:** workspace 접두어가 있는 Flow surface를 `flow:[workspace:상태]` 형식으로 렌더링해 승인, 조정, 종료, phase 라인에 워크스페이스명이 보이도록 했습니다.
- **docs:** 버전 헤더와 사용 예시를 4.4.3 릴리스에 맞췄습니다.

### 수정됨 (Fixed)

- **commentary:** 하네스와 ticket command 테스트가 workspace-prefixed surface를 검증하도록 갱신했습니다.

## [4.4.0] - 2026-05-18

### 변경됨 (Changed)

- **init:** 자동 마이그레이션을 단일 대상 워크스페이스 정리로 바꿔, 일반 CLI 사용 중 sibling 저장소까지 쓸어버리지 않도록 했습니다.
- **rules:** source checkout을 포함해 AgentFlow 룰 SSoT를 `core-rules/AGENTS.md` 하나로 고정하고, 생성된 root `AGENTS.md` 포인터는 패키지 루트 예외 없이 제거하도록 했습니다.
- **global:** 글로벌 룰 복사본 대신 `deuk-agent-flow rules path --path-only`로 현재 패키지 룰을 찾는 hash-marked thin pointer를 설치하도록 바꿨습니다.
- **project:** 프로젝트별 규칙 위치를 `.deuk-agent/PROJECT_RULE.md`로 옮기고, consumer workspace root에는 로컬 포인터를 남기지 않도록 정리했습니다.

### 수정됨 (Fixed)

- **ticket:** `init`/자동 마이그레이션 중 ticket archive, auto-close, knowledge distill lifecycle 작업이 실행되지 않도록 막았습니다.
- **workspace:** 티켓 명령이 엉뚱한 sibling workspace로 점프하지 않도록 workspace dispatch와 matching 동작을 강화했습니다.

## [4.3.22] - 2026-05-18

### 변경됨 (Changed)

- **agent-flow:** 여러 로컬 설정으로 파편화되어 있던 AgentFlow 설정을 Windows/Linux 소비자 공통의 user-scoped global 설정으로 이관했습니다.
- **init:** `/joy/workspace` 아래에서 초기화할 때 기존 로컬 AgentFlow 설정을 정리해, 오래된 로컬 설정이 user-level 설정을 계속 가리지 않도록 했습니다.

### 수정됨 (Fixed)

- **ticket:** CLI가 관리하는 티켓 markdown을 lifecycle lint 전에 자동 정규화해, archived ticket의 trailing whitespace 같은 무해한 포맷 흔들림이 새 티켓 생성/갱신을 막지 않도록 했습니다.
- **ticket:** 티켓 활동 중 auto-archive와 auto-close maintenance를 best-effort로 처리해, 정리 실패가 현재 워크플로우를 중단하지 않으면서 stale open-limit row는 계속 정리되도록 했습니다.

## [4.3.17] - 2026-05-17

### 추가됨 (Added)

- **vsix:** `npm run install:vscode` 공통 설치 경로를 추가해 bundled VSIX를 데스크톱 VS Code와 VS Code Server 확장 디렉터리에 함께 설치하고, 오래된 AgentFlow 확장 폴더와 stale webview workspace state를 정리하도록 했습니다.

### 변경됨 (Changed)

- **rules:** 실행 중 commentary를 한 단어로 강제하는 방식 대신, 승인 전 `Ticket start`, blocker, 최종 응답처럼 도구가 소유하는 workflow surface 중심으로 정리했습니다.
- **ticket:** `ticket context`가 승인된 Phase 1 티켓을 durable Phase 2 `active`로 전환한 뒤 runtime `set_workflow_context`가 기록되도록 했습니다.

### 수정됨 (Fixed)

- **ticket:** `ticket create --json` 검증 실패 시 누락 섹션, 필수 heading, APC marker, compact skeleton을 포함한 구조화된 repair payload를 반환하도록 해 에이전트별 복구 비용을 줄였습니다.
- **vsix:** checkbox 기반 티켓 멀티셀렉트를 제거하고 Shift 범위 선택과 Ctrl/Cmd 토글 방식으로 바꿨습니다.
- **vsix:** 멀티셀렉트 상태에서는 handoff 컨트롤을 숨기고, 숨겨진 textarea 접근으로 webview가 멈추는 문제를 막았습니다.
- **vsix:** preview/selection 변경 시 전체 티켓 재스캔을 피하고 webview state payload를 줄여 티켓 클릭 지연을 낮췄습니다.
- **vsix:** 단일 티켓 모드에서 상태/lifecycle 컨트롤을 `copy handoff` 바로 아래로 이동했습니다.

## [4.3.8] - 2026-05-17

### 수정됨 (Fixed)

- **init:** 기본 `init` 출력에서 Deuk AgentContext MCP 등록/상태 문구를 제거하고, git 저장소 내부에 잘못 생성된 중첩 `AGENTS.md` 포인터는 root 포인터를 보존한 채 정리하도록 했습니다.
- **ticket:** `status: deprecated`를 실행 대상이 아닌 생명주기 상태로 처리해, `ticket status`가 deprecated 티켓을 Phase 1 계획 누락으로 오판하지 않고 그대로 보고하도록 했습니다.

## [4.3.2] - 2026-05-16

### 수정됨 (Fixed)

- **ticket:** `ticket close`가 닫힌 티켓에 대해 클릭 가능한 archive 링크를 한 번만 출력하도록 정리해, 중복 파일 카드와 삭제된 경로 표면이 다시 나타나지 않게 했습니다.

## [4.3.0] - 2026-05-14

### 추가됨 (Added)

- **vsix:** **DeukAgentFlow AgentFlow Panel** VS Code 확장(VSIX)을 도입했습니다. 터미널 전환 없이 에디터 사이드패널에서 티켓 기반 워크플로우를 바로 제어할 수 있습니다.
  - 티켓 목록 컬럼: 파일명 · m/s · phase · priority · 본문 스니펫 · 날짜 — 1행 고밀도 표시.
  - 툴바: 🔍 검색 | Open/Close/All 필터 | 활성 티켓 ID(강조) | 티켓 수.
  - 전문(id·title·summary·body) 실시간 검색 팝업.
  - 미리보기 패널: 파일명 + phase/priority pill + `open` 버튼을 1줄로 표시 (워드랩·스크롤바 없음).
  - **Copy handoff** 버튼: textarea 옆에 고정되어 `id / title / phase·status·priority / summary / continue ticket`을 클립보드에 즉시 복사.
  - 멀티루트 워크스페이스 셀렉터; 중첩 워크스페이스 탐지는 agent-rule 경계에서 자동 중단.

### 수정됨 (Fixed)

- **vsix:** 상태 필터에서 레거시 `active` 값을 `open`으로 backward 매핑; 기본 필터를 `active`에서 `all`로 변경.
- **vsix:** 필터 변경 후 저장된 미리보기 티켓이 목록에 없으면 첫 번째 티켓으로 자동 fallback 처리.
- **vsix:** 티켓 선택 강조를 `outline` 기반(목록 좌우가 잘리는 문제)에서 border-color + background-color tinting으로 교체.
- **cli:** `discoverAllWorkspaces`에서 `.deuk-agent` 루트 발견 시 하위 재귀를 중단해 중첩 워크스페이스 오탐지를 방지.

## [Unreleased]

### 수정됨 (Fixed)

- **ticket:** 티켓 템플릿의 APC 마커를 추가 설명문 없이 제목형으로 정리해, 에이전트가 마커 본문을 다음 줄에 쓰도록 유도했습니다.
- **ticket:** APC create 입력을 마커별로 자르지 않고 APC 섹션 전체 기준으로 검증해, 제목형·단독형·inline 마커 스타일 호환성을 유지했습니다.
- **rules:** `Ticket start` 링크가 이미 노출된 티켓은 완료 응답에서 같은 클릭 링크를 다시 내보내지 않도록 했습니다.
- **skills:** 공용 skill 요약과 ownership 문구에서 DeukAgentFlow 전용 표현을 제거해 소비자 표면을 일반화했습니다.

## [5.0.4] - 2026-06-18

### 수정됨 (Fixed)

- **ticket:** 티켓 템플릿의 APC 마커를 추가 설명문 없이 제목형으로 정리해, 에이전트가 마커 본문을 다음 줄에 쓰도록 유도했습니다.
- **ticket:** APC create 입력을 마커별로 자르지 않고 APC 섹션 전체 기준으로 검증해, 제목형·단독형·inline 마커 스타일 호환성을 유지했습니다.
- **rules:** `Ticket start` 링크가 이미 노출된 티켓은 완료 응답에서 같은 클릭 링크를 다시 내보내지 않도록 했습니다.
- **skills:** 공용 skill 요약과 ownership 문구에서 DeukAgentFlow 전용 표현을 제거해 소비자 표면을 일반화했습니다.

## [5.0.3] - 2026-06-17

### 수정됨 (Fixed)

- **ticket:** 티켓 템플릿의 APC 마커를 추가 설명문 없이 제목형으로 정리해, 에이전트가 마커 본문을 다음 줄에 쓰도록 유도했습니다.
- **ticket:** APC create 입력을 마커별로 자르지 않고 APC 섹션 전체 기준으로 검증해, 제목형·단독형·inline 마커 스타일 호환성을 유지했습니다.
- **rules:** `Ticket start` 링크가 이미 노출된 티켓은 완료 응답에서 같은 클릭 링크를 다시 내보내지 않도록 했습니다.
- **skills:** 공용 skill 요약과 ownership 문구에서 DeukAgentFlow 전용 표현을 제거해 소비자 표면을 일반화했습니다.

## [4.4.6] - 2026-05-26

### 수정됨 (Fixed)

- **ticket:** 티켓 템플릿의 APC 마커를 추가 설명문 없이 제목형으로 정리해, 에이전트가 마커 본문을 다음 줄에 쓰도록 유도했습니다.
- **ticket:** APC create 입력을 마커별로 자르지 않고 APC 섹션 전체 기준으로 검증해, 제목형·단독형·inline 마커 스타일 호환성을 유지했습니다.
- **rules:** `Ticket start` 링크가 이미 노출된 티켓은 완료 응답에서 같은 클릭 링크를 다시 내보내지 않도록 했습니다.
- **skills:** 공용 skill 요약과 ownership 문구에서 DeukAgentFlow 전용 표현을 제거해 소비자 표면을 일반화했습니다.

## [4.2.27] - 2026-05-13

### 수정됨 (Fixed)

- **ticket:** 티켓 템플릿의 APC 마커를 추가 설명문 없이 제목형으로 정리해, 에이전트가 마커 본문을 다음 줄에 쓰도록 유도했습니다.
- **ticket:** APC create 입력을 마커별로 자르지 않고 APC 섹션 전체 기준으로 검증해, 제목형·단독형·inline 마커 스타일 호환성을 유지했습니다.
- **rules:** `Ticket start` 링크가 이미 노출된 티켓은 완료 응답에서 같은 클릭 링크를 다시 내보내지 않도록 했습니다.
- **skills:** 공용 skill 요약과 ownership 문구에서 DeukAgentFlow 전용 표현을 제거해 소비자 표면을 일반화했습니다.

## [4.2.27] - 2026-05-13

### 수정됨 (Fixed)

- **ticket:** 티켓 템플릿의 APC 마커를 추가 설명문 없이 제목형으로 정리해, 에이전트가 마커 본문을 다음 줄에 쓰도록 유도했습니다.
- **ticket:** APC create 입력을 마커별로 자르지 않고 APC 섹션 전체 기준으로 검증해, 제목형·단독형·inline 마커 스타일 호환성을 유지했습니다.
- **rules:** `Ticket start` 링크가 이미 노출된 티켓은 완료 응답에서 같은 클릭 링크를 다시 내보내지 않도록 했습니다.
- **skills:** 공용 skill 요약과 ownership 문구에서 DeukAgentFlow 전용 표현을 제거해 소비자 표면을 일반화했습니다.

## [4.2.2] - 2026-05-10

### 수정됨 (Fixed)

- **release:** 버전 bump 시 `Unreleased`에 남은 항목이 유실되지 않도록 누적 릴리스 이월 처리를 보강했습니다.

## [4.2.1] - 2026-05-10

### 수정됨 (Fixed)

- **cli:** 티켓 탐색이 상위 워크스페이스를 상속하지 않고 현재 agent-rule 경계에서 멈추도록 수정했습니다.
- **ticket:** `status`, `guard`, `move`의 Phase 1 검증을 동일하게 적용해, 미완성 상태 티켓이 숨김 없이 걸러지도록 수정했습니다.
- **ticket:** `move` 단계에서 문자열 phase 값이 문자열 결합으로 오동작하는 것을 방지하기 위해 숫자 변환 후 산술 처리하도록 수정했습니다.

## [4.0.38] - 2026-05-10

### 수정됨 (Fixed)

- **rules:** 승인 대기 상태의 최종 응답도 compact `Ticket start` 표면을 반복하도록 강제해, 최종 승인 대기 문구만 남아 활성 티켓 링크가 숨겨지는 문제를 막았습니다.

## [4.0.37] - 2026-05-09

### 수정됨 (Fixed)

- **init:** init 성공 후 보이는 완료 피드백을 복구하고, 첫 사용 가이드로 ``이슈분석 티켓`이라고 해보세요.` 문구를 추가했습니다.

## [4.0.36] - 2026-05-09

### 수정됨 (Fixed)

- **init:** 첫 실행 대화형 설정을 workspace 용도 선택 하나로 줄이고, 나머지는 프로젝트 디렉터리 성격으로 추론하며, Deuk AgentContext MCP 선택지를 숨김 처리하고, 선택 후 먹통으로 설정 완료가 실패하던 흐름을 수정했습니다.
- **rules:** 최초 티켓 생성/사용 후 클릭 가능한 `Ticket start` 줄이 계속 보이도록 강제해, 승인 요청만 남고 활성 티켓이 숨겨지는 응답을 막았습니다.

## [4.0.35] - 2026-05-09

### 수정됨 (Fixed)

- **release:** 공개 패키지의 publish 스크립트가 소스 전용 테스트는 건너뛰고 npm smoke 검증은 유지하도록 수정했습니다.
- **release:** 공개 커밋 제목이 `sync` 같은 전달 단계가 아니라 공개되는 feature/fix/docs/release 변경 자체를 설명하도록 명확히 했습니다.
- **release:** 공개 export 실행 시에도 같은 public commit message 가이드를 출력해 공개 기록이 제품 변경 중심으로 남도록 했습니다.

## [4.0.34] - 2026-05-09

### 변경됨 (Changed)

- **init:** 첫 실행 질문을 workspace 종류, 기술 표면, AI client pointer, 선택형 Deuk AgentContext MCP memory 기준으로 재구성해 코딩 전용이 아닌 기획/시스템/연구/혼합 workspace도 자연스럽게 설정할 수 있게 했습니다.
- **docs:** 사용자용 업데이트 안내를 `npm install -g deuk-agent-flow` 이후 `deuk-agent-flow init`만 실행하는 흐름으로 단순화하고, repo 루트와 workspace 루트 갱신 방식을 명확히 했습니다.

### 수정됨 (Fixed)

- **templates:** 패키지 `templates/`를 runtime 단일 진실 공급원으로 삼고, init/merge 중 legacy `.deuk-agent/templates` 복사본을 제거하도록 정리했습니다.
- **ticket:** `ticket create` strict 검증 전에 Phase 1 heading level 실수를 canonical heading으로 정규화하도록 수정했습니다.
- **release:** 공개 export 대상을 runtime 파일로 좁히고 오래된 tarball, `bundle/`, `node_modules/`, 내부 script, test 같은 공개 트리 찌꺼기를 제거하도록 했습니다.

## [4.0.21] - 2026-05-08

### 수정됨 (Fixed)

- **docs:** Shields가 허용하는 형식으로 커스텀 다운로드 배지 JSON을 복구하고, 영문/한글 README 상단의 통합 `deuk-flow` 다운로드 배지를 다시 노출했습니다.
- **release:** `docs/badges/npm-downloads.json`를 공개 미러에도 동기화하고 npm 공개 패키지 표면에서 내부 전용 payload 유입을 제거했습니다.

## [4.0.20] - 2026-05-08

### 수정됨 (Fixed)

- **docs:** 영문/한글 README 상단에 통합 npm 다운로드 배지를 복구하고, 공개 표기는 `deuk-flow` 라벨로 유지했습니다.
- **release:** `docs/badges/`를 공개 릴리스 트리에도 복사하도록 보강해 README 다운로드 배지가 public export와 patch 재배포 뒤에도 유지되게 했습니다.

## [4.0.12] - 2026-05-07

### 수정됨 (Fixed)

- **init:** 마이그레이션 중 AgentFlow spoke가 사라지지 않도록 설치된 legacy `CLAUDE.md` 표면은 `.bak` 없이 교체하고, 감지된 agent tool 표면이 없는 `.deuk-agent` 프로젝트에도 기본 root `AGENTS.md` 포인터를 설치하도록 수정했습니다.
- **skill:** registry뿐 아니라 온디스크 `.deuk-agent/skills/<id>/SKILL.md` 파일도 설치된 skill로 판정하여 `deuk-agent-flow skill list`가 마이그레이션된 skill 디렉터리 상태를 정확히 보여주도록 수정했습니다.
- **rules:** AgentFlow skill 상태 질문은 `deuk-agent-flow skill list`로 확인하도록 명시하고, core agent rules의 ticket 예시를 완전한 `deuk-agent-flow ticket ...` 명령으로 정규화했습니다.

## [4.0.11] - 2026-05-07

### 수정됨 (Fixed)

- **init/ticket:** 의도했던 month-only archive 정책을 복원했습니다. `init`가 예전의 깊은 archive 레이아웃을 canonical month bucket 레이아웃으로 정규화하고, 낡은 archive depth metadata 없이 archive shard index를 다시 쓰며, 새 비정규 import가 생기지 않도록 수정했습니다.

## [3.3.3] - 2026-05-06

### 수정됨 (Fixed)

- npm과 GitHub 첫 화면에서 영어/한국어 README를 바로 오갈 수 있도록 언어 전환 링크를 복구했습니다.
- README 문서 표에는 공개 문서 링크만 남기고, 내부 리서치와 성장 전략 문서는 npm/Public 공개 표면에서 제외했습니다.

## [3.3.2] - 2026-05-06

### 포지셔닝 (Positioning)

- npm/GitHub에서 보이는 정체성을 **모든 레포를 위한 AI 코딩 에이전트 가드레일**로 재정리했습니다.
- `AGENTS.md`, Copilot instructions, Cursor rules, Claude skills, 에이전트 실행기, 일반 LLM/MCP 가드레일과 비교해 DeukAgentFlow가 더하는 티켓 생명주기, 범위 계약, 검증, 아카이브 가능한 기억을 README에 드러냈습니다.
- 다음 개선 방향으로 첫 실행 점검, CLI/RAG 재각인 신호, active ticket/phase/open ticket count/DeukAgentContext memory status를 보여주는 companion 표면을 명시했습니다.

## [3.3.0] - 2026-05-02

### 추가됨 (Added)

- **docs:** VS Code, Open VSX, GitHub, skill 기반 발견 루프를 포함한 AI 코딩 에이전트 가드레일 포지셔닝, 비전, 오가닉 유입 리서치 문서를 추가했습니다.
- **docs:** Karpathy식 skill, DeukAgentFlow, DeukAgentContext 심층 비교 문서를 추가했습니다. Skill은 행동 playbook, DeukAgentFlow는 workflow/permission control, DeukAgentContext는 ticketed engineering memory로 포지셔닝했습니다.
- **seo:** `andrej-karpathy-skills` 관련 아이디어 링크와 Claude Code, AGENTS.md, Cursor rules, agent skills, AI guardrails 검색 유입 키워드를 보강했습니다.

### 변경됨 (Changed)

- **ticket:** 열린 티켓이 설정된 한도를 넘을 때 자동 정리 대신 사용자가 목록을 보고 결정할 수 있는 cleanup flow를 강화했습니다.
- **ticket:** 닫힌 티켓은 자동 아카이브할 수 있게 하고, 아카이브된 티켓은 년월 단위 버킷으로 정리되도록 했습니다.
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
- **scripts:** Public 미러 저장소 동기화 시 잘못 표기되던 URL 예시 로그 메시지 정정

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
- **ticket:** DeukAgentFlow 현재 진행 중인 티켓 안 나오던 문제 해결

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
## [4.0.19] - 2026-05-08

### 수정됨 (Fixed)

- **publish:** init 시 레거시 DeukAgentRules 포인터가 새 DeukAgentFlow managed block 옆에 남지 않도록 generated spoke 교체 경로를 복구했습니다.
- **telemetry:** release 검증의 architecture guard를 통과하도록 client label 정규화를 공용 `toSlug` 유틸로 통일했습니다.

### 변경됨 (Changed)

- **docs:** 영문/한글 메인테이너 배포 섹션을 dual-package npm 배포 흐름과 통합 다운로드 배지 설명 기준으로 맞췄습니다.

## [4.0.18] - 2026-05-08

### 수정됨 (Fixed)

- **skills:** `init` 정리 단계가 `.deuk-agent/skills.json`과 `usage.json`을 오배치 파일로 이동시키던 회귀를 막고, 실제 Claude/Cursor 노출 파일도 `skill list`에 반영하도록 보강
- **telemetry:** 모델/클라이언트 표기를 정규화해 대소문자·공백 차이로 분석 결과가 분산되던 문제 수정
- **ticket:** active ticket 동기화가 가장 최근 open ticket 대신 오래된 open ticket을 유지해 `ticket continue`가 잘못된 티켓을 가리키던 문제 수정
