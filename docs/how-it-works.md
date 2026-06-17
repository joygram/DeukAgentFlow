# How It Works

DeukAgentRules operates as an **AI Engineering Orchestration Protocol**. It coordinates how agents perceive, analyze, and modify your codebase using a centralized rule hub and a high-performance CLI.

## 1. Hub-Spoke Execution Model

In v3.0, rule files are no longer monolithic. We use a **Hub-Spoke** model to minimize context bloat.

- **Global Hub (`AGENTS.md`)**: The central canonical project rule document.
- **Local Hub (`PROJECT_RULE.md`)**: Project-specific rules that override or augment the global hub.
- **Spokes (`.cursor/rules/*.mdc`, etc.)**: Minimal entry points that tell the agent to read the Hubs.
- **Why**: This ensures the agent always sees the latest rules without duplication errors across different IDEs.

## 2. Global CLI Proxy

The CLI (`deuk-agent-rule`) uses a **Source Sovereignty** mechanism.

- When you run `npx deuk-agent-rule`, the binary checks if you are inside a workspace containing the project's source code.
- If a local source is detected, it **routes execution** to the local script.
- This ensures that your agents are always using the latest uncommitted rules during development.

## 3. Initialization Lifecycle

Running `deuk-agent-rule init` triggers the following lifecycle:

1. **Legacy Purge**: Physically removes old v1/v2 configuration files.
2. **Submodule Vacuum**: Cleans up empty submodule directory stubs and orphaned entries in `.gitmodules`.
3. **Smart Backup**:
   - Analyzes legacy files (like `.cursorrules`).
   - If user-added custom rules are found, it creates a `*.bak` file.
   - If only system-generated content is found, it deletes the file.
4. **Hub Sync**: Deploys the latest `AGENTS.md` and generates thin Spokes for all supported agents.

## 4. Repository Roles & Files

| Path | Role |
|---|---|
| `AGENTS.md` | The Sovereign Rule Hub (Canonical truth) |
| `PROJECT_RULE.md` | Local project-specific rule overrides |
| `.deuk-agent/config.json` | Project-specific initialization state |
| `.deuk-agent/tickets/` | Bounded execution contracts (Work orders) |
| `.deuk-agent/templates/` | Standardized blueprint for tickets and plans |
| `bin/deuk-agent-rule.js` | The Global Execution Proxy |

## 5. Strict Phase-Driven Workflow (TDW)

1. **Issue Ticket (Phase 1)**: `ticket create` or an existing ticket defines the target scope. Use `--summary` plus `--plan-body` to place a filled Phase 1 body directly inside the ticket, and prefer `--require-filled` when you want placeholder tickets to fail fast instead of looping. If `ticket next` finds no active/open ticket, inspect recent git history before creating a follow-up ticket.
2. **APC and Main Ticket Record**: Before modifying code, the agent fills the APC (Agent Permission Contract) blocks `[BOUNDARY]`, `[CONTRACT]`, and `[PATCH PLAN]` inside the main ticket. The main ticket owns scope, contract, lifecycle checks, execution planning, and verification outcomes. Never move execution logs, command transcripts, completion summaries, or verification results into planning prose.
3. **Review Gate**: Issue/regression reports stop after Phase 1. The user reviews the ticket plan before execution; wording such as "fix" or "resolve" in the original issue is not approval to skip review.
4. **Phase Transition**: After the Phase 1 plan is reviewable and the user approves execution, run `ticket move` to transition to Phase 2 (Execute).
5. **Execute & Verify (Phase 2)**: Changes are made and verified within the isolated boundary.
6. **Knowledge Distillation Archive**: When archiving, core information is extracted (Zero-Token Distillation) to save context tokens for long-term memory.

## 6. Ticket Files in Git

Ticket files are part of the repository workflow, but they should not be handled like ordinary handwritten notes.

- Commit `.deuk-agent/tickets/INDEX*.json` together with the related ticket markdown changes. Leaving index updates behind can break state restoration in the next session.
- Treat ticket markdown under `.deuk-agent/tickets/**/*.md` as CLI-owned artifacts. If `ticket create` fails, do not create or repair the file manually.
- Editing ticket body content is fine while planning, but lifecycle state changes should go through `ticket move`, `ticket close`, and `ticket archive`, not direct frontmatter edits.
- `telemetry.jsonl` is typically operational output rather than durable project state. Unless your repository intentionally tracks it, keep it out of ordinary code commits.
- Prefer committing finished work after `ticket archive` so the ticket file move and archive index update stay in the same Git change.
- When reviewing Git changes, first ask whether each ticket-related diff came from an expected CLI lifecycle step. If not, reconcile with CLI commands before committing.

Useful quick checks:

```bash
git status --short
git diff -- .deuk-agent/tickets/INDEX.json
git diff -- .deuk-agent/tickets/INDEX.archive.*.json
```
