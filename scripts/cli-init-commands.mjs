import { join, dirname, basename, relative } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, unlinkSync, rmSync, renameSync, statSync, cpSync } from "fs";

import { ensureTicketDirAndGitignore } from "./cli-init-logic.mjs";
import { normalizeTicketPaths } from "./cli-ticket-migration.mjs";
import { readTicketIndexJson } from "./cli-ticket-index.mjs";

import { runInteractive } from "./cli-prompts.mjs";
import { AGENT_ROOT_DIR, TICKET_SUBDIR, TEMPLATE_SUBDIR, TICKET_INDEX_FILENAME, TICKET_LIST_FILENAME, discoverAllWorkspaces, isMcpActive, toRepoRelativePath, toPosixPath, resolveWorkflowMode, pruneRuleModules, loadInitConfig, writeInitConfig, isWorkflowExecute, normalizeWorkflowMode, SPOKE_REGISTRY, parseFrontMatter, stringifyFrontMatter, LEGACY_TEMPLATE_DIR, LEGACY_TICKET_DIR, LEGACY_TICKET_DIR_PLURAL, LEGACY_TICKET_DIR_ROOT, LEGACY_CONFIG_FILE, normalizeTicketGroup } from "./cli-utils.mjs";

function sortedDirEntries(dir, options = {}) {
  const entries = readdirSync(dir, options);
  return entries.sort((a, b) => {
    const aName = typeof a === "string" ? a : a.name;
    const bName = typeof b === "string" ? b : b.name;
    return String(aName).localeCompare(String(bName));
  });
}

function safeReadText(absPath, fallback = "") {
  try {
    return readFileSync(absPath, "utf8");
  } catch {
    return fallback;
  }
}

function sameFileContent(leftPath, rightPath) {
  return safeReadText(leftPath) === safeReadText(rightPath);
}

function isSelectedTool(selectedTools = [], spokeId) {
  const tools = Array.isArray(selectedTools) ? selectedTools : [];
  return tools.includes("all") || tools.includes(spokeId);
}

const MANAGED_BLOCK_BEGIN = "<!-- deuk-agent-managed:begin -->";
const MANAGED_BLOCK_END = "<!-- deuk-agent-managed:end -->";

function wrapManagedBlock(content) {
  return `${MANAGED_BLOCK_BEGIN}\n${String(content || "").trimEnd()}\n${MANAGED_BLOCK_END}`;
}

function mergeManagedBlock(existing, managedContent) {
  const current = String(existing || "");
  const nextBlock = wrapManagedBlock(managedContent);

  if (!current.trim()) return `${nextBlock}\n`;
  if (current.includes(MANAGED_BLOCK_BEGIN) && current.includes(MANAGED_BLOCK_END)) {
    const beginIdx = current.indexOf(MANAGED_BLOCK_BEGIN);
    const endIdx = current.indexOf(MANAGED_BLOCK_END, beginIdx);
    if (beginIdx !== -1 && endIdx !== -1) {
      const before = current.slice(0, beginIdx).trimEnd();
      const after = current.slice(endIdx + MANAGED_BLOCK_END.length).trimStart();
      return [before, nextBlock, after].filter(Boolean).join("\n\n").trimEnd() + "\n";
    }
  }

  const cleaned = current.trimEnd();
  const managedBody = String(managedContent || "").trim();
  if (managedBody && cleaned.includes(managedBody)) return cleaned + "\n";

  return `${cleaned}\n\n${nextBlock}\n`;
}

function ensureWritableDirectory(dirAbs, cwd, dryRun, label) {
  if (!existsSync(dirAbs)) return;

  try {
    if (statSync(dirAbs).isDirectory()) return;
  } catch (err) {
    if (process.env.DEBUG) console.warn(`[DEBUG] Failed to inspect ${dirAbs}:`, err);
    return;
  }

  const backupBase = `${dirAbs}.bak`;
  let backupAbs = backupBase;
  let index = 1;
  while (existsSync(backupAbs)) {
    backupAbs = `${backupBase}.${index}`;
    index += 1;
  }

  const relDir = toRepoRelativePath(cwd, dirAbs);
  const relBackup = toRepoRelativePath(cwd, backupAbs);
  if (!dryRun) {
    renameSync(dirAbs, backupAbs);
  }
  console.log(`[MIGRATE] ${label}: ${relDir} -> ${relBackup}`);
}

function moveOrMergeFile(srcAbs, dstAbs, cwd, dryRun, action) {
  const relSrc = toRepoRelativePath(cwd, srcAbs);
  const relDst = toRepoRelativePath(cwd, dstAbs);

  if (srcAbs === dstAbs) return false;

  if (existsSync(dstAbs)) {
    if (sameFileContent(srcAbs, dstAbs)) {
      if (!dryRun) unlinkSync(srcAbs);
      console.log(`[MIGRATE] ${action} duplicate removed: ${relSrc} -> ${relDst}`);
      return true;
    }
    console.warn(`[WARNING] ${action} conflict: destination exists with different content, skipped ${relSrc}`);
    return false;
  }

  if (!dryRun) {
    mkdirSync(dirname(dstAbs), { recursive: true });
    renameSync(srcAbs, dstAbs);
  }
  console.log(`[MIGRATE] ${dryRun ? "Would move" : "Moved"} ${action}: ${relSrc} -> ${relDst}`);
  return true;
}

function parseYearMonth(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

function parseDay(value) {
  const match = String(value || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  if (match) return match[2] || "01";

  const onlyDay = String(value || "").match(/^\d{2}$/);
  if (onlyDay) return onlyDay[0];
  return null;
}

function inferPartitionFromFile(statSource, entry, fallbackDate = new Date()) {
  const yearMonth = parseYearMonth(entry?.archiveYearMonth) || parseYearMonth(entry?.createdAt) || parseYearMonth(entry?.updatedAt);
  const day = parseDay(entry?.archiveDay) || parseDay(entry?.createdAt) || parseDay(entry?.updatedAt) || String(statSource.getDate ? statSource.getDate() : fallbackDate.getDate()).padStart(2, "0");
  const referenceDate = statSource instanceof Date ? statSource : (statSource?.mtime || fallbackDate);

  return {
    yearMonth: yearMonth || `${String(fallbackDate.getFullYear())}-${String(fallbackDate.getMonth() + 1).padStart(2, "0")}`,
    day: day || String(referenceDate.getDate()).padStart(2, "0"),
  };
}

function mapTicketIndexByFileName(cwd) {
  const indexJson = readTicketIndexJson(cwd);
  const byFileName = new Map();
  const byId = new Map();
  for (const e of indexJson.entries || []) {
    if (!e) continue;
    if (e.fileName) byFileName.set(e.fileName, e);
    if (e.id) byId.set(e.id, e);
  }
  return { indexJson, byFileName, byId };
}

function deriveDocTicketFileName(mdPath) {
  const stem = basename(mdPath, ".md")
    .replace(/-(plan|report)$/i, "");
  if (!stem) return null;
  return `${stem}.md`;
}

function isActiveTicketStatus(status) {
  return status === "open" || status === "active";
}

function inferDocsBucketFromFileName(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith("-plan.md") || lower === "plan.md") return "plan";
  if (lower.endsWith("-report.md") || lower.startsWith("report-")) return "plan";
  return "plan";
}

function resolveDocTicketEntry(fileName, sourceMeta, byFileName, byId) {
  const candidates = new Set();
  candidates.add(fileName);

  const derived = deriveDocTicketFileName(fileName);
  if (derived) candidates.add(derived);
  if (sourceMeta?.id) candidates.add(`${sourceMeta.id}.md`);

  for (const candidate of candidates) {
    const entry = byFileName.get(candidate);
    if (entry) return entry;
  }

  for (const candidate of candidates) {
    const key = candidate.replace(/\.md$/i, "");
    const entry = byId.get(key);
    if (entry) return entry;
  }

  return sourceMeta?.id ? byId.get(sourceMeta.id) || null : null;
}

function removeEmptyDirsBottomUp(dir, cwd, dryRun) {
  if (!existsSync(dir)) return;
  for (const entry of sortedDirEntries(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirsBottomUp(join(dir, entry.name), cwd, dryRun);
  }

  try {
    if (sortedDirEntries(dir).length > 0) return;
    if (!dryRun) rmSync(dir, { recursive: true, force: true });
    console.log(`[CLEANUP] removed empty directory: ${toRepoRelativePath(cwd, dir)}`);
  } catch (err) {
    if (process.env.DEBUG) console.warn(`[DEBUG] Failed to prune ${dir}:`, err);
  }
}

function collectFilesRecursively(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of sortedDirEntries(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursively(p, out);
      continue;
    }
    if (entry.isFile()) out.push(p);
  }
  return out;
}

function classifyDocTarget(cwd, sourceAbs, fallbackDir = "plan") {
  const docsRoot = join(cwd, AGENT_ROOT_DIR, "docs");
  const fileName = basename(sourceAbs);
  return join(docsRoot, fallbackDir, fileName);
}

function isDistilledKnowledgeJson(sourceAbs) {
  try {
    const data = JSON.parse(safeReadText(sourceAbs));
    const hasModernMetadata = Boolean(
      data
      && typeof data === "object"
      && typeof data.id === "string"
      && typeof data.summary === "string"
      && data.sourceKind === "ticket"
      && data.ingestionCategory === "archived_ticket"
      && data.corpus === "tickets"
      && data.originTool === "ticket-archive"
      && data.freshness === "archived"
      && data.refreshPolicy === "refresh-on-stale"
      && typeof data.sourceTicketPath === "string"
      && data.sections
      && typeof data.sections === "object"
      && data.analysis
      && typeof data.analysis === "object"
    );
    const hasLegacyKnowledgeShape = Boolean(
      data
      && typeof data === "object"
      && typeof data.id === "string"
      && typeof data.summary === "string"
      && typeof data.sourceTicketPath === "string"
      && data.sections
      && typeof data.sections === "object"
      && data.analysis
      && typeof data.analysis === "object"
    );
    return hasModernMetadata || hasLegacyKnowledgeShape;
  } catch {
    return false;
  }
}

function classifyAgentFileTarget(cwd, sourceAbs, fallbackDir = "plan") {
  const fileName = basename(sourceAbs);
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".json")) {
    if (isDistilledKnowledgeJson(sourceAbs)) {
      return join(cwd, AGENT_ROOT_DIR, "knowledge", fileName);
    }
    return join(cwd, AGENT_ROOT_DIR, "docs", fallbackDir, fileName);
  }
  if (lower.endsWith(".md") || lower.endsWith(".deuk")) {
    return classifyDocTarget(cwd, sourceAbs, fallbackDir);
  }
  return join(cwd, AGENT_ROOT_DIR, "docs", fallbackDir, fileName);
}

function recursiveMerge(src, dest, cwd, dryRun) {
  if (!existsSync(src)) return;
  if (!existsSync(dest)) {
    if (!dryRun) {
      mkdirSync(dirname(dest), { recursive: true });
      renameSync(src, dest);
    }
    return;
  }
  // Both exist, merge contents
  const entries = sortedDirEntries(src, { withFileTypes: true });
  for (const ent of entries) {
    const sPath = join(src, ent.name);
    const dPath = join(dest, ent.name);
    if (ent.isDirectory()) {
      recursiveMerge(sPath, dPath, cwd, dryRun);
    } else {
      if (!existsSync(dPath)) {
        if (!dryRun) {
          renameSync(sPath, dPath);
          console.log(`[MIGRATE] Moved: ${toRepoRelativePath(cwd, sPath)} -> ${toRepoRelativePath(cwd, dPath)}`);
        } else {
          console.log(`[DRY-RUN] Would move: ${toRepoRelativePath(cwd, sPath)} -> ${toRepoRelativePath(cwd, dPath)}`);
        }
      } else {
        // If destination exists, check if content is identical
        const sContent = readFileSync(sPath, "utf8");
        const dContent = readFileSync(dPath, "utf8");
        if (sContent === dContent) {
          if (!dryRun) {
            unlinkSync(sPath);
            console.log(`[MIGRATE] Removed identical file: ${toRepoRelativePath(cwd, sPath)}`);
          }
        } else {
          console.warn(`[WARNING] Migration conflict: ${toRepoRelativePath(cwd, dPath)} already exists with different content. Skipping.`);
        }
      }
    }
  }
  // Clean up src if empty
  try {
    if (!dryRun && sortedDirEntries(src).length === 0) {
      rmSync(src, { recursive: true });
      console.log(`[MIGRATE] Removed empty directory: ${toRepoRelativePath(cwd, src)}`);
    }
  } catch (err) {
    if (process.env.DEBUG) console.warn(`[DEBUG] Failed to clean up ${src}:`, err);
  }
}

export function migrateLegacyStructure(cwd, dryRun) {

  const legacyTemplates = join(cwd, LEGACY_TEMPLATE_DIR);
  const newTemplates = join(cwd, AGENT_ROOT_DIR, TEMPLATE_SUBDIR);
  if (existsSync(legacyTemplates)) {
    console.log(`[MIGRATE] Merging legacy templates into ${AGENT_ROOT_DIR}/${TEMPLATE_SUBDIR}`);
    recursiveMerge(legacyTemplates, newTemplates, cwd, dryRun);
    if (!dryRun && existsSync(legacyTemplates)) rmSync(legacyTemplates, { recursive: true, force: true });
  }

  const legacyTickets = join(cwd, LEGACY_TICKET_DIR);
  const legacyTicketsPlural = join(cwd, LEGACY_TICKET_DIR_PLURAL);
  const newTickets = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR);

  if (existsSync(legacyTickets)) {
    console.log(`[MIGRATE] Merging legacy singular ticket directory into ${AGENT_ROOT_DIR}/${TICKET_SUBDIR}`);
    recursiveMerge(legacyTickets, newTickets, cwd, dryRun);
    if (!dryRun && existsSync(legacyTickets)) rmSync(legacyTickets, { recursive: true, force: true });
  }
  if (existsSync(legacyTicketsPlural)) {
    console.log(`[MIGRATE] Merging legacy plural tickets directory into ${AGENT_ROOT_DIR}/${TICKET_SUBDIR}`);
    recursiveMerge(legacyTicketsPlural, newTickets, cwd, dryRun);
    if (!dryRun && existsSync(legacyTicketsPlural)) rmSync(legacyTicketsPlural, { recursive: true, force: true });
  }
  migrateLegacyAgentWorkflows(cwd, dryRun);
  migrateLegacyRootTicketDir(cwd, dryRun);
  removeLegacyContainer(cwd, dryRun);

  const legacyConfig = join(cwd, LEGACY_CONFIG_FILE);
  const newConfig = join(cwd, AGENT_ROOT_DIR, "config.json");
  if (existsSync(legacyConfig)) {
    if (!existsSync(newConfig)) {
      console.log(`[MIGRATE] Moving legacy config to ${AGENT_ROOT_DIR}/config.json`);
      if (!dryRun) {
        mkdirSync(join(cwd, AGENT_ROOT_DIR), { recursive: true });
        renameSync(legacyConfig, newConfig);
      }
    } else {
      console.log(`[MIGRATE] Removing redundant legacy config`);
      if (!dryRun) unlinkSync(legacyConfig);
    }
  }

  migrateLegacyReports(cwd, dryRun);
  migrateLegacyScratchReports(cwd, dryRun);
  migrateLegacyArchiveTickets(cwd, dryRun);
  pruneEmptyLegacyTicketDirs(cwd, dryRun);

  // 3. Clean up redundant legacy pointer files from the target directory
  if (existsSync(newTickets)) {
    for (const file of ["ACTIVE_TICKET.md", "ACTIVE_TICKET.json", "LATEST.md"]) {
      const p = join(newTickets, file);
      if (existsSync(p)) {
        console.log(`[MIGRATE] Removing redundant pointer file: ${file}`);
        if (!dryRun) unlinkSync(p);
      }
    }
  }
}

function migrateLegacyRootTicketDir(cwd, dryRun) {
  const legacyTicketDir = join(cwd, LEGACY_TICKET_DIR_ROOT);
  if (!existsSync(legacyTicketDir)) return;

  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const day = String(now.getDate()).padStart(2, "0");
  const importRoot = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR, "archive", "sub", yearMonth, day);
  let index = 0;
  let targetDir = join(importRoot, "ticket-import");
  while (existsSync(targetDir)) {
    index += 1;
    targetDir = join(importRoot, `ticket-import-${String(index).padStart(2, "0")}`);
  }

  const relSource = toRepoRelativePath(cwd, legacyTicketDir);
  const relTarget = toRepoRelativePath(cwd, targetDir);

  if (dryRun) {
    console.log(`[DRY-RUN] Would move legacy root ticket directory: ${relSource} -> ${relTarget}`);
    return;
  }

  mkdirSync(importRoot, { recursive: true });
  renameSync(legacyTicketDir, targetDir);
  console.log(`[MIGRATE] Moved legacy root ticket directory: ${relSource} -> ${relTarget}`);
}

function migrateLegacyAgentWorkflows(cwd, dryRun) {
  const workflowsDir = join(cwd, ".agent", "workflows");
  if (!existsSync(workflowsDir)) return;

  for (const sourceAbs of listFlatMarkdownFiles(workflowsDir)) {
    const partition = inferPartitionFromFile(statSync(sourceAbs));
    const targetName = `agent-workflow-${basename(sourceAbs)}`;
    const targetAbs = join(cwd, AGENT_ROOT_DIR, "docs", "archive", partition.yearMonth, targetName);
    moveOrMergeFile(sourceAbs, targetAbs, cwd, dryRun, "legacy agent workflow cleanup");
  }

  removeEmptyDirsBottomUp(join(cwd, ".agent"), cwd, dryRun);
}

function removeLegacyContainer(cwd, dryRun) {
  const legacyContainer = join(cwd, AGENT_ROOT_DIR, "legacy");
  if (!existsSync(legacyContainer)) return;

  if (!dryRun) {
    rmSync(legacyContainer, { recursive: true, force: true });
  }
  console.log(`[CLEANUP] removed legacy container: ${toRepoRelativePath(cwd, legacyContainer)}`);
}

export function migrateLegacyReports(cwd, dryRun) {
  const legacyReportsDir = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR, "reports");
  const reportTargetDir = join(cwd, AGENT_ROOT_DIR, "docs", "plan");
  if (!existsSync(legacyReportsDir)) return;

  const reportFiles = sortedDirEntries(legacyReportsDir, { withFileTypes: true })
    .filter(ent => ent.isFile() && ent.name.endsWith(".md"))
    .map(ent => join(legacyReportsDir, ent.name));

  if (reportFiles.length === 0) return;

  mkdirSync(reportTargetDir, { recursive: true });

  for (const sourceAbs of reportFiles) {
    const fileName = basename(sourceAbs);
    const targetAbs = join(reportTargetDir, fileName);
    const sourceBody = readFileSync(sourceAbs, "utf8");

    if (existsSync(targetAbs)) {
      const targetBody = readFileSync(targetAbs, "utf8");
      if (targetBody !== sourceBody) {
        console.warn(`[WARNING] Legacy report conflict: ${toRepoRelativePath(cwd, targetAbs)} already exists with different content. Skipping move.`);
        continue;
      }
      if (!dryRun) unlinkSync(sourceAbs);
      console.log(`[MIGRATE] Removed duplicate legacy report: ${toRepoRelativePath(cwd, sourceAbs)}`);
      rewriteLegacyReportLinks(cwd, targetAbs, fileName, dryRun);
      continue;
    }

    rewriteLegacyReportLinks(cwd, targetAbs, fileName, dryRun);
    if (!dryRun) {
      renameSync(sourceAbs, targetAbs);
    }
    console.log(`[MIGRATE] Moved legacy report: ${toRepoRelativePath(cwd, sourceAbs)} -> ${toRepoRelativePath(cwd, targetAbs)}`);
  }
}

export function migrateLegacyScratchReports(cwd, dryRun) {
  const scratchDir = join(cwd, AGENT_ROOT_DIR, "docs", "scratch");
  const walkthroughDir = join(cwd, AGENT_ROOT_DIR, "docs", "plan");
  if (!existsSync(scratchDir)) return;

  const reportFiles = sortedDirEntries(scratchDir, { withFileTypes: true })
    .filter(ent => ent.isFile())
    .map(ent => join(scratchDir, ent.name));

  if (reportFiles.length === 0) return;

  mkdirSync(walkthroughDir, { recursive: true });

  for (const sourceAbs of reportFiles) {
    const fileName = basename(sourceAbs);
    const targetAbs = join(walkthroughDir, fileName);
    const sourceBody = readFileSync(sourceAbs, "utf8");

    if (existsSync(targetAbs)) {
      const targetBody = readFileSync(targetAbs, "utf8");
      if (targetBody !== sourceBody) {
        console.warn(`[WARNING] Scratch report conflict: ${toRepoRelativePath(cwd, targetAbs)} already exists with different content. Skipping move.`);
        continue;
      }
      if (!dryRun) unlinkSync(sourceAbs);
      console.log(`[MIGRATE] Removed duplicate scratch report: ${toRepoRelativePath(cwd, sourceAbs)}`);
      continue;
    }

    if (!dryRun) {
      renameSync(sourceAbs, targetAbs);
    }
    console.log(`[MIGRATE] Moved scratch report: ${toRepoRelativePath(cwd, sourceAbs)} -> ${toRepoRelativePath(cwd, targetAbs)}`);
  }
}

export function migrateLegacyArchiveTickets(cwd, dryRun) {
  const legacyArchiveTicketsDir = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR, "archive", "tickets");
  const canonicalArchiveSubDir = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR, "archive", "sub");
  if (!existsSync(legacyArchiveTicketsDir)) return;

  const archiveFiles = sortedDirEntries(legacyArchiveTicketsDir, { withFileTypes: true })
    .filter(ent => ent.isFile() && ent.name.endsWith(".md"))
    .map(ent => join(legacyArchiveTicketsDir, ent.name));

  if (archiveFiles.length === 0) return;

  mkdirSync(canonicalArchiveSubDir, { recursive: true });

  for (const sourceAbs of archiveFiles) {
    const fileName = basename(sourceAbs);
    const targetAbs = join(canonicalArchiveSubDir, fileName);
    const sourceBody = readFileSync(sourceAbs, "utf8");

    if (existsSync(targetAbs)) {
      const targetBody = readFileSync(targetAbs, "utf8");
      if (targetBody !== sourceBody) {
        console.warn(`[WARNING] Legacy archive conflict: ${toRepoRelativePath(cwd, targetAbs)} already exists with different content. Skipping move.`);
        continue;
      }
      if (!dryRun) unlinkSync(sourceAbs);
      console.log(`[MIGRATE] Removed duplicate legacy archive ticket: ${toRepoRelativePath(cwd, sourceAbs)}`);
      continue;
    }

    if (!dryRun) {
      renameSync(sourceAbs, targetAbs);
    }
    console.log(`[MIGRATE] Moved legacy archive ticket: ${toRepoRelativePath(cwd, sourceAbs)} -> ${toRepoRelativePath(cwd, targetAbs)}`);
  }

  try {
    if (!dryRun && sortedDirEntries(legacyArchiveTicketsDir).length === 0) {
      rmSync(legacyArchiveTicketsDir, { recursive: true, force: true });
      console.log(`[CLEANUP] removed empty legacy archive shard: ${toRepoRelativePath(cwd, legacyArchiveTicketsDir)}`);
    }
  } catch (err) {
    if (process.env.DEBUG) console.warn(`[DEBUG] Failed to prune ${legacyArchiveTicketsDir}:`, err);
  }
}

function rewriteLegacyReportLinks(cwd, targetAbs, fileName, dryRun) {
  const archiveRoot = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR, "archive");
  if (!existsSync(archiveRoot)) return;

  walkMdFiles(archiveRoot, (absPath) => {
    const body = readFileSync(absPath, "utf8");
    if (!body.includes(`reports/${fileName}`)) return;
    const relTarget = toRepoRelativePath(cwd, targetAbs);
    const replacement = toPosixPath(relative(dirname(absPath), targetAbs));
    const reportPattern = new RegExp(`(?:\\.\\./)+reports/${escapeRegExp(fileName)}`, "g");
    const directPathPattern = new RegExp(`reports/${escapeRegExp(fileName)}`, "g");
    const nextBody = body
      .replace(reportPattern, replacement)
      .replace(directPathPattern, replacement);
    if (nextBody === body) return;
    if (!dryRun) writeFileSync(absPath, nextBody, "utf8");
    console.log(`[MIGRATE] Updated legacy report link in ${toRepoRelativePath(cwd, absPath)} -> ${relTarget}`);
  });
}

function pruneEmptyLegacyTicketDirs(cwd, dryRun) {
  const legacyDirs = [
    join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR, "core"),
    join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR, "global"),
    join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR, "main"),
    join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR, "reports"),
  ];

  for (const dir of legacyDirs) {
    if (!existsSync(dir)) continue;
    try {
      if (sortedDirEntries(dir).length > 0) continue;
      if (!dryRun) rmSync(dir, { recursive: true, force: true });
      console.log(`[CLEANUP] removed empty legacy ticket dir: ${toRepoRelativePath(cwd, dir)}`);
    } catch (err) {
      if (process.env.DEBUG) console.warn(`[DEBUG] Failed to prune ${dir}:`, err);
    }
  }
}

function routeMisplacedTicketFile(cwd, sourceAbs, dryRun) {
  const ticketDir = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR);
  const fileName = basename(sourceAbs);
  const raw = safeReadText(sourceAbs);
  const meta = parseFrontMatter(raw).meta || {};
  const status = String(meta.status || "").toLowerCase();

  if (fileName === TICKET_LIST_FILENAME) {
    if (!dryRun) unlinkSync(sourceAbs);
    return;
  }

  if (!fileName.endsWith(".md")) {
    const targetAbs = classifyAgentFileTarget(cwd, sourceAbs);
    moveOrMergeFile(sourceAbs, targetAbs, cwd, dryRun, "misplaced ticket artifact cleanup");
    return;
  }

  const partition = inferPartitionFromFile(statSync(sourceAbs), meta);
  const targetAbs = isActiveTicketStatus(status)
    ? join(ticketDir, "sub", fileName)
    : join(ticketDir, "archive", "sub", partition.yearMonth, partition.day, fileName);
  moveOrMergeFile(sourceAbs, targetAbs, cwd, dryRun, "misplaced ticket cleanup");
}

function canonicalizeAgentDocsLayout(cwd, dryRun) {
  const docsRoot = join(cwd, AGENT_ROOT_DIR, "docs");
  if (!existsSync(docsRoot)) return;
  const allowedDirs = new Set(["archive", "plan"]);

  for (const entry of sortedDirEntries(docsRoot, { withFileTypes: true })) {
    const sourceAbs = join(docsRoot, entry.name);
    if (entry.isDirectory() && allowedDirs.has(entry.name)) continue;

    if (entry.isFile()) {
      const targetAbs = classifyDocTarget(cwd, sourceAbs);
      moveOrMergeFile(sourceAbs, targetAbs, cwd, dryRun, "misplaced docs cleanup");
      continue;
    }

    if (!entry.isDirectory()) continue;
    for (const fileAbs of collectFilesRecursively(sourceAbs)) {
      const targetAbs = classifyDocTarget(cwd, fileAbs);
      moveOrMergeFile(fileAbs, targetAbs, cwd, dryRun, `misplaced docs directory cleanup: ${entry.name}`);
    }
    removeEmptyDirsBottomUp(sourceAbs, cwd, dryRun);
  }
}

function canonicalizeAgentTicketsLayout(cwd, dryRun) {
  const ticketDir = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR);
  if (!existsSync(ticketDir)) return;
  const allowedDirs = new Set(["archive", "sub"]);
  const allowedFiles = new Set([TICKET_INDEX_FILENAME]);

  for (const entry of sortedDirEntries(ticketDir, { withFileTypes: true })) {
    const sourceAbs = join(ticketDir, entry.name);
    if (entry.isDirectory() && allowedDirs.has(entry.name)) continue;
    if (entry.isFile() && (allowedFiles.has(entry.name) || /^INDEX\.archive\.\d{4}-\d{2}\.json$/.test(entry.name))) continue;

    if (entry.isFile()) {
      routeMisplacedTicketFile(cwd, sourceAbs, dryRun);
      continue;
    }

    if (!entry.isDirectory()) continue;
    for (const fileAbs of collectFilesRecursively(sourceAbs)) {
      routeMisplacedTicketFile(cwd, fileAbs, dryRun);
    }
    removeEmptyDirsBottomUp(sourceAbs, cwd, dryRun);
  }

  const archiveRoot = join(ticketDir, "archive");
  if (existsSync(archiveRoot)) {
    for (const entry of sortedDirEntries(archiveRoot, { withFileTypes: true })) {
      if (entry.name === "sub") continue;

      const sourceAbs = join(archiveRoot, entry.name);
      if (entry.isDirectory()) {
        for (const fileAbs of collectFilesRecursively(sourceAbs)) {
          routeMisplacedTicketFile(cwd, fileAbs, dryRun);
        }
        removeEmptyDirsBottomUp(sourceAbs, cwd, dryRun);
        continue;
      }

      if (entry.isFile()) {
        routeMisplacedTicketFile(cwd, sourceAbs, dryRun);
        continue;
      }
    }
  }
}

function canonicalizeAgentRootLayout(cwd, dryRun) {
  const agentRoot = join(cwd, AGENT_ROOT_DIR);
  if (!existsSync(agentRoot)) return;
  const allowedDirs = new Set(["docs", "knowledge", "tickets"]);
  const allowedFiles = new Set(["config.json", "telemetry.jsonl"]);

  for (const entry of sortedDirEntries(agentRoot, { withFileTypes: true })) {
    const sourceAbs = join(agentRoot, entry.name);
    if (entry.isDirectory() && allowedDirs.has(entry.name)) continue;
    if (entry.isFile() && allowedFiles.has(entry.name)) continue;

    if (entry.isFile()) {
      const targetAbs = classifyAgentFileTarget(cwd, sourceAbs);
      moveOrMergeFile(sourceAbs, targetAbs, cwd, dryRun, "misplaced agent root cleanup");
      continue;
    }

    if (!entry.isDirectory()) continue;
    for (const fileAbs of collectFilesRecursively(sourceAbs)) {
      const targetAbs = classifyAgentFileTarget(cwd, fileAbs);
      moveOrMergeFile(fileAbs, targetAbs, cwd, dryRun, `misplaced agent root directory cleanup: ${entry.name}`);
    }
    removeEmptyDirsBottomUp(sourceAbs, cwd, dryRun);
  }
}

export function enforceCanonicalAgentLayout(cwd, dryRun) {
  canonicalizeAgentDocsLayout(cwd, dryRun);
  canonicalizeLegacyArchiveDocsBuckets(cwd, dryRun);
  canonicalizeAgentTicketsLayout(cwd, dryRun);
  canonicalizeAgentRootLayout(cwd, dryRun);
}

function collectMarkdownFilesRecursively(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of sortedDirEntries(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFilesRecursively(p, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(p);
    }
  }
  return out;
}

function listFlatMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return sortedDirEntries(dir)
    .filter((name) => typeof name === "string" && name.endsWith(".md"))
    .map((name) => join(dir, name));
}

function canonicalizeTicketArchivePath(cwd, dryRun) {
  const ticketDir = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR);
  const archiveRoot = join(ticketDir, "archive");
  if (!existsSync(archiveRoot)) return;

  const { byFileName, byId } = mapTicketIndexByFileName(cwd);
  const archiveFiles = collectMarkdownFilesRecursively(archiveRoot);

  for (const sourceAbs of archiveFiles) {
    const relParts = toPosixPath(relative(archiveRoot, sourceAbs)).split("/");
    if (relParts.length < 2) continue;

    const fileName = basename(sourceAbs);
    const sourceBase = basename(sourceAbs, ".md");
    const sourceMeta = parseFrontMatter(safeReadText(sourceAbs)).meta || {};
    const matchedEntry = byFileName.get(fileName)
      || byId.get(sourceMeta.id)
      || byFileName.get(`${sourceBase}.md`);

    const status = String(matchedEntry?.status || sourceMeta.status || "archived").toLowerCase();
    const group = normalizeTicketGroup(matchedEntry?.group || relParts[0], "sub");
    const partition = inferPartitionFromFile(statSync(sourceAbs), matchedEntry);
    const shouldBeOpen = isActiveTicketStatus(status);
    const targetAbs = shouldBeOpen
      ? join(ticketDir, group, fileName)
      : join(archiveRoot, group, partition.yearMonth, partition.day, fileName);
    if (sourceAbs === targetAbs) continue;

    const moved = moveOrMergeFile(sourceAbs, targetAbs, cwd, dryRun, "ticket archive cleanup");
    if (moved && sourceAbs !== targetAbs && !dryRun) {
      console.log(`[CLEANUP] ticket archive normalized: ${toRepoRelativePath(cwd, sourceAbs)} -> ${toRepoRelativePath(cwd, targetAbs)}`);
    }
  }
}

function rewritePlanLinkReferences(cwd, sourceAbs, targetAbs, dryRun) {
  const sourceRel = toRepoRelativePath(cwd, sourceAbs);
  const targetRel = toRepoRelativePath(cwd, targetAbs);
  if (sourceRel === targetRel) return;

  const ticketDir = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR);
  for (const ticketAbs of collectMarkdownFilesRecursively(ticketDir)) {
    const raw = safeReadText(ticketAbs);
    if (!raw.includes(sourceRel)) continue;

    let parsed;
    try {
      parsed = parseFrontMatter(raw);
    } catch {
      continue;
    }

    const nextMeta = { ...parsed.meta };
    if (nextMeta.planLink === sourceRel) nextMeta.planLink = targetRel;
    const nextContent = String(parsed.content || "").replaceAll(sourceRel, targetRel);
    const nextRaw = stringifyFrontMatter(nextMeta, nextContent);
    if (nextRaw === raw) continue;

    if (!dryRun) writeFileSync(ticketAbs, nextRaw, "utf8");
    console.log(`[MIGRATE] Updated planLink reference: ${toRepoRelativePath(cwd, ticketAbs)} -> ${targetRel}`);
  }
}

function stripFrontMatterBlock(raw) {
  return String(raw || "").replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "").trim();
}

function docTicketIdFromFile(fileAbs) {
  const name = basename(fileAbs).replace(/\.[^.]+$/, "");
  const match = name.match(/^(?:\d+-)?(\d{3})(?:-|$)/) || name.match(/^(\d{3})-/);
  return match?.[1] || null;
}

function legacyDocSlug(fileAbs) {
  return basename(fileAbs)
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "legacy-doc";
}

function legacyDocTitle(fileAbs) {
  return basename(fileAbs)
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildLegacyDocBody(fileAbs) {
  const raw = safeReadText(fileAbs);
  if (fileAbs.endsWith(".md")) return stripFrontMatterBlock(raw);
  return ["```text", raw.trim(), "```"].join("\n");
}

function createLegacyDocTicket(ticketAbs, id, title, sourceAbs, dryRun) {
  if (existsSync(ticketAbs)) return false;
  const sourceMeta = parseFrontMatter(safeReadText(sourceAbs)).meta || {};
  const summary = String(sourceMeta.summary || title).replace(/\n/g, " ").replace(/:/g, "-");
  const createdAt = sourceMeta.createdAt || new Date().toISOString().slice(0, 19).replace("T", " ");
  const body = [
    "---",
    `summary: ${summary}`,
    "status: archived",
    "priority: P3",
    "tags: migrated",
    `id: ${id}`,
    `title: ${title}`,
    `createdAt: ${createdAt}`,
    "---",
    "",
    `# ${title}`,
    "",
    "> Legacy separated docs are merged here so this ticket is the single source of truth.",
    "",
    "## Scope & Constraints",
    "",
    "- **Target:** migrated legacy work record.",
    "- **Context Files:** merged legacy content below.",
    "- **Constraints:** preserve historical content without keeping separate docs files.",
    "- **Lifecycle Guard:** this ticket is the canonical record.",
    "",
    "## Agent Permission Contract (APC)",
    "",
    "### [BOUNDARY]",
    "- Editable modules: historical ticket record only.",
    "- Forbidden modules: product/source changes from this migration.",
    "- Rule citation: local project rules if present.",
    "",
    "### [CONTRACT]",
    "- Input: separated legacy docs files.",
    "- Output: one canonical ticket containing merged legacy content.",
    "- Side effects: legacy docs files removed after merge.",
    "",
    "### [PATCH PLAN]",
    "- Merge separated docs into this ticket.",
    "- Remove source docs after merge.",
    "",
    "## Compact Plan",
    "",
    "- **Problem:** this work item existed as separated docs outside the ticket.",
    "- **Approach:** merge the legacy content below and keep this ticket as canonical.",
    "- **Verification:** confirm the source docs files are removed and this ticket remains.",
    "- **Ticket Numbering:** infer the master/sub ticket from the numbered ticket ID; do not add inline child-ticket links.",
    "",
    "## Tasks",
    "",
    "- [x] Merge separated docs content into this ticket.",
    "- [x] Remove separated docs files.",
    "",
    "## Done When",
    "",
    "- This ticket contains the merged content.",
    "- Separate docs files are removed.",
    ""
  ].join("\n");
  if (!dryRun) {
    mkdirSync(dirname(ticketAbs), { recursive: true });
    writeFileSync(ticketAbs, body, "utf8");
  }
  return true;
}

function mergeDocIntoTicket(ticketAbs, docAbs, dryRun) {
  const body = buildLegacyDocBody(docAbs);
  if (!body) return false;

  const title = legacyDocTitle(docAbs);
  const section = [
    "",
    "## Merged Legacy Document",
    "",
    `### ${title}`,
    "",
    body,
    ""
  ].join("\n");
  const ticketRaw = safeReadText(ticketAbs).trimEnd();
  if (!dryRun) {
    writeFileSync(ticketAbs, `${ticketRaw}${section}`, "utf8");
    unlinkSync(docAbs);
  }
  return true;
}

function mergeSeparatedDocsIntoTickets(cwd, dryRun) {
  const docsRoot = join(cwd, AGENT_ROOT_DIR, "docs");
  const ticketDir = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR);
  if (!existsSync(docsRoot)) return 0;

  const ticketFiles = collectMarkdownFilesRecursively(ticketDir)
    .filter((p) => basename(p) !== TICKET_LIST_FILENAME);
  const ticketsById = new Map();
  for (const ticketAbs of ticketFiles) {
    const id = docTicketIdFromFile(ticketAbs);
    if (!id) continue;
    if (!ticketsById.has(id)) ticketsById.set(id, []);
    ticketsById.get(id).push(ticketAbs);
  }

  let merged = 0;
  let created = 0;
  for (const docAbs of collectFilesRecursively(docsRoot)) {
    const body = buildLegacyDocBody(docAbs).trim();
    if (!body) continue;

    const id = docTicketIdFromFile(docAbs);
    let ticketAbs = null;
    if (id && ticketsById.has(id)) {
      const candidates = ticketsById.get(id);
      ticketAbs = candidates.find((p) => p.includes(`${TICKET_SUBDIR}/sub/`)) || candidates[0];
    }

    if (!ticketAbs) {
      const slug = legacyDocSlug(docAbs);
      const ticketId = id || slug;
      ticketAbs = join(ticketDir, "archive", "sub", "legacy-docs", `${ticketId}.md`);
      if (createLegacyDocTicket(ticketAbs, ticketId, slug, docAbs, dryRun)) created++;
      if (id) {
        if (!ticketsById.has(id)) ticketsById.set(id, []);
        ticketsById.get(id).push(ticketAbs);
      }
    }

    if (mergeDocIntoTicket(ticketAbs, docAbs, dryRun)) merged++;
  }

  if (!dryRun) rmSync(docsRoot, { recursive: true, force: true });
  if (merged > 0 || created > 0) {
    console.log(`[MIGRATE] separated docs merged into tickets: merged=${merged}, created=${created}`);
  }
  return merged;
}

export function canonicalizeDocsArchiveBuckets(cwd, dryRun) {
  const docsRoot = join(cwd, AGENT_ROOT_DIR, "docs");
  const archiveDir = join(docsRoot, "archive");
  const buckets = [
    { name: "plan", source: join(docsRoot, "plan"), archiveBase: archiveDir },
  ];

  const { byFileName, byId } = mapTicketIndexByFileName(cwd);
  for (const bucket of buckets) {
    if (!existsSync(bucket.source)) continue;

    const docFiles = collectFilesRecursively(bucket.source).filter((p) => p.endsWith(".md"));
    for (const sourceAbs of docFiles) {
      const fileName = basename(sourceAbs);
      const sourceMeta = parseFrontMatter(safeReadText(sourceAbs)).meta || {};
      const matchedEntry = resolveDocTicketEntry(fileName, sourceMeta, byFileName, byId);
      const status = String(matchedEntry?.status || sourceMeta.status || "active").toLowerCase();
      const isActive = isActiveTicketStatus(status);
      const shouldArchive = !isActive;

      const yearMonth = parseYearMonth(matchedEntry?.archiveYearMonth)
        || parseYearMonth(matchedEntry?.createdAt)
        || parseYearMonth(matchedEntry?.updatedAt)
        || parseYearMonth(statSync(sourceAbs).mtime.toISOString())
        || parseYearMonth(new Date().toISOString());
      if (!yearMonth) continue;

      const targetAbs = isActive ? join(docsRoot, "plan", fileName) : join(bucket.archiveBase, yearMonth, fileName);

      const moved = moveOrMergeFile(sourceAbs, targetAbs, cwd, dryRun, `docs lifecycle cleanup: ${bucket.name}`);
      if (moved) {
        rewritePlanLinkReferences(cwd, sourceAbs, targetAbs, dryRun);
      }
    }
  }
}

function canonicalizeLegacyArchiveDocsBuckets(cwd, dryRun) {
  const docsRoot = join(cwd, AGENT_ROOT_DIR, "docs");
  const archiveRoot = join(docsRoot, "archive");
  if (!existsSync(archiveRoot)) return;

  const legacyBuckets = ["plans", "walkthroughs"];
  const now = new Date();
  const fallbackYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  for (const bucket of legacyBuckets) {
    const sourceRoot = join(archiveRoot, bucket);
    if (!existsSync(sourceRoot)) continue;

    for (const sourceAbs of collectFilesRecursively(sourceRoot)) {
      if (!sourceAbs.endsWith(".md")) continue;

      const relParts = toPosixPath(relative(sourceRoot, sourceAbs)).split("/");
      const yearMonth = parseYearMonth(relParts[0]) || parseYearMonth(statSync(sourceAbs).mtime.toISOString()) || fallbackYearMonth;
      const targetAbs = join(archiveRoot, yearMonth, ...relParts.slice(relParts[0] && parseYearMonth(relParts[0]) ? 1 : 0));
      if (sourceAbs === targetAbs) continue;

      const moved = moveOrMergeFile(sourceAbs, targetAbs, cwd, dryRun, `legacy archive docs cleanup: ${bucket}`);
      if (moved) {
        rewriteLegacyReportLinks(cwd, targetAbs, basename(sourceAbs), dryRun);
      }
    }

    try {
      if (!dryRun && sortedDirEntries(sourceRoot).length === 0) {
        rmSync(sourceRoot, { recursive: true, force: true });
      } else if (!dryRun) {
        removeEmptyDirsBottomUp(sourceRoot, cwd, dryRun);
      }
    } catch (err) {
      if (process.env.DEBUG) console.warn(`[DEBUG] Failed to remove legacy docs archive bucket ${sourceRoot}:`, err);
    }
  }
}

function walkMdFiles(dir, callback) {
  if (!existsSync(dir)) return;
  for (const entry of sortedDirEntries(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMdFiles(p, callback);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      callback(p);
    }
  }
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function migrateHtmlMarkersToHeadings(cwd, dryRun) {
  const agentsPath = join(cwd, "AGENTS.md");
  if (!existsSync(agentsPath)) return;
  
  const content = readFileSync(agentsPath, "utf8");
  const oldBegin = "<!-- deuk-agent-rule:begin -->";
  const oldEnd = "<!-- deuk-agent-rule:end -->";
  
  if (!content.includes(oldBegin)) return;
  
  const beginIdx = content.indexOf(oldBegin);
  const endIdx = content.lastIndexOf(oldEnd);
  if (endIdx <= beginIdx) return;
  
  const managedContent = content.slice(beginIdx + oldBegin.length, endIdx).trim();
  const userContent = content.slice(0, beginIdx).trim();
  const afterContent = content.slice(endIdx + oldEnd.length).trim();
  
  let newContent = "";
  if (userContent) newContent += userContent + "\n\n";
  if (afterContent) newContent += afterContent + "\n\n";
  newContent += "---\n\n";
  newContent += "## DeukAgentRules\n\n";
  newContent += "> Managed by DeukAgentRules. Remove this section if not installed.\n\n";
  newContent += managedContent + "\n";
  
  if (!dryRun) {
    copyFileSync(agentsPath, agentsPath + ".pre-v2.bak");
    writeFileSync(agentsPath, newContent, "utf8");
    console.log("[MIGRATE] Converted HTML markers to heading-based format in AGENTS.md");
    console.log("[MIGRATE] Backup saved as AGENTS.md.pre-v2.bak");
  } else {
    console.log("[DRY-RUN] Would convert HTML markers to heading-based format in AGENTS.md");
  }
}

function syncTemplates(cwd, bundleRoot, dryRun) {
  const tplDestDir = join(cwd, AGENT_ROOT_DIR, TEMPLATE_SUBDIR);
  const tplSourceDir = join(bundleRoot, "templates");
  if (!existsSync(tplSourceDir)) return;

  if (!existsSync(tplDestDir) && !dryRun) {
    mkdirSync(tplDestDir, { recursive: true });
  }

  if (!dryRun) {
    for (const entry of readdirSync(tplSourceDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const source = join(tplSourceDir, entry.name);
      const target = join(tplDestDir, entry.name);
      cpSync(source, target);
    }
    console.log(`[SYNC] templates synced to ${toRepoRelativePath(cwd, tplDestDir)}`);
    return;
  }
  console.log(`[SYNC] templates synced to ${toRepoRelativePath(cwd, tplDestDir)} (dry-run mode)`);
}

function syncSkillTemplates(cwd, bundleRoot, dryRun) {
  const skillDestDir = join(cwd, AGENT_ROOT_DIR, "skill-templates");
  const skillSourceDir = join(bundleRoot, "templates", "skills");
  if (!existsSync(skillSourceDir)) return;

  if (!dryRun) {
    mkdirSync(skillDestDir, { recursive: true });
    cpSync(skillSourceDir, skillDestDir, { recursive: true });
    console.log(`[SYNC] skill templates synced to ${toRepoRelativePath(cwd, skillDestDir)}`);
    return;
  }
  console.log(`[SYNC] skill templates synced to ${toRepoRelativePath(cwd, skillDestDir)} (dry-run mode)`);
}

/**
 * Scans .deuk-agent/tickets/ and .deuk-agent/docs/ for markdown files
 * missing YAML frontmatter or missing required frontmatter keys,
 * and injects/supplements them. Also strips trailing whitespace.
 * This ensures lint:md passes and RAG indexing works correctly.
 */
function migrateMissingFrontmatter(cwd, dryRun) {
  const dirs = [
    join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR),
    join(cwd, AGENT_ROOT_DIR, "docs"),
  ];
  const requiredKeys = ["summary", "status", "priority", "tags"];

  let count = 0;
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    walkMdFiles(dir, (absPath) => {
      if (absPath.includes("archive/")) return;
      const raw = readFileSync(absPath, "utf8");
      const relPath = toRepoRelativePath(cwd, absPath);
      const slug = basename(absPath, ".md");
      const isTicket = relPath.includes(`/${TICKET_SUBDIR}/`);
      const hasFrontmatter = raw.startsWith("---\n") || raw.startsWith("---\r\n");

      if (hasFrontmatter) {
        // Check if required keys are present
        const parsed = parseFrontMatter(raw);
        const missing = requiredKeys.filter(k => !parsed.meta[k]);
        if (missing.length === 0) return; // all keys present, skip

        // Supplement missing keys
        const defaults = {
          summary: parsed.meta.title || parsed.meta.id || slug,
          status: isTicket ? "open" : "active",
          priority: "P3",
          tags: isTicket ? "migrated" : "docs, migrated",
        };
        for (const key of missing) {
          parsed.meta[key] = defaults[key];
        }

        if (!dryRun) {
          const cleanedContent = parsed.content.split("\n").map(l => l.trimEnd()).join("\n");
          writeFileSync(absPath, stringifyFrontMatter(parsed.meta, cleanedContent), "utf8");
        }
        console.log(`[MIGRATE] ${dryRun ? "Would supplement" : "Supplemented"} frontmatter (${missing.join(", ")}): ${relPath}`);
      } else {
        // No frontmatter at all — inject
        const meta = {
          summary: slug,
          status: isTicket ? "open" : "active",
          priority: "P3",
          tags: isTicket ? "migrated" : "docs, migrated",
        };
        if (isTicket) {
          meta.id = slug;
          meta.title = slug;
          meta.createdAt = new Date().toISOString().replace("T", " ").split(".")[0];
        }

        if (!dryRun) {
          const cleanedRaw = raw.split("\n").map(l => l.trimEnd()).join("\n");
          const newContent = stringifyFrontMatter(meta, cleanedRaw);
          writeFileSync(absPath, newContent, "utf8");
        }
        console.log(`[MIGRATE] ${dryRun ? "Would add" : "Added"} frontmatter: ${relPath}`);
      }
      count++;
    });
  }
  if (count > 0) {
    console.log(`[MIGRATE] Frontmatter migration: ${count} file(s) ${dryRun ? "would be " : ""}updated.`);
  }
}

export function buildGlobalCodexInstructions() {
  return `---

## DeukAgentRules

> Managed by DeukAgentRules. Remove this section if not installed.

# Global DeukAgentRules Locator

This file is a locator, not a behavior contract.

- In a repository, load the local \`AGENTS.md\` or \`.deuk-agent/\` pointer first.
- After the local pointer loads \`core-rules/AGENTS.md\`, the core hub owns TDW, RAG, silence, scope, and verification policy.
- Do not summarize this locator or treat it as a second rule file.
`;
}

function syncGlobalCodexInstructions(dryRun) {
  const codexDir = join(homedir(), ".codex");
  if (!existsSync(codexDir)) return;

  const target = join(codexDir, "AGENTS.md");
  const content = buildGlobalCodexInstructions();

  if (!dryRun) {
    writeFileSync(target, content, "utf8");
    console.log(`global codex instructions synced: ${target}`);
  }
}

export function generateSpokeContent(spoke, bundleRoot) {
  const globalRulesPath = join(bundleRoot, "core-rules", "AGENTS.md");

  const content = `# Deuk Agent Rules

**[MANDATORY — TOOL CALL REQUIRED]** Core rules are at: [AGENTS.md](file://${globalRulesPath})

This pointer is a thin bootstrap, not a second workflow contract.

1. FIRST tool call: read the core rules file above and internally note its frontmatter version.
2. Then read local \`PROJECT_RULE.md\` and internally identify applicable DC-* rules.
3. After the core hub is loaded, \`core-rules/AGENTS.md\` is the DeukAgentRules SSoT for TDW, RAG, silence, scope, and verification.

Do not print pointer/core metadata, version, DC-* lists, progress commentary, or interim summaries. Only the single required ticket-start line may appear before the final answer unless the user explicitly asks for live narration or a blocker/user decision must be surfaced.
`;

  if (spoke.format === "mdc") {
    return `---
description: "Deuk Agent Rules - Project conventions and ticket workflow"
globs: ["**/*"]
alwaysApply: true
---
${content}`;
  }
  return `---\n\n## DeukAgentRules\n\n> Managed by DeukAgentRules. Remove this section if not installed.\n\n${content}\n`;
}

export function mergeManagedRuleContent(existingContent, managedContent) {
  return mergeManagedBlock(existingContent, managedContent);
}

function hasCustomUserRules(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");
    const withoutLegacyHtmlMarkers = content
      .replace(/<!-- deuk-agent-rule-cursorrules:begin -->[\s\S]*?<!-- deuk-agent-rule-cursorrules:end -->/g, "")
      .replace(/<!-- deuk-agent-rule:begin -->[\s\S]*?<!-- deuk-agent-rule:end -->/g, "");
    if (!withoutLegacyHtmlMarkers.trim()) return false;

    const idx = content.indexOf("## DeukAgentRules");
    let stripped = content;
    if (idx !== -1) {
      // Find the preceding horizontal rule
      let blockStart = idx;
      const prevText = content.slice(0, idx);
      const hrIndex = prevText.lastIndexOf("---");
      if (hrIndex !== -1 && prevText.slice(hrIndex).trim() === "") {
        blockStart = hrIndex;
      }
      stripped = content.slice(0, blockStart);
    }
    const isPointer = content.includes("This project follows the Deuk Agent Rules framework") || 
                      content.includes("centralized in:") ||
                      content.includes("[AGENTS.md]");
    if (isPointer) return false;

    return stripped.trim().length > 0;
  } catch (err) {
    if (process.env.DEBUG) console.warn(`[DEBUG] Failed to read ${filePath}:`, err);
    return false;
  }
}

function deploySpokePointers(cwd, bundleRoot, dryRun, selectedTools = []) {
  for (const spoke of SPOKE_REGISTRY) {
    // Always clean legacy files, but backup if they contain custom user rules
    if (spoke.legacy) {
      const legacyPath = join(cwd, spoke.legacy);
      if (existsSync(legacyPath)) {
        if (hasCustomUserRules(legacyPath)) {
          const bakPath = legacyPath + ".bak";
          if (!dryRun) renameSync(legacyPath, bakPath);
          console.log(`[MIGRATE] Backed up user rules to ${spoke.legacy}.bak`);
        } else {
          if (!dryRun) unlinkSync(legacyPath);
          console.log(`[CLEANUP] removed legacy: ${spoke.legacy}`);
        }
      }
    }

    if (!isSelectedTool(selectedTools, spoke.id) && !spoke.detect(cwd, selectedTools)) continue;

    const targetPath = join(cwd, spoke.target);
    const targetDir = dirname(targetPath);
    const managedContent = generateSpokeContent(spoke, bundleRoot);
    const existingContent = existsSync(targetPath) ? safeReadText(targetPath) : "";
    const nextContent = mergeManagedBlock(existingContent, managedContent);
    if (existingContent === nextContent) {
      console.log(`spoke synced: ${spoke.target} (${spoke.id})`);
      continue;
    }
    
    if (!dryRun) {
      ensureWritableDirectory(targetDir, cwd, dryRun, `spoke target conflict resolved for ${spoke.id}`);
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(targetPath, nextContent, "utf8");
    }
    console.log(`spoke synced: ${spoke.target} (${spoke.id})`);
  }
}

function removeDuplicateRuleCopies(cwd, dryRun) {
  // Note: AGENTS.md is now the Antigravity spoke target — do NOT delete it here.
  // GEMINI.md legacy cleanup is handled by deploySpokePointers (spoke.legacy field).
  // .gemini is the Antigravity platform directory — preserve it.
  const duplicatePaths = [
    join(cwd, AGENT_ROOT_DIR, "rules"),
    join(cwd, ".cursor", "rules", "deuk-agent-rule-multi-ai-workflow.mdc"),
    join(cwd, "CLAUDE.md"),
  ];

  for (const p of duplicatePaths) {
    if (!existsSync(p)) continue;
    if (!dryRun) rmSync(p, { recursive: true, force: true });
    console.log(`[CLEANUP] removed legacy/duplicate: ${toRepoRelativePath(cwd, p)}`);
  }
}

export async function runInit(opts, bundleRoot) {
  const savedConfig = loadInitConfig(opts.cwd) || {};
  const workflowMode = resolveWorkflowMode(opts, savedConfig);
  const executionEnabled = isWorkflowExecute({ ...opts, workflowMode }, savedConfig);
  const ignoreDirs = savedConfig.ignoreDirs;
  const selectedTools = opts.agentTools || savedConfig.agentTools || [];

  if (!opts.dryRun && !executionEnabled) {
    throw new Error(
      `[WORKFLOW BLOCKED] plan mode is active for ${opts.cwd}. Re-run with --workflow execute or --approval approved to apply file mutations. Use --dry-run for preparation only.`
    );
  }

  // 0. Sync Global Codex Instructions
  syncGlobalCodexInstructions(opts.dryRun);

  // 0.1 MCP / Phase 0 Status Check
  const mcpActive = await isMcpActive(opts.cwd);
  console.log(`\n[POLICY] MCP Status: ${mcpActive ? "\x1b[32mACTIVE\x1b[0m" : "\x1b[33mINACTIVE\x1b[0m"}`);
  if (mcpActive) {
    console.log(`[POLICY] Phase 0 RAG validation is \x1b[32mENFORCED\x1b[0m for ticket creation.\n`);
  } else {
    console.log(`[POLICY] Running in offline/disconnected mode.\n`);
  }

  const submodules = discoverAllWorkspaces(opts.cwd, ignoreDirs);
  if (!submodules.includes(opts.cwd)) submodules.push(opts.cwd);

  for (const subCwd of submodules) {
    try {
      await initSingleWorkspace(subCwd, opts, bundleRoot, selectedTools);
    } catch (err) {
      console.error(`[ERROR] Failed to initialize workspace ${basename(subCwd)}: ${err.message}`);
    }
  }

  if (!loadInitConfig(opts.cwd)) {
    writeInitConfig(opts.cwd, opts);
  }
}

async function initSingleWorkspace(subCwd, opts, bundleRoot, selectedTools) {
  console.log(`\nInitializing ${basename(subCwd)}...`);
  
  // 1. Migration & Directory Setup
  migrateLegacyStructure(subCwd, opts.dryRun);
  migrateHtmlMarkersToHeadings(subCwd, opts.dryRun);
  ensureTicketDirAndGitignore({ ...opts, cwd: subCwd });
  
  // 2. Normalize INDEX.json paths (fix stale paths)
  normalizeTicketPaths(subCwd, { silent: false });

  // 2.5. Frontmatter migration (add missing frontmatter to deuk-agent docs/tickets)
  migrateMissingFrontmatter(subCwd, opts.dryRun);

  // 2.6. Deterministic archive/docs normalization
  canonicalizeTicketArchivePath(subCwd, opts.dryRun);
  canonicalizeDocsArchiveBuckets(subCwd, opts.dryRun);
  enforceCanonicalAgentLayout(subCwd, opts.dryRun);
  mergeSeparatedDocsIntoTickets(subCwd, opts.dryRun);

  // 3. Spoke Pointers (e.g. .cursor/rules/deuk-agent.mdc)
  removeDuplicateRuleCopies(subCwd, opts.dryRun);
  deploySpokePointers(subCwd, bundleRoot, opts.dryRun, selectedTools);

  // 4. Project Rule Setup (PROJECT_RULE.md)
  const projectRulePath = join(subCwd, "PROJECT_RULE.md");
  if (!existsSync(projectRulePath)) {
    const templatePath = join(bundleRoot, "templates", "PROJECT_RULE.md");
    if (existsSync(templatePath)) {
      if (!opts.dryRun) copyFileSync(templatePath, projectRulePath);
      console.log(`PROJECT_RULE.md: created from template`);
    }
  }

  // 5. Templates Sync (.deuk-agent/templates/)
  syncTemplates(subCwd, bundleRoot, opts.dryRun);
  syncSkillTemplates(subCwd, bundleRoot, opts.dryRun);
}

export function runMerge(opts, bundleRoot) {
  const savedConfig = loadInitConfig(opts.cwd) || {};
  const workflowMode = resolveWorkflowMode(opts, savedConfig);
  const executionEnabled = isWorkflowExecute({ ...opts, workflowMode }, savedConfig);
  if (!opts.dryRun && !executionEnabled) {
    throw new Error(
      `[WORKFLOW BLOCKED] plan mode is active for ${opts.cwd}. Re-run with --workflow execute or --approval approved to apply file mutations. Use --dry-run for preparation only.`
    );
  }
  
  syncTemplates(opts.cwd, bundleRoot, opts.dryRun);
  syncSkillTemplates(opts.cwd, bundleRoot, opts.dryRun);
}
