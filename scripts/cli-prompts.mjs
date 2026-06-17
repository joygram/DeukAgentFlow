import { createInterface } from "readline";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { STACKS, AGENT_TOOLS, DOC_LANGUAGE_CHOICES, resolveDocsLanguage, normalizeWorkflowMode, WORKFLOW_MODE_EXECUTE, WORKFLOW_MODE_PLAN } from "./cli-utils.mjs";

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



export async function runInteractive(opts) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("\nDeukAgentRules init — let's configure your workspace.\n");

    const stack = await selectOne(rl, "What is your primary tech stack?", STACKS);
    const tools = await selectMany(rl, "Which agent tools do you use?", AGENT_TOOLS);
    const docsLanguage = await selectOne(rl, "What document language should generated tickets/plans use?", DOC_LANGUAGE_CHOICES);
    const workflowMode = opts.workflowMode
      ? normalizeWorkflowMode(opts.workflowMode)
      : await selectOne(rl, "What workflow mode should be saved?", [
          { label: "Plan mode (prepare only)", value: WORKFLOW_MODE_PLAN },
          { label: "Execute mode (apply changes)", value: WORKFLOW_MODE_EXECUTE },
        ]);
    const shareTickets = await askYesNo("Do you want to share (git-track) tickets for this repository?", false);

    const targetAgents = join(opts.cwd, "AGENTS.md");
    let agentsDefault = "inject";
    if (!existsSync(targetAgents)) {
      agentsDefault = "inject"; // will append markers
      console.log("\n  No AGENTS.md found — will create with markers.");
    } else {
      const content = readFileSync(targetAgents, "utf8");
      const hasMarkers = content.includes("deuk-agent-rule:begin") || content.includes("## DeukAgentRules");
      if (!hasMarkers) {
        const choice = await selectOne(rl, "AGENTS.md exists but has no markers. How to apply?", [
          { label: "Append managed block at the end (safe)", value: "inject" },
          { label: "Overwrite entire AGENTS.md", value: "overwrite" },
          { label: "Skip AGENTS.md", value: "skip" },
        ]);
        agentsDefault = choice;
      }
    }

    const remoteSync = opts.remoteSync !== undefined ? opts.remoteSync : (await askYesNo("Enable AI Pipeline remote synchronization? (Advanced)", false));
    let pipelineUrl = opts.pipelineUrl || "";
    if (remoteSync && !pipelineUrl) {
      pipelineUrl = (await ask(rl, "Enter AI Pipeline Endpoint URL: ")).trim();
    }

    opts.agents = opts.agents ?? agentsDefault;
    opts.stack = stack;
    opts.agentTools = tools;
    opts.docsLanguage = resolveDocsLanguage(docsLanguage);
    opts.workflowMode = normalizeWorkflowMode(opts.workflowMode || workflowMode);
    opts.shareTickets = shareTickets;
    opts.remoteSync = remoteSync;
    opts.pipelineUrl = pipelineUrl;

    console.log("\n  Stack : " + stack);
    console.log("  Tools : " + (tools.join(", ") || "none"));
    console.log("  Docs Language: " + opts.docsLanguage);
    console.log("  Workflow Mode: " + opts.workflowMode);
    console.log("  Share Tickets: " + (opts.shareTickets ? "Yes (Shared)" : "No (Private)"));
    console.log("  Remote Sync:   " + (opts.remoteSync ? "Enabled" : "Disabled"));
    if (opts.remoteSync) console.log("  Pipeline URL:  " + opts.pipelineUrl);
    console.log("  AGENTS: " + opts.agents + "\n");
  } finally {
    rl.close();
  }
}
