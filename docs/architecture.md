<!-- Generated from docs/assets/publication-docs.json -->
# Architecture

## Component contracts

| Component | Responsibility |
|---|---|
| CLI | Workspace, ticket state, transitions, required evidence |
| Rule hub | Shared rules and project-specific criteria |
| Skill | Task procedures and checks |
| Role | Stage-specific artifacts and expertise |
| Persona | Conversational expression and situational response |

## Data flow

- User request → ticket goals, scope and completion criteria.
- CLI state → actionable rules, skills and role surface.
- Execution result → evidence, corrections and rechecks.
- Completion → preserved risks, follow-ups and handoff.

## Rules and storage

- Core rules = shared hub; `PROJECT_RULE.md` = workspace rules.
- Client entry points = thin pointers to the hub and CLI.
- Home state = `~/.deuk/`; tickets = `~/.deuk/tickets/{uuid}/`.
- Workspace selection = registry and explicit `--workspace`; separate from cwd inference.
- Skill installation/exposure = `~/.deuk/skills.json`; deployed copies are derivatives.

## State and DocMeta

- Transition authority = CLI state declarations and resolver; separate from prompt wording.
- Ticket frontmatter = compact state and index summary.
- Final body section `## DocMeta` = required slots, provenance and validation contract.
- Planning, design, execution, QA and closeout = stage-specific responsibilities; document reconciliation part of closeout.
- [State surface contract](state-surface-contract.md) · [Role design](role-layer.md).

## Runtime and distribution

- Source = `scripts/*.ts`; compiled output = `scripts/out/scripts/`.
- Default runtime = installed package; local source opt-in = `DEUK_AGENT_FLOW_USE_LOCAL=1`.
- `init` reapplies installed rules and pointers; package upgrading is separate.
- [How it works](../guides/how-it-works.md) · [Visual and publication contract](readme-visual-design.md).
