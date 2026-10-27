import { existsSync } from "fs";
import { basename } from "path";
import { removeClaudeNormalizeEolHook,removeClaudePostToolUseHook,removeClaudePreToolUseHook,removeClaudeStopHook,removeClaudeToolGuardHook,removeClaudeUserPromptSubmitHook } from "./cli-init-claude.js";

import { syncExposedNativeSkills } from "./cli-skill-commands.js";
import { ensureWorkspaceMigrated } from "./cli-ticket-home.js";

function ensureWorkspaceMarkerOnInit(cwd, dryRun) {
  ensureWorkspaceMigrated(cwd, { dryRun, allowCreate: true });
}

function ensureTicketsMigratedOnInit(cwd, dryRun) {
  try {
    syncExposedNativeSkills(cwd, { dryRun });
  } catch (err) {
    console.warn(`[INIT] skill sync skipped for ${basename(cwd)}: ${err.message}`);
  }
}

import { CliOpts,discoverAllWorkspaces,loadInitConfig,makePath,resolvePackageRoot,resolveUserHome } from "./cli-utils.js";

import { canonicalizeGeneratedCommandReferences,removeDuplicateRuleCopies,runGlobalAgentInstructionSync,runSingleWorkspaceMaintenance,syncCodexMcpEndpointFromWorkspace } from "./cli-init-instructions.js";
import { removeFragmentedLocalAgentSurfaces,removeLocalSkillCopies,removeNestedLegacyWorkspaceConfigs,removeRuntimeTemplateCopies } from "./cli-init-migrate.js";

const GLOBAL_AGENT_INSTRUCTION_IDS = ["codex", "claude", "gemini", "cursor", "copilot", "antigravity"];

function normalizeGlobalAgentInstructionIds(rawIds = []): string[] {
  const ids = new Set<string>();
  for (const rawId of rawIds) {
    const id = String(rawId || "").trim().toLowerCase();
    if (!id) continue;
    if (id === "gemini") {
      ids.add("gemini");
      ids.add("antigravity");
      continue;
    }
    if (id === "antigravity") {
      ids.add("gemini");
      ids.add("antigravity");
      continue;
    }
    if (GLOBAL_AGENT_INSTRUCTION_IDS.includes(id)) ids.add(id);
  }
  return Array.from(ids);
}

function resolveGlobalAgentInstructionIds(homeDir, opts: CliOpts = {}): string[] {
  const configuredIds = normalizeGlobalAgentInstructionIds([
    opts.platform,
    ...(Array.isArray(opts.agentTools) ? opts.agentTools : [])
  ]);
  if (configuredIds.length > 0) return configuredIds;

  const detectedIds = normalizeGlobalAgentInstructionIds([
    existsSync(makePath(homeDir, ".codex")) ? "codex" : "",
    existsSync(makePath(homeDir, ".claude")) ? "claude" : "",
    existsSync(makePath(homeDir, ".gemini")) ? "gemini" : "",
    existsSync(makePath(homeDir, ".cursor")) ? "cursor" : "",
    existsSync(makePath(homeDir, ".config", "Code", "User")) ? "copilot" : "",
  ]);
  if (detectedIds.length === 0) {
    throw new Error("global agent rule install target not found: no init agentTools and no supported agent home directory detected");
  }
  return detectedIds;
}

export function runWorkspaceMaintenance(cwd = process.cwd(), dryRun = false, bundleRoot = resolvePackageRoot({ fromUrl: import.meta.url }), opts: CliOpts = {}) {
  dryRun = Boolean(dryRun);
  if (!cwd || !existsSync(cwd)) return { removed: 0 };
  if (opts.silent) {
    const originalLog = console.log;
    console.log = () => {};
    try {
      return runWorkspaceMaintenance(cwd, dryRun, bundleRoot, { ...opts, silent: false });
    } finally {
      console.log = originalLog;
    }
  }
  const ignoreDirs = [];
  const recursive = Boolean(opts.recursive);

  const homeDir = resolveUserHome(opts);
  const saved = loadInitConfig(cwd, { ...opts, homeDir }) || {};
  const maintenanceOptions = { ...saved, ...opts };
  runGlobalAgentInstructionSync(dryRun, bundleRoot, homeDir, resolveGlobalAgentInstructionIds(homeDir, maintenanceOptions));
  const codexMcpResult = syncCodexMcpEndpointFromWorkspace(cwd, { dryRun, homeDir });
  const claudeSettingsResult = removeClaudeUserPromptSubmitHook({ dryRun, homeDir });
  removeClaudePreToolUseHook({ dryRun, homeDir });
  removeClaudePostToolUseHook({ dryRun, homeDir });
  removeClaudeStopHook({ dryRun, homeDir });
  removeClaudeToolGuardHook({ dryRun, homeDir });
  removeClaudeNormalizeEolHook({ dryRun, homeDir });
  removeNestedLegacyWorkspaceConfigs(cwd, dryRun, ignoreDirs);
  removeRuntimeTemplateCopies(cwd, dryRun);
  removeLocalSkillCopies(cwd, dryRun);
  removeDuplicateRuleCopies(cwd, dryRun);
  canonicalizeGeneratedCommandReferences(cwd, bundleRoot, dryRun);
  const removed = removeFragmentedLocalAgentSurfaces(cwd, dryRun);

  const submodules = recursive ? discoverAllWorkspaces(cwd, ignoreDirs) : [cwd];
  if (recursive && !submodules.includes(cwd)) submodules.push(cwd);

  const failures = [];
  for (const subCwd of submodules) {
    try {
      ensureWorkspaceMarkerOnInit(subCwd, dryRun);
      runSingleWorkspaceMaintenance(subCwd, dryRun, bundleRoot, maintenanceOptions);
      ensureTicketsMigratedOnInit(subCwd, dryRun);
    } catch (err) {
      console.error(`[ERROR] Failed to initialize workspace ${basename(subCwd)}: ${(err as Error).message}`);
      failures.push({ workspace: basename(subCwd), message: (err as Error).message });
    }
  }

  return {
    removed,
    failures,
    initFailed: failures.length > 0,
    codexMcpChanged: Boolean(codexMcpResult?.changed),
    codexMcpUrl: codexMcpResult?.url || null,
    claudeSettingsChanged: Boolean(claudeSettingsResult?.changed),
    claudeSettingsHash: claudeSettingsResult?.hash || null
  };
}

export function formatInitCompletionMessage(cwd, dryRun = false) {
  const label = dryRun ? "Dry-run complete" : "Init complete";
  return `[DONE] ${label} for ${basename(cwd)}. Rules and pointers are ready. \`이슈분석 티켓\`이라고 해보세요.`;
}
