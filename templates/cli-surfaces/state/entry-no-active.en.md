No active ticket. Analyze the request first, then fill the ticket template and stream the body via stdin.

1. Copy the template: templates/TICKET_TEMPLATE.md
2. Replace every `{{ ... }}` block with real content.
3. Pipe the filled body into `--plan-body-file -` via a heredoc. Do NOT save the ticket body to a file — a scratchpad/temp path cannot be read by the CLI (a different process).

```bash
deuk-agent-flow ticket create \
  --workspace {{WS_NAME}} \
  --group main \
  --plan-body-file - \
  --non-interactive <<'TICKET'
# <title>

<summary paragraph>

## Scope
...
TICKET
```

Title and summary come from the body — the first `# Title` heading becomes the title and the paragraph beneath it becomes the summary. The CLI only checks whether any unfilled `{{ }}` remains. The plan section must cite at least one project rule id (e.g. DR-01) from PROJECT_RULE.md.
