import { existsSync,readFileSync } from "fs";
import { resolve } from "path";
import { evidenceFlagsForEvidenceKey } from "./cli-ticket-evidence.js";
import { CliOpts,DEUK_ROOT_DIR,makePath,resolvePackageRoot,toPosixPath } from "./cli-utils.js";
import { machineTransition } from "./ticket-machine.js";

const PACKAGE_ROOT = resolvePackageRoot({ fromUrl: import.meta.url });

const TERMINAL_TICKET_STATUSES = new Set(["closed", "completed", "cancelled", "wontfix", "deprecated", "archived"]);

export const OPEN_TICKET_STATUSES = new Set(["open", "active"]);
export const AUTO_ARCHIVE_DONE_STATUSES = new Set(["closed", "completed", "cancelled", "wontfix"]);

export function isTerminalTicketStatus(status) {
  return TERMINAL_TICKET_STATUSES.has(String(status || "").toLowerCase());
}

export const FLOW_SURFACE_STATUS = {
  start: "🌱 시작",
  status: "🔍 조회",
  adjust: "📝 조정",
  progressActive: "⚙️ 진행",
  progressComplete: "✅ 완료",
  end: "🎉 종료"
};

export const PHASE_ROLE_LABEL: Record<number, string> = {
  1: "planner/designer/ux-designer",
  2: "planner/designer+implementer",
  3: "qa",
  4: "closer"
};

export function roleLabelForPhase(phase): string {
  return PHASE_ROLE_LABEL[normalizeTicketPhaseNumber(phase)] || "";
}

export const POLICY_ROLE_SKILLS: Record<string, string[]> = {
  analysis: ["role-planner", "role-architect"],
  coding: ["role-programmer", "rule-reload"],
  debugging: ["role-qa"],
  completion: ["role-closer", "doc-sync"]
};

export function skillsForStateName(stateName: string): string[] {
  const node = TICKET_WORKFLOW.states[stateName] as Record<string, any> | undefined;
  if (!node) return [];
  if (node.skills) return node.skills;
  return POLICY_ROLE_SKILLS[node.policyRole] || [];
}

export const TICKET_WORKFLOW = {
  name: "ticket_workflow",
  promptRoot: makePath("templates", "cli-surfaces", "state"),
  templateRoot: makePath("templates", "cli-surfaces", "state-template"),
  policyRoot: makePath(DEUK_ROOT_DIR, "project-guardrails"),
  states: {
    "entry-no-workspace": { prompt: "entry-no-workspace", entry: true, transitions: [], actions: [] },
    "entry-free": { prompt: "entry-free", entry: true, transitions: [], actions: [] },
    "entry-no-active": { prompt: "entry-no-active", entry: true, transitions: ["phase1"], actions: ["create"], skills: ["project-pilot"] },
    "entry-in-progress": { prompt: "entry-in-progress", entry: true, transitions: [], actions: ["use", "move"], skills: ["context-recall"] },
    start: { prompt: "start", policyRole: "analysis", template: "start", phase: 1, status: "open", transitions: ["phase1", "end"], actions: ["create"] },
    phase1: {
      prompt: "phase1",
      policyRole: "analysis",
      template: "phase1",
      phase: 1,
      status: "open",
      transitions: ["phase2", "end"],
      actions: ["status", "use", "guard", "move", "discard"],
      requiredEvidence: {
        phase2: ["phase1Plan"],
        end: ["phase1Plan"]
      }
    },
    phase2: {
      prompt: "phase2",
      policyRole: "coding",
      template: "phase2",
      phase: 2,
      status: "open",
      transitions: ["phase3", "end"],
      actions: ["status", "use", "edit", "move", "discard", "close", "reportAttach"],
      requiredEvidence: {
        phase3: ["executionEvidence"],
        end: ["completionEvidence"]
      }
    },
    phase3: {
      prompt: "phase3",
      policyRole: "debugging",
      template: "phase3",
      phase: 3,
      status: "open",
      transitions: ["phase4", "phase2", "end"],
      actions: ["status", "use", "move", "close", "reportAttach"],
      requiredEvidence: {
        phase4: ["verificationEvidence"],
        phase2: ["debuggingDecision"],
        end: ["completionEvidence"]
      }
    },
    phase4: {
      prompt: "phase4",
      policyRole: "completion",
      template: "phase4",
      phase: 4,
      status: "closed",
      transitions: ["end", "phase1"],
      actions: ["status", "use", "move", "archive", "reportAttach"],
      requiredEvidence: {
        end: ["completionEvidence"],
        phase1: ["reopenDecision"]
      }
    },
    end: { prompt: "end", policyRole: "completion", template: "end", phase: 4, status: "closed", transitions: [], actions: ["status", "use", "archive"] },
    useCoreActions: { prompt: "use-core-actions", transitions: [], actions: [] }
  }
};

export const TICKET_WORKFLOW_EVIDENCE = {
  phase1Plan: {
    label: "phase1_plan_complete",
    missingReason: "phase1_plan_incomplete"
  },
  userApproval: {
    label: "user_approval",
    missingReason: "user_approval_missing"
  },
  executionEvidence: {
    label: "execution_evidence",
    missingReason: "execution_evidence_missing"
  },
  verificationEvidence: {
    label: "verification_evidence",
    missingReason: "verification_evidence_missing"
  },
  debuggingDecision: {
    label: "debugging_decision",
    missingReason: "debugging_decision_missing"
  },
  completionEvidence: {
    label: "completion_evidence",
    missingReason: "completion_evidence_missing"
  },
  reopenDecision: {
    label: "reopen_decision",
    missingReason: "reopen_decision_missing"
  }
};

const SURFACE_TEXT = {
  none: { ko: "없음", en: "none" },
  terminal: { ko: "종결", en: "terminal" },
  unknown: { ko: "미상", en: "unknown" },
  blocked: { ko: "[티켓 워크플로 차단]", en: "[TICKET WORKFLOW BLOCKED]" },
  currentState: { ko: "현재 상태", en: "Current state" },
  allowedActions: { ko: "허용 동작", en: "Allowed actions" },
  validTransitions: { ko: "가능한 전이", en: "Valid transitions" },
  discardHint: {
    ko: "\n이 티켓을 폐기하려면: ticket discard --id <id> --workspace <ws> --non-interactive",
    en: "\nTo abandon this ticket: ticket discard --id <id> --workspace <ws> --non-interactive",
  },
  requiredEvidenceFlags: { ko: "필요한 근거 플래그:", en: "Required evidence flags:" },
  fillVia: { ko: "다음 플래그로 채우세요:", en: "fill via" },
  validTransitionsFrom: { ko: "{from} 에서 가능한 전이", en: "Valid transitions from {from}" },
  runtimeHeading: { ko: "## 티켓 워크플로 런타임 컨텍스트", en: "## Ticket Workflow Runtime Context" },
  state: { ko: "상태", en: "State" },
  ticket: { ko: "티켓", en: "Ticket" },
  hostWorkspace: { ko: "호스트 워크스페이스", en: "Host Workspace" },
  workspace: { ko: "워크스페이스", en: "Workspace" },
  path: { ko: "경로", en: "Path" },
  phaseStatus: { ko: "페이즈/상태", en: "Phase/Status" },
  workflowStatus: { ko: "워크플로 상태", en: "Workflow Status" },
  summary: { ko: "요약", en: "Summary" },
  connectionState: { ko: "연결 상태", en: "Connection State" },
  allowedTransitions: { ko: "허용 전이", en: "Allowed transitions" },
  requiredEvidence: { ko: "필요 근거", en: "Required evidence" },
  currentBlockers: { ko: "현재 차단 사유", en: "Current blockers" },
  nextAction: { ko: "다음 행동", en: "Next action" },
  approvalTerminal: {
    ko: "- 승인 게이트: 종결 상태 — 게이트를 걸 전이가 없다.",
    en: "- Approval gate: terminal state — no transition to gate.",
  },
  approvalRequired: {
    ko: "- 승인 게이트: 허용된 전이에 사용자 승인이 필요하다 — 사용자가 승인/approved/yes 를 명시적으로 입력할 때까지 기다려라. 스스로 승인하지 마라.",
    en: "- Approval gate: user approval REQUIRED for the allowed transition(s) — wait for the user to explicitly type 승인/approved/yes before moving; do NOT self-approve.",
  },
  approvalNotRequired: {
    ko: "- 승인 게이트: 허용된 전이에 승인이 필요하지 않다 — 통상 이동이다. 근거를 채우고 자율적으로 진행하라. 사용자에게 허락을 묻지 마라(VOI=0, Escalation Gate).",
    en: "- Approval gate: NOT required for the allowed transition(s) — this is a routine move. Fill evidence and proceed AUTONOMOUSLY; do NOT ask the user for permission (VOI=0, Escalation Gate).",
  },
} as const;

function surfaceText(key: keyof typeof SURFACE_TEXT, language = "ko") {
  const entry = SURFACE_TEXT[key];
  return language === "en" ? entry.en : entry.ko;
}

function surfaceLanguageFromOpts(opts: CliOpts = {}) {
  return resolveGuideLanguage(
    opts.docsLanguage,
    opts.resolveLanguage || ((value) => value),
    opts.normalizeDocsLanguage || ((value) => value)
  );
}

function resolveGuideLanguage(docsLanguage = "ko", resolveLanguage = (value) => value, normalizeDocsLanguage = (value) => value) {
  const normalizedDocsLanguage = normalizeDocsLanguage(docsLanguage);
  return normalizedDocsLanguage === "auto" ? "ko" : resolveLanguage(normalizedDocsLanguage);
}

function resolveTicketWorkflowState(kind) {
  const state = TICKET_WORKFLOW.states[kind];
  if (!state) {
    throw new Error(`ticket workflow state not declared: ${kind}`);
  }
  return state;
}

function ticketWorkflowStateNameFromPhase(phase) {
  const normalizedPhase = normalizeTicketPhaseNumber(phase);
  if (normalizedPhase >= 4) return "phase4";
  return `phase${normalizedPhase}`;
}

function ticketWorkflowStateNameFromMeta(meta: Record<string, any> = {}, fallbackStatus = "open") {
  const status = deriveTicketWorkflowStatus(meta, fallbackStatus);
  if (TERMINAL_TICKET_STATUSES.has(status)) return "phase4";
  return ticketWorkflowStateNameFromPhase(meta.phase || 1);
}

function statusForTicketWorkflowState(targetStateName, currentStatus = "open") {
  const targetState = resolveTicketWorkflowState(targetStateName);
  const targetPhase = normalizeTicketPhaseNumber(targetState.phase || 1);
  if (targetState.status) return targetState.status;
  if (targetPhase >= 4) return "closed";
  if (targetPhase >= 2) {
    const normalizedCurrentStatus = String(currentStatus || "open").toLowerCase();
    return normalizedCurrentStatus === "active" ? "open" : normalizedCurrentStatus;
  }
  return "open";
}

export function resolveTicketWorkflowTransition(meta: Record<string, any> = {}, opts: CliOpts = {}) {
  const currentState = opts.fromState || ticketWorkflowStateNameFromMeta(meta, opts.fallbackStatus);
  const currentWorkflowState = resolveTicketWorkflowState(currentState);
  const targetState = opts.toState
    || (opts.phase ? ticketWorkflowStateNameFromPhase(opts.phase) : null)
    || (opts.next ? currentWorkflowState.transitions?.[0] : null);
  if (!targetState) {
    throw new Error(`ticket workflow transition target is required from ${currentState}`);
  }
  const targetWorkflowState = resolveTicketWorkflowState(targetState);
  const verdict = machineTransition(currentState, targetState);
  if (verdict.reason === "transition_not_declared") {
    throw new Error(`ticket workflow transition blocked: ${currentState} -> ${targetState}`);
  }
  const phase = normalizeTicketPhaseNumber(targetWorkflowState.phase || meta.phase || 1);
  const status = statusForTicketWorkflowState(targetState, meta.status || opts.fallbackStatus);
  return {
    workflow: TICKET_WORKFLOW.name,
    from: currentState,
    to: targetState,
    phase,
    status,
    state: targetWorkflowState
  };
}

export function getTicketWorkflowTransitionEvidenceKeys(fromStateName, toStateName) {
  const fromState = resolveTicketWorkflowState(fromStateName);
  return fromState.requiredEvidence?.[toStateName] || [];
}

export function resolveTicketWorkflowRuntimeState(meta: Record<string, any> = {}, fallbackStatus = "open") {
  const stateName = ticketWorkflowStateNameFromMeta(meta, fallbackStatus);
  return {
    name: stateName,
    state: resolveTicketWorkflowState(stateName)
  };
}

export function getTicketWorkflowActionReasons(meta: Record<string, any> = {}, opts: CliOpts = {}) {
  const action = String(opts.action || "").trim();
  const { name, state } = resolveTicketWorkflowRuntimeState(meta, opts.fallbackStatus);
  if (!action) return [`ticket_workflow_action_missing:${name}`];
  const allowedActions = state.actions || [];
  if (!allowedActions.includes(action)) {
    return [`ticket_workflow_action_blocked:${name}:${action}`];
  }
  return [];
}

export function assertTicketWorkflowAction(meta: Record<string, any> = {}, opts: CliOpts = {}) {
  const reasons = getTicketWorkflowActionReasons(meta, opts);
  if (reasons.length === 0) return;
  const { name, state } = resolveTicketWorkflowRuntimeState(meta, opts.fallbackStatus);
  const lang = surfaceLanguageFromOpts(opts);
  const t = (key: keyof typeof SURFACE_TEXT) => surfaceText(key, lang);
  const allowedActions = (state.actions || []).join(", ") || t("none");
  const allowedTransitions = (state.transitions || []).join(", ") || t("none");
  const canDiscard = (state.actions || []).includes("discard");
  const discardHint = canDiscard ? t("discardHint") : "";
  throw new Error(
    `${t("blocked")} ${reasons.join(", ")}\n` +
    `${t("currentState")}: ${name} | ${t("allowedActions")}: ${allowedActions} | ${t("validTransitions")}: ${allowedTransitions}${discardHint}`
  );
}

export function getTicketWorkflowTransitionReasons(meta: Record<string, any> = {}, opts: CliOpts = {}) {
  const transition = resolveTicketWorkflowTransition(meta, opts);
  const evidence = opts.evidence || {};
  const verdict = machineTransition(transition.from, transition.to, evidence);
  return {
    transition,
    reasons: verdict.missingEvidence || [],
    skills: verdict.skills || []
  };
}

export function assertTicketWorkflowTransition(meta: Record<string, any> = {}, opts: CliOpts = {}) {
  const result = getTicketWorkflowTransitionReasons(meta, opts);
  if (result.reasons.length > 0) {
    const lang = surfaceLanguageFromOpts(opts);
    const t = (key: keyof typeof SURFACE_TEXT) => surfaceText(key, lang);
    const fromState = TICKET_WORKFLOW.states[result.transition.from];
    const validTransitions = (fromState?.transitions || []).join(", ") || t("none");
    const evidenceKeys = getTicketWorkflowTransitionEvidenceKeys(result.transition.from, result.transition.to);
    const flagHint = evidenceKeys
      .map(key => {
        const flags = evidenceFlagsForEvidenceKey(key);
        return flags.length ? `  ${key}: ${t("fillVia")} ${flags.join(" ")}` : "";
      })
      .filter(Boolean)
      .join("\n");
    throw new Error(
      `${t("blocked")} ${result.transition.from} -> ${result.transition.to}\n` +
      result.reasons.map(reason => `  - ${reason}`).join("\n") + "\n" +
      (flagHint ? `${t("requiredEvidenceFlags")}\n${flagHint}\n` : "") +
      `${t("validTransitionsFrom").replace("{from}", result.transition.from)}: ${validTransitions}`
    );
  }
  return { ...result.transition, skills: result.skills };
}

function readProjectPolicyText(cwd, policyRole, language, replacements: Record<string, any> = {}) {
  if (!cwd || !policyRole) return "";
  const localizedPolicyPath = makePath(cwd, DEUK_ROOT_DIR, "project-guardrails", `${policyRole}.${language}.md`);
  const policyPath = existsSync(localizedPolicyPath)
    ? localizedPolicyPath
    : makePath(cwd, DEUK_ROOT_DIR, "project-guardrails", `${policyRole}.md`);
  if (!existsSync(policyPath)) return "";
  let content = readFileSync(policyPath, "utf8");
  const projectRulePath = makePath(cwd, "PROJECT_RULE.md");
  const allReplacements = {
    PROJECT_RULE_PATH: projectRulePath,
    PROJECT_GUARDRAIL: policyRole,
    PROJECT_POLICY_ROLE: policyRole,
    ...replacements
  };
  for (const [key, value] of Object.entries(allReplacements)) {
    content = content.replaceAll(`{{${key}}}`, String(value ?? ""));
  }
  return content.trim();
}

function readLocalizedPackagePrompt(rootName, promptName, language, replacements: Record<string, any> = {}, missingLabel = "ticket workflow recipe") {
  if (!promptName) return "";
  const localizedPath = makePath(PACKAGE_ROOT, "templates", "cli-surfaces", rootName, `${promptName}.${language}.md`);
  const fallbackPath = makePath(PACKAGE_ROOT, "templates", "cli-surfaces", rootName, `${promptName}.en.md`);
  const promptPath = existsSync(localizedPath) ? localizedPath : fallbackPath;
  if (!existsSync(promptPath)) {
    throw new Error(`${missingLabel} not found: ${promptPath}`);
  }
  let content = readFileSync(promptPath, "utf8");
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, String(value ?? ""));
  }
  return content.trimEnd();
}

function buildTicketStateRecipe(kind, language, replacements: Record<string, any> = {}, context: Record<string, any> = {}) {
  const workflowState = resolveTicketWorkflowState(kind);
  const statePrompt = readLocalizedPackagePrompt(
    "state",
    workflowState.prompt,
    language,
    replacements,
    "ticket workflow state recipe"
  );
  const projectPolicy = readProjectPolicyText(
    context.workspaceRoot,
    context.policyRole || workflowState.policyRole,
    language,
    replacements
  );
  const stateTemplate = readLocalizedPackagePrompt(
    "state-template",
    context.template || workflowState.template,
    language,
    replacements,
    "ticket workflow state template"
  );
  const runtimeContext = renderTicketWorkflowRuntimeContext(kind, workflowState, context.runtimeContext, language);
  return {
    state_prompt: statePrompt,
    state_template: stateTemplate,
    runtime_context: runtimeContext,
    policy_metadata: projectPolicy,
    compact_recipe: [statePrompt, stateTemplate].filter(Boolean).join("\n\n---\n\n"),
    full_recipe: [statePrompt, runtimeContext, projectPolicy, stateTemplate].filter(Boolean).join("\n\n---\n\n")
  };
}

function renderApprovalGateLine(workflowState, runtimeContext = null, language = "ko") {
  if (!runtimeContext || Object.keys(runtimeContext).length === 0) return "";
  const transitions = workflowState.transitions || [];
  const requiredEvidence = workflowState.requiredEvidence || {};
  const approvalRequired = Object.values(requiredEvidence).some(
    (evidence) => (evidence as string[]).includes("userApproval")
  );
  if (transitions.length === 0) {
    return surfaceText("approvalTerminal", language);
  }
  return approvalRequired
    ? surfaceText("approvalRequired", language)
    : surfaceText("approvalNotRequired", language);
}

function renderTicketWorkflowRuntimeContext(kind, workflowState, runtimeContext = null, language = "ko") {
  if (!runtimeContext || Object.keys(runtimeContext).length === 0) return "";
  const t = (key: keyof typeof SURFACE_TEXT) => surfaceText(key, language);
  const transitions = workflowState.transitions || [];
  const actions = workflowState.actions || [];
  const requiredEvidence = workflowState.requiredEvidence || {};
  const approvalGateLine = renderApprovalGateLine(workflowState, runtimeContext, language);
  const runtimeLines = [
    t("runtimeHeading"),
    `- ${t("state")}: ${kind}`,
    `- ${t("ticket")}: ${runtimeContext.ticketId || ""}`,
    `- ${t("hostWorkspace")}: ${runtimeContext.hostWorkspaceLabel || runtimeContext.workspaceLabel || ""}`,
    `- ${t("workspace")}: ${runtimeContext.workspaceLabel || ""}`,
    `- ${t("path")}: ${runtimeContext.path || ""}`,
    `- ${t("phaseStatus")}: ${runtimeContext.phase || ""}/${runtimeContext.status || ""}`,
    `- ${t("workflowStatus")}: ${runtimeContext.status || ""}`,
    `- ${t("summary")}: ${runtimeContext.summary || ""}`,
    `- ${t("connectionState")}: ${runtimeContext.connectionState || t("unknown")}`,
    `- ${t("allowedActions")}: ${actions.length ? actions.join(", ") : t("none")}`,
    `- ${t("allowedTransitions")}: ${transitions.length ? transitions.join(", ") : t("terminal")}`,
    `- ${t("requiredEvidence")}: ${Object.entries(requiredEvidence).map(([target, evidence]) => `${target}=[${(evidence as string[]).join(", ")}]`).join("; ") || t("none")}`,
    `- ${t("currentBlockers")}: ${(runtimeContext.reasons || []).length ? runtimeContext.reasons.join(", ") : t("none")}`,
    approvalGateLine
  ];
  if (runtimeContext.nextAction) runtimeLines.push(`- ${t("nextAction")}: ${runtimeContext.nextAction}`);
  return runtimeLines.join("\n");
}

function normalizeTicketWorkflowReplacements(replacements: Record<string, any> = {}) {
  return Object.fromEntries(
    Object.entries(replacements).map(([key, value]) => [key, value == null ? "" : value])
  );
}

export function buildTicketDocMetaSurface(kind, opts: CliOpts = {}) {
  const language = resolveGuideLanguage(
    opts.docsLanguage,
    opts.resolveLanguage || ((value) => value),
    opts.normalizeDocsLanguage || ((value) => value)
  );
  const replacements = normalizeTicketWorkflowReplacements(opts.replacements);
  const context = {
    cwd: opts.workspaceRoot,
    policyRole: opts.policyRole,
    template: opts.template,
    runtimeContext: opts.runtimeContext,
    surfaceMode: opts.surfaceMode
  };
  const workflowState = resolveTicketWorkflowState(kind);
  const recipe = buildTicketStateRecipe(kind, language, replacements, context);
  const requiredEvidence = workflowState.requiredEvidence || {};
  const runtimeContext = opts.runtimeContext || {};
  const currentPhase = runtimeContext.phase || workflowState.phase || "";
  const currentStatus = runtimeContext.status || workflowState.status || "";
  const requiredSlots = [...new Set(Object.values(requiredEvidence).flat())];
  const outputStatus = requiredSlots.length ? "action_requires_evidence" : "action_available";
  return {
    document_type: "agent_flow_surface",
    document_subtype: "ticket_workflow_state",
    contract_version: "documeta-0.1",
    workflow: TICKET_WORKFLOW.name,
    state: {
      name: kind,
      phase: currentPhase,
      status: currentStatus,
      actions: workflowState.actions || [],
      transitions: workflowState.transitions || []
    },
    language,
    recipe: {
      prompt_id: workflowState.prompt || "",
      template_id: context.template || workflowState.template || "",
      text: recipe.compact_recipe
    },
    policy_metadata: {
      role: context.policyRole || workflowState.policyRole || "",
      text: recipe.policy_metadata
    },
    runtime_context: runtimeContext,
    source_contract: {
      required_slots: requiredSlots,
      metadata_fields: ["ticket_id", "workspace", "phase", "status", "path"]
    },
    validation: {
      status: outputStatus === "action_available" ? "PASS" : "READY",
      errors: []
    },
    output_status: outputStatus,
    debug: {
      runtime_context_text: recipe.runtime_context,
      full_recipe: recipe.full_recipe
    }
  };
}

export function renderTicketDocMetaSurface(kind, opts: CliOpts = {}) {
  const docmeta = buildTicketDocMetaSurface(kind, opts);
  if (opts.json) {
    return JSON.stringify(docmeta, null, 2);
  }
  if (opts.surfaceMode === "full" || opts.verbose) {
    return [
      `DocMeta state: ${docmeta.state.name}`,
      docmeta.debug.full_recipe
    ].filter(Boolean).join("\n\n---\n\n");
  }
  const runtime = docmeta.runtime_context || {};
  const lines = [
    `DocMeta state: ${docmeta.state.name}`,
    runtime.ticketId ? `Ticket: ${runtime.ticketId}` : "",
    runtime.summary ? `Summary: ${runtime.summary}` : "",
    `Phase/Status: ${docmeta.state.phase || ""}/${docmeta.state.status || ""}`,
    docmeta.source_contract.required_slots.length
      ? `Required slots: ${docmeta.source_contract.required_slots.join(", ")}`
      : "Required slots: none",
    runtime.nextAction ? `Next action: ${runtime.nextAction}` : "",
    `Output: ${docmeta.output_status}`
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildTicketFlowSurface(kind, opts: CliOpts = {}) {
  const docmeta = buildTicketDocMetaSurface(kind, opts);
  const cardPhase = opts.flow?.phase ?? opts.runtimeContext?.phase ?? docmeta.state.phase;
  const flowLine = opts.flow
    ? formatTicketFlowLine(opts.flow.workspaceLabel, opts.flow.statusLabel, opts.flow.ticketId, opts.flow.absPath, opts.flow.invocationCwd || opts.workspaceRoot || "", cardPhase)
    : "";
  return {
    ...docmeta,
    flowLine,
    text: flowLine
  };
}

export function renderTicketFlowSurface(kind, opts: CliOpts = {}) {
  return buildTicketFlowSurface(kind, opts).text;
}

export function normalizeTicketPhaseNumber(phase) {
  if (phase === undefined || phase === null || phase === "") return 1;
  const parsed = Number(phase);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`ticket phase malformed: expected a positive number, got ${JSON.stringify(phase)}`);
  }
  return Math.floor(parsed);
}

export function sanitizeTicketWorkspaceLabel(workspaceLabel) {
  const normalized = String(workspaceLabel || "").trim();
  if (!normalized) return "";
  if (/^(?:workspace|none|null|undefined)$/i.test(normalized)) return "";
  return normalized;
}

export function formatTicketFlowLine(workspaceLabel, statusLabel, ticketId, absPath, cwd = "", phase = null) {
  const resolvedWorkspaceLabel = sanitizeTicketWorkspaceLabel(workspaceLabel);
  if (!resolvedWorkspaceLabel) {
    throw new Error("ticket flow surface requires a concrete workspace label");
  }
  const resolvedStatusLabel = String(statusLabel || "").trim();
  if (!resolvedStatusLabel) {
    throw new Error("ticket flow surface requires a concrete status label");
  }
  const absResolved = resolve(absPath);
  const linkPath = toPosixPath(makePath(absResolved)).replace(/^[a-zA-Z]:/, "");
  const idMatch = String(ticketId).match(/^(\d+)-(.+)$/);
  const num = idMatch ? idMatch[1] : "";
  const rawSlug = idMatch ? idMatch[2] : ticketId;
  const slug = rawSlug.length > 40 ? rawSlug.slice(0, 40) : rawSlug;
  const label = num ? `${num} ${slug}` : slug;
  const phaseBadge = buildPhaseRoleBadge(phase);
  return `📦 ${resolvedWorkspaceLabel} · ${resolvedStatusLabel}${phaseBadge} · [${label}](${linkPath})`;
}

function buildPhaseRoleBadge(phase): string {
  if (phase === null || phase === undefined || phase === "") return "";
  const phaseNum = normalizeTicketPhaseNumber(phase);
  const role = roleLabelForPhase(phaseNum);
  return role ? ` · phase${phaseNum} · ${role}` : ` · phase${phaseNum}`;
}

export function deriveTicketWorkflowStatus(meta: Record<string, any> = {}, fallbackStatus = "open") {
  const rawStatus = String(meta.status || fallbackStatus || "open").toLowerCase();
  const phase = normalizeTicketPhaseNumber(meta.phase || 1);
  if (TERMINAL_TICKET_STATUSES.has(rawStatus)) {
    return rawStatus;
  }
  if (phase >= 4) return "closed";
  if (phase >= 2) return rawStatus === "active" ? "open" : rawStatus;
  return rawStatus || "open";
}

export function isExecutionTicketStatus(status) {
  return OPEN_TICKET_STATUSES.has(String(status || "open").toLowerCase());
}

export function inferTicketWorkflowStatus(meta: Record<string, any> = {}, isArchived = false) {
  if (isArchived) return "archived";
  return deriveTicketWorkflowStatus(meta, "open");
}
