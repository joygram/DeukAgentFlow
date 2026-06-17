#!/usr/bin/env node
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  applyAgents,
  applyRules,
  readBundleAgents,
  resolveMarkers,
} from "./merge-logic.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");
const bundleRoot = join(pkgRoot, "bundle");

function printHelp() {
  console.log(
    "DeukAgentRules (npm: deuk-agent-rule) — AGENTS.md + .cursor/rules templates\n\nUsage:\n  npx deuk-agent-rule init   [options]\n  npx deuk-agent-rule merge  [options]\n\nPrimary flow:\n  npm install deuk-agent-rule\n  npx deuk-agent-rule init\n\nOptions:\n  --cwd <path>\n  --dry-run\n  --backup\n  --tag <id>\n  --marker-begin <string>\n  --marker-end <string>\n\ninit defaults: agents inject (append markers if missing), rules prefix\nmerge defaults: agents inject (fail if no markers unless --append-if-no-markers), rules skip\n\nAlso:\n  --agents skip|overwrite|inject\n  --rules skip|overwrite|prefix\n  --append-if-no-markers\n\nKorean: package README.ko.md\n",
  );
}

function parseArgs(argv) {
  const out = {
    cwd: process.cwd(),
    dryRun: false,
    backup: false,
    tag: undefined,
    markerBegin: undefined,
    markerEnd: undefined,
    agents: undefined,
    rules: undefined,
    appendIfNoMarkers: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") {
      out.cwd = argv[++i];
      if (!out.cwd) throw new Error("--cwd requires a path");
    } else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--backup") out.backup = true;
    else if (a === "--tag") {
      out.tag = argv[++i];
      if (out.tag == null) throw new Error("--tag requires a value");
    } else if (a === "--marker-begin") {
      out.markerBegin = argv[++i];
      if (out.markerBegin == null) throw new Error("--marker-begin requires a value");
    } else if (a === "--marker-end") {
      out.markerEnd = argv[++i];
      if (out.markerEnd == null) throw new Error("--marker-end requires a value");
    } else if (a === "--agents") {
      out.agents = argv[++i];
      if (!out.agents) throw new Error("--agents requires skip|overwrite|inject");
    } else if (a === "--rules") {
      out.rules = argv[++i];
      if (!out.rules) throw new Error("--rules requires skip|overwrite|prefix");
    } else if (a === "--append-if-no-markers") out.appendIfNoMarkers = true;
    else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error("Unknown argument: " + a);
    }
  }
  return out;
}

function validateMode(name, v, allowed) {
  if (!allowed.includes(v)) {
    throw new Error("Invalid " + name + ": " + v + " (allowed: " + allowed.join(", ") + ")");
  }
}

function runInit(opts) {
  const markers = resolveMarkers({
    tag: opts.tag,
    markerBegin: opts.markerBegin,
    markerEnd: opts.markerEnd,
  });
  const agentsMode = opts.agents ?? "inject";
  validateMode("agents", agentsMode, ["skip", "overwrite", "inject"]);

  const rulesMode = opts.rules ?? "prefix";
  validateMode("rules", rulesMode, ["skip", "overwrite", "prefix"]);

  const bundleContent = readBundleAgents(bundleRoot);
  const targetAgents = join(opts.cwd, "AGENTS.md");
  const targetRules = join(opts.cwd, ".cursor", "rules");

  const agentsResult = applyAgents({
    targetPath: targetAgents,
    bundleContent,
    markers,
    flavor: "init",
    appendIfNoMarkers: opts.appendIfNoMarkers,
    dryRun: opts.dryRun,
    backup: opts.backup,
    agentsMode,
  });
  console.log("AGENTS.md: " + agentsResult.action + (agentsResult.mode ? " (" + agentsResult.mode + ")" : ""));

  const ruleActions = applyRules({
    bundleRulesDir: join(bundleRoot, "rules"),
    targetRulesDir: targetRules,
    rulesMode,
    dryRun: opts.dryRun,
    backup: opts.backup,
  });
  for (const r of ruleActions) {
    console.log("rule " + r.action + ": " + (r.dest || r.src) + (r.reason ? " (" + r.reason + ")" : ""));
  }
}

function runMerge(opts) {
  const markers = resolveMarkers({
    tag: opts.tag,
    markerBegin: opts.markerBegin,
    markerEnd: opts.markerEnd,
  });
  const agentsMode = opts.agents ?? "inject";
  validateMode("agents", agentsMode, ["skip", "overwrite", "inject"]);

  const rulesMode = opts.rules ?? "skip";
  validateMode("rules", rulesMode, ["skip", "overwrite", "prefix"]);

  const bundleContent = readBundleAgents(bundleRoot);
  const targetAgents = join(opts.cwd, "AGENTS.md");
  const targetRules = join(opts.cwd, ".cursor", "rules");

  const agentsResult = applyAgents({
    targetPath: targetAgents,
    bundleContent,
    markers,
    flavor: "merge",
    appendIfNoMarkers: opts.appendIfNoMarkers,
    dryRun: opts.dryRun,
    backup: opts.backup,
    agentsMode,
  });
  console.log("AGENTS.md: " + agentsResult.action + (agentsResult.mode ? " (" + agentsResult.mode + ")" : ""));

  const ruleActions = applyRules({
    bundleRulesDir: join(bundleRoot, "rules"),
    targetRulesDir: targetRules,
    rulesMode,
    dryRun: opts.dryRun,
    backup: opts.backup,
  });
  for (const r of ruleActions) {
    console.log("rule " + r.action + ": " + (r.dest || r.src) + (r.reason ? " (" + r.reason + ")" : ""));
  }
}

function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  if (!sub || sub === "-h" || sub === "--help") {
    printHelp();
    process.exit(0);
  }

  const rest = argv.slice(1);
  if (sub === "help") {
    printHelp();
    process.exit(0);
  }

  let opts;
  try {
    opts = parseArgs(rest);
  } catch (e) {
    console.error(e.message || e);
    printHelp();
    process.exit(1);
  }

  if (!existsSync(bundleRoot)) {
    console.error(
      "Missing bundle/ (run from published package or run npm run sync in deuk-agent-rule when developing in the monorepo).",
    );
    process.exit(1);
  }

  try {
    if (sub === "init") {
      runInit(opts);
    } else if (sub === "merge") {
      runMerge(opts);
    } else {
      console.error("Unknown command: " + sub);
      printHelp();
      process.exit(1);
    }
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}

main();
