---
architecture_docs: ""
---

# Project Rules

## Architecture Boundaries

> [!NOTE] **To AI Agents**
> If `architecture_docs` is empty and no rules are defined below,
> this project has no architecture rules yet.
> → Ask user to define them, or analyze codebase and propose a draft.
> → Do NOT make assumptions about project architecture.

### Module Ownership
<!-- Define which modules exist and who owns them -->
| Module | Owner | Editable |
|--------|-------|----------|
| `src/` | Core source | Yes |

### Dependency Direction
<!-- Define allowed dependency directions between modules -->

## DC-CODEGEN: Generated File Mapping

> [!IMPORTANT] **REQUIRED**
> Agents use this table to decide which files are safe to edit.
> Files not listed here → agent MUST ask user before editing.

| Generated (DO NOT EDIT) | Source (edit here) | Build command |
|-------------------------|-------------------|---------------|
| `dist/` | `src/` | `npm run build` |

## DC-* Guards (project-specific)

| Guard | Condition → Action |
|-------|-------------------|
| DC-HALT | Infrastructure error → stop, no bypass, report to user. |
| DC-INFRA | Bootstrap/transport/DB/routing code → separate ticket + approval. |

## Build & Test

| Action | Command |
|--------|---------|
| Build | `npm run build` |
| Test | `npm test` |
| Lint | `npx deuk-agent-rule lint:md` |
