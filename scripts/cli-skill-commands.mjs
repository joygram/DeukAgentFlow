import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { AGENT_ROOT_DIR } from "./cli-utils.mjs";

const SKILL_IDS = ["safe-refactor", "generated-file-guard", "context-recall"];
const SKILL_ROOT = "templates/skills";
const CONFIG_FILE = `${AGENT_ROOT_DIR}/skills.json`;
const REPO_SKILL_TEMPLATE_ROOT = `${AGENT_ROOT_DIR}/skill-templates`;

function repoSkillPath(cwd, id) {
  return join(cwd, AGENT_ROOT_DIR, "skills", id, "SKILL.md");
}

function sourceSkillPath(cwd, id) {
  const localTemplate = join(cwd, REPO_SKILL_TEMPLATE_ROOT, id, "SKILL.md");
  if (existsSync(localTemplate)) return localTemplate;
  return join(cwd, SKILL_ROOT, id, "SKILL.md");
}

function loadSkillSource(cwd, id) {
  const source = sourceSkillPath(cwd, id);
  if (!existsSync(source)) throw new Error(`skill not found: ${id}`);
  return readFileSync(source, "utf8");
}

function loadSkillConfig(cwd) {
  const path = join(cwd, CONFIG_FILE);
  if (!existsSync(path)) return { version: 1, installed: [], exposed: {} };
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeSkillConfig(cwd, config, dryRun) {
  if (dryRun) return;
  const path = join(cwd, CONFIG_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2), "utf8");
}

function ensureKnownSkill(id) {
  if (!SKILL_IDS.includes(id)) throw new Error(`unknown skill: ${id}`);
}

export function listSkills(cwd = process.cwd()) {
  const config = loadSkillConfig(cwd);
  return SKILL_IDS.map(id => ({
    id,
    installed: config.installed.includes(id),
    exposed: Object.entries(config.exposed || {})
      .filter(([, ids]) => Array.isArray(ids) && ids.includes(id))
      .map(([platform]) => platform)
  }));
}

export function addSkill(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const id = opts.skill;
  ensureKnownSkill(id);
  const body = loadSkillSource(cwd, id);
  const target = repoSkillPath(cwd, id);
  const config = loadSkillConfig(cwd);

  if (!opts.dryRun) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body, "utf8");
  }

  if (!config.installed.includes(id)) config.installed.push(id);
  writeSkillConfig(cwd, config, opts.dryRun);
  return { id, target };
}

function exposeClaude(cwd, ids, dryRun) {
  for (const id of ids) {
    const body = readFileSync(repoSkillPath(cwd, id), "utf8");
    const target = join(cwd, ".claude", "skills", id, "SKILL.md");
    if (!dryRun) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body, "utf8");
    }
  }
}

function exposeCursor(cwd, ids, dryRun) {
  const target = join(cwd, ".cursor", "rules", "deuk-agent-skills.mdc");
  const body = [
    "---",
    "description: \"DeukAgentRules skill pointers\"",
    "globs: [\"**/*\"]",
    "alwaysApply: false",
    "---",
    "# DeukAgentRules Skills",
    "",
    "These are thin behavior playbooks. They do not override `core-rules/AGENTS.md`, TDW, APC, Phase Gate, or PROJECT_RULE.md.",
    "",
    ...ids.map(id => `- ${id}: .deuk-agent/skills/${id}/SKILL.md`),
    ""
  ].join("\n");
  if (!dryRun) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body, "utf8");
  }
}

export function exposeSkills(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const platform = String(opts.platform || "").toLowerCase();
  if (!["claude", "cursor"].includes(platform)) throw new Error("skill expose requires --platform claude|cursor");

  const config = loadSkillConfig(cwd);
  const ids = config.installed || [];
  if (ids.length === 0) throw new Error("no skills installed; run skill add first");
  for (const id of ids) {
    if (!existsSync(repoSkillPath(cwd, id))) addSkill({ cwd, skill: id, dryRun: opts.dryRun });
  }

  if (platform === "claude") exposeClaude(cwd, ids, opts.dryRun);
  if (platform === "cursor") exposeCursor(cwd, ids, opts.dryRun);

  config.exposed = config.exposed || {};
  config.exposed[platform] = Array.from(new Set([...(config.exposed[platform] || []), ...ids]));
  writeSkillConfig(cwd, config, opts.dryRun);
  return { platform, ids };
}

export function lintSkills(cwd = process.cwd()) {
  const paths = [];
  for (const root of [join(cwd, SKILL_ROOT), join(cwd, REPO_SKILL_TEMPLATE_ROOT), join(cwd, AGENT_ROOT_DIR, "skills")]) {
    if (!existsSync(root)) continue;
    for (const id of readdirSync(root)) {
      const path = join(root, id, "SKILL.md");
      if (existsSync(path)) paths.push(path);
    }
  }

  const violations = [];
  const forbidden = [/ignore ticket/i, /skip verification/i, /override (tdw|apc|phase gate)/i, /edit generated output directly/i];
  for (const path of paths) {
    const body = readFileSync(path, "utf8");
    if (!/Authority:.*core-rules\/AGENTS\.md/i.test(body)) violations.push(`${path}: missing authority line`);
    for (const pattern of forbidden) {
      if (pattern.test(body)) violations.push(`${path}: forbidden phrase ${pattern}`);
    }
  }
  return { ok: violations.length === 0, paths, violations };
}

export async function runSkill(action, opts = {}) {
  if (action === "list") {
    const rows = listSkills(opts.cwd);
    if (opts.json) console.log(JSON.stringify(rows, null, 2));
    else rows.forEach(row => console.log(`${row.id} installed=${row.installed ? "yes" : "no"} exposed=${row.exposed.join(",") || "-"}`));
    return;
  }
  if (action === "add") {
    const result = addSkill(opts);
    console.log(`skill added: ${result.id}`);
    return;
  }
  if (action === "expose") {
    const result = exposeSkills(opts);
    console.log(`skills exposed: ${result.platform} ${result.ids.join(",")}`);
    return;
  }
  if (action === "lint") {
    const result = lintSkills(opts.cwd);
    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.ok ? "skill:lint ok" : `skill:lint failed ${result.violations.length}`);
    if (!result.ok) throw new Error(result.violations.join("\n"));
    return;
  }
  throw new Error("Unknown skill action: " + action);
}
