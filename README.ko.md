# DeukAgentRules (득에이전트룰스)

**npm 패키지:** `deuk-agent-rule` · **CLI:** `deuk-agent-rule`

**English:** [README.md](README.md)

**한 줄 소개**는 [`GITHUB_DESCRIPTION.md`](GITHUB_DESCRIPTION.md)의 **Paste into GitHub**만 정본으로 쓰고, 여기서는 반복하지 않습니다.

`publish/` 템플릿이 `npm pack` 시 `bundle/`로 들어가며, CLI로 `AGENTS.md` 태그 구역과 `.cursor/rules`를 적용합니다.

## GitHub About 문구

[`GITHUB_DESCRIPTION.md`](GITHUB_DESCRIPTION.md)의 한국어 블록을 복사합니다.

## 워크스페이스 초기화

```bash
npm install deuk-agent-rule
npx deuk-agent-rule init
```

업데이트 후에는 `npm update` 뒤 다시 `npx deuk-agent-rule init`으로 관리 구역만 갱신합니다.

### `init` 파라미터

플래그는 `init` **뒤**에 둡니다. 자세한 표와 예시는 [README.md](README.md)와 동일합니다.

### 번들 규칙

- **`multi-ai-workflow.mdc`** — 멀티 도구 핸드오프·간결·비용 인식
- **`git-commit.mdc`**

## 버전

배포 전 `package.json`의 `version`을 올리세요. 절차는 [RELEASING.ko.md](RELEASING.ko.md)를 참고하세요.
