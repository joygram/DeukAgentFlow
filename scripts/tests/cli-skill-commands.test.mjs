import test from "node:test";
import assert from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addSkill, exposeSkills, lintSkills, listSkills } from "../cli-skill-commands.mjs";

test("skill add installs first-party thin playbook", () => {
  const cwd = process.cwd();
  const result = addSkill({ cwd, skill: "safe-refactor", dryRun: true });
  assert.match(result.target, /\.deuk-agent\/skills\/safe-refactor\/SKILL\.md$/);
});

test("skill lint accepts first-party skills and enforces authority line", () => {
  const result = lintSkills(process.cwd());
  assert.strictEqual(result.ok, true, result.violations.join("\n"));
  assert.ok(result.paths.some(path => path.includes("safe-refactor")));
  assert.ok(result.paths.some(path => path.includes("generated-file-guard")));
  assert.ok(result.paths.some(path => path.includes("context-recall")));
});

test("skill add/expose writes repo registry and thin platform wrappers", () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-skill-"));
  try {
    const targetCwd = cwd;
    mkdirSync(join(targetCwd, "templates", "skills"), { recursive: true });
    for (const id of ["safe-refactor"]) {
      mkdirSync(join(targetCwd, "templates", "skills", id), { recursive: true });
      const source = readFileSync(join(process.cwd(), "templates", "skills", id, "SKILL.md"), "utf8");
      writeFileSync(join(targetCwd, "templates", "skills", id, "SKILL.md"), source, "utf8");
    }

    addSkill({ cwd: targetCwd, skill: "safe-refactor", dryRun: false });
    const rows = listSkills(targetCwd);
    assert.strictEqual(rows.find(row => row.id === "safe-refactor")?.installed, true);

    exposeSkills({ cwd: targetCwd, platform: "cursor", dryRun: false });
    exposeSkills({ cwd: targetCwd, platform: "claude", dryRun: false });

    const cursorPointer = readFileSync(join(targetCwd, ".cursor", "rules", "deuk-agent-skills.mdc"), "utf8");
    assert.match(cursorPointer, /thin behavior playbooks/);
    assert.match(cursorPointer, /do not override `core-rules\/AGENTS\.md`/i);

    const claudeSkill = readFileSync(join(targetCwd, ".claude", "skills", "safe-refactor", "SKILL.md"), "utf8");
    assert.match(claudeSkill, /Authority: follow `core-rules\/AGENTS\.md`/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
