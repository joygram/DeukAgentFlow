# 작동 원리 (How It Works)

DeukAgentFlow는 **AI 엔지니어링 오케스트레이션 프로토콜**로 작동합니다. 중앙 집중식 규칙 허브와 고성능 CLI를 사용하여 에이전트가 코드베이스를 인식, 분석 및 수정하는 방식을 조정합니다.

## 1. Hub-Spoke 실행 모델

v3.0에서 규칙 파일은 더 이상 거대하고 독립적인 형태가 아닙니다. 컨텍스트 팽창을 최소화하기 위해 **Hub-Spoke** 모델을 사용합니다.

- **Hub (`AGENTS.md`)**: 전역적으로 적용되는 중앙 프로젝트 규칙 정본 문서입니다.
- **Local Hub (`PROJECT_RULE.md`)**: 각 워크스페이스 또는 프로젝트에 특화된 로컬 규칙을 정의하여 전역 허브를 오버라이드합니다.
- **Spoke (`.cursor/rules/*.mdc` 등)**: 에이전트에게 허브 문서를 읽으라고 지시하는 최소한의 진입점 포인터입니다.
- **이유**: 이를 통해 에이전트는 서로 다른 IDE 환경에서도 중복이나 오류 없이 항상 최신의 통합된 규칙을 볼 수 있습니다.

## 2. Global CLI Proxy

CLI(`deuk-agent-flow`, 호환 명령 `deuk-agent-rule`)는 **소스 주권(Source Sovereignty)** 메커니즘을 사용합니다.

- `npx deuk-agent-flow` 실행 시, 현재 디렉터리 내에 프로젝트 소스 코드가 포함된 워크스페이스가 있는지 확인합니다.
- 로컬 소스가 감지되면, 실행을 글로벌 바이너리가 아닌 **로컬 스크립트로 라우팅**합니다.
- 이를 통해 개발 중에 커밋되지 않은 최신 규칙을 에이전트가 즉시 사용할 수 있도록 보장합니다.

## 3. 초기화 생명주기 (Initialization Lifecycle)

`deuk-agent-flow init` 실행 시 다음 과정이 차례로 수행됩니다:

1. **레거시 제거 (Legacy Purge)**: v1/v2 시절의 구형 설정 파일들을 물리적으로 제거합니다.
2. **서브모듈 진공 청소 (Submodule Vacuum)**: 빈 서브모듈 디렉터리 스텁과 `.gitmodules`의 고립된 항목들을 정리합니다.
3. **스마트 백업 (Smart Backup)**:
   - 레거시 파일(`.cursorrules` 등)을 분석합니다.
   - 사용자 커스텀 규칙이 발견되면 `*.bak` 파일을 생성합니다.
   - 시스템 생성 내용만 있다면 파일을 즉시 삭제합니다.
4. **허브 동기화 (Hub Sync)**: 최신 `AGENTS.md`를 배포하고 지원되는 모든 에이전트를 위한 경량 Spoke 파일들을 생성합니다.

## 4. 저장소 역할 및 파일 구조

| 경로 | 역할 |
|---|---|
| `AGENTS.md` | 주권적 전역 규칙 허브 (단일 진실 공급원) |
| `PROJECT_RULE.md` | 로컬 프로젝트 특화 규칙 오버라이드 |
| `.deuk-agent/config.json` | 프로젝트별 초기화 상태 정보 |
| `.deuk-agent/tickets/` | 제한된 실행 계약서 (작업 지시서) |
| `templates/` | 티켓, 규칙, 스킬 템플릿의 패키지 소유 단일 진실 공급원 |
| `bin/deuk-agent-flow.js` | 글로벌 실행 프록시 |

## 5. Ticket Workflow: CLI가 소유하는 상태 테이블

DeukAgentFlow는 티켓 생명주기를 느슨한 help 문구와 phase flag 묶음이 아니라 로컬 상태 테이블로 다룹니다. 이것은 범용 workflow runtime이 아닙니다. CLI가 state, transition, recipe assembly, DocMeta validation을 소유합니다.

이 소유권은 선언적 문구가 아니라 end-to-end 런타임 책임을 뜻합니다. 에이전트가 보는 prompt를 CLI가 출력하고, registry/ticket-store context를 해석하고, project/RAG context를 붙이고, 어떤 approval gate와 다음 state가 유효한지 CLI가 결정합니다. ticket markdown과 registry 저장소는 런타임을 위한 durable artifact이지, 병렬적인 워크플로우 진실 공급원이 아닙니다.

| 계층 | 진실 공급원 | 런타임 역할 |
|---|---|---|
| Lifecycle 선언 | `scripts/ticket-workflow.mjs` | state, phase/status 메타, 허용 transition, recipe id, template id, project policy role 선언 |
| State prompt | `docs/cli-surfaces/state/*.md` | 현재 state가 에이전트에게 무엇을 의미하는지 안내 |
| State template | `docs/cli-surfaces/state-template/*.md` | 해당 state에서 작성해야 할 슬롯과 종료 조건 제시 |
| Project policy | `.deuk-agent/project-guardrails/*.md` | analysis, coding, debugging, approval, completion 같은 역할별 프로젝트 제약 추가 |
| Durable record | `.deuk-agent/tickets/**/*.md` | scoped ticket record, evidence, 본문 `## DocMeta` 계약, compact frontmatter summary 저장 |

에이전트가 state에 진입하거나 상태를 확인하면 CLI는 이 조각들을 하나의 DocMeta state surface로 구성합니다.

```text
Ticket workflow state
  -> localized state recipe
  -> project policy metadata
  -> source contract
  -> compact flow:[workspace:state] action line
```

그래서 `deuk-agent-flow rules ticket --workspace <workspace-id>`는 여러 파일을 에이전트가 따로 읽게 하지 않고 조합된 ticket rule surface를 출력합니다. `ticket use`, `ticket status`, `ticket move`, `ticket guard`도 일반 help가 아니라 state-machine command로 봐야 합니다.

### 전이 엔진

티켓 상태 변경은 workflow transition resolver가 계산합니다.

1. 현재 티켓 frontmatter의 `phase/status`를 읽습니다.
2. 이를 `phase1`, `phase2`, `phase3`, `phase4` 같은 workflow state로 매핑합니다.
3. `--next`, `--phase`, 또는 `phase2` 같은 명시 gate에서 target state를 계산합니다.
4. workflow state table에 선언되지 않은 transition이면 차단합니다.
5. target `phase/status`를 반환하고, 명령이 ticket file과 index를 갱신합니다.

예:

| 현재 | 명령 의도 | Workflow transition | 결과 |
|---|---|---|---|
| `phase1/open` | 승인된 실행 | `phase1 -> phase2` | `phase=2`, `status=active` |
| `phase2/active` | next | `phase2 -> phase3` | `phase=3`, `status=active` |
| `phase3/active` | 종료 가능 | `phase3 -> phase4` | `phase=4`, `status=closed` |
| `phase4/closed` | 재오픈 | `phase4 -> phase1` | `phase=1`, `status=open` |

중요한 경계는 prompt text가 state를 결정하지 않는다는 점입니다. state는 lifecycle 선언과 CLI transition engine이 결정하고, recipe는 결정된 state 안에서 LLM 행동을 안내합니다.

### 티켓 DocMeta 저장 구조

티켓 frontmatter는 의도적으로 작게 유지합니다. `id`, `phase`, `status`, `docmetaStatus`, `docmetaValidation`, `docmetaTarget`, 짧은 error key처럼 사람과 index가 바로 읽는 필드만 둡니다. 전체 DocMeta 객체를 frontmatter에 저장하면 안 됩니다.

전체 DocMeta 계약은 티켓 본문의 마지막 섹션인 `## DocMeta` 아래에 저장합니다. 이 하단 블록이 required slot, source map, validation detail, output status, adapter contract를 소유합니다. CLI 명령은 본문 계약을 먼저 갱신하고, 사람이 큰 YAML 헤더를 읽지 않아도 티켓 상태를 추적할 수 있도록 frontmatter에는 작은 요약만 mirror합니다.

기본 command output은 compact projection만 렌더링해야 합니다. 전체 DocMeta는 `--status-detail`, `--verbose`, `--json`, audit output처럼 명시적인 상세 모드에서만 드러냅니다.

이 경계는 디버깅과 리팩터링에도 그대로 적용됩니다. 이 워크플로우가 깨졌다면 기본 대응은 parser나 파일 배치 한 군데를 손보는 국소 패치가 아니라, visible command behavior, state transition wiring, context attachment, approval gate, regression coverage를 함께 복구하는 CLI 계약 수리입니다.

## 6. 엄격한 Phase 기반 티켓 워크플로우 (TDW)

1. **티켓 발행 (Phase 1)**: 사용자가 짧게 지시하면 에이전트가 맥락을 읽고 티켓을 만들거나 기존 티켓을 선택해 타겟 범위를 정의합니다. 메인테이너와 자동화 환경에서는 `ticket create`를 직접 사용할 수 있지만, 일상 협업은 명령이 아니라 요청에서 시작합니다.
2. **APC 및 메인 티켓 기록**: 에이전트는 코드를 수정하기 전, 메인 티켓에 명시된 APC(Agent Permission Contract)의 `[BOUNDARY]`, `[CONTRACT]`, `[PATCH PLAN]`을 채웁니다. 티켓은 스코프/계약/라이프사이클 체크/실행 계획/검증 결과를 맡고, 실행 로그, 명령 transcript, 완료 요약, 검증 결과를 계획 문구에 섞으면 안 됩니다.
3. **검토 게이트**: 이슈/회귀 보고는 Phase 1 이후 멈춥니다. 사용자가 티켓 계획을 검토한 뒤 실행을 승인해야 하며, 원래 이슈 문장의 "수정", "해결" 같은 표현만으로 검토를 건너뛰면 안 됩니다.
4. **Phase 승급**: Phase 1 계획이 검토 가능하고 사용자가 실행을 승인하면 에이전트가 티켓을 Phase 2 (Execute)로 승급합니다.
5. **실행 및 검증 (Phase 2)**: 격리된 경계 내에서 코드를 수정하고 검증을 수행합니다.
6. **지식 증류 아카이빙**: 작업 완료 후 `archive` 시, 핵심 정보만 추출(Zero-Token Distillation)하여 장기 엔지니어링 메모리로 보관합니다.
