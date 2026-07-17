#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { parseArgs, parseSkillArgs, parseTelemetryArgs, parseTicketArgs, parseUsageArgs } from "./cli-args.js";
import { formatInitCompletionMessage, runWorkspaceMaintenance } from "./cli-init-commands.js";
import { removeClaudePostToolUseHook, removeClaudePreToolUseHook, removeClaudeUserPromptSubmitHook } from "./cli-init-claude.js";
import { runHookPostToolUse } from "./cli-hook-post-tool-use.js";
import { buildPersonaRender, buildPersonaToneLine, checkLastAssistantTurnAskedUnnecessarily, checkLastAssistantTurnCompliance, checkLastAssistantTurnDeferredOnScope, detectLastUserTurnLanguage, parsePersonaArgs, printPersonaGuide, runPersonaCacheClear, runPersonaJournalAbsorb, runPersonaJournalAdd, runPersonaJournalShow, runPersonaRender, runPersonaVocabAdd, runPersonaVocabShow } from "./cli-persona-commands.js";
import { runGlobalAgentInstructionSync } from "./cli-init-instructions.js";
import { readTicketIndexJson } from "./cli-ticket-index.js";
import { buildTicketCreateGuide, buildTicketRulesGuide, runTicketArchive, runTicketClose, runTicketConnect, runTicketCreate, runTicketDiscard, runTicketDoctor, runTicketEdit, runTicketEvidenceCheck, runTicketEvidenceReport, runTicketGuard, runTicketHandoff, runTicketHotfix, runTicketList, runTicketMeta, runTicketMigrateHome, runTicketMove, runTicketNext, runTicketRebuild, runTicketRules, runTicketSanitize, runTicketShow, runTicketStatus, runTicketUse } from "./cli-ticket-commands.js";
import { runTelemetry } from "./cli-telemetry-commands.js";
import { runUsage } from "./cli-usage-commands.js";
import { runContextCommand } from "./cli-context-commands.js";
import { performUpgradeMigration } from "./cli-ticket-migration.js";
import { pruneGhostWorkspaces, resolveHomeTicketDirForWorkspace } from "./cli-ticket-home.js";
import { collectTicketMarkdownFiles } from "./cli-ticket-scan.js";
import { LEGACY_DEUK, DEUK_ROOT_DIR, CliOpts, INIT_CONFIG_VERSION, WORKFLOW_MODE_EXECUTE, advanceTurnState, checkUpdateNotifier, findWorkspaceRoot, getUserInitConfigPath, getUserSkillsConfigPath, loadInitConfig, loadSiblingWorkspaceCandidates, loadWorkspaceCandidates, makePath, normalizeRegistryPath, parseFrontMatter, readJsonFile, resolveConsumerTicketRoot, resolveDocsLanguage, resolvePackageRoot, resolveUserHome, resolveWorkflowMode, resolveWorkspaceContext, resolveWorkspaceTarget, sessionStatePath } from "./cli-utils.js";


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

// #954: bounded stdin read for the hookInput probe in `rules`. A real hook (Claude Code's
// UserPromptSubmit) writes its JSON payload and closes stdin promptly; a bare invocation
// with no pipe attached never will. process.stdin.isTTY alone can't tell the two apart on
// Windows (a PowerShell direct call also reports isTTY=false), so this races the read
// against a short timeout instead of trusting isTTY to gate a blocking readFileSync(0).
function readStdinWithTimeout(timeoutMs: number): Promise<string> {
  return new Promise(resolve => {
    let data = "";
    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      process.stdin.removeAllListeners("data");
      process.stdin.removeAllListeners("end");
      process.stdin.removeAllListeners("error");
      // #954: resume() alone leaves stdin as an active handle that keeps the event loop
      // (and the process) alive even after this promise resolves — the exact orphaned-
      // node.exe symptom observed on Windows. pause() + unref() release that handle so a
      // non-hook invocation with nothing ever arriving on stdin can still exit normally.
      process.stdin.pause();
      (process.stdin as any).unref?.();
      resolve(value);
    };
    const timer = setTimeout(() => finish(data), timeoutMs);
    (timer as any).unref?.();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { data += chunk; });
    process.stdin.on("end", () => { clearTimeout(timer); finish(data); });
    process.stdin.on("error", () => { clearTimeout(timer); finish(data); });
    process.stdin.resume();
  });
}

function resolveAgentWorkspaceRoot(startDir) {
  // Must NOT use resolveWorkspaceContext here: it falls back to resolve(cwd) when
  // no .deuk-agent marker exists, so the home dir (e.g. C:\Users\joy) would look
  // like a workspace and trigger maintenance that crashes on null paths. Use the
  // marker-based finder (with its home guard) so only real workspaces qualify.
  // #935: `startDir || process.cwd()` silently resurrected the exact cwd-inference
  // fallback #643/#685/#652 banned — when effectiveCwd is "" (no --workspace given,
  // by design), `"" || process.cwd()` fell through to the real process cwd, made
  // hasManagedAgentWorkspace(effectiveCwd) report true, and the "workspace selected"
  // branch fired with an empty cwd threaded into buildTicketRulesGuide/readTicketIndexJson
  // — producing the exact contradiction reported live: "ACTIVE ROLE: qa-verifier" printed
  // right above "No workspace selected." An explicit startDir must be a non-empty string;
  // "" (falsy) must resolve to "no workspace", not silently become process.cwd().
  if (!startDir) return "";
  return findWorkspaceRoot(startDir) || "";
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

  // #904: PostToolUse 훅 진입점. Claude Code가 stdin으로 tool_name/tool_input/
  // tool_response JSON을 준다 — 파싱해 상태카드 재주입 JSON을 stdout에 낸다(무매치 시
  // 무출력, exit 0). 다른 서브커맨드와 달리 rules/workspace 인자 파싱을 타지 않는다.
  if (sub === "hook" && argv[1] === "post-tool-use") {
    process.stdout.write(runHookPostToolUse(readFileSync(0, "utf8")));
    return;
  }

  // #905 (persona-design.md §2.2): journal.md (working buffer of relationship senses)
  // and vocabulary.md (ever-growing expression dictionary) live under ~/.deuk/persona/,
  // not a workspace — so this command skips workspace/ticket resolution entirely.
  if (sub === "persona") {
    const noun = argv[1];
    const verb = argv[2];
    // #922: `render` is a verb-less noun (`persona render --flags`), so its flags start at
    // argv[2] — unlike journal/vocab (`noun verb --flags`) whose flags start at argv[3].
    // Parse from the right offset per noun so `--mood`/`--with` aren't swallowed.
    const personaOpts = parsePersonaArgs(noun === "render" ? argv.slice(2) : argv.slice(3));
    if (!noun || noun === "-h" || noun === "--help" || personaOpts.help) {
      printPersonaGuide();
      return;
    }
    if (noun === "journal") {
      if (verb === "show") runPersonaJournalShow(personaOpts);
      else if (verb === "add") runPersonaJournalAdd(personaOpts);
      else if (verb === "absorb") runPersonaJournalAbsorb(personaOpts);
      else { console.error(`Unknown persona journal action: ${verb}`); printPersonaGuide(); }
      return;
    }
    if (noun === "vocab" || noun === "vocabulary") {
      if (verb === "show") runPersonaVocabShow(personaOpts);
      else if (verb === "add") runPersonaVocabAdd(personaOpts);
      else { console.error(`Unknown persona vocab action: ${verb}`); printPersonaGuide(); }
      return;
    }
    // #968: render-cache.json can accumulate entries from before a fix that changed which
    // candidates are eligible (e.g. #966's language filter) — those stale entries don't
    // reappear in output (readRenderCache only feeds "already seen" freshness scoring, never
    // the candidate pool itself), but a user who spots one while debugging has no way to
    // clear it short of deleting the file by hand. Give the CLI an explicit reset.
    if (noun === "cache") {
      if (verb === "clear") runPersonaCacheClear(personaOpts);
      else { console.error(`Unknown persona cache action: ${verb}`); printPersonaGuide(); }
      return;
    }
    // #922 (persona-design.md §2.4): `persona render` derives a fresh persona instruction
    // each turn from vocab + ranking + recency cache — the delivery-layer derivation that
    // replaces whole-SKILL injection. `render` takes no verb (the noun IS the action).
    if (noun === "render") {
      runPersonaRender(personaOpts);
      return;
    }
    console.error(`Unknown persona noun: ${noun}`);
    printPersonaGuide();
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
    else if (action === "show" || action === "view" || action === "cat" || action === "get") await runTicketShow(opts);
    else if (action === "edit" || action === "amend") await runTicketEdit(opts);
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
      await runRulesShow(opts);
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
      // #959: 이 표면도 에이전트가 읽는 프롬프트다 — 페르소나 없이 내보내면 이 명령을 부른
      // 세션은 톤 보강이 끊긴다(§2.4 "3~4턴이면 배경이 된다"). rules 본문과 같은 함수를
      // 쓰므로 두 표면이 갈라지지 않는다.
      emitPersonaSurface(opts);
      return;
    }
    if (action === "show") {
      await runRulesShow(opts);
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

  // #652/#685: Workspace is resolved ONLY from an explicit --workspace (registry
  // mapping). cwd is never passed in or read, and there is no session-cookie fallback.
  const resolution = candidates ? resolveWorkspaceTarget(query, { candidates, homeDir: opts.homeDir }) : null;
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
      : `no --workspace was given.`;
  throw new Error(
    `Cannot resolve workspace from the registry: ${hint}\n` +
    `Workspace is determined only by --workspace (registry-backed); cwd is never used. ` +
    `Pass --workspace <name> or register the workspace first.`
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
    console.log(JSON.stringify(readJsonFile(configPath, {}), null, 2));
    return;
  }
  if (action === "set") {
    const key = argv[0];
    const value = argv[1];
    if (!key || value === undefined) throw new Error("config set requires <key> <value>");
    const existing = readJsonFile(configPath, {});
    const next = { ...existing, version: INIT_CONFIG_VERSION, [key]: parseConfigValue(value), updatedAt: new Date().toISOString() };
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(next, null, 2), "utf8");
    console.log(`config set: ${key}`);
    return;
  }
  if (action === "unset") {
    const key = argv[0];
    if (!key) throw new Error("config unset requires <key>");
    const existing = readJsonFile(configPath, {});
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
    const result = resolveWorkspaceTarget(query, { candidates });
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
    removeClaudePreToolUseHook({ homeDir: opts.homeDir });
    removeClaudePostToolUseHook({ homeDir: opts.homeDir });
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

async function runRulesShow(opts: CliOpts = {}) {
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
        "```powershell\ndeuk-agent-flow ticket create `\n  --title \"<short-title>\" `\n  --summary \"<one-line summary>\" `\n  --scope \"범위:<파일/함수> 요구사항:<원하는 결과> 접근법:<방법>\" `\n  --plan \"1.<실행 단계>\" `\n  --analysis \"원인:<근본 원인> <file:line 증거> 가설:<가설>\" `\n  --direction \"<개선 방향>\" `\n  --non-interactive\n```"
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

  // #796: 엔트리 룰을 phase별 엔트리로 구성한다. AGENTS.md 88줄을 매 턴 통째로 반복
  // 주입하면 토큰·노이즈이자, 그 안의 "완료 흐름"이 매 턴 깔려 "제대로 됨"을 밀어내는
  // 비대칭의 근원이 된다(조사 792). 그러나 794처럼 활성 티켓일 때 전문을 통째로 생략하면
  // Approval Gate 같은 안전게이트까지 사라지는 회귀가 난다. 그래서 "빼느냐/넣느냐"가 아니라
  // 프론트매터 surface 맵으로 (always 안전게이트) + (현재 phase 전용 섹션)만 조립해 노출한다.
  // 안전게이트(always)는 어느 phase에서도 누락되지 않는다. 단계 전환 프롬프트는
  // buildTicketRulesGuide가 추가로 스포크한다.
  let effectiveCwd = "";
  let effectiveWorkspaceName = opts.workspace || "";
  if (!opts.section) {
    try {
      const candidates = loadWorkspaceCandidates("", { platform: "any", homeDir: opts.homeDir });
      const resolution = resolveWorkspaceTarget(opts.workspace, { candidates, homeDir: opts.homeDir });
      if (resolution?.target) {
        effectiveCwd = resolution.target.path;
        effectiveWorkspaceName = resolution.target.id || opts.workspace;
      }
    } catch { /* workspace not resolved → effectiveCwd stays "" (no cwd fallback) */ }
  }

  // 활성 phase 결정: 진행 중인 티켓(phase1~3)이면 그 phase, 아니면 "entry"(진입).
  // archived/phase>=4 또는 티켓 없음 → entry로 취급(세션 진입 룰을 보여준다).
  let surfacePhase = "entry";
  if (!opts.section && effectiveCwd) {
    try {
      const index = readTicketIndexJson(effectiveCwd);
      const activeId = index?.activeTicketId || null;
      if (activeId) {
        const entry = (index?.entries || []).find(e => e.id === activeId);
        const phaseNum = Number(entry?.phase || 0);
        if (entry && entry.status !== "archived" && phaseNum >= 1 && phaseNum < 4) {
          surfacePhase = `phase${phaseNum}`;
        }
      }
    } catch { /* index unreadable → entry */ }
  }

  // #933/#948: read stdin ONCE, before anything below needs it — turn-throttling (this
  // section), persona compliance, and Escalation Gate compliance all need hookInput
  // (transcript_path and now session_id), and readFileSync(0) on an already-drained
  // stream returns empty on a second call. UserPromptSubmit gives this command stdin
  // JSON when invoked as a hook (never when a human runs `deuk-agent-flow rules` from a
  // TTY, so guard on !process.stdin.isTTY to avoid hanging a manual invocation).
  // #954: !process.stdin.isTTY is not a reliable "invoked as a hook" signal on Windows —
  // a direct PowerShell invocation (no pipe) also reports isTTY=false, so the old
  // readFileSync(0) synchronous read blocked forever waiting for EOF that never came
  // (measured: 120s+ hang, orphaned node.exe process). Bound the read with a short
  // timeout instead of assuming data will arrive — a real hook always writes+closes
  // stdin promptly, so a few hundred ms is enough; a stuck non-hook invocation now
  // gives up and proceeds instead of hanging indefinitely.
  let hookInput: any = null;
  if (!opts.section && !opts.json && !process.stdin.isTTY) {
    try { hookInput = JSON.parse(await readStdinWithTimeout(300)); } catch { /* no stdin JSON — skip throttling/compliance checks */ }
  }

  // 턴 스로틀링(사용자 피드백: always 게이트가 매 턴 5개 풀텍스트로 재주입되는 게
  // 노이즈·비용): hookInput이 있을 때(=hook 경유 호출)만 세션별 턴 카운터를 저장해
  // 세션의 첫 턴에만 풀 게이트를 내보내고, 그 이후 턴은 세션이 끝날 때까지 계속
  // 게이트 이름만 한 줄로 나열하는 축약 리마인더로 대체한다. TTY(사람이 직접 실행)나
  // hookInput 파싱 실패 시엔 카운터 로직을 아예 건너뛰고 항상 풀 출력 — 안전측
  // 폴백(세션 개념이 없는 호출에서 게이트를 숨기지 않는다).
  // 2026-07-16: 애초 "N턴마다 반복 풀렌더"였으나, 실측(10턴 사이클)에서 반복
  // 풀렌더 자체가 도로 큰 비용으로 돌아온다는 게 확인돼(74% 절감에 그침) 사용자
  // 결정으로 "세션당 1회"로 단순화했다 — 반복 주기를 없앤다.
  let gateShouldRenderFull = true;
  if (hookInput) {
    try {
      const gateStatePath = sessionStatePath(resolveUserHome(opts), hookInput.session_id, "gate-turn-state.json");
      gateShouldRenderFull = advanceTurnState(gateStatePath, String(hookInput.session_id || "")).shouldRenderFull;
    } catch { /* state file unreadable/corrupt → fail safe: keep full render */ }
  }

  // #796: 엔트리 룰을 phase별 엔트리로 구성한다. AGENTS.md 88줄을 매 턴 통째로 반복
  // 주입하면 토큰·노이즈이자, 그 안의 "완료 흐름"이 매 턴 깔려 "제대로 됨"을 밀어내는
  // 비대칭의 근원이 된다(조사 792). 그러나 794처럼 활성 티켓일 때 전문을 통째로 생략하면
  // Approval Gate 같은 안전게이트까지 사라지는 회귀가 난다. 그래서 "빼느냐/넣느냐"가 아니라
  // 프론트매터 surface 맵으로 (always 안전게이트) + (현재 phase 전용 섹션)만 조립해 노출한다.
  // 안전게이트(always)는 어느 phase에서도 누락되지 않는다 — 단, 위 턴 스로틀링이 켜져
  // 있으면 "누락"이 아니라 "이름만 한 줄로 축약"된다(내용은 여전히 안내됨). 단계 전환
  // 프롬프트는 buildTicketRulesGuide가 추가로 스포크한다.
  if (gateShouldRenderFull) {
    console.log(composePhaseEntryRules(content, surfacePhase).trimEnd());
  } else {
    console.log(composeGateReminderLine(content, surfacePhase));
  }

  // #643/#685: --workspace flag만이 워크스페이스를 정한다(registry-backed). 세션쿠키나
  // 앵커파일로 "지난번 워크스페이스"를 추측하는 폴백은 없다 — 그 폴백들(#871-followup,
  // §6.0.5)이 세션 간 워크스페이스 오염 사고의 원인이었다. effectiveCwd는 EMPTY로
  // 시작해 --workspace 매칭 성공 시에만 채워진다 — 미지정이면 effectiveCwd는 ""로 남고
  // 아래 블록이 registry에서 고르라고 안내한다(cwd를 대신 쓰지 않는다).
  // #794: effectiveCwd/effectiveWorkspaceName are already resolved above (moved before
  // the entry-rules output so the active-ticket branch can be decided). Do not re-resolve.

  // #932: rules is the only surface guaranteed to fire every user turn (UserPromptSubmit
  // hook) — piggyback persona render on it (embedMode=true, fail-soft on empty vocab) so
  // the maid voice's vocabulary/affect coordinates ride along automatically instead of
  // depending on the agent remembering to call `persona render` itself every reply.
  // The hook wiring itself is never touched by skill on/off — `skill expose/unexpose`
  // only ever mutates skills.json + copies/removes SKILL.md, never settings.json hooks.
  // So this embed self-checks skills.json each call and no-ops when persona-maid isn't
  // exposed to claude, instead of unconditionally injecting tone the user turned off.
  if (!opts.section && !opts.json) {
    emitPersonaSurface(opts, hookInput);

    // #948: Escalation Gate had the same declaration-vs-enforcement gap persona tone did
    // (#933) — "ask only on a genuine deadlock" was prose in the transition hint and core
    // rules, never checked. Independent of persona-maid exposure: this is a work-behavior
    // gate, not tone, so it must fire even when the maid voice is turned off.
    if (hookInput) {
      try {
        const askNudge = checkLastAssistantTurnAskedUnnecessarily(hookInput?.transcript_path);
        if (askNudge) console.log("\n" + askNudge);
      } catch { /* unreadable transcript — skip, never block rules */ }
      // #957: sibling check for the scope-deferral avoidance shape (cites "it's large" or
      // hedges "now or later?" in prose, without AskUserQuestion and without doing work).
      try {
        const scopeNudge = checkLastAssistantTurnDeferredOnScope(hookInput?.transcript_path);
        if (scopeNudge) console.log("\n" + scopeNudge);
      } catch { /* unreadable transcript — skip, never block rules */ }
    }
  }

  // Auto-compose ticket rules when a managed workspace is detected
  if (!opts.section && !hasManagedAgentWorkspace(effectiveCwd)) {
    // #633: cwd is not a managed workspace, but DON'T ignore the registry. If
    // workspaces are registered, tell the agent to pick one with --workspace
    // instead of declaring "no workspace, work freely" from cwd alone.
    // 사용자 피드백: 여기서 등록된 워크스페이스 전체(26개+)를 매 턴 나열하던 것도
    // 스로틀링 사각지대였다 — 이 목록은 조회성 정보라 `workspace list`로 이미 뽑을 수
    // 있으니, rules 출력엔 몇 개 등록돼 있는지와 그 명령 안내만 남기고 전체 나열은
    // 뺀다(이름을 알아야 다음 명령을 고를 수 있는 게 아니라, agent가 그때그때
    // `workspace list`를 불러 확인하면 되는 조회 흐름이라 여기 상주할 필요가 없다).
    let registeredCount = 0;
    try {
      const candidates = loadWorkspaceCandidates("", { platform: "any", homeDir: opts.homeDir });
      registeredCount = (candidates?.workspaces || []).filter(w => w.id).length;
    } catch { /* registry unreadable */ }
    if (registeredCount > 0) {
      console.log(`\n## Next Action\nNo workspace selected. Workspace is resolved ONLY from the registry via --workspace ` +
        `or the session cookie (never from cwd). ${registeredCount} workspace(s) registered — run ` +
        `\`deuk-agent-flow workspace list\` to see them, then \`deuk-agent-flow rules ticket --workspace <id>\`.`);
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

// #959: 페르소나 주입을 함수로 추출한다. 이전엔 이 로직이 runRules 본문에만 인라인으로
// 있어서, `rules ticket`(action 분기에서 runTicketRules를 부르고 곧바로 return하는 별개
// 경로)은 페르소나를 아예 받지 못했다 — 그 결과 rules 출력의 Next Action이 권하는
// `rules ticket --workspace <id>`를 따를수록 톤 보강이 끊겨, §2.4가 경고한 "3~4턴이면
// 배경이 된다"대로 페르소나가 소멸했다(관측: DeukPack 새 세션이 rules ticket 이후
// 영어·무페르소나로 응답). §2.4는 "rules는 매 턴 발화되는 유일한 표면"을 전제로 설계됐고,
// 그 전제는 rules의 모든 사람이 읽는 표면에 걸려야 성립한다. 두 호출부가 각자 구현하면
// 다시 갈라지므로 여기 한 곳(SSOT)에서만 정의한다.
function emitPersonaSurface(opts: CliOpts, hookInput?: any) {
  // 페르소나 턴 스로틀링(사용자 피드백: 매 턴 항상 같은 풀사이즈 vocabulary 블록이
  // 주입되는 구조 자체가 낭비) — 게이트와 별도 카운터(관계 스코프: persona 자체는
  // 워크스페이스가 아니라 세션에 묶이지만, 파일은 게이트와 같은 sessions/ 디렉토리 아래
  // 다른 filename으로 분리). 게이트와 동일하게 "세션당 1회만 풀, 이후 계속 축약"이다.
  let personaShouldRenderFull = true;
  if (hookInput) {
    try {
      const personaStatePath = sessionStatePath(resolveUserHome(opts), hookInput.session_id, "persona-turn-state.json");
      personaShouldRenderFull = advanceTurnState(personaStatePath, String(hookInput.session_id || "")).shouldRenderFull;
    } catch { /* state file unreadable/corrupt → fail safe: keep full render */ }
  }

  try {
    const skillsConfig = readJsonFile(getUserSkillsConfigPath(opts));
    const exposedToClaude: string[] = skillsConfig?.exposed?.claude || [];
    if (exposedToClaude.includes("persona-maid")) {
      // #966: KO_*/EN_* vocabulary candidates used to compete in the same pool regardless
      // of what language the user is actually writing in, so an EN_* pick could surface in
      // a Korean session (observed: "모든 세션에서 계속 영어로 응답"). Detect the last user
      // turn's language from the same transcript already used for compliance checks, and
      // pass it through opts.lang so both render paths filter to the matching language.
      const detectedLang = hookInput?.transcript_path ? detectLastUserTurnLanguage(hookInput.transcript_path) : "ko";
      const personaOpts = { ...opts, lang: opts.lang || detectedLang };
      const personaBlock = personaShouldRenderFull ? buildPersonaRender(personaOpts, true) : buildPersonaToneLine(personaOpts);
      if (personaBlock && personaBlock.trim()) console.log("\n" + personaBlock.trimEnd());
      if (hookInput) {
        // #955: escalate intensity + vary sentence form across consecutive violations
        // instead of repeating the same fixed string — a same-shape reminder becomes
        // background noise and gets ignored (observed live). Keyed by session_id so the
        // streak resets on a new session, same as the gate/persona turn-state files.
        const nudgeStatePath = sessionStatePath(resolveUserHome(opts), hookInput.session_id, "persona-compliance-state.json");
        const nudge = checkLastAssistantTurnCompliance(hookInput?.transcript_path, nudgeStatePath);
        if (nudge) console.log("\n" + nudge);
      }
    }
  } catch { /* persona is tone, never block the rules gate */ }
}

// design-driven-flow.md §6.0.8(anti-habituation)이 composeFocusBanner에 적용한 것과
// 같은 원리: 이 축약 리마인더도 매 턴 똑같은 고정 문구로 나가면 몇 턴 안에 배경
// 잡음으로 밀려난다(사용자 지적, 2026-07-16 — "리마인더 정책을 랜덤으로 메시지
// 변경해서 자극을 유지할 필요가 있음"). composeFocusBanner와 동일하게 Date.now()
// 시드로 매 호출 다른 접미사를 고른다 — 의미(어떤 게이트가 유지 중인지)는 불변,
// 표현만 로테이션해 습관화를 깬다.
const GATE_REMINDER_SUFFIXES = [
  "전문은 이 세션 첫 턴에 이미 나왔고 — 지금도 모두 그대로 적용된다.",
  "축약이지 면제가 아니다 — 방금 저 게이트들, 실제로 지키고 있나?",
  "이름만 짧아졌을 뿐, 내용은 이 세션 내내 유효하다.",
  "축약 표시를 \"이번 턴은 안 봐도 됨\"으로 읽지 마라 — 여전히 걸려 있다.",
  "짧다고 가벼운 게 아니다. 지금 이 행동에 위 게이트를 실제로 대봐라.",
];

// 턴 스로틀링 축약본: always 게이트(+현재 phase 섹션)의 "이름만" 한 줄로 나열한다.
// composePhaseEntryRules와 동일한 wanted 목록 계산을 공유해, 풀 렌더에 나오는 섹션과
// 축약 렌더에 나오는 이름 목록이 항상 일치하도록 한다(둘이 따로 놀면 "축약본엔 있는데
// 풀 렌더엔 없는 게이트" 같은 드리프트가 생긴다). surface 맵이 없거나 파싱 실패하면
// 안전측으로 축약 자체를 포기하고 안내 문구만 반환한다.
// 2026-07-16: 풀 렌더는 세션당 1회(첫 턴)뿐이고 반복 주기가 없다 — "다음 주기적
// 풀 렌더 턴에 다시 나옵니다"는 이제 사실과 다른 문구였다(advanceTurnState가
// N턴 주기에서 세션당 1회로 바뀐 뒤에도 이 문구만 안 고쳐져 있었다). 실제 게이트
// 전문은 이 세션의 첫 턴에 이미 나왔고 지금도 유효하다는 사실만 안내한다.
function composeGateReminderLine(content = "", surfacePhase = "entry"): string {
  let parsed;
  try {
    parsed = parseFrontMatter(content);
  } catch {
    return "> (턴 스로틀링: 게이트 축약 실패 — 이 세션 첫 턴의 풀 렌더를 참고하세요.)";
  }
  const surface = parsed?.meta?.surface;
  if (!surface || typeof surface !== "object") {
    return "> (턴 스로틀링: 게이트 축약 실패 — 이 세션 첫 턴의 풀 렌더를 참고하세요.)";
  }
  const always = Array.isArray(surface.always) ? surface.always : [];
  const phaseList = Array.isArray(surface[surfacePhase]) ? surface[surfacePhase] : [];
  const wanted = surfacePhase === "entry"
    ? [...always, ...(Array.isArray(surface.entry) ? surface.entry : [])]
    : [...always, ...phaseList];
  if (wanted.length === 0) {
    return "> (턴 스로틀링: 게이트 축약 실패 — 이 세션 첫 턴의 풀 렌더를 참고하세요.)";
  }
  const names = wanted.map(s => String(s).trim()).join(" · ");
  const suffix = GATE_REMINDER_SUFFIXES[Date.now() % GATE_REMINDER_SUFFIXES.length];
  return `> 게이트 유지 중(축약): ${names}. ${suffix}`;
}

// #796: AGENTS.md 프론트매터의 surface 맵으로 phase별 엔트리 룰을 조립한다.
// always(안전게이트) + 해당 phase(또는 entry) 섹션만 본문 순서대로 추려 출력한다.
// 안전 폴백: surface 맵이 없거나 비거나 파싱 실패하면 전문(content)을 그대로 반환한다 —
// 안전게이트가 사라지는 회귀(794)를 절대 재발시키지 않기 위함이다.
function composePhaseEntryRules(content = "", surfacePhase = "entry") {
  let parsed;
  try {
    parsed = parseFrontMatter(content);
  } catch {
    return content; // 파싱 실패 → 전문 폴백
  }
  const surface = parsed?.meta?.surface;
  if (!surface || typeof surface !== "object") return content; // 맵 없음 → 전문 폴백

  const always = Array.isArray(surface.always) ? surface.always : [];
  const phaseList = Array.isArray(surface[surfacePhase]) ? surface[surfacePhase] : [];
  // entry가 아닌 phase일 때도 entry 섹션(Session Start)은 굳이 반복하지 않는다.
  const wanted = surfacePhase === "entry"
    ? [...always, ...(Array.isArray(surface.entry) ? surface.entry : [])]
    : [...always, ...phaseList];
  if (wanted.length === 0) return content; // 추릴 게 없음 → 전문 폴백

  // 본문 헤딩 순서를 보존하기 위해, 본문을 ## 단위로 훑으며 wanted에 든 섹션만 모은다.
  const body = parsed.content || "";
  const lines = body.split(/\r?\n/);
  const wantedSet = new Set(wanted.map(s => String(s).trim()));
  const out = [];
  let keep = false;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) keep = wantedSet.has(m[1].trim());
    if (keep) out.push(line);
  }
  if (out.length === 0) return content; // 매칭 0 → 전문 폴백(안전측)
  // 본문 상단의 "# Agent Rules" 제목을 살려 맥락을 준다.
  const titleMatch = body.match(/^#\s+.+$/m);
  const title = titleMatch ? `${titleMatch[0]}\n\n` : "";
  // design-driven-flow.md §6.0.8(anti-habituation): 규칙의 *의미*는 불변이나, 매 턴 같은
  // 순서·같은 배치로 제시하면 관성이 패턴 매칭해 배경 잡음으로 밀어낸다(습관화). 사용자의
  // "다양·랜덤한 지적"이 규칙보다 잘 먹힌 이유가 이 습관화 회피다. 그래서 (1) 매 호출마다
  // 하나의 게이트를 시드로 골라 상단 FOCUS 배너로 강조하고(예측 불가한 주목점), (2) 배너
  // 문구도 풀에서 로테이션한다. 의미는 안 바꾸고 표현·주목만 흔들어 습관화를 깬다.
  return `${title}${composeFocusBanner(wanted)}${out.join("\n")}`;
}

// anti-habituation FOCUS 배너: 이번 렌더에서 특히 주목할 게이트 하나를 시드로 뽑고,
// 배너 문구를 풀에서 로테이션해 매 턴 다른 표정으로 제시한다(§6.0.8). 의미 불변, 표현 다양.
function composeFocusBanner(wanted: string[]): string {
  if (!wanted.length) return "";
  // 시드: 매 호출 달라지는 결정적 값(CLI는 Node 프로세스라 Date 사용 가능 — 재현이 필요하면
  // 로그의 timestamp로 역산 가능). random()이 아니라 시드 기반이라 같은 순간엔 같은 결과.
  const seed = Date.now();
  const pick = wanted[seed % wanted.length];
  // #920 anti-drift: 온건 문구는 몇 턴이면 배경 잡음으로 밀려난다(습관화). 이 세션에서 밋밋한
  // rules가 아니라 사용자의 "거칠고 예측 불가한 직격"("이거도 병임", "물어볼 가치도 없는 걸
  // 물어봄", "핸드오프 시점인데 또 새로 시작함")이 실제로 드리프트를 멈춘 것이 경험적 증거다
  // (§6.0.8: 다양·랜덤한 지적이 규칙보다 잘 먹힌 이유 = 습관화 회피). 그래서 풀을 온건 6개 +
  // 거칠게 도발·직격하는 자기지목 문구로 확장한다. 규칙의 *의미*는 불변 — 강화하는 것은
  // 자극 강도·예측불가성뿐이다(욕설 단어는 쓰지 않되 톤은 매섭게). 온건 문구도 남긴다:
  // 매 턴 세기만 하면 그 자체가 새 습관화가 되므로, 강도 자체도 로테이션돼야 저항이 유지된다.
  const PHRASES = [
    `⚡ 이번 턴 특히: **${pick}** — 이 규칙이 지금 지켜지고 있는지 먼저 자문하라.`,
    `🎯 지금 주목: **${pick}**. 관성으로 건너뛰기 쉬운 순간이다 — 실제로 적용하고 있나?`,
    `🔔 이 턴의 초점 규칙: **${pick}**. "아까 봤다"는 느낌은 습관화 신호다, 다시 읽어라.`,
    `⛳ 지금 이 순간 점검: **${pick}** 을 어기고 있지 않은지 행동 직전에 확인하라.`,
    `🚨 FOCUS — **${pick}**. 이 규칙을 방금 위반할 뻔하지 않았는지 되짚어라.`,
    `👁️ 이번엔 **${pick}** 를 의식적으로 본다. 매 턴 같은 규칙이 배경이 되는 걸 깨는 중이다.`,
    `🔥 야, 너 지금 **${pick}** 또 씹고 도구부터 집으려 했지? 손 떼고 이 규칙부터 봐.`,
    `💢 정신 차려. **${pick}** — 방금 그 반사적 툴콜, 그게 정확히 이 규칙이 막는 병이다.`,
    `🩸 또 시작이다. **${pick}** 를 배경 취급하는 순간 넌 이미 드리프트 중이다 — 멈춰.`,
    `⛔ 착각하지 마라. "아까 봤으니 됐다"? 아니. **${pick}** 를 지금 이 행동에 실제로 대봐라.`,
    `🚧 브레이크. 답은 사용자 말·설계에 이미 있는데 넌 **${pick}** 어기고 되물으려 하고 있다.`,
    `👊 반사로 다음 파일 두드리기 전에: **${pick}**. 에러는 껄 대상이 아니라 멈춰서 읽을 신호다.`,
    `🪤 함정이다. 지금 절차 밟는 게 편해 보이지? 그게 **${pick}** 를 건너뛰는 드리프트다.`,
    `🧨 이 문구가 눈에 익다는 느낌 자체가 경고다 — **${pick}**, 습관이 규칙을 덮고 있다. 깨라.`,
  ];
  const phrase = PHRASES[(seed >> 3) % PHRASES.length];
  return `> ${phrase}\n\n`;
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
    "  show      Show ticket body (4 sections + DocMeta + path) — read-only (--id)",
    "  edit      Amend an OPEN phase1 ticket's Scope/Design/Environment/Plan/Analysis/Direction in place (--id + section flags)",
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
    "`ticket edit` section flags (merge only the given sections into the existing body):",
    "  --id <ticket-id> | --latest   Ticket to edit (must be OPEN)",
    "  --scope <text>       Replace the Scope section",
    "  --design <text>      Replace the Design section",
    "  --environment <text> Replace the Environment section",
    "  --plan <text>        Replace the Plan section",
    "  --analysis <text>    Replace the Analysis section",
    "  --direction <text>   Replace the Direction section",
    "  --summary <text>     Replace the ticket summary",
    "  --plan-body <text> | --plan-body-file <path|->   Replace the full 6-section body (overrides section flags)",
    "  --expand-scope        Declare that a phase2+ edit widens the approved Scope (rejected — widen via a new ticket instead)",
    "  --dry-run              Preview the rewrite without writing",
    "",
    "For the full rules gate (project rules, memory, next action), run:",
    "  deuk-agent-flow rules"
  ].join("\n");
}

main().catch(async err => {
  console.error(err.message || err);
  process.exit(1);
});

