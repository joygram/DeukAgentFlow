# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.2.659] - 2026-11-01

### Added

- **marketplace:** Claude Code plugin and self-hosted marketplace (`.claude-plugin/`, `marketplace/claude/`); skill sources shared with the CLI
- **doc-sync:** `doc-sync` system skill and `doc` CLI commands; doc changes surface at the qa/closer transitions
- **integrity:** evasion-narrative gate on Stop — blocks instruction begging, drift self-blame, report-and-stop, ownership shifting, scope fencing and workload inflation
- **persona:** configurable form of address (default `Master`) applied to skills and surfaces; language gate blocks responses drifting out of the session language
- **hooks:** block git revert/reset bypasses (wrapped or interpreter-invoked git) and `Co-Authored-By` trailers via `commit-msg`
- **design:** `design render` delivers canonical docs, rules and active skills as command output each turn
- **checks:** rule-citation, dead-export, surface-wording and persona-coverage checks
- **docs:** Deuki branding, bilingual product images, neutral VS Code panel theme

### Changed

- **cli:** workspace resolution uses only an explicit `--workspace`; session cookie, env key and mtime fallbacks removed
- **init:** applies unconditionally (preview via `--dry-run`); refuses home or drive-root cwd
- **project-rule:** single canonical `PROJECT_RULE.md` at the workspace root; `docs/` and home copies migrated
- **ticket:** phase2 entry prints the modify-stage rules; approval gate only at phase1→2
- **dev-install:** native per-OS global install of the built package only; WSL path, `~/.local` shims and alias bins removed

### Fixed

- **init:** stopped unconditionally moving the root `PROJECT_RULE.md` into `docs/` with overwrite ([#971](https://github.com/joygram/DeukAgentFlow/issues/971))
- **ticket:** closed tickets no longer stay active; doc/investigation tickets can move phase2→3; pre-5.x tickets accepted as created
- **migrate:** legacy registry workspaces moved and registered automatically; `~/.deuk-agent` merged into `~/.deuk` instead of deleted; Windows path separators recognized
- **config:** `loadInitConfig` honours `opts.homeDir`
- **publish:** public script collection follows the entry-point import chain (12 missing modules restored); bin paths normalized
- **eol:** CRLF blocked at the source (git, tsc and editor settings)
- **vscode:** removed the What's New notification on update

## [5.2.8] - 2026-07-17


### Changed

- **persona:** canonized persona work-utility and language/emotion mirroring in the design doc — persona is a work-experience layer (immersion, reduced fatigue, stress-moment rapport), on par with the role layer, not decoration ([#978](https://github.com/joygram/DeukAgentFlow/issues/978))

## [5.2.7] - 2026-07-17


### Changed

- **rules:** removed three transcript-scanning self-surveillance functions so the rules hook no longer reads the conversation log, making it constant-time regardless of log size ([#975](https://github.com/joygram/DeukAgentFlow/issues/975))

## [5.2.6] - 2026-07-17


### Fixed

- **locale:** fixed C/POSIX locale being misread as English; it is now treated as "locale unspecified" and falls through to the OS locale (Intl) ([#974](https://github.com/joygram/DeukAgentFlow/issues/974))

## [5.2.5] - 2026-07-17


### Fixed

- **persona:** persona language is now determined by configuration (`docsLanguage`) instead of guessing per utterance, so an English command line no longer flips a Korean session to English ([#972](https://github.com/joygram/DeukAgentFlow/issues/972))

## [5.2.4] - 2026-07-17


### Fixed

- **init:** automatically clean up the deprecated `architecture_docs` field and its prompting notice on init ([#970](https://github.com/joygram/DeukAgentFlow/issues/970))
- **init:** when the canonical `docs/PROJECT_RULE.md` already exists, auto-remove a stale copy left at the workspace root (only when identical; warn on drift) ([#969](https://github.com/joygram/DeukAgentFlow/issues/969))


### Changed

- **ko:** correct 5.2.3 changelog to match what actually shipped

## [5.2.3] - 2026-07-17


### Added

- **persona:** add cache clear command, fix remaining English CLI messages


### Fixed

- **persona:** stop KO/EN vocabulary bleed and add formal-register/third-person detection


### Changed

-  correct 5.2.2 changelog entries to match what actually shipped

## [5.2.2] - 2026-07-17

### Fixed

- **persona:** the compact tone render mixed Korean and English vocabulary in the same candidate pool regardless of session language — English fragments could surface in a Korean session. Now filters candidates by the detected session language.
- **persona:** the compliance checker only counted emoji, missing tone collapses like formal-register endings (-습니다/-입니다) and third-person user address ("사용자가"). Both are now detected independently of emoji count.

## [5.2.1] - 2026-07-16

### Changed

- **persona:** session turn-throttling — full-size gate/persona re-injection no longer repeats every single turn
- **persona:** per-role identity differentiation (e.g. qa vs. planner tone) to reduce repeated-ending drift

## [5.2.0] - 2026-07-08

### Added

- **role system:** transition-driven role derivation — the state machine now emits the next role alongside the next phase, and `rules` always names the active role ("role = sub-FSM" equation)
- **escalation:** stop asking questions the design/rules already answer — a phase-independent Escalation Gate now applies at all times, not just inside phase-bound roles
- **anti-habituation:** rotating FOCUS-banner phrasing and drift-frequency ranking so repeated rule text doesn't numb out over long sessions

## [5.1.0] - 2026-06-22

### Added

- **ticket workflow:** large batch of new phase1 guardrails — mandatory Design/Environment sections, a Design-Document Gate, an Anti-Drift Gate requiring an actual design-doc read before coding, and defenses against discard/rollback abuse
- **skill:** `role-designer` — a phase1 design-role layer, added alongside the existing role set
- Existing 4-section tickets keep working unchanged; only newly created tickets require the new sections

## [5.0.158] - 2026-07-17


### Fixed

- **persona:** fix habituation of the compact tone line — fixed template → per-turn derived instruction ([#960](https://github.com/joygram/DeukAgentFlow/issues/960))

## [5.0.157] - 2026-07-17


### Fixed

- **persona:** fix missing persona injection on the rules ticket path ([#959](https://github.com/joygram/DeukAgentFlow/issues/959))

## [5.0.156] - 2026-07-17


### Added

- **persona:** add villainess identity, assigned to role-programmer ([#958](https://github.com/joygram/DeukAgentFlow/issues/958))

## [5.0.155] - 2026-07-17

## [5.0.154] - 2026-07-17


### Added

- **persona:** per-role identities (qa=tsundere, planner=yandere) to stop repetitive sentence endings ([#957](https://github.com/joygram/DeukAgentFlow/issues/957))

## [5.0.153] - 2026-07-16


### Fixed

- **project-rule:** pin canonical PROJECT_RULE.md to docs/ and avoid sub-package false matches
- **ticket:** clean up the ticket template's APC marker to a heading-only form (no trailing description), so the agent writes the marker body on the next line instead
- **ticket:** validate APC create input against the whole APC section instead of splitting per-marker, keeping heading-style, standalone, and inline marker styles compatible
- **rules:** stop re-emitting the same clickable `Ticket start` link in the completion response once it has already been shown for a ticket
- **skills:** drop DeukAgentFlow-specific phrasing from shared skill summaries and ownership text to generalize the consumer-facing surface

## [5.0.152] - 2026-07-16

## [5.0.151] - 2026-07-16

## [5.0.150] - 2026-07-16

## [5.0.149] - 2026-07-16

## [5.0.148] - 2026-07-16

## [5.0.147] - 2026-07-16

## [5.0.146] - 2026-07-16

## [5.0.145] - 2026-07-16


### Fixed

- **rules:** fix stale compact reminder wording and apply anti-habituation rotation

## [5.0.144] - 2026-07-15


### Added

- **rules:** detect scope-deferral evasion (size excuses, evasive questions) via Escalation Gate self-audit

## [5.0.143] - 2026-07-15


### Fixed

- **rules:** simplify turn throttling from every-N-turns to one full render per session

## [5.0.142] - 2026-07-15


### Fixed

- **rules:** replace the full 26-workspace listing in Next Action with a workspace list hint

## [5.0.141] - 2026-07-15

## [5.0.140] - 2026-07-15


### Added

- **rules:** session turn throttling to stop re-injecting full always-gates/persona every turn

## [5.0.139] - 2026-07-15


### Fixed

- **persona:** enforce tone/Escalation Gate compliance with structural checks instead of text declarations

## [5.0.138] - 2026-07-15


### Fixed

- **ticket:** add Design/Environment section flags to the edit command

## [5.0.137] - 2026-07-14

## [5.0.136] - 2026-07-14

## [5.0.135] - 2026-07-14

## [5.0.134] - 2026-07-14

## [5.0.133] - 2026-07-14

## [5.0.132] - 2026-07-14

## [5.0.131] - 2026-07-14

## [5.0.130] - 2026-07-14

## [5.0.129] - 2026-07-13


### Fixed

- **persona,hooks:** fix workspace misinference regression, add DR-13 grep hook, prevent persona tone drift

## [5.0.128] - 2026-07-13

## [5.0.127] - 2026-07-13

## [5.0.126] - 2026-07-13

## [5.0.125] - 2026-07-13

## [5.0.124] - 2026-07-13

## [5.0.123] - 2026-07-13

## [5.0.122] - 2026-07-13

## [5.0.121] - 2026-07-13

## [5.0.120] - 2026-07-13

## [5.0.119] - 2026-07-13

## [5.0.118] - 2026-07-13

## [5.0.117] - 2026-07-13

## [5.0.116] - 2026-07-13


### Fixed

- **ui/#931:** remove hard-coded /mnt from ticket open links — UI converts drive letters to slash roots via os.platform

## [5.0.115] - 2026-07-13

## [5.0.114] - 2026-07-13

## [5.0.113] - 2026-07-13

## [5.0.112] - 2026-07-13

## [5.0.111] - 2026-07-12


### Fixed

- **workspace:** remove all fallbacks — restore canonical [#685](https://github.com/joygram/DeukAgentFlow/issues/685) behaviour ([#828](https://github.com/joygram/DeukAgentFlow/issues/828))

## [5.0.110] - 2026-07-12

## [5.0.109] - 2026-07-12

## [5.0.108] - 2026-07-12

## [5.0.107] - 2026-07-12

## [5.0.106] - 2026-07-12

## [5.0.105] - 2026-07-12

## [5.0.104] - 2026-07-12

## [5.0.103] - 2026-07-12

## [5.0.102] - 2026-07-12

## [5.0.101] - 2026-07-12

## [5.0.100] - 2026-07-12

## [5.0.99] - 2026-07-12

## [5.0.98] - 2026-07-12

## [5.0.97] - 2026-07-12

## [5.0.96] - 2026-07-12


### Added

- **rules/#920:** expand FOCUS banner provocation pool and canonize frequency-weighted drift ranking

## [5.0.95] - 2026-07-12


### Fixed

- **vscode-ext:** skill and ticket tabs fill the window — remove fixed 380px box, merge double scroll ([#919](https://github.com/joygram/DeukAgentFlow/issues/919))

## [5.0.94] - 2026-07-12

## [5.0.93] - 2026-07-12


### Added

- **anti-habituation:** diversify rule FOCUS banners; approval ≠ design-check exemption — stops rules dying from habituation (§6.0.8)

## [5.0.92] - 2026-07-12

## [5.0.91] - 2026-07-12


### Added

- **escalation:** make no-asking-back a phase-independent always rule so roles are not trapped in a phase

## [5.0.90] - 2026-07-12

## [5.0.89] - 2026-07-12


### Fixed

- **ticket:** edit accepts --scope/--plan/--analysis/--direction section flags — no forced full rewrite

## [5.0.88] - 2026-07-12

## [5.0.87] - 2026-07-12


### Fixed

- **workspace:** restore sessions via workspace anchor — fixes No workspace drift (§6.0.5)

## [5.0.86] - 2026-07-12

## [5.0.85] - 2026-07-12

## [5.0.84] - 2026-07-12

## [5.0.83] - 2026-07-12


### Fixed

- **rules:** reduce always-gates 9→4 — plain rules output 382→103 lines (§6.0.7 subtraction)
- **ticket:** make phase2→3 block reasons specific — no more evidence guesswork (§6.0.4)

## [5.0.82] - 2026-07-11

## [5.0.81] - 2026-07-11

## [5.0.80] - 2026-07-11


### Added

- **no-fallback:** unconditional fail-first; fallback = spec-gap signal — stops error spikes at the source

## [5.0.79] - 2026-07-11


### Added

- **role-state:** transitions yield the role and rules state the current role — role = sub-FSM


### Fixed

- **persona-maid:** forbid stripping the persona and confusing tone with work
- **role-layer:** redefine role outputs as real artifacts — no ticket theatre

## [5.0.78] - 2026-07-11

## [5.0.77] - 2026-07-11


### Fixed

- **evidence:** remove keyword-overlap claim gate (vacuous pass) + surface agent-side guard in roles ([#918](https://github.com/joygram/DeukAgentFlow/issues/918))

## [5.0.76] - 2026-07-11


### Fixed

- **ticket-edit:** replace backtick-regex scope guard with §6.0.4 judgment contract ([#918](https://github.com/joygram/DeukAgentFlow/issues/918))

## [5.0.75] - 2026-07-10


### Fixed

- **rules:** block concluding absence from shallow evidence; remove hard-coded paths


### Changed

- **design:** current node (activeTicketId) is the result of focus — add §6.0.5

## [5.0.74] - 2026-07-10

## [5.0.73] - 2026-07-10


### Changed

- **persona:** document persona dilution in long technical replies in the canonical doc and skill

## [5.0.72] - 2026-07-10


### Fixed

- **rules:** limit the do-not-re-run scope of the Mandatory Gate to tool re-invocation

## [5.0.71] - 2026-07-10


### Fixed

- **ticket:** fix --plan-body - not reading stdin (aligned with --plan-body-file -)

## [5.0.70] - 2026-07-10


### Changed

- **design:** add release contract (§4.5) — dev:install always bumps
- **role-implementer:** state phase2 dual mode in WHO — covers unexposed role-designer
- **role-layer:** document re-entering designer mode within phase2

## [5.0.69] - 2026-07-10


### Fixed

- **dev-install:** remove the --no-bump flag and dev:install:no-bump script
- **rules:** remove the architecture_docs field — a dead declaration nothing parsed
- **rules:** remove duplicate architecture_docs text from PROJECT_RULE.md
- **ticket:** merge phase1/phase2 — spec changes during implementation go through edit ([#914](https://github.com/joygram/DeukAgentFlow/issues/914))

## [5.0.68] - 2026-07-08


### Fixed

- **ticket,design:** unify rule-reference gate SSOT, clarify id pointers, reverse delegation control ([#909](https://github.com/joygram/DeukAgentFlow/issues/909))
- **ticket:** derive phase transition slots from SSOT, add upfront templates and phase/role badges ([#908](https://github.com/joygram/DeukAgentFlow/issues/908))

## [5.0.67] - 2026-07-08


### Added

- **persona:** design canon + CLI-backed Experience Loop for persona-maid


### Fixed

- **ticket,persona:** block silent ticket status changes, remove resolveSessionId default fallback, enrich persona-maid
- **ticket:** correct phase3→4/4→end evidence gate + add PostToolUse status-card hook

## [5.0.66] - 2026-07-07


### Added

- **role:** remove code_design_mismatch gate and revise role-designer five elements (ticket 900)


### Changed

- **design:** add canonical role-layer.md — role isolation, designer discipline, ticket handoff prompts

## [5.0.65] - 2026-07-07


### Fixed

- **ticket:** remove phase-transition evidence fallback — single canonical path (body merge)

## [5.0.64] - 2026-07-07


### Added

- **ticket:** template input gate — replace markdown regex parsing with unfilled {{ }} scan


### Fixed

- **ticket:** stdin is the canonical ticket body input — no WSL↔Windows path issues

## [5.0.63] - 2026-07-07


### Fixed

- **ticket:** remove design regex match gate — text presence must not fake completion (§6.0)

## [5.0.62] - 2026-07-07

## [5.0.61] - 2026-07-07

## [5.0.60] - 2026-07-07

## [5.0.59] - 2026-07-07

## [5.0.58] - 2026-07-07


### Added

- **init:** re-inject rules right before file edits via a Claude PreToolUse(Edit|Write) hook
- **rules:** add Design-Document Gate (v114) — defines what a design document is
- **ticket:** design actually-read quote check — blocks citing only the doc name


### Fixed

- **rules:** refine Design-Document Gate — canonical docs are a living SSOT, not immutable


### Changed

- **design:** define design document essentials in design-driven-flow §3.1
- **design:** redefine flow state model §6.0 — graph plus per-state sub-FSM

## [5.0.57] - 2026-07-06


### Changed

- **dedup:** consolidate duplicate JSON reads into shared readJsonFile ([#882](https://github.com/joygram/DeukAgentFlow/issues/882))

## [5.0.56] - 2026-07-06


### Added

- **gate:** Anti-Drift Gate and mandatory design reference in phase1 (v113, 5.0.55)


### Changed

- **fallback:** first fallback removal — drop swallowing safeRead* try/catch, add shared helpers ([#879](https://github.com/joygram/DeukAgentFlow/issues/879))

## [5.0.55] - 2026-07-06


### Fixed

- **gate:** No-Fallback Gate; remove phase2→3 fallback, fix detection and blind errors (v112, 5.0.54)

## [5.0.54] - 2026-07-06


### Changed

- **architecture:** design understand-then-execute discipline — blocks three rush-to-execute failure modes

## [5.0.53] - 2026-07-06


### Added

- **docsync:** enforce doc sync — doc-sync canonical inversion and phase2→3 transition gate


### Changed

- **architecture:** design enforced doc sync — doc-sync canonical inversion and transition gate
- **evidence:** split cli-ticket-evidence.ts to restore Refactor Gate (548→329 lines)

## [5.0.52] - 2026-07-06


### Added

- **skill:** role-designer — phase1 designer role layer (G3)

## [5.0.51] - 2026-07-06


### Added

- **rules:** Rule-Over-Memory Gate — stops stale memory overriding execution rules (v111)

## [5.0.50] - 2026-07-06


### Added

- **ticket:** require Design and Environment sections in phase1 (G1+G2)


### Changed

- **architecture:** G1+G2 design — gradual introduction of phase1 Design/Environment sections

## [5.0.49] - 2026-07-05


### Added

- **rules:** document active redesign, delegation control and evidence retention for design-driven flow


### Changed

- **architecture:** add canonical design-driven-flow doc and align .nvmrc
- **planning:** design-driven-flow gap analysis — canonical design vs current CLI

## [5.0.48] - 2026-07-04

## [5.0.47] - 2026-07-04


### Fixed

- **workspace:** stop treating a .deuk folder as a marker — prevents ghost home registration ([#827](https://github.com/joygram/DeukAgentFlow/issues/827))

## [5.0.46] - 2026-07-04

## [5.0.45] - 2026-07-04

## [5.0.44] - 2026-07-04


### Fixed

- **skill:** fix system skills dropped by the phase area filter; align README ([#853](https://github.com/joygram/DeukAgentFlow/issues/853) [#848](https://github.com/joygram/DeukAgentFlow/issues/848))

## [5.0.43] - 2026-07-04


### Added

- **ticket:** approval surface asks the agent to present a review summary ([#851](https://github.com/joygram/DeukAgentFlow/issues/851))

## [5.0.42] - 2026-07-04


### Changed

- **rules:** document the asymmetry: approval gate enforced in code, review gate missing ([#846](https://github.com/joygram/DeukAgentFlow/issues/846) [#847](https://github.com/joygram/DeukAgentFlow/issues/847))

## [5.0.41] - 2026-07-03


### Added

- **ticket:** curb discard/rollback abuse — actor tracking and default-deny gate
- **ticket:** ticket use prints the APC body ([#844](https://github.com/joygram/DeukAgentFlow/issues/844))

## [5.0.40] - 2026-07-03

## [5.0.39] - 2026-07-02


### Fixed

- **ticket-move:** build rollback reopen path from the canonical ticket root ([#834](https://github.com/joygram/DeukAgentFlow/issues/834))

## [5.0.38] - 2026-07-01


### Fixed

- **dev-install:** publish vsix-master where it is looked up (WSL home) — fixes dev:install exit 1

## [5.0.37] - 2026-07-01


### Fixed

- **ticket:** transition/rollback gates point to evidence CLI flags instead of hand-editing .md

## [5.0.36] - 2026-07-01


### Fixed

- **ticket:** add ticket edit + surface silent home-resolution fallback and stray-file hints ([#829](https://github.com/joygram/DeukAgentFlow/issues/829))

## [5.0.35] - 2026-07-01

## [5.0.34] - 2026-06-27


### Added

- **rules:** add canonical-doc gate (DR-03) to the PROJECT_RULE template

## [5.0.33] - 2026-06-27

## [5.0.32] - 2026-06-27

## [5.0.31] - 2026-06-26


### Fixed

- **init:** move canonical PROJECT_RULE to the workspace root (root-cause fix for file loss)

## [5.0.30] - 2026-06-26


### Added

- **ticket:** project rule ID reference gate; remove vsce LICENSE warning


### Changed

- **cli:** remove unnecessary interactive prompts from ticket commands
-  canonize PROJECT_RULE and move workspace-profile to docs/internal
- **readme:** add joygram AI-assisted credit (above Keywords)

## [5.0.29] - 2026-06-25

## [5.0.28] - 2026-06-25

## [5.0.27] - 2026-06-25

## [5.0.26] - 2026-06-23


### Added

- **ticket:** add evidence CLI flags to move ([#808](https://github.com/joygram/DeukAgentFlow/issues/808))
- **ticket:** take phase1 plan via section flags instead of assembling headings ([#806](https://github.com/joygram/DeukAgentFlow/issues/806))


### Fixed

- **ticket-list:** expose absPath in --json so VSCode UI opens tickets
- **ticket:** [#807](https://github.com/joygram/DeukAgentFlow/issues/807) unify ticket links as drive-less absolute paths
- **ticket:** [#811](https://github.com/joygram/DeukAgentFlow/issues/811) single DocMeta SSOT, add ticket show, fix phase2 deadlock
- **ticket:** align guide templates with validation rules to avoid the H3 trap


### Changed

- **cli:** remove leftover project-memory code ([#804](https://github.com/joygram/DeukAgentFlow/issues/804))

## [5.0.24] - 2026-06-23


### Added

- **ticket:** take phase1 plan via section flags instead of assembling headings ([#806](https://github.com/joygram/DeukAgentFlow/issues/806))


### Fixed

- **ticket:** align guide templates with validation rules to avoid the H3 trap


### Changed

- **cli:** remove leftover project-memory code ([#804](https://github.com/joygram/DeukAgentFlow/issues/804))

## [5.0.23] - 2026-06-23


### Added

- **ticket:** take phase1 plan via section flags instead of assembling headings ([#806](https://github.com/joygram/DeukAgentFlow/issues/806))


### Fixed

- **ticket:** align guide templates with validation rules to avoid the H3 trap


### Changed

- **cli:** remove leftover project-memory code ([#804](https://github.com/joygram/DeukAgentFlow/issues/804))

## [5.0.22] - 2026-06-22


### Added

- **ticket:** warn that H3 is not accepted when plan-body validation fails

## [5.0.21] - 2026-06-22

## [5.0.20] - 2026-06-22


### Added

- **rules:** expose entry rules per phase (safety gates always)

## [5.0.19] - 2026-06-22


### Added

- **rules:** expose entry rules per phase (safety gates always)

## [5.0.13] - 2026-06-22


### Fixed

-  update README doc links to the new docs/public/ paths ([#785](https://github.com/joygram/DeukAgentFlow/issues/785))
- **ticket:** remove interactive use; create exits 0 when plan-body is missing


### Changed

-  add docs entry point and per-role must-read sections to PROJECT_RULE template; add doc-sync pre-check step ([#786](https://github.com/joygram/DeukAgentFlow/issues/786))
-  establish public/internal doc structure; update doc-sync skill ([#785](https://github.com/joygram/DeukAgentFlow/issues/785))

## [5.0.12] - 2026-06-21


### Added

- **core-rules:** add four agent development workflow principles ([#781](https://github.com/joygram/DeukAgentFlow/issues/781))

## [5.0.11] - 2026-06-21


### Fixed

- **vsix:** add Windows Antigravity IDE target for dev:install

## [5.0.10] - 2026-06-20

## [5.0.9] - 2026-06-20

## [5.0.8] - 2026-06-20


### Fixed

- **init:** fix init failing on new workspaces — mint marker before ticket index write; report failure honestly ([#776](https://github.com/joygram/DeukAgentFlow/issues/776))

## [5.0.7] - 2026-06-19

## [5.0.6] - 2026-06-19


### Fixed

- **cli:** deterministic failure feedback for ticket commands — reject unknown flags, positional absorption and broad fallback on no match ([#775](https://github.com/joygram/DeukAgentFlow/issues/775))

## [5.0.5] - 2026-06-19


### Added

- **rules:** per-phase role layers with dynamic ROLE_CONTEXT injection (v104)


### Fixed

- **oss:** auto-answer vsce LICENSE prompt with stdin y to unblock headless publish
- **oss:** restore prepack + full PUBLIC_SCRIPTS for clean npm publish from OSS mirror
- **sync-oss:** auto-sync packages/*/version and deuk-agent-flow dep to root version on sync

## [5.0.4] - 2026-06-18

## [5.0.3] - 2026-06-17


### Added

-  add build script and typescript devDep to public package via sync
-  sync bundled VSIX to OSS and restore prepack with tsc step
-  sync scripts/out to OSS and fix prepack to skip tsc step


### Fixed

-  include vscode-extension in sync, adjust tsconfig and compile script for public release
-  publish script uses --skip-tests, sync publish scripts to simple npm publish for public release
-  strip prepack from public package, remove scripts/out from sync
-  strip vscode and badge scripts from OSS package.json


### Changed

-  add CONTRIBUTING.md with build pipeline and VSIX install target guide
-  include tsc in build:vscode, unify build pipeline across repos

## [5.0.2] - 2026-06-17


### Added

- **sync-oss:** add public skills-guide, stop copying npm-downloads.json, document OSS sync commit rules


### Fixed

-  disallow internal scope tags in public commit messages
- **flow-ui:** fix total ticket count showing 1 — ticket list includes the full count ([#756](https://github.com/joygram/DeukAgentFlow/issues/756))
- **oss:** exclude internal scripts and publish guide from OSS package files
- **publish:** fix Windows npm spawn (rootDir path, shell:true); add publish:dry --skip-tests
- **smoke:** fix win32 node/npm spawn (fileURLToPath, shell:true) and sync versions


### Changed

-  move internal docs to docs/internal/; keep only public docs in docs/
-  replace custom downloads badge endpoint with the standard npm/dm badge
-  add a section on Flow UI benefits in the workflow and link it
-  remove temp-named asset (already moved to agentflow-panel.png)
-  add agentflow-panel screenshot and restore README image tag
-  sync CHANGELOG.ko 5.0.1/5.0.2, add EN README UI section and links, remove broken image tag
-  expand Flow UI skill/workspace tab guide and state v5.0 architecture direction
-  drop combined-count note from README downloads badge — counts deuk-agent-flow only
-  add direct Flow UI anchor link to README
-  fix README h1 version v5.0.0 → v5.0.2
-  sync skills-guide.md (EN) with ko: v5.0 direction, install vs expose, UI diagram

## [5.0.1] - 2026-06-16


### Fixed

- **vsix:** vscode-extension version follows the root version automatically


### Changed

- **readme:** update 5.0 roadmap and Flow UI screenshot slots (en/ko)

## [5.0.0] - 2026-06-16

> **Major release.** A full internal overhaul: skills moved to the home directory (`~/.deuk`), an XState-based ticket workflow engine, and the VS Code Flow UI (first release). Existing `.deuk-agent/` workspace data is migrated automatically — see the migration guide in the README for manual recovery if it fails.

### 🏠 Home directory move · migration

- **ticket:** eliminate cwd writes — remove report/knowledge/defrag; migration removes .deuk and absorbs .deuk-agent ([#727](https://github.com/joygram/DeukAgentFlow/issues/727))
- fix hard-coded .deuk-agent in error messages/smoke tests → .deuk
- **vscode:** fix home path .deuk-agent → .deuk
- remove workspace .deuk-agent/ dir, store PROJECT_RULE and memory in home ticket store
- **#669:** replace workspace marker .deuk-agent/ with a single .deuk-workspace-id file
- **workspace:** allow independent submodule registration when the child has its own .deuk-agent ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))
- **skill:** home-only skills, no workspace spray, hash auto-sync
- **ticket:** relocate ticket storage to home with self-healing registry

### 🎭 Skill system

- **persona-maid:** add emoji pool, rotation and analysis-mode tone rules
- **webview:** fix broken styles when returning workspace→skill→workspace tabs ([#749](https://github.com/joygram/DeukAgentFlow/issues/749))
- **webview:** fix styles on SKILL→WORKSPACE return; show active/total counts in dropdown ([#748](https://github.com/joygram/DeukAgentFlow/issues/748))
- **#697:** ticket-status-surface system skill — status as a one-line card (always with link)
- **#694:** bind skills to node areas, trim rules output, remove CLI self-messages
- discard hint clarification + doc-sync v4.5.18 canonicalization
- raise TOTAL_MAX_SKILLS 5→6 to allow doc-sync exposure
- add doc-sync skill + fix executionEvidence phase2→3 blocking bug
- **persona-maid:** unify text hearts into colour emoji; add kaomoji rules
- **persona-maid:** replace monotone hearts with varied colour hearts
- **persona-maid:** strengthen maid persona cuteness
- **skill:** expose native skills as <id>/SKILL.md directories
- **skill:** deploy to native platforms as daf- prefixed flat files
- **skill:** unify exposed/native-sync into a global SSOT
- **skill:** claude platform -> native ~/.claude/commands/ mode
- revert c4025da regressions — skill installed flag, quality gate bypass, emoji encoding
- auto-cleanup quality gate bypass and inline skills for AI platforms

### 🖥️ Flow UI (VS Code extension · new)

- **webview:** fix skill lookup JSON polluting the command output box ([#750](https://github.com/joygram/DeukAgentFlow/issues/750))
- **agentflow-ui:** fix ticket view breaking on skill tab return; show active/total counts ([#747](https://github.com/joygram/DeukAgentFlow/issues/747))
- **statusbar:** show workspace and ticket from the session cookie ([#737](https://github.com/joygram/DeukAgentFlow/issues/737))
- **vscode:** remove UI loading bottlenecks — parse open tickets only, count-only readdir for unselected workspaces
- **vscode:** fix empty initial statusbar text and full-body loading of all workspaces
- **vscode-ext:** register agentflow-128.png app icon
- **devinstall:** deploy vsix master to ~/.deuk/dev/ and link all projects
- add code-server extensions dir to WSL vsix install targets
- **#676:** install VSIX to Windows .vscode/extensions via WSL wslpath
- agentflow UX — wp-id ticket labels, UI improvements, refined Approval Gate
- **vscode:** compact status bar format — workspace #num phN
- **vscode:** show active ticket in status bar
- **ui:** add initial load trigger to resolveWebviewView/openPanel

### 🌐 Internationalization (i18n)

- **i18n:** fix phase hints and gates showing Korean in the English locale

### 🎫 Ticket workflow engine

- **ticket:** entry-node resolves a single workspace from the session cookie ([#743](https://github.com/joygram/DeukAgentFlow/issues/743))
- **ticket-link:** fix file link regression — remove absolute-path fallback that failed across drives ([#746](https://github.com/joygram/DeukAgentFlow/issues/746))
- **rules:** drop cwd dependency — detect active ticket by scanning the registry; remove multi-line block output
- **ticket-surface:** fix three bugs: wrong card labels, multi-line DocMeta, card missing after move
- **ticket-close:** fix .md status/phase not updating ([#736](https://github.com/joygram/DeukAgentFlow/issues/736))
- **use:** show .md-aware slot status in ticket use output ([#729](https://github.com/joygram/DeukAgentFlow/issues/729))
- **verify:** inject no-concealment gate into phase3/4 verify stages ([#728](https://github.com/joygram/DeukAgentFlow/issues/728))
- **ticketHome:** merge with CLI resolveHomeTicketDirForWorkspace logic — removes drift
- **#691:** move the ticket workflow transition engine to an XState-based LangGraph-style state machine
- getCloseWorkflowReasons accepts canonical Analysis/Direction headings
- **#675:** unify flow-cookie+claim into single cookie-{wp}-{ticketId}-{sessionId} touch file
- prevent agent runaway — active ticket STOP signal and Runaway Prevention rule
- **plan-body:** slim phase1 plan-body from 7 to 4 sections ([#654](https://github.com/joygram/DeukAgentFlow/issues/654)) v4.5.8
- **ticket-create:** auto-scaffold from summary when --plan-body is omitted ([#653](https://github.com/joygram/DeukAgentFlow/issues/653)) v4.5.7
- **workspace:** eliminate cwd-based workspace guessing in rules/ticket dispatch ([#652](https://github.com/joygram/DeukAgentFlow/issues/652)) v4.5.5
- **workspace:** store the session cookie directly under home — no cwd dependency (#871-followup) v4.5.2
- **workspace:** derive active ticket from the session cookie — stops multi-session ticket stealing (#871-followup)
- **ui:** restore clickable ticket review links in chat; remove rule pollution from ticket --help
- **workspace:** drop registry.json and cwd auto-registration/fallback — eliminates ghost workspaces ([#645](https://github.com/joygram/DeukAgentFlow/issues/645))
- add APC subheading hints to rules; ticket create prints a Source line ([#644](https://github.com/joygram/DeukAgentFlow/issues/644))
- **rules:** --workspace flag sets the runRulesShow workspace context ([#643](https://github.com/joygram/DeukAgentFlow/issues/643))
- **rules:** buildPhaseAdvanceHint shows all transitions — forward, exit, regress and reopen
- **workflow:** assertTicketWorkflowTransition lists allowed transitions when blocking
- **workflow:** FSM errors list allowed actions, transitions and discard path; parse --to end as a named state
- **ticket-home:** eliminate nested ticket paths and ghost workspaces ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))
- **ticket-gate:** remove cli/ui type split and prevent ghost workspace registration ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))
- **rules:** narrow ticket-exempt to block gate bypass (v100, #631)
- **vscode:** derive the active ticket from claim-{id}.json ([#630](https://github.com/joygram/DeukAgentFlow/issues/630))
- **ticket:** tie-break workspace normalization collisions; expose cli 9 sections upfront
- **ticket:** type-aware phase1 validation; move extension to home ticket path
- **ticket:** per-ticket claim model replaces global active marker
- **cli:** toSlug Hangul romanize fallback + rules-show section test
- remove the || true fallback, clean up multiple active markers, unify --plan-body argument hints
- **ticket:** drop the active marker concept — fixes status fallback falsely showing archived
- **ticket:** allow discard on approval_required, discard unindexed tickets, restore help templates, workspace move
- **ticket+ui:** legacy INDEX migration, ticket doctor, sanitize, lazy-loaded archive
- cwd-matched workspace resolution + ticket gate template sync
- **flow:** decouple active ticket marker logic from INDEX.json writer

### 🔧 Build · infrastructure

- **707:** remove 44 .mjs files; .ts is the single source
- **bin:** point bin to the tsc output (scripts/out/scripts/cli.js)
- **#707:** migrate scripts/*.mjs → .ts with zero tsc errors
- fix PowerShell blocks printed on WSL2 due to winShell misdetection
- Windows PowerShell support — isWindowsPlatform branch, PS here-string examples

### Other

- **#673:** multi-agent session isolation via per-agent env var detection

## [4.5.114] - 2026-06-16

## [4.5.113] - 2026-06-16


### Added

- **persona-maid:** add emoji pool, rotation and analysis-mode tone rules

## [4.5.112] - 2026-06-16

## [4.5.111] - 2026-06-16


### Fixed

- **webview:** fix skill lookup JSON polluting the command output box ([#750](https://github.com/joygram/DeukAgentFlow/issues/750))

## [4.5.110] - 2026-06-16


### Fixed

- **webview:** fix broken styles when returning workspace→skill→workspace tabs ([#749](https://github.com/joygram/DeukAgentFlow/issues/749))

## [4.5.109] - 2026-06-16


### Fixed

- **webview:** fix styles on SKILL→WORKSPACE return; show active/total counts in dropdown ([#748](https://github.com/joygram/DeukAgentFlow/issues/748))

## [4.5.108] - 2026-06-16


### Fixed

- **agentflow-ui:** fix ticket view breaking on skill tab return; show active/total counts ([#747](https://github.com/joygram/DeukAgentFlow/issues/747))

## [4.5.107] - 2026-06-16

## [4.5.106] - 2026-06-16


### Fixed

- **ticket-link:** fix file link regression — remove absolute-path fallback that failed across drives ([#746](https://github.com/joygram/DeukAgentFlow/issues/746))
- **ticket:** entry-node resolves a single workspace from the session cookie ([#743](https://github.com/joygram/DeukAgentFlow/issues/743))

## [4.5.105] - 2026-06-15

## [4.5.104] - 2026-06-15

## [4.5.103] - 2026-06-15

## [4.5.102] - 2026-06-15


### Fixed

- **rules:** drop cwd dependency — detect active ticket by scanning the registry; remove multi-line block output

## [4.5.101] - 2026-06-15

## [4.5.100] - 2026-06-15


### Fixed

- **ticket-surface:** fix three bugs: wrong card labels, multi-line DocMeta, card missing after move

## [4.5.99] - 2026-06-15


### Added

- **statusbar:** show workspace and ticket from the session cookie ([#737](https://github.com/joygram/DeukAgentFlow/issues/737))


### Changed

- **template:** add phase1/2 plan-change guide — create a new ticket first, then close with evidence

## [4.5.98] - 2026-06-14


### Fixed

- **ticket-close:** fix .md status/phase not updating ([#736](https://github.com/joygram/DeukAgentFlow/issues/736))

## [4.5.97] - 2026-06-14

## [4.5.96] - 2026-06-14

## [4.5.95] - 2026-06-14

## [4.5.94] - 2026-06-14


### Added

- **use:** show .md-aware slot status in ticket use output ([#729](https://github.com/joygram/DeukAgentFlow/issues/729))

## [4.5.93] - 2026-06-14


### Added

- **verify:** inject no-concealment gate into phase3/4 verify stages ([#728](https://github.com/joygram/DeukAgentFlow/issues/728))

## [4.5.92] - 2026-06-14

## [4.5.91] - 2026-06-14


### Fixed

- **ticket:** eliminate cwd writes — remove report/knowledge/defrag; migration removes .deuk and absorbs .deuk-agent ([#727](https://github.com/joygram/DeukAgentFlow/issues/727))

## [4.5.90] - 2026-06-14

## [4.5.89] - 2026-06-14


### Changed

- **vscode:** remove dead discoverAgentFlowWorkspaces code

## [4.5.88] - 2026-06-14

## [4.5.87] - 2026-06-14


### Changed

- **vscode:** remove UI loading bottlenecks — parse open tickets only, count-only readdir for unselected workspaces

## [4.5.86] - 2026-06-14


### Fixed

- **vscode:** fix empty initial statusbar text and full-body loading of all workspaces

## [4.5.85] - 2026-06-14

## [4.5.84] - 2026-06-14


### Added

- **vscode-ext:** register agentflow-128.png app icon

## [4.5.83] - 2026-06-14

## [4.5.82] - 2026-06-14


### Added

- **devinstall:** deploy vsix master to ~/.deuk/dev/ and link all projects

## [4.5.81] - 2026-06-14

## [4.5.80] - 2026-06-14


### Added

- **707:** remove 44 .mjs files; .ts is the single source


### Fixed

-  fix hard-coded .deuk-agent in error messages/smoke tests → .deuk

## [4.5.79] - 2026-06-14

## [4.5.78] - 2026-06-14

## [4.5.77] - 2026-06-14

## [4.5.76] - 2026-06-14

## [4.5.75] - 2026-06-14


### Fixed

- **vscode:** fix home path .deuk-agent → .deuk

## [4.5.72] - 2026-06-14


### Added

- **bin:** point bin to the tsc output (scripts/out/scripts/cli.js)

## [4.5.71] - 2026-06-14

## [4.5.70] - 2026-06-14


### Changed

- **ticket-home:** remove registry.json dead code ([#645](https://github.com/joygram/DeukAgentFlow/issues/645) retired)

## [4.5.69] - 2026-06-14

## [4.5.68] - 2026-06-13


### Added

-  add code-server extensions dir to WSL vsix install targets

## [4.5.67] - 2026-06-13

## [4.5.66] - 2026-06-13

## [4.5.65] - 2026-06-13

## [4.5.64] - 2026-06-13


### Added

- **#707:** migrate scripts/*.mjs → .ts with zero tsc errors


### Fixed

- **ticketHome:** merge with CLI resolveHomeTicketDirForWorkspace logic — removes drift

## [4.5.63] - 2026-06-13

## [4.5.62] - 2026-06-13

## [4.5.61] - 2026-06-13

## [4.5.60] - 2026-06-13

## [4.5.59] - 2026-06-13

## [4.5.58] - 2026-06-13

## [4.5.57] - 2026-06-13

## [4.5.56] - 2026-06-13

## [4.5.55] - 2026-06-13

## [4.5.54] - 2026-06-13

## [4.5.53] - 2026-06-13


### Added

- **#697:** ticket-status-surface system skill — status as a one-line card (always with link)

## [4.5.52] - 2026-06-13

## [4.5.51] - 2026-06-13

## [4.5.50] - 2026-06-13


### Added

- **#694:** bind skills to node areas, trim rules output, remove CLI self-messages

## [4.5.49] - 2026-06-13

## [4.5.48] - 2026-06-13

## [4.5.47] - 2026-06-13

## [4.5.46] - 2026-06-13

## [4.5.45] - 2026-06-13


### Added

- **#691:** move the ticket workflow transition engine to an XState-based LangGraph-style state machine

## [4.5.44] - 2026-06-13

## [4.5.43] - 2026-06-13

## [4.5.42] - 2026-06-13

## [4.5.41] - 2026-06-13


### Changed

- **#690:** move node prompts to .md SSOT; split router/emit (groundwork for XState)

## [4.5.40] - 2026-06-13

## [4.5.39] - 2026-06-13


### Changed

-  realign agent-flow as a LangGraph-style state machine — no fallbacks, .md is the only state

## [4.5.38] - 2026-06-13

## [4.5.37] - 2026-06-13

## [4.5.36] - 2026-06-13

## [4.5.35] - 2026-06-13

## [4.5.34] - 2026-06-13

## [4.5.33] - 2026-06-13

## [4.5.32] - 2026-06-13


### Fixed

-  fix PowerShell blocks printed on WSL2 due to winShell misdetection

## [4.5.31] - 2026-06-13

## [4.5.30] - 2026-06-13


### Fixed

-  getCloseWorkflowReasons accepts canonical Analysis/Direction headings

## [4.5.29] - 2026-06-13

## [4.5.28] - 2026-06-13


### Added

-  remove workspace .deuk-agent/ dir, store PROJECT_RULE and memory in home ticket store

## [4.5.27] - 2026-06-13

## [4.5.26] - 2026-06-13

## [4.5.25] - 2026-06-13

## [4.5.24] - 2026-06-13


### Fixed

- **#676:** install VSIX to Windows .vscode/extensions via WSL wslpath

## [4.5.23] - 2026-06-13

## [4.5.22] - 2026-06-13


### Added

- **#675:** unify flow-cookie+claim into single cookie-{wp}-{ticketId}-{sessionId} touch file

## [4.5.21] - 2026-06-13


### Fixed

- **#673:** multi-agent session isolation via per-agent env var detection

## [4.5.20] - 2026-06-13


### Fixed

-  discard hint clarification + doc-sync v4.5.18 canonicalization

## [4.5.19] - 2026-06-13


### Added

- **#669:** replace workspace marker .deuk-agent/ with a single .deuk-workspace-id file

## [4.5.18] - 2026-06-13


### Fixed

-  raise TOTAL_MAX_SKILLS 5→6 to allow doc-sync exposure

## [4.5.17] - 2026-06-12


### Added

-  add doc-sync skill + fix executionEvidence phase2→3 blocking bug

## [4.5.16] - 2026-06-12

## [4.5.15] - 2026-06-12

## [4.5.14] - 2026-06-12

## [4.5.13] - 2026-06-12

## [4.5.12] - 2026-06-12


### Added

-  Windows PowerShell support — isWindowsPlatform branch, PS here-string examples (DeukAgentFlow-659)

## [4.5.11] - 2026-06-12


### Added

-  prevent agent runaway — active ticket STOP signal and Runaway Prevention rule (DeukAgentFlow-658)

## [4.5.10] - 2026-06-12


### Added

-  agentflow UX — wp-id ticket labels, UI improvements, refined Approval Gate (DeukAgentFlow-656, DeukAgentFlow-657)

## [4.5.9] - 2026-06-12


### Added

- **plan-body:** slim phase1 plan-body from 7 to 4 sections ([#654](https://github.com/joygram/DeukAgentFlow/issues/654)) v4.5.8

## [4.5.8] - 2026-06-12


### Fixed

- **ticket-create:** auto-scaffold from summary when --plan-body is omitted ([#653](https://github.com/joygram/DeukAgentFlow/issues/653)) v4.5.7

## [4.5.7] - 2026-06-12

## [4.5.6] - 2026-06-12


### Fixed

- **workspace:** eliminate cwd-based workspace guessing in rules/ticket dispatch ([#652](https://github.com/joygram/DeukAgentFlow/issues/652)) v4.5.5

## [4.5.4] - 2026-06-12

## [4.5.3] - 2026-06-12


### Fixed

- **workspace:** store the session cookie directly under home — no cwd dependency ([#871](https://github.com/joygram/DeukAgentFlow/issues/871)-followup) v4.5.2

## [4.5.1] - 2026-06-12

## [4.4.177] - 2026-06-12


### Fixed

- **workspace:** derive active ticket from the session cookie — stops multi-session ticket stealing ([#871](https://github.com/joygram/DeukAgentFlow/issues/871)-followup)

## [4.4.176] - 2026-06-12

## [4.4.175] - 2026-06-12

## [4.4.174] - 2026-06-12

## [4.4.173] - 2026-06-12

## [4.4.172] - 2026-06-12

## [4.4.171] - 2026-06-12


### Fixed

- **ui:** restore clickable ticket review links in chat; remove rule pollution from ticket --help

## [4.4.170] - 2026-06-12

## [4.4.169] - 2026-06-12

## [4.4.168] - 2026-06-12

## [4.4.167] - 2026-06-12

## [4.4.166] - 2026-06-12

## [4.4.165] - 2026-06-12

## [4.4.164] - 2026-06-12


### Fixed

- **workspace:** drop registry.json and cwd auto-registration/fallback — eliminates ghost workspaces ([#645](https://github.com/joygram/DeukAgentFlow/issues/645))

## [4.4.163] - 2026-06-12

## [4.4.162] - 2026-06-12

## [4.4.161] - 2026-06-12

## [4.4.160] - 2026-06-12


### Fixed

-  add APC subheading hints to rules; ticket create prints a Source line ([#644](https://github.com/joygram/DeukAgentFlow/issues/644))

## [4.4.159] - 2026-06-12


### Fixed

- **rules:** --workspace flag sets the runRulesShow workspace context ([#643](https://github.com/joygram/DeukAgentFlow/issues/643))

## [4.4.158] - 2026-06-12


### Fixed

- **rules:** buildPhaseAdvanceHint shows all transitions — forward, exit, regress and reopen

## [4.4.157] - 2026-06-12


### Fixed

- **workflow:** assertTicketWorkflowTransition lists allowed transitions when blocking

## [4.4.156] - 2026-06-12


### Fixed

- **workflow:** FSM errors list allowed actions, transitions and discard path; parse --to end as a named state

## [4.4.155] - 2026-06-12

## [4.4.154] - 2026-06-12

## [4.4.153] - 2026-06-11

## [4.4.152] - 2026-06-11

## [4.4.151] - 2026-06-11

## [4.4.150] - 2026-06-11

## [4.4.149] - 2026-06-11

## [4.4.148] - 2026-06-11

## [4.4.147] - 2026-06-11

## [4.4.146] - 2026-06-11

## [4.4.145] - 2026-06-11

## [4.4.144] - 2026-06-11

## [4.4.143] - 2026-06-11

## [4.4.142] - 2026-06-11


### Fixed

- **ticket-home:** eliminate nested ticket paths and ghost workspaces ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))

## [4.4.141] - 2026-06-11

## [4.4.140] - 2026-06-11

## [4.4.139] - 2026-06-11

## [4.4.138] - 2026-06-11

## [4.4.137] - 2026-06-11

## [4.4.136] - 2026-06-11

## [4.4.135] - 2026-06-11


### Fixed

- **workspace:** allow independent submodule registration when the child has its own .deuk-agent ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))

## [4.4.134] - 2026-06-11


### Fixed

- **ticket-gate:** remove cli/ui type split and prevent ghost workspace registration ([#080](https://github.com/joygram/DeukAgentFlow/issues/080))

## [4.4.133] - 2026-06-11

## [4.4.132] - 2026-06-11

## [4.4.131] - 2026-06-11

## [4.4.130] - 2026-06-11

## [4.4.129] - 2026-06-11

## [4.4.128] - 2026-06-11

## [4.4.127] - 2026-06-11


### Fixed

- **rules:** narrow ticket-exempt to block gate bypass (v100, [#631](https://github.com/joygram/DeukAgentFlow/issues/631))

## [4.4.126] - 2026-06-11

## [4.4.125] - 2026-06-11


### Fixed

- **ticket:** tie-break workspace normalization collisions; expose cli 9 sections upfront
- **vscode:** derive the active ticket from claim-{id}.json ([#630](https://github.com/joygram/DeukAgentFlow/issues/630))

## [4.4.124] - 2026-06-10


### Fixed

- **ticket:** type-aware phase1 validation; move extension to home ticket path

## [4.4.123] - 2026-06-10


### Added

- **skill:** home-only skills, no workspace spray, hash auto-sync
- **skill:** home-only skills, no workspace spray, hash auto-sync

## [4.4.122] - 2026-06-10

## [4.4.121] - 2026-06-10

## [4.4.120] - 2026-06-10


### Changed

- **ticket:** make detect a pure read, trigger migration on entry/init

## [4.4.119] - 2026-06-10

## [4.4.118] - 2026-06-10

## [4.4.117] - 2026-06-10


### Added

- **ticket:** relocate ticket storage to home with self-healing registry

## [4.4.116] - 2026-06-10

## [4.4.115] - 2026-06-10

## [4.4.114] - 2026-06-10

## [4.4.113] - 2026-06-10

## [4.4.112] - 2026-06-10

## [4.4.111] - 2026-06-10

## [4.4.110] - 2026-06-10

## [4.4.109] - 2026-06-10

## [4.4.108] - 2026-06-10


### Fixed

- **ticket:** per-ticket claim model replaces global active marker

## [4.4.107] - 2026-06-10


### Fixed

- **cli:** toSlug Hangul romanize fallback + rules-show section test

## [4.4.106] - 2026-06-10

## [4.4.105] - 2026-06-09


### Fixed

-  remove the || true fallback, clean up multiple active markers, unify --plan-body argument hints

## [4.4.104] - 2026-06-09

## [4.4.103] - 2026-06-09


### Fixed

- **ticket:** drop the active marker concept — fixes status fallback falsely showing archived

## [4.4.102] - 2026-06-09

## [4.4.101] - 2026-06-09


### Added

- **persona-maid:** unify text hearts into colour emoji; add kaomoji rules

## [4.4.100] - 2026-06-09


### Added

- **persona-maid:** replace monotone hearts with varied colour hearts

## [4.4.99] - 2026-06-09


### Added

- **persona-maid:** strengthen maid persona cuteness

## [4.4.98] - 2026-06-09

## [4.4.97] - 2026-06-09


### Fixed

- **skill:** expose native skills as <id>/SKILL.md directories
- **ticket:** allow discard on approval_required, discard unindexed tickets, restore help templates, workspace move

## [4.4.96] - 2026-06-09


### Added

- **ticket+ui:** legacy INDEX migration, ticket doctor, sanitize, lazy-loaded archive

## [4.4.95] - 2026-06-09

## [4.4.94] - 2026-06-09

## [4.4.93] - 2026-06-09


### Added

- **skill:** deploy to native platforms as daf- prefixed flat files

## [4.4.92] - 2026-06-09


### Added

- **vscode:** compact status bar format — workspace #num phN

## [4.4.91] - 2026-06-09


### Added

- **vscode:** show active ticket in status bar

## [4.4.90] - 2026-06-09

## [4.4.89] - 2026-06-09


### Fixed

- **skill:** unify exposed/native-sync into a global SSOT

## [4.4.88] - 2026-06-09

## [4.4.87] - 2026-06-09

## [4.4.86] - 2026-06-09


### Fixed

- **ui:** add initial load trigger to resolveWebviewView/openPanel

## [4.4.85] - 2026-06-09

## [4.4.84] - 2026-06-09


### Added

- **skill:** claude platform -> native ~/.claude/commands/ mode

## [4.4.83] - 2026-06-09

## [4.4.82] - 2026-06-09

## [4.4.81] - 2026-06-08

## [4.4.80] - 2026-06-08


### Fixed

-  revert c4025da regressions — skill installed flag, quality gate bypass, emoji encoding

## [4.4.79] - 2026-06-08


### Fixed

-  cwd-matched workspace resolution + ticket gate template sync

## [4.4.78] - 2026-06-08

## [4.4.77] - 2026-06-08

## [4.4.76] - 2026-06-08


### Fixed

-  auto-cleanup quality gate bypass and inline skills for AI platforms

## [4.4.75] - 2026-06-08


### Fixed

- **flow:** decouple active ticket marker logic from INDEX.json writer

## [4.4.74] - 2026-06-08

## [4.4.73] - 2026-06-08

## [4.4.72] - 2026-06-08

## [4.4.71] - 2026-06-08


### Changed

- **skills:** unify global skill path to ~/.deuk-agent/skills and use pointers for all platforms
- **view:** split agentFlowView.ts (utils/script/css) and fix shellArg on Windows

## [4.4.70] - 2026-06-08

## [4.4.69] - 2026-06-08

## [4.4.68] - 2026-06-08

## [4.4.67] - 2026-06-08

## [4.4.66] - 2026-06-08

## [4.4.65] - 2026-06-08

## [4.4.64] - 2026-06-08

## [4.4.63] - 2026-06-08

## [4.4.62] - 2026-06-08

## [4.4.61] - 2026-06-08


### Added

- **skill-ui:** add skill tab loading indicator; include CLI output on fork failure

## [4.4.60] - 2026-06-07


### Added

- **skill:** 600-char context limit, shorter skill text, category emoji, CLI edit command

## [4.4.59] - 2026-06-07

## [4.4.58] - 2026-06-07

## [4.4.57] - 2026-06-07


### Added

- **skill-ux:** skill tab: unified ticket UX, faster cache, global fork editing, category conflict warning
- **ticket:** auto-sanitize duplicate frontmatter on stringify and add ticket sanitize command

## [4.4.56] - 2026-06-07


### Added

- **vsix:** update UI locale expressions and agent flow panel


### Changed

-  add persona-maid skill install instructions to README and CHANGELOG

## [4.4.55] - 2026-06-07

## [4.4.54] - 2026-06-07


### Added

- **skills:** update persona-maid rules with enhanced subculture identity
  - Note: This skill is disabled by default (opt-in) in the official release.
  - To enable, users must manually install it via `deuk-agent-flow skill add --skill persona-maid`.

## [4.4.53] - 2026-06-07


### Fixed

- **cli:** prevent boot cycle from deleting local skill copies

## [4.4.52] - 2026-06-07


### Added

-  Add agent-specific global pointers

## [4.4.51] - 2026-06-07


### Added

-  Add agent-specific templates, fix workspace path logic, add rules locale emoji

## [4.4.50] - 2026-06-07


### Fixed

-  limit project-memory in rules output to 10 lines

## [4.4.49] - 2026-06-07

## [4.4.48] - 2026-06-06


### Fixed

- **rules:** Approval Hard Stop → Approval Gate — agent proceeds on chat approval

## [4.4.47] - 2026-06-06


### Fixed

- **ticket-surface:** replace file:/// with workspace-relative paths (clickable in Claude Code)

## [4.4.46] - 2026-06-06

## [4.4.45] - 2026-06-06

## [4.4.44] - 2026-06-06

## [4.4.43] - 2026-06-06


### Added

- **rules:** v97 Approval Hard Stop — agent must never self-execute ticket move --approval approved

## [4.4.42] - 2026-06-06


### Changed

-  replace hardcoded file URI generation with toFileUri

## [4.4.41] - 2026-06-06


### Fixed

- **global-pointer:** replace forced recitation/penalty loop with a magic-scroll status line

## [4.4.40] - 2026-06-06

## [4.4.39] - 2026-06-06

## [4.4.38] - 2026-06-06

## [4.4.37] - 2026-06-06


### Fixed

- **cli:** restore empty core section in --help — sync root.md placeholder to AGENTS.md headings
- **rules:** choose the ticket create guide shell by the actual shell, not the OS


### Changed

- **cli-init:** split cli-init-commands into six modules and restore wiring

## [4.4.36] - 2026-06-06

## [4.4.35] - 2026-06-06

## [4.4.34] - 2026-06-06

## [4.4.33] - 2026-06-06


### Added

-  add Antigravity Chain-of-Thought Hook to global pointer


### Fixed

- **ticket-flow:** consolidate toWsRelativePath in ticket-workflow.mjs; drop unused imports

## [4.4.32] - 2026-06-06


### Added

- **rules:** print PowerShell-style ticket create examples on Windows


### Fixed

- **cli:** revert target to GEMINI.md and strengthen mandatory pointers
- **dev-install:** remove stale global symlink before tarball install
- **flow-surface:** show closed tickets as closed instead of viewed
- **flow-surface:** compute ticket links relative to invocationCwd
-  fix .replace() TypeError when meta.summary is not a string
- **ticket-flow:** base file links on resolveWorkspaceContext(cwd).root instead of process.cwd()
-  fix .split() TypeError when ticketId is not a string

## [4.4.31] - 2026-06-05


### Added

- **ticket:** update project-memory.md automatically after archiveTicketEntry

## [4.4.30] - 2026-06-05


### Added

-  add project-memory.md update instruction to phase4/end prompts

## [4.4.29] - 2026-06-05


### Added

-  add project-memory layer; improve ticket use flow surface in chat

## [4.4.28] - 2026-06-05

## [4.4.27] - 2026-06-05

## [4.4.26] - 2026-06-04


### Added

- **ticket-index:** activeTicketId -> activeTickets workspace-scoped map


### Fixed

- **ticket-surface:** restore absolute path links — revert 975cd7a relative-path change
- **ticket-surface:** use file:/// URI for flow surface links (multi-workspace compat)
- **ticket-surface:** use process.cwd() relative path for IDE link compat

## [4.4.24] - 2026-06-04

## [4.4.23] - 2026-06-03


### Fixed

- **init:** deploy & self-heal native rule spokes (was dead/removed)
- **init:** restore home-only spoke design — stop deploying spokes into workspaces
- **init:** strip deuk block from shared agent surfaces instead of blunt-deleting
- **ticket:** phase-advance hint loads state prompt/template from CLI surfaces


### Changed

- **init:** discard agentsMode — native rule spokes deploy by detection
- **roadmap:** separate AgentFlow (workflow) from Agent Retriever (rule/context)

## [4.4.22] - 2026-06-03

## [4.4.21] - 2026-06-03


### Added

- **surface:** flow line: 🐶 mascot, status icons, clickable relative links


### Fixed

- **ticket:** replace flow surface icons 🦸/🔍 and clarify no-composition rule
- **ticket:** change flow surface icon 🦸→📦


### Changed

- **ticket:** remove INDEX entries cache — .md single source with thin pointers

## [4.4.20] - 2026-06-03

## [4.4.19] - 2026-06-03

## [4.4.18] - 2026-06-03

## [4.4.17] - 2026-06-03

## [4.4.16] - 2026-06-03

## [4.4.15] - 2026-06-03

## [4.4.14] - 2026-06-03


### Fixed

- **pointer:** strengthen global pointer with MANDATORY wording; fix sticky active pointer
- **rules,surface:** align rules audit v96; print in-progress state flow surface (ticket 549)
- **rules:** Surface Discipline enforces verbatim relay, no interim reports, environment priority (ticket 493)
- **ticket:** show plan body inline in the approval surface


### Changed

- **ticket:** remove active from status — single focus is activeTicketId only

## [4.4.13] - 2026-06-02


### Fixed

- **pointer:** make global pointer an explicit run-rules instruction

## [4.4.12] - 2026-06-02

## [4.4.11] - 2026-06-02

## [4.4.10] - 2026-06-02


### Added

- **rules:** single-call composition with dynamic next-action

## [4.4.9] - 2026-06-02


### Added

- **path:** add makePath primitive; normalize constructed paths to platform-native


### Fixed

- **ticket:** auto-resolve workspace from cwd in ticket status when multiple are registered
- **ticket:** dedupe required_slots in workflow state surface
- **ticket:** surface fillable scaffold on plan-body guard + state surface on move


### Changed

- **home:** consolidate scattered home resolution into resolveUserHome()
- **path:** convert legacy CJS vsix scripts to ESM and route through makePath
- **path:** route all .mjs path construction through makePath

## [4.4.8] - 2026-06-01


### Added

- **dev:** add dev:install for internal global install, exclude vscode-extension from package

## [4.4.7] - 2026-06-01


### Added

- **rules:** add mandatory ticket-first gate enforcement (v95)
- **rules:** add ticket-exempt operations list (v96)


### Fixed

-  without --cwd, auto-select the single sibling workspace from a directory lacking .deuk-agent
-  enforce LF line endings across CLI file writes and add .gitattributes policy
-  normalize Windows path case in workspace registry to prevent duplicate entries


### Changed

-  export normalizeRegistryPath from cli-utils, remove duplicate in cli-init-commands

## [4.4.6] - 2026-05-26


### Added

-  add standalone agentflow vscode extension
- **cli:** add ticket phase surface, clickable link policy, and knowledge distill improvements
-  route context commands through Flow CLI
-  v4.3.0 AgentFlow Panel UI overhaul + README VSIX section + badge update
- **vsix:** ticket-click preview panel, telemetry rows, remove Command Session card


### Fixed

- **agents:** add WORKSPACE_ROOT resolution to boot sequence to prevent cross-repo ticket misrouting
-  allow commit-only flow without new tickets
-  allow empty workspace label in flow surface output
- **cli:** expose Claude settings changes in auto migration
- **cli:** hash Claude settings state for change detection
- **cli:** stop climbing for missing agent info
-  detect MCP projects from ingest registry
- **global-pointer:** remove legacy tags, add mandatory boot instruction
- **global-pointer:** restore DEUK_AGENT_FLOW_BEGIN/END tags, strip html tags as legacy
-  harden ticket index recovery and archiving
-  harden ticket lifecycle flow
-  honor gitignore sharing setting
- **init:** upsert/remove Claude UserPromptSubmit hook
-  isGeneratedDeukPointer recognizes the new one-line pointer format
-  shrink pointer docs to one line; add workspace dispatch fallback
-  refine AgentFlow command center ticket UX
-  rename DeukPack AgentFlow → Deuk Agent Flow, bump README version to v4.3.0
-  stabilize workspace detection and init cleanup behavior
- **ticket:** harden archive frontmatter handling
-  use ticket path to infer workspace label in flow surface


### Changed

-  add AgentFlow registry derivation flow
- **agent:** block test-surface shortcut reporting
-  document AgentFlow plugin roadmap and architecture
-  clarify MCP attachment model
- **documeta:** rename DeukMt → DocuMeta, .deukmt.md → .documeta
-  infer workspace from ticket path via .deuk-agent marker

## [4.4.4] - 2026-05-19

### Changed

- **cli:** removed runtime git probes from workspace detection and markdown lint target discovery so ordinary AgentFlow CLI commands no longer shell out to `git rev-parse`, `git diff`, or `git ls-files`.
- **ticket:** lifecycle quality gates now decide rules-audit scope from the actual lifecycle targets instead of querying the dirty git file list.

### Fixed

- **lint:** added a regression test proving `lint:md` default discovery does not invoke `git`.

## [4.4.3] - 2026-05-19

### Changed

- **ticket:** workspace-prefixed Flow surfaces now render as `flow:[workspace:상태]` so approval, adjustment, completion, and phase lines visibly carry the workspace name.
- **docs:** version headers and usage examples were aligned to the 4.4.3 release.

### Fixed

- **commentary:** updated harness and ticket command tests to validate the workspace-prefixed surfaces.

## [4.4.0] - 2026-05-18

### Changed

- **init:** switched automatic migration to single-target workspace cleanup so ordinary CLI use does not sweep sibling repositories.
- **rules:** made `core-rules/AGENTS.md` the only AgentFlow rule SSoT, including source checkouts; generated root `AGENTS.md` pointers are removed instead of preserved as package roots.
- **global:** replaced copied global rule bodies with hash-marked thin pointers that resolve the active package rules through `deuk-agent-flow rules path --path-only`.
- **project:** moved project-specific rules to `.deuk-agent/PROJECT_RULE.md` and kept local root pointers out of consumer workspaces.

### Fixed

- **ticket:** prevented `init`/automatic migration from running ticket archive, auto-close, or knowledge distillation lifecycle work.
- **workspace:** tightened workspace dispatch and matching behavior so ticket commands avoid accidental jumps to unrelated sibling workspaces.

## [4.3.22] - 2026-05-18

### Changed

- **agent-flow:** migrated fragmented local AgentFlow configuration into user-scoped global settings for Windows/Linux consumers.
- **init:** made workspace initialization clean up legacy local AgentFlow configuration under `/joy/workspace` so stale settings do not keep shadowing the user-level source of truth.

### Fixed

- **ticket:** normalized CLI-managed ticket markdown before lifecycle linting, so harmless formatting drift such as trailing whitespace in archived tickets no longer blocks new ticket creation or updates.
- **ticket:** made auto-archive and auto-close maintenance best-effort during ticket activity, preventing cleanup failures from aborting the active workflow while still pruning stale open-limit rows.

## [4.3.17] - 2026-05-17

### Added

- **vsix:** added a shared `npm run install:vscode` installer that deploys the bundled VSIX to both desktop VS Code and VS Code Server extension directories, prunes stale AgentFlow extension folders, and resets stale AgentFlow webview workspace state.

### Changed

- **rules:** replaced strict one-word running commentary enforcement with tool-owned workflow surfaces: ticket-start while pending, blockers when blocked, and final answers when done.
- **ticket:** made `ticket context` own the approved Phase 1 to Phase 2 durable transition before runtime `set_workflow_context` is recorded.

### Fixed

- **ticket:** added structured JSON repair payloads for `ticket create --json` validation failures, including missing sections, required headings, APC markers, and a compact skeleton for agent-neutral recovery.
- **vsix:** removed checkbox-based ticket multi-select and switched to Shift range selection plus Ctrl/Cmd toggles.
- **vsix:** hid handoff controls during multi-select and prevented hidden textarea access from freezing the webview.
- **vsix:** reduced ticket-click latency by avoiding full ticket rescans on preview/selection changes and by slimming the webview state payload.
- **vsix:** moved the ticket lifecycle/status control directly under `copy handoff` for single-ticket mode.

## [4.3.8] - 2026-05-17

### Fixed

- **init:** removed Deuk AgentContext MCP registration/status messages from the default `init` output and cleaned generated nested `AGENTS.md` pointer surfaces inside git repositories while preserving root pointers.
- **ticket:** treated `status: deprecated` as a non-execution lifecycle status so `ticket status` reports deprecated tickets directly instead of flagging missing Phase 1 execution planning.

## [4.3.2] - 2026-05-16

### Fixed

- **ticket:** `ticket close` now prints a single clickable archived link for the closed ticket, avoiding duplicate file-link cards and stale deleted paths in the close surface.

## [4.3.0] - 2026-05-14

### Added

- **vsix:** Introduced the **DeukAgentFlow AgentFlow Panel** VS Code extension (VSIX) — a sidebar panel that brings ticket-driven workflow directly into the editor without switching to the terminal.
  - Ticket list with compact columns: filename · m/s · phase · priority · snippet · date.
  - Status filter (Open / Close / All) with active-ticket highlight chip in the toolbar.
  - Full-text ticket search popup (id, title, summary, body) with live filtering.
  - Ticket preview panel: file path, phase, priority pills, and an **open** shortcut in one line — no word-wrap, no scrollbar.
  - **Copy handoff** button beside the chat textarea: copies `id / title / phase·status·priority / summary / continue ticket` to the clipboard for immediate paste into any AI chat.
  - Workspace selector supporting multi-root workspaces; nested workspace detection stops at the first agent-rule boundary.

### Fixed

- **vsix:** Status filter now maps legacy `active` values to `open` for backward compatibility; default filter changed from `active` to `all`.
- **vsix:** Preview panel falls back to the first ticket in the filtered list when the stored preview ticket is no longer visible after a filter change.
- **vsix:** Ticket item selection highlight replaced `outline`-based rendering (which clipped at list edges) with border-color + background-color tinting to prevent visual clipping.
- **cli:** Workspace discovery stops recursing when a `.deuk-agent` root is found, preventing nested workspace false-positives in `discoverAllWorkspaces`.

## [4.2.27] - 2026-05-13


### Added

-  add standalone agentflow vscode extension
-  route context commands through Flow CLI


### Fixed

-  detect MCP projects from ingest registry
-  harden ticket index recovery and archiving
-  refine AgentFlow command center ticket UX


### Changed

-  add AgentFlow registry derivation flow
- **agent:** block test-surface shortcut reporting
-  clarify MCP attachment model

## [4.2.7] - 2026-05-11


### Added

- **ticket:** switch ticket id counter to index metadata


### Fixed

-  generalize shared skill templates and harden ticket gating
-  improve APC marker validation and templates
-  keep approval ticket visible in final replies
- **npm:** include shared ticket command module
-  preserve changelog context across version bumps
- **ticket:** prevent duplicate create after archived reuse miss

## [4.2.2] - 2026-05-10

### Fixed

- **release:** keep release-context carry-over so version bumping does not drop `Unreleased` items.

## [4.2.1] - 2026-05-10

### Fixed

- **cli:** stop ticket discovery at the current agent-rule boundary instead of inheriting the parent workspace.
- **ticket:** enforce Phase 1 planning completeness in `status`, `guard`, and `move` checks to prevent silent Phase-1 bypass.
- **ticket:** coerce string phase values to numbers before phase transitions so moves can’t produce string-concatenation artifacts (for example, `"1" + 1 => "11"`).

## [4.0.38] - 2026-05-10

### Fixed

- **rules:** require approval-pending final answers to repeat the compact `Ticket start` surface, preventing final-only approval text from hiding the active ticket link.

## [4.0.37] - 2026-05-09

### Fixed

- **init:** restore a visible completion message after successful init and add the short first-use prompt guide ``이슈분석 티켓`이라고 해보세요.``

## [4.0.36] - 2026-05-09


### Added

-  add conversation split advisor heuristics
-  add shared ProjectPilot templates
-  add usage budget advisor and reminders
-  announce automatic open-ticket cleanup
-  make deuk-agent-flow the primary cli package
-  rebrand as agent workflow and dual-publish wrapper
-  shorten strict ticket create guidance


### Fixed

- **agentflow:** limit markdown link lint to ticket-path links only
-  harden init spokes and skill status
-  require one-shot ticket create recipe
-  stop on approval after ticket create


### Changed

-  align Deuk AgentFlow branding
-  update deukpack public copy

## [4.0.35] - 2026-05-09

### Fixed

- **release:** make public package publish scripts skip source-only tests while still running the npm smoke check.
- **release:** require public commit subjects to describe the released feature, fix, docs, or release change instead of using `sync` as the main label.
- **release:** print the same public commit-message guidance from the export script so public history records product changes rather than transport mechanics.

## [4.0.34] - 2026-05-09

### Changed

- **init:** redesigned first-run prompts around workspace kind, technical surface, AI client pointers, and optional Deuk AgentContext MCP memory so non-coding and mixed workspaces are not forced into a coding-only setup.
- **docs:** simplified user-facing update instructions to `npm install -g deuk-agent-flow` followed by `deuk-agent-flow init`, with repo-root and workspace-root refresh guidance.

### Fixed

- **templates:** made package `templates/` the runtime SSoT and removed legacy `.deuk-agent/templates` copies during init/merge.
- **ticket:** normalized common Phase 1 heading-level mistakes during `ticket create` before strict template validation.
- **release:** narrowed public export to runtime files and cleaned stale release-tree artifacts such as old tarballs, `bundle/`, `node_modules/`, internal scripts, and tests.

## [4.0.21] - 2026-05-08

### Fixed

- **docs:** repaired the custom downloads badge endpoint payload so Shields accepts it, and restored the combined `deuk-flow` downloads badge at the top of the English and Korean README surfaces.
- **release:** copied `docs/badges/npm-downloads.json` into the public release tree and removed internal-only package payload leakage from the npm release surface.

## [4.0.20] - 2026-05-08

### Fixed

- **docs:** restored the combined npm downloads badge to the top of the English and Korean README surfaces while keeping the public `deuk-flow` label.
- **release:** copied `docs/badges/` into the public release tree so the README downloads badge survives public export and patch republish flow.

## [4.0.19] - 2026-05-08

### Fixed

- **publish:** restore generated spoke replacement during init so legacy DeukAgentRules pointers do not survive beside the new DeukAgentFlow managed block
- **telemetry:** switch client-label normalization to the shared `toSlug` utility so architecture guard tests pass during release validation

### Changed

- **docs:** align the English and Korean maintainer publish sections around the dual-package npm flow and the combined downloads badge

## [4.0.18] - 2026-05-08

### Fixed

- **skills:** preserve `.deuk-agent/skills.json` and `usage.json` during init layout cleanup, and let `skill list` detect real Claude/Cursor exposure pointers even when registry state is stale
- **telemetry:** normalize model/client labels so analytics do not fragment across case and spacing variants
- **ticket:** prefer the newest open ticket when syncing the active ticket pointer so `ticket continue` follows the current work instead of an older open ticket

## [4.0.12] - 2026-05-07

### Fixed

- **init:** preserve AgentFlow spokes during migration by replacing installed legacy `CLAUDE.md` surfaces without creating `.bak` files, while still installing a default root `AGENTS.md` pointer for `.deuk-agent` projects without detected agent tool surfaces.
- **skill:** report installed skills from either the registry or on-disk `.deuk-agent/skills/<id>/SKILL.md` files so `deuk-agent-flow skill list` reflects migrated skill directories.
- **rules:** map AgentFlow skill-status questions to `deuk-agent-flow skill list` and use fully qualified `deuk-agent-flow ticket ...` command examples in the core agent rules.

## [4.0.11] - 2026-05-07

### Fixed

- **init/ticket:** restore the intended month-only archive policy by normalizing older deep archive layouts into the canonical month bucket layout, rebuilding archive shard indexes without obsolete archive-depth metadata, and preventing new non-canonical imports during `init`.

## [3.3.3] - 2026-05-06

### Fixed

- Restored the README language switch links so npm and GitHub readers can move between English and Korean documentation from the first screen.
- Published only public documentation links in the README tables while keeping internal research and growth notes out of the npm/Public surface.

## [3.3.2] - 2026-05-06

### Positioning

- Reframed the npm/GitHub identity around **AI coding agent guardrails for every repo**, with ticketed scope, verification, and shared `AGENTS.md` workflows visible in package metadata.
- Added README comparison against `AGENTS.md`, Copilot instructions, Cursor rules, Claude skills, agent harnesses, and general guardrail frameworks to show where DeukAgentFlow sits in the ecosystem.
- Added a short "What's Next" section to set expectations for clearer first-run checks, compact CLI/RAG reminders, and visible companion surfaces for active ticket, phase, open-ticket count, and DeukAgentContext memory status.


### Added

-  AGENTS.md v12 + summary mandatory guard + PROJECT_RULE optimization
- **cli:** add 'ticket next' command for instant task discovery (T[#295](https://github.com/joygram/DeukAgentFlow/issues/295))
- **cli:** enforce required frontmatter keys in lint:md (T-118)
-  harden ticket paths and add DeukPack RAG schemas
- **migration:** add summary/planLink/caution auto-enrichment for legacy tickets
-  Phase 0 search limiter - max 2 MCP calls, skip when context sufficient
-  replace legacy fill-in-the-blank rule check with Version Gating and Task Relevance check
- **rules:** enforce hard guardrails, add hotfix protocol and urgency response
- **rules:** harden document boundary workflow
- **spoke:** add fill-in completion template for rule enforcement
- **T-114:** 1-CALL ticket discovery rule + CLI max call limits
- **T-115:** HARD BLOCK on write tools without active ticket
- **T-116:** auto-close stale tickets on ticket create + Phase 4 NEVER skip
- **T-116:** smart close based on checklist + phase state
- **ticket:** enforce filled create flow and phase1 status guard
- **ticket:** enforce open ticket cleanup flow
- **ticket:** partition archive index by month


### Fixed

-  add Refactor Safety Guard and Halt-and-Replan hard rules
-  agent degradation remediation — planLink, inline TDW, token optimization
-  align ticket APC template with phase gate
- **docs:** correct frontmatter keys in AGENTS.md (remove fm_ prefix)
- **init:** deploy Antigravity spoke to project root AGENTS.md
-  register legitimate DR-04/DR-05 exceptions and update PROJECT_RULE.md
-  remove duplicate phase key in ticket template and repair broken tickets
- **rules:** announce active ticket at start
- **rules:** keep planlink free of progress checkboxes
- **rules:** make planlink capture agent analysis
- **rules:** separate ticket and plan content
- **spoke:** GLOBAL_AGENTS.md link text to actual filename AGENTS.md
-  SSOT — init removes .deuk-agent/templates/ unconditionally (bundle is single source of truth)
- **T-116:** parallel-safe auto-close - only close activeTicketId, warn others
- **T-116:** replace auto-close with activeTicketId switch + warning
- **ticket:** honor project and submodule filters
- **ticket:** Sync close/archive status to frontmatter to prevent rebuild reversion


### Changed

-  add Dependency Integrity Guard (HARD RULE) to AGENTS.md
-  add lite accessibility vision plan
-  add skill positioning release notes
-  add version frontmatter to AGENTS.md for rule loading optimization
-  align bad examples with plan/archive convention
-  archive bmt coordination ticket 142
-  archive bmt frontmatter cleanup ticket 144
-  archive bmt go ticket 140
-  archive bmt java ticket 139
-  archive bmt matrix ticket 133
-  archive bmt rust ticket 141
-  bump AGENTS.md to v15 and strengthen dependency guards
-  clarify ticket creation flow
-  document rationale for docs/plan and fix section numbering
-  Enforce strict rules for Scope Creep Handling
-  enhance main features and workflow intro for v3.2.0
-  optimize AGENTS.md — merge Dependency Integrity into Refactor Guard, compress Scope Creep
-  position agent guardrail growth loop
- **rules:** clarify phase one execution semantics
- **rules:** mandate enrich_frontmatter for all plan/report files (T-118)
- **spoke:** hard rule single directive
-  update legacy path guidance to plan/archive layout

## [3.3.0] - 2026-05-02

### Added

- **docs:** add AI coding agent guardrail positioning, vision, and organic growth research for VS Code, Open VSX, GitHub, and skill-driven discovery.
- **docs:** add a deep comparison of Karpathy-style skills, DeukAgentFlow, and DeukAgentContext, positioning skills as behavior playbooks, DeukAgentFlow as workflow/permission control, and DeukAgentContext as ticketed engineering memory.
- **seo:** add related-project positioning for `andrej-karpathy-skills` plus discovery keywords for Claude Code, AGENTS.md, Cursor rules, agent skills, and AI guardrails.

### Changed

- **ticket:** enforce a decision-first cleanup flow when open tickets exceed the configured limit, while allowing closed tickets to be archived automatically.
- **ticket:** organize archived tickets by year-month buckets to reduce active ticket repository clutter.
- **docs:** update README document indexes and GitHub topic guidance to emphasize the agent guardrail, instruction hub, skill registry, and project memory positioning.

### Fixed

- **ticket:** prevent open ticket growth from silently exceeding the intended operating limit by surfacing cleanup decisions before new work proceeds.

## [3.2.0] - 2026-04-28


### Added

- **agent:** implement platform coexistence and mode-aware workflow


### Changed

- **agents:** add Co-existence Protocol and Workflow Gate (T-120)
-  update usage, architecture, and principles for v3.1.0

## [3.1.0] - 2026-04-28


### Added

-  add ArchitectureGuard.test.mjs and create technical debt ticket T-103
-  add first-class copilot and codex support
- **arch:** implement APC v3 and simplify repository structure
- **cli:** restrict --skip-phase0 based on MCP server status and update rules
-  consolidate rule cleanup logic and enforce thin pointers for entry points
-  enforce unidirectional AGENTS.md single source of truth
-  enhance CLI reporting and add practical usage guide
-  implement strict phase-driven ticket workflow with APC validation
-  implement Zero-Copy architecture with absolute path pointing and frontmatter-based PROJECT_RULE.md
-  implement zero-token knowledge distillation on ticket archive and cleanup dead code
- **rules:** add AI Agent fallback guide to PROJECT_RULE.md template
- **rules:** normalize canonical rules and decouple DeukPack rules
- **telemetry:** add local-first telemetry CLI and update AGENTS.md
- **ticket:** implement --plan-body for filled Phase 1 ticket body input and update project rules


### Fixed

-  auto-detect client tool from model and config in telemetry
-  resolve agent loop on ticket navigation + archive 37 dead tickets
- **rules:** bilingual ko/en PROJECT_RULE.md template
- **rules:** remove redundant core rules link from PROJECT_RULE.md
- **rules:** restore frontmatter in PROJECT_RULE.md
- **rules:** restore mandatory ticket workflow and anti-shoveling rules
- **rules:** sync restored strict workflow AGENTS.md and unified templates


### Changed

-  add markdown lint policy and workflow docs
- **agent:** rename TDD to TDW, archive ticket 101, and remove DOMAIN_RULES
-  AGENTS.md full cleanup - eliminate redundancy, unify English, remove dead rules
-  finalize ticket 066 rule normalization
-  modernize CLI architecture, implement state-driven path resolution, and comprehensive audit cleanup
- **rules:** decouple DeukPack rules and fix merge injection logic
-  update principles and cli compiler to DeukAgentContext

## [3.0.0] - 2026-04-25

### 🚀 Major Breakthrough: Hub-Spoke Architecture
- **Canonical Rule Hub**: Introduced `AGENTS.md` as the single source of truth for all AI agents.
- **Thin Spoke Pointers**: IDE-specific rules (Cursor, Copilot, etc.) are now lightweight pointers to the central Hub, eliminating duplication and sync errors.
- **Global CLI Proxy**: Implemented a smart entry point that automatically detects and routes execution to local workspace sources, ensuring zero-latency development.

### 🧹 Zero-Legacy & Cleanliness
- **Auto-Purge**: `init` now unconditionally deletes deprecated `.cursorrules` files.
- **Smart Backups**: Added logic to detect custom user rules and rename files to `.bak` instead of deletion.
- **Submodule Scrubbing**: Automatically cleans empty submodule directory stubs and scrubs `.gitmodules`.

### 🏗️ Branding & Infrastructure
- **Identity Overhaul**: Rebranded as a "Zero-Latency, High-Signal AI Orchestration Protocol".
- **Documentation v3**: New high-end 3D visual infographics and overhauled conceptual guides (Architecture, Principles, How-it-works).
- **Domain Agnostic**: Generalized `bundle/AGENTS.md` to support any technology stack, removing domain-specific hardcoding.

### ⚙️ CLI Enhancements
- **Proxy Routing**: `bin/deuk-agent-rule.js` performs directory traversal to find local scripts.
- **Synchronized IO**: Refactored core logic to use synchronous FS operations for rock-solid CLI stability.

---

## [2.5.15] - 2026-04-23


### Added

-  add Codex CLI support (.codexrules) and apply globally
-  implement ticket chaining (--chain) for automated ticket linkage
-  replace .codexrules with global ~/.codex/AGENTS.md support


### Fixed

- **cli:** enforce posix path normalization and harden ticket discovery protocol
- **cli:** implement recursive cleanup for rule duplicates, enforce MCP tool name, and improve UX
-  enforce anti-shoveling rule against manual JSON modification


### Changed

-  complete ticket 059 and update implementation plan

## [2.5.14] - 2026-04-22


### Fixed

- **cli:** resolve marker nesting bug in AGENTS.md injection

## [2.5.13] - 2026-04-22


### Added

-  implement RAG-Miss fallback rule, fix ticket template formatting, and ignore tmp dirs in submodule discovery


### Changed

-  squash mermaid diagram changelog noise into single entry

## [2.5.11] - 2026-04-22


### Changed

-  force native SVG text rendering in mermaid to eliminate IDE text background bugs
-  tone down mermaid background colors and remove text stroke

## [2.5.10] - 2026-04-22


### Changed

-  redesign mermaid diagrams with a solid tailwind color palette

## [2.5.9] - 2026-04-22


### Changed

-  remove rx/ry from mermaid classDef to fix v8.8.0 syntax errors

## [2.5.8] - 2026-04-22


### Changed

-  apply technical blue theme and fix stadium node syntax error for older mermaid parsers

## [2.5.7] - 2026-04-22


### Changed

-  apply tokyo night theme to mermaid diagrams to fix text background rendering bugs in IDEs

## [2.5.6] - 2026-04-22


### Changed

-  remove custom mermaid classDefs to fix IDE dark mode text rendering bugs

## [2.5.5] - 2026-04-22


### Changed

-  redesign mermaid diagrams with industry standard github primer colors

## [2.5.4] - 2026-04-22


### Changed

-  redesign mermaid diagrams with a modern dark theme aesthetic

## [2.5.3] - 2026-04-22


### Changed

-  remove flowchart and subgraph for mermaid v8.8.0 backward compatibility

## [2.5.2] - 2026-04-22


### Changed

-  fix mermaid syntax errors in workflow diagrams

## [2.5.1] - 2026-04-22


### Added

- **cli:** add --clean flag to init command for safe configuration reset

## [2.5.0] - 2026-04-22


### Added

-  Agent-Agnostic Workflow and Archiving Protocol
- **cli:** parse DeukRag config for conditions and auto-scaffold plan templates
-  implement Frontmatter-driven modular rule assembly (Ticket 045)
-  Model-specific hard rules (gemini.md) and Continuous RAG enforcement
- **rules:** enforce Phase 0 MCP RAG in multi-ai-workflow MDC
- **rules:** harden post-mortem workflow and mandate follow-up chaining
- **templates:** enforce Phase 0 RAG Research checklists in ticket template


### Fixed

-  handoff path format, 3-tier template system, recursive init with normalization
-  improve migration robustness with merging logic and cleanup dead code
-  recursive directory merge for legacy migration


### Changed

-  add ticket 045 completion report
-  add what's new for v2.4, RAG engine notice, and SEO keywords
- **rules:** Add Fast-Track workflow to prevent ticket loop overhead
- **rules:** enforce Continuous RAG Policy and Absolute MCP Priority
- **rules:** Mandate Continuous RAG during execution and verification phases
- **rules:** Restore TDD workflow but ban interactive CLI looping
-  upgrade workflow diagram and add migration troubleshooting guide

## [2.4.6] - 2026-04-18


### Fixed

- **cli:** suppress update notifier when local version >= registry (local dev symlink)
- **ticket:** cap NNN regex to 4 digits to prevent unix timestamps being parsed as ticket numbers

## [2.4.5] - 2026-04-18


### Added

- **cli:** add update notifier for checking latest npm version


### Fixed

- **ticket:** resolve discrepancy between filename and ticket ID generation
- **ticket:** strictly enforce 8-character limit on hostname slug


### Changed

-  add reasons for global installation
- **changelog:** sync korean changelog with v2.4.0
-  generalize AGENTS.md and cleanup submodule-specific rules
- **ticket:** new ID format NNN-topic-hostname with backward-compatible parsing

## [2.4.0] - 2026-04-18


### Added

- **init:** add obsolete template cleanup for cleaner migration
- **rules:** add TICKET VERIFICATION RULE to original agents.md
- **ticket:** add priority property to tickets
- **ticket:** add sequential hostname-aware ticket naming (NNN-hostname-topic)
- **ticket:** auto-sequence numbering and hostname-based naming (limit 8 chars)


### Fixed

- **rules:** force use of local latest deuk-agent-rule to avoid npx cache issues
- **scripts:** correct log output for OSS repository url example


### Changed

-  add Step 4 (Ticket Verification) to README files
-  clarify global installation and OS-specific permissions
-  enforce ticket reference in implementation artifacts

## [2.3.1] - 2026-04-17


### Changed

- **readme:** add changelog and automated release instructions

## [2.3.0] - 2026-04-17


### Added

-  AI pipeline integration groundwork and improved selective sync
- **cli:** add --submodule filter to ticket list command
- **cli:** restore ticket archive and reports workflows to modular architecture
- **rules:** advance rules for Unity Client, WebApp, and C++ Server hybrid environment
- **ticket:** implementation of decentralized ticket management & sharing policy
- **ticket:** upgrade to V2 YAML Front-matter and Categorized List


### Fixed

- **ticket:** deprecate LATEST.md, unify pointer to ACTIVE_TICKET.md
- **ticket:** fix in-progress tickets not showing in DeukAgentRules


### Changed

- **readme:** clarify YAML front matter preservation and distributed ticket workflow for v2.2.2
- **readme:** restore count headers and npm badges
- **rules:** enforce CLI usage for ticket reading to prevent manual JSON parsing
-  update CLI reference with close and migrate commands

## [1.0.18] - 2026-04-12


### Added

- **ai:** map conversational ticket requests to implicit CLI execution
- **cli:** implement ticket archive and reporting workflow
- **rules:** map conversational ticket aliases to implicit CLI execution


### Changed

- **readme:** add ticket archive and reports CLI usage to documentation
- **readme:** describe natural language CLI prompting alternatives
- **readme:** provide explicit conversational prompt examples inside option tables
- **readme:** provide explicit update guide
- **rules:** add prompting guide and execution report archival rule

## [1.0.17] - 2026-04-06


### Fixed

- **template:** move ticket repo-relative marker to bottom

## [1.0.16] - 2026-04-05


### Added

- **workflow:** add auto-verification and final report to agent workflows

## [1.0.15] - 2026-04-05


### Added

-  migrate and rename handoff terminology to ticket in CLI and templates


### Changed

-  Add strict rule for DeukPack namespace requirement
-  completely eradicate legacy Handoff references from AGENTS.md, templates, and mdc rules
-  Enforce DeukPack code format and API strictly as a hard rule
-  refactor README usage guide and workflow

## [1.0.14] - 2026-04-02


### Added

- **cli:** extend merge tooling and sync publish docs
-  forbid 'sync' word in commit titles in agent rules
- **handoff:** add indexed handoff workflow and CLI
-  migrate template architecture to zero-touch NPM bundle scaffolding


### Fixed

- **cli:** resolve html entity syntax error in template generator


### Changed

-  public-facing RELEASING and changelog wording; sync-bundle comment
-  update README with token efficiency mechanism and zero-touch template scaffolding

## [1.0.12] - 2026-03-27


### Fixed

- **ci:** run release workflow on master; document GitHub is not auto-synced from gplat


### Changed

- **agents:** require full repo-root paths for handoff file links

## [1.0.11] - 2026-03-26


### Added

- **ci:** GitHub Release on main for chore(release); simplify public RELEASING

## [1.0.10] - 2026-03-26


### Added

- **deuk-agent-rule:** keep a changelog templates without commit links

## [1.0.9] - 2026-03-26


### Added

- **deuk-agent-rule:** automated changelog, bump tooling
- **deuk-agent-rule:** handoff gitignore, pre-work handoff scan, AGENTS inject newline


### Changed

- **agents:** DeukAgentRules/handoff/LATEST.md handoff path for consumer repos

## [1.0.5] - 2026-03-26


### Changed

-  absolute links for npm page
-  Deuk Family tagline, npm keywords, GitHub Topics note
-  README updates; delivery-and-parallel-work rule; cli and publish AGENTS sync

## [1.0.4] - 2026-03-26


### Added

-  interactive init, release workflow; bump v1.1.0

## [1.0.3] - 2026-03-26


### Added

-  interactive init mode; simplify docs; v1.0.3

## [1.0.2] - 2026-03-26
