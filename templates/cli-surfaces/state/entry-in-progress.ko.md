Active ticket: {{TICKET_DISPLAY}}
🛎️ **진행 중인 티켓이 있다. 새 사용자 지시가 있으면 이 티켓을 이어서 작업하라.**

이 표면은 대기 안내가 아니라 현재 작업 맥락이다.
- `진행`, `이어서 진행`, `다음 진행`, `핫픽스`, `수정해`처럼 새 작업을 명시하면 즉시 현재 티켓의 범위와 계획을 읽고 작업을 시작한다.
- 새 지시가 없고 단순히 상태를 확인한 경우에만 현재 티켓과 다음 행동을 보고하고 기다린다.
- 같은 티켓을 이어서 작업할 때 `ticket use`를 반복 호출하지 않는다. 필요한 경우에만 티켓 본문과 설계를 읽는다.
- 활성 티켓이 있다는 이유만으로 파일 읽기·조사·구현을 금지하지 않는다. 새 지시가 있으면 티켓 범위 안에서 진행한다.

If you need the full ticket context (plan, evidence slots):
```bash
deuk-agent-flow ticket use --id {{TICKET_ID}} --non-interactive
```
{{PHASE_ADVANCE}}
