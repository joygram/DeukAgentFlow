---
name: doc-sync
summary: 📄 워크스페이스 문서를 설계 정본 기준으로 정합 유지 — 없으면 생성, 불일치면 설계 기준 정본화(코드가 아니라 설계가 정본)하는 문서 동기화 스킬.
category: documentation
bind: doc
system: true
---

# Doc Sync

이 스킬은 조건 없이 이행한다. 여기 적힌 조항을 상황·효율·다른 규칙을 이유로 유예·축약·생략하지 않는다 — 유예할 근거가 떠오르면 그것이 곧 이행하지 않고 있다는 신호다.

Authority: follow `core-rules/AGENTS.md`, the active ticket APC, Phase Gate, and project rules.

Use this skill when asked to audit, create, update, or canonicalize project documentation against the current codebase.

## 서술 규격 (모든 단계에 적용)

작성·정본화하는 모든 문장은 표면 어법 규격 표면 어법 규격을 따른다.

- 규칙은 **수행할 행동**으로 쓴다 — 주어는 에이전트, 서술어는 실행할 동작.
- 문체는 `core-rules/AGENTS.md` → "문서는 메모체로 쓴다"를 따른다 — 한 항목 한 줄 불릿.
- 한 조항은 **240자 안에서** 끝낸다. 길어지면 조항을 나눈다.
- 문서는 **기준**을 말하고, 겪은 일(실측·완료·이번 작업 서사)은 티켓이 받는다.
- 주석은 1~2줄, docstring은 한 줄로 쓴다.
- **링크놀이 금지.** 인용 전 대상 문서를 Read로 실제로 읽는다. 각 문서는 자기 내용을 자기 안에서 완결한다.

`npm run check:surface`(또는 워크스페이스의 동등 검사)로 확인하고, 예산 초과분은 그 자리에서 고친다.

## 진입 절차 (MANDATORY)

스킬 호출 시 반드시 다음 세 가지를 먼저 확정한다.

### docs 구조 사전 확인
작업 시작 전 `docs/README.md` 존재 여부를 확인한다.

- **존재함** → `docs/README.md`를 읽어 작업유형에 맞는 정본 경로를 확인한 뒤 Step 1로.
- **없음** → 아래 표준 구조를 먼저 스캐폴딩한 뒤 Step 1로.

```
docs/
├── README.md ← 에이전트 진입점 (작업유형→경로 매핑)
├── public/
│ ├── architecture/ ← 설계 (How)
│ ├── guides/ ← 사용 가이드
│ └── principles/ ← 핵심 원칙
├── internal/
│ └── planning/ ← 기획 (Why+What)
└── cli-surfaces/ ← CLI 출력 템플릿
```

> `docs/PROJECT_RULE.md`의 `## Role-based Required Reading` 섹션이 있으면 역할별 필독 경로를 그대로 따른다.

#### 형식 사실 선수집 — Doc Oracle CLI
실질 판단(어디로 통합할지·이게 진짜 오염인지)에 앞서, **기계가 결정적으로 뽑을 수 있는 형식 사실**은 CLI로 먼저 확보한다(CLI=형식, 스킬=실질). 이 스캔 결과는 네 판단의 **입력**이지 판정이 아니다 — CLI가 올린 후보 중 무엇이 진짜인지는 네가 문서를 실제로 읽고 판정한다(판정 주체 계약).

```bash
deuk-agent-flow doc scan --workspace <id> # 계층 구조(공개/내부·설계/규약)
deuk-agent-flow doc pollution --workspace <id> # 설계 계층에 낀 현상·일기·실행로그 마커(DR-13)
deuk-agent-flow doc scatter --workspace <id> # 같은 개념이 여러 문서에 재서술된 분산 후보
deuk-agent-flow doc stale --workspace <id> # 갱신 기준 마커 없는 설계 문서
```

- **pollution/scatter는 후보 목록이다 — 오탐을 포함한다.** 예: 네비 README의 공통 헤딩("When to read")은 scatter에 뜨지만 정상 구조다. CLI는 형식 마커만 보므로, "이게 진짜 분산·오염인가"는 네가 문서를 읽고 판정한다(형식 사실은 입력이고, 실질은 네가 정한다).
- CLI가 없거나(구버전) 실패하면 스캔을 손으로 대신하되, 그 사실을 드러낸다(fail-loud).

### 워크스페이스 선택
- **명시적으로 지정된 경우(사용자 발화 또는 `--workspace` 인자로 이미 확정)** → 확인 절차 없이 그대로 사용, Step 2로.
- **미지정 시** → `deuk-agent-flow ticket status --workspace <id>` 또는 `deuk-agent-flow rules` 출력에서 등록된 워크스페이스 목록을 보여주고 선택을 요청.

### 처리 범주 선택
아래 범주 중 처리할 항목을 확정한다 (복수 선택 가능).

| 범주 | 성격 | 대상 경로 | 정본 소스 |
|------|------|-----------|-----------|
| **A-1. 기획** | 내부 (Why+What) | `docs/internal/planning/` | 티켓·사용자 결정 이력 |
| **A-2. 설계** | 공개 (How) | `docs/public/architecture/` | **설계 정본(자기 자신)** — 코드는 설계를 실현할 뿐, 설계문서는 설계 기준으로 고친다 |
| **A-3. 로드맵** | 공개 (When) | `docs/public/` 또는 DeukRoadmap 워크스페이스 | 코드·릴리즈 이력 |
| **A-4. 룰 가이드** | 내부 | `core-rules/` | 에이전트 규칙 정의 |
| **B. 사용 가이드** | 공개 | `docs/public/guides/` | 코드·package.json·릴리즈 이력 |
| **C. 현황** | 내부 | `project-memory.md` | 최신 티켓·코드 상태 |

- **명시적으로 지정된 경우** → 확인 없이 그대로 사용, Step 3(Micro-Protocol)으로.
- **미지정 시** → A-1·A-2·B·C 순서로 자동 순회(전체 처리)한다. 범주 선택은 스스로 정해 진행한다 — 되묻는 것은 "정말 특정 범주만 원하는가"를 사용자가 먼저 밝힌 경우에만 좁힌다.

> **진입점 규칙**: 에이전트는 작업 시작 시 반드시 `docs/README.md`를 먼저 읽어 작업유형에 맞는 경로를 확인한다.

### 미니버전 진행 방식
워크스페이스와 범주가 모두 확정되면(Step 1·2에서 확인/지정 완료), 범주별 처리 결과를 사용자에게 **한 번만** 요약해 승인을 구하고, 승인 후에는 Micro-Protocol(아래) 1~7단계를 범주마다 자동 반복한다. 범주 처리 도중에는 그대로 이어간다 — "계속할까요?"는 정본과 충돌하는 실제 판단(Stop Conditions 항목)이 나올 때만 멈춘다.

## 범주 A 문서 구조 정의

### A-1. 기획 문서 (`docs/internal/planning/`)
기획 문서는 **왜 만드는가(Why)** 와 **무엇을 만드는가(What)** 를 담는다.

```
## Overview — 프로젝트/기능의 목적과 배경
## Problem Statement — 해결하려는 문제 정의
## Goals — 달성 목표 (측정 가능한 형태)
## Non-Goals — 명시적으로 다루지 않는 범위
## User Stories — 사용자 관점의 요구사항
## Success Metrics — 성공 판단 기준
```

### A-2. 설계 문서 (`docs/public/architecture/`)
설계 문서는 **어떻게 만드는가(How)** 를 담는다.

```
## Architecture — 시스템 구조 다이어그램 및 설명
## Components — 주요 컴포넌트와 역할
## Data Flow — 데이터 흐름 및 인터페이스
## API / Interface — 공개 API·인터페이스 명세
## Design Decisions — 핵심 기술 결정 및 근거 (ADR 형식 권장)
## Constraints — 기술적·비즈니스적 제약 조건
```

### A-3. 로드맵 문서 (`docs/public/roadmap.md` 또는 DeukRoadmap 워크스페이스)
로드맵 문서는 **언제 무엇을 만드는가(When+What)** 를 담는다.

```
## Vision — 장기 방향성
## Current State — 현재 구현 상태 (코드 기반으로 검증 필수)
## Milestones — 단계별 목표 (버전/날짜 기준)
 ### vX.Y.Z — 각 마일스톤별 목표와 완료 여부
## Backlog — 우선순위 미정 항목
## Changelog Pointer — CHANGELOG.md 또는 릴리즈 이력 링크
```

### A-4. 룰 가이드 (`core-rules/`)
룰 가이드는 **에이전트·개발자가 따라야 할 규칙** 을 담는다.

```
## Purpose — 이 룰이 존재하는 이유
## Scope — 적용 대상 (에이전트/개발자/플랫폼)
## Rules — 규칙 목록 (필수/권고/경계 구분)
## Enforcement — 위반 시 처리 방법
## Exceptions — 예외 조건
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
6. **정본화** — **설계가 정본이다** (`docs/public/architecture/`의 설계 정본). 코드가 아니다.
 - 문서·코드·설계가 서로 다르면, "누가 옳은지"의 판정 기준은 **설계**다 — 셋 중 무엇이 틀렸는지를 설계로 판정한 뒤 맞춘다.
 - **설계 ≠ 코드**: 설계 복귀 루프로 보낸다 — 설계가 옳으면 코드를 설계에 맞추고, 설계가 틀렸으면 설계문서를 개정한 뒤 문서·코드를 따라 정합시킨다.
 - **문서 ≠ 코드 (설계는 일치)**: 설계가 정한 쪽으로 문서를 정본화한다.
 - 로드맵 "현재 상태"처럼 **사실 확인**이 필요한 항목은 코드·CHANGELOG로 대조한다(이건 사실 검증이지 정본 판정이 아니다).
 - **스테일/데드 정리**: 설계 정본이 더는 규정하지 않는 문서는 정리 대상으로 표시한다.
7. **서술 규격 검사** — `npm run check:surface`를 실행해 부정 어법·장문 조항·절 참조·주석 비대를 확인하고 초과분을 고친다.
8. **결과 보고** — 범주별 처리 결과를 표로 요약한다.

| 문서 경로 | 범주 | 상태 | 처리 내용 |
|-----------|------|------|-----------|
| (경로) | A/B/C | 생성/최신/정본화 | (요약) |

## Stop Conditions

- 활성 티켓 없음 또는 APC에 대상 문서 경로 쓰기 권한 없음.
- 정본 소스(`docs/public/architecture/`)를 읽을 수 없는 경우.
- 문서와 코드의 불일치가 의도적 설계 결정임이 확인된 경우 — 사용자 확인 후 재개.
- 범주 C(현황 문서) 수정이 티켓 상태를 변경하는 경우 — ticket CLI를 통해서만 처리.
- 워크스페이스를 선택한 뒤 문서 수정에 들어간다.
