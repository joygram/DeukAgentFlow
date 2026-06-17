# DeukAgentRules (득에이전트룰스)

> **Deuk Family**의 핵심 모듈 가운데 하나입니다. 구조화된 규칙으로 AI 에이전트의 협업과 응답을 다듬습니다.

**npm 패키지:** `deuk-agent-rule` · **CLI:** `deuk-agent-rule`

**English:** [README.md](https://github.com/joygram/DeukAgentRules/blob/master/README.md)

Cursor, GitHub Copilot, Gemini / Antigravity, Claude(Cursor·Claude Code), Windsurf, JetBrains AI Assistant 등 코딩 에이전트와 함께 쓸 `AGENTS.md`·`.cursor/rules` 버전 관리형 템플릿. 그 밖에도 프로젝트 규칙을 읽는 유사 도구에 그대로 활용할 수 있습니다. 핸드오프·간결 응답으로 비용·성능을 개선합니다.

## 워크스페이스 초기화

```bash
npm install deuk-agent-rule
npx deuk-agent-rule init
```

레포에 **처음** `init` 할 때만(`.deuk-agent-rule.config.json` 없음) **대화형** 질문이 나옵니다. **이후** `npx deuk-agent-rule init` 은 저장된 선택을 쓰고 템플릿만 갱신하므로, 매번 `--non-interactive` 할 필요 없습니다. **CI**에서만 `--non-interactive` 를 쓰면 됩니다. 선택을 바꾸려면 **`--interactive`** 이거나 설정 파일을 지우거나 수정하세요.

첫 `init` 예시:

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
  4) Claude (Cursor / Claude Code)
  5) Windsurf
  6) JetBrains AI Assistant
  7) All of the above
  8) Other / skip
  Choices: 1,2

  Stack : unity
  Tools : cursor, copilot

AGENTS.md: injected (inject)
rule copied: .cursor/rules/deuk-agent-rule-multi-ai-workflow.mdc
rule copied: .cursor/rules/deuk-agent-rule-delivery-and-parallel-work.mdc
rule copied: .cursor/rules/deuk-agent-rule-git-commit.mdc
```

CI나 스크립트 환경에서 질문 없이 실행:

```bash
npx deuk-agent-rule init --non-interactive
```

패키지 업데이트 후:

```bash
npm update deuk-agent-rule
npx deuk-agent-rule init
```

**CI·헤드리스**에서만 `init --non-interactive` 를 쓰면 됩니다. 일반 업그레이드에 **`merge`를 따로 돌릴 필요는 없습니다.** 기본 **`init`** 이 번들 **`.cursor/rules`** 를 다시 맞춥니다. `--rules prefix`(기본)일 때 이미 있는 **`deuk-agent-rule-*.mdc`** 는 새 패키지 내용으로 **덮어씁니다.** 접두 없이 둔 로컬 전용 룰 파일은 건드리지 않습니다. `AGENTS.md`는 **마커 안**만 갱신되고 바깥 내용은 유지됩니다.

### 핸드오프 (멀티 세션·도구 넘김)

`init` 시 **`.deuk-agent-handoff/`** 를 만들고 기본으로 **`.gitignore`** 에 넣습니다. 채팅만이 아니라 **파일로 남겨야 할** 작업 명세는 여기(또는 `DeukAgentRules/handoff/LATEST.md` 관례)에 `AGENTS.md`의 **Handoff format** 절 구조(과제, 수정 파일, 결정, 제약)로 적어 두면, 다음 세션이나 다른 에이전트가 이어 받기 쉽습니다.

**플랜 패널**을 쓰는 환경에서는 동일 본문을 **`.cursor/plans/deuk-handoff.plan.md`** 등으로 **선택적으로 복제**해 둘 수 있습니다. 정본과 내용이 어긋나지 않게 맞추고, 에이전트 동작은 번들된 **`multi-ai-workflow.mdc`** 를 참고하세요.

### 주요 옵션

| 플래그 | 기본값 | 설명 |
|--------|--------|------|
| `--non-interactive` | 끔 | CI/스크립트: 질문 없음·저장 설정 미사용 |
| `--interactive` | 끔 | `.deuk-agent-rule.config.json` 이 있어도 질문 다시 |
| `--cwd <path>` | 현재 디렉터리 | 대상 레포 루트 |
| `--dry-run` | 끔 | 쓰기 없이 동작만 출력 |
| `--tag <id>` | `deuk-agent-rule` | 마커 id: `<!-- <id>:begin/end -->` |
| `--agents <mode>` | `inject` | `inject` \| `skip` \| `overwrite` |
| `--rules <mode>` | `prefix` | `prefix` \| `skip` \| `overwrite` |
| `--backup` | 끔 | 덮어쓰기 전 `*.bak` 저장 |

### 번들 규칙

- **`multi-ai-workflow.mdc`** — `alwaysApply: true`
- **`delivery-and-parallel-work.mdc`** — `alwaysApply: true` (세로 슬라이스·포트폴리오 우선·병렬 소유·리팩터 범위 축소)
- **`git-commit.mdc`** — `alwaysApply: false`

### `merge` (엄격)

옵션 동일. 마커가 없으면 inject 실패(`--append-if-no-markers` 없을 때). 기본 `--rules skip`.

### 주의

- `alwaysApply: true` 규칙이 겹치면 컨텍스트가 커질 수 있습니다.
- `postinstall`에서 `init` 자동 실행은 권장하지 않습니다.

## 버전

배포 전 `package.json`의 `version` 상향.
