#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { parseArgs, parseSkillArgs, parseTelemetryArgs, parseTicketArgs, parseUsageArgs } from "./cli-args.js";
import { formatInitCompletionMessage, runWorkspaceMaintenance } from "./cli-init-commands.js";
import { removeClaudeUserPromptSubmitHook } from "./cli-init-claude.js";
import { runGlobalAgentInstructionSync } from "./cli-init-instructions.js";
import { buildTicketCreateGuide, buildTicketRulesGuide, runTicketArchive, runTicketClose, runTicketConnect, runTicketCreate, runTicketDiscard, runTicketDoctor, runTicketEvidenceCheck, runTicketEvidenceReport, runTicketGuard, runTicketHandoff, runTicketHotfix, runTicketList, runTicketMeta, runTicketMigrateHome, runTicketMove, runTicketNext, runTicketRebuild, runTicketRules, runTicketSanitize, runTicketStatus, runTicketUse } from "./cli-ticket-commands.js";
import { runTelemetry } from "./cli-telemetry-commands.js";
import { runUsage } from "./cli-usage-commands.js";
import { runContextCommand } from "./cli-context-commands.js";
import { performUpgradeMigration } from "./cli-ticket-migration.js";
import { pruneGhostWorkspaces, resolveHomeTicketDirForWorkspace } from "./cli-ticket-home.js";
import { collectTicketMarkdownFiles } from "./cli-ticket-scan.js";
import { LEGACY_DEUK, DEUK_ROOT_DIR, CliOpts, INIT_CONFIG_VERSION, WORKFLOW_MODE_EXECUTE, checkUpdateNotifier, findWorkspaceRoot, getUserInitConfigPath, loadInitConfig, loadSiblingWorkspaceCandidates, loadWorkspaceCandidates, makePath, normalizeRegistryPath, resolveConsumerTicketRoot, resolveDocsLanguage, resolvePackageRoot, resolveSessionId, resolveWorkflowMode, resolveWorkspaceContext, resolveWorkspaceTarget } from "./cli-utils.js";


void checkUpdateNotifier();

const pkgRoot = resolvePackageRoot({ fromUrl: import.meta.url });

function parseEntryOptions(sub, rest) {
  if (sub === "ticket") return parseTicketArgs(rest.slice(1));
  if (sub === "telemetry") return parseTelemetryArgs(rest);
  if (sub === "usage") return parseUsageArgs(rest.slice(1));
  if (sub === "skill") return parseSkillArgs(rest.slice(1));
  if (sub === "workspace") return parseArgs(rest.slice(1));
  if (sub === "rules") {
    const action = rest[0];
    return parseArgs(action && !String(action).startsWith("-") ? rest.slice(1) : rest);
  }
  if (sub === "init" || sub === "merge") return parseArgs(rest);
  if (sub === "context" || sub === "config" || sub === "lint:md" || sub === "lint-md") return parseArgs(rest);
  return parseArgs(rest);
}

function resolveAgentWorkspaceRoot(startDir) {
  // Must NOT use resolveWorkspaceContext here: it falls back to resolve(cwd) when
  // no .deuk-agent marker exists, so the home dir (e.g. C:\Users\joy) would look
  // like a workspace and trigger maintenance that crashes on null paths. Use the
  // marker-based finder (with its home guard) so only real workspaces qualify.
  return findWorkspaceRoot(startDir || process.cwd()) || "";
}

function hasManagedAgentWorkspace(cwd) {
  return Boolean(resolveAgentWorkspaceRoot(cwd));
}

async function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  if (!sub || sub === "-h" || sub === "--help" || sub === "help") {
    printAugmentedHelp();
    return;
  }

  if (sub === "--version" || sub === "-v" || sub === "version") {
    try {
      const pkg = JSON.parse(readFileSync(makePath(pkgRoot, "package.json"), "utf8"));
      console.log(pkg.version);
    } catch {
      console.error("unable to read package version");
      process.exitCode = 1;
    }
    return;
  }

  const rest = argv.slice(1);
  const entryOpts = parseEntryOptions(sub, rest);
  const shouldRunAutoMigration = shouldRunEntryAutoMigration(sub, rest);
  const entryAutoMigrationCwd = shouldRunAutoMigration ? resolveEntryAutoMigrationCwd(sub, entryOpts) : entryOpts.cwd;
  const shouldSkipAutoMaintenance = shouldRunAutoMigration && !hasManagedAgentWorkspace(entryAutoMigrationCwd);
  if (shouldRunAutoMigration && !shouldSkipAutoMaintenance) {
    runWorkspaceMaintenance(entryAutoMigrationCwd, entryOpts.dryRun, pkgRoot, {
      ...entryOpts,
      silent: true
    });
  }

  if (sub === "ticket") {
    const action = rest[0];
    const opts = entryOpts;
    if (opts.cwdExplicit) {
      throw new Error("ticket commands no longer accept --cwd. Use --workspace <id> for target selection, or --id for existing tickets.");
    }
    // #638: prune-ghosts is a global home-store operation — it spans all
    // workspaces and needs no --workspace, so handle it before workspace
    // resolution (which would otherwise reject it for lacking --workspace).
    if (action === "prune-ghosts") {
      await runTicketPruneGhosts(opts);
      return;
    }
    if (!action || action === "-h" || action === "--help" || action === "help" || opts.help) {
      printTicketGuide(opts.help && action && !String(action).startsWith("-") ? action : "", opts);
      return;
    }
    opts.cwd = resolveTicketWorkspaceCwd(opts);
    // #623: migrate this workspace's tickets to home once, here at the single ticket
    // command entry point. detect itself is now a pure read, so this is the only
    // place (besides init) that performs the move/registry write. Idempotent.
    try {
      const { resolveRealWorkspaceRoot } = await import("./cli-utils.js");
      const home = await import("./cli-ticket-home.js") as any;
      // #626: never fall back to opts.cwd — a non-workspace cwd (temp/subfolder) must
      // NOT be registered as a ghost workspace. null → migration is simply skipped.
      // #645: no allowCreate here — a ticket command running in some cwd only ever
      // self-heals an ALREADY-registered workspace (marker present). It must NEVER
      // mint a new one; that auto-on-cwd behavior is what spawned the ghosts. New
      // workspaces are registered exclusively by `deuk-agent-flow init`.
      const wsRoot = resolveRealWorkspaceRoot(opts.cwd, opts);
      if (wsRoot) home.ensureWorkspaceMigrated(wsRoot);
    } catch { /* migration is best-effort; commands still work via fallback */ }
    // #622-D: keep native (Claude) skills in sync with the SSOT on ticket entry —
    // package-template updates propagate to ~/.claude/skills without manual re-expose.
    try {
      const { syncExposedNativeSkills } = await import("./cli-skill-commands.js");
      syncExposedNativeSkills(opts.cwd);
    } catch { /* skill sync is best-effort */ }
    if (action === "create") await runTicketCreate(opts);
    else if (action === "list") await runTicketList(opts);
    else if (action === "use") await runTicketUse(opts);
    else if (action === "next") await runTicketNext(opts);
    else if (action === "evidence") await runTicketEvidenceCheck(opts);
    else if (action === "close") await runTicketClose(opts);
    else if (action === "archive") await runTicketArchive(opts);
    else if (action === "discard" || action === "delete") await runTicketDiscard(opts);
    else if (action === "meta") await runTicketMeta(opts);
    else if (action === "connect") await runTicketConnect(opts);
    else if (action === "rebuild") await runTicketRebuild(opts);
    else if (action === "sanitize") await runTicketSanitize(opts);
    else if (action === "doctor") await runTicketDoctor(opts);
    else if (action === "move" || action === "step") await runTicketMove(opts);
    else if (action === "hotfix") await runTicketHotfix(opts);
    else if (action === "status") await runTicketStatus(opts);
    else if (action === "migrate-home" || action === "migrate-tickets-to-home") await runTicketMigrateHome(opts);
    else if (action === "guard") {
      await runTicketGuard(opts);
    }
    else if (action === "context") {
      throw new Error("ticket context has been removed from the approval surface. Use: deuk-agent-flow ticket move --id <ticket-id> --phase 2 --approval approved --non-interactive");
    }
    else if (action === "handoff" || action === "continue") await runTicketHandoff(opts);
    else if (action === "report") {
      // #727: report/reports(레거시 cwd 기록)는 제거. evidence-report(claim)만 유지.
      if (opts.claim) {
        await runTicketEvidenceReport(opts);
      } else {
        throw new Error("ticket report/reports has been removed (#727). Reports were a legacy cwd artifact.");
      }
    }
    else if (action === "upgrade" || action === "migrate") {
      const count = performUpgradeMigration(opts.cwd, opts);
      console.log(`Migration complete: ${count} tickets upgraded.`);
    }
    else {
      console.error("Unknown ticket action: " + action);
      // #648: unknown subcommand → plain usage, not the rules gate.
      printTicketGuide("", { ...opts, help: true });
    }
    return;
  }

  if (sub === "telemetry") {
    const opts = entryOpts;
    await runTelemetry(opts);
    return;
  }

  if (sub === "usage") {
    const action = rest[0];
    const opts = entryOpts;
    await runUsage(action, opts);
    return;
  }

  if (sub === "workspace") {
    const action = rest[0];
    const opts = entryOpts;
    runWorkspace(action, opts, rest.slice(1));
    return;
  }

  if (sub === "context") {
    runContextCommand(rest);
    return;
  }

  if (sub === "config") {
    runConfig(rest[0], entryOpts, rest.slice(1));
    return;
  }

  if (sub === "skill") {
    const action = rest[0];
    const opts = entryOpts;
    const { runSkill } = await import("./cli-skill-commands.js");
    await runSkill(action, opts);
    return;
  }

  if (sub === "lint:md" || sub === "lint-md") {
    const { runMarkdownLint } = await import("./lint-md.js");
    runMarkdownLint(rest);
    return;
  }

  if (sub === "rules") {
    const action = rest[0] && !String(rest[0]).startsWith("-") ? rest[0] : undefined;
    const opts = entryOpts;
    if (!action) {
      runRulesShow(opts);
      return;
    }
    if (action === "audit") {
      const { runRulesAudit } = await import("./lint-rules.js");
      runRulesAudit(opts);
      return;
    }
    if (action === "ticket") {
      if (opts.cwdExplicit) {
        throw new Error("rules ticket no longer accepts --cwd. Load the ticket surface with `deuk-agent-flow rules ticket`.");
      }
      opts.cwd = resolveTicketWorkspaceCwd(opts);
      opts.ruleSurface = "ticket";
      await runTicketRules(opts);
      return;
    }
    if (action === "show") {
      runRulesShow(opts);
      return;
    }
    if (action === "path") {
      runRulesPath(opts);
      return;
    }
    console.error("Unknown rules action: " + action);
    printAugmentedHelp("rules");
    return;
  }

  if (sub === "init" || sub === "merge") {
    const opts = entryOpts;
    if (opts.help) {
      printAugmentedHelp(sub);
      return;
    }
    // Explicit init/merge is allowed to bootstrap a new workspace even when
    // entry auto-maintenance would skip the same path for lacking .deuk-agent.

    const saved = loadInitConfig(opts.cwd, opts);
    if (saved && !opts.interactive) {
      // CLI flags (opts) take precedence over saved config
      for (const key in saved) {
        if (opts[key] === undefined) opts[key] = saved[key];
      }
      console.log(`Using saved ${saved.configScope || "workspace"} config from ${saved.configPath || `${DEUK_ROOT_DIR}/config.json`} (CLI overrides applied)`);
    }

    await handleInit(opts, saved, sub);
    return;
  }

  console.error("Unknown command: " + sub);
  printAugmentedHelp();
}

function shouldRunEntryAutoMigration(sub, rest = []) {
  if (sub === "workspace") return false;
  if (sub === "config") return false;
  if (rest.some(arg => arg === "-h" || arg === "--help" || arg === "help")) return false;
  if (sub === "rules" && (rest[0] === "path" || rest[0] === "show")) return false;
  return true;
}

function resolveEntryAutoMigrationCwd(sub, opts: CliOpts = {}) {
  // Auto-migration is best-effort: resolve workspace from registry when possible.
  // rules and ticket are the primary entry points that always know a workspace.
  if (sub === "ticket" || sub === "rules") {
    try {
      return resolveTicketWorkspaceCwd(opts);
    } catch {
      return opts.cwd;
    }
  }
  return opts.cwd;
}

function resolveTicketWorkspaceCwd(opts: CliOpts = {}) {
  const query = opts.workspace || "";
  const candidates = loadWorkspaceCandidates("", { platform: "any", homeDir: opts.homeDir });

  // #652: Workspace is resolved ONLY from registry mapping — explicit --workspace,
  // or sessionId cookie (also registry-backed). cwd is never passed in or read.
  const resolution = candidates ? resolveWorkspaceTarget("", query, { candidates, sessionId: opts.sessionId, homeDir: opts.homeDir }) : null;
  if (resolution?.target?.path) return resolution.target.path;

  // #633: for commands targeting an existing ticket (move/use/close/status), the
  // workspace can be derived from the ticket id by scanning each registered
  // workspace's INDEX.json — this is still registry-only (cwd is never read), so
  // it satisfies the no-cwd-fallback rule while keeping --id ergonomic.
  if (!query && opts.ticketId) {
    const byId = resolveTicketWorkspaceById(opts);
    if (byId) return byId;
  }

  const hint = query
    ? `--workspace "${query}" did not match any registered workspace.`
    : opts.ticketId
      ? `--id "${opts.ticketId}" was not found in any registered workspace, and no --workspace was given.`
      : `no --workspace was given and no session cookie matched.`;
  throw new Error(
    `Cannot resolve workspace from the registry: ${hint}\n` +
    `Workspace is determined only by --workspace or a session cookie (registry-backed); ` +
    `cwd is never used. Pass --workspace <name> or register the workspace first.`
  );
}

// #638: prune empty ghost workspace folders (name-{idSuffix} leftovers with no
// .md) from the home store, plus their dead registry entries. Dry-run by default;
// --apply performs deletion. Global (home-store) op, no --workspace needed.
async function runTicketPruneGhosts(opts: CliOpts = {}) {
  const result = pruneGhostWorkspaces({ ...opts, apply: Boolean(opts.apply) });
  if (result.ghosts.length === 0) {
    console.log("No ghost (empty) workspace folders found in the home store.");
    return;
  }
  console.log(`Ghost (empty, no .md) workspace folders: ${result.ghosts.length}`);
  for (const key of result.ghosts) {
    console.log(opts.apply ? `[REMOVE] ${key}` : `[DRY-RUN] would remove ${key}`);
  }
  if (opts.apply) {
    console.log(`Done: removed ${result.removed.length} folder(s), dropped ${(result as Record<string, any>).registryDropped?.length ?? 0} registry entr(y/ies).`);
  } else {
    console.log("Re-run with --apply to delete these folders and their dead registry entries.");
  }
}

function resolveTicketWorkspaceById(opts: CliOpts = {}) {
  const selector = String(opts.ticketId || "").trim();
  if (!selector) return "";
  const candidates = loadWorkspaceCandidates(opts.invocationCwd || opts.cwd);
  if (!candidates?.workspaces?.length) return "";

  const matches = [];
  for (const workspace of candidates.workspaces) {
    // #622/#633: tickets live in the home store (~/.deuk-agent/tickets/{ticketKey}/).
    // Resolve the dir ONLY through the path util (resolveHomeTicketDirForWorkspace) and
    // scan the actual .md files (collectTicketMarkdownFiles) — never hand-assemble paths
    // or trust INDEX.json, which can drift out of sync with the real files on disk.
    const homeDir = resolveHomeTicketDirForWorkspace(workspace.path, opts);
    const found = collectTicketMarkdownFiles(homeDir)
      .some(file => basename(file, ".md").includes(selector));
    if (found) matches.push(workspace);
  }
  if (matches.length === 1) return matches[0].path;
  if (matches.length > 1) {
    throw new Error(`ticket id is ambiguous across registered workspaces: ${matches.map(workspace => workspace.id).join(", ")}`);
  }
  return "";
}

function runConfig(action, opts, argv = []) {
  const configPath = getUserInitConfigPath(opts);
  if (!action || action === "path") {
    console.log(configPath);
    return;
  }
  if (action === "show") {
    if (!existsSync(configPath)) {
      console.log("{}");
      return;
    }
    console.log(JSON.stringify(JSON.parse(readFileSync(configPath, "utf8")), null, 2));
    return;
  }
  if (action === "set") {
    const key = argv[0];
    const value = argv[1];
    if (!key || value === undefined) throw new Error("config set requires <key> <value>");
    const existing = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
    const next = { ...existing, version: INIT_CONFIG_VERSION, [key]: parseConfigValue(value), updatedAt: new Date().toISOString() };
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(next, null, 2), "utf8");
    console.log(`config set: ${key}`);
    return;
  }
  if (action === "unset") {
    const key = argv[0];
    if (!key) throw new Error("config unset requires <key>");
    const existing = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
    delete existing[key];
    existing.updatedAt = new Date().toISOString();
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf8");
    console.log(`config unset: ${key}`);
    return;
  }
  throw new Error("Unknown config action: " + action);
}

function parseConfigValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (String(value).includes(",")) return String(value).split(",").map(part => part.trim()).filter(Boolean);
  return value;
}

function runWorkspace(action, opts, argv = []) {
  // #636: use the same global-registry-first loader as ticket commands, so
  // `workspace list/resolve` work from any cwd (incl. neutral dirs) instead of
  // only seeing cwd-sibling candidates.
  const candidates = loadWorkspaceCandidates(opts.invocationCwd || opts.cwd, { platform: "any" });
  if (!candidates) {
    throw new Error("workspace candidates not found");
  }

  if (action === "list" || !action) {
    for (const workspace of candidates.workspaces) {
      console.log(`${workspace.id}\t${workspace.path}`);
    }
    return;
  }

  if (action === "resolve") {
    const query = findWorkspaceQuery(argv) || opts.workspace || opts.project;
    const result = resolveWorkspaceTarget(opts.cwd, query, { candidates, sessionId: opts.sessionId });
    if (!result?.target) {
      const suffix = result?.reason ? ` (${result.reason})` : "";
      throw new Error(`workspace target not found${suffix}: ${query || ""}`.trim());
    }
    console.log(result.target.path);
    return;
  }

  throw new Error("Unknown workspace action: " + action);
}

function findWorkspaceQuery(argv = []) {
  const valueOptions = new Set(["--cwd", "--workspace", "--project"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "resolve") continue;
    if (valueOptions.has(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith("--")) continue;
    return arg;
  }
  return "";
}

// Removed legacy migration runTicketMigrate

async function handleInit(opts, saved, sub = "init") {
  if (opts.clean && !opts.dryRun) {
    console.log(`[CLEAN] Removing runtime template copies, legacy templates, and config...`);
    const templatesDir = makePath(opts.cwd, LEGACY_DEUK.templateDir);
    const runtimeTemplatesDir = makePath(opts.cwd, DEUK_ROOT_DIR, "templates");
    const configFile = makePath(opts.cwd, LEGACY_DEUK.configFile);
    if (existsSync(templatesDir)) rmSync(templatesDir, { recursive: true, force: true });
    if (existsSync(runtimeTemplatesDir)) rmSync(runtimeTemplatesDir, { recursive: true, force: true });
    if (existsSync(configFile)) rmSync(configFile, { force: true });
  }

  const workflowMode = resolveWorkflowMode(opts, saved);
  if (!opts.dryRun && workflowMode !== WORKFLOW_MODE_EXECUTE) {
    console.log(`[WORKFLOW] Plan mode active. Re-run with --workflow execute or --approval approved to apply file mutations.`);
    return;
  }

  const maintenanceResult = runWorkspaceMaintenance(opts.cwd, opts.dryRun, pkgRoot, opts);
  if (opts.clean && !opts.dryRun) {
    removeClaudeUserPromptSubmitHook({ homeDir: opts.homeDir });
  }
  // #776: init이 실패하면 [DONE]을 출력하지 않고 종료코드를 세운다. 과거엔 워크스페이스
  // maintenance가 throw해도 내부 catch가 삼키고 무조건 [DONE]+EXIT0을 찍어, 신규
  // 워크스페이스가 등록 안 됐는데도 "성공"으로 위장됐다(사용자가 ID 손수 생성 등 위험
  // 우회로 빠지는 2차 피해).
  if (maintenanceResult?.initFailed) {
    process.exitCode = 1;
    console.error(`[FAILED] init did not complete for: ${(maintenanceResult.failures || []).map(f => f.workspace).join(", ")}. Workspace not registered. Fix the error above and re-run.`);
    return;
  }
  if (sub === "init") console.log(formatInitCompletionMessage(opts.cwd, opts.dryRun));
}

function runRulesPath(opts: CliOpts = {}) {
  runGlobalAgentInstructionSync(Boolean(opts.dryRun), pkgRoot, opts.homeDir);
  const rulesPath = makePath([pkgRoot, "core-rules", "AGENTS.md"]);
  const payload = { path: rulesPath, exists: existsSync(rulesPath) };
  if (opts.json) {
    console.log(JSON.stringify(payload));
  } else {
    console.log(rulesPath);
  }
  if (!payload.exists) {
    throw new Error(`core rules not found: ${rulesPath}`);
  }
}

function runRulesShow(opts: CliOpts = {}) {
  const locale = resolveDocsLanguage(opts.docsLanguage || "auto");
  const msg = locale === "ko" ? "📦 📜 규칙 확인 중..." : "📦 📜 Checking rules...";
  console.error(msg);

  runGlobalAgentInstructionSync(Boolean(opts.dryRun), pkgRoot, opts.homeDir);
  const rulesPath = makePath([pkgRoot, "core-rules", "AGENTS.md"]);
  if (!existsSync(rulesPath)) {
    throw new Error(`core rules not found: ${rulesPath}`);
  }
  const rawContent = readFileSync(rulesPath, "utf8");
  const isWslEnv = !!(process.env.WSLENV || process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
  const content = process.platform === "win32" && !isWslEnv
    ? rawContent.replace(
        /```bash\n[\s\S]*?```/,
        "```powershell\n$planBody = @'\n## Scope & Approval\n범위: <어떤 파일/함수까지>\n요구사항: <사용자가 원하는 결과>\n접근법: <구체적 방법>\n## Plan\n1. <실행 단계>\n## Analysis\n원인: <근본 원인>\n- <file:line — 관찰 증거>\n가설: 1. <가설>\n## Direction\n<개선 방향>\n'@\ndeuk-agent-flow ticket create `\n  --title \"<short-title>\" `\n  --summary \"<one-line summary>\" `\n  --plan-body $planBody --non-interactive\n```"
      )
    : rawContent;
  const sectionContent = opts.section ? extractMarkdownHeadingSection(content, opts.section) : content;
  if (opts.section && !sectionContent) {
    throw new Error(`core rules section not found: ${opts.section}`);
  }
  if (opts.json) {
    console.log(JSON.stringify({ path: rulesPath, section: opts.section || null, content: sectionContent }, null, 2));
    return;
  }
  console.log(sectionContent.trimEnd());

  // #643: --workspace flag를 우선 처리 — opts.cwd를 대상 워크스페이스 경로로 교체
  // #871-followup: also resolve via the session cookie when no --workspace is given.
  // The cookie is a home-level file keyed by sessionId (cwd-independent) recording
  // the last-used workspace absolute path. Without this, a plain
  // `deuk-agent-flow rules --session-id <s>` fell through to process.cwd() and showed
  // the cwd workspace's active ticket instead of the session's last-used one — the
  // root cause of "rules keeps pointing at a different workspace's ticket".
  // #652: the workspace is resolved ONLY from --workspace + the session cookie
  // (both registry-backed). It is NEVER inferred from cwd. effectiveCwd starts EMPTY
  // and is filled solely by a successful registry resolution — if neither a
  // --workspace nor a session cookie resolves, effectiveCwd stays "" and the block
  // below routes the agent to pick a workspace from the registry instead of letting
  // a bare cwd masquerade as a managed workspace.
  let effectiveCwd = "";
  let effectiveWorkspaceName = opts.workspace || "";
  // #673: always attempt cookie-based workspace resolution — resolveSessionId() auto-detects
  // the agent session UUID from env vars, so --session-id is no longer required.
  if (!opts.section) {
    try {
      // startDir arg is ignored by loadWorkspaceCandidates (#645 registry-only).
      const candidates = loadWorkspaceCandidates("", { platform: "any", homeDir: opts.homeDir });
      const resolution = resolveWorkspaceTarget("", opts.workspace, { candidates, sessionId: resolveSessionId(opts.sessionId), homeDir: opts.homeDir });
      if (resolution?.target) {
        effectiveCwd = resolution.target.path;
        effectiveWorkspaceName = resolution.target.id || opts.workspace;
      }
    } catch { /* workspace not resolved → effectiveCwd stays "" (no cwd fallback) */ }
  }

  // Auto-compose ticket rules when a managed workspace is detected
  if (!opts.section && !hasManagedAgentWorkspace(effectiveCwd)) {
    // #633: cwd is not a managed workspace, but DON'T ignore the registry. If
    // workspaces are registered, tell the agent to pick one with --workspace
    // instead of declaring "no workspace, work freely" from cwd alone.
    let registered = [];
    try {
      const candidates = loadWorkspaceCandidates("", { platform: "any", homeDir: opts.homeDir });
      registered = (candidates?.workspaces || []).map(w => w.id).filter(Boolean).sort();
    } catch { /* registry unreadable */ }
    if (registered.length > 0) {
      const list = registered.map(id => `  - ${id}`).join("\n");
      console.log(`\n## Next Action\nNo workspace selected. Workspace is resolved ONLY from the registry via --workspace ` +
        `or the session cookie (never from cwd). ${registered.length} workspace(s) registered — pick one:\n${list}\n\n` +
        `\`\`\`bash\ndeuk-agent-flow rules ticket --workspace ${registered[0]}\n\`\`\``);
    } else {
      console.log("\n## Next Action\nNo managed workspace detected and none registered. Work freely without a ticket.");
    }
    return;
  }
  if (!opts.section && hasManagedAgentWorkspace(effectiveCwd)) {
    // #652: effectiveCwd is already the registry-resolved workspace root — use it
    // directly, no findWorkspaceRoot ancestor walk (that was a cwd-inference path).
    const ticketOpts = { ...opts, cwd: effectiveCwd, workspace: effectiveWorkspaceName, ruleSurface: "ticket" };
    const ticketRules = buildTicketRulesGuide(ticketOpts);
    if (ticketRules && ticketRules.trim()) {
      console.log("\n" + ticketRules.trimEnd());
    }
  }
}

function extractMarkdownHeadingSection(content = "", heading = "") {
  const normalizeHeading = value => String(value || "")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/^\d+[\).\s-]+/, "")
    .toLowerCase();
  const target = normalizeHeading(heading);
  if (!target) return "";
  const lines = String(content || "").split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match) continue;
    const title = normalizeHeading(match[2]);
    if (title === target) {
      start = index;
      level = match[1].length;
      break;
    }
  }
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    const match = lines[index].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function readCoreRulesSection(heading) {
  const rulesPath = makePath([pkgRoot, "core-rules", "AGENTS.md"]);
  if (!existsSync(rulesPath)) return "";
  return extractMarkdownHeadingSection(readFileSync(rulesPath, "utf8"), heading);
}

function readCliSurfaceDocument(name) {
  const surfacePath = makePath(pkgRoot, "docs", "cli-surfaces", `${name}.md`);
  if (!existsSync(surfacePath)) {
    throw new Error(`CLI surface document not found: ${surfacePath}`);
  }
  return readFileSync(surfacePath, "utf8");
}

function renderCliSurfaceDocument(name, replacements = {}) {
  let content = readCliSurfaceDocument(name);
  content = content.replace(/\{\{CORE:([^}]+)\}\}/g, (_match, heading) => readCoreRulesSection(String(heading || "").trim()).trimEnd());
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, String(value ?? ""));
  }
  return content.trimEnd();
}

function printAugmentedHelp(surface = "root") {
  console.log(renderCliSurfaceDocument("root", { SURFACE: surface }));
}

function printTicketGuide(action = "", opts: CliOpts = {}) {
  if (action === "create") {
    console.log(buildTicketCreateGuide(opts));
    return;
  }

  // #648: `ticket --help` / `-h` / unknown subcommand must print plain usage —
  // NOT the rules gate (which injects project-memory + Next Action). The rules
  // surface stays reachable only via `deuk-agent-flow rules`.
  if (opts.help || !action) {
    console.log(buildTicketUsageGuide());
    return;
  }

  console.log(buildTicketRulesGuide({ ...opts, ruleSurface: "ticket" }));
}

function buildTicketUsageGuide() {
  return [
    "deuk-agent-flow ticket — manage workflow tickets",
    "",
    "Usage:",
    "  deuk-agent-flow ticket <command> --workspace <name> [options]",
    "",
    "Commands:",
    "  create    Create a ticket (requires --title, --summary, --plan-body)",
    "  use       Set a ticket as the active ticket (--id)",
    "  move      Advance/rollback phase (--id, --phase <n> | --to <state>, --approval)",
    "  status    Show ticket status / active ticket link",
    "  close     Close a ticket (--id, --status closed)",
    "  discard   Discard a ticket without approval (--id)",
    "  list      List tickets in the workspace",
    "",
    "Common options:",
    "  --workspace <name>   Target workspace (registry-backed; required)",
    "  --id <ticket-id>     Ticket id to act on",
    "  --phase <n>          Phase number for `move`",
    "  --to <state>         Target state for `move` (e.g. end)",
    "  --approval approved  Confirm approval for a gated phase move",
    "  --non-interactive    No prompts (for scripted/agent use)",
    "  -h, --help           Show this help",
    "",
    "For the full rules gate (project rules, memory, next action), run:",
    "  deuk-agent-flow rules"
  ].join("\n");
}

main().catch(async err => {
  console.error(err.message || err);
  process.exit(1);
});

