<div align="center">
  <br />
  <img src="docs/assets/architecture-v3.png" width="800" alt="DeukAgentRules Architecture" />
  <br />
  <h1>DeukAgentRules v3.3.2</h1>
  <p>
    <a href="https://www.npmjs.com/package/deuk-agent-rule"><img src="https://img.shields.io/npm/v/deuk-agent-rule.svg" alt="npm version" /></a>
    <a href="https://www.npmjs.com/package/deuk-agent-rule"><img src="https://img.shields.io/npm/dt/deuk-agent-rule.svg" alt="npm downloads" /></a>
  </p>
  <p><b>모든 레포를 위한 AI 코딩 에이전트 가드레일</b></p>
  <p><i>Codex, Copilot, Claude Code, Cursor를 위한 티켓, 범위 계약, 검증, 기억 계층</i></p>
  <p><a href="https://deukpack.app">Deuk Family</a> 생태계의 핵심 모듈입니다.</p>
</div>

---

**DeukAgentRules**는 AI 코딩 에이전트가 티켓, 범위 계약, 검증 기록, 프로젝트 기억을 공유된 방식으로 따라가게 만드는 레포 단위 워크플로우입니다.

단순한 프롬프트 모음에 머물지 않습니다. **Hub-Spoke 아키텍처**와 **티켓 기반 실행 모델**을 통해 `AGENTS.md`, Copilot instructions, Cursor rules, Claude skills 같은 에이전트 지침 표면을 하나의 레포 워크플로우로 묶습니다.

티켓 관리는 `.deuk-agent/` 아래에서 이뤄지며, 진행 중인 작업은 `.deuk-agent/tickets/`에, 관련 문서와 계획, 아카이브 정보도 그 주변 구조에 함께 쌓입니다.

> **현재 배포 기준:**
> v3.3.2는 에이전트 기반 리포지토리에 배포해 사용할 수 있는 상태입니다. 현재는 **OpenAI Codex**와 **GitHub Copilot** 환경에서 가장 안정적으로 동작합니다. Cursor, Windsurf, Claude Code, MCP도 포인터 구조로 지원하지만, 워크스페이스별 검증을 권장합니다. MCP 서버 등록은 `init`에 딸려 들어가지 않고 별도로 설정합니다.

> **아키텍처 기반:**
> 거대하고 무거운 레거시 `.cursorrules` 방식을 공식적으로 폐기했습니다. v3.0은 `AGENTS.md`를 단일 진실 공급원으로 사용하는 **Hub-Spoke 모델**을 도입하여, IDE별 규칙은 얇은 진입점 포인터 역할만 수행합니다.

### 🗺️ 핵심 기능 및 아키텍처 (Main Features)

DeukAgentRules는 AI 에이전트가 코드를 분석하고 작성하는 흐름을 안정적으로 이끄는 **4대 핵심 기능**을 제공합니다.

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

이미 AI 코딩 에이전트 생태계에는 `AGENTS.md`, GitHub Copilot instructions, Cursor rules, Claude skills, 여러 에이전트 실행 도구, 일반 LLM 가드레일이 있습니다. DeukAgentRules는 이들과 경쟁하기보다 그 위에 **티켓 기반 레포 워크플로우**를 얹습니다.

| 비슷한 접근 | 도움이 되는 부분 | DeukAgentRules가 더하는 것 |
|---|---|---|
| `AGENTS.md` 공개 형식 | 코딩 에이전트가 읽을 공통 지침 파일 | 티켓 생명주기, Phase Gate, 검증, 아카이브 가능한 기억 |
| Copilot instructions / Cursor rules / Claude memory | 도구별 맞춤 지침 | 여러 에이전트가 공유하는 레포 소유 워크플로우 |
| Claude/Copilot custom agent와 skill | 재사용 가능한 작업 playbook | skill이 워크플로우를 대체하지 않고 티켓 실행으로 들어가게 함 |
| 에이전트 실행기와 harness | 여러 코딩 에이전트 실행 | 어떤 에이전트를 쓰든 레포 안에서 생명주기를 통제 |
| 일반 LLM/MCP 가드레일 | 런타임 정책 검사 | 작업 지시서, 범위 계약, 깃에 남는 기록, 완료 근거 |

DeukAgentRules는 AI 코딩 작업을 팀이 이해하고 이어받기 쉬운 흐름으로 만들고 싶을 때 특히 잘 맞습니다. 여러 파일에 걸친 변경, 검증, 기록, 다음 작업 연결이 자연스럽게 이어지도록 돕는 데 초점을 둡니다.

### Karpathy식 skill과 같이 쓰면 좋은 점

Karpathy식 skill은 한 작업 안에서 에이전트의 행동을 더 좋게 만드는 데 강합니다. DeukAgentRules는 그 작업을 레포 차원에서 티켓화하고, 범위를 맞추고, 검증하고, 다시 찾을 수 있게 남기는 데 강합니다.

둘을 함께 쓰면 skill은 작업 수행 품질을 끌어올리고, DeukAgentRules는 그 결과를 팀 워크플로우에 연결합니다. 앞단에서는 행동 playbook이 작동하고, 뒷단에서는 티켓 생명주기와 DeukAgentContext 기억 계층이 남습니다.

### 다음 개선 방향

다음 단계는 이 워크플로우를 더 잘 보이고 더 쉽게 도입하게 만드는 것입니다. 첫 실행 점검을 더 명확히 하고, CLI/RAG 결과에 짧은 재각인 신호를 붙이며, README/npm 포지셔닝을 강화하고, active ticket, phase, open ticket count, DeukAgentContext memory status를 보여주는 companion 표면을 준비하는 방향입니다. 목표는 팀이 쓰는 코딩 에이전트를 바꾸지 않고도 같은 작업 규율을 자연스럽게 얻는 것입니다.

### 📚 상세 문서
| 문서 | 용도 |
|---|---|
| [docs/usage-guide.ko.md](docs/usage-guide.ko.md) | **[추천]** 실전 배포 및 단계별 사용 가이드 |
| [docs/architecture.ko.md](docs/architecture.ko.md) | 고수준 시스템 구조 및 시각적 인포그래픽 |
| [docs/how-it-works.ko.md](docs/how-it-works.ko.md) | 상세 CLI 메커니즘, 초기화 생명주기 및 파일 역할 |
| [docs/principles.ko.md](docs/principles.ko.md) | 설계 철학: Hub-Spoke, Zero-Legacy, 소스 주권 |
| [docs/product-positioning-research.ko.md](docs/product-positioning-research.ko.md) | AI 코딩 에이전트 가드레일 제품 포지셔닝 리서치 |
| [docs/karpathy-skills-vs-deukagent-positioning.ko.md](docs/karpathy-skills-vs-deukagent-positioning.ko.md) | Karpathy식 skill, DeukAgentRules, DeukAgentContext 심층 비교 |
| [docs/vision-agent-guardrails.ko.md](docs/vision-agent-guardrails.ko.md) | 멀티 에이전트 가드레일 허브 비전 문서 |
| [docs/organic-growth-plan.ko.md](docs/organic-growth-plan.ko.md) | VS Code, Open VSX, GitHub, 스킬 루프 기반 오가닉 유입 계획 |
| **English Docs** | [README.md](README.md) · [docs/architecture.md](docs/architecture.md) |

---

## 🚀 빠른 시작 (Quick Start)

가장 빠르게 DeukAgentRules를 프로젝트에 도입하는 방법입니다.

```bash
# 1. 글로벌 설치
npm install -g deuk-agent-rule

# 2. 프로젝트 초기화 (AGENTS.md 및 설정 생성)
deuk-agent-rule init

# 3. 첫 번째 작업 티켓 생성
deuk-agent-rule ticket create --topic my-first-task
```

자세한 실전 활용법은 **[실전 사용 가이드](docs/usage-guide.ko.md)**를 참조하세요.

## 🛠️ 설치 및 설정

### 1. 글로벌 설치 (일반 사용자)
\`npx\` 캐시 문제와 "로컬 트랩"을 방지하기 위해 글로벌 설치가 엄격히 권장됩니다.

\`\`\`bash
npm install -g deuk-agent-rule
deuk-agent-rule init
\`\`\`

### 2. 로컬 소스 개발 (메인테이너/파워 유저)
v3.0은 **Global CLI Proxy**를 도입했습니다. \`DeukAgentRules\` 워크스페이스 내부에서 개발 중이라면, 글로벌 명령이 자동으로 로컬 소스로 실행을 위임합니다.

\`\`\`bash
cd ~/workspace/DeukAgentRules
sudo npm link
deuk-agent-rule init  # 자동으로 로컬 scripts/cli.mjs로 라우팅됨
\`\`\`

Codex나 Copilot을 주로 사용한다면 이 구성이 일상 운영에 가장 적합합니다. 현재는 이 두 환경에서 Hub-Spoke와 티켓 기반 워크플로우가 가장 부드럽게 동작합니다.

---

## 🎯 프로토콜 워크플로우

워크플로우는 **티켓 기반 실행 계약(Ticket-Driven Execution Contract)**에 의해 통제됩니다.

1. **스캐폴딩 (Scaffolding)**: `init` 명령어가 프로젝트의 성격을 파악하고 `.deuk-agent/templates/`와 `AGENTS.md` (혹은 `PROJECT_RULE.md` 포인터)를 자동 배치합니다.
2. **티켓팅 (Plan Phase)**: `ticket create --topic feature-x` 명령어로 새로운 작업 지시서를 생성합니다. 이때 에이전트는 Plan Mode로 동작하며 코드를 수정할 수 없고 계획 수립에만 집중합니다.
3. **실행 (Execute Phase)**: 사용자의 승인을 받은 후, 에이전트는 **타겟 서브모듈**에 고정되어 실질적인 코드 작성을 수행합니다. MCP Soft Gate가 인가되지 않은 파일의 수정을 감시합니다.
4. **검증 (Verify Phase)**: 개발 작업 종료 전 사이드 이펙트 감사(Audit) 및 컨벤션(DC-DUP 등 아키텍처 규칙) 체크를 수행합니다.
5. **아카이빙 (Archive Phase)**: 완료된 티켓은 Zero-Token 지식 증류를 거쳐 `reports/`로 이동하며, 이 데이터는 DeukAgentContext 벡터 데이터베이스에 저장되어 영구적인 **엔지니어링 메모리 엔진**으로 작동합니다.

---

## ⚙️ CLI 주요 명령어

자연어 프롬프트를 통해 AI 에이전트에게 직접 시키세요!

| 명령어 | 설명 / 프롬프트 예시 |
|--------|------|
| \`deuk-agent-rule init\` | 규칙 허브와 스포크 포인터를 동기화합니다. <br>💬 *"프로젝트 규칙 초기화해줘"* |
| \`deuk-agent-rule ticket create\` | 새로운 실행 계약(티켓)을 발행합니다. `--summary`와 `--plan-body`를 함께 넣어 1회 생성으로 Phase 1을 끝내는 것을 권장합니다. <br>💬 *"refactor-ui 티켓을 APC까지 채워서 만들어줘"* |
| \`deuk-agent-rule ticket list\` | 활성화된 작업 지시서를 표시합니다. <br>💬 *"활성 티켓 목록 보여줘"* |
| \`deuk-agent-rule ticket archive\` | 완료된 작업을 안전하게 보관합니다. <br>💬 *"068번 티켓 아카이브해줘"* |
| \`deuk-agent-rule skill list\` | `safe-refactor`, `generated-file-guard`, `context-recall` 같은 first-party 얇은 skill을 보여줍니다. |
| \`deuk-agent-rule skill add --skill safe-refactor\` | TDW/APC 권한 모델을 바꾸지 않고 로컬 skill registry에 skill을 설치합니다. |
| \`deuk-agent-rule skill expose --platform claude\` | 설치된 skill을 플랫폼별 얇은 wrapper로 노출합니다. MVP 지원 플랫폼은 `claude`, `cursor`입니다. |
| \`deuk-agent-rule skill lint\` | skill 파일이 중복 workflow 계약이나 generated 파일 직접 수정 지침을 담지 않았는지 검사합니다. |

### 티켓 파일 깃 관리 원칙

- `.deuk-agent/tickets/**/*.md`와 `INDEX*.json`은 CLI가 바꾼 결과만 반영합니다.
- 티켓 본문만 커밋하고 index를 빼먹지 마세요. 다음 작업에서 상태가 맞지 않을 수 있습니다.
- 생성이 실패한 뒤 티켓 파일을 손으로 만들거나 frontmatter로 상태를 바로 바꾸지 마세요.
- `telemetry.jsonl`은 보통 실행 로그이므로 일반 코드 커밋에는 넣지 않는 편이 낫습니다.
- 작업을 마쳤다면 가능하면 `ticket archive`까지 끝낸 뒤 커밋해 active/archive 흐름이 함께 남도록 하세요.

자세한 사용 예시는 [docs/usage-guide.ko.md](docs/usage-guide.ko.md)를 참고하세요.

---

## 관련 아이디어와 영감

DeukAgentRules는 [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills)처럼
AI 코딩 에이전트가 잘못 가정하고, 과하게 구현하고, 요청 밖 코드를 수정하는 문제의식과 맞닿아 있습니다.

다만 DeukAgentRules는 프롬프트 수준의 지침 파일을 넘어 티켓, Phase Gate,
스코프 계약, 검증, 아카이브 가능한 엔지니어링 메모리까지 제공하는 레포 단위 워크플로우 계층입니다.

first-party skill MVP는 이 경계를 명확히 유지합니다. skill은 반복 실패 패턴을 다루는 짧은
`SKILL.md` playbook이고, workflow 권한의 단일 기준은 계속 `core-rules/AGENTS.md`입니다.
`skill add`와 `skill expose`로 Claude/Cursor에 playbook을 노출하되, 전체 rule contract를 복사하지 않습니다.

\`\`\`bash
npx deuk-agent-rule init
npx deuk-agent-rule skill list
npx deuk-agent-rule skill add --skill safe-refactor
npx deuk-agent-rule skill expose --platform claude
\`\`\`

---

### 🏷️ 검색 태그
\`#AI-Orchestration\` \`#Agentic-Workflow\` \`#DeukFamily\` \`#Engineering-Intelligence\` \`#Zero-Legacy\` \`#High-Signal-Coding\` \`#AI-Protocol\` \`#CursorRules\` \`#CopilotInstructions\` \`#ClaudeCode\` \`#ClaudeMD\` \`#AgentsMD\` \`#AgentSkills\` \`#CodingAgent\` \`#AI-Guardrails\` \`#LLM-Control-Plane\`
