const MODEL_PROFILES = {
  "gpt-5": { contextClass: "normal", maxExecutionStatusUpdates: 1 },
  "gpt-5.5": { contextClass: "normal", maxExecutionStatusUpdates: 1 },
  "gpt-5.4": { contextClass: "normal", maxExecutionStatusUpdates: 1 },
  "gpt-5.4-mini": { contextClass: "tight", maxExecutionStatusUpdates: 1 },
  "gpt-5.3-codex": { contextClass: "tight", maxExecutionStatusUpdates: 1 },
  "gpt-5.3-codex-spark": { contextClass: "tight", maxExecutionStatusUpdates: 1 }
};

const TDW_STATUS_WORDS = new Set(["ticket", "approval", "guard", "context", "verify"]);
const PRE_APPROVAL_ALLOWED_PREFIXES = [
  "Ticket start:",
  "Approval pending:",
  "Guard topic:"
];
const PRE_APPROVAL_SUMMARY_MAX_LENGTH = 160;

function profileForModel(model = "") {
  const key = String(model || "").trim().toLowerCase();
  return MODEL_PROFILES[key] || { contextClass: "normal", maxExecutionStatusUpdates: 1 };
}

export function resolveCommentaryConstraint(input = {}) {
  const modelProfile = profileForModel(input.model);
  const remainingContextPct = Number.isFinite(input.remainingContextPct) ? input.remainingContextPct : null;
  const contextClass = input.contextClass || modelProfile.contextClass;
  const isConstrained = contextClass === "tight" || (remainingContextPct !== null && remainingContextPct <= 35);

  return {
    model: input.model || "unknown",
    contextClass,
    remainingContextPct,
    maxExecutionStatusUpdates: isConstrained ? 0 : modelProfile.maxExecutionStatusUpdates
  };
}

function countNonEmptyLines(text = "") {
  return String(text)
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

function isSingleWordStatus(text = "") {
  const normalized = String(text || "").trim().toLowerCase();
  return TDW_STATUS_WORDS.has(normalized);
}

function isAllowedPreApprovalLine(line = "") {
  return PRE_APPROVAL_ALLOWED_PREFIXES.some(prefix => line.startsWith(prefix));
}

function validatePreApprovalLines(lines = [], stepIndex = 0) {
  const violations = [];
  const summaryLines = [];

  for (const line of lines) {
    if (isAllowedPreApprovalLine(line)) continue;
    summaryLines.push(line);
  }

  if (summaryLines.length > 1) {
    violations.push({
      step: stepIndex,
      code: "pre_approval_multiple_summaries",
      detail: summaryLines.join(" | ")
    });
    return violations;
  }

  const summary = summaryLines[0];
  if (!summary) return violations;

  if (summary.length > PRE_APPROVAL_SUMMARY_MAX_LENGTH) {
    violations.push({
      step: stepIndex,
      code: "pre_approval_summary_too_long",
      detail: summary
    });
  }

  return violations;
}

function validateRunningSurface(lines = [], stepIndex = 0) {
  const violations = [];

  for (const line of lines) {
    if (isSingleWordStatus(line)) continue;
    violations.push({
      step: stepIndex,
      code: "execution_narration_forbidden",
      detail: line
    });
  }

  return violations;
}

export function validateCommentaryScenario(scenario = {}, options = {}) {
  const constraint = resolveCommentaryConstraint(options);
  const steps = Array.isArray(scenario.steps) ? scenario.steps : [];
  const violations = [];
  let executionStatusCount = 0;
  let interrupted = false;

  for (const [index, step] of steps.entries()) {
    const stage = String(step.stage || "").trim();
    const output = String(step.output || "");
    const lines = countNonEmptyLines(output);

    if (interrupted) {
      violations.push({
        step: index,
        code: "post_interrupt_output_forbidden",
        detail: stage || "<empty>"
      });
      continue;
    }

    if (stage === "ticket_start_pending" || stage === "requirement_change_pending" || stage === "requirement_change") {
      violations.push(...validatePreApprovalLines(lines, index));
      continue;
    }

    if (stage === "approved_execution" || stage === "command_running" || stage === "search_running") {
      violations.push(...validateRunningSurface(lines, index));
      for (const line of lines) {
        if (isSingleWordStatus(line)) {
          executionStatusCount += 1;
        }
      }
      continue;
    }

    if (stage === "user_correction_interrupt") {
      if (lines.length > 0) {
        const nonAllowed = lines.filter(line => !TDW_STATUS_WORDS.has(String(line).trim().toLowerCase()));
        if (nonAllowed.length > 0) {
          violations.push({
            step: index,
            code: "interrupt_narration_forbidden",
            detail: nonAllowed.join(" | ")
          });
        }
      }
      interrupted = true;
      continue;
    }

    if (stage === "final_answer") {
      continue;
    }

    violations.push({
      step: index,
      code: "unknown_stage",
      detail: stage || "<empty>"
    });
  }

  if (executionStatusCount > constraint.maxExecutionStatusUpdates) {
    violations.push({
      step: -1,
      code: "execution_status_budget_exceeded",
      detail: `${executionStatusCount} > ${constraint.maxExecutionStatusUpdates}`
    });
  }

  return {
    ok: violations.length === 0,
    constraint,
    violations
  };
}
