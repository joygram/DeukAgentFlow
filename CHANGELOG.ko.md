# 변경 이력 (Changelog)

이 프로젝트의 모든 주목할 만한 변경 사항은 이 파일에 기록됩니다.

**English:** [CHANGELOG.md](CHANGELOG.md)

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 기반으로 하며, 이 프로젝트는 [유의적 버전(Semantic Versioning)](https://semver.org/spec/v2.0.0.html)을 준수합니다.

## [2.3.2] - 2026-04-17

### 수정됨 (Fixed)

- **cli:** 배포 환경에서 하드코딩된 `yaml` 의존성 경로 문제(`ERR_MODULE_NOT_FOUND`) 해결
- **dependencies:** `yaml`을 명시적 의존성 목록에 추가

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
