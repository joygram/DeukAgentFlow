---
name: context-recall
summary: 🧠 RAG를 소스 오브 트루스로 삼지 않고 이전 티켓·룰 메모리를 재사용.
category: memory
bind: phase1
---

# Context Recall

Authority: follow `core-rules/AGENTS.md`, the active ticket APC, Phase Gate, and `PROJECT_RULE.md`.

Use this skill when a task repeats a failure family, references prior decisions, asks why something happened, or crosses old tickets/rules.

## Micro-Protocol

1. Read current local source, project rules, and active ticket first.
2. Ask DeukAgentContext one narrow query naming the project, symbol, file, command, or failure mode.
3. Treat stale, duplicate, placeholder, or unrelated hits as weak evidence.
4. Put useful recall into the ticket as evidence, not chat narration.
5. If local analysis produces reusable current knowledge after a miss, add one knowledge record.

## Stop Conditions

- Two weak or stale recall attempts for the same question.
- RAG conflicts with current local source.
- Recall would expand scope beyond the active ticket.
- The remembered fix path bypasses current generated/source, parity, or verification rules.
