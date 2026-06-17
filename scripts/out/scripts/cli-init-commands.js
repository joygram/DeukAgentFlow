import { upsertClaudeUserPromptSubmitHook } from "./cli-init-claude.js";
// #638: updateSiblingWorkspaceRegistry (B / ~/.agent-flow) retired — no longer called.
import { basename } from "path";
import { existsSync } from "fs";
import { ensureWorkspaceMigrated } from "./cli-ticket-home.js";
import { syncExposedNativeSkills } from "./cli-skill-commands.js";
// #623/#622-D: init-time migration of a workspace's tickets to ~/.deuk-agent/tickets/
// and sync of native skills from the SSOT. Idempotent and best-effort — a failure
// here must not abort workspace setup.
function ensureTicketsMigratedOnInit(cwd, dryRun) {
    try {
        // #645: init is the ONLY entry point allowed to mint a brand-new workspace
        // (marker + workspace.json). allowCreate gates that — without it, reconcile
        // self-heals an already-registered workspace but never registers a new one.
        ensureWorkspaceMigrated(cwd, { dryRun, allowCreate: true });
    }
    catch (err) {
        console.warn(`[INIT] ticket home migration skipped for ${basename(cwd)}: ${err.message}`);
    }
    try {
        syncExposedNativeSkills(cwd, { dryRun });
    }
    catch (err) {
        console.warn(`[INIT] skill sync skipped for ${basename(cwd)}: ${err.message}`);
    }
}
import { discoverAllWorkspaces, loadInitConfig, resolvePackageRoot, resolveUserHome } from "./cli-utils.js";
import { removeFragmentedLocalAgentSurfaces, removeLocalSkillCopies, removeNestedLegacyWorkspaceConfigs, removeRuntimeTemplateCopies } from "./cli-init-migrate.js";
import { canonicalizeGeneratedCommandReferences, removeDuplicateRuleCopies, runGlobalAgentInstructionSync, runSingleWorkspaceMaintenance, syncCodexMcpEndpointFromWorkspace } from "./cli-init-instructions.js";
export function runWorkspaceMaintenance(cwd = process.cwd(), dryRun = false, bundleRoot = resolvePackageRoot({ fromUrl: import.meta.url }), opts = {}) {
    dryRun = Boolean(dryRun);
    if (!cwd || !existsSync(cwd))
        return { removed: 0 };
    if (opts.silent) {
        const originalLog = console.log;
        console.log = () => { };
        try {
            return runWorkspaceMaintenance(cwd, dryRun, bundleRoot, { ...opts, silent: false });
        }
        finally {
            console.log = originalLog;
        }
    }
    const ignoreDirs = [];
    const recursive = Boolean(opts.recursive);
    const homeDir = resolveUserHome(opts);
    const saved = loadInitConfig(cwd, { ...opts, homeDir }) || {};
    const maintenanceOptions = { ...saved, ...opts };
    runGlobalAgentInstructionSync(dryRun, bundleRoot, homeDir);
    const codexMcpResult = syncCodexMcpEndpointFromWorkspace(cwd, { dryRun, homeDir });
    const claudeSettingsResult = upsertClaudeUserPromptSubmitHook({ dryRun, homeDir });
    // #638: the ~/.agent-flow sibling registry (B) is retired. Workspace candidates now
    // come solely from ~/.deuk-agent/tickets/{uuid}/workspace.json (written by reconcile),
    // so we no longer write B here — it only went stale and spawned ambiguous ghosts.
    removeNestedLegacyWorkspaceConfigs(cwd, dryRun, ignoreDirs);
    removeRuntimeTemplateCopies(cwd, dryRun);
    removeLocalSkillCopies(cwd, dryRun);
    removeDuplicateRuleCopies(cwd, dryRun);
    canonicalizeGeneratedCommandReferences(cwd, bundleRoot, dryRun);
    const removed = removeFragmentedLocalAgentSurfaces(cwd, dryRun);
    const submodules = recursive ? discoverAllWorkspaces(cwd, ignoreDirs) : [cwd];
    if (recursive && !submodules.includes(cwd))
        submodules.push(cwd);
    for (const subCwd of submodules) {
        try {
            runSingleWorkspaceMaintenance(subCwd, dryRun, bundleRoot, maintenanceOptions);
            // #623: init is one of the two migration entry points (the other is ticket
            // command entry). Move this workspace's tickets to home as part of setup.
            ensureTicketsMigratedOnInit(subCwd, dryRun);
        }
        catch (err) {
            console.error(`[ERROR] Failed to initialize workspace ${basename(subCwd)}: ${err.message}`);
        }
    }
    return {
        removed,
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
//# sourceMappingURL=cli-init-commands.js.map