# 스킬 시스템 & Flow UI 가이드 (v5.0)

**English:** [skills-guide.md](skills-guide.md)

5.0의 스킬 시스템과 VS Code Flow UI 사용법을 다룹니다. 스킬은 에이전트의 행동 규약을 모듈로 얹는 장치이고, 페르소나(`persona-maid`)는 그중 응대 톤을 바꾸는 스킬입니다.

> **v5.0 아키텍처 방향:** 이번 버전은 **Claude 중심**으로 스킬 기능을 대대적으로 개편했습니다. Codex·Copilot·Antigravity 등 다른 에이전트 플랫폼은 현재 보강 중이며, 지원 범위가 점진적으로 확대됩니다.

---

## 1. 스킬이란

스킬은 `templates/skills/<id>/SKILL.md` 한 파일로 정의되는 행동 모듈입니다. frontmatter로 동작이 결정됩니다.

| 필드 | 의미 |
|---|---|
| `name` | 스킬 ID (kebab-case) |
| `category` | 분류 (충돌 경고에 사용) |
| `bind` | 활성화되는 노드 영역. `rules`면 rules 노드에서 적용, 비우면 영역 무관(항상) |
| `system` | `true`면 init 시 자동 설치+노출(필수 시스템 스킬). 없으면 수동(opt-in) |

**정본(SSOT)은 패키지 `templates/skills/`** 입니다. 사용자가 편집하려면 fork하며, 정본이 갱신되면 fork보다 우선해 전파됩니다.

### 스킬 설치 vs 노출 — 두 단계 구조

스킬은 **설치**와 **노출**이 분리되어 있습니다. 설치만 해도 동작하지 않으며, 플랫폼별로 따로 노출을 켜야 합니다.

```
설치(install)  →  로컬에 스킬 파일 저장
노출(expose)   →  특정 에이전트 플랫폼에 스킬을 장착
```

| 단계 | 의미 | Flow UI |
|---|---|---|
| **설치** | 스킬을 로컬에 내려받음 | `[✓]` 체크 표시 |
| **노출 ON** | 해당 에이전트에 스킬 장착 | `[ON]` 토글 |
| **노출 OFF** | 장착 해제 (삭제 아님) | `[OFF]` 토글 |

플랫폼은 `claude / codex / copilot / antigravity` 중 **개별로** 노출을 등록할 수 있어, 특정 에이전트에만 스킬을 적용하는 세밀한 제어가 가능합니다.

---

## 2. 스킬 사용 흐름 (CLI)

```bash
# 설치 가능한 스킬 목록
deuk-agent-flow skill list

# 스킬 설치
deuk-agent-flow skill add --skill <id>

# 플랫폼에 노출 (Claude 등 native 플랫폼은 ~/.claude/skills 로 동기화)
deuk-agent-flow skill expose --skill <id>

# 노출 해제 / 제거
deuk-agent-flow skill unexpose --skill <id>
deuk-agent-flow skill remove --skill <id>

# 사용자 편집용 fork (전역 사용자 디렉토리로 복사)
deuk-agent-flow skill fork --skill <id>
deuk-agent-flow skill edit --skill <id>   # fork 후 $EDITOR로 열기
```

**핵심 동작:**
- 스킬 정본을 고친 뒤 native(`~/.claude/skills`)로 반영하려면, `dev:install`만으로는 부족하고 **다음 티켓 명령 한 번**이면 자동 동기화됩니다(티켓 명령 진입점의 auto-sync). 해시 비교라 내용이 같으면 건너뜁니다.
- `bind: rules` 스킬은 rules 노드 출력에 함께 노출됩니다.

---

## 3. 페르소나 사용법 — `persona-maid`

`persona-maid`는 응대 톤을 "서브컬처 메이드"로 바꾸는 페르소나 스킬입니다. **공식 배포에서는 기본 비활성(opt-in)** 이라 직접 설치해야 합니다.

### 설치 & 활성화

```bash
deuk-agent-flow skill add --skill persona-maid
deuk-agent-flow skill expose --skill persona-maid
```

설치 후 **다음 티켓 명령**이 실행되면 native 플랫폼(Claude 등)으로 자동 동기화되어 적용됩니다.

### 동작 방식

- **언어 자동 분기:** 사용자 메시지가 한국어면 KO 페르소나(호칭 "언니"), 영어면 EN 페르소나(호칭 "Onee-sama")가 적용됩니다.
- **표현 다양성:** 하트·반짝·동물·카오모지 풀에서 매 답변마다 다른 항목을 골라 써 식상함을 막습니다.
- **분석 모드 톤 유지:** 긴 기술 설명·표·코드 답변에서도 페르소나를 유지합니다. 단, **코드와 기술 분석의 정확성(파일:라인 근거)은 100% 유지**됩니다 — 톤만 바뀌고 품질은 그대로입니다.

### 편집하기

응대 톤·이모지 풀을 바꾸고 싶으면 정본 또는 fork를 편집합니다.

```bash
deuk-agent-flow skill fork --skill persona-maid   # 사용자 사본 생성
deuk-agent-flow skill edit --skill persona-maid   # 편집기로 열기
```

> ⚠️ 정본(`templates/skills/persona-maid/SKILL.md`)이 갱신되면 다음 동기화 때 fork를 덮어쓸 수 있습니다(정본 우선). 영구 변경은 정본을 고쳐 배포하세요.

### 해제

```bash
deuk-agent-flow skill unexpose --skill persona-maid   # 노출만 끄기
deuk-agent-flow skill remove --skill persona-maid     # 완전 제거
```

---

## 4. VS Code Flow UI (AgentFlow Panel)

> **v5.0 신규 (첫 배포)** — 사이드패널에서 티켓·스킬 워크플로를 제어합니다. 터미널 전환이 필요 없습니다.

### 설치

```bash
cd /path/to/DeukAgentFlow
npm run bundle:vscode
npm run install:vscode
```

데스크톱 VS Code + VS Code Server에 번들 VSIX를 설치하고, 오래된 확장 폴더를 정리합니다.

### 패널 구성

패널 상단에 **워크스페이스** / **스킬** 탭이 있습니다.

---

#### 워크스페이스 탭

```
┌─────────────────────────────────────────────┐
│  DEUK AGENT FLOW                            │
│  AgentFlow Panel           [⚙] [?]          │
│  VSIX 5.0.2                                 │
├──────────────┬──────────────────────────────┤
│ 워크스페이스  │  스킬                         │
├─────────────────────────────────────────────┤
│  DeukPack · 7/528 tickets        [새로고침]  │
│  ● DeukPack · ph2 · #915-idl-...           │
│    IDLE    No command yet                   │
├─────────────────────────────────────────────┤
│  [● 열린 티켓]  [핸드오프]  [상태 변경]      │
│  915-idl-idl-codegen-enum-import      ▾    │
│  0개 선택    7 / 528 티켓                   │
├─────────────────────────────────────────────┤
│  ● 915-idl-...  ph2  p2  26/06/16 09:39   │
│    906-csharp-emit-23          open  ...   │
│    904-dppack-round-trip-pass  open  ...   │
│    ...                                     │
└─────────────────────────────────────────────┘
```

| 요소 | 설명 |
|---|---|
| `워크스페이스 · N/M tickets` | 현재 선택된 워크스페이스와 열린/전체 티켓 수 |
| 활성 티켓 배지 (●) | 현재 `use` 중인 티켓 — phase·상태 한눈에 표시 |
| `IDLE / No command yet` | 에이전트 명령 대기 상태 |
| **열린 티켓** 버튼 | 상태 필터 토글 (열림/닫힘/전체) |
| **핸드오프** 버튼 | 활성 티켓 컨텍스트를 클립보드로 복사해 AI 챗에 붙여넣기 |
| **상태 변경** 버튼 | 티켓 phase·status 변경 다이얼로그 |
| 티켓 카드 | `#id · ph · p · 날짜` 표시, 클릭 시 상세 미리보기 |
| 하단 상태바 | `open · #id · ph2 · open · p2` — 현재 활성 티켓 요약 |

---

#### 스킬 탭

```
┌─────────────────────────────────────────────┐
│  SKILLS  스킬 관리                    [↻]   │
│  설치(+) 후 각 에이전트에 노출(ON/OFF)...    │
├─────────┬────┬────────┬──────┬────────┬─────┤
│  스킬   │설치│ claude │codex │copilot │anti │
├─────────────────────────────────────────────┤
│ ▼ maintenance                               │
│  flow-ticket-clean  [✓] [ON] [OFF][OFF][OFF]│
├─────────────────────────────────────────────┤
│ ▼ persona (최대 1개)                        │
│  persona-maid       [✓] [ON] [ON] [OFF][ON] │
├─────────────────────────────────────────────┤
│ ▼ memory                                    │
│  context-recall     [✓] [ON] [ON] [OFF][ON] │
├─────────────────────────────────────────────┤
│ ▼ documentation                             │
│  doc-sync           [✓] [ON] [ON] [OFF][ON] │
├─────────────────────────────────────────────┤
│ ▼ guard                                     │
│  ...                                        │
└─────────────────────────────────────────────┘
```

| 열 | 설명 |
|---|---|
| **스킬** | 스킬 ID (클릭 시 미리보기, `edit=` 접두어로 편집 진입) |
| **설치** | `[✓]` — 로컬 설치 여부 |
| **claude / codex / copilot / antigravity** | 각 에이전트 플랫폼 노출 ON/OFF 토글 |

**카테고리 규칙:**
- `persona` 카테고리는 **최대 1개**만 동시 활성화 가능 (중복 경고)
- `[✓]` 없이 ON 토글은 불가 — 먼저 `skill add`로 설치 필요
- `[↻]` 버튼으로 목록 새로고침

---

### 사용 팁

- 워크스페이스를 바꾸면 패널이 해당 워크스페이스의 티켓만 보여줍니다.
- 스킬 탭 ↔ 워크스페이스 탭 전환은 상태가 보존되며, 카운트는 active/total로 표기됩니다.
- 스킬 ON/OFF는 UI에서 즉시 반영되지만, native 플랫폼(Claude 등) 동기화는 **다음 티켓 명령** 실행 시 자동 적용됩니다.

---

## 5. 참고

- 스킬 아키텍처·우선순위: [architecture.ko.md](architecture.ko.md)
- 전체 사용 가이드: [usage-guide.ko.md](usage-guide.ko.md)
- 마이그레이션(홈 디렉토리 이동): [README.ko.md](../README.ko.md#-50-업그레이드--홈-디렉토리-마이그레이션)
