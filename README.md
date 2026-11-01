<!-- DEUKI-HEADER:START -->
<table><tr>
<td>

<sub><b>DEUK AGENT FLOW</b></sub>

<h1>Clear actions.<br>Checked results.</h1>

AI collaboration through tickets, skills, roles and persona

`Flow keeps scope` · `Skills guide actions` · `Persona connects`

</td>
<td width="180" align="center"><img src="docs/assets/deuki-avatar.png" width="160" alt="Deuki, a circular Shiba Inu chatbot avatar" /></td>
</tr></table>

<a href="https://www.npmjs.com/package/deuk-agent-flow"><img src="https://img.shields.io/npm/v/deuk-agent-flow.svg" alt="npm version" /></a> <a href="https://www.npmjs.com/package/deuk-agent-flow"><img src="https://img.shields.io/npm/dm/deuk-agent-flow.svg?label=downloads" alt="npm downloads" /></a> · <a href="README.ko.md">한국어</a> · <a href="https://deukpack.app/deuk-agent-flow/">Website</a>
<!-- DEUKI-HEADER:END -->

- **Deuk Agent Flow** = an AI coding workflow connecting tickets, skills, roles and persona.
- Goal = fewer unnecessary edits, missed checks and lost handoffs between conversations.
- Core = the same way of working and the same ticket, whether you use Claude, Codex or another client.

## Get started

- Requirements = Node.js 20+, npm and a supported agent client.

```bash
npm install -g deuk-agent-flow
deuk-agent-flow init
```

1. Run `init` from the project root → choose your agent clients.
2. Ask your agent = “Change only this function and check its behavior”.
3. The agent creates a ticket → scope, plan and completion criteria.
4. Review the plan, reply “approved” → implementation and checks run.
5. Inspect actual results, evidence and remaining risks in the completion report.

- Next session = “Continue the current ticket”; status = `deuk-agent-flow ticket status --workspace <name>`.
- Update = upgrade the global package, then rerun `deuk-agent-flow init`.

## What is different

| Approach | Scope retention | Completion judgment | Handoff between sessions |
|---|---|---|---|
| Direct chat instructions | Repeated by the user | Agent self-report | Lost at session end |
| One AGENTS.md / CLAUDE.md | Static; diluted as it grows | Agent self-report | Manual notes |
| Client planning mode | Within one session | Agent self-report | Lost at session end |
| Deuk Agent Flow | Fixed ticket Scope and APC | Close after evidence slots | Kept in `~/.deuk/tickets/` |

- Planning modes = Claude Code, Codex `/plan`, Cursor Plan Mode, Copilot Plan agent; pre-execution approval is shared.
- Difference = scope re-injected after approval, close refused without evidence, same ticket across clients.
- Combined use = keep the planning mode on while working on an AgentFlow ticket.

## Why

| Observed problem | Study | AgentFlow response |
|---|---|---|
| Rising share of rule violations and false completion reports | [Tang et al. 2026][tang] · 20,574 sessions | No close without criteria and evidence |
| 91.5% of visible misalignments fixed by the user | [Tang et al. 2026][tang] | Stage gates stop first |
| Most failures start as early epistemic errors | [Zhao et al. 2026][zhao] · 1,794 runs | Confirm scope and design before execution |
| Experts 19% slower with AI, yet felt faster | [METR RCT 2025][metr] · 246 tasks | Human review narrowed to plan and evidence |
| Context files: lower success, 20%+ higher cost | [Gloaguen et al. 2026][agentsmd] | CLI supplies only stage-relevant rules |
| Information in the middle of long context underused | [Liu et al. TACL 2024][lost] | Short state surface re-injected each turn |
| Accepting agent edits lowers code comprehension | [Balepur et al. 2026][impaired] · 54 users | Human approves plan and change scope |

[tang]: https://arxiv.org/abs/2605.29442
[zhao]: https://arxiv.org/abs/2607.09510
[metr]: https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
[agentsmd]: https://arxiv.org/abs/2602.11988
[lost]: https://arxiv.org/abs/2307.03172
[impaired]: https://arxiv.org/abs/2607.26375

- Own effect = unverified; current telemetry records ticket create/move/close counts only.

<!-- DEUKI-FLOW:START -->
### How skills steer agent behavior

| 1. Clarify the request | 2. Apply relevant skills | 3. Follow the criteria | 4. Check, correct, hand off |
|---|---|---|---|
| ![1. Clarify the request](docs/assets/deuki-request.svg) | ![2. Apply relevant skills](docs/assets/deuki-skill.svg) | ![3. Follow the criteria](docs/assets/deuki-execute.svg) | ![4. Check, correct, hand off](docs/assets/deuki-verify.svg) |
| Capture the task in a ticket; define change boundaries and completion criteria. | Read relevant SKILL.md playbooks; apply pre-edit checks and execution criteria. | Use stage-specific roles and work within scope; curb guessing and unnecessary edits. | Compare actual results with completion criteria; fix failures, recheck and record. |
| “Change this function only” → name the target and protected areas | safe-refactor → small changes / generated-file-guard → edit the source | Design → implement → QA; doc-sync governs document updates | Failed check → correction → recheck → evidence-backed handoff |

- Behavior steering = task-time instructions, change boundaries and verification feedback; no model retraining.
- On failure = correct and recheck before completion; Persona shapes expression, while Role supplies the perspective for each stage.

### Measured effects in related research

| Method and study | Reported comparison | Behavior carried into AgentFlow |
|---|---|---|
| [SkillsBench v4 · 2026](https://arxiv.org/abs/2602.12670v4) | Curated skills: **33.9% → 50.5% (+16.6 pp)**; 87 tasks, 18 model/harness configurations | Select relevant skills; use focused procedural instructions |
| [MetaGPT · ICLR 2024](https://arxiv.org/html/2308.00352v7) | Adding executable feedback: **HumanEval +4.2 pp; MBPP +5.4 pp**; human revision cost metric **2.25 → 0.83** | Role-specific artifacts; execute, verify and correct |
| [Reflexion · 2023](https://arxiv.org/abs/2303.11366v4) | Reported HumanEval pass@1: **GPT-4 80% / Reflexion 91%**; reflection and retry procedure included | Record failure feedback and use it in subsequent attempts |
| [Bickmore & Picard · 2005](https://www2.ccs.neu.edu/research/rag/publications/05_CHI_BTPR.pdf) | 101 users, one-month exercise-support study: **greater liking, trust and desire to continue** with the relational agent | Consistent persona expression and conversational continuity |

- Research-supported direction = **relevant skills + structured roles + executable verification and correction + consistent interaction**.
- Task fit matters: [SWE-Skills-Bench v2](https://arxiv.org/abs/2603.15401v2) found no significant effect for 92 of 98 skills; average pass ratio 76.6% → 76.9%.
- Figures belong to the cited experiments, not Deuk Agent Flow performance measurements. Persona effects on coding productivity remain unverified.
<!-- DEUKI-FLOW:END -->

## Components

| Element | Responsibility | Examples |
|---|---|---|
| Flow | Scope, approval, verification, handoff | Tickets, APC, state-aware CLI |
| Skill | Procedural criteria for recurring work | safe-refactor, generated-file-guard, doc-sync |
| Role | Stage-specific expertise | Planning, design, implementation, QA, closeout |
| Persona | Expression and situational responses | Optional persona-maid |

- Persona effect = softens stiff robotic tone; responsiveness stays warm through long tasks.
- Refusals = no "that feature is unavailable" declarations or lectures, just a brief move-on; judgment unchanged.
- After correction = flinch → recover → fix at once; code, documents and evidence stay neutral.
- Storage = `~/.deuk/tickets/{workspace-uuid}/`; workspace selected with CLI `--workspace`.
- VS Code panel = ticket inspection, workspace switching, handoff copying and skill controls.

## Apply a skill

```bash
deuk-agent-flow skill list
deuk-agent-flow skill add --skill safe-refactor
deuk-agent-flow skill expose --platform codex --skill safe-refactor
```

- Optional persona = `deuk-agent-flow skill add --skill persona-maid`.
- Exposure platforms = claude, codex, cursor, copilot, antigravity.
- Removal = `skill unexpose`, then `skill remove`; use the CLI instead of deleting deployed files.

## Documentation

| Document | Purpose |
|---|---|
| [Usage guide](docs/usage-guide.md) | Setup, updates, daily use |
| [How it works](docs/how-it-works.md) | Flow, storage, roles, handoffs |
| [Skills guide](docs/skills-guide.md) | Behavior steering, installation, exposure, persona |
| [Architecture](docs/architecture.md) | State, rules, storage |
| [Principles](docs/principles.md) | Collaboration goals, evidence, change policy |

- [VS Code extension](vscode-extension/README.md) · License Apache-2.0 · Built by joygram with AI-assisted development.
