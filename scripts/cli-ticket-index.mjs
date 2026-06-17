import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { hostname as osHostname } from "os";
import { 
  AGENT_ROOT_DIR, TICKET_SUBDIR, TICKET_INDEX_FILENAME,
  toSlug, findFileRecursively, toRepoRelativePath, detectConsumerTicketDir, computeTicketPath, normalizeTicketGroup
} from "./cli-utils.mjs";

const TICKET_ARCHIVE_INDEX_FILENAME = "INDEX.archive.json";
const TICKET_ARCHIVE_INDEX_PREFIX = "INDEX.archive.";
const ARCHIVE_INDEX_RETENTION_MONTHS = 12;
const ARCHIVE_INDEX_MONTH_RE = /^INDEX\.archive\.(\d{4}-\d{2})\.json$/;
const ARCHIVE_INDEX_LEGACY_RE = /^INDEX\.archive\.json$/;

function parseArchiveMonth(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month, yearMonth: `${match[1]}-${match[2]}` };
}

function monthDistance(fromYearMonth, toDate = new Date()) {
  const parsed = parseArchiveMonth(fromYearMonth);
  if (!parsed) return null;
  return (toDate.getUTCFullYear() * 12 + toDate.getUTCMonth()) - ((parsed.year * 12) + (parsed.month - 1));
}

function resolveArchivePartition(entry, now = new Date()) {
  const fromEntry = parseArchiveMonth(entry?.archiveYearMonth);
  if (fromEntry) {
    return {
      yearMonth: fromEntry.yearMonth,
      day: String(entry.archiveDay || "").match(/^\d{2}$/)?.[0] || String(now.getUTCDate()).padStart(2, "0")
    };
  }

  const source = String(entry?.createdAt || entry?.updatedAt || "");
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return { yearMonth: `${match[1]}-${match[2]}`, day: match[3] };
  }

  return {
    yearMonth: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    day: String(now.getUTCDate()).padStart(2, "0")
  };
}

function shouldRetainArchiveEntry(entry, now = new Date()) {
  const partition = resolveArchivePartition(entry, now);
  const distance = monthDistance(partition.yearMonth, now);
  if (distance === null) return true;
  return distance <= ARCHIVE_INDEX_RETENTION_MONTHS;
}

function archiveIndexFilePath(dir, yearMonth = null) {
  return join(dir, yearMonth ? `${TICKET_ARCHIVE_INDEX_PREFIX}${yearMonth}.json` : TICKET_ARCHIVE_INDEX_FILENAME);
}

function listArchiveIndexFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(ent => ent.isFile())
    .map(ent => join(dir, ent.name))
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
    return { version: 1, updatedAt: null, activeTicketId: null, entries: [] };
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
      activeTicketId: j.activeTicketId ?? null,
      entries
    };
  } catch (err) {
    console.error(`[ERROR] Failed to parse ${basename(absPath)} at ${absPath}:`, err.message);
    return { version: 1, updatedAt: null, activeTicketId: null, entries: [], _corrupt: true };
  }
}

function splitEntriesForStorage(entries = []) {
  const activeEntries = [];
  const archiveEntries = [];
  for (const entry of entries) {
    const status = String(entry?.status || "open").toLowerCase();
    if (status === "open" || status === "active") {
      activeEntries.push(entry);
    } else {
      archiveEntries.push(entry);
    }
  }
  return { activeEntries, archiveEntries };
}

function partitionArchiveEntries(entries = []) {
  const retained = [];
  const retired = [];
  for (const entry of entries) {
    if (shouldRetainArchiveEntry(entry)) retained.push(entry);
    else retired.push(entry);
  }
  return { retained, retired };
}

function mergeIndexEntries(primaryEntries = [], archiveEntries = []) {
  const merged = new Map();
  for (const entry of primaryEntries || []) {
    if (entry?.id) merged.set(entry.id, entry);
  }
  for (const entry of archiveEntries || []) {
    if (entry?.id) merged.set(entry.id, entry);
  }
  return Array.from(merged.values());
}

export function readTicketIndexJson(cwd) {
  const dir = detectConsumerTicketDir(cwd);
  if (!dir) return { version: 1, updatedAt: null, entries: [] };
  const mainPath = join(dir, TICKET_INDEX_FILENAME);
  const main = parseIndexFile(mainPath);
  const archiveFiles = listArchiveIndexFiles(dir).map(parseIndexFile);

  const archiveEntries = archiveFiles.flatMap(file => file.entries || []);
  const entries = mergeIndexEntries(main.entries, archiveEntries).map(entry => {
    const next = { ...entry, status: entry.status || "open", group: normalizeTicketGroup(entry.group, "sub") };
    next.path = computeTicketPath(next);
    return next;
  });

  return {
    version: main.version || archiveFiles[0]?.version || 1,
    updatedAt: main.updatedAt ?? archiveFiles[0]?.updatedAt ?? null,
    activeTicketId: main.activeTicketId ?? null,
    entries,
    _corrupt: Boolean(main._corrupt || archiveFiles.some(file => file._corrupt))
  };
}

export function writeTicketIndexJson(cwd, indexJson, opts = {}) {
  if (indexJson._corrupt && !opts.force) {
    console.error(`[ABORT] Refusing to overwrite potentially corrupt ${TICKET_INDEX_FILENAME}. Use --force to override.`);
    return;
  }
  const dir = detectConsumerTicketDir(cwd, { createIfMissing: true });
  const p = join(dir, TICKET_INDEX_FILENAME);
  if (opts.dryRun) return;
  mkdirSync(dir, { recursive: true });
  
  const out = { ...indexJson };
  delete out._corrupt;
  
  // Strip physical path snapshots before saving to enforce state-driven resolution
  const entries = Array.isArray(out.entries) ? out.entries : [];
  const { activeEntries, archiveEntries } = splitEntriesForStorage(entries);
  out.entries = activeEntries.map(e => {
    const { path, ...clean } = e;
    return clean;
  });
  out.activeTicketId = out.activeTicketId || activeEntries.find(e => e.status === "active")?.id || activeEntries.find(e => e.status === "open")?.id || null;
  writeFileSync(p, JSON.stringify(out, null, 2) + "\n", "utf8");

  const archiveFiles = listArchiveIndexFiles(dir);
  const retainedArchiveEntries = partitionArchiveEntries(archiveEntries);
  const archiveBuckets = new Map();

  for (const entry of retainedArchiveEntries.retained) {
    const partition = resolveArchivePartition(entry);
    const bucket = archiveBuckets.get(partition.yearMonth) || [];
    bucket.push({ ...entry, archiveYearMonth: partition.yearMonth, archiveDay: partition.day });
    archiveBuckets.set(partition.yearMonth, bucket);
  }

  const desiredArchiveFiles = new Set();
  for (const [yearMonth, bucket] of archiveBuckets.entries()) {
    const archiveOut = {
      version: out.version || 1,
      updatedAt: out.updatedAt || new Date().toISOString(),
      activeTicketId: null,
      entries: bucket.map(e => {
        const { path, ...clean } = e;
        return clean;
      })
    };
    const archivePath = archiveIndexFilePath(dir, yearMonth);
    desiredArchiveFiles.add(archivePath);
    writeFileSync(archivePath, JSON.stringify(archiveOut, null, 2) + "\n", "utf8");
  }

  for (const filePath of archiveFiles) {
    if (!desiredArchiveFiles.has(filePath)) {
      unlinkSync(filePath);
    }
  }

  if (retainedArchiveEntries.retired.length > 0) {
    console.log(`[GC] Dropped ${retainedArchiveEntries.retired.length} archived entries outside the ${ARCHIVE_INDEX_RETENTION_MONTHS}-month retention window.`);
  }
}

export function getHostnameSlug() {
  try {
    const slug = osHostname().toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return slug.slice(0, 8).replace(/-$/, '') || 'local';
  } catch {
    return 'local';
  }
}

export function computeNextTicketNumber(existingEntries) {
  const hostname = getHostnameSlug();
  const newRe = /^(\d{3,4})-/;
  let max = 0;
  for (const e of (existingEntries || [])) {
    const id = String(e.id || '');
    const m = id.match(newRe);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max && n < 10000) max = n;
    }
  }
  return { num: max + 1, hostname };
}

export function generateTicketId(topicSlug, existingEntries) {
  const hostname = getHostnameSlug();
  const slug = toSlug(topicSlug || 'ticket');
  const match = slug.match(/^(\d{3,4})-(.*)/);
  if (match) {
    const numStr = match[1];
    const restSlug = match[2].slice(0, 32);
    return `${numStr}-${restSlug}-${hostname}`;
  }
  const { num } = computeNextTicketNumber(existingEntries);
  const numStr = String(num).padStart(3, '0');
  const finalSlug = slug.slice(0, 32);
  return `${numStr}-${finalSlug}-${hostname}`;
}

export function syncActiveTicketId(cwd, opts = {}) {
  const index = readTicketIndexJson(cwd);
  const activeEntry = index.entries.find(e => e.status === "active") || 
                       index.entries.find(e => e.status === "open");
  
  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) return;
  if (opts.dryRun) return;

  const activeId = activeEntry ? activeEntry.id : null;
  if (index.activeTicketId !== activeId) {
      writeTicketIndexJson(cwd, { ...index, activeTicketId: activeId });
  }

  const legacyLatestPath = join(ticketDir, "LATEST.md");
  const pointerPathMd = join(ticketDir, "ACTIVE_TICKET.md");
  const pointerPathJson = join(ticketDir, "ACTIVE_TICKET.json");
  
  for (const p of [legacyLatestPath, pointerPathMd, pointerPathJson]) {
    if (existsSync(p)) {
      unlinkSync(p);
    }
  }
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
