import test from "node:test";
import assert from "node:assert";
import { buildOssPackageJson } from "../sync-oss.mjs";

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

  const outPkg = buildOssPackageJson(srcPkg, "https://github.com/joygram/DeukAgentRules", "git+https://github.com/joygram/DeukAgentRules.git");

  assert.strictEqual(outPkg.license, "Apache-2.0");
  assert.strictEqual(outPkg.repository.url, "git+https://github.com/joygram/DeukAgentRules.git");
  assert.strictEqual(outPkg.bugs.url, "https://github.com/joygram/DeukAgentRules/issues");
  assert.strictEqual(outPkg.homepage, "https://github.com/joygram/DeukAgentRules#readme");
  assert.ok(!Object.prototype.hasOwnProperty.call(outPkg, "private"));
  assert.ok(!Object.prototype.hasOwnProperty.call(outPkg, "devDependencies"));
  assert.deepStrictEqual(outPkg.scripts, {
    test: "node --test scripts/tests/*.test.mjs"
  });
  assert.deepStrictEqual(outPkg.files, [
    "LICENSE",
    "bundle/**/*",
    "scripts/**/*.mjs",
    "README.md",
    "README.ko.md",
    "CHANGELOG.md",
    "CHANGELOG.ko.md"
  ]);
  assert.ok(!JSON.stringify(outPkg).includes(".deuk-agent"));
  assert.ok(!JSON.stringify(outPkg).includes("telemetry.jsonl"));
});
