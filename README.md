# DeukAgentRules

> **Part of the Deuk Family** — Empowering AI Agents with structured rules.

**npm package:** `deuk-agent-rule` · **CLI:** `deuk-agent-rule`

**한국어:** [README.ko.md](https://github.com/joygram/DeukAgentRules/blob/master/README.ko.md)

Versioned templates for `AGENTS.md` and `.cursor/rules` for Cursor, Copilot, Gemini and similar agents: shared handoff format, concise execution, stronger cost-efficiency and responsiveness.

## Initialize a workspace

```bash
npm install deuk-agent-rule
npx deuk-agent-rule init
```

Running `init` without `--non-interactive` starts a short setup flow:

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
  4) All of the above
  5) Other / skip
  Choices: all

  Stack : web
  Tools : cursor, copilot, gemini, all

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
npx deuk-agent-rule init --non-interactive
```

Only the **marker region** in `AGENTS.md` is replaced; your text outside stays.

### Key options

| Flag | Default | Description |
|------|---------|-------------|
| `--non-interactive` | off | Skip questions; use flag defaults |
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
