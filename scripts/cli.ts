#!/usr/bin/env node
import { existsSync,mkdirSync,readdirSync,readFileSync,rmSync,writeFileSync } from "fs";
import { basename,dirname } from "path";
import { parseHeading,parseHeadingAtDepth,stripLeadingHashes,stripLeadingSectionNumber } from "./markdown-headings.js";
import { parseArgs,parseSkillArgs,parseTelemetryArgs,parseTicketArgs,parseUsageArgs } from "./cli-args.js";
import { runContextCommand } from "./cli-context-commands.js";
import { removeClaudeNormalizeEolHook,removeClaudePostToolUseHook,removeClaudePreToolUseHook,removeClaudeStopHook,removeClaudeToolGuardHook,removeClaudeUserPromptSubmitHook } from "./cli-init-claude.js";
import { formatInitCompletionMessage,runWorkspaceMaintenance } from "./cli-init-commands.js";
import { syncProjectRuleIdLines } from "./cli-init-instructions.js";
import { runTelemetry } from "./cli-telemetry-commands.js";
import { buildTicketCreateGuide,buildTicketRulesGuide,runTicketArchive,runTicketClose,runTicketConnect,runTicketCreate,runTicketDiscard,runTicketDoctor,runTicketEdit,runTicketEvidenceCheck,runTicketEvidenceReport,runTicketGuard,runTicketHandoff,runTicketHotfix,runTicketList,runTicketMeta,runTicketMigrateHome,runTicketMove,runTicketNext,runTicketRebuild,runTicketRules,runTicketSanitize,runTicketShow,runTicketStatus,runTicketUse } from "./cli-ticket-commands.js";
import { pruneGhostWorkspaces,readWorkspaceMeta,resolveHomeTicketDirForWorkspace } from "./cli-ticket-home.js";
import { readTicketIndexJson } from "./cli-ticket-index.js";
import { performUpgradeMigration } from "./cli-ticket-migration.js";
import { collectTicketMarkdownFiles } from "./cli-ticket-scan.js";
import { runUsage } from "./cli-usage-commands.js";
import { CliOpts,DEUK_ROOT_DIR,INIT_CONFIG_VERSION,LEGACY_DEUK,WORKFLOW_MODE_EXECUTE,findWorkspaceRoot,getUserInitConfigPath,loadInitConfig,loadWorkspaceCandidates,localized,makePath,parseFrontMatter,readJsonFile,resolveDocsLanguage,resolvePackageRoot,resolveUserHome,resolveWorkflowMode,resolveWorkspaceTarget,setSurfaceLocale } from "./cli-utils.js";

const CLI_TEXT = {
  approvalSurfaceRemoved: {
    ko: "ticket context 는 승인 표면에서 제거되었다. 다음을 쓰라: deuk-agent-flow ticket move --id <ticket-id> --phase 2 --approval approved --non-interactive",
    en: "ticket context has been removed from the approval surface. Use: deuk-agent-flow ticket move --id <ticket-id> --phase 2 --approval approved --non-interactive",
  },
  reportRemoved: {
    ko: "ticket report/reports 는 제거되었다(#727). report 는 낡은 cwd 산물이었다.",
    en: "ticket report/reports has been removed (#727). Reports were a legacy cwd artifact.",
  },
  migrationComplete: { ko: "마이그레이션 완료: 티켓 {count}개 이관됨.", en: "Migration complete: {count} tickets upgraded." },
  designUsage: {
    ko: "design: `design render --workspace <id>` 만 지원한다.",
    en: "design: only `design render --workspace <id>` is supported.",
  },
  ruleUsage: {
    ko: "rule: `rule add --rule <ID> --stage <stages> --directive <text> --workspace <id>` 만 지원한다.",
    en: "rule: only `rule add --rule <ID> --stage <stages> --directive <text> --workspace <id>` is supported.",
  },
  codingUsage: {
    ko: "coding: `coding step --stage <start|create|modify>` 만 지원한다.",
    en: "coding: only `coding step --stage <start|create|modify>` is supported.",
  },
  savedConfig: {
    ko: "저장된 {scope} 설정을 {path} 에서 사용한다 (CLI 옵션이 우선 적용됨)",
    en: "Using saved {scope} config from {path} (CLI overrides applied)",
  },
  noGhosts: { ko: "홈 저장소에 빈 워크스페이스 폴더가 없다.", en: "No ghost (empty) workspace folders found in the home store." },
  ghostCount: { ko: "빈(.md 없음) 워크스페이스 폴더: {count}개", en: "Ghost (empty, no .md) workspace folders: {count}" },
  ghostRemoved: {
    ko: "완료: 폴더 {folders}개 삭제, 레지스트리 항목 {entries}개 제거.",
    en: "Done: removed {folders} folder(s), dropped {entries} registry entr(y/ies).",
  },
  ghostRerun: {
    ko: "위 폴더와 죽은 레지스트리 항목을 삭제하려면 --apply 로 다시 실행하라.",
    en: "Re-run with --apply to delete these folders and their dead registry entries.",
  },
  ambiguousTicket: {
    ko: "티켓 id 가 여러 워크스페이스에 걸쳐 모호하다: {matches}",
    en: "ticket id is ambiguous across registered workspaces: {matches}",
  },
  configSetUsage: { ko: "config set 은 <key> <value> 가 필요하다", en: "config set requires <key> <value>" },
  configUnsetUsage: { ko: "config unset 은 <key> 가 필요하다", en: "config unset requires <key>" },
  unknownConfigAction: { ko: "알 수 없는 config 동작: ", en: "Unknown config action: " },
  noWorkspaceCandidates: { ko: "워크스페이스 후보를 찾을 수 없다", en: "workspace candidates not found" },
  workspaceTargetNotFound: { ko: "워크스페이스 대상을 찾을 수 없다{suffix}: {query}", en: "workspace target not found{suffix}: {query}" },
  unknownWorkspaceAction: { ko: "알 수 없는 workspace 동작: ", en: "Unknown workspace action: " },
  coreRulesNotFound: { ko: "코어 룰을 찾을 수 없다: {path}", en: "core rules not found: {path}" },
  coreRulesSectionNotFound: { ko: "코어 룰 섹션을 찾을 수 없다: {section}", en: "core rules section not found: {section}" },
  surfaceDocNotFound: { ko: "CLI 표면 문서를 찾을 수 없다: {path}", en: "CLI surface document not found: {path}" },
} as const;

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
  if (sub === "doc") return parseArgs(rest);
  return parseArgs(rest);
}

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
      process.stdin.pause();
      (process.stdin as any).unref?.();
      resolve(value);
    };
    const timer = setTimeout(() => finish(data), timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { data += chunk; });
    process.stdin.on("end", () => { clearTimeout(timer); finish(data); });
    process.stdin.on("error", () => { clearTimeout(timer); finish(data); });
    process.stdin.resume();
  });
}

function resolveAgentWorkspaceRoot(startDir) {
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

  if (sub === "integrity") {
    const noun = argv[1];
    const verb = argv[2];
    const {
      printIntegrityGuide, runIntegrityNarrativeAdd, runIntegrityNarrativeList,
      runIntegrityNarrativeRemove, runIntegrityNarrativeTest
    } = await import("./cli-integrity-commands.js");
    if (noun !== "narrative") { printIntegrityGuide(); return; }
    const flags: Record<string, string> = {};
    for (let i = 3; i < argv.length; i++) {
      const a = argv[i];
      if (a.startsWith("--")) flags[a.slice(2)] = argv[++i] ?? "";
    }
    if (verb === "list") runIntegrityNarrativeList();
    else if (verb === "add") runIntegrityNarrativeAdd(flags.label, flags.pattern, flags.remedy, flags.scope);
    else if (verb === "remove") runIntegrityNarrativeRemove(flags.label);
    else if (verb === "test") runIntegrityNarrativeTest(flags.text);
    else printIntegrityGuide();
    return;
  }

  if (sub === "persona") {
    const noun = argv[1];
    const verb = argv[2];
    if (noun === "language" && verb === "gate") {
      const { runPersonaLanguageGate } = await import("./cli-persona-commands.js");
      runPersonaLanguageGate(await readStdinWithTimeout(2000));
      return;
    }
    if (noun === "ending" && verb === "gate") {
      const { runPersonaEndingGate } = await import("./cli-persona-commands.js");
      runPersonaEndingGate(await readStdinWithTimeout(2000));
      return;
    }
    if (noun === "verbosity" && verb === "gate") {
      const { runPersonaVerbosityGate } = await import("./cli-persona-commands.js");
      runPersonaVerbosityGate(await readStdinWithTimeout(2000));
      return;
    }
    const {
      parsePersonaArgs, printPersonaGuide, runPersonaAngerMarkerAdd, runPersonaAngerMarkerShow,
      runPersonaAngerMarkerPrune, runPersonaPraiseMarkerAdd, runPersonaPraiseMarkerShow,
      runPersonaPraiseMarkerPrune, runPersonaCacheClear,
      runPersonaConfigGet, runPersonaConfigSet, runPersonaJournalAbsorb, runPersonaJournalPrune,
      runPersonaJournalAdd, runPersonaJournalShow, runPersonaMirrorTargetCapture,
      runPersonaVocabAdd, runPersonaVocabShow, runPersonaVocabPrune, runPersonaVocabRemove,
      runPersonaVocabForms
    } = await import("./cli-persona-commands.js");
    const { runPersonaVocabMigrateCli } = await import("./persona-vocab-migrate.js");
    const personaOpts = parsePersonaArgs(noun === "render" ? argv.slice(2) : argv.slice(3));
    if (!noun || noun === "-h" || noun === "--help" || personaOpts.help) {
      printPersonaGuide();
      return;
    }
    if (noun === "journal") {
      if (verb === "show") runPersonaJournalShow(personaOpts);
      else if (verb === "add") runPersonaJournalAdd(personaOpts);
      else if (verb === "absorb") runPersonaJournalAbsorb(personaOpts);
      else if (verb === "prune") runPersonaJournalPrune(personaOpts);
      else { console.error(`Unknown persona journal action: ${verb}`); printPersonaGuide(); }
      return;
    }
    if (noun === "mirror") {
      if (verb === "target-capture") runPersonaMirrorTargetCapture(personaOpts);
      else if (verb === "capture") {
        const { runPersonaMirrorCapture } = await import("./cli-persona-commands.js");
        runPersonaMirrorCapture(await readStdinWithTimeout(2000), personaOpts);
      }
      else { console.error(`Unknown persona mirror action: ${verb}`); printPersonaGuide(); }
      return;
    }
    if (noun === "vocab" || noun === "vocabulary") {
      if (verb === "show") runPersonaVocabShow(personaOpts);
      else if (verb === "add") runPersonaVocabAdd(personaOpts);
      else if (verb === "migrate") runPersonaVocabMigrateCli(personaOpts);
      else if (verb === "forms") runPersonaVocabForms(personaOpts);
      else if (verb === "remove") runPersonaVocabRemove(personaOpts);
      else if (verb === "prune") runPersonaVocabPrune(personaOpts);
      else { console.error(`Unknown persona vocab action: ${verb}`); printPersonaGuide(); }
      return;
    }
    if (noun === "display") {
      console.error("persona display transform 은 제거됐다 — 게이트는 Stop 훅의 transcript 를 직접 읽는다.");
      printPersonaGuide();
      return;
    }
    if (noun === "cache") {
      if (verb === "clear") runPersonaCacheClear(personaOpts);
      else { console.error(`Unknown persona cache action: ${verb}`); printPersonaGuide(); }
      return;
    }
    if (noun === "config") {
      if (verb === "set") runPersonaConfigSet(personaOpts);
      else if (verb === "get") runPersonaConfigGet(personaOpts);
      else { console.error(`Unknown persona config action: ${verb}`); printPersonaGuide(); }
      return;
    }
    if (noun === "anger-marker") {
      if (verb === "add") runPersonaAngerMarkerAdd(personaOpts);
      else if (verb === "show") runPersonaAngerMarkerShow(personaOpts);
      else if (verb === "prune") runPersonaAngerMarkerPrune(personaOpts); // #1032: 죽은 문장-키(사생활) 청소
      else { console.error(`Unknown persona anger-marker action: ${verb}`); printPersonaGuide(); }
      return;
    }

    if (noun === "praise-marker") {
      if (verb === "add") runPersonaPraiseMarkerAdd(personaOpts);
      else if (verb === "show") runPersonaPraiseMarkerShow(personaOpts);
      else if (verb === "prune") runPersonaPraiseMarkerPrune(personaOpts); // #1032: 죽은 문장-키(사생활) 청소
      else { console.error(`Unknown persona praise-marker action: ${verb}`); printPersonaGuide(); }
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
  if (entryOpts.docsLanguage) setSurfaceLocale(entryOpts.docsLanguage);
  const shouldRunAutoMigration = shouldRunEntryAutoMigration(sub, rest);
  const entryAutoMigrationCwd = shouldRunAutoMigration ? resolveEntryAutoMigrationCwd(sub, entryOpts) : entryOpts.workspaceRoot;
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
    if (action === "prune-ghosts") {
      await runTicketPruneGhosts(opts);
      return;
    }
    if (!action || action === "-h" || action === "--help" || action === "help" || opts.help) {
      printTicketGuide(opts.help && action && !String(action).startsWith("-") ? action : "", opts);
      return;
    }
    opts.workspaceRoot = resolveTicketWorkspaceCwd(opts);
    try {
      const { resolveRealWorkspaceRoot } = await import("./cli-utils.js");
      const home = await import("./cli-ticket-home.js") as any;
      const wsRoot = resolveRealWorkspaceRoot(opts.workspaceRoot, opts);
      if (wsRoot) home.ensureWorkspaceMigrated(wsRoot);
    } catch { /* migration is best-effort; commands still work via fallback */ }
    try {
      const { syncExposedNativeSkills } = await import("./cli-skill-commands.js");
      syncExposedNativeSkills(opts.workspaceRoot);
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
      throw new Error(localized(CLI_TEXT.approvalSurfaceRemoved));
    }
    else if (action === "handoff" || action === "continue") await runTicketHandoff(opts);
    else if (action === "report") {
      if (opts.claim) {
        await runTicketEvidenceReport(opts);
      } else {
        throw new Error(localized(CLI_TEXT.reportRemoved));
      }
    }
    else if (action === "upgrade" || action === "migrate") {
      const count = performUpgradeMigration(opts.workspaceRoot, opts);
      console.log(localized(CLI_TEXT.migrationComplete, { count: String(count) }));
    }
    else {
      console.error("Unknown ticket action: " + action);
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
    if (!opts.sessionId && !process.stdin.isTTY) {
      try { opts.sessionId = JSON.parse(await readStdinWithTimeout(300))?.session_id; } catch { /* no stdin JSON */ }
    }
    runWorkspace(action, opts, rest.slice(1));
    return;
  }

  if (sub === "context") {
    runContextCommand(rest);
    return;
  }

  if (sub === "doc") {
    const { runDocCommand } = await import("./cli-doc-commands.js");
    runDocCommand(rest);
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

  if (sub === "rule") {
    const action = rest[0] && !String(rest[0]).startsWith("-") ? rest[0] : undefined;
    if (action !== "add") {
      throw new Error(localized(CLI_TEXT.ruleUsage));
    }
    const { runRuleAdd } = await import("./cli-rule-registry.js");
    runRuleAdd(entryOpts);
    return;
  }

  if (sub === "coding") {
    const action = rest[0] && !String(rest[0]).startsWith("-") ? rest[0] : undefined;
    if (action !== "step") {
      throw new Error(localized(CLI_TEXT.codingUsage));
    }
    const { runCodingStep } = await import("./cli-coding-step.js");
    runCodingStep(entryOpts);
    return;
  }

  if (sub === "rules") {
    const action = rest[0] && !String(rest[0]).startsWith("-") ? rest[0] : undefined;
    const opts = entryOpts;
    if (!opts.sessionId && !process.stdin.isTTY) {
      try {
        const stdinJson = JSON.parse(await readStdinWithTimeout(300));
        opts.sessionId = stdinJson?.session_id;
        opts.hookCwd = stdinJson?.cwd;
      } catch { /* no stdin JSON */ }
    }
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
      const boundTicket = bindRequestedWorkspace(opts);
      if (boundTicket.workspaceId) opts.workspace = boundTicket.workspaceId;
      opts.workspaceRoot = resolveTicketWorkspaceCwd(opts);
      opts.ruleSurface = "ticket";
      try {
        const { syncExposedNativeSkills } = await import("./cli-skill-commands.js");
        syncExposedNativeSkills(opts.workspaceRoot);
      } catch { /* skill sync is best-effort */ }
      await runTicketRules(opts);
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
    opts.workspaceRoot = process.cwd();

    const saved = loadInitConfig(opts.workspaceRoot, opts);
    if (saved && !opts.interactive) {
      for (const key in saved) {
        if (opts[key] === undefined) opts[key] = saved[key];
      }
      console.log(localized(CLI_TEXT.savedConfig, { scope: saved.configScope || "workspace", path: saved.configPath || `${DEUK_ROOT_DIR}/config.json` }));
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
  if (sub === "rules") return false;
  return true;
}

function resolveEntryAutoMigrationCwd(sub, opts: CliOpts = {}) {
  if (sub === "ticket") {
    try {
      return resolveTicketWorkspaceCwd(opts);
    } catch {
      return "";
    }
  }
  return opts.workspaceRoot;
}

function resolveWorkspaceIdFromHookCwd(hookCwd: string, opts: CliOpts = {}): string {
  if (!hookCwd) return "";
  try {
    const homeDir = resolveHomeTicketDirForWorkspace(hookCwd, opts);
    const name = readWorkspaceMeta(homeDir)?.name;
    return name ? String(name).trim() : "";
  } catch {
    return "";
  }
}

function bindRequestedWorkspace(opts: CliOpts = {}) {
  const query = opts.workspace || resolveWorkspaceIdFromHookCwd(opts.hookCwd || "", opts);
  const candidates = loadWorkspaceCandidates("", { platform: "any", homeDir: opts.homeDir });
  const resolution = resolveWorkspaceTarget(query, { candidates, homeDir: opts.homeDir });
  if (!resolution?.target) return { workspacePath: "", workspaceId: "" };
  return { workspacePath: resolution.target.path, workspaceId: resolution.target.id || query || "" };
}

function resolveTicketWorkspaceCwd(opts: CliOpts = {}) {
  const query = opts.workspace || "";
  const bound = bindRequestedWorkspace(opts);
  if (bound.workspacePath) return bound.workspacePath;

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

async function runTicketPruneGhosts(opts: CliOpts = {}) {
  const result = pruneGhostWorkspaces({ ...opts, apply: Boolean(opts.apply) });
  if (result.ghosts.length === 0) {
    console.log(localized(CLI_TEXT.noGhosts));
    return;
  }
  console.log(localized(CLI_TEXT.ghostCount, { count: String(result.ghosts.length) }));
  for (const key of result.ghosts) {
    console.log(opts.apply ? `[REMOVE] ${key}` : `[DRY-RUN] would remove ${key}`);
  }
  if (opts.apply) {
    console.log(localized(CLI_TEXT.ghostRemoved, { folders: String(result.removed.length), entries: String((result as Record<string, any>).registryDropped?.length ?? 0) }));
  } else {
    console.log(localized(CLI_TEXT.ghostRerun));
  }
}

function resolveTicketWorkspaceById(opts: CliOpts = {}) {
  const selector = String(opts.ticketId || "").trim();
  if (!selector) return "";
  const candidates = loadWorkspaceCandidates(opts.invocationCwd || opts.workspaceRoot);
  if (!candidates?.workspaces?.length) return "";

  const matches = [];
  for (const workspace of candidates.workspaces) {
    const homeDir = resolveHomeTicketDirForWorkspace(workspace.path, opts);
    const found = collectTicketMarkdownFiles(homeDir)
      .some(file => basename(file, ".md").includes(selector));
    if (found) matches.push(workspace);
  }
  if (matches.length === 1) return matches[0].path;
  if (matches.length > 1) {
    throw new Error(localized(CLI_TEXT.ambiguousTicket, { matches: matches.map(workspace => workspace.id).join(", ") }));
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
    if (!key || value === undefined) throw new Error(localized(CLI_TEXT.configSetUsage));
    const existing = readJsonFile(configPath, {});
    const next = { ...existing, version: INIT_CONFIG_VERSION, [key]: parseConfigValue(value), updatedAt: new Date().toISOString() };
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(next, null, 2), "utf8");
    console.log(`config set: ${key}`);
    return;
  }
  if (action === "unset") {
    const key = argv[0];
    if (!key) throw new Error(localized(CLI_TEXT.configUnsetUsage));
    const existing = readJsonFile(configPath, {});
    delete existing[key];
    existing.updatedAt = new Date().toISOString();
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf8");
    console.log(`config unset: ${key}`);
    return;
  }
  throw new Error(localized(CLI_TEXT.unknownConfigAction) + action);
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
  const candidates = loadWorkspaceCandidates(opts.invocationCwd || opts.workspaceRoot, { platform: "any" });
  if (!candidates) {
    throw new Error(localized(CLI_TEXT.noWorkspaceCandidates));
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
      throw new Error(localized(CLI_TEXT.workspaceTargetNotFound, { suffix, query: query || "" }).trim());
    }
    console.log(result.target.path);
    return;
  }

  throw new Error(localized(CLI_TEXT.unknownWorkspaceAction) + action);
}

function findWorkspaceQuery(argv = []) {
  const valueOptions = new Set(["--workspace", "--project"]);
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

async function handleInit(opts, saved, sub = "init") {
  if (opts.clean && !opts.dryRun) {
    console.log(`[CLEAN] Removing runtime template copies, legacy templates, and config...`);
    const templatesDir = makePath(opts.workspaceRoot, LEGACY_DEUK.templateDir);
    const runtimeTemplatesDir = makePath(opts.workspaceRoot, DEUK_ROOT_DIR, "templates");
    const configFile = makePath(opts.workspaceRoot, LEGACY_DEUK.configFile);
    if (existsSync(templatesDir)) rmSync(templatesDir, { recursive: true, force: true });
    if (existsSync(runtimeTemplatesDir)) rmSync(runtimeTemplatesDir, { recursive: true, force: true });
    if (existsSync(configFile)) rmSync(configFile, { force: true });
  }

  const workflowMode = resolveWorkflowMode(opts, saved);
  if (!opts.dryRun && workflowMode !== WORKFLOW_MODE_EXECUTE) {
    console.log(`[WORKFLOW] Plan mode active. Re-run with --workflow execute or --approval approved to apply file mutations.`);
    return;
  }

  const maintenanceResult = runWorkspaceMaintenance(opts.workspaceRoot, opts.dryRun, pkgRoot, opts);
  if (opts.clean && !opts.dryRun) {
    removeClaudeUserPromptSubmitHook({ homeDir: opts.homeDir });
    removeClaudePreToolUseHook({ homeDir: opts.homeDir });
    removeClaudePostToolUseHook({ homeDir: opts.homeDir });
    removeClaudeStopHook({ homeDir: opts.homeDir });
    removeClaudeToolGuardHook({ homeDir: opts.homeDir });
    removeClaudeNormalizeEolHook({ homeDir: opts.homeDir });
  }
  if (maintenanceResult?.initFailed) {
    process.exitCode = 1;
    console.error(`[FAILED] init did not complete for: ${(maintenanceResult.failures || []).map(f => f.workspace).join(", ")}. Workspace not registered. Fix the error above and re-run.`);
    return;
  }
  if (sub === "init") console.log(formatInitCompletionMessage(opts.workspaceRoot, opts.dryRun));
}

function runRulesPath(opts: CliOpts = {}) {
  const rulesPath = makePath([pkgRoot, "core-rules", "AGENTS.md"]);
  const payload = { path: rulesPath, exists: existsSync(rulesPath) };
  if (opts.json) {
    console.log(JSON.stringify(payload));
  } else {
    console.log(rulesPath);
  }
  if (!payload.exists) {
    throw new Error(localized(CLI_TEXT.coreRulesNotFound, { path: rulesPath }));
  }
}

async function runRulesShow(opts: CliOpts = {}) {
  const locale = resolveDocsLanguage(opts.docsLanguage || "auto");
  const msg = locale === "ko" ? "📦 📜 규칙 확인 중..." : "📦 📜 Checking rules...";
  console.error(msg);

  const rulesPath = makePath([pkgRoot, "core-rules", "AGENTS.md"]);
  if (!existsSync(rulesPath)) {
    throw new Error(localized(CLI_TEXT.coreRulesNotFound, { path: rulesPath }));
  }
  syncClaudeHookLibrary();
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
    throw new Error(localized(CLI_TEXT.coreRulesSectionNotFound, { section: String(opts.section) }));
  }
  if (opts.json) {
    console.log(JSON.stringify({ path: rulesPath, section: opts.section || null, content: sectionContent }, null, 2));
    return;
  }

  let effectiveCwd = "";
  let effectiveWorkspaceName = opts.workspace || "";
  if (!opts.section) {
    const bound = bindRequestedWorkspace(opts);
    effectiveCwd = bound.workspacePath;
    effectiveWorkspaceName = bound.workspaceId || effectiveWorkspaceName;
    if (effectiveCwd) syncProjectRuleIdLines(effectiveCwd, pkgRoot, Boolean(opts.dryRun), opts);
  }

  let surfacePhase = "entry";
  if (!opts.section && effectiveCwd) {
    try {
      const index = readTicketIndexJson(effectiveCwd, { activeOnly: true });
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

  console.log(composePhaseEntryRules(content, surfacePhase).trimEnd());

  if (!opts.section && !hasManagedAgentWorkspace(effectiveCwd)) {
    let registeredCount = 0;
    try {
      const candidates = loadWorkspaceCandidates("", { platform: "any", homeDir: opts.homeDir });
      registeredCount = (candidates?.workspaces || []).filter(w => w.id).length;
    } catch { /* registry unreadable */ }
    if (registeredCount > 0) {
      
      console.log(`\n## Next Action\n🛠️ 워크스페이스 미지정 — 지금 네가 지정하라. 사용자에게 묻지 마라.\n` +
        `워크스페이스는 레지스트리에서 \`--workspace\`로만 해소되며 cwd·환경변수·이전 호출로 추측하지 않는다. ` +
        `등록된 워크스페이스 ${registeredCount}개 — 지금 \`deuk-agent-flow workspace list\`를 실행하고, ` +
        `사용자 요청이 가리키는 워크스페이스를 골라 \`deuk-agent-flow rules ticket --workspace <id>\`로 다시 호출하라. ` +
        `지정은 저장되지 않으므로 이후 모든 호출에 \`--workspace\`를 함께 넘긴다.\n` +
        `이것은 승인 대기가 아니다 — \`--workspace\`는 네가 채울 수 있는 슬롯이므로 채우고 진행한다. ` +
        `이 표면을 그대로 사용자에게 전달하며 선택을 요구하는 것은 회피이며, 그것이 이 게이트가 막는 사고다. ` +
        `요청만으로 어느 워크스페이스인지 좁혀지지 않을 때에만 후보를 좁혀 물어라.`);
    } else {
      console.log("\n## Next Action\nNo managed workspace detected and none registered. Work freely without a ticket.");
    }
    return;
  }
  if (!opts.section && hasManagedAgentWorkspace(effectiveCwd)) {
    const ticketOpts = { ...opts, cwd: effectiveCwd, workspace: effectiveWorkspaceName, ruleSurface: "ticket" };
    const ticketRules = buildTicketRulesGuide(ticketOpts);
    if (ticketRules && ticketRules.trim()) {
      console.log("\n" + ticketRules.trimEnd());
    }
  }
}

function composePhaseEntryRules(content = "", surfacePhase = "entry") {
  let parsed;
  try {
    parsed = parseFrontMatter(content);
  } catch {
    return "";
  }
  const surface = parsed?.meta?.surface;
  if (!surface || typeof surface !== "object") return "";

  const always = Array.isArray(surface.always) ? surface.always : [];
  const phaseList = Array.isArray(surface[surfacePhase]) ? surface[surfacePhase] : [];
  const wanted = surfacePhase === "entry"
    ? [...always, ...(Array.isArray(surface.entry) ? surface.entry : [])]
    : [...always, ...phaseList];
  if (wanted.length === 0) return "";

  const body = parsed.content || "";
  const lines = body.split(/\r?\n/);
  const wantedSet = new Set(wanted.map(s => String(s).trim()));
  const out = [];
  let keep = false;
  for (const line of lines) {
    const m = parseHeadingAtDepth(line, 2);
    if (m) keep = wantedSet.has(m.text);
    if (keep) out.push(line);
  }
  if (out.length === 0) return "";
  const titleLine = body.split("\n").find(line => parseHeadingAtDepth(line, 1));
  const title = titleLine ? `${titleLine}\n\n` : "";
  return `${title}${composeFocusBanner(wanted)}${out.join("\n")}`;
}

function composeFocusBanner(wanted: string[]): string {
  if (!wanted.length) return "";
  const seed = Date.now();
  const pick = wanted[seed % wanted.length];
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
  const phrase = PHRASES[Math.floor(seed / 8) % PHRASES.length];
  return `> ${phrase}\n\n`;
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
    const title = normalizeHeading(match.text);
    if (title === target) {
      start = index;
      level = match.depth;
      break;
    }
  }
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    const match = parseHeading(lines[index]);
    if (match && match.depth <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function syncClaudeHookLibrary() {
  const sourceDir = makePath(pkgRoot, "templates", "hooks");
  if (!existsSync(sourceDir)) return;
  const targetDir = makePath(resolveUserHome(), ".claude", "hooks");
  if (!existsSync(targetDir)) return;
  for (const relative of collectHookFiles(sourceDir)) {
    const source = makePath(sourceDir, relative);
    const target = makePath(targetDir, relative);
    const next = readFileSync(source, "utf8");
    if (existsSync(target) && readFileSync(target, "utf8") === next) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, next);
  }
}

function collectHookFiles(root, prefix = "") {
  const found: string[] = [];
  for (const entry of readdirSync(makePath(root, prefix) || root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...collectHookFiles(root, relative));
    else found.push(relative);
  }
  return found;
}

function readCoreRulesSection(heading) {
  const rulesPath = makePath([pkgRoot, "core-rules", "AGENTS.md"]);
  if (!existsSync(rulesPath)) {
    throw new Error(localized(CLI_TEXT.coreRulesNotFound, { path: rulesPath }));
  }
  const section = extractMarkdownHeadingSection(readFileSync(rulesPath, "utf8"), heading);
  if (!section) {
    throw new Error(localized(CLI_TEXT.coreRulesSectionNotFound, { section: heading }));
  }
  return section;
}

function readCliSurfaceDocument(name) {
  const surfacePath = makePath(pkgRoot, "templates", "cli-surfaces", `${name}.md`);
  if (!existsSync(surfacePath)) {
    throw new Error(localized(CLI_TEXT.surfaceDocNotFound, { path: surfacePath }));
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
    "  --dry-run              Preview the rewrite without writing",
    "",
    "For the full rules gate (project rules, memory, next action), run:",
    "  deuk-agent-flow rules"
  ].join("\n");
}

main().then(() => {
  process.exit(typeof process.exitCode === "number" ? process.exitCode : 0);
}).catch(async err => {
  console.error(err.message || err);
  process.exit(1);
});
