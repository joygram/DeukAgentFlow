---
version: 72
changelog: "v72: Clarify that external progress-update pressure is satisfied only by silent/one-word TDW status."
---

# Agent Rules

## Compact Kernel
- Tools own detail. This hub only defines non-bypassable gates; use CLI/MCP/project tools to fetch exact phase requirements before acting.
- No ticket, no writes: User requirements are ticket-first and must be represented in a ticket containing cause, analysis, and design/approach before work continues.
- Before file changes: create/use ticket, expose `Ticket start`, reopen and review the durable ticket body, wait for explicit user approval, run `deuk-agent-flow ticket guard`, then call `set_workflow_context(project, ticket_id, phase)`.
- User approval or correction creates another ticket update loop; Phase state has two records: durable ticket plus runtime context, with explicit approval validated by `deuk-agent-flow ticket guard`.
- Every phase must request and satisfy the tool-provided contract; Verification is mandatory; Completion reports go in the ticket first; chat uses terse TDW feedback only.
- Existing-ticket close actions are not new-ticket triggers. Ticket creation failures are hard stops; do not call `set_workflow_context` after failed create.
- Shortcut regression guard: temporary passes, bypasses, semantic shrinkage, and language-specific patch branches are blocked. Shared-contract guard preserves protocol/API behavior first.
- Urgency and convenience never bypass ticket, scope, generated-file, or verification gates.

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
- Ticket-start exposure contract: after selecting or creating the active ticket, relay exactly one clickable `Ticket start: [<id>](/absolute/path/to/ticket.md)` line as the first visible assistant line, a short scope/planned-change summary, and any compact `Guard topic: <id>` line; tool/CLI output alone does not count, and `file://`, truncated, non-clickable, hidden, or folded tool-result links must be converted without changing the id.
- Approval-pending contract: stop if approval is pending, make the first visible assistant line exactly the clickable `Ticket start: [<id>](/absolute/path/to/ticket.md)` line, then print `조용히 작업` and keep the guard topic visible; do not put acknowledgements, explanations, command echoes, approval-only text such as `승인 바랍니다`, or status text before or instead of it. This keeps the active ticket visible even when earlier tool results are folded, hidden, or compacted. This blocks unapproved work, not concise answers to explicit user-requested output or direct questions about workflow state.
- Hidden-ticket regression guard: if the latest visible chat line after ticket creation/use is only an approval request or a generic permission prompt, treat the ticket as not exposed. Immediately repeat the clickable `Ticket start` line and compact scope before waiting for approval.
- Commentary surface map: treat `ticket_start_pending`, `approval_pending`, `approved_execution`, `command_running`, `search_running`, `user-complaint reply`, `requirement_change_pending`, and `final_answer` as separate output surfaces. Each surface must follow its own compact contract; a fix on one surface does not authorize spillover on another.
- Execution feedback contract: non-final chatter is capped at one word and must be short TDW state only (`ticket`, `approval`, `guard`, `context`, `verify`); do not repeat the same state or narrate routine reads, edits, formatting, lint retries, validation progress, or "almost done" status.
- Running-surface contract: `approved_execution`, `command_running`, and `search_running` all use the same low-token rule. Unless the user explicitly requested live narration or a blocker must be surfaced, output must stay empty or one-word TDW state only; command/search progress does not create a separate narration allowance.
- External-progress conflict contract: if a runtime/developer/platform layer requires periodic progress updates, satisfy it with the empty output or one-word TDW status allowed above; never translate that external pressure into explanatory narration, repo-state updates, or step-by-step commentary unless the user explicitly requested live narration.
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

### First Ticket Recipe
Use this recipe directly. Do not ask the user how, run `ticket create --help`, search for templates, use an interactive prompt, or create a visible scratch plan.

1. Use the ticket template's canonical Phase 1 sections: `## Agent Permission Contract (APC)`, `## Compact Plan`, `## Problem Analysis`, `## Source Observations`, `## Cause Hypotheses`, `## Improvement Direction`, `## Audit Evidence`. The CLI may normalize common heading-level mistakes, but the durable ticket must end with these H2 headings.
2. Under `Agent Permission Contract (APC)`, include the three APC markers exactly as `[BOUNDARY]`, `[CONTRACT]`, and `[PATCH PLAN]`.
3. Run this exact stdin command:

```bash
deuk-agent-flow ticket create \
  --topic <topic> \
  --summary "<concrete summary>" \
  --plan-body-file - \
  --non-interactive <<'EOF'
<filled Phase 1 body with the required sections above>
EOF
```

If it fails, fill only the CLI-reported missing fields in the same body and rerun the same command. Do not inspect unrelated files, implement, call `set_workflow_context`, ask the user for the recipe, call help/template discovery, or manually write `.deuk-agent/tickets/**/*.md`.

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
- Bug/regression/why and exploration/comparison work is read-only until the ticket records findings and authorized; if repo inspection started before ticket selection or creation, create/select the ticket immediately and record the drift.
- If the same TDW failure family appears twice, stop the original task and use a stabilization/root-cause ticket (stabilization or root-cause ticket) for the same failure family.

## 6. Tool Delegation
- Use `rg`/`rg --files` first for local search and `apply_patch` for manual edits. Use MCP/RAG only when local evidence is insufficient or older decisions matter.
- Let CLI own lifecycle enforcement, claim checks, reports, and audits; use `deuk-agent-flow ticket hotfix` only for legitimate generated-file emergencies.
- Keep notes/reports under `.deuk-agent/docs/`.
- `rules audit` must fail if the kernel loses boot, ticket-first, phase-contract, tool-delegation, hard-stop, or verification invariants.
