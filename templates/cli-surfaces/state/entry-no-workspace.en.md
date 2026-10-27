No workspace selected. The workspace is resolved ONLY from the registry via --workspace. {{WORKSPACE_COUNT}} workspace(s) registered — pick one:
{{WORKSPACE_LIST}}

Then run ticket commands with --workspace <id>, e.g.:
```bash
deuk-agent-flow rules ticket --workspace {{FIRST_WORKSPACE}}
```

To CREATE a ticket, fill the template and stream the body via stdin. Canonical form:
1. Copy the template: templates/TICKET_TEMPLATE.md
2. Replace every `{{ ... }}` with real content.
3. Pipe the filled body into `--plan-body-file -` via a heredoc. Do NOT save it to a file — a temp/scratchpad path cannot be read by the CLI.
```bash
deuk-agent-flow ticket create \
  --workspace {{FIRST_WORKSPACE}} \
  --group main \
  --plan-body-file - \
  --non-interactive <<'TICKET'
# <title>

<summary paragraph>

## Scope
...
TICKET
```
Title and summary come from the body (# Title→title, paragraph→summary). The CLI only checks whether any unfilled `{{ }}` remains. The plan section must cite at least one project rule id (e.g. DR-01) from PROJECT_RULE.md.
