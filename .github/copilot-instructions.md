<!-- deuk-agent-managed:begin -->
---

## DeukAgentFlow

> Managed by DeukAgentFlow. Remove this section if not installed.

# Deuk Agent Flow

**[MANDATORY — TOOL CALL REQUIRED]** Core rules are at: [AGENTS.md](file:///home/joy/workspace/DeukAgentFlow/core-rules/AGENTS.md)

This pointer is a thin bootstrap, not a second workflow contract.

1. FIRST tool call: read the core rules file above and internally note its frontmatter version.
2. Then read local `PROJECT_RULE.md` and internally identify applicable DC-* rules.
3. After the core hub is loaded, `core-rules/AGENTS.md` is the DeukAgentFlow SSoT for TDW, RAG, silence, scope, and verification.

Do not print pointer/core metadata, version, DC-* lists, progress commentary, or interim summaries. When approval is pending, make the first visible assistant line exactly the clickable `Ticket start: [<id>](/absolute/path/to/ticket.md)` line. Before the final answer, only the single required ticket-start line, blockers, explicit user-requested output, or explicit command results may appear. During approved_execution, command_running, or search_running, stay silent unless the user explicitly asks for live narration or a blocker/user decision must be surfaced.
<!-- deuk-agent-managed:end -->
