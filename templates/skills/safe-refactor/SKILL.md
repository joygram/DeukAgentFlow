---
name: safe-refactor
summary: Keep refactors small, scoped, and test-backed inside DeukAgentRules TDW.
---

# Safe Refactor

Authority: follow `core-rules/AGENTS.md`, the active ticket APC, Phase Gate, and `PROJECT_RULE.md`.

Use this skill when the user asks for refactor, cleanup, simplification, or restructuring.

## Micro-Protocol

1. Confirm the active ticket allows refactoring of the target module.
2. Name the smallest behavior-preserving change that satisfies the request.
3. Inspect current tests or the smallest verification command before editing.
4. Avoid unrelated renames, formatting sweeps, dependency changes, and style churn.
5. After edits, run the narrowest relevant test or lint gate and record the result in the ticket.

## Stop Conditions

- No active ticket or APC boundary for the refactor.
- Target crosses unrelated modules.
- The feature has no meaningful verification path.
- The change would alter generated output or shared interfaces without explicit approval.
