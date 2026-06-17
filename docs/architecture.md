# Architecture (v3.0)

DeukAgentRules v3.0 introduces a **Hub-Spoke Architecture** and a **Global Execution Proxy** to ensure absolute consistency and efficiency in AI-agent workflows.

## 1. Zero-Copy Hub-Spoke Architecture

In the v3 model, **`AGENTS.md`** acts as the global **Hub** (the single source of truth), while **`PROJECT_RULE.md`** serves as the **Local Hub** for project-specific overrides. IDE-specific rule files (e.g., `.cursor/rules/*.mdc`) act as **Spokes** (thin entry points) that use absolute path pointers instead of duplicating rules (Zero-Copy).

![Hub-Spoke Architecture](assets/architecture-v3.png)

### Core Principles
- **SSoT (Single Source of Truth)**: All operational rules are defined in `AGENTS.md`, and project-specific contexts go into `PROJECT_RULE.md`.
- **Lightweight Spokes (Zero-Copy)**: IDE rules do not duplicate content; they use absolute paths to point the agent to the Hubs.
- **Zero-Legacy**: The `init` command aggressively purges obsolete v1/v2 configurations.
- **Online RAG Only**: DeukAgentContext is used as an online advisory memory layer, not as a local cache or alternate source of truth.
- **Archive Preservation**: Completed work should move into archive/knowledge so the active context stays small and current.

## 2. Global CLI Proxy (Kind: Src)

To solve the "Stale Tarball" problem common with `npx`, v3.0 implements a **Global Proxy**.

### How it works:
1. When you run `npx deuk-agent-rule`, the package's global entry point (`bin/deuk-agent-rule.js`) is executed.
2. It automatically scans the current directory and its parents for a **Local Workspace Source** (`DeukAgentRules/scripts/cli.mjs`).
3. If found, it **transparently routes** all commands to the local source.
4. This ensures that agents always use the latest, uncommitted local rules instead of a cached version from the registry.

## 3. Initialization Lifecycle

1. **`migrateLegacyStructure`**: Renames or cleans up old directory patterns.
2. **`cleanSubmoduleStubs`**: Identifies and removes empty submodule stubs and orphans in `.gitmodules`.
3. **`deploySpokePointers`**: Generates the thin Spoke files pointing to the Hub.
4. **`Smart Backup`**: Analyzes legacy `.cursorrules` and creates `.bak` only if custom user rules are detected.
