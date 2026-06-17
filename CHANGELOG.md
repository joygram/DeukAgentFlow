# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.3] - 2026-05-06

### Fixed

- Restored the README language switch links so npm and GitHub readers can move between English and Korean documentation from the first screen.
- Published only public documentation links in the README tables while keeping internal research and growth notes out of the npm/OSS surface.

## [3.3.2] - 2026-05-06

### Positioning

- Reframed the npm/GitHub identity around **AI coding agent guardrails for every repo**, with ticketed scope, verification, and shared `AGENTS.md` workflows visible in package metadata.
- Added README comparison against `AGENTS.md`, Copilot instructions, Cursor rules, Claude skills, agent harnesses, and general guardrail frameworks to show where DeukAgentRules sits in the ecosystem.
- Added a short "What's Next" section to set expectations for clearer first-run checks, compact CLI/RAG reminders, and visible companion surfaces for active ticket, phase, open-ticket count, and DeukAgentContext memory status.


### Added

-  AGENTS.md v12 + summary mandatory guard + PROJECT_RULE optimization
- **cli:** add 'ticket next' command for instant task discovery (T[#295](https://github.com/joygram/DeukAgentRules/issues/295))
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
- **docs:** add a deep comparison of Karpathy-style skills, DeukAgentRules, and DeukAgentContext, positioning skills as behavior playbooks, DeukAgentRules as workflow/permission control, and DeukAgentContext as ticketed engineering memory.
- **seo:** add related-project positioning for `andrej-karpathy-skills` plus discovery keywords for Claude Code, AGENTS.md, Cursor rules, agent skills, and AI guardrails.

### Changed

- **ticket:** enforce a decision-first cleanup flow when open tickets exceed the configured limit, while allowing closed tickets to be archived automatically.
- **ticket:** organize archived tickets by year-month and day to reduce active ticket repository clutter.
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

## [2.4.0] - 2026-04-18
- add Codex CLI support (.codexrules) and apply globally
- implement ticket chaining (--chain) for automated ticket linkage
- improve submodule isolation logic
