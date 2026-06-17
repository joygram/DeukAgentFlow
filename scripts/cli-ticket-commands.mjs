import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, copyFileSync, readdirSync, rmSync, statSync } from "fs";
import { hostname } from "os";
import { basename, join, dirname, relative, resolve } from "path";
import { 
  toSlug, toSnakeCaseKey, requireNonEmptySlug, toRepoRelativePath, toFileUri, inferRefTitleAndTopic, resolveReferencedTicketPath, toPosixPath, stringifyFrontMatter,
  resolveDocsLanguage, inferDocsLanguageFromText, normalizeDocsLanguage, isMcpActive, withReadline, parseFrontMatter,
  AGENT_ROOT_DIR, TICKET_SUBDIR, TICKET_DIR_NAME, TICKET_INDEX_FILENAME, WORKFLOW_MODE_EXECUTE,
  detectConsumerTicketDir, resolveConsumerTicketRoot, loadInitConfig, computeTicketPath, normalizeWorkflowMode
} from "./cli-utils.mjs";
import { readTicketIndexJson, writeTicketIndexJson, syncActiveTicketId, generateTicketId, syncToPipeline } from "./cli-ticket-index.mjs";
import { appendTicketEntry, rebuildTicketIndexFromTopicFilesIfNeeded, updateTicketEntryStatus } from "./cli-ticket-parser.mjs";
import { appendInternalWorkflowEvent, buildTelemetrySummary, getTelemetryCompactSummary } from "./cli-telemetry-commands.mjs";
import { parsePlan } from "./plan-parser.mjs";
import { collectChangedFiles, lintMarkdownPaths } from "./lint-md.mjs";
import { auditRules } from "./lint-rules.mjs";
import { getUsageReminderLine } from "./cli-usage-commands.mjs";
import ejs from "ejs";
import YAML from "yaml";

import { createInterface } from "readline";
import { selectOne } from "./cli-prompts.mjs";

const MAX_OPEN_TICKETS = 20;
const OPEN_TICKET_STATUSES = new Set(["open", "active"]);
const AUTO_ARCHIVE_DONE_STATUSES = new Set(["closed", "cancelled", "wontfix"]);

async function ensurePhase0Validation(opts) {
  if (!opts.evidence && !opts.skipPhase0) {
    // No more interactive prompts. Default to skip if no evidence provided.
    opts.skipPhase0 = true;
  }

  if (opts.skipPhase0) {
    try {
      if (!isCompactTicketOutput(opts) && await isMcpActive(opts.cwd)) {
        console.warn("[WARNING] Phase 0 RAG evidence is recommended when the MCP server is active. Proceeding without evidence as requested.");
      }
    } catch (err) {
      // MCP detection failure should not block ticket creation
      if (process.env.DEBUG) console.warn("[DEBUG] MCP activation check failed:", err.message);
    }
  }
}

function resolveTicketDocsLanguage(cwd, docsLanguageInput, promptText = "") {
  const config = loadInitConfig(cwd) || {};
  const explicitDocsLanguage = normalizeDocsLanguage(docsLanguageInput);
  const configDocsLanguage = normalizeDocsLanguage(config.docsLanguage || "auto");
  const promptDocsLanguage = explicitDocsLanguage === "auto" && configDocsLanguage === "auto"
    ? inferDocsLanguageFromText(promptText)
    : null;
  const docsLanguage = resolveDocsLanguage(
    explicitDocsLanguage !== "auto"
      ? explicitDocsLanguage
      : configDocsLanguage !== "auto"
        ? configDocsLanguage
        : promptDocsLanguage || "en"
  );
  return docsLanguage;
}

function hasPlaceholderTokens(text) {
  const src = String(text || "").toLowerCase();
  return src.includes("[add ") || src.includes("[fill") || src.includes("placeholder") || src.includes("todo") || src.includes("tbd");
}

const ANALYSIS_DESIGN_SECTION_REQUIREMENTS = [
  {
    section: "Problem Analysis",
    reason: "problem_analysis_missing",
    scaffolds: [
      "For investigation, regression, quality, or root-cause tickets, record the current analysis here before asking the user for clarification.",
      "Chat should point back to this ticket after the analysis is recorded."
    ]
  },
  {
    section: "Improvement Direction",
    reason: "improvement_direction_missing",
    scaffolds: [
      "Record the proposed fix direction or follow-up design path."
    ]
  }
];

const REQUIRED_PHASE1_SECTIONS = [
  "Agent Permission Contract (APC)",
  "Compact Plan",
  "Problem Analysis",
  "Source Observations",
  "Cause Hypotheses",
  "Improvement Direction",
  "Audit Evidence"
];

const REQUIRED_APC_MARKERS = [
  { name: "boundary", marker: "[BOUNDARY]" },
  { name: "contract", marker: "[CONTRACT]" },
  { name: "patch_plan", marker: "[PATCH PLAN]" }
];
const REQUIRED_PHASE1_DATA_SECTIONS = [
  "Compact Plan",
  "Problem Analysis",
  "Source Observations",
  "Cause Hypotheses",
  "Improvement Direction",
  "Audit Evidence"
];

const FOLLOW_UP_DECISION_NO_FOLLOW_UP_PATTERNS = [
  /\bno[- ]follow[- ]up\b/i,
  /\bfollow[- ]up\s*:\s*none\b/i,
  /\bno further action\b/i,
  /\bnone required\b/i,
  /후속(?:\s+작업)?\s*(?:없음|불필요)/,
  /추가(?:\s+작업)?\s*(?:없음|불필요)/
];

const CLAIM_STOP_WORDS = new Set([
  "the",
  "and",
  "or",
  "is",
  "are",
  "was",
  "were",
  "be",
  "this",
  "that",
  "with",
  "for",
  "from",
  "in",
  "on",
  "of",
  "to",
  "it",
  "ticket",
  "issue",
  "problem",
  "analysis",
  "failed",
  "failure",
  "record",
  "recorded",
  "claim",
  "claiming",
  "result",
  "resulted",
  "caused",
  "causing",
  "this",
  "그",
  "이",
  "이슈",
  "문제",
  "실패",
  "원인",
  "분석",
  "기록",
  "티켓"
]);

function tokenizeClaimText(text) {
  const raw = String(text || "").toLowerCase();
  const tokens = raw.match(/[0-9a-z가-힣_.-]+/g) || [];
  const filtered = tokens
    .filter(t => t.length > 2)
    .filter(t => !CLAIM_STOP_WORDS.has(t));
  return [...new Set(filtered)];
}

function collectClaimTargetSections(content) {
  const targetSections = ["Problem Analysis", "Source Observations", "Cause Hypotheses", "Improvement Direction"];
  return targetSections.map(name => extractMarkdownSection(content, name)).join(" ");
}

function parseMarkdownH2Sections(content) {
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

function buildClaimCoverageSummary(claimTerms, sectionText) {
  const haystack = String(sectionText || "").toLowerCase();
  const normalized = haystack.replace(/\s+/g, " ");
  const matched = claimTerms.filter(term => normalized.includes(term));
  const missRate = claimTerms.length === 0 ? 0 : 1 - matched.length / claimTerms.length;
  return {
    matched,
    missRate,
    total: claimTerms.length
  };
}

function extractMarkdownSection(content, heading) {
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

function getMarkerBody(text, marker, nextMarkers) {
  const lines = String(text || "").split("\n");
  const start = lines.findIndex(line => line.includes(marker));
  if (start < 0) return null;

  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (nextMarkers.some(nextMarker => line.includes(nextMarker))) break;
    body.push(line);
  }
  return body.join("\n").trim();
}

function getMissingApcFields(text) {
  return REQUIRED_APC_MARKERS
    .filter(({ marker }, index) => {
      const nextMarkers = REQUIRED_APC_MARKERS.slice(index + 1).map(item => item.marker);
      return !hasSubstantiveSectionContent(getMarkerBody(text, marker, nextMarkers), []);
    })
    .map(field => field.name);
}

function getPhase1PlanBodyReasons(body) {
  const content = String(body || "");
  const sections = parseMarkdownH2Sections(content);
  const apcSection = extractMarkdownSectionByAliases(content, [
    "Agent Permission Contract (APC)",
    "Agent Permission Contract",
    "APC"
  ]);
  const reasons = [];

  if (!apcSection) {
    reasons.push("missing_apc_block");
  } else {
    for (const field of getMissingApcFields(apcSection)) {
      reasons.push(`apc_${field}_missing`);
    }
  }

  for (const sectionName of REQUIRED_PHASE1_DATA_SECTIONS) {
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

function buildPlanBodyRequiredMessage(reasons = []) {
  const uniqueReasons = [...new Set(reasons)];
  return [
    "[VALIDATION FAILED] ticket create requires a filled Phase 1 plan body with actual data.",
    `Missing or incomplete: ${uniqueReasons.join(", ")}`,
    "Use the one-shot flow: collect real observations first, pass a filled body with `--plan-body-file -`, then run `ticket create` once.",
    "If a scratch plan-body file is unavoidable, keep it outside the workspace, delete it after create, and never present it as a ticket artifact.",
    "Do not rely on template defaults or auto-generated filler text for Phase 1 ticket content."
  ].join("\n");
}

function getAnalysisDesignIncompleteReasons(meta, content) {
  const reasons = [];
  for (const requirement of ANALYSIS_DESIGN_SECTION_REQUIREMENTS) {
    if (!hasSubstantiveSectionContent(extractMarkdownSection(content, requirement.section), requirement.scaffolds)) {
      reasons.push(requirement.reason);
    }
  }

  return reasons;
}

function hasSubstantiveFollowUpDecision(content) {
  return hasSubstantiveSectionContent(extractMarkdownSection(content, "Follow-up Decision"), []);
}

function followUpDecisionMeansNoFollowUp(content) {
  const text = extractMarkdownSection(content, "Follow-up Decision");
  if (!hasSubstantiveSectionContent(text, [])) return false;
  return FOLLOW_UP_DECISION_NO_FOLLOW_UP_PATTERNS.some(pattern => pattern.test(text));
}

function getCloseLifecycleReasons(meta, content) {
  const reasons = [];
  const problemAnalysis = extractMarkdownSection(content, "Problem Analysis");
  if (!hasSubstantiveSectionContent(problemAnalysis, ANALYSIS_DESIGN_SECTION_REQUIREMENTS[0].scaffolds)) {
    reasons.push("problem_analysis_missing");
  }

  if (!hasSubstantiveSectionContent(extractMarkdownSection(content, "Improvement Direction"), ANALYSIS_DESIGN_SECTION_REQUIREMENTS[1].scaffolds)
    && !hasSubstantiveFollowUpDecision(content)) {
    reasons.push("follow_up_decision_missing");
  }

  return reasons;
}

function validateClaimAgainstTicketContent(meta, content, claim) {
  const reasons = [];
  const claimTerms = tokenizeClaimText(claim);
  if (claimTerms.length === 0) {
    reasons.push("claim_terms_missing");
    return reasons;
  }

  const coverageText = collectClaimTargetSections(content);
  const coverage = buildClaimCoverageSummary(claimTerms, coverageText);
  const matchingRate = coverage.matched.length / Math.max(coverage.total, 1);
  if (matchingRate < 0.33) {
    reasons.push(`claim_coverage_missing:${coverage.matched.length}/${coverage.total}`);
  }

  if (!meta.summary || hasPlaceholderTokens(meta.summary)) {
    reasons.push("claim_ticket_summary_missing");
  }

  const phase1Missing = getAnalysisDesignIncompleteReasons(meta, content);
  if (phase1Missing.length > 0) {
    reasons.push("claim_ticket_incomplete_record");
  }

  return reasons;
}

function getClaimEvidenceResult(target, meta, content, claim) {
  const reasons = validateClaimAgainstTicketContent(meta, content, claim);
  const claimTerms = tokenizeClaimText(claim);
  const coverage = buildClaimCoverageSummary(claimTerms, collectClaimTargetSections(content));
  return {
    ok: reasons.length === 0,
    reasons,
    ticket: target.topic,
    path: target.path,
    claim,
    claimTerms: coverage.total,
    coveredTerms: coverage.matched.length,
    matchedTerms: coverage.matched,
    missRate: Number((coverage.missRate * 100).toFixed(1)),
    sections: {
      problemAnalysis: extractMarkdownSection(content, "Problem Analysis").trim(),
      sourceObservations: extractMarkdownSection(content, "Source Observations").trim(),
      causeHypotheses: extractMarkdownSection(content, "Cause Hypotheses").trim(),
      improvementDirection: extractMarkdownSection(content, "Improvement Direction").trim()
    }
  };
}

const IMPLEMENTATION_CLAIM_PATTERNS = [
  /\b(?:fix|fixed|implement|implemented|apply|applied|change(?:d)?|patch(?:ed)?|resolved?)\b/i,
  /(수정|구현|적용|변경|패치|해결)(?:했|됨|완료|함)?/i
];

function claimImpliesCodeChange(text) {
  const src = String(text || "").trim();
  if (!src) return false;
  return IMPLEMENTATION_CLAIM_PATTERNS.some(pattern => pattern.test(src));
}

function isTicketOwnedPath(relPath) {
  const normalized = toPosixPath(String(relPath || ""));
  return normalized.startsWith(`${AGENT_ROOT_DIR}/tickets/`) || normalized.startsWith(`${AGENT_ROOT_DIR}/docs/`);
}

function collectChangedSourceFiles(cwd, changedFilesOverride = null) {
  const changed = Array.isArray(changedFilesOverride) ? changedFilesOverride : collectChangedFiles(cwd);
  return changed.filter(relPath => !isTicketOwnedPath(relPath));
}

function extractLikelyAffectedFiles(text) {
  const matches = String(text || "").match(/\b[\w./-]+\.(?:[cm]?[jt]s|tsx?|jsx?|mjs|cjs|json|ya?ml|ejs|rs|py|java|cs|cpp|hpp|h|ex|exs|go|kt|swift|rb|php|sh)\b/gi) || [];
  return [...new Set(matches.map(match => toPosixPath(match.trim()).replace(/^\.\//, "")))];
}

export function getImplementationClaimGuardResult(cwd, { claim = "", content = "", changedFiles = null } = {}) {
  const changedSourceFiles = collectChangedSourceFiles(cwd, changedFiles);
  const effectiveClaim = String(claim || "").trim();
  const verificationOutcome = extractMarkdownSection(content, "Verification Outcome");
  const candidateText = [effectiveClaim, verificationOutcome].filter(Boolean).join("\n");

  if (!claimImpliesCodeChange(candidateText)) {
    return { ok: true, changedFiles: changedSourceFiles, affectedFiles: [] };
  }

  const affectedFiles = extractLikelyAffectedFiles(candidateText);
  const normalizedChanged = changedSourceFiles.map(file => toPosixPath(String(file || "")).replace(/^\.\//, ""));
  const overlap = affectedFiles.filter(file => normalizedChanged.includes(file));
  const reasons = [];

  if (normalizedChanged.length === 0) {
    reasons.push("implementation_changed_files_missing");
  }
  if (affectedFiles.length > 0 && overlap.length === 0) {
    reasons.push("implementation_affected_files_not_changed");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    changedFiles: changedSourceFiles,
    affectedFiles,
    overlap
  };
}

function isCompactTicketOutput(opts = {}) {
  return Boolean(opts.compact || opts.nonInteractive);
}

function printUsageReminder(cwd, opts = {}) {
  if (isCompactTicketOutput(opts) || opts.pathOnly) return;
  const reminder = getUsageReminderLine(cwd);
  if (reminder) {
    console.log(reminder);
  }
}

function printCreateApprovalGate(ticketId, opts = {}) {
  if (isCompactTicketOutput(opts)) {
    console.log("Approval pending: explicit user approval is required before work.");
    console.log(`Guard topic: ${ticketId}`);
    return;
  }
  console.log("Approval pending: share the ticket-start line in chat, review the durable ticket body, and stop here until the user explicitly approves.");
  console.log(`After approval: deuk-agent-flow ticket guard --topic ${ticketId} --ticket-started --ticket-reviewed --approval approved`);
}

function formatTicketStartLine(ticketId, absPath) {
  return `Ticket start: [${ticketId}](${absPath})`;
}

function printTicketStartLine(ticketId, absPath) {
  console.log(formatTicketStartLine(ticketId, absPath));
}

function printTicketSelectionLine(ticketId, absPath, opts = {}) {
  if (opts.pathOnly) {
    console.log(absPath);
    return;
  }
  if (isCompactTicketOutput(opts)) {
    printTicketStartLine(ticketId, absPath);
    return;
  }
  printTicketStartLine(ticketId, absPath);
}

function getHandoffSummary(out) {
  const next = out.nextTicket ? `${out.nextTicket.id}:${out.nextTicket.status}` : "none";
  const blockers = out.reasons?.length ? out.reasons.join(",") : "none";
  const telemetry = out.telemetrySummary || "telemetry none";
  return `${out.current.id} | phase=${out.current.phase} | status=${out.current.status} | next=${next} | blockers=${blockers} | ${telemetry}`;
}

function buildTicketContentSection(ticketContent, docsLanguage) {
  const trimmed = String(ticketContent || "").trim();
  if (!trimmed) return "";
  const heading = docsLanguage === "ko" ? "## 맥락" : "## Context";
  return `${heading}\n\n${trimmed}\n`;
}

function readCliTextInput(cwd, inputPath, label) {
  const value = String(inputPath || "").trim();
  if (!value) return "";
  if (value === "-") return readFileSync(0, "utf8");
  const absPath = resolve(cwd, value);
  if (!existsSync(absPath)) throw new Error(`${label}: file not found ${value}`);
  return readFileSync(absPath, "utf8");
}

function hydrateCreateTextInputs(opts) {
  const next = { ...opts };
  if (next.planBodyFile) {
    next.planBody = readCliTextInput(next.cwd, next.planBodyFile, "ticket create --plan-body-file");
  }
  if (next.contentFile) {
    next.content = readCliTextInput(next.cwd, next.contentFile, "ticket create --content-file");
  }
  return next;
}

function injectTicketContent(baseContent, ticketContent, docsLanguage) {
  const section = buildTicketContentSection(ticketContent, docsLanguage);
  if (!section) return baseContent;
  if (/^## Tasks\b/m.test(baseContent)) {
    return baseContent.replace(/^## Tasks\b/m, `${section}\n## Tasks`);
  }
  return `${String(baseContent || "").trimEnd()}\n\n${section}`;
}

function lintTicketLifecycleMarkdown(cwd, targets, context) {
  const uniqueTargets = Array.from(new Set((targets || []).filter(Boolean)));
  if (uniqueTargets.length === 0) return { errors: [], targets: [] };

  const result = lintMarkdownPaths(uniqueTargets, cwd);
  if (result.errors.length > 0) {
    const details = result.errors.map(err => `- ${err}`).join("\n");
    throw new Error(`[VALIDATION FAILED] ${context}: markdown lint failed\n${details}`);
  }
  return result;
}

function runTicketLifecycleQualityGate(cwd, { ticketAbsPath, extraTargets = [], context }) {
  const lintTargets = collectTicketLifecycleMarkdownTargets(cwd, ticketAbsPath, extraTargets);
  lintTicketLifecycleMarkdown(cwd, lintTargets, context);

  const changedFiles = collectChangedFiles(cwd);
  if (!existsSync(join(cwd, "core-rules", "AGENTS.md"))) return;
  if (!shouldRunLifecycleRulesAudit(changedFiles)) return;

  const result = auditRules(cwd);
  if (result.ok) return;

  const details = result.violations.map(violation => `- ${violation.code}: ${violation.message}`).join("\n");
  throw new Error(`[VALIDATION FAILED] ${context}: rules audit failed\n${details}`);
}

function looksLikeTicketMarkdownPath(value) {
  const raw = String(value || "");
  return /\.md$/i.test(raw) && /[/\\]/.test(raw);
}

function findTicketRepoRootFromPath(absPath) {
  let dir = dirname(absPath);
  while (true) {
    if (basename(dir) === TICKET_SUBDIR && basename(dirname(dir)) === AGENT_ROOT_DIR) {
      return dirname(dirname(dir));
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function applyTicketPathContext(opts = {}) {
  const rawTicketPath = opts.ticketPath || (looksLikeTicketMarkdownPath(opts.topic) ? opts.topic : "");
  if (!rawTicketPath) return opts;

  const absPath = resolve(opts.cwd, rawTicketPath);
  if (!existsSync(absPath)) {
    throw new Error(`ticket path not found: ${rawTicketPath}`);
  }

  const ticketRepoRoot = findTicketRepoRootFromPath(absPath);
  if (!ticketRepoRoot) {
    throw new Error(`ticket path is not inside ${AGENT_ROOT_DIR}/${TICKET_SUBDIR}: ${rawTicketPath}`);
  }

  const { meta } = parseFrontMatter(readFileSync(absPath, "utf8"));
  const ticketTopic = meta.topic || meta.id || basename(absPath).replace(/\.md$/i, "");
  if (!ticketTopic) {
    throw new Error(`ticket path has no id/topic frontmatter: ${rawTicketPath}`);
  }

  opts.cwd = ticketRepoRoot;
  opts.topic = ticketTopic;
  opts.ticketPath = absPath;
  return opts;
}

function ticketIndexPathForRoot(root) {
  return join(root, AGENT_ROOT_DIR, TICKET_SUBDIR, TICKET_INDEX_FILENAME);
}

function collectNearbyTicketRoots(cwd) {
  const roots = new Set();
  let dir = resolve(cwd);

  while (true) {
    if (existsSync(ticketIndexPathForRoot(dir))) roots.add(dir);

    try {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        if (!item.isDirectory() || item.name.startsWith(".")) continue;
        const childRoot = join(dir, item.name);
        if (existsSync(ticketIndexPathForRoot(childRoot))) roots.add(childRoot);
      }
    } catch {
      // Some ancestors may not be readable; skip them and keep climbing.
    }

    const parent = dirname(dir);
    if (parent === dir || basename(dir) === "home") break;
    dir = parent;
  }

  return [...roots];
}

function matchingTicketEntriesForTopic(indexJson, topic, opts = {}) {
  const key = String(topic || "").toLowerCase();
  if (!key) return [];
  const rows = filterTicketEntries(indexJson.entries, opts);
  const exact = rows.filter(entry =>
    String(entry.topic || "").toLowerCase() === key ||
    String(entry.id || "").toLowerCase() === key
  );
  if (exact.length > 0) return exact;
  return rows.filter(entry =>
    String(entry.topic || "").toLowerCase().includes(key) ||
    String(entry.id || "").toLowerCase().includes(key)
  );
}

function applyTicketTopicContext(opts = {}) {
  if (!opts.topic || opts.latest || looksLikeTicketMarkdownPath(opts.topic)) return opts;

  const currentIndexPath = ticketIndexPathForRoot(opts.cwd);
  if (existsSync(currentIndexPath)) {
    const currentIndex = readTicketIndexJson(opts.cwd);
    if (pickTicketEntry(opts, currentIndex)) return opts;
  }

  const hasProjectScope = Boolean(opts.project || opts.submodule);
  if (hasProjectScope) return opts;

  const matches = [];
  for (const root of collectNearbyTicketRoots(opts.cwd)) {
    if (resolve(root) === resolve(opts.cwd)) continue;
    let indexJson;
    try {
      indexJson = JSON.parse(readFileSync(ticketIndexPathForRoot(root), "utf8"));
    } catch {
      continue;
    }
    for (const entry of matchingTicketEntriesForTopic(indexJson, opts.topic, opts)) {
      matches.push({ root, entry });
    }
  }

  if (matches.length === 0) return opts;
  if (matches.length > 1) {
    const details = matches
      .slice(0, 10)
      .map(match => `- ${match.entry.id || match.entry.topic} @ ${match.root}`)
      .join("\n");
    throw new Error(`Ambiguous ticket topic "${opts.topic}" found in multiple repositories:\n${details}`);
  }

  opts.cwd = matches[0].root;
  opts.topic = matches[0].entry.topic || matches[0].entry.id;
  return opts;
}

function applyTicketContext(opts = {}) {
  applyTicketPathContext(opts);
  applyTicketTopicContext(opts);
  return opts;
}

function applyTicketRootContext(opts = {}, options = {}) {
  const root = resolveConsumerTicketRoot(opts.cwd, options);
  if (root) opts.cwd = root;
  return opts;
}

function normalizeMarkdownLintTargets(cwd, targets = []) {
  return Array.from(new Set(
    (targets || [])
      .filter(Boolean)
      .map(target => resolve(cwd, target))
  ));
}

function collectTicketLifecycleMarkdownTargets(cwd, ticketAbsPath, extraTargets = []) {
  return normalizeMarkdownLintTargets(cwd, [
    ticketAbsPath,
    ...(extraTargets || [])
  ]);
}

function shouldRunLifecycleRulesAudit(changedFiles = []) {
  return (changedFiles || []).some(relPath => {
    const normalized = String(relPath || "").replace(/\\/g, "/");
    if (!normalized) return false;
    return normalized === "core-rules/AGENTS.md"
      || normalized === "PROJECT_RULE.md"
      || normalized === "AGENTS.md"
      || normalized === ".codex/AGENTS.md"
      || normalized.startsWith(".claude/rules/")
      || normalized.startsWith(".aiassistant/rules/")
      || normalized.startsWith(".windsurf/rules/")
      || normalized.startsWith(".cursor/rules/")
      || normalized.startsWith("templates/rules.d/")
      || normalized === "templates/PROJECT_RULE.md"
      || normalized === "scripts/lint-rules.mjs";
  });
}

function restoreTicketIndexSnapshot(cwd, snapshot, opts = {}) {
  if (opts.dryRun) return;
  writeTicketIndexJson(cwd, snapshot, opts);
}

function rollbackTicketLifecycleArtifacts(cwd, previousIndex, previousBody, absPath, opts = {}) {
  if (opts.dryRun) return;
  if (previousBody !== undefined && absPath) {
    writeFileSync(absPath, previousBody, "utf8");
  }
  if (previousIndex) {
    restoreTicketIndexSnapshot(cwd, previousIndex, opts);
  }
}

function getPhase1IncompleteReasonsFromBody(body) {
  parseFrontMatter(body);
  return [];
}

function getPhase1IncompleteReasons(cwd, absPath) {
  if (!existsSync(absPath)) return ["ticket_file_missing"];
  return getPhase1IncompleteReasonsFromBody(readFileSync(absPath, "utf8"));
}

function isExecutionTicketStatus(status) {
  return OPEN_TICKET_STATUSES.has(String(status || "open").toLowerCase());
}

function hasExplicitExecutionApproval(opts = {}) {
  if (!Object.prototype.hasOwnProperty.call(opts, "workflowMode")
    && !Object.prototype.hasOwnProperty.call(opts, "workflow")
    && !Object.prototype.hasOwnProperty.call(opts, "approval")
    && !Object.prototype.hasOwnProperty.call(opts, "approvalState")) {
    return false;
  }
  return normalizeWorkflowMode(opts.workflowMode ?? opts.workflow ?? opts.approval ?? opts.approvalState) === WORKFLOW_MODE_EXECUTE;
}

function getTicketLifecycleProvenanceReasons(entry, meta = {}) {
  const reasons = [];
  if (!entry || String(entry.status || "").toLowerCase() === "archived") return reasons;
  if (!isExecutionTicketStatus(entry.status || meta.status || "open")) return reasons;

  const lifecycleSource = String(meta.lifecycleSource || meta.ticketLifecycleSource || "").trim();
  if (lifecycleSource !== "ticket-create") {
    reasons.push("manual_ticket_lifecycle_provenance_missing");
  }
  return reasons;
}

function assertTicketLifecycleProvenance(entry, meta = {}) {
  const reasons = getTicketLifecycleProvenanceReasons(entry, meta);
  if (reasons.length === 0) return;
  throw new Error([
    `[VALIDATION FAILED] Ticket ${entry?.id || entry?.topic || "unknown"} cannot be used as an execution ticket: ${reasons.join(", ")}.`,
    "This ticket file does not carry CLI creation provenance.",
    "Do not create or repair tickets by writing .deuk-agent/tickets/**/*.md directly.",
    "Use: npx deuk-agent-flow ticket create --topic <topic> --summary <summary> --plan-body-file - --non-interactive"
  ].join("\n"));
}

function updatePreviousTicketRef(cwd, prevTicketEntry, ticketId) {
  if (!prevTicketEntry) return;
  const prevAbsPath = join(cwd, prevTicketEntry.path);
  if (!existsSync(prevAbsPath)) return;
  
  let prevContent = readFileSync(prevAbsPath, "utf8");
  prevContent = prevContent.replace(/^---\n([\s\S]*?)\n---/, (match, fm) => {
    if (!fm.includes('nextTicket:')) {
      return `---\n${fm.trim()}\nnextTicket: ${ticketId}\n---`;
    }
    return match;
  });
  writeFileSync(prevAbsPath, prevContent, "utf8");
  return prevTicketEntry.id;
}

function archivePartitionForEntry(entry, now = new Date()) {
  const storedYearMonth = String(entry?.archiveYearMonth || "");
  if (/^\d{4}-\d{2}$/.test(storedYearMonth)) {
    return { yearMonth: storedYearMonth };
  }

  const source = String(entry?.createdAt || "");
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return { yearMonth: `${match[1]}-${match[2]}` };

  const iso = now.toISOString();
  return { yearMonth: iso.slice(0, 7) };
}

function getArchiveDestination(ticketDir, entry, fileName) {
  const partition = archivePartitionForEntry(entry);
  const archiveDir = join(ticketDir, "archive", entry.group || "sub", partition.yearMonth);
  return {
    archiveDir,
    archiveYearMonth: partition.yearMonth,
    newAbsPath: join(archiveDir, fileName)
  };
}

function archiveStorageFromPath(ticketDir, absPath, entry) {
  const parts = toPosixPath(relative(ticketDir, absPath)).split("/");
  const archiveIdx = parts.indexOf("archive");
  if (archiveIdx < 0) return archivePartitionForEntry(entry);
  return {
    archiveYearMonth: parts[archiveIdx + 2] || archivePartitionForEntry(entry).yearMonth
  };
}

function findExistingArchivedTicketPath(ticketDir, entry, fileName) {
  const expected = getArchiveDestination(ticketDir, entry, fileName).newAbsPath;
  if (existsSync(expected)) return expected;

  const archiveRoot = join(ticketDir, "archive", entry.group || "sub");
  if (!existsSync(archiveRoot)) return null;

  const stack = [archiveRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, item.name);
      if (item.isDirectory()) {
        stack.push(abs);
      } else if (item.isFile() && item.name === fileName) {
        return abs;
      }
    }
  }
  return null;
}

function isOpenTicketEntry(entry) {
  return OPEN_TICKET_STATUSES.has(String(entry?.status || "open"));
}

function isAutoArchivableDoneEntry(entry) {
  return AUTO_ARCHIVE_DONE_STATUSES.has(String(entry?.status || "").toLowerCase());
}

function latestTicketByStatus(entries, statuses) {
  const statusSet = new Set(statuses);
  return [...(entries || [])]
    .filter(e => statusSet.has(String(e.status || "").toLowerCase()))
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0] || null;
}

function formatTicketChoice(entry) {
  const status = String(entry.status || "open");
  const createdAt = String(entry.createdAt || "-");
  const title = String(entry.title || entry.topic || entry.id || "").replace(/(\n|\\n)+/g, " ").slice(0, 80);
  return `${entry.id} | ${status} | ${createdAt} | ${title}`;
}

function buildUseFallbackCandidates(indexJson, opts = {}) {
  const entries = filterTicketEntries(indexJson.entries, opts);
  const lastClosed = latestTicketByStatus(entries, ["closed"]);
  const openRows = entries
    .filter(e => OPEN_TICKET_STATUSES.has(String(e.status || "open")))
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));

  const seen = new Set();
  return [lastClosed, ...openRows]
    .filter(Boolean)
    .filter(entry => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
}

function buildUseNoMatchError(topic, candidates) {
  const lines = [
    `No matching ticket found for "${topic || ""}".`,
    "Last closed ticket and open tickets:"
  ];

  if (candidates.length === 0) {
    lines.push("  - none");
  } else {
    for (const entry of candidates.slice(0, 20)) {
      lines.push(`  - ${formatTicketChoice(entry)}`);
    }
  }

  lines.push("");
  lines.push("Choose one explicitly:");
  lines.push("  npx deuk-agent-flow ticket use --topic <ticket-id> --non-interactive");
  return lines.join("\n");
}

function oldestFirst(a, b) {
  return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
}

function selectOpenLimitCandidates(indexJson) {
  const openRows = (indexJson.entries || []).filter(isOpenTicketEntry);
  const overflow = openRows.length - MAX_OPEN_TICKETS;
  if (overflow <= 0) return [];

  const currentActiveId = indexJson.activeTicketId;
  const openCandidates = openRows
    .filter(e => e.status === "open" && e.id !== currentActiveId)
    .sort(oldestFirst);
  const activeCandidates = openRows
    .filter(e => e.status === "active" && e.id !== currentActiveId)
    .sort(oldestFirst);
  const lastResort = openRows
    .filter(e => e.id === currentActiveId)
    .sort(oldestFirst);

  return [...openCandidates, ...activeCandidates, ...lastResort].slice(0, overflow);
}

function buildOpenTicketLimitError(indexJson) {
  const openRows = (indexJson.entries || []).filter(isOpenTicketEntry);
  if (openRows.length <= MAX_OPEN_TICKETS) return null;

  const candidates = selectOpenLimitCandidates(indexJson);
  const lines = [
    `[OPEN TICKET LIMIT] Open tickets: ${openRows.length}/${MAX_OPEN_TICKETS}.`,
    "Ticket creation was cancelled so open tickets do not exceed the limit.",
    "Review the active ticket list, decide what can be archived, then create the ticket again.",
    "",
    "Commands:",
    "  npx deuk-agent-flow ticket list --active --non-interactive",
    "  npx deuk-agent-flow ticket archive --topic <ticket-id> --non-interactive",
    "",
    "Oldest archive candidates:"
  ];

  for (const entry of candidates.slice(0, 10)) {
    const title = String(entry.title || entry.topic || "").replace(/(\n|\\n)+/g, " ").slice(0, 80);
    lines.push(`  - ${entry.id} | ${entry.status || "open"} | ${entry.createdAt || "-"} | ${title}`);
  }

  return lines.join("\n");
}

function resolveArchiveReport(cwd, fileName, report) {
  if (report) return resolve(cwd, report);

  const reportDir = join(cwd, AGENT_ROOT_DIR, "docs", "plan");
  const potentialReport = fileName.replace(/\.md$/i, "-report.md");
  const potentialPath = join(reportDir, potentialReport);
  return existsSync(potentialPath) ? potentialPath : null;
}

function archiveTicketEntry({ cwd, ticketDir, indexJson, found, opts = {}, report }) {
  const absPath = join(cwd, found.path);
  const fileName = found.path.split(/[/\\]/).pop();
  if (!existsSync(absPath)) {
    const archivedAbsPath = findExistingArchivedTicketPath(ticketDir, found, fileName);
    if (archivedAbsPath) {
      const storage = archiveStorageFromPath(ticketDir, archivedAbsPath, found);
      const entryIdx = indexJson.entries.findIndex(e => e.id === found.id);
      if (entryIdx >= 0) {
        indexJson.entries[entryIdx].fileName = fileName;
        indexJson.entries[entryIdx].status = "archived";
        indexJson.entries[entryIdx].archiveYearMonth = storage.archiveYearMonth;
        indexJson.entries[entryIdx].updatedAt = new Date().toISOString();
      }
      const archivedRelativePath = toRepoRelativePath(cwd, archivedAbsPath);
      if (!isCompactTicketOutput(opts)) {
        console.warn("ticket archive: repaired already archived ticket " + archivedRelativePath);
      }
      return { id: found.id, path: archivedRelativePath, repaired: true };
    }
    if (String(found.status || "").toLowerCase() === "closed" && found.archiveYearMonth) {
      const entryIdx = indexJson.entries.findIndex(e => e.id === found.id);
      if (entryIdx >= 0) {
        indexJson.entries[entryIdx].fileName = fileName;
        indexJson.entries[entryIdx].status = "archived";
        indexJson.entries[entryIdx].updatedAt = new Date().toISOString();
      }
      const archivedRelativePath = computeTicketPath({
        ...found,
        fileName,
        status: "archived"
      });
      if (!isCompactTicketOutput(opts)) {
        console.warn("ticket archive: normalized stale closed ticket metadata " + archivedRelativePath);
      }
      return { id: found.id, path: archivedRelativePath, normalized: true };
    }
    throw new Error("ticket archive: file not found " + found.path);
  }

  const originalBody = readFileSync(absPath, "utf8");
  const { meta: archiveMeta } = parseFrontMatter(originalBody);
  const { archiveDir, archiveYearMonth, newAbsPath } = getArchiveDestination(ticketDir, found, fileName);
  if (!opts.dryRun) mkdirSync(archiveDir, { recursive: true });

  const bodyLines = originalBody.trimEnd().split(/\r?\n/);
  const reportSrc = resolveArchiveReport(cwd, fileName, report);
  let reportDest = null;

    if (reportSrc) {
      if (!existsSync(reportSrc)) {
        throw new Error("ticket archive: report file not found " + report);
      }
      const reportDir = join(cwd, AGENT_ROOT_DIR, "docs", "plan");
    if (!opts.dryRun) mkdirSync(reportDir, { recursive: true });

    const reportBaseName = fileName.replace(/\.md$/i, "-report.md");
    reportDest = join(reportDir, reportBaseName);
    if (!opts.dryRun) copyFileSync(reportSrc, reportDest);
    if (!isCompactTicketOutput(opts)) {
      console.log("ticket archive: copied report to " + toFileUri(reportDest));
    }

    bodyLines.push("");
    bodyLines.push("## 📄 Attached Report");
    const relativeLink = toPosixPath(relative(dirname(newAbsPath), reportDest));
    bodyLines.push(`- [View Report](${relativeLink})`);
  }

  if (opts.dryRun) {
    if (!isCompactTicketOutput(opts)) {
      console.log("ticket archive: would move " + toRepoRelativePath(cwd, absPath) + " to " + toRepoRelativePath(cwd, newAbsPath));
    }
    return { dryRun: true };
  }

  writeFileSync(newAbsPath, bodyLines.join("\n") + "\n", "utf8");
  rmSync(absPath);
  try {
    runTicketLifecycleQualityGate(cwd, {
      ticketAbsPath: newAbsPath,
      extraTargets: reportDest ? [reportDest] : [],
      context: `ticket archive ${found.id}`
    });
  } catch (err) {
    rmSync(newAbsPath, { force: true });
    writeFileSync(absPath, originalBody, "utf8");
    if (reportDest) rmSync(reportDest, { force: true });
    throw err;
  }

  distillKnowledge(absPath, found.id, cwd, originalBody);
  if (!isCompactTicketOutput(opts)) {
    console.log("ticket archive: moved ticket to " + toFileUri(newAbsPath));
  }

  const entryIdx = indexJson.entries.findIndex(e => e.id === found.id);
  if (entryIdx >= 0) {
    indexJson.entries[entryIdx].fileName = fileName;
    indexJson.entries[entryIdx].status = "archived";
    indexJson.entries[entryIdx].archiveYearMonth = archiveYearMonth;
    indexJson.entries[entryIdx].updatedAt = new Date().toISOString();
  }

  const archivedRelativePath = toRepoRelativePath(cwd, newAbsPath);
  if (!isCompactTicketOutput(opts)) {
    console.log("ticket archive: final ticket path " + archivedRelativePath);
  }
  return { id: found.id, path: archivedRelativePath };
}

function autoArchiveDoneTickets(cwd, indexJson, opts = {}) {
  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) return [];

  const candidates = (indexJson.entries || [])
    .filter(isAutoArchivableDoneEntry)
    .sort(oldestFirst);
  const archived = [];

  for (const candidate of candidates) {
    const result = archiveTicketEntry({ cwd, ticketDir, indexJson, found: candidate, opts, report: null });
    if (result?.id) {
      archived.push(result);
      if (!isCompactTicketOutput(opts)) {
        console.warn(`[AUTO-ARCHIVE] ${candidate.id} (${candidate.status}) archived before open-ticket limit check.`);
      }
    }
  }

  if (archived.length > 0) {
    writeTicketIndexJson(cwd, indexJson, opts);
  }

  return archived;
}

function canAutoArchiveOpenLimit(indexJson) {
  const openRows = (indexJson.entries || []).filter(isOpenTicketEntry);
  if (openRows.length <= MAX_OPEN_TICKETS) {
    return { needed: 0, candidates: [], ok: true };
  }

  const candidates = selectOpenLimitCandidates(indexJson);
  const needed = openRows.length - MAX_OPEN_TICKETS;
  return {
    needed,
    candidates,
    ok: candidates.length >= needed
  };
}

function autoArchiveOpenLimitTickets(cwd, indexJson, opts = {}) {
  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) return [];

  const { needed, candidates, ok } = canAutoArchiveOpenLimit(indexJson);
  if (needed <= 0 || !ok) return [];

  const archived = [];
  console.warn("[AUTO-CLEANUP] Open-ticket limit reached. 자동으로 티켓 정리를 진행하겠습니다.");
  for (const candidate of candidates.slice(0, needed)) {
    const result = archiveTicketEntry({ cwd, ticketDir, indexJson, found: candidate, opts, report: null });
    if (result?.id) {
      archived.push(result);
      if (!isCompactTicketOutput(opts)) {
        console.warn(`[AUTO-CLEANUP] ${candidate.id} archived to stay within the open-ticket limit.`);
      }
    }
  }

  if (archived.length > 0) {
    writeTicketIndexJson(cwd, indexJson, opts);
  }

  return archived;
}

function rollbackCreatedTicket(cwd, abs, rollbackIndexJson, opts = {}) {
  if (opts.dryRun) return;
  rmSync(abs, { force: true });
  writeTicketIndexJson(cwd, rollbackIndexJson, opts);
}

function buildCreateRollbackIndex(currentIndexJson, ticketId, previousIndexJson) {
  return {
    ...currentIndexJson,
    activeTicketId: previousIndexJson.activeTicketId || "",
    entries: (currentIndexJson.entries || []).filter(entry => entry.id !== ticketId)
  };
}

export async function runTicketCreate(opts) {
  applyTicketRootContext(opts, { createIfMissing: true });
  opts = hydrateCreateTextInputs(opts);
  if (!opts.topic && !opts.ref) throw new Error("ticket create requires --topic or --ref");
  const inferred = opts.ref ? inferRefTitleAndTopic(opts) : null;
  const title = opts.topic || inferred?.title || "ticket";
  const topic = requireNonEmptySlug(opts.topic || inferred?.topic || title, "ticket topic");
  const group = toSlug(opts.group || "sub");

  await ensurePhase0Validation(opts);

  let path, source;
  if (opts.ref) {
    path = resolveReferencedTicketPath(opts);
    source = "ticket-reference";
  } else {
    // Find nearest or create in CWD if missing
    const ticketDir = detectConsumerTicketDir(opts.cwd, { createIfMissing: true });

    let parsedPlan = null;
    let finalTitle = title;
    let finalTopic = topic;
    
    if (typeof opts.planBody === "string" && opts.planBody.trim()) {
      parsedPlan = parsePlan("inline-plan-body.md", opts.planBody);

      finalTitle = opts.topic || parsedPlan.title || title;
      finalTopic = requireNonEmptySlug(finalTitle, "ticket topic");
    }

    const indexJson = readTicketIndexJson(opts.cwd);

    // Smart close: check previous active ticket's completion state before deciding
    const activeId = indexJson.activeTicketId;
    if (activeId) {
      const activeEntry = indexJson.entries.find(e => e.id === activeId && (e.status === "open" || e.status === "active"));
      if (activeEntry) {
        const absPath = join(opts.cwd, activeEntry.path);
        let shouldClose = false;
        let reason = "";

        if (existsSync(absPath)) {
          try {
            const body = readFileSync(absPath, "utf8");
            const { meta, content } = parseFrontMatter(body);

            // Count checklist items
            const checked = (content.match(/- \[x\]/gi) || []).length;
            const unchecked = (content.match(/- \[ \]/g) || []).length;
            const total = checked + unchecked;
            const allDone = total > 0 && unchecked === 0;
            const phase = meta.phase || 1;

            if (phase >= 3 && allDone) {
              shouldClose = true;
              reason = `phase=${phase}, tasks=${checked}/${total} done`;
            } else if (allDone && total > 0) {
              shouldClose = true;
              reason = `all tasks done (${checked}/${total}), phase=${phase}`;
            } else {
              reason = `phase=${phase}, tasks=${checked}/${total} done`;
            }
          } catch (err) {
            reason = "could not read ticket file";
          }
        }

        if (shouldClose) {
          if (opts.dryRun) {
            if (!isCompactTicketOutput(opts)) {
              console.log(`[DRY-RUN] Would auto-close ${activeId} (${reason}).`);
            }
          } else {
            activeEntry.status = "closed";
            activeEntry.updatedAt = new Date().toISOString();
            // Sync to frontmatter
            if (existsSync(absPath)) {
              try {
                const body = readFileSync(absPath, "utf8");
                const parsed = parseFrontMatter(body);
                parsed.meta.status = "closed";
                parsed.meta.phase = 4;
                writeFileSync(absPath, stringifyFrontMatter(parsed.meta, parsed.content), "utf8");
              } catch (err) { /* skip */ }
            }
            writeTicketIndexJson(opts.cwd, indexJson, opts);
            if (!isCompactTicketOutput(opts)) {
              console.log(`[AUTO-CLOSE] ${activeId} completed (${reason}).`);
            }
          }
        } else {
          if (!isCompactTicketOutput(opts)) {
            console.warn(`[NOTICE] Switching from ${activeId} (${reason}). Ticket stays open.`);
          }
        }
      }
    }




    const ticketId = generateTicketId(finalTopic, indexJson.entries);
    const finalFileName = `${ticketId}.md`;

    const abs = join(ticketDir, group, finalFileName);
    if (!opts.dryRun) mkdirSync(join(ticketDir, group), { recursive: true });
    path = toRepoRelativePath(opts.cwd, abs);

    let prevTicketEntry = null;
    if (opts.chain) {
      prevTicketEntry = pickTicketEntry({ latest: true }, indexJson);
    }

    const summary = (opts.summary || parsedPlan?.summary || finalTitle || finalTopic || "ticket").trim();

    const promptText = [summary, finalTitle, parsedPlan?.body].filter(Boolean).join("\n");
    const docsLanguage = resolveTicketDocsLanguage(opts.cwd, opts.docsLanguage, promptText);

    const rawMeta = {
      id: ticketId,
      title: finalTitle,
      phase: 1,
      status: "open",
      lifecycleSource: "ticket-create",
      submodule: opts.submodule,
      project: opts.project === "global" ? undefined : opts.project,
      docsLanguage,
      evidence: opts.evidence,
      summary,
      priority: opts.priority || "P2",
      tags: opts.tags
        ? opts.tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
        : [],
      createdAt: new Date().toISOString().replace('T', ' ').split('.')[0],
      prevTicket: prevTicketEntry ? prevTicketEntry.id : undefined,
    };

    const meta = Object.fromEntries(Object.entries(rawMeta).filter(([k, v]) => {
      if (k === 'summary') return v !== undefined; // summary는 필수이므로 undefined만 아니면 유지
      return v !== undefined && v !== "";
    }));
    const frontmatter = YAML.stringify(meta).trim();

    let finalContent = "";
    if (parsedPlan) {
      const planReasons = getPhase1PlanBodyReasons(parsedPlan.body);
      if (planReasons.length > 0) {
        throw new Error(buildPlanBodyRequiredMessage(planReasons));
      }
      finalContent = `---\n${frontmatter}\n---\n${parsedPlan.body}`;
    } else {
      throw new Error(buildPlanBodyRequiredMessage(["plan_body_file_required"]));
    }
    finalContent = injectTicketContent(finalContent, opts.content, docsLanguage);

    let rollbackIndexJson = indexJson;

    if (!opts.dryRun) writeFileSync(abs, finalContent, "utf8");
    source = "ticket-create";

    try {
      if (!opts.dryRun) {
        runTicketLifecycleQualityGate(opts.cwd, {
          ticketAbsPath: abs,
          context: `ticket create ${ticketId}`
        });
      }

      if (opts.dryRun) {
        const simulatedIndexJson = {
          ...indexJson,
          entries: [
            ...(indexJson.entries || []),
            {
              id: ticketId,
              title,
              topic,
              group,
              project: opts.project || "global",
              createdAt: new Date().toISOString(),
              path,
              source,
              status: "open"
            }
          ]
        };
        const autoArchiveCheck = canAutoArchiveOpenLimit(simulatedIndexJson);
        const limitError = autoArchiveCheck.ok ? null : buildOpenTicketLimitError(simulatedIndexJson);
        if (limitError) {
          throw new Error(limitError);
        }
      }

      appendTicketEntry(opts.cwd, {
        id: ticketId,
        title, topic, group, project: opts.project || "global",
        createdAt: new Date().toISOString(), path, source
      }, opts);

      const limitIndexJson = readTicketIndexJson(opts.cwd);
      autoArchiveOpenLimitTickets(opts.cwd, limitIndexJson, opts);

      const limitError = buildOpenTicketLimitError(readTicketIndexJson(opts.cwd));
      if (limitError) {
        rollbackIndexJson = buildCreateRollbackIndex(readTicketIndexJson(opts.cwd), ticketId, indexJson);
        throw new Error(limitError);
      }
    } catch (err) {
      if (!opts.dryRun) {
        rollbackCreatedTicket(opts.cwd, abs, rollbackIndexJson, opts);
      }
      throw err;
    }

    if (!opts.dryRun) {
      const linkedPrev = updatePreviousTicketRef(opts.cwd, prevTicketEntry, ticketId);
      if (linkedPrev && !isCompactTicketOutput(opts)) {
        console.log(`Linked to previous ticket: ${linkedPrev}`);
      }
    }

    console.log(`${opts.dryRun ? "Ticket would be created" : "Ticket created"}: ${toFileUri(abs)}`);
    printTicketStartLine(ticketId, abs);
    if (!opts.dryRun) {
      printCreateApprovalGate(ticketId, opts);
    }
    printUsageReminder(opts.cwd, opts);
    if (!opts.dryRun) {
      appendTelemetryEvent(opts.cwd, {
        event: "ticket_created",
        action: "ticket-create",
        ticket: ticketId,
        file: path,
        phase: 1,
        status: "open"
      });
    }
    
    // Remote Sync Hook
    const configSync = loadInitConfig(opts.cwd);
    if (!opts.dryRun && configSync && configSync.remoteSync && configSync.pipelineUrl) {
      syncToPipeline(configSync.pipelineUrl, { action: "create", ticket: meta });
    }
  }

  syncActiveTicketId(opts.cwd, opts);
}

export async function runTicketList(opts) {
  applyTicketRootContext(opts);
  const ticketDir = detectConsumerTicketDir(opts.cwd);
  if (!ticketDir) {
    throw new Error("No ticket system found. Please run 'npx deuk-agent-flow init' first.");
  }
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
  syncActiveTicketId(opts.cwd);
  let rows = index.entries;

  
  if (opts.active) {
    rows = rows.filter(e => e.status === "active" || e.status === "open");
  } else if (opts.archived) {
    rows = rows.filter(e => e.status === "archived");
  } else if (!opts.all) {
    // Default: major/active list (open or active)
    rows = rows.filter(e => e.status === "open" || e.status === "active");
  }
  
  if (opts.group) rows = rows.filter(e => e.group === opts.group);
  if (opts.project) rows = rows.filter(e => e.project === opts.project);
  if (opts.submodule) rows = rows.filter(e => e.submodule === opts.submodule);
  
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log("#  STATUS   SUBMODULE   GROUP       PROJECT     CREATED                  TITLE");
  rows.slice(0, opts.limit).forEach((e, idx) => {
    const stat = (e.status === "closed" ? "[x]" : "[ ]").padEnd(7);
    const sub = (e.submodule || "-").padEnd(11);
    const safeTitle = String(e.title || e.topic || "").replace(/(\n|\\n)+/g, " ").slice(0, 50);
    console.log(`${String(idx+1).padEnd(2)} ${stat} ${sub} ${String(e.group||"").padEnd(10)} ${String(e.project||"").padEnd(11)} ${String(e.createdAt||"").padEnd(24)} ${safeTitle}`);
  });
  
  if (opts.render) {
    console.log("ticket list --render is deprecated; TICKET_LIST.md is no longer generated.");
  }
}

export async function runTicketStatus(opts) {
  applyTicketRootContext(opts);
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
  const found = pickTicketEntry(opts, index);
  if (!found) throw new Error("ticket status: no matching ticket found");

  const absPath = join(opts.cwd, found.path);
  const fileMissing = !existsSync(absPath);
  const body = fileMissing ? "" : readFileSync(absPath, "utf8");
  const parsed = fileMissing ? { meta: {}, content: "" } : parseFrontMatter(body);
  if (!fileMissing) assertTicketLifecycleProvenance(found, parsed.meta);
  const phase = Number(parsed.meta.phase || 1);
  const incompleteReasons = getPhase1IncompleteReasons(opts.cwd, absPath);
  const derivedStatus = incompleteReasons.length > 0 && phase === 1
    ? "phase1_incomplete"
    : (parsed.meta.status || found.status || "open");

  const out = {
    id: found.id,
    title: found.title,
    path: found.path,
    phase,
    status: derivedStatus,
    summary: parsed.meta.summary || null,
    reasons: incompleteReasons,
  };

  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (isCompactTicketOutput(opts)) {
    const reasonText = out.reasons.length === 0 ? "ok" : out.reasons.join(", ");
    console.log(`${out.id} | phase=${out.phase} | status=${out.status} | ${reasonText}`);
    printUsageReminder(opts.cwd, opts);
    return;
  }

  console.log(`Ticket: ${out.id}`);
  console.log(`Status: ${out.status}`);
  console.log(`Phase: ${out.phase}`);
  console.log(`Path: ${out.path}`);
  printTicketStartLine(out.id, absPath);
  if (opts.statusDetail || out.reasons.length > 0) {
    if (out.reasons.length === 0) console.log("Reasons: none");
    else console.log(`Reasons: ${out.reasons.join(", ")}`);
  }
  printUsageReminder(opts.cwd, opts);
}

export async function runTicketGuard(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (!opts.topic && !opts.latest) {
    throw new Error("ticket guard: --topic or --latest is required before set_workflow_context.");
  }

  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
  const found = pickTicketEntry(opts, index);
  if (!found) {
    throw new Error("ticket guard: no matching durable ticket found; do not call set_workflow_context.");
  }

  const absPath = join(opts.cwd, found.path);
  if (!existsSync(absPath)) {
    throw new Error(`ticket guard: durable ticket file missing for ${found.id || found.topic}; do not call set_workflow_context.`);
  }

  const body = readFileSync(absPath, "utf8");
  const parsed = parseFrontMatter(body);
  assertTicketLifecycleProvenance(found, parsed.meta);

  const phase = Number(parsed.meta.phase || 1);
  const reasons = getPhase1IncompleteReasons(opts.cwd, absPath);
  if (phase === 1 && reasons.length > 0) {
    throw new Error(`[VALIDATION FAILED] ticket guard rejected incomplete Phase 1 for ${found.id || found.topic}: ${reasons.join(", ")}. Do not call set_workflow_context until the durable ticket is complete.`);
  }
  if (!opts.ticketStarted) {
    throw new Error(`[ACK REQUIRED] ticket guard blocked ${found.id || found.topic}: relay this clickable ticket-start line to chat before set_workflow_context: ${formatTicketStartLine(found.id || found.topic, absPath)}. Re-run with --ticket-started only after the ticket link has been shared with the user.`);
  }
  if (!opts.ticketReviewed) {
    throw new Error(`[REVIEW REQUIRED] ticket guard blocked ${found.id || found.topic}: reopen and review the durable ticket body before set_workflow_context. Re-run with --ticket-reviewed only after checking the ticket scope, APC, plan, and verification criteria.`);
  }
  if (!hasExplicitExecutionApproval(opts)) {
    throw new Error(`[APPROVAL REQUIRED] ticket guard blocked ${found.id || found.topic}: explicit user approval is required before set_workflow_context. Re-run with --approval approved only after the user approves the ticket scope and Phase 1 plan.`);
  }

  const out = {
    id: found.id,
    topic: found.topic,
    phase,
    status: parsed.meta.status || found.status || "open",
    path: found.path
  };

  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`ticket-context-ok ${out.id} | phase=${out.phase} | status=${out.status} | ${out.path}`);
  }
  return out;
}

export async function runTicketHandoff(opts) {
  applyTicketRootContext(opts);
  if (!opts.topic && !opts.latest) opts.latest = true;
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
  const current = pickTicketEntry(opts, index);
  if (!current) throw new Error("ticket handoff: no matching ticket found");

  const currentAbs = join(opts.cwd, current.path);
  const currentMissing = !existsSync(currentAbs);
  const currentBody = currentMissing ? "" : readFileSync(currentAbs, "utf8");
  const currentParsed = currentMissing ? { meta: {}, content: "" } : parseFrontMatter(currentBody);
  const currentPhase = Number(currentParsed.meta.phase || 1);
  const currentReasons = currentMissing ? ["ticket_file_missing"] : getPhase1IncompleteReasons(opts.cwd, currentAbs);
  const currentStatus = currentReasons.length > 0 && currentPhase === 1
    ? "phase1_incomplete"
    : (currentParsed.meta.status || current.status || "open");

  const rows = filterTicketEntries(index.entries, opts)
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  let nextTicket = rows.find(e => e.status === "active" && e.id !== current.id);
  if (!nextTicket) nextTicket = rows.find(e => e.status === "open" && e.id !== current.id);

  const out = {
    current: {
      id: current.id,
      phase: currentPhase,
      status: currentStatus,
      path: current.path,
      reasons: currentReasons
    },
    nextTicket: nextTicket ? {
      id: nextTicket.id,
      status: nextTicket.status,
      path: nextTicket.path
    } : null,
    nextAction: nextTicket ? "continue-ticket" : "inspect-git-history",
    telemetry: (() => {
      const summary = buildTelemetrySummary(opts.cwd);
      if (!summary) return null;
      return {
        logEntries: summary.logEntries,
        coverageRate: summary.eventCoverageRate,
        tdwCoverageRate: summary.tdwCoverageRate,
        totalTokens: summary.totalTokens
      };
    })(),
    telemetrySummary: getTelemetryCompactSummary(opts.cwd)
  };

  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return out;
  }

  if (isCompactTicketOutput(opts)) {
    console.log(getHandoffSummary(out));
    return out;
  }

  console.log(`Current: ${out.current.id} | phase=${out.current.phase} | status=${out.current.status}`);
  console.log(`Next: ${out.nextTicket ? `${out.nextTicket.id} (${out.nextTicket.status})` : "none"}`);
  console.log(`Action: ${out.nextAction}`);
  return out;
}

export async function runTicketMeta(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
  const found = pickTicketEntry(opts, index);
  if (!found) throw new Error("ticket meta: no matching ticket found");

  if (opts.json) {
    console.log(JSON.stringify(found, null, 2));
  } else {
    console.log(`Ticket Meta [${found.topic}]`);
    Object.entries(found).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  }
}

export async function runTicketConnect(opts) {
  applyTicketRootContext(opts);
  const config = loadInitConfig(opts.cwd);
  const url = opts.remote || config?.pipelineUrl;
  if (!url) throw new Error("ticket connect: no pipeline URL configured or provided via --remote");

  console.log(`Connecting to AI Pipeline at ${url} ...`);
  const success = await syncToPipeline(url, { action: "ping", timestamp: new Date().toISOString() });
  if (success) {
    console.log("SUCCESS: Pipeline is reachable.");
  } else {
    console.error("FAILED: Could not connect to pipeline or returned non-OK status.");
  }
}

export async function runTicketEvidenceCheck(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (!opts.claim || !String(opts.claim).trim()) {
    throw new Error("ticket evidence requires --claim <text> to compare with ticket content.");
  }

  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
  const target = pickTicketEntry(opts, index);
  if (!target) {
    throw new Error("ticket evidence: no matching ticket found.");
  }

  const absPath = join(opts.cwd, target.path);
  if (!existsSync(absPath)) throw new Error("Ticket file not found: " + target.path);
  const { meta, content } = parseFrontMatter(readFileSync(absPath, "utf8"));
  const result = getClaimEvidenceResult(target, meta, content, opts.claim);
  const implementationGuard = getImplementationClaimGuardResult(opts.cwd, { claim: opts.claim, content, changedFiles: opts.changedFiles });

  if (!result.ok || !implementationGuard.ok) {
    const reasons = [...result.reasons, ...(implementationGuard.reasons || [])];
    throw new Error(`[VALIDATION FAILED] Ticket ${target.topic} has insufficient evidence coverage for claim "${opts.claim}": ${reasons.join(", ")}.`);
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[evidence-ok] ${target.topic} claim coverage ${result.coveredTerms}/${result.claimTerms}`);
  }
}

export async function runTicketEvidenceReport(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (!opts.claim || !String(opts.claim).trim()) {
    throw new Error("ticket report requires --claim <text> when generating a claim-bound report.");
  }

  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
  const target = pickTicketEntry(opts, index);
  if (!target) {
    throw new Error("ticket report: no matching ticket found.");
  }

  const absPath = join(opts.cwd, target.path);
  if (!existsSync(absPath)) throw new Error("Ticket file not found: " + target.path);
  const { meta, content } = parseFrontMatter(readFileSync(absPath, "utf8"));
  const result = getClaimEvidenceResult(target, meta, content, opts.claim);
  const implementationGuard = getImplementationClaimGuardResult(opts.cwd, { claim: opts.claim, content, changedFiles: opts.changedFiles });

  if (!result.ok || !implementationGuard.ok) {
    const reasons = [...result.reasons, ...(implementationGuard.reasons || [])];
    throw new Error(`[VALIDATION FAILED] Ticket ${target.topic} cannot produce claim-bound report for "${opts.claim}": ${reasons.join(", ")}.`);
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Claim-bound ticket report: ${target.topic}`);
  console.log(`Claim: ${opts.claim}`);
  console.log(`Coverage: ${result.coveredTerms}/${result.claimTerms}`);
  for (const [label, value] of Object.entries(result.sections)) {
    if (!value) continue;
    console.log(`\n## ${label}`);
    console.log(value);
  }
}


export async function runTicketClose(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (!opts.topic && !opts.latest) {
    if (opts.nonInteractive || !process.stdout.isTTY) {
      opts.latest = true;
    } else {
      await withReadline(async (rl) => {
        const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
        const choices = index.entries
          .filter(e => e.status !== "closed" && e.status !== "cancelled")
          .map(e => ({ label: `[${e.group}] ${e.title}`, value: e.topic }));
        if (choices.length > 0) {
          opts.topic = await selectOne(rl, "Choose a ticket to close:", choices);
        } else {
          throw new Error("No open tickets found to close.");
        }
      });
    }
  }
  // Respect --status flag (e.g. 'cancelled', 'wontfix'); default to 'closed'
  if (!opts.status) opts.status = "closed";
  const previousIndex = readTicketIndexJson(opts.cwd);
  const targetEntry = pickTicketEntry(opts, previousIndex);
  if (!targetEntry) {
    throw new Error("No matching ticket found to update status");
  }

  const abs = join(opts.cwd, targetEntry.path);
  if (!existsSync(abs)) throw new Error("Ticket file not found: " + targetEntry.path);
  const previousBody = readFileSync(abs, "utf8");
  const parsedForClose = parseFrontMatter(previousBody);
  const closePlanningReasons = getCloseLifecycleReasons(parsedForClose.meta, parsedForClose.content);
  const implementationGuard = getImplementationClaimGuardResult(opts.cwd, { content: parsedForClose.content, changedFiles: opts.changedFiles });
  if (!implementationGuard.ok) {
    closePlanningReasons.push(...implementationGuard.reasons);
  }
  if (closePlanningReasons.length) {
    throw new Error(`[VALIDATION FAILED] Ticket ${targetEntry.topic} cannot close without complete main-ticket analysis/design evidence: ${[...new Set(closePlanningReasons)].join(", ")}.`);
  }

  try {
    const entry = updateTicketEntryStatus(opts.cwd, opts);
    const { meta } = parseFrontMatter(previousBody);
    runTicketLifecycleQualityGate(opts.cwd, {
      ticketAbsPath: abs,
      context: `ticket close ${entry.topic}`
    });
    syncActiveTicketId(opts.cwd);
    appendTelemetryEvent(opts.cwd, {
      event: "ticket_closed",
      action: "ticket-close",
      ticket: entry.id || entry.topic,
      file: entry.path,
      phase: 4,
      status: opts.status
    });
    console.log(`ticket: ${opts.status} -> ${entry.topic} (${entry.path})`);
  } catch (err) {
    rollbackTicketLifecycleArtifacts(opts.cwd, previousIndex, previousBody, abs, opts);
    throw err;
  }
}

export async function runTicketUse(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
  const scopedEntries = filterTicketEntries(index.entries, opts);
  
  let targetTopic = opts.topic;
  if (!targetTopic && !opts.latest) {
    if (opts.nonInteractive) {
      throw new Error("ticket use: --topic or --latest is required in non-interactive mode.");
    }
    await withReadline(async (rl) => {
      const choices = scopedEntries
        .map(e => ({ label: `${e.status === 'closed' ? '✓ ' : ''}[${e.group}] ${e.title}`, value: e.topic }));
      if (choices.length > 0) {
        targetTopic = await selectOne(rl, "Choose a ticket to use:", choices);
      }
    });
  }

  const found = opts.latest ? scopedEntries[0] : scopedEntries.find(e =>
    String(e.topic || "").includes(targetTopic) ||
    String(e.id || "").includes(targetTopic)
  );
  if (!found) {
    const candidates = buildUseFallbackCandidates(index, opts);
    if (!opts.nonInteractive && candidates.length > 0) {
      await withReadline(async (rl) => {
        targetTopic = await selectOne(
          rl,
          `No matching ticket found for "${targetTopic}". Choose a ticket to use:`,
          candidates.map(e => ({ label: formatTicketChoice(e), value: e.topic || e.id }))
        );
      });
      const selected = index.entries.find(e => e.topic === targetTopic || e.id === targetTopic);
      if (selected) {
        opts.topic = targetTopic;
        return runTicketUse({ ...opts, latest: false });
      }
    }
    throw new Error(buildUseNoMatchError(targetTopic, candidates));
  }

  const foundAbsPath = join(opts.cwd, found.path);
  if (!existsSync(foundAbsPath)) throw new Error("Ticket file not found: " + found.path);
  const foundParsed = parseFrontMatter(readFileSync(foundAbsPath, "utf8"));
  assertTicketLifecycleProvenance(found, foundParsed.meta);
  
  // Explicitly set activeTicketId to the selected ticket
  if (index.activeTicketId !== found.id) {
    writeTicketIndexJson(opts.cwd, { ...index, activeTicketId: found.id });
  }

  const absPath = toPosixPath(join(opts.cwd, found.path));
  if (isCompactTicketOutput(opts) || opts.pathOnly) {
    printTicketSelectionLine(found.id, absPath, opts);
  } else {
    const posixPath = toPosixPath(found.path);
    console.log(`Active ticket: ${found.id}`);
    console.log(`Path: [${posixPath}](file://${absPath})`);
    printTicketStartLine(found.id, absPath);
    if (opts.printContent) console.log("\n" + readFileSync(join(opts.cwd, found.path), "utf8"));
    printUsageReminder(opts.cwd, opts);
  }
}



function extractMarkdownSections(content, sectionNames) {
  const sections = {};
  for (const name of sectionNames) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^##\\s+${escapedName}\\s*\\n([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "im");
    const match = content.match(regex);
    if (match) {
      const value = match[1].trim();
      if (value) sections[name] = value;
    }
  }
  return sections;
}

function distillKnowledge(absPath, ticketId, cwd, sourceBody = null) {
  try {
    const body = sourceBody !== null ? sourceBody : readFileSync(absPath, "utf8");
    const { meta, content } = parseFrontMatter(body);
    const ticketSections = extractMarkdownSections(content, [
      "Scope & Constraints",
      "Agent Permission Contract (APC)",
      "Compact Plan",
      "Tasks",
      "Done When",
      "Design Decisions",
      "Analysis & Constraints"
    ]);
    const knowledgeDir = join(cwd, AGENT_ROOT_DIR, "knowledge");
    if (!existsSync(knowledgeDir)) mkdirSync(knowledgeDir, { recursive: true });

    const dest = join(knowledgeDir, `${ticketId}.json`);
    const data = {
      id: ticketId,
      title: meta.title || ticketId,
      project: meta.project || "global",
      createdAt: meta.createdAt,
      archivedAt: new Date().toISOString(),
      summary: meta.summary || "",
      sourceKind: "ticket",
      ingestionCategory: "archived_ticket",
      corpus: "tickets",
      originTool: "ticket-archive",
      freshness: "archived",
      refreshPolicy: "refresh-on-stale",
      sourceTicketPath: toRepoRelativePath(cwd, absPath),
      sections: ticketSections,
      analysis: {}
    };

    writeFileSync(dest, JSON.stringify(data, null, 2), "utf8");
    console.log(`Knowledge distilled to ${toFileUri(dest)}`);
    appendTelemetryEvent(cwd, {
      event: "knowledge_distilled",
      action: "knowledge-distill",
      ticket: ticketId,
      file: toRepoRelativePath(cwd, absPath),
      knowledgeAction: "add_knowledge",
      knowledgeSourceKind: data.sourceKind,
      knowledgeIngestionCategory: data.ingestionCategory,
      knowledgeCorpus: data.corpus,
      knowledgeOriginTool: data.originTool,
      knowledgeFreshness: data.freshness,
      tokenQuality: "saved"
    });
  } catch (err) {
    console.warn(`[WARNING] Knowledge distillation failed for ${ticketId}: ${err.message}`);
  }
}

function appendTelemetryEvent(cwd, entry) {
  try {
    appendInternalWorkflowEvent(cwd, {
      event: entry.event || "workflow_event",
      ticket: entry.ticket || "",
      action: entry.action || entry.event || "workflow-event",
      file: entry.file || "",
      phase: entry.phase,
      status: entry.status || "",
      ragResult: entry.ragResult || "",
      localFallback: Boolean(entry.localFallback),
      knowledgeAction: entry.knowledgeAction || "",
      knowledgeSourceKind: entry.knowledgeSourceKind || "",
      knowledgeIngestionCategory: entry.knowledgeIngestionCategory || "",
      knowledgeCorpus: entry.knowledgeCorpus || "",
      knowledgeOriginTool: entry.knowledgeOriginTool || "",
      knowledgeFreshness: entry.knowledgeFreshness || "",
      tokenQuality: entry.tokenQuality || "",
      savedTokens: Number(entry.savedTokens || 0)
    });
  } catch (err) {
    console.warn(`[WARNING] Telemetry append failed for ${entry.ticket || "unknown"}: ${err.message}`);
  }
}

export function pickTicketEntry(opts, indexJson) {
  const rows = filterTicketEntries(indexJson.entries, opts)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  if (rows.length === 0) return null;
  if (opts.topic) {
    const key = String(opts.topic).toLowerCase();
    return rows.find(e => 
      String(e.topic || "").toLowerCase().includes(key) || 
      String(e.id || "").toLowerCase().includes(key)
    ) || null;
  }
  return rows[0];
}

function filterTicketEntries(entries, opts = {}) {
  return [...(entries || [])].filter(entry => {
    if (opts.project && entry.project !== opts.project) return false;
    if (opts.submodule && entry.submodule !== opts.submodule) return false;
    return true;
  });
}

export async function runTicketArchive(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  const indexJson = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
  const ticketDir = detectConsumerTicketDir(opts.cwd);

  if (!opts.latest && !opts.topic) {
    if (opts.nonInteractive) {
      throw new Error("ticket archive: --topic or --latest is required in non-interactive mode.");
    }
    await withReadline(async (rl) => {
      const choices = indexJson.entries
        .filter(e => e.status !== "archived")
        .map(e => ({ label: `[${e.group}] ${e.title}`, value: e.topic }));
      if (choices.length > 0) {
        opts.topic = await selectOne(rl, "Choose a ticket to archive (this will move the file to archive/):", choices);
      } else {
        throw new Error("No active tickets found to archive.");
      }
    });
  }
  
  const found = pickTicketEntry(opts, indexJson);
  if (!found) throw new Error("ticket archive: no matching entry");

  const fileName = found.path.split(/[/\\]/).pop();
  
  // Auto-search for report if not provided
  let report = opts.report;
  if (!opts.report) {
    const reportDir = join(opts.cwd, AGENT_ROOT_DIR, "docs", "plan");
    const potentialReport = fileName.replace(/\.md$/i, "-report.md");
    const potentialPath = join(reportDir, potentialReport);
    if (existsSync(potentialPath)) {
      report = toRepoRelativePath(opts.cwd, potentialPath);
      console.log(`ticket archive: auto-detected report at ${report}`);
    }
  }

  const result = archiveTicketEntry({ cwd: opts.cwd, ticketDir, indexJson, found, opts, report });
  if (opts.dryRun) return;

  writeTicketIndexJson(opts.cwd, indexJson, opts);
  syncActiveTicketId(opts.cwd);
  if (result?.id) {
    appendTelemetryEvent(opts.cwd, {
      event: "ticket_archived",
      action: "ticket-archive",
      ticket: result.id,
      file: result.path,
      status: "archived"
    });
  }
  return result;
}

export async function runTicketDiscard(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  const indexJson = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });

  if (!opts.latest && !opts.topic) {
    if (opts.nonInteractive) {
      throw new Error("ticket discard: --topic or --latest is required in non-interactive mode.");
    }
    await withReadline(async (rl) => {
      const choices = indexJson.entries
        .filter(e => e.status === "open")
        .map(e => ({ label: `[${e.group}] ${e.title}`, value: e.topic }));
      if (choices.length > 0) {
        opts.topic = await selectOne(rl, "Choose an unapproved ticket to discard:", choices);
      } else {
        throw new Error("No open tickets found to discard.");
      }
    });
  }

  const found = pickTicketEntry(opts, indexJson);
  if (!found) throw new Error("ticket discard: no matching entry");

  const absPath = join(opts.cwd, found.path);
  if (!existsSync(absPath)) throw new Error("Ticket file not found: " + found.path);

  const body = readFileSync(absPath, "utf8");
  const { meta } = parseFrontMatter(body);
  const phase = Number(meta.phase || 1);
  const status = String(meta.status || found.status || "open").toLowerCase();
  if (phase >= 2 || status !== "open") {
    throw new Error(`ticket discard: ${found.id || found.topic} is not an unapproved Phase 1 open ticket. Use ticket close/archive for approved or executed work.`);
  }

  if (opts.dryRun) {
    console.log(`ticket discard: would delete ${found.id || found.topic} (${found.path})`);
    return { id: found.id, path: found.path, discarded: false };
  }

  rmSync(absPath, { force: true });
  const nextEntries = (indexJson.entries || []).filter(entry => entry.id !== found.id);
  writeTicketIndexJson(opts.cwd, {
    ...indexJson,
    activeTicketId: indexJson.activeTicketId === found.id ? null : indexJson.activeTicketId,
    entries: nextEntries
  }, opts);
  syncActiveTicketId(opts.cwd);
  appendTelemetryEvent(opts.cwd, {
    event: "ticket_discarded",
    action: "ticket-discard",
    ticket: found.id || found.topic,
    file: found.path,
    phase,
    status: "discarded"
  });
  console.log(`ticket: discarded -> ${found.id || found.topic}`);
  return { id: found.id, path: found.path, discarded: true };
}

export async function runTicketReports(opts) {
  applyTicketRootContext(opts);
  const ticketDir = detectConsumerTicketDir(opts.cwd);
  if (!ticketDir) throw new Error("No ticket system found.");
  const reportDir = join(opts.cwd, AGENT_ROOT_DIR, "docs", "plan");
  console.log("\n📄 Agent Reports:");
  if (!existsSync(reportDir)) {
    console.log("  No reports found.");
    return;
  }
  const files = readdirSync(reportDir).filter(f => f.endsWith("-report.md"));
  if (files.length === 0) {
    console.log("  No reports found.");
    return;
  }
  
  const index = readTicketIndexJson(opts.cwd);
  const sorted = files.sort((a, b) => {
    return statSync(join(reportDir, b)).mtime.getTime() - statSync(join(reportDir, a)).mtime.getTime();
  });
  
  sorted.slice(0, opts.limit || 30).forEach(f => {
    const ticketId = f.replace(/-report\.md$/i, "");
    const entry = index.entries.find(e => e.id === ticketId || e.topic === ticketId);
    const status = entry ? ` [${entry.status}]` : "";
    console.log(`  - [${f}](${toFileUri(join(reportDir, f))})${status}`);
  });
  console.log("");
}

export async function runTicketReportAttach(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (!opts.report) throw new Error("ticket report attach requires --report <file_path>");
  
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
  const found = pickTicketEntry(opts, index);
  if (!found) throw new Error("ticket report attach: no matching ticket found");

  const absTicketPath = join(opts.cwd, found.path);
  if (!existsSync(absTicketPath)) throw new Error("Ticket file not found: " + found.path);

  const reportSrc = resolve(opts.cwd, opts.report);
  if (!existsSync(reportSrc)) throw new Error("Report file not found: " + opts.report);

  const reportDir = join(opts.cwd, AGENT_ROOT_DIR, "docs", "plan");
  if (!opts.dryRun) mkdirSync(reportDir, { recursive: true });

  const ticketFileName = found.path.split(/[/\\]/).pop();
  const reportBaseName = ticketFileName.replace(/\.md$/i, "-report.md");
  const reportDest = join(reportDir, reportBaseName);

  if (!opts.dryRun) {
    copyFileSync(reportSrc, reportDest);
    
    // Update ticket content to link the report
    let body = readFileSync(absTicketPath, "utf8").trimEnd();
    if (!body.includes("## 📄 Attached Report")) {
      const relativeLink = toPosixPath(relative(dirname(absTicketPath), reportDest));
      body += `\n\n## 📄 Attached Report\n- [View Report](${relativeLink})\n`;
      writeFileSync(absTicketPath, body, "utf8");
    }
    console.log(`ticket report: attached ${toRepoRelativePath(opts.cwd, reportSrc)} to ${found.id}`);
  } else {
    console.log(`ticket report: would attach ${toRepoRelativePath(opts.cwd, reportSrc)} to ${found.id}`);
  }
}

export async function runTicketRebuild(opts) {
  applyTicketRootContext(opts, { createIfMissing: true });
  console.log("Rebuilding INDEX.json from markdown files...");
  rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: true, rebuild: true });
}

export async function runTicketMove(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (!opts.topic && !opts.latest) {
    if (opts.nonInteractive) {
      throw new Error("ticket move: --topic or --latest is required in non-interactive mode.");
    }
    opts.latest = true; // Default to latest
  }
  
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
  const entry = pickTicketEntry(opts, index);
  
  if (!entry) throw new Error("No matching ticket found to move.");

  const abs = join(opts.cwd, entry.path);
  if (!existsSync(abs)) throw new Error("Ticket file not found: " + entry.path);

  const previousIndex = readTicketIndexJson(opts.cwd);
  const body = readFileSync(abs, "utf8");
  const { meta, content } = parseFrontMatter(body);

  const currentPhase = meta.phase || 1;
  let nextPhase = opts.next ? currentPhase + 1 : (opts.phase || currentPhase + 1);

  if (currentPhase === 1 && nextPhase >= 2) {
    const reasons = getPhase1IncompleteReasons(opts.cwd, abs);
    const implementationGuard = getImplementationClaimGuardResult(opts.cwd, { content, changedFiles: opts.changedFiles });
    if (!implementationGuard.ok) {
      reasons.push(...implementationGuard.reasons);
    }
    if (reasons.length) {
      throw new Error(`[VALIDATION FAILED] Ticket ${entry.topic} has incomplete Phase 1 planning evidence: ${reasons.join(", ")}. Fill substantive APC and compact plan content before moving to Phase 2.`);
    }
    if (!hasExplicitExecutionApproval(opts)) {
      throw new Error(`[APPROVAL REQUIRED] Ticket ${entry.topic} cannot move from Phase 1 to Phase 2 without explicit review approval. Re-run with --workflow execute or --approval approved after the plan is reviewed.`);
    }
  }

  meta.phase = nextPhase;
  if (nextPhase >= 4) {
    meta.status = "closed";
  } else if (nextPhase >= 2 && (!meta.status || meta.status === "open")) {
    meta.status = "active";
  }

  const newBody = stringifyFrontMatter(meta, content);

  try {
    writeFileSync(abs, newBody, "utf8");

    // Re-sync index to reflect the status change if any
    opts.topic = entry.topic;
    if (meta.status !== entry.status) {
      opts.status = meta.status;
      updateTicketEntryStatus(opts.cwd, opts);
    } else {
      rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: true });
    }

    runTicketLifecycleQualityGate(opts.cwd, {
      ticketAbsPath: abs,
      context: `ticket move ${entry.topic}`
    });

    syncActiveTicketId(opts.cwd);
    appendTelemetryEvent(opts.cwd, {
      event: "ticket_phase_moved",
      action: "ticket-move",
      ticket: entry.id || entry.topic,
      file: entry.path,
      phase: nextPhase,
      status: meta.status
    });
    console.log(`ticket: moved -> ${entry.topic} is now in Phase ${nextPhase} (${meta.status})`);
    printUsageReminder(opts.cwd, opts);
  } catch (err) {
    rollbackTicketLifecycleArtifacts(opts.cwd, previousIndex, body, abs, opts);
    throw err;
  }
}

export async function runTicketNext(opts) {
  applyTicketRootContext(opts);
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
  // Find the first active ticket, or if none, the first open ticket (earliest created)
  const rows = filterTicketEntries(index.entries, opts)
    .filter(entry => isTicketNextRunnableCandidate(opts.cwd, entry))
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  let found = rows.find(e => e.status === "active");
  if (!found) {
    found = rows.find(e => e.status === "open");
  }
  
  if (!found) {
    const latestClosed = filterTicketEntries(index.entries, opts)
      .filter(entry => String(entry.status || "").toLowerCase() === "closed")
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0];
    if (latestClosed) {
      const latestClosedPath = join(opts.cwd, latestClosed.path || computeTicketPath(latestClosed));
      if (existsSync(latestClosedPath)) {
        const { content } = parseFrontMatter(readFileSync(latestClosedPath, "utf8"));
        if (followUpDecisionMeansNoFollowUp(content)) {
          const absPath = toPosixPath(latestClosedPath);
          if (opts.pathOnly) {
            console.log(`no-follow-up:${latestClosed.id}`);
          } else if (isCompactTicketOutput(opts)) {
            console.log(`no-follow-up:${latestClosed.id}`);
          } else {
            const posixPath = toPosixPath(latestClosed.path || computeTicketPath(latestClosed));
            console.log(`No follow-up required after ${latestClosed.id}`);
            console.log(`Path: [${posixPath}](file://${absPath})`);
          }
          return { status: "no-follow-up", ticket: latestClosed.id, path: latestClosed.path || computeTicketPath(latestClosed) };
        }
      }
    }
    throw new Error("No active or open tickets found to proceed with. Inspect recent git history before creating a follow-up ticket.");
  }
  
  if (index.activeTicketId !== found.id) {
    writeTicketIndexJson(opts.cwd, { ...index, activeTicketId: found.id });
  }

  const absPath = toPosixPath(join(opts.cwd, found.path));
  if (isCompactTicketOutput(opts) || opts.pathOnly) {
    printTicketSelectionLine(found.id, absPath, opts);
  } else {
    const posixPath = toPosixPath(found.path);
    console.log(`Next ticket: ${found.id}`);
    console.log(`Path: [${posixPath}](file://${absPath})`);
    if (opts.printContent) console.log("\n" + readFileSync(join(opts.cwd, found.path), "utf8"));
  }
}

function isTicketNextRunnableCandidate(cwd, entry) {
  const entryPath = entry.path || computeTicketPath(entry);
  const absPath = join(cwd, entryPath);
  if (!existsSync(absPath)) return true;

  const { meta } = parseFrontMatter(readFileSync(absPath, "utf8"));
  const lifecycleSource = String(meta.lifecycleSource || meta.ticketLifecycleSource || "").trim();
  return lifecycleSource === "ticket-create";
}

export async function runTicketHotfix(opts) {
  applyTicketRootContext(opts);
  if (!opts.topic && !opts.latest) {
    if (opts.nonInteractive) {
      throw new Error("ticket hotfix: --topic or --latest is required in non-interactive mode.");
    }
    opts.latest = true;
  }
  
  if (!opts.reason) {
    throw new Error("[HOTFIX DENIED] A mandatory --reason must be provided to justify bypassing standard rules (e.g., 'codegen is broken').");
  }

  // User explicit approval
  if (!opts.nonInteractive) {
    let proceed = false;
    await withReadline(async (rl) => {
      proceed = await new Promise(resolve => {
        rl.question(`\n⚠️  [EMERGENCY HOTFIX] This will bypass standard APC rules.\nReason: ${opts.reason}\nProceed? (y/N): `, a => {
          resolve(a.trim().toLowerCase() === 'y');
        });
      });
    });
    if (!proceed) {
      console.log('Hotfix cancelled by user.');
      return;
    }
  }

  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, { ...opts, force: false });
  const entry = pickTicketEntry(opts, index);
  
  if (!entry) throw new Error("No matching ticket found for hotfix.");

  const abs = join(opts.cwd, entry.path);
  if (!existsSync(abs)) throw new Error("Ticket file not found: " + entry.path);

  const body = readFileSync(abs, "utf8");
  const { meta, content } = parseFrontMatter(body);

  // Force phase 2 and active status, bypassing APC checks
  meta.phase = 2;
  meta.status = "active";
  meta.hotfix = true;
  meta.hotfixReason = opts.reason;
  
  // Append hotfix record to content
  const timestamp = new Date().toISOString();
  const hotfixRecord = `\n\n> [!WARNING]\n> **EMERGENCY HOTFIX ACTIVATED** (${timestamp})\n> **Reason:** ${opts.reason}\n> Standard APC and Phase 1 guards were bypassed.\n`;
  
  const newBody = stringifyFrontMatter(meta, content + hotfixRecord);
  writeFileSync(abs, newBody, "utf8");

  // Re-sync index
  opts.topic = entry.topic;
  opts.status = "active";
  updateTicketEntryStatus(opts.cwd, opts);
  
  syncActiveTicketId(opts.cwd);
  console.log(`[EMERGENCY HOTFIX] Ticket ${entry.topic} is now ACTIVE. Rule guardrails bypassed for this session.`);

  // Auto-create derivation ticket
  const deriveTopic = `codegen-fix-${entry.topic}`;
  const deriveSummary = `[DERIVED] Fix CodeGen source for hotfix: ${opts.reason}`;
  console.log(`[HOTFIX] Auto-creating derivation ticket: ${deriveTopic}`);
  
  try {
    await runTicketCreate({
      cwd: opts.cwd,
      topic: deriveTopic,
      summary: deriveSummary,
      chain: true,
      tags: 'hotfix-derived,codegen',
      priority: 'P1',
      skipPhase0: true,
      nonInteractive: true
    });
  } catch (err) {
    console.warn(`[WARNING] Failed to auto-create derivation ticket: ${err.message}`);
  }
}
