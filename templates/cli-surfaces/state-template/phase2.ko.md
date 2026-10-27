# Ticket Workflow 템플릿: phase2

## 실행 슬롯
- Approved Scope:
- Files Changed:
- Commands Run:
- Interim Evidence:

## phase2→end 직행 시 추가 슬롯
phase3를 거치지 않고 phase2에서 바로 end로 전환할 때는 아래 두 섹션을 **헤딩 이름 그대로** 채워야 합니다.
CLI가 헤딩 텍스트를 정확히 매칭하므로 오탈자 금지.

## Problem Analysis
(문제 원인 분석 — 파일:라인 근거 포함)

## Improvement Direction
(해결 방향 요약)

## 플랜 변경이 필요한 경우
- 이 단계에서 플랜 직접 수정은 불가합니다.
- 새 티켓을 먼저 생성하고, 현 티켓 close 시 "새 티켓 #XXX로 확장/재설계" 증거를 남긴 뒤 전환합니다.

## 전이 조건
- 승인 범위 밖 변경은 ticket adjustment로 되돌립니다.
- phase2→end 직행: `## Problem Analysis` + `## Improvement Direction` 섹션에 실질 내용이 있어야 합니다 (`getCloseWorkflowReasons` 검사 대상).
