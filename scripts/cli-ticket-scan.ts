import { existsSync,readdirSync,readFileSync,statSync } from "fs";
import { basename,dirname } from "path";
import {
ARCHIVE_DAY_RE,
ARCHIVE_YEAR_MONTH_RE,
detectConsumerTicketDir,
detectProjectFromBody,
DEUK_ROOT_DIR,
makePath,
normalizeTicketGroup,
parseFrontMatter,
TICKET_LIST_FILENAME,
toPosixPath,toRepoRelativePath
} from "./cli-utils.js";
import { inferTicketWorkflowStatus } from "./ticket-workflow.js";

export function collectTicketMarkdownFiles(dir, out = [], opts: { skipArchive?: boolean } = {}) {
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    if (opts.skipArchive && ent.isDirectory() && ent.name === "archive") continue;
    const abs = makePath(dir, ent.name);
    if (ent.isDirectory()) collectTicketMarkdownFiles(abs, out, opts);
    else if (ent.isFile() && /\.md$/i.test(ent.name)) {
      const base = ent.name;
      if (base === "LATEST.md" || base === TICKET_LIST_FILENAME || base === "ACTIVE_TICKET.md" || base === "project-memory.md" || base === "PROJECT_RULE.md") continue;
      out.push(abs);
    }
  }
  return out;
}

function parseTicketStorage(rel, isArchived, abs) {
  if (!isArchived) {
    return { group: basename(dirname(abs)) };
  }

  const parts = rel.split("/");
  const archiveIdx = parts.indexOf("archive");
  const group = parts[archiveIdx + 1] || basename(dirname(abs));
  const maybeYearMonth = parts[archiveIdx + 2];
  const maybeDay = parts[archiveIdx + 3];

  if (ARCHIVE_YEAR_MONTH_RE.test(String(maybeYearMonth || "")) && ARCHIVE_DAY_RE.test(String(maybeDay || ""))) {
    return { group: normalizeTicketGroup(group), archiveYearMonth: maybeYearMonth, archiveDay: maybeDay };
  }

  if (ARCHIVE_YEAR_MONTH_RE.test(String(maybeYearMonth || ""))) {
    return { group: normalizeTicketGroup(group), archiveYearMonth: maybeYearMonth };
  }

  return { group: normalizeTicketGroup(group) };
}

export function buildTicketEntry(abs, cwd, opts: { lite?: boolean } = {}) {
  const rel = toPosixPath(toRepoRelativePath(cwd, abs));
  const filename = basename(abs);
  const idFromFilename = filename.replace(/\.md$/i, "");
  const isAlreadyInArchive = rel.includes("/archive/");
  const storage = parseTicketStorage(rel, isAlreadyInArchive, abs);
  const group = storage.group;
  const mtimeIso = statSync(abs).mtime.toISOString();

  let meta: Record<string, any> = {}, content = "";
  try {
    const body = readFileSync(abs, "utf8");
    const parsed = parseFrontMatter(body);
    meta = parsed.meta;
    content = parsed.content;
  } catch (err) {
    console.warn(`[WARNING] Failed to parse ${rel}: ${err.message}`);
  }

  const title = meta.title || idFromFilename;
  const project = meta.project || (opts.lite ? "global" : detectProjectFromBody(content));
  const phase = Number(meta.phase || 1);
  const status = inferTicketWorkflowStatus(meta, isAlreadyInArchive);

  return {
    id: meta.id || idFromFilename,
    title,
    group,
    fileName: filename,
    project,
    mainTicket: meta.mainTicket,
    submodule: meta.submodule || (rel.startsWith(DEUK_ROOT_DIR) ? "" : rel.split("/")[0]),
    createdAt: meta.createdAt || mtimeIso,
    updatedAt: mtimeIso,
    source: "ticket-sync",
    phase,
    status,
    archiveYearMonth: storage.archiveYearMonth,
  };
}

export function collectTicketEntriesFromTopicFiles(cwd, opts: { activeOnly?: boolean } = {}) {
  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) return [];
  const files = collectTicketMarkdownFiles(ticketDir, [], { skipArchive: Boolean(opts.activeOnly) });
  return files.map(abs => buildTicketEntry(abs, cwd, { lite: Boolean(opts.activeOnly) }));
}
