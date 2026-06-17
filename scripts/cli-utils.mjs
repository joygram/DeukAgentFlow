import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { basename, dirname, join, relative } from "path";
import { pathToFileURL } from "url";
import YAML from "yaml";

/** Converts an absolute path to a clickable file:/// URI */
export function toFileUri(absPath) {
  return pathToFileURL(absPath).href;
}

export const AGENT_ROOT_DIR = ".deuk-agent";
export const TICKET_SUBDIR = "tickets";
export const TEMPLATE_SUBDIR = "templates";
export const RULES_SUBDIR = "rules";

export const TICKET_DIR_NAME = `${AGENT_ROOT_DIR}/${TICKET_SUBDIR}`;
export const TICKET_INDEX_FILENAME = "INDEX.json";
export const TICKET_LIST_FILENAME = "TICKET_LIST.md";
export const TICKET_LIST_TEMPLATE_FILENAME = "TICKET_LIST.template.md";

export const INIT_CONFIG_FILENAME = `${AGENT_ROOT_DIR}/config.json`;
export const LEGACY_INIT_CONFIG_FILENAME = ".deuk-agent-rule.config.json";
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
  { label: "Gemini / Antigravity", value: "gemini" },
  { label: "Claude / Dev", value: "claude" },
];

export function loadInitConfig(cwd) {
  const p = join(cwd, INIT_CONFIG_FILENAME);
  const legacyP = join(cwd, LEGACY_INIT_CONFIG_FILENAME);
  
  let target = existsSync(p) ? p : (existsSync(legacyP) ? legacyP : null);
  if (!target) return null;

  try {
    const j = JSON.parse(readFileSync(target, "utf8"));
    if (j.version !== INIT_CONFIG_VERSION) return null;
    return j;
  } catch {
    return null;
  }
}

export function writeInitConfig(cwd, opts) {
  const p = join(cwd, INIT_CONFIG_FILENAME);
  const data = {
    version: INIT_CONFIG_VERSION,
    agentsMode: opts.agents || "inject",
    stack: opts.stack,
    agentTools: opts.agentTools,
    shareTickets: !!opts.shareTickets,
    remoteSync: !!opts.remoteSync,
    pipelineUrl: opts.pipelineUrl,
    ignoreDirs: opts.ignoreDirs || DEFAULT_IGNORE_DIRS,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
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
    .replace(/[^\p{L}\p{N}]+/gu, "-")
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
  const entries = readdirSync(dir, { withFileTypes: true });
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
  const metaMatch = content.match(/^project:\s*(.+)$/mi);
  if (metaMatch) return metaMatch[1].trim();

  const headerMatch = content.match(/^##?\s+Project:\s*(.+)$/mi);
  if (headerMatch) return headerMatch[1].trim();

  const legacyMatch = content.match(/\b(YourProject)\b/i);
  return legacyMatch ? legacyMatch[1] : "global";
}

export function deriveTopicFromBaseName(baseName) {
  const raw = String(baseName || "").replace(/\.md$/i, "");
  const topic = raw.replace(/-\d{8}-\d{6}$/i, "");
  return toSlug(topic || raw || "ticket");
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
  } catch {
    body = "";
  }

  const taskTitleMatch = body.match(/^##\s+Task:\s*(.+)$/m);
  const headingMatch = body.match(/^#\s+(.+)$/m);
  const base = basename(refAbs).replace(/\.[^.]+$/, "");

  const title = (taskTitleMatch && taskTitleMatch[1]) || (headingMatch && headingMatch[1]) || base;
  const topic = toSlug(title || base);

  return {
    title: String(title || base).trim(),
    topic,
  };
}

export function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, content };
  try {
    const meta = YAML.parse(match[1]);
    return { meta: meta || {}, content: match[2] };
  } catch (e) {
    console.error("YAML Parse Error:", e);
    return { meta: {}, content };
  }
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
 * Recursively finds all directories containing deuk-agent ticket structures.
 */
export function discoverAllSubmodules(baseCwd, ignoreDirs = DEFAULT_IGNORE_DIRS, out = new Set()) {
  if (!existsSync(baseCwd)) return Array.from(out);

  const hasLegacy1 = existsSync(join(baseCwd, ".deuk-agent-ticket"));
  const hasLegacy2 = existsSync(join(baseCwd, ".deuk-agent-tickets"));
  const hasNew = existsSync(join(baseCwd, AGENT_ROOT_DIR, TICKET_SUBDIR));

  if (hasLegacy1 || hasLegacy2 || hasNew) {
    out.add(baseCwd);
  }

  try {
    const entries = readdirSync(baseCwd, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      // Skip system or noisy directories based on ignoreDirs configuration
      if (ignoreDirs.includes(ent.name) || ent.name.startsWith(".deuk-agent")) continue;
      discoverAllSubmodules(join(baseCwd, ent.name), ignoreDirs, out);
    }
  } catch {
    // Ignore permission errors on specific subfolders
  }
  return Array.from(out);
}
