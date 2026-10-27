import { parseHeadingAtDepth } from "./markdown-headings.js";
import {
ANALYSIS_DESIGN_SECTION_REQUIREMENTS,
REQUIRED_PHASE1_SECTIONS,
extractMarkdownSection,
hasSubstantiveFollowUpDecision,
hasSubstantiveSectionContent,
parseMarkdownH2Sections
} from "./cli-ticket-evidence.js";

export const EVIDENCE_SECTION_SLOTS = {
  executionEvidence: [
    { optsKey: "reproduction", heading: "Reproduction" },
    { optsKey: "verificationCommand", heading: "Verification Command" },
    { optsKey: "result", heading: "Result" },
    { optsKey: "docsReflected", heading: "Docs Reflected" },
    { optsKey: "remainingRisk", heading: "Remaining Risk" }
  ],
  analysisEvidence: [
    { optsKey: "analysis", heading: "Analysis" },
    { optsKey: "direction", heading: "Direction" }
  ],
  verificationEvidence: [
    { optsKey: "executionResult", heading: "Execution Result" },
    { optsKey: "verification", heading: "Verification" },
    { optsKey: "residualRisk", heading: "Residual Risk" },
    { optsKey: "followUp", heading: "Follow-up Decision" }
  ],
  completionEvidence: [
    { optsKey: "executionResult", heading: "Execution Result" },
    { optsKey: "verification", heading: "Verification" },
    { optsKey: "residualRisk", heading: "Residual Risk" },
    { optsKey: "followUp", heading: "Follow-up Decision" }
  ]
};

export const TICKET_TYPES = {
  investigation: { requiresExecutionEvidence: false },
  bugfix:        { requiresExecutionEvidence: true },
  feature:       { requiresExecutionEvidence: true },
  refactor:      { requiresExecutionEvidence: true },
  ui:            { requiresExecutionEvidence: true },
  doc:           { requiresExecutionEvidence: false }
};

export function resolveTicketType(meta: Record<string, any> = {}) {
  const raw = String(meta?.type || meta?.character || "").trim().toLowerCase();
  if (!raw) return null;
  return TICKET_TYPES[raw] ? raw : null;
}

export function buildRequiredFlagsGuideText() {
  const values = Object.keys(TICKET_TYPES).join("|");
  return `- \`--type\` (required): the ticket's kind — one of \`${values}\`. Selects which completion-evidence slots the ticket must fill.`;
}

export const DECISION_EVIDENCE_FLAGS = {
  debuggingDecision: { flag: "--reason", label: "debugging decision" },
  reopenDecision: { flag: "--reason", label: "reopen decision" }
};

function flagForOptsKey(optsKey) {
  return "--" + optsKey.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
}

export function getEvidenceSlotFlagSpecs() {
  const seen = new Set();
  const specs = [];
  for (const slots of Object.values(EVIDENCE_SECTION_SLOTS)) {
    for (const { optsKey, heading } of slots) {
      if (seen.has(optsKey)) continue;
      seen.add(optsKey);
      specs.push({ optsKey, heading, flag: flagForOptsKey(optsKey) });
    }
  }
  return specs;
}

export function getEvidenceFlagSpecsForTargetState(targetState = "", meta = {}) {
  const evidenceKeys = evidenceKeysForTargetState(targetState, meta);
  const specs = [];
  const seen = new Set();
  for (const evidenceKey of evidenceKeys) {
    for (const { optsKey, heading } of EVIDENCE_SECTION_SLOTS[evidenceKey] || []) {
      if (seen.has(optsKey)) continue;
      seen.add(optsKey);
      specs.push({ optsKey, heading, flag: flagForOptsKey(optsKey) });
    }
    const decision = DECISION_EVIDENCE_FLAGS[evidenceKey];
    if (decision && !seen.has(evidenceKey)) {
      seen.add(evidenceKey);
      specs.push({ optsKey: evidenceKey, heading: decision.label, flag: decision.flag });
    }
  }
  return specs;
}

export function evidenceFlagsForEvidenceKey(evidenceKey) {
  const contentSlots = EVIDENCE_SECTION_SLOTS[evidenceKey];
  if (contentSlots) return contentSlots.map(({ optsKey }) => flagForOptsKey(optsKey));
  const decision = DECISION_EVIDENCE_FLAGS[evidenceKey];
  return decision ? [decision.flag] : [];
}

export function evidenceFlagForSlotHeading(targetState, heading) {
  const wanted = String(heading || "").trim().toLowerCase();
  for (const spec of getEvidenceFlagSpecsForTargetState(targetState)) {
    if (spec.heading.trim().toLowerCase() === wanted) return spec.flag;
  }
  return "";
}

export function buildEvidenceSectionsForTransition(opts = {}, targetState = "", meta = {}) {
  const evidenceKeys = evidenceKeysForTargetState(targetState, meta);
  const sections = [];
  for (const evidenceKey of evidenceKeys) {
    for (const { optsKey, heading } of EVIDENCE_SECTION_SLOTS[evidenceKey] || []) {
      const value = opts[optsKey];
      if (typeof value === "string" && value.trim()) {
        sections.push({ heading, body: value.trim() });
      }
    }
  }
  return sections;
}

const EVIDENCE_KEYS_BY_TARGET_STATE = {
  phase3: ["executionEvidence"],
  phase4: ["verificationEvidence"],
  end: ["completionEvidence"],
  phase2: ["debuggingDecision"],
  phase1: ["reopenDecision"]
};

export function evidenceKeysForTargetState(targetState = "", meta = {}) {
  if (targetState === "phase3") {
    const ticketType = resolveTicketType(meta);
    const requiresExecution = ticketType === null ? true : TICKET_TYPES[ticketType].requiresExecutionEvidence;
    return requiresExecution ? ["executionEvidence"] : ["analysisEvidence"];
  }
  return EVIDENCE_KEYS_BY_TARGET_STATE[targetState] || [];
}

export function mergeH2SectionsIntoBody(content, sections = []) {
  let body = String(content || "");
  for (const { heading, body: sectionBody } of sections) {
    const block = `## ${heading}\n\n${String(sectionBody || "").trim()}`;
    const existing = parseMarkdownH2Sections(body);
    if (existing.has(heading)) {
      const lines = body.split("\n");
      const out = [];
      let i = 0;
      let replaced = false;
      while (i < lines.length) {
        const m = parseHeadingAtDepth(lines[i], 2);
        if (m && m.text === heading && !replaced) {
          out.push(block);
          replaced = true;
          i++;
          while (i < lines.length && !parseHeadingAtDepth(lines[i], 2)) i++;
          continue;
        }
        out.push(lines[i]);
        i++;
      }
      body = out.join("\n");
    } else {
      body = `${body.trimEnd()}\n\n${block}\n`;
    }
  }
  return body;
}

function slotStatusSectionsByPhase() {
  return {
    1: [...REQUIRED_PHASE1_SECTIONS],
    2: [...REQUIRED_PHASE1_SECTIONS],
    3: ["Analysis", "Direction", "Execution Result", "Verification"],
    4: ["Execution Result", "Verification", "Residual Risk", "Follow-up Decision"]
  };
}

function extractAffectedFiles(content, limit = 6) {
  const src = [
    extractMarkdownSection(content, "Execution Result"),
    extractMarkdownSection(content, REQUIRED_PHASE1_SECTIONS[0]),
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
  const byPhase = slotStatusSectionsByPhase();
  const sections = byPhase[phase >= 4 ? 4 : phase] || byPhase[2];
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

export function getCloseSlotReasons(content, evidenceKey) {
  const slots = EVIDENCE_SECTION_SLOTS[evidenceKey] || [];
  const reasons = [];
  for (const { optsKey, heading } of slots) {
    if (!hasSubstantiveSectionContent(extractMarkdownSection(content, heading), [])) {
      reasons.push(`${optsKey}_missing`);
    }
  }
  return reasons;
}

export function getCloseWorkflowReasons(meta, content) {
  const reasons = [];
  const analysisScaffolds = ANALYSIS_DESIGN_SECTION_REQUIREMENTS[0].scaffolds;
  const directionScaffolds = ANALYSIS_DESIGN_SECTION_REQUIREMENTS[1].scaffolds;
  const analysisText = extractMarkdownSection(content, "Analysis")
    || extractMarkdownSection(content, "Problem Analysis");
  if (!hasSubstantiveSectionContent(analysisText, analysisScaffolds)) {
    reasons.push("problem_analysis_missing");
  }

  const directionText = extractMarkdownSection(content, "Direction")
    || extractMarkdownSection(content, "Improvement Direction");
  if (!hasSubstantiveSectionContent(directionText, directionScaffolds)
    && !hasSubstantiveFollowUpDecision(content)) {
    reasons.push("follow_up_decision_missing");
  }

  return reasons;
}
