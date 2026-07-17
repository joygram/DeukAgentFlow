# Project Rules

> Rule gate: every ticket's plan body MUST cite at least one rule id below (e.g. `[DR-01]`).
> One rule per line: `- [ID] description`. Ids look like `[DR-01]`, `[SEC-12]`, `[DC-01]`.

## Rules (id-based)

- [DR-01] 승인된 티켓 범위 안에서만 작업하고, 생성물은 소스에서 갱신한다.
- [DR-02] 생성 파일(dist/, *.generated.*)은 직접 편집하지 않고 소스+빌드로 갱신한다.
- [DR-03] 같은 개념·식별자·분기 기준은 한 곳에서만 정의한다(SSOT). 중복·내부 드리프트 금지.
- [DR-04] 코드를 수정하기 전에 해당 동작을 규정하는 정본문서(SSOT)를 먼저 확인하고, 정본문서가 코드와 불일치하면 STOP·사용자 승인 후에만 정본문서를 최신화(정본화)한다.
- [DC-HALT] 인프라 에러는 멈추고 우회 없이 사용자에게 보고한다.
- [DC-INFRA] 부트스트랩/전송/DB/라우팅 코드는 별도 티켓+승인으로 다룬다.
