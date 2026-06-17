import { join, dirname, basename, relative } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, unlinkSync, rmSync, renameSync, statSync, cpSync, symlinkSync, chmodSync } from "fs";

import { ensureTicketDirAndGitignore } from "./cli-init-logic.mjs";
import { normalizeTicketPaths } from "./cli-ticket-migration.mjs";
import { rebuildTicketIndexFromTopicFilesIfNeeded } from "./cli-ticket-parser.mjs";
import { readTicketIndexJson, writeTicketIndexJson } from "./cli-ticket-index.mjs";

import { runInteractive } from "./cli-prompts.mjs";
import { AGENT_ROOT_DIR, TICKET_SUBDIR, TICKET_INDEX_FILENAME, TICKET_LIST_FILENAME, discoverAllWorkspaces, isMcpActive, toRepoRelativePath, toPosixPath, resolveWorkflowMode, pruneRuleModules, loadInitConfig, writeInitConfig, isWorkflowExecute, normalizeWorkflowMode, SPOKE_REGISTRY, parseFrontMatter, stringifyFrontMatter, LEGACY_TEMPLATE_DIR, LEGACY_TICKET_DIR, LEGACY_TICKET_DIR_PLURAL, LEGACY_TICKET_DIR_ROOT, LEGACY_CONFIG_FILE, normalizeTicketGroup } from "./cli-utils.mjs";

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
const SOURCE_MODE_COMMANDS = [
  ["deuk-agent-flow", "deuk-agent-flow.js"],
  ["deukagentflow", "deuk-agent-flow.js"],
  ["deuk-agent-rule", "deuk-agent-rule.js"],
  ["deukagentrule", "deuk-agent-rule.js"]
];

function pathEntries(pathEnv = process.env.PATH || "", platform = process.platform) {
  return String(pathEnv || "").split(platform === "win32" ? ";" : ":").filter(Boolean);
}

function commandAlreadyOnPath(commandName, pathEnv = process.env.PATH || "", platform = process.platform) {
  const suffixes = platform === "win32" ? ["", ".cmd", ".bat", ".exe"] : [""];
  return pathEntries(pathEnv, platform).some(dir => suffixes.some(suffix => existsSync(join(dir, `${commandName}${suffix}`))));
}

function sourceModeBinDir(homeDir = homedir(), platform = process.platform) {
  return platform === "win32"
    ? join(homeDir, "AppData", "Roaming", "npm")
    : join(homeDir, ".local", "bin");
}

function writeWindowsCommandShim(shimPath, targetScript) {
  const normalizedTarget = String(targetScript).replace(/"/g, '\\"');
  writeFileSync(shimPath, `@ECHO OFF\r\nnode "${normalizedTarget}" %*\r\n`, "utf8");
}

function writePosixCommandShim(shimPath, targetScript) {
  const normalizedTarget = String(targetScript).replace(/'/g, "'\\''");
  writeFileSync(shimPath, `#!/bin/sh\nexec node '${normalizedTarget}' "$@"\n`, "utf8");
  chmodSync(shimPath, 0o755);
}

export function ensureSourceModeCommandShims(bundleRoot, opts = {}) {
  const platform = opts.platform || process.platform;
  const homeDir = opts.homeDir || homedir();
  const pathEnv = opts.pathEnv ?? process.env.PATH ?? "";
  const dryRun = Boolean(opts.dryRun);
  const binRoot = join(bundleRoot, "bin");

  if (!existsSync(join(binRoot, "deuk-agent-flow.js"))) return { created: [], skipped: [], binDir: null, onPath: false };

  const binDir = opts.binDir || sourceModeBinDir(homeDir, platform);
  const onPath = pathEntries(pathEnv, platform).some(dir => dir === binDir);
  const created = [];
  const skipped = [];

  for (const [commandName, scriptName] of SOURCE_MODE_COMMANDS) {
    if (commandAlreadyOnPath(commandName, pathEnv, platform)) {
      skipped.push(commandName);
      continue;
    }

    const targetScript = join(binRoot, scriptName);
    const shimPath = join(binDir, platform === "win32" ? `${commandName}.cmd` : commandName);
    if (!dryRun) {
      mkdirSync(binDir, { recursive: true });
      if (platform === "win32") {
        writeWindowsCommandShim(shimPath, targetScript);
      } else {
        try {
          symlinkSync(targetScript, shimPath);
        } catch (err) {
          if (err?.code !== "EEXIST") throw err;
          unlinkSync(shimPath);
          symlinkSync(targetScript, shimPath);
        }
        chmodSync(targetScript, 0o755);
      }
    }
    created.push(commandName);
  }

  return { created, skipped, binDir, onPath };
}

function isSourceKind(value) {
  return String(value || "").trim().toLowerCase() === "source";
}

export function shouldEnsureSourceModeCommandShims(opts = {}, savedConfig = {}) {
  if (opts.sourceShims === false) return false;
  return isSourceKind(opts.kind) || isSourceKind(opts.sourceKind) || isSourceKind(savedConfig.kind) || isSourceKind(savedConfig.sourceKind);
}

function wrapManagedBlock(content) {
  return `${MANAGED_BLOCK_BEGIN}\n${String(content || "").trimEnd()}\n${MANAGED_BLOCK_END}`;
}

function splitManagedBlock(content) {
  const current = String(content || "");
  if (!current.includes(MANAGED_BLOCK_BEGIN) || !current.includes(MANAGED_BLOCK_END)) return null;

  const beginIdx = current.indexOf(MANAGED_BLOCK_BEGIN);
  const endIdx = current.indexOf(MANAGED_BLOCK_END, beginIdx);
  if (beginIdx === -1 || endIdx === -1) return null;

  return {
    before: current.slice(0, beginIdx).trimEnd(),
    managed: current.slice(beginIdx + MANAGED_BLOCK_BEGIN.length, endIdx).trim(),
    after: current.slice(endIdx + MANAGED_BLOCK_END.length).trimStart(),
  };
}

function mergeManagedBlock(existing, managedContent) {
  const current = String(existing || "");
  const nextBlock = wrapManagedBlock(managedContent);

  if (!current.trim()) return `${nextBlock}\n`;
  const currentBlock = splitManagedBlock(current);
  if (currentBlock) {
    return [currentBlock.before, nextBlock, currentBlock.after].filter(Boolean).join("\n\n").trimEnd() + "\n";
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

function archiveLegacyVariantBaseName(fileName) {
  return String(fileName || "").replace(/-legacy-docs(?:-\d{2})?\.md$/i, ".md");
}

function mergeArchiveVariantIntoCanonical(sourceAbs, targetAbs, cwd, dryRun, action) {
  if (!existsSync(targetAbs)) {
    const moved = moveOrMergeFile(sourceAbs, targetAbs, cwd, dryRun, `${action} normalize legacy variant`);
    return { moved, finalTarget: targetAbs };
  }

  const sourceRaw = safeReadText(sourceAbs);
  const targetRaw = safeReadText(targetAbs);
  if (sourceRaw === targetRaw) {
    if (!dryRun) unlinkSync(sourceAbs);
    console.log(`[MIGRATE] ${action} duplicate removed: ${toRepoRelativePath(cwd, sourceAbs)} -> ${toRepoRelativePath(cwd, targetAbs)}`);
    return { moved: true, finalTarget: targetAbs };
  }

  const sourceBody = stripFrontMatterBlock(sourceRaw);
  const targetBody = stripFrontMatterBlock(targetRaw);
  if (sourceBody && targetBody.includes(sourceBody)) {
    if (!dryRun) unlinkSync(sourceAbs);
    console.log(`[MIGRATE] ${action} merged duplicate variant removed: ${toRepoRelativePath(cwd, sourceAbs)} -> ${toRepoRelativePath(cwd, targetAbs)}`);
    return { moved: true, finalTarget: targetAbs };
  }

  if (targetBody && sourceBody.includes(targetBody)) {
    if (!dryRun) {
      writeFileSync(targetAbs, sourceRaw, "utf8");
      unlinkSync(sourceAbs);
    }
    console.log(`[MIGRATE] ${action} promoted richer legacy variant: ${toRepoRelativePath(cwd, sourceAbs)} -> ${toRepoRelativePath(cwd, targetAbs)}`);
    return { moved: true, finalTarget: targetAbs };
  }

  const mergedSection = [
    "",
    "## Merged Legacy Archive Variant",
    "",
    sourceBody,
    ""
  ].join("\n");
  const nextRaw = `${targetRaw.trimEnd()}${mergedSection}`;
  if (!dryRun) {
    writeFileSync(targetAbs, nextRaw, "utf8");
    unlinkSync(sourceAbs);
  }
  console.log(`[MIGRATE] ${action} merged legacy variant content: ${toRepoRelativePath(cwd, sourceAbs)} -> ${toRepoRelativePath(cwd, targetAbs)}`);
  return { moved: true, finalTarget: targetAbs };
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

  return {
    yearMonth: yearMonth || `${String(fallbackDate.getFullYear())}-${String(fallbackDate.getMonth() + 1).padStart(2, "0")}`,
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

export function migrateLegacyStructure(cwd, dryRun) {

  const legacyTemplates = join(cwd, LEGACY_TEMPLATE_DIR);
  if (existsSync(legacyTemplates)) {
    console.log(`[CLEANUP] removing legacy runtime templates: ${LEGACY_TEMPLATE_DIR}`);
    if (!dryRun && existsSync(legacyTemplates)) rmSync(legacyTemplates, { recursive: true, force: true });
  }

  const legacyTickets = join(cwd, LEGACY_TICKET_DIR);
  const legacyTicketsPlural = join(cwd, LEGACY_TICKET_DIR_PLURAL);
  const newTickets = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR);

  if (existsSync(legacyTickets)) {
    migrateLegacyTicketDirToArchive(cwd, legacyTickets, "legacy singular ticket directory", dryRun);
  }
  if (existsSync(legacyTicketsPlural)) {
    migrateLegacyTicketDirToArchive(cwd, legacyTicketsPlural, "legacy plural ticket directory", dryRun);
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

function migrateLegacyTicketDirToArchive(cwd, legacyTicketDir, label, dryRun) {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const importRoot = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR, "archive", "sub", yearMonth);
  const baseName = basename(legacyTicketDir).replace(/^\./, "").replace(/[^a-z0-9-]+/gi, "-");
  let index = 0;
  let targetDir = join(importRoot, `${baseName}-import`);
  while (existsSync(targetDir)) {
    index += 1;
    targetDir = join(importRoot, `${baseName}-import-${String(index).padStart(2, "0")}`);
  }

  const relSource = toRepoRelativePath(cwd, legacyTicketDir);
  const relTarget = toRepoRelativePath(cwd, targetDir);
  if (dryRun) {
    console.log(`[DRY-RUN] Would move ${label}: ${relSource} -> ${relTarget}`);
    return;
  }

  mkdirSync(importRoot, { recursive: true });
  renameSync(legacyTicketDir, targetDir);
  console.log(`[MIGRATE] Moved ${label}: ${relSource} -> ${relTarget}`);
}

function migrateLegacyRootTicketDir(cwd, dryRun) {
  const legacyTicketDir = join(cwd, LEGACY_TICKET_DIR_ROOT);
  if (!existsSync(legacyTicketDir)) return;

  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const importRoot = join(cwd, AGENT_ROOT_DIR, TICKET_SUBDIR, "archive", "sub", yearMonth);
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
    : join(ticketDir, "archive", "sub", partition.yearMonth, fileName);
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
  const runtimeTemplates = join(agentRoot, "templates");
  if (existsSync(runtimeTemplates)) {
    if (!dryRun) rmSync(runtimeTemplates, { recursive: true, force: true });
    console.log(`[CLEANUP] removed runtime template copy: ${toRepoRelativePath(cwd, runtimeTemplates)}`);
  }

  const allowedDirs = new Set(["docs", "knowledge", "tickets", "skill-templates", "skills"]);
  const allowedFiles = new Set(["config.json", "telemetry.jsonl", "skills.json", "usage.json"]);

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
    if (/-legacy-docs(?:-\d{2})?\.md$/i.test(fileName)) {
      const targetAbs = join(dirname(sourceAbs), archiveLegacyVariantBaseName(fileName));
      const variantResult = mergeArchiveVariantIntoCanonical(sourceAbs, targetAbs, cwd, dryRun, "ticket archive cleanup");
      if (variantResult.moved && !dryRun) {
        console.log(`[CLEANUP] ticket archive normalized: ${toRepoRelativePath(cwd, sourceAbs)} -> ${toRepoRelativePath(cwd, variantResult.finalTarget)}`);
      }
      continue;
    }
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
      : join(archiveRoot, group, partition.yearMonth, fileName);
    if (sourceAbs === targetAbs) continue;

    let moved = moveOrMergeFile(sourceAbs, targetAbs, cwd, dryRun, "ticket archive cleanup");
    let finalTarget = targetAbs;
    if (!moved && sourceAbs.includes(`${AGENT_ROOT_DIR}/${TICKET_SUBDIR}/archive/sub/legacy-docs/`)) {
      const conflictResult = mergeArchiveVariantIntoCanonical(sourceAbs, targetAbs, cwd, dryRun, "ticket archive cleanup");
      moved = conflictResult.moved;
      finalTarget = conflictResult.finalTarget;
    }
    if (moved && sourceAbs !== targetAbs && !dryRun) {
      console.log(`[CLEANUP] ticket archive normalized: ${toRepoRelativePath(cwd, sourceAbs)} -> ${toRepoRelativePath(cwd, finalTarget)}`);
    }
  }

  removeEmptyDirsBottomUp(archiveRoot, cwd, dryRun);
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
  newContent += "## DeukAgentFlow\n\n";
  newContent += "> Managed by DeukAgentFlow. Remove this section if not installed.\n\n";
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

const INIT_SURFACE_IGNORE_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  AGENT_ROOT_DIR,
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage"
]);

function walkInitTextSurfaces(dir, callback) {
  if (!existsSync(dir)) return;
  for (const entry of sortedDirEntries(dir, { withFileTypes: true })) {
    const absPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (INIT_SURFACE_IGNORE_DIRS.has(entry.name)) continue;
      walkInitTextSurfaces(absPath, callback);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === "AGENTS.md" || entry.name === "PROJECT_RULE.md") callback(absPath);
  }
}

function removeLegacyHtmlManagedBlock(content) {
  const oldBegin = "<!-- deuk-agent-rule:begin -->";
  const oldEnd = "<!-- deuk-agent-rule:end -->";
  const src = String(content || "");
  const beginIdx = src.indexOf(oldBegin);
  const endIdx = src.lastIndexOf(oldEnd);
  if (beginIdx === -1 || endIdx <= beginIdx) return null;
  return [
    src.slice(0, beginIdx).trim(),
    src.slice(endIdx + oldEnd.length).trim()
  ].filter(Boolean).join("\n\n");
}

function canonicalizeAgentSurfaceFile(absPath, cwd, bundleRoot, dryRun) {
  if (!existsSync(absPath)) return false;
  const fileName = basename(absPath);
  const before = readFileSync(absPath, "utf8");
  const isAgents = fileName === "AGENTS.md";

  if (!/DeukAgentRules|DeukAgentFlow|deuk-agent-rule/.test(before)) return false;

  if (isAgents) {
    const unmanagedContent = removeLegacyHtmlManagedBlock(before);
    if (unmanagedContent !== null) {
      const pointer = generateSpokeContent({ format: "markdown" }, bundleRoot).trimEnd();
      const next = unmanagedContent
        ? `${unmanagedContent.trimEnd()}\n\n${pointer}\n`
        : `${pointer}\n`;
      if (next !== before) {
        if (!dryRun) writeFileSync(absPath, next, "utf8");
        console.log(`[MIGRATE] ${dryRun ? "Would replace" : "Replaced"} legacy HTML AGENTS.md block: ${toRepoRelativePath(cwd, absPath)}`);
        return true;
      }
      return false;
    }

    const { pointer, projectDoc } = splitProjectDoc(before);
    if (isGeneratedDeukPointer(pointer)) {
      const nextPointer = generateSpokeContent({ format: "markdown" }, bundleRoot).trimEnd();
      const next = projectDoc ? `${nextPointer}\n\n${projectDoc.trimEnd()}\n` : `${nextPointer}\n`;
      if (next !== before) {
        if (!dryRun) writeFileSync(absPath, next, "utf8");
        console.log(`[MIGRATE] ${dryRun ? "Would replace" : "Replaced"} legacy AGENTS.md pointer: ${toRepoRelativePath(cwd, absPath)}`);
        return true;
      }
      return false;
    }
  }

  return canonicalizeTextFile(absPath, cwd, bundleRoot, dryRun, "legacy init surface reference");
}

function canonicalizeRecursiveInitSurfaces(cwd, bundleRoot, dryRun) {
  let count = 0;
  walkInitTextSurfaces(cwd, (absPath) => {
    if (canonicalizeAgentSurfaceFile(absPath, cwd, bundleRoot, dryRun)) count += 1;
  });
  if (count > 0) {
    console.log(`[SUMMARY] ${dryRun ? "Would update" : "Updated"} ${count} legacy init surface(s) under ${basename(cwd)}.`);
  }
  return count;
}

function removeRuntimeTemplateCopies(cwd, dryRun) {
  const runtimeTemplates = join(cwd, AGENT_ROOT_DIR, "templates");
  const legacyTemplates = join(cwd, LEGACY_TEMPLATE_DIR);
  for (const target of [runtimeTemplates, legacyTemplates]) {
    if (!existsSync(target)) continue;
    if (!dryRun) rmSync(target, { recursive: true, force: true });
    console.log(`[CLEANUP] removed runtime template copy: ${toRepoRelativePath(cwd, target)}`);
  }
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

function canonicalizeLegacyDeukAgentText(content, bundleRoot) {
  const coreRulesPath = join(bundleRoot, "core-rules", "AGENTS.md");
  return String(content || "")
    .replace(/DeukAgentRules/g, "DeukAgentFlow")
    .replace(/deuk-agent-rule/g, "deuk-agent-flow")
    .replace(/Deuk Agent Rules/g, "Deuk Agent Flow")
    .replace(/file:\/\/[^)\s]+\/DeukAgentRules\/core-rules\/AGENTS\.md/g, `file://${coreRulesPath}`)
    .replace(/\/home\/joy\/workspace\/DeukAgentRules\/core-rules\/AGENTS\.md/g, coreRulesPath);
}

function normalizeExistingSpokeContent(existingContent, managedContent, bundleRoot) {
  const current = String(existingContent || "");
  if (!current.trim()) return current;
  if (isGeneratedDeukPointer(current)) return "";

  const normalizedManaged = String(managedContent || "").trim();
  const canonicalize = (value) => canonicalizeLegacyDeukAgentText(value, bundleRoot).trim();

  if (canonicalize(current) === normalizedManaged) return "";

  const currentBlock = splitManagedBlock(current);
  if (!currentBlock) return current;

  const before = canonicalize(currentBlock.before) === normalizedManaged ? "" : currentBlock.before;
  const after = canonicalize(currentBlock.after) === normalizedManaged ? "" : currentBlock.after;
  return [before, wrapManagedBlock(managedContent), after].filter(Boolean).join("\n\n").trimEnd() + "\n";
}

function canonicalizeTextFile(absPath, cwd, bundleRoot, dryRun, label) {
  if (!existsSync(absPath)) return false;
  const before = readFileSync(absPath, "utf8");
  const after = canonicalizeLegacyDeukAgentText(before, bundleRoot);
  if (before === after) return false;
  if (!dryRun) writeFileSync(absPath, after, "utf8");
  console.log(`[MIGRATE] ${dryRun ? "Would canonicalize" : "Canonicalized"} ${label}: ${toRepoRelativePath(cwd, absPath)}`);
  return true;
}

function splitProjectDoc(content) {
  const marker = "--- project-doc ---";
  const idx = String(content || "").indexOf(marker);
  if (idx === -1) return { pointer: content, projectDoc: "" };
  return {
    pointer: content.slice(0, idx),
    projectDoc: content.slice(idx).trimStart()
  };
}

function isGeneratedDeukPointer(content) {
  const src = String(content || "");
  return (/Managed by DeukAgent(?:Rules|Flow)/.test(src) || /# Deuk Agent Rules\b|# Deuk Agent Flow\b/.test(src))
    && /Core rules are at:/i.test(src)
    && /thin bootstrap, not a second workflow contract/i.test(src);
}

function canonicalizeAgentPointer(cwd, bundleRoot, dryRun) {
  const agentsPath = join(cwd, "AGENTS.md");
  if (!existsSync(agentsPath)) return;

  const current = readFileSync(agentsPath, "utf8");
  if (!/DeukAgentRules|DeukAgentFlow|deuk-agent-rule/.test(current)) return;

  const { pointer, projectDoc } = splitProjectDoc(current);
  if (!isGeneratedDeukPointer(pointer)) {
    canonicalizeTextFile(agentsPath, cwd, bundleRoot, dryRun, "AGENTS.md legacy references");
    return;
  }

  const nextPointer = generateSpokeContent({ format: "markdown" }, bundleRoot).trimEnd();
  const next = projectDoc ? `${nextPointer}\n\n${projectDoc.trimEnd()}\n` : `${nextPointer}\n`;
  if (current === next) return;
  if (!dryRun) writeFileSync(agentsPath, next, "utf8");
  console.log(`[MIGRATE] ${dryRun ? "Would replace" : "Replaced"} legacy AGENTS.md pointer with DeukAgentFlow canonical pointer`);
}

function canonicalizeGeneratedCommandReferences(cwd, bundleRoot, dryRun) {
  const targets = [
    join(cwd, "PROJECT_RULE.md"),
    join(cwd, "docs", "project", "AGENTS.md"),
    join(cwd, ".github", "copilot-instructions.md"),
    join(cwd, ".codex", "AGENTS.md"),
  ];

  for (const target of targets) {
    canonicalizeTextFile(target, cwd, bundleRoot, dryRun, "legacy command reference");
  }
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

## DeukAgentFlow

> Managed by DeukAgentFlow. Remove this section if not installed.

# Global DeukAgentFlow Locator

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

  const content = `# Deuk Agent Flow

**[MANDATORY — TOOL CALL REQUIRED]** Core rules are at: [AGENTS.md](file://${globalRulesPath})

This pointer is a thin bootstrap, not a second workflow contract.

1. FIRST tool call: read the core rules file above and internally note its frontmatter version.
2. Then read local \`PROJECT_RULE.md\` and internally identify applicable DC-* rules.
3. After the core hub is loaded, \`core-rules/AGENTS.md\` is the DeukAgentFlow SSoT for TDW, RAG, silence, scope, and verification.

Do not print pointer/core metadata, version, DC-* lists, progress commentary, or interim summaries. When approval is pending, make the first visible assistant line exactly the clickable \`Ticket start: [<id>](/absolute/path/to/ticket.md)\` line. Before the final answer, only the single required ticket-start line, blockers, explicit user-requested output, or explicit command results may appear. During approved_execution, command_running, or search_running, stay silent unless the user explicitly asks for live narration or a blocker/user decision must be surfaced.
`;

  if (spoke.format === "mdc") {
    return `---
description: "Deuk Agent Flow - Project conventions and ticket workflow"
globs: ["**/*"]
alwaysApply: true
---
${content}`;
  }
  return `---\n\n## DeukAgentFlow\n\n> Managed by DeukAgentFlow. Remove this section if not installed.\n\n${content}\n`;
}

export function mergeManagedRuleContent(existingContent, managedContent) {
  return mergeManagedBlock(existingContent, managedContent);
}

function deploySpokePointers(cwd, bundleRoot, dryRun, selectedTools = []) {
  for (const spoke of SPOKE_REGISTRY) {
    const legacyPath = spoke.legacy ? join(cwd, spoke.legacy) : null;
    const legacyExisted = Boolean(legacyPath && existsSync(legacyPath));

    // Legacy root files are replaced by canonical spoke targets.
    if (legacyPath) {
      if (legacyExisted) {
        if (!dryRun) unlinkSync(legacyPath);
        console.log(`[CLEANUP] removed legacy: ${spoke.legacy}`);
      }
    }

    const shouldInstallDefaultHub = spoke.id === "antigravity" && existsSync(join(cwd, AGENT_ROOT_DIR));
    if (!isSelectedTool(selectedTools, spoke.id) && !spoke.detect(cwd, selectedTools) && !legacyExisted && !shouldInstallDefaultHub) continue;

    const targetPath = join(cwd, spoke.target);
    const targetDir = dirname(targetPath);
    const managedContent = generateSpokeContent(spoke, bundleRoot);
    const existingContent = existsSync(targetPath) ? safeReadText(targetPath) : "";
    const normalizedContent = normalizeExistingSpokeContent(existingContent, managedContent, bundleRoot);
    const nextContent = mergeManagedBlock(normalizedContent, managedContent);
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
  // CLAUDE.md/GEMINI.md legacy cleanup is handled by deploySpokePointers (spoke.legacy field).
  // .gemini is the Antigravity platform directory — preserve it.
  const duplicatePaths = [
    join(cwd, AGENT_ROOT_DIR, "rules"),
    join(cwd, ".cursor", "rules", "deuk-agent-rule-multi-ai-workflow.mdc"),
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

  if (shouldEnsureSourceModeCommandShims(opts, savedConfig)) {
    const sourceShimResult = ensureSourceModeCommandShims(bundleRoot, { dryRun: opts.dryRun });
    if (sourceShimResult.created.length > 0) {
      console.log(`[SOURCE MODE] Installed command shims in ${sourceShimResult.binDir}: ${sourceShimResult.created.join(", ")}`);
      if (!sourceShimResult.onPath) {
        console.warn(`[SOURCE MODE] ${sourceShimResult.binDir} is not on PATH; add it before using deuk-agent-flow by name.`);
      }
    }
  }

  // 0. Sync Global Codex Instructions
  syncGlobalCodexInstructions(opts.dryRun);

  // 0.1 Deuk AgentContext MCP memory status check
  const mcpActive = await isMcpActive(opts.cwd);
  console.log(`\n[MEMORY] Deuk AgentContext MCP: ${mcpActive ? "\x1b[32mDETECTED\x1b[0m" : "\x1b[33mNOT CONFIGURED\x1b[0m"}`);
  if (mcpActive) {
    console.log(`[MEMORY] Historical ticket/rule/code recall can be used when a task needs prior context.\n`);
  } else {
    console.log(`[MEMORY] Flow will run local-first. init does not install or register Deuk AgentContext MCP.\n`);
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
  canonicalizeAgentPointer(subCwd, bundleRoot, opts.dryRun);
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
  if (!opts.dryRun) {
    const rebuiltIndex = rebuildTicketIndexFromTopicFilesIfNeeded(subCwd, { force: true });
    writeTicketIndexJson(subCwd, rebuiltIndex, { force: true });
  }

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

  // 5. Runtime template cleanup; package templates/ is the SSoT.
  removeRuntimeTemplateCopies(subCwd, opts.dryRun);
  syncSkillTemplates(subCwd, bundleRoot, opts.dryRun);
  canonicalizeGeneratedCommandReferences(subCwd, bundleRoot, opts.dryRun);
  canonicalizeRecursiveInitSurfaces(subCwd, bundleRoot, opts.dryRun);
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
  
  removeRuntimeTemplateCopies(opts.cwd, opts.dryRun);
  syncSkillTemplates(opts.cwd, bundleRoot, opts.dryRun);
}
