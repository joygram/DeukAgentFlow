# How It Works

DeukAgentFlow operates as an **AI Engineering Orchestration Protocol**. It coordinates how agents perceive, analyze, and modify your codebase using a centralized rule hub and a high-performance CLI.

## 1. Hub-Spoke Execution Model

In v3.0, rule files are no longer monolithic. We use a **Hub-Spoke** model to minimize context bloat.

- **Global Hub (`AGENTS.md`)**: The central canonical project rule document.
- **Local Hub (`PROJECT_RULE.md`)**: Project-specific rules that override or augment the global hub.
- **Spokes (`.cursor/rules/*.mdc`, etc.)**: Minimal entry points that tell the agent to read the Hubs.
- **Why**: This ensures the agent always sees the latest rules without duplication errors across different IDEs.

## 2. Global CLI Proxy

The CLI (`deuk-agent-flow`, with `deuk-agent-rule` kept for compatibility) uses a **Source Sovereignty** mechanism.

- When you run `npx deuk-agent-flow`, the binary checks if you are inside a workspace containing the project's source code.
- If a local source is detected, it **routes execution** to the local script.
- This ensures that your agents are always using the latest uncommitted rules during development.

## 3. Initialization Lifecycle

Running `deuk-agent-flow init` triggers the following lifecycle:

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
| `templates/` | Package-owned SSoT for ticket, rule, and skill templates |
| `bin/deuk-agent-flow.js` | The Global Execution Proxy |

## 5. Ticket Workflow: CLI-Owned State Table

DeukAgentFlow treats the ticket workflow as a local state table rather than a set of loose help text and phase flags. It is not a general workflow runtime. The CLI owns state, transitions, recipe assembly, and DocMeta validation.

That ownership is end-to-end, not rhetorical. The CLI surface is the workflow runtime: it emits the prompt seen by the agent, resolves registry and ticket-store context, attaches project/RAG context, and decides which approval gate or next state is valid. Ticket markdown and registry storage are durable artifacts for the runtime, not a parallel workflow authority.

| Layer | Source of truth | Runtime role |
|---|---|---|
| Workflow declaration | `scripts/ticket-workflow.mjs` | Declares states, phase/status metadata, allowed transitions, recipe ids, template ids, and project policy roles |
| State prompts | `docs/cli-surfaces/state/*.md` | Tells the agent what the current state means |
| State templates | `docs/cli-surfaces/state-template/*.md` | Shows the write slots and exit condition for that state |
| Project policies | `.deuk-agent/project-guardrails/*.md` | Adds role-specific project constraints such as analysis, coding, debugging, approval, and completion |
| Durable record | `.deuk-agent/tickets/**/*.md` | Stores the scoped ticket record, evidence, body `## DocMeta` contract, and compact frontmatter summary |

The CLI builds one DocMeta state surface when an agent enters or inspects a state:

```text
Ticket workflow state
  -> localized state recipe
  -> project policy metadata
  -> source contract
  -> compact flow:[workspace:state] action line
```

This is why `deuk-agent-flow rules ticket --workspace <workspace-id>` prints a combined ticket rule surface instead of asking the agent to manually read several files. It is also why `ticket use`, `ticket status`, `ticket move`, and `ticket guard` should be treated as state-machine commands, not as generic helpers.

### Transition Engine

Ticket state changes are resolved by the workflow transition resolver:

1. Read the current ticket `phase/status` from frontmatter.
2. Map it to a workflow state such as `phase1`, `phase2`, `phase3`, or `phase4`.
3. Resolve the requested target state from `--next`, `--phase`, or an explicit gate such as `phase2`.
4. Reject transitions that are not declared in the workflow state table.
5. Return the target `phase/status` and let the command update the ticket file and index.

Examples:

| Current | Command intent | Workflow transition | Result |
|---|---|---|---|
| `phase1/open` | approved execution | `phase1 -> phase2` | `phase=2`, `status=active` |
| `phase2/active` | next | `phase2 -> phase3` | `phase=3`, `status=active` |
| `phase3/active` | close-ready | `phase3 -> phase4` | `phase=4`, `status=closed` |
| `phase4/closed` | reopen | `phase4 -> phase1` | `phase=1`, `status=open` |

The important boundary is that prompt text does not decide state. The workflow declaration and CLI transition engine decide state; recipes only guide the LLM once the state is known.

### Ticket DocMeta Storage

Ticket frontmatter is intentionally small. It stores human/index fields such as `id`, `phase`, `status`, `docmetaStatus`, `docmetaValidation`, `docmetaTarget`, and short error keys. It must not store the full DocMeta object.

The full DocMeta contract is stored as the final ticket body section under `## DocMeta`. That bottom block owns required slots, source maps, validation details, output status, and adapter contracts. CLI commands update the body contract first, then mirror a compact summary to frontmatter so humans can scan ticket state without reading a large YAML header.

Default command output should render the compact projection only. Full DocMeta is for explicit detail modes such as `--status-detail`, `--verbose`, `--json`, or audit-oriented output.

The same boundary applies to debugging and refactoring. If this workflow breaks, the fix is not a narrow parser or file-layout tweak by default; it is an end-to-end CLI contract repair spanning visible command behavior, state transition wiring, context attachment, approval gates, and regression coverage.

## 6. Strict Phase-Driven Workflow (TDW)

1. **Issue Ticket (Phase 1)**: The user describes the work in natural language, and the agent creates or selects a ticket to define the target scope. Maintainers and automation can use `ticket create` directly, but day-to-day collaboration starts from a request, not a command.
2. **APC and Main Ticket Record**: Before modifying code, the agent fills the APC (Agent Permission Contract) blocks `[BOUNDARY]`, `[CONTRACT]`, and `[PATCH PLAN]` inside the main ticket. The main ticket owns scope, contract, workflow checks, execution planning, and verification outcomes. Never move execution logs, command transcripts, completion summaries, or verification results into planning prose.
3. **Review Gate**: Issue/regression reports stop after Phase 1. The user reviews the ticket plan before execution; wording such as "fix" or "resolve" in the original issue is not approval to skip review.
4. **Phase Transition**: After the Phase 1 plan is reviewable and the user approves execution, the agent moves the ticket to Phase 2 (Execute).
5. **Execute & Verify (Phase 2)**: Changes are made and verified within the isolated boundary.
6. **Knowledge Distillation Archive**: When archiving, core information is extracted (Zero-Token Distillation) to save context tokens for long-term memory.

## 7. Ticket Files in Git

Ticket files are part of the repository workflow, but they should not be handled like ordinary handwritten notes.

- Commit `.deuk-agent/tickets/INDEX*.json` together with the related ticket markdown changes. Leaving index updates behind can break state restoration in the next session.
- Treat ticket markdown under `.deuk-agent/tickets/**/*.md` as CLI-owned artifacts. If `ticket create` fails, do not create or repair the file manually.
- Editing ticket body content is fine while planning, but workflow state changes should go through `ticket move`, `ticket close`, and `ticket archive`, not direct frontmatter edits.
- `telemetry.jsonl` is typically operational output rather than durable project state. Unless your repository intentionally tracks it, keep it out of ordinary code commits.
- Prefer committing finished work after `ticket archive` so the ticket file move and archive index update stay in the same Git change.
- When reviewing Git changes, first ask whether each ticket-related diff came from an expected CLI workflow step. If not, reconcile with CLI commands before committing.

Useful quick checks:

```bash
git status --short
git diff -- .deuk-agent/tickets/INDEX.json
git diff -- .deuk-agent/tickets/INDEX.archive.*.json
```
