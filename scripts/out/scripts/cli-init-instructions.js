import { dirname, basename } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, unlinkSync, renameSync } from "fs";
import { DEUK_ROOT_DIR, SPOKE_REGISTRY, makePath, resolvePackageRoot, resolveUserHome, toFileUri, toRepoRelativePath } from "./cli-utils.js";
import { CANONICAL_INIT_CLEANUP_PATHS, GLOBAL_POINTER_BEGIN_PREFIX, GLOBAL_POINTER_END, hashManagedContent, mergeManagedBlock, safeReadText, splitManagedBlock, wrapManagedBlock } from "./cli-init-core.js";
import { upsertClaudeUserPromptSubmitHook } from "./cli-init-claude.js";
import { ensureTicketDirAndGitignore } from "./cli-init-logic.js";
import { resolveHomeTicketDirForWorkspace } from "./cli-ticket-home.js";
import { normalizeTicketPaths } from "./cli-ticket-migration.js";
import { rebuildTicketIndexFromTopicFilesIfNeeded } from "./cli-ticket-parser.js";
import { syncActiveTicketId, writeTicketIndexJson } from "./cli-ticket-index.js";
import { cleanupGeneratedAgentPointerSurface, cleanupNestedGeneratedAgentPointers, ensureWritableDirectory, migrateDeukRootDir, migrateHtmlMarkersToHeadings, migrateLegacyStructure, removeLegacyPaths, removeLocalAgentSurfaces, removeLocalSkillCopies, removeRuntimeTemplateCopies, sameFileContent } from "./cli-init-migrate.js";
import { ensureSystemSkills } from "./cli-skill-commands.js";
function readWorkspaceDeukContextMcpUrl(cwd) {
    const mcpPath = makePath(cwd, ".mcp.json");
    if (!existsSync(mcpPath))
        return "";
    try {
        const config = JSON.parse(readFileSync(mcpPath, "utf8"));
        const servers = config.mcpServers || config.servers || {};
        const deukContextServer = servers["deuk-agent-context"] || servers["deuk_agent_context"];
        return String(deukContextServer?.url || "").trim();
    }
    catch (err) {
        if (process.env.DEBUG)
            console.warn(`[DEBUG] Failed to parse ${mcpPath}: ${err.message}`);
        return "";
    }
}
function upsertCodexMcpTomlUrl(existingContent, nextUrl) {
    const sectionHeader = "[mcp_servers.deuk_agent_context]";
    const normalizedUrlLine = `url = ${JSON.stringify(nextUrl)}`;
    const content = String(existingContent || "").trimEnd();
    const sectionPattern = /(^|\n)\[mcp_servers\.deuk_agent_context\]\n([\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/;
    const sectionMatch = content.match(sectionPattern);
    if (!sectionMatch) {
        const prefix = content ? `${content}\n\n` : "";
        return `${prefix}${sectionHeader}\n${normalizedUrlLine}\n`;
    }
    const sectionBody = sectionMatch[2];
    const nextSectionBody = /^url\s*=.*$/m.test(sectionBody)
        ? sectionBody.replace(/^url\s*=.*$/m, normalizedUrlLine)
        : `${sectionBody.trimEnd()}${sectionBody.trimEnd() ? "\n" : ""}${normalizedUrlLine}`;
    return `${content.slice(0, sectionMatch.index)}${sectionMatch[1]}${sectionHeader}\n${nextSectionBody}${content.slice(sectionMatch.index + sectionMatch[0].length)}\n`;
}
export function syncCodexMcpEndpointFromWorkspace(cwd, opts = {}) {
    const url = readWorkspaceDeukContextMcpUrl(cwd);
    if (!url)
        return { changed: false, url: "" };
    const homeDir = resolveUserHome(opts);
    const dryRun = Boolean(opts.dryRun);
    const codexConfigPath = makePath(homeDir, ".codex", "config.toml");
    const existingContent = existsSync(codexConfigPath) ? readFileSync(codexConfigPath, "utf8") : "";
    const nextContent = upsertCodexMcpTomlUrl(existingContent, url);
    const changed = existingContent !== nextContent;
    if (!changed)
        return { changed: false, url, path: codexConfigPath };
    if (!dryRun) {
        mkdirSync(dirname(codexConfigPath), { recursive: true });
        writeFileSync(codexConfigPath, nextContent, "utf8");
    }
    console.log(`[MIGRATE] ${dryRun ? "Would sync" : "Synced"} Codex MCP endpoint: deuk_agent_context -> ${url}`);
    return { changed: true, url, path: codexConfigPath };
}
function canonicalizeLegacyDeukAgentText(content, bundleRoot) {
    const coreRulesPath = makePath(bundleRoot, "core-rules", "AGENTS.md");
    const coreRulesUri = toFileUri(coreRulesPath);
    return String(content || "")
        .replace(/DeukAgentRules/g, "DeukAgentFlow")
        .replace(/deuk-agent-rule/g, "deuk-agent-flow")
        .replace(/Deuk Agent Rules/g, "Deuk Agent Flow")
        .replace(/\bdeuk-agent-flow rules path --path-only\b/g, "deuk-agent-flow rules")
        .replace(/file:\/\/[^)\s>\]"'`]+\/DeukAgentRules\/core-rules\/AGENTS\.md/g, coreRulesUri)
        .replace(/\/home\/joy\/workspace\/DeukAgentRules\/core-rules\/AGENTS\.md/g, coreRulesPath)
        .replace(/file:\/\/[^)\s>\]"'`]+\/deuk-agent-flow\/core-rules\/AGENTS\.md/g, coreRulesUri)
        .replace(/(?:[a-zA-Z]:[\\/]|(?:\/|\\\\)[^\n\\/]+)[^\n)\s>\]"'`]+\/deuk-agent-flow\/core-rules\/AGENTS\.md/g, coreRulesPath);
}
function normalizeExistingSpokeContent(existingContent, managedContent, bundleRoot) {
    const current = String(existingContent || "");
    if (!current.trim())
        return current;
    if (isGeneratedDeukPointer(current))
        return "";
    const normalizedManaged = String(managedContent || "").trim();
    const canonicalize = (value) => canonicalizeLegacyDeukAgentText(value, bundleRoot).trim();
    if (canonicalize(current) === normalizedManaged)
        return "";
    const currentBlock = splitManagedBlock(current);
    if (!currentBlock)
        return current;
    const before = canonicalize(currentBlock.before) === normalizedManaged ? "" : currentBlock.before;
    const after = canonicalize(currentBlock.after) === normalizedManaged ? "" : currentBlock.after;
    return [before, wrapManagedBlock(managedContent), after].filter(Boolean).join("\n\n").trimEnd() + "\n";
}
export function canonicalizeTextFile(absPath, cwd, bundleRoot, dryRun, label) {
    if (!existsSync(absPath))
        return false;
    const before = readFileSync(absPath, "utf8");
    const after = canonicalizeLegacyDeukAgentText(before, bundleRoot);
    if (before === after)
        return false;
    if (!dryRun)
        writeFileSync(absPath, after, "utf8");
    console.log(`[MIGRATE] ${dryRun ? "Would canonicalize" : "Canonicalized"} ${label}: ${toRepoRelativePath(cwd, absPath)}`);
    return true;
}
export function splitProjectDoc(content) {
    const marker = "--- project-doc ---";
    const idx = String(content || "").indexOf(marker);
    if (idx === -1)
        return { pointer: content, projectDoc: "" };
    return {
        pointer: content.slice(0, idx),
        projectDoc: content.slice(idx).trimStart()
    };
}
export function isGeneratedDeukPointer(content) {
    const src = String(content || "");
    const hasHeader = /Managed by DeukAgent(?:Rules|Flow)/.test(src) || /# Deuk Agent Rules\b|# Deuk Agent Flow\b|# DeukAgentFlow\b/.test(src);
    const hasCoreRulesRef = /Core rules (?:are at|path is resolved by|are printed by):/i.test(src) || /deuk-agent-flow rules/i.test(src);
    if (!hasHeader || !hasCoreRulesRef)
        return false;
    // Old format required "thin bootstrap" line; new format omits it — both are valid generated pointers
    return true;
}
export function canonicalizeGeneratedCommandReferences(cwd, bundleRoot, dryRun) {
    const targets = [
        makePath(cwd, "AGENTS.md"),
        makePath(cwd, "PROJECT_RULE.md"),
        makePath(cwd, DEUK_ROOT_DIR, "PROJECT_RULE.md"),
        makePath(cwd, "docs", "project", "AGENTS.md"),
        makePath(cwd, ".github", "copilot-instructions.md"),
        makePath(cwd, ".codex", "AGENTS.md"),
    ];
    for (const target of targets) {
        canonicalizeTextFile(target, cwd, bundleRoot, dryRun, "legacy command reference");
    }
}
export function buildGlobalCodexInstructions() {
    return buildGlobalAgentPointer();
}
export function buildGlobalClaudeInstructions() {
    return buildGlobalAgentPointer();
}
function extractMarkdownHeadingSection(content = "", heading = "") {
    const normalizeHeading = value => String(value || "")
        .trim()
        .replace(/^#+\s*/, "")
        .replace(/^\d+[\).\s-]+/, "")
        .toLowerCase();
    const target = normalizeHeading(heading);
    if (!target)
        return "";
    const lines = String(content || "").split(/\r?\n/);
    let start = -1;
    let level = 0;
    for (const [index, line] of lines.entries()) {
        const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
        if (!match)
            continue;
        if (start === -1) {
            if (normalizeHeading(match[2]) === target) {
                start = index;
                level = match[1].length;
            }
            continue;
        }
        if (match[1].length <= level) {
            return lines.slice(start, index).join("\n").trim();
        }
    }
    return start === -1 ? "" : lines.slice(start).join("\n").trim();
}
function readCoreRulesSection(bundleRoot, heading) {
    const rulesPath = makePath([bundleRoot, "core-rules", "AGENTS.md"]);
    if (!existsSync(rulesPath))
        return "";
    return extractMarkdownHeadingSection(readFileSync(rulesPath, "utf8"), heading);
}
function readCliSurfaceDocument(bundleRoot, name) {
    const surfacePath = makePath(bundleRoot, "docs", "cli-surfaces", `${name}.md`);
    if (!existsSync(surfacePath)) {
        throw new Error(`CLI surface document not found: ${surfacePath}`);
    }
    return readFileSync(surfacePath, "utf8");
}
function renderCliSurfaceDocument(bundleRoot, name, replacements = {}) {
    let content = readCliSurfaceDocument(bundleRoot, name);
    content = content.replace(/\{\{CORE:([^}]+)\}\}/g, (_match, heading) => readCoreRulesSection(bundleRoot, String(heading || "").trim()).trimEnd());
    for (const [key, value] of Object.entries(replacements)) {
        content = content.replaceAll(`{{${key}}}`, String(value ?? ""));
    }
    return content.trimEnd();
}
function buildGlobalAgentPointer(bundleRoot = resolvePackageRoot({ fromUrl: import.meta.url }), format = "markdown", agentId = "default") {
    let body = "";
    try {
        body = renderCliSurfaceDocument(bundleRoot, `global-pointer-${agentId}`);
    }
    catch (e) {
        body = renderCliSurfaceDocument(bundleRoot, "global-pointer");
    }
    if (format === "mdc") {
        return `---
description: "DeukAgentFlow global pointer"
globs: ["**/*"]
alwaysApply: true
---
${body}`;
    }
    return body;
}
function splitMdcFrontMatter(content) {
    const text = String(content || "");
    if (!text.startsWith("---\n"))
        return { frontMatter: "", body: text };
    const endIdx = text.indexOf("\n---\n", 4);
    if (endIdx === -1)
        return { frontMatter: "", body: text };
    return {
        frontMatter: stripPathKeysFromFrontMatter(text.slice(0, endIdx + 5)).trimEnd(),
        body: text.slice(endIdx + 5).trimStart()
    };
}
function stripPathKeysFromFrontMatter(frontMatter) {
    return String(frontMatter || "")
        .split(/\r?\n/)
        .filter(line => !/^\s*(path|absPath|absolutePath|relativePath|sourcePath|targetPath|workspacePath|rulesPath|ticketPath)\s*:/i.test(line))
        .join("\n");
}
function wrapGlobalPointerBlock(content) {
    const normalizedContent = String(content || "").trimEnd();
    const { frontMatter, body } = splitMdcFrontMatter(normalizedContent);
    const pointerBlock = [
        `${GLOBAL_POINTER_BEGIN_PREFIX} ${hashManagedContent(normalizedContent)}`,
        body.trimEnd(),
        GLOBAL_POINTER_END
    ].join("\n");
    return frontMatter ? `${frontMatter}\n${pointerBlock}` : pointerBlock;
}
function stripGlobalPointerBlocks(content) {
    let text = String(content || "");
    // Strip <!-- deuk-agent-managed --> wrapped blocks (legacy)
    let currentBlock = splitManagedBlock(text);
    while (currentBlock) {
        text = [currentBlock.before, currentBlock.after].filter(Boolean).join("\n\n").trim();
        currentBlock = splitManagedBlock(text);
    }
    // Strip --- DEUK_AGENT_FLOW_BEGIN/END blocks
    text = text.replace(/--- DEUK_AGENT_FLOW_BEGIN :[^\n]*\n[\s\S]*?--- DEUK_AGENT_FLOW_END\n?/g, "");
    text = text.replace(/DEUK_AGENT_GLOBAL_POINTER_BEGIN[\s\S]*?DEUK_AGENT_GLOBAL_POINTER_END\n?/g, "");
    text = text.replace(/^---\ndescription: "DeukAgentFlow global pointer"\nglobs: \["\*\*\/\*"\]\nalwaysApply: true\n---\n# DeukAgentFlow Global Pointer\n\nManaged by DeukAgentFlow\.\n\nRead this file first:\n[^\n]+\n\nKeep personal notes in the sibling `\.user` file, not in this managed pointer\.\n?/gm, "");
    text = text.replace(/^# DeukAgentFlow Global Pointer\n\nManaged by DeukAgentFlow\.\n\nRead this file first:\n[^\n]+\n\nKeep personal notes in the sibling `\.user` file, not in this managed pointer\.\n?/gm, "");
    text = text.replace(/^---\ndescription: "DeukAgentFlow global pointer"\nglobs: \["\*\*\/\*"\]\nalwaysApply: true\n---\n?/gm, "");
    // Strip plain (tag-free) pointer blocks left by previous init versions
    text = text.replace(/^# DeukAgentFlow Global Pointer\n[\s\S]*$/m, "");
    return text.trim();
}
function mergeGlobalAgentPointer(existingContent, managedContent) {
    const nextBlock = wrapGlobalPointerBlock(managedContent);
    const current = String(existingContent || "");
    const remainder = stripGlobalPointerBlocks(current);
    return remainder ? `${nextBlock}\n\n${remainder}\n` : `${nextBlock}\n`;
}
function getGlobalAgentInstructionTargets(homeDir = resolveUserHome(), bundleRoot = resolvePackageRoot({ fromUrl: import.meta.url })) {
    return [
        {
            id: "codex",
            target: makePath(homeDir, ".codex", "AGENTS.md"),
            content: buildGlobalAgentPointer(bundleRoot, "markdown", "codex")
        },
        {
            id: "claude",
            target: makePath(homeDir, ".claude", "CLAUDE.md"),
            content: buildGlobalAgentPointer(bundleRoot, "markdown", "claude")
        },
        {
            id: "gemini",
            target: makePath(homeDir, ".gemini", "GEMINI.md"),
            content: buildGlobalAgentPointer(bundleRoot, "markdown", "gemini")
        },
        {
            id: "cursor",
            target: makePath(homeDir, ".cursor", "rules", "deuk-agent.mdc"),
            content: buildGlobalAgentPointer(bundleRoot, "mdc", "cursor")
        },
        {
            id: "copilot",
            target: makePath(homeDir, ".config", "Code", "User", "copilot-instructions.md"),
            content: buildGlobalAgentPointer(bundleRoot, "markdown", "copilot")
        },
        {
            id: "antigravity",
            target: makePath(homeDir, ".config", "Antigravity", "User", "AGENTS.md"),
            content: buildGlobalAgentPointer(bundleRoot, "markdown", "antigravity")
        },
    ];
}
function syncGlobalAgentInstructions(dryRun, bundleRoot = resolvePackageRoot({ fromUrl: import.meta.url }), homeDir = resolveUserHome()) {
    for (const entry of getGlobalAgentInstructionTargets(homeDir, bundleRoot)) {
        if (dryRun)
            continue;
        const nextContent = entry.content;
        const existingContent = existsSync(entry.target) ? safeReadText(entry.target) : "";
        const mergedContent = mergeGlobalAgentPointer(existingContent, nextContent);
        if (existingContent === mergedContent)
            continue;
        mkdirSync(dirname(entry.target), { recursive: true });
        writeFileSync(entry.target, mergedContent, "utf8");
    }
    // Claude settings.json 훅도 rules 실행 시마다 최신 커맨드로 자동 동기화.
    upsertClaudeUserPromptSubmitHook({ dryRun, homeDir });
}
export function runGlobalAgentInstructionSync(dryRun = false, bundleRoot = resolvePackageRoot({ fromUrl: import.meta.url }), homeDir = resolveUserHome()) {
    syncGlobalAgentInstructions(dryRun, bundleRoot, homeDir);
}
export function generateSpokeContent(spoke, bundleRoot) {
    let content = "";
    try {
        content = renderCliSurfaceDocument(bundleRoot, `spoke-pointer-${spoke.id}`);
    }
    catch (err) {
        content = renderCliSurfaceDocument(bundleRoot, "spoke-pointer");
    }
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
function deploySpokePointers(cwd, bundleRoot, dryRun) {
    for (const spoke of SPOKE_REGISTRY) {
        const legacyPath = spoke.legacy ? makePath(cwd, spoke.legacy) : null;
        const legacyExisted = Boolean(legacyPath && existsSync(legacyPath));
        // Legacy root files are replaced by canonical spoke targets.
        if (legacyPath) {
            if (legacyExisted) {
                if (!dryRun)
                    unlinkSync(legacyPath);
                console.log(`[CLEANUP] removed legacy: ${spoke.legacy}`);
            }
        }
        const shouldInstallDefaultHub = spoke.id === "antigravity" && existsSync(makePath(cwd, DEUK_ROOT_DIR));
        if (!spoke.detect(cwd) && !legacyExisted && !shouldInstallDefaultHub)
            continue;
        const targetPath = makePath(cwd, spoke.target);
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
export function removeDuplicateRuleCopies(cwd, dryRun) {
    // Note: AGENTS.md is now the Antigravity spoke target — do NOT delete it here.
    // CLAUDE.md/GEMINI.md legacy cleanup is handled by deploySpokePointers (spoke.legacy field).
    // .gemini is the Antigravity platform directory — preserve it.
    removeLegacyPaths(cwd, dryRun, CANONICAL_INIT_CLEANUP_PATHS.duplicateRuleCopies, "legacy/duplicate");
}
function migrateProjectRuleToAgentRoot(cwd, dryRun, opts = {}) {
    const sourcePath = makePath(cwd, "PROJECT_RULE.md");
    if (!existsSync(sourcePath))
        return false;
    // Workspace-level PROJECT_RULE.md is legacy — remove it (content lives in home ticket store).
    const homeDir = resolveHomeTicketDirForWorkspace(cwd, opts);
    const targetPath = makePath(homeDir, "PROJECT_RULE.md");
    if (existsSync(targetPath)) {
        if (sameFileContent(sourcePath, targetPath)) {
            if (!dryRun)
                unlinkSync(sourcePath);
            console.log(`[MIGRATE] removed duplicate root PROJECT_RULE.md: ${toRepoRelativePath(cwd, sourcePath)}`);
            return true;
        }
        console.warn(`[WARNING] PROJECT_RULE.md conflict: home store version exists with different content, kept ${toRepoRelativePath(cwd, sourcePath)}`);
        return false;
    }
    if (!dryRun) {
        mkdirSync(dirname(targetPath), { recursive: true });
        renameSync(sourcePath, targetPath);
    }
    console.log(`[MIGRATE] ${dryRun ? "Would move" : "Moved"} project rules: ${toRepoRelativePath(cwd, sourcePath)} -> home ticket store`);
    return true;
}
function ensureProjectRule(cwd, bundleRoot, dryRun, opts = {}) {
    const homeDir = resolveHomeTicketDirForWorkspace(cwd, opts);
    const projectRulePath = makePath(homeDir, "PROJECT_RULE.md");
    if (existsSync(projectRulePath))
        return false;
    const templatePath = makePath(bundleRoot, "templates", "PROJECT_RULE.md");
    if (!existsSync(templatePath))
        return false;
    if (!dryRun) {
        mkdirSync(dirname(projectRulePath), { recursive: true });
        copyFileSync(templatePath, projectRulePath);
    }
    console.log(`PROJECT_RULE.md: created from template in home ticket store`);
    return true;
}
function ensureProjectMemory(cwd, bundleRoot, dryRun, opts = {}) {
    const homeDir = resolveHomeTicketDirForWorkspace(cwd, opts);
    const memoryPath = makePath(homeDir, "project-memory.md");
    if (existsSync(memoryPath))
        return false;
    const templatePath = makePath(bundleRoot, "templates", "project-memory.md");
    if (!existsSync(templatePath))
        return false;
    if (!dryRun) {
        mkdirSync(dirname(memoryPath), { recursive: true });
        copyFileSync(templatePath, memoryPath);
    }
    console.log(`project-memory.md: created from template in home ticket store`);
    return true;
}
export function runSingleWorkspaceMaintenance(cwd, dryRun, bundleRoot, opts = {}) {
    console.log(`\nInitializing ${basename(cwd)}...`);
    // #713: self-healing home root migration (~/.deuk-agent → ~/.deuk). Idempotent, runs every init.
    migrateDeukRootDir({ ...opts, dryRun });
    migrateLegacyStructure(cwd, dryRun);
    migrateHtmlMarkersToHeadings(cwd, dryRun);
    ensureTicketDirAndGitignore({ ...opts, cwd, dryRun });
    normalizeTicketPaths(cwd, { silent: false });
    if (!dryRun) {
        const rebuiltIndex = rebuildTicketIndexFromTopicFilesIfNeeded(cwd, { force: true });
        writeTicketIndexJson(cwd, rebuiltIndex, { force: true });
        syncActiveTicketId(cwd);
    }
    removeDuplicateRuleCopies(cwd, dryRun);
    removeLocalAgentSurfaces(cwd, dryRun);
    cleanupGeneratedAgentPointerSurface(makePath(cwd, "AGENTS.md"), cwd, dryRun);
    migrateProjectRuleToAgentRoot(cwd, dryRun, opts);
    ensureProjectRule(cwd, bundleRoot, dryRun, opts);
    // #685: project-memory.md 자동 생성 제거 — 무의미한 진행-상태 레이어(언니 지시).
    removeRuntimeTemplateCopies(cwd, dryRun);
    removeLocalSkillCopies(cwd, dryRun);
    // #697: 시스템 필수 스킬(ticket-status-surface 등 system:true)을 항상 보장.
    try {
        ensureSystemSkills(cwd, { dryRun });
    }
    catch { /* best-effort */ }
    removeLocalAgentSurfaces(cwd, dryRun);
    canonicalizeGeneratedCommandReferences(cwd, bundleRoot, dryRun);
    cleanupNestedGeneratedAgentPointers(cwd, dryRun);
}
//# sourceMappingURL=cli-init-instructions.js.map