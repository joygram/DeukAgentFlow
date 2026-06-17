import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import {
  AGENT_ROOT_DIR, TICKET_SUBDIR, TICKET_LIST_FILENAME,
  toPosixPath, toRepoRelativePath, detectProjectFromBody, deriveTopicFromBaseName, normalizeTicketGroup,
  parseFrontMatter, stringifyFrontMatter, discoverAllWorkspaces, detectConsumerTicketDir,
  ARCHIVE_YEAR_MONTH_RE, ARCHIVE_DAY_RE
} from "./cli-utils.mjs";
import { readTicketIndexJson, writeTicketIndexJson } from "./cli-ticket-index.mjs";

export function collectTicketMarkdownFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name);
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    if (ent.isDirectory()) collectTicketMarkdownFiles(abs, out);
    else if (ent.isFile() && /\.md$/i.test(ent.name)) {
      const base = ent.name;
      if (base === "LATEST.md" || base === TICKET_LIST_FILENAME || base === "ACTIVE_TICKET.md") continue;
      out.push(abs);
    }
  }
  return out;
}

export function discoverAllTicketDirs(baseCwd, out = []) {
  return discoverAllWorkspaces(baseCwd, undefined, new Set(out));
}

export function rebuildTicketIndexFromTopicFilesIfNeeded(cwd, opts = {}) {
  const indexJson = readTicketIndexJson(cwd);
  
  if (indexJson.entries.length > 0 && !opts.force && !opts.rebuild) {
    return indexJson;
  }

  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) return indexJson;

  // Strictly scan only the official ticket system directory and its subdirectories
  const ticketDirs = [ticketDir];


  if (ticketDirs.length === 0) return indexJson;

  const files = [];
  for (const dir of ticketDirs) {
    collectTicketMarkdownFiles(dir, files);
  }

  let dirty = false;
  const newEntries = [];

  for (let i = 0; i < files.length; i++) {
    const entry = processTicketFile(files[i], cwd, indexJson, opts);
    if (entry) newEntries.push(entry);
  }

  if (JSON.stringify(indexJson.entries) !== JSON.stringify(newEntries)) {
    dirty = true;
  }

  if (dirty || opts.force || opts.rebuild) {
    newEntries.sort((a,b) => String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
    const next = { version: 1, updatedAt: new Date().toISOString(), entries: newEntries };
    writeTicketIndexJson(cwd, next, opts);
    if (opts.rebuild) console.log(`[REBUILD] INDEX.json rebuilt with ${newEntries.length} entries.`);
    return next;
  }

  return indexJson;
}

function processTicketFile(abs, cwd, indexJson, opts) {
  const rel = toPosixPath(toRepoRelativePath(cwd, abs));
  const filename = basename(abs);
  const idFromFilename = filename.replace(/\.md$/i, "");
  const isAlreadyInArchive = rel.includes("/archive/");
  const storage = parseTicketStorage(rel, isAlreadyInArchive, abs);
  const group = storage.group;

  // Optimization: If entry already exists in index and not forced, reuse metadata to save I/O & tokens
  const existing = indexJson.entries.find(e => e.id === idFromFilename);
  if (existing && !opts.force) {
    return {
      ...existing,
      group,
      archiveYearMonth: storage.archiveYearMonth || existing.archiveYearMonth,
      archiveDay: storage.archiveDay || existing.archiveDay,
      status: isAlreadyInArchive ? "archived" : (existing.status === "archived" ? "open" : existing.status),
      updatedAt: statSync(abs).mtime.toISOString()
    };
  }

  // New or forced entry: Parse file content
  let meta = {}, content = "";
  try {
    const body = readFileSync(abs, "utf8");
    const parsed = parseFrontMatter(body);
    meta = parsed.meta;
    content = parsed.content;
  } catch (err) {
    console.warn(`[WARNING] Failed to parse ${rel}: ${err.message}`);
  }

  const title = meta.title || idFromFilename;
  const project = meta.project || detectProjectFromBody(content);

  return {
    id: meta.id || idFromFilename,
    title,
    topic: deriveTopicFromBaseName(filename),
    group,
    fileName: filename,
    project,
    submodule: meta.submodule || (rel.startsWith(AGENT_ROOT_DIR) ? "" : rel.split("/")[0]),
    createdAt: meta.createdAt || statSync(abs).mtime.toISOString(),
    updatedAt: statSync(abs).mtime.toISOString(),
    source: "ticket-sync",
    status: isAlreadyInArchive ? "archived" : (meta.status || "open"),
    archiveYearMonth: storage.archiveYearMonth,
    archiveDay: storage.archiveDay,
  };
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

  return { group: normalizeTicketGroup(group) };
}

export function appendTicketEntry(cwd, entry, opts = {}) {
  const indexJson = readTicketIndexJson(cwd);
  entry.status = entry.status || "open";
  // We no longer store 'path' snapshots in INDEX.json
  const { path, ...cleanEntry } = entry;
  const next = { 
    version: indexJson.version || 1, 
    updatedAt: new Date().toISOString(), 
    activeTicketId: indexJson.activeTicketId, 
    entries: [cleanEntry, ...indexJson.entries] 
  };
  writeTicketIndexJson(cwd, next, opts);
}

export function updateTicketEntryStatus(cwd, opts = {}) {
  const indexJson = rebuildTicketIndexFromTopicFilesIfNeeded(cwd, opts);
  let foundIndex = -1;
  const targetTopic = opts.topic ? String(opts.topic).toLowerCase() : null;
  
  if (opts.latest) {
    foundIndex = 0;
  } else if (targetTopic) {
    // Match against both topic AND id for consistency with pickTicketEntry
    foundIndex = indexJson.entries.findIndex(e =>
      String(e.topic || "").toLowerCase().includes(targetTopic) ||
      String(e.id || "").toLowerCase().includes(targetTopic)
    );
  }

  if (foundIndex === -1) {
    throw new Error("No matching ticket found to update status");
  }

  const entry = indexJson.entries[foundIndex];
  const newStatus = opts.status || "closed";
  entry.status = newStatus;
  if (newStatus === "closed" || newStatus === "cancelled" || newStatus === "wontfix") {
    entry.phase = 4;
  }
  entry.updatedAt = new Date().toISOString();
  
  // Sync status back to .md frontmatter to prevent rebuild reversion
  const absPath = join(cwd, entry.path);
  if (existsSync(absPath)) {
    try {
      const body = readFileSync(absPath, "utf8");
      const parsed = parseFrontMatter(body);
      if (parsed.meta.status !== newStatus) {
        parsed.meta.status = newStatus;
        if (newStatus === "closed" || newStatus === "cancelled" || newStatus === "wontfix") {
          parsed.meta.phase = 4;
        }
        const newBody = stringifyFrontMatter(parsed.meta, parsed.content);
        writeFileSync(absPath, newBody, "utf8");
      }
    } catch (err) {
      console.warn(`[WARNING] Failed to sync status to ${entry.path}: ${err.message}`);
    }
  }

  const next = { version: indexJson.version, updatedAt: new Date().toISOString(), entries: indexJson.entries };
  writeTicketIndexJson(cwd, next, opts);
  return entry;
}
