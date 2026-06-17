# DeukAgentFlow 실전 사용 가이드 (Practical Usage Guide)

이 가이드는 DeukAgentFlow를 실제 프로젝트에 배포하고 에이전트와 함께 효율적으로 사용하는 방법을 단계별로 설명합니다.

---

## 1. 워크스페이스 적용 모델 (Deployment)

DeukAgentFlow의 초기화 단위는 단순히 "현재 폴더 하나"가 아닙니다. 실제 운영은 보통 **workspace 루트 + 여러 프로젝트 루트 + 필요 시 중첩 프로젝트** 구조로 잡습니다.

예:

```text
~/workspace/
  AGENTS.md              # workspace 전체 포인터
  PROJECT_RULE.md        # workspace 기본 규칙
  DeukPack/
    AGENTS.md
    PROJECT_RULE.md
    .deuk-agent/
  DeukAgentContext/
    AGENTS.md
    PROJECT_RULE.md
    .deuk-agent/
  i/
    AGENTS.md
    PROJECT_RULE.md
    .deuk-agent/
    i_server/
      AGENTS.md
      PROJECT_RULE.md
      .deuk-agent/
```

이 모델에서 workspace 루트는 "공통 진입점"이고, 실제 작업 단위는 각 프로젝트의 `.deuk-agent/`입니다. 에이전트는 현재 CWD에서 가장 가까운 프로젝트 규칙과 티켓을 우선 사용합니다.

이렇게 사용하면 효과가 극대화됩니다.

- workspace 루트에는 공통 포인터만 둬서 어느 대화창에서 시작해도 같은 코어 규칙을 읽게 합니다.
- 각 프로젝트 루트에는 별도 `PROJECT_RULE.md`와 `.deuk-agent/`를 둬서 작업 맥락, 티켓, 검증 기록이 섞이지 않게 합니다.
- 서버/앱/패키지처럼 lifecycle이 다른 하위 폴더는 중첩 프로젝트로 초기화해 독립 티켓을 갖게 합니다.
- 에이전트에게는 긴 명령 대신 "진행", "다음", "원인", "정리"처럼 짧게 말하고, 에이전트가 현재 CWD 기준으로 맞는 프로젝트 티켓을 선택하게 합니다.
- 공통 규칙은 코어 허브에서, 프로젝트별 아키텍처/빌드/검증 규칙은 해당 프로젝트의 `PROJECT_RULE.md`에서 관리합니다.

### 적용 기준

| 위치 | 역할 | 초기화 여부 |
|---|---|---|
| workspace 루트 | 여러 프로젝트가 공유하는 포인터와 기본 규칙 | 선택 |
| 개별 프로젝트 루트 | 실제 작업 티켓, 로컬 규칙, 에이전트 포인터 | 권장 |
| 중첩 프로젝트 | 독립 배포/서버/앱처럼 별도 lifecycle이 있는 하위 프로젝트 | 필요 시 |
| generated/output 폴더 | 빌드 산출물 | 금지 |

### 1단계: 글로벌 설치
`npx` 캐시 문제를 피하고 어디서든 명령어를 사용할 수 있도록 글로벌 설치를 권장합니다.
```bash
npm install -g deuk-agent-flow
```

### 2단계: 프로젝트 루트 초기화
작업을 관리할 각 프로젝트 루트에서 초기화 명령을 실행합니다.

```bash
deuk-agent-flow init
```

이 명령은 다음 파일들을 생성/업데이트합니다:
- `PROJECT_RULE.md`: 현재 프로젝트의 고유 규칙 (전역 `AGENTS.md`를 오버라이드).
- `.deuk-agent/`: 티켓, 템플릿, 설정이 저장되는 디렉토리.
- `.cursor/rules/deuk-agent.mdc`, `GEMINI.md` 등: 각 에이전트 환경에 맞는 얇은 포인터 파일.

여러 프로젝트를 한 workspace에서 관리한다면 각 루트에서 반복 실행합니다.

```bash
cd ~/workspace/DeukPack && deuk-agent-flow init
cd ~/workspace/DeukAgentContext && deuk-agent-flow init
cd ~/workspace/i && deuk-agent-flow init
cd ~/workspace/i/i_server && deuk-agent-flow init
```

초기화 후에는 각 프로젝트의 `PROJECT_RULE.md`를 채워야 합니다. 기본 템플릿 상태라면 에이전트는 아키텍처를 임의로 추측하지 말고, 사용자에게 규칙 정의를 요청하거나 코드베이스 분석 초안을 제안해야 합니다.

---

## 2. 에이전트와 협업하기 (Daily Workflow)

에이전트에게 작업을 시킬 때는 **짧게 말하면 됩니다**. 티켓 생성과 Phase 전환은 에이전트가 내부적으로 처리하고, 사용자는 방향과 승인 여부에 집중합니다.

### 1단계: 티켓 생성 (Phase 1: Ticket + Plan)
에이전트에게 짧게 말해 작업을 시작합니다.
> "티켓 잡고 진행"

에이전트는 맥락에서 주제를 잡고, 내부적으로 티켓/APC/compact plan을 채웁니다. 사용자가 직접 `ticket create` 옵션을 외우거나 입력할 필요는 없습니다.

기존 작업을 이어받으려는데 `ticket next`가 진행 가능한 티켓을 찾지 못하면, 에이전트는 새 티켓을 즉시 만들지 않고 최근 git history를 먼저 분석해 실제 후속 작업 후보를 복원합니다. 새 티켓은 그 분석 근거를 메인 티켓의 compact plan에 기록한 뒤 생성합니다.

### 2단계: APC(Agent Permission Contract) 기록
생성된 티켓은 기본적으로 **Phase 1 (Ticket + Plan)** 상태입니다. 에이전트는 코드를 수정하기 전에 티켓 내의 APC 블록(`[BOUNDARY]`, `[CONTRACT]`, `[PATCH PLAN]`)을 채워야 합니다.

티켓은 스코프, 제약, APC 계약, 라이프사이클 체크, 검증 결과를 맡습니다. 실행 로그, 명령 transcript, 완료 요약, 검증 결과를 계획 문구와 섞지 않습니다.

사용자가 실행을 명확히 요청했고 Phase 1 기록이 완성되어 있으면, 에이전트가 내부적으로 Phase 승급을 시도합니다.
만약 APC나 compact plan이 비어있거나 불완전하다면, 에이전트는 코딩 전에 이를 먼저 채웁니다.

이슈/회귀/정책 위반을 제기한 경우에는 티켓 생성 직후 바로 실행하지 않습니다. 에이전트는 Phase 1에 원인 가설, 범위, APC, 패치 계획을 채운 뒤 멈추고 사용자의 검토 승인을 기다립니다. 원래 요청에 "수정", "해결"이 포함되어 있어도 티켓 계획을 본 뒤의 승인으로 보지 않습니다.

### 3단계: 작업 실행 (Phase 2: Execute)
티켓이 **Phase 2 (Execute)** 로 승급되면, 에이전트는 제한된 경계 내에서 코드를 수정하고 단위 테스트 등 검증 작업을 수행합니다.

### 4단계: 작업 완료 및 아카이빙
작업이 끝나면 정리만 짧게 요청하세요.
> "검증 기록하고 정리"

이때 아카이브 작업 중 **Zero-Token 지식 증류(Knowledge Distillation)**가 동작하여 불필요한 컨텍스트 토큰 소모를 줄이도록 핵심 정보만 압축되어 저장됩니다.

### 5단계: 티켓 파일 깃 관리
티켓 파일도 깃 기록의 일부이지만, 소스 코드처럼 무심코 다루면 active/archive 상태가 쉽게 꼬입니다.

- `ticket create`, `ticket move`, `ticket close`, `ticket archive`로 바뀐 `.deuk-agent/tickets/INDEX*.json`은 함께 커밋합니다. 티켓 본문만 커밋하고 index를 빼면 다음 작업에서 상태가 맞지 않을 수 있습니다.
- `.deuk-agent/tickets/**/*.md`는 CLI가 만든 결과만 따라갑니다. 티켓 생성이 실패한 뒤 파일을 손으로 만들거나 고치지 않습니다.
- 작업 중 티켓 본문을 다듬는 것은 괜찮지만, 상태를 바꿀 때는 frontmatter를 직접 고치지 말고 반드시 CLI를 사용합니다.
- `.deuk-agent/telemetry.jsonl`은 보통 실행 로그에 가깝기 때문에, 저장소 정책상 꼭 추적하는 경우가 아니라면 커밋 목록에 넣지 않는 편이 안전합니다.
- 작업을 끝냈다면 `ticket archive`까지 마친 뒤 커밋하는 편이 좋습니다. archive는 티켓 파일 위치와 archive index를 함께 정리하므로, 중간에 손으로 옮기면 기록 흐름이 흐려집니다.
- 여러 작업을 한 커밋에 섞지 말고, 가능하면 "코드 변경 + 해당 티켓 lifecycle 변경" 묶음으로 나눕니다.

빠르게 확인할 때는 아래 정도를 습관처럼 보면 좋습니다.

```bash
git status --short
git diff -- .deuk-agent/tickets/INDEX.json
git diff -- .deuk-agent/tickets/INDEX.archive.*.json
```

티켓 관련 변경이 보일 때는 "이 변경이 CLI lifecycle의 결과인가?"를 먼저 확인하세요. 아니라면 손으로 고치기보다 `ticket status`, `ticket list`, `ticket archive` 같은 명령으로 상태를 다시 맞추는 편이 안전합니다.

---

## 3. 에이전트 프롬프트 가이드 (Agent Prompting)

에이전트가 DeukAgentFlow 프로토콜을 엄격히 준수하도록 하려면 프로젝트 시작 시 짧은 지침이면 충분합니다.

> **에이전트 지침 예시:**
> "DeukAgentFlow 규칙을 따르고, 사용자의 짧은 지시를 티켓/Phase/검증 기록으로 처리해라. 코드 수정 전에는 APC와 계획을 먼저 남긴다."

### `/` 단축 명령

지원되는 에이전트에서는 짧은 요청을 slash command로 노출할 수 있습니다. 다만 모든 클라이언트가 같은 방식으로 커스텀 `/` 명령을 지원하지는 않으므로, 기본 UX는 짧은 자연어 요청으로 둡니다.

| 의도 | 자연어 fallback | slash 후보 |
|---|---|---|
| 다음 단계 | "다음" | `/next` |
| 티켓 시작 | "진행" | `/flow` |
| 원인 분석 | "원인" | `/inspect` |
| 검증/정리 | "정리" | `/closeout` |

권장 매핑:

- Claude Code: 프로젝트 `.claude/skills/<name>/SKILL.md` 또는 `.claude/commands/<name>.md`
- Cursor: 프로젝트 `.cursor/commands/<name>.md`
- VS Code Copilot: 프로젝트 `.github/prompts/<name>.prompt.md`
- Codex: 우선 짧은 자연어와 skill 호출을 사용하고, 커스텀 slash 표준이 확인되면 별도 노출

### 스킬 리스트와 기존 스킬 추가

스킬은 전체 workflow를 대체하지 않는 짧은 행동 playbook입니다. DeukAgentFlow에서는 티켓/APC/Phase Gate가 계속 상위 권한이고, 스킬은 특정 실패 패턴에서 에이전트의 움직임만 더 날카롭게 만듭니다.

`init`을 실행하면 first-party 스킬 원본은 `.deuk-agent/skill-templates/`로 동기화됩니다. 실제 장착은 프로젝트 성격에 맞게 `skill add`로 선택합니다.

기본 추천 장착:

| 스킬 | 이유 |
|---|---|
| `safe-refactor` | 대부분의 AI 코딩 사고가 과한 리팩터링과 범위 확장에서 시작하기 때문 |
| `generated-file-guard` | generated output 직접 수정은 리뷰와 재생성 단계에서 가장 자주 깨지기 때문 |

선택 장착:

| 스킬 | 쓸 때 |
|---|---|
| `context-recall` | 과거 티켓/결정/실패 패턴을 찾아야 할 때 |
| `project-pilot` | 다국어, generated/runtime, protocol, 반복 drift 리팩터링 |

사용자는 이렇게 짧게 말해도 됩니다.

| 하고 싶은 일 | 말하기 |
|---|---|
| 설치 가능한 스킬 보기 | "스킬 리스트" |
| 기존 스킬 추가 | "safe-refactor 추가" |
| Claude에 노출 | "스킬 Claude에 노출" |
| Cursor에 노출 | "스킬 Cursor에 노출" |

메인테이너/자동화에서는 CLI를 직접 사용할 수 있습니다.

```bash
deuk-agent-flow skill list
deuk-agent-flow skill add --skill safe-refactor
deuk-agent-flow skill add --skill generated-file-guard
deuk-agent-flow skill add --skill context-recall
deuk-agent-flow skill add --skill project-pilot
deuk-agent-flow skill expose --platform claude
deuk-agent-flow skill expose --platform cursor
```

`skill add`는 프로젝트의 `.deuk-agent/skills/<id>/SKILL.md`에 스킬을 설치하고, `skill expose`는 설치된 스킬을 Claude/Cursor가 읽을 수 있는 얇은 포인터로 노출합니다.

---

## 4. 팁 및 모범 사례

- **No Ticket, No Code**: 티켓 없이 코드를 수정하는 것은 금지됩니다. 사용자는 짧게 말하고, 에이전트가 티켓 기록을 남깁니다.
- **RAG 활용**: `mcp_deukcontext_search_*` 도구를 사용하여 과거 티켓이나 구현 사례를 검색하면 환각을 줄일 수 있습니다.
- **주기적 동기화**: 프로젝트 규칙이 변경되었다면 `deuk-agent-flow init`을 다시 실행하여 모든 에이전트 포인터를 갱신하세요.
