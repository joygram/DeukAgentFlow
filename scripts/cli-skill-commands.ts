import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "fs";
import { dirname, join, relative } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { DEUK_ROOT_DIR, CliOpts, getUserSkillsConfigPath, getUserSkillsDir, makePath, parseFrontMatter, resolvePackageRoot } from "./cli-utils.js";

const SKILL_ROOT = "templates/skills";
const CONFIG_FILE = `${DEUK_ROOT_DIR}/skills.json`;
const PACKAGE_ROOT = resolvePackageRoot({ fromUrl: import.meta.url });
const SKILL_PATHS = {
  installedRoot: makePath(DEUK_ROOT_DIR, "skills"),
  templateRoot: SKILL_ROOT,
  claudeRoot: makePath(".claude", "skills"),
  cursorPointer: makePath(".cursor", "rules", "deuk-agent-skills.mdc"),
};

// 에이전트(플랫폼)별 스킬 노출 전략 레지스트리.
// kind "native": 에이전트 고유 스킬 디렉토리에 SKILL.md를 복사.
// kind "pointer": 에이전트 룰/인스트럭션 파일에 스킬 포인터 섹션을 주입.
const SKILL_PLATFORMS = [
  { id: "claude", kind: "native", nativeDir: join(homedir(), ".claude", "skills") },
  { id: "cursor", kind: "pointer", pointerFile: makePath(".cursor", "rules", "deuk-agent-skills.mdc"), format: "mdc" },
  { id: "codex", kind: "pointer", pointerFile: makePath(".codex", "AGENTS.md"), format: "markdown" },
  { id: "copilot", kind: "pointer", pointerFile: makePath(".github", "copilot-instructions.md"), format: "markdown" },
  { id: "antigravity", kind: "pointer", pointerFile: "GEMINI.md", format: "markdown" },
];

const SKILL_PLATFORM_IDS = SKILL_PLATFORMS.map(p => p.id);
const SKILL_POINTER_BEGIN = "<!-- DEUK_AGENT_SKILLS_BEGIN -->";
const SKILL_POINTER_END = "<!-- DEUK_AGENT_SKILLS_END -->";
// native 플랫폼 flat 파일 prefix — 타 도구 스킬과 충돌 방지.
const NATIVE_SKILL_PREFIX = "daf-";

function getPlatform(id) {
  const platform = SKILL_PLATFORMS.find(p => p.id === id);
  if (!platform) throw new Error(`skill expose requires --platform ${SKILL_PLATFORM_IDS.join("|")}`);
  return platform;
}

function safeReadJson(absPath, fallback = null) {
  if (!existsSync(absPath)) return fallback;
  try {
    return JSON.parse(readFileSync(absPath, "utf8"));
  } catch {
    return fallback;
  }
}

function getAvailableSkills(cwd) {
  const ids = new Set();
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

// 스킬 본문 원본 경로. 전역 사용자본 > repo 템플릿 > 번들 순으로 우선.
function sourceSkillPath(cwd, id) {
  // #622-D: the package template is the SSOT (main). It wins so package updates
  // (e.g. the latest persona-maid) propagate instead of being shadowed by a stale
  // user copy. The user store is only the source for skills the package does NOT
  // ship (genuinely user-authored skills).
  const repoTemplate = makePath(cwd, SKILL_PATHS.templateRoot, id, "SKILL.md");
  if (existsSync(repoTemplate)) return repoTemplate;
  const packaged = makePath(PACKAGE_ROOT, SKILL_ROOT, id, "SKILL.md");
  if (existsSync(packaged)) return packaged;
  return userSkillPath(id);
}

// listSkills 미리보기/충돌 판정을 위해 frontmatter(summary, category)와 origin 을 읽는다.
function readSkillMeta(cwd, id) {
  try {
    const path = sourceSkillPath(cwd, id);
    if (!existsSync(path)) return { summary: "", category: "", source: "bundled" };
    const { meta } = parseFrontMatter(readFileSync(path, "utf8"));
    const source = existsSync(userSkillPath(id)) ? "user" : "bundled";
    return {
      summary: String(meta?.summary || "").trim(),
      category: String(meta?.category || "").trim(),
      // #694: bind = 이 스킬이 활성화되는 노드 영역(rules/phase1/phase2/doc).
      // 비어있으면 영역 무관(항상). area 필터에 쓰인다.
      bind: String(meta?.bind || "").trim(),
      // #697: system = true면 사용자 선택 없이 init 시 자동 install+expose되는 시스템 필수 스킬.
      system: meta?.system === true || String(meta?.system || "").toLowerCase() === "true",
      source,
    };
  } catch {
    return { summary: "", category: "", source: "bundled", bind: "", system: false };
  }
}

function loadSkillSource(cwd, id) {
  const source = sourceSkillPath(cwd, id);
  if (!existsSync(source)) throw new Error(`skill not found: ${id}`);
  return readFileSync(source, "utf8");
}

// installed + exposed 모두 홈 전역 skills.json 의 SSOT.
function loadGlobalConfig() {
  const g = safeReadJson(getUserSkillsConfigPath(), { installed: [], exposed: {} });
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

function loadSkillConfig(cwd) {
  const global = loadGlobalConfig();
  // 워크스페이스 파일에 잔존하는 installed/exposed 는 마이그레이션 호환을 위해 전역으로 머지.
  const ws = safeReadJson(makePath(cwd, CONFIG_FILE), { installed: [], exposed: {} });
  const localInstalled = Array.isArray(ws.installed) ? ws.installed : [];
  const localExposed = (ws.exposed && typeof ws.exposed === 'object') ? ws.exposed : {};
  const installed = Array.from(new Set([...global.installed, ...localInstalled]));
  const exposed: Record<string, any> = {};
  for (const [platform, ids] of Object.entries({ ...localExposed, ...global.exposed })) {
    const merged = new Set([
      ...(Array.isArray(localExposed[platform]) ? localExposed[platform] : []),
      ...(Array.isArray(global.exposed[platform]) ? global.exposed[platform] : []),
    ]);
    if (merged.size > 0) exposed[platform] = Array.from(merged);
  }
  return { version: 1, installed, exposed };
}

function pointerLine(cwd, id) {
  const src = sourceSkillPath(cwd, id);
  let rel = relative(cwd, src).replace(/\\/g, '/');
  if (rel.startsWith('..')) {
    rel = src.replace(/\\/g, '/');
  }
  return `- ${id}: ${rel}`;
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
      // Ignore pointer read failures and fall back to config-based exposure only.
    }
  }
  return platforms;
}

function writeSkillConfig(cwd, config, dryRun) {
  // installed + exposed 모두 전역 파일로 저장. 워크스페이스 파일에는 기록하지 않는다.
  writeGlobalConfig(
    Array.isArray(config.installed) ? config.installed : [],
    (config.exposed && typeof config.exposed === 'object') ? config.exposed : {},
    dryRun
  );
  // 오토 마이그레이션: 워크스페이스 파일에 잔존하는 exposed/installed 키 제거.
  if (!dryRun) {
    const wsPath = makePath(cwd, CONFIG_FILE);
    if (existsSync(wsPath)) {
      try {
        const ws = safeReadJson(wsPath, {});
        if ('exposed' in ws || 'installed' in ws) {
          const { exposed: _e, installed: _i, ...rest } = ws;
          writeFileSync(wsPath, JSON.stringify({ version: 1, ...rest }, null, 2), "utf8");
        }
      } catch {
        // 마이그레이션 실패는 무시 — 전역 저장은 이미 완료.
      }
    }
  }
}

function ensureKnownSkill(cwd, id) {
  if (!getAvailableSkills(cwd).includes(id)) throw new Error(`unknown skill: ${id}`);
}

export function listSkills(cwd = process.cwd()) {
  const config = loadSkillConfig(cwd);
  const available = getAvailableSkills(cwd);
  
  return available.map(id => {
    const meta = readSkillMeta(cwd, id);
    return {
      id,
      installed: config.installed.includes(id),
      exposed: Array.from(new Set([
        ...Object.entries(config.exposed || {})
        .filter(([, ids]) => Array.isArray(ids) && ids.includes(id))
        .map(([platform]) => platform),
        ...detectExposedPlatforms(cwd, id)
      ])),
      summary: meta.summary,
      category: meta.category,
      source: meta.source,
    };
  });
}

// 번들/리포 스킬을 전역 사용자 디렉토리로 복사(fork)해 편집 가능하게 만든다.
// 이미 사용자본이 있으면 그대로 두고 경로만 반환(덮어쓰지 않음).
// fork 후 exposed native 플랫폼 파일도 갱신한다.
export function forkSkill(opts: CliOpts = {}) {
  const cwd = opts.cwd || process.cwd();
  const id = opts.skill;
  if (!id) throw new Error("skill fork requires --skill <id>");
  ensureKnownSkill(cwd, id);
  const target = userSkillPath(id);
  if (existsSync(target)) {
    // 이미 fork된 경우도 native sync — 편집 후 재반영 목적으로 호출될 수 있음.
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

const SKILL_BODY_LIMIT = 600;

// native 플랫폼 — 스킬 파일이 플랫폼 자체 컨텍스트에 직접 로드되므로 rules embed 불필요.
const NATIVE_EMBED_SKIP_PLATFORMS = new Set(["claude"]);

export function detectCurrentPlatform() {
  // Claude Code: CLAUDECODE=1 또는 CLAUDE_CODE_ENTRYPOINT/CLAUDE_CODE_SESSION_ID 존재
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT || process.env.CLAUDE_CODE_SESSION_ID) return "claude";
  if (process.env.CLAUDE_VERSION || process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.CURSOR_VERSION || process.env.EDITOR === "cursor") return "cursor";
  if (process.env.COPILOT_API_KEY || process.env.GITHUB_COPILOT) return "copilot";
  if (process.env.GEMINI_API_KEY || process.env.ANTIGRAVITY_WORKFLOW) return "antigravity";
  return null;
}

// #694: area = 현재 노드 영역(rules/phase1/phase2/doc). 꽂힌 스킬 중 bind가 이 영역과
// 일치하는 것만 노출한다(LangGraph 노드별 도구 바인딩). bind가 없는 스킬은 영역 무관으로
// 항상 노출. area를 안 주면(null) 영역 필터를 적용하지 않는다(하위 호환).
export function getActiveSkillsSurface(cwd = process.cwd(), platform = null, area = null) {
  const config = loadSkillConfig(cwd);
  const detectedPlatform = platform || detectCurrentPlatform();
  let ids = config.installed || [];

  if (detectedPlatform) {
    ids = ids.filter(id => {
      const exposed = config.exposed?.[detectedPlatform] || [];
      return exposed.includes(id) || detectExposedPlatforms(cwd, id).includes(detectedPlatform);
    });
  }

  if (area) {
    ids = ids.filter(id => {
      const bind = readSkillMeta(cwd, id).bind;
      return !bind || bind === area;
    });
  }

  if (ids.length === 0) return "";

  // native 플랫폼(claude 등)은 스킬이 이미 플랫폼 컨텍스트에 로드됨 — summary 목록만 출력.
  if (detectedPlatform && NATIVE_EMBED_SKIP_PLATFORMS.has(detectedPlatform)) {
    const lines = ids.map(id => {
      const meta = readSkillMeta(cwd, id);
      return meta.summary ? `- **${id}**: ${meta.summary}` : `- **${id}**`;
    });
    return `## Active Skills\n\n${lines.join("\n")}`;
  }

  const contents = ids.map(id => {
    try {
      const raw = readFileSync(sourceSkillPath(cwd, id), "utf8").trimEnd();
      // 역할 레이어(category: role)는 행동 계약이라 잘리면 의미가 없다 — truncate 면제.
      const isRole = readSkillMeta(cwd, id).category === "role";
      const truncated = (!isRole && raw.length > SKILL_BODY_LIMIT)
        ? raw.slice(0, SKILL_BODY_LIMIT) + "\n… (truncated)"
        : raw;
      return `### Skill: ${id}\n\n${truncated}`;
    } catch {
      return "";
    }
  }).filter(Boolean);
  if (contents.length === 0) return "";
  return `## Agent System Hooks (Active Skills)\n\n` + contents.join("\n\n");
}

// 이미 exposed된 native 플랫폼에 스킬 파일을 싱크한다.
function syncNativePlatforms(cwd, id, config, dryRun) {
  const exposedPlatformIds = new Set([
    ...Object.entries(config.exposed || {})
      .filter(([, ids]) => Array.isArray(ids) && ids.includes(id))
      .map(([p]) => p),
    ...detectExposedPlatforms(cwd, id),
  ]);
  for (const platform of SKILL_PLATFORMS) {
    if (platform.kind === "native" && exposedPlatformIds.has(platform.id)) {
      upsertNativeDir(platform.nativeDir, [id], cwd, dryRun);
    }
  }
}

// #622-D: idempotent auto-sync entry point, called once on ticket-command entry
// (cli.mjs) and init. For every skill exposed to a native platform (Claude), it
// re-copies from the SSOT only if the content changed (hash compare in
// upsertNativeDir). This makes package-template updates propagate to ~/.claude/
// skills without a manual re-expose. Best-effort: never throws into the caller.
export function syncExposedNativeSkills(cwd = process.cwd(), opts: CliOpts = {}) {
  try {
    const config = loadSkillConfig(cwd);
    let changed = 0;
    for (const platform of SKILL_PLATFORMS) {
      if (platform.kind !== "native") continue;
      const ids = currentlyExposed(config, platform.id);
      if (ids.length === 0) continue;
      changed += upsertNativeDir(platform.nativeDir, ids, cwd, opts.dryRun) || 0;
    }
    return { changed };
  } catch {
    return { changed: 0 };
  }
}

export function addSkill(opts: CliOpts = {}) {
  const cwd = opts.cwd || process.cwd();
  const id = opts.skill;
  ensureKnownSkill(cwd, id);
  const config = loadSkillConfig(cwd);

  if (!config.installed.includes(id)) config.installed.push(id);
  writeSkillConfig(cwd, config, opts.dryRun);
  syncNativePlatforms(cwd, id, config, opts.dryRun);
  return { id, target: sourceSkillPath(cwd, id) };
}

// 포인터 섹션 텍스트(마커로 감싸 멱등 갱신). ids가 비면 섹션을 제거.
function buildPointerSection(cwd, platform, ids) {
  if (ids.length === 0) return "";
  const lines = [
    SKILL_POINTER_BEGIN,
    "# DeukAgentFlow Skills",
    "",
    "These are thin behavior playbooks. They do not override `core-rules/AGENTS.md`, TDW, APC, Phase Gate, or PROJECT_RULE.md.",
    "",
  ];

  // #622-C: pointer platforms get ONLY a pointer line per skill — never the full
  // skill body. The full content lives in the SSOT (package templates) and, for
  // Claude, in the native ~/.claude/skills dir. Inlining the body here was a leak
  // that copied 6KB skill text into workspace files (e.g. GEMINI.md).
  lines.push(...ids.map(id => pointerLine(cwd, id)));

  lines.push(SKILL_POINTER_END);
  if (platform.format === "mdc") {
    return [
      "---",
      "description: \"DeukAgentFlow skill pointers\"",
      "globs: [\"**/*\"]",
      "alwaysApply: false",
      "---",
      ...lines,
      "",
    ].join("\n");
  }
  return lines.join("\n") + "\n";
}

// native 플랫폼: nativeDir/<id>/SKILL.md 정식 디렉토리 구조로 저장.
// Claude Code 등 native 스킬 시스템은 <id>/SKILL.md 만 인식하므로 flat 파일은 못 알아본다.
// 구식 flat(daf-<id>.md, <id>.md)이 있으면 제거한다.
function upsertNativeDir(nativeDir, ids, cwd, dryRun) {
  let changed = 0;
  for (const id of ids) {
    const content = ensureSkillDescription(loadSkillSource(cwd, id));
    const destDir = join(nativeDir, id);
    const dest = join(destDir, "SKILL.md");
    // #622-D: hash compare — only rewrite when the SSOT content actually differs,
    // so a synced skill stays current but unchanged ones are skipped (cheap on the
    // per-ticket-action auto-sync path).
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

// Claude Code 정식 스킬은 frontmatter에 description 필드를 요구한다.
// 소스 SKILL.md가 summary만 가진 경우 summary 값을 description으로 보강한다.
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

// native 플랫폼: <id>/SKILL.md 디렉토리 삭제 (없으면 silent skip).
// 구식 flat(daf-<id>.md, prefix 없는 <id>.md)도 함께 정리한다.
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

// 기존 파일에서 마커 구간만 교체/제거하고 나머지 내용은 보존.
function upsertPointerFile(cwd, platform, ids, dryRun) {
  const target = makePath(cwd, platform.pointerFile);
  const existing = existsSync(target) ? readFileSync(target, "utf8") : "";
  const section = buildPointerSection(cwd, platform, ids);
  const markerRe = new RegExp(`${SKILL_POINTER_BEGIN}[\\s\\S]*?${SKILL_POINTER_END}\\n?`, "m");

  let next;
  if (platform.format === "mdc" || !existing.trim()) {
    // mdc 포인터 파일은 스킬 전용이므로 통째로 재작성. 빈 파일도 동일.
    next = section;
  } else if (markerRe.test(existing)) {
    next = section ? existing.replace(markerRe, section.trimEnd() + "\n") : existing.replace(markerRe, "").trimEnd() + "\n";
  } else if (section) {
    next = existing.trimEnd() + "\n\n" + section;
  } else {
    next = existing;
  }

  if (!dryRun) {
    if (!next.trim()) {
      if (existsSync(target)) rmSync(target);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, next, "utf8");
    }
  }
}



// platform에 현재 노출된 스킬 id 집합을 config 기준으로 계산.
function currentlyExposed(config, platformId) {
  return Array.isArray(config.exposed?.[platformId]) ? config.exposed[platformId] : [];
}

// opts.skill 가 있으면 해당 스킬만, 없으면 설치된 전체를 대상으로 함.
function targetIds(config, opts) {
  if (opts.skill) return [opts.skill];
  return config.installed || [];
}

const TOTAL_MAX_SKILLS = 6;
const CATEGORY_LIMITS = {
  persona: 1,
  coding: 3,
  data: 2
};

function validateSkillConstraints(cwd, platformId, nextExposedIds) {
  // #697: system:true 스킬(ticket-status-surface 등)은 사용자 선택 슬롯이 아니라 시스템
  // 필수다 — 총량/카테고리 제한 카운트에서 제외한다. 사용자가 고르는 스킬만 6개로 제한.
  const userIds = nextExposedIds.filter(id => !readSkillMeta(cwd, id).system);
  if (userIds.length > TOTAL_MAX_SKILLS) {
    throw new Error(`총 장착 가능한 스킬 개수(${TOTAL_MAX_SKILLS}개)를 초과할 수 없습니다.`);
  }

  const counts: Record<string, any> = {};
  for (const id of userIds) {
    const meta = readSkillMeta(cwd, id);
    const cat = meta.category || "uncategorized";
    counts[cat] = (counts[cat] || 0) + 1;

    if (CATEGORY_LIMITS[cat] !== undefined && counts[cat] > CATEGORY_LIMITS[cat]) {
      throw new Error(`'${cat}' 카테고리는 최대 ${CATEGORY_LIMITS[cat]}개까지만 장착할 수 있습니다.`);
    }
  }
}

export function exposeSkills(opts: CliOpts = {}) {
  const cwd = opts.cwd || process.cwd();
  const platform = getPlatform(String(opts.platform || "").toLowerCase());
  const config = loadSkillConfig(cwd);

  const ids = targetIds(config, opts);
  if (ids.length === 0) throw new Error("no skills installed; run skill add first");
  for (const id of ids) {
    ensureKnownSkill(cwd, id);
    if (!config.installed.includes(id)) addSkill({ cwd, skill: id, dryRun: opts.dryRun });
  }

  config.exposed = config.exposed || {};
  const nextExposed = Array.from(new Set([...currentlyExposed(config, platform.id), ...ids]));

  validateSkillConstraints(cwd, platform.id, nextExposed);

  // #622-C: only native platforms (Claude → ~/.claude/skills) get files written.
  // Pointer platforms (codex/gemini/copilot/cursor) are covered by the per-agent
  // HOME global spoke (getGlobalAgentInstructionTargets), so we NEVER write skill
  // files into the workspace git tree. expose just records config + syncs native.
  if (platform.kind === "native") {
    upsertNativeDir(platform.nativeDir, ids, cwd, opts.dryRun);
  }

  config.exposed[platform.id] = nextExposed;
  writeSkillConfig(cwd, config, opts.dryRun);
  return { platform: platform.id, ids };
}

// #697: system:true 스킬은 사용자 선택 없이 항상 보장한다. init/dev:install 시 호출돼
// 번들 스킬 중 system 마커가 붙은 것을 모든 플랫폼에 install+expose한다(이미 돼있으면 no-op).
// ticket-status-surface처럼 상태 표현 규칙은 시스템 필수라 누락되면 안 된다.
export function ensureSystemSkills(cwd = process.cwd(), opts: CliOpts = {}) {
  const available = getAvailableSkills(cwd);
  const systemIds = available.filter(id => readSkillMeta(cwd, id).system);
  if (systemIds.length === 0) return [];
  const ensured = [];
  for (const platformId of SKILL_PLATFORM_IDS) {
    const config = loadSkillConfig(cwd);
    const already = currentlyExposed(config, platformId);
    const missing = systemIds.filter(id => !already.includes(id));
    if (missing.length === 0) continue;
    for (const id of missing) {
      try {
        // targetIds는 opts.skill만 보므로 스킬을 하나씩 expose한다(install은 자동 동반).
        exposeSkills({ cwd, platform: platformId, skill: id, dryRun: opts.dryRun });
        ensured.push(`${platformId}:${id}`);
      } catch { /* best-effort: 한 스킬/플랫폼 실패가 init을 막지 않음 */ }
    }
  }
  return ensured;
}

export function unexposeSkills(opts: CliOpts = {}) {
  const cwd = opts.cwd || process.cwd();
  const platform = getPlatform(String(opts.platform || "").toLowerCase());
  const config = loadSkillConfig(cwd);
  config.exposed = config.exposed || {};

  // 제거 대상: 특정 스킬이면 그것만, 아니면 해당 플랫폼 전체 해제.
  const removeIds = opts.skill ? [opts.skill] : currentlyExposed(config, platform.id);
  const nextExposed = currentlyExposed(config, platform.id).filter(id => !removeIds.includes(id));

  // #622-C: native → remove from ~/.claude/skills. Pointer platforms no longer have
  // workspace files (HOME global spoke covers them); if a legacy pointer file still
  // exists from before this change, remove its managed section so nothing lingers.
  if (platform.kind === "native") {
    removeNativeFiles(platform.nativeDir, removeIds, opts.dryRun);
  } else {
    removePointerFileSection(cwd, platform, opts.dryRun);
  }

  config.exposed[platform.id] = nextExposed;
  writeSkillConfig(cwd, config, opts.dryRun);
  return { platform: platform.id, ids: removeIds };
}

// Removes the deuk-managed skill section from a workspace pointer file (legacy
// cleanup). If the file becomes empty, deletes it. Never touches non-managed text.
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

// 스킬 설치 제거: 설치 파일 삭제 + 모든 플랫폼에서 노출 해제 + config 정리.
export function removeSkill(opts: CliOpts = {}) {
  const cwd = opts.cwd || process.cwd();
  const id = opts.skill;
  if (!id) throw new Error("skill remove requires --skill <id>");
  const config = loadSkillConfig(cwd);

  for (const platform of SKILL_PLATFORMS) {
    if (detectExposedPlatforms(cwd, id).includes(platform.id) || currentlyExposed(config, platform.id).includes(id)) {
      unexposeSkills({ cwd, platform: platform.id, skill: id, dryRun: opts.dryRun });
    }
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
  if (action === "unexpose") {
    const result = unexposeSkills(opts);
    console.log(`skills unexposed: ${result.platform} ${result.ids.join(",") || "-"}`);
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
    const result = lintSkills(opts.cwd);
    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.ok ? "skill:lint ok" : `skill:lint failed ${result.violations.length}`);
    if (!result.ok) throw new Error(result.violations.join("\n"));
    return;
  }
  if (action === "edit") {
    const id = opts.skill;
    if (!id) throw new Error("skill edit requires --skill <id>");
    ensureKnownSkill(opts.cwd || process.cwd(), id);
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
  throw new Error("Unknown skill action: " + action);
}
