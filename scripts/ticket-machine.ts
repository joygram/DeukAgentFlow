// #691: XState 기반 티켓 워크플로 상태머신.
//
// LangGraph 형태 전환의 핵심 — 직접 구현한 전이 분기(미정의 전이 허용·guard 우회 같은
// 구멍)를 검증된 상태머신으로 대체한다. 머신 정의는 TICKET_WORKFLOW(SSOT)에서 동적으로
// 빌드하므로 노드/전이를 두 곳에 중복 선언하지 않는다.
//
// 모델: actor/런타임 없이 XState v5의 순수 transition()만 사용한다. 에이전트(Claude Code)가
// 곧 런타임이고, CLI는 stateless다 — 매 호출마다 .md에서 현재 state를 복원해 transition을
// 한 스텝 계산하고 결과를 .md에 기록한다. 따라서 actor 영속화가 필요 없다.
//
// 이벤트 모델: phase 전이는 GO_<target> 이벤트(예: GO_phase2, GO_end)로 표현한다.
// guard는 전이별 requiredEvidence를 evidence 입력으로 검증한다 — 미충족 시 XState가
// 전이를 거부하므로 증거 우회 구멍이 구조적으로 막힌다.

import { createMachine, transition, initialTransition } from "xstate";
import { TICKET_WORKFLOW, TICKET_WORKFLOW_EVIDENCE, roleLabelForPhase } from "./ticket-workflow.js";
// #691 follow-up (design-driven-flow.md §6.0): guard는 더 이상 evidence[key]의 존재("텍스트
// 존재 검사")를 보지 않는다. 대신 evidence key별 콘텐츠 완주 검증기(raw 티켓 본문/cwd 대조,
// code↔design 대조 포함)를 직접 호출해 "이 state의 서브 FSM이 완주했나"를 판정한다.
// 판정 로직은 이 룩업 테이블 하나에 SSOT로 있고, 호출측(cli-ticket-commands.ts)은 raw
// content/cwd만 모아 evidence 객체로 넘길 뿐 판정을 미리 하지 않는다.
import { isTicketEvidenceKeySatisfied } from "./ticket-evidence-validators.js";
import { diagnoseExecutionEvidence } from "./cli-ticket-evidence.js";

export function eventForTarget(targetStateName) {
  return `GO_${targetStateName}`;
}

// design-driven-flow.md §6.0 "롤=서브FSM 등식"의 귀결(2): 전이는 다음 state와 함께
// 다음 롤을 산출한다. state 이름(phase1~4/start/end 등)에서 그 노드의 phase를 얻어
// PHASE_ROLE_LABEL(SSOT)로 롤 라벨을 유도한다. 노드에 phase가 없으면(entry 계열) 빈 문자열.
export function roleForStateName(stateName): string {
  const node = TICKET_WORKFLOW.states[stateName] as Record<string, any> | undefined;
  return node?.phase ? roleLabelForPhase(node.phase) : "";
}

// TICKET_WORKFLOW.states → XState states 정의. 각 전이는 GO_<target> 이벤트 + guard.
function buildMachineStates() {
  const states: Record<string, any> = {};
  for (const [name, node] of Object.entries(TICKET_WORKFLOW.states)) {
    const n = node as Record<string, any>;
    const on: Record<string, any> = {};
    for (const target of n.transitions || []) {
      const evidenceKeys = n.requiredEvidence?.[target] || [];
      on[eventForTarget(target)] = {
        target,
        // guard: 이 전이가 요구하는 각 evidence key의 서브 FSM이 실제로 완주했는지, raw
        // evidence(본문 텍스트/cwd 등)를 콘텐츠 검증기에 직접 통과시켜 판정한다.
        // targetState를 실어, 같은 evidence key라도 전이 방향에 따라 판정이 갈리는
        // 검증기(예: executionEvidence의 phase2→3 vs phase3→end)가 방향을 알 수 있게 한다.
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

// 머신은 SSOT(TICKET_WORKFLOW)에서 빌드한다. ESM 순환 import 때문에 모듈 로드 시점엔
// TICKET_WORKFLOW가 아직 초기화 전일 수 있으므로 lazy로 첫 호출 때 빌드한다. initial은
// 의미 없으므로(매 호출마다 현재 state를 명시 복원) phase1로 둔다.
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

// 현재 state 이름으로 머신 스냅샷을 복원한다(.md phase → state name은 호출측에서 결정).
function snapshotForState(stateName) {
  const [init] = initialTransition(getMachine());
  // XState v5: 스냅샷의 value를 직접 지정해 임의 state에서 출발시킨다.
  return { ...init, value: stateName };
}

// 전이 결과: { allowed, blocked, reason, to } — 미정의 전이/guard 미충족이면 allowed=false.
// missingEvidence가 비어있지 않으면 guard 차단(증거 부족), to가 그대로면 미정의 전이.
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
    // 미정의 전이 — 구멍 차단.
    return { allowed: false, reason: "transition_not_declared", to: fromStateName, role: roleForStateName(fromStateName), missingEvidence: [] };
  }
  // 증거 guard 검증 (XState transition으로).
  const snapshot = snapshotForState(fromStateName);
  const [next] = transition(getMachine(), snapshot, {
    type: eventForTarget(targetStateName),
    evidence
  } as any);
  const reached = String(next.value) === targetStateName;
  if (reached) {
    // §6.0 귀결(2): 전이 성공 시 다음 롤을 함께 산출한다.
    return { allowed: true, to: targetStateName, role: roleForStateName(targetStateName), missingEvidence: [] };
  }
  // guard가 막음 — 어떤 증거가 미완주인지 콘텐츠 검증기로 다시 판정해 산출한다(guard와
  // 동일한 판정 기준을 재사용 — 여기서 !evidence[key]로 되돌아가면 표면은 통과해도 내부는
  // 위장 게이트로 회귀한다).
  const evidenceKeys = node.requiredEvidence?.[targetStateName] || [];
  const evidenceForMissingCheck = { ...evidence, targetState: targetStateName };
  const missingEvidence = evidenceKeys
    .filter(key => !isTicketEvidenceKeySatisfied(key, evidenceForMissingCheck))
    .flatMap(key => {
      // §6.0.4: executionEvidence(phase2→3)는 두 하위조건의 AND라 단일 사유로는 무엇이
      // 막혔는지 알 수 없다 — 진단 함수로 어느 조건이 왜 막혔는지 구체 문장을 낸다.
      if (key === "executionEvidence" && targetStateName === "phase3") {
        const ev = evidence as Record<string, any>;
        const detail = diagnoseExecutionEvidence(String(ev.content || ""), ev.cwd);
        if (detail.length > 0) return detail;
      }
      return [TICKET_WORKFLOW_EVIDENCE[key]?.missingReason || `${key}_missing`];
    });
  return { allowed: false, reason: "guard_blocked", to: fromStateName, role: roleForStateName(fromStateName), missingEvidence };
}
