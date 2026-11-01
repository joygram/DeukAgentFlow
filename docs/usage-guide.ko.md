<!-- Generated from docs/assets/publication-docs.json -->
# 사용 가이드

## 설치

- 환경 = Node.js 20 이상·npm·지원 에이전트 클라이언트.
- 프로젝트 루트에서 설치·초기화; 선택한 클라이언트에 규칙 포인터 연결.

```bash
npm install -g deuk-agent-flow
deuk-agent-flow init
```

## 첫 작업

- 에이전트에게 요청 = ‘이 함수만 수정하고 실제 동작 확인’.
- 티켓에서 목표·범위·완료 조건 확인; 실행 전 계획 검토·승인.
- 에이전트가 관련 스킬·역할을 읽고 변경·검증 수행.
- 완료 시 실제 결과·검증 근거·잔여 위험·인계 확인.

## 이어서 작업

- 자연어 요청 = ‘현재 티켓 이어서 진행’.
- 상태 조회 = `deuk-agent-flow ticket status --workspace <name>`.
- 현재 규칙·역할 = `deuk-agent-flow rules ticket --workspace <name>`.
- 티켓 본문·인덱스·상태 변경은 CLI 사용.

## 업데이트

- 패키지 갱신 = `npm install -g deuk-agent-flow`.
- 규칙·클라이언트 포인터 재적용 = 프로젝트에서 `deuk-agent-flow init`.
- `init`은 설치된 패키지 적용; 패키지 다운로드·갱신과 구분.
- 이전 저장소 `~/.deuk-agent/`는 마이그레이션 대상; 현재 저장소는 `~/.deuk/`.
- 복구 시 기존 티켓 원본 보존; 수동 삭제 전 양쪽 데이터 확인.

## VS Code

- 패널 = 티켓 조회·워크스페이스 선택·인계 복사·스킬 제어.
- 설치 = 저장소 릴리스의 VSIX를 VS Code의 ‘Install from VSIX’로 적용.
- 소스 빌드 = `npm run build:vscode`; 로컬 설치는 저장소의 설치 스크립트 사용.

## 관련 문서

- [스킬 가이드](skills-guide.ko.md) · [작동 방식](how-it-works.ko.md) · [검사 가이드](checks-guide.ko.md).
