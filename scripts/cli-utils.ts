import { createHash } from "crypto";
import { existsSync,mkdirSync,readdirSync,readFileSync,statSync,writeFileSync } from "fs";
import { homedir } from "os";
import { basename,dirname,posix,relative,resolve,win32 } from "path";
import { fileURLToPath,pathToFileURL } from "url";
import YAML from "yaml";

export type CliOpts = Record<string, any>;

export type SurfaceKind = "global" | "spoke" | "ticket" | "skill";
export type SurfaceArea = "entry" | "rules" | "phase1" | "phase2" | "phase3" | "phase4";

export type SurfaceContext = {
  platform: "claude" | "codex" | "cursor" | "copilot" | "antigravity";
  surfaceKind: SurfaceKind;
  area: SurfaceArea;
  workspace: string | null;
  activeTicketId: string | null;
  roleIdentity: string | null;
  exposedSkills: string[];
  coreRules: string;
  agentRules: string;
  skillRules: string;
  dynamicContext: string;
  budgetLines: number;
};

export function countSurfaceLines(content: string) {
  return String(content || "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .length;
}

export function composeSurfaceWithinBudget(
  blocks: Array<{ id: string; content: string; priority: number; required?: boolean }>,
  budgetLines: number,
) {
  const sortedBlocks = [...blocks]
    .filter((block) => String(block.content || "").trim().length > 0)
    .sort((left, right) => {
      if (left.required !== right.required) return left.required ? -1 : 1;
      return left.priority - right.priority;
    });

  const included: string[] = [];
  let usedLines = 0;

  for (const block of sortedBlocks) {
    const blockLines = countSurfaceLines(block.content);
    if (block.required || usedLines + blockLines <= budgetLines) {
      included.push(block.content);
      usedLines += blockLines;
    }
  }

  return included.join("\n\n");
}

let _ticketHomeModule = null;
export function registerTicketHomeModule(mod) { _ticketHomeModule = mod; }

export function readJsonFile(absPath, initial = null) {
  if (!existsSync(absPath)) return initial;
  const raw = readFileSync(absPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(localized(UTIL_TEXT.corruptJson, { path: absPath, message: err.message }));
  }
}

function ticketHomeModule() {
  if (!_ticketHomeModule) throw new Error(localized(UTIL_TEXT.ticketHomeUnregistered));
  return _ticketHomeModule;
}

/** Converts an absolute path to a clickable file:/// URI */
export function toFileUri(absPath) {
  return pathToFileURL(absPath).href;
}

/** writeFileSync wrapper that always normalizes to LF before writing */
export function writeFileLF(path: string, content: string, encoding: BufferEncoding = "utf8") {
  const normalized = String(content).replace(/\r\n/g, "\n");
  writeFileSync(path, normalized, encoding);
}

export const DEUK_ROOT_DIR = ".deuk";
export const WORKSPACE_MARKER_FILE = ".deuk-workspace-id";
export const TICKET_SUBDIR = "tickets";
export const WORKFLOW_MODE_PLAN = "plan";
export const WORKFLOW_MODE_EXECUTE = "execute";

export function deukRel(...segments: string[]): string {
  return makePath(DEUK_ROOT_DIR, ...segments);
}

export const TICKET_INDEX_FILENAME = "INDEX.json";
export const TICKET_LIST_FILENAME = "TICKET_LIST.md";

export const LEGACY_DEUK = {
  rootDir: ".deuk-agent",
  templateDir: ".deuk-agent-templates",
  ticketDir: ".deuk-agent-ticket",
  ticketDirPlural: ".deuk-agent-tickets",
  configFile: ".deuk-agent-rule.config.json",
  ticketGroupRoot: "ticket",
  dirs: [
    ".deuk-agent-templates",
    ".deuk-agent-tickets",
    ".deuk-agent-ticket",
    ".deuk-agent",
  ],
} as const;

export const ARCHIVE_YEAR_MONTH_RE = /^\d{4}-\d{2}$/;
export const ARCHIVE_DAY_RE = /^\d{2}$/;

const LEGACY_TICKET_GROUPS = new Set<string>([
  LEGACY_DEUK.ticketDir,
  LEGACY_DEUK.ticketDirPlural,
  "ticket",
  "tickets"
]);

/** Computes the canonical repository-relative path for a ticket based on its state. */
export function computeTicketPath(entry) {
  const isArchived = entry.status === "archived";
  const group = normalizeTicketGroup(entry.group, "sub");
  const fileStem = entry.fileName
    ? String(entry.fileName).replace(/\.md$/i, "")
    : entry.id;

  if (!isArchived && group === TICKET_SUBDIR) {
    return `${fileStem}.md`;
  }

  if (isArchived && entry.archiveYearMonth) {
    return ["archive", group, entry.archiveYearMonth, `${fileStem}.md`].join("/");
  }

  const parts = [
    isArchived ? "archive" : null,
    group,
    `${fileStem}.md`
  ].filter(Boolean);
  return parts.join("/");
}

export function normalizeTicketGroup(rawGroup, fallback = "sub") {
  const value = String(rawGroup || "").trim();
  if (!value) return fallback;
  if (value.includes("/") || value.startsWith("TICKET-") && value.includes(".md")) return fallback;
  if (value.endsWith(".md")) return fallback;
  if (value.endsWith(".markdown")) return fallback;
  if (LEGACY_TICKET_GROUPS.has(value)) return fallback;
  return value;
}

export const CONFIG_FILENAME = "config.json";
export const GLOBAL_CONFIG_FILENAME = "config.json";
export const INIT_CONFIG_VERSION = 1;

export const AGENT_TOOLS = [
  { label: "OpenAI Codex", value: "codex" },
  { label: "GitHub Copilot", value: "copilot" },
  { label: "Claude Code", value: "claude" },
  { label: "Cursor", value: "cursor" },
  { label: "Gemini / Antigravity", value: "gemini" },
  { label: "Windsurf", value: "windsurf" },
  { label: "JetBrains AI Assistant", value: "jetbrains" },
];

export const SPOKE_REGISTRY = [
  { id: "cursor", detect: (cwd) => existsSync(makePath(cwd, ".cursor")), legacy: ".cursorrules", target: ".cursor/rules/deuk-agent.mdc", format: "mdc" },
  { id: "claude", detect: (cwd) => existsSync(makePath(cwd, "CLAUDE.md")) || existsSync(makePath(cwd, ".claude")), legacy: "CLAUDE.md", target: ".claude/rules/deuk-agent.md", format: "markdown" },
  { id: "copilot", detect: (cwd, tools = []) => tools.includes("copilot") || existsSync(makePath(cwd, ".github")), legacy: null, target: ".github/copilot-instructions.md", format: "markdown" },
  { id: "codex", detect: (cwd, tools = []) => tools.includes("codex") || existsSync(makePath(cwd, ".codex")), legacy: null, target: ".codex/AGENTS.md", format: "markdown" },
  { id: "windsurf", detect: (cwd) => existsSync(makePath(cwd, ".windsurf")), legacy: ".windsurfrules", target: ".windsurf/rules/deuk-agent.md", format: "markdown" },
  { id: "jetbrains", detect: (cwd) => existsSync(makePath(cwd, ".aiassistant")) || existsSync(makePath(cwd, ".idea")), legacy: null, target: ".aiassistant/rules/deuk-agent.md", format: "markdown" },
  { id: "antigravity", detect: (cwd, tools = []) => tools.includes("gemini") || existsSync(makePath(cwd, "GEMINI.md")) || existsSync(makePath(cwd, ".gemini")) || existsSync(makePath(cwd, ".mcp.json")), legacy: "AGENTS.md", target: "GEMINI.md", format: "markdown" }
];

export function normalizeDocsLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "auto") return "auto";
  if (normalized.startsWith("ko") || normalized === "kr" || normalized === "korean") return "ko";
  if (normalized.startsWith("en") || normalized === "english") return "en";
  return "auto";
}

const NEUTRAL_POSIX_LOCALE = /^(c|posix)(\.|@|$)/;

export function inferDocsLanguageFromEnv(env = process.env) {
  const posix = String(env.LANG || env.LC_ALL || env.LC_MESSAGES || "").toLowerCase();
  if (posix && !NEUTRAL_POSIX_LOCALE.test(posix)) return posix.includes("ko") ? "ko" : "en";
  try {
    const osLocale = String(Intl.DateTimeFormat().resolvedOptions().locale || "").toLowerCase();
    if (osLocale.includes("ko")) return "ko";
    if (osLocale) return "en";
  } catch {
  }
  return "en";
}

export function inferDocsLanguageFromText(text) {
  const src = String(text || "");
  const hangulCount = (src.match(/[\u3131-\u318e\uac00-\ud7a3]/g) || []).length;
  if (hangulCount >= 2) return "ko";

  const latinWords = src.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  if (latinWords.length >= 2) return "en";

  return null;
}

export function resolveDocsLanguage(value, env = process.env) {
  const normalized = normalizeDocsLanguage(value);
  if (normalized === "auto") return inferDocsLanguageFromEnv(env);
  return normalized;
}

let _surfaceLocale: string | null = null;

export function setSurfaceLocale(docsLanguage) {
  _surfaceLocale = resolveDocsLanguage(docsLanguage);
}

export function surfaceLocale() {
  if (_surfaceLocale) return _surfaceLocale;
  _surfaceLocale = resolveDocsLanguage(loadInitConfig(null)?.docsLanguage || "auto");
  return _surfaceLocale;
}

export function localized(entry: { ko: string; en: string }, replacements: Record<string, string> = {}) {
  const text = surfaceLocale() === "en" ? entry.en : entry.ko;
  return Object.entries(replacements).reduce(
    (acc, [key, value]) => acc.split(`{${key}}`).join(String(value)),
    text,
  );
}

export const UTIL_TEXT = {
  surfaceContextMissing: { ko: "surface context 에 필수 필드가 없다: {fields}", en: "surface context missing required field(s): {fields}" },
  corruptJson: {
    ko: "{path} 의 JSON 이 깨졌다: {message} — 파일을 고치거나 지워라(No-Fallback Gate: 조용히 기본값으로 메우지 않는다)",
    en: "corrupt JSON at {path}: {message} — fix or remove the file (No-Fallback Gate: not silently defaulted)",
  },
  ticketHomeUnregistered: { ko: "ticket home 모듈이 등록되지 않았다", en: "ticket home module not registered" },
  interactiveRequired: { ko: "대화형 터미널이 필요하다.", en: "Interactive terminal required." },
  refNotFound: { ko: "--ref 파일을 찾을 수 없다: ", en: "--ref file not found: " },
  slugValidation: {
    ko: "[검증 실패] {field} 는 비어 있지 않은 ASCII 슬러그를 만들어야 한다. 받은 값: {received}. \"basic-protocol-pack-unpack-test-redefinition\" 같은 ASCII 제목을 쓰라.",
    en: "[VALIDATION FAILED] {field} must produce a non-empty ASCII slug. Received: {received}. Use an ASCII title such as \"basic-protocol-pack-unpack-test-redefinition\".",
  },
} as const;

export function selectLocalizedTemplatePath(baseDir, templateName, docsLanguage = "en") {
  const normalized = resolveDocsLanguage(docsLanguage);
  const localizedName = `${templateName.replace(/\.md$/i, "")}.${normalized}.md`;
  const localizedPath = makePath(baseDir, localizedName);
  if (existsSync(localizedPath)) return localizedPath;
  return makePath(baseDir, templateName);
}

export function loadInitConfig(cwd, opts: CliOpts = {}) {
  const targets = [
    getUserInitConfigPath(opts)
  ].filter(Boolean);

  for (const target of targets) {
    if (!existsSync(target)) continue;
    try {
      const j = JSON.parse(readFileSync(target, "utf8"));
      if (j.version !== INIT_CONFIG_VERSION) continue;
      if (!j.docsLanguage) j.docsLanguage = "auto";
      const workflowMode = normalizeWorkflowMode(j.workflowMode ?? j.approvalState);
      j.workflowMode = workflowMode;
      j.approvalState = workflowMode === WORKFLOW_MODE_EXECUTE ? "approved" : "pending";
      if (j.scmIgnoreDeukAgent === undefined) j.scmIgnoreDeukAgent = !Boolean(j.shareTickets);
      j.configPath = target;
      j.configScope = "user";
      return j;
    } catch (err) {
      if (process.env.DEBUG) console.warn(`[DEBUG] Failed to parse config ${target}:`, err);
    }
  }
  return null;
}

export function resolveUserHome(opts: CliOpts = {}) {
  return opts.homeDir || homedir();
}

export function makePath(...args) {
  let opts: CliOpts = {};
  if (args.length > 1 && args[args.length - 1] && typeof args[args.length - 1] === "object" && !Array.isArray(args[args.length - 1])) {
    opts = args.pop();
  }
  const segments = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  const platform = opts.platform || process.platform;
  const mod = platform === "win32" ? win32 : posix;
  const foreign = platform === "win32" ? /\//g : /\\/g;
  const parts = segments
    .map(part => String(part ?? ""))
    .filter(part => part.length > 0)
    .map(part => part.replace(foreign, mod.sep));
  return mod.join(...parts);
}

let _packageRootCache: string | null = null;
export function resolvePackageRoot(opts: CliOpts = {}): string {
  if (opts.packageRoot) return opts.packageRoot;
  if (!opts.noCache && _packageRootCache) return _packageRootCache;
  const startFile = opts.fromUrl ? fileURLToPath(opts.fromUrl) : fileURLToPath(import.meta.url);
  let dir = dirname(startFile);
  while (true) {
    if (existsSync(makePath(dir, "package.json"))) break;
    const parent = dirname(dir);
    if (parent === dir) break; // reached root without a marker — fall back to original dir
    dir = parent;
  }
  if (!opts.noCache) _packageRootCache = dir;
  return dir;
}

export function basenameAnyOS(value) {
  return String(value ?? "").split(/[\\/]/).filter(Boolean).pop() || "";
}

function legacyRoamingConfigDir(opts: CliOpts = {}) {
  const platform = opts.platform || process.platform;
  const env = opts.env || process.env;
  const homeDir = resolveUserHome(opts);
  if (platform !== "win32") return "";
  const base = env.APPDATA || makePath([homeDir, "AppData", "Roaming"], { platform });
  return makePath([base, "deuk-agent-flow"], { platform });
}

function migrateLegacyRoamingConfig(targetPath: string, opts: CliOpts = {}) {
  if (existsSync(targetPath)) return;
  const legacyDir = legacyRoamingConfigDir(opts);
  if (!legacyDir) return;
  const legacyPath = makePath([legacyDir, GLOBAL_CONFIG_FILENAME], opts);
  if (!existsSync(legacyPath)) return;
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, readFileSync(legacyPath, "utf8"));
}

export function getUserInitConfigPath(opts: CliOpts = {}) {
  const targetPath = makePath([resolveUserHome(opts), DEUK_ROOT_DIR, GLOBAL_CONFIG_FILENAME], opts);
  migrateLegacyRoamingConfig(targetPath, opts);
  return targetPath;
}

export function getUserSkillsDir(opts: CliOpts = {}) {
  return makePath([resolveUserHome(opts), DEUK_ROOT_DIR, "skills"], opts);
}

export function getUserSkillsConfigPath(opts: CliOpts = {}) {
  return makePath([resolveUserHome(opts), DEUK_ROOT_DIR, "skills.json"], opts);
}

export function getWorkspaceInitConfigPath(cwd) {
  return makePath(cwd, deukRel(CONFIG_FILENAME));
}

export function normalizeWorkflowMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return WORKFLOW_MODE_PLAN;
  if (["execute", "approved", "approval", "apply", "apply-changes"].includes(normalized)) {
    return WORKFLOW_MODE_EXECUTE;
  }
  if (["plan", "pending", "review", "prepare", "prepare-only"].includes(normalized)) {
    return WORKFLOW_MODE_PLAN;
  }
  return normalized === WORKFLOW_MODE_EXECUTE ? WORKFLOW_MODE_EXECUTE : WORKFLOW_MODE_PLAN;
}

function workflowModeInput(opts: CliOpts = {}, savedConfig = null) {
  return opts.workflowMode ?? opts.approval ?? savedConfig?.workflowMode;
}

export function resolveWorkflowMode(opts: CliOpts = {}, savedConfig = null) {
  return normalizeWorkflowMode(workflowModeInput(opts, savedConfig));
}

export function isWorkflowExecute(opts: CliOpts = {}, savedConfig = null) {
  return resolveWorkflowMode(opts, savedConfig) === WORKFLOW_MODE_EXECUTE;
}

export function toPosixPath(p) {
  return p.replace(/\\/g, "/");
}

export function toRepoRelativePath(cwd, absPath) {
  return toPosixPath(relative(cwd, absPath));
}

/** ?덉??ㅽ듃由?湲곕컲 ?뚰겕?ㅽ럹?댁뒪 猷⑦듃 湲곗? ?곷?寃쎈줈 ??留곹겕/寃쎈줈 異쒕젰???ъ슜 티켓은 홈 스토어(~/.deuk/tickets/{uuid}/, 보통 C:)에 살고 워크스페이스 cwd는 */
export function toWsRelativePath(_cwd, absPath) {
  return toPosixPath(makePath(resolve(absPath))).replace(/^[a-zA-Z]:/, "");
}

export function toDriveAbsolutePath(absPath) {
  return toPosixPath(makePath(resolve(absPath)));
}

const HANGUL_CHO = ["g","kk","n","d","tt","r","m","b","pp","s","ss","","j","jj","ch","k","t","p","h"];
const HANGUL_JUNG = ["a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","wo","we","wi","yu","eu","ui","i"];
const HANGUL_JONG = ["","g","kk","gs","n","nj","nh","d","l","lg","lm","lb","ls","lt","lp","lh","m","b","bs","s","ss","ng","j","ch","k","t","p","h"];

export function hangulToRoman(input) {
  let out = "";
  for (const ch of String(input || "")) {
    const code = ch.codePointAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const offset = code - 0xac00;
      const cho = Math.floor(offset / 588);
      const jung = Math.floor((offset % 588) / 28);
      const jong = offset % 28;
      out += HANGUL_CHO[cho] + HANGUL_JUNG[jung] + HANGUL_JONG[jong];
    } else {
      out += ch;
    }
  }
  return out;
}

function asciiSlug(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toSlug(input) {
  const slug = asciiSlug(input);
  if (slug) return slug;
  return asciiSlug(hangulToRoman(input));
}

function normalizeWorkspaceLookup(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s._/\-]+/g, "")
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3]/g, "");
}

function splitWorkspaceNameParts(input) {
  return String(input || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

export function buildWorkspaceAliases(id, workspacePath, extraAliases = []) {
  const baseName = basename(workspacePath);
  const rawNames = [id, baseName, ...extraAliases].map(value => String(value || "").trim()).filter(Boolean);
  const aliases = new Set(rawNames);
  for (const rawName of rawNames) {
    const slug = toSlug(rawName);
    if (slug) aliases.add(slug);

    const parts = splitWorkspaceNameParts(rawName);
    if (parts.length > 1) {
      aliases.add(parts.join(" "));
      aliases.add(parts.join("-"));
    }
    if (parts.length > 1 && parts[0].toLowerCase() === "deuk") {
      const withoutDeukParts = parts.slice(1);
      const withoutDeuk = withoutDeukParts.join("-");
      if (withoutDeuk) {
        aliases.add(withoutDeuk);
        aliases.add(withoutDeukParts.join(" "));
      }
      const lastPart = parts[parts.length - 1];
      if (lastPart) aliases.add(lastPart);
    }
    if (parts.length > 2 && parts[0].toLowerCase() === "deuk" && parts[1].toLowerCase() === "ai") {
      const withoutDeukAiParts = parts.slice(2);
      const withoutDeukAi = withoutDeukAiParts.join("-");
      if (withoutDeukAi) {
        aliases.add(withoutDeukAi);
        aliases.add(withoutDeukAiParts.join(" "));
      }
    }
  }
  return Array.from(aliases);
}

export function buildPromptWorkspaceAliases(workspace) {
  const promptAliases = new Set();
  const rawCanonicalNames = [workspace?.id, basename(workspace?.path || "")]
    .map(value => String(value || "").trim())
    .filter(Boolean);

  for (const rawName of rawCanonicalNames) {
    promptAliases.add(rawName);
    const slug = toSlug(rawName);
    if (slug) promptAliases.add(slug);

    const parts = splitWorkspaceNameParts(rawName);
    if (parts.length > 1) {
      promptAliases.add(parts.join(" "));
      promptAliases.add(parts.join("-"));
    }
  }

  const canonicalSlugs = rawCanonicalNames.map(name => toSlug(name)).filter(Boolean);
  const isSpecificPromptAlias = (alias) => {
    if (/[\s-]/.test(alias)) return true;
    const slug = toSlug(alias);
    if (!slug) return false;
    return canonicalSlugs.some(canonical => slug === canonical || slug.includes(canonical));
  };
  for (const registryAlias of workspace?.registryAliases || []) {
    const trimmed = String(registryAlias || "").trim();
    if (trimmed && isSpecificPromptAlias(trimmed)) promptAliases.add(trimmed);
  }

  return Array.from(promptAliases);
}

export function hasWorkspaceMarker(candidatePath) {
  return existsSync(makePath(candidatePath, WORKSPACE_MARKER_FILE));
}

export const PROJECT_RULE_FILE = "PROJECT_RULE.md";

// 프로젝트당 PROJECT_RULE.md는 워크스페이스 루트에 하나만 둔다.
export function getProjectRulePath(workspaceRoot: string): string {
  return makePath(workspaceRoot, PROJECT_RULE_FILE);
}

function hasLocalProjectBoundary(candidatePath) {
  return existsSync(makePath(candidatePath, ".git")) ||
    existsSync(makePath(candidatePath, "AGENTS.md")) ||
    existsSync(getProjectRulePath(candidatePath));
}

function directProjectRoot(startDir) {
  const current = resolve(startDir);
  if (hasWorkspaceMarker(current)) return current;
  const parent = dirname(current);
  if (parent !== current && hasWorkspaceMarker(parent)) return parent;
  return null;
}

export function normalizeRegistryPath(value) {
  let p = String(value || "").trim();
  const wsl2 = p.match(/^\/mnt\/([a-zA-Z])(\/.*)?$/);
  if (wsl2) p = wsl2[1].toUpperCase() + ":" + (wsl2[2] || "\\").replace(/\//g, "\\");
  const wsl1 = p.match(/^\/([a-zA-Z])(\/.*)?$/);
  if (wsl1) p = wsl1[1].toUpperCase() + ":" + (wsl1[2] || "\\").replace(/\//g, "\\");
  p = p.replace(/^([a-z]):/, (_, d) => d.toUpperCase() + ":");
  if (/^[A-Za-z]:[\\/]/.test(p)) return win32.resolve(p);
  return resolve(p);
}

function hashWorkspacePath(value) {
  return createHash("sha256").update(normalizeRegistryPath(String(value || "")), "utf8").digest("hex");
}

export function getSiblingWorkspaceRegistryRoot(homeDir = resolveUserHome()) {
  return makePath(homeDir, ".agent-flow", "workspace");
}

export function getSiblingWorkspaceRegistryGroupPath(parentRoot, opts: CliOpts = {}) {
  const homeDir = resolveUserHome(opts);
  return makePath(getSiblingWorkspaceRegistryRoot(homeDir), hashWorkspacePath(parentRoot));
}

export function loadRegistrySiblingWorkspaceCandidates(startDir, opts: CliOpts = {}) {
  const current = resolve(startDir);
  const currentRoot = directProjectRoot(current);
  const parentRoot = currentRoot ? dirname(currentRoot) : dirname(current);
  const registryDir = getSiblingWorkspaceRegistryGroupPath(parentRoot, opts);
  if (!existsSync(registryDir)) return null;

  const workspaces = [];
  try {
    for (const entry of readdirSync(registryDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const registryPath = makePath(registryDir, entry.name);
      let record = null;
      try {
        record = JSON.parse(readFileSync(registryPath, "utf8"));
      } catch {
        continue;
      }
      const workspacePath = normalizeRegistryPath(String(record?.path || ""));
      const id = String(record?.name || basename(workspacePath)).trim();
      if (!id || !workspacePath || !hasWorkspaceMarker(workspacePath)) continue;
      if (isInsideHomeStore(workspacePath)) continue;
      const registryAliases = Array.isArray(record?.aliases)
        ? record.aliases.map(value => String(value || "").trim()).filter(Boolean)
        : [];
      workspaces.push({
        id,
        path: workspacePath,
        aliases: buildWorkspaceAliases(id, workspacePath, registryAliases),
        registryAliases,
        registryPath
      });
    }
  } catch {
    return null;
  }

  if (workspaces.length === 0) return null;
  return { path: registryDir, root: parentRoot, workspaces, discovered: false, registry: true };
}

export function loadAllRegistryWorkspaceCandidates(opts: CliOpts = {}) {
  const homeDir = resolveUserHome(opts);
  const ticketsRoot = makePath([homeDir, DEUK_ROOT_DIR, "tickets"], opts);
  if (!existsSync(ticketsRoot)) return null;

  const byPath = new Map();
  try {
    for (const ent of readdirSync(ticketsRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!ent.isDirectory()) continue;
      const dir = makePath(ticketsRoot, ent.name);

      let workspacePath = "", name = "", aliases = [];
      try {
        const meta = JSON.parse(readFileSync(makePath(dir, "workspace.json"), "utf8"));
        workspacePath = normalizeRegistryPath(String(meta?.path || ""));
        name = String(meta?.name || "").trim();
        if (Array.isArray(meta?.aliases)) aliases = meta.aliases.map(a => String(a || "").trim()).filter(Boolean);
      } catch { continue; }  // no workspace.json → not a candidate yet

      if (!workspacePath || !hasWorkspaceMarker(workspacePath)) continue;
      if (isInsideHomeStore(workspacePath)) continue;
      if (isHomeDirectChild(workspacePath, opts)) continue;
      if (!name) name = basename(workspacePath);

      byPath.set(workspacePath, {
        id: name,
        path: workspacePath,
        aliases: buildWorkspaceAliases(name, workspacePath, aliases),
        registryAliases: aliases,
      });
    }
  } catch {
    return null;
  }

  const all = Array.from(byPath.values());
  const paths = all.map(w => w.path);
  const kept = all.filter(w => !paths.some(p =>
    p !== w.path && (w.path === p + "/" || w.path.startsWith(p + "/") || w.path.startsWith(p + "\\"))
  ));

  const workspaces = kept.sort((a, b) => a.id.localeCompare(b.id));
  if (workspaces.length === 0) return null;
  return { path: ticketsRoot, root: ticketsRoot, workspaces, discovered: false, registry: true, global: true };
}

export function discoverSiblingWorkspaces(startDir) {
  const current = resolve(startDir);
  const currentRoot = directProjectRoot(current);
  const discoveryRoot = currentRoot ? dirname(currentRoot) : dirname(current);
  const workspaces = [];

  try {
    for (const item of readdirSync(discoveryRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!item.isDirectory() || item.name.startsWith(".")) continue;
      const workspacePath = makePath(discoveryRoot, item.name);
      if (!hasWorkspaceMarker(workspacePath)) continue;
      workspaces.push({
        id: item.name,
        path: workspacePath,
        aliases: buildWorkspaceAliases(item.name, workspacePath),
        registryAliases: []
      });
    }
  } catch {
    return null;
  }

  if (workspaces.length === 0) return null;
  return { path: null, root: discoveryRoot, workspaces, discovered: true };
}

export function loadSiblingWorkspaceCandidates(startDir) {
  return loadRegistrySiblingWorkspaceCandidates(startDir) || discoverSiblingWorkspaces(startDir);
}

export function loadWorkspaceCandidates(startDir, opts: CliOpts = {}) {
  return loadAllRegistryWorkspaceCandidates(opts);
}

function workspaceQueryMatches(query, workspace) {
  const normalizedQuery = normalizeWorkspaceLookup(query);
  if (!normalizedQuery) return false;
  for (const alias of workspace.aliases || []) {
    const normalizedAlias = normalizeWorkspaceLookup(alias);
    if (!normalizedAlias) continue;
    if (normalizedQuery === normalizedAlias) return true;
  }
  return false;
}

export function findPromptWorkspaceMatches(prompt, candidates) {
  const normalizedPrompt = normalizeWorkspaceLookup(prompt);
  if (!normalizedPrompt || !candidates?.workspaces?.length) return [];

  const matches = [];
  for (const workspace of candidates.workspaces) {
    let bestAliasLength = 0;
    for (const alias of workspace.aliases || []) {
      const normalizedAlias = normalizeWorkspaceLookup(alias);
      if (normalizedAlias && normalizedPrompt.includes(normalizedAlias)) {
        bestAliasLength = Math.max(bestAliasLength, normalizedAlias.length);
      }
    }
    if (bestAliasLength > 0) matches.push({ workspace, bestAliasLength });
  }
  if (matches.length === 0) return [];

  const mostSpecificAliasLength = Math.max(...matches.map(match => match.bestAliasLength));
  return matches
    .filter(match => match.bestAliasLength === mostSpecificAliasLength)
    .map(match => match.workspace)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function resolveWorkspaceTarget(query, opts: CliOpts = {}) {
  const candidates = opts.candidates || loadAllRegistryWorkspaceCandidates(opts);

  if (!candidates) return null;
  const rawQuery = String(query || "").trim();
  if (!rawQuery) {
    return { candidates, target: null, reason: "missing-query" };
  }

  const matches = candidates.workspaces
    .filter(workspace => workspaceQueryMatches(rawQuery, workspace))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (matches.length === 0) return { candidates, target: null, reason: "no-match" };
  if (matches.length > 1) {
    const exact = matches.filter(workspace =>
      (workspace.aliases || []).some(
        alias => String(alias).toLowerCase() === rawQuery.toLowerCase()
      )
    );
    if (exact.length === 1) {
      return { candidates, target: exact[0], reason: "matched", score: 100 };
    }
    return { candidates, target: null, reason: "ambiguous", matches };
  }

  return { candidates, target: matches[0], reason: "matched", score: 100 };
}

export function requireNonEmptySlug(input, fieldName = "value") {
  const slug = toSlug(input);
  if (slug) return slug;

  const received = String(input || "").trim() || "(empty)";
  throw new Error(localized(UTIL_TEXT.slugValidation, { field: fieldName, received: JSON.stringify(received) }));
}

export function findFileRecursively(dir, fileName) {
  if (!existsSync(dir)) return null;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const res = makePath(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursively(res, fileName);
      if (found) return found;
    } else if (entry.name === fileName) {
      return res;
    }
  }
  return null;
}

export function detectProjectFromBody(body) {
  const content = String(body || "");
  const lines = content.split("\n");
  for (const line of lines) {
    const l = line.trim();
    if (l.toLowerCase().startsWith("project:")) {
      return l.split(":")[1].trim();
    }
    if (l.startsWith("# Project:") || l.startsWith("## Project:")) {
      return l.split(":")[1].trim();
    }
  }
  return "global";
}

export function deriveTopicFromBaseName(baseName) {
  const raw = String(baseName || "").split(".")[0];
  const parts = raw.split("-");
  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    const prev = parts[parts.length - 2];
    if (last.length === 6 && prev.length === 8) {
      return parts.slice(0, -2).join("-");
    }
  }
  return toSlug(raw) || raw.toLowerCase();
}

export function resolveReferencedTicketPath(opts) {
  if (!opts.ref) return null;
  const refAbs = makePath(opts.workspaceRoot, opts.ref);
  if (!existsSync(refAbs)) {
    throw new Error(localized(UTIL_TEXT.refNotFound) + opts.ref);
  }
  return toRepoRelativePath(opts.workspaceRoot, refAbs);
}

export function inferRefTitleAndTopic(opts) {
  if (!opts.ref) return null;
  const refAbs = makePath(opts.workspaceRoot, opts.ref);

  let body = "";
  try {
    body = readFileSync(refAbs, "utf8");
  } catch (err) {
    if (process.env.DEBUG) console.warn(`[DEBUG] Failed to read ref ${refAbs}:`, err);
    return null;
  }

  const lines = body.split("\n");
  let title = "";
  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith("## Task:")) {
      title = l.replace("## Task:", "").trim();
      break;
    }
    if (l.startsWith("# ")) {
      title = l.replace("# ", "").trim();
      break;
    }
  }

  const base = basename(refAbs).split(".")[0];
  const finalTitle = title || base;
  return {
    title: String(finalTitle).trim(),
    slug: toSlug(finalTitle),
  };
}

const frontMatterCache = new Map<string, { meta: any; content: string; parseError: string | null }>();
const FRONT_MATTER_CACHE_LIMIT = 512;

export function parseFrontMatter(content) {
  const cacheKey = typeof content === "string" ? content : null;
  if (cacheKey === null) return parseFrontMatterUncached(content);

  let hit = frontMatterCache.get(cacheKey);
  if (!hit) {
    hit = parseFrontMatterUncached(content);
    if (frontMatterCache.size >= FRONT_MATTER_CACHE_LIMIT) frontMatterCache.clear();
    frontMatterCache.set(cacheKey, hit);
  }
  return { meta: structuredClone(hit.meta), content: hit.content, parseError: hit.parseError };
}

function parseFrontMatterUncached(content) {
  const lines = content.split(/\r?\n/);
  if (lines.length < 3 || lines[0].trim() !== "---") {
    return { meta: {}, content, parseError: null };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) return { meta: {}, content, parseError: null };

  const metaStr = lines.slice(1, endIdx).join("\n");
  const bodyStr = lines.slice(endIdx + 1).join("\n");
  try {
    const meta = YAML.parse(metaStr);
    return { meta: meta || {}, content: bodyStr, parseError: null };
  } catch (err) {
    return { meta: {}, content: bodyStr, parseError: err.message || "invalid frontmatter" };
  }
}

export function stripLeadingFrontMatter(content) {
  const original = String(content || "");
  const s = original.replace(/^\s+/, "");
  if (!s.startsWith("---")) return original;
  const rest = s.slice(3);
  const end = rest.search(/\n---(\s*\n|$)/);
  if (end === -1) return original;
  return rest.slice(end + 4).replace(/^\n+/, "");
}

export function stringifyFrontMatter(meta, content) {
  const cleanMeta = sanitizeFrontMatterMeta(meta);
  const yamlStr = YAML.stringify(cleanMeta).trim();
  const cleanContent = stripLeadingFrontMatter(content);
  return `---\n${yamlStr}\n---\n\n\n${cleanContent.trim()}\n`;
}

export function sanitizeFrontMatterMeta(meta: CliOpts = {}) {
  const cleanMeta = { ...meta };
  for (const key of [
    "path",
    "absPath",
    "absolutePath",
    "relativePath",
    "sourcePath",
    "targetPath",
    "workspacePath",
    "rulesPath",
    "ticketPath",
    "docmeta"
  ]) {
    delete cleanMeta[key];
  }
  if (cleanMeta.project === 'global') delete cleanMeta.project;
  if (!cleanMeta.submodule) delete cleanMeta.submodule;
  
  if (typeof cleanMeta.createdAt === 'string' && cleanMeta.createdAt.includes('T')) {
    cleanMeta.createdAt = cleanMeta.createdAt.replace('T', ' ').split('.')[0];
  }
  return cleanMeta;
}

export const DEFAULT_IGNORE_DIRS = ["node_modules", ".git", DEUK_ROOT_DIR, "tmp", "temp", ".tmp", ".cache"];

/** Resolves all potential ticket directories for a given path. */
export function resolveTicketSystemPaths(cwd) {
  return {
    primary: makePath(cwd, DEUK_ROOT_DIR, TICKET_SUBDIR),
    legacy: []
  };
}

export function findWorkspaceRoot(startDir) {
  const home = resolve(resolveUserHome());
  let curr = resolve(startDir);
  while (curr && curr !== dirname(curr)) {
    if (curr === home) return null;
    if (hasWorkspaceMarker(curr)) return curr;
    if (hasLocalProjectBoundary(curr) && curr !== resolve(startDir)) return null;
    curr = dirname(curr);
  }
  if (curr !== home && hasWorkspaceMarker(curr)) return curr;
  return null;
}

export function detectConsumerTicketDir(startDir, opts: CliOpts = {}) {
  const root = findWorkspaceRoot(startDir);
  if (!root) return null;
  try {
    const home = ticketHomeModule();
    if (home.isHomeStoreRoot(root, opts)) return null;
  } catch { /* fall through to legacy resolution below */ }
  try {
    const home = ticketHomeModule();
    return home.resolveHomeTicketDirForWorkspace(root, opts);
  } catch (e) {
    const fallback = resolveTicketSystemPaths(root).primary;
    console.warn(`\x1b[33m[deuk-agent-flow] warning: home ticket dir resolution failed (${e && e.message ? e.message : e}); falling back to in-workspace path: ${fallback}\x1b[0m`);
    console.warn(`\x1b[33m[deuk-agent-flow] tickets written here will NOT be visible to home-store lookups (discard/use/show). Investigate the home resolution failure before continuing.\x1b[0m`);
    return fallback;
  }
}

export function resolveConsumerTicketRoot(startDir, opts: CliOpts = {}) {
  return findWorkspaceRoot(startDir);
}

function isInsideHomeStore(cwd, opts: CliOpts = {}) {
  const here = normalizeRegistryPath(resolve(String(cwd || "")));
  const home = normalizeRegistryPath(resolveUserHome(opts));
  if (here === home) return true;
  const store = normalizeRegistryPath(makePath([resolveUserHome(opts), DEUK_ROOT_DIR], opts));
  return here === store || here.startsWith(store + "/");
}

export function isHomeDirectChild(p, opts: CliOpts = {}) {
  const here = normalizeRegistryPath(String(p || ""));
  const home = normalizeRegistryPath(resolveUserHome(opts));
  for (const sep of ["/", "\\"]) {
    if (here.startsWith(home + sep)) {
      const rest = here.slice(home.length + 1);
      return rest.length > 0 && !rest.includes("/") && !rest.includes("\\");
    }
  }
  return false;
}

export function resolveRealWorkspaceRoot(cwd, opts: CliOpts = {}) {
  if (opts && opts.workspace) return normalizeRegistryPath(opts.workspace);
  if (isInsideHomeStore(cwd, opts)) return null;
  return findWorkspaceRoot(cwd) || null;
}

export function resolveWorkspaceContext(startDir = "") {
  const root = resolveConsumerTicketRoot(startDir) || "";
  return {
    root,
    breadcrumb: root ? basename(root) : ""
  };
}

export function isInsideGitWorkTree(cwd) {
  let curr = resolve(cwd);
  while (curr && curr !== dirname(curr)) {
    if (isGitWorkTreeMarker(makePath(curr, ".git"))) return true;
    curr = dirname(curr);
  }
  return isGitWorkTreeMarker(makePath(curr, ".git"));
}

function isGitWorkTreeMarker(gitMarkerPath) {
  if (!existsSync(gitMarkerPath)) return false;
  const markerStat = statSync(gitMarkerPath);
  if (!markerStat.isDirectory()) return markerStat.isFile();
  return existsSync(makePath(gitMarkerPath, "HEAD")) || existsSync(makePath(gitMarkerPath, "commondir"));
}

/** Unified workspace/submodule discovery. */
export function discoverAllWorkspaces(baseCwd, ignoreDirs = DEFAULT_IGNORE_DIRS, out: Set<string> = new Set<string>()) {
  if (!existsSync(baseCwd)) return Array.from(out);

  const paths = resolveTicketSystemPaths(baseCwd);
  const isWorkspaceRoot = existsSync(paths.primary) || paths.legacy.length > 0;
  if (isWorkspaceRoot) {
    out.add(baseCwd);
    return Array.from(out);
  }

  try {
    const entries = readdirSync(baseCwd, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ignoreDirs.includes(ent.name) || ent.name.startsWith(".deuk-agent")) continue;
      discoverAllWorkspaces(makePath(baseCwd, ent.name), ignoreDirs, out);
    }
  } catch (err) {
    if (process.env.DEBUG) console.warn(`[DEBUG] Failed to read directory ${baseCwd}:`, err);
  }
  return Array.from(out);
}

async function probeMcpUrl(url) {
  const methods = ["HEAD", "GET"];

  for (const method of methods) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    try {
      const res = await fetch(url, { method, signal: controller.signal });
      if (res.body?.cancel) await res.body.cancel().catch(() => {});
      if (res.ok || res.status === 405) return true;
    } catch (err) {
      if (process.env.DEBUG) console.warn(`[DEBUG] SSE ${method} ping failed for ${url}:`, err);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return false;
}

/** Checks if the deuk-agent-context MCP server is active for the given workspace. */
export function collectMcpConfigStatuses(cwd) {
  const mcpPaths = [
    makePath(cwd, ".mcp.json"),
    makePath(cwd, ".cursor", "mcp.json"),
    makePath(cwd, ".vscode", "mcp.json")
  ];
  const statuses = [];
  for (const p of mcpPaths) {
    if (existsSync(p)) {
      try {
        const config = JSON.parse(readFileSync(p, "utf8"));
        const servers = config.mcpServers || config.servers || {};
        const deuk = servers["deuk-agent-context"] || servers["deuk_agent_context"];
        if (deuk) {
          statuses.push({
            path: p,
            transport: deuk.command ? "stdio" : (deuk.url ? "sse" : "unknown"),
            command: deuk.command || "",
            url: deuk.url || ""
          });
        }
      } catch (err) {
        if (process.env.DEBUG) console.warn(`[DEBUG] Failed to parse MCP config ${p}: ${err.message}`);
        continue;
      }
    }
  }
  return statuses;
}

/** Checks if the deuk-agent-context MCP server is active for the given workspace. */
export async function isMcpActive(cwd) {
  const statuses = collectMcpConfigStatuses(cwd);
  for (const status of statuses) {
    if (status.command) return true; // Stdio is managed by IDE
    if (status.url && await probeMcpUrl(status.url)) return true;
  }
  return false;
}
