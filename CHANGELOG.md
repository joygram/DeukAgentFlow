# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] - 2026-04-17


### Added

-  AI 파이프라인 연동 기반 및 선택적 동기화 시스템 고도화
- **cli:** add --submodule filter to ticket list command
- **cli:** restore ticket archive and reports workflows to modular architecture
- **rules:** advance rules for Unity Client, WebApp, and C++ Server hybrid environment
- **ticket:** implementation of decentralized ticket management & sharing policy
- **ticket:** upgrade to V2 YAML Front-matter and Categorized List


### Fixed

- **ticket:** deprecate LATEST.md, unify pointer to ACTIVE_TICKET.md
- **ticket:** DeukAgentRules 현재 진행중인 티켓 안나오던 문제 해결


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


### Added / 추가됨

- **cli:** extend merge tooling and sync publish docs / 병합 도구 및 배포 문서 동기화 스크립트 확장
- **rules:** forbid 'sync' word in commit titles in agent rules / 커밋 제목 내 'sync' 금지 구문 룰 추가
- **handoff:** add indexed handoff workflow and CLI / 인덱스 기반 Handoff 워크플로 및 CLI 신설
- **architecture:** migrate template architecture to zero-touch NPM bundle scaffolding / 제로-터치 NPM 스캐폴딩으로 템플릿 아키텍처 개편


### Fixed / 수정됨

- **cli:** resolve html entity syntax error in template generator / 템플릿 생성기(init) 내부의 HTML 엔티티 문법 에러 핫픽스


### Changed / 변경됨

- **docs:** public-facing RELEASING and changelog wording; sync-bundle comment / 외부 공개용 릴리즈 가이드 및 동기화 스크립트 주석 갱신
- **docs:** update README with token efficiency mechanism and zero-touch template scaffolding / 리드미(README)에 토큰 비용 차단 메커니즘 설정 및 제로 터치 스캐폴딩 문서 개편

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
