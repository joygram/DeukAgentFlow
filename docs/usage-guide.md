<!-- Generated from docs/assets/publication-docs.json -->
# Usage guide

## Install

- Requirements = Node.js 20+, npm and a supported agent client.
- Install and initialize from the project root; connect rule pointers to selected clients.

```bash
npm install -g deuk-agent-flow
deuk-agent-flow init
```

## First task

- Ask the agent = ‘Change only this function and check its behavior’.
- Inspect goals, boundaries and completion criteria; review and approve the plan before execution.
- Agent reads relevant skills and roles, changes files and runs checks.
- At completion, inspect actual results, evidence, remaining risks and handoff.

## Resume

- Natural-language request = ‘Continue the current ticket’.
- Inspect state = `deuk-agent-flow ticket status --workspace <name>`.
- Current rules and roles = `deuk-agent-flow rules ticket --workspace <name>`.
- Use the CLI for ticket contents, indexes and state changes.

## Update

- Upgrade package = `npm install -g deuk-agent-flow`.
- Reapply rules and client pointers = `deuk-agent-flow init` in the project.
- `init` applies the installed package; downloading an update is separate.
- Legacy store `~/.deuk-agent/` is a migration input; current store = `~/.deuk/`.
- Preserve original tickets during recovery; inspect both stores before manual deletion.

## VS Code

- Panel = ticket inspection, workspace selection, handoff copying and skill controls.
- Install = use ‘Install from VSIX’ with the repository release artifact.
- Build from source = `npm run build:vscode`; use repository scripts for local installation.

## Related documents

- [Skills guide](skills-guide.md) · [How it works](how-it-works.md) · [Check suite](checks-guide.md).
