import test from "node:test";
import assert from "node:assert/strict";
import { buildAliasPackageJson } from "../publish-dual-npm.mjs";

test("buildAliasPackageJson syncs alias version and canonical dependency", () => {
  const rootPkg = {
    version: "4.5.6",
    license: "Apache-2.0",
    repository: { type: "git", url: "git+https://github.com/joygram/DeukAgentFlow.git" },
    bugs: { url: "https://github.com/joygram/DeukAgentFlow/issues" },
    homepage: "https://github.com/joygram/DeukAgentFlow#readme",
    engines: { node: ">=18" },
  };

  const aliasPkg = buildAliasPackageJson(rootPkg, {
    name: "old-name",
    version: "0.0.1",
    dependencies: { "deuk-agent-flow": "0.0.1" },
  });

  assert.equal(aliasPkg.name, "deuk-agent-rule");
  assert.equal(aliasPkg.version, "4.5.6");
  assert.deepEqual(aliasPkg.dependencies, { "deuk-agent-flow": "4.5.6" });
  assert.equal(aliasPkg.bin["deuk-agent-rule"], "./bin/deuk-agent-rule.js");
  assert.equal(aliasPkg.repository.url, rootPkg.repository.url);
});
