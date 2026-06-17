#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const aliasDir = join(rootDir, "packages", "deuk-agent-rule");

export function buildAliasPackageJson(rootPkg, currentAliasPkg = {}) {
  const version = rootPkg.version;
  return {
    ...currentAliasPkg,
    name: "deuk-agent-rule",
    version,
    description: "Compatibility wrapper for legacy deuk-agent-rule installs.",
    keywords: [
      "agents-md",
      "agent-flow",
      "agent-workflow",
      "ai-guardrails",
      "agent-guardrails",
      "deuk-family",
    ],
    license: rootPkg.license || currentAliasPkg.license || "Apache-2.0",
    repository: rootPkg.repository,
    bugs: rootPkg.bugs,
    homepage: rootPkg.homepage,
    files: ["bin/**/*", "README.md"],
    bin: {
      "deuk-agent-rule": "./bin/deuk-agent-rule.js",
      deukagentrule: "./bin/deuk-agent-rule.js",
    },
    engines: rootPkg.engines || currentAliasPkg.engines || { node: ">=18" },
    dependencies: {
      "deuk-agent-flow": version,
    },
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function run(command, args, cwd) {
  const shown = [command, ...args].join(" ");
  console.log(`\n$ ${shown}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

export function syncAliasPackageJson(paths = {}) {
  const rootPackagePath = paths.rootPackagePath || join(rootDir, "package.json");
  const aliasPackagePath = paths.aliasPackagePath || join(aliasDir, "package.json");
  const rootPkg = readJson(rootPackagePath);
  const aliasPkg = readJson(aliasPackagePath);
  const nextAliasPkg = buildAliasPackageJson(rootPkg, aliasPkg);
  writeJson(aliasPackagePath, nextAliasPkg);
  return nextAliasPkg;
}

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    access: "public",
    tag: null,
    otp: null,
    skipTests: false,
    skipSmoke: false,
    aliasOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--skip-tests") opts.skipTests = true;
    else if (arg === "--skip-smoke") opts.skipSmoke = true;
    else if (arg === "--alias-only") opts.aliasOnly = true;
    else if (arg === "--access") opts.access = argv[++i];
    else if (arg === "--tag") opts.tag = argv[++i];
    else if (arg === "--otp") opts.otp = argv[++i];
    else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function publishArgs(opts) {
  const args = ["publish", "--access", opts.access, "--ignore-scripts"];
  if (opts.tag) args.push("--tag", opts.tag);
  if (opts.otp) args.push("--otp", opts.otp);
  if (opts.dryRun) args.push("--dry-run");
  return args;
}

export function main(argv = process.argv.slice(2)) {
  if (process.env.npm_command === "publish" && process.env.npm_lifecycle_event === "publish") {
    console.log("Skipping scripts.publish during npm publish lifecycle.");
    return;
  }

  const opts = parseArgs(argv);
  const aliasPkg = syncAliasPackageJson();

  const packageLabel = opts.aliasOnly ? "deuk-agent-rule" : "deuk-agent-flow and deuk-agent-rule";
  console.log(`Publishing ${packageLabel} at ${aliasPkg.version}`);
  if (opts.dryRun) {
    console.log("Dry-run mode: npm will build and validate packages without registry writes.");
  }

  if (!opts.skipTests) {
    run("npm", ["test"], rootDir);
  }
  if (!opts.skipSmoke) {
    run("node", ["scripts/smoke-npm-local.mjs"], rootDir);
  }

  const args = publishArgs(opts);
  if (!opts.aliasOnly) {
    run("npm", args, rootDir);
  }
  run("npm", args, aliasDir);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
