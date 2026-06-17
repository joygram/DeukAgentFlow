# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.5.13] - 2026-04-22


### Added

-  implement RAG-Miss fallback rule, fix ticket template formatting, and ignore tmp dirs in submodule discovery


### Changed

-  squash mermaid diagram changelog noise into single entry

## [2.5.12] - 2026-04-22


### Changed

-  squash mermaid diagram changelog noise into single entry

## [2.5.11] - 2026-04-22

### Added

- implement modernized workflow diagrams with Mermaid v8.8.0 compatibility, semantic color palette, and native SVG text rendering for IDE dark mode compatibility

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

## [2.4.6] - 2026-04-19

### Fixed

- **cli:** suppress update notifier when local version is greater than or equal to registry version (fixes false-positive spam in local dev symlink environments)
- **ticket:** cap `NNN` regex to 4 digits to prevent unix timestamps being incorrectly parsed as ticket sequential numbers, restoring correct `NNN-topic-hostname` format generation

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

## [2.4.4] - 2026-04-19

### Changed

- **rules:** generalize `AGENTS.md` by moving submodule-specific rules (DeukPack, C++, Unity) to their respective workspace `MODULE_RULE.md` files
- **templates:** cleanup legacy templates in `bundle/` to match `publish/` source

## [2.4.3] - 2026-04-18

### Changed

- **ticket:** new ID format `NNN-topic-hostname` (e.g. `001-add-feature-joy-nucb`) replacing legacy `ticket_NNN_hostname_topic` format
- **ticket:** backward-compatible parsing supports both old and new formats in INDEX.json

## [2.4.2] - 2026-04-18


### Added

- **cli:** add update notifier for checking latest npm version


### Fixed

- **ticket:** resolve discrepancy between filename and ticket ID generation
- **ticket:** strictly enforce 8-character limit on hostname slug


### Changed

-  add reasons for global installation
- **changelog:** sync korean changelog with v2.4.0

## [2.4.1] - 2026-04-18


### Added

- **cli:** add update notifier for checking latest npm version


### Fixed

- **ticket:** strictly enforce 8-character limit on hostname slug


### Changed

-  add reasons for global installation
- **changelog:** sync korean changelog with v2.4.0

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

## [2.3.2] - 2026-04-17


### Fixed

- **cli:** resolve `ERR_MODULE_NOT_FOUND` in distributed environments by fixing hardcoded `yaml` dependency path
- **dependencies:** add `yaml` to explicit dependencies list

## [2.3.1] - 2026-04-17


### Changed

- **readme:** add changelog and automated release instructions

## [2.3.0] - 2026-04-17


### Added

- Advance AI pipeline integration and optional synchronization system
- **cli:** add --submodule filter to ticket list command
- **cli:** restore ticket archive and reports workflows to modular architecture
- **rules:** advance rules for Unity Client, WebApp, and C++ Server hybrid environment
- **ticket:** implementation of decentralized ticket management & sharing policy
- **ticket:** upgrade to V2 YAML Front-matter and Categorized List


### Fixed

- **ticket:** deprecate LATEST.md, unify pointer to ACTIVE_TICKET.md
- **ticket:** resolve issue where active tickets were not listed for DeukAgentRules repo


### Changed

- **readme:** clarify YAML front matter preservation and distributed ticket workflow for v2.2.2
- **readme:** restore count headers and npm badges
- **rules:** enforce CLI usage for ticket reading to prevent manual JSON parsing
- Update CLI reference with close and migrate commands

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

- Migrate and rename handoff terminology to ticket in CLI and templates


### Changed

- Add strict rule for DeukPack namespace requirement
- Completely eradicate legacy Handoff references from AGENTS.md, templates, and mdc rules
- Enforce DeukPack code format and API strictly as a hard rule
- Refactor README usage guide and workflow

## [1.0.14] - 2026-04-02


### Added

- **cli:** extend merge tooling and sync publish docs
- **rules:** forbid 'sync' word in commit titles in agent rules
- **handoff:** add indexed handoff workflow and CLI
- **architecture:** migrate template architecture to zero-touch NPM bundle scaffolding


### Fixed

- **cli:** resolve html entity syntax error in template generator


### Changed

- **docs:** public-facing RELEASING and changelog wording; sync-bundle comment
- **docs:** update README with token efficiency mechanism and zero-touch template scaffolding

## [1.0.13] - 2026-03-28


### Fixed

- **deuk-agent-rule:** `printHandoffTip` missing in CLI (handoff tip after `init`)


### Changed

- **docs:** README § Handoffs; GitHub About text; npm keywords; CLI survey adds Claude, Windsurf, JetBrains AI Assistant
- **agents:** optional `.cursor/plans/*.plan.md` mirror for plan-style UI; chat `Path:` line and optional first-line path in handoff files
- **deuk-agent-rule:** `init` prints a short handoff tip after ensuring `.deuk-agent-handoff/`
- **deuk-agent-rule:** default `--rules prefix` overwrites existing `deuk-agent-rule-*.mdc` on repeat `init` (package updates without a separate `merge`)
- **deuk-agent-rule:** `.deuk-agent-rule.config.json` stores interactive choices; later `init` reuses them (`--interactive` to change; `--non-interactive` for CI only)


## [1.0.12] - 2026-03-27


### Fixed

- **ci:** release workflow runs on pushes to `master`

### Changed

- **agents:** require full repo-root paths for handoff file links

## [1.0.11] - 2026-03-26


### Added

- **ci:** GitHub Release workflow for version tags and `chore(release):` commits on `main` / `master`

## [1.0.10] - 2026-03-26


### Added

- **deuk-agent-rule:** changelog template headers without per-commit links

## [1.0.9] - 2026-03-27

### Added

- **deuk-agent-rule:** release changelog tooling; handoff directory gitignore; pre-work handoff scan; AGENTS inject newline fix

### Changed

- **agents:** DeukAgentRules/handoff/LATEST.md handoff path for consumer repos

## [1.0.8] - 2026-03-27

### Added

- This changelog and npm `files` entry so releases are traceable.

## [1.0.7] - 2026-03-27

### Added

- `init`: create `.deuk-agent-handoff/` and append `.gitignore` rules for local handoffs.
- CLI: pre-work handoff scan; `publish/AGENTS.md` and `multi-ai-workflow.mdc` updates.

### Fixed

- AGENTS tagged-region merge: trailing newline after injected blocks.

## [1.0.5] - 2026-03-26

### Changed

- README and package metadata (Deuk Family tagline, npm keywords, GitHub Topics note).

## [1.0.4] - 2026-03-26

### Changed

- Release packaging includes `package-lock.json` for reproducible installs.
- README: absolute links for the npm package page.
