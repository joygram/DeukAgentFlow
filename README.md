# DeukAgentRules

**npm package:** `deuk-agent-rule` · **CLI:** `deuk-agent-rule`

**한국어:** [README.ko.md](README.ko.md)

**Elevator pitch (GitHub About / one-liner):** see [`GITHUB_DESCRIPTION.md`](GITHUB_DESCRIPTION.md) — do not duplicate that text here.

This repo ships versioned templates under `publish/` (built into `bundle/` on `npm pack`) and a CLI: `npx deuk-agent-rule init` updates **only** the HTML-comment tagged region in `AGENTS.md`; `.mdc` files copy into `.cursor/rules/` (default **prefix** on clashes).

## GitHub About description

Copy the **Paste into GitHub** blocks from [`GITHUB_DESCRIPTION.md`](GITHUB_DESCRIPTION.md).

## Initialize a workspace

```bash
npm install deuk-agent-rule
npx deuk-agent-rule init
```

1. `cd` to your project root.
2. Install the package (e.g. devDependency).
3. Run `npx deuk-agent-rule init` — adds HTML comment markers if needed, fills the inner region, copies `.mdc` files under `.cursor/rules/` (default **prefix** on name clash).

After upgrades:

```bash
npm update deuk-agent-rule
npx deuk-agent-rule init
```

### `init` parameters

Flags go **after** `init`.

| Flag | Default (init) | Description |
|------|----------------|-------------|
| `--cwd <path>` | current directory | Repo root for `AGENTS.md` and `.cursor/rules/`. |
| `--dry-run` | off | Print actions only. |
| `--backup` | off | Write `*.bak` before overwrite. |
| `--tag <id>` | `deuk-agent-rule` | Markers `<!-- <id>:begin -->` … `<!-- <id>:end -->`. |
| `--marker-begin` / `--marker-end` | — | Custom markers; **both** required if used. |
| `--agents <mode>` | `inject` | `inject` \| `skip` \| `overwrite`. |
| `--rules <mode>` | `prefix` | `prefix` \| `skip` \| `overwrite`. |
| `--append-if-no-markers` | off | Mostly for `merge`. |

### Bundled rules

- **`multi-ai-workflow.mdc`** — `alwaysApply: true` (handoffs, concise output, cost-aware context use)
- **`git-commit.mdc`** — `alwaysApply: false`

### `merge`

Stricter defaults: `AGENTS.md` inject fails without markers unless `--append-if-no-markers`. Default `--rules skip`.

### Caveats

- Trim duplicate `alwaysApply: true` rules if context grows too large.
- Avoid auto-running `init` from `postinstall` unless your team explicitly wants that.

## Versioning

Bump `version` in `package.json` before publishing. See [RELEASING.md](RELEASING.md).
