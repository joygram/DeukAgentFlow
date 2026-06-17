<!-- deuk-agent-rule:begin -->
# Deuk Agent Rules

This project follows the Deuk Agent Rules framework.
- Read the full rules: [AGENTS.md](../../AGENTS.md)
- Module-specific rules: [.deuk-agent/rules/](../../.deuk-agent/rules/)

## Critical Rules
- Use `.deuk-agent/templates/TICKET_TEMPLATE.md` for multi-step tasks.
- RAG-First: Use MCP tools before local file search when available.
- Error Loop Prevention: Stop after 2 repeated errors, create a ticket.

<!-- deuk-agent-rule:end -->
