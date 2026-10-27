Active ticket: {{TICKET_DISPLAY}}
🛎️ **A ticket is in progress. When the user gives a new instruction, continue work on this ticket.**

This surface is the current work context, not a forced-wait notice.
- When the user explicitly says `continue`, `proceed`, `hotfix`, `fix it`, or gives another new task instruction, immediately read the ticket scope and plan and start work.
- Only when there is no new instruction and the user is merely checking status should you report the ticket and wait.
- Do not repeatedly call `ticket use` while continuing the same ticket. Read the ticket or design only when needed.
- An active ticket does not forbid file reads, investigation, or implementation. With a new instruction, proceed within the ticket scope.

If you need the full ticket context (plan, evidence slots):
```bash
deuk-agent-flow ticket use --id {{TICKET_ID}} --non-interactive
```
{{PHASE_ADVANCE}}
