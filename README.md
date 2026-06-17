<div align="center">
  <br />
  <h1>DeukAgentRules</h1>
  <p><b>High-Signal Encoding & Rule Standardization Engine</b></p>
  <p>Part of the <a href="https://deukpack.app">Deuk Family</a> ecosystem.</p>
</div>

<div align="center">
  <a href="https://www.npmjs.com/package/deuk-agent-rule"><img src="https://img.shields.io/npm/v/deuk-agent-rule.svg?color=black&style=flat-square" alt="NPM Version" /></a>
  <a href="https://www.npmjs.com/package/deuk-agent-rule"><img src="https://img.shields.io/npm/dm/deuk-agent-rule.svg?color=blue&style=flat-square" alt="NPM Downloads" /></a>
  <a href="https://github.com/joygram/DeukAgentRules"><img src="https://img.shields.io/github/stars/joygram/DeukAgentRules.svg?style=flat-square&color=orange" alt="GitHub Stars" /></a>
  <a href="https://github.com/joygram/DeukAgentRules/blob/master/LICENSE"><img src="https://img.shields.io/npm/l/deuk-agent-rule.svg?style=flat-square" alt="License" /></a>
  <br /><br />
  <a href="https://github.com/joygram/DeukAgentRules/blob/master/README.ko.md">한국어 (Korean)</a>
</div>

***

## Abstract

**DeukAgentRules** defines a project-agnostic rule architecture for AI engineering agents (Cursor, GitHub Copilot, Gemini/Antigravity, Claude, Windsurf, JetBrains AI). It separates persistent workflow memory from session context, reducing recurring prompt loads per session.

> **Why DeukAgentRules?**
> The **Ticket-First Workflow** reduces recurring context loads into a single focused topic file per session, enabling handovers between different AI tools without re-explaining the repository.

---

## 🚀 Quick Start

Initialize the rule system and set up the local workspace in one step:

```bash
npx deuk-agent-rule init
```

* **Interactive Setup:** On the first run, the CLI guides you to select your primary stack and the AI agents you use. *(See the [System Selection Guide](docs/system-selection.md) for a detailed list of available stacks and tools).* 
* **Safe Updates:** Subsequent runs safely append necessary templates without touching your custom extensions. Use `--interactive` to reconfigure.

---

## 🎫 The Ticket-First Workflow

Multiple AI agents share context through a single Markdown ticket, reducing per-session prompt overhead.

### The 6-Phase Workflow

| Phase | Actor | Action |
|---|---|---|
| 1. Explore & Plan | Reasoning AI | Analyze codebase, propose implementation plan |
| 2. Decide | User | Review and approve the plan |
| 3. Ticket (Handoff) | Reasoning AI | Write approved plan to `.deuk-agent-ticket/` |
| 4. Execute | IDE Agent | Read ticket, code strictly within scope |
| 5. Post-Test Risk Analysis | IDE Agent | Mandatory artifact risk analysis after testing |
| 6. Report & Close | User + Agent | Review risk report, then `npx deuk-agent-rule ticket close --latest` |

---

### Detailed Workflow Walkthrough

**Phase 1: Explore & Plan**
```
[User]   "Analyze storage module"
[Agent]  (Analyzes codebase, proposes direction)
[User]   "Plan and design for the analyzed content."
[Agent]  (Saves ticket to .deuk-agent-ticket/main/storage-20260406.md)
```

**Phase 2: Execution & Verification**
```
[User]   "Proceed" (or "Proceed with [Ticket #]")
[Agent]  (Reads the ticket, implements changes, self-checks, and reports)
[User]   "Verify issues, defects, and potential errors."
[Agent]  (Runs tests, confirms compliance and finds defects)
```

---

### Keyword-Based Prompt Examples

| Intent | Ultra-Concise Input |
|---|---|
| **Analysis** | `Analyze [Topic/Module]` |
| **Plan** | `Plan and design for the analyzed content.` |
| **Proceed** | `Proceed [Ticket #] (or latest if omitted)` |
| **Verify** | `Verify issues, defects, and potential errors.` |
| **Check** | `/ticket` |

---

### CLI Reference (Optional)

```bash
npx deuk-agent-rule ticket create --topic login-api --project MyProject --content "## Task: ..."
npx deuk-agent-rule ticket list
npx deuk-agent-rule ticket close --latest
```

*([Ticket Tutorial](docs/ticket-tutorial.md))*



---

## ⚙️ Architecture & Configuration (How It Works)

The CLI supports advanced parameters for CI environments and explicit structural control, utilizing a non-destructive injection mechanism to avoid user conflicts. 
For a detailed technical overview of how we safely sandbox injected rules, see the **[How It Works Guide](docs/how-it-works.md)**.

### Core Configuration

| Flag | Purpose |
|------|---------|
| `--non-interactive` | CI/Headless mode; applies defaults/saved config without prompting |
| `--tag <id>` | Overrides the default marker region (`<!-- <id>:begin -->`) |
| `--agents inject` | Smart injection into existing `AGENTS.md` (or `skip`, `overwrite`) |
| `--rules prefix` | Updates `.cursor/rules` via intelligent file prefixing |

---

## 📄 License & Ecosystem

Part of the **DeukPack Ecosystem**. Licensed under **Apache-2.0**.
For issues, contributions, and community discussions, visit the [GitHub Repository](https://github.com/joygram/DeukAgentRules).
