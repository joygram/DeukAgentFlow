import { parseHeading,stripLeadingHashes,stripLeadingSectionNumber } from "./markdown-headings.js";
import { copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,renameSync,unlinkSync,writeFileSync } from "fs";
import { basename,dirname } from "path";
import { CANONICAL_INIT_CLEANUP_PATHS,GLOBAL_POINTER_BEGIN_PREFIX,GLOBAL_POINTER_END,hashManagedContent,readTextIfExists,splitManagedBlock } from "./cli-init-core.js";
import { ensureTicketDirAndGitignore } from "./cli-init-logic.js";
import { cleanupGeneratedAgentPointerSurface,cleanupNestedGeneratedAgentPointers,migrateDeukRootDir,migrateHtmlMarkersToHeadings,migrateLegacyStructure,removeLegacyPaths,removeLocalAgentSurfaces,removeLocalSkillCopies,removeRuntimeTemplateCopies } from "./cli-init-migrate.js";
import { ensureSystemSkills,pruneOrphanedSystemSkills } from "./cli-skill-commands.js";
import { resolveHomeTicketDirForWorkspace } from "./cli-ticket-home.js";
import { syncActiveTicketId,writeTicketIndexJson } from "./cli-ticket-index.js";
import { normalizeTicketPaths } from "./cli-ticket-migration.js";
import { rebuildTicketIndexFromTopicFilesIfNeeded } from "./cli-ticket-parser.js";
import { CliOpts,DEFAULT_IGNORE_DIRS,DEUK_ROOT_DIR,getProjectRulePath,localized,makePath,resolvePackageRoot,resolveUserHome,toFileUri,toRepoRelativePath } from "./cli-utils.js";

const INIT_TEXT = {
  surfaceDocNotFound: { ko: "CLI 표면 문서를 찾을 수 없다: {path}", en: "CLI surface document not found: {path}" },
  pointerTargetRequired: { ko: "global pointer 는 구체적인 target id 가 필요하다", en: "global pointer requires a concrete target id" },
  pointerSyncRequired: { ko: "global pointer sync 는 감지된 target id 가 최소 하나 필요하다", en: "global pointer sync requires at least one detected target id" },
  spokeIdRequired: { ko: "spoke surface 는 구체적인 agent id 가 필요하다", en: "spoke surface requires a concrete agent id" },
} as const;

function readWorkspaceDeukContextMcpUrl(cwd) {
  const mcpPath = makePath(cwd, ".mcp.json");
  if (!existsSync(mcpPath)) return "";

  try {
    const config = JSON.parse(readFileSync(mcpPath, "utf8"));
    const servers = config.mcpServers || config.servers || {};
    const deukContextServer = servers["deuk-agent-context"] || servers["deuk_agent_context"];
    return String(deukContextServer?.url || "").trim();
  } catch (err) {
    if (process.env.DEBUG) console.warn(`[DEBUG] Failed to parse ${mcpPath}: ${err.message}`);
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

export function syncCodexMcpEndpointFromWorkspace(cwd, opts: CliOpts = {}) {
  const url = readWorkspaceDeukContextMcpUrl(cwd);
  if (!url) return { changed: false, url: "" };

  const homeDir = resolveUserHome(opts);
  const dryRun = Boolean(opts.dryRun);
  const codexConfigPath = makePath(homeDir, ".codex", "config.toml");
  const existingContent = existsSync(codexConfigPath) ? readFileSync(codexConfigPath, "utf8") : "";
  const nextContent = upsertCodexMcpTomlUrl(existingContent, url);
  const changed = existingContent !== nextContent;
  if (!changed) return { changed: false, url, path: codexConfigPath };

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

export function canonicalizeTextFile(absPath, cwd, bundleRoot, dryRun, label) {
  if (!existsSync(absPath)) return false;
  const before = readFileSync(absPath, "utf8");
  const after = canonicalizeLegacyDeukAgentText(before, bundleRoot);
  if (before === after) return false;
  if (!dryRun) writeFileSync(absPath, after, "utf8");
  console.log(`[MIGRATE] ${dryRun ? "Would canonicalize" : "Canonicalized"} ${label}: ${toRepoRelativePath(cwd, absPath)}`);
  return true;
}

export function splitProjectDoc(content) {
  const marker = "--- project-doc ---";
  const idx = String(content || "").indexOf(marker);
  if (idx === -1) return { pointer: content, projectDoc: "" };
  return {
    pointer: content.slice(0, idx),
    projectDoc: content.slice(idx).trimStart()
  };
}

export function isGeneratedDeukPointer(content) {
  const src = String(content || "");
  const hasHeader = /Managed by DeukAgent(?:Rules|Flow)/.test(src) || /# Deuk Agent Rules\b|# Deuk Agent Flow\b|# DeukAgentFlow\b/.test(src);
  const hasCoreRulesRef = /Core rules (?:are at|path is resolved by|are printed by):/i.test(src) || /deuk-agent-flow rules/i.test(src);
  if (!hasHeader || !hasCoreRulesRef) return false;
  return true;
}

export function canonicalizeGeneratedCommandReferences(cwd, bundleRoot, dryRun) {
  const targets = [
    makePath(cwd, "AGENTS.md"),
    getProjectRulePath(cwd),
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

function extractMarkdownHeadingSection(content = "", heading = "") {
  const normalizeHeading = value => stripLeadingSectionNumber(stripLeadingHashes(String(value || "").trim())).toLowerCase();
  const target = normalizeHeading(heading);
  if (!target) return "";
  const lines = String(content || "").split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (const [index, line] of lines.entries()) {
    const match = parseHeading(line);
    if (!match) continue;
    if (start === -1) {
      if (normalizeHeading(match.text) === target) {
        start = index;
        level = match.depth;
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
  if (!existsSync(rulesPath)) return "";
  return extractMarkdownHeadingSection(readFileSync(rulesPath, "utf8"), heading);
}

function readCliSurfaceDocument(bundleRoot, name) {
  const surfacePath = makePath(bundleRoot, "core-rules", "cli-surfaces", `${name}.md`);
  if (!existsSync(surfacePath)) {
    throw new Error(localized(INIT_TEXT.surfaceDocNotFound, { path: surfacePath }));
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

function buildGlobalAgentPointer(bundleRoot = resolvePackageRoot({ fromUrl: import.meta.url }), format = "markdown", targetId = "default") {
  if (!targetId) throw new Error(localized(INIT_TEXT.pointerTargetRequired));
  const body = renderCliSurfaceDocument(bundleRoot, `global-pointer-${targetId}`);

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
  if (!text.startsWith("---\n")) return { frontMatter: "", body: text };
  const endIdx = text.indexOf("\n---\n", 4);
  if (endIdx === -1) return { frontMatter: "", body: text };
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
  let currentBlock = splitManagedBlock(text);
  while (currentBlock) {
    text = [currentBlock.before, currentBlock.after].filter(Boolean).join("\n\n").trim();
    currentBlock = splitManagedBlock(text);
  }
  text = text.replace(/--- DEUK_AGENT_FLOW_BEGIN :[^\n]*\n[\s\S]*?--- DEUK_AGENT_FLOW_END\n?/g, "");
  text = text.replace(/DEUK_AGENT_GLOBAL_POINTER_BEGIN[\s\S]*?DEUK_AGENT_GLOBAL_POINTER_END\n?/g, "");
  text = text.replace(/^---\ndescription: "DeukAgentFlow global pointer"\nglobs: \["\*\*\/\*"\]\nalwaysApply: true\n---\n# DeukAgentFlow Global Pointer\n\nManaged by DeukAgentFlow\.\n\nRead this file first:\n[^\n]+\n\nKeep personal notes in the sibling `\.user` file, not in this managed pointer\.\n?/gm, "");
  text = text.replace(/^# DeukAgentFlow Global Pointer\n\nManaged by DeukAgentFlow\.\n\nRead this file first:\n[^\n]+\n\nKeep personal notes in the sibling `\.user` file, not in this managed pointer\.\n?/gm, "");
  text = text.replace(/^---\ndescription: "DeukAgentFlow global pointer"\nglobs: \["\*\*\/\*"\]\nalwaysApply: true\n---\n?/gm, "");
  text = text.replace(/^# DeukAgentFlow Global Pointer\n[\s\S]*$/m, "");

  text = text.replace(/요청하신 페르소나 지침을 더 자연스럽고 생동감 있게 다듬었습니다[\s\S]*?---/g, "");
  text = text.replace(/요청하신 페르소나 지침을 더 자연스럽고 생동감 있게 다듬었습니다[\s\S]*$/g, "");

  return text.trim();
}

function mergeGlobalAgentPointer(existingContent, managedContent) {
  const nextBlock = wrapGlobalPointerBlock(managedContent);
  const current = String(existingContent || "");
  const remainder = stripGlobalPointerBlocks(current);
  return remainder ? `${nextBlock}\n\n${remainder}\n` : `${nextBlock}\n`;
}

function getGlobalAgentInstructionTargets(homeDir = resolveUserHome(), bundleRoot = resolvePackageRoot({ fromUrl: import.meta.url }), targetIds = []) {
  const selectedIds = new Set(targetIds.map((id) => String(id || "").trim()).filter(Boolean));
  if (selectedIds.size === 0) {
    throw new Error(localized(INIT_TEXT.pointerSyncRequired));
  }
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
      target: makePath(homeDir, ".gemini", "config", "AGENTS.md"),
      content: buildGlobalAgentPointer(bundleRoot, "markdown", "antigravity")
    },
  ].filter((entry) => selectedIds.has(entry.id));
}

function syncGlobalAgentInstructions(dryRun, bundleRoot = resolvePackageRoot({ fromUrl: import.meta.url }), homeDir = resolveUserHome(), targetIds = []) {
  for (const entry of getGlobalAgentInstructionTargets(homeDir, bundleRoot, targetIds)) {
    if (dryRun) continue;
    const nextContent = entry.content;
    const existingContent = existsSync(entry.target) ? readTextIfExists(entry.target) : "";
    const mergedContent = mergeGlobalAgentPointer(existingContent, nextContent);
    if (existingContent === mergedContent) continue;

    mkdirSync(dirname(entry.target), { recursive: true });
    writeFileSync(entry.target, mergedContent, "utf8");
  }
}

export function runGlobalAgentInstructionSync(dryRun = false, bundleRoot = resolvePackageRoot({ fromUrl: import.meta.url }), homeDir = resolveUserHome(), targetIds = []) {
  syncGlobalAgentInstructions(dryRun, bundleRoot, homeDir, targetIds);
}

export function removeDuplicateRuleCopies(cwd, dryRun) {
  removeLegacyPaths(cwd, dryRun, CANONICAL_INIT_CLEANUP_PATHS.duplicateRuleCopies, "legacy/duplicate");
}

// 정본 = 루트 PROJECT_RULE.md. 루트가 없을 때만 docs/ → 홈 저장소 순으로 옮겨 온다.
// 루트가 이미 있으면 docs/ 사본은 removeStrayProjectRuleCopies가 정리한다.
function migrateProjectRuleToAgentRoot(cwd, dryRun, opts: CliOpts = {}) {
  const canonicalPath = getProjectRulePath(cwd);
  if (existsSync(canonicalPath)) return false;

  const legacyDocsPath = makePath(cwd, "docs", "PROJECT_RULE.md");
  if (existsSync(legacyDocsPath)) {
    if (!dryRun) renameSync(legacyDocsPath, canonicalPath);
    console.log(`[MIGRATE] ${dryRun ? "Would move" : "Moved"} ${toRepoRelativePath(cwd, legacyDocsPath)} -> ${toRepoRelativePath(cwd, canonicalPath)}`);
    return true;
  }

  const homeDir = resolveHomeTicketDirForWorkspace(cwd, opts);
  const legacyHomePath = makePath(homeDir, "PROJECT_RULE.md");
  if (!existsSync(legacyHomePath)) return false; // 복원할 사본 없음

  if (!dryRun) copyFileSync(legacyHomePath, canonicalPath);
  console.log(`[MIGRATE] ${dryRun ? "Would restore" : "Restored"} PROJECT_RULE.md from home store -> ${toRepoRelativePath(cwd, canonicalPath)}`);
  return true;
}

function removeStrayProjectRuleCopies(cwd, dryRun) {
  const canonicalPath = getProjectRulePath(cwd);
  const removed = [];

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (DEFAULT_IGNORE_DIRS.includes(ent.name) || ent.name.startsWith(".") || ent.name === "templates") continue;
      const subDir = makePath(dir, ent.name);
      const strayPath = makePath(subDir, "PROJECT_RULE.md");
      if (existsSync(strayPath) && strayPath !== canonicalPath) {
        if (!dryRun) unlinkSync(strayPath);
        removed.push(toRepoRelativePath(cwd, strayPath));
      }
      walk(subDir);
    }
  }

  walk(cwd);

  if (removed.length > 0) {
    console.log(`[CLEANUP] ${dryRun ? "Would remove" : "Removed"} stray PROJECT_RULE.md copies: ${removed.join(", ")}`);
  }
  return removed;
}

function purgeDeadArchitectureDocsField(cwd, dryRun) {
  const rulePath = getProjectRulePath(cwd);
  if (!existsSync(rulePath)) return false;

  const original = readFileSync(rulePath, "utf8");
  let next = original;

  const fmMatch = next.match(/^---\n([\s\S]*?)\n---\n/);
  if (fmMatch) {
    const body = fmMatch[1].replace(/^architecture_docs:.*(?:\n[ \t]+-.*)*\n?/m, "");
    const rebuiltFm = body.trim() ? `---\n${body.replace(/\n+$/, "")}\n---\n` : "";
    next = rebuiltFm + next.slice(fmMatch[0].length);
  }

  next = next.replace(/(?:^>.*\n)*^>.*architecture_docs.*\n(?:^>.*\n)*/m, "");

  next = next.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");

  if (next === original) return false;

  if (!dryRun) writeFileSync(rulePath, next);
  console.log(`[CLEANUP] ${dryRun ? "Would purge" : "Purged"} dead architecture_docs field/notice from ${toRepoRelativePath(cwd, rulePath)}`);
  return true;
}

function ensureProjectRule(cwd, bundleRoot, dryRun, opts: CliOpts = {}) {
  const projectRulePath = getProjectRulePath(cwd);
  if (existsSync(projectRulePath)) return false;

  const templatePath = makePath(bundleRoot, "templates", "PROJECT_RULE.md");
  if (!existsSync(templatePath)) return false;

  if (!dryRun) {
    mkdirSync(dirname(projectRulePath), { recursive: true });
    copyFileSync(templatePath, projectRulePath);
  }
  console.log(`PROJECT_RULE.md: created from template at workspace root`);
  return true;
}

const PROJECT_RULE_ID_LINE_RE = /^-\s*\[([A-Z0-9-]+)\]\s.*$/;

function parseProjectRuleIdLines(content) {
  const map = new Map();
  for (const line of content.split("\n")) {
    const m = line.match(PROJECT_RULE_ID_LINE_RE);
    if (m) map.set(m[1], line);
  }
  return map;
}

export function syncProjectRuleIdLines(cwd, bundleRoot, dryRun, opts: CliOpts = {}) {
  const projectRulePath = getProjectRulePath(cwd);
  if (!existsSync(projectRulePath)) return false;

  const templatePath = makePath(bundleRoot, "templates", "PROJECT_RULE.md");
  if (!existsSync(templatePath)) return false;

  const original = readFileSync(projectRulePath, "utf8");
  const templateLines = parseProjectRuleIdLines(readFileSync(templatePath, "utf8"));

  let next = original;
  let changed = false;
  for (const line of original.split("\n")) {
    const m = line.match(PROJECT_RULE_ID_LINE_RE);
    if (!m) continue;
    const templateLine = templateLines.get(m[1]);
    if (templateLine && templateLine !== line) {
      next = next.replace(line, templateLine);
      changed = true;
      console.log(`[SYNC] ${dryRun ? "Would update" : "Updated"} PROJECT_RULE.md rule [${m[1]}] from template`);
    }
  }

  if (!changed) return false;
  if (!dryRun) writeFileSync(projectRulePath, next);
  return true;
}

export function runSingleWorkspaceMaintenance(cwd, dryRun, bundleRoot, opts: CliOpts = {}) {
  console.log(`\nInitializing ${basename(cwd)}...`);

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
  removeStrayProjectRuleCopies(cwd, dryRun);
  purgeDeadArchitectureDocsField(cwd, dryRun);

  removeRuntimeTemplateCopies(cwd, dryRun);
  removeLocalSkillCopies(cwd, dryRun);
  try { ensureSystemSkills(cwd, { dryRun }); } catch { /* best-effort */ }
  try { pruneOrphanedSystemSkills(cwd, { dryRun }); } catch { /* best-effort */ }
  removeLocalAgentSurfaces(cwd, dryRun);
  canonicalizeGeneratedCommandReferences(cwd, bundleRoot, dryRun);
  cleanupNestedGeneratedAgentPointers(cwd, dryRun);
}
