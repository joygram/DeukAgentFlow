import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, rmSync } from "fs";
import { basename, dirname, join, relative, resolve } from "path";
import { pathToFileURL } from "url";
import { createInterface } from "readline";
import YAML from "yaml";

/** Converts an absolute path to a clickable file:/// URI */
export function toFileUri(absPath) {
  return pathToFileURL(absPath).href;
}

export const AGENT_ROOT_DIR = ".deuk-agent";
export const TICKET_SUBDIR = "tickets";
export const TEMPLATE_SUBDIR = "templates";
export const RULES_SUBDIR = "rules";
export const WORKFLOW_MODE_PLAN = "plan";
export const WORKFLOW_MODE_EXECUTE = "execute";

export const TICKET_DIR_NAME = `${AGENT_ROOT_DIR}/${TICKET_SUBDIR}`;
export const TICKET_INDEX_FILENAME = "INDEX.json";
export const TICKET_LIST_FILENAME = "TICKET_LIST.md";
export const DOCS_SUBDIR = "docs";
export const PLANS_SUBDIR = "plan";
export const PLAN_LINKS_DIR = `${AGENT_ROOT_DIR}/${DOCS_SUBDIR}/${PLANS_SUBDIR}`;

export const LEGACY_TEMPLATE_DIR = ".deuk-agent-templates";
export const LEGACY_TICKET_DIR = ".deuk-agent-ticket";
export const LEGACY_TICKET_DIR_PLURAL = ".deuk-agent-tickets";
export const LEGACY_TICKET_DIR_ROOT = "ticket";
export const LEGACY_CONFIG_FILE = ".deuk-agent-rule.config.json";
export const LEGACY_IGNORE_DIR = `${AGENT_ROOT_DIR}/tickets/`;
export const ARCHIVE_YEAR_MONTH_RE = /^\d{4}-\d{2}$/;
export const ARCHIVE_DAY_RE = /^\d{2}$/;

const LEGACY_TICKET_GROUPS = new Set([
  LEGACY_TICKET_DIR,
  LEGACY_TICKET_DIR_PLURAL,
  "ticket",
  "tickets"
]);

/**
 * Computes the canonical repository-relative path for a ticket based on its state.
 */
export function computeTicketPath(entry) {
  const isArchived = entry.status === "archived";
  const group = normalizeTicketGroup(entry.group, "sub");
  const fileStem = entry.fileName
    ? String(entry.fileName).replace(/\.md$/i, "")
    : (entry.group === TICKET_SUBDIR && entry.topic ? entry.topic : entry.id);

  if (!isArchived && group === TICKET_SUBDIR) {
    return [TICKET_DIR_NAME, `${fileStem}.md`].join("/");
  }

  if (isArchived && entry.archiveYearMonth && entry.archiveDay) {
    return [
      TICKET_DIR_NAME,
      "archive",
      group,
      entry.archiveYearMonth,
      entry.archiveDay,
      `${fileStem}.md`
    ].join("/");
  }

  const parts = [
    TICKET_DIR_NAME,
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

export const INIT_CONFIG_FILENAME = `${AGENT_ROOT_DIR}/config.json`;
export const INIT_CONFIG_VERSION = 1;

export const STACKS = [
  { label: "Unity / C#", value: "unity" },
  { label: "Unity + WebApp + C++ Server (Hybrid)", value: "unity-webapp-cpp" },
  { label: "Next.js + C#", value: "nextjs-dotnet" },
  { label: "Web (React / Vue / general)", value: "web" },
  { label: "Java / Spring Boot", value: "java" },
  { label: "Other / skip", value: "other" },
];

export const AGENT_TOOLS = [
  { label: "Cursor (Rule System)", value: "cursor" },
  { label: "GitHub Copilot", value: "copilot" },
  { label: "Codex / OpenAI", value: "codex" },
  { label: "Gemini / Antigravity", value: "gemini" },
  { label: "Claude / Dev", value: "claude" },
];

export const SPOKE_REGISTRY = [
  { id: "cursor", detect: (cwd) => existsSync(join(cwd, ".cursor")), legacy: ".cursorrules", target: ".cursor/rules/deuk-agent.mdc", format: "mdc" },
  { id: "claude", detect: (cwd) => existsSync(join(cwd, "CLAUDE.md")) || existsSync(join(cwd, ".claude")), legacy: "CLAUDE.md", target: ".claude/rules/deuk-agent.md", format: "markdown" },
  { id: "copilot", detect: (cwd, tools = []) => tools.includes("copilot") || existsSync(join(cwd, ".github")), legacy: null, target: ".github/copilot-instructions.md", format: "markdown" },
  { id: "codex", detect: (cwd, tools = []) => tools.includes("codex") || existsSync(join(cwd, ".codex")), legacy: null, target: ".codex/AGENTS.md", format: "markdown" },
  { id: "windsurf", detect: (cwd) => existsSync(join(cwd, ".windsurf")), legacy: ".windsurfrules", target: ".windsurf/rules/deuk-agent.md", format: "markdown" },
  { id: "jetbrains", detect: (cwd) => existsSync(join(cwd, ".aiassistant")) || existsSync(join(cwd, ".idea")), legacy: null, target: ".aiassistant/rules/deuk-agent.md", format: "markdown" },
  { id: "antigravity", detect: (cwd, tools = []) => tools.includes("gemini") || existsSync(join(cwd, "GEMINI.md")) || existsSync(join(cwd, ".gemini")) || existsSync(join(cwd, ".mcp.json")), legacy: "GEMINI.md", target: "AGENTS.md", format: "markdown" }
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
  const locale = String(env.LANG || env.LC_ALL || env.LC_MESSAGES || "").toLowerCase();
  if (locale.includes("ko")) return "ko";
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
  const localizedPath = join(baseDir, localizedName);
  if (existsSync(localizedPath)) return localizedPath;
  return join(baseDir, templateName);
}

export function loadInitConfig(cwd) {
  const p = join(cwd, INIT_CONFIG_FILENAME);
  if (!existsSync(p)) return null;

  let target = p;

  try {
    const j = JSON.parse(readFileSync(target, "utf8"));
    if (j.version !== INIT_CONFIG_VERSION) return null;
    if (!j.docsLanguage) j.docsLanguage = "auto";
    const workflowMode = normalizeWorkflowMode(j.workflowMode ?? j.approvalState);
    j.workflowMode = workflowMode;
    j.approvalState = workflowMode === WORKFLOW_MODE_EXECUTE ? "approved" : "pending";
    return j;
  } catch (err) {
    if (process.env.DEBUG) console.warn(`[DEBUG] Failed to parse config ${target}:`, err);
    return null;
  }
}

export function writeInitConfig(cwd, opts) {
  const p = join(cwd, INIT_CONFIG_FILENAME);
  const dir = dirname(p);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const existing = loadInitConfig(cwd) || {};
  const workflowMode = normalizeWorkflowMode(opts.workflowMode ?? opts.workflow ?? opts.approvalState ?? opts.approval);
  const data = {
    version: INIT_CONFIG_VERSION,
    agentsMode: opts.agents ?? existing.agentsMode ?? "inject",
    workflowMode,
    approvalState: workflowMode === WORKFLOW_MODE_EXECUTE ? "approved" : "pending",
    stack: opts.stack ?? existing.stack,
    agentTools: opts.agentTools ?? existing.agentTools,
    docsLanguage: normalizeDocsLanguage(opts.docsLanguage ?? existing.docsLanguage ?? "auto"),
    shareTickets: opts.shareTickets ?? existing.shareTickets ?? false,
    remoteSync: opts.remoteSync ?? existing.remoteSync ?? false,
    pipelineUrl: opts.pipelineUrl,
    ignoreDirs: opts.ignoreDirs || existing.ignoreDirs || DEFAULT_IGNORE_DIRS,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
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

export function isWorkflowExecute(opts = {}, savedConfig = null) {
  return normalizeWorkflowMode(
    opts.workflowMode ??
    opts.workflow ??
    opts.approval ??
    opts.approvalState ??
    savedConfig?.workflowMode ??
    savedConfig?.approvalState
  ) === WORKFLOW_MODE_EXECUTE;
}

/**
 * Resolves the final workflow mode by checking opts, then saved config, with fallback.
 */
export function resolveWorkflowMode(opts = {}, savedConfig = null) {
  return normalizeWorkflowMode(
    opts.workflowMode ??
    opts.workflow ??
    opts.approval ??
    opts.approvalState ??
    savedConfig?.workflowMode ??
    savedConfig?.approvalState
  );
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

export function toSlug(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ticket";
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
  return `000-fallback-${Date.now().toString(36)}`;
}

export function findFileRecursively(dir, fileName) {
  if (!existsSync(dir)) return null;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const res = join(dir, entry.name);
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
  // Remove trailing timestamp if present (e.g. topic-20260426-071208)
  const parts = raw.split("-");
  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    const prev = parts[parts.length - 2];
    if (last.length === 6 && prev.length === 8) {
      return parts.slice(0, -2).join("-");
    }
  }
  return toSlug(raw);
}

export function resolveReferencedTicketPath(opts) {
  if (!opts.ref) return null;
  const refAbs = join(opts.cwd, opts.ref);
  if (!existsSync(refAbs)) {
    throw new Error("--ref file not found: " + opts.ref);
  }
  return toRepoRelativePath(opts.cwd, refAbs);
}

export function inferRefTitleAndTopic(opts) {
  if (!opts.ref) return null;
  const refAbs = join(opts.cwd, opts.ref);

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
    topic: toSlug(finalTitle),
  };
}

export function parseFrontMatter(content) {
  const lines = content.split("\n");
  if (lines.length < 3 || lines[0].trim() !== "---") {
    return { meta: {}, content };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) return { meta: {}, content };

  const metaStr = lines.slice(1, endIdx).join("\n");
  const bodyStr = lines.slice(endIdx + 1).join("\n");
  // Let YAML.parse throw if malformed (intentional behavior change to prevent data loss)
  const meta = YAML.parse(metaStr); 
  return { meta: meta || {}, content: bodyStr };
}

export function stringifyFrontMatter(meta, content) {
  const cleanMeta = { ...meta };
  // Remove redundant or default fields to keep frontmatter slim
  delete cleanMeta.topic;
  if (cleanMeta.project === 'global') delete cleanMeta.project;
  if (!cleanMeta.submodule) delete cleanMeta.submodule;
  
  // Normalize date format if it looks like an ISO string
  if (typeof cleanMeta.createdAt === 'string' && cleanMeta.createdAt.includes('T')) {
    cleanMeta.createdAt = cleanMeta.createdAt.replace('T', ' ').split('.')[0];
  }

  const yamlStr = YAML.stringify(cleanMeta).trim();
  // Double newline after frontmatter to ensure markdown rendering integrity
  return `---\n${yamlStr}\n---\n\n\n${content.trim()}\n`;
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
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const currentVersion = pkg.version;
    const res = await fetch("https://registry.npmjs.org/deuk-agent-rule/latest", {
      signal: AbortSignal.timeout(800)
    });
    if (res.ok) {
      const data = await res.json();
      // Only notify when registry version is strictly newer than local (handles local dev symlink case)
      if (data.version && semverLt(currentVersion, data.version)) {
        console.warn(`\n\x1b[33m💡 Update available! ${currentVersion} → ${data.version}\x1b[0m`);
        console.warn(`\x1b[36mRun 'npm install -g deuk-agent-rule' to update.\x1b[0m\n`);
      }
    }
  } catch(e) {
    // Ignore timeout or network errors silently
  }
}

export const DEFAULT_IGNORE_DIRS = ["node_modules", ".git", ".deuk-agent", "tmp", "temp", ".tmp", ".cache"];

/**
 * Resolves all potential ticket directories for a given path.
 * Returns { primary, legacy: [] }
 */
export function resolveTicketSystemPaths(cwd) {
  return {
    primary: join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR),
    legacy: []
  };
}

/**
 * Detects the closest active ticket directory by traversing upwards.
 */
export function detectConsumerTicketDir(startDir, opts = {}) {
  let curr = resolve(startDir);
  while (curr && curr !== dirname(curr)) {
    const paths = resolveTicketSystemPaths(curr);
    if (existsSync(paths.primary)) return paths.primary;
    if (paths.legacy.length > 0) return paths.legacy[0];
    curr = dirname(curr);
  }
  return opts.createIfMissing ? resolveTicketSystemPaths(startDir).primary : null;
}

/**
 * Unified workspace/submodule discovery.
 */
export function discoverAllWorkspaces(baseCwd, ignoreDirs = DEFAULT_IGNORE_DIRS, out = new Set()) {
  if (!existsSync(baseCwd)) return Array.from(out);

  const paths = resolveTicketSystemPaths(baseCwd);
  if (existsSync(paths.primary) || paths.legacy.length > 0) {
    out.add(baseCwd);
  }

  try {
    const entries = readdirSync(baseCwd, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ignoreDirs.includes(ent.name) || ent.name.startsWith(".deuk-agent")) continue;
      discoverAllWorkspaces(join(baseCwd, ent.name), ignoreDirs, out);
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
export async function isMcpActive(cwd) {
  const mcpPaths = [
    join(cwd, ".mcp.json"),
    join(cwd, ".cursor", "mcp.json"),
    join(cwd, ".vscode", "mcp.json")
  ];
  for (const p of mcpPaths) {
    if (existsSync(p)) {
      try {
        const config = JSON.parse(readFileSync(p, "utf8"));
        const servers = config.mcpServers || config.servers || {};
        const deuk = servers["deuk-agent-context"] || servers["deuk_agent_context"];
        if (deuk) {
          if (deuk.command) return true; // Stdio is managed by IDE
          if (deuk.url) {
            return await probeMcpUrl(deuk.url);
          }
        }
      } catch (err) {
        if (process.env.DEBUG) console.warn(`[DEBUG] Failed to parse MCP config ${p}: ${err.message}`);
        continue;
      }
    }
  }
  return false;
}
