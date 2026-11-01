<!-- Generated from docs/assets/publication-docs.json -->
# Skills, roles and persona

## What skills do

- Skill = a `SKILL.md` playbook containing procedures and checks for recurring work.
- Application = select relevant skills, read them, apply criteria and verify actual results.
- Targets = guessing, overengineering, editing generated files and documentation drift.
- Effectiveness depends on task and project fit; more skills do not imply better performance.

## Representative skills

| Skill | Behavioral criterion |
|---|---|
| safe-refactor | Small scope and necessary checks |
| generated-file-guard | Edit the source of generated files |
| doc-sync | Reconcile documents with design |
| rule-reload | Reread current rules and design |
| persona-maid | Optional conversational character |

## When the agent gets lost

| Symptom | Skill or command | Ask |
|---|---|---|
| Forgets rules or design, starts guessing | rule-reload | “Reload the rules and continue” |
| Unsure of current ticket or stage | ticket-status-surface · `ticket status` | “Show the current ticket status” |
| Repeats a failure or forgets past decisions | context-recall | “Check how earlier tickets handled this” |
| Tone turns stiff or language drifts | persona-maid | “Reload the persona” |
| Right after context compaction or resume | `deuk-agent-flow rules` | “Run rules again first” |

## Using the core skills

- Invocation = slash command in Claude Code such as `/rule-reload`; elsewhere, name the skill in the request.
- rule-reload = rereads `PROJECT_RULE.md`, design canon and ticket scope → three-line recap → resumes work.
- persona-maid = valid for the response that invoked it; invoke again after tool work or a role change.
- Honorific = `deuk-agent-flow persona config set honorific --lang en --value "<name>"`.
- context-recall = read local sources and tickets first, then past tickets and rules; results are evidence only.
- ticket-status-surface = reports ticket state as one line with workspace, status and link.

## Install and expose

```bash
deuk-agent-flow skill list
deuk-agent-flow skill add --skill safe-refactor
deuk-agent-flow skill expose --platform codex --skill safe-refactor
deuk-agent-flow skill lint
```

- Platforms = claude, codex, cursor, copilot, antigravity.
- Installation = availability; exposure = delivery to a particular client.
- Removal = `skill unexpose --platform codex --skill safe-refactor`, then `skill remove --skill safe-refactor`.
- Customization = `skill fork` and `skill edit`; distinguish package and user sources.

## Source and deployment

| Layer | Location and responsibility |
|---|---|
| Package source | `templates/skills/<id>/SKILL.md` |
| Installation/exposure authority | `~/.deuk/skills.json` |
| Client deployment | Native skills or pointers for each client |

## Roles and expression

- Role = expertise and artifact responsibility appropriate to the current stage.
- Persona = conversational tone, situational response and recovery after mistakes.
- Keep persona expression out of code, documents and verification evidence.
- Deuki = product mascot; independent of persona-maid installation or activation.
- [Persona design](../architecture/persona-design.md) · [Usage guide](usage-guide.md).
