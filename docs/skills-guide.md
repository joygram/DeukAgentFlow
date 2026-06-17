# Skill System & Flow UI Guide (v5.0)

**한국어:** [skills-guide.ko.md](skills-guide.ko.md)

How to use the v5.0 skill system and the VS Code Flow UI. Skills layer modular behavior contracts onto the agent; the persona skill (`persona-maid`) is one such skill that changes the reply tone.

> **v5.0 architecture direction:** This release is a major overhaul centered on **Claude**. Other agent platforms (Codex, Copilot, Antigravity) are being incrementally reinforced and their support will expand over time.

---

## 1. What a skill is

A skill is a behavior module defined by a single file, `templates/skills/<id>/SKILL.md`. Its frontmatter drives the behavior.

| Field | Meaning |
|---|---|
| `name` | Skill ID (kebab-case) |
| `category` | Grouping (used for conflict warnings) |
| `bind` | Node area where it activates. `rules` → applied at the rules node; empty → area-agnostic (always) |
| `system` | `true` → auto-installed + exposed on init (required system skill). Absent → manual (opt-in) |

**The SSOT is the package `templates/skills/`.** Users fork to edit, but when the source is updated it wins over the fork so package updates propagate.

### Install vs Expose — two-step structure

Skills have separate **install** and **expose** steps. Installing alone has no effect; you must expose the skill to each platform individually.

```
install  →  save the skill file locally
expose   →  mount the skill on a specific agent platform
```

| Step | Meaning | Flow UI |
|---|---|---|
| **Install** | Download the skill locally | `[✓]` checkmark |
| **Expose ON** | Mount skill on the agent | `[ON]` toggle |
| **Expose OFF** | Unmount (does not delete) | `[OFF]` toggle |

Platforms (`claude / codex / copilot / antigravity`) are registered **individually**, so you can apply a skill to only specific agents for fine-grained control.

---

## 2. Skill usage flow (CLI)

```bash
# List installable skills
deuk-agent-flow skill list

# Install a skill
deuk-agent-flow skill add --skill <id>

# Expose to platforms (native platforms like Claude sync to ~/.claude/skills)
deuk-agent-flow skill expose --skill <id>

# Unexpose / remove
deuk-agent-flow skill unexpose --skill <id>
deuk-agent-flow skill remove --skill <id>

# Fork for user editing (copies into the global user dir)
deuk-agent-flow skill fork --skill <id>
deuk-agent-flow skill edit --skill <id>   # fork then open in $EDITOR
```

**Key behavior:**
- After editing a skill source, `dev:install` alone does **not** propagate to native (`~/.claude/skills`); the **next ticket command** triggers the auto-sync at the ticket-command entry point. It hash-compares, so unchanged content is skipped.
- A `bind: rules` skill is surfaced together with the rules-node output.

---

## 3. Using the persona — `persona-maid`

`persona-maid` switches the reply tone to a "subculture maid" persona. It is **disabled by default (opt-in)** in the official release, so you install it explicitly.

### Install & activate

```bash
deuk-agent-flow skill add --skill persona-maid
deuk-agent-flow skill expose --skill persona-maid
```

After install, the **next ticket command** auto-syncs it to native platforms (Claude, etc.) and it takes effect.

### How it works

- **Automatic language branching:** Korean user messages get the KO persona (addresses you as "언니"); English messages get the EN persona (addresses you as "Onee-sama").
- **Expression variety:** it rotates through hearts / sparkles / animals / kaomoji pools, picking different items each reply to avoid staleness.
- **Analysis-mode tone:** the persona is kept even through long technical explanations, tables, and code. Crucially, **code and technical accuracy (file:line evidence) stays 100% intact** — only the tone changes, not the quality.

### Editing

To change the tone or emoji pool, edit the source or your fork.

```bash
deuk-agent-flow skill fork --skill persona-maid   # create a user copy
deuk-agent-flow skill edit --skill persona-maid   # open in editor
```

> ⚠️ When the source (`templates/skills/persona-maid/SKILL.md`) is updated, the next sync may overwrite your fork (source wins). For permanent changes, edit the source and redeploy.

### Disable

```bash
deuk-agent-flow skill unexpose --skill persona-maid   # turn off exposure only
deuk-agent-flow skill remove --skill persona-maid     # remove completely
```

---

## 4. VS Code Flow UI (AgentFlow Panel)

> **New in v5.0 (first release)** — control the ticket and skill workflow from the sidebar. No terminal switching.

### Install

```bash
cd /path/to/DeukAgentFlow
npm run bundle:vscode
npm run install:vscode
```

Installs the bundled VSIX to both desktop VS Code and VS Code Server, pruning older extension folders.

### Panel layout

The panel has **Workspace** and **Skill** tabs at the top.

---

#### Workspace tab

```
┌─────────────────────────────────────────────┐
│  DEUK AGENT FLOW                            │
│  AgentFlow Panel           [⚙] [?]          │
│  VSIX 5.0.2                                 │
├──────────────┬──────────────────────────────┤
│  Workspace   │  Skills                      │
├─────────────────────────────────────────────┤
│  DeukPack · 7/528 tickets        [Refresh]  │
│  ● DeukPack · ph2 · #915-idl-...           │
│    IDLE    No command yet                   │
├─────────────────────────────────────────────┤
│  [● Open tickets]  [Handoff]  [Change status]│
│  915-idl-idl-codegen-enum-import      ▾    │
│  0 selected    7 / 528 tickets              │
├─────────────────────────────────────────────┤
│  ● 915-idl-...  ph2  p2  26/06/16 09:39   │
│    906-csharp-emit-23          open  ...   │
│    904-dppack-round-trip-pass  open  ...   │
│    ...                                     │
└─────────────────────────────────────────────┘
```

| Element | Description |
|---|---|
| `Workspace · N/M tickets` | Currently selected workspace and open/total ticket count |
| Active ticket badge (●) | Ticket currently `use`d — phase and status at a glance |
| `IDLE / No command yet` | Agent command waiting state |
| **Open tickets** button | Status filter toggle (open / closed / all) |
| **Handoff** button | Copy active ticket context to clipboard for AI chat |
| **Change status** button | Dialog to change ticket phase/status |
| Ticket card | Shows `#id · ph · p · date`; click for detailed preview |
| Bottom status bar | `open · #id · ph2 · open · p2` — active ticket summary |

---

#### Skill tab

```
┌─────────────────────────────────────────────┐
│  SKILLS  Skill Management             [↻]   │
│  Install(+) then toggle ON/OFF per agent... │
├─────────┬────┬────────┬──────┬────────┬─────┤
│  Skill  │inst│ claude │codex │copilot │anti │
├─────────────────────────────────────────────┤
│ ▼ maintenance                               │
│  flow-ticket-clean  [✓] [ON] [OFF][OFF][OFF]│
├─────────────────────────────────────────────┤
│ ▼ persona (max 1)                           │
│  persona-maid       [✓] [ON] [ON] [OFF][ON] │
├─────────────────────────────────────────────┤
│ ▼ memory                                    │
│  context-recall     [✓] [ON] [ON] [OFF][ON] │
├─────────────────────────────────────────────┤
│ ▼ documentation                             │
│  doc-sync           [✓] [ON] [ON] [OFF][ON] │
└─────────────────────────────────────────────┘
```

| Column | Description |
|---|---|
| **Skill** | Skill ID (click to preview; prefix `edit=` to open for editing) |
| **inst** | `[✓]` — installed locally |
| **claude / codex / copilot / antigravity** | Per-platform expose ON/OFF toggle |

**Category rules:**
- The `persona` category allows **at most 1** active at a time (conflict warning if violated)
- `[ON]` without `[✓]` is not allowed — run `skill add` first
- `[↻]` button refreshes the list

---

### Tips

- Switching workspaces shows only that workspace's tickets.
- Switching between the skill and workspace tabs preserves state; counts are shown as active/total.
- Skill ON/OFF toggles take effect immediately in the UI, but native platform sync (Claude, etc.) happens automatically on the **next ticket command**.

---

## 5. See also

- Skill architecture & precedence: [architecture.md](architecture.md)
- Full usage guide: [usage-guide.ko.md](usage-guide.ko.md)
- Migration (home directory move): [README.md](../README.md#-upgrading-to-50--home-directory-migration)
