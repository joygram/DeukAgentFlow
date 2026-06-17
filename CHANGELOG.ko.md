# 변경 이력 (Changelog)

이 프로젝트의 모든 주목할 만한 변경 사항은 이 파일에 기록됩니다.

**English:** [CHANGELOG.md](CHANGELOG.md)

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 기반으로 하며, 이 프로젝트는 [유의적 버전(Semantic Versioning)](https://semver.org/spec/v2.0.0.html)을 준수합니다.

## [2.4.6] - 2026-04-19

### 수정됨 (Fixed)

- **cli:** 로컬 버전이 registry 버전 이상일 경우 업데이트 알림을 표시하지 않도록 수정 (로컬 개발 symlink 환경에서의 역방향 스팸 알림 해소)
- **ticket:** `NNN` 정규식을 최대 4자리로 제한하여 유닉스 타임스탬프가 티켓 순번으로 잘못 파싱되는 버그 수정 — 올바른 `NNN-topic-hostname` 포맷 생성 복원

## [2.4.4] - 2026-04-19

### 변경됨 (Changed)

- **rules:** 서브모듈 전용 규칙(DeukPack, C++, Unity)을 해당 워크스페이스의 `MODULE_RULE.md`로 이동하여 `AGENTS.md`를 일반화된 규약 중심으로 개편
- **templates:** `publish/` 소스에 맞춰 `bundle/` 내의 레거시 템플릿 정리

## [2.4.3] - 2026-04-18

### 변경됨 (Changed)
- **ticket:** 티켓 ID 포맷을 `NNN-topic-hostname` (예: `001-add-feature-joy-nucb`)으로 변경. 레거시 `ticket_NNN_hostname_topic` 형식 대체
- **ticket:** INDEX.json 파싱 시 기존 포맷과 신규 포맷 모두 역호환 지원

## [2.4.2] - 2026-04-18

### 수정됨 (Fixed)
- **ticket:** 파일명(File name)과 본문 내 티켓 ID 생성 로직 간의 불일치(Discrepancy) 해결 (단일 출처로 통합)

## [2.4.1] - 2026-04-18

### 추가됨 (Added)
- **cli:** NPM 최신 버전을 감지하여 터미널에 업데이트를 권고하는 알림 기능(Update Notifier) 추가

### 수정됨 (Fixed)
- **ticket:** 티켓 생성 시 호스트명 슬러그가 8글자로 엄격히 제한되지 않던 버그 수정

## [2.4.0] - 2026-04-18

### 추가됨 (Added)

- **init:** 깔끔한 마이그레이션을 위한 구버전 템플릿 자동 정리 기능 추가
- **rules:** `AGENTS.md` 문서 내 티켓 검증 단계(TICKET VERIFICATION RULE) 규약 추가
- **ticket:** 티켓에 우선순위(Priority) 속성 추가
- **ticket:** 순차 번호 및 호스트네임 기반의 티켓 식별자(ID) 자동 생성 도입 (`NNN-hostname-topic` 포맷)
- **ticket:** 호스트네임 길이 제한(8자) 및 자동 순번 부여 로직 개선

### 수정됨 (Fixed)

- **rules:** 전역 `npx` 캐시 이슈(과거 버전 실행 문제)를 우회하기 위해 로컬 최신 스크립트 호출을 강제/권장하도록 수정
- **scripts:** OSS 미러 저장소 동기화 시 잘못 표기되던 URL 예시 로그 메시지 정정

### 변경됨 (Changed)

- **docs:** 리드미(README) 파일에 [Step 4] 티켓 검증 안내 추가
- **docs:** 전역 설치(Global Install) 권장 안내 및 운영체제(OS)별 권한 제약 명확화
- **rules:** 구현 아티팩트(`implementation_plan.md` 등) 내 티켓 번호 참조 의무화

## [2.3.2] - 2026-04-17

### 수정됨 (Fixed)

- **cli:** 배포 환경에서 하드코딩된 `yaml` 의존성 경로 문제(`ERR_MODULE_NOT_FOUND`) 해결
- **dependencies:** `yaml`을 명시적 의존성 목록에 추가

## [2.3.1] - 2026-04-17

### 변경됨 (Changed)

- **readme:** 체인지로그 및 자동화된 릴리즈 프로세스 가이드 추가

## [2.3.0] - 2026-04-17

### 추가됨 (Added)

- AI 파이프라인 연동 기반 및 선택적 동기화 시스템 고도화
- **cli:** ticket list 명령에 --submodule 필터 추가
- **cli:** 티켓 아카이브 및 리포트 워크플로를 모듈형 아키텍처로 복구
- **rules:** Unity Client, WebApp, C++ 서버 하이브리드 환경을 위한 룰 고도화
- **ticket:** 분산형 티켓 관리 및 공유 정책 구현
- **ticket:** V2 YAML Front-matter 및 카테고리화된 리스트로 업그레이드

### 수정됨 (Fixed)

- **ticket:** LATEST.md를 폐기하고 ACTIVE_TICKET.md로 포인터 통일
- **ticket:** DeukAgentRules 현재 진행 중인 티켓 안 나오던 문제 해결

## [1.0.14] - 2026-04-02

### 추가됨 (Added)

- **cli:** 병합 도구 및 배포 문서 동기화 스크립트 확장
- **rules:** 커밋 제목 내 'sync' 금지 구문 룰 추가
- **handoff:** 인덱스 기반 Handoff 워크플로 및 CLI 신설
- **architecture:** 제로-터치 NPM 번들 스캐폴딩으로 템플릿 아키텍처 개편

### 수정됨 (Fixed)

- **cli:** 템플릿 생성기(init) 내부의 HTML 엔티티 문법 에러 핫픽스

### 변경됨 (Changed)

- **docs:** 외부 공개용 릴리즈 가이드 및 동기화 스크립트 주석 갱신
- **docs:** 리드미(README)에 토큰 비용 차단 메커니즘 설정 및 제로 터치 스캐폴딩 문서 개편
