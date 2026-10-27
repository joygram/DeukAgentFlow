# Ticket Workflow Template: phase2

## Execution Slots
- Approved Scope:
- Files Changed:
- Commands Run:
- Interim Evidence:

## Extra Slots for phase2→end Direct Exit
When jumping from phase2 directly to end (skipping phase3), fill these two sections **using the exact heading names below**.
The CLI matches heading text exactly — no typos.

## Problem Analysis
(Root-cause analysis — include file:line evidence)

## Improvement Direction
(Summary of the fix direction)

## If the Plan Needs to Change
- Direct plan modification is not possible at this stage.
- Create the new ticket first, then close the current ticket with evidence "expanded/redesigned as #XXX".

## Transition Condition
- Return to ticket adjustment for changes outside the approved scope.
- phase2→end direct exit: `## Problem Analysis` + `## Improvement Direction` sections must have substantive content (checked by `getCloseWorkflowReasons`).
