import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildOssPackageJson, syncOssTree } from "../sync-oss.mjs";

test("OSS mirror package payload stays public-only and excludes telemetry internals", () => {
  const srcPkg = {
    name: "deuk-agent-rule",
    version: "3.3.0",
    private: true,
    license: "",
    scripts: {
      test: "node --test scripts/tests/*.test.mjs",
      "sync:oss": "node scripts/sync-oss.mjs",
      "merge:dry": "node scripts/cli.mjs merge --dry-run",
      bump: "commit-and-tag-version"
    },
    devDependencies: {
      foo: "1.0.0"
    }
  };

  const outPkg = buildOssPackageJson(srcPkg, "https://github.com/joygram/DeukAgentFlow", "git+https://github.com/joygram/DeukAgentFlow.git");

  assert.strictEqual(outPkg.license, "Apache-2.0");
  assert.strictEqual(outPkg.repository.url, "git+https://github.com/joygram/DeukAgentFlow.git");
  assert.strictEqual(outPkg.bugs.url, "https://github.com/joygram/DeukAgentFlow/issues");
  assert.strictEqual(outPkg.homepage, "https://github.com/joygram/DeukAgentFlow#readme");
  assert.ok(!Object.prototype.hasOwnProperty.call(outPkg, "private"));
  assert.ok(!Object.prototype.hasOwnProperty.call(outPkg, "devDependencies"));
  assert.deepStrictEqual(outPkg.scripts, {
    test: "node --test scripts/tests/*.test.mjs"
  });
  assert.deepStrictEqual(outPkg.files, [
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
    "CHANGELOG.ko.md"
  ]);
  assert.ok(!JSON.stringify(outPkg).includes(".deuk-agent"));
  assert.ok(!JSON.stringify(outPkg).includes("telemetry.jsonl"));
});

test("syncOssTree removes stale OSS scripts before copying current sources", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "deuk-sync-oss-"));
  const srcRoot = join(tempRoot, "src");
  const ossRoot = join(tempRoot, "oss");
  const ossPublic = join(srcRoot, "oss-public");

  try {
    mkdirSync(join(srcRoot, "templates"), { recursive: true });
    mkdirSync(join(srcRoot, "bin"), { recursive: true });
    mkdirSync(join(srcRoot, "core-rules"), { recursive: true });
    mkdirSync(join(srcRoot, "packages", "deuk-agent-rule"), { recursive: true });
    mkdirSync(join(srcRoot, "docs", "badges"), { recursive: true });
    mkdirSync(join(srcRoot, "docs", "assets"), { recursive: true });
    mkdirSync(join(srcRoot, ".github"), { recursive: true });
    mkdirSync(join(srcRoot, "scripts"), { recursive: true });
    mkdirSync(ossPublic, { recursive: true });
    mkdirSync(join(ossRoot, "scripts"), { recursive: true });

    writeFileSync(join(srcRoot, "README.md"), "src readme\n");
    writeFileSync(join(srcRoot, "README.ko.md"), "src ko readme\n");
    writeFileSync(join(srcRoot, "CHANGELOG.md"), "src changelog\n");
    writeFileSync(join(srcRoot, "CHANGELOG.ko.md"), "src ko changelog\n");
    writeFileSync(join(srcRoot, "LICENSE"), "license\n");
    writeFileSync(join(srcRoot, "package.json"), JSON.stringify({
      name: "deuk-agent-flow",
      version: "1.2.3",
      scripts: { test: "node --test scripts/tests/*.test.mjs" }
    }, null, 2));
    writeFileSync(join(srcRoot, "scripts", "cli.mjs"), "export const cli = true;\n");
    writeFileSync(join(srcRoot, "scripts", "cli-utils.mjs"), "export const AGENT_ROOT_DIR = '.deuk-agent';\n");
    writeFileSync(join(srcRoot, "bin", "deuk-agent-flow.js"), "#!/usr/bin/env node\n");
    writeFileSync(join(srcRoot, "core-rules", "AGENTS.md"), "core rules\n");
    writeFileSync(join(srcRoot, ".github", "copilot-instructions.md"), "copilot\n");
    writeFileSync(join(srcRoot, "docs", "architecture.md"), "arch\n");
    writeFileSync(join(srcRoot, "docs", "architecture.ko.md"), "arch ko\n");
    writeFileSync(join(srcRoot, "docs", "badges", "npm-downloads.json"), "{\"label\":\"deuk-flow downloads\"}\n");
    writeFileSync(join(srcRoot, "docs", "how-it-works.md"), "how\n");
    writeFileSync(join(srcRoot, "docs", "how-it-works.ko.md"), "how ko\n");
    writeFileSync(join(srcRoot, "docs", "principles.md"), "principles\n");
    writeFileSync(join(srcRoot, "docs", "principles.ko.md"), "principles ko\n");
    writeFileSync(join(srcRoot, "docs", "usage-guide.ko.md"), "usage ko\n");

    writeFileSync(join(ossRoot, "scripts", "cli-ticket-logic.mjs"), "stale\n");

    syncOssTree({ pkgRoot: srcRoot, ossRoot, ossPublic });

    assert.strictEqual(readFileSync(join(ossRoot, "scripts", "cli.mjs"), "utf8"), "export const cli = true;\n");
    assert.throws(() => readFileSync(join(ossRoot, "scripts", "cli-ticket-logic.mjs"), "utf8"));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
