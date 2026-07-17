// #691 follow-up (design-driven-flow.md §6.0): 완주 판정은 "evidence[key]가 truthy냐"가
// 아니라 "이 evidence 키가 실제로 그 state의 서브 FSM을 완주시켰냐"로 한다. 이 모듈은
// evidence key(phase1Plan/userApproval/executionEvidence/...) → 콘텐츠 검증기의 SSOT
// 룩업 테이블이다. ticket-machine.ts의 guard가 여기를 직접 호출해 판정하므로, 이 판정
// 로직은 상류(cli-ticket-commands.ts)에서 미리 계산해 불린으로 넘기지 않는다 — 그러면
// "Boolean(evidence[key])"과 다를 바 없는 위장 게이트가 된다(§6.0 각주 경고).
//
// 이 모듈은 raw evidence(티켓 본문 텍스트, cwd, 전이 방향, opts 일부)를 입력받아 각 키의
// 완주 여부를 판정한다. cli-ticket-commands.ts는 이 raw 값을 모아 evidence 객체로 실어
// 나르는 오케스트레이션만 하고, 판정 자체는 하지 않는다(No-Fallback Gate: 판정 중복 금지).

import {
  isSubstantiveDecisionText,
  hasPhase2ExecutionEvidence,
  meetsDocsReflectedGate,
  getPhase1PlanBodyReasons,
  normalizePhase1PlanBodyHeadings
} from "./cli-ticket-evidence.js";
import { getCloseWorkflowReasons, getCloseSlotReasons, resolveTicketType, TICKET_TYPES } from "./cli-ticket-evidence-slots.js";
import { isWorkflowExecute } from "./cli-utils.js";

// evidence 입력 shape: guard가 evidence 객체에서 직접 읽는 raw 필드들. 각 키의 검증기는
// 이 shape의 부분집합만 사용한다(예: phase1Plan은 content만, userApproval은 approval류
// opts만). targetState는 evidence.__targetState로 실어, 어떤 방향 전이인지(phase2→3 vs
// phase3→4 등 evidenceKey가 같아도 판정이 갈리는 경우) 검증기가 알 수 있게 한다.
export interface TicketEvidenceInput {
  content?: string;      // 플래그가 병합된 티켓 본문 — 완주 판정의 정본 소스.
  cwd?: string;
  meta?: Record<string, any>;
  targetState?: string;
  reason?: string;       // --reason — debugging/reopen 결정 슬롯의 정본 입력.
  workflowMode?: string; // --workflow
  approval?: string;     // --approval
  // 사전 계산된 불린을 그대로 신뢰하는 경로는 두지 않는다(No-Fallback) — 있다면 무시된다.
  [key: string]: any;
}

function hasExplicitExecutionApprovalFromEvidence(evidence: TicketEvidenceInput) {
  // 정본 입력은 workflowMode(←--workflow)·approval(←--approval) 둘뿐(cli-utils.ts SSOT).
  // 둘 다 없으면 명시 승인이 없는 것 — 사전계산 별칭으로 우회하지 않는다.
  const hasAny = ["workflowMode", "approval"]
    .some(key => Object.prototype.hasOwnProperty.call(evidence, key));
  if (!hasAny) return false;
  return isWorkflowExecute(evidence) === true;
}

function phase1PlanComplete(evidence: TicketEvidenceInput) {
  const body = normalizePhase1PlanBodyHeadings(String(evidence.content || ""));
  return getPhase1PlanBodyReasons(body, { cwd: evidence.cwd }).length === 0;
}

function executionEvidenceComplete(evidence: TicketEvidenceInput) {
  const content = String(evidence.content || "");
  if (evidence.targetState === "phase3") {
    // #944/#951 (design-driven-flow.md §6.0.4.1): 완주 산출물은 티켓 종류에서 도출된다.
    // 코드 산출이 없는 종류(조사·문서)은 phase2→3에서 실행 증거(재현·검증·결과)를
    // 요구하지 않는다 — 그 완주 산출은 설계/분석 결과(getCloseWorkflowReasons)다.
    // 종류 미선언은 하위호환(신규-강제/구-면제): 종류 선언은 생성 경로에서 강제하고,
    // 이 기능 이전 티켓(type/character 없음)은 역사적 기본값(구현 종류=실행 증거 요구)으로
    // 처리한다 — 도입 전 동작을 보존해 진행 중 티켓이 갑자기 막히지 않게 한다(조용한
    // '오' 폴백이 아니라 관측된 동작 보존).
    const ticketType = resolveTicketType(evidence.meta || {});
    const requiresExecution = ticketType === null
      ? true
      : TICKET_TYPES[ticketType].requiresExecutionEvidence;
    if (requiresExecution) {
      return hasPhase2ExecutionEvidence(content) && meetsDocsReflectedGate(content, evidence.cwd);
    }
    // 비-구현 성격: 설계/분석 산출이 완주 증거다.
    return getCloseWorkflowReasons(evidence.meta || {}, content).length === 0;
  }
  return getCloseWorkflowReasons(evidence.meta || {}, content).length === 0;
}

function verificationEvidenceComplete(evidence: TicketEvidenceInput) {
  // 완주 판정은 본문(content)의 close 슬롯 충족만 본다. move 플래그(--execution-result/
  // --verification/…)는 게이트 판정 전에 mergeH2SectionsIntoBody로 content에 병합된다
  // (cli-ticket-commands.ts #808). #902: 이 슬롯은 phase3→4가 실제로 주입하는
  // EVIDENCE_SECTION_SLOTS.verificationEvidence(Execution Result/Verification/Residual
  // Risk/Follow-up Decision)다 — phase1 설계 섹션(Analysis/Direction)을 보는
  // getCloseWorkflowReasons를 재사용하면 그 전이가 채우지 못하는 슬롯을 요구하는
  // 위장 게이트가 된다(role-layer.md §3.0: 완주 슬롯은 designer 산출 하나에서 파생).
  // 과거 phase4 분기에 있던 code_design_mismatch 게이트(Design 섹션에 적힌 파일이 git
  // 변경목록에 있나 코드 대조)는 제거했다 — role-layer.md §3.1(코드 현상을 설계 판정에
  // 섞지 않는다)·design-driven-flow.md §6.0(출력을 코드로 대조해 판정하는 위장 게이트
  // 금지) 위반이었다. 설계↔구현 정합의 실질은 qa-verifier 롤이 프롬프트로 담당하고,
  // 게이트는 close 슬롯이 채워졌는지의 형식만 본다(role-layer.md §2).
  const content = String(evidence.content || "");
  return getCloseSlotReasons(content, "verificationEvidence").length === 0;
}

function completionEvidenceComplete(evidence: TicketEvidenceInput) {
  // #902: phase4→end 역시 자신이 주입하는 슬롯(EVIDENCE_SECTION_SLOTS.completionEvidence)
  // 만 본다 — verificationEvidenceComplete와 동일 근거.
  const content = String(evidence.content || "");
  return getCloseSlotReasons(content, "completionEvidence").length === 0;
}

function debuggingDecisionComplete(evidence: TicketEvidenceInput) {
  // 정본 입력은 --reason 하나다(전용 --debugging-decision 플래그는 없다, cli-args.ts).
  // evidence.reason이 그 값을 실어 나른다 — 폴백이 아니라 유일 입력 경로.
  if (evidence.targetState !== "phase2") return true;
  return isSubstantiveDecisionText(evidence.reason);
}

function reopenDecisionComplete(evidence: TicketEvidenceInput) {
  // 정본 입력은 --reason 하나다(전용 --reopen-decision 플래그는 없다, cli-args.ts).
  if (evidence.targetState !== "phase1") return true;
  return isSubstantiveDecisionText(evidence.reason);
}

// evidence key → 콘텐츠 완주 검증기. TICKET_WORKFLOW_EVIDENCE(ticket-workflow.ts)의 키와
// 1:1 대응하는 SSOT 룩업 테이블. 여기 없는 키는 완주 판정 불가 — No-Fallback Gate에 따라
// 조용히 통과시키지 않고 false로 막는다(미등록 키는 버그이지 관대 처리 대상이 아니다).
export const TICKET_EVIDENCE_VALIDATORS: Record<string, (evidence: TicketEvidenceInput) => boolean> = {
  phase1Plan: phase1PlanComplete,
  userApproval: hasExplicitExecutionApprovalFromEvidence,
  executionEvidence: executionEvidenceComplete,
  verificationEvidence: verificationEvidenceComplete,
  debuggingDecision: debuggingDecisionComplete,
  completionEvidence: completionEvidenceComplete,
  reopenDecision: reopenDecisionComplete
};

// 이 evidence key가 실제로 완주됐는지 판정한다. 미등록 키는 false(No-Fallback: 관대한
// 기본 통과를 두지 않는다 — 새 evidence key를 추가하면서 검증기를 안 붙이면 그 즉시
// 전이가 막혀 드러난다).
export function isTicketEvidenceKeySatisfied(key: string, evidence: TicketEvidenceInput = {}) {
  const validator = TICKET_EVIDENCE_VALIDATORS[key];
  if (!validator) return false;
  return validator(evidence);
}
