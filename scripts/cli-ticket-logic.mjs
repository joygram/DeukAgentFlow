import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, unlinkSync, copyFileSync } from "fs";
import { basename, dirname, join, relative, resolve } from "path";
import { createHash } from "crypto";
import { hostname as osHostname } from "os";
import { 
  toPosixPath, toRepoRelativePath, toSlug, formatTimestampForFile, makeEntryId, 
  detectProjectFromBody, deriveTopicFromBaseName, parseFrontMatter, stringifyFrontMatter, 
  loadInitConfig, findFileRecursively,
  AGENT_ROOT_DIR, TICKET_SUBDIR, TEMPLATE_SUBDIR, RULES_SUBDIR,
  TICKET_DIR_NAME, TICKET_INDEX_FILENAME, TICKET_LIST_FILENAME, TICKET_LIST_TEMPLATE_FILENAME
} from "./cli-utils.mjs";

const DEFAULT_TICKET_LIST_TEMPLATE = `# Ticket List

> Source index: \`{{SOURCE_INDEX}}\`

## Latest

{{LATEST_BLOCK}}

## Entries

| # | Title | Group | Project | Created | Path |
|---|---|---|---|---|---|
{{ENTRIES_ROWS}}

## Commands

\`\`\`bash
{{CMD_LIST}}
{{CMD_USE_LATEST}}
\`\`\`
`;

export function detectConsumerTicketDir(startDir, opts = {}) {
  let curr = resolve(startDir);
  while (curr && curr !== dirname(curr)) {
    // Priority 1: New consolidated path
    const newPath = join(curr, AGENT_ROOT_DIR, TICKET_SUBDIR);
    if (existsSync(newPath)) return newPath;
    
    // Priority 2: Legacy path
    const legacyPath = join(curr, ".deuk-agent-ticket");
    if (existsSync(legacyPath)) return legacyPath;
    
    curr = dirname(curr);
  }
  // If not found and creation allowed (init), return default new local path.
  return opts.createIfMissing ? join(startDir, AGENT_ROOT_DIR, TICKET_SUBDIR) : null;
}

export function readTicketIndexJson(cwd) {
  const dir = detectConsumerTicketDir(cwd);
  if (!dir) return { version: 1, updatedAt: null, entries: [] };
  const p = join(dir, TICKET_INDEX_FILENAME);
  if (!existsSync(p)) {
    return { version: 1, updatedAt: null, entries: [] };
  }
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    const entries = Array.isArray(j.entries) ? j.entries.map(e => ({ ...e, status: e.status || "open" })) : [];
    return { version: 1, updatedAt: j.updatedAt ?? null, activeTicketId: j.activeTicketId ?? null, entries };
  } catch (err) {
    console.error(`[ERROR] Failed to parse ${TICKET_INDEX_FILENAME} at ${p}:`, err.message);
    // Return empty but do NOT overwrite immediately unless forced
    return { version: 1, updatedAt: null, activeTicketId: null, entries: [], _corrupt: true };
  }
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
  writeFileSync(p, JSON.stringify(out, null, 2) + "\n", "utf8");
}

export function renderTicketListMarkdown(cwd, entries) {
  const sorted = [...entries].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const latest = sorted.find(e => e.status !== "archived") || sorted[0] || null;

  const ticketDir = detectConsumerTicketDir(cwd, { createIfMissing: true });
  const templatePath = join(ticketDir, TICKET_LIST_TEMPLATE_FILENAME);
  const template = existsSync(templatePath) ? readFileSync(templatePath, "utf8") : DEFAULT_TICKET_LIST_TEMPLATE;

  let latestBlock = "- No active ticket entries yet.";
  if (latest) {
    const absPath = join(cwd, latest.path);
    const fileUri = `file://${toPosixPath(absPath)}`;
    const safeLatestTitle = String(latest.title || "").replace(/\[|\]/g, '').replace(/\n/g, ' ');
    latestBlock = `- [${safeLatestTitle}](${fileUri})\n- status: \`${latest.status}\` / group: \`${latest.group}\` / project: \`${latest.project}\``;
  }

  const activeRows = sorted.filter(e => e.status !== "archived").map((e, i) => renderLine(e, i, ticketDir, cwd));
  const archivedRows = sorted.filter(e => e.status === "archived").slice(0, 50).map((e, i) => renderLine(e, i, ticketDir, cwd));

  let combinedRows = "### 🚀 Active Tickets\n\n| # | Status | Pri | Title | Group | Project | Created | Path |\n|---|---|---|---|---|---|---|---|\n" + 
                     (activeRows.join("\n") || "| - | - | - | No active tickets | - | - | - | - |") + 
                     "\n\n### 📦 Archived Tickets\n\n| # | Status | Pri | Title | Group | Project | Created | Path |\n|---|---|---|---|---|---|---|---|\n" + 
                     (archivedRows.join("\n") || "| - | - | - | No archived tickets | - | - | - | - |");

  return template
    .replaceAll("{{SOURCE_INDEX}}", `${toRepoRelativePath(cwd, ticketDir)}/${TICKET_INDEX_FILENAME}`)
    .replaceAll("{{LATEST_BLOCK}}", latestBlock)
    .replaceAll("{{ENTRIES_ROWS}}", combinedRows)
    .replaceAll("{{CMD_LIST}}", "npx deuk-agent-rule ticket list")
    .replaceAll("{{CMD_USE_LATEST}}", "npx deuk-agent-rule ticket use --latest");
}

function renderLine(e, i, ticketDir, cwd) {
  const absPath = join(cwd, e.path);
  const fileUri = `file://${toPosixPath(absPath)}`;
  const statusIcon = e.status === "active" ? "🔥 " : (e.status === "archived" ? "📦 " : "[ ] ");
  const safeTitle = String(e.title || "").replace(/\|/g, '&#124;').replace(/(\n|\\n)+/g, ' ');
  const prio = e.priority || "P2";
  return `| ${i + 1} | ${statusIcon}${e.status} | ${prio} | ${safeTitle} | ${e.group} | ${e.project} | ${e.createdAt.split('T')[0]} | [open](${fileUri}) |`;
}

export function writeTicketListFile(cwd, entries, opts = {}) {
  if (!opts.render) return; // Make it on-demand
  const ticketDir = detectConsumerTicketDir(cwd, { createIfMissing: true });
  const p = join(ticketDir, TICKET_LIST_FILENAME);
  if (opts.dryRun) return;
  const body = renderTicketListMarkdown(cwd, entries);
  mkdirSync(ticketDir, { recursive: true });
  writeFileSync(p, body, "utf8");
}

export function appendTicketEntry(cwd, entry, opts = {}) {
  const indexJson = readTicketIndexJson(cwd);
  entry.status = entry.status || "open";
  const next = { version: 1, updatedAt: new Date().toISOString(), activeTicketId: indexJson.activeTicketId, entries: [entry, ...indexJson.entries] };
  writeTicketIndexJson(cwd, next, opts);
  if (opts.render) writeTicketListFile(cwd, next.entries, opts);
}

export function updateTicketEntryStatus(cwd, opts = {}) {
  const indexJson = rebuildTicketIndexFromTopicFilesIfNeeded(cwd, opts);
  let foundIndex = -1;
  const targetTopic = opts.topic ? String(opts.topic).toLowerCase() : null;
  
  if (opts.latest) {
    foundIndex = 0;
  } else if (targetTopic) {
    foundIndex = indexJson.entries.findIndex(e => String(e.topic).toLowerCase().includes(targetTopic));
  }

  if (foundIndex === -1) {
    throw new Error("No matching ticket found to update status");
  }

  const entry = indexJson.entries[foundIndex];
  entry.status = opts.status || "closed";
  entry.updatedAt = new Date().toISOString(); // optional metadata update
  
  const next = { version: indexJson.version, updatedAt: new Date().toISOString(), entries: indexJson.entries };
  writeTicketIndexJson(cwd, next, opts);
  writeTicketListFile(cwd, next.entries, opts);
  return entry;
}

export function performUpgradeMigration(cwd, opts = {}) {
  const root = detectConsumerTicketDir(cwd, { createIfMissing: true });
  const archiveDir = join(root, "archive");
  
  const files = collectTicketMarkdownFiles(root).filter(p => {
    const base = basename(p);
    return base !== "LATEST.md" && base !== TICKET_LIST_FILENAME && base !== TICKET_LIST_TEMPLATE_FILENAME && base !== "ACTIVE_TICKET.md";
  });

  console.log(`[UPGRADE] Scanning ${files.length} tickets for V2 migration...`);

  let count = 0;
  for (const abs of files) {
    const rel = toRepoRelativePath(cwd, abs);
    const body = readFileSync(abs, "utf8");
    const { meta, content } = parseFrontMatter(body);

    if (meta.id && meta.status) {
      // Already V2, but check if it needs archiving
      const isAlreadyInArchive = rel.includes("/archive/");
      if (meta.status === "archived" && !isAlreadyInArchive && !opts.dryRun) {
        // Move to archive if status is archived but file is in root
        moveFileToArchive(cwd, abs, meta.group || "sub");
      }
      continue;
    }

    // V1 -> V2 Migration
    const titleMatch = content.match(/^##\s+Task:\s*(.+)$/m);
    const title = meta.title || titleMatch?.[1]?.trim() || basename(abs).replace(/\.md$/i, "");
    
    // Check if finished (all phases [x])
    const phases = content.match(/\[[ x/]]/g);
    const finished = phases && phases.length > 0 && phases.every(p => p.includes("x"));
    const isAlreadyInArchive = rel.includes("/archive/");

    let status = meta.status || "open";
    if (finished || isAlreadyInArchive) {
        status = "archived";
    }

    const project = meta.project || detectProjectFromBody(content);
    
    const newMeta = {
      id: meta.id || `000-legacy-${statSync(abs).mtimeMs}`,
      title,
      status,
      submodule: meta.submodule || (content.includes("DeukPack") ? "DeukPack" : ""),
      project,
      createdAt: meta.createdAt || statSync(abs).birthtime.toISOString(),
      updatedAt: new Date().toISOString()
    };

    const migratedBody = stringifyFrontMatter(newMeta, content);
    
    if (opts.dryRun) {
      console.log(`[DRY-RUN] Would upgrade: ${rel} (status: ${status})`);
    } else {
      let finalAbs = abs;
      if (status === "archived" && !isAlreadyInArchive) {
          finalAbs = moveFileToArchive(cwd, abs, basename(dirname(abs)));
      }
      writeFileSync(finalAbs, migratedBody, "utf8");
      console.log(`[OK] Upgraded: ${toRepoRelativePath(cwd, finalAbs)}`);
      count++;
    }
  }

  if (!opts.dryRun) {
    rebuildTicketIndexFromTopicFilesIfNeeded(cwd, { ...opts, force: true });
    performDefragmentation(cwd, opts); // NEW: Split to submodules
    syncActiveTicketPointer(cwd);
  }
  
  return count;
}

export function performDefragmentation(cwd, opts = {}) {
  const rootTicketDir = detectConsumerTicketDir(cwd);
  if (!rootTicketDir) return;
  const tickets = collectTicketMarkdownFiles(rootTicketDir).filter(p => {
    const base = basename(p);
    return base !== "LATEST.md" && base !== TICKET_LIST_FILENAME && base !== TICKET_LIST_TEMPLATE_FILENAME && base !== "ACTIVE_TICKET.md";
  });

  console.log(`[DEFRAG] Checking ${tickets.length} tickets for submodule placement...`);

  const modifiedSubmodules = new Set();
  
  for (const abs of tickets) {
    const { meta } = parseFrontMatter(readFileSync(abs, "utf8"));
    if (meta.submodule && meta.submodule !== "global") {
      const subPath = join(cwd, meta.submodule);
      if (existsSync(subPath) && statSync(subPath).isDirectory()) {
        const subTicketDir = join(subPath, AGENT_ROOT_DIR, TICKET_SUBDIR);
        mkdirSync(subTicketDir, { recursive: true });
        
        const relToRoot = relative(rootTicketDir, abs);
        const destAbs = join(subTicketDir, relToRoot);
        
        if (opts.dryRun) {
          console.log(`[DRY-RUN] Would move to submodule: ${relToRoot} -> ${meta.submodule}/${AGENT_ROOT_DIR}/${TICKET_SUBDIR}/`);
        } else {
          mkdirSync(dirname(destAbs), { recursive: true });
          copyFileSync(abs, destAbs);
          unlinkSync(abs);
          console.log(`[DEFRAG] Moved: ${meta.submodule}/${AGENT_ROOT_DIR}/${TICKET_SUBDIR}/${relToRoot}`);
          modifiedSubmodules.add(subPath);
        }
      }
    }
  }

  // Re-index all touched submodules
  if (!opts.dryRun) {
    for (const subCwd of modifiedSubmodules) {
      rebuildTicketIndexFromTopicFilesIfNeeded(subCwd, { ...opts, force: true });
      syncActiveTicketId(subCwd);
    }
  }
}

function moveFileToArchive(cwd, abs, group) {
  const ticketDir = detectConsumerTicketDir(cwd);
  const archiveBase = join(ticketDir, "archive");
  const targetSubDir = (basename(ticketDir) === TICKET_SUBDIR || !group) ? "sub" : group;
  const targetDir = join(archiveBase, targetSubDir);
  mkdirSync(targetDir, { recursive: true });
  const finalAbs = join(targetDir, basename(abs));
  if (finalAbs !== abs) {
    if (existsSync(finalAbs)) {
      unlinkSync(abs); // Already exists in archive
    } else {
      writeFileSync(finalAbs, readFileSync(abs, "utf8"), "utf8");
      unlinkSync(abs);
    }
  }
  return finalAbs;
}

export function collectTicketMarkdownFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name);
    // Ignore common noise
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    
    if (ent.isDirectory()) collectTicketMarkdownFiles(abs, out);
    else if (ent.isFile() && /\.md$/i.test(ent.name)) {
      const base = ent.name;
      if (base === "LATEST.md" || base === TICKET_LIST_FILENAME || base === TICKET_LIST_TEMPLATE_FILENAME || base === "ACTIVE_TICKET.md") continue;
      out.push(abs);
    }
  }
  return out;
}

/**
 * Finds all ticket directories recursively, skipping node_modules/.git
 */
export function discoverAllTicketDirs(baseCwd, out = []) {
  if (!existsSync(baseCwd)) return out;
  const entries = readdirSync(baseCwd, { withFileTypes: true });
  
  // New path check
  const localNew = join(baseCwd, AGENT_ROOT_DIR, TICKET_SUBDIR);
  if (existsSync(localNew) && statSync(localNew).isDirectory()) {
    out.push(localNew);
  }
  // Legacy path check (singular and plural)
  const localLegacy1 = join(baseCwd, ".deuk-agent-ticket");
  if (existsSync(localLegacy1) && statSync(localLegacy1).isDirectory()) {
    out.push(localLegacy1);
  }
  const localLegacy2 = join(baseCwd, ".deuk-agent-tickets");
  if (existsSync(localLegacy2) && statSync(localLegacy2).isDirectory()) {
    out.push(localLegacy2);
  }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name === "node_modules" || ent.name === ".git" || ent.name === AGENT_ROOT_DIR || ent.name === ".deuk-agent-ticket" || ent.name === ".deuk-agent-tickets") continue;
    discoverAllTicketDirs(join(baseCwd, ent.name), out);
  }
  return out;
}

export function rebuildTicketIndexFromTopicFilesIfNeeded(cwd, opts = {}) {
  const indexJson = readTicketIndexJson(cwd);
  // Hierarchical Scan: If we are at root (has AGENT_ROOT_DIR), discover all sub-dirs. 
  const isRoot = existsSync(join(cwd, AGENT_ROOT_DIR)) || existsSync(join(cwd, ".git"));
  
  let ticketDirs = [];
  if (opts.recursive !== false && isRoot) {
    ticketDirs = discoverAllTicketDirs(cwd);
  } else {
    const local = detectConsumerTicketDir(cwd);
    if (local) {
      ticketDirs = [local];
    }
  }

  if (ticketDirs.length === 0) return indexJson;

  const files = [];
  for (const dir of ticketDirs) {
    collectTicketMarkdownFiles(dir, files);
  }

  let dirty = false;
  const newEntries = [];

  for (let i = 0; i < files.length; i++) {
    const abs = files[i];
    const rel = toPosixPath(toRepoRelativePath(cwd, abs));
    const body = readFileSync(abs, "utf8");
    const { meta, content } = parseFrontMatter(body);
    const titleMatch = content.match(/^##\s+Task:\s*(.+)$/m);
    
    const title = meta.title || titleMatch?.[1]?.trim() || basename(abs).replace(/\.md$/i, "");
    const isAlreadyInArchive = rel.includes("/archive/");
    const status = isAlreadyInArchive ? "archived" : (meta.status || "open");
    const project = meta.project || detectProjectFromBody(content);
    const submodule = meta.submodule || "";

    newEntries.push({
      id: meta.id || makeEntryId(),
      title,
      topic: deriveTopicFromBaseName(basename(abs)),
      group: basename(dirname(abs)),
      project,
      submodule: meta.submodule || (rel.startsWith(AGENT_ROOT_DIR) ? "" : rel.split("/")[0]),
      createdAt: meta.createdAt || statSync(abs).mtime.toISOString(),
      updatedAt: meta.updatedAt || statSync(abs).mtime.toISOString(),
      path: rel,
      source: "ticket-sync",
      status,
    });
  }

  // Compare with old index to see if dirty
  if (JSON.stringify(indexJson.entries) !== JSON.stringify(newEntries)) {
    dirty = true;
  }

  if (dirty || opts.force) {
    newEntries.sort((a,b) => String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
    const next = { version: 1, updatedAt: new Date().toISOString(), entries: newEntries };
    writeTicketIndexJson(cwd, next, opts);
    writeTicketListFile(cwd, next.entries, opts);
    return next;
  }

  return indexJson;
}


export function syncActiveTicketId(cwd) {
  const index = readTicketIndexJson(cwd);
  // Find the single "active" ticket, or the most recent "open" ticket.
  const activeEntry = index.entries.find(e => e.status === "active") || 
                       index.entries.find(e => e.status === "open");
  
  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) return;

  const activeId = activeEntry ? activeEntry.id : null;
  if (index.activeTicketId !== activeId) {
      writeTicketIndexJson(cwd, { ...index, activeTicketId: activeId });
  }

  // Cleanup redundant pointers from legacy approach
  const legacyLatestPath = join(ticketDir, "LATEST.md");
  const pointerPathMd = join(ticketDir, "ACTIVE_TICKET.md");
  const pointerPathJson = join(ticketDir, "ACTIVE_TICKET.json");
  
  for (const p of [legacyLatestPath, pointerPathMd, pointerPathJson]) {
    if (existsSync(p)) {
      unlinkSync(p);
    }
  }
}


/**
 * Returns the machine hostname slug (lowercase, alphanumeric + hyphen only).
 */
export function getHostnameSlug() {
  try {
    const slug = osHostname().toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return slug.slice(0, 8).replace(/-$/, '') || 'local';
  } catch {
    return 'local';
  }
}

/**
 * Normalizes all paths in INDEX.json by finding the actual files in the ticket directory.
 * Useful after migration or manual folder restructuring.
 */
export function normalizeTicketPaths(cwd, opts = {}) {
  const index = readTicketIndexJson(cwd);
  const ticketDir = detectConsumerTicketDir(cwd);
  const entries = index.entries || [];
  let modified = false;

  for (const entry of entries) {
    if (!entry.path) continue;
    
    const currentAbs = join(cwd, entry.path);
    if (!existsSync(currentAbs)) {
      const fileName = basename(entry.path);
      const found = findFileRecursively(ticketDir, fileName);
      if (found) {
        const newRel = toRepoRelativePath(cwd, found);
        if (entry.path !== newRel) {
          entry.path = newRel;
          modified = true;
        }
      }
    }
  }

  if (modified) {
    index.updatedAt = new Date().toISOString();
    writeTicketIndexJson(cwd, index);
    if (!opts.silent) console.log(`[NORMALIZE] Corrected stale paths in ${basename(cwd)}/INDEX.json`);
  }
  return modified;
}

/**
 * Computes next sequential 3-digit ticket number by scanning all entries
 * in the current INDEX.json. Parses new (`NNN-topic-hostname`) format.
 *
 * @param {object[]} existingEntries - entries array from INDEX.json
 * @returns {{ num: number, hostname: string }}
 */
export function computeNextTicketNumber(existingEntries) {
  const hostname = getHostnameSlug();
  const newRe = /^(\d{3,4})-/;
  let max = 0;
  for (const e of (existingEntries || [])) {
    const id = String(e.id || '');
    const m = id.match(newRe);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max && n < 10000) max = n; // Sanity check for 4-digit limit
    }
  }
  return { num: max + 1, hostname };
}

/**
 * Sequential hostname-aware ticket ID.
 * Format: NNN-<topic-slug>-<hostname>
 * Example: 001-add-feature-joy-nucb
 * NNN starts at 001 and increments per local INDEX.json state.
 *
 * @param {string} topicSlug
 * @param {object[]} existingEntries - entries array from INDEX.json (may be empty)
 */
export function generateTicketId(topicSlug, existingEntries) {
  const hostname = getHostnameSlug();
  const slug = toSlug(topicSlug || 'ticket');
  
  // If topicSlug already starts with NNN-, respect it
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

/**
 * Async background sync to AI Pipeline.
 * Returning true on success, false on failure (for connect check).
 */
export async function syncToPipeline(url, data) {
  if (typeof fetch === "undefined") {
    // Node.js version < 18 or no fetch polyfill
    return false;
  }
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
