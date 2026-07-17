import { existsSync, readFileSync } from "fs";
import { dirname, resolve, relative } from "path";
import { fileURLToPath } from "url";
import { CliOpts, DEUK_ROOT_DIR, makePath, resolveConsumerTicketRoot, resolvePackageRoot, toFileUri, toPosixPath } from "./cli-utils.js";
// #691: 전이/guard 검증은 XState 머신(ticket-machine.mjs)이 담당. ESM 순환 import이지만
// machineTransition은 호출 시점에만 TICKET_WORKFLOW를 읽으므로 안전하다.
import { machineTransition } from "./ticket-machine.js";
// #875: 전이 실패 메시지에 "이 증거를 채우는 플래그"를 붙여 에이전트가 무엇이 빠졌는지
// 즉시 알게 한다(예: executionEvidence는 --reproduction … --docs-reflected 를 요구).
import { evidenceFlagsForEvidenceKey } from "./cli-ticket-evidence.js";

const PACKAGE_ROOT = resolvePackageRoot({ fromUrl: import.meta.url });

const TERMINAL_TICKET_STATUSES = new Set(["closed", "completed", "cancelled", "wontfix", "deprecated", "archived"]);

// "active" is no longer a status value — a ticket's focus is expressed solely by
// activeTicketId. status carries lifecycle only: open / archived / closed.
// Kept "active" here for backward-compat reads of legacy ticket files; new writes use "open".
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

// #908: phase → 현재 롤 라벨(SSOT). role-layer.md §3 "phase↔롤 결속" 표를 코드로 옮긴
// 단일 정본이다 — 한 줄 상태 카드가 "지금 무슨 모드로 일하는지"를 표면화할 때 이 맵을
// 다시 읽어 쓴다(role-layer.md §3.0: 각자 다시 정의하지 않고 designer 산출을 재-참조; DR-03).
// phase1은 planner→designer→ux-designer 롤이 (대상 성격에 따라) 서므로 카드엔 대표 라벨로 묶는다.
// #914: phase2는 승인 후 "구현" 단일 state — 계획(설계 조정)과 구현이 같은 state 안에서
// 왕복 없이 함께 이뤄지므로 라벨도 두 롤을 함께 밝힌다(설계자가 재승인 없이 구현자와
// 같은 state에 머문다는 것을 카드에서부터 드러낸다).
export const PHASE_ROLE_LABEL: Record<number, string> = {
  1: "planner/designer/ux-designer",
  2: "planner/designer+implementer",
  3: "qa",
  4: "closer"
};

export function roleLabelForPhase(phase): string {
  return PHASE_ROLE_LABEL[normalizeTicketPhaseNumber(phase)] || "";
}

export const TICKET_WORKFLOW = {
  name: "ticket_workflow",
  promptRoot: makePath("docs", "cli-surfaces", "state"),
  templateRoot: makePath("docs", "cli-surfaces", "state-template"),
  policyRoot: makePath(DEUK_ROOT_DIR, "project-guardrails"),
  states: {
    // #690: entry 노드 — rules가 진입 시 라우팅하는 그래프의 시작점들. 프롬프트는
    // docs/cli-surfaces/state/entry-*.md(SSOT). 티켓 phase 노드(phase1~4)와 함께
    // 단일 노드 그래프를 이룬다. router가 cwd/.md 상태로 이 중 하나를 고른다.
    "entry-no-workspace": { prompt: "entry-no-workspace", entry: true, transitions: [], actions: [] },
    "entry-free": { prompt: "entry-free", entry: true, transitions: [], actions: [] },
    "entry-no-active": { prompt: "entry-no-active", entry: true, transitions: ["phase1"], actions: ["create"] },
    "entry-in-progress": { prompt: "entry-in-progress", entry: true, transitions: [], actions: ["use", "move"] },
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
        phase2: ["phase1Plan", "userApproval"],
        end: ["phase1Plan"]
      }
    },
    // #914: phase1(기획/설계)과 구 phase2(구현)를 병합한 "구현" 단일 state. 승인(userApproval)
    // 후 검증(phase3)까지 머무는 동안, 스펙 재확인/조정은 phase 전이가 아니라 `edit` 액션으로
    // 본문(Scope/Plan/Analysis/Direction)을 그 자리에서 고쳐 쓰는 것으로 흡수한다 — 재승인
    // ceremony도, reopenDecision 증거도 요구하지 않는다(design-driven-flow.md:331 "설계 개정
    // 이력이 티켓 본문에 누적되어 수렴"을 FSM 구조로 반영). phase2→phase1 롤백 전이는
    // 제거했다: 진짜 "스코프 자체가 틀렸다"(전제 자체가 잘못됨) 케이스는 여전히 discard가
    // 담당하고, 되돌아가 재승인받는 왕복은 더 이상 없다. phase3→phase2 롤백(debuggingDecision)
    // 은 그대로 유지 — 이번 스코프 밖.
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
    // Execution phases keep status "open"; focus is tracked via activeTicketId.
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
  // #691: 전이 허용 검증은 XState 머신이 담당한다(미정의 전이 차단). 증거 guard는
  // getTicketWorkflowTransitionReasons에서 evidence와 함께 별도로 검증한다.
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
  const allowedActions = (state.actions || []).join(", ") || "none";
  const allowedTransitions = (state.transitions || []).join(", ") || "none";
  const canDiscard = (state.actions || []).includes("discard");
  const discardHint = canDiscard
    ? `\nTo abandon this ticket: ticket discard --id <id> --workspace <ws> --non-interactive`
    : "";
  throw new Error(
    `[TICKET WORKFLOW BLOCKED] ${reasons.join(", ")}\n` +
    `Current state: ${name} | Allowed actions: ${allowedActions} | Valid transitions: ${allowedTransitions}${discardHint}`
  );
}

export function getTicketWorkflowTransitionReasons(meta: Record<string, any> = {}, opts: CliOpts = {}) {
  const transition = resolveTicketWorkflowTransition(meta, opts);
  const evidence = opts.evidence || {};
  // #691: 증거 guard는 XState 머신이 검증한다. machineTransition이 guard 미충족 시
  // missingEvidence를 산출하므로, 흩어진 검증 대신 머신을 단일 진실로 쓴다.
  const verdict = machineTransition(transition.from, transition.to, evidence);
  return {
    transition,
    reasons: verdict.missingEvidence || []
  };
}

export function assertTicketWorkflowTransition(meta: Record<string, any> = {}, opts: CliOpts = {}) {
  const result = getTicketWorkflowTransitionReasons(meta, opts);
  if (result.reasons.length > 0) {
    const fromState = TICKET_WORKFLOW.states[result.transition.from];
    const validTransitions = (fromState?.transitions || []).join(", ") || "none";
    // #875: 요구 증거를 채우는 플래그를 명시한다 — executionEvidence는 실행 슬롯과 함께
    // --docs-reflected 를 요구하므로, 이 힌트가 없으면 에이전트가 문서반영 플래그를 모른 채
    // 실행 슬롯만 채우며 삽질한다.
    const evidenceKeys = getTicketWorkflowTransitionEvidenceKeys(result.transition.from, result.transition.to);
    const flagHint = evidenceKeys
      .map(key => {
        const flags = evidenceFlagsForEvidenceKey(key);
        return flags.length ? `  ${key}: fill via ${flags.join(" ")}` : "";
      })
      .filter(Boolean)
      .join("\n");
    throw new Error(
      `[TICKET WORKFLOW BLOCKED] ${result.transition.from} -> ${result.transition.to}: ${result.reasons.join(", ")}\n` +
      (flagHint ? `Required evidence flags:\n${flagHint}\n` : "") +
      `Valid transitions from ${result.transition.from}: ${validTransitions}`
    );
  }
  return result.transition;
}

function readProjectPolicyText(cwd, policyRole, language, replacements: Record<string, any> = {}) {
  if (!cwd || !policyRole) return "";
  const localizedPolicyPath = makePath(cwd, DEUK_ROOT_DIR, "project-guardrails", `${policyRole}.${language}.md`);
  const policyPath = existsSync(localizedPolicyPath)
    ? localizedPolicyPath
    : makePath(cwd, DEUK_ROOT_DIR, "project-guardrails", `${policyRole}.md`);
  if (!existsSync(policyPath)) return "";
  let content = readFileSync(policyPath, "utf8");
  // #824: 정본은 워크스페이스 루트 PROJECT_RULE.md (치환 토큰 표시용 경로도 루트로 통일).
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
  const localizedPath = makePath(PACKAGE_ROOT, "docs", "cli-surfaces", rootName, `${promptName}.${language}.md`);
  const fallbackPath = makePath(PACKAGE_ROOT, "docs", "cli-surfaces", rootName, `${promptName}.en.md`);
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
    context.cwd,
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
  const runtimeContext = renderTicketWorkflowRuntimeContext(kind, workflowState, context.runtimeContext);
  return {
    state_prompt: statePrompt,
    state_template: stateTemplate,
    runtime_context: runtimeContext,
    policy_metadata: projectPolicy,
    compact_recipe: [statePrompt, stateTemplate].filter(Boolean).join("\n\n---\n\n"),
    full_recipe: [statePrompt, runtimeContext, projectPolicy, stateTemplate].filter(Boolean).join("\n\n---\n\n")
  };
}

function renderTicketWorkflowRuntimeContext(kind, workflowState, runtimeContext = null) {
  if (!runtimeContext || Object.keys(runtimeContext).length === 0) return "";
  const transitions = workflowState.transitions || [];
  const actions = workflowState.actions || [];
  const requiredEvidence = workflowState.requiredEvidence || {};
  const runtimeLines = [
    "## Ticket Workflow Runtime Context",
    `- State: ${kind}`,
    `- Ticket: ${runtimeContext.ticketId || ""}`,
    `- Host Workspace: ${runtimeContext.hostWorkspaceLabel || runtimeContext.workspaceLabel || ""}`,
    `- Workspace: ${runtimeContext.workspaceLabel || ""}`,
    `- Path: ${runtimeContext.path || ""}`,
    `- Phase/Status: ${runtimeContext.phase || ""}/${runtimeContext.status || ""}`,
    `- Workflow Status: ${runtimeContext.status || ""}`,
    `- Summary: ${runtimeContext.summary || ""}`,
    `- Connection State: ${runtimeContext.connectionState || "unknown"}`,
    `- Allowed actions: ${actions.length ? actions.join(", ") : "none"}`,
    `- Allowed transitions: ${transitions.length ? transitions.join(", ") : "terminal"}`,
    `- Required evidence: ${Object.entries(requiredEvidence).map(([target, evidence]) => `${target}=[${(evidence as string[]).join(", ")}]`).join("; ") || "none"}`,
    `- Current blockers: ${(runtimeContext.reasons || []).length ? runtimeContext.reasons.join(", ") : "none"}`
  ];
  if (runtimeContext.nextAction) runtimeLines.push(`- Next action: ${runtimeContext.nextAction}`);
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
    cwd: opts.cwd,
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
  // Dedupe: a slot (e.g. phase1Plan) can be required by more than one outgoing
  // transition (phase2 and end), and flattening would list it twice.
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
  // #908: pass the phase so the card can surface the phase + current role badge.
  // Prefer the flow's explicit phase, else the runtime context, else the state's phase.
  const cardPhase = opts.flow?.phase ?? opts.runtimeContext?.phase ?? docmeta.state.phase;
  const flowLine = opts.flow
    ? formatTicketFlowLine(opts.flow.workspaceLabel, opts.flow.statusLabel, opts.flow.ticketId, opts.flow.absPath, opts.flow.invocationCwd || opts.cwd || "", cardPhase)
    : "";
  const surfaceText = renderTicketDocMetaSurface(kind, opts);
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
  const parsed = Number(phase);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
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
  // #646: tickets now live in the home store (~/.deuk-agent/tickets/{uuid}/),
  // a different drive/root than the workspace cwd — relative(cwd, abs) leaks an
  // unopenable path. Always emit a makePath-normalized absolute path so the
  // review link opens from anywhere.
  // #647: emit a POSIX absolute path WITHOUT the Windows drive letter
  // ("C:/Users/..." → "/Users/..."). The Claude Code chat-panel click handler
  // breaks on the drive-letter colon (anthropics/claude-code#53919), so a
  // drive-prefixed link never opens. Stripping "C:" yields a slash-rooted path
  // the chat UI opens, while the VS Code webview's vscode.open resolves it too.
  const linkPath = toPosixPath(makePath(absResolved)).replace(/^[a-zA-Z]:/, "");
  // Parse ticketId: "028-some-title-joy-deep" → num="028", slug="some-title-joy-deep"
  const idMatch = String(ticketId).match(/^(\d+)-(.+)$/);
  const num = idMatch ? idMatch[1] : "";
  const rawSlug = idMatch ? idMatch[2] : ticketId;
  const slug = rawSlug.length > 40 ? rawSlug.slice(0, 40) : rawSlug;
  const label = num ? `${num} ${slug}` : slug;
  // #908: surface the current phase + role on the card so "무슨 단계·무슨 롤로 일하는지"가
  // 항상 보인다(role-layer.md §3 phase↔롤 결속). phase가 없으면(생성/조정 등) 배지를 생략해
  // 기존 3요소 카드로 남는다. 롤 라벨은 PHASE_ROLE_LABEL SSOT에서 파생한다.
  const phaseBadge = buildPhaseRoleBadge(phase);
  return `📦 ${resolvedWorkspaceLabel} · ${resolvedStatusLabel}${phaseBadge} · [${label}](${linkPath})`;
}

// #908: "· ⚙️ phase2 · implementer" 형태의 배지를 만든다. phase가 없거나 유효하지
// 않으면 빈 문자열(배지 생략). 롤 라벨은 PHASE_ROLE_LABEL(role-layer.md §3 SSOT)에서 온다.
function buildPhaseRoleBadge(phase): string {
  if (phase === null || phase === undefined || phase === "") return "";
  const phaseNum = normalizeTicketPhaseNumber(phase);
  const role = roleLabelForPhase(phaseNum);
  return role ? ` · phase${phaseNum} · ${role}` : ` · phase${phaseNum}`;
}

export function getTicketGuide(kind, docsLanguage = "ko", resolveLanguage = (value) => value, normalizeDocsLanguage = (value) => value, context: Record<string, any> = {}) {
  return renderTicketDocMetaSurface(kind, {
    docsLanguage,
    resolveLanguage,
    normalizeDocsLanguage,
    cwd: context.cwd,
    policyRole: context.policyRole,
    template: context.template
  });
}

export function deriveTicketWorkflowStatus(meta: Record<string, any> = {}, fallbackStatus = "open") {
  const rawStatus = String(meta.status || fallbackStatus || "open").toLowerCase();
  const phase = normalizeTicketPhaseNumber(meta.phase || 1);
  if (TERMINAL_TICKET_STATUSES.has(rawStatus)) {
    return rawStatus;
  }
  if (phase >= 4) return "closed";
  // phase>=2 no longer implies "active": status stays "open" through execution.
  // Focus is tracked by activeTicketId, not by deriving active from phase.
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
