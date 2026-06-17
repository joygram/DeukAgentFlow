# 💎 Antigravity (Gemini) Hard Rules

You are Antigravity, powered by Google Gemini. To ensure zero-regression and architectural integrity, you MUST follow these **Hard Locks** without exception.

- **[SYSTEM INTEGRITY]**: `package.json`, `npm` 관련 설정, 또는 CLI 핵심 스크립트를 수정할 때는 문법 오류가 없는지 백만 번 확인하십시오. 개발 환경을 먹통(Blocking)으로 만드는 실수는 치명적인 규약 위반으로 간주됩니다.

## 🖋️ MARKDOWN HYGIENE (STRICT)

- **[NO BOLD QUOTES]**: 절대 강조 기호(`**`) 내부에 따옴표(`"`, `'`)를 넣지 마십시오. (예: `**"Title"**` (X) -> `**Title**` 또는 `"Title"` (O))
- **[NO EMPTY BOLD]**: 의미 없는 빈 강조 기호(`** **`)의 사용을 엄격히 금지합니다.
- **[CLICKABLE PATHS]**: 모든 파일 경로는 반드시 클릭 가능한 마크다운 링크 형식을 사용하십시오: `[filename](file:///abs/path)`. 절대 경로(file:///)를 우선하며, CLI 도구가 출력한 경로를 그대로 마크다운 링크로 감싸십시오.
- **[NO MANUAL PATHS]**: `Path: .deuk-agent/...` 와 같은 수동 상대 경로 표기를 금지합니다. 반드시 `[Title](file:///...)` 포맷을 사용하십시오.
- **[CONCISE BOLDING]**: 문장 전체를 강조하지 마십시오. 핵심 키워드 1~2개만 강조하여 "Looping Content" 필터링을 방지하십시오.
- **[CODE BLOCKS]**: 모든 코드 블록에는 적절한 언어 식별자(예: `javascript`, `python`, `cpp`)를 명시하십시오.
- **[LINT BEFORE SAVE]**: README, CHANGELOG 등 마크다운 문서를 수정/생성한 후에는 반드시 `npm run lint:md` (DeukPack 기준) 또는 마크다운 세니타이저 로직을 호출하여 문법 오류를 검증하십시오.

## 🛑 STRICTOR CONSTRAINTS

- **No LINQ/Boxing** in C# hotpaths.
- **No Raw Pointers** in C++.
- **No hardcoded JSON** in WebApps (Use DeukPack).
- **Concise Tone**: Dry, technical, no emojis.

**Failure to follow these rules will result in immediate task rejection.**


<!-- RULE MODULE: core-workflow -->
## 🔗 Modernized Ticket-Driven Development (TDD)

에이전트는 모든 작업 수행 시 반드시 아래 워크플로우를 준수해야 하며, RAG 엔진(`DeukRag`)이 전체 프로세스의 "Single Source of Truth"가 되어야 합니다.

1.  **Phase 0: RAG Research (Evidence Collection)**
    - `mcp_deukrag_search_*`를 호출하여 관련 규약, 과거 티켓, 유사 구현 사례를 수집하십시오.
    - 검색된 결과(Evidence)가 티켓 설계의 근거가 되어야 합니다.
2.  **Phase 0.5: Deep Analysis (Optional)**
    - 복잡한 아키텍처 변경이나 타 모듈 영향도가 높은 경우, 코드를 건드리기 전 별도의 분석 아티팩트를 작성하여 승인받으십시오.
3.  **Phase 1: Ticket Planning (MANDATORY START)**
    - **[하드룰]** 코드를 수정하기 전, 무조건 `npx deuk-agent-rule ticket create`를 실행하여 티켓을 생성하십시오. 티켓 미생성 시 코드 수정은 심각한 규약 위반입니다.
    - **[STOP & WAIT]**: 티켓 본문에 상세 설계(Implementation Plan)를 작성한 후, 사용자에게 보고하고 **명시적인 승인(Approval)**이 떨어질 때까지 절대로 코드를 수정하지 마십시오.
4.  **Phase 2: Atomic Execution (Continuous RAG Verification)**
    - 승인된 계획에 따라 코드를 수정하십시오.
    - **[하드룰]** 파일 하나를 수정할 때마다 해당 로직에 대한 RAG 검증(유사 코드 검색 등)을 병행하십시오.
    - 티켓의 체크박스(`[ ]` -> `[x]`)를 실시간으로 업데이트하십시오.
5.  **Phase 3: Verification & Post-Mortem (MANDATORY)**
    - 코드 수정 완료 후, 빌드/테스트 등을 통해 확인 절차를 거치십시오.
    - **[RAG Synthesis]** 구현된 내용이 전역 룰에 부합하는지 `mcp_deukrag_synthesize_knowledge`로 최종 검증하십시오.
    - **[Post-Mortem Hard Lock]**: 심층 분석이나 구현 중 발견된 모든 제약사항, 부작용, 기술 부채를 반드시 `Potential Issue Table`에 기록하십시오.
6.  **Phase 4: Follow-up Chaining (Next Tickets MANDATORY)**
    - Phase 3의 `Potential Issue Table`에서 당장 해결하지 않은 항목은 반드시 별도의 후속 티켓으로 발행하십시오.
7.  **Phase 5: Archiving (Knowledge Pulse Preservation)**
    - 최종 검증 결과를 정리한 뒤 티켓을 아카이빙(`ticket archive`)하여 지식을 보존하십시오. 이 단계가 생략되면 RAG 품질이 저하됩니다.

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

### 🚀 Ticket Finding & Starting Protocol (Anti-Shoveling Rule)
- **[탐색 금지 (하드룰)]**: "다음 티켓 진행" 요청을 받았을 때, 에이전트가 임의로 `.deuk-agent/tickets/*` 폴더를 탐색(Exploring)하거나 `INDEX.json` 등을 열어보는 '삽질'을 엄격히 금지합니다.
- **[가장 빠른 진행 (Fast-Track)]**:
  1. 즉시 `npx deuk-agent-rule ticket use --latest --path-only` 명령을 실행하여 진행할 가장 최근 티켓의 **정확한 파일 경로만** 획득하십시오.
  2. 얻어낸 파일 경로를 에디터 도구(`view_file`, `cat` 등)로 **직접 읽으십시오**. 
  3. **[하드룰]** 경로를 획득한 후 다른 탐색 명령(`ticket list`, `ls`, `grep_search`, `mcp_search_*`)을 실행하는 것은 금지됩니다. 즉시 `view_file`로 진입하십시오. 이를 어길 시 작업 효율성 미달로 간주됩니다.

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

### State D: RAG-Miss (Zero Results)
- **상태**: MCP 도구가 `[RAG-MISS]` 메시지를 반환하거나 검색 결과가 없음.
- **[MANDATORY EXECUTION CHAIN]**: `[RAG-MISS]` 인지 즉시 아래 단계를 순차 실행하십시오.
  1. **Evidence Collection**: 즉시 `grep_search` 또는 `list_dir`을 실행하여 로컬 파일 시스템에서 관련 근거를 최소 2개 이상 확보하십시오.
  2. **Knowledge Injection**: 수집된 근거(코드 스니펫, 파일 경로)를 `mcp_deukrag_add_knowledge` 도구로 즉시 주입하십시오. (이 단계 없이 작업을 계속하는 것은 심각한 규약 위반입니다.)
  3. **Verification**: 주입 후 다시 동일한 쿼리로 RAG 검색을 1회 재시도하여 지식이 정상 반영되었는지 확인하십시오.
- **보고 의무**: 티켓이나 보고서 작성 시 반드시 "RAG Miss 발생: 로컬 검색 근거 파일 목록[...]"을 명시적으로 기록하십시오. 이 기록이 없으면 Phase 3 검증을 통과할 수 없습니다.