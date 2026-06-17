---
name: project-pilot
summary: 🗺️ 광범위한 리팩터 전 ProjectPilot 계약 키트를 적용하는 스킬.
category: refactor
bind: phase2
---

# ProjectPilot

Authority: follow `core-rules/AGENTS.md`, the active ticket APC, Phase Gate, and project rules.

## 적용 조건
멀티-언어 변경, 프로토콜/직렬화/코덱 작업, generated 계약 드리프트, fallback/stub 정리, 명명·레이아웃 통합, 반복 실패 패밀리 중 하나라도 해당되면 적용.

## Micro-Protocol (순서 엄수)
1. 로컬 프로젝트 룰·아키텍처 제약 먼저 읽기
2. 티켓 생성/선택 후 ProjectPilot 스코프 기록
3. 리팩터 계약 정의 → 구현 매트릭스 작성
4. 드리프트 분류(`C/P/S/B/U/D`), 소스 오너 확인
5. 드리프트 체크리스트 완성, 숏컷 거부
6. 준수 게이트 정의(테스트는 요청 시만) → 구현

## Stop Conditions
활성 티켓 없음 / 계약 불명확 / 소스 오너 불명 / generated 직접 편집 의존 / 검증 불가
