#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "fs";
import { delimiter, resolve } from "path";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { CliOpts, makePath } from "./cli-utils.js";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const aliasDir = makePath(rootDir, "packages", "deuk-agent-rule");
const workDir = mkdtempSync(makePath(tmpdir(), "deuk-agent-flow-local-smoke-"));
const prefixDir = makePath(workDir, "prefix");

function run(command, args, cwd, opts: CliOpts = {}) {
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
  const tarball = makePath(workDir, filename);
  if (!existsSync(tarball)) throw new Error(`packed tarball missing: ${tarball}`);

  const fileSet = new Set((row.files || []).map(file => file.path));
  for (const path of expected.files) {
    if (!fileSet.has(path)) throw new Error(`${expected.name} tarball missing required file: ${path}`);
  }
  return { filename, tarball };
}

function globalBinDir(prefix) {
  return process.platform === "win32" ? prefix : makePath(prefix, "bin");
}

function assertGlobalCommand(binDir, name) {
  const script = process.platform === "win32" ? makePath(binDir, `${name}.cmd`) : makePath(binDir, name);
  if (!existsSync(script)) throw new Error(`global command shim missing: ${script}`);
  if (process.platform !== "win32") {
    const mode = statSync(script).mode;
    if ((mode & 0o111) === 0) throw new Error(`global command is not executable: ${script}`);
  }
}

try {
  const rootPkg = readJson(makePath(rootDir, "package.json"));
  const aliasPkg = readJson(makePath(aliasDir, "package.json"));
  if (aliasPkg.dependencies?.["deuk-agent-flow"] !== rootPkg.version) {
    throw new Error(`deuk-agent-rule must depend on deuk-agent-flow@${rootPkg.version}`);
  }

  const flow = pack(rootDir, {
    name: "deuk-agent-flow",
    files: [
      "bin/deuk-agent-flow.js",
      "bin/deuk-agent-rule.js",
      "scripts/out/scripts/cli.js",
      "scripts/out/scripts/cli-ticket-command-shared.js",
      "scripts/out/scripts/cli-ticket-commands.js",
      "scripts/out/scripts/lint-md.js",
      "scripts/out/scripts/lint-rules.js",
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
