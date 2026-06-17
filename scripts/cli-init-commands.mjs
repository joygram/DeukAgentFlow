import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { resolveMarkers, resolveCursorrulesMarkers, applyAgents, applyRules, applyCursorrules, readBundleAgents } from "./merge-logic.mjs";
import { ensureTicketDirAndGitignore } from "./cli-init-logic.mjs";
import { loadInitConfig, writeInitConfig } from "./cli-utils.mjs";
import { runInteractive } from "./cli-prompts.mjs";

function syncTemplates(cwd, bundleRoot, dryRun) {
  const tplSrcDir = join(bundleRoot, "templates");
  const tplDestDir = join(cwd, ".deuk-agent-templates");
  if (!existsSync(tplSrcDir)) return;
  if (!dryRun) mkdirSync(tplDestDir, { recursive: true });

  const srcFiles = readdirSync(tplSrcDir).filter(n => n.endsWith(".md"));
  const destFiles = existsSync(tplDestDir) ? readdirSync(tplDestDir).filter(n => n.endsWith(".md")) : [];

  // 1. Copy/Update new templates
  for (const name of srcFiles) {
    const src = join(tplSrcDir, name);
    const dest = join(tplDestDir, name);
    if (!dryRun) copyFileSync(src, dest);
    console.log(`template synced: ${dest}`);
  }

  // 2. Cleanup obsolete templates (Migration)
  for (const name of destFiles) {
    if (!srcFiles.includes(name)) {
      const obsolete = join(tplDestDir, name);
      if (!dryRun) {
        import("fs").then(fs => fs.unlinkSync(obsolete));
      }
      console.log(`template removed (obsolete): ${obsolete}`);
    }
  }
}


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
  syncTemplates(opts.cwd, bundleRoot, opts.dryRun);

  // If no config exists, save the derived/default config to ensure persistency
  if (!loadInitConfig(opts.cwd)) {
    writeInitConfig(opts.cwd, opts);
  }
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

  syncTemplates(opts.cwd, bundleRoot, opts.dryRun);
}
