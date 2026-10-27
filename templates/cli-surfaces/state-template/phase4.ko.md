# Ticket Workflow 템플릿: phase4

## 종료 슬롯
- Execution Result:
- Verification:
- Residual Risk:
- Follow-up Decision:

## 전이 조건
- 후속 여부가 불명확하면 no-follow-up으로 닫지 않습니다.

## 은폐 금지
- Verification/Execution Result는 손으로 쓴 "PASS"가 아니라 실행 명령의 raw stdout 그대로여야 합니다.
- skip/빈칸/미구현은 검증 실패(빨간불)로 명시 — 침묵 통과 금지.
- 외부 라이브러리·대체 경로 통과를 자체 검증으로 위장 금지.
- 불확실은 "미확인"으로 명시, 추측을 PASS로 포장해 close 금지.
