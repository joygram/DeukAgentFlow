import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, join, relative } from "path";
import YAML from "yaml";

export const INIT_CONFIG_FILENAME = ".deuk-agent-rule.config.json";
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
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
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
  return `ticket_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
  const yamlStr = YAML.stringify(meta).trim();
  return `---\n${yamlStr}\n---\n\n${content.trim()}\n`;
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
      if (data.version && data.version !== currentVersion) {
        console.warn(`\n\x1b[33m💡 Update available! ${currentVersion} → ${data.version}\x1b[0m`);
        console.warn(`\x1b[36mRun 'npm install -g deuk-agent-rule' to update.\x1b[0m\n`);
      }
    }
  } catch(e) {
    // Ignore timeout or network errors silently
  }
}
