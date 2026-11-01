<!-- Generated from docs/assets/publication-docs.json -->
# 아키텍처

## 구성 계약

| 구성 | 소유 책임 |
|---|---|
| CLI | 워크스페이스·티켓 상태·전이·필수 근거 |
| 규칙 허브 | 공통 규칙·프로젝트별 기준 |
| 스킬 | 작업별 절차·확인 기준 |
| Role | 단계별 산출물·전문 관점 |
| Persona | 대화 표현·상황 반응 |

## 데이터 흐름

- 사용자 요청 → 티켓의 목표·범위·완료 조건.
- CLI 상태 → 관련 규칙·스킬·역할의 실행 표면.
- 실행 결과 → 검증 근거·필요한 수정·재검증.
- 완료 → 잔여 위험·후속 항목·인계 보존.

## 규칙과 저장소

- 코어 규칙 = 공통 허브; `PROJECT_RULE.md` = 워크스페이스 규칙.
- 클라이언트 진입점 = 허브와 CLI를 가리키는 얇은 포인터.
- 홈 상태 = `~/.deuk/`; 티켓 = `~/.deuk/tickets/{uuid}/`.
- 워크스페이스 선택 = 등록 정보와 명시적 `--workspace`; cwd 추측과 구분.
- 스킬 설치·노출 상태 = `~/.deuk/skills.json`; 배포 파일은 파생 산출물.

## 상태와 DocMeta

- 전이 정본 = CLI 상태 선언·전이 판정; 프롬프트 문구와 구분.
- 티켓 frontmatter = 상태·목록·색인용 요약.
- 본문 마지막 `## DocMeta` = 필수 슬롯·출처·검증 계약.
- 계획·설계·실행·QA·정리 = 단계별 책임; 문서 정합은 종료 산출물에 포함.
- [상태 표면 계약](state-surface-contract.md) · [역할 설계](role-layer.md).

## 실행과 배포

- 소스 = `scripts/*.ts`; 컴파일 산출물 = `scripts/out/scripts/`.
- 기본 실행 = 설치 패키지; 로컬 소스 선택 = `DEUK_AGENT_FLOW_USE_LOCAL=1`.
- `init` = 현재 설치본의 규칙·포인터 재적용; 패키지 업데이트와 구분.
- [작동 방식](../guides/how-it-works.ko.md) · [시각·출판 계약](readme-visual-design.md).
