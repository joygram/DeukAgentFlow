# Ticket Workflow 템플릿: approval

- 사용자가 승인 의사를 명확히 보내기 전에는 실행 컨텍스트를 열지 않습니다.
- 한국어/영어 승인 표현을 모두 승인 의사로 해석합니다.
- 승인 전에는 실행 승인 플래그가 포함된 명령 예시를 사용자 표면에 노출하지 않습니다.

## 승인 후 게이트

사용자가 승인 의사를 보낸 뒤에만 다음 게이트를 실행합니다.

```bash
deuk-agent-flow ticket move \
  --id {{TICKET_ID}} \
  --phase 2 \
  --approval approved \
  --non-interactive
```

- 이 명령 성공 후 CLI가 출력하는 다음 상태 표면을 따릅니다.
- 닫기/아카이브/후속 티켓 판단은 phase 상태 표면과 completion policy에 맡깁니다.
