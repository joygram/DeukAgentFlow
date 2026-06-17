#!/usr/bin/env node
/**
 * Global Proxy for DeukAgentFlow CLI
 * Runs the bundled CLI by default. Maintainers can opt into local workspace
 * source routing with DEUK_AGENT_FLOW_USE_LOCAL=1 or DEUK_AGENT_FLOW_KIND=source.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function findWorkspaceRoot(currentDir) {
  let dir = currentDir;
  while (true) {
    if (fs.existsSync(path.join(dir, "DeukAgentFlow", "scripts", "cli.mjs"))) {
      return dir;
    }
    if (fs.existsSync(path.join(dir, "DeukAgentRules", "scripts", "cli.mjs"))) {
      return dir;
    }
    if (fs.existsSync(path.join(dir, ".git")) && (fs.existsSync(path.join(dir, "DeukAgentFlow")) || fs.existsSync(path.join(dir, "DeukAgentRules")))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const shouldUseLocalSource = process.env.DEUK_AGENT_FLOW_USE_LOCAL === "1"
  || process.env.DEUK_AGENT_FLOW_USE_LOCAL === "true"
  || process.env.DEUK_AGENT_FLOW_KIND === "source";

const wsRoot = shouldUseLocalSource ? findWorkspaceRoot(process.cwd()) : null;
if (wsRoot) {
  const localCli = fs.existsSync(path.join(wsRoot, "DeukAgentFlow", "scripts", "cli.mjs"))
    ? path.join(wsRoot, "DeukAgentFlow", "scripts", "cli.mjs")
    : path.join(wsRoot, "DeukAgentRules", "scripts", "cli.mjs");
  const bundledCli = path.resolve(path.join(__dirname, "..", "scripts", "cli.mjs"));
  if (fs.existsSync(localCli) && localCli !== bundledCli) {
    const args = process.argv.slice(2);
    const result = spawnSync("node", [localCli, ...args], { stdio: "inherit" });
    process.exit(result.status !== null ? result.status : 1);
  }
}

const myCli = path.join(__dirname, "..", "scripts", "cli.mjs");
if (fs.existsSync(myCli)) {
  const args = process.argv.slice(2);
  const result = spawnSync("node", [myCli, ...args], { stdio: "inherit" });
  process.exit(result.status !== null ? result.status : 1);
}

console.error("Error: Could not find DeukAgentFlow CLI script at " + myCli);
process.exit(1);
