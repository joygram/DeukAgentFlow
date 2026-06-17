---
name: doc-sync
summary: 📄 워크스페이스 문서를 코드와 비교해 없으면 생성, 불일치면 정본화하는 문서 동기화 스킬.
category: documentation
bind: doc
---

# Doc Sync

Authority: follow `core-rules/AGENTS.md`, the active ticket APC, Phase Gate, and project rules.

Use this skill when asked to audit, create, update, or canonicalize project documentation against the current codebase.

## 진입 절차 (MANDATORY)

스킬 호출 시 반드시 다음 두 가지를 먼저 확정한다.

### 1. 워크스페이스 선택
`deuk-agent-flow ticket status --workspace <id>` 또는 `deuk-agent-flow rules` 출력에서 등록된 워크스페이스 목록을 확인하고, 사용자에게 어느 워크스페이스의 문서를 정리할지 선택을 요청한다.
- 워크스페이스가 명확히 지정된 경우 그대로 사용.
- 미지정 시 → 등록된 워크스페이스 목록을 보여주고 선택을 요청.

### 2. 처리 범주 선택
아래 범주 중 처리할 항목을 확정한다 (복수 선택 가능).

| 범주 | 대상 문서 | 정본 소스 |
|------|-----------|-----------|
| **A. 내부** | 개발 로드맵, 아키텍처, 룰 가이드, 기획/설계 | 코드·스크립트·설정 파일 |
| **B. 공개** | README, CHANGELOG, LICENSE, 사용 가이드 | 코드·package.json·릴리즈 이력 |
| **C. 현황** | project-memory.md, .deuk-agent/docs/plan/ | 최신 티켓·코드 상태 |

범주 미지정 시 → A·B·C 전체를 순서대로 처리.

## 범주 A 문서 구조 정의

### A-1. 기획 문서 (`docs/planning/` 또는 `docs/internal/`)
기획 문서는 **왜 만드는가(Why)** 와 **무엇을 만드는가(What)** 를 담는다.

```
## Overview          — 프로젝트/기능의 목적과 배경
## Problem Statement — 해결하려는 문제 정의
## Goals             — 달성 목표 (측정 가능한 형태)
## Non-Goals         — 명시적으로 다루지 않는 범위
## User Stories      — 사용자 관점의 요구사항
## Success Metrics   — 성공 판단 기준
```

### A-2. 설계 문서 (`docs/design/` 또는 `docs/architecture/`)
설계 문서는 **어떻게 만드는가(How)** 를 담는다.

```
## Architecture      — 시스템 구조 다이어그램 및 설명
## Components        — 주요 컴포넌트와 역할
## Data Flow         — 데이터 흐름 및 인터페이스
## API / Interface   — 공개 API·인터페이스 명세
## Design Decisions  — 핵심 기술 결정 및 근거 (ADR 형식 권장)
## Constraints       — 기술적·비즈니스적 제약 조건
```

### A-3. 로드맵 문서 (`docs/roadmap.md` 또는 `docs/plugin_roadmap.md`)
로드맵 문서는 **언제 무엇을 만드는가(When+What)** 를 담는다.

```
## Vision            — 장기 방향성
## Current State     — 현재 구현 상태 (코드 기반으로 검증 필수)
## Milestones        — 단계별 목표 (버전/날짜 기준)
  ### vX.Y.Z         — 각 마일스톤별 목표와 완료 여부
## Backlog           — 우선순위 미정 항목
## Changelog Pointer — CHANGELOG.md 또는 릴리즈 이력 링크
```

### A-4. 룰 가이드 (`docs/rules/` 또는 `core-rules/`)
룰 가이드는 **에이전트·개발자가 따라야 할 규칙** 을 담는다.

```
## Purpose           — 이 룰이 존재하는 이유
## Scope             — 적용 대상 (에이전트/개발자/플랫폼)
## Rules             — 규칙 목록 (금지/필수/권고 구분)
## Enforcement       — 위반 시 처리 방법
## Exceptions        — 예외 조건
```

> **정본화 시 주의**: 로드맵의 `Current State`·마일스톤 완료 여부는 반드시 코드·CHANGELOG와 대조해 검증한다.

## Micro-Protocol (순서 엄수)

1. **티켓 확인** — 활성 티켓이 없으면 생성 후 APC에 대상 워크스페이스 문서 경로 쓰기 권한을 명시한다.
2. **범위 선언** — 처리할 워크스페이스 경로와 문서 범주(A/B/C)를 티켓에 기록한다.
3. **존재 확인** — 범주별 예상 문서가 있는지 확인한다.
   - 없음 → **Step 4 (생성)** 으로
   - 있음 → **Step 5 (비교)** 으로
4. **생성** — 코드·설정·스크립트를 읽어 내용을 추출하고 문서를 새로 작성한다. 완료 후 Step 6.
5. **비교** — 문서 각 섹션을 코드 현황과 대조해 불일치 목록을 작성한다.
   - 불일치 없음 → "문서 최신 상태" 보고 후 다음 범주로
   - 불일치 있음 → **Step 6 (정본화)** 으로
6. **정본화** — 코드가 정본이다. 문서를 코드에 맞게 수정한다.
   - 단, 문서에만 존재하는 설계 의도·배경·결정 근거는 **역방향 확인** 후 처리한다.
   - 역방향 확인: 해당 내용이 아직 유효한지 코드·티켓 이력으로 검증. 유효하면 유지(코드에 반영 제안), 무효하면 삭제.
7. **결과 보고** — 범주별 처리 결과를 표로 요약한다.

| 문서 경로 | 범주 | 상태 | 처리 내용 |
|-----------|------|------|-----------|
| (경로)    | A/B/C | 생성/최신/정본화 | (요약) |

## Stop Conditions

- 활성 티켓 없음 또는 APC에 대상 문서 경로 쓰기 권한 없음.
- 정본 소스(코드)를 읽을 수 없는 경우.
- 문서와 코드의 불일치가 의도적 설계 결정임이 확인된 경우 — 사용자 확인 후 재개.
- 범주 C(현황 문서) 수정이 티켓 상태를 변경하는 경우 — ticket CLI를 통해서만 처리.
- 워크스페이스 미선택 상태에서 문서 수정 시작 금지.
