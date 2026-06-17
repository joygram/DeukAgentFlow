---

## DeukAgentRules

> Managed by DeukAgentRules. Remove this section if not installed.

# Deuk Agent Rules

**[MANDATORY — TOOL CALL REQUIRED]** Core rules are at: [AGENTS.md](file:///home/joy/workspace/DeukAgentRules/core-rules/AGENTS.md)

This pointer is a thin bootstrap, not a second workflow contract.

1. FIRST tool call: read the core rules file above and internally note its frontmatter version.
2. Then read local `PROJECT_RULE.md` and internally identify applicable DC-* rules.
3. After the core hub is loaded, `core-rules/AGENTS.md` is the DeukAgentRules SSoT for TDW, RAG, silence, scope, and verification.

Do not print pointer/core metadata, version, DC-* lists, progress commentary, or interim summaries. Only the single required ticket-start line may appear before the final answer unless the user explicitly asks for live narration or a blocker/user decision must be surfaced.
