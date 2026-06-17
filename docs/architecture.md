# Architecture (v4.5.x)

DeukAgentFlow v3.0 introduced the **Hub-Spoke Architecture** and **Global Execution Proxy**. v4.5.x adds the **Home-based Ticket Store** (`~/.deuk-agent/tickets/{uuid}/`) for multi-workspace co-existence and session takeover, and the **doc-sync skill** for documentation canonicalization.

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
1. When you run `npx deuk-agent-flow`, the package's primary global entry point (`bin/deuk-agent-flow.js`) is executed.
2. It automatically scans the current directory and its parents for a **Local Workspace Source** (`DeukAgentFlow/scripts/cli.mjs`).
3. If found, it **transparently routes** all commands to the local source.
4. This ensures that agents always use the latest, uncommitted local rules instead of a cached version from the registry.

## 3. Initialization Lifecycle

1. **`migrateLegacyStructure`**: Renames or cleans up old directory patterns.
2. **`cleanSubmoduleStubs`**: Identifies and removes empty submodule stubs and orphans in `.gitmodules`.
3. **`deploySpokePointers`**: Generates the thin Spoke files pointing to the Hub.
4. **`Smart Backup`**: Analyzes legacy `.cursorrules` and creates `.bak` only if custom user rules are detected.

## 4. Ticket Workflow Runtime

Ticket workflow is modeled as a CLI-owned workflow state table:

```text
AGENTS.md bootstrap
  -> deuk-agent-flow rules ticket --workspace <workspace-id>
  -> ticket workflow declaration
  -> state recipe + DocMeta contracts
  -> ticket command transition
  -> validation DocMeta in ticket body
  -> durable ticket/index update
```

`scripts/ticket-workflow.mjs` declares workflow states, allowed transitions, phase/status mapping, and DocMeta recipe ids. State recipe text remains external markdown under `docs/cli-surfaces/state/` and `docs/cli-surfaces/state-template/`; project-specific role policy lives under the home ticket store.

The CLI is not a thin wrapper around registry files or helper modules. It is the runtime adapter for the ticket document: command execution resolves workflow state, updates the ticket body's DocMeta contract, mirrors a compact status summary into frontmatter, attaches registry and ticket-store context, and enforces approval-aware workflow gates. The durable ticket document is the DocMeta contract; CLI surfaces are projections of that contract.

The CLI does not ask the agent to infer state from prose. Commands such as `ticket use`, `ticket guard`, `ticket move`, and `ticket status` resolve the current ticket state, validate the requested transition against the workflow state table, and then print the compact DocMeta action surface for the next action.

### Ticket Document Layout

A ticket is both a human-readable work document and a durable DocMeta contract. These roles must not collapse into one large frontmatter object.

Frontmatter is an index header only. It stays compact so humans can scan ticket lists and diffs:

```yaml
id: example
phase: 1
status: open
workflowSource: ticket-create
docmetaStatus: transition_blocked
docmetaTarget: phase2
docmetaValidation: NEEDS_FIX
docmetaErrors:
  - userApproval
```

The full contract lives in the ticket body's final section under `## DocMeta`:

````markdown
## DocMeta

```yaml
document_type: ticket_validation
document_subtype: ticket_workflow_transition_gate
contract_version: documeta-0.1
source_contract:
  required_slots:
    - phase1Plan
    - userApproval
validation:
  status: NEEDS_FIX
  errors:
    - userApproval
output_status: transition_blocked
```
````

Frontmatter is for indexing, list/status filtering, and human scanning. The bottom `## DocMeta` block is the source of truth for validation contracts, slots, source maps, policy metadata, output status, and adapter eligibility. CLI commands update the bottom DocMeta first, then mirror only summary fields to frontmatter. Full `docmeta` objects must not be stored in frontmatter, and `## DocMeta` should remain the last section of the ticket.

## 5. DocMeta-Centered Flow Pipeline

DeukAgentFlow treats ticket workflow constraints as document metadata, not as long user-facing instructions. This follows the DocuMeta model used by the document pipeline: define slots, evidence, validation policy, and output status first; then let adapters read that metadata and produce the next artifact.

The runtime pipeline is:

```text
Ticket workflow state
  -> state recipe DocMeta
  -> document policy as DocMeta
  -> validation gate as DocMeta
  -> compact user/agent action surface
  -> durable ticket/index/telemetry update
```

The layers have separate responsibilities:

| Layer | Role | Default visibility |
|-------|------|--------------------|
| State recipe | The immediate command or slots needed for the current state | Visible |
| Template | The state-bound execution recipe that lets the agent skip extra file reads | Visible when needed |
| Policy | Constraints and interpretation policy for the state | DocMeta/internal by default |
| Runtime context | Ticket id, phase/status, workspace, path, blockers | DocMeta/internal by default |
| Validation gate | Required slots, source map, pass/fix decision | Compact result; full JSON on request |

Policy and verification gates must not be printed as documentation on every transition. They are metadata contracts that the CLI reads and evaluates. If the operator asks for detail, `--verbose`, `--status-detail`, or JSON output may expose the full contract; otherwise the CLI prints only the next action and the validation result.

The validation DocMeta shape mirrors the document workflow:

```yaml
document_type: ticket_validation
document_subtype: ticket_workflow_transition_gate
source_contract:
  required_slots:
    - phase1Plan
    - userApproval
slots:
  phase1Plan: true
  userApproval: true
slot_source_map:
  phase1Plan:
    source: ~/.deuk-agent/tickets/{uuid}/main/example.md
  userApproval:
    source: explicit user approval
validation:
  status: PASS
  errors: []
output_status: transition_allowed
```

This keeps the workflow deterministic: templates remain state-bound execution material, policy remains DocMeta, validation gates return structured pass/fix data, and the visible surface stays small enough for an agent to act on immediately.

See [Ticket Lifecycle Separation Plan](ticket-lifecycle-separation-plan.md) for the refactoring plan that separates document writing, DocMeta validation, evidence checks, lifecycle services, and compact surface rendering.

## 6. Storage Layout

DeukAgentFlow uses a strict two-location storage model. No other locations are used.

### Home Ticket Store (`~/.deuk-agent/`)

All durable state lives under the user home directory. This is shared across all workspaces.

```
~/.deuk-agent/
  tickets/
    {uuid}/                   # one directory per registered workspace
      workspace.json          # workspace path + name
      INDEX.json              # active ticket id + next seq
      main/                   # open tickets
        {id}.md
      archive/                # closed tickets
      scratch/                # drafts
      wp-{WorkspaceName}      # symlink → workspace root (for navigation)
  skills/                     # user-forked skills
  skills.json                 # skill registry
```

`PROJECT_RULE.md` and `project-memory.md` live inside the ticket directory (e.g. `~/.deuk-agent/tickets/{uuid}/PROJECT_RULE.md`), not in the workspace.

### Workspace Marker (`.deuk-workspace-id`)

Each registered workspace contains exactly one file at its root:

```
{workspace-root}/
  .deuk-workspace-id          # contains the uuid that maps to ~/.deuk-agent/tickets/{uuid}/
```

This file is the only DeukAgentFlow artifact written to the workspace. It is a plain text file containing the UUID. The VS Code extension and CLI use this file to discover workspaces and resolve the correct home ticket directory.

**Nothing else** from DeukAgentFlow belongs in the workspace directory. In particular, `.deuk-agent/` directories inside workspaces are legacy and must be removed.
