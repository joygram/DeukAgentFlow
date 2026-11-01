<!-- Generated from docs/assets/publication-docs.json -->
# How it works

## Behavior-steering sequence

- Request → capture goals, change boundaries and completion criteria in a ticket.
- Relevant skills → apply pre-execution checks and procedural criteria.
- Stage-specific roles → planning, design, implementation, QA and closeout perspectives.
- Execute and verify → compare actual results with criteria; correct failures and recheck.
- Handoff → carry decisions, evidence and remaining risks into the next task.

## Three axes

| Axis | Responsibility | Outcome |
|---|---|---|
| Flow | Tickets, approval, state, verification | Preserved scope and handoff |
| Skill | Task procedures and checks | Less guessing and unnecessary change |
| Persona | Expression and situational responses | Consistent conversation |

- Role = stage-specific expertise; independent of Persona.
- Instructions steer inference-time behavior; no model retraining.

## Rule delivery

- Shared rules = home-based core rules; project rules = workspace `PROJECT_RULE.md`.
- Client entry points = pointers to shared rules and CLI state surfaces.
- State transitions and evidence requirements owned by CLI; prompts guide actions in the current state.
- Skill installation and exposure owned by registry; client directories contain deployed artifacts.

## Storage

| Location | Contents |
|---|---|
| `~/.deuk/tickets/{uuid}/` | Workspace tickets and indexes |
| `~/.deuk/skills.json` | Installation and per-platform exposure |
| `.deuk-workspace-id` | Workspace identity |
| `templates/skills/` | Package skill sources |

## Execution path

- Default CLI = compiled entry point in the installed package.
- Local source opt-in = `DEUK_AGENT_FLOW_USE_LOCAL=1`; no automatic source priority.
- Source = TypeScript; runtime artifacts = `scripts/out/scripts/`.
- [Architecture](../architecture/architecture.md) · [Skills](skills-guide.md).
