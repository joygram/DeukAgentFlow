# DeukAgentFlow Practical Usage Guide

This guide walks through deploying DeukAgentFlow on a real project and using it efficiently with an agent, step by step.

---

## 1. Workspace Deployment Model

The unit of initialization for DeukAgentFlow is not simply "the current folder." Real-world usage is typically structured as **a workspace root + multiple project roots + nested projects where needed**.

Example:

```text
~/workspace/
  AGENTS.md              # workspace-wide pointer
  PROJECT_RULE.md        # workspace default rules
  DeukPack/
    AGENTS.md
    PROJECT_RULE.md
    .deuk-agent/
  DeukAgentContext/
    AGENTS.md
    PROJECT_RULE.md
    .deuk-agent/
  i/
    AGENTS.md
    PROJECT_RULE.md
    .deuk-agent/
    i_server/
      AGENTS.md
      PROJECT_RULE.md
      .deuk-agent/
```

In this model, the workspace root is a "common entry point," while the actual unit of work is each project's `.deuk-agent/`. The agent selects project rules and tickets based on the global registry, an explicit workspace id, and the ticket id.

Used this way, the effect is maximized:

- Keep only common pointers at the workspace root so any conversation, from any starting point, reads the same core rules.
- Give each project root its own `PROJECT_RULE.md` and `.deuk-agent/` so work context, tickets, and verification records never mix across projects.
- Initialize subfolders with a different lifecycle (server/app/package) as nested projects so they get independent tickets.
- Talk to the agent in short phrases — "proceed," "next," "root cause," "wrap up" — instead of long commands, and let the agent pick the right project ticket by registry and ticket id.
- Manage common rules at the core hub, and project-specific architecture/build/verification rules in that project's `PROJECT_RULE.md`.

When a workspace root has multiple projects, the target repo only switches to a sibling project root by name when an explicit `--workspace` value is given. `--project` is used only as ticket metadata/filter, never for repo switching. Where each project root has its own `.deuk-agent/` (e.g. `DeukAgentFlow`, `DeukAIContext`), it resolves via the exact name or alias, such as `--workspace DeukAgentFlow`, `--workspace agent-flow`, or `--workspace flow`. Title/summary text is never used for target selection.

Once the target repo is confirmed, the workflow runs only inside that repo's `.deuk-agent/tickets`. When a ticket is created without an explicit target, only the registry's single workspace or the workspace resolved from the ticket id is used; when multiple workspaces are possible, specify one explicitly with `--workspace`.

Ticket workflow status messages are marked with the standard Flow prefix:

```text
flow:[workspace:ticket-start] [ticket-id](/absolute/path/to/ticket.md)
Type `approved` to approve.

flow:[workspace:ticket-end] [ticket-id](/absolute/path/to/ticket.md)
The ticket work has ended.
```

### MCP Connection Structure

When using DeukAgentFlow together with DeukAgentContext, the most accurate mental model is **a workspace-shared server + per-project connections**.

- `DeukAgentFlow` defines tickets, approval, verification, and project boundaries.
- `DeukAgentContext` is the MCP server that provides search, memory, and telemetry.
- IDE connections attach via each project root's `.mcp.json` or Claude's project-scope MCP registration.
- The de facto source of truth for the current registered project list and collection mapping is `DeukAgentContext/.local/ingest.yaml`.
- `DeukAgentContext/.local/config.yaml` is closer to infra/search/telemetry settings than a project list.

In practice, this is less "Flow owns the MCP" and more "Flow directs the usage rules within the project the MCP is connected to."

To promote a new workspace into the AgentContext registry under the current structure, the following order is most natural:

```bash
npx deuk-agent-flow context derive-agentflow --workspace ~/workspace
npx deuk-agent-flow context derive-agentflow --workspace ~/workspace --apply
npx deuk-agent-flow context setup-ide
```

- `derive-agentflow` scans DeukAgentFlow project roots (`PROJECT_RULE.md` + `.deuk-agent/`) and produces `ingest.yaml` candidates.
- `--apply` writes the result into the current `ingest.yaml`.
- `setup-ide` updates each project's `.mcp.json` or Claude project-scope MCP connections based on the applied registry.
- `deuk-agent-flow context ...` keeps the user-facing flow inside Flow while internally calling the DeukAgentContext CLI.

### Deployment Criteria

| Location | Role | Initialize? |
|---|---|---|
| Workspace root | Pointers and default rules shared across projects | Optional |
| Individual project root | Actual work tickets, local rules, agent pointers | Recommended |
| Nested project | Subproject with an independent lifecycle (standalone deploy/server/app) | As needed |
| generated/output folder | Build artifacts | Forbidden |

### Step 1: Global Install
A global install is recommended to avoid `npx` cache issues and to use the command from anywhere.
```bash
npm install -g deuk-agent-flow
```

### Step 2: Initialize the Project Root
Run the init command in each project root you want to manage.

```bash
deuk-agent-flow init
```

This command creates/updates the following files:
- `PROJECT_RULE.md`: rules unique to the current project (overrides the global `AGENTS.md`).
- `.deuk-agent/`: the directory where tickets, templates, and settings are stored.
- `.cursor/rules/deuk-agent.mdc`, `GEMINI.md`, etc.: thin pointer files tailored to each agent environment.

If you manage multiple projects in one workspace, run this in each root:

```bash
cd ~/workspace/DeukPack && deuk-agent-flow init
cd ~/workspace/DeukAgentContext && deuk-agent-flow init
cd ~/workspace/i && deuk-agent-flow init
cd ~/workspace/i/i_server && deuk-agent-flow init
```

After initialization, fill in each project's `PROJECT_RULE.md`. If it's still in its default template state, the agent should not guess at the architecture — it should ask the user to define the rules or propose a codebase-analysis draft.

---

## 2. Working with the Agent (Daily Workflow)

When directing the agent, **keep it short**. Ticket creation and phase transitions are handled internally by the agent — the user focuses on direction and approval.

### Step 1: Create a Ticket (Phase 1: Ticket + Plan)
Start the work with a short instruction to the agent.
> "Open a ticket and proceed"

The agent infers the topic from context and internally fills the ticket/APC/compact plan. The user does not need to memorize or type `ticket create` options directly.

If you're trying to resume prior work and `ticket next` can't find a ticket to advance, the agent does not immediately create a new ticket — it first analyzes recent git history to recover actual follow-up work candidates. Only after recording that analysis basis in the main ticket's compact plan does it create the new ticket.

### Step 2: Record the APC (Agent Permission Contract)
A newly created ticket defaults to **Phase 1 (Ticket + Plan)**. Before modifying code, the agent must fill in the ticket's APC block (`[BOUNDARY]`, `[CONTRACT]`, `[PATCH PLAN]`).

The ticket owns scope, constraints, the APC contract, lifecycle checks, and verification results. Execution logs, command transcripts, completion summaries, and verification results are never mixed into the plan text.

If the user has clearly requested execution and the Phase 1 record is complete, the agent internally attempts a phase promotion.
If the APC or compact plan is empty or incomplete, the agent fills it in first, before coding.

When the user raises an issue, regression, or policy violation, the agent does not execute immediately after ticket creation. The agent fills in the root-cause hypothesis, scope, APC, and patch plan in Phase 1, then stops and waits for the user's review approval. Even if the original request contained words like "fix" or "resolve," that is not treated as approval until the user has reviewed the ticket plan.

### Step 3: Execute the Work (Phase 2: Execute)
Once the ticket is promoted to **Phase 2 (Execute)**, the agent modifies code within the bounded scope and performs verification work such as unit tests.

### Step 4: Complete and Archive
When the work is done, just ask for wrap-up.
> "Record verification and wrap up"

During archiving, **Zero-Token Knowledge Distillation** kicks in, compressing and storing only the essential information to reduce unnecessary context token usage.

### Step 5: Managing Ticket Files in Git
Ticket files are part of the git history too, but treating them carelessly like source code easily tangles the active/archive state.

- Commit the `.deuk-agent/tickets/INDEX*.json` changes produced by `ticket create`, `ticket move`, `ticket close`, and `ticket archive` together. Committing only the ticket body without the index can leave the state inconsistent for the next session.
- `.deuk-agent/tickets/**/*.md` should only follow results produced by the CLI. Do not hand-create or hand-edit files after a failed ticket creation.
- It's fine to polish ticket body text mid-work, but state changes must always go through the CLI — never edit frontmatter by hand.
- `.deuk-agent/telemetry.jsonl` is closer to an execution log, so unless your repo policy specifically tracks it, it's safer to leave it out of your commits.
- When work is done, it's best to run `ticket archive` before committing. Archiving reorganizes both the ticket file location and the archive index together, so moving files by hand mid-process muddies the record.
- Don't mix multiple pieces of work into one commit — where possible, split into "code change + corresponding ticket workflow change" bundles.

For a quick sanity check, it's good habit to run:

```bash
git status --short
git diff -- .deuk-agent/tickets/INDEX.json
git diff -- .deuk-agent/tickets/INDEX.archive.*.json
```

When you see ticket-related changes, first ask "is this change a result of the CLI workflow?" If not, it's safer to re-sync state with commands like `ticket status`, `ticket list`, or `ticket archive` rather than hand-editing.

---

## 3. Agent Prompting Guide

To get an agent to strictly follow the DeukAgentFlow protocol, a short instruction at the start of a project is enough.

> **Example agent instruction:**
> "Follow the DeukAgentFlow rules, and process the user's short instructions as ticket/Phase/verification records. Record the APC and plan before modifying code."

### `/` Shortcut Commands

On supported agents, short requests can be exposed as slash commands. Not every client supports custom `/` commands the same way, though, so the default UX stays short natural-language requests.

| Intent | Natural-language fallback | Slash candidate |
|---|---|---|
| Next step | "next" | `/next` |
| Start a ticket | "proceed" | `/flow` |
| Root-cause analysis | "root cause" | `/inspect` |
| Verify/wrap up | "wrap up" | `/closeout` |

Recommended mapping:

- Claude Code: project `.claude/skills/<name>/SKILL.md` or `.claude/commands/<name>.md`
- Cursor: project `.cursor/commands/<name>.md`
- VS Code Copilot: project `.github/prompts/<name>.prompt.md`
- Codex: use short natural language and skill invocation first; expose custom slash commands separately once a standard is confirmed

### Skill List and Adding Existing Skills

Skills are short behavioral playbooks, not a replacement for the whole workflow. In DeukAgentFlow, the ticket/APC/Phase Gate always remains the higher authority — skills only sharpen the agent's moves for specific failure patterns.

`init` does not copy first-party skill sources into the project. The skill source of truth is `templates/skills/` inside the DeukAgentFlow package.

Recommended default installs:

| Skill | Why |
|---|---|
| `safe-refactor` | Most AI coding accidents start from over-refactoring and scope creep |
| `generated-file-guard` | Direct edits to generated output break most often at review/regeneration time |

Optional installs:

| Skill | When to use |
|---|---|
| `context-recall` | When you need to look up past tickets/decisions/failure patterns |
| `project-pilot` | Multi-language, generated/runtime, protocol, or repeated-drift refactors |

The user can just say things like:

| What you want | What to say |
|---|---|
| See installable skills | "list skills" |
| Add an existing skill | "add safe-refactor" |
| Expose to Claude | "expose skills to Claude" |
| Expose to Cursor | "expose skills to Cursor" |

Maintainers/automation can use the CLI directly:

```bash
deuk-agent-flow skill list
deuk-agent-flow skill add --skill safe-refactor
deuk-agent-flow skill add --skill generated-file-guard
deuk-agent-flow skill add --skill context-recall
deuk-agent-flow skill add --skill project-pilot
deuk-agent-flow skill expose --platform claude
deuk-agent-flow skill expose --platform cursor
```

`skill add`/`skill expose` open up the skill usage path, but `init` neither creates nor preserves a local copy of the skill templates.

---

## 4. Tips and Best Practices

- **No Ticket, No Code**: modifying code without a ticket is forbidden. The user speaks briefly; the agent keeps the ticket record.
- **Use RAG**: search past tickets and implementation examples with the `mcp_deukcontext_search_*` tools to reduce hallucination.
- **Sync periodically**: if project rules change, re-run `deuk-agent-flow init` to refresh all agent pointer files.
