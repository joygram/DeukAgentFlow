import { basename } from "path";
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, rmSync, renameSync, statSync, copyFileSync, cpSync } from "fs";
import { randomUUID } from "crypto";
import { LEGACY_DEUK, DEUK_ROOT_DIR, WORKSPACE_MARKER_FILE, getWorkspaceInitConfigPath, makePath, resolveDocsLanguage, resolveUserHome, toRepoRelativePath } from "./cli-utils.js";
import { CANONICAL_INIT_CLEANUP_PATHS, safeReadText, splitManagedBlock } from "./cli-init-core.js";
import { isGeneratedDeukPointer, splitProjectDoc } from "./cli-init-instructions.js";
import { cliText, resolveCliLocale } from "./cli-locales.js";
function resolveInitLocale(docsLanguage = "auto") {
    return resolveCliLocale(resolveDocsLanguage(docsLanguage));
}
// #713: home root directory migration ~/.deuk-agent → ~/.deuk. The literal legacy name is
// fixed here (DEUK_ROOT_DIR now resolves to ".deuk", so it can't name the OLD dir). Runs on
// every init entry and is self-healing/idempotent:
//   (A) legacy exists && new absent → try rename (fast); on failure (another agent holds
//       .deuk-agent, EBUSY/EPERM) fall back to recursive copy, preserving the original so
//       the older agent keeps working.
//   (B) BOTH exist (copy left a leftover) → keep retrying rmSync(.deuk-agent) each init;
//       once the other agent releases it, it gets removed. Safety guard: never delete the
//       legacy dir while the new ~/.deuk is empty (would risk data loss).
function dirHasEntries(dirAbs) {
    try {
        return readdirSync(dirAbs).length > 0;
    }
    catch {
        return false;
    }
}
export function migrateDeukRootDir(opts = {}) {
    const home = resolveUserHome(opts);
    const dryRun = Boolean(opts.dryRun);
    const legacyAbs = makePath(home, LEGACY_DEUK.rootDir);
    const nextAbs = makePath(home, DEUK_ROOT_DIR); // ~/.deuk
    const legacyExists = existsSync(legacyAbs);
    const nextExists = existsSync(nextAbs);
    // (A) move legacy → new when only legacy is present.
    if (legacyExists && !nextExists) {
        if (dryRun) {
            console.log(`[MIGRATE] Would migrate ${legacyAbs} -> ${nextAbs} (rename, copy fallback)`);
            return { migrated: false, mode: "dry-run" };
        }
        try {
            renameSync(legacyAbs, nextAbs);
            console.log(`[MIGRATE] Moved ${LEGACY_DEUK.rootDir} -> ${DEUK_ROOT_DIR}`);
            return { migrated: true, mode: "rename" };
        }
        catch {
            // Another agent likely holds the legacy dir — copy instead, keep the original intact.
            cpSync(legacyAbs, nextAbs, { recursive: true });
            console.log(`[MIGRATE] Copied ${LEGACY_DEUK.rootDir} -> ${DEUK_ROOT_DIR} (legacy kept for compatibility)`);
            return { migrated: true, mode: "copy" };
        }
    }
    // (B) both present (copy leftover) → persistently try to remove the legacy dir, but only
    // once the new dir actually holds data, so a half-finished copy never deletes the source.
    if (legacyExists && nextExists) {
        if (!dirHasEntries(nextAbs)) {
            return { migrated: false, mode: "guard-new-empty" };
        }
        if (dryRun) {
            console.log(`[MIGRATE] Would remove leftover ${legacyAbs} (new ${DEUK_ROOT_DIR} populated)`);
            return { migrated: false, mode: "dry-run" };
        }
        try {
            rmSync(legacyAbs, { recursive: true, force: true });
            console.log(`[MIGRATE] Removed leftover ${LEGACY_DEUK.rootDir} (migration complete)`);
            return { migrated: true, mode: "cleanup" };
        }
        catch {
            // Still held by another agent — leave it; the next init retries.
            return { migrated: false, mode: "cleanup-deferred" };
        }
    }
    return { migrated: false, mode: "noop" };
}
export function removeLegacyPaths(cwd, dryRun, paths, label) {
    let removed = 0;
    for (const relPath of paths) {
        const target = makePath(cwd, relPath);
        if (!existsSync(target))
            continue;
        if (!dryRun)
            rmSync(target, { recursive: true, force: true });
        console.log(`[CLEANUP] removed ${label}: ${toRepoRelativePath(cwd, target)}`);
        removed += 1;
    }
    return removed;
}
export function ensureWritableDirectory(dirAbs, cwd, dryRun, label) {
    if (!existsSync(dirAbs))
        return;
    try {
        if (statSync(dirAbs).isDirectory())
            return;
    }
    catch (err) {
        if (process.env.DEBUG)
            console.warn(`[DEBUG] Failed to inspect ${dirAbs}:`, err);
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
function removeEmptyDirsBottomUp(dir, cwd, dryRun) {
    if (!existsSync(dir))
        return;
    for (const entry of sortedDirEntries(dir, { withFileTypes: true })) {
        if (entry.isDirectory())
            removeEmptyDirsBottomUp(makePath(dir, entry.name), cwd, dryRun);
    }
    try {
        if (sortedDirEntries(dir).length > 0)
            return;
        if (!dryRun)
            rmSync(dir, { recursive: true, force: true });
        console.log(`[CLEANUP] removed empty directory: ${toRepoRelativePath(cwd, dir)}`);
    }
    catch (err) {
        if (process.env.DEBUG)
            console.warn(`[DEBUG] Failed to prune ${dir}:`, err);
    }
}
export function migrateLegacyStructure(cwd, dryRun) {
    const legacyTemplates = makePath(cwd, LEGACY_DEUK.templateDir);
    if (existsSync(legacyTemplates)) {
        console.log(`[CLEANUP] removing legacy runtime templates: ${LEGACY_DEUK.templateDir}`);
        if (!dryRun && existsSync(legacyTemplates))
            rmSync(legacyTemplates, { recursive: true, force: true });
    }
    const legacyConfig = makePath(cwd, LEGACY_DEUK.configFile);
    if (existsSync(legacyConfig)) {
        console.log(`[MIGRATE] Removing legacy config: ${LEGACY_DEUK.configFile}`);
        if (!dryRun)
            unlinkSync(legacyConfig);
    }
    removeLegacyWorkspaceConfig(cwd, dryRun);
    // Purge workspace .deuk-agent/ — only .deuk-workspace-id marker should remain.
    migrateWorkspaceMarker(cwd, dryRun);
}
// Migrates the workspace marker from the old .deuk-agent/workspace-id scheme to
// the new .deuk-workspace-id single-file scheme. 4 cases:
//   A: .deuk-workspace-id already exists → skip (already migrated)
//   B: .deuk-agent/workspace-id exists   → copy UUID, delete .deuk-agent dir
//   C: .deuk-agent/ exists but no workspace-id → mint new UUID, write file, delete .deuk-agent dir
//   D: neither exists → skip (not a workspace)
export function migrateWorkspaceMarker(cwd, dryRun) {
    const newMarker = makePath(cwd, WORKSPACE_MARKER_FILE);
    const legacyDir = makePath(cwd, LEGACY_DEUK.rootDir);
    const legacyIdFile = makePath(legacyDir, "workspace-id");
    // Case A: marker already exists — still purge any leftover .deuk-agent/ dir
    if (existsSync(newMarker)) {
        if (existsSync(legacyDir)) {
            if (!dryRun)
                rmSync(legacyDir, { recursive: true, force: true });
            console.log(`[MIGRATE] ${dryRun ? "Would remove" : "Removed"} leftover ${LEGACY_DEUK.rootDir}/ directory`);
        }
        return;
    }
    // Case D: no .deuk-agent dir at all → not a managed workspace
    if (!existsSync(legacyDir))
        return;
    let uuid;
    if (existsSync(legacyIdFile)) {
        // Case B: read existing UUID
        uuid = String(readFileSync(legacyIdFile, "utf8") || "").trim();
        if (!uuid)
            uuid = randomUUID();
    }
    else {
        // Case C: .deuk-agent exists but no workspace-id → mint new UUID
        uuid = randomUUID();
    }
    if (!dryRun) {
        writeFileSync(newMarker, uuid + "\n", "utf8");
        rmSync(legacyDir, { recursive: true, force: true });
    }
    console.log(`[MIGRATE] ${dryRun ? "Would migrate" : "Migrated"} workspace marker → ${WORKSPACE_MARKER_FILE} (uuid: ${uuid})`);
}
export function removeLegacyWorkspaceConfig(cwd, dryRun) {
    const workspaceConfig = getWorkspaceInitConfigPath(cwd);
    if (!existsSync(workspaceConfig))
        return false;
    if (!dryRun)
        unlinkSync(workspaceConfig);
    console.log(`[CLEANUP] ${dryRun ? "Would remove" : "Removed"} legacy workspace config: ${toRepoRelativePath(cwd, workspaceConfig)}`);
    return true;
}
export function removeNestedLegacyWorkspaceConfigs(cwd, dryRun, ignoreDirs = []) {
    const ignored = new Set([...(ignoreDirs || []), ".git", "node_modules", ".cache"]);
    const roots = [];
    function visit(dir) {
        let entries = [];
        try {
            entries = sortedDirEntries(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        if (existsSync(getWorkspaceInitConfigPath(dir)))
            roots.push(dir);
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            if (ignored.has(entry.name))
                continue;
            if (entry.name === DEUK_ROOT_DIR || LEGACY_DEUK.dirs.includes(entry.name))
                continue;
            visit(makePath(dir, entry.name));
        }
    }
    visit(cwd);
    let migrated = 0;
    for (const root of roots) {
        if (removeLegacyWorkspaceConfig(root, dryRun))
            migrated += 1;
    }
    return migrated;
}
function sortedDirEntries(dir, options = {}) {
    const entries = readdirSync(dir, options);
    return entries.sort((a, b) => {
        const aName = typeof a === "string" ? a : a.name;
        const bName = typeof b === "string" ? b : b.name;
        return String(aName).localeCompare(String(bName));
    });
}
export function sameFileContent(leftPath, rightPath) {
    return safeReadText(leftPath) === safeReadText(rightPath);
}
export function walkMdFiles(dir, callback) {
    if (!existsSync(dir))
        return;
    for (const entry of sortedDirEntries(dir, { withFileTypes: true })) {
        const p = makePath(dir, entry.name);
        if (entry.isDirectory()) {
            walkMdFiles(p, callback);
        }
        else if (entry.isFile() && entry.name.endsWith(".md")) {
            callback(p);
        }
    }
}
function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function migrateHtmlMarkersToHeadings(cwd, dryRun) {
    const locale = resolveInitLocale();
    const agentsPath = makePath(cwd, "AGENTS.md");
    if (!existsSync(agentsPath))
        return;
    const content = readFileSync(agentsPath, "utf8");
    const oldBegin = "<!-- deuk-agent-rule:begin -->";
    const oldEnd = "<!-- deuk-agent-rule:end -->";
    if (!content.includes(oldBegin))
        return;
    const beginIdx = content.indexOf(oldBegin);
    const endIdx = content.lastIndexOf(oldEnd);
    if (endIdx <= beginIdx)
        return;
    const managedContent = content.slice(beginIdx + oldBegin.length, endIdx).trim();
    const userContent = content.slice(0, beginIdx).trim();
    const afterContent = content.slice(endIdx + oldEnd.length).trim();
    let newContent = "";
    if (userContent)
        newContent += userContent + "\n\n";
    if (afterContent)
        newContent += afterContent + "\n\n";
    newContent += "---\n\n";
    newContent += "## DeukAgentFlow\n\n";
    newContent += "> Managed by DeukAgentFlow. Remove this section if not installed.\n\n";
    newContent += managedContent + "\n";
    if (!dryRun) {
        copyFileSync(agentsPath, agentsPath + ".pre-v2.bak");
        writeFileSync(agentsPath, newContent, "utf8");
        console.log(cliText("init.migrate.convertedMarkers", { locale }));
        console.log(cliText("init.migrate.backupSaved", { locale, vars: { path: "AGENTS.md.pre-v2.bak" } }));
    }
    else {
        console.log(cliText("init.migrate.dryRunConvertedMarkers", { locale }));
    }
}
const INIT_SURFACE_IGNORE_DIRS = new Set([
    ".git",
    ".hg",
    ".svn",
    DEUK_ROOT_DIR,
    ...LEGACY_DEUK.dirs,
    "node_modules",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "coverage"
]);
function walkInitTextSurfaces(dir, callback) {
    if (!existsSync(dir))
        return;
    for (const entry of sortedDirEntries(dir, { withFileTypes: true })) {
        const absPath = makePath(dir, entry.name);
        if (entry.isDirectory()) {
            if (INIT_SURFACE_IGNORE_DIRS.has(entry.name))
                continue;
            walkInitTextSurfaces(absPath, callback);
            continue;
        }
        if (!entry.isFile())
            continue;
        if (entry.name === "AGENTS.md" || entry.name === "PROJECT_RULE.md")
            callback(absPath);
    }
}
function removeLegacyHtmlManagedBlock(content) {
    const oldBegin = "<!-- deuk-agent-rule:begin -->";
    const oldEnd = "<!-- deuk-agent-rule:end -->";
    const src = String(content || "");
    const beginIdx = src.indexOf(oldBegin);
    const endIdx = src.lastIndexOf(oldEnd);
    if (beginIdx === -1 || endIdx <= beginIdx)
        return null;
    return [
        src.slice(0, beginIdx).trim(),
        src.slice(endIdx + oldEnd.length).trim()
    ].filter(Boolean).join("\n\n");
}
export function cleanupGeneratedAgentPointerSurface(absPath, cwd, dryRun) {
    const locale = resolveInitLocale();
    if (!existsSync(absPath))
        return false;
    if (basename(absPath) !== "AGENTS.md")
        return false;
    const before = readFileSync(absPath, "utf8");
    if (!/DeukAgentRules|DeukAgentFlow|deuk-agent-rule/.test(before))
        return false;
    const unmanagedContent = removeLegacyHtmlManagedBlock(before);
    if (unmanagedContent !== null) {
        const next = unmanagedContent.trim();
        if (!dryRun) {
            if (next)
                writeFileSync(absPath, `${next}\n`, "utf8");
            else
                unlinkSync(absPath);
        }
        const action = dryRun
            ? `would ${cliText(next ? "init.cleanup.strippedBlock" : "init.cleanup.removedPointer", { locale })}`
            : cliText(next ? "init.cleanup.strippedBlock" : "init.cleanup.removedPointer", { locale });
        console.log(cliText("init.cleanup.message", { locale, vars: { action, path: toRepoRelativePath(cwd, absPath) } }));
        return true;
    }
    const { pointer, projectDoc } = splitProjectDoc(before);
    if (!isGeneratedDeukPointer(pointer))
        return false;
    const next = projectDoc.trim();
    if (!dryRun) {
        if (next)
            writeFileSync(absPath, `${next}\n`, "utf8");
        else
            unlinkSync(absPath);
    }
    const action = dryRun
        ? `would ${cliText(next ? "init.cleanup.strippedPointer" : "init.cleanup.removedPointer", { locale })}`
        : cliText(next ? "init.cleanup.strippedPointer" : "init.cleanup.removedPointer", { locale });
    console.log(cliText("init.cleanup.message", { locale, vars: { action, path: toRepoRelativePath(cwd, absPath) } }));
    return true;
}
export function cleanupNestedGeneratedAgentPointers(cwd, dryRun) {
    const locale = resolveInitLocale();
    if (!existsSync(makePath(cwd, ".git")))
        return 0;
    let count = 0;
    walkInitTextSurfaces(cwd, (absPath) => {
        if (cleanupGeneratedAgentPointerSurface(absPath, cwd, dryRun))
            count += 1;
    });
    if (count > 0) {
        console.log(cliText("init.cleanup.summary", { locale, vars: { action: dryRun ? "would remove/strip" : "removed/stripped", count, workspace: basename(cwd) } }));
    }
    return count;
}
export function removeRuntimeTemplateCopies(cwd, dryRun) {
    removeLegacyPaths(cwd, dryRun, CANONICAL_INIT_CLEANUP_PATHS.runtimeTemplateCopies, "runtime template copy");
}
export function removeLocalSkillCopies(cwd, dryRun) {
    removeLegacyPaths(cwd, dryRun, CANONICAL_INIT_CLEANUP_PATHS.localSkillCopies, "local skill copy");
}
// Surgically remove the deuk-managed block from a shared-name surface (CLAUDE.md,
// AGENTS.md, copilot-instructions.md, …), preserving any user content. Deletes the
// file only when nothing of the user's remains. Never blunt-deletes a file that may
// hold the user's own Claude/agent settings.
function stripDeukManagedSurface(absPath, cwd, dryRun) {
    if (!existsSync(absPath))
        return;
    const before = readFileSync(absPath, "utf8");
    if (!/deuk-agent-managed|DeukAgentFlow|deuk-agent-rule/.test(before))
        return; // not ours — leave untouched
    let rest = null;
    const block = splitManagedBlock(before); // current HTML-marked form
    if (block) {
        rest = [block.before, block.after].map(s => String(s || "").trim()).filter(Boolean).join("\n\n");
    }
    else {
        const legacy = removeLegacyHtmlManagedBlock(before); // older deuk-agent-rule markers
        if (legacy !== null) {
            rest = legacy.trim();
        }
        else {
            const { pointer, projectDoc } = splitProjectDoc(before); // bare "## DeukAgentFlow" section form
            if (!isGeneratedDeukPointer(pointer))
                return; // can't isolate deuk content safely — leave
            rest = String(projectDoc || "").trim();
        }
    }
    if (dryRun) {
        console.log(`[CLEANUP] would ${rest ? "strip deuk block from" : "remove deuk surface"}: ${toRepoRelativePath(cwd, absPath)}`);
        return;
    }
    if (rest) {
        writeFileSync(absPath, `${rest}\n`, "utf8");
        console.log(`[CLEANUP] stripped deuk block, kept user content: ${toRepoRelativePath(cwd, absPath)}`);
    }
    else {
        rmSync(absPath, { force: true });
        console.log(`[CLEANUP] removed deuk-managed surface: ${toRepoRelativePath(cwd, absPath)}`);
    }
}
export function removeLocalAgentSurfaces(cwd, dryRun) {
    removeLegacyPaths(cwd, dryRun, CANONICAL_INIT_CLEANUP_PATHS.localAgentSurfaces, "local agent surface");
    for (const rel of CANONICAL_INIT_CLEANUP_PATHS.sharedAgentSurfaces) {
        stripDeukManagedSurface(makePath(cwd, rel), cwd, dryRun);
    }
    for (const relDir of [".cursor", ".claude", ".codex", ".windsurf", ".aiassistant"]) {
        removeEmptyDirsBottomUp(makePath(cwd, relDir), cwd, dryRun);
    }
}
const AUTO_MIGRATION_SKIP_DIRS = new Set([
    ".git",
    ".hg",
    ".svn",
    DEUK_ROOT_DIR,
    ...LEGACY_DEUK.dirs,
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    ".turbo",
    ".venv",
    "__pycache__"
]);
export function removeFragmentedLocalAgentSurfaces(cwd, dryRun) {
    let removed = removeLegacyPaths(cwd, dryRun, CANONICAL_INIT_CLEANUP_PATHS.localAgentSurfaces, "local agent surface");
    const stack = [cwd];
    const visited = new Set();
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || visited.has(current) || !existsSync(current))
            continue;
        visited.add(current);
        let entries = [];
        try {
            entries = sortedDirEntries(current, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const relPath of CANONICAL_INIT_CLEANUP_PATHS.localAgentSurfaces) {
            const target = makePath(current, relPath);
            if (!existsSync(target))
                continue;
            if (!dryRun)
                rmSync(target, { recursive: true, force: true });
            console.log(`[CLEANUP] removed fragmented local agent surface: ${toRepoRelativePath(cwd, target)}`);
            removed += 1;
        }
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            if (AUTO_MIGRATION_SKIP_DIRS.has(entry.name))
                continue;
            stack.push(makePath(current, entry.name));
        }
        for (const relDir of [".cursor", ".claude", ".codex", ".windsurf", ".aiassistant"]) {
            removeEmptyDirsBottomUp(makePath(current, relDir), cwd, dryRun);
        }
    }
    return removed;
}
//# sourceMappingURL=cli-init-migrate.js.map