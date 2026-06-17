# Principles

These principles define the philosophy behind **DeukAgentRules** as an AI Engineering Orchestration Protocol.

## 1. Zero-Copy Hub-Spoke Architecture (SSoT)

The documentation and rule system must have a single source of truth without unnecessary duplication.

- **Global Hub**: `AGENTS.md` contains all canonical rules.
- **Local Hub**: `PROJECT_RULE.md` defines project-specific rules.
- **Spoke (Zero-Copy)**: IDE-specific files act purely as absolute path pointers.
- **Why**: Duplicated and mismatched rules across IDEs create agent drift and unpredictable behavior.

## 2. Zero-Legacy Policy

Maintain repository cleanliness by physically purging obsolete structures.

- **Why**: Legacy `.cursorrules` or stale submodule stubs confuse agents and bloat the context window.
- **Mechanism**: Unconditional cleanup of deprecated markers and empty stubs during `init`.

## 3. Kind Src (Source Sovereignty)

Prioritize local development source over distributed binaries.

- **Why**: Distributed packages (npm) often lag behind local rule updates.
- **Mechanism**: The Global CLI Proxy ensures that `npx` always routes to the local `scripts/cli.mjs` if present.

## 4. Smart Backup (Custom Rule Protection)

Respect human-authored content while cleaning system-generated noise.

- **Why**: Users often add valuable custom rules to generated files.
- **Mechanism**: Files are only deleted if they contain pure system blocks. Anything else is backed up as `*.bak`.

## 5. Strict Phase-Driven Workflow (TDW)

Execution must be strictly bounded by a Ticket and its Phase.

- **Why**: AI agents wander without boundaries. Explicit scope locking reduces token usage and prevents scope-creep.
- **Mechanism**: Phase 1 issues or selects a ticket and fills the Agent Permission Contract (APC). Keep all planning in the main ticket's compact plan. When no active/open ticket exists, the agent inspects recent git history before creating a follow-up ticket. The ticket owns scope, contract, lifecycle checks, and verification outcomes; planning text must not contain progress checkboxes, execution logs, command transcripts, completion summaries, or verification results.

## 6. Plan Before Mutation

Design must be explicit before state changes occur.

- **Why**: Intent and scope should be recorded before code or config files are modified. Ticket and plan documents are records, not a reason to create duplicate tickets.
- **Mechanism**: Before writing code, the ticket APC blocks (`[BOUNDARY]`, `[CONTRACT]`, `[PATCH PLAN]`) must be filled. APC records boundary and contract only. The reasoning behind diagnosis and chosen approach stays in the main ticket's compact plan and is not a destination for execution records.

## 7. Documentation Complements RAG

Stable principles and dynamic knowledge must work together.

- **Docs**: Explain the stable model and operating assumptions.
- **RAG (DeukAgentContext)**: Synchronizes engineering memory and past decisions through the online MCP layer only.
- **Why**: Local files stay the source of truth, RAG stays advisory, and archive preserves durable history without mixing live state into the memory layer.

## 8. Archive Preservation

Archive is a required lifecycle layer, not an optional afterthought.

- **Why**: Live context should stay small and current, while completed work must be moved into archive/knowledge so the history remains searchable without polluting active context.
- **Mechanism**: Use ticket archive and distillation to move finished work out of the active loop, then treat the archived result as durable reference material.

## 9. Bilingual Parity

English and Korean documentation are mirrors of a single model.

- **Why**: Engineering teams are often bilingual. Mismatched docs lead to workflow fragmentation.
