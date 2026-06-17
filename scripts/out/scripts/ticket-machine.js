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
import { TICKET_WORKFLOW, TICKET_WORKFLOW_EVIDENCE } from "./ticket-workflow.js";
export function eventForTarget(targetStateName) {
    return `GO_${targetStateName}`;
}
// TICKET_WORKFLOW.states → XState states 정의. 각 전이는 GO_<target> 이벤트 + guard.
function buildMachineStates() {
    const states = {};
    for (const [name, node] of Object.entries(TICKET_WORKFLOW.states)) {
        const n = node;
        const on = {};
        for (const target of n.transitions || []) {
            const evidenceKeys = n.requiredEvidence?.[target] || [];
            on[eventForTarget(target)] = {
                target,
                // guard: 이 전이가 요구하는 증거가 evidence 입력에 모두 있어야 통과.
                guard: ({ event }) => {
                    const evidence = event?.evidence || {};
                    return evidenceKeys.every(key => Boolean(evidence[key]));
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
        return { allowed: true, to: targetStateName, missingEvidence: [] };
    }
    const node = TICKET_WORKFLOW.states[fromStateName];
    if (!node) {
        return { allowed: false, reason: "unknown_state", to: fromStateName, missingEvidence: [] };
    }
    const allowedTargets = node.transitions || [];
    if (!allowedTargets.includes(targetStateName)) {
        // 미정의 전이 — 구멍 차단.
        return { allowed: false, reason: "transition_not_declared", to: fromStateName, missingEvidence: [] };
    }
    // 증거 guard 검증 (XState transition으로).
    const snapshot = snapshotForState(fromStateName);
    const [next] = transition(getMachine(), snapshot, {
        type: eventForTarget(targetStateName),
        evidence
    });
    const reached = String(next.value) === targetStateName;
    if (reached) {
        return { allowed: true, to: targetStateName, missingEvidence: [] };
    }
    // guard가 막음 — 어떤 증거가 비었는지 산출.
    const evidenceKeys = node.requiredEvidence?.[targetStateName] || [];
    const missingEvidence = evidenceKeys
        .filter(key => !evidence[key])
        .map(key => TICKET_WORKFLOW_EVIDENCE[key]?.missingReason || `${key}_missing`);
    return { allowed: false, reason: "guard_blocked", to: fromStateName, missingEvidence };
}
//# sourceMappingURL=ticket-machine.js.map