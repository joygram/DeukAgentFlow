import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, unlinkSync, copyFileSync } from "fs";
import { basename, dirname, join, relative } from "path";
import { createHash } from "crypto";
import { hostname as osHostname } from "os";
import { toPosixPath, toRepoRelativePath, toSlug, formatTimestampForFile, makeEntryId, detectProjectFromBody, deriveTopicFromBaseName, parseFrontMatter, stringifyFrontMatter, loadInitConfig } from "./cli-utils.mjs";

export const TICKET_DIR_NAME = ".deuk-agent-ticket";
export const TICKET_INDEX_FILENAME = "INDEX.json";
export const TICKET_LIST_FILENAME = "TICKET_LIST.md";
export const TICKET_LIST_TEMPLATE_FILENAME = "TICKET_LIST.template.md";

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
  let curr = startDir;
  while (curr && curr !== dirname(curr)) {
    const p = join(curr, TICKET_DIR_NAME);
    if (existsSync(p)) return p;
    curr = dirname(curr);
  }
  // If not found and creation allowed (init), return default local path.
  // Otherwise return null to indicate no ticket system found.
  return opts.createIfMissing ? join(startDir, TICKET_DIR_NAME) : null;
}

export function readTicketIndexJson(cwd) {
  const dir = detectConsumerTicketDir(cwd);
  if (!dir) return { version: 1, updatedAt: null, entries: [] };
  const p = join(dir, TICKET_INDEX_FILENAME);
  if (!existsSync(p)) return { version: 1, updatedAt: null, entries: [] };
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    const entries = Array.isArray(j.entries) ? j.entries.map(e => ({ ...e, status: e.status || "open" })) : [];
    return { version: 1, updatedAt: j.updatedAt ?? null, entries };
  } catch {
    return { version: 1, updatedAt: null, entries: [] };
  }
}

export function writeTicketIndexJson(cwd, indexJson, opts = {}) {
  const dir = detectConsumerTicketDir(cwd, { createIfMissing: true });
  const p = join(dir, TICKET_INDEX_FILENAME);
  if (opts.dryRun) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(indexJson, null, 2) + "\n", "utf8");
}

export function renderTicketListMarkdown(cwd, entries) {
  const sorted = [...entries].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const latest = sorted.find(e => e.status !== "archived") || sorted[0] || null;

  const ticketDir = detectConsumerTicketDir(cwd, { createIfMissing: true });
  const templatePath = join(ticketDir, TICKET_LIST_TEMPLATE_FILENAME);
  const template = existsSync(templatePath) ? readFileSync(templatePath, "utf8") : DEFAULT_TICKET_LIST_TEMPLATE;

  let latestBlock = "- No active ticket entries yet.";
  if (latest) {
    const relPath = toPosixPath(relative(ticketDir, join(cwd, latest.path)));
    const safeLatestTitle = String(latest.title || "").replace(/\[|\]/g, '').replace(/\n/g, ' ');
    latestBlock = `- [${safeLatestTitle}](${relPath})\n- status: \`${latest.status}\` / group: \`${latest.group}\` / project: \`${latest.project}\``;
  }

  const activeRows = sorted.filter(e => e.status !== "archived").map((e, i) => renderLine(e, i, ticketDir, cwd));
  const archivedRows = sorted.filter(e => e.status === "archived").slice(0, 50).map((e, i) => renderLine(e, i, ticketDir, cwd));

  let combinedRows = "### 🚀 Active Tickets\n\n| # | Status | Pri | Title | Group | Project | Created | Path |\n|---|---|---|---|---|---|---|---|\n" + 
                     (activeRows.join("\n") || "| - | - | - | No active tickets | - | - | - | - |") + 
                     "\n\n### 📦 Archived Tickets\n\n| # | Status | Pri | Title | Group | Project | Created | Path |\n|---|---|---|---|---|---|---|---|\n" + 
                     (archivedRows.join("\n") || "| - | - | - | No archived tickets | - | - | - | - |");

  return template
    .replaceAll("{{SOURCE_INDEX}}", `${TICKET_DIR_NAME}/${TICKET_INDEX_FILENAME}`)
    .replaceAll("{{LATEST_BLOCK}}", latestBlock)
    .replaceAll("{{ENTRIES_ROWS}}", combinedRows)
    .replaceAll("{{CMD_LIST}}", "npx deuk-agent-rule ticket list")
    .replaceAll("{{CMD_USE_LATEST}}", "npx deuk-agent-rule ticket use --latest");
}

function renderLine(e, i, ticketDir, cwd) {
  const relPath = toPosixPath(relative(ticketDir, join(cwd, e.path)));
  const statusIcon = e.status === "active" ? "🔥 " : (e.status === "archived" ? "📦 " : "[ ] ");
  const safeTitle = String(e.title || "").replace(/\|/g, '&#124;').replace(/(\n|\\n)+/g, ' ');
  const prio = e.priority || "P2";
  return `| ${i + 1} | ${statusIcon}${e.status} | ${prio} | ${safeTitle} | ${e.group} | ${e.project} | ${e.createdAt.split('T')[0]} | [open](${relPath}) |`;
}

export function writeTicketListFile(cwd, entries, opts = {}) {
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
  const next = { version: 1, updatedAt: new Date().toISOString(), entries: [entry, ...indexJson.entries] };
  writeTicketIndexJson(cwd, next, opts);
  writeTicketListFile(cwd, next.entries, opts);
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
  const root = join(cwd, TICKET_DIR_NAME);
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
  const rootTicketDir = join(cwd, TICKET_DIR_NAME);
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
        const subTicketDir = join(subPath, TICKET_DIR_NAME);
        mkdirSync(subTicketDir, { recursive: true });
        
        const relToRoot = relative(rootTicketDir, abs);
        const destAbs = join(subTicketDir, relToRoot);
        
        if (opts.dryRun) {
          console.log(`[DRY-RUN] Would move to submodule: ${relToRoot} -> ${meta.submodule}/${TICKET_DIR_NAME}/`);
        } else {
          mkdirSync(dirname(destAbs), { recursive: true });
          copyFileSync(abs, destAbs);
          unlinkSync(abs);
          console.log(`[DEFRAG] Moved: ${meta.submodule}/${TICKET_DIR_NAME}/${relToRoot}`);
          modifiedSubmodules.add(subPath);
        }
      }
    }
  }

  // Re-index all touched submodules
  if (!opts.dryRun) {
    for (const subCwd of modifiedSubmodules) {
      rebuildTicketIndexFromTopicFilesIfNeeded(subCwd, { ...opts, force: true });
      syncActiveTicketPointer(subCwd);
    }
  }
}

function moveFileToArchive(cwd, abs, group) {
  const archiveBase = join(cwd, TICKET_DIR_NAME, "archive");
  const targetSubDir = (group === TICKET_DIR_NAME || !group) ? "sub" : group;
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
 * Finds all .deuk-agent-ticket directories recursively, skipping node_modules/.git
 */
export function discoverAllTicketDirs(baseCwd, out = []) {
  if (!existsSync(baseCwd)) return out;
  const entries = readdirSync(baseCwd, { withFileTypes: true });
  
  // If current dir has .deuk-agent-ticket, add it
  const local = join(baseCwd, TICKET_DIR_NAME);
  if (existsSync(local) && statSync(local).isDirectory()) {
    out.push(local);
  }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name === "node_modules" || ent.name === ".git" || ent.name === TICKET_DIR_NAME) continue;
    discoverAllTicketDirs(join(baseCwd, ent.name), out);
  }
  return out;
}

export function rebuildTicketIndexFromTopicFilesIfNeeded(cwd, opts = {}) {
  const indexJson = readTicketIndexJson(cwd);
  // Hierarchical Scan: If we are at root, discover all sub-dirs. 
  const isRoot = existsSync(join(cwd, "DeukAgentRules")) || existsSync(join(cwd, "project_i"));
  
  let ticketDirs = [];
  if (opts.recursive !== false && isRoot) {
    ticketDirs = discoverAllTicketDirs(cwd);
  } else {
    const local = join(cwd, TICKET_DIR_NAME);
    if (existsSync(local) && statSync(local).isDirectory()) {
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
      submodule: meta.submodule || (rel.startsWith(TICKET_DIR_NAME) ? "" : rel.split("/")[0]),
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

export function parseLegacyTicketMeta(legacyBody) {
  // Supports ## Task: ... or # Plan: ... or # Implementation Plan: ...
  const titleMatch = legacyBody.match(/^(?:##\s+Task:|#\s+Plan:|#\s+Implementation Plan:)\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "Migrated legacy plan";

  let group = "sub";
  const lower = legacyBody.toLowerCase();
  if (lower.includes("discussion")) group = "discussion";
  else if (lower.includes("main")) group = "main";

  return { title, group, project: detectProjectFromBody(legacyBody) };
}

export function getLegacyMigrationCandidate(cwd) {
  const candidateFiles = ["LATEST.md"];
  const candidateDirs = [cwd, join(cwd, TICKET_DIR_NAME), join(cwd, "ticket")];
  for (const dir of candidateDirs) {
    for (const file of candidateFiles) {
      const p = join(dir, file);
      if (existsSync(p)) {
        const body = readFileSync(p, "utf8");
        // Check for common plan or task markers
        if (body.length > 50 && (/^##\s+Task:/m.test(body) || /^#\s+Plan:/m.test(body))) {
          return { latestPath: p, body };
        }
      }
    }
  }
  return null;
}

export function syncActiveTicketPointer(cwd) {
  const index = readTicketIndexJson(cwd);
  // Find the single "active" ticket, or the most recent "open" ticket.
  const activeEntry = index.entries.find(e => e.status === "active") || 
                      index.entries.find(e => e.status === "open");
  
  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) return;

  // LATEST.md is deprecated. Remove it on every sync to prevent stale reads.
  const legacyLatestPath = join(ticketDir, "LATEST.md");
  if (existsSync(legacyLatestPath)) {
    unlinkSync(legacyLatestPath);
  }

  const pointerPathMd = join(ticketDir, "ACTIVE_TICKET.md");
  const pointerPathJson = join(ticketDir, "ACTIVE_TICKET.json");
  
  if (activeEntry) {
    const srcAbs = join(cwd, activeEntry.path);
    if (existsSync(srcAbs)) {
      const redirectBody = `# 🚀 Active Ticket Redirect\n\n> **[STOP] DO NOT EDIT THIS FILE!**\n> This is a pointer file. Editing this file will result in data loss because it is not the original ticket.\n\n**Please open and edit the original ticket here:**\n🔗 [${basename(activeEntry.path)}](/${toPosixPath(activeEntry.path)})\n\n---\n*Original Path:* \`${activeEntry.path}\`\n*Topic:* \`${activeEntry.topic}\``;
      const redirectContent = stringifyFrontMatter({
          id: activeEntry.id || "pointer",
          title: activeEntry.title || "ACTIVE_TICKET_POINTER",
          topic: activeEntry.topic || "",
          status: activeEntry.status || "active",
          submodule: activeEntry.submodule || "",
          project: activeEntry.project || "",
          createdAt: activeEntry.createdAt || new Date().toISOString()
      }, redirectBody);
      writeFileSync(pointerPathMd, redirectContent, "utf8");
      writeFileSync(pointerPathJson, JSON.stringify({ ...activeEntry, syncedAt: new Date().toISOString() }, null, 2), "utf8");
      
      // Hook: Optional background sync to remote pipeline
      const config = loadInitConfig(cwd);
      if (config && config.remoteSync && config.pipelineUrl) {
        syncToPipeline(config.pipelineUrl, { action: "sync_active", ticket: activeEntry });
      }
      return;
    }
  }

  // If no active ticket, clear pointers
  const noTicketMsg = "# No Active Ticket Found\nUse `npx deuk-agent-rule ticket list` to find open tasks.\n";
  writeFileSync(pointerPathMd, noTicketMsg, "utf8");
  writeFileSync(pointerPathJson, JSON.stringify({ status: "none", message: "No active ticket" }), "utf8");
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
 * Computes next sequential 3-digit ticket number by scanning all entries
 * in the current INDEX.json. Parses both legacy (`ticket_NNN_*`) and
 * new (`NNN-topic-hostname`) formats for backward compatibility.
 *
 * @param {object[]} existingEntries - entries array from INDEX.json
 * @returns {{ num: number, hostname: string }}
 */
export function computeNextTicketNumber(existingEntries) {
  const hostname = getHostnameSlug();
  // Legacy: ticket_NNN_*  |  New: NNN-* (NNN is strictly 3-4 digits, NOT a unix timestamp)
  const legacyRe = /^ticket_(\d{3,4})_/;
  const newRe = /^(\d{3,4})-/;
  let max = 0;
  for (const e of (existingEntries || [])) {
    const id = String(e.id || '');
    const mLegacy = id.match(legacyRe);
    const mNew = id.match(newRe);
    const m = mLegacy || mNew;
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
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
  const { num, hostname } = computeNextTicketNumber(existingEntries);
  const numStr = String(num).padStart(3, '0');
  const slug = toSlug(topicSlug || 'ticket').slice(0, 32);
  return `${numStr}-${slug}-${hostname}`;
}

/**
 * @deprecated Use generateTicketId(topicSlug, existingEntries)
 * Kept for backwards compatibility.
 */
export function generateTicketIdLegacy(title) {
  const seed = `${title}-${Date.now()}-${Math.random()}`;
  try {
    return "ticket_" + createHash("md5").update(seed).digest("hex").slice(0, 12);
  } catch {
    return "ticket_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  }
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
