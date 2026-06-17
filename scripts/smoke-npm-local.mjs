#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "fs";
import { delimiter, join, resolve } from "path";
import { spawnSync } from "child_process";
import { tmpdir } from "os";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const aliasDir = join(rootDir, "packages", "deuk-agent-rule");
const workDir = mkdtempSync(join(tmpdir(), "deuk-agent-flow-local-smoke-"));
const prefixDir = join(workDir, "prefix");

function run(command, args, cwd, opts = {}) {
  const shown = [command, ...args].join(" ");
  console.log(`\n$ ${shown}`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: opts.env || process.env,
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

function pack(cwd, expected) {
  const result = run("npm", ["pack", "--json", "--pack-destination", workDir], cwd, { capture: true });
  const rows = JSON.parse(result.stdout);
  const row = rows[0];
  const filename = row?.filename;
  if (!filename) throw new Error(`npm pack did not return a filename for ${cwd}`);
  const tarball = join(workDir, filename);
  if (!existsSync(tarball)) throw new Error(`packed tarball missing: ${tarball}`);

  const fileSet = new Set((row.files || []).map(file => file.path));
  for (const path of expected.files) {
    if (!fileSet.has(path)) throw new Error(`${expected.name} tarball missing required file: ${path}`);
  }
  return { filename, tarball };
}

function globalBinDir(prefix) {
  return process.platform === "win32" ? prefix : join(prefix, "bin");
}

function assertGlobalCommand(binDir, name) {
  const script = process.platform === "win32" ? join(binDir, `${name}.cmd`) : join(binDir, name);
  if (!existsSync(script)) throw new Error(`global command shim missing: ${script}`);
  if (process.platform !== "win32") {
    const mode = statSync(script).mode;
    if ((mode & 0o111) === 0) throw new Error(`global command is not executable: ${script}`);
  }
}

try {
  const rootPkg = readJson(join(rootDir, "package.json"));
  const aliasPkg = readJson(join(aliasDir, "package.json"));
  if (aliasPkg.dependencies?.["deuk-agent-flow"] !== rootPkg.version) {
    throw new Error(`deuk-agent-rule must depend on deuk-agent-flow@${rootPkg.version}`);
  }

  const flow = pack(rootDir, {
    name: "deuk-agent-flow",
    files: [
      "bin/deuk-agent-flow.js",
      "bin/deuk-agent-rule.js",
      "scripts/cli.mjs",
      "scripts/cli-ticket-commands.mjs",
      "scripts/lint-md.mjs",
      "scripts/lint-rules.mjs",
      "package.json",
    ],
  });
  const rule = pack(aliasDir, {
    name: "deuk-agent-rule",
    files: [
      "bin/deuk-agent-rule.js",
      "package.json",
      "README.md",
    ],
  });

  run("npm", ["install", "-g", "--prefix", prefixDir, flow.tarball, rule.tarball], rootDir);

  const binDir = globalBinDir(prefixDir);
  const pathEnv = [binDir, process.env.PATH || ""].join(delimiter);
  const env = { ...process.env, PATH: pathEnv };

  for (const command of ["deuk-agent-flow", "deukagentflow", "deuk-agent-rule", "deukagentrule"]) {
    assertGlobalCommand(binDir, command);
    run(command, ["--help"], rootDir, { env, capture: true });
  }

  console.log(`\nLocal npm install smoke ok (${process.platform})`);
  console.log(`Checked tarballs: ${flow.filename}, ${rule.filename}`);
} finally {
  if (!process.env.DEUK_KEEP_SMOKE_DIR) {
    rmSync(workDir, { recursive: true, force: true });
  }
}
