#!/usr/bin/env node
// 배포될 tarball 그대로 설치해서 실제 흐름을 돌린다. 패키지가 깨지면 여기서 실패해야 한다.
// --package-dir <dir>: 검사할 패키지 루트(기본: 이 저장소). OSS 미러 검사에 사용.
import { spawnSync } from "child_process";
import { existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,statSync } from "fs";
import { tmpdir } from "os";
import { delimiter,relative } from "path";
import { fileURLToPath } from "url";
import { CliOpts,makePath } from "./cli-utils.js";
import { syncAliasPackageJson } from "./publish-dual-npm.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const packageDirArgIndex = process.argv.indexOf("--package-dir");
const packageDir = packageDirArgIndex > 0 ? process.argv[packageDirArgIndex + 1] : repoRoot;
const aliasDir = makePath(packageDir, "packages", "deuk-agent-rule");
const npm = "npm";
const npmShell = process.platform === "win32";
const workDir = mkdtempSync(makePath(tmpdir(), "deuk-agent-flow-local-smoke-"));
const prefixDir = makePath(workDir, "prefix");
const homeDir = makePath(workDir, "home");
const workspaceDir = makePath(workDir, "SmokeWs");

// 런타임이 읽는 자산 디렉터리. 소스에 있는 파일은 tarball에 전부 있어야 한다.
const RUNTIME_ASSET_DIRS = ["core-rules", "templates", makePath("scripts", "out", "scripts")];

function run(command, args, cwd, opts: CliOpts = {}) {
  const shown = [command, ...args].join(" ");
  console.log(`\n$ ${shown}`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: opts.env || process.env,
    stdio: opts.capture ? "pipe" : "inherit",
    shell: npmShell,
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

function listFilesRelative(baseDir, subDir) {
  const absDir = makePath(baseDir, subDir);
  if (!existsSync(absDir)) return [];
  const found = [];
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const absPath = makePath(dir, ent.name);
      if (ent.isDirectory()) walk(absPath);
      else found.push(relative(baseDir, absPath).replace(/\\/g, "/"));
    }
  };
  walk(absDir);
  return found;
}

function pack(cwd) {
  const result = run(npm, ["pack", "--json", "--pack-destination", workDir, "--ignore-scripts"], cwd, { capture: true });
  const row = JSON.parse(result.stdout.slice(result.stdout.indexOf("[")))[0];
  if (!row?.filename) throw new Error(`npm pack did not return a filename for ${cwd}`);
  const tarball = makePath(workDir, row.filename);
  if (!existsSync(tarball)) throw new Error(`packed tarball missing: ${tarball}`);
  return { filename: row.filename, tarball, files: new Set((row.files || []).map(file => file.path)) };
}

function assertRuntimeAssetsPacked(flowFiles) {
  const missing = [];
  for (const assetDir of RUNTIME_ASSET_DIRS) {
    const sourceFiles = listFilesRelative(packageDir, assetDir).filter(path => !path.endsWith(".map"));
    if (sourceFiles.length === 0) missing.push(`${assetDir}/ (source dir empty or absent)`);
    for (const path of sourceFiles) if (!flowFiles.has(path)) missing.push(path);
  }
  if (missing.length > 0) {
    throw new Error(`deuk-agent-flow tarball missing ${missing.length} runtime file(s):\n  ${missing.slice(0, 30).join("\n  ")}`);
  }
}

function assertGlobalCommand(binDir, name) {
  const script = process.platform === "win32" ? makePath(binDir, `${name}.cmd`) : makePath(binDir, name);
  if (!existsSync(script)) throw new Error(`global command missing: ${script}`);
  if (process.platform !== "win32" && (statSync(script).mode & 0o111) === 0) {
    throw new Error(`global command is not executable: ${script}`);
  }
}

function assertOutput(result, label, mustContain: string[], mustNotContain: string[] = []) {
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  for (const text of mustContain) {
    if (!output.includes(text)) throw new Error(`${label}: output lacks "${text}"\n${output.slice(0, 800)}`);
  }
  for (const text of mustNotContain) {
    if (output.includes(text)) throw new Error(`${label}: output contains "${text}"\n${output.slice(0, 800)}`);
  }
}

try {
  const packagePkg = readJson(makePath(packageDir, "package.json"));
  const hasAliasPackage = existsSync(makePath(aliasDir, "package.json"));
  if (hasAliasPackage) {
    const aliasPkg = packageDir === repoRoot ? syncAliasPackageJson() : readJson(makePath(aliasDir, "package.json"));
    if (aliasPkg.dependencies?.["deuk-agent-flow"] !== packagePkg.version) {
      throw new Error(`deuk-agent-rule must depend on deuk-agent-flow@${packagePkg.version}`);
    }
  }

  const flow = pack(packageDir);
  assertRuntimeAssetsPacked(flow.files);
  const rule = hasAliasPackage ? pack(aliasDir) : null;

  run(npm, ["install", "-g", "--prefix", prefixDir, flow.tarball, ...(rule ? [rule.tarball] : [])], workDir);

  const binDir = process.platform === "win32" ? prefixDir : makePath(prefixDir, "bin");
  assertGlobalCommand(binDir, "deuk-agent-flow");
  mkdirSync(makePath(homeDir, ".claude"), { recursive: true });
  mkdirSync(workspaceDir, { recursive: true });
  const env = {
    ...process.env,
    PATH: [binDir, process.env.PATH || ""].join(delimiter),
    HOME: homeDir,
    USERPROFILE: homeDir,
  };
  const cli = (args, cwd = workspaceDir) => run("deuk-agent-flow", args, cwd, { env, capture: true });

  assertOutput(cli(["--version"]), "--version", [packagePkg.version]);
  assertOutput(cli(["rules"]), "rules", ["# Agent Rules"], ["not found", "Unknown command"]);

  run("git", ["init", "-q"], workspaceDir);
  cli(["init", "--non-interactive", "--approval", "approved"]);
  for (const expected of [".deuk-workspace-id", "PROJECT_RULE.md"]) {
    if (!existsSync(makePath(workspaceDir, expected))) throw new Error(`init did not create ${expected}`);
  }

  const bundledSkills = listFilesRelative(packageDir, makePath("templates", "skills")).filter(path => path.endsWith("/SKILL.md"));
  const exposedSkills = listFilesRelative(homeDir, makePath(".claude", "skills")).filter(path => path.endsWith("/SKILL.md"));
  if (exposedSkills.length < bundledSkills.length) {
    throw new Error(`skills not installed: ${exposedSkills.length}/${bundledSkills.length} in ~/.claude/skills`);
  }

  assertOutput(cli(["workspace", "list"]), "workspace list", ["SmokeWs"]);
  cli(["ticket", "list", "--workspace", "SmokeWs"]);
  assertOutput(cli(["rules", "ticket", "--workspace", "SmokeWs"]), "rules ticket", ["ticket create"], ["not found"]);

  console.log(`\nLocal npm install smoke ok (${process.platform})`);
  console.log(`Checked tarballs: ${flow.filename} (${flow.files.size} files)${rule ? `, ${rule.filename}` : ""}`);
} finally {
  if (!process.env.DEUK_KEEP_SMOKE_DIR) {
    rmSync(workDir, { recursive: true, force: true });
  }
}
