
import { getCloseSlotReasons,getCloseWorkflowReasons,resolveTicketType,TICKET_TYPES } from "./cli-ticket-evidence-slots.js";
import {
getPhase1PlanBodyReasons,
getVerificationCodeDesignMismatchReasons,
hasPhase2ExecutionEvidence,
isSubstantiveDecisionText,
meetsDocsReflectedGate,
normalizePhase1PlanBodyHeadings
} from "./cli-ticket-evidence.js";

export interface TicketEvidenceInput {
  content?: string;      // 플래그가 병합된 티켓 본문 — 완주 판정의 정본 소스.
  cwd?: string;
  meta?: Record<string, any>;
  targetState?: string;
  reason?: string;       // --reason — debugging/reopen 결정 슬롯의 정본 입력.
  workflowMode?: string; // --workflow
  approval?: string;     // --approval
  [key: string]: any;
}

function phase1PlanComplete(evidence: TicketEvidenceInput) {
  const body = normalizePhase1PlanBodyHeadings(String(evidence.content || ""));
  return getPhase1PlanBodyReasons(body, { workspaceRoot: evidence.workspaceRoot }).length === 0;
}

function executionEvidenceComplete(evidence: TicketEvidenceInput) {
  const content = String(evidence.content || "");
  if (evidence.targetState === "phase3") {
    const ticketType = resolveTicketType(evidence.meta || {});
    const requiresExecution = ticketType === null
      ? true
      : TICKET_TYPES[ticketType].requiresExecutionEvidence;
    if (requiresExecution) {
      return hasPhase2ExecutionEvidence(content) && meetsDocsReflectedGate(content, evidence.cwd);
    }
    return getCloseWorkflowReasons(evidence.meta || {}, content).length === 0;
  }
  return getCloseWorkflowReasons(evidence.meta || {}, content).length === 0;
}

function verificationEvidenceComplete(evidence: TicketEvidenceInput) {
  const content = String(evidence.content || "");
  return getCloseSlotReasons(content, "verificationEvidence").length === 0
    && getVerificationCodeDesignMismatchReasons(content, evidence.workspaceRoot || evidence.cwd).length === 0;
}

function completionEvidenceComplete(evidence: TicketEvidenceInput) {
  const content = String(evidence.content || "");
  return getCloseSlotReasons(content, "completionEvidence").length === 0;
}

function debuggingDecisionComplete(evidence: TicketEvidenceInput) {
  if (evidence.targetState !== "phase2") return true;
  return isSubstantiveDecisionText(evidence.reason);
}

function reopenDecisionComplete(evidence: TicketEvidenceInput) {
  if (evidence.targetState !== "phase1") return true;
  return isSubstantiveDecisionText(evidence.reason);
}

export const TICKET_EVIDENCE_VALIDATORS: Record<string, (evidence: TicketEvidenceInput) => boolean> = {
  phase1Plan: phase1PlanComplete,
  executionEvidence: executionEvidenceComplete,
  verificationEvidence: verificationEvidenceComplete,
  debuggingDecision: debuggingDecisionComplete,
  completionEvidence: completionEvidenceComplete,
  reopenDecision: reopenDecisionComplete
};

export function isTicketEvidenceKeySatisfied(key: string, evidence: TicketEvidenceInput = {}) {
  const validator = TICKET_EVIDENCE_VALIDATORS[key];
  if (!validator) return false;
  return validator(evidence);
}
