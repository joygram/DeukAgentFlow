<div align="center">
  <br />
  <h1>DeukAgentRules</h1>
  <p>
    <a href="https://www.npmjs.com/package/deuk-agent-rule"><img src="https://img.shields.io/npm/v/deuk-agent-rule.svg" alt="npm version" /></a>
    <a href="https://www.npmjs.com/package/deuk-agent-rule"><img src="https://img.shields.io/npm/dt/deuk-agent-rule.svg" alt="npm downloads" /></a>
  </p>
  <p><b>High-Signal Encoding & Rule Standardization Engine</b></p>
  <p>Part of the <a href="https://deukpack.app">Deuk Family</a> ecosystem.</p>
</div>

> A core module of the **Deuk Family**. Maximizes collaboration efficiency of AI agents through structured rules.

**npm package:** `deuk-agent-rule` · **CLI:** `deuk-agent-rule`

**Korean:** [README.ko.md](https://github.com/joygram/DeukAgentRules/blob/master/README.ko.md)

A **submodule-isolated collaborative framework** designed to be used alongside various coding agents such as Cursor, GitHub Copilot, Gemini / Antigravity, Claude, Windsurf, and JetBrains AI Assistant.
It standardizes project rules (`AGENTS.md`, `.cursor/rules`) and strongly prevents wasteful prompt token consumption and AI context hallucination through a **ticket-based workflow**.

> **🚀 Core Value:**
> Compresses the mandatory loaded context of approx. 1,500~2,000 tokens per session down to a mere 200~300 tokens. By isolating the AI to a specific **"Target Submodule"** using exact tickets (work orders), it prevents the AI from wandering through an entire monolithic repository.

---

## 🛠️ Getting Started (Workspace Initialization)

Install and initialize the package once at the project root.

```bash
npm install deuk-agent-rule
npx deuk-agent-rule init
```

Upon initialization, interactive questions will ask for the project's **tech stack** and **agent tools in use**. Based on your selections, optimized markdown templates and rule files (`.cursor/rules/*`) will be automatically generated and synchronized.
- If you don't need to change the tech stack later, simply run `npx deuk-agent-rule init` to refresh the rules.
- Suppress interactive prompts in CI or script environments by appending the `--non-interactive` flag.

### 🔄 Updating the Rules Package
When a new version of the agent rules or templates is released, you can sync the latest instructions to your project by updating the package and re-running `init`.
Since your previous configurations are saved (`.deuk-agent-rule.config.json`), using the `--non-interactive` flag will quietly and cleanly overwrite the obsolete rules with the latest ones without asking any questions.
```bash
npm install deuk-agent-rule@latest
npx deuk-agent-rule init --non-interactive
```

---

## 🎯 The Ticket Workflow

Running `npx deuk-agent-rule init` deploys a **zero-touch scaffolding sandbox** at your workspace root, spawning two essential directories:

1. **`.deuk-agent-templates/` (Agent Templates)**: Houses the official blueprint (`TICKET_TEMPLATE.md`) dictating how AIs must process and report tasks. Committed alongside your source code to serve as the team's rulebook.
2. **`.deuk-agent-ticket/` (Ticket Execution Space)**: The covert space where volatile instructions (`TICKET-XXX.md`) are exchanged between agents and workers. (Automatically hidden by `.gitignore` to prevent security leaks and repository bloat).

The optimal **3-Step AI Coding Sequence** utilizing these sandbox folders is as follows.

### [Step 1] Ticket Creation & Submodule Isolation
Do not issue scattered, unbounded commands to your AI. Narrowing the **context** via a clear ticket is strictly required to prevent astronomical costs and accidental code corruption.

```bash
npx deuk-agent-rule ticket create --topic ui-refactoring --group frontend --project DeukUI
```
This command instantly creates a templated `TICKET-ui-refactoring.md` file within the `.deuk-agent-ticket/` directory.

> [!IMPORTANT]
> **Filling the Ticket (CRITICAL)**: The newly created ticket already contains **YAML Front Matter** (`--- id: ... ---`). **DO NOT** overwrite the entire file when adding your plan. ALWAYS append your content below the header or use partial file editing to preserve the existing YAML metadata. Erasing the Front Matter corrupts the ticketing system.

The developer must simply specify the exact isolated directory path (e.g., `src/client`) inside the `[Target Submodule]` attribute at the top of the generated file.

### [Step 2] Agent Execution & Handoff (Ticket Session)
Provide a single line of instruction to your AI chatbot (Cursor, Gemini, etc.):
> *"Open the recently issued `.deuk-agent-ticket/TICKET-ui-refactoring.md` ticket and strictly follow the checklist within the specified target submodule."*

The AI will faithfully read the defined Phases in the ticket and write optimized code while **completely blocking out unnecessary computations for unrelated server logic or sibling modules**. (This mechanism drastically reduces token costs).

### [Step 3] Status Review & Closure
As the AI writes the code, it will simultaneously update the markup checkboxes (`[x]`) inside the ticket. If the agent's session memory limit is approaching, simply leave the ticket file saved, turn off the chat window, open a fresh session, and issue [Step 2] again. The handoff (session transfer) is seamlessly completed.
Once all steps are accomplished, promote the Phase status to `[Phase Complete]`. Instead of manually typing terminal commands, **you can simply tell your AI chatbot via natural language prompt: "Show me the list of active tickets" or "Archive the completed tickets with reports"**, and the AI will autonomously invoke the CLI to manage them for you.
To track tickets manually from the terminal, run:

```bash
npx deuk-agent-rule ticket list
```
```text
📦 Agent Tickets (Direct System Scan):
  ✅ [TICKET-DEUKUI-Button.md]
     Title: Add Button Component
     Target: DeukUI
     Status: [Complete]
  🔨 [TICKET-ui-refactoring.md]
     Title: Plugin UI Refactoring
     Target: DeukUI
     Status: [In Progress]
```

---

## 🤖 AI Agent Prompting Guide

Even after installing and initializing the package, some AI agents (Cursor, Gemini, etc.) might not actively read the rule file (`AGENTS.md`) in a fresh session. **Whenever you start a new chat session, copy and paste the following prompts to force the AI to align with the rules. This effectively eliminates hallucination and accidental scope-creep.**

### 1. Force Rule Familiarization (Mandatory)
> *"Before starting any work, please read the `AGENTS.md` (DeukAgentRules) file at the workspace root from top to bottom. Make sure you fully understand your Identity, the core project rules, and the ticket workflow. Once you have read and understood them, do NOT summarize them; simply reply 'Rules Acknowledged' and await my first instruction."*

### 2. Ticket Execution (Recommended)
> *"Open the recently issued `.deuk-agent-ticket/TICKET-XXX.md` ticket. Restrict all your file exploration, analysis, and modifications STRICTLY to the target submodule path explicitly specified in the ticket. Do not wander into other submodules or accidentally modify unrelated files."*

---

## ⚙️ CLI Reference & Advanced Options

Advanced commands for workflow automation and target control.

### Ticket-based Commands
Instead of manually typing the CLI commands below into the terminal, you can **delegate their execution to your AI chatbot by giving natural language prompt instructions**.

| Command | Description / Natural Language Prompt Example |
|--------|------|
| `npx deuk-agent-rule ticket create ...` | Generates a new ticket document (accepts `--group`, `--project`, `--submodule`) <br>💬 *"Create new ticket (topic: refactor)"* |
| `npx deuk-agent-rule ticket list` | Lists and displays active tickets (`--archived`, `--all`, `--json` supported) <br>💬 *"Ticket list"* |
| `npx deuk-agent-rule ticket use --latest ...` | Returns only the file path of the most recent ticket <br>💬 *"Recent ticket path"* |
| `npx deuk-agent-rule ticket close ...` | Soft-closes a target ticket by locking its status to completed without moving the file <br>💬 *"Close this ticket"* |
| `npx deuk-agent-rule ticket upgrade` | Migrates legacy ticket structures to V2 (YAML FM) and triggers submodule DEFRAG <br>💬 *"Upgrade tickets to v2"* |
| `npx deuk-agent-rule ticket archive ...` | Securely moves completed tickets to `archive/` and updates INDEX <br>💬 *"Archive this ticket (attach report)"* |
| `npx deuk-agent-rule ticket reports` | Lists structurally preserved agent work reports (`reports/`) <br>💬 *"List archived reports"* |

### Advanced Init Options
| Flag | Default | Description |
|--------|--------|------|
| `--non-interactive` | Off | For CI/Scripts. Disables interactive UI and adopts existing `.config.json` |
| `--interactive` | Off | Forces the interactive setup to reappear even if config already exists |
| `--cwd <path>` | Current dir | Adjust target workspace root (absolute/relative path) |
| `--dry-run` | Off | Simulates the execution text in the console without generating/altering files |
| `--backup` | Off | Safely creates `*.bak` copies of `AGENTS.md` and rule files before overwriting |

## Versioning Policy
Before pushing any core updates/feature changes to this package (`DeukAgentRules`), strictly bump the `version` inside `package.json` and publish it (`npm run sync:oss`).
