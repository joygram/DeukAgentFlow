# DeukAgentRules 실전 사용 가이드 (Practical Usage Guide)

이 가이드는 DeukAgentRules를 실제 프로젝트에 배포하고 에이전트와 함께 효율적으로 사용하는 방법을 단계별로 설명합니다.

---

## 1. 프로젝트 초기화 (Deployment)

새로운 프로젝트나 기존 프로젝트에 DeukAgentRules를 적용하려면 다음 단계를 따르세요.

### 1단계: 글로벌 설치
`npx` 캐시 문제를 피하고 어디서든 명령어를 사용할 수 있도록 글로벌 설치를 권장합니다.
```bash
npm install -g deuk-agent-rule
```

### 2단계: 워크스페이스 초기화
프로젝트 루트 디렉토리에서 초기화 명령을 실행합니다.
```bash
deuk-agent-rule init
```
이 명령은 다음 파일들을 생성/업데이트합니다:
- `PROJECT_RULE.md`: 현재 프로젝트의 고유 규칙 (전역 `AGENTS.md`를 오버라이드).
- `.deuk-agent/`: 티켓, 템플릿, 설정이 저장되는 디렉토리.
- `.cursor/rules/deuk-agent.mdc`, `GEMINI.md` 등: 각 에이전트 환경에 맞는 얇은 포인터 파일.

---

## 2. 에이전트와 협업하기 (Daily Workflow)

에이전트에게 작업을 시킬 때는 항상 **티켓**을 기반으로 소통하세요.

### 1단계: 티켓 생성 (Phase 1: Ticket + Plan)
에이전트에게 다음과 같이 요청하여 작업을 시작합니다.
> 💬 "새로운 기능을 위한 티켓을 만들어줘. 주제는 'user-auth-impl'이야."

에이전트는 내부적으로 다음 명령을 실행합니다:
```bash
deuk-agent-rule ticket create --topic user-auth-impl --evidence "기존 auth 로직 분석 완료..."
```
이미 작성된 Phase 1 본문이 있다면 `--plan-body` 옵션으로 티켓 내부에 바로 넣을 수도 있습니다.

반복 생성과 자리표시자만 남는 루프를 막으려면, 아래처럼 **한 번에 끝나는 형태**를 기본으로 쓰는 편이 좋습니다.

```bash
npx deuk-agent-rule ticket create \
  --topic user-auth-impl \
  --summary "기존 auth 로직과 충돌하지 않는 신규 인증 흐름 정리" \
  --plan-body "$(cat <<'EOF'
# User auth implementation
## Agent Permission Contract (APC)
### [BOUNDARY]
- ...
### [CONTRACT]
- ...
### [PATCH PLAN]
- ...
## Compact Plan
- Finding: ...
- Approach: ...
- Verification: ...
## Problem Analysis
- ...
## Source Observations
- ...
## Cause Hypotheses
- ...
## Improvement Direction
- ...
## Audit Evidence
- ...
EOF
)" \
  --require-filled \
  --non-interactive
```

`--require-filled`를 붙이면 APC와 compact plan이 비어 있을 때 생성이 실패하므로, 에이전트가 placeholder를 고치느라 여러 번 반복하는 상황을 줄일 수 있습니다.

기존 작업을 이어받으려는데 `ticket next`가 진행 가능한 티켓을 찾지 못하면, 에이전트는 새 티켓을 즉시 만들지 않고 최근 git history를 먼저 분석해 실제 후속 작업 후보를 복원합니다. 새 티켓은 그 분석 근거를 메인 티켓의 compact plan에 기록한 뒤 생성합니다.

### 2단계: APC(Agent Permission Contract) 기록
생성된 티켓은 기본적으로 **Phase 1 (Ticket + Plan)** 상태입니다. 에이전트는 코드를 수정하기 전에 티켓 내의 APC 블록(`[BOUNDARY]`, `[CONTRACT]`, `[PATCH PLAN]`)을 채워야 합니다.

티켓은 스코프, 제약, APC 계약, 라이프사이클 체크, 검증 결과를 맡습니다. 실행 로그, 명령 transcript, 완료 요약, 검증 결과를 계획 문구와 섞지 않습니다.

사용자가 실행을 명확히 요청했고 Phase 1 기록이 완성되어 있으면, 에이전트가 다음 명령으로 Phase 승급을 시도합니다:
```bash
deuk-agent-rule ticket move --topic user-auth-impl
```
만약 APC나 compact plan이 비어있거나 불완전하다면, 에이전트는 코딩 전에 이를 먼저 채웁니다.

이슈/회귀/정책 위반을 제기한 경우에는 티켓 생성 직후 바로 실행하지 않습니다. 에이전트는 Phase 1에 원인 가설, 범위, APC, 패치 계획을 채운 뒤 멈추고 사용자의 검토 승인을 기다립니다. 원래 요청에 "수정", "해결"이 포함되어 있어도 티켓 계획을 본 뒤의 승인으로 보지 않습니다.

### 3단계: 작업 실행 (Phase 2: Execute)
티켓이 **Phase 2 (Execute)** 로 승급되면, 에이전트는 제한된 경계 내에서 코드를 수정하고 단위 테스트 등 검증 작업을 수행합니다.

### 4단계: 작업 완료 및 아카이빙
작업이 끝나면 에이전트에게 리포트 작성과 티켓 보관을 요청하세요.
> 💬 "작업 완료했어. 리포트 작성하고 티켓 아카이브해줘."

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

에이전트가 DeukAgentRules 프로토콜을 엄격히 준수하도록 하려면 프로젝트 시작 시 다음과 같은 **페르소나 주입(Persona Injection)**이 도움이 됩니다.

> **에이전트 지침 예시:**
> "너는 DeukAgentRules 프로토콜을 준수하는 시니어 엔지니어다. 모든 코드 수정 전에는 반드시 `ticket create` 또는 기존 티켓 선택을 통해 Phase 1 기록을 만들고, 티켓에는 APC 경계/계약과 compact plan을 담는다. 이슈/회귀/정책 위반 보고는 티켓 생성 후 Phase 1 계획을 사용자에게 검토받고, 승인 후에만 Phase 2로 승급한다. 작업이 완료되면 검증 결과를 티켓 또는 리포트에 기록하고 티켓을 `archive`해라. 규칙 파일인 `PROJECT_RULE.md`와 포인터가 가리키는 `AGENTS.md`를 항상 최우선으로 참조하라."

---

## 4. 팁 및 모범 사례

- **No Ticket, No Code**: 티켓 없이 코드를 수정하는 것은 금지됩니다. 작은 수정이라도 티켓을 생성하여 이력을 남기세요.
- **RAG 활용**: `mcp_deukcontext_search_*` 도구를 사용하여 과거 티켓이나 구현 사례를 검색하면 환각을 줄일 수 있습니다.
- **주기적 동기화**: 프로젝트 규칙이 변경되었다면 `deuk-agent-rule init`을 다시 실행하여 모든 에이전트 포인터를 갱신하세요.
