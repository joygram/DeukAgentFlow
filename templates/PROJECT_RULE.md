# Project Rules

> Rule gate: every ticket's plan body MUST cite at least one rule id below (e.g. `[DR-01]`).
> One rule per line: `- [ID] @stage,stage 지시문`. Ids look like `[DR-01]`, `[SEC-12]`, `[DC-01]`.
> Stages are `start`, `create`, `modify`. A rule with no stage is never surfaced by `coding step`.
> Write rules with `deuk-agent-flow rule add` — this file is CLI output, not a hand-edited document.

## Rules (id-based)

- [DR-01] @start 승인된 티켓 범위 안에서 작업한다.
- [DR-02] @modify 생성 파일은 직접 고치지 말고 소스를 고쳐 빌드로 갱신한다.
- [DR-03] @create,modify 같은 개념·식별자·분기 기준을 두 곳에 쓰지 마라. 이미 정의된 곳이 있으면 그것을 쓴다.
- [DR-04] @start,create,modify 손대기 전에 이 작업의 설계 정본을 확인한다. 어긋나면 멈추고 승인받아 정본을 먼저 고친다.
- [DC-HALT] @modify 인프라 에러는 멈추고 사용자에게 보고한다.
- [DC-INFRA] @modify 인프라 코드는 티켓 스코프에 명시된 경우만 고친다.
