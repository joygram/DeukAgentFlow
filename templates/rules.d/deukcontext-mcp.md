---
id: deukcontext-mcp
condition:
  mcp: deuk-agent-context
inject_target: ["AGENTS.md", "GEMINI.md"]
---
## DeukContext RAG Protocol

### RAG Usage
- Start with local source-of-truth files: current source code, tests, project rules, and CLI ticket state.
- Use `mcp_deukcontext_search_*` when local evidence is insufficient, prior decisions may matter, the task crosses old tickets, or the user asks for historical/deep analysis.
- Use RAG as advisory memory. Current source code, tests, and ticket state remain the source of truth.
- Treat DeukAgentContext as an online-only memory layer. Do not rely on offline snapshots or local mirrors as the primary context source.
- Choose the narrowest MCP tool: `search_code` for symbols, `search_rules` for policy, `search_tickets` for prior outcomes, and `synthesize_knowledge` only for cross-collection questions.
- Search narrowly: include the concrete project plus symbol, file, command, rule id, or failure mode.
- Stop after 2 MCP calls for the same question. Do not broaden repeatedly.
- **Do NOT use RAG for Ticket Navigation.** Ticket lookup is a direct CLI operation, not a search task.

### RAG Quality Gate
- Treat placeholder summaries, duplicate ticket/report chunks, stale archive-only hits, unrelated projects, or summaries with no usable fact as a miss.
- When a result only says to read the file, read the current file locally before deciding.
- Prefer `search_code` for implementation questions and request evidence only when the extra context is likely to be useful.
- Record hit/weak-hit/miss/stale evidence in the ticket when it changes confidence, plan, or follow-up direction.
- For investigation, regression, quality, or root-cause tasks, write confirmed facts, hypotheses, improvement direction, and open questions into the active ticket before asking the user for clarification. Then point the user to the ticket instead of keeping the analysis only in chat.

### RAG Failure Handling
- **Error** (2+ failures): Switch to local search (`grep_search`/`view_file`). Do not retry in a loop.
- **Miss or weak hit** (`[RAG-MISS]`, placeholder, duplicate, stale): Fall back to local search. If local analysis finds reusable current-code knowledge, inject it once via `mcp_deukcontext_add_knowledge` with project, source path, code status, and applicability.
- **Stale indexed doc**: If an indexed document is wrong or incomplete, use `mcp_deukcontext_refresh_document` instead of adding a competing fragment.
- **Archive boundary**: Completed work should be preserved through ticket archive and knowledge distillation so the active context does not accumulate stale live-state references.
- **Docs vs knowledge**: `.deuk-agent/docs/` holds human-readable source artifacts (all plans and reports under `docs/plan`, archived originals in `docs/archive`). `.deuk-agent/knowledge/` holds only distilled machine-readable retrieval JSON generated from archived tickets/plans.
