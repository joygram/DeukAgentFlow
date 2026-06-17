<div align="center">
  <br />
  <h1>DeukAgentRules (득에이전트룰스)</h1>
  <p><b>고신호(High-Signal) 인코딩 & 규칙 표준화 엔진</b></p>
  <p><a href="https://deukpack.app">Deuk Family</a> 생태계의 핵심 에이전트 인프라</p>
</div>

<div align="center">
  <a href="https://www.npmjs.com/package/deuk-agent-rule"><img src="https://img.shields.io/npm/v/deuk-agent-rule.svg?color=black&style=flat-square" alt="NPM Version" /></a>
  <a href="https://www.npmjs.com/package/deuk-agent-rule"><img src="https://img.shields.io/npm/dm/deuk-agent-rule.svg?color=blue&style=flat-square" alt="NPM Downloads" /></a>
  <a href="https://github.com/joygram/DeukAgentRules"><img src="https://img.shields.io/github/stars/joygram/DeukAgentRules.svg?style=flat-square&color=orange" alt="GitHub Stars" /></a>
  <a href="https://github.com/joygram/DeukAgentRules/blob/master/LICENSE"><img src="https://img.shields.io/npm/l/deuk-agent-rule.svg?style=flat-square" alt="License" /></a>
  <br /><br />
  <a href="https://github.com/joygram/DeukAgentRules/blob/master/README.md">English</a>
</div>

***

## Abstract

**DeukAgentRules**는 AI 엔지니어링 에이전트(Cursor, GitHub Copilot, Gemini/Antigravity, Claude, Windsurf, JetBrains AI 등)를 위한 프로젝트 불가지론적(Agnostic) 규칙 아키텍처를 정의합니다. 지속적인 워크플로 메모리를 세션 컨텍스트와 분리하여, 세션당 반복되는 프롬프트 부하를 감소시킵니다.

> **왜 DeukAgentRules인가?**
> **티켓 기반 워크플로(Ticket-First)**는 반복되는 컨텍스트 부하를 세션당 단일 토픽 파일 하나로 축소하고, 저장소를 재설명하지 않고도 도구 간 핸드오버를 가능하게 합니다.

---

## 🚀 빠른 시작

명령어 한 줄로 규칙 시스템을 초기화하고 로컬 워크스페이스를 구성하세요:

```bash
npx deuk-agent-rule init
```

* **대화형 설정:** 최초 실행 시 CLI가 주요 기술 스택과 사용하는 AI 에이전트를 선택하도록 안내합니다. *(각 스택별 세부 지원 항목은 [시스템 및 스택 선택 가이드](docs/system-selection.ko.md)를 참조하세요).*
* **안전한 업데이트:** 이후 실행 시 기존 커스텀 설정을 건드리지 않고 필요한 템플릿만 안전하게 주입(Append)합니다. 설정을 변경하려면 `--interactive` 옵션을 사용하세요.

---

## 🎫 티켓 기반 워크플로 (Ticket-First Workflow)

다수의 AI 에이전트가 단일 마크다운 티켓을 통해 컨텍스트를 공유하는 구조입니다.

### 6단계 워크플로

| 단계 | 담당 | 역할 |
|---|---|---|
| 1. 탐색 & 계획 | 추론 AI | 코드베이스 분석, 구현 계획 수립 |
| 2. 결정 | 사용자 | 계획 검토 및 승인 |
| 3. 티켓 발행 | 추론 AI | 승인된 계획을 `.deuk-agent-ticket/` 에 저장 |
| 4. 실행 | IDE 에이전트 | 티켓만 읽고 범위 내에서 코딩 |
| 5. 리스크 분석 (자체검증) | IDE 에이전트 | 테스트 완료 후 빌드 산출물 자체의 결함 및 잠재 리스크 필수 분석 |
| 6. 보고 & 종결 | 사용자+에이전트 | 리포트 검토 후 `npx deuk-agent-rule ticket close --latest` |

---

### 상세 워크플로 가이드

**1단계: 탐색 및 계획 수립**
```
[User]   "분석 저장소모듈"
[Agent]  (코드베이스 분석 후 방향 제안)
[User]   "계획 해당 분석내용을 진행할 계획 및 설계"
[Agent]  (.deuk-agent-ticket/main/storage-20260406.md 에 티켓 저장)
```

**2단계: 실행 및 자체 검증**
```
[User]   "진행 (생략 시 최신 분석 내용 진행)"
[Agent]  (티켓을 읽고 코드 변경 후 자체 검토 보고)
[User]   "검증 이슈 및 결함, 잠재오류"
[Agent]  (티켓 제약 사항 준수 검토 및 결함 탐색 완료)
```

---

### 초단축 키워드 프롬프트 예시 (채팅창에서 바로 입력)

반복되는 타이핑과 검색 피로도를 줄이기 위해 아래와 같은 키워드 기반의 단문을 권장해요.

| 상황 | 입력 프롬프트 |
|---|---|
| **분석** | `분석 [주제/모듈]` |
| **계획** | `계획 해당 분석내용을 진행할 계획 및 설계` |
| **진행** | `진행 [티켓번호] (생략 시 최신 진행)` |
| **검증** | `검증 이슈 및 결함, 잠재오류` |
| **조회** | `/티켓` |

---

### CLI 레퍼런스 (선택 사항)

```bash
npx deuk-agent-rule ticket create --topic login-api --project MyProject --content "## Task: ..."
npx deuk-agent-rule ticket list
npx deuk-agent-rule ticket close --latest
```

*([티켓 튜토리얼](docs/ticket-tutorial.ko.md) 참조)*


---

## ⚙️ 아키텍처 및 설정 (How It Works)

CLI는 CI 환경 및 명시적 제어를 위한 고급 매개변수를 지원하며, 사용자의 기존 로컬 환경과 충돌하지 않도록 안전한 주입(Injection) 메커니즘을 사용합니다. 
자세한 기술 구현 아키텍처와 덮어쓰기 방어 로직은 **[동작 원리 가이드](docs/how-it-works.ko.md)**를 참조하세요.

### 핵심 매개변수 (Core Configuration)

| 옵션 | 용도 |
|------|---------|
| `--non-interactive` | CI/Headless 모드 (질의응답 없이 기본값/저장된 설정 즉시 적용) |
| `--tag <id>` | 기본 마커 영역(`<!-- <id>:begin/end -->`)을 사용자 정의 ID로 오버라이드 |
| `--agents inject` | 기존 `AGENTS.md`에 지능형 마커 주입 (또는 `skip`, `overwrite`) |
| `--rules prefix` | 지능형 파일 접두사를 활용하여 `.cursor/rules` 모듈 업데이트 |

---

## 📄 라이선스 & 생태계

이 패키지는 **DeukPack Ecosystem**의 일부로 구동되며, **Apache-2.0** 라이선스 하에 배포됩니다.
이슈 제보, 컨트리뷰션 및 커뮤니티 논의는 [GitHub Repository](https://github.com/joygram/DeukAgentRules)를 방문해 주세요.
