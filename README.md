# DeukAgentRules

**npm package:** `deuk-agent-rule` · **CLI:** `deuk-agent-rule`

**한국어:** [README.ko.md](README.ko.md)

Versioned templates for `AGENTS.md` and `.cursor/rules` for Cursor, Copilot, Gemini and similar agents: shared handoff format, concise execution, stronger cost-efficiency and responsiveness.

## Initialize a workspace

Install does nothing until you run the CLI from the **target repository root** (or pass `--cwd`).

```bash
npm install deuk-agent-rule
npx deuk-agent-rule init
```

Typical first run:

1. `cd` into your project root (where `AGENTS.md` should live).
2. `npm install deuk-agent-rule` (devDependency is fine).
3. `npx deuk-agent-rule init` — appends `<!-- deuk-agent-rule:begin -->` … `<!-- deuk-agent-rule:end -->` if missing, fills the inner region with the bundled template, and copies `.mdc` files under `.cursor/rules/` (default **prefix** on name clash).

After a package upgrade:

```bash
npm update deuk-agent-rule
npx deuk-agent-rule init
```

Only the **marker region** in `AGENTS.md` is replaced again; your text outside the markers stays.

### `init` parameters

All flags go **after** `init` (e.g. `npx deuk-agent-rule init --cwd ../other-repo --dry-run`).

| Flag | Default (init) | Description |
|------|----------------|-------------|
| `--cwd <path>` | current directory | Root of the repo to modify (`AGENTS.md`, `.cursor/rules/`). |
| `--dry-run` | off | Print planned actions; do not write files. |
| `--backup` | off | Write `*.bak` next to any file that would be overwritten. |
| `--tag <id>` | `deuk-agent-rule` | HTML comment markers: `<!-- <id>:begin -->` … `<!-- <id>:end -->`. |
| `--marker-begin <s>` / `--marker-end <s>` | (use `--tag` instead) | Custom marker strings; **both** required if either is set. |
| `--agents <mode>` | `inject` | `inject` — update only inside markers (or append block if no markers). `skip` — do not change `AGENTS.md`. `overwrite` — replace entire `AGENTS.md` with the bundle (use with care). |
| `--rules <mode>` | `prefix` | `prefix` — if `foo.mdc` exists, write `deuk-agent-rule-foo.mdc`. `skip` — skip existing names. `overwrite` — replace on clash. |
| `--append-if-no-markers` | off | Rare for `init` (init already appends when markers are missing). Same flag is mainly for `merge`. |

Examples:

```bash
npx deuk-agent-rule init --cwd /path/to/repo
npx deuk-agent-rule init --dry-run
npx deuk-agent-rule init --tag mycompany --rules overwrite
npx deuk-agent-rule init --agents skip --rules prefix
npx deuk-agent-rule init --backup
```

### Product model

- **Managed block in `AGENTS.md`**: Between `<!-- deuk-agent-rule:begin -->` and `<!-- deuk-agent-rule:end -->` (or your `--tag`) — `init` / `merge` replace **only** that inner content with the bundled template.
- **Updates**: Re-run `init` after `npm update` to refresh the managed block idempotently.
- **`.mdc`**: Copied as **separate files**; default `prefix` avoids overwriting your existing rules.

### Bundled rules

- **`multi-ai-workflow.mdc`** — `alwaysApply: true`
- **`git-commit.mdc`** — `alwaysApply: false`

### `merge` (stricter)

Same flags; **`AGENTS.md` `inject` fails if markers are missing** unless `--append-if-no-markers`. Default **`--rules skip`**.

### Caveats

- Multiple `alwaysApply: true` rule files (yours + prefixed copies) all apply — trim duplicates if context grows too large.
- Do **not** run `init` from `postinstall` without an explicit team decision.

## Versioning

Bump `version` in `package.json` before publishing.
