#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
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

/** Default directory for persisted handoffs; `init` adds it to `.gitignore`. */
const HANDOFF_DIR_NAME = ".deuk-agent-handoff";
const GITIGNORE_HANDOFF_MARKER = "# deuk-agent-rule: handoff directory (local, not committed by default)";

function printHandoffTip() {
  console.log(
    "tip: Persist multi-session specs under " +
      HANDOFF_DIR_NAME +
      "/ (see README § Handoffs). Optional: mirror the same body to .cursor/plans/deuk-handoff.plan.md for the Plans panel.",
  );
}

function ensureHandoffDirAndGitignore(opts) {
  const handoffPath = join(opts.cwd, HANDOFF_DIR_NAME);
  const gitignorePath = join(opts.cwd, ".gitignore");
  const ignoreLine = HANDOFF_DIR_NAME + "/";

  if (opts.dryRun) {
    console.log("handoff: would mkdir " + HANDOFF_DIR_NAME + "/ and ensure .gitignore ignores it");
    printHandoffTip();
    return;
  }

  mkdirSync(handoffPath, { recursive: true });
  console.log("handoff: " + HANDOFF_DIR_NAME + "/");

  let gi = "";
  if (existsSync(gitignorePath)) {
    gi = readFileSync(gitignorePath, "utf8");
    const lines = gi.split(/\r?\n/).map((l) => l.trim());
    const already =
      gi.includes(ignoreLine) ||
      lines.some((t) => t === HANDOFF_DIR_NAME || t === ignoreLine.replace(/\/$/, ""));
    if (already) {
      console.log(".gitignore: already ignores " + HANDOFF_DIR_NAME);
      printHandoffTip();
      return;
    }
    const block = "\n" + GITIGNORE_HANDOFF_MARKER + "\n" + ignoreLine + "\n";
    appendFileSync(gitignorePath, block, "utf8");
    console.log(".gitignore: appended " + ignoreLine.trim());
    printHandoffTip();
  } else {
    writeFileSync(gitignorePath, GITIGNORE_HANDOFF_MARKER + "\n" + ignoreLine + "\n", "utf8");
    console.log(".gitignore: created with " + ignoreLine.trim());
    printHandoffTip();
  }
}

// ---------------------------------------------------------------------------
// Interactive prompt helpers (no external deps)
// ---------------------------------------------------------------------------

function isNonInteractive(opts) {
  return opts.nonInteractive || process.env.CI || !process.stdin.isTTY;
}

async function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function selectOne(rl, prompt, choices) {
  console.log("\n" + prompt);
  choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.label}`));
  while (true) {
    const ans = (await ask(rl, `  Choice [1-${choices.length}]: `)).trim();
    const idx = parseInt(ans, 10) - 1;
    if (idx >= 0 && idx < choices.length) return choices[idx].value;
    console.log("  Please enter a number between 1 and " + choices.length);
  }
}

async function selectMany(rl, prompt, choices) {
  console.log("\n" + prompt + " (comma-separated numbers, or 'all')");
  choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.label}`));
  while (true) {
    const ans = (await ask(rl, `  Choices: `)).trim().toLowerCase();
    if (ans === "all" || ans === "") return choices.map((c) => c.value);
    const parts = ans.split(/[,\s]+/).map((s) => parseInt(s, 10) - 1);
    if (parts.every((i) => i >= 0 && i < choices.length)) {
      return parts.map((i) => choices[i].value);
    }
    console.log("  Invalid selection, try again.");
  }
}

const STACKS = [
  { label: "Unity / C#", value: "unity" },
  { label: "Next.js + C#", value: "nextjs-dotnet" },
  { label: "Web (React / Vue / general)", value: "web" },
  { label: "Java / Spring Boot", value: "java" },
  { label: "Other / skip", value: "other" },
];

/** Survey only today; merge/init does not branch on these yet (future tool-specific templates). */
const AGENT_TOOLS = [
  { label: "Cursor", value: "cursor" },
  { label: "GitHub Copilot", value: "copilot" },
  { label: "Gemini / Antigravity", value: "gemini" },
  { label: "Claude (Cursor / Claude Code)", value: "claude" },
  { label: "Windsurf", value: "windsurf" },
  { label: "JetBrains AI Assistant", value: "jetbrains" },
  { label: "All of the above", value: "all" },
  { label: "Other / skip", value: "other" },
];

/** Written after first interactive init; reused on later inits unless --interactive or schema mismatch. */
const INIT_CONFIG_VERSION = 1;
const INIT_CONFIG_FILENAME = ".deuk-agent-rule.config.json";

function loadInitConfig(cwd) {
  const p = join(cwd, INIT_CONFIG_FILENAME);
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    if (j.version !== INIT_CONFIG_VERSION) return null;
    const allowedStack = new Set(STACKS.map((s) => s.value));
    if (!allowedStack.has(j.stack)) return null;
    const allowedTools = new Set(AGENT_TOOLS.map((t) => t.value));
    if (!Array.isArray(j.agentTools) || !j.agentTools.every((t) => allowedTools.has(t))) return null;
    if (!["inject", "skip", "overwrite"].includes(j.agentsMode)) return null;
    return {
      stack: j.stack,
      agentTools: j.agentTools,
      agentsMode: j.agentsMode,
    };
  } catch {
    return null;
  }
}

function writeInitConfig(cwd, opts) {
  const p = join(cwd, INIT_CONFIG_FILENAME);
  const body = {
    version: INIT_CONFIG_VERSION,
    stack: opts.stack,
    agentTools: opts.agentTools,
    agentsMode: opts.agents ?? "inject",
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(p, JSON.stringify(body, null, 2) + "\n", "utf8");
  console.log("saved: " + INIT_CONFIG_FILENAME);
}

async function runInteractive(opts) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("\nDeukAgentRules init — let's configure your workspace.\n");

    const stack = await selectOne(rl, "What is your primary tech stack?", STACKS);
    const tools = await selectMany(rl, "Which agent tools do you use?", AGENT_TOOLS);

    const targetAgents = join(opts.cwd, "AGENTS.md");
    let agentsDefault = "inject";
    if (!existsSync(targetAgents)) {
      agentsDefault = "inject"; // will append markers
      console.log("\n  No AGENTS.md found — will create with markers.");
    } else {
      const content = readFileSync(targetAgents, "utf8");
      const hasMarkers = content.includes("deuk-agent-rule:begin");
      if (!hasMarkers) {
        const choice = await selectOne(rl, "AGENTS.md exists but has no markers. How to apply?", [
          { label: "Append managed block at the end (safe)", value: "inject" },
          { label: "Overwrite entire AGENTS.md", value: "overwrite" },
          { label: "Skip AGENTS.md", value: "skip" },
        ]);
        agentsDefault = choice;
      }
    }

    opts.agents = opts.agents ?? agentsDefault;
    opts.stack = stack;
    opts.agentTools = tools;

    console.log("\n  Stack : " + stack);
    console.log("  Tools : " + (tools.join(", ") || "none"));
    console.log("  AGENTS: " + opts.agents + "\n");
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Help / arg parsing
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(
    `DeukAgentRules (npm: deuk-agent-rule) — AGENTS.md + .cursor/rules templates

Usage:
  npx deuk-agent-rule init   [options]   # interactive by default
  npx deuk-agent-rule merge  [options]

Options:
  --cwd <path>          Target repo root (default: current directory)
  --dry-run             Print actions; do not write files
  --non-interactive     CI/scripts: no prompts; use --agents/--rules (no saved config read)
  --interactive         Ask questions even if .deuk-agent-rule.config.json exists
  --tag <id>            Marker id (default: deuk-agent-rule)
  --agents <mode>       inject | skip | overwrite
  --rules <mode>        prefix | skip | overwrite
  --backup              Write *.bak before overwrite
  --append-if-no-markers
  --marker-begin / --marker-end  Custom marker strings (both required)

init also creates .deuk-agent-handoff/ and appends it to .gitignore (local handoffs).
After npm update, run init again: deuk-agent-rule-*.mdc rules refresh from the bundle (no separate merge needed).

Korean: package README.ko.md
`,
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
    nonInteractive: false,
    interactive: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") {
      out.cwd = argv[++i];
      if (!out.cwd) throw new Error("--cwd requires a path");
    } else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--backup") out.backup = true;
    else if (a === "--non-interactive") out.nonInteractive = true;
    else if (a === "--interactive") out.interactive = true;
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

// ---------------------------------------------------------------------------
// init / merge runners
// ---------------------------------------------------------------------------

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

  ensureHandoffDirAndGitignore(opts);
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

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
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
      "Missing bundle/ (run from published package or run npm run sync in DeukAgentRules when developing).",
    );
    process.exit(1);
  }

  try {
    if (sub === "init") {
      if (!isNonInteractive(opts)) {
        const saved = loadInitConfig(opts.cwd);
        if (saved && !opts.interactive) {
          opts.agents = opts.agents !== undefined ? opts.agents : saved.agentsMode;
          opts.stack = saved.stack;
          opts.agentTools = saved.agentTools;
          const stackL = STACKS.find((s) => s.value === saved.stack)?.label || saved.stack;
          console.log("\nDeukAgentRules init — using saved choices from " + INIT_CONFIG_FILENAME);
          console.log("  Stack : " + saved.stack + " (" + stackL + ")");
          console.log("  Tools : " + (saved.agentTools.join(", ") || "none"));
          console.log("  AGENTS: " + opts.agents);
          console.log("  (`--interactive` to change, or edit/delete " + INIT_CONFIG_FILENAME + ")\n");
        } else {
          await runInteractive(opts);
          if (!opts.dryRun) {
            writeInitConfig(opts.cwd, opts);
          }
        }
      }
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
