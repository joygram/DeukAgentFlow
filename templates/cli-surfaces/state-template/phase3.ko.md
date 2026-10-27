# Ticket Workflow 템플릿: phase3

## 검증 슬롯
- Reproduction:
- Verification Command:
- Result:
- Remaining Risk:

## 전이 조건
- 검증이 불가능하면 이유를 티켓에 기록하고 종료하지 않습니다.

## 은폐 금지
- Result는 손으로 쓴 "PASS"가 아니라 Verification Command의 raw stdout 그대로여야 합니다.
- skip/빈칸/미구현은 검증 실패(빨간불)로 명시 — 침묵 통과 금지.
- 외부 라이브러리·대체 경로 통과를 자체 검증으로 위장 금지.
- 불확실은 "미확인"으로 명시, 추측을 PASS로 포장 금지.
