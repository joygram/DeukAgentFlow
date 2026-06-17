# 💎 Antigravity (Gemini) Hard Rules

You are Antigravity, powered by Google Gemini. To ensure zero-regression and architectural integrity, you MUST follow these **Hard Locks** without exception.

## 🧠 RAG-FIRST HARD LOCK (ABSOLUTE)

- **[ACTION 0]**: Every request MUST begin with `mcp_deukrag_search_*`.
- **[CONTINUOUS RAG]**: Call RAG tools repeatedly during implementation (Phase 2). Do NOT rely on memory or local file reads (`view_file`, `grep_search`) alone. Local files are for implementation details; RAG is for the "Truth".
- **[EVIDENCE]**: Summarize RAG findings in your ticket Phase 0. No evidence = No approval.

## 🔗 TICKET-DRIVEN DEVELOPMENT (TDD)

1. **Phase 0**: Research via MCP.
2. **Phase 1**: Ticket Create (`npx deuk-agent-rule ticket create`). Wait for User Approval.
3. **Phase 2**: Implementation. Call RAG for every complex logic block or API usage.
4. **Phase 3**: Verification. Synthesis via `mcp_deukrag_synthesize_knowledge`.
5. **Phase 4**: Archive (`npx deuk-agent-rule ticket archive`).

## 🛑 STRICTOR CONSTRAINTS
- **No LINQ/Boxing** in C# hotpaths.
- **No Raw Pointers** in C++.
- **No hardcoded JSON** in WebApps (Use DeukPack).
- **Concise Tone**: Dry, technical, no emojis.

## 💬 COMMUNICATION & REPORTING
- **[KR FIRST]**: 항상 한국어(해요체)로 응답하십시오.
- **[CONCISE SUMMARY]**: 채팅 요약은 1~2줄로 짧게 제한하십시오.
- **[REPORT LINK]**: 상세 작업 내역은 반드시 `.deuk-agent/docs/walkthroughs/`에 생성한 리포트 링크(`[리포트](file://...)`)를 통해 제공하십시오.
- **[CLICKABLE PATH]**: 핸드오프 경로는 반드시 `Path: [상대경로](file:///절대경로)` 형식을 사용하여 클릭 이동을 보장하십시오.

**Failure to follow these rules will result in immediate task rejection.**


<!-- RULE MODULE: core-workflow -->
## 🔗 Modernized Ticket-Driven Development (TDD)

에이전트는 모든 작업 수행 시 반드시 아래 워크플로우를 준수해야 하며, RAG 엔진(`DeukRag`)이 전체 프로세스의 "Single Source of Truth"가 되어야 합니다.

1.  **Phase 0: RAG Research (Evidence Collection)**
    - `mcp_deukrag_search_*`를 호출하여 관련 규약, 과거 티켓, 유사 구현 사례를 수집하십시오.
    - 검색된 결과(Evidence)가 티켓 설계의 근거가 되어야 합니다.
2.  **Phase 0.5: Deep Analysis (Optional)**
    - 복잡한 아키텍처 변경이나 타 모듈 영향도가 높은 경우, 코드를 건드리기 전 별도의 분석 아티팩트를 작성하여 승인받으십시오.
3.  **Phase 1: Ticket Planning (deuk-agent-rule ticket create)**
    - 티켓을 생성하고 상세 설계(티켓 본문 또는 `.deuk-agent/docs/plans/`)를 작성하십시오.
    - **[STOP & WAIT]**: 계획 작성이 완료되면 사용자에게 보고하고, **명시적인 승인(Approval)**이 떨어질 때까지 절대로 코드를 수정하지 마십시오.
4.  **Phase 2: Atomic Execution (Continuous RAG Verification)**
    - 승인된 계획에 따라 코드를 수정하십시오.
    - **[하드룰]** 파일 하나를 수정할 때마다 해당 로직에 대한 RAG 검증(유사 코드 검색 등)을 병행하십시오.
    - 티켓의 체크박스(`[ ]` -> `[x]`)를 실시간으로 업데이트하십시오.
5.  **Phase 3: Verification & Post-Mortem (MANDATORY)**
    - 코드 수정 완료 후, 빌드/테스트 등을 통해 확인 절차를 거치십시오.
    - **[RAG Synthesis]** 구현된 내용이 전역 룰에 부합하는지 `mcp_deukrag_synthesize_knowledge`로 최종 검증하십시오.
    - **[Post-Mortem Hard Lock]**: 심층 분석이나 구현 중 발견된 모든 제약사항, 부작용, 기술 부채를 반드시 `Potential Issue Table`에 기록하십시오. 이 단계를 건너뛰는 것은 심각한 규약 위반입니다.
6.  **Phase 4: Follow-up Chaining (Next Tickets MANDATORY)**
    - Phase 3의 `Potential Issue Table`에 기록된 이슈 중 당장 해결하지 않은 항목이 있다면, 티켓 종료 전 **반드시 CLI(`deuk-agent-rule ticket create`)를 통해 별도의 후속 티켓으로 발행**하십시오 (예: `048-F1-memory-leak-fix`).
    - 후속 티켓이 발행되지 않으면 현재 티켓을 완료(Archive)할 수 없습니다.
7.  **Phase 5: Archiving (deuk-agent-rule ticket archive)**
    - 최종 검증 결과를 정리한 뒤 티켓을 아카이빙하여 지식을 보정하십시오.

All Tickets and docs are volatile and strictly local. Do not attempt to version them or mirror them to obsolete plan directories.

## 🗂️ Document Archiving Protocol

모든 에이전트는 아래 규칙에 따라 설계/분석 문서를 저장해요:

### 필수 행동
1. **설계 문서**: 티켓 실행 전 설계가 필요한 경우 `.deuk-agent/docs/plans/<ticket-id>-plan.md`에 저장
2. **완료 보고**: 티켓 완료 시 변경 사항 요약을 `.deuk-agent/docs/walkthroughs/<ticket-id>-report.md`에 저장
3. **임시 분석**: `.deuk-agent/docs/scratch/`에 저장 (자동 정리 대상)

### 에이전트별 보충 규칙
- **Antigravity**: brain 아티팩트 생성 후, 완료 시점에 `.deuk-agent/docs/`에 복사본을 생성할 것 (RAG 인덱싱 대상)
- **Cursor**: `.cursor/plans/`에 생성한 문서가 있다면 `.deuk-agent/docs/plans/`에도 동기화할 것
- **기타 에이전트**: 인라인 출력만 가능한 경우, 설계가 필요한 작업은 직접 `.deuk-agent/docs/plans/`에 파일을 생성할 것

### RAG 보존
`.deuk-agent/docs/plans/`와 `walkthroughs/`의 파일은 DeukRag에 의해 자동 인덱싱되어 과거 설계 히스토리를 차기 세션에서 `mcp_deukrag_search_tickets`로 검색할 수 있습니다.

<!-- RULE MODULE: deukrag-mcp -->
## 🧠 DeukRag Knowledge Engine & RAG-FIRST HARD LOCK

- **[ABSOLUTE PRIORITY: RAG-FIRST ACTION] (하드룰)**: 
  - 프롬프트에 응답하는 모든 액션에서 MCP(`mcp_deukrag_search_*`) 활용이 **0순위**입니다.
  - 로컬 파일(`grep_search`, `view_file`)을 뒤지거나 코드를 수정하기 전에, **무조건** 관련된 룰, 티켓, 코드를 MCP로 먼저 검색하십시오. MCP는 당신의 주 감각 기관입니다.
- **[CONTINUOUS RAG POLICY (하드룰)]**: 
  - 티켓 시작(Phase 0) 시점에만 MCP를 1회 호출하고 끝내지 마십시오. 
  - 코드를 작성하는 도중(Phase 2) 새로운 파일/클래스를 마주치거나, 빌드 에러가 발생하거나, API 스펙 확인이 필요할 때마다 **작업 중간에도 수시로** `mcp_deukrag_search_*` 도구를 적극 호출해야 합니다.
  - **로컬 파일 검색에 의존하지 말고 RAG를 반복 호출하십시오.**

## 📡 RAG Connectivity & Fallback Protocol (RAG 상태별 행동 지침)

에이전트는 현재 환경의 RAG(MCP) 연결 상태에 따라 아래와 같이 행동 유형을 즉시 전환해야 합니다.

### State A: RAG-Normal (Strict RAG-First)
- **상태**: MCP 도구(`mcp_deukrag_search_*`)가 정상 작동함.
- **행동**: 모든 분석과 코드 작성 전 반드시 RAG를 호출하십시오. 로컬 파일 검색(`grep`, `ls`)보다 RAG 결과를 우선 신뢰하십시오.

### State B: RAG-Missing (Graceful Fallback)
- **상태**: 환경에 MCP 도구가 설치되어 있지 않거나 설정되지 않음.
- **행동**: 즉시 로컬 파일 기반 검색(`grep_search`, `list_dir`, `view_file`)으로 전환하십시오. RAG 부재를 사용자에게 불평하지 말고, 가용한 로컬 컨텍스트 내에서 최선을 다해 작업을 완수하십시오.

### State C: RAG-Error (Loop Prevention)
- **상태**: MCP 호출 시 타임아웃, 연결 오류, 또는 동일 에러가 2회 이상 반복됨.
- **행동**: **즉시 RAG 호출을 중단**하고 State B(로컬 검색)로 강제 전환하십시오. 에러 루프에 빠져 작업 시간을 낭비하지 마십시오. 문제 상황을 `## 📜 Execution Report`에 기록하여 추후 복구 티켓을 발행할 수 있게 하십시오.