
import { createMachine,initialTransition,transition } from "xstate";
import { diagnoseExecutionEvidence,diagnoseVerificationEvidence } from "./cli-ticket-evidence.js";
import { isTicketEvidenceKeySatisfied } from "./ticket-evidence-validators.js";
import { TICKET_WORKFLOW,TICKET_WORKFLOW_EVIDENCE,roleLabelForPhase,skillsForStateName } from "./ticket-workflow.js";

const EVIDENCE_DIAGNOSERS: Record<string, (content: string, cwd?: string) => string[]> = {
  executionEvidence: diagnoseExecutionEvidence,
  verificationEvidence: diagnoseVerificationEvidence,
  completionEvidence: diagnoseVerificationEvidence
};

export function eventForTarget(targetStateName) {
  return `GO_${targetStateName}`;
}

export function roleForStateName(stateName): string {
  const node = TICKET_WORKFLOW.states[stateName] as Record<string, any> | undefined;
  return node?.phase ? roleLabelForPhase(node.phase) : "";
}

function buildMachineStates() {
  const states: Record<string, any> = {};
  for (const [name, node] of Object.entries(TICKET_WORKFLOW.states)) {
    const n = node as Record<string, any>;
    const on: Record<string, any> = {};
    for (const target of n.transitions || []) {
      const evidenceKeys = n.requiredEvidence?.[target] || [];
      on[eventForTarget(target)] = {
        target,
        guard: ({ event }) => {
          const evidence = { ...(event?.evidence || {}), targetState: target };
          return evidenceKeys.every(key => isTicketEvidenceKeySatisfied(key, evidence));
        }
      };
    }
    states[name] = (n.transitions || []).length === 0
      ? { type: "final" }
      : { on };
  }
  return states;
}

let _machine = null;
function getMachine() {
  if (!_machine) {
    _machine = createMachine({
      id: "ticket-flow",
      initial: "phase1",
      states: buildMachineStates()
    });
  }
  return _machine;
}

function snapshotForState(stateName) {
  const [init] = initialTransition(getMachine());
  return { ...init, value: stateName };
}

export function machineTransition(fromStateName, targetStateName, evidence = {}) {
  if (fromStateName === targetStateName) {
    return { allowed: true, to: targetStateName, role: roleForStateName(targetStateName), missingEvidence: [] };
  }
  const node = TICKET_WORKFLOW.states[fromStateName];
  if (!node) {
    return { allowed: false, reason: "unknown_state", to: fromStateName, role: roleForStateName(fromStateName), missingEvidence: [] };
  }
  const allowedTargets = node.transitions || [];
  if (!allowedTargets.includes(targetStateName)) {
    return { allowed: false, reason: "transition_not_declared", to: fromStateName, role: roleForStateName(fromStateName), missingEvidence: [] };
  }
  const snapshot = snapshotForState(fromStateName);
  const [next] = transition(getMachine(), snapshot, {
    type: eventForTarget(targetStateName),
    evidence
  } as any);
  const reached = String(next.value) === targetStateName;
  if (reached) {
    return {
      allowed: true,
      to: targetStateName,
      role: roleForStateName(targetStateName),
      missingEvidence: [],
      skills: skillsForStateName(targetStateName)
    };
  }
  const evidenceKeys = node.requiredEvidence?.[targetStateName] || [];
  const evidenceForMissingCheck = { ...evidence, targetState: targetStateName };
  const missingEvidence = evidenceKeys
    .filter(key => !isTicketEvidenceKeySatisfied(key, evidenceForMissingCheck))
    .flatMap(key => {
      const ev = evidence as Record<string, any>;
      const diagnose = EVIDENCE_DIAGNOSERS[key];
      if (diagnose) {
        const detail = diagnose(String(ev.content || ""), ev.workspaceRoot || ev.cwd);
        if (detail.length > 0) return detail;
      }
      return [TICKET_WORKFLOW_EVIDENCE[key]?.missingReason || `${key}_missing`];
    });
  return { allowed: false, reason: "guard_blocked", to: fromStateName, role: roleForStateName(fromStateName), missingEvidence };
}
