# Ticket Create Guide

## Agent Action Rule
**Fill the template below and stream the body via stdin — you save no file, so there is no path and no shell escaping:**
1. Copy the `Ticket Body Template` below (identical to templates/TICKET_TEMPLATE.md).
2. Replace every `{{ ... }}` with your real findings.
3. Pipe the filled body into `--plan-body-file -` via a heredoc. Do NOT save the ticket body to a file — a scratchpad/temp path cannot be read by the CLI (a different process).

Title and summary come from the body — the first `# Title` heading becomes the title and the paragraph beneath it becomes the summary; the CLI extracts both into the frontmatter. Pass `--title` only to override the slug.

## CLI Command
```bash
deuk-agent-flow ticket create \
  --workspace <workspace-id> \
  --group main \
  --type <type> \
  --plan-body-file - \
  --non-interactive <<'TICKET'
# <title>

<summary paragraph>

## Scope
...
TICKET
```

## Option Fill Guide
- `--workspace`: the registered workspace id or alias for the target ticket.
- `--group`: use `main` for a new root cause/behavior; use `sub` for a narrow slice under approved main work.
{{REQUIRED_FLAGS}}
- `--plan-body-file -`: reads the filled body from stdin (`-` = stdin). The CLI only checks whether any unfilled `{{ }}` remains (it does not parse markdown heading structure). A repo-relative file path also works, but a temp/scratchpad path cannot cross the process boundary — use stdin.

## Ticket Body Template
{{TICKET_TEMPLATE}}
