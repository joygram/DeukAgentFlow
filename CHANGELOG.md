# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
