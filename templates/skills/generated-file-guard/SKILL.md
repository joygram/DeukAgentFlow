---
name: generated-file-guard
summary: Prevent direct generated artifact edits and route changes to their source.
---

# Generated File Guard

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
