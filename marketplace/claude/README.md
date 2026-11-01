# Deuk Agent Flow plugin

- Ticket-based guardrails for coding agents.
- Keeps work inside an approved scope; closes only with verification evidence.
- One ticket carries plan, approval, checks and handoff across Claude Code, Codex, Cursor and Copilot.

## Install

```bash
claude plugin marketplace add joygram/DeukAgentFlow
claude plugin install deuk-agent-flow@deuk-family
```

- The skill installs the `deuk-agent-flow` CLI from npm on first use (Node.js 20+).
- Network = npm registry for install.
- Optional = ticket sync to a user-set `pipelineUrl` and MCP URL check; both off by default.

## Data handling

- Tickets stay local in `~/.deuk/tickets/`.
- No personal data collected; telemetry stays local unless the user runs `telemetry sync`.

## License

- Apache-2.0 · Source: https://github.com/joygram/DeukAgentFlow
