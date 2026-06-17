import { createInterface } from "readline";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { WORKSPACE_KINDS, AGENT_TOOLS, resolveDocsLanguage, normalizeWorkflowMode, WORKFLOW_MODE_EXECUTE } from "./cli-utils.mjs";

export async function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
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
  return names.some((name) => existsSync(join(cwd, name)));
}

export function inferInitDefaults(cwd, opts = {}) {
  const packageJsonPath = join(cwd, "package.json");
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
    console.log("\nDeukAgentFlow init — let's configure your workspace.\n");

    const workspaceKind = await selectOne(rl, "What kind of workspace is this?", WORKSPACE_KINDS);
    const defaults = inferInitDefaults(opts.cwd, opts);

    const targetAgents = join(opts.cwd, "AGENTS.md");
    let agentsDefault = "inject";
    if (!existsSync(targetAgents)) {
      agentsDefault = "inject"; // will append markers
      console.log("\n  No AGENTS.md found — will create with markers.");
    } else {
      const content = readFileSync(targetAgents, "utf8");
      const hasMarkers = content.includes("deuk-agent-rule:begin") || content.includes("## DeukAgentFlow");
      if (!hasMarkers) {
        agentsDefault = "inject";
        console.log("\n  AGENTS.md exists without managed markers — will append a managed block.");
      }
    }

    opts.agents = opts.agents ?? agentsDefault;
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

    console.log("\n  Workspace Kind: " + workspaceKind);
    console.log("  Technical Surface: " + opts.stack);
    console.log("  AI Clients: " + (opts.agentTools.join(", ") || "all supported clients"));
    console.log("  Docs Language: " + opts.docsLanguage);
    console.log("  Workflow Mode: " + opts.workflowMode);
    console.log("  Share Tickets: " + (opts.shareTickets ? "Yes (Shared)" : "No (Private)"));
    console.log("  Deuk AgentContext MCP: hidden during init");
    console.log("  External Sync: " + (opts.remoteSync ? "Enabled" : "Disabled"));
    if (opts.remoteSync) console.log("  Sync URL: " + opts.pipelineUrl);
    console.log("  AGENTS: " + opts.agents + "\n");
  } finally {
    rl.close();
  }
}
