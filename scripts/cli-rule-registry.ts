import { existsSync,readFileSync,writeFileSync } from "fs";
import { localized,makePath,resolveWorkspaceTarget } from "./cli-utils.js";

const RULE_TEXT = {
  stageRequired: { ko: "rule add: --stage 는 필수다 ({stages}, 쉼표로 여러 개).", en: "rule add: --stage is required ({stages}, comma-separated for multiple)." },
  unknownStage: { ko: "rule add: 알 수 없는 stage '{unknown}' — 다음 중 하나여야 한다: {stages}.", en: "rule add: unknown stage '{unknown}' — expected one of {stages}." },
  ruleFileNotFound: { ko: "rule add: PROJECT_RULE.md 를 찾을 수 없다: {path}", en: "rule add: PROJECT_RULE.md not found at {path}" },
  noAnchor: { ko: "rule add: 삽입 기준이 될 기존 룰 줄이 없다", en: "rule add: no existing rule lines to anchor insertion" },
  idRequired: { ko: "rule add: --rule 은 필수다 (예: --rule DR-05).", en: "rule add: --rule is required (e.g. --rule DR-05)." },
  directiveRequired: { ko: "rule add: --directive 는 필수다.", en: "rule add: --directive is required." },
  workspaceRequired: {
    ko: "rule add 는 --workspace 가 필요하다(레지스트리 기반). cwd 는 워크스페이스 해소에 절대 쓰이지 않는다.",
    en: "rule add requires --workspace (registry-backed). cwd is never used to resolve the workspace.",
  },
  workspaceNotFound: { ko: "rule add: 레지스트리에 워크스페이스가 없다: {workspace}", en: "rule add: workspace not found in registry: {workspace}" },
} as const;

export const CODING_STAGES = ["start", "create", "modify"] as const;
export type CodingStage = typeof CODING_STAGES[number];

export type RuleRecord = {
  id: string;
  stages: CodingStage[];
  directive: string;
};

const RULE_LINE_RE = /^-\s*\[([A-Z0-9-]+)\]\s*(?:@([a-z,\s]+))?\s*(.*)$/;

export function isCodingStage(value: string): value is CodingStage {
  return (CODING_STAGES as readonly string[]).includes(value);
}

export function parseRuleLine(line: string): RuleRecord | null {
  const m = String(line || "").match(RULE_LINE_RE);
  if (!m) return null;
  const directive = String(m[3] || "").trim();
  if (!directive) return null;
  const stages = String(m[2] || "")
    .split(",")
    .map(s => s.trim())
    .filter(isCodingStage);
  return { id: m[1], stages, directive };
}

export function formatRuleLine(rule: RuleRecord): string {
  const stages = rule.stages.length ? `@${rule.stages.join(",")} ` : "";
  return `- [${rule.id}] ${stages}${rule.directive}`;
}

export function projectRulePath(workspaceRoot: string): string {
  return makePath(workspaceRoot, "docs", "PROJECT_RULE.md");
}

export function readRules(workspaceRoot: string): RuleRecord[] {
  const path = projectRulePath(workspaceRoot);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map(parseRuleLine)
    .filter((r): r is RuleRecord => r !== null);
}

export function rulesForStage(workspaceRoot: string, stage: CodingStage): RuleRecord[] {
  return readRules(workspaceRoot).filter(r => r.stages.includes(stage));
}

export function parseStageList(value: string): CodingStage[] {
  const stages = String(value || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (stages.length === 0) {
    throw new Error(localized(RULE_TEXT.stageRequired, { stages: CODING_STAGES.join(" | ") }));
  }
  const unknown = stages.filter(s => !isCodingStage(s));
  if (unknown.length > 0) {
    throw new Error(localized(RULE_TEXT.unknownStage, { unknown: unknown.join(", "), stages: CODING_STAGES.join(", ") }));
  }
  return stages as CodingStage[];
}

export function writeRule(workspaceRoot: string, rule: RuleRecord): void {
  const path = projectRulePath(workspaceRoot);
  if (!existsSync(path)) throw new Error(localized(RULE_TEXT.ruleFileNotFound, { path }));
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const nextLine = formatRuleLine(rule);
  let replaced = false;
  const out = lines.map(line => {
    const parsed = parseRuleLine(line);
    if (!parsed || parsed.id !== rule.id) return line;
    replaced = true;
    return nextLine;
  });
  if (!replaced) {
    let lastRuleAt = -1;
    for (let i = 0; i < out.length; i++) if (parseRuleLine(out[i])) lastRuleAt = i;
    if (lastRuleAt === -1) throw new Error(localized(RULE_TEXT.noAnchor));
    out.splice(lastRuleAt + 1, 0, nextLine);
  }
  writeFileSync(path, out.join("\n"));
}

export function runRuleAdd(opts: any = {}): void {
  const id = String(opts.rule || "").trim();
  if (!id) throw new Error(localized(RULE_TEXT.idRequired));
  const directive = String(opts.directive || opts.text || "").trim();
  if (!directive) throw new Error(localized(RULE_TEXT.directiveRequired));
  const stages = parseStageList(String(opts.stage || ""));
  if (!opts.workspace) {
    throw new Error(localized(RULE_TEXT.workspaceRequired));
  }
  const resolution = resolveWorkspaceTarget(String(opts.workspace), { homeDir: opts.homeDir });
  if (!resolution?.target) {
    throw new Error(localized(RULE_TEXT.workspaceNotFound, { workspace: String(opts.workspace) }));
  }
  const rule: RuleRecord = { id, stages, directive };
  writeRule(String(resolution.target.path), rule);
  console.log(formatRuleLine(rule));
}
