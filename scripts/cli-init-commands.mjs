import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolveMarkers, resolveCursorrulesMarkers, applyAgents, applyRules, applyCursorrules, readBundleAgents } from "./merge-logic.mjs";
import { ensureTicketDirAndGitignore } from "./cli-init-logic.mjs";
import { loadInitConfig, writeInitConfig } from "./cli-prompts.mjs";

export async function runInit(opts, bundleRoot) {
  const markers = resolveMarkers(opts);
  const agentsResult = applyAgents({
    targetPath: join(opts.cwd, "AGENTS.md"),
    bundleContent: readBundleAgents(bundleRoot),
    markers, flavor: "init",
    appendIfNoMarkers: opts.appendIfNoMarkers,
    dryRun: opts.dryRun, backup: opts.backup,
    agentsMode: opts.agents || "inject"
  });
  console.log(`AGENTS.md: ${agentsResult.action} (${agentsResult.mode || ""})`);

  const ruleActions = applyRules({
    bundleRulesDir: join(bundleRoot, "rules"),
    targetRulesDir: join(opts.cwd, ".cursor", "rules"),
    rulesMode: opts.rules || "prefix",
    dryRun: opts.dryRun, backup: opts.backup
  });
  ruleActions.forEach(r => console.log(`rule ${r.action}: ${r.dest || r.src}`));

  const crResult = applyCursorrules({
    bundleRoot, cwd: opts.cwd,
    markers: resolveCursorrulesMarkers({}),
    cursorrulesMode: opts.cursorrules || "inject",
    dryRun: opts.dryRun, backup: opts.backup
  });
  console.log(`.cursorrules: ${crResult.action} (${crResult.mode || ""})`);

  ensureTicketDirAndGitignore(opts);
}

export function runMerge(opts, bundleRoot) {
  const markers = resolveMarkers(opts);
  const agentsResult = applyAgents({
    targetPath: join(opts.cwd, "AGENTS.md"),
    bundleContent: readBundleAgents(bundleRoot),
    markers, flavor: "merge",
    appendIfNoMarkers: opts.appendIfNoMarkers,
    dryRun: opts.dryRun, backup: opts.backup,
    agentsMode: opts.agents || "inject"
  });
  console.log(`AGENTS.md: ${agentsResult.action} (${agentsResult.mode || ""})`);

  const ruleActions = applyRules({
    bundleRulesDir: join(bundleRoot, "rules"),
    targetRulesDir: join(opts.cwd, ".cursor", "rules"),
    rulesMode: opts.rules || "skip",
    dryRun: opts.dryRun, backup: opts.backup
  });
  ruleActions.forEach(r => console.log(`rule ${r.action}: ${r.dest || r.src}`));

  const crResult = applyCursorrules({
    bundleRoot, cwd: opts.cwd,
    markers: resolveCursorrulesMarkers({}),
    cursorrulesMode: opts.cursorrules || "inject",
    dryRun: opts.dryRun, backup: opts.backup
  });
  console.log(`.cursorrules: ${crResult.action} (${crResult.mode || ""})`);
}
