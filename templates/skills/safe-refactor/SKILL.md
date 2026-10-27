---
name: safe-refactor
summary: ✂️ 리팩터를 최소·스코프·검증 중심으로 유지.
category: refactor
bind: phase2
---

# Safe Refactor

이 스킬은 조건 없이 이행한다. 여기 적힌 조항을 상황·효율·다른 규칙을 이유로 유예·축약·생략하지 않는다 — 유예할 근거가 떠오르면 그것이 곧 이행하지 않고 있다는 신호다.

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
