---
name: project-pilot
summary: Apply the ProjectPilot Refactor Contract Kit before cross-language, generated/runtime, or repeated-drift refactors.
---

# ProjectPilot

Authority: follow `core-rules/AGENTS.md`, the active ticket APC, Phase Gate, and project rules.

Use this skill when the task involves any of the following:

- multi-language feature or behavior changes
- protocol, serialization, transport, codec, or table lane work
- generated/runtime/report contract drift
- fallback, alias, helper, no-op, placeholder, or silent stub cleanup
- convention, naming, file layout, factory surface, or lifecycle unification
- repeated failure families where one local fix would hide shared contract drift

## Micro-Protocol

1. Read local project rules and architecture constraints first.
2. Define the refactor contract before proposing or making edits.
3. Build the implementation matrix across the relevant surfaces.
4. Classify drift as `C`, `P`, `S`, `B`, `U`, or `D`.
5. Identify source owners before touching source, generated, runtime, report, or template files.
6. Fill the drift checklist and reject shortcuts that hide drift.
7. Define the conformance gate in the ticket.
8. Only then split remediation tickets or implement scoped changes.

## Required Outputs

- Implementation Matrix
- Refactor Contract
- Flow Contract
- Integration Contract
- Owner Map
- Drift Checklist
- Conformance Gate
- Remediation Plan

Use the shared ProjectPilot semantics and templates when available:

- `docs/PROJECT_PILOT.md`
- `templates/project-pilot/IMPLEMENTATION_MATRIX_TEMPLATE.md`
- `templates/project-pilot/REFACTOR_CONTRACT_TEMPLATE.md`
- `templates/project-pilot/FLOW_CONTRACT_TEMPLATE.md`
- `templates/project-pilot/INTEGRATION_CONTRACT_TEMPLATE.md`
- `templates/project-pilot/OWNER_MAP_TEMPLATE.md`
- `templates/project-pilot/DRIFT_CHECKLIST.md`
- `templates/project-pilot/CONFORMANCE_GATE_TEMPLATE.md`
- `templates/project-pilot/REMEDIATION_PLAN_TEMPLATE.md`

Consumer projects may keep only project-local pilot evidence and references. Shared ProjectPilot semantics and templates are owned by DeukAgentFlow.

## Stop Conditions

- No active ticket or no approval boundary for refactor-contract work.
- No implementation matrix or refactor contract can be stated clearly.
- Source-of-truth owner cannot be identified.
- A fix depends on generated direct edits or hidden fallback.
- Unsupported-by-contract and broken-entrypoint are not separated.
- Verification cannot prove the claimed alignment.
