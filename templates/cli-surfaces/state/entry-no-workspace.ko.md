워크스페이스 미지정. 워크스페이스는 레지스트리에서 --workspace 로만 해소된다. 등록된 워크스페이스 {{WORKSPACE_COUNT}}개 — 하나를 고른다:
{{WORKSPACE_LIST}}

이후 티켓 명령에 --workspace <id> 를 넘긴다. 예:
```bash
deuk-agent-flow rules ticket --workspace {{FIRST_WORKSPACE}}
```

티켓을 CREATE 하려면 템플릿을 채워 본문을 stdin으로 흘려보낸다. 정본:
1. 템플릿 복사: templates/TICKET_TEMPLATE.ko.md
2. 각 `{{ ... }}`를 실제 내용으로 바꾼다.
3. 채운 본문을 `--plan-body-file -`로 stdin에 파이프한다(heredoc). 파일로 저장하지 않는다 — 임시(scratchpad) 경로는 CLI가 못 읽는다.
```bash
deuk-agent-flow ticket create \
  --workspace {{FIRST_WORKSPACE}} \
  --group main \
  --plan-body-file - \
  --non-interactive <<'TICKET'
# <제목>

<요약 문단>

## Scope
...
TICKET
```
제목·요약은 본문에서 온다(# 제목→title, 그 아래 문단→summary). CLI는 안 채워진 `{{ }}`가 남았는지만 검사한다. --plan 섹션에는 PROJECT_RULE.md의 룰 id(예: DR-01)를 최소 하나 인용한다.
