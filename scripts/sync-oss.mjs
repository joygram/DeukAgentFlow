/**
 * Populates ../DeukAgentFlow for the public GitHub repo.
 * Run: cd deuk-agent-flow && npm run sync:oss
 */
import { cpSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { AGENT_ROOT_DIR } from "./cli-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");
const repoRoot = join(pkgRoot, "..");
// OSS release workspace lives under workspace/OSS/DeukAgentFlow.
const ossRoot = join(repoRoot, "OSS", "DeukAgentFlow");
const ossPublic = join(pkgRoot, "oss-public");
const PUBLIC_DOCS = [
  "architecture.md",
  "architecture.ko.md",
  "how-it-works.md",
  "how-it-works.ko.md",
  "principles.md",
  "principles.ko.md",
  "usage-guide.ko.md",
];

const OSS_RESET_PATHS = [
  ".aiassistant",
  ".claude",
  ".codex",
  ".cursor",
  ".github/workflows",
  ".windsurf",
  "AGENTS.md",
  ".npmrc",
  ".versionrc.cjs",
  "bin",
  "changelog-templates",
  "core-rules",
  "docs",
  "packages",
  "PROJECT_RULE.md",
  "RELEASING.md",
  "RELEASING.ko.md",
  "GITHUB_DESCRIPTION.md",
  "publish",
  "scripts",
];

/** Set DEUK_AGENT_FLOW_OSS_REPO to override, e.g. https://github.com/you/DeukAgentFlow */
const OSS_REPO =
  process.env.DEUK_AGENT_FLOW_OSS_REPO
  || process.env.DEUK_AGENT_RULES_OSS_REPO
  || "https://github.com/joygram/DeukAgentFlow";

function gitBase() {
  let u = OSS_REPO.trim().replace(/\.git$/i, "").replace(/\/$/, "");
  if (!u.startsWith("http")) return u;
  return u;
}

const base = gitBase();
const gitUrl = base.startsWith("http") ? "git+" + base + ".git" : base;

/** Strip OSS package.json hooks not used in the public mirror. */
function stripOssVersionrcScripts(ossVersionrcPath) {
  let t = readFileSync(ossVersionrcPath, "utf8").replace(/\r\n/g, "\n");
  t = t.replace(/\n  scripts:\s*\{\n[\s\S]*?\n  \},\s*\n/, "\n");
  writeFileSync(ossVersionrcPath, t, "utf8");
}

export function buildOssPackageJson(srcPkg, baseUrl = base, gitRemoteUrl = gitUrl) {
  const outPkg = {
    ...srcPkg,
    license: srcPkg.license || "Apache-2.0",
    repository: {
      type: "git",
      url: gitRemoteUrl,
    },
    bugs: {
      url: baseUrl.startsWith("http") ? baseUrl + "/issues" : baseUrl,
    },
    homepage: baseUrl.startsWith("http") ? baseUrl + "#readme" : baseUrl,
    files: [
      "LICENSE",
      "bin/**/*",
      "core-rules/**/*",
      "docs/architecture.md",
      "docs/architecture.ko.md",
      "docs/badges/**/*",
      "docs/how-it-works.md",
      "docs/how-it-works.ko.md",
      "docs/principles.md",
      "docs/principles.ko.md",
      "docs/npm-publish-guide.ko.md",
      "docs/usage-guide.ko.md",
      "docs/assets/**/*",
      "templates/**/*",
      "scripts/cli.mjs",
      "scripts/cli-args.mjs",
      "scripts/cli-usage-commands.mjs",
      "scripts/cli-init-commands.mjs",
      "scripts/cli-init-logic.mjs",
      "scripts/cli-prompts.mjs",
      "scripts/cli-rule-compiler.mjs",
      "scripts/cli-skill-commands.mjs",
      "scripts/cli-telemetry-commands.mjs",
      "scripts/cli-ticket-commands.mjs",
      "scripts/cli-ticket-index.mjs",
      "scripts/cli-ticket-migration.mjs",
      "scripts/cli-ticket-parser.mjs",
      "scripts/cli-utils.mjs",
      "scripts/lint-md.mjs",
      "scripts/lint-rules.mjs",
      "scripts/merge-logic.mjs",
      "scripts/plan-parser.mjs",
      "scripts/publish-dual-npm.mjs",
      "scripts/smoke-npm-local.mjs",
      "scripts/smoke-npm-docker.mjs",
      "scripts/update-download-badge.mjs",
      "README.md",
      "README.ko.md",
      "CHANGELOG.md",
      "CHANGELOG.ko.md",
    ],
  };

  delete outPkg.private;
  if (outPkg.scripts && outPkg.scripts["merge:dry"]) {
    const { "merge:dry": _md, ...r2 } = outPkg.scripts;
    outPkg.scripts = r2;
  }
  if (outPkg.scripts && outPkg.scripts["sync:oss"]) {
    const { "sync:oss": _drop, ...rest } = outPkg.scripts;
    outPkg.scripts = rest;
  }
  /** Mirror is not a template/version source: no bump scripts or release devDependencies. */
  for (const k of ["bump", "bump:patch", "bump:minor", "bump:major"]) {
    if (outPkg.scripts && outPkg.scripts[k]) {
      const { [k]: _drop, ...rest } = outPkg.scripts;
      outPkg.scripts = rest;
    }
  }
  delete outPkg.devDependencies;
  return outPkg;
}

export function syncOssTree(paths = {}) {
  const sourceRoot = paths.pkgRoot || pkgRoot;
  const mirrorRoot = paths.ossRoot || ossRoot;
  const publicRoot = paths.ossPublic || ossPublic;
  const agentRoot = join(mirrorRoot, AGENT_ROOT_DIR);
  if (existsSync(agentRoot)) {
    rmSync(agentRoot, { recursive: true, force: true });
  }
  if (existsSync(join(mirrorRoot, "TICKET_LIST.md"))) {
    unlinkSync(join(mirrorRoot, "TICKET_LIST.md"));
  }
  for (const rel of OSS_RESET_PATHS) {
    const abs = join(mirrorRoot, rel);
    if (existsSync(abs)) {
      rmSync(abs, { recursive: true, force: true });
    }
  }
  mkdirSync(join(mirrorRoot, "scripts"), { recursive: true });
  mkdirSync(join(mirrorRoot, "bin"), { recursive: true });
  mkdirSync(join(mirrorRoot, "templates"), { recursive: true });
  mkdirSync(join(mirrorRoot, "core-rules"), { recursive: true });
  cpSync(join(sourceRoot, "bin"), join(mirrorRoot, "bin"), { recursive: true, force: true });
  cpSync(join(sourceRoot, "templates"), join(mirrorRoot, "templates"), { recursive: true, force: true });
  cpSync(join(sourceRoot, "core-rules"), join(mirrorRoot, "core-rules"), { recursive: true, force: true });
  cpSync(join(sourceRoot, "packages"), join(mirrorRoot, "packages"), { recursive: true, force: true });
  mkdirSync(join(mirrorRoot, "docs"), { recursive: true });
  for (const doc of PUBLIC_DOCS) {
    cpSync(join(sourceRoot, "docs", doc), join(mirrorRoot, "docs", doc), { force: true });
  }
  const sourceBadge = join(sourceRoot, "docs", "badges", "npm-downloads.json");
  if (existsSync(sourceBadge)) {
    mkdirSync(join(mirrorRoot, "docs", "badges"), { recursive: true });
    cpSync(sourceBadge, join(mirrorRoot, "docs", "badges", "npm-downloads.json"), { force: true });
  }
  cpSync(join(sourceRoot, "docs", "assets"), join(mirrorRoot, "docs", "assets"), { recursive: true, force: true });
  const copilotInstructions = join(sourceRoot, ".github", "copilot-instructions.md");
  if (existsSync(copilotInstructions)) {
    mkdirSync(join(mirrorRoot, ".github"), { recursive: true });
    cpSync(copilotInstructions, join(mirrorRoot, ".github", "copilot-instructions.md"), { force: true });
  }
  cpSync(join(sourceRoot, "scripts"), join(mirrorRoot, "scripts"), { recursive: true, force: true });

  if (!existsSync(publicRoot)) {
    throw new Error("Missing oss-public/: " + publicRoot);
  }
  cpSync(join(sourceRoot, "README.md"), join(mirrorRoot, "README.md"), { force: true });
  cpSync(join(sourceRoot, "README.ko.md"), join(mirrorRoot, "README.ko.md"), { force: true });
  if (existsSync(join(sourceRoot, "CHANGELOG.md"))) {
    cpSync(join(sourceRoot, "CHANGELOG.md"), join(mirrorRoot, "CHANGELOG.md"), { force: true });
  }
  if (existsSync(join(sourceRoot, "CHANGELOG.ko.md"))) {
    cpSync(join(sourceRoot, "CHANGELOG.ko.md"), join(mirrorRoot, "CHANGELOG.ko.md"), { force: true });
  }
  if (existsSync(join(sourceRoot, "package-lock.json"))) {
    cpSync(join(sourceRoot, "package-lock.json"), join(mirrorRoot, "package-lock.json"), { force: true });
  }
  if (existsSync(join(sourceRoot, "LICENSE"))) {
    cpSync(join(sourceRoot, "LICENSE"), join(mirrorRoot, "LICENSE"), { force: true });
  }
  const srcPkg = JSON.parse(readFileSync(join(sourceRoot, "package.json"), "utf8"));
  const outPkg = buildOssPackageJson(srcPkg);

  writeFileSync(join(mirrorRoot, "package.json"), JSON.stringify(outPkg, null, 2) + "\n", "utf8");

  const ossPolish = join(mirrorRoot, "scripts", "changelog-polish.mjs");
  if (existsSync(ossPolish)) {
    unlinkSync(ossPolish);
  }
  console.log("deuk-agent-flow: synced OSS tree at " + mirrorRoot);
  console.log("  Override repo URL: DEUK_AGENT_FLOW_OSS_REPO=https://github.com/joygram/DeukAgentFlow");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncOssTree();
}
