# DeukAgentRules (득에이전트룰스)

**npm 패키지:** `deuk-agent-rule` · **CLI:** `deuk-agent-rule`

**English:** [README.md](README.md)

Cursor, Copilot, Gemini 등 여러 에이전트·도구를 함께 쓸 때를 위한 `AGENTS.md`·`.cursor/rules` 버전 관리형 템플릿. 핸드오프·간결 응답으로 비용·성능을 개선합니다.

## 워크스페이스 초기화

```bash
npm install deuk-agent-rule
npx deuk-agent-rule init
```

`--non-interactive` 없이 실행하면 짧은 설정 질문이 시작됩니다:

```
$ npx deuk-agent-rule init

DeukAgentRules init — let's configure your workspace.

? What is your primary tech stack?
  1) Unity / C#
  2) Next.js + C#
  3) Web (React / Vue / general)
  4) Java / Spring Boot
  5) Other / skip
  Choice [1-5]: 1

? Which agent tools do you use? (comma-separated numbers, or 'all')
  1) Cursor
  2) GitHub Copilot
  3) Gemini / Antigravity
  4) All of the above
  5) Other / skip
  Choices: 1,2

  Stack : unity
  Tools : cursor, copilot

AGENTS.md: injected (inject)
rule copied: .cursor/rules/deuk-agent-rule-multi-ai-workflow.mdc
rule copied: .cursor/rules/deuk-agent-rule-git-commit.mdc
```

CI나 스크립트 환경에서 질문 없이 실행:

```bash
npx deuk-agent-rule init --non-interactive
```

패키지 업데이트 후:

```bash
npm update deuk-agent-rule
npx deuk-agent-rule init --non-interactive
```

`AGENTS.md`의 **마커 안**만 갱신되고 바깥 내용은 유지됩니다.

### 주요 옵션

| 플래그 | 기본값 | 설명 |
|--------|--------|------|
| `--non-interactive` | 끔 | 질문 생략, 플래그 기본값으로 실행 |
| `--cwd <path>` | 현재 디렉터리 | 대상 레포 루트 |
| `--dry-run` | 끔 | 쓰기 없이 동작만 출력 |
| `--tag <id>` | `deuk-agent-rule` | 마커 id: `<!-- <id>:begin/end -->` |
| `--agents <mode>` | `inject` | `inject` \| `skip` \| `overwrite` |
| `--rules <mode>` | `prefix` | `prefix` \| `skip` \| `overwrite` |
| `--backup` | 끔 | 덮어쓰기 전 `*.bak` 저장 |

### 번들 규칙

- **`multi-ai-workflow.mdc`** — `alwaysApply: true`
- **`git-commit.mdc`** — `alwaysApply: false`

### `merge` (엄격)

옵션 동일. 마커가 없으면 inject 실패(`--append-if-no-markers` 없을 때). 기본 `--rules skip`.

### 주의

- `alwaysApply: true` 규칙이 겹치면 컨텍스트가 커질 수 있습니다.
- `postinstall`에서 `init` 자동 실행은 권장하지 않습니다.

## 버전

배포 전 `package.json`의 `version` 상향.
