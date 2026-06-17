<div align="center">
  <br />
  <h1>DeukAgentRules (득에이전트룰스)</h1>
  <p>
    <a href="https://www.npmjs.com/package/deuk-agent-rule"><img src="https://img.shields.io/npm/v/deuk-agent-rule.svg" alt="npm version" /></a>
    <a href="https://www.npmjs.com/package/deuk-agent-rule"><img src="https://img.shields.io/npm/dt/deuk-agent-rule.svg" alt="npm downloads" /></a>
  </p>
  <p><b>고신호(High-Signal) 인코딩 & 규칙 표준화 엔진</b></p>
  <p><a href="https://deukpack.app">Deuk Family</a> 생태계의 핵심 에이전트 인프라</p>
</div>

> **Deuk Family**의 핵심 모듈 가운데 하나입니다. 구조화된 규칙으로 AI 에이전트의 협업 효율을 극대화합니다.

**npm 패키지:** `deuk-agent-rule` · **CLI:** `deuk-agent-rule`

**English:** [README.md](https://github.com/joygram/DeukAgentRules/blob/master/README.md)

Cursor, GitHub Copilot, Gemini / Antigravity, Claude, Windsurf, JetBrains AI Assistant 등 다양한 코딩 에이전트와 함께 활용하는 **서브모듈 격리형 협업 프레임워크**입니다. 
프로젝트 규칙(`AGENTS.md`, `.cursor/rules`)을 표준화하고, **티켓 기반 워크플로우**를 통해 쓸데없는 프롬프트 토큰 낭비와 AI의 맥락 환각(Hallucination)을 강력하게 방어합니다.

> **🚀 핵심 가치:**
> 세션당 약 1,500~2,000 토큰에 달하는 강제 로드 컨텍스트를 200~300 토큰 수준으로 압축합니다. AI가 모놀리식 전체 레포지토리를 헤매지 않도록, 작업이 속한 **"해당 서브모듈(Submodule)"** 내부에 티켓을 격리하여 가장 정확한 맥락에서 작업을 지시할 수 있습니다.

---

## 🛠️ 워크스페이스 초기화 (Getting Started)

프로젝트 루트에서 최초 1회 패키지를 설치하고 초기화합니다.

```bash
npm install deuk-agent-rule
npx deuk-agent-rule init
```

초기화 시 프로젝트의 **기술 스택**, **사용 중인 에이전트 툴**, 그리고 **티켓 공유 정책**을 묻는 대화형 질문이 나타납니다. 
- **티켓 공유 정책**: 각 저장소 단위의 `.deuk-agent-ticket/` 폴더를 Git으로 추적하여 팀과 공유할지, 아니면 로컬 전용으로 둘지 결정합니다.
- 스택 변경이 필요 없으면 이후에는 `npx deuk-agent-rule init`만 쳐서 규칙을 최신화할 수 있습니다.
- CI나 스크립트 환경에서는 대화형 입력을 끄기 위해 `--non-interactive` 파라미터를 추가하세요.

### 🔄 규칙 패키지 업데이트 (Update Rules)
새로운 에이전트 워크플로우나 템플릿이 릴리즈되었을 경우, 패키지를 최신 버전으로 갱신하고 `init` 명령을 재실행하여 변경 사항을 쉽게 프로젝트에 동기화할 수 있습니다.
기존 환경 설정(`.deuk-agent-rule.config.json`)을 기억하고 있으므로 `--non-interactive`를 주면 묻지도 따지지도 않고 규칙만 즉시 최신화해 줍니다.
```bash
npm install deuk-agent-rule@latest
npx deuk-agent-rule init --non-interactive
```

---

## 🎯 핵심 워크플로우 (The Distributed Ticket Workflow)

`npx deuk-agent-rule init`을 실행하면 현재 저장소 루트(서브모듈 포함)에 아래 두 개의 핵심 폴더가 등장합니다. 

1. **`.deuk-agent-templates/` (에이전트 템플릿)**: AI가 어떠한 양식으로 작업을 처리하고 보고해야 하는지 정의된 공식 뼈대(`TICKET_TEMPLATE.md`)가 지정됩니다.
2. **`.deuk-agent-ticket/` (티켓 실행 공간)**: 실제 지시서(`TICKET-XXX.md`)가 발급되는 공간입니다. 서브모듈 단위로 티켓을 분산 관리할 수 있어 서브모듈만 떼어가도 히스토리가 유지됩니다. (공유 정책에 따라 `.gitignore`에 자동으로 기재될 수 있습니다.)

이러한 샌드박스 폴더들을 활용하여 스퍼트를 올리는 **최적의 AI 코딩 3단계**는 다음과 같습니다.

### [Step 1] 티켓 발급 및 계층적 관리 (Ticket Creation & Delegation)
AI에게 중구난방으로 지시하지 마세요. 명확한 티켓을 발급하여 **문맥(Context)을 소속 저장소 단위로 좁혀주어야** 합니다.

```bash
npx deuk-agent-rule ticket create --topic ui-refactoring --group frontend --project DeukUI
```
명령어를 치면 `.deuk-agent-ticket/` 폴더 내에 템플릿이 입혀진 `TICKET-ui-refactoring.md` 파일이 생성됩니다.

> [!IMPORTANT]
> **티켓 작성 (주의사항)**: 새로 생성된 티켓에는 **YAML Front Matter** (`--- id: ... ---`)가 포함되어 있습니다. 내용을 작성할 때 **파일 전체를 덮어쓰지 마십시오.** 반드시 헤더 아래에 내용을 추가하거나 부분 편집 도구를 사용하여 기존 YAML 메타데이터를 보존해야 합니다. 프론트매터가 삭제되면 티켓 인덱싱 시스템이 파손됩니다.

개발자는 이 파일 내의 `[Target Submodule]` 속성에 AI가 들여다보아야 할 고립된 경로(예: `src/client`)만을 명시해 줍니다.

### [Step 2] 세션 인수인계 및 에이전트 격리 실행 (Agent Execution)
AI 챗봇(Cursor, Gemini 등)에게 다음과 같이 단 한 줄의 명령만 내립니다.
> *"방금 발급된 `.deuk-agent-ticket/TICKET-ui-refactoring.md` 티켓을 열고, 명시된 타겟 서브모듈 내에서 체크리스트를 따라 작업을 시작해"*

AI는 티켓 내에 정의된 Phase(진행 단계)를 충실히 읽고, **자신이 다루지 않아도 될 타 모듈의 불필요한 연산을 원천 차단**한 채 가장 최적화된 코드만 작성합니다. (이 과정을 통해 토큰 비용이 획기적으로 줄어듭니다.)

### [Step 3] 검증 및 상태 갱신 (Review & Closure)
AI가 코드를 작성하며 티켓 내 마크업의 체크박스(`[x]`)를 갱신합니다. 에이전트의 세션(기억 한계)이 가득 차면, 티켓 내용만 디스크에 남겨둔 채 챗봇 창을 끄고 새 창을 열어 다시 [Step 2]를 지시하면 깔끔하게 인수인계가 이루어집니다.
모든 작업이 끝나면 Phase 상태를 `[Phase 완료]`로 승급시킵니다. 터미널 명령어를 직접 치는 대신, **AI 챗봇 프롬프트에 "현재 진행 중인 티켓 리스트를 보여줘" 또는 "완료된 티켓들을 보고서와 함께 아카이브 해 줘"라고 자연어로 지시**하여 AI가 알아서 CLI를 호출해 리스트업 및 관리하게 위임할 수도 있습니다.
직접 터미널에서 상태를 파악하시려면 아래 명령을 사용하세요:

```bash
npx deuk-agent-rule ticket list
```
```text
📦 Agent Tickets (Direct System Scan):
  ✅ [TICKET-DEUKUI-Button.md]
     Title: 버튼 컴포넌트 추가
     Target: DeukUI
     Status: [완료]
  🔨 [TICKET-ui-refactoring.md]
     Title: 플러그인 UI 리팩토링
     Target: DeukUI
     Status: [진행 중]
```

---

## 🤖 에이전트 프롬프팅 가이드 (Prompting Guide)

패키지를 설치하고 초기화하더라도, 일부 AI 에이전트(Cursor, Gemini 등)가 최초 세션에서 시스템 규칙 파일(`AGENTS.md`)을 능동적으로 읽어들이지 않는 경우가 종종 발생합니다. **새로운 챗봇 세션을 시작할 때마다 아래의 프롬프트를 복사하여 AI에게 첫 지시로 내려주면, 환각이나 룰 이탈을 완벽하게 예방할 수 있습니다.**

### 1. 전역 시스템 룰 숙지 강제 (필수)
> *"본격적인 작업을 시작하기 전에 워크스페이스 Root에 있는 `AGENTS.md` (DeukAgentRules) 문서를 끝까지 읽어줘. 현재 프로젝트의 핵심 룰, Identity, 그리고 티켓 워크플로우에 대해 완벽히 숙지해야 해. 숙지를 마쳤다면 내용을 요약하지 말고 '규칙 확인 완료'라고 짧게 대답한 뒤 첫 지시를 대기해."*

### 2. 티켓 기반 타깃 작업 시작 (권장)
> *"방금 설치/발급된 `.deuk-agent-ticket/TICKET-XXX.md` 티켓을 열고, 현재 저장소(Target Submodule) 경로 내에서만 파일 탐색 및 작업을 진행해. 다른 서브모듈로 벗어나거나 임의의 파일을 건드리지 마."*

---

## ⚙️ 부가 옵션 및 CLI 레퍼런스

업무 자동화 및 타깃 제어를 위한 상세 옵션입니다.

### Ticket 기반 명령
아래 CLI 명령어들은 터미널에 직접 입력하는 대신, **AI 챗봇에게 자연어 프롬프트로 지시**하여 실행을 위임할 수 있습니다.

| 커맨드 | 설명 / 자연어 프롬프트 지시 예시 |
|--------|------|
| `npx deuk-agent-rule ticket create ...` | 신규 티켓 문서 생성 (`--group`, `--project`, `--submodule` 지정 가능) <br>💬 *"새 티켓 만들어 (주제: refactor, 타겟: sub1)"* |
| `npx deuk-agent-rule ticket list` | 활성 티켓의 현재 상태 및 리스트업 (`--archived`, `--all`, `--json` 지원) <br>💬 *"티켓 리스트"* |
| `npx deuk-agent-rule ticket use --latest ...` | 빌드 파이프라인 연동을 위해 최근 티켓의 파일 경로만 반환 <br>💬 *"최근 티켓 경로"* |
| `npx deuk-agent-rule ticket close ...` | 파일을 물리적으로 이동시키지 않고 상태만 완료로 잠금(Soft-close) <br>💬 *"현재 티켓 상태 닫아 (완료)"* |
| `npx deuk-agent-rule ticket upgrade` | 과거 티켓 구조를 V2(YAML FM)로 마이그레이션 및 서브모듈 분산(DEFRAG) 실행 <br>💬 *"티켓 V2 업그레이드"* |
| `npx deuk-agent-rule ticket archive ...` | 완료된 티켓을 안전하게 보관소(`archive/`)로 이동 및 갱신 <br>💬 *"현재 티켓 아카이브해 (보고서 첨부)"* |
| `npx deuk-agent-rule ticket reports` | 영구 보관된 에이전트 작업 보고서(`reports/`) 목록 조회 <br>💬 *"완료된 티켓 보고서 목록"* |

### Init 고급 옵션
| 플래그 | 기본값 | 설명 |
|--------|--------|------|
| `--non-interactive` | 끔 | CI/스크립트용. 대화형 인터페이스를 끄고 기존 설정(`.config.json`)을 채택 |
| `--interactive` | 끔 | 이미 생성된 설정값이 있어도 무시하고 강제로 다시 묻기 설정 시작 |
| `--cwd <path>` | 현재 디렉터리 | 타깃이 되는 프로젝트의 워크스페이스 Root 절대/상대경로 지정 |
| `--dry-run` | 끔 | 실제 파일을 생성/변조하지 않고 콘솔에 동작 결과 텍스트만 출력 |
| `--backup` | 끔 | `AGENTS.md`나 룰 파일 덮어쓰기 전 원본을 `*.bak`으로 안전 보관 |

## 📦 릴리즈 및 체인지로그 (Changelog) 정책

본 패키지(`DeukAgentRules`)의 시스템 템플릿 추가 및 기능 변경을 배포하기 전에 반드시 다음 절차를 따라 릴리즈 프로세스를 진행해야 합니다:

1. **변경사항 커밋**: 문서 및 룰 스크립트 수정 완료 후 `git add` & `git commit` (Conventional Commits 형식 권장, ex: `feat: ...`, `fix: ...`)
2. **버전 펌핑 및 체인지로그 자동 생성**:
   * Patch (버그 수정): `npm run bump:patch`
   * Minor (기능 추가): `npm run bump:minor`
   * Major (룰/템플릿 대격변): `npm run bump:major`
   
   위 명령어를 실행하면 내부적으로 `commit-and-tag-version` 툴이 작동되어 `package.json` 버전 상향, `CHANGELOG.md` 자동 갱신 요약, 릴리즈 커밋, 그리고 태깅 작업까지 한번에 즉시 처리됩니다.
3. **분산 배포 보정 (OSS Sync)**: 에이전트를 통해 `npm run sync:oss`를 실행하면 자동화 스크립트가 릴리즈 에셋을 스캔하여 OSS 미러 저장소(`DeukAgentRulesOSS`)로 최종적인 퍼블리시 버전을 복제 및 반영합니다.
