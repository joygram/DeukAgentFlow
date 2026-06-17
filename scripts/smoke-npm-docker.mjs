#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";
import { tmpdir } from "os";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const aliasDir = join(rootDir, "packages", "deuk-agent-rule");
const workDir = mkdtempSync(join(tmpdir(), "deuk-agent-flow-docker-smoke-"));

function run(command, args, cwd, opts = {}) {
  const shown = [command, ...args].join(" ");
  console.log(`\n$ ${shown}`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: opts.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    if (opts.capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw new Error(`command failed: ${shown}`);
  }
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function pack(cwd) {
  const result = run("npm", ["pack", "--json", "--pack-destination", workDir], cwd, { capture: true });
  const rows = JSON.parse(result.stdout);
  const filename = rows[0]?.filename;
  if (!filename) throw new Error(`npm pack did not return a filename for ${cwd}`);
  const tarball = join(workDir, filename);
  if (!existsSync(tarball)) throw new Error(`packed tarball missing: ${tarball}`);
  return filename;
}

try {
  const rootPkg = readJson(join(rootDir, "package.json"));
  const aliasPkg = readJson(join(aliasDir, "package.json"));

  if (rootPkg.name !== "deuk-agent-flow") {
    throw new Error(`expected root package deuk-agent-flow, got ${rootPkg.name}`);
  }
  if (aliasPkg.name !== "deuk-agent-rule") {
    throw new Error(`expected legacy package deuk-agent-rule, got ${aliasPkg.name}`);
  }
  if (aliasPkg.dependencies?.["deuk-agent-flow"] !== rootPkg.version) {
    throw new Error(`deuk-agent-rule must depend on deuk-agent-flow@${rootPkg.version}`);
  }

  const flowTarball = pack(rootDir);
  const ruleTarball = pack(aliasDir);
  const image = process.env.DEUK_SMOKE_NODE_IMAGE || "node:20-bookworm";
  const keepDir = Boolean(process.env.DEUK_KEEP_SMOKE_DIR);

  console.log(`\nSmoke sandbox: ${workDir}`);
  console.log(`Docker image: ${image}`);

  const script = [
    "set -eu",
    "node --version",
    "npm --version",
    "mkdir -p /tmp/consumer",
    "npm install -g /pkg/" + flowTarball + " /pkg/" + ruleTarball,
    "command -v deuk-agent-flow",
    "command -v deuk-agent-rule",
    "deuk-agent-flow --help >/tmp/deuk-agent-flow-help.txt",
    "deuk-agent-rule --help >/tmp/deuk-agent-rule-help.txt",
    "cd /tmp/consumer",
    "mkdir -p .codex",
    "deuk-agent-flow init --non-interactive --workflow execute --docs-language ko --agents skip",
    "test -f .codex/AGENTS.md",
    "test -f PROJECT_RULE.md",
    "test -d .deuk-agent",
    "test -d .deuk-agent/templates",
    "test -d .deuk-agent/skill-templates",
  ].join("\n");

  run("docker", [
    "run",
    "--rm",
    "-v",
    `${workDir}:/pkg:ro`,
    image,
    "bash",
    "-lc",
    script,
  ], rootDir);

  console.log("\nDocker npm smoke ok");
  if (keepDir) console.log(`Kept smoke sandbox: ${workDir}`);
} finally {
  if (!process.env.DEUK_KEEP_SMOKE_DIR) {
    rmSync(workDir, { recursive: true, force: true });
  }
}
