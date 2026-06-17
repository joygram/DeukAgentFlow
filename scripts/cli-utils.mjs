import { existsSync, readFileSync } from "fs";
import { basename, dirname, join, relative } from "path";

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
