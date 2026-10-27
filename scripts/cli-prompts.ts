import { existsSync,readFileSync } from "fs";
import { AGENT_TOOLS,CliOpts,WORKFLOW_MODE_EXECUTE,makePath,normalizeWorkflowMode,resolveDocsLanguage } from "./cli-utils.js";

export async function ask(rl, question): Promise<string> {
  return new Promise<string>((resolve) => rl.question(question, resolve));
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
    workflowMode: normalizeWorkflowMode(opts.workflowMode ?? opts.approval ?? WORKFLOW_MODE_EXECUTE),
    shareTickets: opts.shareTickets ?? false,
    contextMcp: opts.contextMcp ?? "skip",
    remoteSync: opts.remoteSync ?? false,
    pipelineUrl: opts.pipelineUrl || ""
  };
}
