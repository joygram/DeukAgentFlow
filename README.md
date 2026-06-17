# DeukAgentRules

> **Part of the Deuk Family** — Empowering AI Agents with structured rules.

**npm package:** `deuk-agent-rule` · **CLI:** `deuk-agent-rule`

**한국어:** [README.ko.md](https://github.com/joygram/DeukAgentRules/blob/master/README.ko.md)

Versioned templates for `AGENTS.md` and `.cursor/rules` for Cursor, GitHub Copilot, Gemini / Antigravity, Claude (via Cursor or Claude Code), Windsurf, JetBrains AI Assistant, and other coding agents that read project rules: shared handoff format, concise execution, stronger cost-efficiency and responsiveness.

## Initialize a workspace

```bash
npm install deuk-agent-rule
npx deuk-agent-rule init
```

On the **first** `init` in a repo (no `.deuk-agent-rule.config.json`), a short **interactive** setup runs. **Later** `npx deuk-agent-rule init` reuses those choices and only applies template updates — no need for `--non-interactive` unless you are in **CI**. Use **`--interactive`** to change answers, or delete/edit the config file.

Running `init` for the first time (example):

```
$ npx deuk-agent-rule init

DeukAgentRules init — let's configure your workspace.

? What is your primary tech stack?
  1) Unity / C#
  2) Next.js + C#
  3) Web (React / Vue / general)
  4) Java / Spring Boot
  5) Other / skip
  Choice [1-5]: 3

? Which agent tools do you use? (comma-separated numbers, or 'all')
  1) Cursor
  2) GitHub Copilot
  3) Gemini / Antigravity
  4) Claude (Cursor / Claude Code)
  5) Windsurf
  6) JetBrains AI Assistant
  7) All of the above
  8) Other / skip
  Choices: all

  Stack : web
  Tools : cursor, copilot, gemini, claude, windsurf, jetbrains, all, other

AGENTS.md: injected (inject)
rule copied: .cursor/rules/deuk-agent-rule-multi-ai-workflow.mdc
rule copied: .cursor/rules/deuk-agent-rule-delivery-and-parallel-work.mdc
rule copied: .cursor/rules/deuk-agent-rule-git-commit.mdc
```

To skip questions (CI or scripted use):

```bash
npx deuk-agent-rule init --non-interactive
```

After a package upgrade:

```bash
npm update deuk-agent-rule
npx deuk-agent-rule init
```

Use `init --non-interactive` only in **CI** or headless scripts. You do **not** need a separate `merge` for routine upgrades: **`init` refreshes** the bundled `.cursor/rules` files. With default `--rules prefix`, existing **`deuk-agent-rule-*.mdc`** copies are **overwritten** from the new package so template fixes reach your repo. Unprefixed rule files you keep for local overrides are not touched. Only the **marker region** in `AGENTS.md` is replaced; your text outside stays.

### Handoffs (multi-session and tool handover)

`init` creates **`.deuk-agent-handoff/`** (and adds it to **`.gitignore`** by default) so you can **persist** structured specs beyond a single chat. Use the same sections as in `AGENTS.md` (**Handoff format**): task title, files to modify, decisions, constraints. That lets the next session or another tool pick up where you left off without re-explaining the repo.

Optionally, if you use an editor with a **Plans** panel, mirror the same Markdown body under **`.cursor/plans/deuk-handoff.plan.md`** (or `deuk-handoff-<topic>.plan.md`) so it appears there; keep it in sync with the canonical file under `.deuk-agent-handoff/` or `DeukAgentRules/handoff/LATEST.md`. See the bundled **`multi-ai-workflow.mdc`** rule for agent-side details.

### Key options

| Flag | Default | Description |
|------|---------|-------------|
| `--non-interactive` | off | CI/scripts: no prompts; no saved-config path |
| `--interactive` | off | Force the setup questions even if `.deuk-agent-rule.config.json` exists |
| `--cwd <path>` | current directory | Target repo root |
| `--dry-run` | off | Print actions without writing |
| `--tag <id>` | `deuk-agent-rule` | Marker id: `<!-- <id>:begin/end -->` |
| `--agents <mode>` | `inject` | `inject` \| `skip` \| `overwrite` |
| `--rules <mode>` | `prefix` | `prefix` \| `skip` \| `overwrite` |
| `--backup` | off | Write `*.bak` before overwrite |

### Bundled rules

- **`multi-ai-workflow.mdc`** — `alwaysApply: true`
- **`delivery-and-parallel-work.mdc`** — `alwaysApply: true` (vertical slices, portfolio priority, parallel ownership, scoped refactors)
- **`git-commit.mdc`** — `alwaysApply: false`

### `merge` (stricter)

Same flags; `AGENTS.md` inject fails without markers unless `--append-if-no-markers`. Default `--rules skip`.

### Caveats

- Multiple `alwaysApply: true` rules all apply — trim duplicates if context grows too large.
- Do **not** run `init` from `postinstall` without an explicit team decision.

## Versioning

Bump `version` in `package.json` before publishing.
