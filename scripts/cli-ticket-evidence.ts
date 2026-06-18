import { CliOpts, toSnakeCaseKey } from "./cli-utils.js";

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
  "Scope & Approval",
  "Plan",
  "Analysis",
  "Direction"
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

export function resolveTicketType(_opts) {
  return "standard";
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
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
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
  ["apc", "Scope & Approval"],
  ["agent permission contract", "Scope & Approval"],
  ["agent permission contract (apc)", "Scope & Approval"],
  ["scope", "Scope & Approval"],
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
    const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) return line;
    const normalized = PHASE1_HEADING_ALIASES.get(match[1].trim().toLowerCase());
    return normalized ? `## ${normalized}` : line;
  }).join("\n");
}

export function extractMarkdownSection(content, heading) {
  return parseMarkdownH2Sections(content).get(String(heading || "").trim()) || "";
}

function extractMarkdownSectionByAliases(content, aliases) {
  const sections = parseMarkdownH2Sections(content);
  for (const alias of aliases) {
    const value = sections.get(String(alias || "").trim());
    if (value !== undefined) return value;
  }
  return "";
}

function hasSubstantiveSectionContent(text, scaffolds = []) {
  const src = String(text || "").trim();
  if (!src || hasPlaceholderTokens(src)) return false;
  const normalized = src.replace(/\s+/g, " ");
  return !scaffolds.some(phrase => normalized.includes(phrase));
}

function hasApcMarker(text, marker) {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const markerPattern = new RegExp(`^\\s*(?:#{1,6}\\s+)?${escapedMarker}(?:\\s|$)`);
  return String(text || "").split("\n").some(line => markerPattern.test(line));
}

function getApcContentWithoutMarkers(text) {
  return String(text || "")
    .split("\n")
    .map(line => {
      for (const { marker } of REQUIRED_APC_MARKERS) {
        const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const markerPattern = new RegExp(`^\\s*(?:#{1,6}\\s+)?${escapedMarker}\\s*`);
        if (markerPattern.test(line)) return line.replace(markerPattern, "");
      }
      return line;
    })
    .join("\n")
    .trim();
}

function getMissingApcFields(text) {
  return REQUIRED_APC_MARKERS
    .filter(({ marker }) => !hasApcMarker(text, marker))
    .map(field => field.name);
}

export function getPhase1PlanBodyReasons(body, opts: CliOpts = {}) {
  const content = String(body || "");
  const sections = parseMarkdownH2Sections(content);
  const reasons = [];

  for (const sectionName of ["Scope & Approval", ...dataSectionsForType()]) {
    const sectionKey = toSnakeCaseKey(sectionName);
    if (!sections.has(sectionName)) {
      reasons.push(`${sectionKey}_missing`);
      continue;
    }
    if (!hasSubstantiveSectionContent(sections.get(sectionName), [])) {
      reasons.push(`${sectionKey}_incomplete`);
    }
  }

  return reasons;
}

export function phase1SectionsForType(_type = "") {
  return ["Agent Permission Contract (APC)", ...dataSectionsForType()];
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

const PHASE2_EXECUTION_SLOT_HEADINGS = [
  "실행 슬롯",
  "Execution Slots",
  "Execution",
];

const PHASE2_EXECUTION_SLOT_FIELDS = [
  /files\s+changed\s*:/i,
  /commands?\s+run\s*:/i,
  /interim\s+evidence\s*:/i,
  /approved\s+scope\s*:/i,
];

export function hasPhase2ExecutionEvidence(content) {
  const body = String(content || "");
  // Check any phase2 execution slot heading section has non-empty content
  for (const heading of PHASE2_EXECUTION_SLOT_HEADINGS) {
    const section = extractMarkdownSection(body, heading);
    if (section) {
      const hasFilledField = PHASE2_EXECUTION_SLOT_FIELDS.some(pattern => {
        const match = section.match(new RegExp(pattern.source + "\\s*(.+)", "i"));
        return match && match[1] && match[1].trim().length > 0;
      });
      if (hasFilledField) return true;
    }
  }
  // Fallback: any substantive content in Analysis or Direction (for bug-fix style tickets)
  return hasSubstantiveSectionContent(extractMarkdownSection(body, "Analysis"), [])
    || hasSubstantiveSectionContent(extractMarkdownSection(body, "Problem Analysis"), []);
}

// Compact, .md-aware slot status so `ticket use` shows what is already filled
// vs. still empty, plus affected files — preventing the agent from re-reading the
// ticket .md / find-grepping the tree to reconstruct context. Output stays terse.
const SLOT_STATUS_SECTIONS_BY_PHASE = {
  1: ["Scope & Approval", "Plan", "Analysis", "Direction"],
  2: ["Scope & Approval", "Plan", "Analysis", "Direction"],
  3: ["Analysis", "Direction", "Execution Result", "Verification"],
  4: ["Execution Result", "Verification", "Residual Risk", "Follow-up Decision"]
};

// Pull file-ish tokens (path/with/slashes or name.ext) from the sections most
// likely to record affected files, capped so the line never sprawls.
function extractAffectedFiles(content, limit = 6) {
  const src = [
    extractMarkdownSection(content, "Execution Result"),
    extractMarkdownSection(content, "Scope & Approval"),
    extractMarkdownSection(content, "Plan")
  ].join("\n");
  const matches = src.match(/[\w./-]+\.[A-Za-z][\w]{0,4}\b/g) || [];
  const seen = [];
  for (const m of matches) {
    const f = m.replace(/^[-*\s]+/, "");
    if (!seen.includes(f)) seen.push(f);
    if (seen.length >= limit) break;
  }
  return seen;
}

export function buildSlotStatusSummary(content, phase = 2) {
  const sections = SLOT_STATUS_SECTIONS_BY_PHASE[phase >= 4 ? 4 : phase] || SLOT_STATUS_SECTIONS_BY_PHASE[2];
  const filled = [];
  const empty = [];
  for (const name of sections) {
    if (hasSubstantiveSectionContent(extractMarkdownSection(content, name), [])) filled.push(name);
    else empty.push(name);
  }
  const files = extractAffectedFiles(content);
  const lines = [];
  lines.push(`[filled] ${filled.length ? filled.join(" · ") : "(none)"}`);
  lines.push(`[empty]  ${empty.length ? empty.join(" · ") : "(none)"}`);
  if (files.length) lines.push(`[files]  ${files.join(", ")}`);
  return lines.join("\n");
}

export function getCloseWorkflowReasons(meta, content) {
  const reasons = [];
  const analysisScaffolds = ANALYSIS_DESIGN_SECTION_REQUIREMENTS[0].scaffolds;
  const directionScaffolds = ANALYSIS_DESIGN_SECTION_REQUIREMENTS[1].scaffolds;
  // Accept both canonical ("Analysis") and legacy ("Problem Analysis") heading names.
  const analysisText = extractMarkdownSection(content, "Analysis")
    || extractMarkdownSection(content, "Problem Analysis");
  if (!hasSubstantiveSectionContent(analysisText, analysisScaffolds)) {
    reasons.push("problem_analysis_missing");
  }

  // Accept both canonical ("Direction") and legacy ("Improvement Direction") heading names.
  const directionText = extractMarkdownSection(content, "Direction")
    || extractMarkdownSection(content, "Improvement Direction");
  if (!hasSubstantiveSectionContent(directionText, directionScaffolds)
    && !hasSubstantiveFollowUpDecision(content)) {
    reasons.push("follow_up_decision_missing");
  }

  return reasons;
}
