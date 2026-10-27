# Ticket Create Guide

## Agent Action Rule
**아래 템플릿을 채워 그 본문을 stdin으로 흘려보내 생성하라 — 파일을 저장하지 않으므로 경로도 셸 이스케이프도 없다:**
1. 아래 `Ticket Body Template`을 복사한다(templates/TICKET_TEMPLATE.ko.md와 동일).
2. 각 `{{ ... }}`를 실제 조사 결과로 바꾼다.
3. 채운 본문을 `--plan-body-file -`로 stdin에 파이프한다(heredoc). 티켓 본문을 파일로 저장하지 않는다 — scratchpad 같은 임시 경로에 만들면 CLI(다른 프로세스)가 못 읽는다.

제목·요약은 본문에서 온다 — 첫 `# 제목` 헤딩이 title, 그 아래 문단이 summary가 되어 CLI가 frontmatter에 채운다. `--title`은 슬러그를 오버라이드하고 싶을 때만 준다.

## CLI Command
```bash
deuk-agent-flow ticket create \
  --workspace <workspace-id> \
  --group main \
  --type <type> \
  --plan-body-file - \
  --non-interactive <<'TICKET'
# <제목>

<요약 문단>

## Scope
...
TICKET
```

## Option Fill Guide
- `--workspace`: 대상 티켓을 만들 등록 workspace id 또는 alias입니다.
- `--group`: 새 루트 원인/행동이면 `main`, 승인된 큰 작업의 세부 조각이면 `sub`입니다.
{{REQUIRED_FLAGS}}
- `--plan-body-file -`: 채운 본문을 stdin으로 받습니다(`-` = stdin). CLI는 본문에 안 채워진 `{{ }}`가 남았는지만 검사합니다(마크다운 헤딩 구조는 검사하지 않습니다). 리포 내부 상대경로 파일도 받지만, 임시(scratchpad) 경로는 프로세스 경계를 못 넘으니 stdin을 쓰세요.

## Ticket Body Template
{{TICKET_TEMPLATE}}
