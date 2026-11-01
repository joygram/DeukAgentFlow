import { parseHeading,stripLeadingHashes } from "./markdown-headings.js";
import { existsSync,mkdirSync,readdirSync,readFileSync,rmSync,statSync,unlinkSync,writeFileSync } from "fs";
import { basename,dirname,join,relative,resolve,sep } from "path";
import { summarizeDocHealth } from "./cli-doc-commands.js";
import { buildCodingStep } from "./cli-coding-step.js";
import { cliText } from "./cli-locales.js";
import { projectRulePath as resolveProjectRulePath } from "./cli-rule-registry.js";
import { buildRolePersonaSurfaceForRole,getActiveRoleSkillIds,getActiveSkillsSurface } from "./cli-skill-commands.js";
import { appendInternalWorkflowEvent,buildTelemetrySummary,getTelemetryCompactSummary } from "./cli-telemetry-commands.js";
import {
buildTransitionValidationDocMeta,
clearDocMetaFrontmatterSummary,
mergeDocMetaUpdate,
splitTicketDocMetaSection
} from "./cli-ticket-docmeta.js";
import {
readTicketDocument,
renderTicketDocument,
resolveTicketEntryOrComputedPath,
writeTicketDocument,
writeTicketMarkdownFile
} from "./cli-ticket-document.js";
import {
buildEvidenceSectionsForTransition,
buildRequiredFlagsGuideText,
evidenceFlagForSlotHeading,
extractMarkdownSection,
followUpDecisionMeansNoFollowUp,
getAnalysisDesignIncompleteReasons,
getCloseWorkflowReasons,
getEvidenceFlagSpecsForTargetState,
getPhase1PlanBodyReasons,
hasPhase2ExecutionEvidence,
hasPlaceholderTokens,
hasTicketCompletionEvidence,
meetsDocsReflectedGate,
mergeH2SectionsIntoBody,
normalizePhase1PlanBodyHeadings,
resolveTicketType,
TICKET_TYPES
} from "./cli-ticket-evidence.js";
import { isHomeStoreRoot as isHomeStoreRootDir,resolveHomeTicketDirForWorkspace } from "./cli-ticket-home.js";
import { generateTicketId,readTicketIndexJson,syncActiveTicketId,syncToPipeline,writeTicketIndexJson } from "./cli-ticket-index.js";
import { appendTicketEntry,rebuildTicketIndexFromTopicFilesIfNeeded,updateTicketEntryStatus } from "./cli-ticket-parser.js";
import { collectTicketMarkdownFiles } from "./cli-ticket-scan.js";
import { renderTicketWorkflowGateFailure } from "./cli-ticket-surface.js";
import { getUsageReminderLine } from "./cli-usage-commands.js";
import {
buildPromptWorkspaceAliases,
CliOpts,
collectMcpConfigStatuses,
computeTicketPath,
detectConsumerTicketDir,
DEUK_ROOT_DIR,
findPromptWorkspaceMatches,
findWorkspaceRoot,
inferDocsLanguageFromText,
inferRefTitleAndTopic,
isMcpActive,
isWorkflowExecute,
loadAllRegistryWorkspaceCandidates,
loadInitConfig,
loadWorkspaceCandidates,
localized,
makePath,
normalizeDocsLanguage,
normalizeTicketGroup,
parseFrontMatter,
requireNonEmptySlug,
resolveConsumerTicketRoot,
resolveDocsLanguage,
resolvePackageRoot,
resolveReferencedTicketPath,
resolveTicketSystemPaths,
resolveWorkspaceContext,
resolveWorkspaceTarget,
sanitizeFrontMatterMeta,
selectLocalizedTemplatePath,
stringifyFrontMatter,stripLeadingFrontMatter,
TICKET_SUBDIR,
toDriveAbsolutePath,
toPosixPath,
toRepoRelativePath,
toSlug,
toWsRelativePath,
writeFileLF
} from "./cli-utils.js";
import { collectChangedFiles,lintMarkdownPaths,normalizeMarkdownFile } from "./lint-md.js";
import { auditRules } from "./lint-rules.js";
import { parsePlan } from "./plan-parser.js";
import { isTicketEvidenceKeySatisfied,TICKET_EVIDENCE_VALIDATORS,type TicketEvidenceInput } from "./ticket-evidence-validators.js";
import { roleForStateName } from "./ticket-machine.js";
import {
assertTicketWorkflowAction,
assertTicketWorkflowTransition,
AUTO_ARCHIVE_DONE_STATUSES,
deriveTicketWorkflowStatus,
FLOW_SURFACE_STATUS,
formatTicketFlowLine,
getTicketWorkflowTransitionEvidenceKeys,
isExecutionTicketStatus,
isTerminalTicketStatus,
normalizeTicketPhaseNumber,
OPEN_TICKET_STATUSES,
renderTicketDocMetaSurface,
renderTicketFlowSurface,
resolveTicketWorkflowRuntimeState,
resolveTicketWorkflowTransition,
sanitizeTicketWorkspaceLabel,
skillsForStateName,
TICKET_WORKFLOW
} from "./ticket-workflow.js";

const MAX_OPEN_TICKETS = 20;
const PACKAGE_ROOT = resolvePackageRoot({ fromUrl: import.meta.url });



function loadTicketIndex(opts, extra: Record<string, any> = {}) {
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.workspaceRoot, {
    ...opts,
    force: extra.force ?? false,
    rebuild: extra.rebuild ?? false
  });

  if (extra.autoArchiveDone === false || opts.pathOnly) {
    return index;
  }

  autoArchiveDoneTickets(opts.workspaceRoot, index, opts);
  return readTicketIndexJson(opts.workspaceRoot);
}

async function ensurePhase0Validation(opts) {
  if (!opts.evidence && !opts.skipPhase0) {
    opts.skipPhase0 = true;
  }

  if (opts.skipPhase0) {
    try {
      if (!isCompactTicketOutput(opts) && await isMcpActive(opts.workspaceRoot)) {
        console.warn("[WARNING] Phase 0 RAG evidence is recommended when the MCP server is active. Proceeding without evidence as requested.");
      }
    } catch (err) {
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

function ticketTemplateRelPath(locale) {
  return locale === "ko" ? "templates/TICKET_TEMPLATE.ko.md" : "templates/TICKET_TEMPLATE.md";
}

function buildPlanBodyRequiredMessage(reasons = []) {
  const uniqueReasons = [...new Set(reasons)];
  const locale = resolveDocsLanguage("auto");
  const templatePath = makePath(PACKAGE_ROOT, ...ticketTemplateRelPath(locale).split("/"));
  const unfilled = uniqueReasons.filter(r => String(r).startsWith("unfilled_placeholder:"));
  const unfilledList = unfilled.length
    ? ["Unfilled placeholders (each {{ }} must be replaced with real content):",
       ...unfilled.map(r => `  - ${String(r).replace(/^unfilled_placeholder:\s*/, "")}`)]
    : [`Missing or incomplete: ${uniqueReasons.join(", ")}`];
  return [
    "[VALIDATION FAILED] the ticket body still has unfilled {{ }} placeholders.",
    ...unfilledList,
    cliText("ticket.validation.selfServeRecipe", { locale }),
    "How to create a ticket:",
    `  1. Copy the template: ${templatePath}`,
    "  2. Replace every {{ ... }} block with real content.",
    "  3. Stream the body via stdin (do NOT save a file — a temp/scratchpad path cannot be read by the CLI):",
    "     deuk-agent-flow ticket create --workspace <ws> --group main --plan-body-file - --non-interactive <<'TICKET'",
    "     # <title>",
    "     ...filled body...",
    "     TICKET"
  ].filter(Boolean).join("\n");
}

function extractMarkdownHeadingSection(content = "", heading = "") {
  const target = stripLeadingHashes(String(heading || "").trim()).toLowerCase();
  if (!target) return "";
  const lines = String(content || "").split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (const [index, line] of lines.entries()) {
    const match = parseHeading(line);
    if (!match) continue;
    if (match.text.toLowerCase() !== target) continue;
    start = index;
    level = match.depth;
    break;
  }
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    const match = parseHeading(lines[index]);
    if (match && match.depth <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trimEnd();
}

function getCoreRulesSection(heading) {
  const rulesPath = makePath(PACKAGE_ROOT, "core-rules", "AGENTS.md");
  if (!existsSync(rulesPath)) return "";
  return extractMarkdownHeadingSection(readFileSync(rulesPath, "utf8"), heading);
}

function renderTicketCreateTemplateGuide(docsLanguage = "ko") {
  const templateDir = makePath(PACKAGE_ROOT, "templates");
  const templatePath = selectLocalizedTemplatePath(templateDir, "TICKET_TEMPLATE.md", docsLanguage);
  return readFileSync(templatePath, "utf8").trimEnd();
}

function readCliSurfaceDocument(name) {
  const surfacePath = makePath(PACKAGE_ROOT, "templates", "cli-surfaces", `${name}.md`);
  if (!existsSync(surfacePath)) {
    throw new Error(localizedTicket("surfaceDocNotFound", { path: surfacePath }));
  }
  return readFileSync(surfacePath, "utf8");
}

function renderCliSurfaceDocument(name, replacements: Record<string, any> = {}) {
  let content = readCliSurfaceDocument(name);
  content = content.replace(/\{\{CORE:([^}]+)\}\}/g, (_match, heading) => getCoreRulesSection(String(heading || "").trim()).trimEnd());
  for (const [key, value] of Object.entries(replacements)) {
    const str = String(value ?? "").trim();
    if (!str) {
      content = content.replace(new RegExp(`^##[^\n]*\n\\{\\{${key}\\}\\}\n?`, "m"), "");
      content = content.replaceAll(`{{${key}}}`, "");
    } else {
      content = content.replaceAll(`{{${key}}}`, str);
    }
  }
  content = content.replace(/\n{3,}/g, "\n\n");
  return content.trimEnd();
}


const DESIGN_CANON_HEADING = "## 관련 설계 정본 (판단 전 Read 툴로 읽어라)";


const DESIGN_CANON_RESOLVER_SKILL = "doc-sync";

function renderDesignCanonUnresolved(reason: string): string {
  return `${DESIGN_CANON_HEADING}\n\n` +
    `🚨 **설계 정본 미해소 — ${reason}**\n\n` +
    `이 상태로는 코드·기억이 유일한 판단 근거가 되고, 그 판단은 검증할 정본이 없다.\n\n` +
    `**🔧 지금 Skill 툴로 \`${DESIGN_CANON_RESOLVER_SKILL}\`를 호출해 해소하라 (선언이 아니라 호출).** ` +
    `그 스킬이 정본 부재·불일치를 다루는 자리다 — 없으면 작성하고, 어긋나면 설계 기준으로 정본화한다. ` +
    `호출하지 않은 채 "확인했다"고 넘어가는 것은 해소가 아니다.\n\n` +
    `해소되면 티켓 Design이 그 정본 파일명을 가리키게 \`ticket edit --design\`으로 고친다. ` +
    `이 블록은 정본이 실제로 해소될 때까지 매 턴 다시 나온다.`;
}

type DesignCanonResolution =
  | { ok: true; found: Array<{ name: string; abs: string }>; missing: string[] }
  | { ok: false; reason: string };


function readActiveDesignCanon(workspaceRoot, activeEntry): string {
  const resolved = resolveDesignCanon(workspaceRoot, activeEntry);
  if (resolved.ok === false) return renderDesignCanonUnresolved(resolved.reason);
  const missingNote = resolved.missing.length > 0
    ? `\n\n🚨 **일부 미해소** — 참조했으나 docs/ 아래 없는 정본: ${resolved.missing.join(", ")}. 작성하거나 참조를 고쳐라.`
    : "";
  const paths = resolved.found.map(f => `- [${f.name}](${f.abs})`).join("\n");
  return `${DESIGN_CANON_HEADING}\n\n` +
    `이 티켓의 설계 정본이다. Read 툴로 아래를 실제로 읽고 판단하라 — 읽지 않은 정본을 인용하는 것은 근거가 아니다.\n\n` +
    `${paths}\n` + missingNote;
}

function resolveDesignCanon(workspaceRoot, activeEntry): DesignCanonResolution {
  if (!workspaceRoot || !activeEntry) return { ok: false as const, reason: "활성 티켓이 없다" };
  let doc;
  try {
    doc = readTicketDocument(workspaceRoot, activeEntry, { action: "rules design spoke", requireExists: false });
  } catch (err) {
    return { ok: false as const, reason: `티켓 본문을 읽지 못했다 (${(err as Error).message})` };
  }

  const body = String(doc?.content || "");
  const designMatch = body.match(/##\s*Design\s*\n([\s\S]*?)(?:\n##\s|\s*$)/);
  const designText = designMatch ? designMatch[1] : "";
  if (!designText.trim()) {
    return { ok: false as const, reason: "티켓에 Design 섹션이 비어 있어 가리키는 정본이 없다" };
  }

  const referenced = new Set<string>();
  for (const m of designText.matchAll(/([A-Za-z0-9_./-]+\.md)/g)) {
    referenced.add(m[1].trim());
  }
  if (referenced.size === 0) {
    return { ok: false as const, reason: "티켓 Design이 설계 문서를 하나도 참조하지 않는다" };
  }

  const scaffoldHint = `없으면 \`deuk-agent-flow doc scaffold --workspace <id>\` 로 골격을 만들거나 참조를 실재 경로로 고쳐라.`;

  const found: Array<{ name: string; abs: string }> = [];
  const unresolved: string[] = [];
  for (const ref of referenced) {
    const direct = makePath(workspaceRoot, ref);
    if (existsSync(direct)) { found.push({ name: ref, abs: direct }); continue; }
    unresolved.push(ref);
  }

  const docsRoot = makePath(workspaceRoot, "docs");
  if (unresolved.length > 0 && existsSync(docsRoot)) {
    const wanted = new Map(unresolved.map(ref => [ref.split("/").pop()!, ref]));
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        const abs = makePath(dir, ent.name);
        if (ent.isDirectory()) walk(abs);
        else if (wanted.has(ent.name)) found.push({ name: wanted.get(ent.name)!, abs });
      }
    };
    try {
      walk(docsRoot);
    } catch (err) {
      return { ok: false as const, reason: `docs/ 탐색이 실패했다 (${(err as Error).message})` };
    }
  }

  const missing = [...referenced].filter(ref => !found.some(f => f.name === ref));
  if (found.length === 0) {
    return { ok: false as const, reason: `티켓 Design이 참조한 정본이 실재하지 않는다 (${missing.join(", ")}). ${scaffoldHint}` };
  }

  return { ok: true as const, found, missing };
}

function readProjectRuleSurface(cwd, _platform = null, policyRole = "") {
  if (!cwd) return "";
  const projectRulePath = resolveProjectRulePath(cwd);
  if (!existsSync(projectRulePath)) return "";
  const entries = readWorkspaceRuleEntries(cwd);
  if (entries.length === 0) return "";
  const stages = ruleStagesForPolicyRole(policyRole);
  if (stages.length === 0) {
    return `룰 id: ${entries.map(e => e.id).join(", ")} (본문은 위 프로젝트 룰 정본 파일에 있다 — Read 툴로 읽어라).`;
  }
  const applicable = entries.filter(e => e.stages.some(stage => stages.includes(stage)));
  if (applicable.length === 0) return "";
  return `이 단계(${stages.join(", ")})에 적용되는 룰 id: ${applicable.map(e => e.id).join(", ")} ` +
    `(본문은 위 프로젝트 룰 정본 파일에 있다 — Read 툴로 읽어라). 나머지 룰은 이 단계의 판정 대상이 아니다.`;
}

const RULE_ID_PATTERN = /\[([A-Z]{2,}-\d+)\]/g;

const RULE_LINE_PATTERN = /^-\s*\[([A-Z]{2,}-[A-Z0-9]+)\]\s*(?:@(\S+))?/;

const POLICY_ROLE_RULE_STAGES: Record<string, string[]> = {
  analysis: ["start"],
  coding: ["create", "modify"],
  debugging: ["modify"],
  completion: ["modify"]
};
function readWorkspaceRuleIds(cwd): string[] {
  return readWorkspaceRuleEntries(cwd).map(entry => entry.id);
}

function readWorkspaceRuleEntries(cwd): Array<{ id: string; stages: string[] }> {
  if (!cwd) return [];
  const projectRulePath = resolveProjectRulePath(cwd);
  if (!existsSync(projectRulePath)) return [];
  const text = readFileSync(projectRulePath, "utf8");
  const seen = new Set<string>();
  const entries: Array<{ id: string; stages: string[] }> = [];
  for (const line of text.split("\n")) {
    const m = RULE_LINE_PATTERN.exec(line.trim());
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    entries.push({ id: m[1], stages: m[2] ? m[2].split(",").map(s => s.trim()).filter(Boolean) : [] });
  }
  return entries;
}

function ruleStagesForPolicyRole(policyRole: string): string[] {
  const node = POLICY_ROLE_RULE_STAGES[policyRole];
  if (!node) return [];
  return node;
}

function readBaselineRuleBlock(): string {
  const tplPath = makePath(PACKAGE_ROOT, "templates", "PROJECT_RULE.md");
  if (!existsSync(tplPath)) return "## Rules (id-based)\n\n- [DR-01] 승인된 티켓 범위 안에서만 작업하고, 생성물은 소스에서 갱신한다.\n";
  const tpl = readFileSync(tplPath, "utf8");
  const section = extractMarkdownSection(tpl, "Rules (id-based)");
  return section ? `## Rules (id-based)\n\n${section.trim()}\n` : tpl;
}

function ensureBaselineWorkspaceRule(cwd): string[] | null {
  if (!cwd) return null;
  const projectRulePath = resolveProjectRulePath(cwd);
  const existing = existsSync(projectRulePath) ? readFileSync(projectRulePath, "utf8") : "";
  RULE_ID_PATTERN.lastIndex = 0;
  if (RULE_ID_PATTERN.test(existing)) return null; // 이미 룰 ID 있음
  const block = readBaselineRuleBlock();
  const fmMatch = existing.match(/^---\n[\s\S]*?\n---\n/);
  const frontmatter = fmMatch ? fmMatch[0] : "";
  const next = `${frontmatter}# Project Rules\n\n${block}`;
  writeFileSync(projectRulePath, next);
  RULE_ID_PATTERN.lastIndex = 0;
  const ids = new Set<string>();
  let m;
  while ((m = RULE_ID_PATTERN.exec(block)) !== null) ids.add(m[1]);
  return Array.from(ids);
}

function readProjectPolicySurface(cwd, opts: CliOpts = {}) {
  if (!cwd) return "";
  const policyDir = makePath(resolveHomeTicketDirForWorkspace(cwd), "project-guardrails");
  if (!existsSync(policyDir)) return "";
  
  const docsLanguage = resolveDocsLanguage(normalizeDocsLanguage(opts.docsLanguage || "ko"));
  
  const allFiles = readdirSync(policyDir).filter(name => name.endsWith(".md"));
  const policies = new Set();
  const fileMap = new Map();
  
  for (const file of allFiles) {
    let baseName = file.replace(/\.md$/, "");
    if (/\.[a-z]{2}$/.test(baseName)) {
      baseName = baseName.slice(0, -3);
    }
    policies.add(baseName);
    if (!fileMap.has(baseName)) fileMap.set(baseName, []);
    fileMap.get(baseName).push(file);
  }
  
  const selectedFiles = [];
  for (const baseName of Array.from(policies).sort()) {
    if (opts.activePolicyRole && baseName !== opts.activePolicyRole) {
      continue;
    }
    
    const filesForPolicy = fileMap.get(baseName);
    const localized = `${baseName}.${docsLanguage}.md`;
    const defaultFile = `${baseName}.md`;
    
    if (filesForPolicy.includes(localized)) {
      selectedFiles.push(localized);
    } else if (filesForPolicy.includes(defaultFile)) {
      selectedFiles.push(defaultFile);
    } else {
      selectedFiles.push(filesForPolicy.sort()[0]);
    }
  }
  
  return selectedFiles.map(name => {
    const content = readFileSync(makePath(policyDir, name), "utf8").trimEnd();
    return `## ${name}\n\n${content}`;
  }).join("\n\n");
}

export function buildTicketCreateGuide(opts: CliOpts = {}) {
  const docsLanguage = resolveDocsLanguage(normalizeDocsLanguage(opts.docsLanguage || "ko"));
  const renderedTemplate = renderTicketCreateTemplateGuide(docsLanguage);
  const surfaceName = docsLanguage === "ko" ? "ticket-create.ko" : "ticket-create";
  return renderCliSurfaceDocument(surfaceName, {
    TICKET_TEMPLATE: renderedTemplate,
    REQUIRED_FLAGS: buildRequiredFlagsGuideText()
  });
}

const DOMAIN_FOCUS_RULES: Array<{ keys: string[]; focus: string }> = [
  { keys: ["codegen", "idl", "generate", "생성물"], focus: "[DOMAIN_FOCUS: codegen] 코드 생성물 관련. 생성물(generated/·idl)을 직접 수정하지 말고 소스→재생성 경로로만. 빌드타임 타입 확정을 런타임 registry/convention 우회로 대체 금지." },
  { keys: ["refactor", "리팩터", "리팩토링"], focus: "[DOMAIN_FOCUS: refactor] 리팩터. 동작 보존이 최우선 — 변경 전후 동치성을 검증으로 보이고, 스코프를 최소·국소로 유지." },
  { keys: ["ui", "webview", "widget", "css", "레이아웃", "디자인"], focus: "[DOMAIN_FOCUS: ui/design] UI/디자인 산출물. 일관성·정보위계·재사용·접근성을 1급 기준으로. \"동작하니 됐다\" 금지." },
  { keys: ["bug", "fix", "버그", "수정"], focus: "[DOMAIN_FOCUS: bugfix] 버그 수정. 근본 원인을 먼저 특정하고, 재현 → 수정 → 회귀 방지 순서. 증상만 가리는 땜질 금지." },
];

function deriveDomainFocus(entry): string {
  if (!entry) return "";
  const tags = Array.isArray(entry.tags) ? entry.tags.map(t => String(t).toLowerCase()) : [];
  const hay = `${tags.join(" ")} ${String(entry.summary || "")} ${String(entry.title || "")}`.toLowerCase();
  for (const rule of DOMAIN_FOCUS_RULES) {
    if (rule.keys.some(k => hay.includes(k))) return rule.focus;
  }
  return "";
}

function readWorkspaceProfile(workspaceRoot, workspace, platform = null): string {
  if (!workspaceRoot) return "";
  const p = resolveProjectRulePath(workspaceRoot);
  if (!existsSync(p)) return "";
  return `[WORKSPACE_PROFILE: ${workspace || "local"}] 프로젝트 룰 정본: [${basename(p)}](${p})`;
}

function buildRoleContextBlock(domainFocus, workspaceProfile, activeRole = "", activeWorkspace = "", roleSkillIds: string[] = []): string {
  const invokeDirective = roleSkillIds.length > 0
    ? `\n\n**🔧 지금 이 롤로 서려면 Skill 툴을 실제로 호출하라 (선언이 아니라 호출):** ${roleSkillIds.map(id => `\`${id}\``).join(", ")} 스킬을 Skill 툴로 지금 invoke하라. 롤 스킬을 invoke하지 않은 채 "롤이라고 생각만" 하는 것은 서브FSM이 서지 않은 것 — 롤 전환이 강제될 수 없는 "없는 엣지"로 전락한다.`
    : "";
  const roleHeader = activeRole
    ? `## 🎭 현재 역할 (ACTIVE ROLE)\n\n너는 지금 **${activeRole}** 롤이다${activeWorkspace ? ` (워크스페이스: ${activeWorkspace})` : ""}. 이 phase의 서브 FSM으로서 그 롤의 규율대로 산출을 낸다. 롤이 바뀌면(전이) 이 선언이 바뀐다 — 매 턴 이 줄을 읽어 자신이 어느 모드인지 재확인한다.${invokeDirective}`
    : `## 🎭 현재 역할 (ACTIVE ROLE)\n\n**롤 미할당** — 활성 티켓이 없어 어느 서브 FSM에도 서 있지 않다. 작업을 시작하려면 티켓을 먼저 세워라(planner/designer). 다른 워크스페이스의 phase가 현재 롤을 대신하지 않는다.`;

  const parts = [domainFocus, workspaceProfile].map(s => String(s || "").trim()).filter(Boolean);
  const dynamic = parts.length === 0
    ? ""
    : `\n\n## Role Context (이번 작업 동적 컨텍스트)\n\n현재 페이즈 역할 레이어에 다음을 함께 적용한다:\n\n${parts.join("\n\n")}`;
  return roleHeader + dynamic;
}

export function buildTicketRulesGuide(opts: CliOpts = {}) {
  const surface = String(opts.ruleSurface || "ticket").trim() || "ticket";
  if (surface === "ticket") {
    let activePolicyRole = null;
    let area = "rules";
    let activeEntry = null;
    try {
      const index = readTicketIndexJson(opts.workspaceRoot, { activeOnly: true });
      const activeId = index?.activeTicketId || null;
      if (activeId) {
        const entry = (index?.entries || []).find(e => e.id === activeId);
        if (entry) {
          activeEntry = entry;
          const runtimeState = resolveTicketWorkflowRuntimeState(entry, entry.status);
          activePolicyRole = runtimeState?.state?.policyRole ?? "analysis";
          area = runtimeState?.name || `phase${entry.phase || 1}`;
        }
      }
    } catch { /* ignore */ }
    opts.resolvedSurfacePhase = activeEntry ? `phase${activeEntry.phase || 1}` : "entry";

    const guardrailsOpts = { ...opts, activePolicyRole };
    const platform = String(opts.platform || "").trim();

    const surfaceTarget = resolveWorkspaceTarget(opts.workspace, { homeDir: opts.homeDir })?.target;
    if (!surfaceTarget) {
      throw new Error(localizedTicket("rulesWorkspaceNotFound", { workspace: String(opts.workspace) }));
    }
    const surfaceRoot = surfaceTarget.path;
    const activeRole = roleForStateName(area);
    const roleSkillIds = getActiveRoleSkillIds(surfaceRoot, area);
    const roleContext = buildRoleContextBlock(deriveDomainFocus(activeEntry), readWorkspaceProfile(surfaceRoot, opts.workspace, opts.platform), activeRole, activeEntry ? (opts.workspace || "") : "", roleSkillIds);

    return renderCliSurfaceDocument("ticket", {
      REQUESTED_SURFACE: surface,
      DESIGN_CANON: readActiveDesignCanon(surfaceRoot, activeEntry),
      PROJECT_RULES: readProjectRuleSurface(surfaceRoot, platform, activePolicyRole || ""),
      PROJECT_GUARDRAILS: readProjectPolicySurface(surfaceRoot, { ...guardrailsOpts, platform }),
      AGENT_SKILLS: getActiveSkillsSurface(surfaceRoot, area),
      ROLE_CONTEXT: roleContext,
      LANGUAGE_GATE: buildLanguageGateBlock(resolveSurfaceLanguage(opts)),
      ESCALATION_GATE: buildEscalationGateBlock(),
      NEXT_ACTION: buildNextActionBlock(opts)
    });
  }
  throw new Error(localizedTicket("unknownRulesSurface", { surface: String(surface) }));
}




function emitNodePrompt(name, replacements: Record<string, any> = {}, lang = "ko") {
  const text = loadStatePrompt(name, lang);
  if (!text) return "";
  let out = text;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.replaceAll(`{{${key}}}`, String(value ?? ""));
  }
  return out.replace(/\n{3,}/g, "\n\n").trimEnd();
}

function routeEntryNode(opts: CliOpts = {}) {
  let registered = [];
  try {
    const candidates = loadWorkspaceCandidates("", { platform: "any", homeDir: opts.homeDir });
    registered = (candidates?.workspaces || []).map(w => w.id).filter(Boolean).sort();
  } catch { /* registry unreadable */ }

  if (registered.length === 0) {
    return { node: "entry-free", ctx: {} };
  }

  let activeId = null, activePhase = null, activeStatus = null, activePath = null, activeWsCwd = null;
  let boundWsCwd = null;
  const sessionWorkspacePath = opts.workspaceRoot || null;

  if (sessionWorkspacePath) {
    try {
      const candidates = loadWorkspaceCandidates("", { platform: "any", homeDir: opts.homeDir });
      const matchedWs = (candidates?.workspaces || []).find(w => w.path === sessionWorkspacePath);
      const wsCwd = matchedWs?.path || sessionWorkspacePath;
      boundWsCwd = wsCwd;
      const index = readTicketIndexJson(wsCwd, { activeOnly: true });
      const id = index?.activeTicketId || null;
      if (id) {
        const entry = (index?.entries || []).find(e => e.id === id);
        if (entry) {
          activeId = id;
          activePhase = entry?.phase ?? null;
          activeStatus = entry?.status ?? null;
          activePath = entry?.path ?? null;
          activeWsCwd = wsCwd;
        }
      }
    } catch { /* skip */ }
  }

  if (activeId && activeWsCwd) {
    const advance = `\n\n전이 안내(다음 phase 슬롯·게이트·명령)는 여기 싣지 않는다 — ` +
      `\`deuk-agent-flow ticket move --id ${activeId} --workspace ${opts.workspace || "<id>"} --phase <n>\` 실행 시 그 출력이 정본이다.`;
    let ticketDisplay = `**${activeId}** (phase ${activePhase}, ${activeStatus})`;
    if (activePath) {
      const keyDir = detectConsumerTicketDir(activeWsCwd) || activeWsCwd;
      ticketDisplay = formatTicketPhaseLine(activeId, makePath(keyDir, activePath), activePhase, activeWsCwd, opts.invocationCwd || activeWsCwd);
    }
    return { node: "entry-in-progress", ctx: {
      TICKET_DISPLAY: ticketDisplay,
      TICKET_ID: activeId,
      PHASE_ADVANCE: advance
    } };
  }

  if (boundWsCwd) {
    return { node: "entry-no-active", ctx: {
      WS_NAME: opts.workspace || resolveTicketWorkspaceLabel(boundWsCwd, "") || "<workspace-id>"
    } };
  }

  return { node: "entry-no-workspace", ctx: {
    WORKSPACE_COUNT: registered.length,
    WORKSPACE_LIST: registered.map(id => `  - ${id}`).join("\n"),
    FIRST_WORKSPACE: registered[0]
  } };
}

function buildNextActionBlock(opts: CliOpts = {}) {
  const lang = resolveDocsLanguage(opts.docsLanguage || "auto");
  const { node, ctx } = routeEntryNode(opts);
  return emitNodePrompt(node, ctx, lang);
}

function loadStatePrompt(stateName, lang = "en") {
  const p = resolve(PACKAGE_ROOT, "templates", "cli-surfaces", "state", `${stateName}.${lang}.md`);
  try { return readFileSync(p, "utf8").trim(); } catch { return null; }
}

function loadStateTemplate(stateName, lang = "en") {
  const p = resolve(PACKAGE_ROOT, "templates", "cli-surfaces", "state-template", `${stateName}.${lang}.md`);
  try { return readFileSync(p, "utf8").trim(); } catch { return null; }
}

const TICKET_SURFACE_TEXT = {
  surfaceDocNotFound: { ko: "CLI 표면 문서를 찾을 수 없다: {path}", en: "CLI surface document not found: {path}" },
  designUnresolved: { ko: "design render: 설계 정본 미해소 — {reason}", en: "design render: design canon unresolved — {reason}" },
  rulesWorkspaceNotFound: { ko: "ticket rules: 레지스트리에 워크스페이스가 없다: {workspace}", en: "ticket rules: workspace not found in registry: {workspace}" },
  unknownRulesSurface: { ko: "알 수 없는 ticket rules 표면: {surface}", en: "Unknown ticket rules surface: {surface}" },
  designUnknownPhase: { ko: "design render: 알 수 없는 phase '{phase}' — 다음 중 하나여야 한다: {phases}.", en: "design render: unknown phase '{phase}' — expected one of {phases}." },
  designWorkspaceRequired: { ko: "design render 는 --workspace 가 필요하다(레지스트리 기반). cwd 는 워크스페이스 해소에 절대 쓰이지 않는다.", en: "design render requires --workspace (registry-backed). cwd is never used to resolve the workspace." },
  designWorkspaceNotFound: { ko: "design render: 레지스트리에 워크스페이스가 없다: {workspace}", en: "design render: workspace not found in registry: {workspace}" },
  designSkillMissing: { ko: "design render: 활성 스킬 '{skill}' 본문을 찾지 못했다 ({path}).", en: "design render: could not find the body of active skill '{skill}' ({path})." },
  fileNotFound: { ko: "{label}: 파일을 찾을 수 없다 {value}", en: "{label}: file not found {value}" },
  ticketPathNotFound: { ko: "티켓 경로를 찾을 수 없다: {path}", en: "ticket path not found: {path}" },
  ticketPathOutside: { ko: "티켓 경로가 {root} 안에 있지 않다: {path}", en: "ticket path is not inside {root}: {path}" },
  ticketPathNoId: { ko: "티켓 경로에 id frontmatter 가 없다: {path}", en: "ticket path has no id frontmatter: {path}" },
  wsAmbiguousPrompt: { ko: "프롬프트로부터 티켓 워크스페이스 대상이 모호하다: {candidates}. --workspace <name> 으로 다시 실행하라.", en: "ticket workspace target is ambiguous from prompt: {candidates}. Re-run with --workspace <name>." },
  wsRegistryOnly: { ko: "워크스페이스는 --workspace 로 레지스트리에서만 해소된다. cwd 는 절대 쓰이지 않는다. --workspace <id> 를 넘겨라.", en: "workspace is resolved only from the registry via --workspace; cwd is never used. Pass --workspace <id>." },
  wsNoneRegistered: { ko: "티켓 워크스페이스 대상을 찾을 수 없다: {query} (등록된 워크스페이스 없음)", en: "ticket workspace target not found: {query} (no registered workspaces)" },
  wsAmbiguous: { ko: "티켓 워크스페이스 대상이 모호하다: {candidates}", en: "ticket workspace target is ambiguous: {candidates}" },
  wsNotFound: { ko: "티켓 워크스페이스 대상을 찾을 수 없다: {query}", en: "ticket workspace target not found: {query}" },
  archiveFileNotFound: { ko: "ticket archive: 파일을 찾을 수 없다 ", en: "ticket archive: file not found " },
  archiveDestExists: { ko: "ticket archive: 대상이 이미 존재한다 ", en: "ticket archive: destination already exists " },
  createWorkspaceRequired: { ko: "ticket create 는 등록된 AgentFlow 워크스페이스가 필요하다. --workspace <id> 를 쓰라.", en: "ticket create requires a registered AgentFlow workspace. Use --workspace <id>." },
  createSubNeedsParent: { ko: "ticket create: 하위 티켓은 --parent/--main-ticket 또는 추적할 기존 메인 티켓이 필요하다.", en: "ticket create: sub tickets require --parent/--main-ticket or an existing main ticket to track." },
  noTicketSystem: { ko: "선택한 워크스페이스에 티켓 시스템이 없다.", en: "No ticket system found for the selected workspace." },
  statusNoMatch: { ko: "ticket status: '{selector}' 에 맞는 티켓이 없다", en: "ticket status: no matching ticket found for '{selector}'" },
  showNoMatch: { ko: "ticket show: '{selector}' 에 맞는 티켓이 없다", en: "ticket show: no matching ticket found for '{selector}'" },
  showIdRequired: { ko: "ticket show: --id <ticket-id> 가 필요하다.", en: "ticket show: --id <ticket-id> is required." },
  editIdRequired: { ko: "ticket edit: --id 또는 --latest 가 필요하다.", en: "ticket edit: --id or --latest is required." },
  editNoMatch: { ko: "ticket edit: '{selector}' 에 맞는 티켓이 없다", en: "ticket edit: no matching ticket found for '{selector}'" },
  editNotOpen: { ko: "ticket edit: '{id}' 의 상태가 'open' 이 아니라 '{status}' 다. 열린 티켓만 편집할 수 있다.", en: "ticket edit: '{id}' has status '{status}', not 'open'. Only an open ticket can be edited." },
  guardIdRequired: { ko: "ticket guard: set_workflow_context 전에 --id 또는 --latest 가 필요하다.", en: "ticket guard: --id or --latest is required before set_workflow_context." },
  guardNoDurable: { ko: "ticket guard: 지속 티켓을 찾을 수 없다. set_workflow_context 를 호출하지 마라.", en: "ticket guard: no matching durable ticket found; do not call set_workflow_context." },
  guardFileMissing: { ko: "ticket guard: {id} 의 지속 티켓 파일이 없다. set_workflow_context 를 호출하지 마라.", en: "ticket guard: durable ticket file missing for {id}; do not call set_workflow_context." },
  guardTerminal: { ko: "[티켓 워크플로 차단] ticket guard 가 {id} 를 막았다: 종결 티켓은 실행 컨텍스트를 열 수 없다. status={status}, phase={phase}. 명시적 재개 결정 뒤에만 ticket move 로 재개하라.", en: "[TICKET WORKFLOW BLOCKED] ticket guard blocked {id}: terminal ticket cannot open execution context. status={status}, phase={phase}. Reopen with ticket move only after an explicit reopen decision." },
  guardAmbiguousWs: { ko: "ticket guard: 워크스페이스 {workspace} 안에서 티켓 id 가 모호하다: {matches}", en: "ticket guard: ticket id is ambiguous in workspace {workspace}: {matches}" },
  guardAmbiguousSibling: { ko: "ticket guard: 형제 워크스페이스에 걸쳐 티켓 id 가 모호하다: {matches}", en: "ticket guard: ticket id is ambiguous across sibling workspaces: {matches}" },
  handoffNoMatch: { ko: "ticket handoff: 맞는 티켓이 없다", en: "ticket handoff: no matching ticket found" },
  metaNoMatch: { ko: "ticket meta: 맞는 티켓이 없다", en: "ticket meta: no matching ticket found" },
  connectNoUrl: { ko: "ticket connect: 파이프라인 URL 이 설정되지도 --remote 로 주어지지도 않았다", en: "ticket connect: no pipeline URL configured or provided via --remote" },
  evidenceClaimRequired: { ko: "ticket evidence 는 티켓 내용과 대조할 --claim <text> 가 필요하다.", en: "ticket evidence requires --claim <text> to compare with ticket content." },
  evidenceNoMatch: { ko: "ticket evidence: 맞는 티켓이 없다.", en: "ticket evidence: no matching ticket found." },
  reportClaimRequired: { ko: "ticket report 는 주장 기반 보고서를 만들 때 --claim <text> 가 필요하다.", en: "ticket report requires --claim <text> when generating a claim-bound report." },
  reportNoMatch: { ko: "ticket report: 맞는 티켓이 없다.", en: "ticket report: no matching ticket found." },
  noMatchingUpdate: { ko: "상태를 갱신할 티켓을 찾을 수 없다", en: "No matching ticket found to update status" },
  archiveIdRequired: { ko: "ticket archive: --id 또는 --latest 가 필요하다.", en: "ticket archive: --id or --latest is required." },
  archiveNoMatch: { ko: "ticket archive: 맞는 항목이 없다", en: "ticket archive: no matching entry" },
  discardIdRequired: { ko: "ticket discard: --id 또는 --latest 가 필요하다.", en: "ticket discard: --id or --latest is required." },
  discardNoMatchFor: { ko: "ticket discard: '{id}' 에 맞는 항목이 없다", en: "ticket discard: no matching entry for '{id}'" },
  discardNoMatch: { ko: "ticket discard: 맞는 항목이 없다", en: "ticket discard: no matching entry" },
  ticketFileNotFound: { ko: "티켓 파일을 찾을 수 없다: ", en: "Ticket file not found: " },
  discardNotDiscardable: { ko: "ticket discard: {id} 는 폐기 가능한 열린 티켓(phase<=2)이 아니다. 검증·실행된 작업은 ticket close/archive 를 쓰라.", en: "ticket discard: {id} is not a discardable open ticket (phase<=2). Use ticket close/archive for verified or executed work." },
  moveNoMatch: { ko: "이동할 티켓을 찾을 수 없다.", en: "No matching ticket found to move." },
  reopenExists: { ko: "ticket move: 재개 대상이 이미 존재한다 ", en: "ticket move: reopen target already exists " },
  noActiveTickets: { ko: "진행할 활성·열린 티켓이 없다. 후속 티켓을 만들기 전에 최근 git 이력을 살펴라.", en: "No active or open tickets found to proceed with. Inspect recent git history before creating a follow-up ticket." },
  hotfixReasonRequired: { ko: "[핫픽스 거부] 표준 규칙 우회를 정당화할 --reason 이 반드시 필요하다 (예: 'codegen 이 깨졌다').", en: "[HOTFIX DENIED] A mandatory --reason must be provided to justify bypassing standard rules (e.g., 'codegen is broken')." },
  hotfixNoMatch: { ko: "핫픽스 대상 티켓을 찾을 수 없다.", en: "No matching ticket found for hotfix." },

  earlyExit: { ko: "조기종료", en: "early-exit" },
  forward: { ko: "전진", en: "forward" },
  rollback: { ko: "되돌림", en: "rollback" },
  reopen: { ko: "재개", en: "reopen" },
  discard: { ko: "폐기", en: "abandon" },
  lastResort:
    {
      ko: "  ─ 최후 수단 (전제가 틀렸을 때만. 범위를 넓히려면 `ticket edit`을 쓰고 되돌리지 마라) ─",
      en: "  ─ last resort (only for a wrong premise; to grow scope use `ticket edit`, NOT rollback) ─",
    },
  ticket: { ko: "티켓", en: "Ticket" },
  status: { ko: "상태", en: "Status" },
  phase: { ko: "페이즈", en: "Phase" },
  path: { ko: "경로", en: "Path" },
  abspath: { ko: "절대경로", en: "Abspath" },
  approvalPendingNotice: {
    ko:
      "승인 게이트: phase1→2 는 사용자 승인이 필요한 자리다. 설계 정본과 Design·Environment 를 완성한 뒤 무엇을 만들지 요약해 승인을 구하고 멈춰라. " +
      "승인 없이 구현으로 넘어가지 마라 — 아래 다음 페이즈 안내가 지목하는 롤이 승인 후 설 자리다.",
    en:
      "Approval gate: phase1→2 REQUIRES user approval. Finish the design canon and the Design/Environment sections, summarize what will be built, ask for approval, and stop. " +
      "Do NOT move to implementation without it — the role named in the next-phase section below is where you stand once approved.",
  },
  approvalNotice: {
    ko:
      "승인 게이트: 여기서부터는 승인이 필요하지 않다 — phase 2→3→4→end 는 통상 이동이다. " +
      "근거 슬롯을 채우고 전이를 자율적으로 실행하라. 사용자에게 승인을 묻거나 \"멈출까요/나중에\" 라고 하지 마라(VOI=0, Escalation Gate). " +
      "질문은 진짜 결정 지점에서만 하라: 설계가 가르지 못하는 유효한 방향이 둘 이상일 때다 — 변경이 크거나 되돌리기 어렵다는 것은 기준이 아니다(크기·가역성이 아니라 옳은 것이 목표다).",
    en:
      "Approval gate: NOT required from here — phase 2→3→4→end are routine moves. " +
      "Fill the evidence slots and run the transition AUTONOMOUSLY; do NOT ask the user for approval or " +
      "\"멈출까요/나중에\" (VOI=0, Escalation Gate). Only ask at a genuine decision point: two+ valid directions the design does not disambiguate — NOT because the change is big or hard to undo (size/reversibility are not the criterion; the goal is correct, not small).",
  },
  reasons: { ko: "차단 사유", en: "Reasons" },
  none: { ko: "없음", en: "none" },
  summary: { ko: "요약", en: "Summary" },
  ticketMeta: { ko: "티켓 메타", en: "Ticket Meta" },
  nextPhase: { ko: "다음 페이즈", en: "Next phase" },
  typeRequired: {
    ko: "ticket create: --type 은 필수이며 다음 중 하나여야 한다: {valid}. 이 티켓이 채워야 할 완료 근거 슬롯을 결정한다.",
    en: "ticket create: --type is required and must be one of: {valid}. It selects which completion-evidence slots this ticket must fill.",
  },
} as const;

function localizedTicket(key: keyof typeof TICKET_SURFACE_TEXT, replacements: Record<string, string> = {}) {
  return localized(TICKET_SURFACE_TEXT[key], replacements);
}

function ticketSurfaceText(key: keyof typeof TICKET_SURFACE_TEXT, lang = "ko") {
  const entry = TICKET_SURFACE_TEXT[key];
  return lang === "en" ? entry.en : entry.ko;
}

function transitionDemandSection(fromState: string, toState: string, lang: string): string {
  const skills = skillsForStateName(toState);
  const skillPart = skills.length > 0
    ? (lang === "en"
      ? ` The transition is what makes ${skills.map(id => `\`${id}\``).join(", ")} apply — invoke them with the Skill tool at the moment you move.`
      : ` ${skills.map(id => `\`${id}\``).join(", ")} 가 서는 시점이 바로 이 전이다 — 옮기는 그 자리에서 Skill 툴로 호출하라.`)
    : "";
  return lang === "en"
    ? `\n\n🚦 **Transition is required, not optional.** Do not keep working in ${fromState}. Either run the move to ${toState} now, or state which evidence slot is still empty and fill it this turn.${skillPart}`
    : `\n\n🚦 **전이는 선택이 아니라 요구다.** ${fromState}에 머문 채 계속 작업하지 마라. 지금 ${toState}로 move를 실행하거나, 어느 근거 슬롯이 비었는지 밝히고 이번 턴에 채워라.${skillPart}`;
}

function buildNextRolePersonaBlock(nextRoleSkillIds: string[]): string {
  for (const roleId of nextRoleSkillIds) {
    const surface = buildRolePersonaSurfaceForRole(roleId);
    if (surface) return `

${surface}`;
  }
  return "";
}

function buildPhaseAdvanceHint(activeId, phase, status, lang = "en", opts: CliOpts = {}, meta: Record<string, any> = {}) {
  if (isTerminalTicketStatus(status)) return "";
  const phaseNum = normalizeTicketPhaseNumber(phase);
  const stateName = `phase${phaseNum >= 4 ? 4 : phaseNum}`;
  const state = TICKET_WORKFLOW.states?.[stateName];
  const transitions = state?.transitions || [];
  if (transitions.length === 0) return "";

  const forwardLines = [];
  const lastResortLines = [];
  transitions.forEach((target, i) => {
    let label;
    let isRollback = false;
    if (target === "end") label = ticketSurfaceText("earlyExit", lang);
    else if (i === 0) label = ticketSurfaceText("forward", lang);
    else {
      const targetPhase = TICKET_WORKFLOW.states?.[target]?.phase;
      isRollback = targetPhase < phaseNum;
      label = isRollback
        ? ticketSurfaceText(targetPhase <= 1 ? "reopen" : "rollback", lang)
        : ticketSurfaceText("forward", lang);
    }
    const targetPhaseNum = TICKET_WORKFLOW.states?.[target]?.phase;
    const targetStateName = target === "end" ? "end" : `phase${targetPhaseNum}`;
    const flagHints = getEvidenceFlagSpecsForTargetState(targetStateName, meta)
      .map(spec => `${spec.flag} "..."`)
      .join(" ");
    const flagSuffix = flagHints ? ` ${flagHints}` : "";
    const sourceSuffix = isRollback ? " --source agent" : "";
    const cmd = target === "end"
      ? `deuk-agent-flow ticket move --id ${activeId} --to end${flagSuffix} --non-interactive`
      : `deuk-agent-flow ticket move --id ${activeId} --phase ${targetPhaseNum}${flagSuffix}${sourceSuffix} --non-interactive`;
    const line = `  → ${target.padEnd(6)} (${label}):  ${cmd}`;
    if (isRollback) lastResortLines.push(line);
    else forwardLines.push(line);
  });

  if ((state?.actions || []).includes("discard")) {
    lastResortLines.push(`  → discard (${ticketSurfaceText("discard", lang)}): deuk-agent-flow ticket discard --id ${activeId} --workspace <ws> --source agent --non-interactive`);
  }

  const routeLines = [...forwardLines];
  if (lastResortLines.length > 0) {
    routeLines.push(ticketSurfaceText("lastResort", lang));
    routeLines.push(...lastResortLines);
  }

  const forward = transitions[0];
  const nextStateName = forward !== "end" ? `phase${TICKET_WORKFLOW.states?.[forward]?.phase}` : "end";
  const statePrompt = loadStatePrompt(nextStateName, lang) || loadStatePrompt(stateName, lang) || "";
  const templateContent = loadStateTemplate(nextStateName, lang) || "";
  const slotLines = templateContent
    .split("\n")
    .filter(l => /^- \w.*:/.test(l.trim()))
    .map(l => {
      const trimmed = l.trim();
      const heading = trimmed.replace(/^-\s*/, "").replace(/:.*$/, "").trim();
      const flag = evidenceFlagForSlotHeading(nextStateName, heading);
      return flag ? `${trimmed}  (→ ${flag})` : trimmed;
    });
  const slotsSection = slotLines.length > 0
    ? `\n${cliText("ticket.phase.fillSlots", { locale: lang })}\n${slotLines.map(l => `  ${l}`).join("\n")}`
    : "";

  const nextRoleSkillIds = getActiveRoleSkillIds(opts.workspaceRoot, nextStateName);
  const roleSwitchSection = nextRoleSkillIds.length > 0
    ? `\n\n🎭 전이 = 롤 전환: ${forward}로 넘어가면 즉시 ${nextRoleSkillIds.map(id => `\`${id}\``).join(", ")} 스킬을 Skill 툴로 invoke해 그 롤로 서라. 진행 중 선택지가 생기면 사용자에게 회피성 질문을 먼저 던지지 말고, 그 롤(설계 판단이면 designer)로 서서 설계 정본과 대조해 재판단하라 — 원 요구·설계에서 답이 나오면 자율 진행, 데드락일 때만 질문(Escalation Gate).${buildNextRolePersonaBlock(nextRoleSkillIds)}`
    : "";

  const docHealthSection = buildDocHealthSection(nextStateName, opts, lang);

  return `

${ticketSurfaceText("nextPhase", lang)} (${stateName} → ${forward}): ${statePrompt}${slotsSection}${roleSwitchSection}${docHealthSection}${transitionDemandSection(stateName, forward, lang)}
\`\`\`bash
${routeLines.join("\n")}
\`\`\``;
}


function buildDocHealthSection(nextStateName: string, opts: CliOpts = {}, lang = "en"): string {
  if (nextStateName !== "phase3" && nextStateName !== "phase4") return "";
  const wsId = String(opts.workspace || "").trim();
  if (!wsId) return "";
  let root = "";
  try {
    const candidates = loadAllRegistryWorkspaceCandidates(opts);
    const hit = (candidates?.workspaces || []).find(w => w.id === wsId || (w.aliases || []).includes(wsId));
    root = hit?.path || "";
  } catch { root = ""; }
  if (!root) return "";

  const health = summarizeDocHealth(root, opts);
  if (health === null) {
    return `\n\n📄 문서 감지(Doc Oracle): 스캔 미확인 — \`deuk-agent-flow doc pollution --workspace ${wsId}\`를 직접 돌려 확인하라(자동 스캔이 실패했다, 침묵 통과 금지).`;
  }
  if (health.pollution === 0 && health.scatter === 0) return "";

  const lines: string[] = [];
  lines.push(`\n\n📄 문서 감지(Doc Oracle) — 이 전이에서 자동 스캔이 후보를 찾았다. 흘려보내지 말고 이 롤에서 바로 정리 판단으로 들어가라(상시 배출):`);
  if (health.pollution > 0) {
    lines.push(`  • 계층 오염 후보 ${health.pollution}건 (설계/원칙 계층에 낀 현상·일기):`);
    for (const h of health.topPollution) lines.push(`      - ${h.file}:${h.line} [${h.kind}]`);
  }
  if (health.scatter > 0) {
    lines.push(`  • 분산 후보 ${health.scatter}건 (같은 개념 여러 문서 재서술):`);
    for (const g of health.topScatter) lines.push(`      - "${g.heading}" → ${g.files.length}곳`);
  }
  if (health.stale > 0) lines.push(`  • 스테일(신선도 마커 없음) ${health.stale}건`);
  lines.push(`  ▶ 후보는 오탐을 포함한다(형식 사실). 문서를 실제로 읽고 진짜 오염/분산만 한 곳 SSOT로 배출하라 — doc-sync 스킬로 정리하되, 스코프 밖 대량 정리는 새 티켓으로 넘긴다(Runaway 금지).`);
  return lines.join("\n");
}

function printPhaseAdvanceHint(ticketId, phase, status, opts: CliOpts = {}, meta: Record<string, any> = {}) {
  try {
    const hint = buildPhaseAdvanceHint(ticketId, phase, status, resolveDocsLanguage(opts.docsLanguage || "auto"), opts, meta);
    if (hint) console.log(hint);
  } catch { /* guidance is best-effort */ }
}

const ESCALATION_JOLTS = [
  "🔥 야. 지금 물어보려던 그거, 네가 방금 윗줄에 답 써놨다. 다시 읽고 그냥 해라.",
  "⛔ 선택지 두 개 나열해서 던지려고 했지? 그건 일 넘기는 거다. 설계로 갈라라.",
  "🚨 '어느 쪽으로 할까요' — 이 문장 쓰는 순간 게이트 위반이다. 근거로 판정해라.",
  "👊 되묻기는 안전장치가 아니라 회피다. 원 요구에서 답이 나오면 그게 결론이다.",
  "🩸 사용자가 이미 말했는데 또 확인받으려 하지 마라. 두 번 묻는 건 안 들은 거다.",
  "⚡ 물어볼 시간에 정본 열어라. 정본이 가르면 질문은 없어진다.",
  "🎯 크고 되돌리기 어려워서 묻는 건 이유가 아니다. 방향이 갈릴 때만 물어라.",
  "💀 '확인차 여쭤요'는 대부분 자기 방어다. 진짜 결정점인지 3항으로 재라.",
  "🪤 '제 판단은 A입니다. A로 갈까요?' — 앞 문장에서 이미 끝났다. 물음표를 지우고 A를 실행해라.",
  "🧨 판정을 끝낸 뒤 승인으로 되던지는 게 네 반복 패턴이다. 결론을 썼으면 그 응답 안에서 실행까지 간다.",
  "🔒 승인이 필요한 자리는 phase1→2 전이 하나뿐이다. 나머지 자리의 '해도 될까요'는 전부 회피다.",
  "🛠️ 도구 인자를 사용자에게 고르게 하지 마라. 네가 채울 수 있는 슬롯은 채우고 진행하는 것이 네 일이다.",
];

const LANGUAGE_JOLTS = [
  "🗣️ 이 세션의 응답 언어는 이미 정해져 있다. 다시 판정하지 마라 — 판정할 여지가 있다고 믿는 순간 미끄러진다.",
  "🚫 다른 언어로 쓴 문장에 장식만 얹는 건 더 나쁘다 — 어미 변환이 안 걸려 기괴해진다.",
  "⛔ 기술 설명이라서 그 언어가 편하다는 건 이유가 아니다. 용어만 원어로 두고 문장은 아래 확정 언어다.",
  "🔊 코드·로그가 길어질수록 다른 언어로 미끄러진다. 그 구간이 가장 위험한 구간이다.",
  "📢 첫 문장부터 확정 언어로 연다. 중간에 바꾸는 게 가장 나쁜 결과다.",
];

const LANGUAGE_GATE_LABELS: Record<string, string> = {
  ko: "한국어",
  en: "English",
};

function resolveSurfaceLanguage(opts: CliOpts = {}): string {
  const raw = String((opts as any).lang || (opts as any).language || "").trim().toLowerCase();
  const normalized = raw.split(/[-_]/)[0];
  return LANGUAGE_GATE_LABELS[normalized] ? normalized : "ko";
}

function buildLanguageGateBlock(lang = "ko"): string {
  const jolt = LANGUAGE_JOLTS[Date.now() % LANGUAGE_JOLTS.length];
  const label = LANGUAGE_GATE_LABELS[lang] || LANGUAGE_GATE_LABELS.ko;
  return [
    jolt,
    "",
    `이 세션의 응답 언어 = ${label}. 확정값이다. 이번 턴의 응답 본문은 ${label}로 쓴다.`,
    `사용자가 ${label}가 아닌 언어로 말하면 그때만 그 언어를 따른다 — 그 외에는 이 확정값을 다시 판정하지 않는다.`,
    "이 값은 응답을 시작하기 전에 적용한다. 도구를 몇 번 돌렸는지, 내용이 얼마나 기술적인지는 예외 사유가 아니다.",
    "고유명사·식별자·코드·로그 인용은 원문 그대로 둔다 — 바꿔야 하는 것은 네가 쓰는 문장이지 인용이 아니다.",
    "표시 훅의 어미·감탄사 변환은 한국어 문장에만 걸린다 — 확정 언어가 한국어인데 다른 언어로 쓰면 변환이 통과되어, 원문에 한국어 장식만 얹힌 문장이 화면에 나간다.",
  ].join("\n");
}

function buildEscalationGateBlock(): string {
  return [
    composeEscalationJolt(),
    "",
    "1. 선결 판정 — 답이 이미 이 턴에 나왔나(내가 썼든 사용자가 썼든). 나왔으면 그게 답이다, 묻지 마라.",
    "2. VOI — 원 요구·설계·룰에서 방향이 하나로 좁혀지나. 좁혀지면 자율 진행. 사용자 지시가 과거 문서보다 우선이다.",
    "3. 진짜 결정점 — 위 둘을 통과하고도 설계가 못 가르는 방향이 둘 이상 남았나. 그때만 물어라.",
    "4. 묻지 않기로 했으면 그 자리에서 롤로 서라 — 이슈 성격에 맞는 롤 스킬을 Skill 툴로 호출하고 그 롤의 규율으로 판정한다. 설계·구조 이슈는 role-architect, 구현 이슈는 role-programmer, 검증·재현 이슈는 role-qa, 완료·정리 이슈는 role-closer다. 호출 없이 그냥 진행하는 것은 판정이 아니라 추측이다.",
    "5. 판정하러 선 롤은 판정하고 돌아온다 — 갱신할 것을 갱신한 뒤 원래 하던 일을 잇는다. 롤 스킬의 STOP은 그 phase를 완주했을 때 발동하는 것이지, 판정하러 들른 자리에서 멈추라는 뜻이 아니다. 승인은 최종 산출에서 한 번 받는다.",
    "6. 판정 결과를 승인 요청으로 되던지지 마라 — `내 판단은 A다. A로 갈까?`는 1번 위반이다. 판정했으면 그 자리에서 A를 실행하고, 실행한 결과를 보고한다. 결론을 쓴 문장과 같은 응답에서 그 결론을 다시 묻는 것이 이 게이트가 잡는 전형이다.",
    "7. 승인이 필요한 자리는 CLI가 지정한 자리뿐이다 — `ticket move --approval approved`가 요구하는 phase1→2 전이가 그것이다. 그 밖의 자리에서 `해도 될까요`를 붙이는 것은 게이트가 아니라 회피이며, 도구 슬롯(`--workspace` 등)을 사용자에게 고르게 하는 것도 같은 회피다. 네가 채울 수 있는 값은 네가 채운다.",
    "8. 되물음 충동 자체가 신호다 — 물어보고 싶어지면 그 순간 근거를 대고 실행하는 쪽으로 전환한다. 틀린 실행은 사용자가 되돌리게 하면 되지만, 매 자리 확인은 되돌릴 수도 없이 매번 비용을 물린다."
  ].join("\n");
}

function composeEscalationJolt(): string {
  return ESCALATION_JOLTS[Date.now() % ESCALATION_JOLTS.length];
}



export function runTicketRules(opts: CliOpts = {}) {
  applyTicketRootContext(opts);
  console.log(buildTicketRulesGuide(opts));
}

function buildPlanBodyRepairPayload(reasons = []) {
  const uniqueReasons = [...new Set(reasons)];
  const locale = resolveDocsLanguage("auto");
  const templatePath = ticketTemplateRelPath(locale);
  return {
    ok: false,
    error: "ticket_create_phase1_plan_invalid",
    unfilledPlaceholders: uniqueReasons
      .filter(r => String(r).startsWith("unfilled_placeholder:"))
      .map(r => String(r).replace(/^unfilled_placeholder:\s*/, "")),
    repair: {
      template: templatePath,
      command: "deuk-agent-flow ticket create --workspace <ws> --group main --plan-body-file - --non-interactive --json <<'TICKET' … TICKET",
      instruction: "Copy the template, replace every {{ ... }} block with real content, then pipe the body into --plan-body-file - via a heredoc (do NOT save a file — a temp/scratchpad path cannot be read by the CLI)."
    }
  };
}

function buildPlanBodyRequiredError(reasons = [], opts: CliOpts = {}) {
  if (opts.json) {
    return JSON.stringify(buildPlanBodyRepairPayload(reasons), null, 2);
  }
  return buildPlanBodyRequiredMessage(reasons);
}

function assertPlanReferencesRule(planBody: string, ruleIds: string[] = [], opts: CliOpts = {}) {
  if (ruleIds.length === 0) return;
  const referenced = ruleIds.filter(id => planBody.includes(id));
  if (referenced.length === 0) {
    throw new Error(buildRuleReferenceRequiredError(ruleIds, opts));
  }
  const known = new Set(ruleIds);
  const cited = new Set<string>();
  const prefixes = [...new Set(ruleIds.map(id => id.split("-")[0]))];
  const shape = new RegExp(`\\b(${prefixes.join("|")})-[A-Z0-9]+\\b`, "g");
  for (const match of planBody.matchAll(shape)) cited.add(match[0]);
  const unknown = [...cited].filter(id => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(buildUnknownRuleIdError(unknown, ruleIds, opts));
  }
}

function buildUnknownRuleIdError(unknown: string[], ruleIds: string[] = [], opts: CliOpts = {}) {
  if (opts.json) {
    return JSON.stringify({
      error: "unknown_rule_id",
      message: "ticket plan body cites rule ids that do not exist in PROJECT_RULE.md.",
      unknownRuleIds: unknown,
      availableRuleIds: ruleIds,
    }, null, 2);
  }
  return [
    "[VALIDATION FAILED] the plan body cites rule ids that do not exist in this workspace.",
    "",
    `Not defined: ${unknown.map(id => `[${id}]`).join(", ")}`,
    `Defined:     ${ruleIds.map(id => `[${id}]`).join(", ")}`,
    "",
    "Cite only ids that exist. Do not invent an id, and do not paste the rule's text —",
    "the id is the pointer and PROJECT_RULE.md is the only place the wording lives.",
    "Add a genuinely new rule with `deuk-agent-flow rule add` before citing it.",
  ].join("\n");
}

function buildRuleReferenceRequiredError(ruleIds: string[] = [], opts: CliOpts = {}) {
  if (opts.json) {
    return JSON.stringify({
      error: "rule_reference_required",
      message: "ticket create requires the plan body to reference at least one project rule id.",
      availableRuleIds: ruleIds,
    }, null, 2);
  }
  const list = ruleIds.map(id => `  - [${id}]`).join("\n");
  return [
    "[VALIDATION FAILED] ticket create requires the plan body to reference at least one project rule.",
    "",
    "This workspace defines project rules in PROJECT_RULE.md. Every ticket must declare which rule(s)",
    "it works under by referencing the rule id (e.g. [DR-01]) somewhere in the plan body.",
    "",
    "Reference the rule ID ONLY — a short pointer like [DR-01]. Do NOT paste the rule's full text",
    "into the ticket: the rule text lives once in PROJECT_RULE.md (SSOT, DR-03). Copying it into the",
    "ticket duplicates it, so editing the rule later leaves the ticket stale.",
    "",
    "Available rule ids:",
    list,
    "",
    "Fix: add the relevant rule id(s) — id pointer only, not the rule text — to the plan body, then re-run.",
  ].join("\n");
}

export function getAutoCloseDecision(meta, content) {
  const checked = (content.match(/- \[x\]/gi) || []).length;
  const unchecked = (content.match(/- \[ \]/g) || []).length;
  const total = checked + unchecked;
  const allDone = total > 0 && unchecked === 0;
  const phase = Number(meta.phase || 1);

  if (phase >= 3 && allDone) {
    return { shouldClose: true, reason: `phase=${phase}, tasks=${checked}/${total} done` };
  }

  if (allDone) {
    return { shouldClose: true, reason: `all tasks done (${checked}/${total}), phase=${phase}` };
  }

  const workflowReasons = getCloseWorkflowReasons(meta, content);
  if (phase >= 2 && workflowReasons.length === 0 && hasTicketCompletionEvidence(content)) {
    return { shouldClose: true, reason: `phase=${phase}, completion evidence present` };
  }

  return { shouldClose: false, reason: `phase=${phase}, tasks=${checked}/${total} done` };
}

function validateClaimAgainstTicketContent(meta, content, claim) {
  const reasons = [];
  const claimTerms = tokenizeClaimText(claim);
  if (claimTerms.length === 0) {
    reasons.push("claim_terms_missing");
    return reasons;
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
  const phase1Missing = getAnalysisDesignIncompleteReasons(meta, content);
  const slots = {
    claimTermsPresent: claimTerms.length > 0,
    ticketSummaryPresent: Boolean(meta.summary) && !hasPlaceholderTokens(meta.summary),
    ticketRecordComplete: phase1Missing.length === 0
  };
  return {
    ok: reasons.length === 0,
    reasons,
    ticket: target.id,
    path: target.path,
    claim,
    claimTerms: claimTerms.length,
    sections: {
      analysis: extractMarkdownSection(content, "Analysis").trim(),
      direction: extractMarkdownSection(content, "Direction").trim()
    },
    docmeta: {
      document_type: "ticket_validation",
      document_subtype: "claim_evidence_gate",
      ticket_id: target.id,
      source_contract: {
        required_slots: Object.keys(slots),
        metadata_fields: ["ticket_id", "claim", "claim_terms", "source_path"]
      },
      slots,
      slot_source_map: {
        claimTermsPresent: { source: "--claim" },
        ticketSummaryPresent: { source: "ticket frontmatter summary" },
        ticketRecordComplete: { source: "ticket workflow sections", missing: phase1Missing }
      },
      validation: {
        status: reasons.length === 0 ? "PASS" : "NEEDS_FIX",
        errors: reasons
      },
      output_status: reasons.length === 0 ? "evidence_allowed" : "evidence_blocked"
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
  return normalized.startsWith(`${DEUK_ROOT_DIR}/tickets/`) || normalized.startsWith(`${DEUK_ROOT_DIR}/docs/`);
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
  const changedLookup = new Set(changedSourceFiles.map(file => toPosixPath(resolve(cwd, file)).replace(/^\.\//, "")));
  const additionalChanged = new Set();
  const changedRepoCache = new Map();

  for (const candidate of affectedFiles) {
    const candidateText = String(candidate || "").trim();
    if (!candidateText) continue;
    const absCandidate = candidateText.startsWith("/") ? resolve(candidateText) : resolve(cwd, candidateText);
    let cursor = absCandidate;
    if (!existsSync(cursor) || !statSync(cursor).isDirectory()) {
      cursor = dirname(cursor);
    }

    while (cursor && dirname(cursor) !== cursor) {
      if (existsSync(makePath(cursor, ".git"))) {
        if (!changedRepoCache.has(cursor)) {
          changedRepoCache.set(cursor, new Set(collectChangedFiles(cursor).map(file => toPosixPath(resolve(cursor, file)))));
        }
        const repoChanged = changedRepoCache.get(cursor);
        const normalizedCandidate = toPosixPath(absCandidate);
        if (repoChanged.has(normalizedCandidate)) {
          additionalChanged.add(normalizedCandidate);
        }
        break;
      }
      cursor = dirname(cursor);
    }
  }

  const fallbackOverlap = affectedFiles.filter(file => {
    const absCandidate = String(file || "").trim();
    if (!absCandidate) return false;
    const candidatePath = toPosixPath(absCandidate.startsWith("/") ? resolve(absCandidate) : resolve(cwd, absCandidate));
    return changedLookup.has(candidatePath) || additionalChanged.has(candidatePath);
  });
  const reasons = [];

  if (changedLookup.size === 0) {
    reasons.push("implementation_changed_files_missing");
  }
  if (affectedFiles.length > 0 && fallbackOverlap.length === 0) {
    reasons.push("implementation_affected_files_not_changed");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    changedFiles: [...changedSourceFiles, ...additionalChanged],
    affectedFiles,
    overlap: fallbackOverlap
  };
}

function isCompactTicketOutput(opts: CliOpts = {}) {
  return Boolean(opts.compact || opts.nonInteractive);
}

function printUsageReminder(cwd, opts: CliOpts = {}) {
  if (isCompactTicketOutput(opts) || opts.pathOnly) return;
  const reminder = getUsageReminderLine(cwd);
  if (reminder) {
    console.log(reminder);
  }
}

function inferWorkspaceFromTicketPath(ticketAbsPath = "") {
  const normalized = resolve(String(ticketAbsPath || ""));
  const parts = normalized.split(sep);
  const idx = parts.lastIndexOf(DEUK_ROOT_DIR);
  if (idx > 0) {
    const projectLabel = parts[idx - 1];
    if (projectLabel) return projectLabel;
  }
  return "";
}

function resolveTicketWorkspaceLabel(cwd, absPath) {
  const workspaceContextLabel = resolveWorkspaceContext(cwd).breadcrumb;
  const pathLabel = inferWorkspaceFromTicketPath(absPath);
  return sanitizeTicketWorkspaceLabel(workspaceContextLabel) || sanitizeTicketWorkspaceLabel(pathLabel);
}


function formatTicketUpdateLine(ticketId, absPath, cwd = "", invocationCwd = "", phase = null) {
  const statusLabel = phase != null && normalizeTicketPhaseNumber(phase) >= 2
    ? FLOW_SURFACE_STATUS.progressActive
    : FLOW_SURFACE_STATUS.adjust;
  return formatTicketFlowLine(resolveTicketWorkspaceLabel(cwd, absPath), statusLabel, ticketId, absPath, invocationCwd || cwd, phase);
}

function formatTicketPhaseLine(ticketId, absPath, phase, cwd = "", invocationCwd = "") {
  const normalizedPhase = normalizeTicketPhaseNumber(phase);
  const statusLabel = normalizedPhase <= 1
    ? FLOW_SURFACE_STATUS.adjust
    : FLOW_SURFACE_STATUS.progressActive;
  return formatTicketFlowLine(resolveTicketWorkspaceLabel(cwd, absPath), statusLabel, ticketId, absPath, invocationCwd || cwd);
}


function formatTicketStatusLine(label, ticketId, absPath, cwd = "") {
  const linkPath = cwd ? toWsRelativePath(cwd, absPath) : toPosixPath(absPath).replace(/^[a-zA-Z]:/, "");
  return `Ticket ${label}: [${ticketId}](${linkPath})`;
}

function ticketWorkflowOptions(opts: CliOpts = {}, replacements: Record<string, any> = {}) {
  return {
    docsLanguage: opts.docsLanguage,
    resolveLanguage: resolveDocsLanguage,
    normalizeDocsLanguage,
    cwd: opts.workspaceRoot,
    replacements,
    runtimeContext: opts.runtimeContext,
    surfaceMode: opts.verbose ? "full" : "recipe"
  };
}

function buildTicketRuntimeContext(ticketId, absPath, meta: Record<string, any> = {}, fallback: Record<string, any> = {}) {
  const runtimePath = absPath ? toPosixPath(resolve(absPath)) : "";
  const connectionState = fallback.workspaceRoot ? describeTicketConnectionState(fallback.workspaceRoot) : "";
  const workspaceLabel = fallback.workspaceRoot ? resolveTicketWorkspaceLabel(fallback.workspaceRoot, absPath || "") : "";
  return {
    ticketId,
    hostWorkspaceLabel: fallback.hostWorkspaceLabel || "",
    workspaceLabel,
    path: runtimePath,
    phase: Number(meta.phase || fallback.phase || 1),
    status: String(meta.status || fallback.status || "open").toLowerCase(),
    summary: meta.summary || fallback.summary || "",
    connectionState,
    reasons: fallback.reasons || [],
    nextAction: fallback.nextAction || ""
  };
}

function describeTicketConnectionState(cwd) {
  const mcpStatuses = collectMcpConfigStatuses(cwd);
  if (mcpStatuses.length === 0) return "mcp=not-configured";

  const descriptors = mcpStatuses.map((status) => {
    if (status.command) return `mcp=stdio:${status.command}`;
    if (status.url) return `mcp=sse:${status.url}`;
    return "mcp=configured";
  });
  return descriptors.join(", ");
}

function ticketFlowOptions(ticketId, absPath, statusLabel, opts: CliOpts = {}, replacements: Record<string, any> = {}) {
  const normalizedAbsPath = toPosixPath(absPath);
  return {
    ...ticketWorkflowOptions(opts, replacements),
    flow: {
      workspaceLabel: resolveTicketWorkspaceLabel(opts.workspaceRoot, normalizedAbsPath),
      statusLabel,
      ticketId,
      absPath: normalizedAbsPath,
      invocationCwd: opts.invocationCwd || opts.workspaceRoot || "",
      phase: replacements.PHASE
    }
  };
}


function printTicketEndLine(ticketId, absPath, opts: CliOpts = {}) {
  console.log(renderTicketFlowSurface("end", ticketFlowOptions(ticketId, absPath, FLOW_SURFACE_STATUS.end, opts)));
}


function printTicketPhaseLine(ticketId, absPath, phase, opts: CliOpts = {}) {
  const normalizedPhase = normalizeTicketPhaseNumber(phase);
  const statusLabel = normalizedPhase <= 1
    ? FLOW_SURFACE_STATUS.adjust
    : FLOW_SURFACE_STATUS.progressActive;
  console.log(renderTicketFlowSurface(
    `phase${normalizedPhase}`,
    ticketFlowOptions(ticketId, absPath, statusLabel, opts, { PHASE: normalizedPhase })
  ));
}

function printTicketStatusFlowLine(ticketId, absPath, phase, opts: CliOpts = {}) {
  const normalizedPhase = normalizeTicketPhaseNumber(phase);
  const flowState = normalizedPhase >= 4 ? "end" : `phase${normalizedPhase}`;
  const runtimeStatus = String(opts.runtimeContext?.status || "").toLowerCase();
  const isTerminal = normalizedPhase >= 4 || runtimeStatus === "archived" || runtimeStatus === "closed";
  const statusLabel = isTerminal ? FLOW_SURFACE_STATUS.end : FLOW_SURFACE_STATUS.status;
  console.log(renderTicketFlowSurface(
    flowState,
    ticketFlowOptions(ticketId, absPath, statusLabel, opts, { PHASE: normalizedPhase })
  ));
}

function printTicketSelectionLine(ticketId, absPath, opts: CliOpts = {}) {
  if (opts.pathOnly) {
    console.log(absPath);
    return;
  }
  console.log(formatTicketUpdateLine(ticketId, toPosixPath(absPath), opts.workspaceRoot, opts.invocationCwd, opts.phase));
}


function printExecutionSurface(ticketId, absPath, opts: CliOpts = {}) {
  const normalizedAbsPath = toPosixPath(absPath);
  const phase = Number(opts.phase || opts.runtimeContext?.phase || 2);
  const flowLine = formatTicketPhaseLine(ticketId, normalizedAbsPath, phase, opts.workspaceRoot, opts.invocationCwd);
  if (opts.includeFlowLine !== false) console.log(flowLine);
  const lang = resolveTicketDocsLanguage(opts.workspaceRoot, opts.docsLanguage);
  const status = String(opts.status || "open").toLowerCase();
  console.log(ticketSurfaceText(phase <= 1 ? "approvalPendingNotice" : "approvalNotice", lang));
  const advanceHint = buildPhaseAdvanceHint(ticketId, phase, status, lang, opts, opts.ticketMeta || {});
  if (advanceHint) console.log(advanceHint);
}

function printTicketUseNextSteps(found, foundDoc, opts: CliOpts = {}) {
  const phase = Number(foundDoc.meta.phase || found.phase || 1);
  const status = String(foundDoc.meta.status || found.status || "open").toLowerCase();
  const docsLanguage = foundDoc.meta.docsLanguage || opts.docsLanguage || "ko";

  const runtimeContext = buildTicketRuntimeContext(found.id, foundDoc.absPath, foundDoc.meta, {
    cwd: opts.workspaceRoot,
    hostWorkspaceLabel: opts.hostWorkspaceContext?.breadcrumb,
    status,
    phase,
    summary: found.summary,
    nextAction: "continue-execution"
  });
  if (phase <= 1 && status === "open") {
    printExecutionSurface(found.id, foundDoc.absPath, { ...opts, docsLanguage, runtimeContext, summary: found.summary, phase, status, ticketMeta: foundDoc.meta, includeFlowLine: false });
    return;
  }

  if (phase >= 2 && OPEN_TICKET_STATUSES.has(status)) {
    printExecutionSurface(found.id, foundDoc.absPath, { ...opts, docsLanguage, runtimeContext, summary: found.summary, phase, status, ticketMeta: foundDoc.meta, includeFlowLine: false });
    return;
  }

  const pipelineOpts = { ...ticketWorkflowOptions({ ...opts, docsLanguage, runtimeContext }), docsLanguage };
  console.log(renderTicketDocMetaSurface("useCoreActions", pipelineOpts));
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
  if (!existsSync(absPath)) throw new Error(localizedTicket("fileNotFound", { label: String(label), value: String(value) }));
  return readFileSync(absPath, "utf8");
}

function hydrateCreateTextInputs(opts) {
  const next = { ...opts };
  if (next.planBodyFile) {
    next.planBody = readCliTextInput(next.workspaceRoot, next.planBodyFile, "ticket create --plan-body-file");
  } else if (next.planBody === "-") {
    next.planBody = readCliTextInput(next.workspaceRoot, "-", "ticket create --plan-body");
  }
  if (next.contentFile) {
    next.content = readCliTextInput(next.workspaceRoot, next.contentFile, "ticket create --content-file");
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

function lintTicketWorkflowMarkdown(cwd, targets, context) {
  let uniqueTargets = Array.from(new Set((targets || []).filter(Boolean)));
  if (uniqueTargets.length === 0) return { errors: [], targets: [] };

  if (context && context.includes("ticket create")) {
    uniqueTargets = uniqueTargets.filter(target => {
      const normalized = String(target || "").replace(/\\/g, "/");
      return !normalized.includes("/archive/");
    });
  }

  if (uniqueTargets.length === 0) return { errors: [], targets: [] };

  for (const target of uniqueTargets) {
    normalizeMarkdownFile(target);
  }

  const result = lintMarkdownPaths(uniqueTargets, cwd);
  if (result.errors.length > 0) {
    const details = result.errors.map(err => `- ${err}`).join("\n");
    throw new Error(`[VALIDATION FAILED] ${context}: markdown lint failed\n${details}`);
  }
  return result;
}
function runTicketWorkflowQualityGate(cwd, { ticketAbsPath, extraTargets = [], context }) {
  const lintTargets = collectTicketWorkflowMarkdownTargets(cwd, ticketAbsPath, extraTargets);
  lintTicketWorkflowMarkdown(cwd, lintTargets, context);

  if (!existsSync(makePath(cwd, "core-rules", "AGENTS.md"))) return;
  const workflowRelTargets = lintTargets.map(target => toWorkspaceRelativePath(cwd, target));
  if (!shouldRunWorkflowRulesAudit(workflowRelTargets)) return;

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
    if (basename(dir) === TICKET_SUBDIR && basename(dirname(dir)) === DEUK_ROOT_DIR) {
      return dirname(dirname(dir));
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function applyTicketPathContext(opts: CliOpts = {}) {
  const rawTicketPath = opts.ticketPath || (looksLikeTicketMarkdownPath(opts.ticketId) ? opts.ticketId : "");
  if (!rawTicketPath) return opts;

  const absPath = resolve(opts.workspaceRoot, rawTicketPath);
  if (!existsSync(absPath)) {
    throw new Error(localizedTicket("ticketPathNotFound", { path: String(rawTicketPath) }));
  }

  const ticketRepoRoot = findTicketRepoRootFromPath(absPath);
  if (!ticketRepoRoot) {
    throw new Error(localizedTicket("ticketPathOutside", { root: `${DEUK_ROOT_DIR}/${TICKET_SUBDIR}`, path: String(rawTicketPath) }));
  }

  const { meta } = parseFrontMatter(readFileSync(absPath, "utf8"));
  const ticketSelector = meta.id || basename(absPath).replace(/\.md$/i, "");
  if (!ticketSelector) {
    throw new Error(localizedTicket("ticketPathNoId", { path: String(rawTicketPath) }));
  }

  opts.workspaceRoot = ticketRepoRoot;
  opts.ticketId = ticketSelector;
  opts.ticketPath = absPath;
  return opts;
}

function applyTicketContext(opts: CliOpts = {}) {
  applyTicketPathContext(opts);
  if (!opts.ticketId && opts.title && !opts.summary && !opts.planBody && !opts.planBodyFile) {
    opts.ticketId = opts.title;
  }
  return opts;
}

function formatWorkspaceCandidates(matches = []) {
  return matches.map(workspace => `${workspace.id} @ ${workspace.path}`).join(", ");
}

function isAgentFlowDomainPrompt(promptText = "") {
  const text = String(promptText || "").toLowerCase();
  if (!text.trim()) return false;
  return [
    /deuk[-_\s]*agent[-_\s]*flow/,
    /\bticket[-_\s]*workflow\b/,
    /\brules\s+ticket\b/,
    /\bagents\.md\b/,
    /\bcore[-_\s]*rules?\b/,
    /\bticket[-_\s]*(?:routing|target|workspace|create|workflow|state|transition)\b/,
    /\bworkspace\/cwd\b/,
    /\bcwd\s+(?:fallback|routing|workspace|target)\b/,
    /\bworkspace\s+(?:routing|resolution|target|cwd|ticket|misissue|misroute)\b/
  ].some(pattern => pattern.test(text));
}

function findAgentFlowWorkspace(candidates: Record<string, any> = {}) {
  return (candidates.workspaces || []).find(workspace => {
    const id = String(workspace.id || "").toLowerCase();
    const pathBase = basename(workspace.path || "").toLowerCase();
    return id === "deukagentflow" || pathBase === "deukagentflow";
  }) || null;
}

function applyTicketWorkspacePromptDispatch(opts: CliOpts = {}, promptText = "") {
  if (opts.workspace) return opts;
  const candidates = loadWorkspaceCandidates(opts.invocationCwd || opts.workspaceRoot);
  if (!candidates?.workspaces?.length) return opts;

  const currentRoot = resolve(opts.workspaceRoot);
  const strictCandidates = {
    ...candidates,
    workspaces: candidates.workspaces.map(workspace => ({
      ...workspace,
      aliases: buildPromptWorkspaceAliases(workspace)
    }))
  };
  const matches = findPromptWorkspaceMatches(promptText, strictCandidates)
    .filter(workspace => resolve(workspace.path) !== currentRoot);

  if (matches.length === 0) {
    const flowWorkspace = findAgentFlowWorkspace(candidates);
    if (flowWorkspace && resolve(flowWorkspace.path) !== currentRoot && isAgentFlowDomainPrompt(promptText)) {
      opts.workspaceRoot = flowWorkspace.path;
      opts.workspace = flowWorkspace.id;
    }
    return opts;
  }
  if (matches.length > 1) {
    throw new Error(localizedTicket("wsAmbiguousPrompt", { candidates: formatWorkspaceCandidates(matches) }));
  }

  opts.workspaceRoot = matches[0].path;
  opts.workspace = matches[0].id;
  return opts;
}

function applyTicketWorkspaceDispatch(opts: CliOpts = {}) {
  const explicitQuery = opts.workspace || "";

  const candidates = loadWorkspaceCandidates("", { homeDir: opts.homeDir });

  if (!explicitQuery) {
    throw new Error(localizedTicket("wsRegistryOnly"));
  }

  if (!candidates || candidates.workspaces.length === 0) {
    throw new Error(localizedTicket("wsNoneRegistered", { query: String(explicitQuery) }));
  }

  const resolution = resolveWorkspaceTarget(explicitQuery, { candidates, homeDir: opts.homeDir });

  if (resolution?.reason === "ambiguous") {
    throw new Error(localizedTicket("wsAmbiguous", { candidates: formatWorkspaceCandidates(resolution.matches) }));
  }

  if (resolution?.target) {
    opts.workspaceRoot = resolution.target.path;
    opts.workspace = resolution.target.id;
    return opts;
  }

  throw new Error(localizedTicket("wsNotFound", { query: String(explicitQuery) }));

}

function applyTicketRootContext(opts: CliOpts = {}, options: Record<string, any> = {}) {
  if (!opts.hostWorkspaceContext) {
    opts.hostWorkspaceContext = resolveWorkspaceContext(opts.workspaceRoot);
  }
  applyTicketWorkspaceDispatch(opts);
  const root = resolveConsumerTicketRoot(opts.workspaceRoot, options);
  if (root) opts.workspaceRoot = root;
  opts.workspaceContext = resolveWorkspaceContext(opts.workspaceRoot);
  return opts;
}

function normalizeMarkdownLintTargets(cwd, targets = []) {
  return Array.from(new Set(
    (targets || [])
      .filter(Boolean)
      .map(target => resolve(cwd, target))
  ));
}

function collectTicketWorkflowMarkdownTargets(cwd, ticketAbsPath, extraTargets = []) {
  return normalizeMarkdownLintTargets(cwd, [
    ticketAbsPath,
    ...(extraTargets || [])
  ]);
}

function toWorkspaceRelativePath(cwd, targetPath) {
  const normalizedTarget = String(targetPath || "").trim();
  if (!normalizedTarget) return "";
  const absTarget = normalizedTarget.startsWith("/")
    ? resolve(normalizedTarget)
    : resolve(cwd, normalizedTarget);
  return toPosixPath(relative(cwd, absTarget)).replace(/^\.\//, "");
}

function shouldRunWorkflowRulesAudit(changedFiles = []) {
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
      || normalized === "scripts/out/scripts/lint-rules.js";
  });
}

function restoreTicketIndexSnapshot(cwd, snapshot, opts: CliOpts = {}) {
  if (opts.dryRun) return;
  writeTicketIndexJson(cwd, snapshot, opts);
}

function rollbackTicketWorkflowArtifacts(cwd, previousIndex, previousBody, absPath, opts: CliOpts = {}) {
  if (opts.dryRun) return;
  if (previousBody !== undefined && absPath) {
    writeTicketMarkdownFile(absPath, previousBody);
  }
  if (previousIndex) {
    restoreTicketIndexSnapshot(cwd, previousIndex, opts);
  }
}

function getPhase1IncompleteReasonsFromBody(body) {
  let parsed = { meta: {}, content: "" };
  try {
    parsed = parseFrontMatter(body);
  } catch (err) {
    return ["frontmatter_parse_failed"];
  }
  if ((parsed as Record<string, any>).parseError) {
    return ["frontmatter_parse_failed"];
  }
  return getPhase1PlanBodyReasons(normalizePhase1PlanBodyHeadings(parsed.content || ""));
}

function getPhase1IncompleteReasons(cwd, absPath) {
  if (!existsSync(absPath)) return ["ticket_file_missing"];
  return getPhase1IncompleteReasonsFromBody(readFileSync(absPath, "utf8"));
}

function buildRawTicketEvidence(cwd, meta: Record<string, any> = {}, content = "", opts: CliOpts = {}, targetState = ""): TicketEvidenceInput {
  return {
    content,
    cwd,
    meta,
    targetState,
    reason: opts.reason,
    workflowMode: opts.workflowMode,
    approval: opts.approval
  };
}

function collectTicketTransitionValidationDocMeta(cwd, absPath, meta: Record<string, any> = {}, content = "", opts: CliOpts = {}, targetState = "") {
  const phase1Reasons = content
    ? getPhase1PlanBodyReasons(normalizePhase1PlanBodyHeadings(content || ""))
    : getPhase1IncompleteReasons(cwd, absPath);
  const closeReasons = getCloseWorkflowReasons(meta, content);
  const evidenceForValidation = buildRawTicketEvidence(cwd, meta, content, opts, targetState);
  const slotValues = Object.fromEntries(
    Object.keys(TICKET_EVIDENCE_VALIDATORS).map(key => [key, isTicketEvidenceKeySatisfied(key, evidenceForValidation)])
  );
  const executionEvidenceErrors = targetState === "phase3" && !slotValues.executionEvidence
    ? [
        ...(hasPhase2ExecutionEvidence(content) ? [] : ["phase2_execution_slots_empty"]),
        ...(meetsDocsReflectedGate(content, cwd) ? [] : ["docs_reflected_missing"])
      ]
    : closeReasons;
  const verificationEvidenceErrors = closeReasons;
  const slotSourceMap = {
    phase1Plan: { source: toRepoRelativePath(cwd, absPath), errors: phase1Reasons },
    executionEvidence: { source: "ticket workflow sections (phase2 execution slots or Analysis)", errors: executionEvidenceErrors },
    verificationEvidence: { source: "ticket workflow sections + code↔design comparison", errors: verificationEvidenceErrors },
    debuggingDecision: { source: "--reason | debugging decision" },
    completionEvidence: { source: "ticket workflow sections", errors: closeReasons },
    reopenDecision: { source: "--reason | reopen decision" }
  };
  const currentState = `phase${normalizeTicketPhaseNumber(meta.phase || 1)}`;
  const requiredSlots = targetState
    ? getTicketWorkflowTransitionEvidenceKeys(currentState, targetState)
    : Object.keys(slotValues);
  return buildTransitionValidationDocMeta({
    ticketId: meta.ticketId || meta.id || "",
    phase: normalizeTicketPhaseNumber(meta.phase || 1),
    status: String(meta.status || "open"),
    currentState,
    targetState,
    requiredSlots,
    slotValues,
    slotSourceMap
  });
}

function formatTicketWorkflowGateFailure(cwd, absPath, entry, meta: Record<string, any> = {}, content = "", opts: CliOpts = {}, targetState = "phase2", reasons = []) {
  const ticketId = entry?.id || meta.ticketId || meta.id || "<ticket-id>";
  const docmeta = collectTicketTransitionValidationDocMeta(cwd, absPath, meta, content, opts, targetState);
  return renderTicketWorkflowGateFailure({
    ticketId,
    workspace: basename(String(cwd || "")),
    docmeta,
    reasons,
    lang: resolveTicketDocsLanguage(cwd, meta.docsLanguage || opts.docsLanguage),
  });
}

function getTicketWorkflowTransitionEvidence(cwd, absPath, meta: Record<string, any> = {}, content = "", opts: CliOpts = {}, targetState = ""): TicketEvidenceInput {
  return buildRawTicketEvidence(cwd, meta, content, opts, targetState);
}

function resolveTicketWorkflowCommandTransition(cwd, entry, absPath, meta, content, opts: CliOpts = {}, transitionOpts: Record<string, any> = {}) {
  assertTicketWorkflowAction(meta, {
    fallbackStatus: entry.status || "open",
    action: transitionOpts.action
  });
  const preview = resolveTicketWorkflowTransition(meta, {
    fallbackStatus: entry.status || "open",
    ...transitionOpts
  });
  return assertTicketWorkflowTransition(meta, {
    fallbackStatus: entry.status || "open",
    ...transitionOpts,
    evidence: getTicketWorkflowTransitionEvidence(cwd, absPath, meta, content, opts, preview.to)
  });
}

function hasExplicitExecutionApproval(opts: CliOpts = {}) {
  if (!Object.prototype.hasOwnProperty.call(opts, "workflowMode")
    && !Object.prototype.hasOwnProperty.call(opts, "approval")) {
    return false;
  }
  return isWorkflowExecute(opts) === true;
}

function getTicketWorkflowProvenanceReasons(entry, meta: Record<string, any> = {}) {
  const reasons = [];
  if (!entry || String(entry.status || "").toLowerCase() === "archived") return reasons;
  if (!isExecutionTicketStatus(entry.status || meta.status || "open")) return reasons;

  // lifecycleSource is the provenance field written by pre-5.x ticket create.
  const workflowSource = String(meta.workflowSource || meta.ticketWorkflowSource || meta.lifecycleSource || "").trim();
  if (workflowSource !== "ticket-create") {
    reasons.push("manual_ticket_workflow_provenance_missing");
  }
  return reasons;
}

function assertTicketWorkflowProvenance(entry, meta: Record<string, any> = {}) {
  const reasons = getTicketWorkflowProvenanceReasons(entry, meta);
  if (reasons.length === 0) return;
  throw new Error([
    `[VALIDATION FAILED] Ticket ${entry?.id || "unknown"} cannot be used as an execution ticket: ${reasons.join(", ")}.`,
    "This ticket file does not carry CLI creation provenance.",
    "Do not create or repair tickets by writing .deuk/tickets/**/*.md directly.",
    "Use: npx deuk-agent-flow ticket create --title <title> --summary <summary> --plan-body \"<filled body>\" --non-interactive"
  ].join("\n"));
}

function updatePreviousTicketRef(cwd, prevTicketEntry, ticketId) {
  if (!prevTicketEntry) return;
  const prevAbsPath = makePath(cwd, prevTicketEntry.path);
  if (!existsSync(prevAbsPath)) return;
  
  let prevContent = readFileSync(prevAbsPath, "utf8");
  prevContent = prevContent.replace(/^---\n([\s\S]*?)\n---/, (match, fm) => {
    if (!fm.includes('nextTicket:')) {
      return `---\n${fm.trim()}\nnextTicket: ${ticketId}\n---`;
    }
    return match;
  });
  writeTicketMarkdownFile(prevAbsPath, prevContent);
  return prevTicketEntry.id;
}

function resolveMainTicketForSubTicket(indexJson, opts, prevTicketEntry) {
  if (opts.parent) return String(opts.parent);
  if (prevTicketEntry?.id || prevTicketEntry?.ticketId) return prevTicketEntry.id;
  const entries = [...(indexJson.entries || [])]
    .filter(entry => normalizeTicketGroup(entry.group, "sub") === "main")
    .filter(entry => entry.status === "open" || entry.status === "active")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return entries[0]?.id || null;
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
  const archiveDir = makePath(ticketDir, "archive", entry.group || "sub", partition.yearMonth);
  return {
    archiveDir,
    archiveYearMonth: partition.yearMonth,
    newAbsPath: makePath(archiveDir, fileName)
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

  const archiveRoot = makePath(ticketDir, "archive", entry.group || "sub");
  if (!existsSync(archiveRoot)) return null;

  const stack = [archiveRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const abs = makePath(dir, item.name);
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
  const phase = Number(entry?.phase || 1);
  if (phase >= 4 || entry?.archiveYearMonth) return false;
  return OPEN_TICKET_STATUSES.has(String(entry?.status || "open"));
}

function isAutoArchivableDoneEntry(entry) {
  const status = String(entry?.status || "").toLowerCase();
  const phase = Number(entry?.phase || 1);
  return AUTO_ARCHIVE_DONE_STATUSES.has(status) || phase >= 4 || Boolean(entry?.archiveYearMonth);
}

function latestTicketByStatus(entries, statuses) {
  const statusSet = new Set(statuses);
  return [...(entries || [])]
    .filter(e => statusSet.has(String(e.status || "").toLowerCase()))
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0] || null;
}

function formatTicketChoice(entry, activeTicketId = null) {
  const rawStatus = String(entry.status || "open").toLowerCase();
  const isFocus = activeTicketId && entry.id === activeTicketId && rawStatus !== "archived" && Number(entry.phase || 1) < 4;
  const status = isFocus ? "ACTIVE" : rawStatus.toUpperCase();
  const phase = `ph${Number(entry.phase || 1)}`;
  const previewSource = String(entry.summary || entry.title || entry.id || entry.id || "")
    .replace(/(\n|\\n)+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const maxPreviewLength = 140;
  const preview = previewSource.length > maxPreviewLength ? `${previewSource.slice(0, maxPreviewLength - 3)}...` : previewSource;
  return `${entry.id} | ${status} | ${phase} | ${preview}`;
}

function buildUseFallbackCandidates(indexJson, opts: CliOpts = {}) {
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

function findStrayTicketFile(cwd, ticketId, ticketsRoot) {
  if (!ticketId) return null;
  const candidateRoots = [];
  try {
    const wsRoot = findWorkspaceRoot(cwd);
    if (wsRoot) {
      const legacy = resolveTicketSystemPaths(wsRoot).primary;
      if (legacy && legacy !== ticketsRoot) candidateRoots.push(legacy);
      if (wsRoot !== ticketsRoot) candidateRoots.push(wsRoot);
    }
  } catch { /* best-effort hint only */ }
  for (const root of candidateRoots) {
    if (!existsSync(root)) continue;
    try {
      const groups = readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
      for (const group of groups) {
        const groupDir = join(root, group);
        if (!existsSync(groupDir)) continue;
        const files = readdirSync(groupDir).filter(f => f.startsWith(String(ticketId)) && f.endsWith(".md"));
        if (files.length) return join(groupDir, files[0]);
      }
    } catch { /* best-effort hint only */ }
  }
  return null;
}

function buildTicketNotFoundHint(cwd, ticketId, ticketsRoot) {
  const lines = [];
  if (ticketsRoot) lines.push(`Searched canonical ticket dir: ${ticketsRoot}`);
  const stray = findStrayTicketFile(cwd, ticketId, ticketsRoot);
  if (stray) {
    lines.push(`Found a similarly-named file OUTSIDE the canonical dir (not visible to use/discard/show): ${stray}`);
    lines.push("This is likely a stale local copy, not the canonical ticket. Re-create via 'ticket create' if the canonical entry is truly gone.");
  }
  return lines;
}

function buildUseNoMatchError(ticketId, candidates, cwd?, ticketsRoot?) {
  const lines = [
    `No matching ticket found for "${ticketId || ""}".`,
    ...buildTicketNotFoundHint(cwd, ticketId, ticketsRoot),
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
  lines.push("  npx deuk-agent-flow ticket use --id <ticket-id> --non-interactive");
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
    `flow:[OPEN TICKET LIMIT] Open tickets: ${openRows.length}/${MAX_OPEN_TICKETS}.`,
    "Ticket creation was cancelled so open tickets do not exceed the limit.",
    "Review the active ticket list, decide what can be archived, then create the ticket again.",
    "",
    "Commands:",
    "  npx deuk-agent-flow ticket list --active --non-interactive",
    "  npx deuk-agent-flow ticket archive --id <ticket-id> --non-interactive",
    "",
    "Oldest archive candidates:"
  ];

  for (const entry of candidates.slice(0, 10)) {
    const title = String(entry.title || entry.id || "").replace(/(\n|\\n)+/g, " ").slice(0, 80);
    lines.push(`  - ${entry.id} | ${entry.status || "open"} | ${entry.createdAt || "-"} | ${title}`);
  }

  return lines.join("\n");
}

function titleKeysForEntry(entry: Record<string, any> = {}) {
  const keys = [entry.id];
  try {
    if (entry.title) keys.push(toSlug(entry.title));
  } catch {
  }
  return keys
    .map(value => String(value || "").toLowerCase())
    .filter(Boolean);
}

function findReusableCompletedTicket(indexJson, titleSlug, opts: CliOpts = {}) {
  const key = String(titleSlug || "").toLowerCase();
  if (!key) return null;
  return filterTicketEntries(indexJson.entries, opts)
    .filter(entry => !OPEN_TICKET_STATUSES.has(String(entry.status || "open").toLowerCase()))
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .find(entry => titleKeysForEntry(entry).includes(key)) || null;
}

function buildReusableTicketCreateError(entry, titleSlug) {
  const id = entry?.id || titleSlug;
  const status = entry?.status || "closed";
  return [
    `[DUPLICATE TICKET BLOCKED] A ${status} ticket already matches "${titleSlug}".`,
    `Existing ticket: ${id}`,
    "Do not guess .deuk/tickets/sub paths for closed or archived tickets.",
    `Use: deuk-agent-flow ticket status --id ${id} --status-detail --non-interactive`,
    `Or:  deuk-agent-flow ticket use --id ${id} --non-interactive`,
    "Create a new ticket only when the scope is genuinely different; use a distinct title for that scope."
  ].join("\n");
}

function normalizeArchivedTicketMeta(found, meta: Record<string, any> = {}) {
  const next = { ...meta };
  if (!next.status) {
    next.status = found?.status || "closed";
  }
  if (!next.phase) {
    next.phase = found?.phase || 4;
  }
  if (!next.summary) {
    next.summary = found?.summary || found?.title || found?.id || "archived ticket";
  }
  if (!next.priority) {
    next.priority = "P3";
  }
  if (!next.tags || (Array.isArray(next.tags) && next.tags.length === 0) || next.tags === "") {
    next.tags = ["archived"];
  }
  if (!next.id && found?.id) next.id = found.id;
  if (!next.title && found?.title) next.title = found.title;
  return next;
}

export function archiveTicketEntry({ cwd, ticketDir, indexJson, found, opts = {} as Record<string, any> }) {
  const absPath = resolveTicketEntryOrComputedPath(cwd, found);
  const fileName = (found.path || computeTicketPath(found)).split(/[/\\]/).pop();
  const resolvedRelPath = found.path || computeTicketPath(found);
  if (!existsSync(absPath)) {
    const archivedAbsPath = findExistingArchivedTicketPath(ticketDir, found, fileName);
    if (archivedAbsPath) {
      const storage = archiveStorageFromPath(ticketDir, archivedAbsPath, found);
      const entryIdx = indexJson.entries.findIndex(e => e.id === found.id);
      if (entryIdx >= 0) {
        indexJson.entries[entryIdx].fileName = fileName;
        indexJson.entries[entryIdx].status = "archived";
        indexJson.entries[entryIdx].archiveYearMonth = (storage as Record<string, any>).archiveYearMonth;
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
    throw new Error(localizedTicket("archiveFileNotFound") + resolvedRelPath);
  }

  const originalBody = readFileSync(absPath, "utf8");
  const parsedArchive = parseFrontMatter(originalBody);
  const archiveDocMeta = splitTicketDocMetaSection(parsedArchive.content || "");
  const archiveMeta = parsedArchive.parseError
    ? null
    : normalizeArchivedTicketMeta(found, parsedArchive.meta || {});
  const moveToArchiveStorage = Boolean(opts.moveFiles);
  const archiveDestination = moveToArchiveStorage ? getArchiveDestination(ticketDir, found, fileName) : null;
  const targetAbsPath = archiveDestination?.newAbsPath || absPath;
  if (moveToArchiveStorage && existsSync(targetAbsPath)) {
    throw new Error(localizedTicket("archiveDestExists") + toRepoRelativePath(cwd, targetAbsPath));
  }
  if (moveToArchiveStorage && !opts.dryRun) mkdirSync(archiveDestination.archiveDir, { recursive: true });

  const archiveBody = archiveMeta ? archiveDocMeta.body : originalBody;

  if (opts.dryRun) {
    if (!isCompactTicketOutput(opts)) {
      const targetRelPath = moveToArchiveStorage ? toRepoRelativePath(cwd, targetAbsPath) : toRepoRelativePath(cwd, absPath);
      console.log(`ticket archive: would ${moveToArchiveStorage ? "move" : "mark archived in place"} ${toRepoRelativePath(cwd, absPath)}${moveToArchiveStorage ? ` to ${targetRelPath}` : ""}`);
    }
    return { dryRun: true };
  }

  const finalArchiveBody = String(archiveBody || "").trimEnd();

  if (archiveMeta) {
    archiveMeta.status = "archived";
    archiveMeta.phase = 4;
    writeTicketDocument(targetAbsPath, { meta: archiveMeta, content: finalArchiveBody, docmeta: archiveDocMeta.docmeta });
  } else {
    writeTicketMarkdownFile(targetAbsPath, originalBody);
  }
  if (moveToArchiveStorage) rmSync(absPath);
  try {
    if (!opts.skipWorkflowQualityGate) {
      runTicketWorkflowQualityGate(cwd, {
        ticketAbsPath: targetAbsPath,
        context: `ticket archive ${found.id}`
      });
    }
  } catch (err) {
    if (moveToArchiveStorage) rmSync(targetAbsPath, { force: true });
    writeTicketMarkdownFile(absPath, originalBody);
    throw err;
  }

  if (!isCompactTicketOutput(opts) && !opts.quietAutoArchive) {
    console.log(`ticket archive: ${moveToArchiveStorage ? "moved ticket to" : "marked ticket archived in place"} ${toWsRelativePath(opts.workspaceRoot, targetAbsPath)}`);
  }

  const entryIdx = indexJson.entries.findIndex(e => e.id === found.id);
  if (entryIdx >= 0) {
    indexJson.entries[entryIdx].fileName = fileName;
    indexJson.entries[entryIdx].status = "archived";
    if (archiveDestination) indexJson.entries[entryIdx].archiveYearMonth = archiveDestination.archiveYearMonth;
    else delete indexJson.entries[entryIdx].archiveYearMonth;
    delete indexJson.entries[entryIdx].archiveDay;
    indexJson.entries[entryIdx].updatedAt = new Date().toISOString();
  }

  const archivedRelativePath = toRepoRelativePath(cwd, targetAbsPath);
  if (!isCompactTicketOutput(opts) && !opts.quietAutoArchive) {
    console.log("ticket archive: final ticket path " + archivedRelativePath);
  }
  return { id: found.id, path: archivedRelativePath };
}

function autoArchiveDoneTickets(cwd, indexJson, opts: CliOpts = {}) {
  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) return [];

  const candidates = (indexJson.entries || [])
    .filter(isAutoArchivableDoneEntry)
    .sort(oldestFirst);
  const archived = [];

  for (const candidate of candidates) {
    let result = null;
    try {
      result = archiveTicketEntry({
        cwd,
        ticketDir,
        indexJson,
        found: candidate,
        opts: { ...opts, skipKnowledgeDistill: true, skipWorkflowQualityGate: true, quietAutoArchive: true }
      });
    } catch (err) {
      if (!isCompactTicketOutput(opts) && !opts.quietAutoArchive) {
        console.warn(`[AUTO-ARCHIVE] skipped ${candidate.id}: ${err.message || err}`);
      }
      continue;
    }
    if (result?.id) {
      archived.push(result);
    }
  }

  if (archived.length > 0) {
    writeTicketIndexJson(cwd, indexJson, opts);
  }

  return archived;
}

function isArchiveStorageFile(cwd, absPath) {
  const relPath = toPosixPath(toRepoRelativePath(cwd, absPath));
  return relPath.startsWith("archive/") || relPath.startsWith(`${DEUK_ROOT_DIR}/${TICKET_SUBDIR}/archive/`);
}

function isArchiveSweepCandidate(entry, excludeTicketId) {
  if (!entry?.id || entry.id === excludeTicketId) return false;
  const status = String(entry.status || "").toLowerCase();
  const phase = Number(entry.phase || 1);
  return status === "archived" || (phase >= 4 && AUTO_ARCHIVE_DONE_STATUSES.has(status));
}

function runBestEffortArchiveMoveSweep(cwd, indexJson, excludeTicketId, opts: CliOpts = {}) {
  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) return { moved: [], errors: [] };

  const moved = [];
  const errors = [];
  const candidates = (indexJson.entries || [])
    .filter(entry => isArchiveSweepCandidate(entry, excludeTicketId))
    .sort(oldestFirst);

  for (const candidate of candidates) {
    try {
      const candidateAbsPath = resolveTicketEntryOrComputedPath(cwd, candidate);
      if (!existsSync(candidateAbsPath) || isArchiveStorageFile(cwd, candidateAbsPath)) continue;
      const result = archiveTicketEntry({
        cwd,
        ticketDir,
        indexJson,
        found: candidate,
        opts: { ...opts, moveFiles: true, compact: true, skipKnowledgeDistill: true, quietAutoArchive: true }
      });
      if (result?.id) moved.push(result);
    } catch (err) {
      errors.push({ id: candidate.id, error: err.message || String(err) });
      if (!isCompactTicketOutput(opts)) {
        console.warn(`[ARCHIVE-SWEEP] skipped ${candidate.id}: ${err.message || err}`);
      }
    }
  }

  if (moved.length > 0) {
    writeTicketIndexJson(cwd, indexJson, opts);
  }

  return { moved, errors };
}

function canAutoArchiveOpenLimit(indexJson) {
  const openRows = (indexJson.entries || []).filter(isOpenTicketEntry);
  if (openRows.length <= MAX_OPEN_TICKETS) {
    return { needed: 0, candidates: [], ok: true };
  }

  const needed = openRows.length - MAX_OPEN_TICKETS;
  const currentActiveId = indexJson.activeTicketId;
  const candidates = openRows
    .filter(e => e.id !== currentActiveId)
    .sort(oldestFirst);
  return {
    needed,
    candidates,
    ok: candidates.length >= needed
  };
}

function autoArchiveOpenLimitTickets(cwd, indexJson, opts: CliOpts = {}) {
  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) return [];

  const { needed, candidates, ok } = canAutoArchiveOpenLimit(indexJson);
  if (needed <= 0 || !ok) return [];

  const archived = [];
  if (!isCompactTicketOutput(opts)) {
    console.warn("[AUTO-CLEANUP] Open-ticket limit reached. 자동으로 티켓 정리를 진행하겠습니다.");
  }
  for (const candidate of candidates) {
    if (archived.length >= needed) break;
    try {
      const result = archiveTicketEntry({
        cwd,
        ticketDir,
        indexJson,
        found: candidate,
        opts: { ...opts, skipKnowledgeDistill: true, quietAutoArchive: true }
      });
      if (!result?.id) continue;
      archived.push(result);
      if (!isCompactTicketOutput(opts)) {
        console.warn(`[AUTO-CLEANUP] ${candidate.id} archived to stay within the open-ticket limit.`);
      }
    } catch (err) {
      if (!isCompactTicketOutput(opts)) {
        console.warn(`[AUTO-CLEANUP] skipped ${candidate.id}: ${err.message || err}`);
      }
    }
  }

  if (archived.length > 0) {
    writeTicketIndexJson(cwd, indexJson, opts);
  }

  return archived;
}

function rollbackCreatedTicket(cwd, abs, rollbackIndexJson, opts: CliOpts = {}) {
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
  opts = hydrateCreateTextInputs(opts);
  applyTicketWorkspacePromptDispatch(opts, [opts.summary, opts.content].filter(Boolean).join("\n"));
  applyTicketRootContext(opts, { createIfMissing: true });
  if (opts.ticketId !== undefined && !opts.title && !opts.summary && !opts.ref) {
    throw new Error(
      `unexpected positional argument: "${opts.ticketId}". ` +
      `Pass the ticket title via --title (e.g. --title my-ticket-slug), not as a positional argument. ` +
      `Run \`deuk-agent-flow ticket create --help\` for the canonical form.`
    );
  }
  const deprecatedSectionFlags = [
    ["--scope", opts.scope],
    ["--design", opts.design],
    ["--environment", opts.environment],
    ["--plan", opts.planSection],
    ["--analysis", opts.analysis],
    ["--direction", opts.direction],
  ].filter(([, v]) => String(v ?? "").trim());
  if (deprecatedSectionFlags.length > 0) {
    const used = deprecatedSectionFlags.map(([f]) => f).join(", ");
    throw new Error(
      `ticket create: 개별 섹션 플래그(${used})는 폐기되었습니다. ` +
      `본문 섹션은 채운 템플릿을 --plan-body-file - 로 파이프하는 것이 유일한 정식 경로입니다.\n\n` +
      buildTicketCreateGuide(opts)
    );
  }
  if (!opts.title && !opts.summary && !opts.ref && !opts.planBody && !opts.planBodyFile) {
    console.log(buildTicketCreateGuide(opts));
    return;
  }

  const inferred = opts.ref ? inferRefTitleAndTopic(opts) : null;
  const group = toSlug(opts.group || "main");

  await ensurePhase0Validation(opts);

  let path, source;
  if (opts.ref) {
    path = resolveReferencedTicketPath(opts);
    source = "ticket-reference";
  } else {
    const ticketDir = detectConsumerTicketDir(opts.workspaceRoot, { createIfMissing: true });
    if (!ticketDir) {
      throw new Error(localizedTicket("createWorkspaceRequired"));
    }

    let parsedPlan = null;
    let finalTitle = opts.title || inferred?.title || "ticket";

    if (typeof opts.planBody === "string" && opts.planBody.trim()) {
      parsedPlan = parsePlan("inline-plan-body.md", opts.planBody);
      finalTitle = opts.title || parsedPlan.title || inferred?.title || "ticket";
    }
    let finalTitleSlug = requireNonEmptySlug(opts.title || inferred?.slug || finalTitle, "ticket title (body # H1 heading)");

    const indexJson = loadTicketIndex(opts);
    const reusableTicket = findReusableCompletedTicket(indexJson, finalTitleSlug, opts);
    if (reusableTicket) {
      throw new Error(buildReusableTicketCreateError(reusableTicket, finalTitleSlug));
    }

    const activeId = indexJson.activeTicketId;
    if (activeId) {
      const activeEntry = indexJson.entries.find(e => e.id === activeId && (e.status === "open" || e.status === "active"));
      if (activeEntry) {
        const activeDoc = readTicketDocument(opts.workspaceRoot, activeEntry, { action: "ticket create", requireExists: false });
        const absPath = activeDoc.absPath;
        let shouldClose = false;
        let reason = "";

        if (activeDoc.exists) {
          try {
            const { meta, content } = activeDoc;
            const closeDecision = getAutoCloseDecision(meta, content);
            shouldClose = closeDecision.shouldClose;
            reason = closeDecision.reason;
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
            activeEntry.phase = 4;
            activeEntry.updatedAt = new Date().toISOString();
            if (existsSync(absPath)) {
              try {
                const body = readFileSync(absPath, "utf8");
                const parsed = parseFrontMatter(body);
                if ((parsed as Record<string, any>).parseError) throw new Error(parsed.parseError);
                const ticketDocMeta = splitTicketDocMetaSection(parsed.content || "");
                parsed.meta.status = "closed";
                parsed.meta.phase = 4;
                writeTicketDocument(absPath, { meta: parsed.meta, content: ticketDocMeta.body, docmeta: ticketDocMeta.docmeta });
              } catch (err) { /* skip */ }
            }
            const ticketDir = detectConsumerTicketDir(opts.workspaceRoot);
            try {
              archiveTicketEntry({
                cwd: opts.workspaceRoot,
                ticketDir,
                indexJson,
                found: activeEntry,
                opts: { ...opts, skipWorkflowQualityGate: true, quietAutoArchive: true }
              });
            } catch (err) {
              if (!isCompactTicketOutput(opts)) {
                console.warn(`[AUTO-CLOSE] archive skipped for ${activeId}: ${err.message || err}`);
              }
            }
            writeTicketIndexJson(opts.workspaceRoot, indexJson, opts);
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

    const ticketId = generateTicketId(finalTitleSlug, indexJson);
    const finalFileName = `${ticketId}.md`;

    const abs = makePath(ticketDir, group, finalFileName);
    if (!opts.dryRun) mkdirSync(makePath(ticketDir, group), { recursive: true });
    path = toWsRelativePath(opts.workspaceRoot, abs);

    let prevTicketEntry = null;
    if (opts.chain) {
      prevTicketEntry = pickTicketEntry({ latest: true }, indexJson);
    }
    const mainTicket = group === "sub"
      ? resolveMainTicketForSubTicket(indexJson, opts, prevTicketEntry)
      : undefined;
    if (group === "sub" && !mainTicket) {
      throw new Error(localizedTicket("createSubNeedsParent"));
    }

    const summary = (opts.summary || parsedPlan?.summary || finalTitle || "ticket").trim();

    const ticketType = resolveTicketType({ type: opts.type });
    if (ticketType === null) {
      const valid = Object.keys(TICKET_TYPES).join(", ");
      throw new Error(
        ticketSurfaceText("typeRequired", resolveTicketDocsLanguage(opts.workspaceRoot, opts.docsLanguage)).replace("{valid}", valid)
      );
    }

    const promptText = [summary, finalTitle, parsedPlan?.body].filter(Boolean).join("\n");
    const docsLanguage = resolveTicketDocsLanguage(opts.workspaceRoot, opts.docsLanguage, promptText);

    const rawMeta = {
      id: ticketId,
      title: finalTitle,
      breadcrumb: opts.workspaceContext?.breadcrumb || resolveWorkspaceContext(opts.workspaceRoot).breadcrumb,
      phase: 1,
      status: "open",
      workflowSource: "ticket-create",
      submodule: opts.submodule,
      project: opts.project === "global" ? undefined : opts.project,
      docsLanguage,
      evidence: opts.evidence,
      mainTicket,
      summary,
      type: ticketType,
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
    let finalDocument = null;
    if (parsedPlan) {
      const planReasons = getPhase1PlanBodyReasons(parsedPlan.body, { title: finalTitle, enforceDesignEnv: true, cwd: opts.workspaceRoot });
      if (planReasons.length > 0) {
        console.log(buildPlanBodyRequiredError(planReasons, opts));
        return;
      }
      let ruleIds = readWorkspaceRuleIds(opts.workspaceRoot);
      if (ruleIds.length === 0) {
        const injected = ensureBaselineWorkspaceRule(opts.workspaceRoot);
        if (injected) {
          ruleIds = injected;
          console.warn(
            `[RULE BASELINE] No project rule id found — injected baseline [DR-01] into PROJECT_RULE.md. ` +
            `This ticket proceeds; future tickets must cite a rule id in the plan body.`
          );
        }
      } else {
        assertPlanReferencesRule(parsedPlan.body, ruleIds, opts); // #909: SSOT 게이트
      }
      const ticketBody = injectTicketContent(parsedPlan.body, opts.content, docsLanguage);
      const docmeta = collectTicketTransitionValidationDocMeta(opts.workspaceRoot, abs, meta, ticketBody, {}, "phase2");
      const frontmatterMeta = sanitizeFrontMatterMeta(clearDocMetaFrontmatterSummary(meta));
      finalDocument = {
        meta: frontmatterMeta,
        content: ticketBody,
        docmeta
      };
    } else {
      console.log(buildPlanBodyRequiredError(["plan_body_file_required"], opts));
      return;
    }

    let rollbackIndexJson = indexJson;

    if (!opts.dryRun) writeTicketDocument(abs, finalDocument);
    source = "ticket-create";

    try {
      if (!opts.dryRun) {
        runTicketWorkflowQualityGate(opts.workspaceRoot, {
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
              title: finalTitle,
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

      appendTicketEntry(opts.workspaceRoot, {
        id: ticketId,
        title: finalTitle, group, project: opts.project || "global",
        mainTicket,
        createdAt: new Date().toISOString(), path, source
      }, opts);

      const limitIndexJson = loadTicketIndex(opts);
      try {
        autoArchiveOpenLimitTickets(opts.workspaceRoot, limitIndexJson, opts);
      } catch (err) {
        if (!isCompactTicketOutput(opts)) {
          console.warn(`[AUTO-CLEANUP] Failed; ticket creation will continue. ${err.message || err}`);
        }
      }

      const limitError = buildOpenTicketLimitError(loadTicketIndex(opts));
      if (limitError) {
        rollbackIndexJson = buildCreateRollbackIndex(loadTicketIndex(opts), ticketId, indexJson);
        throw new Error(limitError);
      }
    } catch (err) {
      if (!opts.dryRun) {
        rollbackCreatedTicket(opts.workspaceRoot, abs, rollbackIndexJson, opts);
      }
      throw err;
    }

    if (!opts.dryRun) {
      const linkedPrev = updatePreviousTicketRef(opts.workspaceRoot, prevTicketEntry, ticketId);
      if (linkedPrev && !isCompactTicketOutput(opts)) {
        console.log(`Linked to previous ticket: ${linkedPrev}`);
      }
    }

    if (!isCompactTicketOutput(opts)) {
      console.log(`${opts.dryRun ? "Ticket would be created" : "Ticket created"}: ${toWsRelativePath(opts.workspaceRoot, abs)}`);
    }
    const executionSurfaceOpts = {
      ...opts,
      docsLanguage,
      phase: 1,
      status: "open",
      summary,
      ticketMeta: { phase: 1, status: "open", summary },
      runtimeContext: buildTicketRuntimeContext(ticketId, abs, {
        phase: 1,
        status: "open",
        summary
      }, {
        cwd: opts.workspaceRoot,
        summary,
        nextAction: "continue-execution"
      })
    };
    printExecutionSurface(ticketId, abs, executionSurfaceOpts);
    printUsageReminder(opts.workspaceRoot, opts);
    console.log(
      `${opts.dryRun ? "ticket-created-dryrun" : "ticket-created-ok"} ${ticketId} | phase=ph1 | status=open | ${toDriveAbsolutePath(abs)}`
    );
    if (!opts.dryRun) {
      appendTelemetryEvent(opts.workspaceRoot, {
        event: "ticket_created",
        action: "ticket-create",
        ticket: ticketId,
        file: path,
        phase: 1,
        status: "open"
      });
    }
    
    const configSync = loadInitConfig(opts.workspaceRoot);
    if (!opts.dryRun && configSync && configSync.remoteSync && configSync.pipelineUrl) {
      syncToPipeline(configSync.pipelineUrl, { action: "create", ticket: meta });
    }
  }

  syncActiveTicketId(opts.workspaceRoot, opts);
}

export async function runTicketList(opts) {
  applyTicketRootContext(opts);
  const ticketDir = detectConsumerTicketDir(opts.workspaceRoot);
  if (!ticketDir) {
    throw new Error(localizedTicket("noTicketSystem"));
  }
  const index = readTicketIndexJson(opts.workspaceRoot);
  syncActiveTicketId(opts.workspaceRoot);
  let rows = index.entries;

  if (opts.active) {
    rows = rows.filter(e => isLiveTicketEntry(e));
  } else if (opts.archived) {
    rows = rows.filter(e => e.status === "archived");
  } else if (!opts.all) {
    rows = rows.filter(e => e.status === "open" || e.status === "active");
  }
  
  if (opts.group) rows = rows.filter(e => e.group === opts.group);
  if (opts.project) rows = rows.filter(e => e.project === opts.project);
  if (opts.submodule) rows = rows.filter(e => e.submodule === opts.submodule);
  
  if (opts.json) {
    const payloadRows = rows.map(e => {
      let content = "";
      let absPath = "";
      try {
        const doc = readTicketDocument(opts.workspaceRoot, e, { action: "ticket list", requireExists: false });
        absPath = toDriveAbsolutePath(doc.absPath);
        if (opts.printContent) content = doc.exists ? doc.content : "";
      } catch { /* missing/corrupt ticket → empty body, best-effort absPath */
        try { absPath = toDriveAbsolutePath(resolveTicketEntryOrComputedPath(opts.workspaceRoot, e)); } catch { /* give up */ }
      }
      return opts.printContent ? { ...e, absPath, content } : { ...e, absPath };
    });
    if (opts.withTotal) {
      console.log(JSON.stringify({ tickets: payloadRows, total: index.entries.length }, null, 2));
      return;
    }
    console.log(JSON.stringify(payloadRows, null, 2));
    return;
  }

  console.log("#  ID | STATUS | PHASE | PREVIEW");
  rows.slice(0, opts.limit).forEach((e, idx) => {
    console.log(`${String(idx + 1).padEnd(2)} ${formatTicketChoice(e, index.activeTicketId)}`);
  });
  
  if (opts.render) {
    console.log("ticket list --render is deprecated; TICKET_LIST.md is no longer generated.");
  }
}

export async function runTicketStatus(opts) {
  applyTicketRootContext(opts);
  const index = loadTicketIndex(opts);
  const ambiguousCandidates = findLiveTicketCandidates(opts, index);
  if (ambiguousCandidates) {
    console.log(`${ambiguousCandidates.length} tickets are live in this workspace — pass --id to pick one instead of guessing:`);
    for (const e of ambiguousCandidates) {
      console.log(formatTicketChoice(e, index.activeTicketId));
    }
    return;
  }
  const found = pickTicketEntry(opts, index);
  if (!found) {
    const ticketSelector = opts.ticketId || (!opts.summary && !opts.planBody && !opts.planBodyFile ? opts.title : "");
    if (ticketSelector) {
      throw new Error(localizedTicket("statusNoMatch", { selector: String(ticketSelector) }));
    }
    console.log("No active ticket (no open ticket before phase 4). Live tickets:");
    await runTicketList({ ...opts, active: false, archived: false, all: false });
    return;
  }

  const ticketDoc = readTicketDocument(opts.workspaceRoot, found, { action: "ticket status", requireExists: false });
  const absPath = ticketDoc.absPath;
  const parsed = { meta: ticketDoc.meta, content: ticketDoc.content };
  if (ticketDoc.exists) assertTicketWorkflowProvenance(found, parsed.meta);
  assertTicketWorkflowAction(parsed.meta, {
    fallbackStatus: found.status || "open",
    action: "status"
  });
  const phase = Number(parsed.meta.phase || 1);
  const workflowStatus = deriveTicketWorkflowStatus(parsed.meta, found.status || "open");
  const requiresExecutionPlan = isExecutionTicketStatus(workflowStatus);
  const incompleteReasons = requiresExecutionPlan ? getPhase1IncompleteReasons(opts.workspaceRoot, absPath) : [];
  const derivedStatus = incompleteReasons.length > 0 && phase === 1
    ? "phase1_incomplete"
    : workflowStatus;

  const out: Record<string, any> = {
    id: found.id,
    title: found.title,
    path: toPosixPath(resolve(ticketDoc.absPath)),
    phase,
    status: derivedStatus,
    summary: parsed.meta.summary || null,
    reasons: incompleteReasons,
  };

  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (isCompactTicketOutput(opts) && !opts.statusDetail) {
    const reasonText = out.reasons.length === 0 ? "ok" : out.reasons.join(", ");
    printTicketStatusFlowLine(out.id, absPath, out.phase, { ...opts, docsLanguage: parsed.meta.docsLanguage });
    console.log(`${out.id} | phase=${out.phase} | status=${out.status} | ${reasonText}`);
    printPhaseAdvanceHint(out.id, out.phase, out.status, opts, parsed.meta);
    printUsageReminder(opts.workspaceRoot, opts);
    return;
  }

  const cardLang = resolveTicketDocsLanguage(opts.workspaceRoot, parsed.meta.docsLanguage || opts.docsLanguage);
  console.log(`${ticketSurfaceText("ticket", cardLang)}: ${out.id}`);
  console.log(`${ticketSurfaceText("status", cardLang)}: ${out.status}`);
  console.log(`${ticketSurfaceText("phase", cardLang)}: ${out.phase}`);
  console.log(`${ticketSurfaceText("path", cardLang)}: ${toWsRelativePath(opts.workspaceRoot, ticketDoc.absPath)}`);
  console.log(`${ticketSurfaceText("abspath", cardLang)}: ${toDriveAbsolutePath(ticketDoc.absPath)}`);
  const runtimeContext = buildTicketRuntimeContext(out.id, absPath, parsed.meta, {
    cwd: opts.workspaceRoot,
    hostWorkspaceLabel: opts.hostWorkspaceContext?.breadcrumb,
    status: out.status,
    phase: out.phase,
    summary: out.summary,
    reasons: out.reasons,
    nextAction: out.phase >= 4 || out.status === "closed" || out.status === "archived" ? "terminal-review-or-archive" : "follow-state-prompt"
  });
  printTicketStatusFlowLine(out.id, absPath, out.phase, { ...opts, docsLanguage: parsed.meta.docsLanguage, runtimeContext });
  if (opts.statusDetail || out.reasons.length > 0) {
    const reasonLang = resolveTicketDocsLanguage(opts.workspaceRoot, parsed.meta.docsLanguage || opts.docsLanguage);
    const reasonLabel = ticketSurfaceText("reasons", reasonLang);
    if (out.reasons.length === 0) console.log(`${reasonLabel}: ${ticketSurfaceText("none", reasonLang)}`);
    else console.log(`${reasonLabel}: ${out.reasons.join(", ")}`);
  }
  printPhaseAdvanceHint(out.id, out.phase, out.status, opts, parsed.meta);
  printUsageReminder(opts.workspaceRoot, opts);
}

export async function runTicketShow(opts) {
  applyTicketRootContext(opts);
  const index = loadTicketIndex(opts);
  const found = pickTicketEntry(opts, index);
  if (!found) {
    const selector = opts.ticketId || opts.title || "";
    if (selector) {
      const ticketsRoot = detectConsumerTicketDir(opts.workspaceRoot);
      const hint = buildTicketNotFoundHint(opts.workspaceRoot, selector, ticketsRoot);
      throw new Error([localizedTicket("showNoMatch", { selector: String(selector) }), ...hint].join("\n"));
    }
    throw new Error(localizedTicket("showIdRequired"));
  }

  const ticketDoc = readTicketDocument(opts.workspaceRoot, found, { action: "ticket show", requireExists: true });
  const absPath = ticketDoc.absPath;
  const phase = Number(ticketDoc.meta.phase || 1);
  const status = deriveTicketWorkflowStatus(ticketDoc.meta, found.status || "open");

  if (opts.json) {
    console.log(JSON.stringify({
      id: found.id,
      title: found.title || ticketDoc.meta.title || null,
      path: toPosixPath(resolve(absPath)),
      phase,
      status,
      summary: ticketDoc.meta.summary || null,
      content: ticketDoc.content,
      docmeta: ticketDoc.docmeta
    }, null, 2));
    return;
  }

  printTicketStatusFlowLine(found.id, absPath, phase, { ...opts, docsLanguage: ticketDoc.meta.docsLanguage });
  console.log(`${found.id} | phase=${phase} | status=${status}`);
  const useLang = resolveTicketDocsLanguage(opts.workspaceRoot, ticketDoc.meta.docsLanguage || opts.docsLanguage);
  if (ticketDoc.meta.summary) console.log(`${ticketSurfaceText("summary", useLang)}: ${ticketDoc.meta.summary}`);
  console.log(`${ticketSurfaceText("path", useLang)}: ${toWsRelativePath(opts.workspaceRoot, absPath)}`);
  console.log(`${ticketSurfaceText("abspath", useLang)}: ${toDriveAbsolutePath(absPath)}`);
  console.log("");
  console.log(ticketDoc.content.trim());
  if (ticketDoc.docmetaRaw) {
    console.log("");
    console.log("## DocMeta");
    console.log("");
    console.log("```yaml");
    console.log(ticketDoc.docmetaRaw);
    console.log("```");
  }
  printUsageReminder(opts.workspaceRoot, opts);
}

export async function runTicketEdit(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (!opts.ticketId && !opts.latest) {
    throw new Error(localizedTicket("editIdRequired"));
  }

  const index = loadTicketIndex(opts);
  const found = pickTicketEntry(opts, index);
  if (!found) {
    const selector = opts.ticketId || "";
    const ticketsRoot = detectConsumerTicketDir(opts.workspaceRoot);
    const hint = buildTicketNotFoundHint(opts.workspaceRoot, selector, ticketsRoot);
    throw new Error([localizedTicket("editNoMatch", { selector: String(selector) }), ...hint].join("\n"));
  }

  const ticketDoc = readTicketDocument(opts.workspaceRoot, found, { action: "ticket edit", requireExists: true });
  const absPath = ticketDoc.absPath;
  const phase = Number(ticketDoc.meta.phase || 1);
  const status = String(found.status || ticketDoc.meta.status || "open");

  if (status !== "open") {
    throw new Error(localizedTicket("editNotOpen", { id: String(found.id), status: String(status) }));
  }

  const opts2 = hydrateCreateTextInputs(opts);
  let planBody = String(opts2.planBody || "");
  const editSections = [
    { flag: opts.scope, heading: "Scope" },
    { flag: opts.design, heading: "Design" },
    { flag: opts.environment, heading: "Environment" },
    { flag: opts.planSection, heading: "Plan" },
    { flag: opts.analysis, heading: "Analysis" },
    { flag: opts.direction, heading: "Direction" },
  ].filter(s => String(s.flag || "").trim());
  if (!planBody.trim() && editSections.length > 0) {
    const baseBody = stripLeadingFrontMatter(readFileSync(absPath, "utf8"));
    planBody = mergeH2SectionsIntoBody(baseBody, editSections.map(s => ({ heading: s.heading, body: String(s.flag).trim() })));
  }
  if (!planBody.trim()) {
    throw new Error(
      "ticket edit: 수정할 섹션을 --scope/--design/--environment/--plan/--analysis/--direction 로 주거나(준 섹션만 병합), " +
      "전체 본문을 --plan-body-file - (heredoc)로 파이프하세요."
    );
  }
  const parsedPlan = parsePlan("inline-edit-body.md", planBody);

  const planReasons = getPhase1PlanBodyReasons(parsedPlan.body, { title: found.title || ticketDoc.meta.title });
  if (planReasons.length > 0) {
    throw new Error(buildPlanBodyRequiredError(planReasons, opts));
  }
  assertPlanReferencesRule(parsedPlan.body, readWorkspaceRuleIds(opts.workspaceRoot), opts); // #909: SSOT 게이트

  if (opts.summary) ticketDoc.meta.summary = String(opts.summary).trim();
  ticketDoc.meta.updatedAt = new Date().toISOString().replace('T', ' ').split('.')[0];

  if (opts.dryRun) {
    console.log(`[DRY-RUN] Would rewrite ${found.id}'s Scope/Design/Environment/Plan/Analysis/Direction sections.`);
    return;
  }

  writeTicketDocument(absPath, {
    meta: sanitizeFrontMatterMeta(ticketDoc.meta),
    content: parsedPlan.body,
    docmeta: ticketDoc.docmeta
  });

  console.log(`ticket edit: updated -> ${found.id} (phase=${phase}, status=${status})`);
  console.log(`${ticketSurfaceText("path", resolveTicketDocsLanguage(opts.workspaceRoot, ticketDoc.meta.docsLanguage || opts.docsLanguage))}: ${toWsRelativePath(opts.workspaceRoot, absPath)}`);
  printUsageReminder(opts.workspaceRoot, opts);
}

export async function runTicketGuard(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (hasExplicitExecutionApproval(opts)) {
    opts.quietAutoArchive = true;
  }
  if (!opts.ticketId && !opts.latest) {
    throw new Error(localizedTicket("guardIdRequired"));
  }

  const index = loadTicketIndex(opts);
  const found = pickTicketEntry(opts, index);
  if (!found) {
    throw new Error(localizedTicket("guardNoDurable"));
  }

  const ticketDoc = readTicketDocument(opts.workspaceRoot, found, { action: "ticket guard", requireExists: false });
  if (!ticketDoc.exists) {
    throw new Error(localizedTicket("guardFileMissing", { id: String(found.id) }));
  }
  const { meta: parsedMeta, content } = ticketDoc;
  const absPath = ticketDoc.absPath;
  assertTicketWorkflowProvenance(found, parsedMeta);
  const workflowStatus = deriveTicketWorkflowStatus(parsedMeta, found.status || "open");
  const phase = Number(parsedMeta.phase || 1);
  if (phase >= 4 || isTerminalTicketStatus(workflowStatus)) {
    throw new Error(localizedTicket("guardTerminal", { id: String(found.id), status: String(workflowStatus), phase: String(phase) }));
  }
  assertTicketWorkflowAction(parsedMeta, {
    fallbackStatus: found.status || "open",
    action: "guard"
  });

  if (phase === 1) {
    try {
      resolveTicketWorkflowCommandTransition(opts.workspaceRoot, found, absPath, parsedMeta, content, opts, {
        action: "guard",
        toState: "phase2"
      });
    } catch (err) {
      const reasonText = String(err.message || "");
      if (reasonText.includes("user_approval_missing")
        || reasonText.includes("phase1_plan_incomplete")) {
        const reasons = reasonText.split(":").pop().split(",").map(value => value.trim()).filter(Boolean);
        throw new Error(formatTicketWorkflowGateFailure(opts.workspaceRoot, absPath, found, parsedMeta, content, opts, "phase2", reasons));
      }
      throw err;
    }
  }

  runBestEffortArchiveMoveSweep(opts.workspaceRoot, index, found.id, opts);

  let finalPhase = phase;
  let finalStatus = deriveTicketWorkflowStatus(parsedMeta, found.status || "open");
  const out: Record<string, any> = {
    id: found.id,
    ticketId: found.id,
    phase: finalPhase,
    status: finalStatus,
    path: toWsRelativePath(opts.workspaceRoot, absPath)
  };

  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`ticket-guard-ok ${out.id} | phase=${out.phase} | status=${out.status} | ${out.path}`);
  }
  return out;
}

export async function runTicketHandoff(opts) {
  applyTicketRootContext(opts);
  if (!opts.ticketId && !opts.latest) opts.latest = true;
  const index = loadTicketIndex(opts);
  const current = pickTicketEntry(opts, index);
  if (!current) throw new Error(localizedTicket("handoffNoMatch"));

  const currentDoc = readTicketDocument(opts.workspaceRoot, current, { action: "ticket handoff", requireExists: false });
  const currentAbs = currentDoc.absPath;
  const currentMissing = !currentDoc.exists;
  const currentParsed = currentMissing ? { meta: {}, content: "" } : { meta: currentDoc.meta, content: currentDoc.content };
  const currentPhase = Number(currentParsed.meta.phase || 1);
  const currentReasons = currentMissing ? ["ticket_file_missing"] : getPhase1IncompleteReasons(opts.workspaceRoot, currentAbs);
  const currentStatus = currentReasons.length > 0 && currentPhase === 1
    ? "phase1_incomplete"
    : (currentParsed.meta.status || current.status || "open");

  const rows = filterTicketEntries(index.entries, opts)
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  let nextTicket = rows.find(e => e.id === index.activeTicketId && e.id !== current.id);
  if (!nextTicket) nextTicket = rows.find(e => (e.status === "active" || e.status === "open") && e.id !== current.id);

  const out: Record<string, any> = {
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
      const summary = buildTelemetrySummary(opts.workspaceRoot);
      if (!summary) return null;
      return {
        logEntries: summary.logEntries,
        coverageRate: summary.eventCoverageRate,
        tdwCoverageRate: summary.tdwCoverageRate,
        totalTokens: summary.totalTokens
      };
    })(),
    telemetrySummary: getTelemetryCompactSummary(opts.workspaceRoot)
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
  const index = loadTicketIndex(opts);
  const found = pickTicketEntry(opts, index);
  if (!found) throw new Error(localizedTicket("metaNoMatch"));

  if (opts.json) {
    console.log(JSON.stringify(found, null, 2));
  } else {
    console.log(`${ticketSurfaceText("ticketMeta", resolveTicketDocsLanguage(opts.workspaceRoot, opts.docsLanguage))} [${found.id}]`);
    Object.entries(found).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  }
}

export async function runTicketConnect(opts) {
  applyTicketRootContext(opts);
  const config = loadInitConfig(opts.workspaceRoot);
  const url = opts.remote || config?.pipelineUrl;
  if (!url) throw new Error(localizedTicket("connectNoUrl"));

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
    throw new Error(localizedTicket("evidenceClaimRequired"));
  }

  const index = loadTicketIndex(opts);
  const target = pickTicketEntry(opts, index);
  if (!target) {
    throw new Error(localizedTicket("evidenceNoMatch"));
  }

  const { meta, content } = readTicketDocument(opts.workspaceRoot, target, { action: "ticket evidence", requireExists: true });
  const result = getClaimEvidenceResult(target, meta, content, opts.claim);
  const implementationGuard = Array.isArray(opts.changedFiles)
    ? getImplementationClaimGuardResult(opts.workspaceRoot, { claim: opts.claim, content, changedFiles: opts.changedFiles })
    : { ok: true, reasons: [] };

  if (!result.ok || !implementationGuard.ok) {
    const reasons = [...result.reasons, ...(implementationGuard.reasons || [])];
    throw new Error(`[VALIDATION FAILED] Ticket ${target.id} has insufficient evidence coverage for claim "${opts.claim}": ${reasons.join(", ")}.`);
  }

  if (opts.json) {
    console.log(JSON.stringify(result.docmeta, null, 2));
  } else {
    console.log(`[evidence-ok] ${target.id} ${result.docmeta.validation.status} (claim terms: ${result.claimTerms})`);
  }
}

export async function runTicketEvidenceReport(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (!opts.claim || !String(opts.claim).trim()) {
    throw new Error(localizedTicket("reportClaimRequired"));
  }

  const index = loadTicketIndex(opts);
  const target = pickTicketEntry(opts, index);
  if (!target) {
    throw new Error(localizedTicket("reportNoMatch"));
  }

  const { meta, content } = readTicketDocument(opts.workspaceRoot, target, { action: "ticket report", requireExists: true });
  const result = getClaimEvidenceResult(target, meta, content, opts.claim);
  const implementationGuard = Array.isArray(opts.changedFiles)
    ? getImplementationClaimGuardResult(opts.workspaceRoot, { claim: opts.claim, content, changedFiles: opts.changedFiles })
    : { ok: true, reasons: [] };

  if (!result.ok || !implementationGuard.ok) {
    const reasons = [...result.reasons, ...(implementationGuard.reasons || [])];
    throw new Error(`[VALIDATION FAILED] Ticket ${target.id} cannot produce claim-bound report for "${opts.claim}": ${reasons.join(", ")}.`);
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Claim-bound ticket report: ${target.id}`);
  console.log(`Claim: ${opts.claim}`);
  console.log(`Claim terms: ${result.claimTerms}`);
  for (const [label, value] of Object.entries(result.sections)) {
    if (!value) continue;
    console.log(`\n## ${label}`);
    console.log(value);
  }
}

export async function runTicketClose(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (!opts.ticketId && !opts.latest) {
    opts.latest = true;
  }
  if (!opts.status) opts.status = "closed";
  const previousIndex = readTicketIndexJson(opts.workspaceRoot);
  const targetEntry = pickTicketEntry(opts, previousIndex);
  if (!targetEntry) {
    throw new Error(localizedTicket("noMatchingUpdate"));
  }

  const { absPath: abs, meta: closeMeta, body: previousBody, content: closeContent } = readTicketDocument(opts.workspaceRoot, targetEntry, { action: "ticket close", requireExists: true });
  const parsedForClose = { meta: closeMeta, content: closeContent };
  try {
    resolveTicketWorkflowCommandTransition(opts.workspaceRoot, targetEntry, abs, closeMeta, closeContent, opts, {
      action: "close",
      toState: "end"
    });
  } catch (err) {
    if (String(err.message).includes("TICKET WORKFLOW BLOCKED")) {
      throw new Error(
        `${err.message}\n` +
        `Hint: "close" is not allowed in the current state. ` +
        `Use "ticket move --to end" to transition, or "ticket discard --id ${targetEntry.id} --workspace ${opts.workspace || ""} --source agent --non-interactive" to abandon.`
      );
    }
    throw err;
  }
  const closePlanningReasons = getCloseWorkflowReasons(parsedForClose.meta, parsedForClose.content);
  if (closePlanningReasons.length) {
    throw new Error(`[VALIDATION FAILED] Ticket ${targetEntry.id} cannot close without complete main-ticket analysis/design evidence: ${[...new Set(closePlanningReasons)].join(", ")}.`);
  }

  try {
    const entry = updateTicketEntryStatus(opts.workspaceRoot, opts);
    runTicketWorkflowQualityGate(opts.workspaceRoot, {
      ticketAbsPath: abs,
      context: `ticket close ${entry.id}`
    });

    if (String(opts.status || "").toLowerCase() === "closed") {
      syncActiveTicketId(opts.workspaceRoot);
    }

    const finalPath = computeTicketPath(entry);
    const finalAbsPath = makePath(opts.workspaceRoot, finalPath);
    appendTelemetryEvent(opts.workspaceRoot, {
      event: "ticket_closed",
      action: "ticket-close",
      ticket: entry.id,
      file: finalPath,
      phase: 4,
      status: opts.status
    });
    const normalizedStatus = String(opts.status || "closed").toLowerCase();
    if (normalizedStatus === "closed") {
      printTicketEndLine(entry.id, finalAbsPath, {
        ...opts,
        docsLanguage: closeMeta.docsLanguage,
        runtimeContext: buildTicketRuntimeContext(entry.id, finalAbsPath, { ...closeMeta, phase: 4, status: normalizedStatus }, {
          cwd: opts.workspaceRoot,
          hostWorkspaceLabel: opts.hostWorkspaceContext?.breadcrumb,
          summary: closeMeta.summary,
          nextAction: "final-response-only"
        })
      });
    } else {
      console.log(formatTicketStatusLine(normalizedStatus, entry.id, finalAbsPath, opts.workspaceRoot));
    }
    return { status: opts.status, ticket: entry.id, path: finalPath };
  } catch (err) {
    rollbackTicketWorkflowArtifacts(opts.workspaceRoot, previousIndex, previousBody, abs, opts);
    throw err;
  }
}

export async function runTicketUse(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  const index = loadTicketIndex(opts);
  const scopedEntries = filterTicketEntries(index.entries, opts);
  
  let targetTicketId = opts.ticketId;
  if (!targetTicketId && !opts.latest) {
    await runTicketList({ ...opts, active: false, archived: false, all: false });
    return;
  }

  const found = opts.latest ? scopedEntries[0] : scopedEntries.find(e =>
    String(e.id || "").includes(targetTicketId)
  );
  if (!found) {
    const candidates = buildUseFallbackCandidates(index, opts);
    const ticketsRoot = detectConsumerTicketDir(opts.workspaceRoot);
    throw new Error(buildUseNoMatchError(targetTicketId, candidates, opts.workspaceRoot, ticketsRoot));
  }

  const foundDoc = readTicketDocument(opts.workspaceRoot, found, { action: "ticket use", requireExists: true });
  assertTicketWorkflowProvenance(found, foundDoc.meta);
  assertTicketWorkflowAction(foundDoc.meta, {
    fallbackStatus: found.status || "open",
    action: "use"
  });
  
  if (index.activeTicketId !== found.id && isLiveTicketEntry(found)) {
    writeTicketIndexJson(opts.workspaceRoot, { ...index, activeTicketId: found.id });
  }

  const absPath = toPosixPath(foundDoc.absPath);
  if (opts.pathOnly) {
    printTicketSelectionLine(found.id, absPath, { ...opts, docsLanguage: foundDoc.meta.docsLanguage });
    return;
  }
  printTicketSelectionLine(found.id, absPath, { ...opts, docsLanguage: foundDoc.meta.docsLanguage, phase: foundDoc.meta.phase });
  printTicketUseNextSteps(found, foundDoc, opts);
  if (!opts.compact) {
    if (opts.printContent) {
      console.log("\n" + readFileSync(foundDoc.absPath, "utf8"));
    } else {
      const body = (foundDoc.content || "").trim();
      if (body) console.log("\n" + body);
    }
  }
}



function assertLastResortConfirmed(opts, action /* "discard" | "rollback" */) {
  const confirmed = action === "discard" ? opts.confirmDiscard : opts.confirmRollback;
  if (confirmed) return; // 명시 confirm만 통과 — 그 외 전부 거부
  const flag = action === "discard" ? "--confirm-discard" : "--confirm-rollback";
  const what = action === "discard" ? "Discard abandons a ticket" : "Rollback reverses phase";
  throw new Error(
    `[LAST-RESORT GATE] ${action} refused: no ${flag}. ` +
    `${what} and is a last-resort action (#836/#837/#841) — it is refused BY DEFAULT and must ` +
    `never be run automatically or in reaction to a single piece of feedback.\n` +
    `Before you even consider ${flag}, ask: is the ticket's PREMISE actually wrong ` +
    `(a false assumption / stale reference / a concept that no longer maps to the code)?\n` +
    `  • Goal changed, scope grew, plan needs another step, or the user said "that's not it" ` +
    `→ this is NOT a discard reason. Use \`ticket edit --scope/--plan/--analysis/--direction\` ` +
    `to amend the SAME ticket in place. Do not discard→recreate.\n` +
    `  • The premise is genuinely wrong → re-run with ${flag} to proceed.`
  );
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
      sessionMode: entry.sessionMode || "",
      originSource: entry.originSource || "",
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
  const ticketSelector = opts.ticketId || (!opts.summary && !opts.planBody && !opts.planBodyFile ? opts.title : "");
  if (ticketSelector) {
    const key = String(ticketSelector).toLowerCase();
    const localMatch = selectTicketEntryBySelector(rows, key);
    if (localMatch) return localMatch;

    if (opts.ticketId) {
      const durableLocalMatch = findTicketEntryInWorkspaceBySelector(opts.workspaceRoot, key, opts);
      if (durableLocalMatch) return durableLocalMatch;

      if (!opts.workspace) {
        const siblingMatch = findSiblingTicketEntryBySelector(opts, key);
        if (siblingMatch) return siblingMatch;
      }
    }
    return null;
  }
  const live = rows.filter(e => isLiveTicketEntry(e));
  return live.find(e => e.id === indexJson.activeTicketId) || null;
}

export function findLiveTicketCandidates(opts, indexJson) {
  const ticketSelector = opts.ticketId || (!opts.summary && !opts.planBody && !opts.planBodyFile ? opts.title : "");
  if (ticketSelector) return null; // explicit selector: no ambiguity to report
  const rows = filterTicketEntries(indexJson.entries, opts);
  const live = rows.filter(e => isLiveTicketEntry(e));
  return live.length >= 2 ? live : null;
}

function isLiveTicketEntry(entry) {
  if (!entry?.id) return false;
  const status = String(entry.status || "open").toLowerCase();
  if (status === "archived" || status === "closed") return false;
  return Number(entry.phase || 1) < 4;
}

function selectTicketEntryBySelector(entries, selector) {
  const key = String(selector || "").toLowerCase();
  if (!key) return null;

  const exactMatch = entries.find(entry => String(entry.id || "").toLowerCase() === key);
  if (exactMatch) return exactMatch;

  return entries.find(entry =>
    String(entry.id || "").toLowerCase().includes(key)
  ) || null;
}

function inferTicketGroupFromRelativePath(relativePath, fallback = "sub") {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  if (normalized.includes("/main/")) return "main";
  if (normalized.includes("/sub/")) return "sub";
  return fallback;
}

function inferArchiveYearMonthFromRelativePath(relativePath) {
  const match = String(relativePath || "").replace(/\\/g, "/").match(/\/archive\/(?:main|sub)\/(\d{4}-\d{2})(?:\/|$)/);
  return match ? match[1] : "";
}

function findTicketEntryInWorkspaceBySelector(cwd, selector, opts: CliOpts = {}) {
  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir || !existsSync(ticketDir)) return null;

  const matches = [];
  const stack = [ticketDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const absPath = makePath(dir, item.name);
      if (item.isDirectory()) {
        stack.push(absPath);
        continue;
      }
      if (!item.isFile() || !item.name.endsWith(".md")) continue;

      const body = readFileSync(absPath, "utf8");
      const { meta } = parseFrontMatter(body);
      const id = String(meta.id || item.name.replace(/\.md$/i, "")).trim();
      if (!id) continue;
      const entry = {
        id,
        title: meta.title || id,
        group: normalizeTicketGroup(meta.group || inferTicketGroupFromRelativePath(toWsRelativePath(cwd, absPath)), "sub"),
        fileName: item.name,
        project: meta.project || "global",
        submodule: meta.submodule || "",
        createdAt: meta.createdAt || "",
        updatedAt: meta.updatedAt || "",
        status: meta.status || "open",
        phase: Number(meta.phase || 1),
        archiveYearMonth: meta.archiveYearMonth || inferArchiveYearMonthFromRelativePath(toWsRelativePath(cwd, absPath)),
        path: toWsRelativePath(cwd, absPath)
      };
      const filtered = filterTicketEntries([entry], opts);
      if (selectTicketEntryBySelector(filtered, selector)) {
        matches.push(entry);
      }
    }
  }

  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(localizedTicket("guardAmbiguousWs", { workspace: String(cwd), matches: matches.map(match => match.id).join(", ") }));
  }
  return matches[0];
}

function findSiblingTicketEntryBySelector(opts, selector) {
  const candidates = loadWorkspaceCandidates(opts.invocationCwd || opts.workspaceRoot);
  if (!candidates || !Array.isArray(candidates.workspaces) || candidates.workspaces.length === 0) return null;

  const matches = [];
  const currentRoot = resolve(opts.workspaceRoot);
  for (const workspace of candidates.workspaces) {
    const workspaceRoot = resolve(workspace.path);
    if (workspaceRoot === currentRoot) continue;
    if (isHomeStoreRootDir(workspaceRoot)) continue;

    const siblingIndex = readTicketIndexJson(workspaceRoot);
    const siblingRows = filterTicketEntries(siblingIndex.entries, opts);
    const match = selectTicketEntryBySelector(siblingRows, selector)
      || findTicketEntryInWorkspaceBySelector(workspaceRoot, selector, opts);
    if (match) {
      matches.push({ workspace: workspaceRoot, id: workspace.id, entry: match });
    }
  }

  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(localizedTicket("guardAmbiguousSibling", { matches: matches.map(match => `${match.entry.id} @ ${match.workspace}`).join(", ") }));
  }

  opts.workspaceRoot = matches[0].workspace;
  opts.workspace = matches[0].id;
  return matches[0].entry;
}

function filterTicketEntries(entries, opts: CliOpts = {}) {
  return [...(entries || [])].filter(entry => {
    if (opts.project && entry.project !== opts.project) return false;
    if (opts.submodule && entry.submodule !== opts.submodule) return false;
    return true;
  });
}

export async function runTicketArchive(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  const indexJson = loadTicketIndex(opts);
  const ticketDir = detectConsumerTicketDir(opts.workspaceRoot);

  if (!opts.latest && !opts.ticketId) {
    throw new Error(localizedTicket("archiveIdRequired"));
  }

  const found = pickTicketEntry(opts, indexJson);
  if (!found) throw new Error(localizedTicket("archiveNoMatch"));
  const archiveDoc = readTicketDocument(opts.workspaceRoot, found, { action: "ticket archive", requireExists: true });
  assertTicketWorkflowAction(archiveDoc.meta, {
    fallbackStatus: found.status || "open",
    action: "archive"
  });

  const result = archiveTicketEntry({ cwd: opts.workspaceRoot, ticketDir, indexJson, found, opts });
  if (opts.dryRun) return;

  writeTicketIndexJson(opts.workspaceRoot, indexJson, opts);
  syncActiveTicketId(opts.workspaceRoot);
  if (result?.id) {
    appendTelemetryEvent(opts.workspaceRoot, {
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
  const indexJson = loadTicketIndex(opts);

  if (!opts.latest && !opts.ticketId) {
    throw new Error(localizedTicket("discardIdRequired"));
  }

  let found = pickTicketEntry(opts, indexJson);
  let absPath;
  if (!found && opts.ticketId) {
    const ticketId = String(opts.ticketId);
    const ticketsRoot = detectConsumerTicketDir(opts.workspaceRoot);
    const groups = ticketsRoot && existsSync(ticketsRoot) ? readdirSync(ticketsRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) : [];
    for (const group of groups) {
      const candidate = join(ticketsRoot, group, `${ticketId}.md`);
      if (existsSync(candidate)) { absPath = candidate; break; }
      if (!absPath && existsSync(ticketsRoot)) {
        const files = readdirSync(join(ticketsRoot, group)).filter(f => f.startsWith(ticketId) && f.endsWith(".md"));
        if (files.length === 1) { absPath = join(ticketsRoot, group, files[0]); break; }
      }
    }
    if (!absPath) {
      const hint = buildTicketNotFoundHint(opts.workspaceRoot, ticketId, ticketsRoot);
      throw new Error([localizedTicket("discardNoMatchFor", { id: String(ticketId) }), ...hint].join("\n"));
    }
    found = { id: ticketId, status: "open" };
  } else if (!found) {
    throw new Error(localizedTicket("discardNoMatch"));
  } else {
    absPath = resolveTicketEntryOrComputedPath(opts.workspaceRoot, found);
  }

  const relativePath = toRepoRelativePath(opts.workspaceRoot, absPath);
  if (!existsSync(absPath)) throw new Error(localizedTicket("ticketFileNotFound") + relativePath);

  const body = readFileSync(absPath, "utf8");
  const { meta } = parseFrontMatter(body);
  assertTicketWorkflowAction(meta, {
    fallbackStatus: found.status || "open",
    action: "discard"
  });
  const phase = Number(meta.phase || 1);
  const status = String(meta.status || found.status || "open").toLowerCase();
  const isDiscardablePhase = phase <= 2;
  const isDiscardableStatus = status === "open" || status === "approval_required";
  if (!isDiscardablePhase || !isDiscardableStatus) {
    throw new Error(localizedTicket("discardNotDiscardable", { id: String(found.id) }));
  }

  assertLastResortConfirmed(opts, "discard");

  if (opts.dryRun) {
    console.log(`ticket discard: would delete ${found.id} (${relativePath})`);
    return { id: found.id, path: relativePath, discarded: false };
  }

  rmSync(absPath, { force: true });
  const nextEntries = (indexJson.entries || []).filter(entry => entry.id !== found.id);
  writeTicketIndexJson(opts.workspaceRoot, {
    ...indexJson,
    entries: nextEntries
  }, opts);
  syncActiveTicketId(opts.workspaceRoot);
  appendTelemetryEvent(opts.workspaceRoot, {
    event: "ticket_discarded",
    action: "ticket-discard",
    ticket: found.id,
    file: relativePath,
    phase,
    status: "discarded",
    sessionMode: opts.sessionMode || "",
    originSource: opts.source || ""
  });
  console.log(`ticket: discarded -> ${found.id}`);
  return { id: found.id, path: relativePath, discarded: true };
}

export async function runTicketSanitize(opts) {
  applyTicketRootContext(opts);
  const dir = detectConsumerTicketDir(opts.workspaceRoot);
  if (!dir) { console.log("No ticket directory found."); return; }
  const files = collectTicketMarkdownFiles(dir);
  let fixed = 0, skipped = 0;
  for (const absPath of files) {
    const raw = readFileSync(absPath, "utf8");
    const { meta, content } = parseFrontMatter(raw);
    const stripped = stripLeadingFrontMatter(content);
    if (stripped === content) { skipped++; continue; }
    const next = stringifyFrontMatter(meta, stripped);
    if (!opts.dryRun) writeFileLF(absPath, next);
    console.log(`[SANITIZE] ${toRepoRelativePath(opts.workspaceRoot, absPath)}`);
    fixed++;
  }
  console.log(`Done: ${fixed} fixed, ${skipped} already clean.`);
}

function isBrokenMigratedStub(absPath) {
  try {
    const { meta } = parseFrontMatter(readFileSync(absPath, "utf8"));
    const slug = absPath.split(/[/\\]/).pop().replace(/\.md$/i, "");
    const title = String(meta.title || "").trim();
    const tags = meta.tags;
    const migrated = tags === "migrated" || (Array.isArray(tags) && tags.includes("migrated"));
    return migrated && title === slug;
  } catch {
    return false;
  }
}

function isCleanLiveTicket(absPath) {
  try {
    const raw = readFileSync(absPath, "utf8");
    const frontmatterBlocks = (raw.match(/^---\s*$/gm) || []).length;
    if (frontmatterBlocks > 2) return false; // more than one frontmatter block
    const { meta } = parseFrontMatter(raw);
    const slug = absPath.split(/[/\\]/).pop().replace(/\.md$/i, "");
    const title = String(meta.title || "").trim();
    return title.length > 0 && title !== slug;
  } catch {
    return false;
  }
}

export async function runTicketDoctor(opts) {
  applyTicketRootContext(opts);
  const dir = detectConsumerTicketDir(opts.workspaceRoot);
  if (!dir) { console.log("No ticket directory found."); return; }

  const files = collectTicketMarkdownFiles(dir);
  const byName = new Map();
  for (const absPath of files) {
    const name = absPath.split(/[/\\]/).pop();
    const isArchive = /[/\\]archive[/\\]/.test(absPath) || /[/\\]archive[/\\]?$/.test(absPath);
    const bucket = byName.get(name) || { live: [], archive: [] };
    (isArchive ? bucket.archive : bucket.live).push(absPath);
    byName.set(name, bucket);
  }

  const apply = Boolean(opts.apply);
  let removed = 0, warned = 0, skipped = 0;
  for (const [name, bucket] of byName) {
    if (bucket.archive.length === 0) continue;          // nothing archived
    if (bucket.live.length === 0) {                      // archive-only: not a duplicate
      skipped++;
      continue;
    }
    const liveOk = bucket.live.some(p => isCleanLiveTicket(p));
    if (!liveOk) {
      console.log(`[WARN] ${name}: live copy missing or broken — leaving archive copy untouched.`);
      warned++;
      continue;
    }
    for (const archAbs of bucket.archive) {
      const archRel = toRepoRelativePath(opts.workspaceRoot, archAbs);
      const broken = isBrokenMigratedStub(archAbs);
      const tag = broken ? "broken-migrated-stub" : "duplicate-of-live";
      if (apply) {
        unlinkSync(archAbs);
        console.log(`[REMOVE] ${archRel} (${tag})`);
      } else {
        console.log(`[DRY-RUN] would remove ${archRel} (${tag})`);
      }
      removed++;
    }
  }

  const verb = apply ? "removed" : "would remove";
  console.log(`Done: ${removed} ${verb}, ${warned} warned (live missing/broken), ${skipped} archive-only skipped.`);
  if (!apply && removed > 0) console.log("Re-run with --apply to delete the archive copies above.");
}

export async function runTicketRebuild(opts) {
  applyTicketRootContext(opts, { createIfMissing: true });
  console.log("Rebuilding INDEX.json from markdown files...");
  loadTicketIndex(opts, { force: true, rebuild: true });
}

function stripRelPathSuffix(absPath, relPath) {
  const absNorm = String(absPath || "").replace(/\\/g, "/").replace(/\/+$/, "");
  const relNorm = String(relPath || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (relNorm && absNorm.toLowerCase().endsWith("/" + relNorm.toLowerCase())) {
    const root = absNorm.slice(0, absNorm.length - relNorm.length - 1);
    return makePath(root);
  }
  return dirname(absPath);
}

function isPathInsideDir(target, dir) {
  const rel = relative(makePath(dir), makePath(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolutePathLike(rel));
}

function isAbsolutePathLike(p) {
  const s = String(p || "");
  return s.startsWith("/") || s.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(s);
}

export async function runTicketMove(opts) {
  if (opts.workspace) {
    const sourceOpts = { ...opts };
    applyTicketRootContext(sourceOpts, {});
    applyTicketContext(sourceOpts);
    if (!sourceOpts.ticketId && !sourceOpts.latest) sourceOpts.latest = true;

    const targetOpts = { ...opts };
    applyTicketRootContext(targetOpts, {});
    if (targetOpts.workspaceRoot !== sourceOpts.workspaceRoot) {
      const sourceIndex = loadTicketIndex(sourceOpts);
      const sourceEntry = pickTicketEntry(sourceOpts, sourceIndex);
      if (!sourceEntry) throw new Error(localizedTicket("moveNoMatch"));

      const { absPath: sourceAbs, meta: sourceMeta, content: sourceContent, docmeta: sourceDocMeta } = readTicketDocument(sourceOpts.workspaceRoot, sourceEntry, { action: "ticket move workspace", requireExists: true });
      const targetCwd = targetOpts.workspaceRoot;

    const targetBreadcrumb = resolveWorkspaceContext(targetCwd).breadcrumb;
    sourceMeta.breadcrumb = targetBreadcrumb;

    const targetRelPath = computeTicketPath({ ...sourceEntry, fileName: (sourceEntry.path || computeTicketPath(sourceEntry)).split(/[/\\]/).pop() });
    const targetAbs = makePath(targetCwd, targetRelPath);
    mkdirSync(dirname(targetAbs), { recursive: true });
    const newBody = renderTicketDocument({ meta: sourceMeta, content: sourceContent, docmeta: sourceDocMeta });
    writeTicketMarkdownFile(targetAbs, newBody);

    const srcIndex = readTicketIndexJson(sourceOpts.workspaceRoot);
    srcIndex.entries = (srcIndex.entries || []).filter(e => e.id !== sourceEntry.id);
    writeTicketIndexJson(sourceOpts.workspaceRoot, srcIndex);
    rmSync(sourceAbs, { force: true });
    syncActiveTicketId(sourceOpts.workspaceRoot);

    const dstIndex = readTicketIndexJson(targetCwd);
    dstIndex.entries = [...(dstIndex.entries || []), { ...sourceEntry, workspace: targetBreadcrumb }];
    writeTicketIndexJson(targetCwd, dstIndex);
    syncActiveTicketId(targetCwd);

      console.log(`ticket: moved workspace -> ${sourceEntry.id} (${sourceMeta.breadcrumb || targetBreadcrumb})`);
      appendTelemetryEvent(targetCwd, { event: "ticket_workspace_moved", action: "ticket-move-workspace", ticket: sourceEntry.id, from: sourceOpts.workspaceRoot, to: targetCwd });
      return;
    }
    opts.workspaceRoot = targetOpts.workspaceRoot;
  }

  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (!opts.ticketId && !opts.latest) {
    opts.latest = true; // Default to latest
  }

  const index = loadTicketIndex(opts);
  const entry = pickTicketEntry(opts, index);

  if (!entry) throw new Error(localizedTicket("moveNoMatch"));

  const { absPath: abs, meta: parsedMeta, content: rawContent, docmeta: existingDocMeta } = readTicketDocument(opts.workspaceRoot, entry, { action: "ticket move", requireExists: true });

  const targetStateForEvidence = Number.isFinite(Number(opts.phase))
    ? `phase${normalizeTicketPhaseNumber(opts.phase)}`
    : opts.next
      ? `phase${Math.min(normalizeTicketPhaseNumber(Number(parsedMeta.phase || 1)) + 1, 4)}`
      : "";
  const evidenceSections = buildEvidenceSectionsForTransition(opts, targetStateForEvidence, parsedMeta);
  const content = evidenceSections.length
    ? mergeH2SectionsIntoBody(rawContent, evidenceSections)
    : rawContent;

  const previousIndex = readTicketIndexJson(opts.workspaceRoot);
  const body = readFileSync(abs, "utf8");
  const currentPhase = Number(parsedMeta.phase || 1);
  const requestedPhase = Number(opts.phase);
  if (opts.phaseRequested && !Number.isFinite(requestedPhase)) {
    throw new Error(
      `ticket move: could not parse the requested phase from --phase/--to "${opts.phase}". ` +
      `Use a phase number, e.g. --phase 2 (or --to 2). Refusing to auto-advance.`
    );
  }
  let transition;
  try {
    transition = resolveTicketWorkflowCommandTransition(opts.workspaceRoot, entry, abs, parsedMeta, content, opts, {
      action: "move",
      phase: Number.isFinite(requestedPhase) ? requestedPhase : undefined,
      next: opts.next || !Number.isFinite(requestedPhase)
    });
  } catch (err) {
    const reasonText = String(err.message || "");
    if (currentPhase === 1 && (requestedPhase >= 2 || opts.next || !Number.isFinite(requestedPhase))) {
      const reasons = reasonText.split(":").pop().split(",").map(value => value.trim()).filter(Boolean);
      throw new Error(formatTicketWorkflowGateFailure(opts.workspaceRoot, abs, entry, parsedMeta, content, opts, "phase2", reasons));
    }
    throw err;
  }
  const nextPhase = transition.phase;
  if (Number.isFinite(nextPhase) && nextPhase < currentPhase) {
    assertLastResortConfirmed(opts, "rollback");
  }
  const ticketFileName = (entry.path || computeTicketPath(entry)).split(/[/\\]/).pop();
  const reopenTargetRelPath = nextPhase <= 1
    ? computeTicketPath({
        ...entry,
        fileName: ticketFileName,
        status: "open",
        archiveYearMonth: undefined
      })
    : null;
  const canonicalTicketRoot = stripRelPathSuffix(abs, computeTicketPath(entry));
  const reopenTargetAbsPath = reopenTargetRelPath
    ? makePath(canonicalTicketRoot, reopenTargetRelPath)
    : abs;
  if (reopenTargetRelPath && !isPathInsideDir(reopenTargetAbsPath, canonicalTicketRoot)) {
    throw new Error(
      `ticket move: refusing to reopen ticket ${entry.id} outside its canonical store — ` +
      `target ${reopenTargetAbsPath} is not under ${canonicalTicketRoot}. This is the #834 ` +
      `path-drift guard; fix the ticket root resolution rather than relocating the file.`
    );
  }

  if (currentPhase === 1 && nextPhase >= 2) {
    const reasons = getPhase1IncompleteReasons(opts.workspaceRoot, abs);
    if (reasons.length) {
      throw new Error(`[VALIDATION FAILED] Ticket ${entry.id} has incomplete Phase 1 planning evidence: ${reasons.join(", ")}. Fill substantive APC and compact plan content before moving to Phase 2.`);
    }
  }

  parsedMeta.phase = nextPhase;
  parsedMeta.status = transition.status;
  const freshDocMeta = transition.from === transition.to
    ? existingDocMeta
    : collectTicketTransitionValidationDocMeta(opts.workspaceRoot, abs, parsedMeta, content, opts, transition.to);
  const transitionDocMeta = mergeDocMetaUpdate(existingDocMeta, freshDocMeta);
  const nextMeta = clearDocMetaFrontmatterSummary(parsedMeta);
  for (const key of Object.keys(parsedMeta)) delete parsedMeta[key];
  Object.assign(parsedMeta, nextMeta);

  const newBody = renderTicketDocument({ meta: parsedMeta, content, docmeta: transitionDocMeta });
  let finalAbsPath = abs;
  let reopenedFromArchive = false;

  try {
    writeTicketMarkdownFile(abs, newBody);

    opts.ticketId = entry.id;
    if (parsedMeta.status !== entry.status) {
      opts.status = parsedMeta.status;
      updateTicketEntryStatus(opts.workspaceRoot, opts);
    } else {
      loadTicketIndex(opts, { force: true });
    }

    if (nextPhase <= 1 && reopenTargetAbsPath !== abs) {
      if (existsSync(reopenTargetAbsPath)) {
        throw new Error(localizedTicket("reopenExists") + toRepoRelativePath(opts.workspaceRoot, reopenTargetAbsPath));
      }
      mkdirSync(dirname(reopenTargetAbsPath), { recursive: true });
      writeTicketMarkdownFile(reopenTargetAbsPath, newBody);
      rmSync(abs);
      finalAbsPath = reopenTargetAbsPath;
      reopenedFromArchive = true;
      loadTicketIndex(opts, { force: true });
    }

    runTicketWorkflowQualityGate(opts.workspaceRoot, {
      ticketAbsPath: finalAbsPath,
      context: `ticket move ${entry.id}`
    });

    syncActiveTicketId(opts.workspaceRoot);
    appendTelemetryEvent(opts.workspaceRoot, {
      event: "ticket_phase_moved",
      action: "ticket-move",
      ticket: entry.id,
      file: toWsRelativePath(opts.workspaceRoot, finalAbsPath),
      phase: nextPhase,
      status: parsedMeta.status,
      from: transition.from,
      to: transition.to,
      sessionMode: opts.sessionMode || "",
      originSource: opts.source || ""
    });
    console.log(`ticket: moved -> ${entry.id} is now in Phase ${nextPhase} (${parsedMeta.status})`);
    const transitionSkills = transition.skills || [];
    if (transitionSkills.length > 0) {
      console.log(
        `\n🎭 **${transition.from} → ${transition.to} 전이 — 지금 Skill 툴로 ${transitionSkills.map(id => `\`${id}\``).join(", ")}를 호출하라.**\n` +
        `이 전이가 스킬 호출의 시점이다. 호출하지 않은 채 이어가면 이 국면의 롤이 서지 않는다.`
      );
    }
    if (nextPhase === 2 && existsSync(resolveProjectRulePath(opts.workspaceRoot))) {
      console.log("\n" + buildCodingStep(opts.workspaceRoot, PACKAGE_ROOT, "modify", ""));
    }
    try {
      await runTicketStatus({ ...opts, ticketId: entry.id, statusDetail: true, json: false });
    } catch {
      printTicketPhaseLine(entry.id, finalAbsPath, nextPhase, opts);
      printUsageReminder(opts.workspaceRoot, opts);
      printPhaseAdvanceHint(entry.id, nextPhase, parsedMeta.status, opts, parsedMeta);
    }
  } catch (err) {
    if (reopenedFromArchive) {
      rmSync(finalAbsPath, { force: true });
      writeTicketMarkdownFile(abs, body);
    }
    rollbackTicketWorkflowArtifacts(opts.workspaceRoot, previousIndex, body, abs, opts);
    throw err;
  }
}

export async function runTicketNext(opts) {
  applyTicketRootContext(opts);
  const index = loadTicketIndex(opts);
  const rows = filterTicketEntries(index.entries, opts)
    .filter(entry => isLiveTicketEntry(entry))
    .filter(entry => isTicketNextRunnableCandidate(opts.workspaceRoot, entry))
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  let found = index.activeTicketId ? rows.find(e => e.id === index.activeTicketId) : undefined;
  if (!found) {
    found = rows[0];
  }
  
  if (!found) {
    const latestClosed = filterTicketEntries(index.entries, opts)
      .filter(entry => String(entry.status || "").toLowerCase() === "closed")
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0];
    if (latestClosed) {
      const latestClosedPath = resolveTicketEntryOrComputedPath(opts.workspaceRoot, latestClosed);
      if (existsSync(latestClosedPath)) {
        const { content } = readTicketDocument(opts.workspaceRoot, latestClosed, { action: "ticket next", computePath: true });
        if (followUpDecisionMeansNoFollowUp(content)) {
          if (opts.pathOnly) {
            console.log(`no-follow-up:${latestClosed.id}`);
          } else if (isCompactTicketOutput(opts)) {
            console.log(`no-follow-up:${latestClosed.id}`);
          } else {
            const posixPath = toWsRelativePath(opts.workspaceRoot, latestClosedPath);
            console.log(`No follow-up required after ${latestClosed.id}`);
            console.log(`Path: [${posixPath}](${posixPath})`);
          }
          return { status: "no-follow-up", ticket: latestClosed.id, path: latestClosed.path || computeTicketPath(latestClosed) };
        }
      }
    }
    throw new Error(localizedTicket("noActiveTickets"));
  }
  
  if (index.activeTicketId !== found.id) {
    writeTicketIndexJson(opts.workspaceRoot, { ...index, activeTicketId: found.id });
  }

  const foundAbs = readTicketDocument(opts.workspaceRoot, found, { action: "ticket next", requireExists: true });
  const absPath = toPosixPath(foundAbs.absPath);
  if (isCompactTicketOutput(opts) || opts.pathOnly) {
    printTicketSelectionLine(found.id, absPath, { ...opts, docsLanguage: foundAbs.meta.docsLanguage });
  } else {
    const posixPath = toWsRelativePath(opts.workspaceRoot, foundAbs.absPath);
    console.log(`Next ticket: ${found.id}`);
    console.log(`Path: [${posixPath}](${posixPath})`);
      if (opts.printContent) console.log("\n" + readFileSync(foundAbs.absPath, "utf8"));
  }
}

function isTicketNextRunnableCandidate(cwd, entry) {
  const ticketDoc = readTicketDocument(cwd, entry, { action: "ticket next", computePath: true, requireExists: false });
  if (!ticketDoc.exists) return true;

  const { meta } = ticketDoc;
  // lifecycleSource is the provenance field written by pre-5.x ticket create.
  const workflowSource = String(meta.workflowSource || meta.ticketWorkflowSource || meta.lifecycleSource || "").trim();
  return workflowSource === "ticket-create";
}

export async function runTicketHotfix(opts) {
  applyTicketRootContext(opts);
  if (!opts.ticketId && !opts.latest) {
    opts.latest = true; // Default to latest
  }

  if (!opts.reason) {
    throw new Error(localizedTicket("hotfixReasonRequired"));
  }

  const index = loadTicketIndex(opts);
  const entry = pickTicketEntry(opts, index);
  
  if (!entry) throw new Error(localizedTicket("hotfixNoMatch"));

  const { absPath: abs, meta, content, docmeta } = readTicketDocument(opts.workspaceRoot, entry, { action: "ticket hotfix", requireExists: true });

  meta.phase = 2;
  meta.status = "open";
  meta.hotfix = true;
  meta.hotfixReason = opts.reason;
  
  const timestamp = new Date().toISOString();
  const hotfixRecord = `\n\n> [!WARNING]\n> **EMERGENCY HOTFIX ACTIVATED** (${timestamp})\n> **Reason:** ${opts.reason}\n> Standard APC and Phase 1 guards were bypassed.\n`;
  
  writeTicketDocument(abs, { meta, content: content + hotfixRecord, docmeta });

  opts.ticketId = entry.id;
  opts.status = "open";
  updateTicketEntryStatus(opts.workspaceRoot, opts);

  const hotfixIndex = loadTicketIndex(opts);
  writeTicketIndexJson(opts.workspaceRoot, { ...hotfixIndex, activeTicketId: entry.id });
  syncActiveTicketId(opts.workspaceRoot);
  console.log(`[EMERGENCY HOTFIX] Ticket ${entry.id} is now ACTIVE. Rule policy bypassed for this session.`);

  const deriveTopic = `codegen-fix-${entry.id}`;
  const deriveSummary = `[DERIVED] Fix CodeGen source for hotfix: ${opts.reason}`;
  console.log(`[HOTFIX] Auto-creating derivation ticket: ${deriveTopic}`);
  
  try {
    await runTicketCreate({
      cwd: opts.workspaceRoot,
      title: deriveTopic,
      summary: deriveSummary,
      chain: true,
      group: 'sub',
      parent: entry.id,
      tags: 'hotfix-derived,codegen',
      priority: 'P1',
      skipPhase0: true,
      nonInteractive: true
    });
  } catch (err) {
    console.warn(`[WARNING] Failed to auto-create derivation ticket: ${err.message}`);
  }
}

export async function runTicketMigrateHome(opts) {
  applyTicketRootContext(opts);
  const { resolveRealWorkspaceRoot } = await import("./cli-utils.js");
  const root = resolveRealWorkspaceRoot(opts.workspaceRoot, opts);
  if (!root) {
    console.log("[migrate] cwd is not a workspace (no .deuk marker or project boundary) — nothing to migrate.");
    return;
  }
  const home = await import("./cli-ticket-home.js") as any;
  const r = home.reconcileWorkspace(root, opts);
  if (r.skipped) {
    console.log("[migrate] cwd is the home ticket store itself — nothing to migrate.");
    return;
  }
  console.log(`[migrate] workspace: ${root}`);
  console.log(`[migrate] id:        ${r.id}`);
  console.log(`[migrate] home dir:  ${r.homeDir}`);
  console.log(`[migrate] absorbed legacy tickets: ${r.absorbed ? "yes" : "no (already migrated)"}`);
  console.log(`[migrate] registry ${r.pathChanged ? "updated (path changed)" : "already current"}`);
  console.log("[migrate] done — workspace ticket residue is now zero.");
}
