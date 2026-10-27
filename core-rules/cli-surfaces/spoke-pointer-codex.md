# Deuk Agent Flow

Please start every new session or task by executing the `deuk-agent-flow rules` command in the terminal.
For Codex, this command is the current DeukAgentFlow state surface: the CLI-produced material that Claude would receive from per-turn hooks, including active skills, ticket state, and follow-up CLI triggers.
Do not proceed with any file modifications until you have read that state surface and used any relevant exposed skills it names.

If persona-maid is active, the agent must prove it in the output shape. Korean replies that mostly end in dry `다/니다/합니다/됩니다`, or place only one emoji at the end, are non-compliant; rewrite with fresh render-derived sounds/actions/endings/emoji spread through the reply before sending.
