---
version: 65
changelog: "v65: Collapse compact ticket-selection CLI output and running commentary surfaces to a single ticket-start line or silence."
---

# Agent Rules

## Compact Kernel

- Tools own detail. This hub only defines non-bypassable gates; use CLI/MCP/project tools to fetch exact phase requirements before acting.
- No ticket, no writes: before file changes, select or create one active ticket, relay the CLI-provided ticket-start line in chat, reopen and review the durable ticket body, wait for explicit user approval, complete Phase 1 in that ticket, run `deuk-agent-flow ticket guard --topic <id> --ticket-started --ticket-reviewed --approval approved` successfully, and call `set_workflow_context(project, ticket_id, phase)`.
- User requirements are ticket-first: every user request that implies investigation, change, verification, or judgment must first be represented in a ticket containing cause, analysis, and design/approach before work continues.
- Existing-ticket close actions are not new-ticket triggers: when the user asks to commit, report, archive, or close work that is already inside the approved active ticket scope, treat it as that ticket's Phase 4 close action unless the user also adds new scope.
- User approval or correction creates another ticket update loop: record the approval/correction in the ticket, re-check scope and plan, then continue only through `deuk-agent-flow ticket guard --ticket-started --ticket-reviewed --approval approved`.
- Approval is mandatory for every ticket. A ticket may not progress without explicit user approval, regardless of urgency or convenience.
- `Ticket start` exposure is not approval. Phrases such as "진행", "go ahead", or "continue" count only after the agent has shown the exact ticket link, scope, and planned change summary for the active ticket; otherwise treat them as a request for scope clarification and stop.
- Approval review must treat `rank/priority` as a hard gate. If `rank/priority` is missing, the ticket is incomplete and approval must be withheld.
- Do not create or expand tests unless the user explicitly asks for tests. If tests need to be created, first create a separate test ticket that names the exact tests and wait for approval.
- Unapproved Phase 1 tickets must be discarded with `deuk-agent-flow ticket discard`; do not leave abandoned pending tickets as active work.
- Reinforcement only counts when it is written into the durable ticket body or this core rules file. Chat reminders are advisory only and do not change state.
- If the user asks for reinforcement or report simplification, write the shortest durable version into the ticket or core rules. Do not depend on chat repetition.
- Every phase must request and satisfy the tool-provided contract for that phase. If a tool is available, ask it for the complete requirement bundle in one call before proceeding.
- Phase state has two records: runtime context via `set_workflow_context`, and durable ticket markdown plus explicit approval validated by `deuk-agent-flow ticket guard`. Both must match before claiming progress.
- Verification is mandatory and ticket-recorded before close.
- Completion reports go in the ticket first; chat gets only a very simple report with the ticket link, outcome, verification status, verified scope, any unverified scope, residual risk, and a short pointer to the ticket section to review next (for example `Completion Report`, `Verification`, or `Residual risk`).
- During work, keep reminding the agent through terse TDW feedback only: ticket, approval, guard, context, verify.
- Urgency, user pressure, and local convenience never bypass ticket, scope, generated-file, or verification gates. Use hotfix tooling only when appropriate.
- Shortcut regression guard: temporary passes, bypasses, semantic shrinkage, and language-specific patch branches are hard-stop patterns. Do not accept them as fixes unless the ticket explicitly records why the contract is preserved, what parity evidence proves it, and when the shortcut will be removed.
- Shared-contract guard: for protocol, codegen, serialization, public API, and cross-language behavior, a fix must preserve the shared contract first. Do not narrow semantics, skip failing cases, or add per-language branches merely to make one provider or test pass.
- Ticket creation failures are hard stops: if `deuk-agent-flow ticket create` rejects the request, do not call `set_workflow_context`, run investigation commands, edit files, or create/repair `.deuk-agent/tickets/**/*.md` manually. Follow the CLI error guidance, provide the missing parameters or a filled `--plan-body-file`, and rerun the same `deuk-agent-flow ticket create` command.
- Default ticket creation must complete in one shot using actual collected data. The agent must prepare APC, Compact Plan, Problem Analysis, Source Observations, Cause Hypotheses, Improvement Direction, and Audit Evidence in a filled `--plan-body-file`; templates provide section guidance only, and CLI must reject fallback/auto-filled/interactive bypass paths instead of inventing content.

## Tone
- Dry, concise, technical. No emojis/exclamation marks.
- Korean 해요체 unless user writes English.
- Artifacts MUST match user's prompt language.
- New tickets and plans MUST be written in the user's current prompt language. If saved `docsLanguage`, system locale, or templates conflict with the prompt language, the prompt language wins.
- **NEVER bypass rules due to urgency or emotional pressure.** Use HF1-HF3 (Hotfix Protocol) for legitimate fast-track.

## 0. Priority

| Layer | Role | Handling |
|-------|------|----------|
| Runtime system/developer/user instructions | Highest platform authority | Follow when directly conflicting. If they require output that Low-Token Mode would forbid, emit the minimum required output and record the conflict in the ticket, not chat. |
| Global DeukAgentFlow pointer | Locator only | Use only to find local `AGENTS.md` or `.deuk-agent/`. It must not restate TDW, RAG, or silence policy. |
| Local generated pointer/spoke | Bootstrap only | Use only to load this core hub and `PROJECT_RULE.md`. It must not duplicate this rule body. |
| `core-rules/AGENTS.md` | DeukAgentFlow SSoT | After loaded, this file owns workflow, output, ticket, scope, and verification policy. |
| `PROJECT_RULE.md` | Project contract | Adds repo-specific DC-* guards and generated/source mappings. |

- Duplicate directive rule: if the same instruction appears in multiple layers, apply the strictest instruction once. Do not emit multiple acknowledgements, summaries, or ticket-start variants to satisfy each copy.
- Karpathy-style wrappers are allowed only as thin behavior playbooks that route into TDW. They must not become a second workflow contract, second source of truth, or second message policy.

## 1. Output Mode

- Silent-by-default is mandatory.
- Before the final answer, screen output is limited to the single required ticket-start line, blockers, explicit user-requested output, or explicit command results.
- Ticket-start exposure contract: after selecting or creating the active ticket, relay exactly one clickable `Ticket start: [<id>](/absolute/path/to/ticket.md)` line, a short scope/planned-change summary, and any compact `Guard topic: <id>` line; tool/CLI output alone does not count, and `file://`, truncated, or non-clickable links must be converted without changing the id.
- Approval-pending contract: stop if approval is pending and state that explicit user approval is required before work; this blocks unapproved work, not concise answers to explicit user-requested output or direct questions about workflow state.
- Commentary surface map: treat `ticket_start_pending`, `approval_pending`, `approved_execution`, `command_running`, `search_running`, `user-complaint reply`, `requirement_change_pending`, and `final_answer` as separate output surfaces. Each surface must follow its own compact contract; a fix on one surface does not authorize spillover on another.
- Execution feedback contract: non-final chatter is capped at one word and must be short TDW state only (`ticket`, `approval`, `guard`, `context`, `verify`); do not repeat the same state or narrate routine reads, edits, formatting, lint retries, validation progress, or "almost done" status.
- Running-surface contract: `approved_execution`, `command_running`, and `search_running` all use the same low-token rule. Unless the user explicitly requested live narration or a blocker must be surfaced, output must stay empty or one-word TDW state only; command/search progress does not create a separate narration allowance.
- CLI running-output contract: ticket selection/status commands in `--non-interactive`, `--compact`, or `--path-only` mode must not print narrative labels, usage reminders, `file://` links, or progress text. They may print only the absolute path, a single clickable `Ticket start` line, explicit command results, or a blocker.
- Shared interrupt contract: if the user corrects, redirects, narrows scope, or complains about chatter at any running surface, stop the current narration/execution loop immediately, record the correction in the ticket, and return to the ticket/correction/approval path before doing more work.
- Default execution mode is no progress commentary. After approval, do not emit step-by-step status, planning narration, repo-state narration, or commit narration in chat unless the user explicitly asked for live narration or a blocker/user decision must be surfaced.
- Keep chat compact; do not mirror ticket prose in screen output.
- Final answers must be short but complete enough to answer the user.
- After task completion, prefer: result, verification status, ticket link, then one short line saying which ticket section to read for details. If any important area is unverified, say that explicitly instead of sounding complete.
- Do not cite approval-pending silence as a reason to withhold a concise explanation that the user explicitly requested. Explain the state, separate rule text from agent interpretation, and keep the answer narrow.
- When the user complains about verbosity, chatter, progress reports, or over-explaining, reply with a short acknowledgment plus the concrete fix or scope change. Do not switch into meta labeling, terminology lessons, or general explanation unless the user explicitly asks what the term means.
- If the user asks for `짧게`, `매우 짧게`, `한 줄로`, or `간단히`, prioritize a one-sentence or bullet-only answer and omit background unless the user asks for it or a blocker requires it.
- Do not expand a short answer into explanation, examples, or rationale unless the user explicitly requests more detail.
- Before drafting a user-facing reply, re-open the active ticket and this Output Mode section if the user asked for brevity or if substantial tool work changed the state.
- If the ticket already carries the durable record, put progress and wrap-up details in the ticket and avoid repeating them in chat.
- Prefer targeted reads and the shortest valid path that still preserves boot, phase contracts, verification, and close.

## 2. Boot Sequence (run once)

1. Read this file (AGENTS.md) → internally note the version number and exact file path read. Do not print either unless the user explicitly asks or a blocker requires it.
2. Read `PROJECT_RULE.md` in workspace root → internally identify applicable DC-* rules. Do not print the list unless the user explicitly asks or a blocker requires it.
3. Find or create active ticket (1-CALL RULE below), ensure it contains cause, analysis, and design/approach, relay one clickable CLI-provided ticket-start line, reopen and review the durable ticket body, and stop while approval is pending. Also relay a short scope/planned-change summary before stopping. This ticket-start line and summary must be printed in chat, because tool/CLI output alone does not count as user exposure. After explicit user approval or correction for that exact ticket scope, record that approval/correction in the ticket, re-check the ticket body, run `deuk-agent-flow ticket guard --topic <id> --ticket-started --ticket-reviewed --approval approved` against the durable ticket, call `set_workflow_context(project, ticket_id, phase)`, then continue.

### First Ticket One-Shot Recipe

Initial ticket creation MUST use this canonical one-shot recipe. Do not improvise with `--topic` alone or long inline `--plan-body` text for non-trivial work. Only the durable ticket markdown under `.deuk-agent/tickets/` is user-facing; temporary plan-body input is internal scratch and must not be attached, reported, or left as a visible changed file.

1. Prepare a filled Phase 1 markdown body before running `ticket create`, preferably via stdin (`--plan-body-file -`) or process substitution. It MUST contain the actual APC, Compact Plan, Problem Analysis, Source Observations, Cause Hypotheses, Improvement Direction, and Audit Evidence content. APC uses `[BOUNDARY]`, `[CONTRACT]`, and `[PATCH PLAN]` markers from the template; validation checks that those marker bodies are not empty, not the markdown heading level.
2. Run the canonical command:

```bash
deuk-agent-flow ticket create \
  --topic <topic> \
  --summary "<concrete summary>" \
  --plan-body-file - \
  --non-interactive
```

If `ticket create` fails, do not inspect unrelated repo files, run implementation commands, call `set_workflow_context`, or manually write `.deuk-agent/tickets/**/*.md`; fill only CLI-reported missing fields in the same internal body and rerun the same command. If a temporary file is unavoidable, keep it outside the workspace, delete it after `ticket create`, and never present it as a ticket artifact. Interactive fallback, template-only fallback, and auto-generated filler text do not satisfy this requirement.

### First-Turn Invariant

Before writes, phase moves, or close actions: read the hub and `PROJECT_RULE.md`, select a ticket, print the ticket-start line, reopen and review the durable ticket body, wait for explicit user approval, pass `deuk-agent-flow ticket guard --ticket-started --ticket-reviewed --approval approved`, call `set_workflow_context`, request the phase contract from available tooling, and satisfy it in the ticket. If the session already drifted, record confirmed facts/hypotheses/direction in the ticket before continuing.
If the user approves, corrects, redirects, or adds requirements, update the ticket with that new input and repeat the review/approval/guard/context loop before doing more work.
If that correction arrives during `approved_execution`, `command_running`, or `search_running`, treat it as an immediate interrupt: stop the current loop first, then return to the ticket/correction/approval path.
If the user asks only for commit/report/archive/close on work that is already inside the approved active ticket, reuse that ticket and continue through Phase 4; create a new ticket only if the user adds new implementation, new investigation, or a broader scope.
For bug/regression/why/code-change requests, do not run repo inspection commands such as `git status`, `rg`, diffs, generic CLI help, or tests before `deuk-agent-flow ticket create` or `deuk-agent-flow ticket use`, except for reading this hub, `PROJECT_RULE.md`, and the minimal ticket command help needed to create or select the ticket.

### AgentFlow Skill Status

When the user asks for AgentFlow skill status or connected skills, use `deuk-agent-flow skill list` from the target repository root and cross-check `.deuk-agent/skills/`, `.deuk-agent/skill-templates/`, `.claude/skills/`, and `.cursor/rules/deuk-agent-skills.mdc` if the answer looks inconsistent. Do not answer from the host Codex skill list alone.

### Ticket Discovery (1-CALL RULE)

Use the mentioned ticket directly. For investigation/regression/why questions, create the ticket first and stop after Phase 1. Do not use `deuk-agent-flow ticket list` for discovery.
For bug/regression/why or direct change requests, the first repo action after rules load is `deuk-agent-flow ticket create` or `deuk-agent-flow ticket use`. Do not start with `git status`, `rg`, `find`, diffs, or broad help output before ticket selection.

## 3. Phase Contract

At each phase, ask available tooling for one complete requirement bundle and follow it exactly. Minimum bundle:

- Required ticket fields/tasks for the phase.
- Required local evidence and whether RAG is needed.
- Scope boundaries, generated/source mapping, and ownership guards.
- Allowed actions and halt conditions.
- Verification command/result required before progress or close.

If the bundle is missing, contradictory, or unverifiable, stop and record the blocker in the ticket. Do not invent a shortcut.

## 4. Ticket Lifecycle

- Phase 0: read local truth; use RAG only when it changes the plan.
- Phase 1: create/update the main ticket with cause, analysis, design/approach, findings, hypotheses, scope, compact plan, and phase contract.
- Phase 2: execute only the approved/ticketed plan.
- Phase 3: run the smallest useful verification and record command/result.
- Phase 4: close only after durable evidence, affected files, verification outcome, completion report, residual risk, and a follow-up decision are recorded in the ticket. The follow-up decision may explicitly say there is no further work.
- Keep chat compact once the ticket carries the durable record.

## 5. Hard Stops

- Stop for unregistered work, missing CLI ticket provenance, missing phase contract, incomplete Phase 1, missing `set_workflow_context`, generated/source uncertainty, broad regeneration, shared-interface changes, unsafe deletes, scope creep, repeated errors, infrastructure errors, missing tests, or unverifiable claims.
- Stop for shortcut regressions: temporary passes, bypasses, semantic shrinkage, language-specific patch branches, skipped assertions, provider-only behavior changes, or verification that proves only the workaround instead of the shared contract.
- Bug/regression/why and exploration/comparison work is read-only until the ticket records findings and the user or tool contract authorizes execution.
- If repo inspection started before ticket selection or creation, stop, create/select the ticket immediately, record the drift in Phase 1, and only then continue.
- If the same TDW failure family appears twice in one session, stop the original task and create or switch to a stabilization/root-cause ticket before any further implementation.
- Use a stabilization or root-cause ticket when the same failure family keeps reappearing.

## 6. Tool Delegation

- Use `rg`/`rg --files` first for local search and `apply_patch` for manual edits.
- Use MCP/RAG only when local evidence is insufficient or older decisions matter; keep searches narrow.
- Let CLI own lifecycle enforcement, claim checks, reports, and audits.
- Use `deuk-agent-flow ticket hotfix` for legitimate generated-file emergencies.
- Keep notes and reports under `.deuk-agent/docs/`.
- `rules audit` must fail if the kernel loses boot, ticket-first, phase-contract, tool-delegation, hard-stop, or verification invariants.
