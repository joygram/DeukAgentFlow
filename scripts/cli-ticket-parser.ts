import { existsSync, readFileSync } from "fs";
import {
  parseFrontMatter, discoverAllWorkspaces, detectConsumerTicketDir, computeTicketPath, makePath
 , CliOpts } from "./cli-utils.js";
import { readTicketIndexJson, writeTicketIndexJson } from "./cli-ticket-index.js";
import { splitTicketDocMetaSection } from "./cli-ticket-docmeta.js";
import { writeTicketDocument } from "./cli-ticket-document.js";

export { collectTicketMarkdownFiles } from "./cli-ticket-scan.js";

export function discoverAllTicketDirs(baseCwd, out = []) {
  return discoverAllWorkspaces(baseCwd, undefined, new Set(out));
}

export function rebuildTicketIndexFromTopicFilesIfNeeded(cwd, opts: CliOpts = {}) {
  // readTicketIndexJson already derives entries from the .md files (single source
  // of truth) and merges in the thin pointer state (activeTicketId/nextTicketSequence).
  const indexJson = readTicketIndexJson(cwd);

  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) return indexJson;

  // Persist the thin pointer file so activeTicketId/nextTicketSequence are kept in
  // sync on disk. writeTicketIndexJson stores ONLY the pointer state, never entries.
  writeTicketIndexJson(cwd, indexJson, indexJson._corrupt ? { ...opts, force: true } : opts);
  if (opts.rebuild) console.log(`[REBUILD] Ticket pointer synced; ${indexJson.entries.length} entries derived from .md.`);
  return indexJson;
}

export function appendTicketEntry(cwd, entry, opts: CliOpts = {}) {
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

export function updateTicketEntryStatus(cwd, opts: CliOpts = {}) {
  const indexJson = rebuildTicketIndexFromTopicFilesIfNeeded(cwd, opts);
  let foundIndex = -1;
  const targetId = opts.ticketId ? String(opts.ticketId).toLowerCase() : null;
  
  if (opts.latest) {
    foundIndex = 0;
  } else if (targetId) {
    foundIndex = indexJson.entries.findIndex(e =>
      String(e.id || "").toLowerCase().includes(targetId)
    );
  }

  if (foundIndex === -1) {
    throw new Error("No matching ticket found to update status");
  }

  const entry = indexJson.entries[foundIndex];
  const newStatus = opts.status || "closed";
  entry.status = newStatus;
  if (newStatus === "open" || newStatus === "active") {
    delete entry.archiveYearMonth;
    delete entry.archiveDay;
  }
  if (newStatus === "closed" || newStatus === "completed" || newStatus === "cancelled" || newStatus === "wontfix") {
    entry.phase = 4;
  }
  entry.updatedAt = new Date().toISOString();
  
  // Sync status back to .md frontmatter to prevent rebuild reversion.
  // #736: cwd is the WORKSPACE root; tickets live in the HOME store (detectConsumerTicketDir).
  // makePath(workspaceRoot, relativePath) misses the file → use the ticket dir as base.
  const entryPath = entry.path || computeTicketPath(entry);
  const ticketDir = detectConsumerTicketDir(cwd) || cwd;
  const absPath = makePath(ticketDir, entryPath);
  if (existsSync(absPath)) {
    try {
      const body = readFileSync(absPath, "utf8");
      const parsed = parseFrontMatter(body);
      if (parsed.parseError) throw new Error(parsed.parseError);
      if (parsed.meta.status !== newStatus) {
        parsed.meta.status = newStatus;
        if (newStatus === "closed" || newStatus === "completed" || newStatus === "cancelled" || newStatus === "wontfix") {
          parsed.meta.phase = 4;
        }
        const ticketDocMeta = splitTicketDocMetaSection(parsed.content || "");
        writeTicketDocument(absPath, { meta: parsed.meta, content: ticketDocMeta.body, docmeta: ticketDocMeta.docmeta });
      }
    } catch (err) {
      console.warn(`[WARNING] Failed to sync status to ${entryPath}: ${err.message}`);
    }
  }

  const next = { version: indexJson.version, updatedAt: new Date().toISOString(), entries: indexJson.entries };
  writeTicketIndexJson(cwd, next, opts);
  return entry;
}
