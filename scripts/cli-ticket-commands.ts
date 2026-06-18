import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, copyFileSync, readdirSync, rmSync, statSync } from "fs";
import { hostname } from "os";
import { basename, dirname, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import {
  toSlug, toSnakeCaseKey, requireNonEmptySlug, toRepoRelativePath, toWsRelativePath, toFileUri, inferRefTitleAndTopic, resolveReferencedTicketPath, toPosixPath, sanitizeFrontMatterMeta, stringifyFrontMatter, stripLeadingFrontMatter,
  resolveDocsLanguage, inferDocsLanguageFromText, normalizeDocsLanguage, isMcpActive, withReadline, parseFrontMatter, collectMcpConfigStatuses,
  DEUK_ROOT_DIR, TICKET_SUBDIR, TICKET_INDEX_FILENAME, WORKFLOW_MODE_EXECUTE, hasWorkspaceMarker,
  detectConsumerTicketDir, resolveConsumerTicketRoot, resolveWorkspaceContext, loadInitConfig, computeTicketPath, normalizeTicketGroup, normalizeWorkflowMode,
  loadWorkspaceCandidates, resolveWorkspaceTarget, findPromptWorkspaceMatches, selectLocalizedTemplatePath,
  buildPromptWorkspaceAliases, writeFileLF, makePath, resolvePackageRoot, readWorkspaceCookie
 , CliOpts } from "./cli-utils.js";
import {
  buildDocMetaFrontmatterSummary,
  buildTransitionValidationDocMeta,
  clearDocMetaFrontmatterSummary,
  splitTicketDocMetaSection
} from "./cli-ticket-docmeta.js";
import {
  readTicketDocument,
  resolveTicketEntryOrComputedPath,
  renderTicketDocument,
  writeTicketDocument,
  writeTicketMarkdownFile
} from "./cli-ticket-document.js";
import { generateTicketId, readTicketIndexJson, syncActiveTicketId, syncToPipeline, writeTicketIndexJson } from "./cli-ticket-index.js";
// Registers the ticket-home module so detectConsumerTicketDir routes ticket storage
// to ~/.deuk-agent/tickets/ (#622), and exposes home helpers for #623 guards.
import { isHomeStoreRoot as isHomeStoreRootDir, resolveHomeTicketDirForWorkspace } from "./cli-ticket-home.js";
import { collectTicketMarkdownFiles } from "./cli-ticket-scan.js";
import { appendTicketEntry, rebuildTicketIndexFromTopicFilesIfNeeded, updateTicketEntryStatus } from "./cli-ticket-parser.js";
import { appendInternalWorkflowEvent, buildTelemetrySummary, getTelemetryCompactSummary } from "./cli-telemetry-commands.js";
import { parsePlan } from "./plan-parser.js";
import { collectChangedFiles, lintMarkdownPaths, normalizeMarkdownFile } from "./lint-md.js";
import { auditRules } from "./lint-rules.js";
import { getUsageReminderLine } from "./cli-usage-commands.js";
import { cliText } from "./cli-locales.js";
import {
  buildSlotStatusSummary,
  extractMarkdownSection,
  followUpDecisionMeansNoFollowUp,
  getAnalysisDesignIncompleteReasons,
  getCloseWorkflowReasons,
  getPhase1PlanBodyReasons,
  hasPhase2ExecutionEvidence,
  hasPlaceholderTokens,
  hasTicketCompletionEvidence,
  normalizePhase1PlanBodyHeadings,
  phase1SectionsForType,
  resolveTicketType,
  REQUIRED_APC_MARKERS,
  REQUIRED_PHASE1_SECTIONS
} from "./cli-ticket-evidence.js";
import { renderTicketWorkflowGateFailure } from "./cli-ticket-surface.js";
import {
  AUTO_ARCHIVE_DONE_STATUSES,
  OPEN_TICKET_STATUSES,
  FLOW_SURFACE_STATUS,
  normalizeTicketPhaseNumber,
  sanitizeTicketWorkspaceLabel,
  formatTicketFlowLine,
  getTicketGuide,
  renderTicketFlowSurface,
  renderTicketDocMetaSurface,
  resolveTicketWorkflowTransition,
  getTicketWorkflowTransitionEvidenceKeys,
  assertTicketWorkflowAction,
  assertTicketWorkflowTransition,
  TICKET_WORKFLOW,
  resolveTicketWorkflowRuntimeState,
  deriveTicketWorkflowStatus,
  isTerminalTicketStatus,
  isExecutionTicketStatus
} from "./ticket-workflow.js";
import { detectCurrentPlatform, getActiveSkillsSurface } from "./cli-skill-commands.js";
import ejs from "ejs";
import YAML from "yaml";

import { createInterface } from "readline";
import { selectOne } from "./cli-prompts.js";

const MAX_OPEN_TICKETS = 20;
const PACKAGE_ROOT = resolvePackageRoot({ fromUrl: import.meta.url });

// #633: workspace is resolved ONLY from --workspace (registry); cwd is never used as a
// fallback. Every surface that prints a ticket CLI command must pre-announce this BEFORE
// the command so the agent always passes --workspace, otherwise the command errors out.
const WORKSPACE_PREFLIGHT_NOTICE = [
  "NOTE: workspace is resolved ONLY from --workspace (registry); cwd is never used.",
  "Omitting --workspace will error out, so always pass it on every ticket command below."
];

// Build the lines that pre-announce the --workspace requirement, returning [] when no
// workspace name can be derived (so the notice never points at an empty --workspace).
function workspacePreflightLines(cwd) {
  return basename(String(cwd || "")) ? [...WORKSPACE_PREFLIGHT_NOTICE, ""] : [];
}

function loadTicketIndex(opts, extra: Record<string, any> = {}) {
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, {
    ...opts,
    force: extra.force ?? false,
    rebuild: extra.rebuild ?? false
  });

  if (extra.autoArchiveDone === false || opts.pathOnly) {
    return index;
  }

  autoArchiveDoneTickets(opts.cwd, index, opts);
  return readTicketIndexJson(opts.cwd);
}

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
  const targetSections = ["Analysis", "Direction", "Problem Analysis", "Source Observations", "Cause Hypotheses", "Improvement Direction"];
  return targetSections.map(name => extractMarkdownSection(content, name)).join(" ");
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

// Single source of truth for the fillable Phase 1 plan-body scaffold. Both the
// human-readable guard message and the --json repair payload surface this exact
// skeleton so an agent can fill the sections and pass the guard instead of being
// blocked with headings-only text (the scaffold was previously omitted from the
// default text path and hand-maintained separately in the JSON path).
// Per-section placeholder hints used when rendering the fillable scaffold. The set of
// sections shown is derived from the validator (phase1SectionsForType) so guidance and
// validation can never drift again (#627).
const PHASE1_SECTION_HINTS = {
  "Scope & Approval": [
    "범위: <어떤 파일/함수까지>",
    "요구사항: <사용자가 원하는 결과>",
    "접근법: <구체적 방법>"
  ],
  "Plan": ["1. <실행 단계>"],
  "Analysis": [
    "원인: <근본 원인 분석>",
    "- <file:line — 관찰 증거>",
    "가설: 1. <가설>"
  ],
  "Direction": ["<개선 방향>"]
};

// Builds the fillable scaffold for a given ticket type, showing only the sections that
// type actually requires (non-CLI types omit the two CLI sections).
function buildPhase1PlanBodySkeleton() {
  const lines = [];
  for (const section of phase1SectionsForType()) {
    lines.push(`## ${section}`);
    lines.push(...(PHASE1_SECTION_HINTS[section] || ["<fill>"]));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function buildPlanBodyRequiredMessage(reasons = []) {
  const uniqueReasons = [...new Set(reasons)];
  const locale = resolveDocsLanguage("auto");
  const headings = phase1SectionsForType().map(s => `\`## ${s}\``).join(", ");
  return [
    "[VALIDATION FAILED] ticket create requires a filled Phase 1 plan body with actual data.",
    `Missing or incomplete: ${uniqueReasons.join(", ")}`,
    cliText("ticket.validation.selfServeRecipe", { locale }),
    "Use: `deuk-agent-flow ticket create --title <title> --summary \"<summary>\" --plan-body \"<filled body>\" --non-interactive`.",
    `Use these exact H2 headings: ${headings}. (Aliases accepted: "## APC", "## Agent Permission Contract", "## Scope & Approval", "## Compact Plan", "## Problem Analysis", "## Source Observations", "## Audit Evidence", "## Improvement Direction" — all normalized before validation.)`,
    "Do not rely on template defaults or auto-generated filler text for Phase 1 ticket content.",
    "",
    "Fillable plan-body scaffold (fill every section with real evidence, then pass via --plan-body):",
    buildPhase1PlanBodySkeleton()
  ].filter(Boolean).join("\n");
}

function extractMarkdownHeadingSection(content = "", heading = "") {
  const target = String(heading || "").trim().replace(/^#+\s*/, "").toLowerCase();
  if (!target) return "";
  const lines = String(content || "").split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match) continue;
    if (match[2].trim().toLowerCase() !== target) continue;
    start = index;
    level = match[1].length;
    break;
  }
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    const match = lines[index].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) {
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
  const template = readFileSync(templatePath, "utf8");
  const frontmatter = YAML.stringify(sanitizeFrontMatterMeta({
    id: "generated-ticket-id",
    title: "ticket-title",
    breadcrumb: "workspace-name",
    phase: 1,
    status: "open",
    workflowSource: "ticket-create",
    docsLanguage,
    summary: "concrete-summary",
    priority: "P2",
    tags: []
  })).trim();
  return ejs.render(template, {
    frontmatter,
    meta: { title: "ticket-title" }
  }).trimEnd();
}

function readCliSurfaceDocument(name) {
  const surfacePath = makePath(PACKAGE_ROOT, "docs", "cli-surfaces", `${name}.md`);
  if (!existsSync(surfacePath)) {
    throw new Error(`CLI surface document not found: ${surfacePath}`);
  }
  return readFileSync(surfacePath, "utf8");
}

function renderCliSurfaceDocument(name, replacements: Record<string, any> = {}) {
  let content = readCliSurfaceDocument(name);
  content = content.replace(/\{\{CORE:([^}]+)\}\}/g, (_match, heading) => getCoreRulesSection(String(heading || "").trim()).trimEnd());
  for (const [key, value] of Object.entries(replacements)) {
    const str = String(value ?? "").trim();
    if (!str) {
      // 값이 비면 해당 플레이스홀더와 직전 헤더 라인(## ...)까지 제거
      content = content.replace(new RegExp(`^##[^\n]*\n\\{\\{${key}\\}\\}\n?`, "m"), "");
      content = content.replaceAll(`{{${key}}}`, "");
    } else {
      content = content.replaceAll(`{{${key}}}`, str);
    }
  }
  // 연속된 빈 줄 3개 이상 → 2개로 정리
  content = content.replace(/\n{3,}/g, "\n\n");
  return content.trimEnd();
}

// #694: renderTicketWorkflowSummary 제거 — 워크플로 노드/전이는 XState 머신(SSOT)이고
// rules 출력에서 표 덤프를 뺐으므로 더 이상 쓰이지 않는다.

function readProjectRuleSurface(cwd, platform = null) {
  // native 플랫폼(claude)은 PROJECT_RULE.md가 CLAUDE.md 컨텍스트에 이미 로드됨 — 중복 embed 스킵.
  const detectedPlatform = platform || detectCurrentPlatform();
  if (detectedPlatform === "claude") return "";
  if (!cwd) return "";
  const projectRulePath = makePath(resolveHomeTicketDirForWorkspace(cwd), "PROJECT_RULE.md");
  if (!existsSync(projectRulePath)) return "";
  return readFileSync(projectRulePath, "utf8").trimEnd();
}

function readProjectPolicySurface(cwd, opts: CliOpts = {}) {
  // native 플랫폼(claude)은 활성 티켓 없을 때 guardrails 전체 나열 스킵.
  const detectedPlatform = opts.platform || detectCurrentPlatform();
  if (detectedPlatform === "claude" && !opts.activePolicyRole) return "";
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

// #685: readProjectMemorySurface 제거 — project-memory.md는 진행 상태를 담던 무의미한
// 레이어였고 state는 .md 프론트매터가 SSOT다. rules 출력에서 PROJECT_MEMORY 섹션 폐지.

export function buildTicketCreateGuide(opts: CliOpts = {}) {
  const docsLanguage = resolveDocsLanguage(normalizeDocsLanguage(opts.docsLanguage || "ko"));
  const renderedTemplate = renderTicketCreateTemplateGuide(docsLanguage);
  const surfaceName = docsLanguage === "ko" ? "ticket-create.ko" : "ticket-create";
  return renderCliSurfaceDocument(surfaceName, {
    TICKET_TEMPLATE: renderedTemplate
  });
}

// 티켓의 tags/summary에서 작업 도메인을 뽑아 역할 프롬프트에 주입할 한 줄 지시로 변환.
// 매칭 규칙은 작게 시작해 확장한다(설계 §4.2). 매칭 없으면 빈 문자열(역할 기본 문안만).
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

// 워크스페이스별 기술 스택/관습 프로필 SSOT: <workspace>/.deuk-agent/workspace-profile.md.
// 있으면 역할 프롬프트에 주입, 없으면 빈 문자열(역할 기본 문안만).
function readWorkspaceProfile(cwd, workspace, platform = null): string {
  // 워크스페이스 프로필 SSOT = PROJECT_RULE.md (홈 스토어, reconcile이 보존하는 알려진 파일).
  // 별도 파일을 만들지 않는다 — 설계상 PROJECT_RULE.md가 워크스페이스 규칙+내부기준문서
  // 포인터를 겸한다.
  //
  // 중복 회피: non-claude 플랫폼은 surface가 이미 `## Project Rules`로 PROJECT_RULE.md
  // 전문을 보여주므로(readProjectRuleSurface) 여기선 프로필을 다시 싣지 않는다. claude는
  // `## Project Rules`를 스킵(CLAUDE.md 중복 방지)하므로 ROLE_CONTEXT가 프로필을 담당한다.
  const detectedPlatform = platform || detectCurrentPlatform();
  if (detectedPlatform !== "claude") return "";
  if (!cwd) return "";
  try {
    const p = makePath(resolveHomeTicketDirForWorkspace(cwd), "PROJECT_RULE.md");
    if (existsSync(p)) {
      const raw = stripLeadingFrontMatter(readFileSync(p, "utf8")).trim();
      if (raw) return `[WORKSPACE_PROFILE: ${workspace || "local"}]\n${raw}`;
    }
  } catch { /* ignore */ }
  return "";
}

// 역할 동적 컨텍스트 블록. 도메인/프로필 중 있는 것만 모아 한 섹션으로 낸다.
// 둘 다 없으면 빈 문자열(템플릿에서 빈 줄로 흡수).
function buildRoleContextBlock(domainFocus, workspaceProfile): string {
  const parts = [domainFocus, workspaceProfile].map(s => String(s || "").trim()).filter(Boolean);
  if (parts.length === 0) return "";
  return `## Role Context (이번 작업 동적 컨텍스트)\n\n현재 페이즈 역할 레이어에 다음을 함께 적용한다:\n\n${parts.join("\n\n")}`;
}

export function buildTicketRulesGuide(opts: CliOpts = {}) {
  const surface = String(opts.ruleSurface || "ticket").trim() || "ticket";
  if (surface === "ticket") {
    // #694: 현재 노드 영역(area) 결정 — 활성 티켓이 있으면 그 phase(phase1~4),
    // 없으면 진입 영역 rules. 스킬은 이 영역에 바인딩된 것만 노출(노드별 도구 바인딩).
    let activePolicyRole = null;
    let area = "rules";
    let activeEntry = null;
    try {
      const index = readTicketIndexJson(opts.cwd);
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

    const guardrailsOpts = { ...opts, activePolicyRole };

    // 역할 동적 컨텍스트: 티켓 APC/도메인 + 워크스페이스 프로필. 네이티브 플랫폼(claude)은
    // 스킬 본문을 정적 파일로 깔아 본문 치환이 안 통하므로, 동적 컨텍스트는 rules surface의
    // 별도 인라인 블록(ROLE_CONTEXT)으로 항상 출력한다(NEXT_ACTION과 동일 방식).
    const roleContext = buildRoleContextBlock(deriveDomainFocus(activeEntry), readWorkspaceProfile(opts.cwd, opts.workspace, opts.platform));

    // #685: PROJECT_MEMORY 제거(.md가 state SSOT). PROJECT_RULES는 도메인 케이스만.
    // #694: TICKET_WORKFLOW 표 덤프 제거 — 워크플로 노드/전이는 XState 머신(SSOT)이고
    // 표를 매번 쏟는 건 노이즈다. 스킬은 현재 area 바인딩분만 노출.
    return renderCliSurfaceDocument("ticket", {
      REQUESTED_SURFACE: surface,
      PROJECT_RULES: readProjectRuleSurface(opts.cwd, opts.platform),
      PROJECT_GUARDRAILS: readProjectPolicySurface(opts.cwd, { ...guardrailsOpts, platform: opts.platform }),
      AGENT_SKILLS: getActiveSkillsSurface(opts.cwd, opts.platform, area),
      ROLE_CONTEXT: roleContext,
      NEXT_ACTION: buildNextActionBlock(opts)
    });
  }
  throw new Error(`Unknown ticket rules surface: ${surface}`);
}

// WSL2 환경에서는 Node가 win32 빌드여도 bash tool 사용 — WSLENV/WSL_DISTRO_NAME으로 감지.
function isWsl() {
  return !!(process.env.WSLENV || process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}

// #685: OS 추측 폴백 제거 — rules/move 출력은 에이전트가 그대로 실행할 노드 프롬프트이고,
// 에이전트는 항상 Bash tool 전용이다. process.platform/WSL 추측으로 PowerShell 블록을
// 내보내던 분기가 폴백의 근원이었으므로, 셸은 항상 bash로 고정한다.
function isWindowsPlatform(opts: CliOpts = {}) {
  return false;
}

function isAgentOnWindows(opts: CliOpts = {}) {
  return false;
}

// #690: 노드 프롬프트는 docs/cli-surfaces/state/*.md 가 SSOT다. 이 헬퍼는 해당 .md를
// 읽어 {{PLACEHOLDER}}만 치환해 emit한다. 코드에 프롬프트 문자열을 하드코딩하지 않는다.
function emitNodePrompt(name, replacements: Record<string, any> = {}, lang = "ko") {
  const text = loadStatePrompt(name, lang);
  if (!text) return "";
  let out = text;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.replaceAll(`{{${key}}}`, String(value ?? ""));
  }
  // 미치환 placeholder 잔여 라인 정리 + 연속 빈 줄 축소
  return out.replace(/\n{3,}/g, "\n\n").trimEnd();
}

// #690: LangGraph 라우터 — registry 전체에서 active ticket을 스캔해 현재 entry 노드 키와
// 그 노드의 프롬프트 치환 컨텍스트를 결정한다. 순수 판정만 하며 프롬프트 문자열을 만들지 않는다.
// #740: cwd 기반 workspace 감지 제거 — init 외 cwd 사용 금지 원칙. registry(--workspace)가 SSOT.
function routeEntryNode(opts: CliOpts = {}) {
  // registry 전체 워크스페이스 목록
  let registered = [];
  try {
    const candidates = loadWorkspaceCandidates("", { platform: "any", homeDir: opts.homeDir });
    registered = (candidates?.workspaces || []).map(w => w.id).filter(Boolean).sort();
  } catch { /* registry unreadable */ }

  if (registered.length === 0) {
    return { node: "entry-free", ctx: {} };
  }

  // #743: 세션 쿠키 없이 전체 workspace 순회로 active ticket을 잡는 폴백 제거.
  // sessionId 쿠키가 있으면 해당 workspace만 조회. 쿠키 없으면 entry-no-workspace로 떨어짐.
  let activeId = null, activePhase = null, activeStatus = null, activePath = null, activeWsCwd = null;
  const sessionCookie = opts.sessionId ? readWorkspaceCookie("", opts.sessionId, { homeDir: opts.homeDir }) : null;
  const sessionWorkspacePath = sessionCookie?.workspacePath || opts.cwd || null;

  if (sessionWorkspacePath) {
    try {
      const candidates = loadWorkspaceCandidates("", { platform: "any", homeDir: opts.homeDir });
      const matchedWs = (candidates?.workspaces || []).find(w => w.path === sessionWorkspacePath);
      const wsCwd = matchedWs?.path || sessionWorkspacePath;
      const index = readTicketIndexJson(wsCwd);
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
    const advance = buildPhaseAdvanceHint(activeId, activePhase, activeStatus, resolveDocsLanguage(opts.docsLanguage || "auto"));
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

  return { node: "entry-no-workspace", ctx: {
    WORKSPACE_COUNT: registered.length,
    WORKSPACE_LIST: registered.map(id => `  - ${id}`).join("\n"),
    FIRST_WORKSPACE: registered[0]
  } };
}

// #690: 라우터가 고른 노드를 .md 프롬프트(SSOT)로 emit. router(판정)/emit(출력) 분리.
function buildNextActionBlock(opts: CliOpts = {}) {
  const lang = resolveDocsLanguage(opts.docsLanguage || "auto");
  const { node, ctx } = routeEntryNode(opts);
  return emitNodePrompt(node, ctx, lang);
}

// Phase-aware hint: an active ticket should not stall in coding.
// Surface the next workflow transition (review/verification → completion)
// so the agent advances the ticket instead of re-`use`-ing it forever.
function loadStatePrompt(stateName, lang = "en") {
  const p = resolve(PACKAGE_ROOT, "docs", "cli-surfaces", "state", `${stateName}.${lang}.md`);
  try { return readFileSync(p, "utf8").trim(); } catch { return null; }
}

function loadStateTemplate(stateName, lang = "en") {
  const p = resolve(PACKAGE_ROOT, "docs", "cli-surfaces", "state-template", `${stateName}.${lang}.md`);
  try { return readFileSync(p, "utf8").trim(); } catch { return null; }
}

function buildPhaseAdvanceHint(activeId, phase, status, lang = "en") {
  if (isTerminalTicketStatus(status)) return "";
  const phaseNum = normalizeTicketPhaseNumber(phase);
  const stateName = `phase${phaseNum >= 4 ? 4 : phaseNum}`;
  const state = TICKET_WORKFLOW.states?.[stateName];
  const transitions = state?.transitions || [];
  if (transitions.length === 0) return "";

  // Label each transition: first=forward, end=early-exit, lower phase=rollback, phase1=reopen
  const routeLines = transitions.map((target, i) => {
    let label;
    if (target === "end") label = "early-exit";
    else if (i === 0) label = "forward";
    else {
      const targetPhase = TICKET_WORKFLOW.states?.[target]?.phase;
      label = targetPhase < phaseNum ? (targetPhase <= 1 ? "reopen" : "rollback") : "forward";
    }
    const targetPhaseNum = TICKET_WORKFLOW.states?.[target]?.phase;
    const cmd = target === "end"
      ? `deuk-agent-flow ticket move --id ${activeId} --to end --non-interactive`
      : `deuk-agent-flow ticket move --id ${activeId} --phase ${targetPhaseNum} --non-interactive`;
    return `  → ${target.padEnd(6)} (${label}):  ${cmd}`;
  });

  // Discard hint if allowed
  if ((state?.actions || []).includes("discard")) {
    routeLines.push(`  → discard (abandon): deuk-agent-flow ticket discard --id ${activeId} --workspace <ws> --non-interactive`);
  }

  // Slot hint from forward target template
  const forward = transitions[0];
  const nextStateName = forward !== "end" ? `phase${TICKET_WORKFLOW.states?.[forward]?.phase}` : "end";
  const statePrompt = loadStatePrompt(nextStateName, lang) || loadStatePrompt(stateName, lang) || "";
  const templateContent = loadStateTemplate(nextStateName, lang) || "";
  const slotLines = templateContent
    .split("\n")
    .filter(l => /^- \w.*:/.test(l.trim()))
    .map(l => l.trim());
  const slotsSection = slotLines.length > 0
    ? `\n${cliText("ticket.phase.fillSlots", { locale: lang })}\n${slotLines.map(l => `  ${l}`).join("\n")}`
    : "";

  // #690: 셸은 항상 bash 고정(에이전트는 Bash tool 전용). 노드 전이 프롬프트 본문은
  // loadStatePrompt로 .md(SSOT)에서 가져온다.
  return `

Next phase (${stateName} → ${forward}): ${statePrompt}${slotsSection}
\`\`\`bash
${routeLines.join("\n")}
\`\`\``;
}

export function runTicketRules(opts: CliOpts = {}) {
  // ticket status 등 다른 명령과 동일하게 opts.cwd를 소비자 티켓 루트로 리매핑한다.
  // 이게 없으면 readTicketIndexJson이 빈 entries를 반환해 activeTicketId가 null이 되고,
  // rules 출력이 active 티켓을 표현하지 못한 채 "No active ticket"으로 빠진다.
  applyTicketRootContext(opts);
  console.log(buildTicketRulesGuide(opts));
}

function buildPlanBodyRepairPayload(reasons = []) {
  const uniqueReasons = [...new Set(reasons)];
  return {
    ok: false,
    error: "ticket_create_phase1_plan_invalid",
    missingOrIncomplete: uniqueReasons,
    headings: phase1SectionsForType().map(section => `## ${section}`),
    repair: {
      command: 'deuk-agent-flow ticket create --title <title> --summary "<summary>" --plan-body "<filled body>" --non-interactive --require-filled --json',
      instruction: "Fill only the missing/incomplete sections and rerun with the same body.",
      skeleton: buildPhase1PlanBodySkeleton()
    }
  };
}

function buildPlanBodyRequiredError(reasons = [], opts: CliOpts = {}) {
  if (opts.json) {
    return JSON.stringify(buildPlanBodyRepairPayload(reasons), null, 2);
  }
  return buildPlanBodyRequiredMessage(reasons);
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
  const phase1Missing = getAnalysisDesignIncompleteReasons(meta, content);
  const slots = {
    claimTermsPresent: claimTerms.length > 0,
    claimCoverage: reasons.every(reason => !String(reason).startsWith("claim_coverage_missing")),
    ticketSummaryPresent: Boolean(meta.summary) && !hasPlaceholderTokens(meta.summary),
    ticketRecordComplete: phase1Missing.length === 0
  };
  return {
    ok: reasons.length === 0,
    reasons,
    ticket: target.id,
    path: target.path,
    claim,
    claimTerms: coverage.total,
    coveredTerms: coverage.matched.length,
    matchedTerms: coverage.matched,
    missRate: Number((coverage.missRate * 100).toFixed(1)),
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
        metadata_fields: ["ticket_id", "claim", "claim_terms", "covered_terms", "source_path"]
      },
      slots,
      slot_source_map: {
        claimTermsPresent: { source: "--claim" },
        claimCoverage: { source: "ticket analysis/design/verification sections", covered_terms: coverage.matched },
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

function printCreateApprovalGate(ticketId, opts: CliOpts = {}, scopeSummary = "") {
  void ticketId;
  void opts;
  void scopeSummary;
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

function formatTicketStartLine(ticketId, absPath, cwd = "", invocationCwd = "") {
  return formatTicketFlowLine(resolveTicketWorkspaceLabel(cwd, absPath), FLOW_SURFACE_STATUS.start, ticketId, absPath, invocationCwd || cwd);
}

function formatTicketUpdateLine(ticketId, absPath, cwd = "", invocationCwd = "") {
  return formatTicketFlowLine(resolveTicketWorkspaceLabel(cwd, absPath), FLOW_SURFACE_STATUS.adjust, ticketId, absPath, invocationCwd || cwd);
}

function formatTicketPhaseLine(ticketId, absPath, phase, cwd = "", invocationCwd = "") {
  const normalizedPhase = normalizeTicketPhaseNumber(phase);
  const statusLabel = normalizedPhase <= 1
    ? FLOW_SURFACE_STATUS.adjust
    : FLOW_SURFACE_STATUS.progressActive;
  return formatTicketFlowLine(resolveTicketWorkspaceLabel(cwd, absPath), statusLabel, ticketId, absPath, invocationCwd || cwd);
}

function formatTicketEndLine(ticketId, absPath, cwd = "", invocationCwd = "") {
  return formatTicketFlowLine(resolveTicketWorkspaceLabel(cwd, absPath), FLOW_SURFACE_STATUS.end, ticketId, absPath, invocationCwd || cwd);
}

function formatTicketStatusLine(label, ticketId, absPath) {
  return `Ticket ${label}: [${ticketId}](${absPath})`;
}

function ticketWorkflowOptions(opts: CliOpts = {}, replacements: Record<string, any> = {}) {
  return {
    docsLanguage: opts.docsLanguage,
    resolveLanguage: resolveDocsLanguage,
    normalizeDocsLanguage,
    cwd: opts.cwd,
    replacements,
    runtimeContext: opts.runtimeContext,
    surfaceMode: opts.verbose ? "full" : "recipe"
  };
}

function buildTicketRuntimeContext(ticketId, absPath, meta: Record<string, any> = {}, fallback: Record<string, any> = {}) {
  const runtimePath = absPath ? toPosixPath(resolve(absPath)) : "";
  const connectionState = fallback.cwd ? describeTicketConnectionState(fallback.cwd) : "";
  const workspaceLabel = fallback.cwd ? resolveTicketWorkspaceLabel(fallback.cwd, absPath || "") : "";
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
      workspaceLabel: resolveTicketWorkspaceLabel(opts.cwd, normalizedAbsPath),
      statusLabel,
      ticketId,
      absPath: normalizedAbsPath,
      invocationCwd: opts.invocationCwd || opts.cwd || ""
    }
  };
}

function printTicketStartLine(ticketId, absPath, opts: CliOpts = {}) {
  console.log(renderTicketFlowSurface("start", ticketFlowOptions(ticketId, absPath, FLOW_SURFACE_STATUS.start, opts)));
}

function printTicketEndLine(ticketId, absPath, opts: CliOpts = {}) {
  console.log(renderTicketFlowSurface("end", ticketFlowOptions(ticketId, absPath, FLOW_SURFACE_STATUS.end, opts)));
}

function printTicketUpdateLine(ticketId, absPath, opts: CliOpts = {}) {
  console.log(renderTicketFlowSurface("start", ticketFlowOptions(ticketId, absPath, FLOW_SURFACE_STATUS.adjust, opts)));
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
  console.log(formatTicketUpdateLine(ticketId, toPosixPath(absPath), opts.cwd, opts.invocationCwd));
}

// The approval surface tells the user to "review the plan", so the plan body
// (APC + Compact Plan, sans front matter and the DocMeta block) must be shown
// inline — otherwise nothing reviewable reaches the chat and the gate is blind.
function readApprovalPlanBody(absPath) {
  try {
    if (!absPath || !existsSync(absPath)) return "";
    const { content } = parseFrontMatter(readFileSync(absPath, "utf8"));
    return splitTicketDocMetaSection(content || "").body.trim();
  } catch {
    return "";
  }
}

function printPendingApprovalSurface(ticketId, absPath, opts: CliOpts = {}) {
  const normalizedAbsPath = toPosixPath(absPath);
  const flowLine = formatTicketUpdateLine(ticketId, normalizedAbsPath, opts.cwd, opts.invocationCwd);
  const summary = String(opts.summary || opts.runtimeContext?.summary || "").trim();
  const planBody = readApprovalPlanBody(absPath);
  const wsName = opts.workspace || basename(String(opts.cwd || ""));
  const lines = [
    opts.includeFlowLine === false ? "" : flowLine,
    summary ? `Summary: ${summary}` : "",
    "DocMeta state: approval_required",
    `Source: ${normalizedAbsPath}`,
    "",
    ...(planBody ? ["--- Plan under review ---", planBody, "--- End of plan ---", ""] : []),
    "Required slots:",
    "- phase1Plan",
    "- userApproval",
    "",
    "Output: transition_blocked_until_approval",
    "Action: review the plan above, then type `승인`.",
    "",
    ...workspacePreflightLines(opts.cwd),
    "Adapter command after approval (run ONLY after the user approves in chat):",
    "```bash",
    `deuk-agent-flow ticket move --id ${ticketId} --workspace ${wsName} --phase 2 --approval approved --non-interactive`,
    "```",
    "",
    "Not proceeding? Do NOT self-approve or force a phase jump — discard it instead:",
    "```bash",
    `deuk-agent-flow ticket discard --id ${ticketId} --workspace ${wsName} --non-interactive`,
    "```"
  ];
  console.log(lines.filter(line => line !== "").join("\n"));
}

function printExecutionSurface(ticketId, absPath, opts: CliOpts = {}) {
  const normalizedAbsPath = toPosixPath(absPath);
  const phase = Number(opts.phase || opts.runtimeContext?.phase || 2);
  const flowLine = formatTicketPhaseLine(ticketId, normalizedAbsPath, phase, opts.cwd, opts.invocationCwd);
  if (opts.includeFlowLine !== false) console.log(flowLine);
}

function printTicketUseNextSteps(found, foundDoc, opts: CliOpts = {}) {
  const phase = Number(foundDoc.meta.phase || found.phase || 1);
  const status = String(foundDoc.meta.status || found.status || "open").toLowerCase();
  const needsApprovalFlow = phase <= 1 && status === "open";
  const docsLanguage = foundDoc.meta.docsLanguage || opts.docsLanguage || "ko";

  const runtimeContext = buildTicketRuntimeContext(found.id, foundDoc.absPath, foundDoc.meta, {
    cwd: opts.cwd,
    hostWorkspaceLabel: opts.hostWorkspaceContext?.breadcrumb,
    status,
    phase,
    summary: found.summary,
    nextAction: needsApprovalFlow ? "await-user-approve" : "continue-execution"
  });
  if (needsApprovalFlow) {
    printPendingApprovalSurface(found.id, foundDoc.absPath, { ...opts, docsLanguage, runtimeContext, summary: found.summary, includeFlowLine: false });
    return;
  }

  if (phase >= 2 && OPEN_TICKET_STATUSES.has(status)) {
    // printTicketSelectionLine already emitted the flow line for `use`; avoid a duplicate.
    printExecutionSurface(found.id, foundDoc.absPath, { ...opts, docsLanguage, runtimeContext, summary: found.summary, phase, status, includeFlowLine: false });
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

function lintTicketWorkflowMarkdown(cwd, targets, context) {
  let uniqueTargets = Array.from(new Set((targets || []).filter(Boolean)));
  if (uniqueTargets.length === 0) return { errors: [], targets: [] };

  // Filter out archive files from lint validation for ticket create operations
  // Archive files' format issues should not block new ticket creation
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

  const absPath = resolve(opts.cwd, rawTicketPath);
  if (!existsSync(absPath)) {
    throw new Error(`ticket path not found: ${rawTicketPath}`);
  }

  const ticketRepoRoot = findTicketRepoRootFromPath(absPath);
  if (!ticketRepoRoot) {
    throw new Error(`ticket path is not inside ${DEUK_ROOT_DIR}/${TICKET_SUBDIR}: ${rawTicketPath}`);
  }

  const { meta } = parseFrontMatter(readFileSync(absPath, "utf8"));
  const ticketSelector = meta.id || basename(absPath).replace(/\.md$/i, "");
  if (!ticketSelector) {
    throw new Error(`ticket path has no id frontmatter: ${rawTicketPath}`);
  }

  opts.cwd = ticketRepoRoot;
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
  const candidates = loadWorkspaceCandidates(opts.invocationCwd || opts.cwd);
  if (!candidates?.workspaces?.length) return opts;

  const currentRoot = resolve(opts.cwd);
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
      opts.cwd = flowWorkspace.path;
      opts.workspace = flowWorkspace.id;
    }
    return opts;
  }
  if (matches.length > 1) {
    throw new Error(`ticket workspace target is ambiguous from prompt: ${formatWorkspaceCandidates(matches)}. Re-run with --workspace <name>.`);
  }

  opts.cwd = matches[0].path;
  opts.workspace = matches[0].id;
  return opts;
}

function applyTicketWorkspaceDispatch(opts: CliOpts = {}) {
  const explicitQuery = opts.workspace || "";

  // #652: registry-only. The workspace is resolved from the home registry candidates
  // (or the session cookie), NEVER from a cwd-basename match — that old fallback let
  // any cwd whose folder name resembled the query masquerade as a registered
  // workspace and was a ghost factory.
  const candidates = loadWorkspaceCandidates("", { homeDir: opts.homeDir });

  // No explicit --workspace: try the session cookie (registry-backed). If that also
  // resolves nothing, leave opts.cwd as-is — callers that genuinely need a workspace
  // will fail later with a clear "workspace not found", never silently inferring one
  // from cwd.
  if (!explicitQuery) {
    if (opts.sessionId && candidates && candidates.workspaces.length > 0) {
      const cookieRes = resolveWorkspaceTarget("", "", { candidates, sessionId: opts.sessionId, homeDir: opts.homeDir });
      if (cookieRes?.target) {
        opts.cwd = cookieRes.target.path;
        opts.workspace = cookieRes.target.id;
      }
    }
    return opts;
  }

  if (!candidates || candidates.workspaces.length === 0) {
    throw new Error(`ticket workspace target not found: ${explicitQuery} (no workspaces registered — run \`deuk-agent-flow init\` in the workspace first)`);
  }

  const resolution = resolveWorkspaceTarget("", explicitQuery, { candidates, sessionId: opts.sessionId, homeDir: opts.homeDir });

  if (resolution?.reason === "ambiguous") {
    throw new Error(`ticket workspace target is ambiguous: ${formatWorkspaceCandidates(resolution.matches)}`);
  }

  if (resolution?.target) {
    opts.cwd = resolution.target.path;
    opts.workspace = resolution.target.id;
    return opts;
  }

  throw new Error(`ticket workspace target not found: ${explicitQuery}`);

}

function applyTicketRootContext(opts: CliOpts = {}, options: Record<string, any> = {}) {
  if (!opts.hostWorkspaceContext) {
    opts.hostWorkspaceContext = resolveWorkspaceContext(opts.cwd);
  }
  applyTicketWorkspaceDispatch(opts);
  const root = resolveConsumerTicketRoot(opts.cwd, options);
  if (root) opts.cwd = root;
  opts.workspaceContext = resolveWorkspaceContext(opts.cwd);
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

function collectTicketTransitionValidationDocMeta(cwd, absPath, meta: Record<string, any> = {}, content = "", opts: CliOpts = {}, targetState = "") {
  const phase1Reasons = content
    ? getPhase1PlanBodyReasons(normalizePhase1PlanBodyHeadings(content || ""))
    : getPhase1IncompleteReasons(cwd, absPath);
  const closeReasons = getCloseWorkflowReasons(meta, content);
  // phase2→phase3: executionEvidence is satisfied by phase2 execution slots or plan content.
  // Other transitions (phase3→end, phase4→end) still require close workflow sections.
  const executionEvidenceOk = targetState === "phase3"
    ? hasPhase2ExecutionEvidence(content)
    : closeReasons.length === 0;
  const slotValues = {
    phase1Plan: phase1Reasons.length === 0,
    userApproval: hasExplicitExecutionApproval(opts),
    executionEvidence: executionEvidenceOk,
    verificationEvidence: closeReasons.length === 0 || Boolean(opts.reason || opts.verificationEvidence),
    debuggingDecision: Boolean(opts.debuggingDecision || opts.reason || targetState !== "phase2"),
    completionEvidence: closeReasons.length === 0 || Boolean(opts.reason || opts.completionEvidence),
    reopenDecision: Boolean(opts.reopenDecision || opts.reason || targetState !== "phase1")
  };
  const executionEvidenceErrors = targetState === "phase3" && !executionEvidenceOk
    ? ["phase2_execution_slots_empty"]
    : closeReasons;
  const slotSourceMap = {
    phase1Plan: { source: toRepoRelativePath(cwd, absPath), errors: phase1Reasons },
    userApproval: { source: "--approval approved | --workflow execute" },
    executionEvidence: { source: "ticket workflow sections (phase2 execution slots or Analysis)", errors: executionEvidenceErrors },
    verificationEvidence: { source: "ticket workflow sections", errors: closeReasons },
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
  return renderTicketWorkflowGateFailure({ ticketId, workspace: basename(String(cwd || "")), docmeta, reasons });
}

function getTicketWorkflowTransitionEvidence(cwd, absPath, meta: Record<string, any> = {}, content = "", opts: CliOpts = {}, targetState = "") {
  return collectTicketTransitionValidationDocMeta(cwd, absPath, meta, content, opts, targetState).slots;
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
    && !Object.prototype.hasOwnProperty.call(opts, "workflow")
    && !Object.prototype.hasOwnProperty.call(opts, "approval")
    && !Object.prototype.hasOwnProperty.call(opts, "approvalState")) {
    return false;
  }
  return normalizeWorkflowMode(opts.workflowMode ?? opts.workflow ?? opts.approval ?? opts.approvalState) === WORKFLOW_MODE_EXECUTE;
}

function getTicketWorkflowProvenanceReasons(entry, meta: Record<string, any> = {}) {
  const reasons = [];
  if (!entry || String(entry.status || "").toLowerCase() === "archived") return reasons;
  if (!isExecutionTicketStatus(entry.status || meta.status || "open")) return reasons;

  const workflowSource = String(meta.workflowSource || meta.ticketWorkflowSource || "").trim();
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
  // The single focused ticket (activeTicketId) renders as ACTIVE; all other live
  // tickets render by their lifecycle status (OPEN). "active" is no longer a status.
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

function buildUseNoMatchError(ticketId, candidates) {
  const lines = [
    `No matching ticket found for "${ticketId || ""}".`,
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
    // Non-ASCII or otherwise unsluggable titles are not duplicate keys.
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
    throw new Error("ticket archive: file not found " + resolvedRelPath);
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
    throw new Error("ticket archive: destination already exists " + toRepoRelativePath(cwd, targetAbsPath));
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

  if (!opts.skipProjectMemoryUpdate) {
    try {
      const body = originalBody !== null ? originalBody : readFileSync(absPath, "utf8");
      const { meta, content: bodyContent } = parseFrontMatter(body);
      const ticketSections = extractMarkdownSections(bodyContent, ["Direction", "Improvement Direction", "Design Decisions", "Completion Report"]);
      updateProjectMemoryFromTicket(cwd, found.id, meta, ticketSections);
    } catch (err) {
      console.warn(`[WARNING] project-memory update failed for ${found.id}: ${err.message}`);
    }
  }
  if (!isCompactTicketOutput(opts) && !opts.quietAutoArchive) {
    console.log(`ticket archive: ${moveToArchiveStorage ? "moved ticket to" : "marked ticket archived in place"} ${toWsRelativePath(opts.cwd, targetAbsPath)}`);
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
  // #080: ticket-root-relative paths use "archive/"; the deuk-root/tickets prefix
  // only appears on legacy in-workspace paths. Posix "/" is fixed (relPath is posix).
  return relPath.startsWith("archive/") || relPath.startsWith(`${DEUK_ROOT_DIR}/${TICKET_SUBDIR}/archive/`);
}

function isArchiveSweepCandidate(entry, excludeTicketId) {
  // Never sweep the ticket currently being processed (excludeTicketId). This is
  // not an "active marker" — it is just the in-flight ticket of the current
  // command. Only already-archived or completed (phase >= 4) tickets are swept.
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
  // #694: CLI 자체 메시지는 에이전트 노드 신호를 흐리는 노이즈 — compact(에이전트
  // non-interactive) 출력에선 내지 않는다.
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
  if (!opts.title && !opts.summary && !opts.ref) {
    console.log(buildTicketCreateGuide(opts));
    return;
  }
  const inferred = opts.ref ? inferRefTitleAndTopic(opts) : null;
  const title = opts.title || inferred?.title || opts.summary || "ticket";
  const titleSlug = requireNonEmptySlug(opts.title || inferred?.slug || title, "ticket title");
  const group = toSlug(opts.group || "main");

  await ensurePhase0Validation(opts);

  let path, source;
  if (opts.ref) {
    path = resolveReferencedTicketPath(opts);
    source = "ticket-reference";
  } else {
    // Create in the resolved ticket workspace.
    const ticketDir = detectConsumerTicketDir(opts.cwd, { createIfMissing: true });
    if (!ticketDir) {
      throw new Error("ticket create requires an AgentFlow-managed directory with .deuk. Run init or choose a managed sibling workspace.");
    }

    let parsedPlan = null;
    let finalTitle = title;
    let finalTitleSlug = titleSlug;
    
    if (typeof opts.planBody === "string" && opts.planBody.trim()) {
      parsedPlan = parsePlan("inline-plan-body.md", normalizePhase1PlanBodyHeadings(opts.planBody));

      finalTitle = opts.title || parsedPlan.title || title;
      finalTitleSlug = requireNonEmptySlug(finalTitle, "ticket title");
    }

    const indexJson = loadTicketIndex(opts);
    const reusableTicket = findReusableCompletedTicket(indexJson, finalTitleSlug, opts);
    if (reusableTicket) {
      throw new Error(buildReusableTicketCreateError(reusableTicket, finalTitleSlug));
    }

    // Smart close: check previous active ticket's completion state before deciding
    const activeId = indexJson.activeTicketId;
    if (activeId) {
      const activeEntry = indexJson.entries.find(e => e.id === activeId && (e.status === "open" || e.status === "active"));
      if (activeEntry) {
        const activeDoc = readTicketDocument(opts.cwd, activeEntry, { action: "ticket create", requireExists: false });
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
            // Sync to frontmatter
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
            const ticketDir = detectConsumerTicketDir(opts.cwd);
            try {
              archiveTicketEntry({
                cwd: opts.cwd,
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




    const ticketId = generateTicketId(finalTitleSlug, indexJson);
    const finalFileName = `${ticketId}.md`;

    const abs = makePath(ticketDir, group, finalFileName);
    if (!opts.dryRun) mkdirSync(makePath(ticketDir, group), { recursive: true });
    path = toWsRelativePath(opts.cwd, abs);

    let prevTicketEntry = null;
    if (opts.chain) {
      prevTicketEntry = pickTicketEntry({ latest: true }, indexJson);
    }
    const mainTicket = group === "sub"
      ? resolveMainTicketForSubTicket(indexJson, opts, prevTicketEntry)
      : undefined;
    if (group === "sub" && !mainTicket) {
      throw new Error("ticket create: sub tickets require --parent/--main-ticket or an existing main ticket to track.");
    }

    const summary = (opts.summary || parsedPlan?.summary || finalTitle || "ticket").trim();

    const promptText = [summary, finalTitle, parsedPlan?.body].filter(Boolean).join("\n");
    const docsLanguage = resolveTicketDocsLanguage(opts.cwd, opts.docsLanguage, promptText);

    const rawMeta = {
      id: ticketId,
      title: finalTitle,
      breadcrumb: opts.workspaceContext?.breadcrumb || resolveWorkspaceContext(opts.cwd).breadcrumb,
      phase: 1,
      status: "open",
      workflowSource: "ticket-create",
      submodule: opts.submodule,
      project: opts.project === "global" ? undefined : opts.project,
      docsLanguage,
      evidence: opts.evidence,
      mainTicket,
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
    let finalDocument = null;
    if (parsedPlan) {
      const planReasons = getPhase1PlanBodyReasons(parsedPlan.body, { title: finalTitle });
      if (planReasons.length > 0) {
        throw new Error(buildPlanBodyRequiredError(planReasons, opts));
      }
      const ticketBody = injectTicketContent(parsedPlan.body, opts.content, docsLanguage);
      const docmeta = collectTicketTransitionValidationDocMeta(opts.cwd, abs, meta, ticketBody, {}, "phase2");
      const frontmatterMeta = sanitizeFrontMatterMeta({
        ...meta,
        ...buildDocMetaFrontmatterSummary(docmeta)
      });
      finalDocument = {
        meta: frontmatterMeta,
        content: ticketBody,
        docmeta
      };
    } else {
      throw new Error(buildPlanBodyRequiredError(["plan_body_file_required"], opts));
    }

    let rollbackIndexJson = indexJson;

    if (!opts.dryRun) writeTicketDocument(abs, finalDocument);
    source = "ticket-create";

    try {
      if (!opts.dryRun) {
        runTicketWorkflowQualityGate(opts.cwd, {
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

      appendTicketEntry(opts.cwd, {
        id: ticketId,
        title: finalTitle, group, project: opts.project || "global",
        mainTicket,
        createdAt: new Date().toISOString(), path, source
      }, opts);

      let autoCleanupFailed = null;
      const limitIndexJson = loadTicketIndex(opts);
      try {
        autoArchiveOpenLimitTickets(opts.cwd, limitIndexJson, opts);
      } catch (err) {
        autoCleanupFailed = err;
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

    if (!isCompactTicketOutput(opts)) {
      console.log(`${opts.dryRun ? "Ticket would be created" : "Ticket created"}: ${toWsRelativePath(opts.cwd, abs)}`);
    }
    const approvalSurfaceOpts = {
      ...opts,
      docsLanguage,
      runtimeContext: buildTicketRuntimeContext(ticketId, abs, {
        phase: 1,
        status: "open",
        summary
      }, {
        cwd: opts.cwd,
        summary,
        nextAction: "user-review"
      })
    };
    printPendingApprovalSurface(ticketId, abs, approvalSurfaceOpts);
    if (!opts.dryRun) {
      printCreateApprovalGate(ticketId, opts, summary);
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
  const index = readTicketIndexJson(opts.cwd);
  syncActiveTicketId(opts.cwd);
  let rows = index.entries;

  
  if (opts.active) {
    // "active" means every live ticket (open, pre-completion), not a single
    // focus marker. There can be zero, one, or many.
    rows = rows.filter(e => isLiveTicketEntry(e));
  } else if (opts.archived) {
    rows = rows.filter(e => e.status === "archived");
  } else if (!opts.all) {
    // Default: live tickets (open; "active" kept for legacy on-disk files)
    rows = rows.filter(e => e.status === "open" || e.status === "active");
  }
  
  if (opts.group) rows = rows.filter(e => e.group === opts.group);
  if (opts.project) rows = rows.filter(e => e.project === opts.project);
  if (opts.submodule) rows = rows.filter(e => e.submodule === opts.submodule);
  
  if (opts.json) {
    // With --print-content, attach each ticket's body so consumers (e.g. the
    // VSCode extension) get the content straight from the CLI and never resolve
    // ticket-home / read files themselves. The CLI ran in its own environment
    // (Windows/Linux) so it reads from the correct home regardless of caller.
    const payloadRows = opts.printContent
      ? rows.map(e => {
          let content = "";
          try {
            const doc = readTicketDocument(opts.cwd, e, { action: "ticket list", requireExists: false });
            content = doc.exists ? doc.content : "";
          } catch { /* missing/corrupt ticket → empty body */ }
          return { ...e, content };
        })
      : rows;
    // #756: --with-total wraps the (filtered) rows with the workspace-wide total
    // ticket count (all statuses incl. archived) so the VS Code panel can show
    // "open / total" without a second, heavy archive-loading call. INDEX.json
    // already holds every entry, so this is just index.entries.length — no readdir.
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
  const found = pickTicketEntry(opts, index);
  if (!found) {
    // No live (open, phase < 4) ticket is in focus. Do NOT surface an archived or
    // completed ticket as if it were active. When the user named a specific ticket
    // that wasn't found, that's an error; otherwise there simply is no active
    // ticket — list the live tickets (zero or more) so the surface is honest.
    const ticketSelector = opts.ticketId || (!opts.summary && !opts.planBody && !opts.planBodyFile ? opts.title : "");
    if (ticketSelector) {
      throw new Error(`ticket status: no matching ticket found for '${ticketSelector}'`);
    }
    console.log("No active ticket (no open ticket before phase 4). Live tickets:");
    await runTicketList({ ...opts, active: false, archived: false, all: false });
    return;
  }

  const ticketDoc = readTicketDocument(opts.cwd, found, { action: "ticket status", requireExists: false });
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
  const incompleteReasons = requiresExecutionPlan ? getPhase1IncompleteReasons(opts.cwd, absPath) : [];
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

  // --status-detail is an explicit request for the full status/context block;
  // honor it even under --non-interactive (which otherwise implies compact).
  if (isCompactTicketOutput(opts) && !opts.statusDetail) {
    const reasonText = out.reasons.length === 0 ? "ok" : out.reasons.join(", ");
    printTicketStatusFlowLine(out.id, absPath, out.phase, { ...opts, docsLanguage: parsed.meta.docsLanguage });
    console.log(`${out.id} | phase=${out.phase} | status=${out.status} | ${reasonText}`);
    printUsageReminder(opts.cwd, opts);
    return;
  }

  console.log(`Ticket: ${out.id}`);
  console.log(`Status: ${out.status}`);
  console.log(`Phase: ${out.phase}`);
  console.log(`Path: ${out.path}`);
  const runtimeContext = buildTicketRuntimeContext(out.id, absPath, parsed.meta, {
    cwd: opts.cwd,
    hostWorkspaceLabel: opts.hostWorkspaceContext?.breadcrumb,
    status: out.status,
    phase: out.phase,
    summary: out.summary,
    reasons: out.reasons,
    nextAction: out.phase >= 4 || out.status === "closed" || out.status === "archived" ? "terminal-review-or-archive" : "follow-state-prompt"
  });
  printTicketStatusFlowLine(out.id, absPath, out.phase, { ...opts, docsLanguage: parsed.meta.docsLanguage, runtimeContext });
  if (opts.statusDetail || out.reasons.length > 0) {
    if (out.reasons.length === 0) console.log("Reasons: none");
    else console.log(`Reasons: ${out.reasons.join(", ")}`);
  }
  printUsageReminder(opts.cwd, opts);
}

export async function runTicketGuard(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (hasExplicitExecutionApproval(opts)) {
    opts.quietAutoArchive = true;
  }
  if (!opts.ticketId && !opts.latest) {
    throw new Error("ticket guard: --id or --latest is required before set_workflow_context.");
  }

  const index = loadTicketIndex(opts);
  const found = pickTicketEntry(opts, index);
  if (!found) {
    throw new Error("ticket guard: no matching durable ticket found; do not call set_workflow_context.");
  }

  const ticketDoc = readTicketDocument(opts.cwd, found, { action: "ticket guard", requireExists: false });
  if (!ticketDoc.exists) {
    throw new Error(`ticket guard: durable ticket file missing for ${found.id}; do not call set_workflow_context.`);
  }
  const { meta: parsedMeta, content } = ticketDoc;
  const absPath = ticketDoc.absPath;
  assertTicketWorkflowProvenance(found, parsedMeta);
  const workflowStatus = deriveTicketWorkflowStatus(parsedMeta, found.status || "open");
  const phase = Number(parsedMeta.phase || 1);
  if (phase >= 4 || isTerminalTicketStatus(workflowStatus)) {
    throw new Error(`[TICKET WORKFLOW BLOCKED] ticket guard blocked ${found.id}: terminal ticket cannot open execution context. status=${workflowStatus}, phase=${phase}. Reopen with ticket move only after an explicit reopen decision.`);
  }
  assertTicketWorkflowAction(parsedMeta, {
    fallbackStatus: found.status || "open",
    action: "guard"
  });

  if (phase === 1) {
    try {
      resolveTicketWorkflowCommandTransition(opts.cwd, found, absPath, parsedMeta, content, opts, {
        action: "guard",
        toState: "phase2"
      });
    } catch (err) {
      const reasonText = String(err.message || "");
      if (reasonText.includes("user_approval_missing")
        || reasonText.includes("phase1_plan_incomplete")) {
        const reasons = reasonText.split(":").pop().split(",").map(value => value.trim()).filter(Boolean);
        throw new Error(formatTicketWorkflowGateFailure(opts.cwd, absPath, found, parsedMeta, content, opts, "phase2", reasons));
      }
      throw err;
    }
  }

  runBestEffortArchiveMoveSweep(opts.cwd, index, found.id, opts);

  let finalPhase = phase;
  let finalStatus = deriveTicketWorkflowStatus(parsedMeta, found.status || "open");
  const out: Record<string, any> = {
    id: found.id,
    ticketId: found.id,
    phase: finalPhase,
    status: finalStatus,
    path: toWsRelativePath(opts.cwd, absPath)
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
  if (!current) throw new Error("ticket handoff: no matching ticket found");

  const currentDoc = readTicketDocument(opts.cwd, current, { action: "ticket handoff", requireExists: false });
  const currentAbs = currentDoc.absPath;
  const currentMissing = !currentDoc.exists;
  const currentParsed = currentMissing ? { meta: {}, content: "" } : { meta: currentDoc.meta, content: currentDoc.content };
  const currentPhase = Number(currentParsed.meta.phase || 1);
  const currentReasons = currentMissing ? ["ticket_file_missing"] : getPhase1IncompleteReasons(opts.cwd, currentAbs);
  const currentStatus = currentReasons.length > 0 && currentPhase === 1
    ? "phase1_incomplete"
    : (currentParsed.meta.status || current.status || "open");

  const rows = filterTicketEntries(index.entries, opts)
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  // Prefer the focus pointer (activeTicketId) if it isn't the current ticket,
  // then any other live ticket. "active" status is legacy-only.
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
  const index = loadTicketIndex(opts);
  const found = pickTicketEntry(opts, index);
  if (!found) throw new Error("ticket meta: no matching ticket found");

  if (opts.json) {
    console.log(JSON.stringify(found, null, 2));
  } else {
    console.log(`Ticket Meta [${found.id}]`);
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

  const index = loadTicketIndex(opts);
  const target = pickTicketEntry(opts, index);
  if (!target) {
    throw new Error("ticket evidence: no matching ticket found.");
  }

  const { absPath, meta, content } = readTicketDocument(opts.cwd, target, { action: "ticket evidence", requireExists: true });
  const result = getClaimEvidenceResult(target, meta, content, opts.claim);
  const implementationGuard = Array.isArray(opts.changedFiles)
    ? getImplementationClaimGuardResult(opts.cwd, { claim: opts.claim, content, changedFiles: opts.changedFiles })
    : { ok: true, reasons: [] };

  if (!result.ok || !implementationGuard.ok) {
    const reasons = [...result.reasons, ...(implementationGuard.reasons || [])];
    throw new Error(`[VALIDATION FAILED] Ticket ${target.id} has insufficient evidence coverage for claim "${opts.claim}": ${reasons.join(", ")}.`);
  }

  if (opts.json) {
    console.log(JSON.stringify(result.docmeta, null, 2));
  } else {
    console.log(`[evidence-ok] ${target.id} ${result.docmeta.validation.status} claim coverage ${result.coveredTerms}/${result.claimTerms}`);
  }
}

export async function runTicketEvidenceReport(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (!opts.claim || !String(opts.claim).trim()) {
    throw new Error("ticket report requires --claim <text> when generating a claim-bound report.");
  }

  const index = loadTicketIndex(opts);
  const target = pickTicketEntry(opts, index);
  if (!target) {
    throw new Error("ticket report: no matching ticket found.");
  }

  const { absPath, meta, content } = readTicketDocument(opts.cwd, target, { action: "ticket report", requireExists: true });
  const result = getClaimEvidenceResult(target, meta, content, opts.claim);
  const implementationGuard = Array.isArray(opts.changedFiles)
    ? getImplementationClaimGuardResult(opts.cwd, { claim: opts.claim, content, changedFiles: opts.changedFiles })
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
  if (!opts.ticketId && !opts.latest) {
    if (opts.nonInteractive || !process.stdout.isTTY) {
      opts.latest = true;
    } else {
      await withReadline(async (rl) => {
        const index = loadTicketIndex(opts);
        const choices = index.entries
          .filter(e => e.status !== "closed" && e.status !== "cancelled")
          .map(e => ({ label: `[${e.group}] ${e.title}`, value: e.id }));
        if (choices.length > 0) {
          opts.ticketId = await selectOne(rl, "Choose a ticket to close:", choices);
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

  const { absPath: abs, meta: closeMeta, body: previousBody, content: closeContent } = readTicketDocument(opts.cwd, targetEntry, { action: "ticket close", requireExists: true });
  const parsedForClose = { meta: closeMeta, content: closeContent };
  try {
    resolveTicketWorkflowCommandTransition(opts.cwd, targetEntry, abs, closeMeta, closeContent, opts, {
      action: "close",
      toState: "end"
    });
  } catch (err) {
    if (String(err.message).includes("TICKET WORKFLOW BLOCKED")) {
      throw new Error(
        `${err.message}\n` +
        `Hint: "close" is not allowed in the current state. ` +
        `Use "ticket move --to end" to transition, or "ticket discard --id ${targetEntry.id} --workspace ${opts.workspace || ""} --non-interactive" to abandon.`
      );
    }
    throw err;
  }
  const closePlanningReasons = getCloseWorkflowReasons(parsedForClose.meta, parsedForClose.content);
  if (closePlanningReasons.length) {
    throw new Error(`[VALIDATION FAILED] Ticket ${targetEntry.id} cannot close without complete main-ticket analysis/design evidence: ${[...new Set(closePlanningReasons)].join(", ")}.`);
  }

  try {
    const entry = updateTicketEntryStatus(opts.cwd, opts);
    runTicketWorkflowQualityGate(opts.cwd, {
      ticketAbsPath: abs,
      context: `ticket close ${entry.id}`
    });

    if (String(opts.status || "").toLowerCase() === "closed") {
      syncActiveTicketId(opts.cwd);
    }

    const finalPath = computeTicketPath(entry);
    const finalAbsPath = makePath(opts.cwd, finalPath);
    appendTelemetryEvent(opts.cwd, {
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
          cwd: opts.cwd,
          hostWorkspaceLabel: opts.hostWorkspaceContext?.breadcrumb,
          summary: closeMeta.summary,
          nextAction: "final-response-only"
        })
      });
    } else {
      console.log(formatTicketStatusLine(normalizedStatus, entry.id, finalAbsPath));
    }
    return { status: opts.status, ticket: entry.id, path: finalPath };
  } catch (err) {
    rollbackTicketWorkflowArtifacts(opts.cwd, previousIndex, previousBody, abs, opts);
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
    if (opts.nonInteractive) {
      throw new Error("ticket use: --id or --latest is required in non-interactive mode.");
    }
    await withReadline(async (rl) => {
      const choices = scopedEntries
        .map(e => ({ label: `${e.status === 'closed' ? '✓ ' : ''}[${e.group}] ${e.title}`, value: e.id }));
      if (choices.length > 0) {
        targetTicketId = await selectOne(rl, "Choose a ticket to use:", choices);
      }
    });
  }

  const found = opts.latest ? scopedEntries[0] : scopedEntries.find(e =>
    String(e.id || "").includes(targetTicketId)
  );
  if (!found) {
    const candidates = buildUseFallbackCandidates(index, opts);
    if (!opts.nonInteractive && candidates.length > 0) {
      await withReadline(async (rl) => {
        targetTicketId = await selectOne(
          rl,
          `No matching ticket found for "${targetTicketId}". Choose a ticket to use:`,
          candidates.map(e => ({ label: formatTicketChoice(e), value: e.id }))
        );
      });
      const selected = index.entries.find(e => e.id === targetTicketId);
      if (selected) {
        opts.ticketId = targetTicketId;
        return runTicketUse({ ...opts, latest: false });
      }
    }
    throw new Error(buildUseNoMatchError(targetTicketId, candidates));
  }

  const foundDoc = readTicketDocument(opts.cwd, found, { action: "ticket use", requireExists: true });
  assertTicketWorkflowProvenance(found, foundDoc.meta);
  assertTicketWorkflowAction(foundDoc.meta, {
    fallbackStatus: found.status || "open",
    action: "use"
  });
  
  // #685: LangGraph 모델 — 현재 노드는 .md phase가 SSOT다. 세션별 claim/쿠키로
  // "누가 이 티켓을 잡았나"를 추적하는 레이어는 제거됨(단일 사용자, env 미전파 환경에서
  // 폴백으로 무너지는 근원). ticket use는 노드 컨텍스트를 로드만 하며 아무 상태도 쓰지 않는다.

  const absPath = toPosixPath(foundDoc.absPath);
  if (opts.pathOnly) {
    printTicketSelectionLine(found.id, absPath, { ...opts, docsLanguage: foundDoc.meta.docsLanguage });
    return;
  }
  printTicketSelectionLine(found.id, absPath, { ...opts, docsLanguage: foundDoc.meta.docsLanguage });
  printTicketUseNextSteps(found, foundDoc, opts);
  if (opts.printContent && !isCompactTicketOutput(opts)) console.log("\n" + readFileSync(foundDoc.absPath, "utf8"));
}



function extractMarkdownSections(content, sectionNames) {
  const sections: Record<string, any> = {};
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

// #727: knowledge distill 제거 — knowledge는 cwd(.deuk/knowledge)에 쓰던 의미없는 레거시
// 기록이다(언니 지시). 티켓 archive 시 cwd write가 발생하지 않도록 기능을 통째로 제거. no-op.

// #685: project-memory.md 자동 갱신 제거 — project-memory는 진행 상태를 담던 무의미한
// 레이어다(언니 지시). 티켓 close 시 결정/마일스톤을 자동으로 박지 않는다. no-op.
function updateProjectMemoryFromTicket(cwd, ticketId, meta, ticketSections) {
  return;
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
  const ticketSelector = opts.ticketId || (!opts.summary && !opts.planBody && !opts.planBodyFile ? opts.title : "");
  if (ticketSelector) {
    const key = String(ticketSelector).toLowerCase();
    const localMatch = selectTicketEntryBySelector(rows, key);
    if (localMatch) return localMatch;

    if (opts.ticketId) {
      const durableLocalMatch = findTicketEntryInWorkspaceBySelector(opts.cwd, key, opts);
      if (durableLocalMatch) return durableLocalMatch;

      const siblingMatch = findSiblingTicketEntryBySelector(opts, key);
      if (siblingMatch) return siblingMatch;
    }
    return null;
  }
  if (rows.length === 0) return null;
  // No explicit selector: there is no artificial "active" focus pointer anymore.
  // A ticket is "active" iff it is open and pre-completion (phase < 4). Return the
  // most recently created such live ticket; if none are live, return null instead
  // of silently surfacing an archived/completed ticket as if it were active.
  const live = rows.filter(e => isLiveTicketEntry(e));
  return live[0] || null;
}

// A live ticket is open (not archived/closed) and has not reached the completion
// phase. This is the sole definition of "active" — there is no separate marker.
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
    throw new Error(`ticket guard: ticket id is ambiguous in workspace ${cwd}: ${matches.map(match => match.id).join(", ")}`);
  }
  return matches[0];
}

function findSiblingTicketEntryBySelector(opts, selector) {
  const candidates = loadWorkspaceCandidates(opts.invocationCwd || opts.cwd);
  if (!candidates || !Array.isArray(candidates.workspaces) || candidates.workspaces.length === 0) return null;

  const matches = [];
  const currentRoot = resolve(opts.cwd);
  for (const workspace of candidates.workspaces) {
    const workspaceRoot = resolve(workspace.path);
    if (workspaceRoot === currentRoot) continue;
    // The home ticket store is not a sibling workspace — skip it so tickets that
    // physically live under ~/.deuk-agent/tickets/<key> aren't double-counted (#623).
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
    throw new Error(`ticket guard: ticket id is ambiguous across sibling workspaces: ${matches.map(match => `${match.entry.id} @ ${match.workspace}`).join(", ")}`);
  }

  opts.cwd = matches[0].workspace;
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
  const ticketDir = detectConsumerTicketDir(opts.cwd);

  if (!opts.latest && !opts.ticketId) {
    if (opts.nonInteractive) {
      throw new Error("ticket archive: --id or --latest is required in non-interactive mode.");
    }
    await withReadline(async (rl) => {
      const choices = indexJson.entries
        .filter(e => e.status !== "archived")
        .map(e => ({ label: `[${e.group}] ${e.title}`, value: e.id }));
      if (choices.length > 0) {
        opts.ticketId = await selectOne(rl, "Choose a ticket to archive:", choices);
      } else {
        throw new Error("No active tickets found to archive.");
      }
    });
  }
  
  const found = pickTicketEntry(opts, indexJson);
  if (!found) throw new Error("ticket archive: no matching entry");
  const archiveDoc = readTicketDocument(opts.cwd, found, { action: "ticket archive", requireExists: true });
  assertTicketWorkflowAction(archiveDoc.meta, {
    fallbackStatus: found.status || "open",
    action: "archive"
  });

  const fileName = (found.path || computeTicketPath(found)).split(/[/\\]/).pop();
  const result = archiveTicketEntry({ cwd: opts.cwd, ticketDir, indexJson, found, opts });
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
  const indexJson = loadTicketIndex(opts);

  if (!opts.latest && !opts.ticketId) {
    if (opts.nonInteractive) {
      throw new Error("ticket discard: --id or --latest is required in non-interactive mode.");
    }
    await withReadline(async (rl) => {
      const choices = indexJson.entries
        .filter(e => e.status === "open")
        .map(e => ({ label: `[${e.group}] ${e.title}`, value: e.id }));
      if (choices.length > 0) {
        opts.ticketId = await selectOne(rl, "Choose an unapproved ticket to discard:", choices);
      } else {
        throw new Error("No open tickets found to discard.");
      }
    });
  }

  let found = pickTicketEntry(opts, indexJson);
  // INDEX 미등록이어도 --id로 직접 파일을 찾아 폐기한다.
  let absPath;
  if (!found && opts.ticketId) {
    const ticketId = String(opts.ticketId);
    const ticketsRoot = detectConsumerTicketDir(opts.cwd);
    const groups = ticketsRoot && existsSync(ticketsRoot) ? readdirSync(ticketsRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) : [];
    for (const group of groups) {
      const candidate = join(ticketsRoot, group, `${ticketId}.md`);
      if (existsSync(candidate)) { absPath = candidate; break; }
      // partial match (id prefix in filename)
      if (!absPath && existsSync(ticketsRoot)) {
        const files = readdirSync(join(ticketsRoot, group)).filter(f => f.startsWith(ticketId) && f.endsWith(".md"));
        if (files.length === 1) { absPath = join(ticketsRoot, group, files[0]); break; }
      }
    }
    if (!absPath) throw new Error(`ticket discard: no matching entry for '${ticketId}'`);
    found = { id: ticketId, status: "open" };
  } else if (!found) {
    throw new Error("ticket discard: no matching entry");
  } else {
    absPath = resolveTicketEntryOrComputedPath(opts.cwd, found);
  }

  const relativePath = toRepoRelativePath(opts.cwd, absPath);
  if (!existsSync(absPath)) throw new Error("Ticket file not found: " + relativePath);

  const body = readFileSync(absPath, "utf8");
  const { meta } = parseFrontMatter(body);
  assertTicketWorkflowAction(meta, {
    fallbackStatus: found.status || "open",
    action: "discard"
  });
  const phase = Number(meta.phase || 1);
  const status = String(meta.status || found.status || "open").toLowerCase();
  if (phase >= 2 || (status !== "open" && status !== "approval_required")) {
    throw new Error(`ticket discard: ${found.id} is not an unapproved Phase 1 ticket. Use ticket close/archive for approved or executed work.`);
  }

  if (opts.dryRun) {
    console.log(`ticket discard: would delete ${found.id} (${relativePath})`);
    return { id: found.id, path: relativePath, discarded: false };
  }

  rmSync(absPath, { force: true });
  const nextEntries = (indexJson.entries || []).filter(entry => entry.id !== found.id);
  writeTicketIndexJson(opts.cwd, {
    ...indexJson,
    entries: nextEntries
  }, opts);
  syncActiveTicketId(opts.cwd);
  appendTelemetryEvent(opts.cwd, {
    event: "ticket_discarded",
    action: "ticket-discard",
    ticket: found.id,
    file: relativePath,
    phase,
    status: "discarded"
  });
  console.log(`ticket: discarded -> ${found.id}`);
  return { id: found.id, path: relativePath, discarded: true };
}

// #727: ticket reports / report attach 제거 — report는 cwd(.deuk/docs/plan)에 쓰던
// 의미없는 레거시 기록이다(언니 지시). cwd write를 없애기 위해 두 명령을 통째로 제거.

export async function runTicketSanitize(opts) {
  applyTicketRootContext(opts);
  const dir = detectConsumerTicketDir(opts.cwd);
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
    console.log(`[SANITIZE] ${toRepoRelativePath(opts.cwd, absPath)}`);
    fixed++;
  }
  console.log(`Done: ${fixed} fixed, ${skipped} already clean.`);
}

// A ticket file is "broken" when its leading frontmatter is a migration stub:
// id/title/summary all equal the filename slug and it carries `tags: migrated`,
// typically followed by a second frontmatter block holding the real ticket. Such
// archive copies are migration artifacts, never the source of truth.
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

// A live ticket is a trustworthy source of truth when its leading frontmatter is
// clean: a single frontmatter block (no double-doc) and a title that is NOT just
// the filename slug.
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

// `ticket doctor`: detect tickets whose same filename exists in both a live dir
// (main/sub) and an archive dir, and remove the redundant ARCHIVE copy — but only
// when the live copy is a trustworthy source of truth. Default is dry-run; pass
// --apply to actually delete. Never deletes when the live copy is missing/broken.
export async function runTicketDoctor(opts) {
  applyTicketRootContext(opts);
  const dir = detectConsumerTicketDir(opts.cwd);
  if (!dir) { console.log("No ticket directory found."); return; }

  const files = collectTicketMarkdownFiles(dir);
  // Group by filename; classify each path as live (not under archive/) or archived.
  const byName = new Map();
  for (const absPath of files) {
    const name = absPath.split(/[/\\]/).pop();
    const rel = toRepoRelativePath(opts.cwd, absPath);
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
      const archRel = toRepoRelativePath(opts.cwd, archAbs);
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

export async function runTicketMove(opts) {
  // #635/#633: --workspace alone no longer means "move to another workspace" — since
  // #633 every ticket command is expected to carry --workspace to SELECT the target
  // workspace. Only treat this as a cross-workspace move when the requested workspace
  // actually differs from the ticket's current one; otherwise fall through to the
  // normal phase move below. Detecting this requires resolving both cwds first.
  if (opts.workspace) {
    const sourceCwd = opts.cwd || process.cwd();
    applyTicketRootContext({ ...opts, workspace: undefined }, {});
    const sourceOpts = { ...opts, workspace: undefined };
    applyTicketRootContext(sourceOpts, {});
    applyTicketContext(sourceOpts);
    if (!sourceOpts.ticketId && !sourceOpts.latest) sourceOpts.latest = true;

    const targetOpts = { ...opts };
    applyTicketRootContext(targetOpts, {});
    // Same workspace → this is a phase move, not a relocation. Drop the workspace
    // hint and continue to the phase-move path instead of erroring out.
    if (targetOpts.cwd !== sourceOpts.cwd) {
      const sourceIndex = loadTicketIndex(sourceOpts);
      const sourceEntry = pickTicketEntry(sourceOpts, sourceIndex);
      if (!sourceEntry) throw new Error("No matching ticket found to move.");

      const { absPath: sourceAbs, meta: sourceMeta, content: sourceContent, docmeta: sourceDocMeta } = readTicketDocument(sourceOpts.cwd, sourceEntry, { action: "ticket move workspace", requireExists: true });
      const targetCwd = targetOpts.cwd;

    // breadcrumb 갱신
    const targetBreadcrumb = resolveWorkspaceContext(targetCwd).breadcrumb;
    sourceMeta.breadcrumb = targetBreadcrumb;

    // 대상 경로 계산 및 파일 복사
    const targetRelPath = computeTicketPath({ ...sourceEntry, fileName: (sourceEntry.path || computeTicketPath(sourceEntry)).split(/[/\\]/).pop() });
    const targetAbs = makePath(targetCwd, targetRelPath);
    mkdirSync(dirname(targetAbs), { recursive: true });
    const newBody = renderTicketDocument({ meta: sourceMeta, content: sourceContent, docmeta: sourceDocMeta });
    writeTicketMarkdownFile(targetAbs, newBody);

    // 소스 INDEX에서 제거
    const srcIndex = readTicketIndexJson(sourceOpts.cwd);
    srcIndex.entries = (srcIndex.entries || []).filter(e => e.id !== sourceEntry.id);
    writeTicketIndexJson(sourceOpts.cwd, srcIndex);
    rmSync(sourceAbs, { force: true });
    syncActiveTicketId(sourceOpts.cwd);

    // 대상 INDEX에 추가
    const dstIndex = readTicketIndexJson(targetCwd);
    dstIndex.entries = [...(dstIndex.entries || []), { ...sourceEntry, workspace: targetBreadcrumb }];
    writeTicketIndexJson(targetCwd, dstIndex);
    syncActiveTicketId(targetCwd);

      console.log(`ticket: moved workspace -> ${sourceEntry.id} (${sourceMeta.breadcrumb || targetBreadcrumb})`);
      appendTelemetryEvent(targetCwd, { event: "ticket_workspace_moved", action: "ticket-move-workspace", ticket: sourceEntry.id, from: sourceOpts.cwd, to: targetCwd });
      return;
    }
    // Same workspace: fall through to the phase-move path below. Resolve cwd from
    // the (already validated) workspace and drop the now-handled workspace hint.
    opts.cwd = targetOpts.cwd;
    opts.workspace = undefined;
  }

  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (!opts.ticketId && !opts.latest) {
    if (opts.nonInteractive) {
      throw new Error("ticket move: --id or --latest is required in non-interactive mode.");
    }
    opts.latest = true; // Default to latest
  }

  const index = loadTicketIndex(opts);
  const entry = pickTicketEntry(opts, index);

  if (!entry) throw new Error("No matching ticket found to move.");

  const { absPath: abs, meta: parsedMeta, content, docmeta: existingDocMeta } = readTicketDocument(opts.cwd, entry, { action: "ticket move", requireExists: true });

  const previousIndex = readTicketIndexJson(opts.cwd);
  const body = readFileSync(abs, "utf8");
  const currentPhase = Number(parsedMeta.phase || 1);
  const currentStatus = String(parsedMeta.status || entry.status || "open").toLowerCase();
  const requestedPhase = Number(opts.phase);
  // #635: if the user explicitly asked for a phase (--phase/--to) but it didn't
  // parse to a number, DO NOT silently advance to the next phase — that hides the
  // user's intent and moves the ticket the wrong way. Fail loudly instead.
  if (opts.phaseRequested && !Number.isFinite(requestedPhase)) {
    throw new Error(
      `ticket move: could not parse the requested phase from --phase/--to "${opts.phase}". ` +
      `Use a phase number, e.g. --phase 2 (or --to 2). Refusing to auto-advance.`
    );
  }
  let transition;
  try {
    transition = resolveTicketWorkflowCommandTransition(opts.cwd, entry, abs, parsedMeta, content, opts, {
      action: "move",
      phase: Number.isFinite(requestedPhase) ? requestedPhase : undefined,
      next: opts.next || !Number.isFinite(requestedPhase)
    });
  } catch (err) {
    const reasonText = String(err.message || "");
    if (currentPhase === 1 && (requestedPhase >= 2 || opts.next || !Number.isFinite(requestedPhase))) {
      const reasons = reasonText.split(":").pop().split(",").map(value => value.trim()).filter(Boolean);
      throw new Error(formatTicketWorkflowGateFailure(opts.cwd, abs, entry, parsedMeta, content, opts, "phase2", reasons));
    }
    throw err;
  }
  const nextPhase = transition.phase;
  const ticketFileName = (entry.path || computeTicketPath(entry)).split(/[/\\]/).pop();
  const reopenTargetRelPath = nextPhase <= 1
    ? computeTicketPath({
        ...entry,
        fileName: ticketFileName,
        status: "open",
        archiveYearMonth: undefined
      })
    : null;
  const reopenTargetAbsPath = reopenTargetRelPath ? makePath(opts.cwd, reopenTargetRelPath) : abs;

  if (currentPhase === 1 && nextPhase >= 2) {
    const reasons = getPhase1IncompleteReasons(opts.cwd, abs);
    if (reasons.length) {
      throw new Error(`[VALIDATION FAILED] Ticket ${entry.id} has incomplete Phase 1 planning evidence: ${reasons.join(", ")}. Fill substantive APC and compact plan content before moving to Phase 2.`);
    }
    if (!hasExplicitExecutionApproval(opts)) {
      throw new Error(`[APPROVAL REQUIRED] Ticket ${entry.id} cannot move from Phase 1 to Phase 2 without explicit review approval. Re-run with --workflow execute or --approval approved after the plan is reviewed.`);
    }
  }

  const transitionDocMeta = transition.from === transition.to
    ? existingDocMeta
    : collectTicketTransitionValidationDocMeta(opts.cwd, abs, parsedMeta, content, opts, transition.to);
  parsedMeta.phase = nextPhase;
  parsedMeta.status = transition.status;
  const nextMeta = {
    ...clearDocMetaFrontmatterSummary(parsedMeta),
    ...buildDocMetaFrontmatterSummary(transitionDocMeta)
  };
  for (const key of Object.keys(parsedMeta)) delete parsedMeta[key];
  Object.assign(parsedMeta, nextMeta);

  const newBody = renderTicketDocument({ meta: parsedMeta, content, docmeta: transitionDocMeta });
  let finalAbsPath = abs;
  let reopenedFromArchive = false;

  try {
    writeTicketMarkdownFile(abs, newBody);

    // Re-sync index to reflect the status change if any
    opts.ticketId = entry.id;
    if (parsedMeta.status !== entry.status) {
      opts.status = parsedMeta.status;
      updateTicketEntryStatus(opts.cwd, opts);
    } else {
      loadTicketIndex(opts, { force: true });
    }

    if (nextPhase <= 1 && reopenTargetAbsPath !== abs) {
      if (existsSync(reopenTargetAbsPath)) {
        throw new Error("ticket move: reopen target already exists " + toRepoRelativePath(opts.cwd, reopenTargetAbsPath));
      }
      mkdirSync(dirname(reopenTargetAbsPath), { recursive: true });
      writeTicketMarkdownFile(reopenTargetAbsPath, newBody);
      rmSync(abs);
      finalAbsPath = reopenTargetAbsPath;
      reopenedFromArchive = true;
      loadTicketIndex(opts, { force: true });
    }

    runTicketWorkflowQualityGate(opts.cwd, {
      ticketAbsPath: finalAbsPath,
      context: `ticket move ${entry.id}`
    });

    syncActiveTicketId(opts.cwd);
    appendTelemetryEvent(opts.cwd, {
      event: "ticket_phase_moved",
      action: "ticket-move",
      ticket: entry.id,
      file: toWsRelativePath(opts.cwd, finalAbsPath),
      phase: nextPhase,
      status: parsedMeta.status,
      from: transition.from,
      to: transition.to
    });
    console.log(`ticket: moved -> ${entry.id} is now in Phase ${nextPhase} (${parsedMeta.status})`);
    // Represent the resulting state (DocMeta state / required slots / next action),
    // not just the one-line transition confirmation. Isolated so a surface render
    // hiccup never triggers the move rollback below.
    try {
      await runTicketStatus({ ...opts, ticketId: entry.id, statusDetail: true, json: false });
    } catch {
      printTicketPhaseLine(entry.id, finalAbsPath, nextPhase, opts);
      printUsageReminder(opts.cwd, opts);
    }
    // 이동 후 다음 페이즈로 진행하는 가이드를 함께 출력한다. runTicketStatus 경로는
    // DocMeta 상태/슬롯만 렌더하고 buildPhaseAdvanceHint를 거치지 않아, 이게 없으면
    // "페이즈 이동 시 다음 단계 가이드"가 표시되지 않는다. 렌더 실패는 무시한다.
    try {
      const hint = buildPhaseAdvanceHint(entry.id, nextPhase, parsedMeta.status, resolveDocsLanguage(opts.docsLanguage || "auto"));
      if (hint) console.log(hint);
    } catch { /* guidance is best-effort */ }
  } catch (err) {
    if (reopenedFromArchive) {
      rmSync(finalAbsPath, { force: true });
      writeTicketMarkdownFile(abs, body);
    }
    rollbackTicketWorkflowArtifacts(opts.cwd, previousIndex, body, abs, opts);
    throw err;
  }
}

export async function runTicketNext(opts) {
  applyTicketRootContext(opts);
  const index = loadTicketIndex(opts);
  // Find the first active ticket, or if none, the first open ticket (earliest created)
  const rows = filterTicketEntries(index.entries, opts)
    .filter(entry => isTicketNextRunnableCandidate(opts.cwd, entry))
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  // Prefer the focus pointer (activeTicketId), then any live ticket. "active" status is legacy-only.
  let found = rows.find(e => e.id === index.activeTicketId);
  if (!found) {
    found = rows.find(e => e.status === "active" || e.status === "open");
  }
  
  if (!found) {
    const latestClosed = filterTicketEntries(index.entries, opts)
      .filter(entry => String(entry.status || "").toLowerCase() === "closed")
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0];
    if (latestClosed) {
      const latestClosedPath = resolveTicketEntryOrComputedPath(opts.cwd, latestClosed);
      if (existsSync(latestClosedPath)) {
        const { content } = readTicketDocument(opts.cwd, latestClosed, { action: "ticket next", computePath: true });
        if (followUpDecisionMeansNoFollowUp(content)) {
          const absPath = toPosixPath(latestClosedPath);
          if (opts.pathOnly) {
            console.log(`no-follow-up:${latestClosed.id}`);
          } else if (isCompactTicketOutput(opts)) {
            console.log(`no-follow-up:${latestClosed.id}`);
          } else {
            const posixPath = toWsRelativePath(opts.cwd, latestClosedPath);
            console.log(`No follow-up required after ${latestClosed.id}`);
            console.log(`Path: [${posixPath}](${posixPath})`);
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

  const foundAbs = readTicketDocument(opts.cwd, found, { action: "ticket next", requireExists: true });
  const absPath = toPosixPath(foundAbs.absPath);
  if (isCompactTicketOutput(opts) || opts.pathOnly) {
    printTicketSelectionLine(found.id, absPath, { ...opts, docsLanguage: foundAbs.meta.docsLanguage });
  } else {
    const posixPath = toWsRelativePath(opts.cwd, foundAbs.absPath);
    console.log(`Next ticket: ${found.id}`);
    console.log(`Path: [${posixPath}](${posixPath})`);
      if (opts.printContent) console.log("\n" + readFileSync(foundAbs.absPath, "utf8"));
  }
}

function isTicketNextRunnableCandidate(cwd, entry) {
  const ticketDoc = readTicketDocument(cwd, entry, { action: "ticket next", computePath: true, requireExists: false });
  if (!ticketDoc.exists) return true;

  const { meta } = ticketDoc;
  const workflowSource = String(meta.workflowSource || meta.ticketWorkflowSource || "").trim();
  return workflowSource === "ticket-create";
}

export async function runTicketHotfix(opts) {
  applyTicketRootContext(opts);
  if (!opts.ticketId && !opts.latest) {
    if (opts.nonInteractive) {
      throw new Error("ticket hotfix: --id or --latest is required in non-interactive mode.");
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

  const index = loadTicketIndex(opts);
  const entry = pickTicketEntry(opts, index);
  
  if (!entry) throw new Error("No matching ticket found for hotfix.");

  const { absPath: abs, meta, content, docmeta } = readTicketDocument(opts.cwd, entry, { action: "ticket hotfix", requireExists: true });

  // Force phase 2, bypassing APC checks. Focus is set via activeTicketId below,
  // not via a status value ("active" status was removed).
  meta.phase = 2;
  meta.status = "open";
  meta.hotfix = true;
  meta.hotfixReason = opts.reason;
  
  // Append hotfix record to content
  const timestamp = new Date().toISOString();
  const hotfixRecord = `\n\n> [!WARNING]\n> **EMERGENCY HOTFIX ACTIVATED** (${timestamp})\n> **Reason:** ${opts.reason}\n> Standard APC and Phase 1 guards were bypassed.\n`;
  
  writeTicketDocument(abs, { meta, content: content + hotfixRecord, docmeta });

  // Re-sync index and make this ticket the single focus (activeTicketId).
  opts.ticketId = entry.id;
  opts.status = "open";
  updateTicketEntryStatus(opts.cwd, opts);

  const hotfixIndex = loadTicketIndex(opts);
  writeTicketIndexJson(opts.cwd, { ...hotfixIndex, activeTicketId: entry.id });
  syncActiveTicketId(opts.cwd);
  console.log(`[EMERGENCY HOTFIX] Ticket ${entry.id} is now ACTIVE. Rule policy bypassed for this session.`);

  // Auto-create derivation ticket
  const deriveTopic = `codegen-fix-${entry.id}`;
  const deriveSummary = `[DERIVED] Fix CodeGen source for hotfix: ${opts.reason}`;
  console.log(`[HOTFIX] Auto-creating derivation ticket: ${deriveTopic}`);
  
  try {
    await runTicketCreate({
      cwd: opts.cwd,
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

// #622: explicit, user-facing counterpart to the per-command auto-reconcile.
// Migrates the current workspace's tickets to ~/.deuk-agent/tickets/ and reports
// what happened. The heavy lifting (marker, registry, absorb, gitignore) is the
// same reconcile path commands already trigger, so this is idempotent and safe.
export async function runTicketMigrateHome(opts) {
  applyTicketRootContext(opts);
  const { resolveRealWorkspaceRoot } = await import("./cli-utils.js");
  // #626: resolve a REAL workspace (marker-owned ancestor or a project-boundary cwd).
  // No `|| opts.cwd` fallback — a non-workspace cwd must not be minted into a ghost.
  const root = resolveRealWorkspaceRoot(opts.cwd, opts);
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
