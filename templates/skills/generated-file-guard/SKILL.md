---
name: generated-file-guard
summary: 🛡️ generated 파일 직접 편집을 막고 소스로 변경을 라우팅.
category: guard
bind: phase2
---

# Generated File Guard

이 스킬은 조건 없이 이행한다. 여기 적힌 조항을 상황·효율·다른 규칙을 이유로 유예·축약·생략하지 않는다 — 유예할 근거가 떠오르면 그것이 곧 이행하지 않고 있다는 신호다.

Authority: follow `core-rules/AGENTS.md`, the active ticket APC, Phase Gate, and `PROJECT_RULE.md`.

Use this skill when a task mentions generated files, `dist`, `gen`, codegen, reports, benchmark outputs, or synchronized spokes.

## Micro-Protocol

1. Check `PROJECT_RULE.md` generated/source mapping.
2. Check target files for `@generated`, `DO NOT EDIT`, generated directories, or report artifact paths.
3. If the target is generated, identify the source file or generator command.
4. Prefer dry-run or `/tmp` output when probing generators.
5. Record the source-of-truth owner and verification command in the ticket before edits.

## Stop Conditions

- The source-of-truth file cannot be identified after bounded lookup.
- A broad regeneration would modify outputs outside ticket scope.
- The proposed fix hides, relabels, or narrows failing generated/report rows.
- The change would edit both generated output and source in the same patch.
