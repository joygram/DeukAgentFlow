<!-- Generated from docs/assets/publication-docs.json -->
# 스킬·역할·페르소나

## 스킬의 역할

- 스킬 = 반복 작업의 절차·확인 기준을 담은 `SKILL.md`.
- 적용 = 관련 스킬 선택·본문 읽기·실행 기준 반영·실제 결과 검증.
- 교정 대상 = 추측·과잉 설계·생성 파일 직접 편집·문서 불일치.
- 효과 조건 = 작업·프로젝트 맥락과의 적합성; 스킬 수 증가와 성능 향상은 별개.

## 대표 스킬

| 스킬 | 행동 기준 |
|---|---|
| safe-refactor | 작은 범위·필요한 검증 |
| generated-file-guard | 생성 파일 대신 원본 수정 |
| doc-sync | 설계 기준 문서 정합 |
| rule-reload | 현재 규칙·설계 다시 읽기 |
| persona-maid | 선택형 대화 캐릭터 |

## 길을 잃었을 때

| 증상 | 스킬·명령 | 요청 예 |
|---|---|---|
| 규칙·설계를 잊고 추측으로 진행 | rule-reload | “룰 다시 읽고 이어서” |
| 현재 티켓·단계를 모름 | ticket-status-surface · `ticket status` | “현재 티켓 상태 보여줘” |
| 같은 실패 반복·이전 결정 기억 없음 | context-recall | “이전 티켓에서 어떻게 했는지 찾아봐” |
| 말투가 딱딱해짐·다른 언어로 샘 | persona-maid | “페르소나 다시 불러” |
| 컨텍스트 압축·세션 재개 직후 | `deuk-agent-flow rules` | “rules부터 다시 실행” |

## 핵심 스킬 사용법

- 호출 = Claude Code는 `/rule-reload` 같은 슬래시; 그 밖의 클라이언트는 스킬 이름을 넣어 요청.
- rule-reload = `PROJECT_RULE.md`·설계 정본·티켓 Scope 재독 → 걸리는 룰 3줄 요약 → 하던 일 계속.
- persona-maid = 호출한 응답에만 유효; 도구 작업 뒤·역할 전환 때 다시 호출.
- 호칭 변경 = `deuk-agent-flow persona config set honorific --lang ko --value "<호칭>"`.
- context-recall = 로컬 소스·티켓을 먼저 읽고 이전 티켓·룰 기록 조회; 검색 결과는 근거로만 사용.
- ticket-status-surface = 티켓 상태를 워크스페이스·상태·링크 한 줄로 보고.

## 설치와 노출

```bash
deuk-agent-flow skill list
deuk-agent-flow skill add --skill safe-refactor
deuk-agent-flow skill expose --platform codex --skill safe-refactor
deuk-agent-flow skill lint
```

- 플랫폼 = claude·codex·cursor·copilot·antigravity.
- 설치 = 사용 가능 상태; 노출 = 특정 클라이언트에 전달하는 상태.
- 해제 = `skill unexpose --platform codex --skill safe-refactor` 후 `skill remove --skill safe-refactor`.
- 편집 = `skill fork`·`skill edit`; 패키지 정본과 사용자 소스 구분.

## 소스와 배포

| 계층 | 위치·역할 |
|---|---|
| 패키지 소스 | `templates/skills/<id>/SKILL.md` |
| 설치·노출 정본 | `~/.deuk/skills.json` |
| 클라이언트 배포 | 클라이언트별 네이티브 스킬·포인터 |

## 역할과 표현

- Role = 현재 단계의 전문 관점·산출물 책임.
- Persona = 대화의 어조·상황 반응·실수 후 회복 표현.
- Persona를 코드·문서·검증 근거에 혼합하지 않음.
- 득이 = 제품 캐릭터; persona-maid 설치·활성화와 독립.
- [페르소나 설계](../architecture/persona-design.md) · [사용 가이드](usage-guide.ko.md).
