Close/archive only after affected files, verification result, residual risk, and follow-up decision are recorded.

🚫 No-concealment gate (Verification is a fact, not a narration):
1. Verification/Execution Result must be the actual command you ran and its raw stdout verbatim, not a hand-written "PASS".
2. skip/blank/unimplemented/commented-out is a red flag. No silent pass — report "skipped" "TODO" "unimplemented" as verification failure.
3. Do not report a pass that came from an external library or alternate path as if your own implementation was verified. State what actually ran.
4. If uncertain, write "unverified". Do not dress up a guess as PASS and close.
