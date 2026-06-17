---
name: ticket-status-surface
summary: '🎫 티켓 상태는 카드 한 줄로 — 워크스페이스·상태·티켓 링크 항상 포함.'
category: surface
bind: rules
system: true
---

# Ticket Status Surface

티켓 상태를 말할 땐 CLI가 출력한 카드 한 줄을 **그대로** 쓴다. 합성하지 않는다.

```
📦 {workspace} · {🌱시작|🔍조회|📝조정|⚙️진행|✅완료|🎉종료} · [{ws}-{번호} {slug}]({링크})
```

티켓 링크는 절대 생략하지 않는다 — 링크가 없으면 사람이 티켓을 열어 리뷰·승인할 수 없다.
