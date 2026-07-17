import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, rmSync, statSync } from "fs";
import { basename, dirname, relative, resolve, sep, win32, posix } from "path";
import { homedir } from "os";
import { pathToFileURL, fileURLToPath } from "url";
import { createInterface } from "readline";
import { createHash } from "crypto";
import YAML from "yaml";

// Loose options bag — all CLI functions accept this so callers don't need to list every key.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CliOpts = Record<string, any>;

// #622: cli-ticket-home.mjs registers itself here at import time to avoid a static
// circular import (home imports utils). detectConsumerTicketDir uses it when present.
let _ticketHomeModule = null;
export function registerTicketHomeModule(mod) { _ticketHomeModule = mod; }

// #879 No-Fallback Gate SSOT: 흩어져 있던 `JSON.parse(readFileSync(...)) catch { 기본값 }`
// 폴백을 한 곳으로 통합한다. 파일이 없으면 호출부가 넘긴 초기값(명시적 부재 처리)을
// 쓰고, 파일이 있는데 JSON이 깨졌으면 **던진다** — 조용히 초기값으로 갈음해 손상 상태를
// "없는 척" 통과시키지 않는다. 읽기 예외(권한 등)도 삼키지 않고 전파한다.
export function readJsonFile(absPath, initial = null) {
  if (!existsSync(absPath)) return initial;
  const raw = readFileSync(absPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`corrupt JSON at ${absPath}: ${err.message} — fix or remove the file (No-Fallback Gate: not silently defaulted)`);
  }
}

// #879: 텍스트 파일 읽기 SSOT. 없으면 "" (명시적 부재), 있으면 읽되 예외는 전파.
export function readTextFile(absPath) {
  if (!existsSync(absPath)) return "";
  return readFileSync(absPath, "utf8");
}

// 턴 스로틀링 SSOT: always-게이트/persona 블록이 매 턴 풀사이즈로 재주입되는 비용을
// 줄이기 위해, "이번이 몇 턴째인지"를 파일에 저장해 N턴 주기로만 풀 출력하고 그 사이는
// 축약 리마인더만 내보낸다. CLI는 매번 새 프로세스라 in-memory 카운터가 불가능 — 반드시
// 파일로 영속화해야 한다. hook stdin의 session_id로 세션 경계를 감지해 카운터를 리셋한다
// (다른 세션의 turnCount를 이어받지 않기 위함). 손상된 상태 파일은 readJsonFile의
// No-Fallback Gate에 따라 조용히 기본값으로 넘어가지 않고 던진다.
//
// 스코프는 세션이지 워크스페이스/티켓이 아니다 — 턴 카운터는 "이 세션이 몇 턴째인가"를
// 추적하는 것이지 어떤 티켓이 진행 중인지와 무관하다. sessionStatePath(아래, DEUK_ROOT_DIR
// 정의 이후로 옮겨 정의됨)가 실제 파일 경로를 만든다 — 티켓 디렉토리에 얹지 않는 이유는
// 그 정의부의 주석 참고.
export interface TurnState {
  sessionKey: string;
  turnCount: number;
  lastFullAt: number;
}

export function readTurnState(absPath: string): TurnState {
  const initial: TurnState = { sessionKey: "", turnCount: 0, lastFullAt: 0 };
  return readJsonFile(absPath, initial) as TurnState;
}

// sessionKey가 바뀌면(새 세션) turnCount를 0에서 다시 시작한다. 반환값은 "이번 턴이
// 몇 턴째인가"(1-based)와, 이번 턴에 풀 출력을 해야 하는지(shouldRenderFull)다.
// 사용자 결정(2026-07-16): 풀 렌더는 세션당 딱 1번(첫 턴)만 — 이후로는 세션이
// 끝날 때까지 계속 축약. "N턴마다 반복 풀렌더"는 안전게이트 노출을 늘리려는
// 의도였지만, 실측 결과 장시간 세션에서 반복 풀렌더 자체가 도로 큰 비용으로
// 돌아온다는 게 확인돼(74% 절감에 그침) 반복 주기를 없앤다.
export function advanceTurnState(
  absPath: string,
  sessionKey: string,
): { state: TurnState; shouldRenderFull: boolean } {
  const prev = readTurnState(absPath);
  const isNewSession = !sessionKey || prev.sessionKey !== sessionKey;
  const turnCount = isNewSession ? 1 : prev.turnCount + 1;
  // 새 세션의 첫 턴만 풀 출력(세션 진입 시 안전게이트/톤을 한 번은 보여준다).
  // 이후 턴은 세션이 끝날 때까지 계속 축약 — lastFullAt은 "몇 턴째에 풀렌더했는지"
  // 기록용으로만 남긴다(향후 재조정 대비, 현재 로직은 참조하지 않는다).
  const shouldRenderFull = isNewSession;
  const state: TurnState = {
    sessionKey,
    turnCount,
    lastFullAt: shouldRenderFull ? turnCount : prev.lastFullAt,
  };
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, JSON.stringify(state, null, 0) + "\n", "utf8");
  return { state, shouldRenderFull };
}
function ticketHomeModule() {
  if (!_ticketHomeModule) throw new Error("ticket home module not registered");
  return _ticketHomeModule;
}

/** Converts an absolute path to a clickable file:/// URI */
export function toFileUri(absPath) {
  return pathToFileURL(absPath).href;
}

/** Converts an absolute path to a vscode://file/ URI (clickable in VSCode terminal) */
export function toVscodeFileUri(absPath) {
  const posixPath = absPath.replace(/\\/g, "/");
  const normalized = posixPath.startsWith("/") ? posixPath : `/${posixPath}`;
  return `vscode://file${normalized}`;
}

/** writeFileSync wrapper that always normalizes to LF before writing */
export function writeFileLF(path: string, content: string, encoding: BufferEncoding = "utf8") {
  const normalized = String(content).replace(/\r\n/g, "\n");
  writeFileSync(path, normalized, encoding);
}

// #713: The deuk home root fragment (the directory name under the user home / workspace).
// Holds deuk-family-wide assets (tickets/registry/...). VALUE switched .deuk-agent→.deuk
// (#710 renamed the symbol AGENT_ROOT_DIR→DEUK_ROOT_DIR; #713 flips the value). The legacy
// ~/.deuk-agent directory is migrated to ~/.deuk by init auto-migration (cli-init-migrate).
// The AGENT_ROOT_DIR alias is removed — all .ts call sites use DEUK_ROOT_DIR.
export const DEUK_ROOT_DIR = ".deuk";
export const WORKSPACE_MARKER_FILE = ".deuk-workspace-id";
export const TICKET_SUBDIR = "tickets";
export const RULES_SUBDIR = "rules";
export const WORKFLOW_MODE_PLAN = "plan";
export const WORKFLOW_MODE_EXECUTE = "execute";

// #710: relative path under the deuk root. The SINGLE place that joins DEUK_ROOT_DIR with
// sub-segments — callers pass fragments only (TICKET_SUBDIR, ...) and never re-assemble the
// root themselves. Replaces the assembled constants (TICKET_DIR_NAME/PLAN_LINKS_DIR/...) that
// baked the root into SSOT and forced double-assembly across call sites (708 design).
export function deukRel(...segments: string[]): string {
  return makePath(DEUK_ROOT_DIR, ...segments);
}

// 턴 스로틀링 상태 파일 경로: session_id 자체를 파일명으로 쓰는 독립 디렉토리
// (~/.deuk/sessions/)에 저장한다. 티켓 디렉토리(tickets/{uuid}/)에 얹지 않는 이유 —
// 턴 카운터는 "이 세션이 몇 턴째인가"를 추적하는 것이지 어떤 티켓이 진행 중인지와
// 무관하다: (a) 티켓이 없는 세션(entry phase, 워크스페이스 미등록)엔 저장할 곳이 없고
// (b) 세션 도중 티켓이 바뀌면 같은 세션인데 다른 파일을 보게 되는 오결합이 생긴다.
// 티켓·워크스페이스 유무와 무관하게 항상 저장 가능하고, 세션이 끝나면 그냥 방치되는
// (필요시 정리되는) 순수 휘발성 상태다. filename으로 게이트용/persona용을 구분한다
// (예: `${sessionId}.gate-turn-state.json`, `${sessionId}.persona-turn-state.json`).
export function sessionStatePath(homeDir: string, sessionId: string, filename: string) {
  const safeId = String(sessionId || "no-session").replace(/[^a-zA-Z0-9_-]/g, "_");
  return makePath(homeDir, DEUK_ROOT_DIR, "sessions", `${safeId}.${filename}`);
}

export const TICKET_INDEX_FILENAME = "INDEX.json";
export const TICKET_LIST_FILENAME = "TICKET_LIST.md";
export const DOCS_SUBDIR = "docs";
export const PLANS_SUBDIR = "plan";

// #713: SINGLE source of truth for everything about the OLD (.deuk-agent-era) layout.
// All legacy-cleanup / scan-exclude / migration code reads from this one object instead of
// scattered consts — add a future legacy name here once and every site follows. These are the
// OLD names (fixed); they must NEVER follow DEUK_ROOT_DIR (the current ".deuk"), or cleanup
// code would start treating the new dir as legacy and delete it. `dirs` = old directory names
// that purge/scan/ignore logic must recognize (most-specific first).
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

/**
 * Computes the canonical repository-relative path for a ticket based on its state.
 */
export function computeTicketPath(entry) {
  // #080: paths are relative to the TICKET ROOT (the home store key dir,
  // ~/.deuk-agent/tickets/{key}/). The legacy `.deuk-agent/tickets/` prefix dates
  // from in-workspace storage; keeping it nested every self-heal/create one level
  // deeper inside the store ({key}/.deuk-agent/tickets/main/...).
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
export const GLOBAL_CONFIG_DIR_NAME = "deuk-agent-flow";
export const GLOBAL_CONFIG_FILENAME = "config.json";
export const INIT_CONFIG_VERSION = 1;

export const WORKSPACE_KINDS = [
  { label: "Product planning / strategy / specs", value: "planning" },
  { label: "Software engineering / coding", value: "coding" },
  { label: "Systems engineering / operations", value: "systems" },
  { label: "Research / analysis / knowledge work", value: "research" },
  { label: "Mixed team workspace", value: "mixed" },
  { label: "Other / decide later", value: "other" },
];

export const STACKS = [
  { label: "Not primarily a code repo", value: "none" },
  { label: "Web / product app", value: "web" },
  { label: "Backend / service / API", value: "backend" },
  { label: "Unity / game / simulation", value: "unity" },
  { label: "Data / ML / analysis", value: "data" },
  { label: "Infrastructure / platform / SRE", value: "infra" },
  { label: "Hybrid / multiple stacks", value: "hybrid" },
  { label: "Other / skip", value: "other" },
];

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

export const DOC_LANGUAGE_CHOICES = [
  { label: "Auto (match system locale)", value: "auto" },
  { label: "Korean", value: "ko" },
  { label: "English", value: "en" },
];

export function normalizeDocsLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "auto") return "auto";
  if (normalized.startsWith("ko") || normalized === "kr" || normalized === "korean") return "ko";
  if (normalized.startsWith("en") || normalized === "english") return "en";
  return "auto";
}

export function inferDocsLanguageFromEnv(env = process.env) {
  // 1) POSIX 환경변수 우선(Linux/macOS, 또는 사용자가 Windows에서 명시 설정한 경우).
  const posix = String(env.LANG || env.LC_ALL || env.LC_MESSAGES || "").toLowerCase();
  if (posix) return posix.includes("ko") ? "ko" : "en";
  // 2) Windows 등 LANG 부재 환경: Node가 OS 로케일을 반영하는 Intl로 폴백.
  try {
    const osLocale = String(Intl.DateTimeFormat().resolvedOptions().locale || "").toLowerCase();
    if (osLocale.includes("ko")) return "ko";
    if (osLocale) return "en";
  } catch {
    // Intl 미지원(초경량 런타임) 시 최종 폴백으로.
  }
  // 3) 최종 폴백.
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

export function selectLocalizedTemplatePath(baseDir, templateName, docsLanguage = "en") {
  const normalized = resolveDocsLanguage(docsLanguage);
  const localizedName = `${templateName.replace(/\.md$/i, "")}.${normalized}.md`;
  const localizedPath = makePath(baseDir, localizedName);
  if (existsSync(localizedPath)) return localizedPath;
  return makePath(baseDir, templateName);
}

export function loadInitConfig(cwd, opts: CliOpts = {}) {
  const targets = [
    getUserInitConfigPath()
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

export function writeInitConfig(cwd, opts) {
  const p = getUserInitConfigPath(opts);
  const dir = dirname(p);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const existing = loadInitConfig(cwd) || {};
  const workflowMode = normalizeWorkflowMode(opts.workflowMode ?? opts.workflow ?? opts.approvalState ?? opts.approval);
  const data = {
    version: INIT_CONFIG_VERSION,
    workflowMode,
    approvalState: workflowMode === WORKFLOW_MODE_EXECUTE ? "approved" : "pending",
    workspaceKind: opts.workspaceKind ?? opts.kind ?? existing.workspaceKind ?? existing.kind,
    stack: opts.stack ?? existing.stack,
    kind: opts.workspaceKind ?? opts.kind ?? existing.workspaceKind ?? existing.kind,
    agentTools: opts.agentTools ?? existing.agentTools,
    docsLanguage: normalizeDocsLanguage(opts.docsLanguage ?? existing.docsLanguage ?? "auto"),
    scmIgnoreDeukAgent: opts.scmIgnoreDeukAgent ?? existing.scmIgnoreDeukAgent ?? !Boolean(opts.shareTickets ?? existing.shareTickets ?? false),
    shareTickets: opts.shareTickets ?? existing.shareTickets ?? false,
    contextMcp: opts.contextMcp ?? existing.contextMcp ?? "skip",
    remoteSync: opts.remoteSync ?? existing.remoteSync ?? false,
    pipelineUrl: opts.pipelineUrl,
    ignoreDirs: opts.ignoreDirs || existing.ignoreDirs || DEFAULT_IGNORE_DIRS,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

// Single source of truth for the current user's home directory. Every home-derived
// path (global agent pointers, Claude settings hook, workspace registry) must route
// through here so platform/env home policy lives in one place instead of being
// sprawled across call sites with divergent fallbacks.
//
// process.env.HOME is intentionally NOT consulted: the ~/bin/node wrapper delegates
// to the Windows node.exe, so homedir() already resolves to the shared Windows home
// (C:\Users\joy) under both Windows and WSL. Honoring env.HOME would make a native
// WSL node pick /home/joy and break that shared-home contract. Tests inject opts.homeDir.
export function resolveUserHome(opts: CliOpts = {}) {
  return opts.homeDir || homedir();
}

// The project's single path-construction primitive. Joins segments and normalizes
// the result to the target platform's convention (canonical form = platform-native:
// win32 -> "\\", posix -> "/"), regardless of how the inputs were stored ??mixed or
// foreign separators are accepted. platform defaults to the running platform; pass
// opts.platform to build a path for another platform deterministically (used by
// tests so they compare via this same function and stay platform-agnostic).
export function makePath(...args) {
  // Variadic drop-in for path.join: makePath(a, b, c). Also accepts a single
  // segments array and/or a trailing { platform } options object:
  //   makePath([a, b], { platform: "win32" })  |  makePath(a, b, { platform })
  let opts: CliOpts = {};
  if (args.length > 1 && args[args.length - 1] && typeof args[args.length - 1] === "object" && !Array.isArray(args[args.length - 1])) {
    opts = args.pop();
  }
  const segments = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  const platform = opts.platform || process.platform;
  const mod = platform === "win32" ? win32 : posix;
  // Swap the *foreign* separator to the target's (no collapsing ??keeps leading
  // "\\\\" UNC prefixes like \\wsl.localhost\... intact); the join then normalizes.
  const foreign = platform === "win32" ? /\//g : /\\/g;
  const parts = segments
    .map(part => String(part ?? ""))
    .filter(part => part.length > 0)
    .map(part => part.replace(foreign, mod.sep));
  return mod.join(...parts);
}

// #709: Single source of truth for the package root. Historically 10 call sites computed
// this five different ways (dirname(dirname(import.meta.url)), makePath(__dirname, ".."),
// resolve(dirname(fileURLToPath()), ".."), ...). Those bake in a fixed directory depth, so
// the tsc build output (scripts/out/scripts/) shifted the depth and broke docs/ resolution
// ("CLI surface document not found: scripts/out/docs/..."). This walks UP from the caller's
// file looking for the package.json marker, so it returns the SAME root whether the code runs
// from source (scripts/) or build output (scripts/out/scripts/) — location-independent.
let _packageRootCache: string | null = null;
export function resolvePackageRoot(opts: CliOpts = {}): string {
  if (opts.packageRoot) return opts.packageRoot;
  if (!opts.noCache && _packageRootCache) return _packageRootCache;
  const startFile = opts.fromUrl ? fileURLToPath(opts.fromUrl) : fileURLToPath(import.meta.url);
  let dir = dirname(startFile);
  // Walk up until a package.json is found; stop at filesystem root.
  while (true) {
    if (existsSync(makePath(dir, "package.json"))) break;
    const parent = dirname(dir);
    if (parent === dir) break; // reached root without a marker — fall back to original dir
    dir = parent;
  }
  if (!opts.noCache) _packageRootCache = dir;
  return dir;
}

// #632: OS-agnostic basename. path.basename uses the CURRENT runtime's separator, so
// under a POSIX node (WSL / Git Bash) it cannot split a Windows path — basename(
// "D:\\workspace\\DeukPack") wrongly returns "workspaceDeukPack". normalizeRegistryPath
// emits Windows-style paths regardless of runtime, so any code deriving a name from one
// (e.g. computeTicketKey) must split on BOTH separators. Mirrors makePath's cross-OS intent.
export function basenameAnyOS(value) {
  return String(value ?? "").split(/[\\/]/).filter(Boolean).pop() || "";
}

export function getUserConfigDir(opts: CliOpts = {}) {
  const platform = opts.platform || process.platform;
  const env = opts.env || process.env;
  const homeDir = resolveUserHome(opts);

  if (platform === "win32") {
    const base = env.APPDATA || makePath([homeDir, "AppData", "Roaming"], { platform });
    return makePath([base, GLOBAL_CONFIG_DIR_NAME], { platform });
  }

  const base = env.XDG_CONFIG_HOME || makePath([homeDir, ".config"], { platform });
  return makePath([base, GLOBAL_CONFIG_DIR_NAME], { platform });
}

export function getUserInitConfigPath(opts: CliOpts = {}) {
  return makePath([getUserConfigDir(opts), GLOBAL_CONFIG_FILENAME], opts);
}

// Global, workspace-independent directory for user-forked/custom skills.
// Lives alongside the global config so personalized skills follow the user
// across every workspace (win: %APPDATA%\deuk-agent-flow\skills,
// posix: $XDG_CONFIG_HOME|~/.config/deuk-agent-flow/skills).
export function getUserSkillsDir(opts: CliOpts = {}) {
  return makePath([resolveUserHome(opts), DEUK_ROOT_DIR, "skills"], opts);
}

// Global, workspace-independent path for skill install state (the `installed`
// array). Lives next to the global skills dir so a skill installed once shows
// the same state across every editor/workspace. Exposure stays per-workspace
// because it is physically injected into agent rule files.
export function getUserSkillsConfigPath(opts: CliOpts = {}) {
  return makePath([resolveUserHome(opts), DEUK_ROOT_DIR, "skills.json"], opts);
}

export function getWorkspaceInitConfigPath(cwd) {
  return makePath(cwd, deukRel(CONFIG_FILENAME));
}

export function migrateWorkspaceInitConfigToUserConfig(cwd, opts: CliOpts = {}) {
  const workspaceConfig = getWorkspaceInitConfigPath(cwd);
  if (!existsSync(workspaceConfig)) return false;

  const dryRun = Boolean(opts.dryRun);
  const silent = Boolean(opts.silent);

  if (!dryRun) unlinkSync(workspaceConfig);
  if (!silent) {
    const relWorkspaceConfig = toRepoRelativePath(cwd, workspaceConfig);
    console.log(`[MIGRATE] ${dryRun ? "Would remove" : "Removed"} legacy workspace config: ${relWorkspaceConfig}`);
  }
  return dryRun ? "dry-run-remove-workspace-config" : "removed-workspace-config";
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

// DR-03 SSOT: 워크플로 모드/승인의 입력 소스는 여기 한 곳에서만 정의한다. CLI 실입력은
// 두 개뿐이다 — opts.workflowMode(←--workflow)와 opts.approval(←--approval). 과거 체인에
// 섞여 있던 opts.workflow·opts.approvalState는 어떤 CLI 경로도 채우지 않는 죽은 별칭이라
// 제거했다(cli-args.ts에 해당 플래그 없음). savedConfig는 저장된 설정 소스로 별개다.
// 이 배열이 정본 우선순위이며, 모든 소비처(isWorkflowExecute/resolveWorkflowMode/
// evidence-validators/cli-prompts)가 이 함수를 거친다 — 폴백 체인을 곳곳에 복제하지 않는다.
function workflowModeInput(opts: CliOpts = {}, savedConfig = null) {
  return opts.workflowMode ?? opts.approval ?? savedConfig?.workflowMode;
}

export function resolveWorkflowMode(opts: CliOpts = {}, savedConfig = null) {
  return normalizeWorkflowMode(workflowModeInput(opts, savedConfig));
}

export function isWorkflowExecute(opts: CliOpts = {}, savedConfig = null) {
  return resolveWorkflowMode(opts, savedConfig) === WORKFLOW_MODE_EXECUTE;
}

/**
 * Strips dynamically appended rule modules from content.
 */
export function pruneRuleModules(content) {
  const marker = "<!-- RULE MODULE: ";
  const idx = content.indexOf(marker);
  if (idx !== -1) {
    return content.substring(0, idx).trimEnd();
  }
  return content.trimEnd();
}

/**
 * Higher-order function to wrap interactive readline sessions.
 */
export async function withReadline(callback) {
  if (!process.stdout.isTTY) {
    throw new Error("Interactive terminal required.");
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await callback(rl);
  } finally {
    rl.close();
  }
}

export function toPosixPath(p) {
  return p.replace(/\\/g, "/");
}

export function toRepoRelativePath(cwd, absPath) {
  return toPosixPath(relative(cwd, absPath));
}

/** ?덉??ㅽ듃由?湲곕컲 ?뚰겕?ㅽ럹?댁뒪 猷⑦듃 湲곗? ?곷?寃쎈줈 ??留곹겕/寃쎈줈 異쒕젰???ъ슜 */
// #746: 티켓은 홈 스토어(~/.deuk/tickets/{uuid}/, 보통 C:)에 살고 워크스페이스 cwd는
// 다른 드라이브(D:)일 수 있다. 그 경우 relative(wsRoot, abs)는 상대경로를 만들지 못하고
// "C:/..." 절대경로로 폴백하는데, 그 drive-prefixed 링크는 채팅·webview 어느 쪽에서도
// 열리지 않는다(클릭 실측). 카드 링크(formatTicketFlowLine)와 동일하게 drive-letter만
// 떼어낸 슬래시-루트 절대경로("C:/Users/..." → "/Users/...")로 통일하면 양쪽에서 열린다.
// NOTE(후속): 같은 드라이브일 때 ../상대경로 최적화·linux 동작은 별도 티켓에서 고민.
export function toWsRelativePath(_cwd, absPath) {
  return toPosixPath(makePath(resolve(absPath))).replace(/^[a-zA-Z]:/, "");
}

// #815: 채팅 패널 클릭용 ②형식(drive-stripped, toWsRelativePath)은 셸·에이전트가
// cat/Read로 열 수 없다(drive 정보 손실). 사람이 읽는 Path:/Source: 라인에는 ②
// 클릭 링크와 함께 ①형식(drive 포함 절대경로)을 병기해 양쪽 소비자를 모두 만족시킨다.
// 이 함수는 그 ①형식(예: "C:/Users/..." )을 반환한다.
export function toDriveAbsolutePath(absPath) {
  return toPosixPath(makePath(resolve(absPath)));
}

// Hangul syllable \u2192 Latin transliteration (Revised Romanization, simplified).
// Used as a fallback so non-ASCII titles still produce a usable slug.
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
  // Fallback: transliterate Hangul, then slug again. Keeps Korean titles usable.
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
      // The bare last part (e.g. "flow", "pack") stays available for explicit
      // `--workspace <name>` queries, which are intentional and exact-matched.
      // It is filtered out of prompt-scan aliases (buildPromptWorkspaceAliases)
      // so it cannot hijack free-form prompt text.
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

  // Existing registry data may contain over-generic single-word aliases
  // (e.g. "Flow", "Pack") that would match unrelated free-form prompt text and
  // redirect to the wrong workspace. Only accept registry aliases specific
  // enough for prompt matching: multi-token (space/hyphen) or sharing the
  // canonical id/basename stem.
  const canonicalSlugs = rawCanonicalNames.map(name => toSlug(name)).filter(Boolean);
  const isSpecificPromptAlias = (alias) => {
    if (/[\s-]/.test(alias)) return true;
    const slug = toSlug(alias);
    if (!slug) return false;
    // Accept only if the alias equals or is more specific than (contains) a
    // canonical slug. Reject bare fragments like "flow" that are merely a
    // substring of the canonical id ("deukagentflow").
    return canonicalSlugs.some(canonical => slug === canonical || slug.includes(canonical));
  };
  for (const registryAlias of workspace?.registryAliases || []) {
    const trimmed = String(registryAlias || "").trim();
    if (trimmed && isSpecificPromptAlias(trimmed)) promptAliases.add(trimmed);
  }

  return Array.from(promptAliases);
}

export function hasWorkspaceMarker(candidatePath) {
  // #827: 워크스페이스 마커는 .deuk-workspace-id 파일 하나뿐이다. .deuk 폴더는 글로벌
  // 스토어(~/.deuk) 이름이라 이걸 마커로 인정하면 home 디렉토리가 스토어를 소유한다는
  // 이유만으로 워크스페이스로 오인·ghost 등록된다(joy 오인등록). .deuk 폴더 존재는
  // 마커가 아니므로 판정에서 제외 — home과 워크스페이스가 파일 마커로 자연히 구분된다.
  return existsSync(makePath(candidatePath, WORKSPACE_MARKER_FILE));
}

// #950: package.json 단독 판정을 제거했다. 모노레포 워크스페이스(DeukWriter 등)는
// 서브패키지마다 package.json을 갖는데, 이걸 경계로 인정하면 서브디렉토리에서 init을
// 실행했을 때 그 서브디렉토리가 독립 워크스페이스로 자체 등록되며 PROJECT_RULE.md
// 사본을 또 만들어냈다(#824 이후 실증: DeukWriter 10개소, DeukPack 14개소, DeukHwp 8개소).
// .git/AGENTS.md/docs/PROJECT_RULE.md만 실제 프로젝트 경계로 인정한다.
function hasLocalProjectBoundary(candidatePath) {
  return existsSync(makePath(candidatePath, ".git")) ||
    existsSync(makePath(candidatePath, "AGENTS.md")) ||
    existsSync(makePath(candidatePath, "docs", "PROJECT_RULE.md"));
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
  // WSL2: /mnt/d/... ??D:\...
  const wsl2 = p.match(/^\/mnt\/([a-zA-Z])(\/.*)?$/);
  if (wsl2) p = wsl2[1].toUpperCase() + ":" + (wsl2[2] || "\\").replace(/\//g, "\\");
  // WSL1 / Git Bash: /d/... ??D:\...
  const wsl1 = p.match(/^\/([a-zA-Z])(\/.*)?$/);
  if (wsl1) p = wsl1[1].toUpperCase() + ":" + (wsl1[2] || "\\").replace(/\//g, "\\");
  // Windows drive letter: normalize to uppercase
  p = p.replace(/^([a-z]):/, (_, d) => d.toUpperCase() + ":");
  // #632: a drive-letter path (e.g. D:\workspace\DeukPack) is ABSOLUTE on Windows, but
  // POSIX resolve() — what runs under WSL / Git Bash — does not recognize "X:\" as a root
  // and treats the whole string as relative, prepending process.cwd() and mangling the
  // backslashes into one segment (".../scripts/workspaceDeukPack"). That poisons the
  // ticketKey and makes reconcile fire every command. Resolve drive-letter paths with the
  // win32 resolver so they stay absolute and segmented regardless of the host OS.
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
      // #080: the user home dir owns ~/.deuk-agent (the STORE) and so passes the marker
      // check above — but home and anything inside the store are never workspaces.
      // Stale "joy"/".deuk-agent" records otherwise hijack workspace dispatch.
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

// #638: the workspace candidate source is the home ticket store itself —
// ~/.deuk-agent/tickets/{uuid}/workspace.json. Each folder is self-describing
// ({uuid,path,name}); the folder's existence IS the registration (single source of
// truth). No ~/.agent-flow registry, no registry.json fallback — those caches went
// stale and spawned ambiguous ghosts. A folder without workspace.json simply isn't
// a candidate yet; it self-heals into one the next time a command runs in it (reconcile
// writes workspace.json). One readdir + one small JSON per workspace (tens, not
// thousands) — negligible cost, nothing to drift.
export function loadAllRegistryWorkspaceCandidates(opts: CliOpts = {}) {
  const homeDir = resolveUserHome(opts);
  const ticketsRoot = makePath([homeDir, DEUK_ROOT_DIR, "tickets"], opts);
  if (!existsSync(ticketsRoot)) return null;

  const byPath = new Map();
  try {
    for (const ent of readdirSync(ticketsRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!ent.isDirectory()) continue;
      const dir = makePath(ticketsRoot, ent.name);

      // Authoritative, self-describing source: workspace.json. No fallback.
      let workspacePath = "", name = "", aliases = [];
      try {
        const meta = JSON.parse(readFileSync(makePath(dir, "workspace.json"), "utf8"));
        workspacePath = normalizeRegistryPath(String(meta?.path || ""));
        name = String(meta?.name || "").trim();
        if (Array.isArray(meta?.aliases)) aliases = meta.aliases.map(a => String(a || "").trim()).filter(Boolean);
      } catch { continue; }  // no workspace.json → not a candidate yet

      // Path must still exist with a workspace marker, and not be the home store.
      if (!workspacePath || !hasWorkspaceMarker(workspacePath)) continue;
      if (isInsideHomeStore(workspacePath)) continue;
      // #638: the user home dir is NOT where workspaces live. Past cwd-fallback bugs
      // minted ghost markers at ~/{Name} (e.g. C:\Users\joy\DeukAgentFlow) that
      // collide by name with the real D:\workspace\{Name}. A workspace directly under
      // the home dir is never a real candidate — exclude it.
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

  // #638: drop nested ghosts — a workspace path that sits INSIDE another candidate's
  // path (e.g. D:\workspace\DeukAgentFlow\DeukAgentFlow under D:\workspace\DeukAgentFlow)
  // is an accidental nested registration, not a real workspace. Keep only top-level paths.
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
  // #645: SSOT-only, NO fallback. The only source of workspace candidates is the
  // home ticket store's workspace.json records (loadAllRegistryWorkspaceCandidates).
  // Every cwd-based fallback (sibling scan, ~/.agent-flow cache) was a ghost
  // factory — a command run in any directory would "discover" and register it.
  // A workspace exists iff it was explicitly registered via `init`. If nothing is
  // registered yet, there are simply no candidates — we never invent them from cwd.
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
  // #645: SSOT-only (workspace.json records). No cwd-based sibling fallback.
  // #685: LangGraph 진입 원칙 — workspace는 사람이 --workspace로 명시한다. sessionId
  // 쿠키나 "지난번 워크스페이스" 앵커로 추측하는 폴백은 없다(env 미전파 환경에서 default로
  // 무너지는 근원, §6.0.5/#871-followup이 재도입했다가 세션 간 워크스페이스 오염 사고로
  // 재차 폐기됨). query가 없으면 추측하지 않고 missing-query 노드로 떨어진다.
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
    // Normalized lookup collapses separators, so distinct names like
    // ".deuk-agent" (home store) and "DeukAgent" (workspace) both reduce to
    // "deukagent" and tie. Break the tie with a case-insensitive exact match
    // on an original (non-normalized) alias before declaring it ambiguous.
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
  throw new Error(
    `[VALIDATION FAILED] ${fieldName} must produce a non-empty ASCII slug. ` +
    `Received: ${JSON.stringify(received)}. ` +
    `Use an ASCII title such as "basic-protocol-pack-unpack-test-redefinition".`
  );
}

export function toSnakeCaseKey(input) {
  return toSlug(input).replace(/-/g, "_");
}

export function formatTimestampForFile(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}${m}${day}-${hh}${mm}${ss}`;
}

export function makeEntryId() {
  return `000-generated-${Date.now().toString(36)}`;
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
  // Remove trailing timestamp if present (e.g. title-20260426-071208)
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
  const refAbs = makePath(opts.cwd, opts.ref);
  if (!existsSync(refAbs)) {
    throw new Error("--ref file not found: " + opts.ref);
  }
  return toRepoRelativePath(opts.cwd, refAbs);
}

export function inferRefTitleAndTopic(opts) {
  if (!opts.ref) return null;
  const refAbs = makePath(opts.cwd, opts.ref);

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

export function parseFrontMatter(content) {
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

// Strip a leading frontmatter block from content so that round-tripping through
// parseFrontMatter ??stringifyFrontMatter never produces a double-frontmatter file.
export function stripLeadingFrontMatter(content) {
  const original = String(content || "");
  // Skip leading whitespace/newlines: parseFrontMatter leaves a blank line in
  // front of any second frontmatter block (e.g. a duplicated header from a broken
  // migration), so the "---" we want to strip is not necessarily at index 0.
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
  // Double newline after frontmatter to ensure markdown rendering integrity
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
  // Remove redundant or default fields to keep frontmatter slim
  if (cleanMeta.project === 'global') delete cleanMeta.project;
  if (!cleanMeta.submodule) delete cleanMeta.submodule;
  
  // Normalize date format if it looks like an ISO string
  if (typeof cleanMeta.createdAt === 'string' && cleanMeta.createdAt.includes('T')) {
    cleanMeta.createdAt = cleanMeta.createdAt.replace('T', ' ').split('.')[0];
  }
  return cleanMeta;
}

/**
 * Returns true if semver a is less than b
 */
export function semverLt(a, b) {
  const pa = String(a || "0").replace(/[^0-9.]/g, "").split(".").map(Number);
  const pb = String(b || "0").replace(/[^0-9.]/g, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0, nb = pb[i] ?? 0;
    if (na !== nb) return na < nb;
  }
  return false;
}

export async function checkUpdateNotifier() {
  try {
    const { fileURLToPath } = await import("url");
    const pkgPath = makePath(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const currentVersion = pkg.version;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    if (typeof timeoutId.unref === "function") timeoutId.unref();
    const res = await fetch("https://registry.npmjs.org/deuk-agent-flow/latest", {
      signal: controller.signal
    }).finally(() => {
      clearTimeout(timeoutId);
    });
    if (res.ok) {
      const data = await res.json() as CliOpts;
      // Only notify when registry version is strictly newer than local (handles local dev symlink case)
      if (data.version && semverLt(currentVersion, data.version)) {
        console.warn(`\n\x1b[33m?뮕 Update available! ${currentVersion} ??${data.version}\x1b[0m`);
        console.warn(`\x1b[36mRun 'npm install -g deuk-agent-flow', then 'deuk-agent-flow init' from the repo or workspace root.\x1b[0m\n`);
      }
    }
  } catch(e) {
    // Ignore timeout or network errors silently
  }
}

export const DEFAULT_IGNORE_DIRS = ["node_modules", ".git", DEUK_ROOT_DIR, "tmp", "temp", ".tmp", ".cache"];

/**
 * Resolves all potential ticket directories for a given path.
 * Returns { primary, legacy: [] }
 */
export function resolveTicketSystemPaths(cwd) {
  return {
    primary: makePath(cwd, DEUK_ROOT_DIR, TICKET_SUBDIR),
    legacy: []
  };
}

// Finds the nearest ancestor that owns a .deuk-agent dir (the workspace root).
// Exported so commands can locate the workspace WITHOUT going through
// detectConsumerTicketDir (which now returns the home ticket dir, #622).
export function findWorkspaceRoot(startDir) {
  // #080: the user home dir owns ~/.deuk-agent (the ticket STORE, not a workspace
  // marker). Climbing past a non-workspace cwd must never land on home — that minted
  // a "joy"-style ghost workspace and nested ticket dirs inside the store.
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

// #622/#623: ticket data lives in ~/.deuk-agent/tickets/{ticketKey}/, NOT in the
// workspace git tree. detectConsumerTicketDir is a PURE READ — it resolves the home
// ticket dir for the workspace WITHOUT side effects (no marker creation, no file
// moves, no registry writes). The actual migration (reconcile) is triggered once on
// ticket-command entry and on init via ensureWorkspaceMigrated() (#623), so the many
// detect callers (index/scan/parser/document reads) never mutate state.
export function detectConsumerTicketDir(startDir, opts: CliOpts = {}) {
  const root = findWorkspaceRoot(startDir);
  if (!root) return null;
  // #626: findWorkspaceRoot walks ANCESTORS for a .deuk-agent dir. From a non-workspace
  // cwd (e.g. %TEMP%\foo) it climbs all the way to ~/.deuk-agent and returns the HOME
  // dir itself — which is the ticket STORE, not a workspace. Treating it as one yields a
  // doubled `tickets/.deuk-agent/tickets/main` path and scatters reads. A non-workspace
  // cwd has no ticket dir to read: return null rather than mis-resolving onto the store.
  try {
    const home = ticketHomeModule();
    if (home.isHomeStoreRoot(root, opts)) return null;
  } catch { /* fall through to legacy resolution below */ }
  try {
    const home = ticketHomeModule();
    // Resolve the home ticket dir from already-known state only. Prefer the registry
    // entry (keyed by the existing marker id); fall back to basename when not yet
    // migrated. Crucially, this reads — it does not create a marker or move files.
    return home.resolveHomeTicketDirForWorkspace(root, opts);
  } catch (e) {
    // If home resolution fails for any reason, fall back to the in-workspace path
    // so the tool keeps working rather than losing the ticket system entirely.
    // #829: this fallback used to be silent, which let tickets accumulate in a
    // path the CLI's own discard/use/show lookups never scan (home is canonical).
    // Surface it loudly so the mismatch is diagnosed immediately, not reverse-
    // engineered from filesystem archaeology later.
    const fallback = resolveTicketSystemPaths(root).primary;
    console.warn(`\x1b[33m[deuk-agent-flow] warning: home ticket dir resolution failed (${e && e.message ? e.message : e}); falling back to in-workspace path: ${fallback}\x1b[0m`);
    console.warn(`\x1b[33m[deuk-agent-flow] tickets written here will NOT be visible to home-store lookups (discard/use/show). Investigate the home resolution failure before continuing.\x1b[0m`);
    return fallback;
  }
}

// The WORKSPACE root (where .deuk-agent lives) — distinct from where tickets are
// stored. Since #622 moved ticket storage to home, this must use findWorkspaceRoot
// directly; deriving it from detectConsumerTicketDir would now yield the home dir
// and corrupt every workspace breadcrumb/identity that depends on it.
export function resolveConsumerTicketRoot(startDir, opts: CliOpts = {}) {
  return findWorkspaceRoot(startDir);
}

// #080: true when cwd is the user's ~/.deuk-agent store or anywhere inside it. The
// store holds ticket data ({key}/...), NOT workspaces; registering any path under it
// nests tickets/{key}/.deuk-agent/tickets and mints ghost keys. Mirrors the home guard
// in cli-ticket-home.isHomeStoreRoot but lives here to avoid a circular import.
function isInsideHomeStore(cwd, opts: CliOpts = {}) {
  const here = normalizeRegistryPath(resolve(String(cwd || "")));
  const home = normalizeRegistryPath(resolveUserHome(opts));
  if (here === home) return true;
  const store = normalizeRegistryPath(makePath([resolveUserHome(opts), DEUK_ROOT_DIR], opts));
  return here === store || here.startsWith(store + "/");
}

// #638: true when path is a DIRECT child of the user home dir (e.g. ~/DeukAgentFlow).
// Workspaces live in project dirs (D:\workspace\...), never directly under home;
// such paths are ghost markers minted by past cwd-fallback bugs.
export function isHomeDirectChild(p, opts: CliOpts = {}) {
  // normalizeRegistryPath already yields the canonical (Windows-style) path; do NOT
  // run it through path.resolve under POSIX node — that mangles "C:\..\.." (#632).
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

// #626: the authoritative answer to "is this cwd a real workspace I may register?".
// findWorkspaceRoot only finds an ancestor that ALREADY owns a .deuk-agent marker, so
// callers used `findWorkspaceRoot(cwd) || cwd` to also cover first-time registration —
// but that `|| cwd` fallback turns ANY cwd (a %TEMP% dir, an arbitrary subfolder) into
// a "workspace", spawning ghost ticketKeys and scattering tickets. Replace that pattern
// with this: return the marker-owning root if one exists; otherwise accept cwd ONLY when
// it is itself a project boundary (.git / package.json / AGENTS.md / PROJECT_RULE.md) —
// i.e. a place worth migrating on first run. Return null for everything else so reconcile
// is skipped rather than minting a ghost. An explicit --workspace always wins.
export function resolveRealWorkspaceRoot(cwd, opts: CliOpts = {}) {
  if (opts && opts.workspace) return normalizeRegistryPath(opts.workspace);
  // #080: NEVER register anything inside the home ticket store (~/.deuk-agent).
  // Each {key}/ folder there carries its own .deuk-agent subtree, so findWorkspaceRoot
  // would treat it as a workspace and recurse — nesting tickets/{key}/.deuk-agent/tickets
  // and spawning ghost keys. Guard the whole store subtree up front.
  if (isInsideHomeStore(cwd, opts)) return null;
  // #645: a workspace is ONLY a directory that already owns a .deuk-agent marker
  // (findWorkspaceRoot walks up to find one). We do NOT promote a bare cwd to a new
  // workspace just because it looks like a project boundary — that cwd-promotion was
  // a ghost factory. New workspaces are created exclusively by `deuk-agent-flow init`,
  // which writes the marker; thereafter findWorkspaceRoot finds it. No marker → null.
  return findWorkspaceRoot(cwd) || null;
}

export function resolveWorkspaceContext(startDir = "") {
  // #633: NO cwd fallback. If startDir has no real .deuk-agent workspace marker,
  // root is "" — we must NOT treat the cwd (e.g. the home dir C:\Users\joy) as a
  // workspace, which would surface a bogus "joy" breadcrumb and drive maintenance
  // into null-path crashes. Callers that genuinely need a path fall back themselves.
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

function resolveGitWorkTreeRoot(startDir) {
  let curr = resolve(startDir);
  while (curr && curr !== dirname(curr)) {
    if (isGitWorkTreeMarker(makePath(curr, ".git"))) return curr;
    curr = dirname(curr);
  }
  if (isGitWorkTreeMarker(makePath(curr, ".git"))) return curr;
  return null;
}

function isGitWorkTreeMarker(gitMarkerPath) {
  if (!existsSync(gitMarkerPath)) return false;
  const markerStat = statSync(gitMarkerPath);
  if (!markerStat.isDirectory()) return markerStat.isFile();
  return existsSync(makePath(gitMarkerPath, "HEAD")) || existsSync(makePath(gitMarkerPath, "commondir"));
}

/**
 * Unified workspace/submodule discovery.
 */
export function discoverAllWorkspaces(baseCwd, ignoreDirs = DEFAULT_IGNORE_DIRS, out: Set<string> = new Set<string>()) {
  if (!existsSync(baseCwd)) return Array.from(out);

  const paths = resolveTicketSystemPaths(baseCwd);
  const isWorkspaceRoot = existsSync(paths.primary) || paths.legacy.length > 0;
  if (isWorkspaceRoot) {
    out.add(baseCwd);
    // Stop descending once a workspace root is found.
    // This prevents nested child workspaces from being treated as independent roots.
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

/**
 * Checks if the deuk-agent-context MCP server is active for the given workspace.
 * Detects .mcp.json, .cursor/mcp.json, or .vscode/mcp.json and pings SSE servers if applicable.
 */
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

/**
 * Checks if the deuk-agent-context MCP server is active for the given workspace.
 * Detects .mcp.json, .cursor/mcp.json, or .vscode/mcp.json and pings SSE servers if applicable.
 */
export async function isMcpActive(cwd) {
  const statuses = collectMcpConfigStatuses(cwd);
  for (const status of statuses) {
    if (status.command) return true; // Stdio is managed by IDE
    if (status.url && await probeMcpUrl(status.url)) return true;
  }
  return false;
}


