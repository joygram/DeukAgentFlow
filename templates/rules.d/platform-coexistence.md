---
id: platform-coexistence
inject_target: ["AGENTS.md"]
---
## Platform MCP Bridge

### MCP Configuration per Platform

Each platform uses a different MCP config file. Ensure `deuk-agent-context` is registered in the appropriate location:

| Platform | MCP Config Path | Registration |
|----------|----------------|--------------|
| Antigravity | `.mcp.json` (project root) | Auto-detected by IDE |
| Claude Code | `.mcp.json` (project root) | `claude mcp add --transport sse deuk-agent-context <url>` |
| Copilot | `.vscode/mcp.json` | VS Code settings or manual JSON edit |
| Codex | `.mcp.json` (project root) | Manual JSON edit |
| Cursor | `.cursor/mcp.json` | Cursor Settings > MCP |

### Artifact Path Self-Check

Before saving any artifact, verify the platform's native path is NOT the only copy:

| Platform Native Path | RAG-Indexed? | Action Required |
|---------------------|:------------:|-----------------|
| `brain/<conv>/` (Antigravity) | NO | Copy to `.deuk-agent/docs/` |
| `.cursor/plans/` (Cursor) | NO | Copy to `.deuk-agent/docs/plan/` |
| Terminal output (Claude/Codex) | NO | Save directly to `.deuk-agent/docs/` |
| VS Code diff (Copilot) | NO | Save plan text to `.deuk-agent/docs/plan/` |
| `.deuk-agent/docs/` | **YES** | ✓ Correct path |
