# CLI Surfaces

**CLI state definitions and ticket surfaces.** Runtime global and spoke pointer templates are
packaged under [`../../core-rules/cli-surfaces/`](../../core-rules/cli-surfaces/).

## Structure

```
cli-surfaces/
├── state/           ← Live state output templates (what the CLI prints)
├── state-template/  ← Authoring templates for new states
└── *.md             ← Surface-specific documentation
```

## Key Files

| File | Description |
|------|-------------|
| [ticket-create.md](ticket-create.md) | Ticket create surface spec |
| [ticket.md](ticket.md) | Ticket display surface spec |

## When to read

- Before modifying what the CLI prints to the agent
- When adding a new IDE surface or pointer type
- When debugging unexpected CLI output format
