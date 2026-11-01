---
name: deuk-agent-flow
description: >-
  Ticket-based guardrails for coding agents.
  Use when changing code within a fixed scope, continuing work in a new session,
  or when completion must rest on verification evidence instead of self-report.
  The same ticket is shared across Claude Code, Codex, Cursor and Copilot.
license: Apache-2.0
---

# Deuk Agent Flow

- Purpose = keep the agent inside the agreed scope and close work only with evidence.
- Works across clients = the same ticket continues in Claude Code, Codex, Cursor or Copilot.

## Setup

- Requires Node.js 20+ and npm.
- Network = one npm install from the public registry.
- Optional = ticket sync to a user-set `pipelineUrl` (`remoteSync`) and reachability check of a user-set MCP URL; both off by default.

```bash
npm install -g deuk-agent-flow
deuk-agent-flow init
```

- Run `init` from the project root and pick the agent clients in use.
- Package source = https://github.com/joygram/DeukAgentFlow (Apache-2.0).

## Every turn

1. Run `deuk-agent-flow rules` and follow the verdict it prints.
2. Pass `--workspace <name>` explicitly; list names with `deuk-agent-flow workspace list`.
3. Use the CLI for ticket state; do not hand-edit ticket files.

## Workflow

1. Request → create a ticket with goal, scope, plan and completion criteria.
2. Show the plan; wait for the user to say "approved".
3. Approved → `deuk-agent-flow ticket move --id <id> --phase 2 --approval approved`.
4. Implement inside the ticket scope only; no unrelated renames or sweeps.
5. Verify by running the real check (test, build, app); record command and output.
6. Close with `deuk-agent-flow ticket close --id <id>`; the CLI refuses empty evidence.
7. Next session → "continue the current ticket"; read state with `ticket status`.

## Stop conditions

- No approved ticket for the change.
- The edit crosses modules outside the ticket scope.
- Verification cannot run; report it as unverified instead of claiming done.
- Target is a generated file; edit its source and rebuild instead.

## Reports

- Report what was seen, done and produced; mark anything unchecked as unverified.
- Keep the user's language for all messages.

## References

- [safe-refactor](references/safe-refactor.md) = minimal, scoped refactors.
- [generated-file-guard](references/generated-file-guard.md) = route edits to sources.
