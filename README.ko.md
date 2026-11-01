<!-- DEUKI-HEADER:START -->
<table><tr>
<td>

<sub><b>DEUK AGENT FLOW</b></sub>

<h1>요청을 행동 기준으로,<br>결과를 검증 근거로.</h1>

티켓 · 스킬 · 역할 · 페르소나로 이어지는 AI 협업

`범위를 지키는 Flow` · `행동을 바꾸는 Skill` · `함께 일하는 Persona`

</td>
<td width="180" align="center"><img src="docs/assets/deuki-avatar.png" width="160" alt="원형 시바견 챗봇 캐릭터 득이" /></td>
</tr></table>

<a href="https://www.npmjs.com/package/deuk-agent-flow"><img src="https://img.shields.io/npm/v/deuk-agent-flow.svg" alt="npm version" /></a> <a href="https://www.npmjs.com/package/deuk-agent-flow"><img src="https://img.shields.io/npm/dm/deuk-agent-flow.svg?label=downloads" alt="npm downloads" /></a> · <a href="README.md">English</a> · <a href="https://deukpack.app/ko/deuk-agent-flow/">웹</a>
<!-- DEUKI-HEADER:END -->

- **진입장벽은 설치뿐** = 규칙·절차를 기억할 필요 없음; 설치된 에이전트가 티켓·검증·인계를 알아서 진행.
- **Deuk Agent Flow** = 티켓·스킬·역할·페르소나를 연결하는 AI 코딩 협업 워크플로우.
- 목표 = 과잉 수정·확인 누락·대화 사이 인계 손실 감소.
- 핵심 = Claude·Codex 등 클라이언트가 바뀌어도 같은 작업 방식·같은 티켓 유지.

## 바로 시작

- 요구 환경 = Node.js 20 이상·npm·지원 에이전트 클라이언트.
- 검증 완료 = Claude Code·Codex에서 실제 사용 검증.

```bash
npm install -g deuk-agent-flow
deuk-agent-flow init
```

1. 프로젝트 루트에서 `init` → 사용할 에이전트 클라이언트 선택.
2. 에이전트에게 “티켓 만들어줘” → 범위·계획·완료 조건을 에이전트가 작성.
3. 계획 확인 후 “승인” → 구현·검증·완료 보고까지 에이전트가 진행.
4. 흐트러질 때 = 아래 두 스킬 호출만 하면 됨.

- 다음 세션 = “현재 티켓 이어서 진행”.
- 업데이트 = 전역 패키지 갱신 후 `deuk-agent-flow init` 재실행.

## 흐트러질 때

| 증상 | 호출 | 하는 일 |
|---|---|---|
| 규칙·범위를 잊고 딴 길로 감 | “rule-reload 해줘” · Claude Code `/rule-reload` | 프로젝트 룰·설계 정본을 다시 읽고 하던 일 이어감 |
| 말투·페르소나가 풀림 | “persona-maid 다시 불러” · Claude Code `/persona-maid` | 페르소나 지침을 다시 읽고 말투 복구 |

- 둘 다 흐트러지면 = 두 개 연달아 호출.

## 더 알아보기

<details>
<summary>무엇이 다른가 · 왜 필요한가 · 연구 근거</summary>

### 무엇이 다른가

| 방식 | 범위 유지 | 완료 판정 | 대화 사이 인계 |
|---|---|---|---|
| 채팅으로 바로 지시 | 요청마다 사람이 반복 | 에이전트 자기 보고 | 세션 종료 시 소실 |
| AGENTS.md·CLAUDE.md 한 장 | 정적 문서; 길수록 희석 | 에이전트 자기 보고 | 수동 기록 |
| 클라이언트 플래닝 모드 | 해당 세션 안에서만 | 에이전트 자기 보고 | 세션 종료 시 소실 |
| Deuk Agent Flow | 티켓 Scope·APC 고정 | 근거 슬롯 충족 후 close | `~/.deuk/tickets/` 보존 |

- 플래닝 모드 = Claude Code·Codex `/plan`·Cursor Plan Mode·Copilot Plan agent; 실행 전 승인은 공통.
- 차이 = 승인 이후 범위 재주입·근거 없는 close 거부·클라이언트 간 같은 티켓 인계.
- 병행 = 플래닝 모드를 켠 채 AgentFlow 티켓 위에서 사용.

### 왜 필요한가

| 관측된 문제 | 연구 | AgentFlow 대응 |
|---|---|---|
| 규칙 위반·완료 허위 보고 비중 증가 | [Tang 외 2026][tang] · 실사용 20,574세션 | 완료 조건·근거 없으면 close 불가 |
| 드러난 어긋남의 91.5%를 사용자가 직접 교정 | [Tang 외 2026][tang] | 단계 게이트가 먼저 멈춤 |
| 실패 대부분이 초반 몇 단계의 인식 오류 | [Zhao 외 2026][zhao] · 1,794궤적 | 범위·설계 확인 후 실행 |
| 숙련자 AI 사용 시 19% 느림; 체감은 빠름 | [METR RCT 2025][metr] · 246과제 | 사람 검토를 계획·근거로 축소 |
| 컨텍스트 파일 = 성공률 하락·비용 20%+ 증가 | [Gloaguen 외 2026][agentsmd] | 단계별 필요한 규칙만 CLI가 공급 |
| 긴 맥락 중간 정보 활용 저하 | [Liu 외 TACL 2024][lost] | 매 턴 짧은 상태 표면 재주입 |
| 에이전트 편집 수용 시 코드 이해도 저하 | [Balepur 외 2026][impaired] · 54명 | 계획 승인·변경 범위를 사람이 확인 |

[tang]: https://arxiv.org/abs/2605.29442
[zhao]: https://arxiv.org/abs/2607.09510
[metr]: https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
[agentsmd]: https://arxiv.org/abs/2602.11988
[lost]: https://arxiv.org/abs/2307.03172
[impaired]: https://arxiv.org/abs/2607.26375

- 자체 측정 = 텔레메트리로 티켓 생성·전이·종료 횟수 기록.

<!-- DEUKI-FLOW:START -->
### 스킬로 에이전트의 행동을 교정하는 흐름

| 1. 요청·범위 확인 | 2. 관련 스킬 적용 | 3. 기준에 맞춰 실행 | 4. 확인·수정·인계 |
|---|---|---|---|
| ![1. 요청·범위 확인](docs/assets/deuki-request.svg) | ![2. 관련 스킬 적용](docs/assets/deuki-skill.svg) | ![3. 기준에 맞춰 실행](docs/assets/deuki-execute.svg) | ![4. 확인·수정·인계](docs/assets/deuki-verify.svg) |
| 요청을 티켓으로 정리하고 변경 경계·완료 조건 확정. | 관련 SKILL.md를 읽어 수정 전 확인할 항목과 실행 기준 적용. | 단계별 역할을 적용하고 범위 안에서 작업; 추측·과잉 수정 억제. | 실제 결과를 완료 조건과 대조; 실패 항목 수정 후 재검증·기록. |
| “이 함수만 수정” → 대상·보호 영역 명시 | safe-refactor → 작은 변경 / generated-file-guard → 원본 수정 | 설계 → 구현 → QA; 문서는 doc-sync 기준 적용 | 검증 실패 → 수정 → 재검증 → 완료 근거 인계 |

- 행동 교정 = 모델 재학습이 아닌, 작업 시점의 지침·변경 경계·검증 피드백 적용.
- 실패 시 = 결과를 완료로 넘기기 전에 수정·재검증; Persona는 대화 표현, Role은 단계별 관점 담당.

### 연구에서 확인된 효과

| 방식·연구 | 비교 결과 | AgentFlow에 연결하는 행동 |
|---|---|---|
| [SkillsBench v4 · 2026](https://arxiv.org/abs/2602.12670v4) | 선별 스킬 적용: **33.9% → 50.5% (+16.6%p)**; 87개 과제·18개 모델/하네스 구성 | 관련 스킬 선별·짧고 집중된 실행 지침 |
| [MetaGPT · ICLR 2024](https://arxiv.org/html/2308.00352v7) | 실행 피드백 추가: **HumanEval +4.2%p·MBPP +5.4%p**; 사람 수정 비용 지표 **2.25 → 0.83** | 역할별 산출물·실행 검증·수정 루프 |
| [Reflexion · 2023](https://arxiv.org/abs/2303.11366v4) | 논문 보고 HumanEval pass@1: **GPT-4 80% / Reflexion 91%**; 회고·재시도 절차 포함 | 실패 근거 기록·다음 시도에 반영 |
| [Bickmore & Picard · 2005](https://www2.ccs.neu.edu/research/rag/publications/05_CHI_BTPR.pdf) | 101명·1개월 운동 지원 실험: 관계형 에이전트의 **호감·신뢰·지속 이용 의향 향상** | 페르소나의 표현 일관성·장기 대화 연속성 |
| [Klein, Moon & Picard · 2002](https://www.media.mit.edu/publications/this-computer-responds-to-user-frustration) | 공감·경청 응답 에이전트 vs 무시·하소연 대조군: 좌절을 준 시스템을 **유의하게 더 오래 계속 사용** | 실패·지적 뒤 공감 반응과 대화 회복 |
| [EmotionPrompt · Li 외 2023](https://arxiv.org/abs/2307.11760) | 프롬프트에 정서 자극 추가: Instruction Induction **상대 +8.00%**·BIG-Bench **+115%**; 106명 평가 생성 품질 **+10.9%** | 정서가 실린 지시가 모델 출력 품질에 영향 |

- 연구가 뒷받침하는 방향 = **관련 스킬 + 구조화된 역할 + 실제 검증·수정 + 일관된 상호작용**.
- 효과 조건 = 작업 적합성; [SWE-Skills-Bench v2](https://arxiv.org/abs/2603.15401v2)에서 98개 중 92개 스킬은 유의한 효과 없음, 평균 76.6% → 76.9%.
- 페르소나 근거 = 관계형 에이전트의 신뢰·지속 사용(Bickmore), 좌절 후 사용 지속(Klein), 정서 자극의 출력 품질 향상(EmotionPrompt).
- 위 수치 = 각 논문의 실험 결과; Deuk Agent Flow 자체 측정치와 구분.
<!-- DEUKI-FLOW:END -->

</details>

## 구성

| 요소 | 담당 | 예시 |
|---|---|---|
| Flow | 범위·승인·검증·인계 | 티켓·APC·상태 기반 CLI |
| Skill | 반복 작업의 실행 기준 | safe-refactor·generated-file-guard·doc-sync |
| Role | 단계별 전문 관점 | 기획·설계·구현·QA·정리 |
| Persona | 대화 표현·상황 반응 | 선택형 persona-maid |

- Persona 효과 = 딱딱한 로봇 말투 완화·긴 작업 중에도 식지 않는 반응성.
- 거절 = "할 수 없는 기능" 류 선언·훈계 대신 짧게 흘림; 판단 자체는 불변.
- 지적받은 뒤 = 위축 → 회복 → 즉시 수정; 코드·문서·근거는 중립 문체 유지.
- 저장 = `~/.deuk/tickets/{workspace-uuid}/`; 워크스페이스는 CLI `--workspace`로 지정.
- VS Code 패널 = 티켓 조회·워크스페이스 전환·인계 복사·스킬 제어.

## 스킬 적용

```bash
deuk-agent-flow skill list
deuk-agent-flow skill add --skill safe-refactor
deuk-agent-flow skill expose --platform codex --skill safe-refactor
```

- 선택형 페르소나 = `deuk-agent-flow skill add --skill persona-maid`.
- 노출 플랫폼 = claude·codex·cursor·copilot·antigravity.
- 해제 = `skill unexpose` 후 `skill remove`; 배포 파일 직접 삭제 대신 CLI 사용.

## 문서

| 문서 | 용도 |
|---|---|
| [사용 가이드](docs/usage-guide.ko.md) | 설치·업데이트·일상 사용 |
| [작동 방식](docs/how-it-works.ko.md) | 흐름·저장소·역할·인계 |
| [스킬 가이드](docs/skills-guide.ko.md) | 행동 교정·설치·노출·페르소나 |
| [설계](docs/architecture.ko.md) | 상태·규칙·저장소 |
| [원칙](docs/principles.ko.md) | 협업 목표·근거·변경 기준 |

- [VS Code 확장](vscode-extension/README.md) · 라이선스 Apache-2.0 · 제작 joygram·AI 협업 개발.
