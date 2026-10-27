import { existsSync,readFileSync } from "fs";
import { CODING_STAGES,isCodingStage,rulesForStage,type CodingStage } from "./cli-rule-registry.js";
import { localized,makePath,normalizeRegistryPath,resolvePackageRoot,resolveWorkspaceTarget } from "./cli-utils.js";

const CODING_TEXT = {
  noRulesForStage: {
    ko: "coding step: stage '{stage}' 에 걸리는 규칙이 없다 — PROJECT_RULE.md 의 규칙에 @{stage} 선언이 빠졌다.",
    en: "coding step: no rule matches stage '{stage}' — the rules in PROJECT_RULE.md are missing an @{stage} declaration.",
  },
  stageOrTargetRequired: { ko: "coding step: --stage 또는 --target 이 필요하다 ({stages}).", en: "coding step: --stage or --target is required ({stages})." },
  stageRequired: { ko: "coding step: --stage 는 필수다 ({stages}).", en: "coding step: --stage is required ({stages})." },
  unknownStage: { ko: "coding step: 알 수 없는 stage '{stage}' — 다음 중 하나여야 한다: {stages}.", en: "coding step: unknown stage '{stage}' — expected one of {stages}." },
  workspaceRequired: {
    ko: "coding step 은 --workspace 가 필요하다(레지스트리 기반). cwd 는 워크스페이스 해소에 절대 쓰이지 않는다.",
    en: "coding step requires --workspace (registry-backed). cwd is never used to resolve the workspace.",
  },
  ruleDetailsMissing: {
    ko: "coding step: 룰 세부 정본이 없다: {path} — 이 파일이 룰 제목 아래 얹을 세부 항목을 담는다.",
    en: "coding step: rule details canon not found: {path} — this file holds the detail items placed under each rule.",
  },
  workspaceNotFound: { ko: "coding step: 레지스트리에 워크스페이스가 없다: {workspace}", en: "coding step: workspace not found in registry: {workspace}" },
} as const;

const PACKAGE_ROOT = resolvePackageRoot({ fromUrl: import.meta.url });

const SKILL_SECTION_RE = /^##\s+(.*?)\s*\[([A-Z0-9-]+)\]\s*$/u;

type SkillSection = {
  ruleId: string;
  title: string;
  body: string[];
};

function readRuleDetailSections(detailsPath: string): SkillSection[] {
  if (!existsSync(detailsPath)) {
    throw new Error(localized(CODING_TEXT.ruleDetailsMissing, { path: detailsPath }));
  }
  const out: SkillSection[] = [];
  let current: SkillSection | null = null;
  for (const line of readFileSync(detailsPath, "utf8").split(/\r?\n/)) {
    const m = line.match(SKILL_SECTION_RE);
    if (m) {
      current = { ruleId: m[2], title: m[1], body: [] };
      out.push(current);
      continue;
    }
    if (line.startsWith("## ")) {
      current = null;
      continue;
    }
    if (current && line.trim()) current.body.push(line);
  }
  return out;
}

function ruleDetailsPath(bundleRoot: string): string {
  return makePath(bundleRoot, "templates", "rule-details.md");
}


export function buildCodingStep(
  workspaceRoot: string,
  bundleRoot: string,
  stage: CodingStage,
  targetPath: string,
): string {
  const rules = rulesForStage(workspaceRoot, stage);
  if (rules.length === 0) {
    throw new Error(localized(CODING_TEXT.noRulesForStage, { stage }));
  }

  const sections = readRuleDetailSections(ruleDetailsPath(bundleRoot));
  const knownIds = new Set(rules.map(r => r.id));
  const byRule = new Map<string, SkillSection[]>();
  for (const section of sections) {
    if (!knownIds.has(section.ruleId)) continue;
    if (!byRule.has(section.ruleId)) byRule.set(section.ruleId, []);
    byRule.get(section.ruleId)!.push(section);
  }

  const lines: string[] = [`<coding-step stage="${stage}"${targetPath ? ` target="${targetPath}"` : ""}>`];
  for (const rule of rules) {
    lines.push(`[${rule.id}] ${rule.directive}`);
    for (const section of byRule.get(rule.id) || []) {
      for (const body of section.body) lines.push(`  ${body.replace(/^-\s*/, "· ")}`);
    }
  }
  lines.push("</coding-step>");
  return lines.join("\n");
}

export function stageForTarget(targetPath: string): CodingStage {
  const path = String(targetPath || "").trim();
  if (!path) {
    throw new Error(localized(CODING_TEXT.stageOrTargetRequired, { stages: CODING_STAGES.join(" | ") }));
  }
  return existsSync(normalizeRegistryPath(path)) ? "modify" : "create";
}

export function parseStageArg(value: string): CodingStage {
  const stage = String(value || "").trim();
  if (!stage) {
    throw new Error(localized(CODING_TEXT.stageRequired, { stages: CODING_STAGES.join(" | ") }));
  }
  if (!isCodingStage(stage)) {
    throw new Error(localized(CODING_TEXT.unknownStage, { stage: String(stage), stages: CODING_STAGES.join(", ") }));
  }
  return stage;
}

export function runCodingStep(opts: any = {}): void {
  const targetPath = String(opts.target || opts.file || "").trim();
  const stage = opts.stage ? parseStageArg(String(opts.stage)) : stageForTarget(targetPath);
  if (!opts.workspace) {
    throw new Error(localized(CODING_TEXT.workspaceRequired));
  }
  const resolution = resolveWorkspaceTarget(String(opts.workspace), { homeDir: opts.homeDir });
  if (!resolution?.target) {
    throw new Error(localized(CODING_TEXT.workspaceNotFound, { workspace: String(opts.workspace) }));
  }
  console.log(buildCodingStep(String(resolution.target.path), PACKAGE_ROOT, stage, targetPath));
}
