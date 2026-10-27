# Principles

These principles define the philosophy behind **DeukAgentFlow** as an AI Engineering Orchestration Protocol.

## The Single Goal and Its Three Axes

The center of gravity of software work has shifted to **agent coding**, and DeukAgentFlow exists to do one thing inside that environment: **maximize the collaboration efficiency between the agent and the human.** Everything below is a means to that one end — not a bag of features, but three defenses of a single goal.

- **The goal**: raise agent↔human collaboration efficiency in vibe-coding. This is the expected effect and the reason the product exists.
- **The three axes** — each guards a *different* failure mode of that goal, so all three are required:
  - **Skill** (*what* the agent does inside a task) — reusable behavior playbooks; guards against over-assumption and over-engineering. The direct descendant of Karpathy-style skills.
  - **Persona** (*how the work is experienced*) — tension control that protects drive quality; guards against tension collapse. Built on established affect science (see [persona-design.md](../architecture/persona-design.md#affect-math-model), 갱신 절), not tuned by feel.
  - **Flow-control** (*that the work stays bounded and recoverable*) — tickets, phase gates, role-switching, verification, continuity; guards against scope drift and context loss. The principles below are the canon of *this* axis.
- **Why the three converge on one conclusion**: persona controls tension → drive quality; flow-control bounds scope and preserves context → less rework; skill curbs over-engineering → accuracy. Their sum is the only thing they were ever for — a more efficient agent↔human loop.
- **The token-economy argument**: each axis spends a little more token *in the moment* (a persona line, a role prompt, a ticket transition). But the comparison that matters is the *total* spend — when drift yields a flimsy result, the rework it triggers burns far more token over the task's life than the up-front cost of staying on-design. The three axes trade a small visible per-turn cost for a large invisible saving in avoided rework.

> This section is the identity; the principles below detail the flow-control axis. The skill axis lives in the skill system, and the persona axis is canonized in [persona-design.md](../architecture/persona-design.md).

## Zero-Copy Hub-Spoke Architecture

The documentation and rule system must have a single source of truth without unnecessary duplication.

- **Global Hub**: `AGENTS.md` contains all canonical rules.
- **Local Hub**: `PROJECT_RULE.md` defines project-specific rules.
- **Spoke (Zero-Copy)**: IDE-specific files act purely as absolute path pointers.
- **Why**: Duplicated and mismatched rules across IDEs create agent drift and unpredictable behavior.

## Zero-Legacy Policy

Maintain repository cleanliness by physically purging obsolete structures.

- **Why**: Legacy `.cursorrules` or stale submodule stubs confuse agents and bloat the context window.
- **Mechanism**: Unconditional cleanup of deprecated markers and empty stubs during `init`.

## Kind Src — Source Sovereignty

Prioritize local development source over distributed binaries.

- **Why**: Distributed packages (npm) often lag behind local rule updates.
- **Mechanism**: The Global CLI Proxy ensures that `npx` always routes to the local `scripts/cli.mjs` if present.

## Smart Backup — Custom Rule Protection

Respect human-authored content while cleaning system-generated noise.

- **Why**: Users often add valuable custom rules to generated files.
- **Mechanism**: Files are only deleted if they contain pure system blocks. Anything else is backed up as `*.bak`.

## Strict Phase-Driven Workflow

Execution must be strictly bounded by a Ticket and its Phase.

- **Why**: AI agents wander without boundaries. Explicit scope locking reduces token usage and prevents scope-creep.
- **Mechanism**: Phase 1 issues or selects a ticket and fills the Agent Permission Contract (APC). Keep all planning in the main ticket's compact plan. When no active/open ticket exists, the agent inspects recent git history before creating a follow-up ticket. The ticket owns scope, contract, lifecycle checks, and verification outcomes; planning text must not contain progress checkboxes, execution logs, command transcripts, completion summaries, or verification results.

## Plan Before Mutation

Design must be explicit before state changes occur.

- **Why**: Intent and scope should be recorded before code or config files are modified. Ticket and plan documents are records, not a reason to create duplicate tickets.
- **Mechanism**: Before writing code, the ticket APC blocks (`[BOUNDARY]`, `[CONTRACT]`, `[PATCH PLAN]`) must be filled. APC records boundary and contract only. The reasoning behind diagnosis and chosen approach stays in the main ticket's compact plan and is not a destination for execution records.

## Documentation Complements RAG

Stable principles and dynamic knowledge must work together.

- **Docs**: Explain the stable model and operating assumptions.
- **RAG (DeukAgentContext)**: Synchronizes engineering memory and past decisions through the online MCP layer only.
- **Why**: Local files stay the source of truth, RAG stays advisory, and archive preserves durable history without mixing live state into the memory layer.

## Archive Preservation

Archive is a required lifecycle layer, not an optional afterthought.

- **Why**: Live context should stay small and current, while completed work must be moved into archive/knowledge so the history remains searchable without polluting active context.
- **Mechanism**: Use ticket archive and distillation to move finished work out of the active loop, then treat the archived result as durable reference material.

## Bilingual Parity

English and Korean documentation are mirrors of a single model.

- **Why**: Engineering teams are often bilingual. Mismatched docs lead to workflow fragmentation.
