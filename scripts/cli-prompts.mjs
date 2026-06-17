import { createInterface } from "readline";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const INIT_CONFIG_FILENAME = ".deuk-agent-rule.config.json";
const INIT_CONFIG_VERSION = 1;

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

export function loadInitConfig(cwd) {
  const p = join(cwd, INIT_CONFIG_FILENAME);
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    if (j.version !== INIT_CONFIG_VERSION) return null;
    return j;
  } catch {
    return null;
  }
}

export function writeInitConfig(cwd, opts) {
  const p = join(cwd, INIT_CONFIG_FILENAME);
  const body = {
    version: INIT_CONFIG_VERSION,
    stack: opts.stack,
    agentTools: opts.agentTools,
    agentsMode: opts.agents ?? "inject",
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(p, JSON.stringify(body, null, 2) + "\n", "utf8");
}

export const STACKS = [
  { label: "Unity / C#", value: "unity" },
  { label: "Next.js + C#", value: "nextjs-dotnet" },
  { label: "Web (React / Vue / general)", value: "web" },
  { label: "Java / Spring Boot", value: "java" },
  { label: "Other / skip", value: "other" },
];

export const AGENT_TOOLS = [
  { label: "Cursor", value: "cursor" },
  { label: "GitHub Copilot", value: "copilot" },
  { label: "Gemini / Antigravity", value: "gemini" },
  { label: "Claude (Cursor / Claude Code)", value: "claude" },
  { label: "Windsurf", value: "windsurf" },
  { label: "JetBrains AI Assistant", value: "jetbrains" },
  { label: "All of the above", value: "all" },
  { label: "Other / skip", value: "other" },
];

export async function runInteractive(opts) {
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
