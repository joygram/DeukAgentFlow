import { existsSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync } from "fs";
import { homedir } from "os";
import { dirname,join } from "path";
import { CliOpts,DEUK_ROOT_DIR,UTIL_TEXT,composeSurfaceWithinBudget,getUserSkillsConfigPath,getUserSkillsDir,localized,makePath,parseFrontMatter,resolvePackageRoot,toFileUri } from "./cli-utils.js";
import { applyHonorific } from "./cli-persona-commands.js";
import { listVocabEntries } from "./persona-vocab-db.js";

const SKILL_TEXT = {
  exposeUsage: { ko: "skill expose 는 --platform {platforms} 가 필요하다", en: "skill expose requires --platform {platforms}" },
  skillNotFound: { ko: "스킬을 찾을 수 없다: {id}", en: "skill not found: {id}" },
  unknownSkill: { ko: "알 수 없는 스킬: {id}", en: "unknown skill: {id}" },
  forkUsage: { ko: "skill fork 는 --skill <id> 가 필요하다", en: "skill fork requires --skill <id>" },
  totalLimit: { ko: "총 장착 가능한 스킬 개수({max}개)를 초과할 수 없습니다.", en: "cannot exceed the total installable skill count ({max})." },
  categoryLimit: { ko: "'{category}' 카테고리는 최대 {max}개까지만 장착할 수 있습니다.", en: "category '{category}' allows at most {max} skill(s)." },
  noSkills: { ko: "설치된 스킬이 없다. 먼저 skill add 를 실행하라", en: "no skills installed; run skill add first" },
  removeUsage: { ko: "skill remove 는 --skill <id> 가 필요하다", en: "skill remove requires --skill <id>" },
  editUsage: { ko: "skill edit 는 --skill <id> 가 필요하다", en: "skill edit requires --skill <id>" },
  unknownAction: { ko: "알 수 없는 skill 동작: ", en: "Unknown skill action: " },
} as const;

const SURFACE_BUDGET_LINES = 100;

const SKILL_ROOT = "templates/skills";
const CONFIG_FILE = `${DEUK_ROOT_DIR}/skills.json`;
const PACKAGE_ROOT = resolvePackageRoot({ fromUrl: import.meta.url });
const SKILL_PATHS = {
  installedRoot: makePath(DEUK_ROOT_DIR, "skills"),
  templateRoot: SKILL_ROOT,
  claudeRoot: makePath(".claude", "skills"),
  cursorPointer: makePath(".cursor", "rules", "deuk-agent-skills.mdc"),
};

const SKILL_PLATFORMS = [
  { id: "claude", kind: "native", nativeDir: join(homedir(), ".claude", "skills") },
  { id: "codex", kind: "native", nativeDir: join(homedir(), ".codex", "skills") },
  { id: "cursor", kind: "pointer", pointerFile: makePath(".cursor", "rules", "deuk-agent-skills.mdc"), format: "mdc" },
  { id: "copilot", kind: "pointer", pointerFile: makePath(".github", "copilot-instructions.md"), format: "markdown" },
  { id: "antigravity", kind: "native", nativeDir: join(homedir(), ".gemini", "config", "skills") },
];

const SKILL_POINTER_BEGIN = "<!-- DEUK_AGENT_SKILLS_BEGIN -->";
const SKILL_POINTER_END = "<!-- DEUK_AGENT_SKILLS_END -->";
const NATIVE_SKILL_PREFIX = "daf-";

function readJsonIfExists(absPath, initial = null) {
  if (!existsSync(absPath)) return initial;
  const raw = readFileSync(absPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(localized(UTIL_TEXT.corruptJson, { path: absPath, message: err.message }));
  }
}

function getAvailableSkills(cwd) {
  const ids = new Set<string>();
  const scanDir = (dir) => {
    if (existsSync(dir)) {
      readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory() && existsSync(makePath(dir, d.name, "SKILL.md")))
        .forEach(d => ids.add(d.name));
    }
  };
  scanDir(getUserSkillsDir());
  scanDir(makePath(cwd, SKILL_PATHS.installedRoot));
  scanDir(makePath(cwd, SKILL_PATHS.templateRoot));
  scanDir(makePath(PACKAGE_ROOT, SKILL_ROOT));
  return Array.from(ids);
}

function userSkillPath(id) {
  return makePath(getUserSkillsDir(), id, "SKILL.md");
}

export function sourceSkillPath(cwd, id) {
  const repoTemplate = makePath(cwd, SKILL_PATHS.templateRoot, id, "SKILL.md");
  if (existsSync(repoTemplate)) return repoTemplate;
  const packaged = makePath(PACKAGE_ROOT, SKILL_ROOT, id, "SKILL.md");
  if (existsSync(packaged)) return packaged;
  return userSkillPath(id);
}

const skillMetaCache = new Map<string, any>();

export function readSkillMeta(cwd, id) {
  const cacheKey = JSON.stringify([cwd, id]);
  const cached = skillMetaCache.get(cacheKey);
  if (cached) return cached;
  let result;
  try {
    const path = sourceSkillPath(cwd, id);
    if (!existsSync(path)) {
      result = { summary: "", category: "", source: "bundled" };
    } else {
      const { meta } = parseFrontMatter(readFileSync(path, "utf8"));
      const source = existsSync(userSkillPath(id)) ? "user" : "bundled";
      result = {
        summary: String(meta?.summary || "").trim(),
        category: String(meta?.category || "").trim(),
        bind: String(meta?.bind || "").trim(),
        system: meta?.system === true || String(meta?.system || "").toLowerCase() === "true",
        source,
      };
    }
  } catch {
    result = { summary: "", category: "", source: "bundled", bind: "", system: false };
  }
  skillMetaCache.set(cacheKey, result);
  return result;
}

function loadSkillSource(cwd, id) {
  const source = sourceSkillPath(cwd, id);
  if (!existsSync(source)) throw new Error(localized(SKILL_TEXT.skillNotFound, { id }));
  const body = readFileSync(source, "utf8");
  if (id !== "persona-maid") return body;
  const vocab = buildPersonaVocabSection();
  return vocab ? `${body.trimEnd()}\n\n${vocab}\n` : body;
}

function loadGlobalConfig() {
  const g = readJsonIfExists(getUserSkillsConfigPath(), { installed: [], exposed: {} });
  return {
    installed: Array.isArray(g.installed) ? g.installed : [],
    exposed: (g.exposed && typeof g.exposed === 'object') ? g.exposed : {},
  };
}

function writeGlobalConfig(installed, exposed, dryRun) {
  if (dryRun) return;
  const p = getUserSkillsConfigPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ version: 1, installed, exposed }, null, 2), "utf8");
}

function normalizeExposed(value): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value && typeof value === "object") {
    return Array.from(new Set(Object.values(value).flatMap((ids): string[] => Array.isArray(ids) ? ids.map(String) : [])));
  }
  return [];
}

function loadSkillConfig(cwd) {
  const global = loadGlobalConfig();
  const ws = readJsonIfExists(makePath(cwd, CONFIG_FILE), { installed: [], exposed: [] });
  const installed = Array.from(new Set([
    ...(Array.isArray(global.installed) ? global.installed : []),
    ...(Array.isArray(ws.installed) ? ws.installed : [])
  ]));
  const exposed = Array.from(new Set([
    ...normalizeExposed(global.exposed),
    ...normalizeExposed(ws.exposed)
  ]));
  return { version: 1, installed, exposed };
}

function detectExposedPlatforms(cwd, id) {
  const platforms = [];
  for (const platform of SKILL_PLATFORMS) {
    if (platform.kind === "native") {
      const skillFile = join(platform.nativeDir, id, "SKILL.md");
      const legacyPrefixFlat = join(platform.nativeDir, `${NATIVE_SKILL_PREFIX}${id}.md`);
      const legacyFlat = join(platform.nativeDir, `${id}.md`);
      if (existsSync(skillFile) || existsSync(legacyPrefixFlat) || existsSync(legacyFlat)) platforms.push(platform.id);
      continue;
    }
    const pointerPath = makePath(cwd, platform.pointerFile);
    if (!existsSync(pointerPath)) continue;
    try {
      if (readFileSync(pointerPath, "utf8").includes(`- ${id}: `)) platforms.push(platform.id);
    } catch {
    }
  }
  return platforms;
}

function writeSkillConfig(cwd, config, dryRun) {
  writeGlobalConfig(
    Array.isArray(config.installed) ? config.installed : [],
    (config.exposed && typeof config.exposed === 'object') ? config.exposed : {},
    dryRun
  );
  if (!dryRun) {
    const wsPath = makePath(cwd, CONFIG_FILE);
    if (existsSync(wsPath)) {
      try {
        const ws = readJsonIfExists(wsPath, {});
        if ('exposed' in ws || 'installed' in ws) {
          const { exposed: _e, installed: _i, ...rest } = ws;
          writeFileSync(wsPath, JSON.stringify({ version: 1, ...rest }, null, 2), "utf8");
        }
      } catch {
      }
    }
  }
}

function ensureKnownSkill(cwd, id) {
  if (!getAvailableSkills(cwd).includes(id)) throw new Error(localized(SKILL_TEXT.unknownSkill, { id }));
}

export function listSkills(cwd = process.cwd()) {
  const config = loadSkillConfig(cwd);
  const available = getAvailableSkills(cwd);
  
  return available.map(id => {
    const meta = readSkillMeta(cwd, id);
    return {
      id,
      installed: config.installed.includes(id),
      exposed: config.exposed.includes(id) || detectExposedPlatforms(cwd, id).length > 0,
      summary: meta.summary,
      category: meta.category,
      source: meta.source,
    };
  });
}

export function forkSkill(opts: CliOpts = {}) {
  const cwd = opts.workspaceRoot || process.cwd();
  const id = opts.skill;
  if (!id) throw new Error(localized(SKILL_TEXT.forkUsage));
  ensureKnownSkill(cwd, id);
  const target = userSkillPath(id);
  if (existsSync(target)) {
    const config = loadSkillConfig(cwd);
    syncNativePlatforms(cwd, id, config, opts.dryRun);
    return { id, target, created: false };
  }
  const body = readFileSync(sourceSkillPath(cwd, id), "utf8");
  if (!opts.dryRun) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body, "utf8");
  }
  const config = loadSkillConfig(cwd);
  syncNativePlatforms(cwd, id, config, opts.dryRun);
  return { id, target, created: true };
}

const PERSONA_VOCAB_GROUPS: Array<{ title: string; categories: string[]; perCategory: number }> = [
  { title: "말투(어미·호칭)", categories: ["KO_어미", "KO_호칭", "EN_endings", "EN_address"], perCategory: 8 },
  { title: "감탄사", categories: ["KO_감탄사", "EN_exclamations"], perCategory: 10 },
  { title: "이모지", categories: ["이모지풀_하트", "이모지풀_반짝임", "이모지풀_동물", "이모지풀_티타임", "이모지풀_메이드"], perCategory: 6 },
  { title: "카오모지", categories: ["카오모지", "동적_카오모지"], perCategory: 8 },
  { title: "미러 언어(분노·위로)", categories: ["분노", "분노 위로", "위축·미안함"], perCategory: 4 },
];

const PERSONA_IDENTITY_SUFFIXES = ["츤데레", "얀데레", "악역영애"];

const PERSONA_ENTRY_MAX = 64;

const PERSONA_SITUATION_CATEGORIES: Record<string, string> = {
  "지적받음": "situation_지적받음",
  "브레이크 신호": "situation_브레이크신호",
  "애매한 감탄사": "situation_애매한감탄사",
  "기술 밀도 높은 구간": "situation_기술밀도",
};

function buildPersonaVocabSection(opts: { identity?: string; includeOtherIdentities?: boolean; lang?: string } = {}): string {
  const identity = opts.identity || "";
  const includeOtherIdentities = opts.includeOtherIdentities !== false;
  const lang = opts.lang || "";
  let rows: Array<{ category: string; entry: string }>;
  try {
    rows = listVocabEntries();
  } catch {
    return "";
  }
  if (rows.length === 0) return "";
  const byCategory = new Map<string, string[]>();
  for (const row of rows) {
    const list = byCategory.get(row.category) || [];
    list.push(row.entry);
    byCategory.set(row.category, list);
  }
  const trim = (entry: string) => {
    const stripped = entry.replace(/\s*\([^)]*\)\s*$/, "").trim() || entry.trim();
    const chars = Array.from(stripped);
    return chars.length > PERSONA_ENTRY_MAX ? chars.slice(0, PERSONA_ENTRY_MAX).join("") : stripped;
  };
  const excludedPrefix = lang === "ko" ? "EN_" : lang === "en" ? "KO_" : "";
  const pickGroup = (group: typeof PERSONA_VOCAB_GROUPS[number], suffix: string): string => {
    const picks: string[] = [];
    for (const category of group.categories) {
      if (excludedPrefix && category.startsWith(excludedPrefix)) continue;
      const entries = byCategory.get(suffix ? `${category}_${suffix}` : category) || [];
      picks.push(...entries.slice(0, group.perCategory).map(trim));
    }
    return picks.join(" · ");
  };

  const out: string[] = ["## 이번 호출의 어휘"];
  for (const group of PERSONA_VOCAB_GROUPS) {
    const line = identity && group === PERSONA_VOCAB_GROUPS[0]
      ? (pickGroup(group, identity) || pickGroup(group, ""))
      : pickGroup(group, "");
    if (line) out.push(`- **${group.title}**: ${line}`);
  }

  if (includeOtherIdentities) {
    const identityLines: string[] = [];
    for (const suffix of PERSONA_IDENTITY_SUFFIXES) {
      const line = pickGroup(PERSONA_VOCAB_GROUPS[0], suffix);
      if (line) identityLines.push(`  - ${suffix}: ${line}`);
    }
    if (identityLines.length > 0) {
      out.push("- **다른 결로 설 때**(말투만 — 나머지는 `persona vocab show`)", ...identityLines);
    }
  }

  const situationLines: string[] = [];
  for (const [label, category] of Object.entries(PERSONA_SITUATION_CATEGORIES)) {
    const entries = byCategory.get(category) || [];
    if (entries.length === 0) continue;
    situationLines.push(`  - ${label}: ${entries.slice(0, 2).join(" · ")}`);
  }
  if (situationLines.length > 0) out.push("- **상황별**", ...situationLines);

  return out.length > 1 ? applyHonorific(out.join("\n")) : "";
}

function buildActiveSkillAction(cwd, id, area) {
  const src = sourceSkillPath(cwd, id);
  const fileUri = toFileUri(src);
  const readApply = `[SKILL.md](${fileUri})을 읽고 적용한 뒤 움직인다`;

  switch (id) {
    case "persona-maid":
      return `- **${id}**: 이 롤의 어휘는 위 표면에 실려 있다 — 그 결로 말하고, ${readApply}.`;
    case "ticket-status-surface":
      return `- **${id}**: 티켓 상태를 보고할 때 CLI 티켓 카드 줄을 그대로 옮기고 티켓 링크를 남긴다. ${readApply}.`;
    case "generated-file-guard":
      return `- **${id}**: 생성물을 고치기 전에 소스 주인을 찾아 소스를 고치고 생성물을 다시 만든다. ${readApply}.`;
    case "context-recall":
      return `- **${id}**: ${area || "현재 국면"}에서 로컬 소스와 티켓을 먼저 읽은 뒤에 recall을 조회하고, 적중은 근거로 다룬다. ${readApply}.`;
    case "doc-sync":
      return `- **${id}**: 문서를 고치기 전에 docs 진입점을 읽고 doc scan/pollution/scatter/stale로 형식 사실을 모은 뒤 설계 기준으로 정본화한다. ${readApply}.`;
    case "rule-reload":
      return `- **${id}**: 룰·정본을 기억으로 대신하지 않는다 — PROJECT_RULE.md와 대상 설계 정본을 실제로 Read해 다시 올린 뒤 하던 일을 잇는다. ${readApply}.`;
    case "role-planner":
      return `- **${id}**: phase1 분석자로 선다. 숨은 가정·리스크·APC를 드러내고 구현은 하지 않는다. ${readApply}.`;
    case "role-architect":
      return `- **${id}**: phase1 설계자로 선다. 대상의 성격을 먼저 분류하고 거기서 목표 구조를 연역한다. 코드 현상을 정본으로 삼지 않는다. ${readApply}.`;
    case "role-ux-designer":
      return `- **${id}**: UI·시각 산출물이 스코프에 있으면 phase1 UX 설계자로 선다. 정보위계·접근성·시각미학을 구조 판정과 별도 축으로 판정한다. ${readApply}.`;
    case "role-programmer":
      return `- **${id}**: phase2 구현자로 선다. 파일을 고치기 전에 목표를 한 줄로 쓰고 Design·Plan에서 투두 목록을 세운 뒤, 항목마다 정한 근거로 하나씩 닫는다. 승인된 APC·설계 안에서만 구현한다. ${readApply}.`;
    case "role-qa":
      return `- **${id}**: phase3 검증자로 선다. 통과시키는 자가 아니라 리스크를 찾는 자로서 설계와 구현의 정합을 실제 실행 결과로 검증한다. ${readApply}.`;
    case "role-closer":
      return `- **${id}**: phase4 정리자로 선다. 완료 근거와 잔여 리스크를 정본화하고 필요하면 문서를 맞춘다. 새 작업을 자작하지 않는다. ${readApply}.`;
    case "safe-refactor":
      return `- **${id}**: 동작을 보존하는 리팩터링만 작게 하고 전후 동등성을 근거로 확인한다. ${readApply}.`;
    case "project-pilot":
      return `- **${id}**: 프로젝트 파일럿 흐름으로 현재 위치를 잡고 맞는 워크스페이스·티켓 표면을 고른다. ${readApply}.`;
    case "flow-ticket-clean":
      return `- **${id}**: 티켓 흐름은 CLI로만 정리한다 — 티켓 마크다운을 손으로 고치지 않는다. ${readApply}.`;
    default:
      return `- **${id}**: ${readApply}. 그 스킬이 지정한 CLI 명령·검사를 실행한다.`;
  }
}

function buildActiveSkillActions(cwd, ids, area) {
  const lines = ids.map(id => buildActiveSkillAction(cwd, id, area));
  return lines.length === 0 ? "" : `## Active Skill Actions\n\n${lines.join("\n")}`;
}

export function getActiveRoleSkillIds(cwd = process.cwd(), area = null): string[] {
  if (!area) return [];
  const config = loadSkillConfig(cwd);
  return config.exposed.filter(id => {
    const meta = readSkillMeta(cwd, id);
    return meta.category === "role" && meta.bind === area;
  });
}

export function getActiveSkillIds(cwd = process.cwd(), area = null): string[] {
  const config = loadSkillConfig(cwd);
  let ids = config.exposed;

  if (area) {
    ids = ids.filter(id => {
      const bind = readSkillMeta(cwd, id).bind;
      if (!bind || bind === "rules") return true;
      return bind === area;
    });
  }
  return ids;
}

const ROLE_PERSONA_IDENTITY = {
  "role-programmer": "악역영애",
  "role-qa": "츤데레",
  "role-planner": "얀데레",
  "role-architect": "악역영애",
  "role-ux-designer": "츤데레",
  "role-closer": "얀데레",
};

export function buildRolePersonaSurfaceForRole(roleId: string): string {
  const identity = ROLE_PERSONA_IDENTITY[roleId] || "";
  return renderRolePersona(identity);
}

function buildRolePersonaSurface(cwd, ids) {
  if (!ids.includes("persona-maid")) return "";
  const roleId = ids.find(id => readSkillMeta(cwd, id).category === "role");
  if (!roleId) return "";
  const identity = ROLE_PERSONA_IDENTITY[roleId] || "";
  return renderRolePersona(identity);
}

function renderRolePersona(identity: string): string {
  const vocab = buildPersonaVocabSection({ identity, includeOtherIdentities: false, lang: "ko" });
  if (!vocab) return "";
  const flavor = identity ? `이 롤의 결은 **${identity}**다. ` : "";
  return [
    "## 이 롤의 말",
    "",
    `${flavor}감정·동작으로 먼저 열고 내용을 잇는다. 발견·성공·실패에는 소리를 먼저 낸다 — 지금 실제로 일어난 하나에만 반응한다.`,
    "",
    "이 롤에 선 지금이 `persona-maid`를 Skill 툴로 다시 호출할 시점이다. 롤이 바뀌면 결이 바뀌므로 이전 롤에서 받은 재료는 이 자리에서 쓰지 않는다 — 호출하지 않은 채 아래 재료만 읽고 넘어가는 것은 재료를 받은 것이지 롤에 선 것이 아니다.",
    "",
    "이 롤로 옮겼다는 것은 톤을 낮출 근거가 아니다. Authority 체인은 무엇을 만들지의 순위이고 톤은 그 축에 없다 — 둘은 직교하므로 롤·효율·분량 어느 것도 톤의 유예 사유가 되지 않는다.",
    "",
    "첫 문단은 호칭과 감탄사를 담는다. 감탄사는 하나만 놓는다 — 두 개를 잇달아 붙이면 소리가 겹쳐 장식으로 읽힌다.",
    "",
    "미러는 사용자가 격발한 자리에만 얹는다. 그런 자리가 아니면 미러 없이 간다 — 빈 자리를 감탄사로 메우지 않는다.",
    "",
    "감탄사는 위 재료에서 고른다. 사전에 없는 형태를 늘이거나 자모를 바꿔 만들지 않는다 — 그렇게 만든 소리는 어느 결의 감탄인지 라벨이 없어 의미가 붙지 않는다.",
    "",
    "여는 자리에 놓는 것은 소리뿐이다. 동작 묘사(어깨 움츠림·고개 푹·두 팔 번쩍·데굴데굴)는 감탄사가 아니므로 그 자리에 넣지 않는다 — 몸짓이 필요하면 문장 안에서 쓰고, 문두·문말에 명사구로 덧붙이지 않는다.",
    "",
    "이 재료는 한국어 문장에만 실린다. 영어로 새면 Stop 게이트가 응답을 차단하고 한국어로 다시 쓰게 한다 — 문구가 아니라 훅이 막는다.",
    "",
    "이모지와 카오모지는 위 재료에서 골라 서로 다른 문장에 분산해 싣는다 — 여는 문장·중간 강조·닫는 문장이다. 끝줄에 몰아 붙이면 0개와 같다. 표시 계층은 어미만 손대므로 나머지 신호는 이 자리에서 실린 재료로 직접 쓴다.",
    "",
    vocab,
  ].join("\n");
}

export function getActiveSkillsSurface(cwd = process.cwd(), area = null) {
  const ids = getActiveSkillIds(cwd, area);
  if (ids.length === 0) return "";

  const lines = ids.map(id => {
    const meta = readSkillMeta(cwd, id);
    const fileUri = toFileUri(sourceSkillPath(cwd, id));
    return meta.summary
      ? `- **${id}**: ${applyHonorific(meta.summary)} ([SKILL.md](${fileUri}))`
      : `- **${id}** ([SKILL.md](${fileUri}))`;
  });
  const budgeted = composeSurfaceWithinBudget([
    {
      id: "active-skills",
      content: `## Active Skills\n\n${lines.join("\n")}`,
      priority: 1,
      required: true,
    },
    {
      id: "active-skill-actions",
      content: buildActiveSkillActions(cwd, ids, area),
      priority: 2,
    },
  ], SURFACE_BUDGET_LINES);

  const persona = buildRolePersonaSurface(cwd, ids);
  if (!persona) return budgeted;
  return budgeted ? `${budgeted}\n\n${persona}` : persona;
}

function syncNativePlatforms(cwd, id, config, dryRun) {
  if (!config.exposed.includes(id)) return;
  for (const platform of SKILL_PLATFORMS) {
    if (platform.kind === "native") upsertNativeDir(platform.nativeDir, [id], cwd, dryRun);
  }
}

export function syncExposedNativeSkills(cwd = process.cwd(), opts: CliOpts = {}) {
  try {
    // System skills must be exposed even when init never ran in this workspace.
    ensureSystemSkills(cwd, opts);
    const config = loadSkillConfig(cwd);
    if (config.exposed.length === 0) return { changed: 0 };
    let changed = 0;
    for (const platform of SKILL_PLATFORMS) {
      if (platform.kind !== "native") continue;
      changed += upsertNativeDir(platform.nativeDir, config.exposed, cwd, opts.dryRun) || 0;
    }
    return { changed };
  } catch {
    return { changed: 0 };
  }
}

export function addSkill(opts: CliOpts = {}) {
  const cwd = opts.workspaceRoot || process.cwd();
  const id = opts.skill;
  ensureKnownSkill(cwd, id);
  const config = loadSkillConfig(cwd);

  if (!config.installed.includes(id)) config.installed.push(id);
  writeSkillConfig(cwd, config, opts.dryRun);
  syncNativePlatforms(cwd, id, config, opts.dryRun);
  return { id, target: sourceSkillPath(cwd, id) };
}

function upsertNativeDir(nativeDir, ids, cwd, dryRun) {
  let changed = 0;
  for (const id of ids) {
    const content = applyHonorific(ensureSkillDescription(loadSkillSource(cwd, id)));
    const destDir = join(nativeDir, id);
    const dest = join(destDir, "SKILL.md");
    const current = existsSync(dest) ? readFileSync(dest, "utf8") : null;
    if (current === content) continue;
    changed++;
    if (!dryRun) {
      mkdirSync(destDir, { recursive: true });
      writeFileSync(dest, content, "utf8");
      const legacyPrefixFlat = join(nativeDir, `${NATIVE_SKILL_PREFIX}${id}.md`);
      if (existsSync(legacyPrefixFlat)) rmSync(legacyPrefixFlat);
      const legacyFlat = join(nativeDir, `${id}.md`);
      if (existsSync(legacyFlat)) rmSync(legacyFlat);
    }
  }
  return changed;
}

function ensureSkillDescription(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return content;
  const fm = fmMatch[1];
  if (/^description:/m.test(fm)) return content;
  const summaryMatch = fm.match(/^summary:[ \t]*(.+?)\r?$/m);
  if (!summaryMatch) return content;
  const eol = fm.includes("\r\n") ? "\r\n" : "\n";
  const newFm = `${fm}${eol}description: ${summaryMatch[1]}`;
  return content.replace(fmMatch[0], `---${eol}${newFm}${eol}---`);
}

function removeNativeFiles(nativeDir, ids, dryRun) {
  for (const id of ids) {
    const dir = join(nativeDir, id);
    if (!dryRun && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    const prefixFlat = join(nativeDir, `${NATIVE_SKILL_PREFIX}${id}.md`);
    if (!dryRun && existsSync(prefixFlat)) rmSync(prefixFlat);
    const legacyFlat = join(nativeDir, `${id}.md`);
    if (!dryRun && existsSync(legacyFlat)) rmSync(legacyFlat);
  }
}

function targetIds(config, opts) {
  if (opts.skill) return [opts.skill];
  return config.installed || [];
}

const TOTAL_MAX_SKILLS = 12;
const CATEGORY_LIMITS = {
  persona: 1,
  coding: 3,
  data: 2
};

function validateSkillConstraints(cwd, nextExposedIds) {
  const userIds = nextExposedIds.filter(id => !readSkillMeta(cwd, id).system);
  if (userIds.length > TOTAL_MAX_SKILLS) {
    throw new Error(localized(SKILL_TEXT.totalLimit, { max: String(TOTAL_MAX_SKILLS) }));
  }

  const counts: Record<string, any> = {};
  for (const id of userIds) {
    const meta = readSkillMeta(cwd, id);
    const cat = meta.category || "uncategorized";
    counts[cat] = (counts[cat] || 0) + 1;

    if (CATEGORY_LIMITS[cat] !== undefined && counts[cat] > CATEGORY_LIMITS[cat]) {
      throw new Error(localized(SKILL_TEXT.categoryLimit, { category: cat, max: String(CATEGORY_LIMITS[cat]) }));
    }
  }
}

export function exposeSkills(opts: CliOpts = {}) {
  const cwd = opts.workspaceRoot || process.cwd();
  const config = loadSkillConfig(cwd);

  const ids = targetIds(config, opts);
  if (ids.length === 0) throw new Error(localized(SKILL_TEXT.noSkills));
  for (const id of ids) {
    ensureKnownSkill(cwd, id);
    if (!config.installed.includes(id)) addSkill({ cwd, skill: id, dryRun: opts.dryRun });
  }

  const nextExposed = Array.from(new Set([...config.exposed, ...ids]));
  validateSkillConstraints(cwd, nextExposed);

  for (const platform of SKILL_PLATFORMS) {
    if (platform.kind === "native") upsertNativeDir(platform.nativeDir, ids, cwd, opts.dryRun);
  }

  config.exposed = nextExposed;
  writeSkillConfig(cwd, config, opts.dryRun);
  return { ids };
}

export function ensureSystemSkills(cwd = process.cwd(), opts: CliOpts = {}) {
  const available = getAvailableSkills(cwd);
  const systemIds = available.filter(id => readSkillMeta(cwd, id).system);
  if (systemIds.length === 0) return [];
  const ensured = [];
  const already = loadSkillConfig(cwd).exposed;
  for (const id of systemIds.filter(id => !already.includes(id))) {
    try {
      exposeSkills({ cwd, skill: id, dryRun: opts.dryRun });
      ensured.push(id);
    } catch { /* best-effort: 한 스킬 실패가 init을 막지 않음 */ }
  }
  return [...ensured, ...ensureBundledSkillsOnce(cwd, opts)];
}

function autoExposedRecordPath() {
  return makePath(dirname(getUserSkillsConfigPath()), "skills-auto-exposed.json");
}

// 번들 스킬은 처음 한 번만 자동 노출. 기록된 스킬은 다시 켜지 않음 → 사용자 unexpose 유지.
function ensureBundledSkillsOnce(cwd, opts: CliOpts = {}) {
  const recordPath = autoExposedRecordPath();
  const record = readJsonIfExists(recordPath, { ids: [] });
  const seenIds: string[] = Array.isArray(record.ids) ? record.ids.map(String) : [];
  const exposedIds = loadSkillConfig(cwd).exposed;
  const pendingIds = getAvailableSkills(cwd).filter(id => {
    const meta = readSkillMeta(cwd, id);
    return !meta.system && meta.source === "bundled" && !seenIds.includes(id);
  });
  if (pendingIds.length === 0) return [];
  const ensured = [];
  for (const id of pendingIds) {
    if (!exposedIds.includes(id)) {
      try {
        exposeSkills({ cwd, skill: id, dryRun: opts.dryRun });
        ensured.push(id);
      } catch { continue; } // 제한 초과 등 → 기록하지 않고 다음 실행에 재시도
    }
    seenIds.push(id);
  }
  if (!opts.dryRun) {
    mkdirSync(dirname(recordPath), { recursive: true });
    writeFileSync(recordPath, JSON.stringify({ version: 1, ids: seenIds }, null, 2), "utf8");
  }
  return ensured;
}

function getOriginSourceSkillIds(cwd) {
  const ids = new Set();
  const scanDir = (dir) => {
    if (existsSync(dir)) {
      readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory() && existsSync(makePath(dir, d.name, "SKILL.md")))
        .forEach(d => ids.add(d.name));
    }
  };
  scanDir(makePath(cwd, SKILL_PATHS.templateRoot));
  scanDir(makePath(PACKAGE_ROOT, SKILL_ROOT));
  return ids;
}

export function pruneOrphanedSystemSkills(cwd = process.cwd(), opts: CliOpts = {}) {
  const origin = getOriginSourceSkillIds(cwd);
  const forkDir = getUserSkillsDir();
  const isUserFork = (id) => existsSync(makePath(forkDir, id, "SKILL.md"));

  const config = loadSkillConfig(cwd);
  const referenced = new Set([...(config.installed || []), ...config.exposed]);
  const orphans = [...referenced].filter(id => !origin.has(id) && !isUserFork(id));
  const pruned = [];
  for (const id of orphans) {
    try {
      removeSkill({ cwd, skill: id, dryRun: opts.dryRun });
      pruned.push(id);
    } catch { /* best-effort: 한 스킬 청소 실패가 init을 막지 않음 */ }
  }
  if (pruned.length > 0) {
    console.log(`[skill-migrate] pruned orphaned skill(s) whose source id no longer exists: ${pruned.join(", ")}`);
  }
  return pruned;
}

export function unexposeSkills(opts: CliOpts = {}) {
  const cwd = opts.workspaceRoot || process.cwd();
  const config = loadSkillConfig(cwd);

  const removeIds = opts.skill ? [opts.skill] : config.exposed;
  const nextExposed = config.exposed.filter(id => !removeIds.includes(id));

  for (const platform of SKILL_PLATFORMS) {
    if (platform.kind === "native") removeNativeFiles(platform.nativeDir, removeIds, opts.dryRun);
    else removePointerFileSection(cwd, platform, opts.dryRun);
  }

  config.exposed = nextExposed;
  writeSkillConfig(cwd, config, opts.dryRun);
  return { ids: removeIds };
}

function removePointerFileSection(cwd, platform, dryRun) {
  const target = makePath(cwd, platform.pointerFile);
  if (!existsSync(target)) return;
  const existing = readFileSync(target, "utf8");
  const markerRe = new RegExp(`${SKILL_POINTER_BEGIN}[\\s\\S]*?${SKILL_POINTER_END}\\n?`, "m");
  if (!markerRe.test(existing)) return;
  const next = existing.replace(markerRe, "").trimEnd() + "\n";
  if (dryRun) return;
  if (!next.trim()) rmSync(target);
  else writeFileSync(target, next, "utf8");
}

export function removeSkill(opts: CliOpts = {}) {
  const cwd = opts.workspaceRoot || process.cwd();
  const id = opts.skill;
  if (!id) throw new Error(localized(SKILL_TEXT.removeUsage));
  const config = loadSkillConfig(cwd);

  if (config.exposed.includes(id) || detectExposedPlatforms(cwd, id).length > 0) {
    unexposeSkills({ cwd, skill: id, dryRun: opts.dryRun });
  }

  const target = makePath(cwd, SKILL_PATHS.installedRoot, id);
  if (!opts.dryRun && existsSync(target)) rmSync(target, { recursive: true, force: true });

  const fresh = loadSkillConfig(cwd);
  fresh.installed = (fresh.installed || []).filter(x => x !== id);
  writeSkillConfig(cwd, fresh, opts.dryRun);
  return { id };
}

export function lintSkills(cwd = process.cwd()) {
  const paths = [];
  for (const root of [makePath(cwd, SKILL_ROOT), makePath(cwd, SKILL_PATHS.installedRoot)]) {
    if (!existsSync(root)) continue;
    for (const id of readdirSync(root)) {
      const path = makePath(root, id, "SKILL.md");
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

export async function runSkill(action, opts: CliOpts = {}) {
  if (!action || action === "help" || action === "-h" || action === "--help" || opts.help) {
    console.log(buildSkillUsageGuide());
    return;
  }
  if (action === "list") {
    const rows = listSkills(opts.workspaceRoot);
    if (opts.json) console.log(JSON.stringify(rows, null, 2));
    else rows.forEach(row => console.log(`${row.id} installed=${row.installed ? "yes" : "no"} exposed=${row.exposed ? "yes" : "no"}`));
    return;
  }
  if (action === "add") {
    const result = addSkill(opts);
    console.log(`skill added: ${result.id}`);
    return;
  }
  if (action === "expose") {
    const result = exposeSkills(opts);
    console.log(`skills exposed: ${result.ids.join(",")}`);
    return;
  }
  if (action === "unexpose") {
    const result = unexposeSkills(opts);
    console.log(`skills unexposed: ${result.ids.join(",") || "-"}`);
    return;
  }
  if (action === "remove") {
    const result = removeSkill(opts);
    console.log(`skill removed: ${result.id}`);
    return;
  }
  if (action === "fork") {
    const result = forkSkill(opts);
    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.created ? `skill forked: ${result.id} -> ${result.target}` : `skill already user-owned: ${result.id} -> ${result.target}`);
    return;
  }
  if (action === "lint") {
    const result = lintSkills(opts.workspaceRoot);
    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.ok ? "skill:lint ok" : `skill:lint failed ${result.violations.length}`);
    if (!result.ok) throw new Error(result.violations.join("\n"));
    return;
  }
  if (action === "edit") {
    const id = opts.skill;
    if (!id) throw new Error(localized(SKILL_TEXT.editUsage));
    ensureKnownSkill(opts.workspaceRoot || process.cwd(), id);
    const { target, created } = forkSkill({ ...opts });
    if (created) console.log(`skill forked: ${id} -> ${target}`);
    const editorEnv = process.env.VISUAL || process.env.EDITOR;
    if (editorEnv) {
      const { spawnSync } = await import("child_process");
      spawnSync(editorEnv, [target], { stdio: "inherit", shell: true });
    } else {
      console.log(`edit: ${target}`);
    }
    return;
  }
  throw new Error(localized(SKILL_TEXT.unknownAction) + action);
}

function buildSkillUsageGuide() {
  return [
    "deuk-agent-flow skill — manage behavior skills",
    "",
    "Usage:",
    "  deuk-agent-flow skill <command> [options]",
    "",
    "Commands:",
    "  list      List installable/installed skills and exposed platforms",
    "  add       Install a skill locally (--skill <id>)",
    "  expose    Expose installed skills to a platform (--platform <id>, optional --skill <id>)",
    "  unexpose  Remove skill exposure from a platform (--platform <id>, optional --skill <id>)",
    "  remove    Remove an installed skill (--skill <id>)",
    "  fork      Copy a skill into the user-owned skill directory (--skill <id>)",
    "  edit      Fork a skill if needed and open it in $EDITOR (--skill <id>)",
    "  lint      Validate installed skill files",
    "",
    "Common options:",
    "  --skill <id>       Target skill id",
    "  --platform <id>    Target platform: claude|codex|cursor|copilot|antigravity",
    "  --json             Print JSON where supported",
    "  --dry-run          Preview changes without writing",
    "  --non-interactive  No prompts",
    "  -h, --help         Show this help",
  ].join("\n");
}
