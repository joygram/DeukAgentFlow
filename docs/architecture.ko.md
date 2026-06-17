# 아키텍처 (v4.5.x)

DeukAgentFlow v3.0에서 **Hub-Spoke 아키텍처**와 **Global Execution Proxy**를 도입했습니다. v4.5.x에서는 멀티 워크스페이스 공존·세션 인계를 위한 **홈 기반 티켓 스토어**(`~/.deuk-agent/tickets/{uuid}/`)와 문서 정본화를 위한 **doc-sync 스킬**이 추가되었습니다.

## 1. Zero-Copy Hub-Spoke 아키텍처

v3 모델에서 저장소 루트의 **`AGENTS.md`**는 전역적인 **Global Hub**(단일 진실 공급원, SSoT) 역할을 하며, 프로젝트 최상단의 **`PROJECT_RULE.md`**는 로컬 오버라이드를 담당하는 **Local Hub** 역할을 합니다.
IDE별 규칙 파일(예: `.cursor/rules/*.mdc`)은 규칙 내용을 복사하지 않고 이 허브들을 가리키는 **Spoke**(최소한의 진입점) 역할만 수행하는 Zero-Copy 방식을 사용합니다.

![Hub-Spoke 아키텍처](assets/architecture-v3.png)

### 핵심 원칙
- **SSoT (Single Source of Truth)**: 모든 범용 운영 규칙은 `AGENTS.md`에 정의되며, 프로젝트 특화 규칙은 `PROJECT_RULE.md`에만 작성됩니다.
- **경량 Spoke (Zero-Copy)**: IDE 규칙은 내용을 중복해서 담지 않으며, 에이전트가 절대 경로(Absolute Path) 포인터를 통해 Hub를 읽도록 유도합니다.
- **Zero-Legacy**: `init` 명령은 구세대(v1/v2)의 잔재를 물리적으로 제거하여 깨끗한 상태를 유지합니다.
- **온라인 RAG 전용**: DeukAgentContext는 로컬 캐시나 또 다른 진실 공급원이 아니라 온라인 보조 기억 계층으로만 사용합니다.
- **아카이브 보존**: 완료된 작업은 archive/knowledge로 옮겨 활성 context를 작고 최신 상태로 유지합니다.

## 2. Global CLI Proxy (Kind: Src)

`npx` 사용 시 발생하는 '스테일 타르볼(Stale Tarball)' 문제를 해결하기 위해 v3.0은 **Global Proxy**를 구현했습니다.

### 작동 원리:
1. `npx deuk-agent-flow` 실행 시, 패키지의 기본 글로벌 엔트리 포인트(`bin/deuk-agent-flow.js`)가 구동됩니다.
2. 현재 디렉터리와 상위 디렉터리를 스캔하여 **로컬 워크스페이스 소스**(`DeukAgentFlow/scripts/cli.mjs`)를 자동으로 찾습니다.
3. 소스가 발견되면 모든 명령을 로컬 소스로 **투명하게 위임(Routing)**합니다.
4. 이를 통해 에이전트가 레지스트리의 캐시된 버전이 아닌, 현재 개발 중인 최신 로컬 규칙을 항상 사용하도록 보장합니다.

## 3. 초기화 생명주기 (Init Lifecycle)

1. **`migrateLegacyStructure`**: 이전 세대의 디렉터리 구조를 정리하거나 이름을 변경합니다.
2. **`cleanSubmoduleStubs`**: 빈 서브모듈 스텁과 `.gitmodules`의 고립된 항목을 찾아 제거합니다.
3. **`deploySpokePointers`**: Hub를 가리키는 경량 Spoke 파일들을 생성합니다.
4. **`Smart Backup`**: 레거시 `.cursorrules`를 분석하여 사용자 커스텀 규칙이 있을 경우에만 `.bak`을 생성합니다.

## 4. Ticket Workflow 런타임

티켓 워크플로우는 CLI가 소유하는 workflow state table로 모델링됩니다.

```text
AGENTS.md bootstrap
  -> deuk-agent-flow rules ticket --workspace <workspace-id>
  -> ticket workflow declaration
  -> state recipe + DocMeta contracts
  -> ticket command transition
  -> ticket 본문 validation DocMeta
  -> durable ticket/index update
```

`scripts/ticket-workflow.mjs`는 workflow state, 허용 transition, phase/status mapping, DocMeta recipe id를 선언합니다. state recipe 본문은 코드에 하드코딩하지 않고 `docs/cli-surfaces/state/`, `docs/cli-surfaces/state-template/`의 외부 markdown에 둡니다. 프로젝트별 역할 policy는 홈 티켓 스토어에 둡니다.

CLI는 registry 파일이나 helper module 위에 얹힌 얇은 래퍼가 아닙니다. 티켓 문서를 실행하는 runtime adapter입니다. 각 명령 실행이 workflow state를 계산하고, 티켓 본문의 DocMeta 계약을 갱신하며, frontmatter에는 작은 상태 요약만 mirror하고, registry 및 ticket-store context를 붙이고, approval-aware workflow gate를 강제합니다. durable ticket document가 DocMeta 계약이고, CLI surface는 그 계약의 projection입니다.

CLI는 에이전트가 prose에서 state를 추론하게 두지 않습니다. `ticket use`, `ticket guard`, `ticket move`, `ticket status` 같은 명령은 현재 티켓 state를 계산하고, 요청된 transition을 graph에 대조해 검증한 뒤, 다음 행동에 필요한 compact DocMeta action surface를 출력합니다.

### 티켓 문서 레이아웃

티켓은 사람이 읽는 작업 문서이면서 durable DocMeta 계약입니다. 이 두 역할을 거대한 frontmatter 객체 하나로 합치면 사람이 추적하기 어려워지고 승인 표면이 길어집니다.

frontmatter는 인덱스 헤더만 담당합니다. 티켓 목록과 diff를 사람이 바로 읽을 수 있도록 작게 유지합니다.

```yaml
id: example
phase: 1
status: open
workflowSource: ticket-create
docmetaStatus: transition_blocked
docmetaTarget: phase2
docmetaValidation: NEEDS_FIX
docmetaErrors:
  - userApproval
```

전체 계약은 티켓 본문의 마지막 섹션인 `## DocMeta` 아래에 둡니다.

````markdown
## DocMeta

```yaml
document_type: ticket_validation
document_subtype: ticket_workflow_transition_gate
contract_version: documeta-0.1
source_contract:
  required_slots:
    - phase1Plan
    - userApproval
validation:
  status: NEEDS_FIX
  errors:
    - userApproval
output_status: transition_blocked
```
````

frontmatter는 indexing, list/status filtering, 사람의 빠른 스캔을 위한 영역입니다. 본문 하단 `## DocMeta` 블록은 validation contract, slot, source map, policy metadata, output status, adapter eligibility의 원본입니다. CLI 명령은 하단 DocMeta를 먼저 갱신하고, frontmatter에는 요약 필드만 mirror합니다. 전체 `docmeta` 객체를 frontmatter에 저장하면 안 되며, `## DocMeta`는 티켓의 마지막 섹션으로 유지합니다.

## 5. DocMeta 중심 Flow 파이프라인

DeukAgentFlow는 티켓 워크플로우 제약을 긴 사용자-facing 설명이 아니라 문서 메타데이터로 다룹니다. 이는 문서 파이프라인의 DocuMeta 모델과 같습니다. 먼저 슬롯, 근거, 검증 정책, 출력 상태를 고정하고, 각 어댑터가 그 메타를 읽어 다음 산출물을 만듭니다.

런타임 파이프라인은 다음과 같습니다.

```text
Ticket workflow state
  -> state recipe DocMeta
  -> document policy as DocMeta
  -> validation gate as DocMeta
  -> compact user/agent action surface
  -> durable ticket/index/telemetry update
```

계층별 책임은 분리됩니다.

| Layer | Role | Default visibility |
|-------|------|--------------------|
| State recipe | 현재 state에서 필요한 즉시 실행 명령 또는 슬롯 | Visible |
| Template | 에이전트가 추가 파일 읽기 없이 바로 쓰는 state-bound 실행 recipe | Visible when needed |
| Policy | state 해석 정책과 위반 금지 조건 | DocMeta/internal by default |
| Runtime context | ticket id, phase/status, workspace, path, blockers | DocMeta/internal by default |
| Validation gate | required slots, source map, pass/fix decision | Compact result; full JSON on request |

Policy와 검증 게이트는 매 transition마다 문서처럼 길게 출력하지 않습니다. 이들은 CLI가 읽고 평가하는 메타 계약입니다. 상세 확인이 필요할 때만 `--verbose`, `--status-detail`, JSON 출력으로 전체 계약을 드러내고, 기본 표면은 다음 행동과 검증 결과만 짧게 출력합니다.

검증 DocMeta 형태는 문서 워크플로우를 따릅니다.

```yaml
document_type: ticket_validation
document_subtype: ticket_workflow_transition_gate
source_contract:
  required_slots:
    - phase1Plan
    - userApproval
slots:
  phase1Plan: true
  userApproval: true
slot_source_map:
  phase1Plan:
    source: ~/.deuk-agent/tickets/{uuid}/main/example.md
  userApproval:
    source: explicit user approval
validation:
  status: PASS
  errors: []
output_status: transition_allowed
```

이 구조는 workflow를 결정적으로 만듭니다. Template은 state-bound 실행 재료로 남고, policy는 DocMeta로 남으며, validation gate는 구조화된 pass/fix 데이터를 반환하고, 사용자에게 보이는 표면은 에이전트가 즉시 행동할 수 있을 만큼 작게 유지됩니다.

문서 쓰기, DocMeta 검증, evidence check, lifecycle service, compact surface rendering을 분리하는 리팩터링 계획은 [Ticket Lifecycle Separation Plan](ticket-lifecycle-separation-plan.md)을 기준으로 진행합니다.

## 6. 스토리지 레이아웃

DeukAgentFlow는 두 곳의 저장 위치만 사용합니다. 다른 위치는 일절 사용하지 않습니다.

### 홈 티켓 스토어 (`~/.deuk-agent/`)

모든 영구 상태는 사용자 홈 디렉터리에 저장됩니다. 모든 워크스페이스가 공유합니다.

```
~/.deuk-agent/
  tickets/
    {uuid}/                   # 등록된 워크스페이스당 디렉터리 하나
      workspace.json          # 워크스페이스 경로 + 이름
      INDEX.json              # 활성 티켓 id + 다음 seq
      main/                   # 열린 티켓
        {id}.md
      archive/                # 닫힌 티켓
      scratch/                # 초안
      wp-{WorkspaceName}      # 심볼릭 링크 → 워크스페이스 루트
  skills/                     # 사용자 fork 스킬
  skills.json                 # 스킬 레지스트리
```

`PROJECT_RULE.md`와 `project-memory.md`는 티켓 디렉터리(예: `~/.deuk-agent/tickets/{uuid}/PROJECT_RULE.md`) 안에 위치합니다. 워크스페이스에는 저장하지 않습니다.

### 워크스페이스 마커 (`.deuk-workspace-id`)

등록된 워크스페이스 루트에는 정확히 파일 하나만 존재합니다.

```
{workspace-root}/
  .deuk-workspace-id          # ~/.deuk-agent/tickets/{uuid}/를 가리키는 UUID 텍스트
```

이 파일이 DeukAgentFlow가 워크스페이스에 기록하는 유일한 아티팩트입니다. VS Code 확장과 CLI는 이 파일로 워크스페이스를 탐색하고 올바른 홈 티켓 디렉터리를 찾습니다.

워크스페이스 디렉터리에는 **이 외에 아무것도** DeukAgentFlow 관련 파일이 있어서는 안 됩니다. 특히 워크스페이스 내 `.deuk-agent/` 디렉터리는 레거시이므로 반드시 제거해야 합니다.
