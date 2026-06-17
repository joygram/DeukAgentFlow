# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.1] - 2026-04-06


### Changed

-  move ticket marker and unify rules to english plain text

## [2.2.0] - 2026-04-06

### Added
- cli: support implementation_plan.md and Plan headers during migration
- rules: enforce mandatory English-only rules in publish directory
- rules: implement Hard Rule for no Markdown word emphasis (Plain Text only)
- rules: move ticket file path marker to the bottom of the document

## [2.1.0] - 2026-04-05

### Added
- cli: add ticket close status logic and verify workflow phase
- cli: print actual title instead of topic slug in ticket list
- rules: add pre-report self-review phase to definitive workflow
- rules: enforce priority ticket creation and add /ticket slash command

### Fixed
- cli: exclude TICKET_LIST logic files from ticket auto-recovery scan
- cli: replace broken auto-recovery fallback with physical file sync logic

### Changed
- architecture: add how-it-works guide for CLI operating principles
- enforce mandatory post-test artifact risk analysis workflow
- readme: add npm and github status badges to header
- readme: enhance docs with definitive 5-phase workflow and richer prompt usage examples
- readme: prioritize prompt-driven workflow and adopt neutral metrics
- readme: simplify workflow section with 6-phase table and sample scenario
- system: add interactive system and stack selection guide
- workflow: add Korean workflow user guide tutorial

## [2.0.0] - 2026-04-05

### Added
- ci: GitHub Release on main for chore(release); simplify public RELEASING
- cli: extend merge tooling and sync publish docs
- cli: tag .cursorrules inject/remove and sync template from publish
- deuk-agent-rule: automated changelog, bump tooling
- deuk-agent-rule: handoff gitignore, pre-work handoff scan, AGENTS inject newline
- deuk-agent-rule: keep a changelog templates without commit links
- forbid 'sync' word in commit titles in agent rules
- handoff: add indexed handoff workflow and CLI
- workflow: introduce Ticket-First Workflow and Multi-AI Handoff architecture

### Fixed
- ci: run release workflow on master; document GitHub is not auto-synced from gplat
- templates: remove workspace-specific paths from default global rules

### Changed
- absolute links for npm page
- agents: DeukAgentRules/handoff/LATEST.md handoff path for consumer repos
- agents: require full repo-root paths for handoff file links
- Deuk Family tagline, npm keywords, GitHub Topics note
- migrate handoff to ticket terminology
- public-facing RELEASING and changelog wording; sync-bundle comment
- README updates; delivery-and-parallel-work rule; CLI and publish AGENTS updates

## [1.1.0] - 2026-04-05

### Added
- deuk-agent-rule: Modular CLI architecture (ESM native).
- deuk-agent-rule: Recursive directory path resolution for robust ticket discovery.
- deuk-agent-rule: Strict marker casing validation to prevent duplicate injected blocks.

### Changed
- docs: Transitioned to minimalist DeukPack styling for README.
- deuk-agent-rule: Generalized project detection from hardcoded strings to dynamic metadata (Project: prefix).
- deuk-agent-rule: CLI flags now rigorously override saved config values (Config Inheritance).
- deuk-agent-rule: ticket list and ticket use gracefully fail if system is uninitialized.

## [1.0.13] - 2026-03-28
### Fixed
- deuk-agent-rule: printTicketTip missing in CLI (ticket tip after init)

### Changed
- docs: README § Tickets; GitHub About text; npm keywords; CLI survey adds Claude, Windsurf, JetBrains AI Assistant
- agents: optional .cursor/plans/*.plan.md mirror for plan-style UI; chat Path: line and optional first-line path in ticket files
- deuk-agent-rule: init prints a short ticket tip after ensuring .deuk-agent-ticket/
- deuk-agent-rule: default --rules prefix overwrites existing deuk-agent-rule-*.mdc on repeat init (package updates without a separate merge)
- deuk-agent-rule: .deuk-agent-rule.config.json stores interactive choices; later init reuses them (--interactive to change; --non-interactive for CI only)

## [1.0.12] - 2026-03-27

### Fixed
- ci: release workflow runs on pushes to master

### Changed
- agents: require full repo-root paths for ticket file links

## [1.0.11] - 2026-03-26

### Added
- ci: GitHub Release workflow for version tags and chore(release): commits on main / master

## [1.0.10] - 2026-03-26

### Added
- deuk-agent-rule: changelog template headers without per-commit links

## [1.0.9] - 2026-03-27

### Added
- deuk-agent-rule: release changelog tooling; ticket directory gitignore; pre-work ticket scan; AGENTS inject newline fix

### Changed
- agents: DeukAgentRules/ticket/LATEST.md ticket path for consumer repos

## [1.0.8] - 2026-03-27

### Added
- This changelog and npm files entry so releases are traceable.

## [1.0.7] - 2026-03-27

### Added
- init: create .deuk-agent-ticket/ and append .gitignore rules for local tickets.
- CLI: pre-work ticket scan; publish/AGENTS.md and multi-ai-workflow.mdc updates.

### Fixed
- AGENTS tagged-region merge: trailing newline after injected blocks.

## [1.0.5] - 2026-03-26

### Changed
- README and package metadata (Deuk Family tagline, npm keywords, GitHub Topics note).

## [1.0.4] - 2026-03-26

### Changed
- Release packaging includes package-lock.json for reproducible installs.
- README: absolute links for the npm package page.
