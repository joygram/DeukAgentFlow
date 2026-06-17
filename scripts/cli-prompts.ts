import { createInterface } from "readline";
import { existsSync, readFileSync } from "fs";
import { AGENT_TOOLS, CliOpts, WORKFLOW_MODE_EXECUTE, WORKSPACE_KINDS, makePath, normalizeWorkflowMode, resolveDocsLanguage } from "./cli-utils.js";
import { cliText } from "./cli-locales.js";

export async function ask(rl, question): Promise<string> {
  return new Promise<string>((resolve) => rl.question(question, resolve));
}

export async function askYesNo(question, defaultYes = true) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await ask(rl, question + (defaultYes ? " [Y/n]: " : " [y/N]: "))).trim().toLowerCase();
    if (!ans) return defaultYes;
    return ans === "y" || ans === "yes";
  } finally {
    rl.close();
  }
}

export async function selectOne(rl, prompt, choices) {
  console.log("\n" + prompt);
  choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.label}`));
  while (true) {
    const ans = (await ask(rl, `  Choice [1-${choices.length}]: `)).trim();
    const idx = parseInt(ans, 10) - 1;
    if (idx >= 0 && idx < choices.length) return choices[idx].value;
  }
}

export async function selectMany(rl, prompt, choices) {
  console.log("\n" + prompt + " (comma-separated numbers, or 'all')");
  choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.label}`));
  while (true) {
    const ans = (await ask(rl, `  Choices: `)).trim().toLowerCase();
    if (ans === "all" || ans === "") return choices.map((c) => c.value);
    const parts = ans.split(/[,\s]+/).map((s) => parseInt(s, 10) - 1);
    if (parts.every((i) => i >= 0 && i < choices.length)) return parts.map((i) => choices[i].value);
  }
}

function hasAny(cwd, names) {
  return names.some((name) => existsSync(makePath(cwd, name)));
}

export function inferInitDefaults(cwd, opts: CliOpts = {}) {
  const packageJsonPath = makePath(cwd, "package.json");
  const packageJson = existsSync(packageJsonPath)
    ? readFileSync(packageJsonPath, "utf8")
    : "";

  const stack = opts.stack
    || (hasAny(cwd, ["pyproject.toml", "requirements.txt", "notebooks"]) ? "data" : null)
    || (hasAny(cwd, ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "k8s", "terraform"]) ? "infra" : null)
    || (hasAny(cwd, ["Cargo.toml", "go.mod", "pom.xml", "build.gradle"]) ? "backend" : null)
    || (packageJson && /"(@vitejs\/|vite|next|react|vue|svelte|astro)"/i.test(packageJson) ? "web" : null)
    || (packageJson ? "backend" : null)
    || "none";

  const tools = AGENT_TOOLS.map((tool) => tool.value);

  return {
    stack,
    agentTools: opts.agentTools ?? tools,
    docsLanguage: resolveDocsLanguage(opts.docsLanguage ?? "auto"),
    workflowMode: normalizeWorkflowMode(opts.workflowMode ?? opts.workflow ?? opts.approval ?? WORKFLOW_MODE_EXECUTE),
    shareTickets: opts.shareTickets ?? false,
    contextMcp: opts.contextMcp ?? "skip",
    remoteSync: opts.remoteSync ?? false,
    pipelineUrl: opts.pipelineUrl || ""
  };
}

export async function runInteractive(opts) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const locale = resolveDocsLanguage(opts.docsLanguage ?? "auto");
    console.log(`\n${cliText("prompts.init.heading", { locale })}\n`);

    const workspaceKind = await selectOne(rl, cliText("prompts.init.workspaceKind", { locale }), WORKSPACE_KINDS);
    const defaults = inferInitDefaults(opts.cwd, opts);

    opts.workspaceKind = workspaceKind;
    opts.kind = workspaceKind;
    opts.stack = defaults.stack;
    opts.agentTools = defaults.agentTools;
    opts.docsLanguage = defaults.docsLanguage;
    opts.workflowMode = defaults.workflowMode;
    opts.shareTickets = defaults.shareTickets;
    opts.contextMcp = defaults.contextMcp;
    opts.remoteSync = defaults.remoteSync;
    opts.pipelineUrl = defaults.pipelineUrl;

    console.log(`\n  ${cliText("prompts.init.summary.workspaceKind", { locale, vars: { value: workspaceKind } })}`);
    console.log(`  ${cliText("prompts.init.summary.technicalSurface", { locale, vars: { value: opts.stack } })}`);
    console.log(`  ${cliText("prompts.init.summary.aiClients", { locale, vars: { value: opts.agentTools.join(", ") || cliText("prompts.init.summary.allSupportedClients", { locale }) } })}`);
    console.log(`  ${cliText("prompts.init.summary.docsLanguage", { locale, vars: { value: opts.docsLanguage } })}`);
    console.log(`  ${cliText("prompts.init.summary.workflowMode", { locale, vars: { value: opts.workflowMode } })}`);
    console.log(`  ${cliText("prompts.init.summary.shareTickets", { locale, vars: { value: opts.shareTickets ? cliText("prompts.init.summary.shareYes", { locale }) : cliText("prompts.init.summary.shareNo", { locale }) } })}`);
    console.log(`  ${cliText("prompts.init.summary.contextMcp", { locale })}`);
    console.log(`  ${cliText("prompts.init.summary.externalSync", { locale, vars: { value: opts.remoteSync ? cliText("prompts.init.summary.enabled", { locale }) : cliText("prompts.init.summary.disabled", { locale }) } })}`);
    if (opts.remoteSync) console.log(`  ${cliText("prompts.init.summary.syncUrl", { locale, vars: { value: opts.pipelineUrl } })}\n`);
  } finally {
    rl.close();
  }
}
