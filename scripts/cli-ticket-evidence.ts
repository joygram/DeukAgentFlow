import { parseHeading,parseHeadingAtDepth } from "./markdown-headings.js";
import {
getCodeDesignMismatchPaths,
getCodeDesignMismatchReasons,
hasCommandOrOutputSignal,
isDocsReflectedVerified,
isSubstantiveDecisionText,
isSubstantiveExecutionText
} from "./cli-ticket-evidence-quality.js";
import { EVIDENCE_SECTION_SLOTS,evidenceFlagForSlotHeading } from "./cli-ticket-evidence-slots.js";
import { CliOpts } from "./cli-utils.js";

export function hasPlaceholderTokens(text) {
  const lines = String(text || "")
    .split("\n")
    .map(line => line.trim().toLowerCase())
    .filter(Boolean);

  return lines.some(line => {
    const normalized = line
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .trim();
    return /^\[(?:add|fill)[^\]]*\]$/.test(normalized)
      || /^<[^>]*(?:placeholder|todo|tbd|fill|add)[^>]*>$/.test(normalized)
      || /^(?:placeholder|todo|tbd)$/.test(normalized);
  });
}

export const ANALYSIS_DESIGN_SECTION_REQUIREMENTS = [
  {
    section: "Analysis",
    reason: "analysis_missing",
    scaffolds: [
      "Record root-cause analysis, relevant file:line evidence, and hypotheses here."
    ]
  },
  {
    section: "Direction",
    reason: "direction_missing",
    scaffolds: [
      "Record the proposed fix direction or follow-up design path."
    ]
  }
];

export const REQUIRED_PHASE1_SECTIONS = [
  "Scope",
  "Plan",
  "Analysis",
  "Direction"
];

export const PHASE1_DESIGN_ENV_SECTIONS = [
  "Design",
  "Environment"
];

export const REQUIRED_APC_MARKERS = [];

const PHASE1_DATA_SECTIONS = [
  "Plan",
  "Analysis",
  "Direction"
];

function dataSectionsForType(_type = "") {
  return [...PHASE1_DATA_SECTIONS];
}

const FOLLOW_UP_DECISION_NO_FOLLOW_UP_PATTERNS = [
  /\bno[- ]follow[- ]up\b/i,
  /\bfollow[- ]up\s*:\s*none\b/i,
  /\bno further action\b/i,
  /\bnone required\b/i,
  /후속(?:\s+작업)?\s*(?:없음|불필요)/,
  /추가(?:\s+작업)?\s*(?:없음|불필요)/
];

export function parseMarkdownH2Sections(content) {
  const lines = String(content || "").split("\n");
  const sections = new Map();
  let currentHeading = "";
  let buffer = [];

  const flush = () => {
    if (!currentHeading) return;
    sections.set(currentHeading, buffer.join("\n").trim());
  };

  for (const line of lines) {
    const headingMatch = parseHeadingAtDepth(line, 2);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch.text;
      buffer = [];
      continue;
    }
    if (currentHeading) {
      buffer.push(line);
    }
  }

  flush();
  return sections;
}

const PHASE1_HEADING_ALIASES = new Map([
  ["apc", "Scope"],
  ["agent permission contract", "Scope"],
  ["agent permission contract (apc)", "Scope"],
  ["scope & approval", "Scope"],
  ["compact plan", "Plan"],
  ["problem analysis", "Analysis"],
  ["source observations", "Analysis"],
  ["cause hypotheses", "Analysis"],
  ["audit evidence", "Analysis"],
  ["improvement direction", "Direction"],
  ...REQUIRED_PHASE1_SECTIONS.map(section => [section.toLowerCase(), section] as [string, string])
]);

export function normalizePhase1PlanBodyHeadings(body) {
  return String(body || "").split("\n").map((line) => {
    const match = parseHeading(line, true);
    if (!match) return line;
    const normalized = PHASE1_HEADING_ALIASES.get(match.text.toLowerCase());
    return normalized ? `## ${normalized}` : line;
  }).join("\n");
}

export function extractMarkdownSection(content, heading) {
  return parseMarkdownH2Sections(content).get(String(heading || "").trim()) || "";
}

export function hasSubstantiveSectionContent(text, scaffolds = []) {
  const src = String(text || "").trim();
  if (!src || hasPlaceholderTokens(src)) return false;
  const normalized = src.replace(/\s+/g, " ");
  return !scaffolds.some(phrase => normalized.includes(phrase));
}

const UNFILLED_PLACEHOLDER_RE = /\{\{([^}]*)\}\}/g;

export function getUnfilledPlaceholders(body) {
  const found = [];
  let m;
  UNFILLED_PLACEHOLDER_RE.lastIndex = 0;
  while ((m = UNFILLED_PLACEHOLDER_RE.exec(String(body || ""))) !== null) {
    found.push(m[1].trim());
  }
  return found;
}

export function getPhase1PlanBodyReasons(body, _opts: CliOpts = {}) {
  const unfilled = getUnfilledPlaceholders(body);
  return unfilled.map(hint => {
    const label = hint.split(/[:.]/)[0].trim().slice(0, 40) || "placeholder";
    return `unfilled_placeholder: ${label}`;
  });
}

export function phase1SectionsForType(_type = "") {
  return [REQUIRED_PHASE1_SECTIONS[0], ...dataSectionsForType()];
}

export function getAnalysisDesignIncompleteReasons(meta, content) {
  const reasons = [];
  for (const requirement of ANALYSIS_DESIGN_SECTION_REQUIREMENTS) {
    if (!hasSubstantiveSectionContent(extractMarkdownSection(content, requirement.section), requirement.scaffolds)) {
      reasons.push(requirement.reason);
    }
  }

  return reasons;
}

export function hasSubstantiveFollowUpDecision(content) {
  return hasSubstantiveSectionContent(extractMarkdownSection(content, "Follow-up Decision"), []);
}

export function followUpDecisionMeansNoFollowUp(content) {
  const text = extractMarkdownSection(content, "Follow-up Decision");
  if (!hasSubstantiveSectionContent(text, [])) return false;
  return FOLLOW_UP_DECISION_NO_FOLLOW_UP_PATTERNS.some(pattern => pattern.test(text));
}

export function hasTicketCompletionEvidence(content) {
  return hasSubstantiveSectionContent(extractMarkdownSection(content, "Completion Report"), [])
    || hasSubstantiveSectionContent(extractMarkdownSection(content, "Verification Outcome"), [])
    || followUpDecisionMeansNoFollowUp(content);
}

const COMMAND_EVIDENCE_HEADINGS = new Set(["Verification Command", "Result"]);

function phase2ExecutionEvidenceHeadings() {
  return EVIDENCE_SECTION_SLOTS.executionEvidence
    .map(slot => slot.heading)
    .filter(heading => heading !== "Docs Reflected");
}

export function hasPhase2ExecutionEvidence(content) {
  const body = String(content || "");
  for (const heading of phase2ExecutionEvidenceHeadings()) {
    const text = extractMarkdownSection(body, heading);
    if (!hasSubstantiveSectionContent(text, [])) continue;
    if (COMMAND_EVIDENCE_HEADINGS.has(heading) && !hasCommandOrOutputSignal(text)) continue;
    return true;
  }
  return false;
}

export function isNewSchemaTicket(content) {
  const sections = parseMarkdownH2Sections(String(content || ""));
  return sections.has(PHASE1_DESIGN_ENV_SECTIONS[0]); // "Design"
}

export function hasDocsReflected(content) {
  return hasSubstantiveSectionContent(
    extractMarkdownSection(String(content || ""), "Docs Reflected"),
    []
  );
}

export function hasVerifiedDocsReflected(content, workspaceRoot) {
  if (!hasDocsReflected(content)) return false;
  const docsReflectedText = extractMarkdownSection(String(content || ""), "Docs Reflected");
  return isDocsReflectedVerified(workspaceRoot, docsReflectedText);
}

export function meetsDocsReflectedGate(content, workspaceRoot = "") {
  if (!isNewSchemaTicket(content)) return true;
  return hasVerifiedDocsReflected(content, workspaceRoot);
}

export function getVerificationCodeDesignMismatchReasons(content, workspaceRoot) {
  return getCodeDesignMismatchReasons(content, workspaceRoot);
}

export function diagnoseVerificationEvidence(content, cwd = ""): string[] {
  const body = String(content || "");
  const reasons: string[] = [];
  const emptySlots = EVIDENCE_SECTION_SLOTS.verificationEvidence
    .filter(({ heading }) => !hasSubstantiveSectionContent(extractMarkdownSection(body, heading), []))
    .map(({ heading }) => `${heading}(${evidenceFlagForSlotHeading("phase4", heading)})`);
  if (emptySlots.length > 0) {
    reasons.push(
      `검증 증거 슬롯이 비었거나 부실합니다 — ${emptySlots.join(" ")}을 실질 내용으로 채우세요.`
    );
  }
  for (const path of getCodeDesignMismatchPaths(body, cwd)) {
    reasons.push(
      `Scope/Design이 인용한 '${path}'를 워크스페이스에서 찾을 수 없습니다 — 파일명만 적지 말고 저장소 기준 실재 경로를 적으세요(예: docs/internal/architecture/${path}).`
    );
  }
  return reasons;
}

export function diagnoseExecutionEvidence(content, cwd = ""): string[] {
  const body = String(content || "");
  const reasons: string[] = [];
  if (!hasPhase2ExecutionEvidence(body)) {
    reasons.push(
      "실행 증거 슬롯이 비었거나 부실합니다 — --reproduction(재현 조건) --verification-command(실제 실행한 명령) --result(그 명령의 실제 출력)을 실질 내용으로 채우세요. 플래그 이름이 아니라 '무엇을 돌려 무엇이 나왔는지'가 실려야 합니다."
    );
  }
  if (isNewSchemaTicket(body) && !hasVerifiedDocsReflected(body, cwd)) {
    if (!hasDocsReflected(body)) {
      reasons.push(
        "Docs Reflected가 비었습니다 — --docs-reflected에 이 변경으로 실제 고친 설계/분석 문서 경로를 적으세요(신규 스키마 티켓 필수)."
      );
    } else {
      reasons.push(
        "Docs Reflected에 적은 문서가 실제로 확인되지 않습니다 — 언급한 문서 경로가 git 변경 목록에 있거나 저장소에 존재해야 통과합니다. 문장만 적지 말고 실제 고친 문서의 실재 경로를 적으세요(위장 통과 방지)."
      );
    }
  }
  return reasons;
}

export {
buildEvidenceSectionsForTransition,buildRequiredFlagsGuideText,buildSlotStatusSummary,DECISION_EVIDENCE_FLAGS,evidenceFlagForSlotHeading,evidenceFlagsForEvidenceKey,getCloseWorkflowReasons,getEvidenceFlagSpecsForTargetState,getEvidenceSlotFlagSpecs,mergeH2SectionsIntoBody,resolveTicketType,
TICKET_TYPES
} from "./cli-ticket-evidence-slots.js";
export { EVIDENCE_SECTION_SLOTS,isSubstantiveDecisionText,isSubstantiveExecutionText };
