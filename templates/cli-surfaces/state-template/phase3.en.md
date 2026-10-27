# Ticket Workflow Template: phase3

## Verification Slots
- Reproduction:
- Verification Command:
- Result:
- Remaining Risk:

## Transition Condition
- If verification is unavailable, record why and do not close.

## No Concealment
- Result must be the raw stdout of Verification Command, not a hand-written "PASS".
- skip/blank/unimplemented = verification failure (red flag); no silent pass.
- Do not disguise an external-library/alternate-path pass as your own verification.
- Mark uncertainty as "unverified"; do not dress up a guess as PASS.
