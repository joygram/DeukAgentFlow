import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, copyFileSync, readdirSync, rmSync, statSync } from "fs";
import { hostname } from "os";
import { basename, dirname, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import {
  toSlug, toSnakeCaseKey, requireNonEmptySlug, toRepoRelativePath, toWsRelativePath, toDriveAbsolutePath, toFileUri, inferRefTitleAndTopic, resolveReferencedTicketPath, toPosixPath, sanitizeFrontMatterMeta, stringifyFrontMatter, stripLeadingFrontMatter,
  resolveDocsLanguage, inferDocsLanguageFromText, normalizeDocsLanguage, isMcpActive, parseFrontMatter, collectMcpConfigStatuses,
  DEUK_ROOT_DIR, TICKET_SUBDIR, TICKET_INDEX_FILENAME, hasWorkspaceMarker,
  detectConsumerTicketDir, resolveConsumerTicketRoot, resolveWorkspaceContext, loadInitConfig, computeTicketPath, normalizeTicketGroup, isWorkflowExecute,
  resolveTicketSystemPaths, findWorkspaceRoot,
  loadWorkspaceCandidates, resolveWorkspaceTarget, findPromptWorkspaceMatches, selectLocalizedTemplatePath,
  buildPromptWorkspaceAliases, writeFileLF, makePath, resolvePackageRoot
 , CliOpts } from "./cli-utils.js";
import {
  buildTransitionValidationDocMeta,
  clearDocMetaFrontmatterSummary,
  mergeDocMetaUpdate,
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
  buildEvidenceSectionsForTransition,
  buildSlotStatusSummary,
  extractMarkdownSection,
  getEvidenceSlotFlagSpecs,
  getEvidenceFlagSpecsForTargetState,
  evidenceFlagForSlotHeading,
  mergeH2SectionsIntoBody,
  followUpDecisionMeansNoFollowUp,
  getAnalysisDesignIncompleteReasons,
  getCloseWorkflowReasons,
  resolveTicketType,
  TICKET_TYPES,
  buildRequiredFlagsGuideText,
  getPhase1PlanBodyReasons,
  hasPhase2ExecutionEvidence,
  hasPlaceholderTokens,
  meetsDocsReflectedGate,
  hasTicketCompletionEvidence,
  normalizePhase1PlanBodyHeadings,
  REQUIRED_APC_MARKERS,
  REQUIRED_PHASE1_SECTIONS
} from "./cli-ticket-evidence.js";
import { renderTicketWorkflowGateFailure } from "./cli-ticket-surface.js";
// #691 follow-up (design-driven-flow.md §6.0): 콘텐츠 완주 판정 SSOT는
// ticket-evidence-validators.ts(ticket-machine.ts의 guard가 직접 쓰는 룩업 테이블)다.
// 여기서는 동일 검증기를 재사용해 docmeta의 slotValues를 채울 뿐, 판정을 새로 만들지 않는다.
import { TICKET_EVIDENCE_VALIDATORS, isTicketEvidenceKeySatisfied, type TicketEvidenceInput } from "./ticket-evidence-validators.js";
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
import { roleForStateName } from "./ticket-machine.js";
import { detectCurrentPlatform, getActiveSkillsSurface, getActiveRoleSkillIds } from "./cli-skill-commands.js";


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

// 입력 정본 = 템플릿을 복사해 {{ }}를 채우고 그 본문을 stdin으로 흘려보낸다
// (phase1-design-env-sections.md §2.2). 파일로 저장해 경로를 넘기면 실행 환경 경계
// (WSL↔Windows)를 못 넘어 wslpath·UNC·임시파일 우회가 터진다. stdin은 경로가 없어 경계도
// 없다. 안내는 (1) 복사할 템플릿 경로, (2) {{ }}를 채워 stdin(--plan-body-file -)으로 파이프,
// (3) 안 채워진 {{ }} 목록만 보여준다.
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
  // 템플릿은 에이전트가 복사해 {{ }}를 채우는 순수 마크다운 본문이다(# 제목 + 요약 + 6섹션).
  // frontmatter(id/phase/summary 등 메타데이터)는 에이전트가 쓰지 않는다 — CLI가 채운 파일에서
  // title·summary를 추출해 조립한다(template-file-input-gate: 템플릿↔메타데이터 경계).
  const templateDir = makePath(PACKAGE_ROOT, "templates");
  const templatePath = selectLocalizedTemplatePath(templateDir, "TICKET_TEMPLATE.md", docsLanguage);
  return readFileSync(templatePath, "utf8").trimEnd();
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

// #950: PROJECT_RULE.md 정본은 워크스페이스의 docs/ 하위다(워크스페이스 루트도, 티켓홈
// 사본도 아니다). 읽기/쓰기 모두 이 헬퍼를 거쳐 단일 정본 위치를 가리킨다. 과거엔
// resolveHomeTicketDirForWorkspace(티켓홈)을 기준으로 삼아 init이 워크스페이스 정본을
// 티켓홈으로 이동·삭제하면서 정본이 소실됐다(#824). 이후 워크스페이스 루트를 정본으로
// 고정했으나(#824), package.json만으로 프로젝트 경계를 인정하는 판정(hasLocalProjectBoundary)과
// 맞물려 모노레포 서브패키지마다 루트 템플릿 사본이 찍혀나갔다 — docs/ 하위 단일 경로로
// 옮겨 기존 docs/README.md SSOT 구조에 편입한다(#950).
function resolveProjectRulePath(cwd) {
  return makePath(cwd, "docs", "PROJECT_RULE.md");
}

function readProjectRuleSurface(cwd, platform = null) {
  // native 플랫폼(claude)은 PROJECT_RULE.md가 CLAUDE.md 컨텍스트에 이미 로드됨 — 중복 embed 스킵.
  const detectedPlatform = platform || detectCurrentPlatform();
  if (detectedPlatform === "claude") return "";
  if (!cwd) return "";
  const projectRulePath = resolveProjectRulePath(cwd);
  if (!existsSync(projectRulePath)) return "";
  return readFileSync(projectRulePath, "utf8").trimEnd();
}

// 게이트용 워크스페이스 룰 ID 추출. readProjectRuleSurface와 달리 platform을 무시하고
// 항상 직접 읽는다(claude 플랫폼에서도 게이트는 동작해야 하므로). PROJECT_RULE.md 안의
// `[DR-01]` 같은 한 줄 룰 표기에서 ID를 모은다.
const RULE_ID_PATTERN = /\[([A-Z]{2,}-\d+)\]/g;
function readWorkspaceRuleIds(cwd): string[] {
  if (!cwd) return [];
  const projectRulePath = resolveProjectRulePath(cwd);
  if (!existsSync(projectRulePath)) return [];
  const text = readFileSync(projectRulePath, "utf8");
  const ids = new Set<string>();
  let m;
  RULE_ID_PATTERN.lastIndex = 0;
  while ((m = RULE_ID_PATTERN.exec(text)) !== null) ids.add(m[1]);
  return Array.from(ids);
}

// 기초 룰 블록은 코드에 하드코딩하지 않고 templates/PROJECT_RULE.md(정본 템플릿)에서 읽어온다.
// 템플릿의 `## Rules (id-based)` 섹션을 룰 블록으로 사용한다.
function readBaselineRuleBlock(): string {
  const tplPath = makePath(PACKAGE_ROOT, "templates", "PROJECT_RULE.md");
  if (!existsSync(tplPath)) return "## Rules (id-based)\n\n- [DR-01] 승인된 티켓 범위 안에서만 작업하고, 생성물은 소스에서 갱신한다.\n";
  const tpl = readFileSync(tplPath, "utf8");
  const section = extractMarkdownSection(tpl, "Rules (id-based)");
  return section ? `## Rules (id-based)\n\n${section.trim()}\n` : tpl;
}

// 룰 ID가 0개인 워크스페이스에 템플릿의 기초 룰 블록을 강제 주입한다(레거시 산문 룰은 강제 리팩터).
// PROJECT_RULE.md가 없으면 생성한다. 반환: 주입했으면 새 ruleIds, 이미 있었으면 null.
function ensureBaselineWorkspaceRule(cwd): string[] | null {
  if (!cwd) return null;
  const projectRulePath = resolveProjectRulePath(cwd);
  const existing = existsSync(projectRulePath) ? readFileSync(projectRulePath, "utf8") : "";
  RULE_ID_PATTERN.lastIndex = 0;
  if (RULE_ID_PATTERN.test(existing)) return null; // 이미 룰 ID 있음
  const block = readBaselineRuleBlock();
  // 프론트매터(--- ... ---)는 보존하고 그 뒤 산문 본문은 ID 룰 블록으로 교체한다.
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
    TICKET_TEMPLATE: renderedTemplate,
    REQUIRED_FLAGS: buildRequiredFlagsGuideText()
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
    const p = resolveProjectRulePath(cwd);
    if (existsSync(p)) {
      const raw = stripLeadingFrontMatter(readFileSync(p, "utf8")).trim();
      if (raw) return `[WORKSPACE_PROFILE: ${workspace || "local"}]\n${raw}`;
    }
  } catch { /* ignore */ }
  return "";
}

// 역할 동적 컨텍스트 블록. 도메인/프로필 중 있는 것만 모아 한 섹션으로 낸다.
// 둘 다 없으면 빈 문자열(템플릿에서 빈 줄로 흡수).
// design-driven-flow.md §6.0(롤=서브FSM 등식 귀결)·§6.0.5: 현재 노드를 노출하는 표면은
// 그 노드의 롤을 함께 명시한다. activeRole은 현재 state(area)에서 유도한 롤 라벨(없으면 "").
function buildRoleContextBlock(domainFocus, workspaceProfile, activeRole = "", activeWorkspace = "", roleSkillIds: string[] = []): string {
  // 현재 롤 선언 — 활성 노드가 있으면 "지금 어느 롤로 서는가"를 단정한다. 활성 티켓이
  // 없어 롤이 없으면(area=rules) 롤 미할당을 명시해 "티켓을 먼저 세우라"로 안내한다
  // (자각에 맡기지 않고 표면이 현재 롤을 못박는다 — §6.0.1 "없는 엣지" 방지).
  //
  // #935: 선언(declaration)만으로는 롤이 강제되지 않는다 — 에이전트가 "그렇구나" 하고
  // 읽고 지나칠 수 있는 수동 텍스트일 뿐이다(persona-maid가 'invoke via the Skill tool'
  // 명시 강제로 실제 호출되는 것과 대조). §6.0의 롤=서브FSM 등식이 성립하려면 현재 state의
  // 서브FSM(=role 스킬)이 실제로 서야 하므로, 이 표면은 그 role 스킬을 Skill 툴로 지금
  // invoke하라는 능동 지시를 함께 낸다. skill id는 getActiveRoleSkillIds(bind/category SSOT)
  // 가 준 것을 그대로 쓴다(DR-03 — 여기서 별도 매핑을 재정의하지 않는다).
  const invokeDirective = roleSkillIds.length > 0
    ? `\n\n**🔧 지금 이 롤로 서려면 Skill 툴을 실제로 호출하라 (선언이 아니라 호출):** ${roleSkillIds.map(id => `\`${id}\``).join(", ")} 스킬을 Skill 툴로 지금 invoke하라. 롤 스킬을 invoke하지 않은 채 "롤이라고 생각만" 하는 것은 §6.0의 서브FSM이 서지 않은 것 — 롤 전환이 강제될 수 없는 "없는 엣지"로 전락한다(§6.0.5).`
    : "";
  const roleHeader = activeRole
    ? `## 🎭 현재 역할 (ACTIVE ROLE)\n\n너는 지금 **${activeRole}** 롤이다${activeWorkspace ? ` (워크스페이스: ${activeWorkspace})` : ""}. 이 phase의 서브 FSM으로서 그 롤의 규율대로 산출을 낸다. 롤이 바뀌면(전이) 이 선언이 바뀐다 — 매 턴 이 줄을 읽어 자신이 어느 모드인지 재확인한다.${invokeDirective}`
    : `## 🎭 현재 역할 (ACTIVE ROLE)\n\n**롤 미할당** — 활성 티켓이 없어 어느 서브 FSM에도 서 있지 않다. 작업을 시작하려면 티켓을 먼저 세워라(planner/designer). 다른 워크스페이스의 phase가 현재 롤을 대신하지 않는다(§6.0.5).`;

  const parts = [domainFocus, workspaceProfile].map(s => String(s || "").trim()).filter(Boolean);
  const dynamic = parts.length === 0
    ? ""
    : `\n\n## Role Context (이번 작업 동적 컨텍스트)\n\n현재 페이즈 역할 레이어에 다음을 함께 적용한다:\n\n${parts.join("\n\n")}`;
  return roleHeader + dynamic;
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
    // §6.0 롤=서브FSM 등식: 현재 노드(area)에서 현재 롤을 유도해 표면에 명시한다.
    const activeRole = roleForStateName(area);
    // #935: 현재 state에 bind된 role 스킬 id를 뽑아 invoke 강제 지시에 실어 넘긴다.
    // getActiveSkillsSurface(:AGENT_SKILLS)와 같은 area 필터를 쓰므로 "노출되는 스킬"과
    // "invoke하라고 지시하는 스킬"이 어긋나지 않는다.
    const roleSkillIds = getActiveRoleSkillIds(opts.cwd, opts.platform, area);
    const roleContext = buildRoleContextBlock(deriveDomainFocus(activeEntry), readWorkspaceProfile(opts.cwd, opts.workspace, opts.platform), activeRole, activeEntry ? (opts.workspace || "") : "", roleSkillIds);

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

  // #685/#743: 전체 workspace 순회로 active ticket을 잡는 폴백 없음. opts.cwd는
  // applyTicketWorkspaceDispatch가 --workspace 명시일 때만 채운다 — 미지정이면
  // entry-no-workspace로 떨어진다(추측하지 않는다).
  let activeId = null, activePhase = null, activeStatus = null, activePath = null, activeWsCwd = null;
  const sessionWorkspacePath = opts.cwd || null;

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
    const advance = buildPhaseAdvanceHint(activeId, activePhase, activeStatus, resolveDocsLanguage(opts.docsLanguage || "auto"), opts);
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

function buildPhaseAdvanceHint(activeId, phase, status, lang = "en", opts: CliOpts = {}) {
  if (isTerminalTicketStatus(status)) return "";
  const phaseNum = normalizeTicketPhaseNumber(phase);
  const stateName = `phase${phaseNum >= 4 ? 4 : phaseNum}`;
  const state = TICKET_WORKFLOW.states?.[stateName];
  const transitions = state?.transitions || [];
  if (transitions.length === 0) return "";

  // Label each transition: first=forward, end=early-exit, lower phase=rollback, phase1=reopen
  // #836: rollback/reopen are LAST-RESORT paths, not peers of forward. They are collected
  // separately and printed under a de-emphasized "last resort" block with a warning, so the
  // agent does not treat "roll back when stuck" as a normal next step (drift/rollback abuse).
  const forwardLines = [];
  const lastResortLines = [];
  transitions.forEach((target, i) => {
    let label;
    let isRollback = false;
    if (target === "end") label = "early-exit";
    else if (i === 0) label = "forward";
    else {
      const targetPhase = TICKET_WORKFLOW.states?.[target]?.phase;
      isRollback = targetPhase < phaseNum;
      label = isRollback ? (targetPhase <= 1 ? "reopen" : "rollback") : "forward";
    }
    const targetPhaseNum = TICKET_WORKFLOW.states?.[target]?.phase;
    // #831: append the evidence flags this transition consumes so the printed command
    // is copy-paste complete — the agent fills them instead of hand-editing the .md.
    const targetStateName = target === "end" ? "end" : `phase${targetPhaseNum}`;
    const flagHints = getEvidenceFlagSpecsForTargetState(targetStateName)
      .map(spec => `${spec.flag} "..."`)
      .join(" ");
    const flagSuffix = flagHints ? ` ${flagHints}` : "";
    // #839: rollback is gated by #837's actor check. The rendered example an agent copies
    // must self-declare --source agent so the last-resort gate actually fires (without it,
    // an unset source defaults to human and the gate is bypassed). Forward/early-exit
    // transitions are NOT gated, so they carry no --source.
    const sourceSuffix = isRollback ? " --source agent" : "";
    const cmd = target === "end"
      ? `deuk-agent-flow ticket move --id ${activeId} --to end${flagSuffix} --non-interactive`
      : `deuk-agent-flow ticket move --id ${activeId} --phase ${targetPhaseNum}${flagSuffix}${sourceSuffix} --non-interactive`;
    const line = `  → ${target.padEnd(6)} (${label}):  ${cmd}`;
    if (isRollback) lastResortLines.push(line);
    else forwardLines.push(line);
  });

  // #836: discard is abandonment — never a peer of forward. Group it with rollback under
  // the last-resort block so it is not an ever-present "give up" button in front of the agent.
  if ((state?.actions || []).includes("discard")) {
    // #839: carry --source agent so #837's discard gate fires on the copied command.
    lastResortLines.push(`  → discard (abandon): deuk-agent-flow ticket discard --id ${activeId} --workspace <ws> --source agent --non-interactive`);
  }

  const routeLines = [...forwardLines];
  if (lastResortLines.length > 0) {
    routeLines.push(
      "  ─ last resort (only for a wrong premise; to grow scope use `ticket edit`, NOT rollback) ─"
    );
    routeLines.push(...lastResortLines);
  }

  // Slot hint from forward target template
  const forward = transitions[0];
  const nextStateName = forward !== "end" ? `phase${TICKET_WORKFLOW.states?.[forward]?.phase}` : "end";
  const statePrompt = loadStatePrompt(nextStateName, lang) || loadStatePrompt(stateName, lang) || "";
  const templateContent = loadStateTemplate(nextStateName, lang) || "";
  // #831: annotate each state-template slot with the CLI flag that fills it, so the
  // agent satisfies the gate via flags (which merge into the .md) instead of being told
  // to "fill the ticket file" — the message that used to push hand-editing.
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

  // #935: 전이는 곧 롤 전환이다(§6.0 롤=서브FSM, §6.0.5 "전이 결과는 다음 롤을 담는다").
  // move 성공 표면이 다음 CLI 명령만 담고 "다음 롤로 서라"를 안 담으면, 상태전환은 숫자만
  // 바뀌고 서브FSM은 교체되지 않아 롤 전환이 "없는 엣지"로 전락한다(사용자 관측: '상태전환·
  // 롤 전혀 안 됨'의 뿌리). 그러므로 전이 직후 다음 state의 role 스킬을 Skill 툴로 invoke해
  // 그 롤로 서고, 그 롤로 재판단하라는 지시를 함께 낸다. 특히 진행 중 "선택지"가 생기면
  // 곧장 사용자에게 회피성 질문을 던지지 말고, 먼저 해당 롤(설계 판단이면 designer)로 서서
  // 설계 정본과 대조해 재판단한다 — 원 요구·설계에서 답이 도출되면 자율 진행하고, 데드락
  // (둘 이상의 유효·되돌리기 어려운 선택)일 때만 물어본다(Escalation Gate / DC Protocol).
  const nextRoleSkillIds = getActiveRoleSkillIds(opts.cwd, opts.platform, nextStateName);
  const roleSwitchSection = nextRoleSkillIds.length > 0
    ? `\n\n🎭 전이 = 롤 전환: ${forward}로 넘어가면 즉시 ${nextRoleSkillIds.map(id => `\`${id}\``).join(", ")} 스킬을 Skill 툴로 invoke해 그 롤로 서라(§6.0.5). 진행 중 선택지가 생기면 사용자에게 회피성 질문을 먼저 던지지 말고, 그 롤(설계 판단이면 designer)로 서서 설계 정본과 대조해 재판단하라 — 원 요구·설계에서 답이 나오면 자율 진행, 데드락일 때만 질문(Escalation Gate).`
    : "";

  // #690: 셸은 항상 bash 고정(에이전트는 Bash tool 전용). 노드 전이 프롬프트 본문은
  // loadStatePrompt로 .md(SSOT)에서 가져온다.
  return `

Next phase (${stateName} → ${forward}): ${statePrompt}${slotsSection}${roleSwitchSection}
\`\`\`bash
${routeLines.join("\n")}
\`\`\``;
}

// #908: 선제 템플릿 출력 SSOT. move 성공·status·use 등 "현재 phase를 표면화하는" 모든
// 지점이 이 헬퍼로 다음 전환용 완성형 명령을 출력한다 — 에이전트가 플래그 이름을 추론하지
// 않고 슬롯 값만 채우게 한다(design-driven-flow.md §6.0: 요구형식은 템플릿으로 제시).
// terminal 상태면 buildPhaseAdvanceHint가 빈 문자열을 반환해 자연히 생략된다. 렌더 실패는
// best-effort로 무시한다(가이드가 없다고 명령 자체가 실패하면 안 된다).
function printPhaseAdvanceHint(ticketId, phase, status, opts: CliOpts = {}) {
  try {
    const hint = buildPhaseAdvanceHint(ticketId, phase, status, resolveDocsLanguage(opts.docsLanguage || "auto"), opts);
    if (hint) console.log(hint);
  } catch { /* guidance is best-effort */ }
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

// 워크스페이스에 룰(PROJECT_RULE.md의 [DR-XX])이 존재하는데 plan-body가 어떤 룰 ID도
// 참조하지 않을 때의 게이트 실패 메시지. 룰 0개면 호출되지 않는다.
// #909: 룰참조 게이트 SSOT. create(:2515)·edit/move 재검증(:2932) 두 곳이 같은 로직을
// 복붙하던 것을 한 헬퍼로 모은다(DR-03). §6.0(design-driven-flow.md:189-191)은 "에이전트
// 출력을 되파싱해 품질을 심문하지 말고 최소 형식 확인에 그친다"를 규정한다 — 여기서 하는
// 것은 "본문에 룰 id 문자열이 하나라도 존재하는가"라는 최소 형식 확인일 뿐, 인용의 실재나
// 서식·품질을 심문하지 않는다(그 경계 안에서 게이트 목적 '티켓이 룰에 결속됨'을 지킨다).
// 룰 id가 하나도 없으면 에러를 throw하고, 있으면 조용히 통과한다.
function assertPlanReferencesRule(planBody: string, ruleIds: string[] = [], opts: CliOpts = {}) {
  if (ruleIds.length === 0) return;
  const referenced = ruleIds.filter(id => planBody.includes(id));
  if (referenced.length === 0) {
    throw new Error(buildRuleReferenceRequiredError(ruleIds, opts));
  }
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
  // #918: 이전 판은 claim의 토큰이 Analysis/Direction 섹션에 substring으로 33% 이상
  // 나타나는지로 "주장이 근거 있나"를 판정했다 — design-driven-flow.md §6.0.3이
  // 공허한 통과(vacuous pass)로 지목한 전형(키워드 겹침을 실질 근거로 위장). 제거한다.
  // 주장의 실질 근거는 git 변경파일과의 대조(getImplementationClaimGuardResult)가
  // 담당하고(§6.0.3 양방향 추적성), 이 함수는 형식 사실(claim 유무·summary·기록 완비)만 본다.
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
  // #918: claimCoverage(키워드 겹침) 슬롯 제거 — 주장의 실질 근거는 git 대조가 담당.
  // 여기 슬롯은 형식 사실만: claim 유무·summary 존재·phase1 기록 완비.
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

function formatTicketUpdateLine(ticketId, absPath, cwd = "", invocationCwd = "", phase = null) {
  // #908: pass phase so the card surfaces the phase + role badge on the `use` path too
  // (role-layer.md §3: 현재 롤을 항상 표면화). phase가 없으면 배지는 생략된다.
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

function formatTicketEndLine(ticketId, absPath, cwd = "", invocationCwd = "") {
  return formatTicketFlowLine(resolveTicketWorkspaceLabel(cwd, absPath), FLOW_SURFACE_STATUS.end, ticketId, absPath, invocationCwd || cwd);
}

function formatTicketStatusLine(label, ticketId, absPath, cwd = "") {
  // #807: ticket lives under ~/.deuk (different drive from workspace D:) →
  // drive-stripped absolute (/Users/...) is the only form that opens in chat.
  const linkPath = cwd ? toWsRelativePath(cwd, absPath) : toPosixPath(absPath).replace(/^[a-zA-Z]:/, "");
  return `Ticket ${label}: [${ticketId}](${linkPath})`;
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
      invocationCwd: opts.invocationCwd || opts.cwd || "",
      // #908: carry the phase (when a caller passed it via PHASE) so the card renders
      // the phase + role badge. Callers without a phase (start/adjust) leave it undefined.
      phase: replacements.PHASE
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
  console.log(formatTicketUpdateLine(ticketId, toPosixPath(absPath), opts.cwd, opts.invocationCwd, opts.phase));
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
  // #807: the "Source:" line must use the same drive-stripped link form as the
  // card link / formatTicketFlowLine (#746/#647). A raw "C:/Users/..." path never
  // opens in the chat panel; toWsRelativePath yields the "/Users/..." form both
  // surfaces open. Card link already strips inside formatTicketFlowLine.
  const sourceLinkPath = toWsRelativePath(opts.cwd, absPath);
  const flowLine = formatTicketUpdateLine(ticketId, normalizedAbsPath, opts.cwd, opts.invocationCwd);
  const summary = String(opts.summary || opts.runtimeContext?.summary || "").trim();
  const planBody = readApprovalPlanBody(absPath);
  const wsName = opts.workspace || basename(String(opts.cwd || ""));
  const lines = [
    opts.includeFlowLine === false ? "" : flowLine,
    summary ? `Summary: ${summary}` : "",
    "DocMeta state: approval_required",
    // #815: 클릭 ②(Source) + 셸·에이전트 cat용 ①(Abspath) 짝 병기.
    `Source: ${sourceLinkPath}`,
    `Abspath: ${toDriveAbsolutePath(absPath)}`,
    "",
    ...(planBody ? ["--- Plan under review ---", planBody, "--- End of plan ---", ""] : []),
    "Required slots:",
    "- phase1Plan",
    "- userApproval",
    "",
    "Output: transition_blocked_until_approval",
    // #851: this surface is what the AGENT sees every time approval is pending. The user
    // reads only what the agent relays to chat — so telling the agent to "review the plan
    // above" is not enough; the agent must first PRESENT a review to the user, or the user
    // is approving something they never saw. State that requirement here, at the point of
    // use, not only in the session-start rules (#847) which are read once and forgotten.
    "Action (agent): BEFORE requesting 승인, present a review to the user in chat — in your",
    "own words, not a paste of the block above: (a) what actually changes (1-2 sentences),",
    "(b) the real judgment call(s) the user must weigh, (c) why this direction. Only after",
    "the user has seen that review and typed `승인` may you run the adapter command below.",
    "An approval obtained without presenting this review is not informed — do not proceed on it.",
    "",
    ...workspacePreflightLines(opts.cwd),
    "Adapter command after approval (run ONLY after the user approves in chat):",
    "```bash",
    `deuk-agent-flow ticket move --id ${ticketId} --workspace ${wsName} --phase 2 --approval approved --non-interactive`,
    "```",
    "",
    "Not proceeding? Do NOT self-approve or force a phase jump — discard it instead:",
    "```bash",
    `deuk-agent-flow ticket discard --id ${ticketId} --workspace ${wsName} --source agent --non-interactive`,
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

// 입력 정본은 "템플릿 파일을 채워 경로를 넘긴다"이다(template-file-input-gate 설계).
// 에이전트는 templates/TICKET_TEMPLATE.*.md를 복사해 {{ }}를 채운 파일을 Write로 만들고,
// 그 저장소 상대경로를 --plan-body-file로 넘긴다. 값을 셸 인자로 넘기지 않으므로 특수문자
// 이스케이프가 원천 소멸한다(구 6개 섹션 플래그 --scope/--design/... 는 셸 이스케이프
// 표면을 6배로 늘려 폐기했다). --plan-body(문자열 직접)도 하위호환으로 받되, 권장 경로는
// --plan-body-file이다.
function hydrateCreateTextInputs(opts) {
  const next = { ...opts };
  if (next.planBodyFile) {
    next.planBody = readCliTextInput(next.cwd, next.planBodyFile, "ticket create --plan-body-file");
  } else if (next.planBody === "-") {
    // --plan-body-file -와 동일한 stdin 규약을 --plan-body에도 적용한다. 이전에는
    // --plan-body -가 stdin을 읽지 않고 리터럴 "-" 한 글자를 그대로 본문으로 써버려,
    // 룰 참조 게이트가 "본문에 룰 id 없음"으로 실패했다 — 실제 원인(본문이 사실상
    // 비어있었음)을 가리는 오탐이었다. 두 플래그가 이름은 다르지만 값 "-"의 의미는
    // 같아야 사용자 혼동이 없다.
    next.planBody = readCliTextInput(next.cwd, "-", "ticket create --plan-body");
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

  // #652/#685: registry-only, --workspace 명시로만 해소한다. NEVER a cwd-basename
  // match — that old fallback let any cwd whose folder name resembled the query
  // masquerade as a registered workspace and was a ghost factory.
  const candidates = loadWorkspaceCandidates("", { homeDir: opts.homeDir });

  // No explicit --workspace: leave opts.cwd as-is — callers that genuinely need a
  // workspace will fail later with a clear "workspace not found", never silently
  // inferring one from a session cookie or cwd.
  if (!explicitQuery) {
    return opts;
  }

  if (!candidates || candidates.workspaces.length === 0) {
    throw new Error(`ticket workspace target not found: ${explicitQuery} (no workspaces registered — run \`deuk-agent-flow init\` in the workspace first)`);
  }

  const resolution = resolveWorkspaceTarget(explicitQuery, { candidates, homeDir: opts.homeDir });

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
      || normalized === "docs/PROJECT_RULE.md"
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

// #691 follow-up (design-driven-flow.md §6.0): this must hand machineTransition's guard
// RAW evidence (ticket body content, cwd, meta, decision-text opts) — not pre-judged
// booleans. The guard in ticket-machine.ts calls ticket-evidence-validators.ts directly
// against this raw shape; judging pass/fail here would just reproduce the old
// Boolean(evidence[key]) pass-through gate one layer up.
function buildRawTicketEvidence(cwd, meta: Record<string, any> = {}, content = "", opts: CliOpts = {}, targetState = ""): TicketEvidenceInput {
  // 정본 입력만 싣는다(No-Fallback). 완주 판정은 content(플래그가 병합된 본문)에서 하고,
  // 결정 슬롯은 --reason(reason), 승인은 --workflow(workflowMode)/--approval(approval)에서
  // 온다. 과거의 debuggingDecision/reopenDecision/verificationEvidence/completionEvidence·
  // 죽은 별칭(workflow/approvalState)은 검증기가 더는 읽지 않으므로 제거했다.
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
  // #691 follow-up (design-driven-flow.md §6.0): 이 함수는 더 이상 pass/fail을 스스로
  // 판정하지 않는다. 판정(콘텐츠 완주 검증)은 ticket-machine.ts의 guard가
  // ticket-evidence-validators.ts를 통해 직접 수행한다 — 여기서는 raw evidence(본문
  // content/cwd/meta/opts)를 모아 evidence 객체로 실어 나르는 오케스트레이션만 한다.
  // slotValues는 docmeta 표시/에러 상세용으로 동일한 검증기를 재사용해 얻는다(중복
  // 판정이 아니라 단일 판정 결과의 재조회 — 판정 기준이 어긋날 수 없다).
  const evidenceForValidation = buildRawTicketEvidence(cwd, meta, content, opts, targetState);
  const slotValues = Object.fromEntries(
    Object.keys(TICKET_EVIDENCE_VALIDATORS).map(key => [key, isTicketEvidenceKeySatisfied(key, evidenceForValidation)])
  );
  // #868/#874: phase2→3 게이트는 (실행증거 AND 문서반영)로 구성된다. 실패 시 어느 쪽이
  // 비었는지 구분해 안내한다 — 뭉뚱그린 execution_slots_empty만 내면 에이전트가 실행
  // 슬롯만 채우며 무한 삽질한다(Docs Reflected가 필요한 줄 모름). docsReflected_missing은
  // "--docs-reflected를 채워라"로 렌더된다(evidenceFlagsForEvidenceKey/DocsReflected).
  const executionEvidenceErrors = targetState === "phase3" && !slotValues.executionEvidence
    ? [
        ...(hasPhase2ExecutionEvidence(content) ? [] : ["phase2_execution_slots_empty"]),
        ...(meetsDocsReflectedGate(content, cwd) ? [] : ["docs_reflected_missing"])
      ]
    : closeReasons;
  // phase4 완주 사유는 close 슬롯 충족(closeReasons)만 본다. code_design_mismatch 게이트는
  // 제거했다(role-layer.md §3.1: 코드 현상을 설계 판정에 섞지 않는다).
  const verificationEvidenceErrors = closeReasons;
  const slotSourceMap = {
    phase1Plan: { source: toRepoRelativePath(cwd, absPath), errors: phase1Reasons },
    userApproval: { source: "--approval approved | --workflow execute" },
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
  return renderTicketWorkflowGateFailure({ ticketId, workspace: basename(String(cwd || "")), docmeta, reasons });
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
  // 정본 입력은 workflowMode(←--workflow)·approval(←--approval) 둘뿐(cli-utils.ts SSOT).
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

// #829: when a ticket isn't found in the canonical home ticket dir, an agent's next
// instinct is to reverse-engineer the filesystem. Surfacing the exact path searched,
// plus a same-named file found elsewhere (e.g. a stale in-workspace copy), collapses
// that whole detour into one error message.
function findStrayTicketFile(cwd, ticketId, ticketsRoot) {
  if (!ticketId) return null;
  const candidateRoots = [];
  try {
    const wsRoot = findWorkspaceRoot(cwd) || cwd;
    const legacy = resolveTicketSystemPaths(wsRoot).primary;
    if (legacy && legacy !== ticketsRoot) candidateRoots.push(legacy);
    // #829: a plain top-level `main`/`sub`/`scratch` dir directly under the workspace
    // root (no `.deuk/tickets` prefix) has shown up as a stale orphan copy — the CLI
    // never scans it, but an agent skimming the tree mistakes it for canonical storage.
    if (wsRoot && wsRoot !== ticketsRoot) candidateRoots.push(wsRoot);
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

  // #804: project-memory.md archive append 경로 완전 제거(언니 지시). 재오염 차단.
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
  // #825: create의 첫-시도-실패를 fail-fast로 잡는다.
  // 흔한 오용 — 제목을 위치인자로 줌(`ticket create "제목"`) — 은 parseTicketArgs에서
  // opts.ticketId로 조용히 흡수된다(공통 파서라 명령 종류를 모름). 그 결과 opts.title이
  // undefined가 되어 아래 help가 출력되고 exit 0으로 끝나, 에이전트가 "help 텍스트=생성결과"로
  // 착각하고 삽질을 반복했다. create 컨텍스트에서 떠도는 위치인자는 잘못 흡수된 제목이므로
  // 도움말 대신 명시적 에러+비0 exit로 즉시 실패시킨다.
  if (opts.ticketId !== undefined && !opts.title && !opts.summary && !opts.ref) {
    throw new Error(
      `unexpected positional argument: "${opts.ticketId}". ` +
      `Pass the ticket title via --title (e.g. --title my-ticket-slug), not as a positional argument. ` +
      `Run \`deuk-agent-flow ticket create --help\` for the canonical form.`
    );
  }
  // 인자가 사실상 없을 때(순수 도움말 의도)에만 가이드를 출력한다. 이건 오용이 아니라
  // discoverability이므로 stdout + exit 0 유지가 맞다. 입력 정본은 --plan-body-file(채운
  // 템플릿 파일)이므로 그것/‑body가 있으면 가이드가 아니라 생성으로 진행한다.
  if (!opts.title && !opts.summary && !opts.ref && !opts.planBody && !opts.planBodyFile) {
    console.log(buildTicketCreateGuide(opts));
    return;
  }
  // #939: 폐기된 개별 섹션 플래그를 fail-loud로 막고 템플릿 경로로 유도한다.
  // create 본문 섹션의 단일 정식 입력 경로는 채운 템플릿을 --plan-body-file - 로
  // heredoc 파이프하는 것이다(:806, :1338; 개별 6섹션 플래그는 셸 이스케이프 표면
  // 6배 문제로 의도적으로 폐기됨). 과거엔 이 플래그들을 조용히 삼켜 Scope/Analysis/
  // Direction 섹션 없는 티켓이 만들어졌고, 그 티켓이 phase2→end에서 영구 차단됐다
  // (936/938 실증 — 원인-증상 거리가 벌어짐). 발생 지점(create)에서 즉시 에러내면
  // 원인-증상 거리가 0이 된다. edit 경로는 대칭적으로 이 플래그들을 정당하게 쓰므로
  // (기존 본문에 섹션만 병합) 여기서만 막는다.
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

  const inferred = opts.ref ? inferRefTitleAndTopic(opts) : null;
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

    // 제목·요약 SSOT는 채운 파일 본문이다(phase1-design-env-sections.md §2.1). 본문의
    // # H1 → title, 그 아래 문단 → summary를 CLI가 추출한다. --title은 명시됐을 때만
    // 슬러그를 오버라이드하는 하위호환 입력이고, 없으면 본문 H1이 정본이다.
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

    // #944/#951 (design-driven-flow.md §6.0.4.1): 성격 선언은 생성 시점에 강제한다 — 완주 증거
    // 슬롯이 티켓 종류에서 도출되므로, 종류 없는 티켓은 어떤 슬롯을 완주로 요구할지 정할 수 없다.
    // fail-first: 미선언/미인식이면 만들지 않고 유효 종류를 요구한다(No-Fallback Gate).
    const ticketType = resolveTicketType({ type: opts.type });
    if (ticketType === null) {
      const valid = Object.keys(TICKET_TYPES).join(", ");
      throw new Error(`ticket create: --type is required and must be one of: ${valid}. It selects which completion-evidence slots this ticket must fill (design-driven-flow.md §6.0.4.1).`);
    }

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
      // G1+G2: create 경로에서만 Design·Environment를 강제(신규 스키마). 재검증·edit은 관대.
      const planReasons = getPhase1PlanBodyReasons(parsedPlan.body, { title: finalTitle, enforceDesignEnv: true, cwd: opts.cwd });
      if (planReasons.length > 0) {
        console.log(buildPlanBodyRequiredError(planReasons, opts));
        return;
      }
      // 룰 참조 게이트:
      //  - 룰 0개면 기초 룰([DR-01])을 자동 주입하고 이번 티켓은 경고만 남기고 통과(다음 티켓부터 강제).
      //  - 룰이 1개라도 있으면 plan-body가 최소 1개 룰 ID를 참조해야 한다. 아니면 throw(우회 불가).
      let ruleIds = readWorkspaceRuleIds(opts.cwd);
      if (ruleIds.length === 0) {
        const injected = ensureBaselineWorkspaceRule(opts.cwd);
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
      const docmeta = collectTicketTransitionValidationDocMeta(opts.cwd, abs, meta, ticketBody, {}, "phase2");
      // #811: front-matter docmeta* 미러 폐지 — 검증 상태는 본문 ## DocMeta 정본에만 둔다.
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
    // #819: emit a machine-parseable success trailer as the LAST stdout line so
    // `tail`/agents can confirm creation. Without it, the final lines are the
    // approval/discard guidance and a successful create reads as a failure,
    // driving an infinite re-create loop. Mirrors `ticket move`'s ticket-guard-ok.
    console.log(
      `${opts.dryRun ? "ticket-created-dryrun" : "ticket-created-ok"} ${ticketId} | phase=ph1 | status=open | ${toDriveAbsolutePath(abs)}`
    );
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
    // #818: every row carries `absPath` — the drive-prefixed, posix-normalized
    // absolute file path. Consumers (VSCode extension) open this directly and never
    // recombine `path` (which is index-relative "main/x.md", display-only). The
    // human "Path:" click-link form (drive-stripped, #746) stays separate.
    const payloadRows = rows.map(e => {
      let content = "";
      let absPath = "";
      try {
        const doc = readTicketDocument(opts.cwd, e, { action: "ticket list", requireExists: false });
        absPath = toDriveAbsolutePath(doc.absPath);
        if (opts.printContent) content = doc.exists ? doc.content : "";
      } catch { /* missing/corrupt ticket → empty body, best-effort absPath */
        try { absPath = toDriveAbsolutePath(resolveTicketEntryOrComputedPath(opts.cwd, e)); } catch { /* give up */ }
      }
      return opts.printContent ? { ...e, absPath, content } : { ...e, absPath };
    });
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
    printPhaseAdvanceHint(out.id, out.phase, out.status, opts);
    printUsageReminder(opts.cwd, opts);
    return;
  }

  console.log(`Ticket: ${out.id}`);
  console.log(`Status: ${out.status}`);
  console.log(`Phase: ${out.phase}`);
  // #807: out.path stays raw for JSON consumers, but the human "Path:" line must
  // use the drive-stripped ticket-link form (#746) — only that form clicks open in
  // the chat panel (user click-test: drive-prefixed/relative/file-uri all fail).
  // #815: 외부 표현(클릭 ②)과 내부 처리(셸·에이전트 cat ①)는 별개다 — 둘을 짝으로 병기.
  console.log(`Path: ${toWsRelativePath(opts.cwd, ticketDoc.absPath)}`);
  console.log(`Abspath: ${toDriveAbsolutePath(ticketDoc.absPath)}`);
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
  printPhaseAdvanceHint(out.id, out.phase, out.status, opts);
  printUsageReminder(opts.cwd, opts);
}

// #811: 티켓 본문 조회 전용 CLI. 에이전트가 find/grep/Read로 .md를 직접 뒤지지 않고
// CLI 단일 명령으로 본문(4섹션)·DocMeta 정본·경로를 얻게 한다. 읽기 전용이라
// 워크플로 상태를 바꾸지 않으며 모든 phase/상태에서 호출 가능하다.
export async function runTicketShow(opts) {
  applyTicketRootContext(opts);
  const index = loadTicketIndex(opts);
  const found = pickTicketEntry(opts, index);
  if (!found) {
    const selector = opts.ticketId || opts.title || "";
    if (selector) {
      const ticketsRoot = detectConsumerTicketDir(opts.cwd);
      const hint = buildTicketNotFoundHint(opts.cwd, selector, ticketsRoot);
      throw new Error([`ticket show: no matching ticket found for '${selector}'`, ...hint].join("\n"));
    }
    throw new Error("ticket show: --id <ticket-id> is required.");
  }

  const ticketDoc = readTicketDocument(opts.cwd, found, { action: "ticket show", requireExists: true });
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

  // 카드 한 줄(워크스페이스·상태·티켓 링크) — 항상 먼저.
  printTicketStatusFlowLine(found.id, absPath, phase, { ...opts, docsLanguage: ticketDoc.meta.docsLanguage });
  console.log(`${found.id} | phase=${phase} | status=${status}`);
  if (ticketDoc.meta.summary) console.log(`Summary: ${ticketDoc.meta.summary}`);
  // #815: 클릭 ②(Path) + 셸·에이전트 cat용 ①(Abspath) 짝 병기.
  console.log(`Path: ${toWsRelativePath(opts.cwd, absPath)}`);
  console.log(`Abspath: ${toDriveAbsolutePath(absPath)}`);
  console.log("");
  // 본문(4섹션) 그대로 — 에이전트 검수용.
  console.log(ticketDoc.content.trim());
  if (ticketDoc.docmetaRaw) {
    console.log("");
    console.log("## DocMeta");
    console.log("");
    console.log("```yaml");
    console.log(ticketDoc.docmetaRaw);
    console.log("```");
  }
  printUsageReminder(opts.cwd, opts);
}

// #918: 이전 판(#912)은 Scope 섹션의 백틱 토큰을 정규식으로 긁어 "경로처럼 보이는 것"의
// 집합 차이로 스코프 확장을 추론했다. 이는 design-driven-flow.md §6.0이 스스로 금지한
// "에이전트 출력을 정규식으로 되파싱해 실질을 판정" 패턴이며, 티켓 본문에 경로를 백틱
// 인용만 해도 오탐 거부가 났다. §6.0.4 판정 계약으로 치환한다: 스코프가 넓어졌는가라는
// 실질은 게이트가 판정하지 않는다 — 편집 주체(ticket edit 실행 순간의 role-architect
// 모드, role-layer.md §3.0.1)가 확장임을 --expand-scope로 명시 선언하고, 게이트는 그
// 선언이 수행되었음만 요구한다. 선언 없는 phase2+ 편집은 비확장(오타·명료화·축소)으로
// 간주해 통과시키고, 확장 선언은 승인된 스코프를 넘으므로 거부한다.

// #829: phase1 tickets had no in-place amendment path, so widening a ticket's scope
// mid-review (a common, legitimate need) pushed agents toward a "rollback to phase1
// -> discard -> recreate" workaround. discard on an ID the registry never indexed
// then fails, and the agent thrashes trying to route around it. `ticket edit`
// rewrites the 4 canonical sections of an OPEN phase1 ticket in place, going through
// the same plan-body / rule-reference gates as `ticket create` — no discard needed.
export async function runTicketEdit(opts) {
  applyTicketRootContext(opts);
  applyTicketContext(opts);
  if (!opts.ticketId && !opts.latest) {
    throw new Error("ticket edit: --id or --latest is required.");
  }

  const index = loadTicketIndex(opts);
  const found = pickTicketEntry(opts, index);
  if (!found) {
    const selector = opts.ticketId || "";
    const ticketsRoot = detectConsumerTicketDir(opts.cwd);
    const hint = buildTicketNotFoundHint(opts.cwd, selector, ticketsRoot);
    throw new Error([`ticket edit: no matching ticket found for '${selector}'`, ...hint].join("\n"));
  }

  const ticketDoc = readTicketDocument(opts.cwd, found, { action: "ticket edit", requireExists: true });
  const absPath = ticketDoc.absPath;
  const phase = Number(ticketDoc.meta.phase || 1);
  const status = String(found.status || ticketDoc.meta.status || "open");

  if (status !== "open") {
    throw new Error(`ticket edit: '${found.id}' has status '${status}', not 'open'. Only an open ticket can be edited.`);
  }

  const opts2 = hydrateCreateTextInputs(opts);
  let planBody = String(opts2.planBody || "");
  // #edit-section-flags: create와 대칭 — edit도 섹션 플래그를 받는다. 준 섹션만 기존
  // 본문에 병합(교체)해 전체 재작성을 강요하지 않는다. 이전엔 planBody(전체 본문)만
  // 받아, 한 섹션만 고쳐도 전체를 복붙 재작성해야 했고(원본 알맹이 유실 위험·heredoc
  // 지옥), rules 안내와 코드가 불일치했다(설계↔구현 불일치). 이제 안내대로 섹션
  // 플래그가 동작한다.
  // #740/#324 버그 수정: TICKET_TEMPLATE.md는 6개 H2 섹션(Scope/Design/Environment/
  // Plan/Analysis/Direction)을 갖지만, 이 배열은 create 시절 4섹션 스키마(design·
  // environment는 create 전용으로 오인)만 남아 있었다. Design/Environment를 채우려는
  // edit이 전부 "지원 안 함" 에러로 막혀, 구현자가 --direction에 설계 내용을 욱여넣는
  // 편법으로 흘렀다. create와 동일한 6섹션을 대칭으로 지원한다.
  const editSections = [
    { flag: opts.scope, heading: "Scope" },
    { flag: opts.design, heading: "Design" },
    { flag: opts.environment, heading: "Environment" },
    { flag: opts.planSection, heading: "Plan" },
    { flag: opts.analysis, heading: "Analysis" },
    { flag: opts.direction, heading: "Direction" },
  ].filter(s => String(s.flag || "").trim());
  if (!planBody.trim() && editSections.length > 0) {
    // 전체 본문 미제공 + 섹션 플래그 있음 → 기존 .md 본문에 준 섹션만 병합해 planBody 합성.
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

  if (phase !== 1 && opts.expandScope) {
    // 게이트는 확장 여부를 텍스트로 추론하지 않는다 — 편집 주체가 --expand-scope로
    // "이건 확장이다"를 선언했을 때만 거부한다(§6.0.4: 게이트는 판정이 수행됨을 요구).
    throw new Error(
      `ticket edit: '${found.id}' is at phase ${phase}, not phase 1, and --expand-scope ` +
      `declares this edit widens the approved Scope. A non-expanding edit (typo fixes, ` +
      `narrowing, clarifying within the approved Scope) needs no flag and is allowed at phase2+. ` +
      `If the scope genuinely must widen beyond what was approved, that is a wrong-premise case — ` +
      `discard this ticket and create a new one with the wider scope.`
    );
  }

  const planReasons = getPhase1PlanBodyReasons(parsedPlan.body, { title: found.title || ticketDoc.meta.title });
  if (planReasons.length > 0) {
    throw new Error(buildPlanBodyRequiredError(planReasons, opts));
  }
  assertPlanReferencesRule(parsedPlan.body, readWorkspaceRuleIds(opts.cwd), opts); // #909: SSOT 게이트

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
  console.log(`Path: ${toWsRelativePath(opts.cwd, absPath)}`);
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
    console.log(`[evidence-ok] ${target.id} ${result.docmeta.validation.status} (claim terms: ${result.claimTerms})`);
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
  // No interactive ticket picker: default to the latest ticket when no
  // --id/--latest is given. Approval/scope gating is enforced by the ticket
  // workflow itself, not by a terminal prompt.
  if (!opts.ticketId && !opts.latest) {
    opts.latest = true;
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
      console.log(formatTicketStatusLine(normalizedStatus, entry.id, finalAbsPath, opts.cwd));
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
    await runTicketList({ ...opts, active: false, archived: false, all: false });
    return;
  }

  const found = opts.latest ? scopedEntries[0] : scopedEntries.find(e =>
    String(e.id || "").includes(targetTicketId)
  );
  if (!found) {
    const candidates = buildUseFallbackCandidates(index, opts);
    const ticketsRoot = detectConsumerTicketDir(opts.cwd);
    throw new Error(buildUseNoMatchError(targetTicketId, candidates, opts.cwd, ticketsRoot));
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
  // #908: carry the ticket's phase so the selection card shows the phase + role badge.
  printTicketSelectionLine(found.id, absPath, { ...opts, docsLanguage: foundDoc.meta.docsLanguage, phase: foundDoc.meta.phase });
  printTicketUseNextSteps(found, foundDoc, opts);
  // #908: 작업 재개 시(use) 다음 전환용 완성형 명령을 선제 제시해, 에이전트가
  // 플래그 이름을 추론하지 않고 슬롯 값만 채우게 한다(design-driven-flow.md §6.0 템플릿 원칙).
  printPhaseAdvanceHint(found.id, foundDoc.meta.phase, foundDoc.meta.status, opts);
  // #844: ticket use is the canonical session-start load step (Session Start Routine),
  // but it used to print only the Summary line — so an agent that needed the actual APC
  // (Scope/Plan/Analysis/Direction) reached for the .md file directly. Print the APC body
  // by DEFAULT so one `ticket use` fully loads context.
  // NOTE: agents always pass --non-interactive, and isCompactTicketOutput() treats that as
  // compact — which would suppress the body on exactly the call path we need to fix. So the
  // body gate here keys on --compact ONLY (not non-interactive). --path-only already
  // returned above; --print-content forces the raw file (incl. DocMeta) for verbatim callers.
  if (!opts.compact) {
    if (opts.printContent) {
      console.log("\n" + readFileSync(foundDoc.absPath, "utf8"));
    } else {
      const body = (foundDoc.content || "").trim();
      if (body) console.log("\n" + body);
    }
  }
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

// #804: updateProjectMemoryFromTicket 제거 — #685서 no-op였고 호출부(archive)도 #804서 제거.

// #837/#841: actor attribution for telemetry only. Extracts who ran the command so the
// telemetry record can attribute discard/rollback events. (#841 removed the human/agent
// judgement that used to live here — the user never runs discard/rollback directly via
// CLI, so a "declaredHuman → pass" branch was dead code that let an agent bypass the gate
// simply by omitting --source.)
function resolveActorOrigin(opts) {
  const source = String(opts.source || "").trim().toLowerCase();
  const sessionMode = String(opts.sessionMode || "").trim().toLowerCase();
  return { source, sessionMode };
}

// #841: last-resort confirm gate. discard/rollback are ALWAYS gated — there is no
// "trusted actor" that skips it, because the human directs via chat and the agent always
// runs the actual command. Default is REFUSE; the only way through is an explicit
// --confirm-* flag. The refusal actively steers toward `ticket edit`, since the #1 cause
// of discard abuse is treating a goal-change / scope-widening as a reason to discard→recreate
// (rules: "Scope-widening is NOT a deadlock ... use `ticket edit`").
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
      // #837: carry actor attribution through to the telemetry record so discard/
      // rollback events record WHO ran them (agent id + session mode + origin), instead
      // of landing as empty fields. appendInternalWorkflowEvent forces source="internal";
      // originSource preserves the caller-declared origin (agent/auto/human) for auditing.
      agentId: entry.agentId || "",
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
      const durableLocalMatch = findTicketEntryInWorkspaceBySelector(opts.cwd, key, opts);
      if (durableLocalMatch) return durableLocalMatch;

      // #775: 사용자가 --workspace를 명시했으면 그 워크스페이스가 SSOT 경계다.
      // 거기서 못 찾았는데 형제 워크스페이스 9개를 디스크 전수탐색으로 뒤지면
      // (1) "워크스페이스는 --workspace로만 해석"(#633/#652) 원칙을 폴백이 위반하고
      // (2) 에이전트엔 "저장소를 직접 뒤지는" 모호한 동작으로 보여 헤맴의 근원이 된다.
      // 명시 워크스페이스 밖으로는 자동 폴백하지 않고 null을 돌려, 호출부가
      // "해당 워크스페이스 없음 + 후보"를 결정적으로 안내하게 한다.
      if (!opts.workspace) {
        const siblingMatch = findSiblingTicketEntryBySelector(opts, key);
        if (siblingMatch) return siblingMatch;
      }
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

// #906: pickTicketEntry always resolves a single winner (or null) even when
// multiple tickets are live, so closing the ticket a session was just on can
// silently surface a totally unrelated one with zero warning. This helper lets
// selector-less call sites (currently: `ticket status`) detect that ambiguity
// and ask the caller to disambiguate with --id instead of guessing. It does not
// change pickTicketEntry's contract, so the other 14+ call sites keep their
// existing (silent-newest-wins) behavior unless/until they opt in to this check.
export function findLiveTicketCandidates(opts, indexJson) {
  const ticketSelector = opts.ticketId || (!opts.summary && !opts.planBody && !opts.planBodyFile ? opts.title : "");
  if (ticketSelector) return null; // explicit selector: no ambiguity to report
  const rows = filterTicketEntries(indexJson.entries, opts);
  const live = rows.filter(e => isLiveTicketEntry(e));
  return live.length >= 2 ? live : null;
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
    throw new Error("ticket archive: --id or --latest is required.");
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
    throw new Error("ticket discard: --id or --latest is required.");
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
    if (!absPath) {
      const hint = buildTicketNotFoundHint(opts.cwd, ticketId, ticketsRoot);
      throw new Error([`ticket discard: no matching entry for '${ticketId}'`, ...hint].join("\n"));
    }
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
  // #811: phase1(미승인)과 phase2(구현 중, plan 정정 대상)는 discard 허용.
  // phase3+ 또는 종료/아카이브 상태는 close/archive를 쓰도록 막는다(실행 산출물 보호).
  const isDiscardablePhase = phase <= 2;
  const isDiscardableStatus = status === "open" || status === "approval_required";
  if (!isDiscardablePhase || !isDiscardableStatus) {
    throw new Error(`ticket discard: ${found.id} is not a discardable open ticket (phase<=2). Use ticket close/archive for verified or executed work.`);
  }

  // #837: non-human actors must confirm discard explicitly (last-resort gate).
  assertLastResortConfirmed(opts, "discard");

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
    status: "discarded",
    // #837: record who discarded (actor attribution).
    agentId: opts.agentId || "",
    sessionMode: opts.sessionMode || "",
    originSource: opts.source || ""
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

// #834: strip a known trailing relative path off an absolute path to recover the root it
// was joined against. Tolerant of / vs \ so it works cross-platform (win32 abs paths hold
// backslashes; computeTicketPath emits forward slashes). Falls back to dirname(abs) if the
// suffix doesn't line up, which is still inside the same store for a group-rooted ticket.
function stripRelPathSuffix(absPath, relPath) {
  const absNorm = String(absPath || "").replace(/\\/g, "/").replace(/\/+$/, "");
  const relNorm = String(relPath || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (relNorm && absNorm.toLowerCase().endsWith("/" + relNorm.toLowerCase())) {
    const root = absNorm.slice(0, absNorm.length - relNorm.length - 1);
    // Re-normalize to the host separator via makePath so downstream joins stay consistent.
    return makePath(root);
  }
  return dirname(absPath);
}

// #834: true iff `target` resolves to `dir` or a descendant of it. Uses path.relative so
// a ".." prefix (escape) or absolute result (different drive/root) both read as "outside".
function isPathInsideDir(target, dir) {
  const rel = relative(makePath(dir), makePath(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolutePathLike(rel));
}

function isAbsolutePathLike(p) {
  const s = String(p || "");
  return s.startsWith("/") || s.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(s);
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
    opts.latest = true; // Default to latest
  }

  const index = loadTicketIndex(opts);
  const entry = pickTicketEntry(opts, index);

  if (!entry) throw new Error("No matching ticket found to move.");

  const { absPath: abs, meta: parsedMeta, content: rawContent, docmeta: existingDocMeta } = readTicketDocument(opts.cwd, entry, { action: "ticket move", requireExists: true });

  // #808: inject evidence sections provided via move flags (--execution-result,
  // --verification, --reproduction, ...) into the ticket body BEFORE the transition
  // gate reads `content`, so the agent satisfies phase3→4 / phase2→3 from the CLI
  // instead of hand-editing the .md. The substantive-content gate then validates the
  // freshly merged sections — empty flags merge nothing and the gate still fails.
  const targetStateForEvidence = Number.isFinite(Number(opts.phase))
    ? `phase${normalizeTicketPhaseNumber(opts.phase)}`
    : opts.next
      ? `phase${Math.min(normalizeTicketPhaseNumber(Number(parsedMeta.phase || 1)) + 1, 4)}`
      : "";
  const evidenceSections = buildEvidenceSectionsForTransition(opts, targetStateForEvidence);
  const content = evidenceSections.length
    ? mergeH2SectionsIntoBody(rawContent, evidenceSections)
    : rawContent;

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
  // #837: rollback (moving to a LOWER phase, incl. reopen to phase1) is a last-resort
  // action — gate it for non-human actors just like discard. Forward moves are never
  // affected. Uses the resolved nextPhase so it also catches --to 1 reopen and any
  // multi-step downshift.
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
  // #834: anchor the reopen target to the CANONICAL ticket root — the root that the
  // resolved source file `abs` actually lives under — NOT to opts.cwd. On a rollback
  // (phase→1) opts.cwd can be the workspace root rather than the ticket-home store dir;
  // re-joining a relative path (computeTicketPath → "main/<id>.md") against it wrote the
  // file to D:/workspace/<ws>/main/ and then rmSync'd the canonical original, making the
  // ticket vanish from the registry. Derive the root by stripping the entry's own current
  // relative path off `abs`, then re-join the reopen rel path so the file stays canonical.
  const canonicalTicketRoot = stripRelPathSuffix(abs, computeTicketPath(entry));
  const reopenTargetAbsPath = reopenTargetRelPath
    ? makePath(canonicalTicketRoot, reopenTargetRelPath)
    : abs;
  // [DC-HALT] Guard: never let a reopen escape the canonical ticket root into a workspace
  // path. If the computed target would land outside the store the source file lives in,
  // halt loudly instead of silently relocating (and deleting) the canonical ticket.
  if (reopenTargetRelPath && !isPathInsideDir(reopenTargetAbsPath, canonicalTicketRoot)) {
    throw new Error(
      `ticket move: refusing to reopen ticket ${entry.id} outside its canonical store — ` +
      `target ${reopenTargetAbsPath} is not under ${canonicalTicketRoot}. This is the #834 ` +
      `path-drift guard; fix the ticket root resolution rather than relocating the file.`
    );
  }

  if (currentPhase === 1 && nextPhase >= 2) {
    const reasons = getPhase1IncompleteReasons(opts.cwd, abs);
    if (reasons.length) {
      throw new Error(`[VALIDATION FAILED] Ticket ${entry.id} has incomplete Phase 1 planning evidence: ${reasons.join(", ")}. Fill substantive APC and compact plan content before moving to Phase 2.`);
    }
    if (!hasExplicitExecutionApproval(opts)) {
      throw new Error(`[APPROVAL REQUIRED] Ticket ${entry.id} cannot move from Phase 1 to Phase 2 without explicit review approval. Re-run with --workflow execute or --approval approved after the plan is reviewed.`);
    }
  }

  // #811: phase 갱신을 DocMeta 산출 "전에" 반영해, 본문 DocMeta의 state.phase가
  // 목적지 phase를 정확히 가리키게 한다(과거: transition.to 기준이라 출발 phase로 남아
  // front-matter와 어긋나는 드리프트 발생). 그리고 DocMeta 불변부는 보존하고
  // 업데이트부만 교체한다(mergeDocMetaUpdate) — 매번 전체 재생성하지 않는다.
  parsedMeta.phase = nextPhase;
  parsedMeta.status = transition.status;
  const freshDocMeta = transition.from === transition.to
    ? existingDocMeta
    : collectTicketTransitionValidationDocMeta(opts.cwd, abs, parsedMeta, content, opts, transition.to);
  const transitionDocMeta = mergeDocMetaUpdate(existingDocMeta, freshDocMeta);
  // front-matter의 docmeta* 미러는 폐지(#811). 과거 잔재만 청소한다.
  const nextMeta = clearDocMetaFrontmatterSummary(parsedMeta);
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
      to: transition.to,
      // #837: record who moved the ticket (actor attribution) — matters most for rollbacks.
      agentId: opts.agentId || "",
      sessionMode: opts.sessionMode || "",
      originSource: opts.source || ""
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
    // "페이즈 이동 시 다음 단계 가이드"가 표시되지 않는다. #908: status/use와 동일한
    // printPhaseAdvanceHint SSOT로 통일(DR-03).
    printPhaseAdvanceHint(entry.id, nextPhase, parsedMeta.status, opts);
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
    opts.latest = true; // Default to latest
  }

  // --reason is the gate for hotfix: bypassing standard APC rules requires an
  // explicit, recorded justification. A terminal y/N prompt added no real
  // protection (it was auto-skipped under --non-interactive) so it is gone.
  if (!opts.reason) {
    throw new Error("[HOTFIX DENIED] A mandatory --reason must be provided to justify bypassing standard rules (e.g., 'codegen is broken').");
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
