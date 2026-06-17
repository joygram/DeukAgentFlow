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
  assert.ok(result.paths.some(path => path.includes("project-pilot")));
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

test("project-pilot is a first-party installable skill", () => {
  const cwd = process.cwd();
  const rows = listSkills(cwd);
  assert.ok(rows.some(row => row.id === "project-pilot"));

  const result = addSkill({ cwd, skill: "project-pilot", dryRun: true });
  assert.match(result.target, /\.deuk-agent\/skills\/project-pilot\/SKILL\.md$/);
});

test("skill add can install package-provided skills from a consumer repo", () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-skill-consumer-"));
  try {
    const result = addSkill({ cwd, skill: "project-pilot", dryRun: false });
    assert.match(result.target, /\.deuk-agent\/skills\/project-pilot\/SKILL\.md$/);

    const installed = readFileSync(join(cwd, ".deuk-agent", "skills", "project-pilot", "SKILL.md"), "utf8");
    assert.match(installed, /# ProjectPilot/);

    const rows = listSkills(cwd);
    assert.strictEqual(rows.find(row => row.id === "project-pilot")?.installed, true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("skill list treats installed skill files as installed when registry is missing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-skill-files-"));
  try {
    const skillDir = join(cwd, ".deuk-agent", "skills", "generated-file-guard");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# Generated File Guard\n", "utf8");

    const rows = listSkills(cwd);
    assert.strictEqual(rows.find(row => row.id === "generated-file-guard")?.installed, true);
    assert.strictEqual(rows.find(row => row.id === "safe-refactor")?.installed, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("skill list detects actual exposure pointers even when registry state is missing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-skill-exposed-"));
  try {
    const skillDir = join(cwd, ".deuk-agent", "skills", "project-pilot");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# ProjectPilot\n", "utf8");

    const claudeDir = join(cwd, ".claude", "skills", "project-pilot");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, "SKILL.md"), "# ProjectPilot\n", "utf8");

    const cursorDir = join(cwd, ".cursor", "rules");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(join(cursorDir, "deuk-agent-skills.mdc"), [
      "---",
      "description: skills",
      "---",
      "- project-pilot: .deuk-agent/skills/project-pilot/SKILL.md",
      ""
    ].join("\n"), "utf8");

    const rows = listSkills(cwd);
    const row = rows.find(candidate => candidate.id === "project-pilot");
    assert.deepStrictEqual(row?.exposed.sort(), ["claude", "cursor"]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
