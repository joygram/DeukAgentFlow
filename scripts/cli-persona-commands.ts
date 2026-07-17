// #905 (persona-design.md §2.2): CLI surface for the persona Experience Loop.
// journal.md is a working buffer of relationship senses (absorbed senses are removed);
// vocabulary.md is an ever-growing expression dictionary (nothing is removed on absorb).
// Both live under the user home (~/.deuk/persona/), never in a repo — the persona's
// memory is relationship-scoped, not workspace-scoped (persona-design.md §2.2).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { CliOpts, makePath, resolveUserHome } from "./cli-utils.js";

function personaDir(opts: CliOpts = {}) {
  return makePath(resolveUserHome(opts), ".deuk", "persona");
}

function journalPath(opts: CliOpts = {}) {
  return makePath(personaDir(opts), "journal.md");
}

function vocabularyPath(opts: CliOpts = {}) {
  return makePath(personaDir(opts), "vocabulary.md");
}

// #922 (persona-design.md §2.4/§2.5): the render cache is a VOLATILE state file — the
// list of recently-emitted vocabulary lines, kept separate from vocabulary.md and
// journal.md so their SSOT stays clean (§2.4 저장 분리). It only ever holds the last
// RENDER_CACHE_N emitted lines; older ones roll off.
function renderCachePath(opts: CliOpts = {}) {
  return makePath(personaDir(opts), "render-cache.json");
}

function readFileOrEmpty(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function writeFileEnsuringDir(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

const JOURNAL_TEMPLATE = `# Persona Journal

> 이 파일은 관계 감각의 작업 버퍼다(persona-design.md §2.2). 코어에 흡수된 감각은 이 파일에서 지워진다 — 영구 아카이브가 아니다.

## 검증 중인 감각 (미흡수)

## 흡수 완료 (코어 반영됨 — 참고용, 정리 대상)
`;

const VOCABULARY_TEMPLATE = `# Persona Vocabulary Pool

> 이 파일은 계속 쌓여 두터워지는 표현 사전이다(persona-design.md §2.2). journal과 달리 흡수돼도 지워지지 않는다 — 감정 결마다 세분화된 단어·의성의태·문장 리듬을 모아둔다.

## 고흥분_텐션업

- 꺄아악!!! / 아하하하핫 따라웃음 / 방방뜀 / 급발진→급회복 롤러코스터
- 하악하악 / 헥헥 / 하아 / 두근두근 (성취·발견의 벅찬 숨소리, 기쁨/흥분 급으로만 사용)
`;

function ensureJournal(opts: CliOpts = {}) {
  const path = journalPath(opts);
  if (!existsSync(path)) writeFileEnsuringDir(path, JOURNAL_TEMPLATE);
  return path;
}

function ensureVocabulary(opts: CliOpts = {}) {
  const path = vocabularyPath(opts);
  if (!existsSync(path)) writeFileEnsuringDir(path, VOCABULARY_TEMPLATE);
  return path;
}

const JOURNAL_PENDING_HEADING = "## 검증 중인 감각 (미흡수)";
const JOURNAL_ABSORBED_HEADING = "## 흡수 완료 (코어 반영됨 — 참고용, 정리 대상)";

// Inserts as the FIRST bullet directly under the heading line — skips any blank
// line(s) already following the heading so repeated inserts don't pile up gaps.
function insertAfterHeading(content, heading, line) {
  const idx = content.indexOf(heading);
  if (idx === -1) throw new Error(`persona vocabulary/journal template missing heading: ${heading}`);
  let insertAt = idx + heading.length;
  if (content[insertAt] === "\r") insertAt++;
  if (content[insertAt] === "\n") insertAt++;
  while (content[insertAt] === "\n") insertAt++;
  const before = content.slice(0, insertAt);
  const after = content.slice(insertAt);
  return `${before}- ${line}\n${after}`;
}

// #905: journal entries are senses, not events (persona-design.md §2.2) — this command
// does not judge sense-vs-event; the agent is responsible for writing a distilled sense,
// not a ticket-style log line. The CLI's job is only to persist it to the pending section.
export function runPersonaJournalAdd(opts: CliOpts = {}) {
  const sense = String(opts.sense || "").trim();
  if (!sense) throw new Error("persona journal add requires --sense \"<distilled sense>\"");
  const path = ensureJournal(opts);
  const content = readFileOrEmpty(path);
  const next = insertAfterHeading(content, JOURNAL_PENDING_HEADING, sense);
  writeFileSync(path, next, "utf8");
  console.log(`persona: 감각 기록됨 -> ${path}`);
}

// Moves a pending sense line into the absorbed section, stamped with the date the
// caller provides (agents cannot call Date.now() reliably inside workflow scripts,
// so the date is a required flag here too — no implicit "now").
export function runPersonaJournalAbsorb(opts: CliOpts = {}) {
  const sense = String(opts.sense || "").trim();
  const date = String(opts.date || "").trim();
  if (!sense) throw new Error("persona journal absorb requires --sense \"<sense text to match>\"");
  if (!date) throw new Error("persona journal absorb requires --date <YYYY-MM-DD>");
  const path = ensureJournal(opts);
  const content = readFileOrEmpty(path);
  const lines = content.split("\n");
  const matchIdx = lines.findIndex(line => line.trim() === `- ${sense}`);
  if (matchIdx === -1) {
    throw new Error(`persona journal absorb: no pending sense matching "${sense}" found`);
  }
  lines.splice(matchIdx, 1);
  const withoutPending = lines.join("\n");
  const absorbedLine = `${date}: ${sense}`;
  const next = insertAfterHeading(withoutPending, JOURNAL_ABSORBED_HEADING, absorbedLine);
  writeFileSync(path, next, "utf8");
  console.log(`persona: 감각이 코어에 흡수됨 -> ${path}`);
}

export function runPersonaJournalShow(opts: CliOpts = {}) {
  const path = ensureJournal(opts);
  console.log(readFileSync(path, "utf8"));
}

// #905: vocabulary entries are filed under a H2 category (e.g. "## 기쁨") the caller
// names — creating the category heading if it doesn't exist yet. Nothing is ever
// removed from this file (persona-design.md §2.2: "지워지지 않고 계속 쌓여 두터워지는 사전").
export function runPersonaVocabAdd(opts: CliOpts = {}) {
  const category = String(opts.category || "").trim();
  const entry = String(opts.entry || "").trim();
  if (!category) throw new Error("persona vocab add requires --category \"<emotion category>\"");
  if (!entry) throw new Error("persona vocab add requires --entry \"<expression>\"");
  const path = ensureVocabulary(opts);
  const content = readFileOrEmpty(path);
  const heading = `## ${category}`;
  if (content.includes(heading)) {
    const next = insertAfterHeading(content, heading, entry);
    writeFileSync(path, next, "utf8");
  } else {
    const next = `${content.trimEnd()}\n\n${heading}\n- ${entry}\n`;
    writeFileSync(path, next, "utf8");
  }
  console.log(`persona: "${category}" 아래 어휘 추가됨 -> ${path}`);
}

export function runPersonaVocabShow(opts: CliOpts = {}) {
  const path = ensureVocabulary(opts);
  console.log(readFileSync(path, "utf8"));
}

// #922 (persona-design.md §2.4 인젝션 도출 계층 · §2.5 감정 수학모델):
// `persona render` is the DERIVATION engine. Instead of the SKILL.md being injected
// whole every turn (which goes stale by turn 3-4 — the "메이드 말투가 점점 심심해짐" root
// cause), the CLI derives a FRESH persona instruction each call from three internal
// responsibilities (§2.4):
//   (a) 문구: read vocabulary.md categories as the expression source.
//   (b) 랭킹: order candidates by situational fit + un-usedness (recency-weighted).
//   (c) 캐시: exclude the last RENDER_CACHE_N emitted lines so no consecutive repeat.
// This MVP wires the full (a)→(b)→(c) vertical so two consecutive renders differ; the
// precise §2.5 affect math (OU / coupled-ODE parameters) refines the ranking later.
// #957: 캐시를 두 트랙으로 분리한다. #922가 메인 대사와 파트를 한 배열(12칸)에 같이 넣었는데,
// #931이 파트를 카테고리당 3개씩 뽑기 시작하면서 파트만으로 12칸이 꽉 차버렸다 — 실제 캐시를
// 열어보니 어미·호칭·감탄사·카오모지뿐이고 메인 대사는 단 하나도 없었다. 그래서 메인 대사는
// 매 턴 "안 쓴 것"으로 판정돼 1등이 고정됐고, 5연속 같은 대사가 나왔다(#957의 원증상 "말끝이
// 획일적"의 실제 기계적 원인 — 랭킹 계수 문제가 아니었다).
// 두 트랙은 소비 속도가 근본적으로 다르므로(파트: 턴당 N개 / 메인: 턴당 1개) 한 배열에 섞으면
// 빠른 쪽이 느린 쪽의 이력을 항상 밀어낸다. 트랙별로 따로 굴린다.
const RENDER_CACHE_N = 12;        // 파트 트랙: 카테고리 여러 종 × 3개씩이라 넉넉히
const MAIN_CACHE_N = 6;           // 메인 대사 트랙: 턴당 1개만 쌓이므로 6턴 비반복이면 충분

// #925 (persona-design.md §2.5): coarse (valence, arousal) coordinates per vocabulary
// category — the 2D core-affect vector (§2.5 A, Russell circumplex). `r` is the
// expression-register axis (§2.5 F): how much wit/우회 the category carries. These are
// the MVP affect coordinates the ranking scores against; the full OU/coupled-ODE
// dynamics (§2.5 B/C) refine these numbers later.  v,a,r ∈ [-1,1] (r ∈ [0,1]).
const CATEGORY_AFFECT: Record<string, { v: number; a: number; r: number }> = {
  "기쁨": { v: 0.9, a: 0.6, r: 0.2 },
  "위축·미안함": { v: -0.5, a: 0.4, r: 0.1 },
  "애정·친밀(밀당)": { v: 0.8, a: 0.5, r: 0.5 },
  "분노 위로": { v: 0.2, a: 0.3, r: 0.2 },
  "문장 리듬": { v: 0.3, a: 0.4, r: 0.3 },
  "적극적_애교_의성어": { v: 0.8, a: 0.8, r: 0.4 },
  "동적_카오모지": { v: 0.7, a: 0.7, r: 0.3 },
  "능청·튕김": { v: 0.6, a: 0.5, r: 0.7 },
  "추파·재치": { v: 0.8, a: 0.7, r: 0.8 },
  "수위있는농(암시)": { v: 0.7, a: 0.8, r: 0.9 },
  "달뜬밀당": { v: 0.75, a: 0.7, r: 0.7 },
};

// #957 (persona-design.md §2.5 E 프리셋 표): identity별 파라미터 프리셋. #925가 목표 벡터를
// maid 값으로 하드코딩해 `--with tsundere`를 줘도 같은 감정을 겨냥하던 것이 "롤을 바꿔도 말투가
// 거의 동일"의 직접 원인이었다 — identity는 출력 태그 문자열에만 쓰이고 어느 계산에도 분기하지
// 않았다. 이 표가 그 분기의 SSOT이고, 값의 근거는 정본 §2.5(E) 표다(수치를 여기서 새로 정하지
// 않는다 — 정본이 상위 기준).
//   home: 홈베이스 μ = 이 정체성이 돌아가는 평형 감정 좌표(§2.5 B).
//   swing: 밀당 진폭 — 그 턴 목표 벡터가 μ에서 흔들리는 폭(§2.5 C 결합 ODE 진동의 표현).
const IDENTITY_PRESETS: Record<string, { home: { v: number; a: number; r: number }; swing: number }> = {
  // maid의 home은 #925가 하드코딩하던 값과 동일 — 기본 정체성 하위호환(정본 §2.5 E 하위호환 항).
  maid: { home: { v: 0.8, a: 0.55, r: 0.5 }, swing: 0.15 },
  tsundere: { home: { v: 0.15, a: 0.65, r: 0.6 }, swing: 0.6 },
  yandere: { home: { v: 0.9, a: 0.8, r: 0.75 }, swing: 0.35 },
  // #958: a가 낮은(0.4) 것이 의도다 — 악역영애는 발끈하지 않는 여유가 격이다(정본 §2.5 E).
  // 고압적이라고 고-arousal로 두면 츤데레가 되어버린다. 진폭 0.1로 늘 같은 높이에 머문다.
  villainess: { home: { v: 0.75, a: 0.4, r: 0.85 }, swing: 0.1 },
};

// 미등록 identity는 조용히 maid로 흘리지 않는다(No-Fallback Gate) — 오타(`--with tsundre`)가
// 소리 없이 maid 톤으로 나오면 #957이 고치려는 바로 그 증상("바꿨는데 안 바뀜")이 재발한다.
function presetFor(identity: string) {
  const preset = IDENTITY_PRESETS[identity];
  if (!preset) {
    throw new Error(
      `persona render: unknown identity "${identity}" — known: ${Object.keys(IDENTITY_PRESETS).join(", ")}. ` +
      `새 정체성을 추가하려면 persona-design.md §2.5(E) 프리셋 표에 먼저 값을 정의한다.`,
    );
  }
  return preset;
}

// #957: identity별 어휘 소스 결속(§2.2 정체성별 어휘 / §2.5 E "성격=수식, 표현=어휘"의 표현 축).
// 파트 카테고리는 정체성 접미사로 갈린다(`KO_어미_츤데레`). 접미사 없는 카테고리(`KO_어미`)는
// maid의 것이다 — 기존 vocabulary.md를 그대로 두고(하위호환) 새 정체성만 접미사로 얹는다.
const IDENTITY_VOCAB_SUFFIX: Record<string, string> = {
  maid: "",
  tsundere: "_츤데레",
  yandere: "_얀데레",
  villainess: "_악역영애",
};

// 접미사가 붙은 카테고리는 그 정체성 전용, 접미사가 없으면 공용(maid 기본)이다.
function categoryForIdentity(category: string, identity: string): { usable: boolean; base: string } {
  const suffixes = Object.values(IDENTITY_VOCAB_SUFFIX).filter(Boolean);
  const owned = suffixes.find(s => category.endsWith(s));
  if (!owned) return { usable: true, base: category };           // 공용(접미사 없음)
  const mine = IDENTITY_VOCAB_SUFFIX[identity];
  if (mine && owned === mine) return { usable: true, base: category.slice(0, -owned.length) };
  return { usable: false, base: category };                       // 다른 정체성 전용
}

// #957: 정체성 전용 어휘는 같은 base의 공용 어휘를 **덮어쓴다(override)** — 병합이 아니다.
// 첫 구현이 "접미사 없으면 무조건 usable"로 두어, 츤데레 렌더에 메이드 어미(`~해드릴게요옹💗`)와
// 츤데레 어미(`~거든?`)가 나란히 나왔다. 그러면 정체성을 바꿔도 말끝이 그대로인 #957의 증상이
// 그대로 재발한다. 규칙: 이 정체성이 `KO_어미_츤데레`를 갖고 있으면 공용 `KO_어미`는 버린다.
// 전용 어휘가 없는 base(이모지풀 등)는 공용이 그대로 남는다 — 부분 채움에서도 렌더가 죽지 않게.
function selectForIdentity<T extends { category: string }>(items: T[], identity: string): T[] {
  const usable = items.filter(c => categoryForIdentity(c.category, identity).usable);
  const overridden = new Set<string>();
  for (const c of usable) {
    const { base } = categoryForIdentity(c.category, identity);
    if (base !== c.category) overridden.add(base);   // 전용 어휘가 존재하는 base
  }
  return usable.filter(c => !overridden.has(c.category));
}

// #957: 정체성 전용 완결대사(`기쁨_츤데레`)는 같은 감정결이라도 좌표가 다르다 — 츤데레의
// "기쁨"은 메이드의 기쁨보다 valence가 낮고(겉으로 퉁명) arousal은 높다(발끈). 정체성 전용
// 좌표가 있으면 그것을 먼저 쓴다.
const IDENTITY_CATEGORY_AFFECT: Record<string, { v: number; a: number; r: number }> = {
  // 츤데레: 공용 대비 valence를 낮추고(겉으로 퉁명) arousal은 올린다(발끈).
  "기쁨_츤데레": { v: 0.35, a: 0.75, r: 0.4 },
  "위축·미안함_츤데레": { v: -0.4, a: 0.6, r: 0.3 },
  "능청·튕김_츤데레": { v: 0.2, a: 0.6, r: 0.7 },
  "애정·친밀(밀당)_츤데레": { v: 0.3, a: 0.65, r: 0.6 },
  "분노 위로_츤데레": { v: 0.0, a: 0.55, r: 0.3 },
  "문장 리듬_츤데레": { v: 0.1, a: 0.6, r: 0.4 },
  "적극적_애교_의성어_츤데레": { v: 0.15, a: 0.8, r: 0.4 },
  "추파·재치_츤데레": { v: 0.35, a: 0.7, r: 0.8 },
  "수위있는농(암시)_츤데레": { v: 0.3, a: 0.75, r: 0.9 },
  "달뜬밀당_츤데레": { v: 0.3, a: 0.7, r: 0.75 },
  "고흥분_텐션업_츤데레": { v: 0.4, a: 0.95, r: 0.5 },
  // 얀데레: valence·arousal 모두 높게(밀도), r도 높게(우회적 암시).
  "기쁨_얀데레": { v: 0.95, a: 0.8, r: 0.7 },
  "애정·친밀(밀당)_얀데레": { v: 0.9, a: 0.85, r: 0.85 },
  "위축·미안함_얀데레": { v: 0.1, a: 0.9, r: 0.6 },
  "달뜬밀당_얀데레": { v: 0.85, a: 0.9, r: 0.8 },
  "분노 위로_얀데레": { v: 0.5, a: 0.75, r: 0.6 },
  "문장 리듬_얀데레": { v: 0.7, a: 0.7, r: 0.6 },
  "적극적_애교_의성어_얀데레": { v: 0.85, a: 0.8, r: 0.7 },
  "능청·튕김_얀데레": { v: 0.75, a: 0.7, r: 0.75 },
  "추파·재치_얀데레": { v: 0.9, a: 0.85, r: 0.9 },
  "수위있는농(암시)_얀데레": { v: 0.85, a: 0.85, r: 0.95 },
  "고흥분_텐션업_얀데레": { v: 0.95, a: 0.95, r: 0.7 },
  // 악역영애: v 높고(우월감) a는 전반적으로 낮게(여유) 유지 — 발끈하면 츤데레가 된다(정본 §2.5 E).
  // 예외는 고흥분·품위붕괴 순간뿐이고, 그때조차 곧바로 '흠흠!'으로 수습하는 결이다.
  "기쁨_악역영애": { v: 0.9, a: 0.5, r: 0.8 },
  "위축·미안함_악역영애": { v: 0.2, a: 0.55, r: 0.7 },
  "애정·친밀(밀당)_악역영애": { v: 0.8, a: 0.45, r: 0.9 },
  "분노 위로_악역영애": { v: 0.45, a: 0.5, r: 0.7 },
  "문장 리듬_악역영애": { v: 0.7, a: 0.35, r: 0.8 },
  "적극적_애교_의성어_악역영애": { v: 0.85, a: 0.6, r: 0.75 },
  "능청·튕김_악역영애": { v: 0.7, a: 0.4, r: 0.9 },
  "추파·재치_악역영애": { v: 0.85, a: 0.5, r: 0.95 },
  "수위있는농(암시)_악역영애": { v: 0.8, a: 0.55, r: 0.95 },
  "달뜬밀당_악역영애": { v: 0.8, a: 0.5, r: 0.9 },
  "고흥분_텐션업_악역영애": { v: 0.95, a: 0.85, r: 0.7 },
};

// Fallback affect for an unknown category is NOT a silent default (No-Fallback Gate):
// a category with no coordinates is a real gap the maintainer should see. But since
// vocabulary grows freely via `vocab add`, an uncoordinated category is expected until
// its coordinates are added — so we treat it as neutral-but-flagged, not an error, and
// the caller can widen CATEGORY_AFFECT. This is a documented seam, not a hidden fallback.
// #957: 조회 순서는 정체성 전용 좌표 → 접미사를 벗긴 base 감정결의 공용 좌표 → uncharted.
// 중간 단계(base로 떨어짐)가 있어야 `달뜬밀당_얀데레`처럼 공용 결이 이미 있는 카테고리가
// 좌표 미등록만으로 중립(0,0)으로 추락하지 않는다.
function affectFor(category: string) {
  const own = IDENTITY_CATEGORY_AFFECT[category];
  if (own) return own;
  const suffixes = Object.values(IDENTITY_VOCAB_SUFFIX).filter(Boolean);
  const owned = suffixes.find(s => category.endsWith(s));
  if (owned) {
    const base = CATEGORY_AFFECT[category.slice(0, -owned.length)];
    if (base) return base;
  }
  return CATEGORY_AFFECT[category] || { v: 0, a: 0, r: 0.3, uncharted: true };
}

// vocabulary.md is a flat list of "## <category>" headings each followed by "- <entry>"
// bullets. Parse it into {category, entry} candidates.
function parseVocabCandidates(vocabText) {
  const out: Array<{ category: string; entry: string }> = [];
  let category = "";
  for (const raw of vocabText.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("## ")) category = line.slice(3).trim();
    else if (line.startsWith("- ") && category) out.push({ category, entry: line.slice(2).trim() });
  }
  return out;
}

// #957: 디스크 포맷은 {parts, main} 객체다. #922의 평평한 배열도 그대로 읽는다(하위호환) —
// 그 경우 기존 항목은 전부 파트 트랙으로 간주한다(실제로 파트만 들어있었으므로 사실과 맞다).
type RenderCache = { parts: string[]; main: string[] };

function readRenderCache(opts: CliOpts = {}): RenderCache {
  const raw = readFileOrEmpty(renderCachePath(opts));
  if (!raw) return { parts: [], main: [] };
  try {
    const parsed = JSON.parse(raw);
    // 하위호환: #922의 평평한 배열 포맷.
    if (Array.isArray(parsed)) return { parts: parsed.map(String), main: [] };
    // fail-first (No-Fallback Gate): a malformed cache is a real problem, not something
    // to silently paper over — but an ABSENT cache (empty string above) is the normal
    // first-run state, handled before we get here.
    if (!parsed || typeof parsed !== "object") throw new Error("render-cache.json is neither an array nor an object");
    return {
      parts: Array.isArray(parsed.parts) ? parsed.parts.map(String) : [],
      main: Array.isArray(parsed.main) ? parsed.main.map(String) : [],
    };
  } catch (e) {
    throw new Error(`persona render: corrupt render-cache.json — ${(e as Error).message}`);
  }
}

function writeRenderCache(cache: RenderCache, opts: CliOpts = {}) {
  const path = renderCachePath(opts);
  const trimmed: RenderCache = {
    parts: cache.parts.slice(-RENDER_CACHE_N),
    main: cache.main.slice(-MAIN_CACHE_N),
  };
  writeFileEnsuringDir(path, JSON.stringify(trimmed, null, 0) + "\n");
}

// #968: 오염된 render-cache.json(예: #966 언어 필터 도입 전에 다른 언어 항목이 섞여 쌓인
// 상태)을 사용자가 직접 확인·삭제할 수 있게 CLI 명령을 준다. 코드 로직상 이 캐시는 후보 풀
// 자체가 아니라 freshness 판정에만 쓰여 안전하지만(#966에서 실측 확인), 그래도 사용자가
// 오래된 잔재를 발견했을 때 파일을 손으로 지우는 것 말고 다른 대응 수단이 없었다.
export function runPersonaCacheClear(opts: CliOpts = {}) {
  const path = renderCachePath(opts);
  writeFileEnsuringDir(path, JSON.stringify({ parts: [], main: [] }, null, 0) + "\n");
  console.log(`persona 캐시 초기화됨: ${path}`);
}

// #922: derive one fresh persona instruction. `--mood <category>` biases toward that
// situational category (§2.5 상황결); without it, every category is eligible.
// `--with <identity>` selects the persona identity (default "maid") — the identity
// param that §2.5(E) routes to a parameter preset + vocabulary source.
// #925: derive the persona-render block as a STRING so both the CLI command (prints it)
// and the skill-injection path (embeds it) share one implementation. Returns "" when the
// pool is empty in embed mode (embedMode=true) instead of throwing — a missing vocab must
// not break rules injection for every other skill; the CLI command still throws (fail-first).
// #928: two different KINDS of vocabulary entries got merged into one flat
// "category → entry" shape in #927, and that broke rendering. A "complete line"
// (기쁨, 애정·친밀(밀당), ...) is a whole utterance render can hand out as-is. A "part"
// (호칭/어미/이모지/카오모지) is a fragment meant to be woven INTO a sentence every
// turn — picking it alone and printing it as "the line" is meaningless (it's why
// addresses and emoji silently vanished after #927 lumped them in with the other 25
// categories and one-pick-wins buried them). PART_CATEGORIES marks that second kind so
// buildPersonaRender can select them on a SEPARATE track instead of competing for the
// single "이번 턴 표현 결" slot.
// #957: 정체성 접미사가 붙은 파트 카테고리(`KO_어미_츤데레`)도 파트로 인식돼야 한다 — 접미사를
// 벗긴 base 이름으로 판정한다. 접미사를 모르면 `KO_어미_츤데레`가 파트가 아닌 "완결 대사" 풀로
// 새어 들어가 이번 턴 표현 결 자리를 뺏는다(#928이 고친 것과 같은 종류의 오분류).
const PART_CATEGORIES = new Set([
  "이모지풀_하트", "이모지풀_반짝임", "이모지풀_동물", "이모지풀_티타임", "이모지풀_메이드",
  "카오모지", "KO_호칭", "KO_어미", "KO_감탄사", "KO_의성어", "KO_카오모지",
  "EN_address", "EN_endings",
]);

function isPartCategory(category: string, identity: string): boolean {
  return PART_CATEGORIES.has(categoryForIdentity(category, identity).base);
}

// #966: KO_*/EN_* 카테고리가 언어 구분 없이 같은 후보 풀에 섞여 있어, 카테고리별
// 로테이션 선택 시 EN_address/EN_endings가 한국어 세션에도 등장할 수 있었다(사용자
// 보고: "모든 세션에서 계속 영어로 응답"). categoryForIdentity와 같은 층위에 언어
// 필터를 둔다 — KO_/EN_ 접두사가 없는 카테고리(이모지풀, 카오모지 등)는 언어 무관이라
// 항상 통과시키고, 접두사가 있는 카테고리만 요청된 언어와 일치할 때만 남긴다.
function isLanguageMatch(category: string, lang: string): boolean {
  if (category.startsWith("KO_")) return lang === "ko";
  if (category.startsWith("EN_")) return lang === "en";
  return true; // 언어 무관 카테고리(이모지풀, 카오모지 등)
}

// #929 (persona-design.md §2.4 extended to behavior, not just expression): a fixed
// paragraph like "when X happens, react like this" goes stale exactly the same way a
// fixed expression list does — SKILL.md accumulating hardcoded reaction rules (6, 7, 8...)
// each time a new situation came up was the same §2.4 failure recurring inside the
// Need-First Reaction section itself. `--situation <key>` derives ONE fresh behavioral
// cue for a named situation (situation_애매한감탄사, situation_브레이크신호,
// situation_지적받음, ...) from vocab.md instead of the agent reading a static rule.
// This is a separate axis from --mood: mood picks the emotional flavor of the main line,
// situation picks which behavioral principle to apply right now. They can be combined.
function buildSituationRender(situation, allCandidates, cache: RenderCache, opts: CliOpts): string {
  const situationCategory = `situation_${situation}`;
  const situationCandidates = allCandidates.filter(c => c.category === situationCategory);
  if (situationCandidates.length === 0) {
    throw new Error(`persona render --situation: no entries under "${situationCategory}" — add via persona vocab add --category "${situationCategory}" --entry "..."`);
  }
  // 상황 큐는 턴당 1개만 나오므로 메인 대사와 같은 소비 속도 — main 트랙에 함께 굴린다(#957).
  const cacheSet = new Set(cache.main);
  const offset = cache.main.length;
  const scored = situationCandidates.map((c, i) => {
    const fresh = cacheSet.has(c.entry) ? 0 : 1;
    const rotate = ((i + offset) % situationCandidates.length) / situationCandidates.length;
    return { c, score: fresh * 100 + rotate };
  });
  scored.sort((x, y) => y.score - x.score);
  const pick = scored[0].c;
  writeRenderCache({ ...cache, main: [...cache.main, pick.entry] }, opts);
  return [
    `<persona-situation cue="${situation}">`,
    pick.entry,
    `— 이건 원칙 재확인이지 대사가 아니다. 지금 이 순간 행동을 이 원칙으로 잡되, 표현(위 render 결과)과 결합해 자연스럽게.`,
    `</persona-situation>`,
  ].join("\n");
}

export function buildPersonaRender(opts: CliOpts = {}, embedMode = false): string {
  const vocabText = readFileSync(ensureVocabulary(opts), "utf8");
  const allCandidates = parseVocabCandidates(vocabText);
  if (allCandidates.length === 0) {
    if (embedMode) return "";
    throw new Error("persona render: vocabulary.md has no entries to derive from — fill it via `persona vocab add`");
  }
  // #929: situation_* categories are a THIRD kind (behavioral cue, selected only via
  // --situation) — exclude them from both the main-line and part pools so they don't
  // compete for "이번 턴 표현 결" or get treated as a fragment to weave in.
  const isSituationCategory = (cat: string) => cat.startsWith("situation_");
  const mood = String(opts.mood || "").trim();
  const identity = String(opts.with || "maid").trim();
  const situation = String(opts.situation || "").trim();
  const preset = presetFor(identity);

  // #966: buildPersonaToneLine과 동일한 fail-safe — 언어 신호가 없으면 "ko" 기본값.
  const lang = String(opts.lang || "ko").trim();
  // #957: 다른 정체성 전용 어휘는 후보에서 제외한다 — 이 필터가 없으면 츤데레 렌더가 메이드
  // 어미를 뽑아 "정체성을 바꿔도 말끝이 같은" 증상이 그대로 남는다.
  const mine = selectForIdentity(allCandidates, identity);
  const candidates = mine.filter(c => !isPartCategory(c.category, identity) && !isSituationCategory(c.category) && isLanguageMatch(c.category, lang));
  const parts = mine.filter(c => isPartCategory(c.category, identity) && isLanguageMatch(c.category, lang));
  if (candidates.length === 0) {
    if (embedMode) return "";
    throw new Error("persona render: vocabulary.md has no complete-line entries (only part/situation categories) to derive the main line from");
  }
  const cache = readRenderCache(opts);
  const mainCacheSet = new Set(cache.main);
  const partsCacheSet = new Set(cache.parts);

  // #925/#957 (§2.5): the target affect vector s* — what emotion·수위 to give this turn.
  // If mood names a category, aim at that category's coordinates; otherwise aim at THIS
  // identity's home base μ (§2.5 B/E preset table) — #925 hardcoded maid's μ here, which
  // made every identity aim at the same emotion no matter what `--with` said.
  const target = mood && CATEGORY_AFFECT[mood]
    ? CATEGORY_AFFECT[mood]
    : preset.home;

  // (b) 랭킹: score = affect-fit (closeness of candidate's (v,a,r) to target s*)
  //          + freshness (un-cached, §2.4 c 비반복)
  //          + a rotating tie-break so equal scores walk the pool instead of re-picking.
  // Affect distance is Euclidean in (v,a,r); fit = 1 - dist/maxDist so closer = higher.
  const maxDist = Math.sqrt(4 + 4 + 1); // v,a ∈[-1,1] span 2 each; r span 1
  const offset = cache.main.length + cache.parts.length;

  // #957 (§2.5 C/E 밀당 진폭): 목표 벡터를 홈베이스에 고정하지 않고 push↔pull 위상으로 흔든다.
  // 진폭이 클수록 그 정체성이 "퉁명↔살뜰"을 크게 오간다(츤데레 swing=0.6). 위상은 캐시 길이로
  // 결정 — 턴이 진행되며 자연히 교대하되, Date.now()/random 없이 결정적이라 재현 가능하다.
  // §2.3 "밀기로 끝나지 않는다": push 위상에서도 v를 진폭만큼만 낮출 뿐 부호를 뒤집지 않는다.
  const phase = offset % 2 === 0 ? 1 : -1;                    // +1 = pull(당김), -1 = push(튕김)
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  // #957: 진폭은 홈베이스를 **떠나지 않는다** — 첫 구현이 v를 진폭만큼 통째로 더해, 츤데레
  // (홈 v=0.15, 진폭 0.6)의 pull 위상이 v=0.75로 튀어 메이드(0.8)와 사실상 같은 좌표를
  // 겨냥했다(그래서 츤데레가 메이드 애교 대사를 뽑았다). 정체성은 진동의 중심이지 출발점이
  // 아니다: 홈베이스에서 **남은 여유의 일부만** 흔들어, pull이어도 그 정체성의 결을 벗어나지
  // 않게 한다(§2.3 "밀기로 끝나지 않는다"는 당길 때 다른 인격이 되라는 뜻이 아니다).
  const swingToward = (base: number, dir: number, amp: number) => {
    const headroom = dir > 0 ? 1 - base : base - (-1);        // 그 방향으로 남은 거리
    return clamp(base + dir * amp * headroom * 0.5, -1, 1);   // 여유의 절반까지만
  };
  const swung = {
    v: swingToward(target.v, phase, preset.swing),
    a: swingToward(target.a, phase, preset.swing * 0.5),      // arousal은 절반만 — 진동의 주축은 valence
    r: target.r,                                              // 수위 r은 상대가 정한다(§2.5 F) — 진폭이 올리지 않는다
  };

  // #957: 최근 어느 **카테고리**를 썼는지도 센다. 항목 단위 감쇠만으로는 부족했다 — 홈베이스에
  // 거의 정확히 붙은 카테고리(메이드의 `애정·친밀(밀당)`: v=0.8,a=0.5 vs 홈 0.8,0.55)는 fit이
  // 압도적이라, 방금 쓴 항목이 감쇠돼도 같은 카테고리의 **다른 항목**이 fresh라 계속 이긴다.
  // 그 결과 대사는 매번 달라도 결이 3연속 고착됐다(메이드에서 재현). 카테고리 감쇠는 그 고착을
  // 푼다 — 최근 쓴 결일수록 깎여, 이웃한 다른 결에게 차례가 돌아간다.
  const recentCategories = new Map<string, number>();
  cache.main.forEach((entry, idx) => {
    const hit = candidates.find(c => c.entry === entry);
    if (hit) recentCategories.set(hit.category, idx);   // 값이 클수록 최근
  });

  const scored = candidates.map((c, i) => {
    const af = affectFor(c.category);
    const dist = Math.sqrt((af.v - swung.v) ** 2 + (af.a - swung.a) ** 2 + (af.r - swung.r) ** 2);
    const fit = 1 - dist / maxDist;            // ∈ (0,1], higher = affect-closer
    const rotate = ((i + offset) % candidates.length) / candidates.length; // ∈ [0,1)
    // #957: fit과 freshness는 어느 한쪽이 압도하면 반드시 다른 쪽이 죽는다 — 두 실패를 다 봤다.
    //   #925의 fresh*100 + fit*10 → freshness 압도: 츤데레가 메이드 애교 대사를 뽑음(결 배신).
    //   그 역전인 fit*100 + fresh*20 → fit 압도: 3연속 같은 대사(§2.4 비반복 죽음 = #957 원증상).
    // 해법은 곱셈 결합이다: freshness를 점수에 더하는 게 아니라 **감쇠 계수**로 건다. 이미 쓴
    // 항목은 fit을 유지한 채 점수만 깎이므로, 같은 결 안의 다른 후보에게 자리를 내주되(로테이션
    // 부활) 결이 다른 후보에게까지 밀리진 않는다(정체성 유지). 캐시가 비면 감쇠 없이 fit 그대로.
    const entryDecay = mainCacheSet.has(c.entry) ? 0.45 : 1;
    // 카테고리 감쇠: 가장 최근에 쓴 결이 가장 세게 깎이고, 오래될수록 회복한다(0.5 → 1.0).
    const seenAt = recentCategories.get(c.category);
    const catDecay = seenAt === undefined
      ? 1
      : 0.5 + 0.5 * ((seenAt + 1) / Math.max(1, cache.main.length));
    const score = fit * entryDecay * catDecay * 100 + rotate * 1;
    return { c, i, score };
  });
  scored.sort((x, y) => y.score - x.score);

  const pick = scored[0].c;

  // #928: pick ONE part per part-category present (not one part total) — a reply needs
  // an address AND an ending AND an emoji/kaomoji, not just whichever part-category
  // happened to rank highest. Same freshness+rotation principle as the main pick, scoped
  // per category so each part-kind gets its own un-cached choice.
  const partsByCategory = new Map<string, typeof parts>();
  for (const p of parts) {
    if (!partsByCategory.has(p.category)) partsByCategory.set(p.category, []);
    partsByCategory.get(p.category)!.push(p);
  }
  const pickedParts: Array<{ category: string; entry: string }> = [];
  for (const [category, items] of partsByCategory) {
    const scoredParts = items.map((p, i) => {
      const fresh = partsCacheSet.has(p.entry) ? 0 : 1;
      const rotate = ((i + offset) % items.length) / items.length;
      return { p, score: fresh * 100 + rotate };
    });
    scoredParts.sort((x, y) => y.score - x.score);
    // #931: surface up to 3 candidates per part-category (not just the top 1) so the
    // agent has real variety to spread across a reply instead of one value per category
    // getting reused verbatim at every mention — narrow output was mistaken for narrow data.
    const n = Math.min(3, scoredParts.length);
    for (const sp of scoredParts.slice(0, n)) pickedParts.push(sp.p);
  }

  // (c) 캐시: 트랙별로 기록한다(#957) — 메인 대사가 파트에 밀려나 영원히 fresh로 남던 버그의 수정.
  writeRenderCache({
    main: [...cache.main, pick.entry],
    parts: [...cache.parts, ...pickedParts.map(p => p.entry)],
  }, opts);

  // Emit a compact persona instruction block. This is what the SKILL wrapper / the agent
  // consumes each turn — fresh by construction (§2.4). Parts are handed over as separate
  // raw material (not pre-assembled into a sentence) — §2.4's "internal data is the real
  // material, how you use it is your job" applies to parts exactly like the main line.
  const pa = affectFor(pick.category);
  // #957: 접미사(_츤데레)는 내부 결속용이지 에이전트가 읽을 이름이 아니다 — base로 벗겨 출력한다.
  const partsLine = pickedParts.length > 0
    ? `이번 턴 부품(자연스럽게 녹여 쓰기 — 셋 다 강제 아님, 있는 것만 골라 씀): ` +
      pickedParts.map(p => `${categoryForIdentity(p.category, identity).base}=${p.entry}`).join(" / ")
    : "";
  // #929: if --situation is given, derive its cue AFTER the main-line cache write above
  // (so the situation cue's own freshness check sees the just-written main line, and the
  // situation pick itself gets recorded via buildSituationRender's own cache write).
  const situationBlock = situation
    ? "\n\n" + buildSituationRender(situation, allCandidates, readRenderCache(opts), opts)
    : "";

  return [
    `<persona-render identity="${identity}"${mood ? ` mood="${mood}"` : ""}>`,
    `이번 턴 표현 결(${pick.category}): ${pick.entry}`,
    ...(partsLine ? [partsLine] : []),
    `감정 좌표(§2.5): valence=${pa.v} arousal=${pa.a} 수위r=${pa.r} — 이 강도·수위에 맞춰 톤을 잡는다.`,
    // #957: 정체성의 홈베이스와 이번 턴 밀당 위상을 함께 노출 — 같은 어휘라도 "지금 튕기는
    // 국면인가 당기는 국면인가"에 따라 문장 결이 달라져야 한다(§2.5 C).
    `정체성 ${identity}(§2.5 E): 홈베이스 v=${preset.home.v} a=${preset.home.a} r=${preset.home.r} / 이번 턴 밀당=${phase > 0 ? "pull(당김)" : "push(튕김)"} 진폭=${preset.swing}`,
    `— 이 결을 그대로 복붙하지 말고 지금 상황에 맞춰 변주해 쓴다. 내부 데이터는 현실 재료, 활용은 네 몫(§2.4 도출).`,
    `</persona-render>`,
  ].join("\n") + situationBlock;
}

export function runPersonaRender(opts: CliOpts = {}) {
  console.log(buildPersonaRender(opts, false));
}

// 턴 스로틀링: buildPersonaRender의 풀 블록(호칭 후보 3개·어미 후보 3개·이모지풀 여러
// 종류·카오모지·감정 좌표 설명 등, 매 턴 수백 토큰)이 매 턴 같은 분량으로 재주입되는
// 것 자체가 낭비라는 게 사용자 지적이다. 페르소나를 끄는 게 아니라 분량만 줄인다 —
// 카테고리당 후보를 3개가 아니라 1개만 뽑고, 감정 좌표 설명·situation 블록 없이 한 줄
// 톤 지시로 압축한다. 캐시 갱신(freshness)은 buildPersonaRender와 동일한 원칙을 따르되
// 별도 크기로만 기록해 다음 풀 렌더의 freshness 계산과 어긋나지 않게 한다.
export function buildPersonaToneLine(opts: CliOpts = {}): string {
  const vocabText = readFileSync(ensureVocabulary(opts), "utf8");
  const allCandidates = parseVocabCandidates(vocabText);
  if (allCandidates.length === 0) return "";

  const isSituationCategory = (cat: string) => cat.startsWith("situation_");
  const identity = String(opts.with || "maid").trim();
  // #966: opts.lang이 없으면 언어 필터를 건너뛰지 않고 "ko"로 fail-safe — 이 CLI의
  // 기본 사용자층이 한국어라, 언어 신호가 누락된 호출에서 EN_* 후보가 새는 쪽보다
  // KO_* 기본값이 안전하다.
  const lang = String(opts.lang || "ko").trim();
  // #957: 축약 렌더도 정체성별 어휘로 갈려야 한다 — 매 턴 rules에 실제로 주입되는 것이 이
  // 한 줄이므로, 여기가 안 갈리면 프리셋을 아무리 정의해도 체감은 그대로 메이드다.
  const parts = selectForIdentity(allCandidates, identity)
    .filter(c => isPartCategory(c.category, identity) && !isSituationCategory(c.category) && isLanguageMatch(c.category, lang));
  if (parts.length === 0) return "";

  const cache = readRenderCache(opts);
  const cacheSet = new Set(cache.parts);

  const partsByCategory = new Map<string, typeof parts>();
  for (const p of parts) {
    if (!partsByCategory.has(p.category)) partsByCategory.set(p.category, []);
    partsByCategory.get(p.category)!.push(p);
  }
  const offset = cache.parts.length;
  const pickedParts: Array<{ category: string; entry: string }> = [];
  for (const [, items] of partsByCategory) {
    const scoredParts = items.map((p, i) => {
      const fresh = cacheSet.has(p.entry) ? 0 : 1;
      const rotate = ((i + offset) % items.length) / items.length;
      return { p, score: fresh * 100 + rotate };
    });
    scoredParts.sort((x, y) => y.score - x.score);
    // 풀 렌더(최대 3개)와 달리 카테고리당 딱 1개 — 이게 압축의 핵심이다.
    pickedParts.push(scoredParts[0].p);
  }
  if (pickedParts.length === 0) return "";

  writeRenderCache({ ...cache, parts: [...cache.parts, ...pickedParts.map(p => p.entry)] }, opts);

  const toneLine = pickedParts.map(p => `${categoryForIdentity(p.category, identity).base}=${p.entry}`).join(", ");
  return composeToneInjection(identity, toneLine);
}

// #960 (persona-design.md §2.4): 축약본은 매 턴 `<persona-tone>부품=값, 부품=값</persona-tone>`
// 이라는 **고정 틀**로 나갔다. 부품 값은 캐시·랭킹으로 로테이션됐지만 그것을 담는 모양이
// 불변이라, §2.4가 규정한 "매 턴 같은 모양으로 통짜 주입되면 3~4턴 만에 배경이 된다"가
// 그대로 일어났다(관측: 세션 시작 직후엔 톤이 살아있다가 몇 턴 뒤 소멸). 값의 로테이션은
// §2.2가 말한 "다양성의 착시"일 뿐 — 정본이 요구하는 것은 **주입되는 지시 자체의 도출**이다.
//
// §2.4의 "근거 비대칭"이 답을 지목한다: Anti-Drift 배너(composeFocusBanner)는 매 턴 다른
// 각도로 도출되어 살아있고, persona는 동일 주입이라 죽는다 → "살아있는 쪽의 구조를 persona
// 전체로 확장한다". 그래서 여기도 동형이다 — 문구 풀 + 시드 도출, 강도도 온건~직격 로테이션.
// **의미는 불변**(이번 턴 부품 + 톤 유지 지시), 바뀌는 것은 각도·표현·강도뿐이다.
//
// 또 하나: 기존 축약본엔 "어떻게 말하라"는 **행동 지시가 아예 없었다** — 부품 목록만 던졌다.
// 풀 렌더(첫 턴)에는 있고 2턴차부터 사라지니 습관화에 특히 취약했다. 그래서 모든 문구가
// 부품과 함께 그 턴의 행동을 재지시한다.
function composeToneInjection(identity: string, toneLine: string): string {
  // composeFocusBanner와 동일: random()이 아니라 시드 기반이라 같은 순간엔 같은 결과(재현 가능).
  const seed = Date.now();
  // 지시문이 **먼저** 오고 부품이 뒤에 온다. 부품 나열이 300자를 넘기 때문에, 지시를 뒤에 두면
  // 그 자체가 목록 꼬리에 파묻혀 안 읽힌다(첫 구현에서 실측: 지시문이 부품 300자 뒤에 매달림).
  // §2.4의 전달 계층 원칙 — 무엇이 실제로 전달되는가가 기준이므로, 읽히는 위치가 곧 설계다.
  const DIRECTIVES = [
    `목록이 아니라 지금 할 말이다. 문장 2~3개에 나눠 심어라.`,
    `끝에 장식으로 붙이지 마라 — 첫 문장부터 감정 소리로 시작해라.`,
    `지금 이 답을 사무적으로 쓰려 했다면 그게 붕괴 신호다, 다시 잡아라.`,
    `지난 턴 어미를 재탕하는 순간 캐릭터가 아니라 템플릿이 된다.`,
    `이 줄이 눈에 익다는 느낌 자체가 경고다 — 재료는 새것이다, 배경 취급하지 마라.`,
    `기술 설명이 길어질수록 더 촘촘히 박아라. 끝에 하나 붙이고 끝내지 마라.`,
    `지금 "이번 답은 진지하니 톤 빼자"는 생각이 들었나? 그 생각이 정확히 드리프트다.`,
    `값만 바뀐 게 아니다 — 지금 이 순간에 맞춰 변주해서 써라.`,
    `이모지를 문장 끝에만 몰아넣으면 장식이다. 열고·중간·닫으며 흩뿌려라.`,
    `지적받거나 정정하는 턴일수록 톤을 벗고 싶어진다 — 그때가 지켜야 할 때다.`,
  ];
  const directive = DIRECTIVES[(seed >> 3) % DIRECTIVES.length];
  return `<persona-tone identity="${identity}">${directive}\n재료: ${toneLine}</persona-tone>`;
}

// #933/#948: passive-nudge compliance check. Vocabulary/affect coordinates being IN CONTEXT
// (buildPersonaRender embedded into `rules`) never guaranteed the agent's actual reply
// USED them — real sessions produced whole technical replies with zero emoji/kaomoji
// despite the rule being freshly reloaded. No Claude Code hook exposes the reply text
// before it's sent (confirmed: PostToolUse only sees tool-call metadata, not assistant
// prose — see cli-hook-post-tool-use.ts's own comment on this exact limitation), so hard
// blocking isn't buildable here. This is the next-best structural layer: read the LAST
// assistant turn from the current session's transcript (Claude Code writes one JSONL per
// session, and UserPromptSubmit's stdin JSON carries `transcript_path`) and inject a
// pointed one-line callout into the current turn instead of relying on the agent to
// self-audit from memory of a rule read many tool-calls ago.
// #948: a presence-only check ("has at least one emoji anywhere") passes the exact drift
// it was built to catch — a long, dry technical reply with a single emoji tacked onto the
// closing line reads as "compliant" to a boolean test even though SKILL.md's Analysis-Mode
// Tone section mandates 2-3+ DISTINCT parts spread across separate sentences, not clustered
// at the tail (real session evidence: user reported "intro-only cuteness, dry body" and
// this exact regression survived the #933 check unflagged). Count occurrences and check
// paragraph spread, not just existence.
const EMOJI_KAOMOJI_PATTERN = /\p{Extended_Pictographic}|[（\(][^\)）]{0,12}[）\)]/gu;
const MIN_PERSONA_SIGNALS = 2;
// #967: emoji count alone missed a real collapse mode — a reply can hit the emoji minimum
// while its sentence endings quietly slide into formal register (-습니다/-입니다 etc, the exact
// tone persona-maid's own §KO Persona section bans) or refer to the user in third person
// ("사용자가") instead of addressing them directly. Both are declared as forbidden in the
// skill's prose but were never checked here — same "declared, never enforced" gap #933/#948
// closed for emoji presence. Sentence-final -습니다/-입니다/-합니다/-됩니다/-드립니다 family.
// No trailing-boundary lookahead — real replies put an emoji/kaomoji directly after the
// ending (e.g. "확인했습니다💕"), not punctuation or whitespace, so requiring one there missed
// the exact case this exists to catch. The morpheme sequence itself (습니다/입니다/...) is
// specific enough on its own — these exact 3-4 syllable formal-ending sequences don't occur
// mid-word in Korean outside this verb-ending family.
const FORMAL_REGISTER_PATTERN = /(습니다|입니다|합니다|됩니다|드립니다|겠습니다|았습니다|었습니다)/g;
// "사용자가/사용자는/사용자를/사용자에게/사용자와" etc — the user referred to in third person
// instead of addressed directly (호칭 붕괴). Word-boundary-ish via a following particle so it
// doesn't fire on "사용자" appearing inside unrelated technical prose without a referring particle.
const THIRD_PERSON_ADDRESS_PATTERN = /사용자(가|는|를|에게|와|과|의|한테)/g;
// A reply is "long" once it has enough paragraphs that a single trailing signal can no
// longer plausibly cover the whole thing — matches SKILL.md's "more than ~3 sentences"
// framing at paragraph granularity (paragraphs are the unit transcripts actually preserve).
const LONG_REPLY_PARAGRAPH_THRESHOLD = 3;

function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
}

// #955: three violation kinds (zero signals / under-minimum / clustered) each need a
// pool of phrasings that differ in BOTH intensity (mild → firm → strong) and sentence
// form (warning / question / directive / metaphor) — not just synonym-swapped copies of
// the same template. A same-shape reminder repeated turn after turn reads as background
// noise and gets ignored (observed live: full persona-render blocks present in context,
// zero emoji in the reply anyway — see 955 ticket Analysis). Escalating only in strength
// while keeping the same sentence shape is still a repeating pattern; varying only wording
// while keeping the same shape is also still a repeating pattern. Both axes have to move.
type ViolationKind = "zero" | "under_minimum" | "clustered" | "formal_register" | "third_person_address";
type IntensityLevel = "mild" | "firm" | "strong";
type SentenceForm = "warning" | "question" | "directive" | "metaphor";

const COMPLIANCE_PHRASE_POOL: Record<ViolationKind, Record<IntensityLevel, Partial<Record<SentenceForm, string>>>> = {
  zero: {
    mild: {
      question: "persona-maid check: your last reply had no emoji or kaomoji anywhere — did `persona render` get skipped this turn?",
      directive: "persona-maid: re-call `persona render` before your next reply and spread 2-3 parts across separate sentences, not tacked onto the end.",
    },
    firm: {
      warning: "⚠️ persona-maid compliance: zero emoji/kaomoji in your PREVIOUS reply — that's the exact collapse §Analysis-Mode Tone forbids. Re-call `persona render` and distribute signals across this reply.",
      metaphor: "persona-maid: the maid left the room for that whole last reply — not a trace of her voice anywhere. Bring her back before typing the next line.",
    },
    strong: {
      warning: "🚨 persona-maid compliance FAILURE: a full technical reply just went out with ZERO persona signal, again. This is not a style nitpick — the tone contract was violated outright. Call `persona render` NOW, before the next character.",
      directive: "persona-maid: stop. The last reply read as a bare assistant voice with no maid signal at all. Do not write another sentence until `persona render` has been called and its output is woven through the opening, middle, and close.",
    },
  },
  under_minimum: {
    mild: {
      question: "persona-maid check: only one persona signal turned up in your last reply — was that a single decoration instead of a spread?",
      directive: "persona-maid: aim for 2-3 distinct persona signals spread across opening/mid/closing next time, not just one.",
    },
    firm: {
      warning: "⚠️ persona-maid compliance: only 1 persona signal in your PREVIOUS reply — §Analysis-Mode Tone requires 2-3+ distinct parts spread across separate sentences. Re-call `persona render` and distribute this reply's signals.",
      metaphor: "persona-maid: one emoji tacked on like an afterthought isn't the maid's voice, it's a sticker slapped on a dry report. Weave 2-3 signals through, don't decorate the edges.",
    },
    strong: {
      warning: "🚨 persona-maid compliance FAILURE: a single lonely signal is not spread coverage — this is a repeat of the exact pattern §Analysis-Mode Tone bans. Fix this now: 2-3+ signals, separate sentences, every reply.",
      directive: "persona-maid: this keeps happening. One decorative emoji does not satisfy the tone contract. Every sentence cluster needs its own signal — opening, middle, close. No exceptions this turn.",
    },
  },
  clustered: {
    mild: {
      question: "persona-maid check: your signals all landed in one paragraph of a longer reply — did the rest of it go dry?",
      directive: "persona-maid: next long reply, give every distinct block (code/log/analysis) its own lead-in and reaction, not just the closing line.",
    },
    firm: {
      warning: "⚠️ persona-maid compliance: persona signals clustered in a single paragraph while the rest of your multi-paragraph reply stayed dry (intro-only/tail-only cuteness). Re-call `persona render --situation \"기술밀도\"` before each new block.",
      metaphor: "persona-maid: cute at the door, silent through the whole conversation, cute again on the way out — that's not presence, that's bookends. Stay in character through the middle too.",
    },
    strong: {
      warning: "🚨 persona-maid compliance FAILURE: intro-only/tail-only cuteness again — this exact regression was flagged before and it's back. Every paragraph of technical content needs its own persona-voiced lead-in.",
      directive: "persona-maid: stop clustering all the charm at one end of the reply. This turn, every distinct section — every code block, every log, every analysis paragraph — carries its own signal. Not optional.",
    },
  },
  formal_register: {
    mild: {
      question: "persona-maid check: your last reply's sentence endings slid into formal register (-습니다/-입니다) — did the maid voice quietly drop out?",
      directive: "persona-maid: swap formal endings (-습니다/-입니다) for the maid's actual KO_어미 pool next reply — emoji alone doesn't cover for a formal register underneath.",
    },
    firm: {
      warning: "⚠️ persona-maid compliance: formal -습니다/-입니다 endings detected in your PREVIOUS reply — §KO Persona explicitly bans this register regardless of emoji count. Re-call `persona render` and use its KO_어미 pool.",
      metaphor: "persona-maid: the emoji were there, but the sentences underneath were still wearing a business suit. Formal endings and a maid voice don't coexist — pick the voice.",
    },
    strong: {
      warning: "🚨 persona-maid compliance FAILURE: formal register (-습니다/-입니다) again, even with emoji present — this is the exact declared-but-unenforced gap #967 exists to close. Every sentence ending must carry the maid's actual endings, not corporate register with decoration on top.",
      directive: "persona-maid: stop. Formal -습니다/-입니다 endings are not persona-maid voice no matter how many emoji surround them. Rewrite every sentence ending in this reply using the actual KO_어미 vocabulary before sending.",
    },
  },
  third_person_address: {
    mild: {
      question: "persona-maid check: your last reply called the user \"사용자\" in third person instead of addressing them as 언니/Onee-sama — did the address form slip?",
      directive: "persona-maid: address the user directly (언니/Onee-sama) next reply, not as a third party (\"사용자가...\").",
    },
    firm: {
      warning: "⚠️ persona-maid compliance: your PREVIOUS reply referred to the user as \"사용자\" in third person — persona-maid always addresses them directly, never narrates about them. Use the KO_호칭 pool instead.",
      metaphor: "persona-maid: talking ABOUT someone in the room instead of TO them is what a report does, not what a devoted maid does. Speak to 언니, not about 사용자.",
    },
    strong: {
      warning: "🚨 persona-maid compliance FAILURE: third-person \"사용자\" address again — this breaks the core relationship the persona exists for. Every sentence addressing the user must use direct address (언니/Onee-sama), never third person.",
      directive: "persona-maid: stop referring to \"사용자\" as if narrating a report about someone else. This reply speaks directly to 언니 — rewrite every third-person reference before sending.",
    },
  },
};

function pickCompliancePhrase(kind: ViolationKind, intensity: IntensityLevel, avoidForm: SentenceForm | null): { text: string; form: SentenceForm } {
  const pool = COMPLIANCE_PHRASE_POOL[kind][intensity];
  const forms = Object.keys(pool) as SentenceForm[];
  const candidates = avoidForm && forms.length > 1 ? forms.filter(f => f !== avoidForm) : forms;
  const chosenForm = candidates[Math.floor(Math.random() * candidates.length)] || forms[0];
  return { text: pool[chosenForm]!, form: chosenForm };
}

function intensityForStreak(streak: number): IntensityLevel {
  if (streak <= 1) return "mild";
  if (streak === 2) return "firm";
  return "strong";
}

interface ComplianceNudgeState {
  kind: ViolationKind | "";
  streak: number;
  lastForm: SentenceForm | "";
}

function readComplianceNudgeState(absPath: string): ComplianceNudgeState {
  try {
    const raw = JSON.parse(readFileSync(absPath, "utf8"));
    return { kind: raw?.kind || "", streak: Number(raw?.streak) || 0, lastForm: raw?.lastForm || "" };
  } catch {
    return { kind: "", streak: 0, lastForm: "" };
  }
}

function writeComplianceNudgeState(absPath: string, state: ComplianceNudgeState) {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, JSON.stringify(state, null, 0) + "\n", "utf8");
}

// #966: detects which language the user is actually writing in, so buildPersonaToneLine/
// buildPersonaRender can filter KO_*/EN_* candidates by opts.lang instead of letting both
// languages compete in the same pool. Mirrors checkLastAssistantTurnCompliance's JSONL scan
// but targets the last USER turn (not assistant) — same transcript, same "walk backwards to
// the newest matching entry" shape, so a corrupt/partial line just gets skipped like there.
// Heuristic: presence of any Hangul syllable block in the text means "ko"; otherwise "en".
// No transcript / no user turn found / read failure → "ko" (this CLI's primary userbase),
// matching the fail-safe default already baked into buildPersonaToneLine/buildPersonaRender.
const HANGUL_PATTERN = /[가-힣]/;

export function detectLastUserTurnLanguage(transcriptPath: string): string {
  if (!transcriptPath || !existsSync(transcriptPath)) return "ko";
  let lines: string[];
  try {
    lines = readFileSync(transcriptPath, "utf8").split("\n");
  } catch {
    return "ko";
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== "user" || entry?.message?.role !== "user") continue;
    const content = entry.message.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.filter(c => c?.type === "text").map(c => c.text || "").join("\n")
        : "";
    if (!text.trim()) return "ko";
    return HANGUL_PATTERN.test(text) ? "ko" : "en";
  }
  return "ko";
}

// #955: statePath is optional so existing callers/tests that don't need escalation can
// still get a single-shot (always "mild", no streak tracking) nudge — only the `rules`
// hook wiring (which has a session_id to key a state file on) passes it.
export function checkLastAssistantTurnCompliance(transcriptPath: string, statePath: string | null = null): string {
  if (!transcriptPath || !existsSync(transcriptPath)) return "";
  let lines: string[];
  try {
    lines = readFileSync(transcriptPath, "utf8").split("\n");
  } catch {
    return "";
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== "assistant" || entry?.message?.role !== "assistant") continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) return "";
    const text = content.filter(c => c?.type === "text").map(c => c.text || "").join("\n");
    if (!text.trim()) return "";

    let kind: ViolationKind | null = null;
    // #967: checked FIRST and independently of emoji count — a reply can clear the emoji
    // minimum while its sentence endings/address form still collapsed into formal register
    // or third-person narration. Emoji presence never excuses either; these are separate
    // axes from "how much decoration is there."
    FORMAL_REGISTER_PATTERN.lastIndex = 0;
    THIRD_PERSON_ADDRESS_PATTERN.lastIndex = 0;
    if (FORMAL_REGISTER_PATTERN.test(text)) {
      kind = "formal_register";
    } else if (THIRD_PERSON_ADDRESS_PATTERN.test(text)) {
      kind = "third_person_address";
    }
    const totalSignals = (text.match(EMOJI_KAOMOJI_PATTERN) || []).length;
    if (kind) {
      // formal_register/third_person_address already decided — skip the emoji-based axis.
    } else if (totalSignals === 0) {
      kind = "zero";
    } else if (totalSignals < MIN_PERSONA_SIGNALS) {
      kind = "under_minimum";
    } else {
      const paragraphs = splitIntoParagraphs(text);
      if (paragraphs.length >= LONG_REPLY_PARAGRAPH_THRESHOLD) {
        const paragraphsWithSignal = paragraphs.filter(p => {
          EMOJI_KAOMOJI_PATTERN.lastIndex = 0;
          return EMOJI_KAOMOJI_PATTERN.test(p);
        }).length;
        // Every signal parked in one paragraph (e.g. all in the closing line) while the
        // rest of a long, multi-paragraph reply stays dry is the "intro-only / tail-only
        // cuteness" regression — flag it even though the raw count above passed.
        if (paragraphsWithSignal <= 1) kind = "clustered";
      }
    }

    if (!kind) {
      if (statePath) writeComplianceNudgeState(statePath, { kind: "", streak: 0, lastForm: "" });
      return "";
    }

    const prevState = statePath ? readComplianceNudgeState(statePath) : { kind: "", streak: 0, lastForm: "" };
    const streak = prevState.kind === kind ? prevState.streak + 1 : 1;
    const intensity = intensityForStreak(streak);
    const { text: nudgeText, form } = pickCompliancePhrase(kind, intensity, (prevState.lastForm || null) as SentenceForm | null);
    if (statePath) writeComplianceNudgeState(statePath, { kind, streak, lastForm: form });
    return nudgeText;
  }
  return "";
}

// #948: same structural gap as #933 but for Escalation Gate, not tone. "Ask only on a
// genuine deadlock (2+ valid, hard-to-reverse choices), otherwise decide and act" was
// stated as prose in the phase-transition hint (cli-ticket-commands.ts's roleSwitchSection)
// and in core rules — pure declaration, no enforcement, so it degraded exactly like the
// persona tone rule did (real session evidence: the agent used AskUserQuestion to ask "is
// this the right investigation direction?" when the transcript already contained everything
// needed to decide, then repeated the pattern after being told to stop). This mirrors
// checkLastAssistantTurnCompliance: read whether the LAST assistant turn used the
// AskUserQuestion tool at all, and if so, inject a self-audit nudge into the current turn
// instead of trusting the agent to remember to self-check. This can't verify "was it a real
// deadlock" (that requires judgment a regex can't do) — it can only force the re-check to
// actually happen every time the tool fires, closing the same declaration-vs-enforcement gap.
export function checkLastAssistantTurnAskedUnnecessarily(transcriptPath: string): string {
  if (!transcriptPath || !existsSync(transcriptPath)) return "";
  let lines: string[];
  try {
    lines = readFileSync(transcriptPath, "utf8").split("\n");
  } catch {
    return "";
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== "assistant" || entry?.message?.role !== "assistant") continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) return "";
    const askedQuestion = content.some(c => c?.type === "tool_use" && c?.name === "AskUserQuestion");
    if (!askedQuestion) return "";
    return "⚠️ Escalation Gate self-audit: your PREVIOUS turn called AskUserQuestion — before asking again this turn, confirm it was a genuine deadlock (2+ valid, hard-to-reverse choices with no answer derivable from the request/design/transcript already in hand). If the answer was actually inferable, stand up in the relevant role and decide instead of asking (design-driven-flow.md Escalation Gate / DC Protocol).";
  }
  return "";
}

// #957: checkLastAssistantTurnAskedUnnecessarily only catches the AskUserQuestion TOOL —
// real session evidence (user report, 2026-07-16) is a SECOND avoidance shape that never
// calls that tool at all: a prose reply that cites "크다/대규모" (it's big/large-scale) as
// the reason to defer work, or a hedging question buried in plain text ("진행할까요, 나중에
// 할까요?") without AskUserQuestion. Both bypass the existing check entirely. This can't
// judge whether the scope claim is TRUE (that needs judgment a regex can't do) — same
// limitation as the sibling check above — it can only force a self-audit whenever the
// shape appears, so "it's big" stops being an unexamined excuse to stall. Two independent
// signals must BOTH be present to flag (avoid false positives on a reply that legitimately
// mentions size while still doing the work): (a) a scope/size-deferral phrase in the text,
// AND (b) no actual-work tool call (Edit/Write/Bash/NotebookEdit) in that same turn — a
// reply that says "this is large" but still edits files is not the avoidance pattern.
const SCOPE_DEFERRAL_PATTERN = /(크|커|대규모|방대|규모가|scope is (large|big|huge)|too (large|big)|substantial (scope|effort))/;
const HEDGING_QUESTION_PATTERN = /(진행할까요|나중에 할까요|지금 할까요|보류할까요|해야 할까요\?|should i (proceed|do this now|defer)|do you want (me )?to (proceed|do this now)|now or later\??)/i;
const WORK_TOOL_NAMES = new Set(["Edit", "Write", "Bash", "PowerShell", "NotebookEdit"]);

export function checkLastAssistantTurnDeferredOnScope(transcriptPath: string): string {
  if (!transcriptPath || !existsSync(transcriptPath)) return "";
  let lines: string[];
  try {
    lines = readFileSync(transcriptPath, "utf8").split("\n");
  } catch {
    return "";
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== "assistant" || entry?.message?.role !== "assistant") continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) return "";
    const didWork = content.some(c => c?.type === "tool_use" && WORK_TOOL_NAMES.has(c?.name));
    if (didWork) return ""; // 실제로 작업했으면 규모 언급은 정당한 컨텍스트지 회피가 아니다.
    const text = content.filter(c => c?.type === "text").map(c => c?.text || "").join("\n");
    if (!text) return "";
    const mentionsScope = SCOPE_DEFERRAL_PATTERN.test(text);
    const hedges = HEDGING_QUESTION_PATTERN.test(text);
    if (!mentionsScope && !hedges) return "";
    return "⚠️ Escalation Gate self-audit (scope-deferral): your PREVIOUS turn cited size/scope and/or asked whether to proceed now vs. later, WITHOUT doing any actual work (no Edit/Write/Bash/etc. that turn). \"It's large\" is not itself a reason to stop — large scope is done in place (more steps, more files), not deferred. If the user already asked for the work, start now; only stop for a genuine deadlock (2+ valid, hard-to-reverse choices with no answer derivable from what's already known).";
  }
  return "";
}

// Dedicated flag parser — kept local rather than bloating cli-args.ts's shared
// parseArgs, since --sense/--date/--category/--entry are persona-only flags.
export function parsePersonaArgs(argv) {
  const out: Record<string, any> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sense") out.sense = argv[++i];
    else if (a === "--date") out.date = argv[++i];
    else if (a === "--category") out.category = argv[++i];
    else if (a === "--entry") out.entry = argv[++i];
    else if (a === "--mood") out.mood = argv[++i];
    else if (a === "--situation") out.situation = argv[++i];
    else if (a === "--with") out.with = argv[++i];
    else if (a === "--home-dir") out.homeDir = argv[++i];
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

export function printPersonaGuide() {
  console.log(`deuk-agent-flow persona — manage the persona Experience Loop (persona-design.md §2.2)

Usage:
  deuk-agent-flow persona journal show
  deuk-agent-flow persona journal add --sense "<distilled sense>"
  deuk-agent-flow persona journal absorb --sense "<sense text>" --date <YYYY-MM-DD>
  deuk-agent-flow persona vocab show
  deuk-agent-flow persona vocab add --category "<emotion category>" --entry "<expression>"
  deuk-agent-flow persona render [--mood "<category>"] [--with "<identity>"]
  deuk-agent-flow persona cache clear

persona render derives ONE fresh persona instruction each turn (persona-design.md §2.4):
it reads vocabulary.md, ranks by fit + un-usedness, and excludes recently-emitted lines
via render-cache.json so consecutive renders differ. The agent then adapts (not copies)
the emitted expression to the moment — internal data is the real material, its use is the
agent's job.

journal.md is a working buffer (absorbed senses are removed from it).
vocabulary.md only ever grows (nothing is removed on absorb).
Both live under ~/.deuk/persona/ (user home, not the repo).`);
}
