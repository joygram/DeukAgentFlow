# DeukAgentFlow Command Surface

## Core Rule Chunk
{{CORE:Entry Rule}}

## Command Surface Map
- `deuk-agent-flow rules`: print the current core `AGENTS.md` body.
- `deuk-agent-flow rules ticket`: print the ticket rules surface.
- `deuk-agent-flow rules --section <heading>`: print one core rule chunk.
- `deuk-agent-flow ticket create`: print the ticket creation recipe plus rendered ticket template when required inputs are missing.
- `deuk-agent-flow ticket use --id <ticket-id>`: select a durable ticket and print the next state-machine gate.
- `deuk-agent-flow ticket move --phase 2 --approval approved`: approved reviewed tickets enter execution immediately.
- `deuk-agent-flow ticket status --id <ticket-id> --status-detail`: inspect phase/status with reasons.
- `deuk-agent-flow ticket close --id <ticket-id>`: write result evidence before completion.
- `deuk-agent-flow init`: install or refresh local pointers and hooks from the current workspace.

## Locator Fallback
`deuk-agent-flow rules path --path-only` remains only a path locator. The default rule-loading command is `deuk-agent-flow rules`.

## Common Flags
- `--workspace <name>`: explicit sibling workspace target.
- `--docs-language <auto|ko|en>`: localized CLI-owned guide language.
- `--json`: machine-readable output where supported.
- `--non-interactive`: no prompt mode for agents/scripts.
