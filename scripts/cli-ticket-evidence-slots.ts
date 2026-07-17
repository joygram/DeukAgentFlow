// Evidence slots & phase-transition assembly, split out of cli-ticket-evidence.ts to
// keep each module under the 500-line Refactor Gate (#870). Pure move — no behavior
// change. Shared markdown/section utils stay in cli-ticket-evidence.ts and are imported
// here; consumers keep importing from cli-ticket-evidence.ts, which re-exports this module.
import {
  ANALYSIS_DESIGN_SECTION_REQUIREMENTS,
  REQUIRED_PHASE1_SECTIONS,
  extractMarkdownSection,
  hasSubstantiveFollowUpDecision,
  hasSubstantiveSectionContent,
  parseMarkdownH2Sections
} from "./cli-ticket-evidence.js";

// #808: SSOT for the evidence sections each phase transition injects into the ticket
// .md body. `move` accepts a CLI flag per slot (symmetric to `create`'s
// --scope/--plan/--analysis/--direction) so the agent never hand-edits the .md to
// satisfy the phase3→4 / phase2→3 gates. The canonical H2 heading + the CLI flag name
// live here once; both the arg parser surface and the move injector derive from this
// map so heading text and flag names can never drift apart. Headings mirror the phase
// state-template slots (docs/cli-surfaces/state-template/phase{3,4}.*.md).
export const EVIDENCE_SECTION_SLOTS = {
  // phase2 → phase3 (executionEvidence): record what ran and what it showed.
  // docsync-transition-gate.md §4: "Docs Reflected" 슬롯 — 구현이 설계·구현문서를 반영했는지와
  // 구현 결과가 설계와 일치하는지를 기록한다. 신규 스키마 티켓의 phase2→3에서만 강제된다
  // (구 스키마 면제, G1+G2 동형). 슬롯 정의는 여기 한 곳(SSOT, DR-03).
  executionEvidence: [
    { optsKey: "reproduction", heading: "Reproduction" },
    { optsKey: "verificationCommand", heading: "Verification Command" },
    { optsKey: "result", heading: "Result" },
    { optsKey: "docsReflected", heading: "Docs Reflected" },
    { optsKey: "remainingRisk", heading: "Remaining Risk" }
  ],
  // phase3 → phase4 (verificationEvidence): the completion/close slots.
  verificationEvidence: [
    { optsKey: "executionResult", heading: "Execution Result" },
    { optsKey: "verification", heading: "Verification" },
    { optsKey: "residualRisk", heading: "Residual Risk" },
    { optsKey: "followUp", heading: "Follow-up Decision" }
  ],
  // phase4 → end (completionEvidence): same close slots as verification.
  completionEvidence: [
    { optsKey: "executionResult", heading: "Execution Result" },
    { optsKey: "verification", heading: "Verification" },
    { optsKey: "residualRisk", heading: "Residual Risk" },
    { optsKey: "followUp", heading: "Follow-up Decision" }
  ]
};

// #944/#951: SSOT for ticket type → what the phase2→3 completion evidence must be
// (design-driven-flow.md §6.0.4.1: 완주 산출물은 티켓 성격에서 도출된다). The type
// axis lives here, in the same SSOT that owns the evidence slots, so slot definitions
// never scatter (DR-03). Each type declares whether phase2→3 requires code-execution
// evidence (reproduction/verification/result) or is satisfied by its design/analysis
// output alone (investigation/doc). Classification is the agent's declaration (frontmatter
// `type` — renamed from `character` in #951, which read as persona/character rather than
// ticket kind and caused repeated agent confusion), NOT a gate re-parsing ticket text
// (§6.0.4). Unknown/undeclared type is fail-first at the caller — no silent uniform default.
export const TICKET_TYPES = {
  investigation: { requiresExecutionEvidence: false },
  bugfix:        { requiresExecutionEvidence: true },
  feature:       { requiresExecutionEvidence: true },
  refactor:      { requiresExecutionEvidence: true },
  ui:            { requiresExecutionEvidence: true },
  doc:           { requiresExecutionEvidence: false }
};

// Resolve a ticket's declared type from frontmatter. Returns null when absent or
// unrecognized so callers can fail-first (§6.0.4.1 No-Fallback Gate) instead of silently
// applying a uniform default that demands slots the ticket cannot fill.
// #951: reads legacy `character` frontmatter (pre-rename tickets) as a read-compat
// fallback — existing .md files are not migrated, only read-compatible.
export function resolveTicketType(meta: Record<string, any> = {}) {
  const raw = String(meta?.type || meta?.character || "").trim().toLowerCase();
  if (!raw) return null;
  return TICKET_TYPES[raw] ? raw : null;
}

// #953: SSOT-derived required-flag guidance for the ticket-create guide surface. Reads
// TICKET_TYPES directly so the guide can never drift from the actual accepted values —
// no hand-maintained copy of the type list in docs/cli-surfaces/ticket-create*.md.
export function buildRequiredFlagsGuideText() {
  const values = Object.keys(TICKET_TYPES).join("|");
  return `- \`--type\` (required): the ticket's kind — one of \`${values}\`. Selects which completion-evidence slots the ticket must fill.`;
}

// #831: rollback / non-content transitions are satisfied by a single decision flag
// (not a body-section merge). Keyed by evidence key → the CLI flag that fills it, plus
// the heading tokens the .md state-template lists so the transition prompt can map a
// template slot line to its flag. Content slots live in EVIDENCE_SECTION_SLOTS above;
// these decision slots have no body section — only a flag.
export const DECISION_EVIDENCE_FLAGS = {
  debuggingDecision: { flag: "--reason", label: "debugging decision" },
  reopenDecision: { flag: "--reason", label: "reopen decision" }
};

// --execution-result style flag derived from a camelCase optsKey.
function flagForOptsKey(optsKey) {
  return "--" + optsKey.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
}

// All distinct (optsKey, heading, flag) tuples across every transition, so the CLI
// can advertise the flags once and the arg surface stays in lockstep with the slots.
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

// #831: SSOT for "which CLI flags satisfy a given target-state transition". The
// transition prompt and the gate-failure renderer both derive their flag hints from
// this so the .md state-template slots, the arg parser, and the printed guidance can
// never drift apart. Content transitions map each body slot to its flag; decision
// transitions (rollback/reopen) map to the single decision flag.
export function getEvidenceFlagSpecsForTargetState(targetState = "") {
  const evidenceKeys = EVIDENCE_KEYS_BY_TARGET_STATE[targetState] || [];
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

// #831: for the gate-failure renderer (which knows only the evidence key, e.g.
// "verificationEvidence"), list the CLI flags that satisfy that key so the printed
// "Missing slots" lines tell the agent exactly which flags to pass. Content keys expand
// to every body-section flag; decision keys expand to the single decision flag.
export function evidenceFlagsForEvidenceKey(evidenceKey) {
  const contentSlots = EVIDENCE_SECTION_SLOTS[evidenceKey];
  if (contentSlots) return contentSlots.map(({ optsKey }) => flagForOptsKey(optsKey));
  const decision = DECISION_EVIDENCE_FLAGS[evidenceKey];
  return decision ? [decision.flag] : [];
}

// Map a state-template slot heading (e.g. "Execution Result") to its CLI flag for a
// given target state. Returns "" when the slot is not flag-fillable for that state.
export function evidenceFlagForSlotHeading(targetState, heading) {
  const wanted = String(heading || "").trim().toLowerCase();
  for (const spec of getEvidenceFlagSpecsForTargetState(targetState)) {
    if (spec.heading.trim().toLowerCase() === wanted) return spec.flag;
  }
  return "";
}

// Given parsed opts and the move's target state, assemble the evidence sections the
// agent provided via flags into `## Heading\n\n<value>` blocks. Returns [] when no
// evidence flag was passed (so move falls through to its normal content untouched).
export function buildEvidenceSectionsForTransition(opts = {}, targetState = "") {
  const evidenceKeys = EVIDENCE_KEYS_BY_TARGET_STATE[targetState] || [];
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

// Which evidence keys a given target state consumes (move target → evidence keys).
// Mirrors the forward transitions in ticket-workflow.ts requiredEvidence; kept local
// so this module has no import cycle with the workflow machine.
const EVIDENCE_KEYS_BY_TARGET_STATE = {
  phase3: ["executionEvidence"],
  phase4: ["verificationEvidence"],
  end: ["completionEvidence"],
  // #831: rollback/reopen targets carry decision evidence (satisfied by --reason), so
  // the transition prompt can advertise the flag instead of leaving the agent to guess.
  phase2: ["debuggingDecision"],
  phase1: ["reopenDecision"]
};

// Append or replace H2 sections in a markdown body. An existing section with the same
// heading is overwritten (its body up to the next H2 is replaced); a new heading is
// appended at the end. This is how move writes flag-provided evidence into the .md so
// the substantive-content gate validates real content — empty flags inject nothing and
// the gate still fails (no empty-section bypass).
export function mergeH2SectionsIntoBody(content, sections = []) {
  let body = String(content || "");
  for (const { heading, body: sectionBody } of sections) {
    const block = `## ${heading}\n\n${String(sectionBody || "").trim()}`;
    const existing = parseMarkdownH2Sections(body);
    if (existing.has(heading)) {
      // Replace the existing section's heading+body span (up to the next H2 / EOF).
      const lines = body.split("\n");
      const out = [];
      let i = 0;
      let replaced = false;
      while (i < lines.length) {
        const m = lines[i].match(/^##\s+(.+?)\s*$/);
        if (m && m[1].trim() === heading && !replaced) {
          out.push(block);
          replaced = true;
          i++;
          while (i < lines.length && !/^##\s+/.test(lines[i])) i++;
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

// Compact, .md-aware slot status so `ticket use` shows what is already filled
// vs. still empty, plus affected files — preventing the agent from re-reading the
// ticket .md / find-grepping the tree to reconstruct context. Output stays terse.
// #870: built lazily inside a function — a top-level `[...REQUIRED_PHASE1_SECTIONS]`
// would evaluate during module load, before the circular import of evidence.js is
// initialized (TDZ ReferenceError). Deferring to call time breaks the cycle.
function slotStatusSectionsByPhase() {
  return {
    1: [...REQUIRED_PHASE1_SECTIONS],
    2: [...REQUIRED_PHASE1_SECTIONS],
    3: ["Analysis", "Direction", "Execution Result", "Verification"],
    4: ["Execution Result", "Verification", "Residual Risk", "Follow-up Decision"]
  };
}

// Pull file-ish tokens (path/with/slashes or name.ext) from the sections most
// likely to record affected files, capped so the line never sprawls.
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

// #902: verificationEvidence(phase3→4)/completionEvidence(phase4→end)의 완주 판정은
// getCloseWorkflowReasons(Analysis/Direction — phase1 설계 섹션)이 아니라, 그 전이가
// 실제로 주입하는 close 슬롯(EVIDENCE_SECTION_SLOTS[evidenceKey])의 exists/empty만
// 본다(design-driven-flow.md §6.0: 최소 형식 확인, regex 품질심문 금지). hasPhase2Exec
// utionEvidence가 executionEvidence 슬롯에서 heading을 파생하는 것과 동형(SSOT, DR-03).
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
