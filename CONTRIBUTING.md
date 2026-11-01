# Contributing to Deuk Agent Flow

## Build Pipeline

This project uses TypeScript. Compiled output (`scripts/out/`) is not committed — build before packing or publishing.

### Prerequisites

- Node.js >= 20
- npm

### Steps

```bash
# 1. Install dependencies (includes TypeScript)
npm install

# 2. Build: compile TypeScript + build VSIX
npm run build:vscode

# 3. Pack (validates the package)
npm pack --dry-run

# 4. Publish
npm publish --access public
```

> `npm run build:vscode` compiles TypeScript (`scripts/out/`) and builds the VS Code extension (`bundled/deuk-agent-flow.vsix`).
> Both must exist before `npm pack` or `npm publish`.

---

## VS Code Extension Install Targets

`npm run install:vscode` installs the VSIX to all detected VS Code targets on your machine.

**Default targets** (auto-detected by directory existence):

| Target | Extensions directory |
|--------|----------------------|
| VS Code Server (WSL) | `~/.vscode-server/extensions` |
| VS Code Desktop (WSL/Linux) | `~/.vscode/extensions` |
| VS Code Desktop (Windows) | `%USERPROFILE%/.vscode/extensions` |
| Antigravity IDE | `~/.antigravity-ide/extensions` |
| code-server | `~/.local/share/code-server/extensions` |

Target list lives in `scripts/install-vscode-vsix.ts` only. Edit it there to add a location.

---

## Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run build:vscode` | Build VSIX only (no install) |
| `npm run install:vscode` | Install VSIX to all detected targets |
| `npm run install:vscode:desktop` | Install to desktop VS Code only |
| `npm run install:vscode:server` | Install to VS Code Server only |
| `npm run lint:md` | Lint markdown files |
| `npm run smoke:npm:local` | Local npm install smoke test |
