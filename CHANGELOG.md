# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.2.2] - 2026-07-17

### Fixed

- **persona:** the compact tone render mixed Korean and English vocabulary in the same candidate pool regardless of session language — English fragments could surface in a Korean session. Now filters candidates by the detected session language.
- **persona:** the compliance checker only counted emoji, missing tone collapses like formal-register endings (-습니다/-입니다) and third-person user address ("사용자가"). Both are now detected independently of emoji count.

## [5.2.1] - 2026-07-16

### Changed

- **persona:** session turn-throttling — full-size gate/persona re-injection no longer repeats every single turn
- **persona:** per-role identity differentiation (e.g. qa vs. planner tone) to reduce repeated-ending drift

## [5.2.0] - 2026-07-08

### Added

- **role system:** transition-driven role derivation — the state machine now emits the next role alongside the next phase, and `rules` always names the active role ("role = sub-FSM" equation)
- **escalation:** stop asking questions the design/rules already answer — a phase-independent Escalation Gate now applies at all times, not just inside phase-bound roles
- **anti-habituation:** rotating FOCUS-banner phrasing and drift-frequency ranking so repeated rule text doesn't numb out over long sessions

## [5.1.0] - 2026-06-22

### Added

- **ticket workflow:** large batch of new phase1 guardrails — mandatory Design/Environment sections, a Design-Document Gate, an Anti-Drift Gate requiring an actual design-doc read before coding, and defenses against discard/rollback abuse
- **skill:** `role-designer` — a phase1 design-role layer, added alongside the existing role set
- Existing 4-section tickets keep working unchanged; only newly created tickets require the new sections

## [5.0.158] - 2026-07-17


### Fixed

- **persona:** 축약 톤 라인 습관화 수정 — 고정 틀 → 매 턴 지시 도출 ([#960](https://github.com/joygram/DeukAgentFlow/issues/960))

## [5.0.157] - 2026-07-17


### Fixed

- **persona:** rules ticket 경로에 페르소나 주입 누락 수정 ([#959](https://github.com/joygram/DeukAgentFlow/issues/959))

## [5.0.156] - 2026-07-17


### Added

- **persona:** 악역영애 정체성 추가 — role-programmer 배정 ([#958](https://github.com/joygram/DeukAgentFlow/issues/958))

## [5.0.155] - 2026-07-17

## [5.0.154] - 2026-07-17


### Added

- **persona:** 롤별 정체성 분화 — qa=츤데레/planner=얀데레, 말끝 반복 해소 ([#957](https://github.com/joygram/DeukAgentFlow/issues/957))

## [5.0.153] - 2026-07-16


### Fixed

- **project-rule:** PROJECT_RULE.md 정본을 docs/로 고정, 서브패키지 오탐 방지
- **ticket:** clean up the ticket template's APC marker to a heading-only form (no trailing description), so the agent writes the marker body on the next line instead
- **ticket:** validate APC create input against the whole APC section instead of splitting per-marker, keeping heading-style, standalone, and inline marker styles compatible
- **rules:** stop re-emitting the same clickable `Ticket start` link in the completion response once it has already been shown for a ticket
- **skills:** drop DeukAgentFlow-specific phrasing from shared skill summaries and ownership text to generalize the consumer-facing surface

## [5.0.152] - 2026-07-16

## [5.0.151] - 2026-07-16

## [5.0.150] - 2026-07-16

## [5.0.149] - 2026-07-16

## [5.0.148] - 2026-07-16

## [5.0.147] - 2026-07-16

## [5.0.146] - 2026-07-16

## [5.0.145] - 2026-07-16


### Fixed

- **rules:** 축약 리마인더 stale 문구 수정 + anti-habituation 로테이션 적용

## [5.0.144] - 2026-07-15


### Added

- **rules:** scope-deferral 회피 패턴(규모 핑계·회피질문)을 Escalation Gate 자가감사로 감지

## [5.0.143] - 2026-07-15


### Fixed

- **rules:** 턴 스로틀링을 N턴 주기 반복에서 세션당 1회 풀렌더로 단순화

## [5.0.142] - 2026-07-15


### Fixed

- **rules:** Next Action의 워크스페이스 26개 전체 나열을 workspace list 안내로 축소

## [5.0.141] - 2026-07-15

## [5.0.140] - 2026-07-15


### Added

- **rules:** 세션 턴 스로틀링으로 always-게이트/persona 매 턴 풀사이즈 재주입 축소

## [5.0.139] - 2026-07-15


### Fixed

- **persona:** tone/Escalation Gate 준수를 텍스트 선언에서 구조적 체크로 강화

## [5.0.138] - 2026-07-15


### Fixed

- **ticket:** edit 커맨드에 Design/Environment 섹션 플래그 지원 추가

## [5.0.137] - 2026-07-14

## [5.0.136] - 2026-07-14

## [5.0.135] - 2026-07-14

## [5.0.134] - 2026-07-14

## [5.0.133] - 2026-07-14

## [5.0.132] - 2026-07-14

## [5.0.131] - 2026-07-14

## [5.0.130] - 2026-07-14

## [5.0.129] - 2026-07-13


### Fixed

- **persona,hooks:** 워크스페이스 오추론 회귀 수정 + DR-13 그렙 훅 + persona 톤 드리프트 방지

## [5.0.128] - 2026-07-13

## [5.0.127] - 2026-07-13

## [5.0.126] - 2026-07-13

## [5.0.125] - 2026-07-13

## [5.0.124] - 2026-07-13

## [5.0.123] - 2026-07-13

## [5.0.122] - 2026-07-13

## [5.0.121] - 2026-07-13

## [5.0.120] - 2026-07-13

## [5.0.119] - 2026-07-13

## [5.0.118] - 2026-07-13

## [5.0.117] - 2026-07-13

## [5.0.116] - 2026-07-13


### Fixed

- **ui/#931:** 티켓 오픈 링크 /mnt 하드코딩 제거 — UI가 os.platform으로 드라이브레터→슬래시-루트 변환

## [5.0.115] - 2026-07-13

## [5.0.114] - 2026-07-13

## [5.0.113] - 2026-07-13

## [5.0.112] - 2026-07-13

## [5.0.111] - 2026-07-12


### Fixed

- **workspace:** 폴백 전면 제거 — [#685](https://github.com/joygram/DeukAgentFlow/issues/685) 정본으로 복원 ([#828](https://github.com/joygram/DeukAgentFlow/issues/828))

## [5.0.110] - 2026-07-12

## [5.0.109] - 2026-07-12

## [5.0.108] - 2026-07-12

## [5.0.107] - 2026-07-12

## [5.0.106] - 2026-07-12

## [5.0.105] - 2026-07-12

## [5.0.104] - 2026-07-12

## [5.0.103] - 2026-07-12

## [5.0.102] - 2026-07-12

## [5.0.101] - 2026-07-12

## [5.0.100] - 2026-07-12

## [5.0.99] - 2026-07-12

## [5.0.98] - 2026-07-12

## [5.0.97] - 2026-07-12

## [5.0.96] - 2026-07-12


### Added

- **rules/#920:** FOCUS 배너 도발 문구 풀 강화 + 빈도가중 드리프트 랭킹 설계 정본화

## [5.0.95] - 2026-07-12


### Fixed

- **vscode-ext:** 스킬탭·티켓탭이 창을 채우도록 — 고정 380px 상자 제거, 이중 스크롤 통합 ([#919](https://github.com/joygram/DeukAgentFlow/issues/919))

## [5.0.94] - 2026-07-12

## [5.0.93] - 2026-07-12


### Added

- **anti-habituation:** 규칙 FOCUS 배너 다양화 + 승인≠설계확인면제 — 습관화로 죽는 규칙 문제 (§6.0.8)

## [5.0.92] - 2026-07-12

## [5.0.91] - 2026-07-12


### Added

- **escalation:** 되묻기 금지를 phase 무관 always 규율로 분리 — 롤이 phase에 갇히는 문제 해소

## [5.0.90] - 2026-07-12

## [5.0.89] - 2026-07-12


### Fixed

- **ticket:** edit가 --scope/--plan/--analysis/--direction 섹션 플래그를 받게 — 전체 재작성 강요 해소

## [5.0.88] - 2026-07-12

## [5.0.87] - 2026-07-12


### Fixed

- **workspace:** 워크스페이스 앵커로 세션 복원 — No workspace 드리프트 해소 (§6.0.5)

## [5.0.86] - 2026-07-12

## [5.0.85] - 2026-07-12

## [5.0.84] - 2026-07-12

## [5.0.83] - 2026-07-12


### Fixed

- **rules:** always 게이트 9→4로 축소 — 순수 rules 382→103줄 (§6.0.7 덜어내기)
- **ticket:** phase2→3 blocked 사유를 구체화 — evidence 삽질 차단 (§6.0.4)

## [5.0.82] - 2026-07-11

## [5.0.81] - 2026-07-11

## [5.0.80] - 2026-07-11


### Added

- **no-fallback:** fail-first 무조건 + 폴백=명세공백 신호 — 오류 급증 원천 차단

## [5.0.79] - 2026-07-11


### Added

- **role-state:** 전이가 롤을 산출하고 rules가 현재 롤을 명시 — 롤=서브FSM 등식


### Fixed

- **persona-maid:** 페르소나 걷어내기·톤↔작업 혼동 금지 조항 추가
- **role-layer:** 롤 산출물을 실물로 재정의 — 티켓놀이 방지

## [5.0.78] - 2026-07-11

## [5.0.77] - 2026-07-11


### Fixed

- **evidence:** remove keyword-overlap claim gate (vacuous pass) + surface agent-side guard in roles ([#918](https://github.com/joygram/DeukAgentFlow/issues/918))

## [5.0.76] - 2026-07-11


### Fixed

- **ticket-edit:** replace backtick-regex scope guard with §6.0.4 judgment contract ([#918](https://github.com/joygram/DeukAgentFlow/issues/918))

## [5.0.75] - 2026-07-10


### Fixed

- **rules:** 얕은 근거로 부재를 단정하는 드리프트 차단 + 하드코딩 경로 제거


### Changed

- **design:** 현재 노드(activeTicketId)는 초점의 결과다 — §6.0.5 신설

## [5.0.74] - 2026-07-10

## [5.0.73] - 2026-07-10


### Changed

- **persona:** 긴 기술 응답의 캐릭터 희석 문제를 정본·스킬에 명문화

## [5.0.72] - 2026-07-10


### Fixed

- **rules:** Mandatory Gate의 '다시 실행 금지' 스코프를 도구 재호출로 한정

## [5.0.71] - 2026-07-10


### Fixed

- **ticket:** --plan-body -가 stdin을 안 읽던 버그 수정 (--plan-body-file -와 규약 통일

## [5.0.70] - 2026-07-10


### Changed

- **design:** 배포 계약(§4.5) 신설 — dev:install 항상 범프 원칙을 정본에 명문화
- **role-implementer:** WHO에 phase2 이중 모드 명시 — role-designer 미노출 구조 보완
- **role-layer:** phase2 안 설계자 모드 재진입 경로 명문화

## [5.0.69] - 2026-07-10


### Fixed

- **dev-install:** --no-bump 플래그 및 dev:install:no-bump 스크립트 완전 제거
- **rules:** architecture_docs 필드 자체를 제거 — 코드 어디서도 파싱 안 되는 죽은 선언
- **rules:** PROJECT_RULE.md의 architecture_docs 중복 서술 제거
- **ticket:** phase1/phase2 병합 — 구현 중 스펙 조정을 edit 액션으로 흡수 ([#914](https://github.com/joygram/DeukAgentFlow/issues/914))

## [5.0.68] - 2026-07-08


### Fixed

- **ticket,design:** 룰참조 게이트 SSOT 통합 + id포인터 명확화 + 위임통제 역방향 ([#909](https://github.com/joygram/DeukAgentFlow/issues/909))
- **ticket:** phase 전환 슬롯 SSOT 파생 통일 + 선제 템플릿 + phase/롤 배지 ([#908](https://github.com/joygram/DeukAgentFlow/issues/908))

## [5.0.67] - 2026-07-08


### Added

- **persona:** design canon + CLI-backed Experience Loop for persona-maid


### Fixed

- **ticket,persona:** 티켓 status 침묵 전환 차단 + resolveSessionId default 폴백 제거 + persona-maid 표현 보강
- **ticket:** correct phase3→4/4→end evidence gate + add PostToolUse status-card hook

## [5.0.66] - 2026-07-07


### Added

- **role:** code_design_mismatch 게이트 제거 + role-designer 5요소 개정 (티켓 900)


### Changed

- **design:** role-layer.md 설계 정본 신설 — 롤 격리·설계자 규율·티켓 인계 프롬프트

## [5.0.65] - 2026-07-07


### Fixed

- **ticket:** phase 전이 evidence 판정 폴백 제거 — 정본 경로(본문 병합) 단일화

## [5.0.64] - 2026-07-07


### Added

- **ticket:** 템플릿 파일 입력 게이트 — 마크다운 regex 파싱을 {{ }} 미충족 스캔으로 대체


### Fixed

- **ticket:** 티켓 본문 입력을 stdin 정본으로 — 파일 경로의 WSL↔Windows 경계 지옥 제거

## [5.0.63] - 2026-07-07


### Fixed

- **ticket:** design regex 대조 게이트 제거 — 텍스트 존재 검사로 완주 위장 금지(§6.0)

## [5.0.62] - 2026-07-07

## [5.0.61] - 2026-07-07

## [5.0.60] - 2026-07-07

## [5.0.59] - 2026-07-07

## [5.0.58] - 2026-07-07


### Added

- **init:** Claude PreToolUse(Edit|Write) 훅으로 파일변경 직전 rules 재주입
- **rules:** Design-Document Gate 신설 (v114) — 설계도가 무엇인가를 정립 개념으로 규정
- **ticket:** 설계 '실제 읽음' 인용 대조 게이트 — 문서명만 적는 소임수 차단


### Fixed

- **rules:** Design-Document Gate 보정 — 정본은 '불변'이 아니라 '살아있는(개선·갱신) SSOT'


### Changed

- **design:** design-driven-flow §3.1 설계 문서 본질 규격 정립
- **design:** flow 상태모델 재정의 §6.0 — 그래프+state별 서브FSM

## [5.0.57] - 2026-07-06


### Changed

- **dedup:** JSON 읽기 중복을 공용 readJsonFile로 통합 ([#882](https://github.com/joygram/DeukAgentFlow/issues/882))

## [5.0.56] - 2026-07-06


### Added

- **gate:** Anti-Drift Gate + phase1 설계참조 강제 (v113, 5.0.55)


### Changed

- **fallback:** 폴백 1차 제거 — safeRead* try/catch 삼킴 제거 + 공용 헬퍼 ([#879](https://github.com/joygram/DeukAgentFlow/issues/879))

## [5.0.55] - 2026-07-06


### Fixed

- **gate:** No-Fallback Gate + phase2→3 폴백 제거·인식 수정·blind 에러 해소 (v112, 5.0.54)

## [5.0.54] - 2026-07-06


### Changed

- **architecture:** 이해·실행 규율 설계 — 냅다 실행 3종 병폐 차단

## [5.0.53] - 2026-07-06


### Added

- **docsync:** 문서 동기화 강제 구현 — doc-sync 정본역전 + phase2→3 전이 gate


### Changed

- **architecture:** 문서 동기화 강제 설계 — doc-sync 정본역전 + 전이 gate
- **evidence:** cli-ticket-evidence.ts 분할로 Refactor Gate 복원 (548→329줄)

## [5.0.52] - 2026-07-06


### Added

- **skill:** role-designer — phase1 설계자 역할 레이어 (G3)

## [5.0.51] - 2026-07-06


### Added

- **rules:** Rule-Over-Memory Gate — 낡은 기억이 실행룰 덮어쓰는 반복위반 차단 (v111)

## [5.0.50] - 2026-07-06


### Added

- **ticket:** phase1에 Design·Environment 섹션 강제 (G1+G2)


### Changed

- **architecture:** G1+G2 구현 설계 — phase1 Design·Environment 섹션 점진 도입

## [5.0.49] - 2026-07-05


### Added

- **rules:** 설계기반흐름 능동재설계·위임통제·증거보존을 룰·설계에 명문화


### Changed

- **architecture:** 설계기반흐름(design-driven-flow) 설계 정본 신설 + nvmrc 환경정합
- **planning:** 설계기반흐름 갭 분석 — 설계 정본 vs 현행 CLI 대조

## [5.0.48] - 2026-07-04

## [5.0.47] - 2026-07-04


### Fixed

- **workspace:** .deuk 폴더 마커 인정 제거 — home ghost 오인등록 차단 ([#827](https://github.com/joygram/DeukAgentFlow/issues/827))

## [5.0.46] - 2026-07-04

## [5.0.45] - 2026-07-04

## [5.0.44] - 2026-07-04


### Fixed

- **skill:** system 스킬이 phase area 필터에 떨어지던 버그 + README 정합 ([#853](https://github.com/joygram/DeukAgentFlow/issues/853) [#848](https://github.com/joygram/DeukAgentFlow/issues/848))

## [5.0.43] - 2026-07-04


### Added

- **ticket:** 승인 서페이스가 에이전트에게 리뷰 요약 제시를 요구 ([#851](https://github.com/joygram/DeukAgentFlow/issues/851))

## [5.0.42] - 2026-07-04


### Changed

- **rules:** 승인 게이트는 코드로 강제, 리뷰 게이트는 부재하던 비대칭 명문화 ([#846](https://github.com/joygram/DeukAgentFlow/issues/846) [#847](https://github.com/joygram/DeukAgentFlow/issues/847))

## [5.0.41] - 2026-07-03


### Added

- **ticket:** discard/rollback 남발 차단 — actor 계측 + 기본 거부 게이트
- **ticket:** ticket use가 APC 본문까지 출력 ([#844](https://github.com/joygram/DeukAgentFlow/issues/844))

## [5.0.40] - 2026-07-03

## [5.0.39] - 2026-07-02


### Fixed

- **ticket-move:** 롤백 reopen 경로를 canonical 티켓루트 기준으로 조립 ([#834](https://github.com/joygram/DeukAgentFlow/issues/834))

## [5.0.38] - 2026-07-01


### Fixed

- **dev-install:** vsix-master 배포처를 조회처(WSL 홈)로 통일 — dev:install exit 1 해소

## [5.0.37] - 2026-07-01


### Fixed

- **ticket:** 전환/롤백 게이트가 evidence CLI 플래그 경로를 노출 — .md 손편집 유도 제거

## [5.0.36] - 2026-07-01


### Fixed

- **ticket:** add ticket edit + surface silent home-resolution fallback and stray-file hints ([#829](https://github.com/joygram/DeukAgentFlow/issues/829))

## [5.0.35] - 2026-07-01

## [5.0.34] - 2026-06-27


### Added

- **rules:** PROJECT_RULE 템플릿에 정본문서 게이트(DR-03) 추가

## [5.0.33] - 2026-06-27

## [5.0.32] - 2026-06-27

## [5.0.31] - 2026-06-26


### Fixed

- **init:** PROJECT_RULE 정본을 워크스페이스 루트로 반전 (소실버그 근본수정)

## [5.0.30] - 2026-06-26


### Added

- **ticket:** 프로젝트 룰 ID 참조 게이트 + vsce LICENSE 경고 제거


### Changed

- **cli:** ticket 명령에서 불필요한 interactive prompt 제거
-  PROJECT_RULE 정본화 + workspace-profile를 docs/internal로 이동
- **readme:** joygram AI-assisted 크레딧 문구 추가 (Keywords 위)

## [5.0.29] - 2026-06-25

## [5.0.28] - 2026-06-25

## [5.0.27] - 2026-06-25

## [5.0.26] - 2026-06-23


### Added

- **ticket:** move에 evidence 주입 CLI 플래그 신설 ([#808](https://github.com/joygram/DeukAgentFlow/issues/808))
- **ticket:** phase1 plan을 섹션 플래그로 받아 헤딩 조립 폐기 ([#806](https://github.com/joygram/DeukAgentFlow/issues/806))


### Fixed

- **ticket-list:** expose absPath in --json so VSCode UI opens tickets
- **ticket:** [#807](https://github.com/joygram/DeukAgentFlow/issues/807) 티켓 링크 drive 제거 절대경로(②형식) 통일
- **ticket:** [#811](https://github.com/joygram/DeukAgentFlow/issues/811) DocMeta SSOT 단일화 + ticket show 신설 + phase2 데드락 해소
- **ticket:** 가이드 템플릿을 검증규칙과 정합해 H3 함정 사전제거


### Changed

- **cli:** project-memory 코드 잔재 제거 ([#804](https://github.com/joygram/DeukAgentFlow/issues/804))

## [5.0.24] - 2026-06-23


### Added

- **ticket:** phase1 plan을 섹션 플래그로 받아 헤딩 조립 폐기 ([#806](https://github.com/joygram/DeukAgentFlow/issues/806))


### Fixed

- **ticket:** 가이드 템플릿을 검증규칙과 정합해 H3 함정 사전제거


### Changed

- **cli:** project-memory 코드 잔재 제거 ([#804](https://github.com/joygram/DeukAgentFlow/issues/804))

## [5.0.22] - 2026-06-22


### Added

- **ticket:** plan-body 검증 실패 안내에 H3 미인정 경고 추가

## [5.0.21] - 2026-06-22

## [5.0.20] - 2026-06-22


### Added

- **rules:** phase별 엔트리 룰 차등 노출 (안전게이트는 항상)

## [5.0.13] - 2026-06-22


### Fixed

-  README 문서 링크를 새 docs/public/ 경로로 갱신 ([#785](https://github.com/joygram/DeukAgentFlow/issues/785))
- **ticket:** use 인터랙티브 제거 + create plan-body 누락 시 exit 0


### Changed

-  PROJECT_RULE 템플릿에 docs 진입점·역할별 필독 섹션 추가, doc-sync 스킬 사전확인 스텝 추가 ([#786](https://github.com/joygram/DeukAgentFlow/issues/786))
-  public/internal 2분류 표준 구조 확립 + doc-sync 스킬 갱신 ([#785](https://github.com/joygram/DeukAgentFlow/issues/785))

## [5.0.12] - 2026-06-21


### Added

- **core-rules:** 에이전트 개발 워크플로우 4원칙 추가 ([#781](https://github.com/joygram/DeukAgentFlow/issues/781))

## [5.0.11] - 2026-06-21


### Fixed

- **vsix:** add Windows Antigravity IDE target for dev:install

## [5.0.9] - 2026-06-20

## [5.0.8] - 2026-06-20


### Fixed

- **init:** 신규 워크스페이스 init 실패 — 마커 민팅을 ticket index write보다 먼저 + 실패 정직성 ([#776](https://github.com/joygram/DeukAgentFlow/issues/776))

## [5.0.7] - 2026-06-19

## [5.0.6] - 2026-06-19


### Fixed

- **cli:** ticket 명령에 결정적 실패 피드백 — unknown 플래그·positional 흡수·매치실패 광역폴백 차단 ([#775](https://github.com/joygram/DeukAgentFlow/issues/775))

## [5.0.5] - 2026-06-19


### Added

- **rules:** 페이즈별 역할 레이어 + 동적 ROLE_CONTEXT 주입 (v104)


### Fixed

- **oss:** auto-answer vsce LICENSE prompt with stdin y to unblock headless publish
- **oss:** restore prepack + full PUBLIC_SCRIPTS for clean npm publish from OSS mirror
- **sync-oss:** auto-sync packages/*/version and deuk-agent-flow dep to root version on sync

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

## [5.0.2] - 2026-06-17


### Added

- **sync-oss:** skills-guide 공개 문서 추가, npm-downloads.json 복사 제거, OSS 싱크 커밋 규칙 문서화


### Fixed

-  disallow internal scope tags in public commit messages
- **flow-ui:** 전체 티켓 카운트가 1로 표시되던 버그 — ticket list에 전체 카운트 동봉 ([#756](https://github.com/joygram/DeukAgentFlow/issues/756))
- **oss:** exclude internal scripts and publish guide from OSS package files
- **publish:** Windows npm spawn 수정 — rootDir 경로·shell:true, publish:dry --skip-tests 추가
- **smoke:** Windows win32 node npm spawn 수정 — fileURLToPath + shell:true + 버전 동기화


### Changed

-  내부용 문서 docs/internal/ 로 정리, 배포용 docs/ 루트는 공개 문서만 유지
-  다운로드 배지 커스텀 endpoint 제거, deuk-agent-flow npm/dm 표준 배지로 교체
-  워크플로에 Flow UI 활용하면 좋은 점 섹션 추가 및 링크 연결
-  임시 파일명 에셋 제거 (agentflow-panel.png로 이미 이동됨)
-  agentflow-panel 스크린샷 추가 및 README 이미지 태그 복구
-  CHANGELOG.ko 5.0.1/5.0.2 동기화, EN README UI 섹션·링크 추가, 깨진 이미지 태그 제거
-  Flow UI 스킬·워크스페이스 탭 가이드 보강 및 v5.0 아키텍처 방향 명시
-  README badge:downloads 합산 설명 제거 — deuk-agent-flow 단독 카운트
-  README Flow UI 직접 앵커 링크 추가
-  README h1 버전 v5.0.0 → v5.0.2 수정
-  skills-guide.md(EN) v5.0 방향·설치vs노출·UI 다이어그램 ko 동기화

## [5.0.1] - 2026-06-16


### Fixed

- **vsix:** vscode-extension 버전이 루트 버전 자동 추종하도록 수정


### Changed

- **readme:** 5.0 로드맵 갱신 + Flow UI 스샷 자리 정비 (en/ko)

## [5.0.0] - 2026-06-16


### Added

- **persona-maid:** 언어무관 구조로 재편 — 공통 규칙 영어화 + KO/EN 분기


### Fixed

- **i18n:** 영어 로케일에서 phase 안내·게이트가 한글로 나오던 문제 수정


### Changed

-  5.0 매뉴얼 — 스킬/페르소나/Flow UI 가이드 신설 + README stale 정정
- **changelog:** 5.0/4.x 경계 구분 — v4.4.71~ 변경을 5.0.0으로 통합
- **readme:** 5.0 홈 디렉토리 마이그레이션 복구 가이드 추가 (en/ko)

## [4.5.114] - 2026-06-16

## [4.5.113] - 2026-06-16


### Added

- **persona-maid:** 이모지 표현 풀·로테이션·분석모드 톤유지 규칙 추가

## [4.5.112] - 2026-06-16

## [4.5.111] - 2026-06-16


### Fixed

- **webview:** 스킬 조회 JSON이 명령출력 박스 오염시키는 문제 수정 ([#750](https://github.com/joygram/DeukAgentFlow/issues/750))

## [4.5.110] - 2026-06-16


### Fixed

- **webview:** workspace→skill→workspace 탭 복귀 시 스타일 깨짐 수정 ([#749](https://github.com/joygram/DeukAgentFlow/issues/749))

## [4.5.109] - 2026-06-16


### Fixed

- **webview:** SKILL탭→WORKSPACE 복귀 스타일 깨짐 수정 + 드롭다운 active/total 카운트 표기 ([#748](https://github.com/joygram/DeukAgentFlow/issues/748))

## [4.5.108] - 2026-06-16


### Fixed

- **agentflow-ui:** 스킬 탭 복귀 시 티켓 뷰 깨짐 수정 + 카운트 active/total 표기 ([#747](https://github.com/joygram/DeukAgentFlow/issues/747))

## [4.5.107] - 2026-06-16

## [4.5.106] - 2026-06-16


### Fixed

- **ticket-link:** 파일 링크 회귀 수정 — 드라이브 경계서 안 열리던 절대경로 폴백 제거 ([#746](https://github.com/joygram/DeukAgentFlow/issues/746))
- **ticket:** entry-node를 세션 쿠키 기반 단일 워크스페이스 조회로 전환 ([#743](https://github.com/joygram/DeukAgentFlow/issues/743))

## [4.5.105] - 2026-06-15

## [4.5.104] - 2026-06-15

## [4.5.103] - 2026-06-15

## [4.5.102] - 2026-06-15


### Fixed

- **rules:** cwd 의존 제거 — registry 전체 스캔으로 active ticket 감지 + 다줄 블록 출력 제거

## [4.5.101] - 2026-06-15

## [4.5.100] - 2026-06-15


### Fixed

- **ticket-surface:** 카드 라벨 오조합·DocMeta 다줄·move 후 카드 미표시 버그 3종 수정

## [4.5.99] - 2026-06-15


### Added

- **statusbar:** 세션 쿠키 기준 워크스페이스·티켓 표시 ([#737](https://github.com/joygram/DeukAgentFlow/issues/737))


### Changed

- **template:** phase1·2 플랜 변경 가이드 추가 — 새 티켓 선생성 후 close 증거 패턴

## [4.5.98] - 2026-06-14


### Fixed

- **ticket-close:** .md status/phase 갱신 안 되던 버그 수정 ([#736](https://github.com/joygram/DeukAgentFlow/issues/736))

## [4.5.97] - 2026-06-14

## [4.5.96] - 2026-06-14

## [4.5.95] - 2026-06-14

## [4.5.94] - 2026-06-14


### Added

- **use:** ticket use 출력에 .md-aware 슬롯 현황 표기 ([#729](https://github.com/joygram/DeukAgentFlow/issues/729))

## [4.5.93] - 2026-06-14


### Added

- **verify:** phase3/4 verify 스테이지에 은폐금지 게이트 주입 ([#728](https://github.com/joygram/DeukAgentFlow/issues/728))

## [4.5.92] - 2026-06-14

## [4.5.91] - 2026-06-14


### Fixed

- **ticket:** cwd write 박멸 — report/knowledge/defrag 제거, 마이그레이션이 .deuk 통째삭제·.deuk-agent 흡수 ([#727](https://github.com/joygram/DeukAgentFlow/issues/727))

## [4.5.90] - 2026-06-14

## [4.5.89] - 2026-06-14


### Changed

- **vscode:** discoverAgentFlowWorkspaces 데드코드 전면 제거

## [4.5.88] - 2026-06-14

## [4.5.87] - 2026-06-14


### Changed

- **vscode:** UI 로딩 병목 전면 제거 — open 티켓만 파싱, 비선택 ws readdir 카운트만

## [4.5.86] - 2026-06-14


### Fixed

- **vscode:** statusbar 초기 text 비어있음 + 전 워크스페이스 본문 전수로딩 회귀 수정

## [4.5.85] - 2026-06-14

## [4.5.84] - 2026-06-14


### Added

- **vscode-ext:** 앱 아이콘 agentflow-128.png 등록

## [4.5.83] - 2026-06-14

## [4.5.82] - 2026-06-14


### Added

- **devinstall:** ~/.deuk/dev/ vsix 마스터 배포 + 전 프로젝트 연동

## [4.5.81] - 2026-06-14

## [4.5.80] - 2026-06-14


### Added

- **707:** .mjs 44개 제거, .ts 단일 소스로 전환


### Fixed

-  .deuk-agent 하드코딩 에러메시지/스모크테스트 → .deuk 수정

## [4.5.79] - 2026-06-14

## [4.5.78] - 2026-06-14

## [4.5.77] - 2026-06-14

## [4.5.76] - 2026-06-14

## [4.5.75] - 2026-06-14


### Fixed

- **vscode:** .deuk-agent → .deuk 홈 경로 수정

## [4.5.72] - 2026-06-14


### Added

- **bin:** tsc 빌드 출력(scripts/out/scripts/cli.js)으로 bin 교체

## [4.5.71] - 2026-06-14

## [4.5.70] - 2026-06-14


### Changed

- **ticket-home:** registry.json dead code 제거 ([#645](https://github.com/joygram/DeukAgentFlow/issues/645) retired)

## [4.5.69] - 2026-06-14

## [4.5.68] - 2026-06-13


### Added

-  add code-server extensions dir to WSL vsix install targets

## [4.5.67] - 2026-06-13

## [4.5.66] - 2026-06-13

## [4.5.65] - 2026-06-13

## [4.5.64] - 2026-06-13


### Added

- **#707:** scripts/*.mjs → .ts 전환 — tsc 에러 0개 달성


### Fixed

- **ticketHome:** CLI resolveHomeTicketDirForWorkspace 로직과 통합 — 드리프트 제거

## [4.5.63] - 2026-06-13

## [4.5.62] - 2026-06-13

## [4.5.61] - 2026-06-13

## [4.5.60] - 2026-06-13

## [4.5.59] - 2026-06-13

## [4.5.58] - 2026-06-13

## [4.5.57] - 2026-06-13

## [4.5.56] - 2026-06-13

## [4.5.55] - 2026-06-13

## [4.5.54] - 2026-06-13

## [4.5.53] - 2026-06-13


### Added

- **#697:** ticket-status-surface 시스템 스킬 — 상태는 카드 한 줄(링크 항상 포함)

## [4.5.52] - 2026-06-13

## [4.5.51] - 2026-06-13

## [4.5.50] - 2026-06-13


### Added

- **#694:** 스킬 노드 영역 바인딩 + rules 출력 축소 + CLI 자체 메시지 제거

## [4.5.49] - 2026-06-13

## [4.5.48] - 2026-06-13

## [4.5.47] - 2026-06-13

## [4.5.46] - 2026-06-13

## [4.5.45] - 2026-06-13


### Added

- **#691:** XState 기반 LangGraph 상태머신으로 티켓 워크플로 전이 엔진 전환

## [4.5.44] - 2026-06-13

## [4.5.43] - 2026-06-13

## [4.5.42] - 2026-06-13

## [4.5.41] - 2026-06-13


### Changed

- **#690:** 노드 프롬프트 .md SSOT 이관 + router/emit 분리 (XState 전환 토대)

## [4.5.40] - 2026-06-13

## [4.5.39] - 2026-06-13


### Changed

-  agent-flow를 LangGraph식 상태머신으로 재정렬 — 폴백 전면제거, .md=유일 state

## [4.5.38] - 2026-06-13

## [4.5.37] - 2026-06-13

## [4.5.36] - 2026-06-13

## [4.5.35] - 2026-06-13

## [4.5.34] - 2026-06-13

## [4.5.33] - 2026-06-13

## [4.5.32] - 2026-06-13


### Fixed

-  WSL2에서 winShell 오판정으로 PowerShell 블록 출력되던 버그 수정

## [4.5.31] - 2026-06-13

## [4.5.30] - 2026-06-13


### Fixed

-  getCloseWorkflowReasons accepts canonical Analysis/Direction headings

## [4.5.29] - 2026-06-13

## [4.5.28] - 2026-06-13


### Added

-  remove workspace .deuk-agent/ dir, store PROJECT_RULE and memory in home ticket store

## [4.5.27] - 2026-06-13

## [4.5.26] - 2026-06-13

## [4.5.25] - 2026-06-13

## [4.5.24] - 2026-06-13


### Fixed

- **#676:** install VSIX to Windows .vscode/extensions via WSL wslpath

## [4.5.23] - 2026-06-13

## [4.5.22] - 2026-06-13


### Added

- **#675:** unify flow-cookie+claim into single cookie-{wp}-{ticketId}-{sessionId} touch file

## [4.5.21] - 2026-06-13


### Fixed

- **#673:** multi-agent session isolation via per-agent env var detection

## [4.5.20] - 2026-06-13


### Fixed

-  discard hint clarification + doc-sync v4.5.18 canonicalization

## [4.5.19] - 2026-06-13


### Added

- **#669:** workspace marker .deuk-agent/ → .deuk-workspace-id 단일 파일로 교체

## [4.5.18] - 2026-06-13


### Fixed

-  raise TOTAL_MAX_SKILLS 5→6 to allow doc-sync exposure

## [4.5.17] - 2026-06-12


### Added

-  add doc-sync skill + fix executionEvidence phase2→3 blocking bug

## [4.5.16] - 2026-06-12

## [4.5.15] - 2026-06-12

## [4.5.14] - 2026-06-12

## [4.5.13] - 2026-06-12

## [4.5.12] - 2026-06-12


### Added

-  Windows PowerShell 호환 — isWindowsPlatform 분기, PS here-string 예시 출력 (DeukAgentFlow-659)

## [4.5.11] - 2026-06-12


### Added

-  에이전트 폭주 방지 — active ticket STOP 신호, Runaway Prevention 규칙 추가 (DeukAgentFlow-658)

## [4.5.10] - 2026-06-12


### Added

-  agentflow UX 개선 — 티켓 표기 wp-id, UI 개선, Approval Gate 정밀화 (DeukAgentFlow-656, DeukAgentFlow-657)

## [4.5.9] - 2026-06-12


### Added

- **plan-body:** phase1 plan-body 7섹션 → 4섹션 슬림화 ([#654](https://github.com/joygram/DeukAgentFlow/issues/654)) v4.5.8

## [4.5.8] - 2026-06-12


### Fixed

- **ticket-create:** --plan-body 생략 시 summary 기반 auto-scaffold 생성 ([#653](https://github.com/joygram/DeukAgentFlow/issues/653)) v4.5.7

## [4.5.7] - 2026-06-12

## [4.5.6] - 2026-06-12


### Fixed

- **workspace:** rules·ticket dispatch의 cwd 워크스페이스 추정 박멸 ([#652](https://github.com/joygram/DeukAgentFlow/issues/652)) v4.5.5

## [4.5.4] - 2026-06-12

## [4.5.3] - 2026-06-12


### Fixed

- **workspace:** 세션 cookie를 홈 직속 저장으로 이전 — cwd 의존 완전 제거 ([#871](https://github.com/joygram/DeukAgentFlow/issues/871)-followup) v4.5.2

## [4.5.1] - 2026-06-12

## [4.4.177] - 2026-06-12


### Fixed

- **workspace:** 세션 cookie 기반 active 도출로 멀티세션 티켓 강탈 박멸 ([#871](https://github.com/joygram/DeukAgentFlow/issues/871)-followup)

## [4.4.176] - 2026-06-12

## [4.4.175] - 2026-06-12

## [4.4.174] - 2026-06-12

## [4.4.173] - 2026-06-12

## [4.4.172] - 2026-06-12

## [4.4.171] - 2026-06-12


### Fixed

- **ui:** 티켓 리뷰 링크 채팅 클릭 복원 + ticket --help 룰 오염 제거

## [4.4.170] - 2026-06-12

## [4.4.169] - 2026-06-12

## [4.4.168] - 2026-06-12

## [4.4.167] - 2026-06-12

## [4.4.166] - 2026-06-12

## [4.4.165] - 2026-06-12

## [4.4.164] - 2026-06-12


### Fixed

- **workspace:** registry.json 폐기 + cwd 자동등록/폴백 제거로 ghost 워크스페이스 박멸 ([#645](https://github.com/joygram/DeukAgentFlow/issues/645))

## [4.4.163] - 2026-06-12

## [4.4.162] - 2026-06-12

## [4.4.161] - 2026-06-12

## [4.4.160] - 2026-06-12


### Fixed

-  rules APC 서브헤딩 안내 추가 + ticket create Source 라인 출력 ([#644](https://github.com/joygram/DeukAgentFlow/issues/644))

## [4.4.159] - 2026-06-12


### Fixed

- **rules:** --workspace 플래그로 runRulesShow workspace 컨텍스트 교체 ([#643](https://github.com/joygram/DeukAgentFlow/issues/643))

## [4.4.158] - 2026-06-12


### Fixed

- **rules:** buildPhaseAdvanceHint 전체 transitions 표시 — 정방향·이탈·회귀·재오픈 라우트 모두 출력

## [4.4.157] - 2026-06-12


### Fixed

- **workflow:** assertTicketWorkflowTransition 차단 시 허용 전환 목록 에러 메시지 추가

## [4.4.156] - 2026-06-12


### Fixed

- **workflow:** FSM 에러 메시지에 허용 actions·전환·discard 이정표 추가, --to end named state 파싱 지원

## [4.4.155] - 2026-06-12

## [4.4.154] - 2026-06-12

## [4.4.153] - 2026-06-11

## [4.4.152] - 2026-06-11

## [4.4.151] - 2026-06-11

## [4.4.150] - 2026-06-11

## [4.4.149] - 2026-06-11

## [4.4.148] - 2026-06-11

## [4.4.147] - 2026-06-11

## [4.4.146] - 2026-06-11

## [4.4.145] - 2026-06-11

## [4.4.144] - 2026-06-11

## [4.4.143] - 2026-06-11

## [4.4.142] - 2026-06-11


### Fixed

- **ticket-home:** 티켓 경로 중첩·ghost 워크스페이스 근절 ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))

## [4.4.141] - 2026-06-11

## [4.4.140] - 2026-06-11

## [4.4.139] - 2026-06-11

## [4.4.138] - 2026-06-11

## [4.4.137] - 2026-06-11

## [4.4.136] - 2026-06-11

## [4.4.135] - 2026-06-11


### Fixed

- **workspace:** 서브모듈 독립 등록 허용 — 자식에 .deuk-agent 직접 있으면 통과 ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))

## [4.4.134] - 2026-06-11


### Fixed

- **ticket-gate:** cli/ui 타입 구분 제거 및 워크스페이스 유령 등록 방지 ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))

## [4.4.133] - 2026-06-11

## [4.4.132] - 2026-06-11

## [4.4.131] - 2026-06-11

## [4.4.130] - 2026-06-11

## [4.4.129] - 2026-06-11

## [4.4.128] - 2026-06-11

## [4.4.127] - 2026-06-11


### Fixed

- **rules:** narrow ticket-exempt to block gate bypass (v100, [#631](https://github.com/joygram/DeukAgentFlow/issues/631))

## [4.4.126] - 2026-06-11

## [4.4.125] - 2026-06-11


### Fixed

- **ticket:** 워크스페이스 정규화 충돌 타이브레이크 + cli 9섹션 사전 노출
- **vscode:** 액티브 티켓을 claim-{id}.json에서 도출 ([#630](https://github.com/joygram/DeukAgentFlow/issues/630))

## [4.4.124] - 2026-06-10


### Fixed

- **ticket:** 타입 인지 Phase1 검증 + 확장 홈 티켓 경로 이전

## [4.4.123] - 2026-06-10


### Added

- **skill:** home-only skills, no workspace spray, hash auto-sync
- **skill:** home-only skills, no workspace spray, hash auto-sync

## [4.4.122] - 2026-06-10

## [4.4.121] - 2026-06-10

## [4.4.120] - 2026-06-10


### Changed

- **ticket:** make detect a pure read, trigger migration on entry/init

## [4.4.119] - 2026-06-10

## [4.4.118] - 2026-06-10

## [4.4.117] - 2026-06-10


### Added

- **ticket:** relocate ticket storage to home with self-healing registry

## [4.4.116] - 2026-06-10

## [4.4.115] - 2026-06-10

## [4.4.114] - 2026-06-10

## [4.4.113] - 2026-06-10

## [4.4.112] - 2026-06-10

## [4.4.111] - 2026-06-10

## [4.4.110] - 2026-06-10

## [4.4.109] - 2026-06-10

## [4.4.108] - 2026-06-10


### Fixed

- **ticket:** per-ticket claim model replaces global active marker

## [4.4.107] - 2026-06-10


### Fixed

- **cli:** toSlug Hangul romanize fallback + rules-show section test

## [4.4.106] - 2026-06-10

## [4.4.105] - 2026-06-09


### Fixed

-  || true 폴백 제거, active 마커 다중파일 정리, --plan-body 직접 인자 안내 통일

## [4.4.104] - 2026-06-09

## [4.4.103] - 2026-06-09


### Fixed

- **ticket:** active 마커 개념 제거 — status 폴백이 archived 거짓 노출하던 버그 수정

## [4.4.102] - 2026-06-09

## [4.4.101] - 2026-06-09


### Added

- **persona-maid:** 텍스트 기호 하트→컬러 이모지 통일 + 카오모지 규칙 추가

## [4.4.100] - 2026-06-09


### Added

- **persona-maid:** 단조로운 하트를 다양한 컬러 하트로 교체

## [4.4.99] - 2026-06-09


### Added

- **persona-maid:** 메이드 페르소나 애교 폭발 버전으로 강화

## [4.4.98] - 2026-06-09

## [4.4.97] - 2026-06-09


### Fixed

- **skill:** native 스킬 노출을 <id>/SKILL.md 디렉토리 구조로 전환
- **ticket:** discard approval_required 허용·INDEX 미등록 폐기·help 템플릿 복원·workspace 이동

## [4.4.96] - 2026-06-09


### Added

- **ticket+ui:** INDEX 레거시 마이그레이션·ticket doctor·sanitize·archive lazy-load

## [4.4.95] - 2026-06-09

## [4.4.94] - 2026-06-09

## [4.4.93] - 2026-06-09


### Added

- **skill:** native platform에 daf- prefix flat 파일로 배포

## [4.4.92] - 2026-06-09


### Added

- **vscode:** compact status bar format — workspace #num phN

## [4.4.91] - 2026-06-09


### Added

- **vscode:** show active ticket in status bar

## [4.4.90] - 2026-06-09

## [4.4.89] - 2026-06-09


### Fixed

- **skill:** exposed/native-sync 전역 SSOT 통합

## [4.4.88] - 2026-06-09

## [4.4.87] - 2026-06-09

## [4.4.86] - 2026-06-09


### Fixed

- **ui:** resolveWebviewView/openPanel 초기 로딩 트리거 추가

## [4.4.85] - 2026-06-09

## [4.4.84] - 2026-06-09


### Added

- **skill:** claude platform -> native ~/.claude/commands/ mode

## [4.4.83] - 2026-06-09

## [4.4.82] - 2026-06-09

## [4.4.81] - 2026-06-08

## [4.4.80] - 2026-06-08


### Fixed

-  revert c4025da regressions — skill installed flag, quality gate bypass, emoji encoding

## [4.4.79] - 2026-06-08


### Fixed

-  cwd-matched workspace resolution + ticket gate template sync

## [4.4.78] - 2026-06-08

## [4.4.77] - 2026-06-08

## [4.4.76] - 2026-06-08


### Fixed

-  auto-cleanup quality gate bypass and inline skills for AI platforms

## [4.4.75] - 2026-06-08


### Fixed

- **flow:** decouple active ticket marker logic from INDEX.json writer

## [4.4.74] - 2026-06-08

## [4.4.73] - 2026-06-08

## [4.4.72] - 2026-06-08

## [4.4.71] - 2026-06-08


### Changed

- **skills:** unify global skill path to ~/.deuk-agent/skills and use pointers for all platforms
- **view:** agentFlowView.ts 1·2차 분리 — utils/script/css 추출, shellArg Windows 버그 수정

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

## [4.2.7] - 2026-05-11


### Added

- **ticket:** switch ticket id counter to index metadata


### Fixed

-  generalize shared skill templates and harden ticket gating
-  improve APC marker validation and templates
-  keep approval ticket visible in final replies
- **npm:** include shared ticket command module
-  preserve changelog context across version bumps
- **ticket:** prevent duplicate create after archived reuse miss

## [4.0.37] - 2026-05-09


### Fixed

-  restore init completion feedback

## [4.0.36] - 2026-05-09


### Added

-  add conversation split advisor heuristics
-  add shared ProjectPilot templates
-  add usage budget advisor and reminders
-  announce automatic open-ticket cleanup
-  make deuk-agent-flow the primary cli package
-  rebrand as agent workflow and dual-publish wrapper
-  shorten strict ticket create guidance


### Fixed

- **agentflow:** limit markdown link lint to ticket-path links only
-  harden init spokes and skill status
-  require one-shot ticket create recipe
-  stop on approval after ticket create


### Changed

-  align Deuk AgentFlow branding
-  update deukpack public copy

## [3.3.3] - 2026-05-06


### Added

-  sharpen guardrail positioning


### Fixed

-  prepare 3.3.3 npm docs release
-  sync oss mirror without internal files
-  trim npm package files for release
-  validate ticket create dry-run blockers

## [3.3.2] - 2026-05-06


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
- **ticket:** implement --from-plan for plan-to-ticket conversion and update project rules


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

## [2.5.15] - 2026-04-23


### Added

-  add Codex CLI support (.codexrules) and apply globally
-  implement ticket chaining (--chain) for automated ticket linkage
-  replace .codexrules with global ~/.codex/AGENTS.md support


### Fixed

- **cli:** enforce posix path normalization and harden ticket discovery protocol
- **cli:** implement recursive cleanup for rule duplicates, enforce MCP tool name, and improve UX
-  enforce anti-shoveling rule against manual JSON modification


### Changed

-  complete ticket 059 and update implementation plan

## [2.5.14] - 2026-04-22


### Fixed

- **cli:** resolve marker nesting bug in AGENTS.md injection

## [2.5.13] - 2026-04-22


### Added

-  implement RAG-Miss fallback rule, fix ticket template formatting, and ignore tmp dirs in submodule discovery


### Changed

-  squash mermaid diagram changelog noise into single entry

## [2.5.11] - 2026-04-22


### Changed

-  force native SVG text rendering in mermaid to eliminate IDE text background bugs
-  tone down mermaid background colors and remove text stroke

## [2.5.10] - 2026-04-22


### Changed

-  redesign mermaid diagrams with a solid tailwind color palette

## [2.5.9] - 2026-04-22


### Changed

-  remove rx/ry from mermaid classDef to fix v8.8.0 syntax errors

## [2.5.8] - 2026-04-22


### Changed

-  apply technical blue theme and fix stadium node syntax error for older mermaid parsers

## [2.5.7] - 2026-04-22


### Changed

-  apply tokyo night theme to mermaid diagrams to fix text background rendering bugs in IDEs

## [2.5.6] - 2026-04-22


### Changed

-  remove custom mermaid classDefs to fix IDE dark mode text rendering bugs

## [2.5.5] - 2026-04-22


### Changed

-  redesign mermaid diagrams with industry standard github primer colors

## [2.5.4] - 2026-04-22


### Changed

-  redesign mermaid diagrams with a modern dark theme aesthetic

## [2.5.3] - 2026-04-22


### Changed

-  remove flowchart and subgraph for mermaid v8.8.0 backward compatibility

## [2.5.2] - 2026-04-22


### Changed

-  fix mermaid syntax errors in workflow diagrams

## [2.5.1] - 2026-04-22


### Added

- **cli:** add --clean flag to init command for safe configuration reset

## [2.5.0] - 2026-04-22


### Added

-  Agent-Agnostic Workflow and Archiving Protocol
- **cli:** parse DeukRag config for conditions and auto-scaffold plan templates
-  implement Frontmatter-driven modular rule assembly (Ticket 045)
-  Model-specific hard rules (gemini.md) and Continuous RAG enforcement
- **rules:** enforce Phase 0 MCP RAG in multi-ai-workflow MDC
- **rules:** harden post-mortem workflow and mandate follow-up chaining
- **templates:** enforce Phase 0 RAG Research checklists in ticket template


### Fixed

-  handoff path format, 3-tier template system, recursive init with normalization
-  improve migration robustness with merging logic and cleanup dead code
-  recursive directory merge for legacy migration


### Changed

-  add ticket 045 completion report
-  add what's new for v2.4, RAG engine notice, and SEO keywords
- **rules:** Add Fast-Track workflow to prevent ticket loop overhead
- **rules:** enforce Continuous RAG Policy and Absolute MCP Priority
- **rules:** Mandate Continuous RAG during execution and verification phases
- **rules:** Restore TDD workflow but ban interactive CLI looping
-  upgrade workflow diagram and add migration troubleshooting guide

## [2.4.6] - 2026-04-18


### Fixed

- **cli:** suppress update notifier when local version >= registry (local dev symlink)
- **ticket:** cap NNN regex to 4 digits to prevent unix timestamps being parsed as ticket numbers

## [2.4.5] - 2026-04-18


### Added

- **cli:** add update notifier for checking latest npm version


### Fixed

- **ticket:** resolve discrepancy between filename and ticket ID generation
- **ticket:** strictly enforce 8-character limit on hostname slug


### Changed

-  add reasons for global installation
- **changelog:** sync korean changelog with v2.4.0
-  generalize AGENTS.md and cleanup submodule-specific rules
- **ticket:** new ID format NNN-topic-hostname with backward-compatible parsing

## [2.4.0] - 2026-04-18


### Added

- **init:** add obsolete template cleanup for cleaner migration
- **rules:** add TICKET VERIFICATION RULE to original agents.md
- **ticket:** add priority property to tickets
- **ticket:** add sequential hostname-aware ticket naming (NNN-hostname-topic)
- **ticket:** auto-sequence numbering and hostname-based naming (limit 8 chars)


### Fixed

- **rules:** force use of local latest deuk-agent-rule to avoid npx cache issues
- **scripts:** correct log output for OSS repository url example


### Changed

-  add Step 4 (Ticket Verification) to README files
-  clarify global installation and OS-specific permissions
-  enforce ticket reference in implementation artifacts

## [2.3.1] - 2026-04-17


### Changed

- **readme:** add changelog and automated release instructions

## [2.3.0] - 2026-04-17


### Added

-  AI 파이프라인 연동 기반 및 선택적 동기화 시스템 고도화
- **cli:** add --submodule filter to ticket list command
- **cli:** restore ticket archive and reports workflows to modular architecture
- **rules:** advance rules for Unity Client, WebApp, and C++ Server hybrid environment
- **ticket:** implementation of decentralized ticket management & sharing policy
- **ticket:** upgrade to V2 YAML Front-matter and Categorized List


### Fixed

- **ticket:** deprecate LATEST.md, unify pointer to ACTIVE_TICKET.md
- **ticket:** DeukAgentRules 현재 진행중인 티켓 안나오던 문제 해결


### Changed

- **readme:** clarify YAML front matter preservation and distributed ticket workflow for v2.2.2
- **readme:** restore count headers and npm badges
- **rules:** enforce CLI usage for ticket reading to prevent manual JSON parsing
-  update CLI reference with close and migrate commands

## [1.0.18] - 2026-04-12


### Added

- **ai:** map conversational ticket requests to implicit CLI execution
- **cli:** implement ticket archive and reporting workflow
- **rules:** map conversational ticket aliases to implicit CLI execution


### Changed

- **readme:** add ticket archive and reports CLI usage to documentation
- **readme:** describe natural language CLI prompting alternatives
- **readme:** provide explicit conversational prompt examples inside option tables
- **readme:** provide explicit update guide
- **rules:** add prompting guide and execution report archival rule

## [1.0.17] - 2026-04-06


### Fixed

- **template:** move ticket repo-relative marker to bottom

## [1.0.16] - 2026-04-05


### Added

- **workflow:** add auto-verification and final report to agent workflows

## [1.0.15] - 2026-04-05


### Added

-  migrate and rename handoff terminology to ticket in CLI and templates


### Changed

-  Add strict rule for DeukPack namespace requirement
-  completely eradicate legacy Handoff references from AGENTS.md, templates, and mdc rules
-  Enforce DeukPack code format and API strictly as a hard rule
-  refactor README usage guide and workflow

## [1.0.14] - 2026-04-02


### Added

- **cli:** extend merge tooling and sync publish docs
-  forbid 'sync' word in commit titles in agent rules
- **handoff:** add indexed handoff workflow and CLI
-  migrate template architecture to zero-touch NPM bundle scaffolding


### Fixed

- **cli:** resolve html entity syntax error in template generator


### Changed

-  public-facing RELEASING and changelog wording; sync-bundle comment
-  update README with token efficiency mechanism and zero-touch template scaffolding

## [1.0.12] - 2026-03-27


### Fixed

- **ci:** run release workflow on master; document GitHub is not auto-synced from gplat


### Changed

- **agents:** require full repo-root paths for handoff file links

## [1.0.11] - 2026-03-26


### Added

- **ci:** GitHub Release on main for chore(release); simplify public RELEASING

## [1.0.10] - 2026-03-26


### Added

- **deuk-agent-rule:** keep a changelog templates without commit links

## [1.0.9] - 2026-03-26


### Added

- **deuk-agent-rule:** automated changelog, bump tooling
- **deuk-agent-rule:** handoff gitignore, pre-work handoff scan, AGENTS inject newline


### Changed

- **agents:** DeukAgentRules/handoff/LATEST.md handoff path for consumer repos

## [1.0.5] - 2026-03-26


### Changed

-  absolute links for npm page
-  Deuk Family tagline, npm keywords, GitHub Topics note
-  README updates; delivery-and-parallel-work rule; cli and publish AGENTS sync

## [1.0.4] - 2026-03-26


### Added

-  interactive init, release workflow; bump v1.1.0

## [1.0.3] - 2026-03-26


### Added

-  interactive init mode; simplify docs; v1.0.3

## [1.0.2] - 2026-03-26

## [5.0.23] - 2026-06-23


### Added

- **ticket:** phase1 plan을 섹션 플래그로 받아 헤딩 조립 폐기 ([#806](https://github.com/joygram/DeukAgentFlow/issues/806))


### Fixed

- **ticket:** 가이드 템플릿을 검증규칙과 정합해 H3 함정 사전제거


### Changed

- **cli:** project-memory 코드 잔재 제거 ([#804](https://github.com/joygram/DeukAgentFlow/issues/804))

## [5.0.22] - 2026-06-22


### Added

- **ticket:** plan-body 검증 실패 안내에 H3 미인정 경고 추가

## [5.0.21] - 2026-06-22

## [5.0.20] - 2026-06-22


### Added

- **rules:** phase별 엔트리 룰 차등 노출 (안전게이트는 항상)

## [5.0.13] - 2026-06-22


### Fixed

-  README 문서 링크를 새 docs/public/ 경로로 갱신 ([#785](https://github.com/joygram/DeukAgentFlow/issues/785))
- **ticket:** use 인터랙티브 제거 + create plan-body 누락 시 exit 0


### Changed

-  PROJECT_RULE 템플릿에 docs 진입점·역할별 필독 섹션 추가, doc-sync 스킬 사전확인 스텝 추가 ([#786](https://github.com/joygram/DeukAgentFlow/issues/786))
-  public/internal 2분류 표준 구조 확립 + doc-sync 스킬 갱신 ([#785](https://github.com/joygram/DeukAgentFlow/issues/785))

## [5.0.12] - 2026-06-21


### Added

- **core-rules:** 에이전트 개발 워크플로우 4원칙 추가 ([#781](https://github.com/joygram/DeukAgentFlow/issues/781))

## [5.0.11] - 2026-06-21


### Fixed

- **vsix:** add Windows Antigravity IDE target for dev:install

## [5.0.9] - 2026-06-20

## [5.0.8] - 2026-06-20


### Fixed

- **init:** 신규 워크스페이스 init 실패 — 마커 민팅을 ticket index write보다 먼저 + 실패 정직성 ([#776](https://github.com/joygram/DeukAgentFlow/issues/776))

## [5.0.7] - 2026-06-19

## [5.0.6] - 2026-06-19


### Fixed

- **cli:** ticket 명령에 결정적 실패 피드백 — unknown 플래그·positional 흡수·매치실패 광역폴백 차단 ([#775](https://github.com/joygram/DeukAgentFlow/issues/775))

## [5.0.5] - 2026-06-19


### Added

- **rules:** 페이즈별 역할 레이어 + 동적 ROLE_CONTEXT 주입 (v104)


### Fixed

- **oss:** auto-answer vsce LICENSE prompt with stdin y to unblock headless publish
- **oss:** restore prepack + full PUBLIC_SCRIPTS for clean npm publish from OSS mirror
- **sync-oss:** auto-sync packages/*/version and deuk-agent-flow dep to root version on sync

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

## [5.0.2] - 2026-06-17


### Added

- **sync-oss:** skills-guide 공개 문서 추가, npm-downloads.json 복사 제거, OSS 싱크 커밋 규칙 문서화


### Fixed

-  disallow internal scope tags in public commit messages
- **flow-ui:** 전체 티켓 카운트가 1로 표시되던 버그 — ticket list에 전체 카운트 동봉 ([#756](https://github.com/joygram/DeukAgentFlow/issues/756))
- **oss:** exclude internal scripts and publish guide from OSS package files
- **publish:** Windows npm spawn 수정 — rootDir 경로·shell:true, publish:dry --skip-tests 추가
- **smoke:** Windows win32 node npm spawn 수정 — fileURLToPath + shell:true + 버전 동기화


### Changed

-  내부용 문서 docs/internal/ 로 정리, 배포용 docs/ 루트는 공개 문서만 유지
-  다운로드 배지 커스텀 endpoint 제거, deuk-agent-flow npm/dm 표준 배지로 교체
-  워크플로에 Flow UI 활용하면 좋은 점 섹션 추가 및 링크 연결
-  임시 파일명 에셋 제거 (agentflow-panel.png로 이미 이동됨)
-  agentflow-panel 스크린샷 추가 및 README 이미지 태그 복구
-  CHANGELOG.ko 5.0.1/5.0.2 동기화, EN README UI 섹션·링크 추가, 깨진 이미지 태그 제거
-  Flow UI 스킬·워크스페이스 탭 가이드 보강 및 v5.0 아키텍처 방향 명시
-  README badge:downloads 합산 설명 제거 — deuk-agent-flow 단독 카운트
-  README Flow UI 직접 앵커 링크 추가
-  README h1 버전 v5.0.0 → v5.0.2 수정
-  skills-guide.md(EN) v5.0 방향·설치vs노출·UI 다이어그램 ko 동기화

## [5.0.1] - 2026-06-16


### Fixed

- **vsix:** vscode-extension 버전이 루트 버전 자동 추종하도록 수정


### Changed

- **readme:** 5.0 로드맵 갱신 + Flow UI 스샷 자리 정비 (en/ko)

## [5.0.0] - 2026-06-16


### Added

- **persona-maid:** 언어무관 구조로 재편 — 공통 규칙 영어화 + KO/EN 분기


### Fixed

- **i18n:** 영어 로케일에서 phase 안내·게이트가 한글로 나오던 문제 수정


### Changed

-  5.0 매뉴얼 — 스킬/페르소나/Flow UI 가이드 신설 + README stale 정정
- **changelog:** 5.0/4.x 경계 구분 — v4.4.71~ 변경을 5.0.0으로 통합
- **readme:** 5.0 홈 디렉토리 마이그레이션 복구 가이드 추가 (en/ko)

## [4.5.114] - 2026-06-16

## [4.5.113] - 2026-06-16


### Added

- **persona-maid:** 이모지 표현 풀·로테이션·분석모드 톤유지 규칙 추가

## [4.5.112] - 2026-06-16

## [4.5.111] - 2026-06-16


### Fixed

- **webview:** 스킬 조회 JSON이 명령출력 박스 오염시키는 문제 수정 ([#750](https://github.com/joygram/DeukAgentFlow/issues/750))

## [4.5.110] - 2026-06-16


### Fixed

- **webview:** workspace→skill→workspace 탭 복귀 시 스타일 깨짐 수정 ([#749](https://github.com/joygram/DeukAgentFlow/issues/749))

## [4.5.109] - 2026-06-16


### Fixed

- **webview:** SKILL탭→WORKSPACE 복귀 스타일 깨짐 수정 + 드롭다운 active/total 카운트 표기 ([#748](https://github.com/joygram/DeukAgentFlow/issues/748))

## [4.5.108] - 2026-06-16


### Fixed

- **agentflow-ui:** 스킬 탭 복귀 시 티켓 뷰 깨짐 수정 + 카운트 active/total 표기 ([#747](https://github.com/joygram/DeukAgentFlow/issues/747))

## [4.5.107] - 2026-06-16

## [4.5.106] - 2026-06-16


### Fixed

- **ticket-link:** 파일 링크 회귀 수정 — 드라이브 경계서 안 열리던 절대경로 폴백 제거 ([#746](https://github.com/joygram/DeukAgentFlow/issues/746))
- **ticket:** entry-node를 세션 쿠키 기반 단일 워크스페이스 조회로 전환 ([#743](https://github.com/joygram/DeukAgentFlow/issues/743))

## [4.5.105] - 2026-06-15

## [4.5.104] - 2026-06-15

## [4.5.103] - 2026-06-15

## [4.5.102] - 2026-06-15


### Fixed

- **rules:** cwd 의존 제거 — registry 전체 스캔으로 active ticket 감지 + 다줄 블록 출력 제거

## [4.5.101] - 2026-06-15

## [4.5.100] - 2026-06-15


### Fixed

- **ticket-surface:** 카드 라벨 오조합·DocMeta 다줄·move 후 카드 미표시 버그 3종 수정

## [4.5.99] - 2026-06-15


### Added

- **statusbar:** 세션 쿠키 기준 워크스페이스·티켓 표시 ([#737](https://github.com/joygram/DeukAgentFlow/issues/737))


### Changed

- **template:** phase1·2 플랜 변경 가이드 추가 — 새 티켓 선생성 후 close 증거 패턴

## [4.5.98] - 2026-06-14


### Fixed

- **ticket-close:** .md status/phase 갱신 안 되던 버그 수정 ([#736](https://github.com/joygram/DeukAgentFlow/issues/736))

## [4.5.97] - 2026-06-14

## [4.5.96] - 2026-06-14

## [4.5.95] - 2026-06-14

## [4.5.94] - 2026-06-14


### Added

- **use:** ticket use 출력에 .md-aware 슬롯 현황 표기 ([#729](https://github.com/joygram/DeukAgentFlow/issues/729))

## [4.5.93] - 2026-06-14


### Added

- **verify:** phase3/4 verify 스테이지에 은폐금지 게이트 주입 ([#728](https://github.com/joygram/DeukAgentFlow/issues/728))

## [4.5.92] - 2026-06-14

## [4.5.91] - 2026-06-14


### Fixed

- **ticket:** cwd write 박멸 — report/knowledge/defrag 제거, 마이그레이션이 .deuk 통째삭제·.deuk-agent 흡수 ([#727](https://github.com/joygram/DeukAgentFlow/issues/727))

## [4.5.90] - 2026-06-14

## [4.5.89] - 2026-06-14


### Changed

- **vscode:** discoverAgentFlowWorkspaces 데드코드 전면 제거

## [4.5.88] - 2026-06-14

## [4.5.87] - 2026-06-14


### Changed

- **vscode:** UI 로딩 병목 전면 제거 — open 티켓만 파싱, 비선택 ws readdir 카운트만

## [4.5.86] - 2026-06-14


### Fixed

- **vscode:** statusbar 초기 text 비어있음 + 전 워크스페이스 본문 전수로딩 회귀 수정

## [4.5.85] - 2026-06-14

## [4.5.84] - 2026-06-14


### Added

- **vscode-ext:** 앱 아이콘 agentflow-128.png 등록

## [4.5.83] - 2026-06-14

## [4.5.82] - 2026-06-14


### Added

- **devinstall:** ~/.deuk/dev/ vsix 마스터 배포 + 전 프로젝트 연동

## [4.5.81] - 2026-06-14

## [4.5.80] - 2026-06-14


### Added

- **707:** .mjs 44개 제거, .ts 단일 소스로 전환


### Fixed

-  .deuk-agent 하드코딩 에러메시지/스모크테스트 → .deuk 수정

## [4.5.79] - 2026-06-14

## [4.5.78] - 2026-06-14

## [4.5.77] - 2026-06-14

## [4.5.76] - 2026-06-14

## [4.5.75] - 2026-06-14


### Fixed

- **vscode:** .deuk-agent → .deuk 홈 경로 수정

## [4.5.72] - 2026-06-14


### Added

- **bin:** tsc 빌드 출력(scripts/out/scripts/cli.js)으로 bin 교체

## [4.5.71] - 2026-06-14

## [4.5.70] - 2026-06-14


### Changed

- **ticket-home:** registry.json dead code 제거 ([#645](https://github.com/joygram/DeukAgentFlow/issues/645) retired)

## [4.5.69] - 2026-06-14

## [4.5.68] - 2026-06-13


### Added

-  add code-server extensions dir to WSL vsix install targets

## [4.5.67] - 2026-06-13

## [4.5.66] - 2026-06-13

## [4.5.65] - 2026-06-13

## [4.5.64] - 2026-06-13


### Added

- **#707:** scripts/*.mjs → .ts 전환 — tsc 에러 0개 달성


### Fixed

- **ticketHome:** CLI resolveHomeTicketDirForWorkspace 로직과 통합 — 드리프트 제거

## [4.5.63] - 2026-06-13

## [4.5.62] - 2026-06-13

## [4.5.61] - 2026-06-13

## [4.5.60] - 2026-06-13

## [4.5.59] - 2026-06-13

## [4.5.58] - 2026-06-13

## [4.5.57] - 2026-06-13

## [4.5.56] - 2026-06-13

## [4.5.55] - 2026-06-13

## [4.5.54] - 2026-06-13

## [4.5.53] - 2026-06-13


### Added

- **#697:** ticket-status-surface 시스템 스킬 — 상태는 카드 한 줄(링크 항상 포함)

## [4.5.52] - 2026-06-13

## [4.5.51] - 2026-06-13

## [4.5.50] - 2026-06-13


### Added

- **#694:** 스킬 노드 영역 바인딩 + rules 출력 축소 + CLI 자체 메시지 제거

## [4.5.49] - 2026-06-13

## [4.5.48] - 2026-06-13

## [4.5.47] - 2026-06-13

## [4.5.46] - 2026-06-13

## [4.5.45] - 2026-06-13


### Added

- **#691:** XState 기반 LangGraph 상태머신으로 티켓 워크플로 전이 엔진 전환

## [4.5.44] - 2026-06-13

## [4.5.43] - 2026-06-13

## [4.5.42] - 2026-06-13

## [4.5.41] - 2026-06-13


### Changed

- **#690:** 노드 프롬프트 .md SSOT 이관 + router/emit 분리 (XState 전환 토대)

## [4.5.40] - 2026-06-13

## [4.5.39] - 2026-06-13


### Changed

-  agent-flow를 LangGraph식 상태머신으로 재정렬 — 폴백 전면제거, .md=유일 state

## [4.5.38] - 2026-06-13

## [4.5.37] - 2026-06-13

## [4.5.36] - 2026-06-13

## [4.5.35] - 2026-06-13

## [4.5.34] - 2026-06-13

## [4.5.33] - 2026-06-13

## [4.5.32] - 2026-06-13


### Fixed

-  WSL2에서 winShell 오판정으로 PowerShell 블록 출력되던 버그 수정

## [4.5.31] - 2026-06-13

## [4.5.30] - 2026-06-13


### Fixed

-  getCloseWorkflowReasons accepts canonical Analysis/Direction headings

## [4.5.29] - 2026-06-13

## [4.5.28] - 2026-06-13


### Added

-  remove workspace .deuk-agent/ dir, store PROJECT_RULE and memory in home ticket store

## [4.5.27] - 2026-06-13

## [4.5.26] - 2026-06-13

## [4.5.25] - 2026-06-13

## [4.5.24] - 2026-06-13


### Fixed

- **#676:** install VSIX to Windows .vscode/extensions via WSL wslpath

## [4.5.23] - 2026-06-13

## [4.5.22] - 2026-06-13


### Added

- **#675:** unify flow-cookie+claim into single cookie-{wp}-{ticketId}-{sessionId} touch file

## [4.5.21] - 2026-06-13


### Fixed

- **#673:** multi-agent session isolation via per-agent env var detection

## [4.5.20] - 2026-06-13


### Fixed

-  discard hint clarification + doc-sync v4.5.18 canonicalization

## [4.5.19] - 2026-06-13


### Added

- **#669:** workspace marker .deuk-agent/ → .deuk-workspace-id 단일 파일로 교체

## [4.5.18] - 2026-06-13


### Fixed

-  raise TOTAL_MAX_SKILLS 5→6 to allow doc-sync exposure

## [4.5.17] - 2026-06-12


### Added

-  add doc-sync skill + fix executionEvidence phase2→3 blocking bug

## [4.5.16] - 2026-06-12

## [4.5.15] - 2026-06-12

## [4.5.14] - 2026-06-12

## [4.5.13] - 2026-06-12

## [4.5.12] - 2026-06-12


### Added

-  Windows PowerShell 호환 — isWindowsPlatform 분기, PS here-string 예시 출력 (DeukAgentFlow-659)

## [4.5.11] - 2026-06-12


### Added

-  에이전트 폭주 방지 — active ticket STOP 신호, Runaway Prevention 규칙 추가 (DeukAgentFlow-658)

## [4.5.10] - 2026-06-12


### Added

-  agentflow UX 개선 — 티켓 표기 wp-id, UI 개선, Approval Gate 정밀화 (DeukAgentFlow-656, DeukAgentFlow-657)

## [4.5.9] - 2026-06-12


### Added

- **plan-body:** phase1 plan-body 7섹션 → 4섹션 슬림화 ([#654](https://github.com/joygram/DeukAgentFlow/issues/654)) v4.5.8

## [4.5.8] - 2026-06-12


### Fixed

- **ticket-create:** --plan-body 생략 시 summary 기반 auto-scaffold 생성 ([#653](https://github.com/joygram/DeukAgentFlow/issues/653)) v4.5.7

## [4.5.7] - 2026-06-12

## [4.5.6] - 2026-06-12


### Fixed

- **workspace:** rules·ticket dispatch의 cwd 워크스페이스 추정 박멸 ([#652](https://github.com/joygram/DeukAgentFlow/issues/652)) v4.5.5

## [4.5.4] - 2026-06-12

## [4.5.3] - 2026-06-12


### Fixed

- **workspace:** 세션 cookie를 홈 직속 저장으로 이전 — cwd 의존 완전 제거 ([#871](https://github.com/joygram/DeukAgentFlow/issues/871)-followup) v4.5.2

## [4.5.1] - 2026-06-12

## [4.4.177] - 2026-06-12


### Fixed

- **workspace:** 세션 cookie 기반 active 도출로 멀티세션 티켓 강탈 박멸 ([#871](https://github.com/joygram/DeukAgentFlow/issues/871)-followup)

## [4.4.176] - 2026-06-12

## [4.4.175] - 2026-06-12

## [4.4.174] - 2026-06-12

## [4.4.173] - 2026-06-12

## [4.4.172] - 2026-06-12

## [4.4.171] - 2026-06-12


### Fixed

- **ui:** 티켓 리뷰 링크 채팅 클릭 복원 + ticket --help 룰 오염 제거

## [4.4.170] - 2026-06-12

## [4.4.169] - 2026-06-12

## [4.4.168] - 2026-06-12

## [4.4.167] - 2026-06-12

## [4.4.166] - 2026-06-12

## [4.4.165] - 2026-06-12

## [4.4.164] - 2026-06-12


### Fixed

- **workspace:** registry.json 폐기 + cwd 자동등록/폴백 제거로 ghost 워크스페이스 박멸 ([#645](https://github.com/joygram/DeukAgentFlow/issues/645))

## [4.4.163] - 2026-06-12

## [4.4.162] - 2026-06-12

## [4.4.161] - 2026-06-12

## [4.4.160] - 2026-06-12


### Fixed

-  rules APC 서브헤딩 안내 추가 + ticket create Source 라인 출력 ([#644](https://github.com/joygram/DeukAgentFlow/issues/644))

## [4.4.159] - 2026-06-12


### Fixed

- **rules:** --workspace 플래그로 runRulesShow workspace 컨텍스트 교체 ([#643](https://github.com/joygram/DeukAgentFlow/issues/643))

## [4.4.158] - 2026-06-12


### Fixed

- **rules:** buildPhaseAdvanceHint 전체 transitions 표시 — 정방향·이탈·회귀·재오픈 라우트 모두 출력

## [4.4.157] - 2026-06-12


### Fixed

- **workflow:** assertTicketWorkflowTransition 차단 시 허용 전환 목록 에러 메시지 추가

## [4.4.156] - 2026-06-12


### Fixed

- **workflow:** FSM 에러 메시지에 허용 actions·전환·discard 이정표 추가, --to end named state 파싱 지원

## [4.4.155] - 2026-06-12

## [4.4.154] - 2026-06-12

## [4.4.153] - 2026-06-11

## [4.4.152] - 2026-06-11

## [4.4.151] - 2026-06-11

## [4.4.150] - 2026-06-11

## [4.4.149] - 2026-06-11

## [4.4.148] - 2026-06-11

## [4.4.147] - 2026-06-11

## [4.4.146] - 2026-06-11

## [4.4.145] - 2026-06-11

## [4.4.144] - 2026-06-11

## [4.4.143] - 2026-06-11

## [4.4.142] - 2026-06-11


### Fixed

- **ticket-home:** 티켓 경로 중첩·ghost 워크스페이스 근절 ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))

## [4.4.141] - 2026-06-11

## [4.4.140] - 2026-06-11

## [4.4.139] - 2026-06-11

## [4.4.138] - 2026-06-11

## [4.4.137] - 2026-06-11

## [4.4.136] - 2026-06-11

## [4.4.135] - 2026-06-11


### Fixed

- **workspace:** 서브모듈 독립 등록 허용 — 자식에 .deuk-agent 직접 있으면 통과 ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))

## [4.4.134] - 2026-06-11


### Fixed

- **ticket-gate:** cli/ui 타입 구분 제거 및 워크스페이스 유령 등록 방지 ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))

## [4.4.133] - 2026-06-11

## [4.4.132] - 2026-06-11

## [4.4.131] - 2026-06-11

## [4.4.130] - 2026-06-11

## [4.4.129] - 2026-06-11

## [4.4.128] - 2026-06-11

## [4.4.127] - 2026-06-11


### Fixed

- **rules:** narrow ticket-exempt to block gate bypass (v100, [#631](https://github.com/joygram/DeukAgentFlow/issues/631))

## [4.4.126] - 2026-06-11

## [4.4.125] - 2026-06-11


### Fixed

- **ticket:** 워크스페이스 정규화 충돌 타이브레이크 + cli 9섹션 사전 노출
- **vscode:** 액티브 티켓을 claim-{id}.json에서 도출 ([#630](https://github.com/joygram/DeukAgentFlow/issues/630))

## [4.4.124] - 2026-06-10


### Fixed

- **ticket:** 타입 인지 Phase1 검증 + 확장 홈 티켓 경로 이전

## [4.4.123] - 2026-06-10


### Added

- **skill:** home-only skills, no workspace spray, hash auto-sync
- **skill:** home-only skills, no workspace spray, hash auto-sync

## [4.4.122] - 2026-06-10

## [4.4.121] - 2026-06-10

## [4.4.120] - 2026-06-10


### Changed

- **ticket:** make detect a pure read, trigger migration on entry/init

## [4.4.119] - 2026-06-10

## [4.4.118] - 2026-06-10

## [4.4.117] - 2026-06-10


### Added

- **ticket:** relocate ticket storage to home with self-healing registry

## [4.4.116] - 2026-06-10

## [4.4.115] - 2026-06-10

## [4.4.114] - 2026-06-10

## [4.4.113] - 2026-06-10

## [4.4.112] - 2026-06-10

## [4.4.111] - 2026-06-10

## [4.4.110] - 2026-06-10

## [4.4.109] - 2026-06-10

## [4.4.108] - 2026-06-10


### Fixed

- **ticket:** per-ticket claim model replaces global active marker

## [4.4.107] - 2026-06-10


### Fixed

- **cli:** toSlug Hangul romanize fallback + rules-show section test

## [4.4.106] - 2026-06-10

## [4.4.105] - 2026-06-09


### Fixed

-  || true 폴백 제거, active 마커 다중파일 정리, --plan-body 직접 인자 안내 통일

## [4.4.104] - 2026-06-09

## [4.4.103] - 2026-06-09


### Fixed

- **ticket:** active 마커 개념 제거 — status 폴백이 archived 거짓 노출하던 버그 수정

## [4.4.102] - 2026-06-09

## [4.4.101] - 2026-06-09


### Added

- **persona-maid:** 텍스트 기호 하트→컬러 이모지 통일 + 카오모지 규칙 추가

## [4.4.100] - 2026-06-09


### Added

- **persona-maid:** 단조로운 하트를 다양한 컬러 하트로 교체

## [4.4.99] - 2026-06-09


### Added

- **persona-maid:** 메이드 페르소나 애교 폭발 버전으로 강화

## [4.4.98] - 2026-06-09

## [4.4.97] - 2026-06-09


### Fixed

- **skill:** native 스킬 노출을 <id>/SKILL.md 디렉토리 구조로 전환
- **ticket:** discard approval_required 허용·INDEX 미등록 폐기·help 템플릿 복원·workspace 이동

## [4.4.96] - 2026-06-09


### Added

- **ticket+ui:** INDEX 레거시 마이그레이션·ticket doctor·sanitize·archive lazy-load

## [4.4.95] - 2026-06-09

## [4.4.94] - 2026-06-09

## [4.4.93] - 2026-06-09


### Added

- **skill:** native platform에 daf- prefix flat 파일로 배포

## [4.4.92] - 2026-06-09


### Added

- **vscode:** compact status bar format — workspace #num phN

## [4.4.91] - 2026-06-09


### Added

- **vscode:** show active ticket in status bar

## [4.4.90] - 2026-06-09

## [4.4.89] - 2026-06-09


### Fixed

- **skill:** exposed/native-sync 전역 SSOT 통합

## [4.4.88] - 2026-06-09

## [4.4.87] - 2026-06-09

## [4.4.86] - 2026-06-09


### Fixed

- **ui:** resolveWebviewView/openPanel 초기 로딩 트리거 추가

## [4.4.85] - 2026-06-09

## [4.4.84] - 2026-06-09


### Added

- **skill:** claude platform -> native ~/.claude/commands/ mode

## [4.4.83] - 2026-06-09

## [4.4.82] - 2026-06-09

## [4.4.81] - 2026-06-08

## [4.4.80] - 2026-06-08


### Fixed

-  revert c4025da regressions — skill installed flag, quality gate bypass, emoji encoding

## [4.4.79] - 2026-06-08


### Fixed

-  cwd-matched workspace resolution + ticket gate template sync

## [4.4.78] - 2026-06-08

## [4.4.77] - 2026-06-08

## [4.4.76] - 2026-06-08


### Fixed

-  auto-cleanup quality gate bypass and inline skills for AI platforms

## [4.4.75] - 2026-06-08


### Fixed

- **flow:** decouple active ticket marker logic from INDEX.json writer

## [4.4.74] - 2026-06-08

## [4.4.73] - 2026-06-08

## [4.4.72] - 2026-06-08

## [4.4.71] - 2026-06-08


### Changed

- **skills:** unify global skill path to ~/.deuk-agent/skills and use pointers for all platforms
- **view:** agentFlowView.ts 1·2차 분리 — utils/script/css 추출, shellArg Windows 버그 수정

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

## [4.2.7] - 2026-05-11


### Added

- **ticket:** switch ticket id counter to index metadata


### Fixed

-  generalize shared skill templates and harden ticket gating
-  improve APC marker validation and templates
-  keep approval ticket visible in final replies
- **npm:** include shared ticket command module
-  preserve changelog context across version bumps
- **ticket:** prevent duplicate create after archived reuse miss

## [4.0.37] - 2026-05-09


### Fixed

-  restore init completion feedback

## [4.0.36] - 2026-05-09


### Added

-  add conversation split advisor heuristics
-  add shared ProjectPilot templates
-  add usage budget advisor and reminders
-  announce automatic open-ticket cleanup
-  make deuk-agent-flow the primary cli package
-  rebrand as agent workflow and dual-publish wrapper
-  shorten strict ticket create guidance


### Fixed

- **agentflow:** limit markdown link lint to ticket-path links only
-  harden init spokes and skill status
-  require one-shot ticket create recipe
-  stop on approval after ticket create


### Changed

-  align Deuk AgentFlow branding
-  update deukpack public copy

## [3.3.3] - 2026-05-06


### Added

-  sharpen guardrail positioning


### Fixed

-  prepare 3.3.3 npm docs release
-  sync oss mirror without internal files
-  trim npm package files for release
-  validate ticket create dry-run blockers

## [3.3.2] - 2026-05-06


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
- **ticket:** implement --from-plan for plan-to-ticket conversion and update project rules


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

## [2.5.15] - 2026-04-23


### Added

-  add Codex CLI support (.codexrules) and apply globally
-  implement ticket chaining (--chain) for automated ticket linkage
-  replace .codexrules with global ~/.codex/AGENTS.md support


### Fixed

- **cli:** enforce posix path normalization and harden ticket discovery protocol
- **cli:** implement recursive cleanup for rule duplicates, enforce MCP tool name, and improve UX
-  enforce anti-shoveling rule against manual JSON modification


### Changed

-  complete ticket 059 and update implementation plan

## [2.5.14] - 2026-04-22


### Fixed

- **cli:** resolve marker nesting bug in AGENTS.md injection

## [2.5.13] - 2026-04-22


### Added

-  implement RAG-Miss fallback rule, fix ticket template formatting, and ignore tmp dirs in submodule discovery


### Changed

-  squash mermaid diagram changelog noise into single entry

## [2.5.11] - 2026-04-22


### Changed

-  force native SVG text rendering in mermaid to eliminate IDE text background bugs
-  tone down mermaid background colors and remove text stroke

## [2.5.10] - 2026-04-22


### Changed

-  redesign mermaid diagrams with a solid tailwind color palette

## [2.5.9] - 2026-04-22


### Changed

-  remove rx/ry from mermaid classDef to fix v8.8.0 syntax errors

## [2.5.8] - 2026-04-22


### Changed

-  apply technical blue theme and fix stadium node syntax error for older mermaid parsers

## [2.5.7] - 2026-04-22


### Changed

-  apply tokyo night theme to mermaid diagrams to fix text background rendering bugs in IDEs

## [2.5.6] - 2026-04-22


### Changed

-  remove custom mermaid classDefs to fix IDE dark mode text rendering bugs

## [2.5.5] - 2026-04-22


### Changed

-  redesign mermaid diagrams with industry standard github primer colors

## [2.5.4] - 2026-04-22


### Changed

-  redesign mermaid diagrams with a modern dark theme aesthetic

## [2.5.3] - 2026-04-22


### Changed

-  remove flowchart and subgraph for mermaid v8.8.0 backward compatibility

## [2.5.2] - 2026-04-22


### Changed

-  fix mermaid syntax errors in workflow diagrams

## [2.5.1] - 2026-04-22


### Added

- **cli:** add --clean flag to init command for safe configuration reset

## [2.5.0] - 2026-04-22


### Added

-  Agent-Agnostic Workflow and Archiving Protocol
- **cli:** parse DeukRag config for conditions and auto-scaffold plan templates
-  implement Frontmatter-driven modular rule assembly (Ticket 045)
-  Model-specific hard rules (gemini.md) and Continuous RAG enforcement
- **rules:** enforce Phase 0 MCP RAG in multi-ai-workflow MDC
- **rules:** harden post-mortem workflow and mandate follow-up chaining
- **templates:** enforce Phase 0 RAG Research checklists in ticket template


### Fixed

-  handoff path format, 3-tier template system, recursive init with normalization
-  improve migration robustness with merging logic and cleanup dead code
-  recursive directory merge for legacy migration


### Changed

-  add ticket 045 completion report
-  add what's new for v2.4, RAG engine notice, and SEO keywords
- **rules:** Add Fast-Track workflow to prevent ticket loop overhead
- **rules:** enforce Continuous RAG Policy and Absolute MCP Priority
- **rules:** Mandate Continuous RAG during execution and verification phases
- **rules:** Restore TDD workflow but ban interactive CLI looping
-  upgrade workflow diagram and add migration troubleshooting guide

## [2.4.6] - 2026-04-18


### Fixed

- **cli:** suppress update notifier when local version >= registry (local dev symlink)
- **ticket:** cap NNN regex to 4 digits to prevent unix timestamps being parsed as ticket numbers

## [2.4.5] - 2026-04-18


### Added

- **cli:** add update notifier for checking latest npm version


### Fixed

- **ticket:** resolve discrepancy between filename and ticket ID generation
- **ticket:** strictly enforce 8-character limit on hostname slug


### Changed

-  add reasons for global installation
- **changelog:** sync korean changelog with v2.4.0
-  generalize AGENTS.md and cleanup submodule-specific rules
- **ticket:** new ID format NNN-topic-hostname with backward-compatible parsing

## [2.4.0] - 2026-04-18


### Added

- **init:** add obsolete template cleanup for cleaner migration
- **rules:** add TICKET VERIFICATION RULE to original agents.md
- **ticket:** add priority property to tickets
- **ticket:** add sequential hostname-aware ticket naming (NNN-hostname-topic)
- **ticket:** auto-sequence numbering and hostname-based naming (limit 8 chars)


### Fixed

- **rules:** force use of local latest deuk-agent-rule to avoid npx cache issues
- **scripts:** correct log output for OSS repository url example


### Changed

-  add Step 4 (Ticket Verification) to README files
-  clarify global installation and OS-specific permissions
-  enforce ticket reference in implementation artifacts

## [2.3.1] - 2026-04-17


### Changed

- **readme:** add changelog and automated release instructions

## [2.3.0] - 2026-04-17


### Added

-  AI 파이프라인 연동 기반 및 선택적 동기화 시스템 고도화
- **cli:** add --submodule filter to ticket list command
- **cli:** restore ticket archive and reports workflows to modular architecture
- **rules:** advance rules for Unity Client, WebApp, and C++ Server hybrid environment
- **ticket:** implementation of decentralized ticket management & sharing policy
- **ticket:** upgrade to V2 YAML Front-matter and Categorized List


### Fixed

- **ticket:** deprecate LATEST.md, unify pointer to ACTIVE_TICKET.md
- **ticket:** DeukAgentRules 현재 진행중인 티켓 안나오던 문제 해결


### Changed

- **readme:** clarify YAML front matter preservation and distributed ticket workflow for v2.2.2
- **readme:** restore count headers and npm badges
- **rules:** enforce CLI usage for ticket reading to prevent manual JSON parsing
-  update CLI reference with close and migrate commands

## [1.0.18] - 2026-04-12


### Added

- **ai:** map conversational ticket requests to implicit CLI execution
- **cli:** implement ticket archive and reporting workflow
- **rules:** map conversational ticket aliases to implicit CLI execution


### Changed

- **readme:** add ticket archive and reports CLI usage to documentation
- **readme:** describe natural language CLI prompting alternatives
- **readme:** provide explicit conversational prompt examples inside option tables
- **readme:** provide explicit update guide
- **rules:** add prompting guide and execution report archival rule

## [1.0.17] - 2026-04-06


### Fixed

- **template:** move ticket repo-relative marker to bottom

## [1.0.16] - 2026-04-05


### Added

- **workflow:** add auto-verification and final report to agent workflows

## [1.0.15] - 2026-04-05


### Added

-  migrate and rename handoff terminology to ticket in CLI and templates


### Changed

-  Add strict rule for DeukPack namespace requirement
-  completely eradicate legacy Handoff references from AGENTS.md, templates, and mdc rules
-  Enforce DeukPack code format and API strictly as a hard rule
-  refactor README usage guide and workflow

## [1.0.14] - 2026-04-02


### Added

- **cli:** extend merge tooling and sync publish docs
-  forbid 'sync' word in commit titles in agent rules
- **handoff:** add indexed handoff workflow and CLI
-  migrate template architecture to zero-touch NPM bundle scaffolding


### Fixed

- **cli:** resolve html entity syntax error in template generator


### Changed

-  public-facing RELEASING and changelog wording; sync-bundle comment
-  update README with token efficiency mechanism and zero-touch template scaffolding

## [1.0.12] - 2026-03-27


### Fixed

- **ci:** run release workflow on master; document GitHub is not auto-synced from gplat


### Changed

- **agents:** require full repo-root paths for handoff file links

## [1.0.11] - 2026-03-26


### Added

- **ci:** GitHub Release on main for chore(release); simplify public RELEASING

## [1.0.10] - 2026-03-26


### Added

- **deuk-agent-rule:** keep a changelog templates without commit links

## [1.0.9] - 2026-03-26


### Added

- **deuk-agent-rule:** automated changelog, bump tooling
- **deuk-agent-rule:** handoff gitignore, pre-work handoff scan, AGENTS inject newline


### Changed

- **agents:** DeukAgentRules/handoff/LATEST.md handoff path for consumer repos

## [1.0.5] - 2026-03-26


### Changed

-  absolute links for npm page
-  Deuk Family tagline, npm keywords, GitHub Topics note
-  README updates; delivery-and-parallel-work rule; cli and publish AGENTS sync

## [1.0.4] - 2026-03-26


### Added

-  interactive init, release workflow; bump v1.1.0

## [1.0.3] - 2026-03-26


### Added

-  interactive init mode; simplify docs; v1.0.3

## [1.0.2] - 2026-03-26

## [5.0.22] - 2026-06-22


### Added

- **ticket:** plan-body 검증 실패 안내에 H3 미인정 경고 추가

## [5.0.21] - 2026-06-22

## [5.0.20] - 2026-06-22


### Added

- **rules:** phase별 엔트리 룰 차등 노출 (안전게이트는 항상)

## [5.0.19] - 2026-06-22


### Added

- **rules:** phase별 엔트리 룰 차등 노출 (안전게이트는 항상)

## [5.0.13] - 2026-06-22


### Fixed

-  README 문서 링크를 새 docs/public/ 경로로 갱신 ([#785](https://github.com/joygram/DeukAgentFlow/issues/785))
- **ticket:** use 인터랙티브 제거 + create plan-body 누락 시 exit 0


### Changed

-  PROJECT_RULE 템플릿에 docs 진입점·역할별 필독 섹션 추가, doc-sync 스킬 사전확인 스텝 추가 ([#786](https://github.com/joygram/DeukAgentFlow/issues/786))
-  public/internal 2분류 표준 구조 확립 + doc-sync 스킬 갱신 ([#785](https://github.com/joygram/DeukAgentFlow/issues/785))

## [5.0.12] - 2026-06-21


### Added

- **core-rules:** 에이전트 개발 워크플로우 4원칙 추가 ([#781](https://github.com/joygram/DeukAgentFlow/issues/781))

## [5.0.11] - 2026-06-21


### Fixed

- **vsix:** add Windows Antigravity IDE target for dev:install

## [5.0.10] - 2026-06-20

## [5.0.9] - 2026-06-20

## [5.0.8] - 2026-06-20


### Fixed

- **init:** 신규 워크스페이스 init 실패 — 마커 민팅을 ticket index write보다 먼저 + 실패 정직성 ([#776](https://github.com/joygram/DeukAgentFlow/issues/776))

## [5.0.7] - 2026-06-19

## [5.0.6] - 2026-06-19


### Fixed

- **cli:** ticket 명령에 결정적 실패 피드백 — unknown 플래그·positional 흡수·매치실패 광역폴백 차단 ([#775](https://github.com/joygram/DeukAgentFlow/issues/775))

## [5.0.5] - 2026-06-19


### Added

- **rules:** 페이즈별 역할 레이어 + 동적 ROLE_CONTEXT 주입 (v104)


### Fixed

- **oss:** auto-answer vsce LICENSE prompt with stdin y to unblock headless publish
- **oss:** restore prepack + full PUBLIC_SCRIPTS for clean npm publish from OSS mirror
- **sync-oss:** auto-sync packages/*/version and deuk-agent-flow dep to root version on sync

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
