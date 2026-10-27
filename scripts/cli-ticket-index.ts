import { existsSync,mkdirSync,readFileSync,readdirSync,renameSync,unlinkSync } from "fs";
import { basename } from "path";
import { collectTicketEntriesFromTopicFiles } from "./cli-ticket-scan.js";
import {
CliOpts,
TICKET_INDEX_FILENAME,
computeTicketPath,
detectConsumerTicketDir,
makePath,
normalizeTicketGroup,
requireNonEmptySlug,
writeFileLF
} from "./cli-utils.js";

const ARCHIVE_INDEX_MONTH_RE = /^INDEX\.archive\.(\d{4}-\d{2})\.json$/;
const ARCHIVE_INDEX_LEGACY_RE = /^INDEX\.archive\.json$/;

function parseNextTicketSequence(value) {
  const raw = Number(value);
  if (!Number.isInteger(raw) || raw < 1) return null;
  return raw;
}

function maxTicketNumberFromEntries(entries = []) {
  const newRe = /^([0-9]{3,4})-/;
  let max = 0;
  for (const e of (entries || [])) {
    const id = String(e.id || '');
    const m = id.match(newRe);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

function normalizeNextTicketSequence(nextTicketSequence, entries = []) {
  const fallbackNum = maxTicketNumberFromEntries(entries);
  const fallbackNext = fallbackNum < 9999 ? (fallbackNum + 1) : fallbackNum;
  const parsed = parseNextTicketSequence(nextTicketSequence);
  if (parsed === null) return fallbackNext || 1;
  return Math.max(parsed, fallbackNext || 1);
}

function writeJsonFileAtomically(absPath, data) {
  const serialized = JSON.stringify(data, null, 2) + "\n";
  const tmpPath = `${absPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileLF(tmpPath, serialized);
  try {
    renameSync(tmpPath, absPath);
  } catch (err) {
    try {
      if (existsSync(absPath)) {
        unlinkSync(absPath);
        renameSync(tmpPath, absPath);
      } else {
        throw err;
      }
    } catch {
      writeFileLF(absPath, serialized);
      if (existsSync(tmpPath)) {
        try { unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
      }
    }
  }
}

function listArchiveIndexFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(ent => ent.isFile())
    .map(ent => makePath(dir, ent.name))
    .filter(abs => ARCHIVE_INDEX_LEGACY_RE.test(basename(abs)) || ARCHIVE_INDEX_MONTH_RE.test(basename(abs)))
    .sort((a, b) => {
      const aBase = basename(a);
      const bBase = basename(b);
      const aMatch = aBase.match(ARCHIVE_INDEX_MONTH_RE);
      const bMatch = bBase.match(ARCHIVE_INDEX_MONTH_RE);
      if (aMatch && !bMatch) return 1;
      if (!aMatch && bMatch) return -1;
      if (!aMatch && !bMatch) return aBase.localeCompare(bBase);
      return aMatch[1].localeCompare(bMatch[1]);
    });
}

function parseIndexFile(absPath) {
  if (!existsSync(absPath)) {
    return { version: 1, updatedAt: null, activeTicketId: "", nextTicketSequence: 1, entries: [] };
  }
  try {
    const j = JSON.parse(readFileSync(absPath, "utf8"));
    const entries = Array.isArray(j.entries) ? j.entries.map(e => {
      const entry = { ...e, status: e.status || "open", group: normalizeTicketGroup(e.group, "sub") };
      entry.path = computeTicketPath(entry);
      return entry;
    }) : [];
    return {
      version: j.version || 1,
      updatedAt: j.updatedAt ?? null,
      activeTicketId: String(j.activeTicketId || ""),
      nextTicketSequence: parseNextTicketSequence(j.nextTicketSequence),
      entries
    };
  } catch (err) {
    console.error(`[ERROR] Failed to parse ${basename(absPath)} at ${absPath}:`, err.message);
    return { version: 1, updatedAt: null, activeTicketId: "", nextTicketSequence: 1, entries: [], _corrupt: true };
  }
}

export function readTicketIndexJson(cwd, opts: { activeOnly?: boolean } = {}) {
  const dir = detectConsumerTicketDir(cwd);
  if (!dir) return { version: 1, updatedAt: null, entries: [] };
  const mainPath = makePath(dir, TICKET_INDEX_FILENAME);
  const main = parseIndexFile(mainPath);

  const entries = collectTicketEntriesFromTopicFiles(cwd, { activeOnly: Boolean(opts.activeOnly) }).map(entry => {
    const next: Record<string, any> = { ...entry, status: entry.status || "open", group: normalizeTicketGroup(entry.group, "sub") };
    next.path = computeTicketPath(next);
    return next;
  });

  const liveEntries = entries.filter(e => {
    const status = String(e.status || "open").toLowerCase();
    return (status === "open" || status === "active") && Number(e.phase || 1) < 4 && !e.archiveYearMonth;
  });
  const sortedLive = [...liveEntries].sort((a, b) => {
    const phaseDiff = Number(b.phase || 1) - Number(a.phase || 1);
    if (phaseDiff !== 0) return phaseDiff;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
  const storedActiveId = String(main.activeTicketId || "").trim();
  const storedIsLive = storedActiveId && sortedLive.some(e => e.id === storedActiveId);
  const activeTicketId = storedIsLive ? storedActiveId : null;

  return {
    version: main.version || 1,
    updatedAt: main.updatedAt ?? null,
    activeTicketId,
    liveTicketIds: sortedLive.map(e => e.id),
    nextTicketSequence: normalizeNextTicketSequence(main.nextTicketSequence, entries),
    entries,
    _corrupt: Boolean(main._corrupt)
  };
}

export function writeTicketIndexJson(cwd, indexJson, opts: CliOpts = {}) {
  if (indexJson._corrupt && !opts.force) {
    console.error(`[ABORT] Refusing to overwrite potentially corrupt ${TICKET_INDEX_FILENAME}. Use --force to override.`);
    return;
  }
  const dir = detectConsumerTicketDir(cwd, { createIfMissing: true });
  if (!dir) {
    console.warn(`[TICKET-INDEX] skipped: no ticket dir resolved for ${cwd} (workspace marker missing?)`);
    return;
  }
  const p = makePath(dir, TICKET_INDEX_FILENAME);
  if (opts.dryRun) return;
  mkdirSync(dir, { recursive: true });
  
  const entries = Array.isArray(indexJson.entries) ? indexJson.entries : [];

  const currentDiskState = parseIndexFile(p);

  const callerNextSequence = normalizeNextTicketSequence(indexJson.nextTicketSequence, entries);
  const diskNextSequence = normalizeNextTicketSequence(currentDiskState.nextTicketSequence, entries);
  const nextTicketSequence = Math.max(callerNextSequence, diskNextSequence);

  const out = {
    version: indexJson.version || 1,
    updatedAt: indexJson.updatedAt || new Date().toISOString(),
    activeTicketId: String(indexJson.activeTicketId ?? currentDiskState.activeTicketId ?? ""),
    nextTicketSequence
  };
  writeJsonFileAtomically(p, out);

  for (const filePath of listArchiveIndexFiles(dir)) {
    unlinkSync(filePath);
  }
}

export function computeNextTicketNumber(indexState) {
  const maybeEntries = Array.isArray(indexState) ? indexState : indexState?.entries;
  const parsedNext = normalizeNextTicketSequence(indexState?.nextTicketSequence, maybeEntries);
  return { num: parsedNext };
}

export function generateTicketId(titleSlug, indexState) {
  const slug = requireNonEmptySlug(titleSlug, "ticket title");
  const match = slug.match(/^(\d{3,4})-(.*)/);
  const idSlug = match ? requireNonEmptySlug(match[2], "ticket title") : slug;
  if (/^\d{3,4}$/.test(idSlug)) {
    throw new Error("[VALIDATION FAILED] ticket title must include a non-numeric slug; ticket numbers are assigned by INDEX nextTicketSequence.");
  }
  const { num } = computeNextTicketNumber(indexState);
  const numStr = String(num).padStart(3, '0');
  const finalSlug = idSlug.slice(0, 32);
  return `${numStr}-${finalSlug}`;
}

export function syncActiveTicketId(cwd, opts: CliOpts = {}) {
  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) return;
  if (opts.dryRun) return;

  const legacyLatestPath = makePath(ticketDir, "LATEST.md");
  const pointerPathMd = makePath(ticketDir, "ACTIVE_TICKET.md");
  const pointerPathJson = makePath(ticketDir, "ACTIVE_TICKET.json");
  
  for (const p of [legacyLatestPath, pointerPathMd, pointerPathJson]) {
    if (existsSync(p)) {
      unlinkSync(p);
    }
  }

  const indexPath = makePath(ticketDir, TICKET_INDEX_FILENAME);
  const disk = parseIndexFile(indexPath);
  const storedActiveId = String(disk.activeTicketId || "").trim();
  if (!storedActiveId) return;

  const resolved = readTicketIndexJson(cwd);
  const nextActiveId = String(resolved.activeTicketId || "");
  if (nextActiveId === storedActiveId) return;

  writeTicketIndexJson(cwd, { ...disk, entries: resolved.entries, activeTicketId: nextActiveId }, opts);
}

export async function syncToPipeline(url, data) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal?.timeout ? AbortSignal.timeout(3000) : undefined
    });
    return response.ok;
  } catch (err) {
    return false;
  }
}
