활성 티켓이 없습니다. 요청을 먼저 분석한 뒤, 티켓 템플릿을 채워 그 본문을 stdin으로 흘려보내 생성하세요.

1. 템플릿을 복사합니다: templates/TICKET_TEMPLATE.ko.md
2. 각 `{{ ... }}` 자리를 실제 내용으로 바꿉니다.
3. 채운 본문을 `--plan-body-file -`로 stdin에 파이프합니다(heredoc). 티켓 본문을 파일로 저장하지 마세요 — scratchpad 같은 임시 경로는 CLI(다른 프로세스)가 못 읽습니다.

```bash
deuk-agent-flow ticket create \
  --workspace {{WS_NAME}} \
  --group main \
  --plan-body-file - \
  --non-interactive <<'TICKET'
# <제목>

<요약 문단>

## Scope
...
TICKET
```

제목·요약은 본문에서 옵니다 — 첫 `# 제목` 헤딩이 title, 그 아래 문단이 summary가 됩니다. CLI는 본문에 안 채워진 `{{ }}`가 남았는지만 검사합니다. plan 섹션에는 PROJECT_RULE.md의 룰 id(예: DR-01)를 최소 하나 인용하세요.
