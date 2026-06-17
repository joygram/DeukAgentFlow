# DeukAgentRules (득에이전트룰스)

**npm 패키지:** `deuk-agent-rule` · **CLI:** `deuk-agent-rule`

**English:** [README.md](README.md)

Cursor, Copilot, Gemini 등 여러 에이전트·도구를 함께 쓸 때를 위한 `AGENTS.md`·`.cursor/rules` 버전 관리형 템플릿. 핸드오프·간결 응답으로 비용·성능을 개선합니다.

## 워크스페이스 초기화

설치만으로는 파일이 바뀌지 않습니다. **대상 프로젝트 루트**에서 CLI를 실행하거나 `--cwd`로 경로를 줍니다.

```bash
npm install deuk-agent-rule
npx deuk-agent-rule init
```

첫 적용 흐름:

1. `AGENTS.md`를 둘 프로젝트 루트로 이동.
2. `npm install deuk-agent-rule` (devDependency 권장 가능).
3. `npx deuk-agent-rule init` — 마커가 없으면 끝에 `<!-- deuk-agent-rule:begin -->` … `<!-- deuk-agent-rule:end -->` 블록을 붙이고 안쪽을 번들 템플릿으로 채움. `.mdc`는 `.cursor/rules/`에 복사(이름 충돌 시 기본 **prefix**).

패키지 업데이트 후:

```bash
npm update deuk-agent-rule
npx deuk-agent-rule init
```

`AGENTS.md`에서는 **마커 안**만 다시 갱신되고, 바깥 내용은 유지됩니다.

### `init` 파라미터

플래그는 모두 `init` **뒤**에 둡니다. 예: `npx deuk-agent-rule init --cwd ../다른레포 --dry-run`

| 플래그 | init 기본값 | 설명 |
|--------|-------------|------|
| `--cwd <path>` | 현재 디렉터리 | `AGENTS.md`·`.cursor/rules/`를 쓸 레포 루트. |
| `--dry-run` | 끔 | 쓰기 없이 할 일만 출력. |
| `--backup` | 끔 | 덮어쓰기 전 같은 이름에 `.bak` 저장. |
| `--tag <id>` | `deuk-agent-rule` | `<!-- <id>:begin -->` ~ `<!-- <id>:end -->` 마커 쌍. |
| `--marker-begin` / `--marker-end` | (`--tag` 권장) | 임의 마커 문자열, **둘 다** 필요. |
| `--agents <mode>` | `inject` | `inject` — 마커 안만 갱신(마커 없으면 블록 추가). `skip` — `AGENTS.md` 건드리지 않음. `overwrite` — 전체 교체(주의). |
| `--rules <mode>` | `prefix` | `prefix` — 있으면 `deuk-agent-rule-foo.mdc`로 추가. `skip` — 스킵. `overwrite` — 덮어쓰기. |
| `--append-if-no-markers` | 끔 | `merge`에서 주로 사용. |

예시:

```bash
npx deuk-agent-rule init --cwd /path/to/repo
npx deuk-agent-rule init --dry-run
npx deuk-agent-rule init --tag mycompany --rules overwrite
npx deuk-agent-rule init --agents skip --rules prefix
npx deuk-agent-rule init --backup
```

### 동작 모델

- **관리 구역**: 마커 쌍 **사이**만 패키지가 갱신.
- **`.mdc`**: 별도 파일로 복사; 기본 `prefix`로 기존 파일 보호.

### 번들에 포함되는 규칙

- **`multi-ai-workflow.mdc`** — `alwaysApply: true`
- **`git-commit.mdc`** — `alwaysApply: false`

### `merge` (엄격)

옵션은 동일. 마커가 없으면 `inject`는 실패(`--append-if-no-markers` 없을 때). 기본 `--rules skip`.

### 주의

- `alwaysApply: true` 규칙이 겹치면 컨텍스트가 길어질 수 있음.
- `postinstall`에서 `init` 자동 실행은 권장하지 않음.

## 버전

배포 전 `package.json`의 `version` 상향.
