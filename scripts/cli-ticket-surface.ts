import { evidenceFlagsForEvidenceKey } from "./cli-ticket-evidence.js";

const GATE_TEXT = {
  blockedHead: {
    ko: "[승인 게이트 차단] 티켓 {id} 은 아직 실행에 진입할 수 없다.",
    en: "[APPROVAL GATE BLOCKED] Ticket {id} cannot enter execution yet.",
  },
  singlePass: {
    ko: "이것은 단일 통과 게이트다: 아래 비어 있는 슬롯을 모두 채운 뒤 제시된 명령 하나를 실행하라.",
    en: "This is a single-pass gate: satisfy every missing slot below, then run the one command shown.",
  },
  missingSlots: { ko: "비어 있는 슬롯:", en: "Missing slots:" },
  fillVia: { ko: "채우는 법", en: "fill via" },
  missingEvidence: { ko: "필요한 근거가 비어 있다", en: "required evidence is missing" },
  phase1Gaps: { ko: "Phase 1 본문 미비", en: "Phase 1 body gaps" },
  reasonCodes: { ko: "사유 코드", en: "Reason codes" },
  workspaceNote: {
    ko: "참고: 워크스페이스는 오직 --workspace(레지스트리)로만 해소된다. cwd 는 절대 쓰이지 않는다.",
    en: "NOTE: workspace is resolved ONLY from --workspace (registry); cwd is never used.",
  },
  workspaceRequired: {
    ko: "--workspace 를 빠뜨리면 에러가 나므로 모든 티켓 명령에 항상 붙여라.",
    en: "Omitting --workspace will error out, so always pass it on every ticket command.",
  },
  runAfterApproval: {
    ko: "사용자가 채팅에 승인을 입력한 뒤에만 실행하라 (승인/approved/yes/진행해):",
    en: "Run ONLY after the user types approval in chat (승인/approved/yes/진행해):",
  },
  noSelfApprove: {
    ko: "스스로 승인하지 마라(사용자의 채팅 승인 없이 --approval approved 를 실행하는 것),",
    en: "Do NOT self-approve (running --approval approved without the user's chat approval),",
  },
  noForceJump: {
    ko: "그리고 페이즈를 건너뛰도록 강제하지 마라. 승인되지 않은 이 Phase 1 티켓을 접어야 한다면 폐기하라:",
    en: "and do NOT force a phase jump. If this unapproved Phase 1 ticket should be abandoned, discard it:",
  },
  docmetaValidation: { ko: "DocMeta 검증", en: "DocMeta validation" },
  unknown: { ko: "미상", en: "UNKNOWN" },
} as const;

const SLOT_LABELS = {
  phase1Plan: { ko: "Phase 1 티켓 본문이 완성되었다", en: "Phase 1 ticket body is complete" },
  userApproval: { ko: "사용자가 검토된 티켓과 Phase 2 전이를 승인했다", en: "User approved the reviewed ticket and Phase 2 transition" },
  executionEvidence: { ko: "실행 근거가 있다", en: "Execution evidence is present" },
  verificationEvidence: { ko: "검증 근거가 있다", en: "Verification evidence is present" },
  debuggingDecision: { ko: "디버깅 결정이 있다", en: "Debugging decision is present" },
  completionEvidence: { ko: "완료 근거가 있다", en: "Completion evidence is present" },
  reopenDecision: { ko: "재개 결정이 있다", en: "Reopen decision is present" },
} as const;

function gateText(key: keyof typeof GATE_TEXT, lang = "ko") {
  const entry = GATE_TEXT[key];
  return lang === "en" ? entry.en : entry.ko;
}

export function renderTicketWorkflowGateFailure({ ticketId = "<ticket-id>", workspace = "", docmeta = {} as Record<string, any>, reasons = [], lang = "ko" }: Record<string, any> = {}) {
  const t = (key: keyof typeof GATE_TEXT) => gateText(key, lang);
  const missing = [...new Set([...(reasons || []), ...(docmeta.validation?.errors || [])])];
  const phase1Reasons = docmeta.slot_source_map?.phase1Plan?.errors || [];
  const lines = [
    t("blockedHead").replace("{id}", ticketId),
    t("singlePass"),
    "",
    t("missingSlots")
  ];

  for (const slot of Object.keys(docmeta.slots || {})) {
    if (docmeta.slots[slot]) continue;
    const flags = evidenceFlagsForEvidenceKey(slot);
    const flagHint = flags.length ? ` (${t("fillVia")}: ${flags.join(" ")})` : "";
    const label = SLOT_LABELS[slot] ? (lang === "en" ? SLOT_LABELS[slot].en : SLOT_LABELS[slot].ko) : t("missingEvidence");
    lines.push(`- ${slot}: ${label}${flagHint}`);
  }

  if (phase1Reasons.length > 0) {
    lines.push("");
    lines.push(`${t("phase1Gaps")}: ${phase1Reasons.join(", ")}`);
  }

  if (missing.length > 0) {
    lines.push(`${t("reasonCodes")}: ${missing.join(", ")}`);
  }

  lines.push("");
  lines.push(t("workspaceNote"));
  lines.push(t("workspaceRequired"));
  lines.push("");
  lines.push(t("runAfterApproval"));
  lines.push("```bash");
  lines.push(`deuk-agent-flow ticket move --id ${ticketId} --workspace ${workspace || "<workspace-id>"} --phase 2 --approval approved --non-interactive`);
  lines.push("```");
  lines.push("");
  lines.push(t("noSelfApprove"));
  lines.push(t("noForceJump"));
  lines.push("```bash");
  lines.push(`deuk-agent-flow ticket discard --id ${ticketId} --workspace ${workspace || "<workspace-id>"} --non-interactive`);
  lines.push("```");
  lines.push("");
  lines.push(`${t("docmetaValidation")}: ${docmeta.validation?.status || t("unknown")}`);
  return lines.join("\n");
}
