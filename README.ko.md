<div align="center">
  <br />
  <img src="docs/assets/architecture-v3.png" width="800" alt="DeukAgentFlow Architecture" />
  <br />
  <h1>Deuk Agent Flow v4.0.0</h1>
  <p>
    <a href="https://www.npmjs.com/package/deuk-agent-flow"><img src="https://img.shields.io/npm/v/deuk-agent-flow.svg?label=deuk-agent-flow" alt="deuk-agent-flow npm version" /></a>
    <a href="https://www.npmjs.com/package/deuk-agent-rule"><img src="https://img.shields.io/npm/v/deuk-agent-rule.svg?label=legacy%20deuk-agent-rule" alt="deuk-agent-rule npm version" /></a>
    <a href="https://www.npmjs.com/package/deuk-agent-flow"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fjoygram%2FDeukAgentFlow%2Fmain%2Fdocs%2Fbadges%2Fnpm-downloads.json" alt="deuk-agent-flow와 deuk-agent-rule 합산 npm downloads" /></a>
  </p>
  <p><b>AI 코딩 작업이 대화창 밖으로 흘러내리지 않게.</b></p>
  <p><i>"다음", "진행", "정리"처럼 짧게 말해도 티켓, 범위, 검증, 기억이 레포에 붙어 있게 만듭니다.</i></p>
  <p><a href="https://deukpack.app">Deuk Family</a> 생태계의 핵심 모듈입니다.</p>
  <p><a href="README.md">English</a> · <a href="README.ko.md">한국어</a></p>
</div>

---

**Deuk Agent Flow**는 AI 코딩 에이전트를 위한 빠진 작업대 계층입니다. 사용자는 짧게 말하고, 에이전트는 그 말을 티켓, 범위, 실행, 검증, 아카이브로 레포 안에 남깁니다.

대부분의 에이전트 설정은 "지침"에서 멈춥니다. Deuk Agent Flow는 그 지침을 작업 루프로 바꿉니다: 티켓, 범위, 실행, 검증, 보관. 긴 명령을 외우지 않아도 `AGENTS.md`, Copilot instructions, Cursor rules, Claude skills 같은 표면을 같은 흐름으로 묶습니다.

후킹 포인트는 단순합니다. 사용자가 "다음", "원인", "정리"라고만 해도 에이전트가 그 의미를 붙잡을 레포 소유의 장소가 생깁니다. 진행 중인 작업은 `.deuk-agent/tickets/`에, 결정과 계획과 완료 근거는 코드베이스 옆에 남습니다.

### 왜 지금인가

AI 코딩은 이미 장난감 단계를 넘어 production volume으로 들어갔습니다.

- Google은 **새 코드의 75%가 AI 생성**이라고 밝혔습니다. 2024년 25%, 작년 가을 50%에서 빠르게 올라간 흐름입니다. ([Semafor, 2026](https://www.semafor.com/article/04/24/2026/google-ceo-says-75-of-companys-new-code-is-ai-generated))
- Sonar의 2026 개발자 설문 보도에 따르면 현재 AI 생성 코드는 약 **42%**, 2027년에는 약 **65%**까지 오를 것으로 예상됩니다. ([TechRadar, 2026](https://www.techradar.com/pro/devs-dont-trust-ai-code-but-many-say-they-still-dont-check-it-anyways))
- Stack Overflow 2025 설문 보도에서는 개발자 **84%**가 AI 도구를 쓰거나 쓸 계획이지만, "거의 맞지만 틀린 답"과 AI 코드 디버깅이 핵심 불만으로 꼽혔습니다. ([InfoWorld, 2025](https://www.infoworld.com/article/4031673/ai-use-among-software-developers-grows-but-trust-remains-an-issue-stack-overflow-survey.html))
- Faros는 AI 도입 뒤 작업량은 늘었지만, **개발자당 버그 54% 증가**, 리뷰 시간 5배 증가, PR 대비 incident 증가라는 불편한 결과를 보고했습니다. ([ADTmag, 2026](https://adtmag.com/articles/2026/04/22/more-code-more-bugs.aspx))

이제 병목은 코드를 더 빨리 쓰는 능력이 아닙니다. 에이전트 작업을 범위 안에 붙잡고, 리뷰 가능하게 만들고, 검증하고, 다음 세션에서도 이어받게 만드는 능력입니다.

### 그래서 뭐가 달라지나

| 없을 때 | Deuk Agent Flow 사용 시 |
|---|---|
| "다음"이 대화 기억에 의존 | "다음"이 레포 티켓으로 이어짐 |
| 에이전트가 요청 밖까지 수정 | APC 범위가 수정 가능 경계를 잡음 |
| 리뷰어는 코드만 보고 의도를 추측 | 티켓에 원인, 계획, 근거가 같이 남음 |
| AI 출력이 리뷰 부담을 키움 | 검증과 closeout이 작업 루프에 포함됨 |
| 대화가 끝나면 맥락도 사라짐 | archive와 지식 증류로 프로젝트 기억이 남음 |

### 1분 시각화

```text
짧은 대화
  "다음" / "원인" / "정리"
        |
        v
Deuk Agent Flow
  티켓 + 범위 + 검증 + 기억
        |
        v
레포에 남는 작업
  리뷰 가능한 변경 + 결정 근거 + 다음 세션 연결
```

| 장점 | 체감 |
|---|---|
| 맥락 손실 감소 | 다음 에이전트가 대화 전체를 다시 안 물어도 이어감 |
| 범위 이탈 감소 | 티켓이 바꿔도 되는 것과 안 되는 것을 잡음 |
| 리뷰 추측 감소 | diff 옆에 의도와 근거가 같이 남음 |
| generated 코드 위험 감소 | 수정 전에 source/generator 소유자를 확인 |
| 팀 기억 강화 | 완료된 작업이 검색 가능한 프로젝트 히스토리가 됨 |

> **현재 배포 기준:**
> v4.0.0은 에이전트 기반 리포지토리에 배포해 사용할 수 있는 상태입니다. 현재는 **OpenAI Codex**와 **GitHub Copilot** 환경에서 가장 안정적으로 동작합니다. Cursor, Windsurf, Claude Code, MCP도 포인터 구조로 지원하지만, 워크스페이스별 검증을 권장합니다. MCP 서버 등록은 `init`에 딸려 들어가지 않고 별도로 설정합니다.
> **아키텍처 기반:**
> 거대하고 무거운 레거시 `.cursorrules` 방식을 공식적으로 폐기했습니다. v3.0은 `AGENTS.md`를 단일 진실 공급원으로 사용하는 **Hub-Spoke 모델**을 도입하여, IDE별 규칙은 얇은 진입점 포인터 역할만 수행합니다.

### 🗺️ 핵심 기능 및 아키텍처 (Main Features)

Deuk Agent Flow는 AI 에이전트가 코드를 분석하고 작성하는 흐름을 안정적으로 이끄는 **4대 핵심 기능**을 제공합니다.

1. **Zero-Copy Hub-Spoke 아키텍처**
   - **Hub**: 단일 진실 공급원인 `AGENTS.md` (글로벌 룰)
   - **Spoke**: `PROJECT_RULE.md` 등 워크스페이스별 로컬 규칙
   - **효과**: IDE별(Cursor, Copilot, Windsurf) 설정 파일 중복을 제거하고, 에이전트가 오직 하나의 규약만 바라보게 하여 지시 사항의 충돌과 환각을 원천 차단합니다.

2. **티켓 주도 워크플로우 (TDW: Ticket-Driven Workflow)**
   - 계획(Plan) → 실행(Execute) → 검증(Verify) → 보관(Archive)의 분명한 라이프사이클로 작업을 이끕니다.
   - 활성화된 티켓(`ACTIVE_TICKET.md`)을 중심으로 변경을 연결해 범위와 진행 상태가 계속 보이게 합니다.

3. **플랫폼 공존 및 모드 인지형 게이트 (Mode-Aware Workflow Gate)**
   - 에이전트의 현재 모드(Plan Mode vs. Execute Mode)를 인지하여, Plan Mode에서는 분석과 구현 계획서(Artifacts) 작성에 집중하도록 APC를 적용합니다.
   - MCP(Model Context Protocol) Soft Gate와 연동되어 현재 티켓 컨텍스트에 맞는 변경 흐름을 유지합니다.

4. **지식 증류 및 Zero-Legacy (Knowledge Distillation)**
   - 완료된 작업은 `reports/`로 아카이빙되며, 이 과정에서 **Zero-Token 지식 증류** 기술이 적용되어 핵심 히스토리만 벡터 DB(DeukAgentContext)로 전달됩니다.
   - 불필요한 과거 로그나 사용되지 않는 `.cursorrules` 스텁을 자동으로 청소하여 컨텍스트 윈도우 낭비를 막습니다.

### 지침 파일만으로 부족한 이유

이미 AI 코딩 에이전트 생태계에는 `AGENTS.md`, GitHub Copilot instructions, Cursor rules, Claude skills, 여러 에이전트 실행 도구, 일반 LLM 가드레일이 있습니다. Deuk Agent Flow는 이들과 경쟁하기보다 그 위에 **티켓 기반 레포 흐름**을 얹습니다.

| 비슷한 접근 | 도움이 되는 부분 | Deuk Agent Flow가 더하는 것 |
|---|---|---|
| `AGENTS.md` 공개 형식 | 코딩 에이전트가 읽을 공통 지침 파일 | 티켓 생명주기, Phase Gate, 검증, 아카이브 가능한 기억 |
| Copilot instructions / Cursor rules / Claude memory | 도구별 맞춤 지침 | 여러 에이전트가 공유하는 레포 소유 워크플로우 |
| Claude/Copilot custom agent와 skill | 재사용 가능한 작업 playbook | skill이 워크플로우를 대체하지 않고 티켓 실행으로 들어가게 함 |
| 에이전트 실행기와 harness | 여러 코딩 에이전트 실행 | 어떤 에이전트를 쓰든 레포 안에서 생명주기를 통제 |
| 일반 LLM/MCP 가드레일 | 런타임 정책 검사 | 작업 지시서, 범위 계약, 깃에 남는 기록, 완료 근거 |

Deuk Agent Flow는 AI 코딩 작업을 팀이 이해하고 이어받기 쉬운 흐름으로 만들고 싶을 때 특히 잘 맞습니다. 여러 파일에 걸친 변경, 검증, 기록, 다음 작업 연결이 자연스럽게 이어지도록 돕는 데 초점을 둡니다.

### Karpathy식 skill과 같이 쓰면 좋은 점

Karpathy식 skill은 한 작업 안에서 에이전트의 행동을 더 좋게 만드는 데 강합니다. Deuk Agent Flow는 그 작업을 레포 차원에서 티켓화하고, 범위를 맞추고, 검증하고, 다시 찾을 수 있게 남기는 데 강합니다.

둘을 함께 쓰면 skill은 작업 수행 품질을 끌어올리고, Deuk Agent Flow는 그 결과를 팀 흐름에 연결합니다. 앞단에서는 행동 playbook이 작동하고, 뒷단에서는 티켓 생명주기와 DeukAgentContext 기억 계층이 남습니다.

### 다음 개선 방향

다음 단계는 이 워크플로우를 더 잘 보이고 더 쉽게 도입하게 만드는 것입니다. 첫 실행 점검을 더 명확히 하고, CLI/RAG 결과에 짧은 재각인 신호를 붙이며, README/npm 포지셔닝을 강화하고, active ticket, phase, open ticket count, DeukAgentContext memory status를 보여주는 companion 표면을 준비하는 방향입니다. 목표는 팀이 쓰는 코딩 에이전트를 바꾸지 않고도 같은 작업 규율을 자연스럽게 얻는 것입니다.

### 📚 상세 문서
| 문서 | 용도 |
|---|---|
| [docs/usage-guide.ko.md](docs/usage-guide.ko.md) | **[추천]** 실전 배포 및 단계별 사용 가이드 |
| [docs/architecture.ko.md](docs/architecture.ko.md) | 고수준 시스템 구조 및 시각적 인포그래픽 |
| [docs/how-it-works.ko.md](docs/how-it-works.ko.md) | 상세 CLI 메커니즘, 초기화 생명주기 및 파일 역할 |
| [docs/principles.ko.md](docs/principles.ko.md) | 설계 철학: Hub-Spoke, Zero-Legacy, 소스 주권 |
| **English Docs** | [README.md](README.md) · [docs/architecture.md](docs/architecture.md) |

---

## 🚀 빠른 시작 (Quick Start)

가장 빠르게 Deuk Agent Flow를 현재 작업 프로젝트에 도입하는 방법입니다.

```bash
# 1. 글로벌 설치
npm install -g deuk-agent-flow

# 2. 프로젝트 초기화 (AGENTS.md 및 설정 생성)
deuk-agent-flow init
```

이후 일상 작업은 명령을 직접 치기보다 에이전트에게 짧게 말합니다. 예: "진행", "다음", "원인 다시 파악".

여러 프로젝트를 한 `~/workspace` 아래에서 관리한다면 각 프로젝트 루트에서 `deuk-agent-flow init`을 실행합니다. workspace 루트는 공통 포인터 역할을 할 수 있지만, 실제 작업 티켓과 로컬 규칙은 각 프로젝트 루트의 `.deuk-agent/`와 `PROJECT_RULE.md`가 소유하며, 충돌이 있으면 이 가이드보다 해당 규칙 파일이 우선합니다.

이렇게 사용하면 효과가 극대화됩니다. workspace 루트는 공통 진입점, 각 프로젝트 루트는 독립 티켓/규칙/검증 단위로 나누고, 중첩 서버나 앱은 필요할 때 별도 프로젝트로 초기화하세요.

자세한 실전 활용법은 **[실전 사용 가이드](docs/usage-guide.ko.md)**를 참조하세요.

## 🛠️ 설치 및 설정

### 1. 글로벌 설치 (일반 사용자)
`npx` 캐시 문제와 "로컬 트랩"을 방지하기 위해 글로벌 설치가 엄격히 권장됩니다.

```bash
npm install -g deuk-agent-flow
deuk-agent-flow init
```

호환 패키지도 사용할 수 있습니다.

```bash
npm install -g deuk-agent-rule
deuk-agent-rule init
```

### 2. 로컬 소스 개발 (메인테이너/파워 유저)
v3.0은 **Global CLI Proxy**를 도입했습니다. `DeukAgentFlow` 워크스페이스 내부에서 개발 중이라면, 글로벌 명령이 자동으로 로컬 소스로 실행을 위임합니다.

```bash
cd ~/workspace/DeukAgentFlow
sudo npm link
deuk-agent-flow init  # 자동으로 로컬 scripts/cli.mjs로 라우팅됨
```

Codex나 Copilot을 주로 사용한다면 이 구성이 일상 운영에 가장 적합합니다. 현재는 이 두 환경에서 Hub-Spoke와 티켓 기반 워크플로우가 가장 부드럽게 동작합니다.

### 3. 메인테이너 배포
메인테이너는 루트에서 한 번의 명령으로 두 npm 패키지를 함께 배포할 수 있습니다.

```bash
npm run publish
```

npm registry에 쓰기 전에 dry-run으로 먼저 확인하세요.

```bash
npm run publish:dry
```

배포 전에는 Docker consumer smoke test를 실행합니다. 이 검증은 깨끗한 Node 컨테이너에 packed package를 설치하므로, 로컬 `npm link`나 global package가 의존성 누락을 숨기지 못합니다.

```bash
npm run smoke:npm:docker
```

publish helper는 `npm test`를 실행하고, `deuk-agent-rule` compatibility 패키지 버전을 루트 패키지 버전에 맞춘 뒤, `deuk-agent-flow`를 먼저 배포하고 `deuk-agent-rule`을 이어서 배포합니다.

전체 배포와 프로젝트 루트 설정 흐름은 아래의 실전 사용 가이드를 본다.

호환 안내: `deuk-agent-rule`은 전환 기간 동안 사용할 수 있고, 합산 다운로드 배지는 두 패키지 다운로드를 함께 계산한다.

현재 `deuk-agent-flow` 버전이 이미 배포되어 있고 legacy compatibility wrapper만 추가로 올리면 되는 상황에서는 bootstrap 명령을 사용합니다.

```bash
npm run publish:bootstrap
```

---

## 🎯 프로토콜 워크플로우

워크플로우는 **티켓 기반 실행 계약(Ticket-Driven Execution Contract)**에 의해 통제됩니다.

1. **스캐폴딩 (Scaffolding)**: `init` 명령어가 프로젝트의 성격을 파악하고 `.deuk-agent/templates/`와 `AGENTS.md` (혹은 `PROJECT_RULE.md` 포인터)를 자동 배치합니다.
2. **티켓팅 (Plan Phase)**: 사용자가 짧게 지시하면 에이전트가 맥락을 읽고 내부 작업 지시서를 생성합니다. 이때 에이전트는 Plan Mode로 동작하며 코드를 수정할 수 없고 계획 수립에만 집중합니다.
3. **실행 (Execute Phase)**: 사용자의 승인을 받은 후, 에이전트는 **타겟 서브모듈**에 고정되어 실질적인 코드 작성을 수행합니다. MCP Soft Gate가 인가되지 않은 파일의 수정을 감시합니다.
4. **검증 (Verify Phase)**: 개발 작업 종료 전 사이드 이펙트 감사(Audit) 및 컨벤션(DC-DUP 등 아키텍처 규칙) 체크를 수행합니다.
5. **아카이빙 (Archive Phase)**: 완료된 티켓은 Zero-Token 지식 증류를 거쳐 `reports/`로 이동하며, 이 데이터는 DeukAgentContext 벡터 데이터베이스에 저장되어 영구적인 **엔지니어링 메모리 엔진**으로 작동합니다.

---

## ⚙️ 에이전트에게 말로 요청하기

일상 사용자는 티켓 명령을 외울 필요가 없습니다. 짧게 말하면 에이전트가 맥락, CLI, 티켓 파일을 처리합니다.

| 하고 싶은 일 | 이렇게 말해도 됨 |
|--------|------|
| 새 작업 시작 | *"티켓 잡고 진행"* |
| 기존 작업 이어가기 | *"다음 진행"* |
| 코딩 전 검토 | *"원인 먼저 파악"* |
| 완료 처리 | *"검증 기록하고 정리"* |
| skill 관리 | *"safe-refactor 추가"* |

### 티켓 파일 깃 관리 원칙

- `.deuk-agent/tickets/**/*.md`와 `INDEX*.json`은 CLI가 바꾼 결과만 반영합니다.
- 티켓 본문만 커밋하고 index를 빼먹지 마세요. 다음 작업에서 상태가 맞지 않을 수 있습니다.
- 생성이 실패한 뒤 티켓 파일을 손으로 만들거나 frontmatter로 상태를 바로 바꾸지 마세요.
- `telemetry.jsonl`은 보통 실행 로그이므로 일반 코드 커밋에는 넣지 않는 편이 낫습니다.
- 작업을 마쳤다면 가능하면 `ticket archive`까지 끝낸 뒤 커밋해 active/archive 흐름이 함께 남도록 하세요.

메인테이너와 자동화 환경에서는 `deuk-agent-flow ticket create`, `ticket move`, `ticket archive` 같은 CLI 명령을 직접 사용할 수 있습니다.

자세한 사용 예시는 [docs/usage-guide.ko.md](docs/usage-guide.ko.md)를 참고하세요.

---

## 관련 아이디어와 영감

Deuk Agent Flow는 [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills)처럼
AI 코딩 에이전트가 잘못 가정하고, 과하게 구현하고, 요청 밖 코드를 수정하는 문제의식과 맞닿아 있습니다.

다만 Deuk Agent Flow는 프롬프트 수준의 지침 파일을 넘어 티켓, Phase Gate,
스코프 계약, 검증, 아카이브 가능한 엔지니어링 메모리까지 제공하는 레포 단위 워크플로우 계층입니다.

first-party skill MVP는 이 경계를 명확히 유지합니다. skill은 반복 실패 패턴을 다루는 짧은
`SKILL.md` playbook이고, workflow 권한의 단일 기준은 계속 `core-rules/AGENTS.md`입니다.
`skill add`와 `skill expose`로 Claude/Cursor에 playbook을 노출하되, 전체 rule contract를 복사하지 않습니다.

스킬 제공 방식:

- `init` 시 전체 first-party skill 템플릿이 `.deuk-agent/skill-templates/`로 동기화됩니다.
- 기본 추천 장착: `safe-refactor`, `generated-file-guard`.
- 선택 장착: `context-recall`, `project-pilot`.

현재 first-party skill:

| skill | 용도 |
|---|---|
| `safe-refactor` | 기본 추천: 작은 리팩터링을 범위/테스트 안에 묶기 |
| `generated-file-guard` | 기본 추천: generated output 직접 수정 방지 |
| `context-recall` | 선택: 과거 티켓/결정/실패 패턴 재사용 |
| `project-pilot` | 선택: cross-language, protocol, generated/runtime drift 정리 |

```bash
npx deuk-agent-flow init
npx deuk-agent-flow skill list
npx deuk-agent-flow skill add --skill safe-refactor
npx deuk-agent-flow skill add --skill generated-file-guard
npx deuk-agent-flow skill add --skill project-pilot
npx deuk-agent-flow skill expose --platform claude
```

---

### 🏷️ 검색 태그
`#AI-Orchestration` `#Agentic-Workflow` `#DeukFamily` `#Engineering-Intelligence` `#Zero-Legacy` `#High-Signal-Coding` `#AI-Protocol` `#CursorRules` `#CopilotInstructions` `#ClaudeCode` `#ClaudeMD` `#AgentsMD` `#AgentSkills` `#CodingAgent` `#AI-Guardrails` `#LLM-Control-Plane`
