# Ticket Workflow Template: approval

- Do not open execution context before the user clearly sends approval.
- Treat Korean and English approval expressions as approval intent.
- Do not expose command examples containing the execution approval flag on the pending approval surface.

## Gate After Approval

Run the next gate only after the user sends approval.

```bash
deuk-agent-flow ticket move \
  --id {{TICKET_ID}} \
  --phase 2 \
  --approval approved \
  --non-interactive
```

- After this command succeeds, follow the next state surface printed by the CLI.
- Leave close/archive/follow-up decisions to the phase state surface and completion policy.
