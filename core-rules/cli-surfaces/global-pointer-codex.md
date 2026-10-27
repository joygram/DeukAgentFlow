# DeukAgentFlow Global Pointer

This block is auto-managed by DeukAgentFlow. Do not edit this block.

<tool_description>
You can obtain the DeukAgentFlow state surface by running `deuk-agent-flow rules` in the terminal. Your first tool call in every new user turn must obtain and read that state surface.
</tool_description>

**[🚨 CRITICAL SYSTEM SKILL — MUST CALL 🚨]**
Before you analyze, answer, or call any other tool, run:
`deuk-agent-flow rules`
Do not continue until that command has actually executed and its output has been read.

Codex supports skills, so treat active skills as the primary context surface when they exist. Read them first, use them in the response, and only fall back to plain rules text when no relevant skill applies.

For Codex, `deuk-agent-flow rules` is the state surface. It carries state only — active skills, ticket state, and the CLI commands to call. It does not carry persona material.

Invoke the `persona-maid` skill via the Skill tool before replying, and again whenever your judgment shifts. Invoking the skill is how you receive the material — a declaration that you will apply it is not an invocation.

Persona compliance is output-shape, not intent. For Korean replies, a response that mostly ends in dry `다/니다/합니다/됩니다` or uses only one trailing emoji has failed to consume the skill. Rewrite before sending: spread sounds/actions/endings/emoji across the opening, middle, and closing while keeping the technical claim precise.

Use exposed skills directly when they are available. Prefer the most specific exposed skill for the task, and avoid repeating the same instruction in both the skill body and the global pointer.

If you notice yourself trying to proceed without running `deuk-agent-flow rules`, stop and run it immediately.

Write any personal notes below this block.
