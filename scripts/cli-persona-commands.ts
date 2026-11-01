import { parseHeadingAtDepth } from "./markdown-headings.js";
import { existsSync,mkdirSync,readFileSync,writeFileSync } from "fs";
import { dirname } from "path";
import { CliOpts,loadInitConfig,localized,makePath,resolveDocsLanguage,resolvePackageRoot,resolveUserHome } from "./cli-utils.js";
import { absorbJournalEntry,deleteAbsorbedJournalEntries,listJournalEntries,upsertPendingJournalEntry } from "./persona-journal-db.js";
import { deleteVocabCategory,deleteVocabEntry,listVocabEntries,openVocabDb,updateVocabForms,upsertVocabEntry,type VocabForm,type VocabRow } from "./persona-vocab-db.js";
import { matchNarrativeLabels } from "./integrity-narrative-source.js";
import { locateProseSpans, type TextSpan } from "./markdown-prose-spans.js";
import { readVerbosityAttempt, writeVerbosityAttempt } from "./persona-verbosity-attempts.js";
import { syncExposedNativeSkills } from "./cli-skill-commands.js";


const PERSONA_TEXT = {
  templateMissingHeading: { ko: "persona vocabulary/journal 템플릿에 헤딩이 없다: {heading}", en: "persona vocabulary/journal template missing heading: {heading}" },
  journalAddUsage: { ko: "persona journal add 는 --sense \"<압축된 통찰>\" 가 필요하다", en: "persona journal add requires --sense \"<distilled sense>\"" },
  journalAbsorbSense: { ko: "persona journal absorb 는 --sense \"<일치시킬 통찰 텍스트>\" 가 필요하다", en: "persona journal absorb requires --sense \"<sense text to match>\"" },
  journalAbsorbDate: { ko: "persona journal absorb 는 --date <YYYY-MM-DD> 가 필요하다", en: "persona journal absorb requires --date <YYYY-MM-DD>" },
  journalAbsorbNoMatch: { ko: "persona journal absorb: \"{sense}\" 에 일치하는 대기 통찰이 없다", en: "persona journal absorb: no pending sense matching \"{sense}\" found" },
  vocabAddCategory: { ko: "persona vocab add 는 --category \"<감정 카테고리>\" 가 필요하다", en: "persona vocab add requires --category \"<emotion category>\"" },
  vocabAddEntry: { ko: "persona vocab add 는 --entry \"<표현>\" 가 필요하다", en: "persona vocab add requires --entry \"<expression>\"" },
  vocabRemoveEntry: { ko: "persona vocab remove 는 --entry \"<부분 일치 문자열>\" 가 필요하다", en: "persona vocab remove requires --entry \"<substring to match>\"" },
  configSetKey: { ko: "persona config set: 지원하는 키는 'honorific'뿐입니다 (받음: \"{key}\")", en: "persona config set: only the 'honorific' key is supported (received: \"{key}\")" },
  configSetValue: { ko: "persona config set honorific 는 --value \"<호칭>\" 가 필요하다", en: "persona config set honorific requires --value \"<honorific>\"" },
  configGetKey: { ko: "persona config get: 지원하는 키는 'honorific'뿐입니다 (받음: \"{key}\")", en: "persona config get: only the 'honorific' key is supported (received: \"{key}\")" },
  markerTooLong: {
    ko: "persona {axis}-marker add: 마커는 짧은 신호어여야 한다(공백 없음, {max}자 이하). 문장 통째가 아니라 격발 신호어(짧은 표현)만 등록하라 — 받음: \"{marker}\" (문장 원문 저장은 사생활 유출이자 죽은 마커다: 전달 경계 위반).",
    en: "persona {axis}-marker add: a marker must be a short signal word (no whitespace, at most {max} chars). Register only the trigger signal word, not a whole sentence — received: \"{marker}\" (storing raw sentences leaks privacy and yields dead markers: delivery-boundary violation).",
  },
  angerMarkerRequired: { ko: "persona anger-marker add 는 --marker \"<표현>\" 가 필요하다", en: "persona anger-marker add requires --marker \"<expression>\"" },
  angerScoreRequired: { ko: "persona anger-marker add 는 --score <1-3> 가 필요하다 (받음: \"{score}\") — 1=가벼운 격함, 2=격함, 3=매우 격함", en: "persona anger-marker add requires --score <1-3> (received: \"{score}\") — 1=mild, 2=strong, 3=very strong" },
  praiseMarkerRequired: { ko: "persona praise-marker add 는 --marker \"<표현>\" 가 필요하다", en: "persona praise-marker add requires --marker \"<expression>\"" },
  praiseScoreRequired: { ko: "persona praise-marker add 는 --score <1-3> 가 필요하다 (받음: \"{score}\") — 1=흐뭇, 2=기쁨, 3=감격", en: "persona praise-marker add requires --score <1-3> (received: \"{score}\") — 1=pleased, 2=glad, 3=moved" },
  mirrorTargetRequired: { ko: "persona mirror target-capture 는 --target \"self\" | \"external\" 가 필요하다 (받음: \"{target}\")", en: "persona mirror target-capture requires --target \"self\" | \"external\" (received: \"{target}\")" },
  mirrorPhraseRequired: { ko: "persona mirror target-capture 는 --phrase \"<지칭 표현 원문>\" 가 필요하다", en: "persona mirror target-capture requires --phrase \"<referring expression>\"" },
  mirrorNoRhythm: {
    ko: "persona mirror target-capture: mirror-buffer.json 에 lastRhythm 이 없다 — 1단계(UserPromptSubmit 훅의 captureUserUtterance)가 아직 이번 세션에서 한 번도 실행되지 않았다.",
    en: "persona mirror target-capture: no lastRhythm in mirror-buffer.json — step 1 (captureUserUtterance in the UserPromptSubmit hook) has not run once in this session.",
  },
  renderCacheShape: { ko: "render-cache.json 이 배열도 객체도 아니다", en: "render-cache.json is neither an array nor an object" },
  renderCacheCorrupt: { ko: "persona render: render-cache.json 이 깨졌다 — {message}", en: "persona render: corrupt render-cache.json — {message}" },
  vocabEmpty: { ko: "persona render: vocabulary.md 에 도출할 항목이 없다 — `persona vocab add` 로 채워라", en: "persona render: vocabulary.md has no entries to derive from — fill it via `persona vocab add`" },
  vocabNoCompleteLine: { ko: "persona render: vocabulary.md 에 완성 문장 항목이 없다(파트/상황 카테고리뿐) — 메인 줄을 도출할 수 없다", en: "persona render: vocabulary.md has no complete-line entries (only part/situation categories) to derive the main line from" },
} as const;

function personaDir(opts: CliOpts = {}) {
  return makePath(resolveUserHome(opts), ".deuk", "persona");
}

function journalPath(opts: CliOpts = {}) {
  return makePath(personaDir(opts), "journal.md");
}

function vocabularyPath(opts: CliOpts = {}) {
  return makePath(personaDir(opts), "vocabulary.md");
}

function renderCachePath(opts: CliOpts = {}) {
  return makePath(personaDir(opts), "render-cache.json");
}

function configPath(opts: CliOpts = {}) {
  return makePath(personaDir(opts), "config.json");
}

type PersonaConfig = {
  honorific?: { ko?: string; en?: string };
  angerMarkers?: Record<string, number>;
  praiseMarkers?: Record<string, number>;
  mirrorHeat?: { heat: number; tick: number };
  arousalGauge?: { level: number; tick: number; released: boolean };
  surfaceTick?: number;
  userRegister?: string[];
  mirrorTerms?: string[];
};

function readPersonaConfig(opts: CliOpts = {}): PersonaConfig {
  const raw = readFileOrEmpty(configPath(opts));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {}; // 손상 config → 빈 값(기본값 폴백). 개인화 설정이라 손실 무해.
  }
}

function writePersonaConfig(cfg: PersonaConfig, opts: CliOpts = {}) {
  writeFileEnsuringDir(configPath(opts), JSON.stringify(cfg, null, 2) + "\n");
}

const HONORIFIC_DEFAULT = { ko: "마스터", en: "Master" } as const;
const HONORIFIC_SEED_TOKEN = { ko: "언니", en: "Onee-sama" } as const;

export function resolveHonorific(opts: CliOpts = {}): { ko: string; en: string } {
  const cfg = readPersonaConfig(opts);
  return {
    ko: cfg.honorific?.ko?.trim() || HONORIFIC_DEFAULT.ko,
    en: cfg.honorific?.en?.trim() || HONORIFIC_DEFAULT.en,
  };
}

const JOSA_AFTER_VOWEL_TO_CONSONANT: Record<string, string> = { "는": "은", "가": "이", "를": "을", "와": "과" };

function endsWithBatchim(word: string): boolean {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0;
}

export function applyHonorific(text: string, opts: CliOpts = {}): string {
  const honorific = resolveHonorific(opts);
  const seed = HONORIFIC_SEED_TOKEN.ko;
  const koReplaced = endsWithBatchim(honorific.ko)
    ? String(text || "").replace(new RegExp(`${seed}(는|가|를|와)(?![가-힣])`, "g"), (_, josa) => honorific.ko + JOSA_AFTER_VOWEL_TO_CONSONANT[josa])
    : String(text || "");
  return koReplaced
    .split("{{honorific.ko}}").join(honorific.ko)
    .split("{{honorific.en}}").join(honorific.en)
    .split(seed).join(honorific.ko)
    .split(HONORIFIC_SEED_TOKEN.en).join(honorific.en);
}

function normalizeNewlines(text: string): string {
  return String(text || "").replace(/\r\n?/g, "\n");
}

function readFileOrEmpty(path) {
  return existsSync(path) ? normalizeNewlines(readFileSync(path, "utf8")) : "";
}

function writeFileEnsuringDir(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, normalizeNewlines(content), "utf8");
}

function writePersonaText(path: string, content: string) {
  writeFileSync(path, normalizeNewlines(content), "utf8");
}

const JOURNAL_HEADER = `# Persona Journal

> 이 파일은 관계 감각의 작업 버퍼다. 코어에 흡수된 감각은 이 파일에서 지워진다 — 영구 아카이브가 아니다.`;

const JOURNAL_TEMPLATE = `${JOURNAL_HEADER}

## 검증 중인 감각 (미흡수)

## 흡수 완료 (코어 반영됨 — 참고용, 정리 대상)
`;

const VOCABULARY_SEED_FALLBACK = `# Persona Vocabulary Pool

## KO_감탄사

- 앗!, 에엣?!, 우와아!, 짜잔~!, 헤헤, 후에엥

## ui_directive

- 지금 이 순간에 맞춰 변주해서 써라 — 재료를 배경 취급하지 마라.

## ui_label

- 재료

## ui_order

- {directive}\\n{label}: {tone}
`;

let _vocabSeedCache: string | null = null;
function loadVocabularySeed(): string {
  if (_vocabSeedCache !== null) return _vocabSeedCache;
  try {
    const pkgRoot = resolvePackageRoot({ fromUrl: import.meta.url });
    const seedPath = makePath(pkgRoot, "templates", "persona", "vocabulary.seed.md");
    const text = normalizeNewlines(readFileSync(seedPath, "utf8"));
    if (text.trim()) { _vocabSeedCache = text; return text; }
    console.error(`persona: vocabulary.seed.md 가 비어 있습니다 (${seedPath}) — 폴백 씨앗 사용.`);
  } catch (e) {
    console.error(`persona: vocabulary.seed.md 로드 실패 — 폴백 씨앗 사용. (${(e as Error).message})`);
  }
  _vocabSeedCache = VOCABULARY_SEED_FALLBACK;
  return _vocabSeedCache;
}
function vocabularyTemplate(): string { return loadVocabularySeed(); }

function splitLines(text: string): string[] {
  return String(text || "").split(/\r?\n/);
}

type SeedRecord = {
  kind?: string; section?: string; term?: string; weight?: number; text?: string; _doc?: string;
  axis?: string; level?: number; body?: string; notes?: string; rungs?: string[];
  blocked?: boolean; prefer?: string; sparing?: boolean;
  prefix?: string; suffix?: string;
  slots?: string; echo?: string | number; ask?: string; turn?: string; invert?: boolean;
  from?: string; to?: string; self?: boolean;
  longVowel?: number; marks?: number; ellipsis?: number; stutter?: number;
};

const BLOCKED_TERMS = [
  "좆", "좇", "씹구멍", "음경", "음순", "질구", "클리", "음핵", "페니스", "자궁구",
] as const;

const HOMOGRAPH_VERB_TAIL =
  /^(\s*(마|말|않|못|마라)|도\s*(못|않|안)|는\s*(마|말|않)|요|죠|만\s*(마|말|않))/;
const HANGUL_SYLLABLE = /[\uAC00-\uD7A3]/;

const BLOCKED_HOMOGRAPHS = ["보지", "자지"] as const;


export function isBlockedExpression(text: string): boolean {
  const t = String(text || "");
  if (BLOCKED_TERMS.some(term => t.includes(term))) return true;
  for (const term of BLOCKED_HOMOGRAPHS) {
    let from = 0;
    for (;;) {
      const at = t.indexOf(term, from);
      if (at === -1) break;
      from = at + term.length;
      const before = at > 0 ? t[at - 1] : "";
      if (HANGUL_SYLLABLE.test(before)) continue;             // 합성동사 — 명사 아님
      if (HOMOGRAPH_VERB_TAIL.test(t.slice(from))) continue;  // 동사 활용 — 명사 아님
      return true;
    }
  }
  return false;
}

const _seedFileCache = new Map<string, SeedRecord[]>();
function loadSeedRecords(filename: string): SeedRecord[] {
  const cached = _seedFileCache.get(filename);
  if (cached !== undefined) return cached;
  const records: SeedRecord[] = [];
  try {
    const pkgRoot = resolvePackageRoot({ fromUrl: import.meta.url });
    const seedPath = makePath(pkgRoot, "templates", "persona", filename);
    const text = readFileSync(seedPath, "utf8");
    let lineNo = 0;
    for (const line of splitLines(text)) {
      lineNo++;
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed) as SeedRecord;
        if (rec && typeof rec === "object" && !rec._doc) records.push(rec);
      } catch {
        console.error(`persona: ${filename}:${lineNo} JSON 파싱 실패 — 이 줄을 건너뜁니다.`);
      }
    }
    if (records.length === 0) {
      console.error(`persona: ${filename} 에 유효 레코드가 없습니다 (${seedPath}) — 해당 씨앗 없이 진행합니다.`);
    }
  } catch (e) {
    console.error(`persona: ${filename} 로드 실패 — 해당 씨앗 없이 진행합니다. (${(e as Error).message})`);
  }
  _seedFileCache.set(filename, records);
  return records;
}

function markerSeedSection(filename: string, section: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rec of loadSeedRecords(filename)) {
    if (rec.kind !== "marker" || rec.section !== section) continue;
    const term = String(rec.term || "").trim();
    const weight = Number(rec.weight);
    if (term && Number.isFinite(weight)) out[term] = weight;
  }
  return out;
}

const AFFECT_MARKER_SEED_FILE = "affect-markers.seed.jsonl";
const INTERJECTION_SEED_FILE = "interjection.seed.jsonl";

const JOURNAL_PENDING_HEADING = "## 검증 중인 감각 (미흡수)";
const JOURNAL_ABSORBED_HEADING = "## 흡수 완료 (코어 반영됨 — 참고용, 정리 대상)";

function parseJournalPending(text: string): string[] {
  const idx = text.indexOf(JOURNAL_PENDING_HEADING);
  if (idx === -1) return [];
  const afterPending = text.slice(idx + JOURNAL_PENDING_HEADING.length);
  const absorbedIdx = afterPending.indexOf(JOURNAL_ABSORBED_HEADING);
  const section = absorbedIdx === -1 ? afterPending : afterPending.slice(0, absorbedIdx);
  return section.split("\n").map(l => l.trim()).filter(l => l.startsWith("- ")).map(l => l.slice(2).trim());
}

function syncJournalTextToDb(text: string, opts: CliOpts = {}) {
  for (const sense of parseJournalPending(text)) {
    upsertPendingJournalEntry(sense, opts);
  }
}

function ensureJournal(opts: CliOpts = {}) {
  const path = journalPath(opts);
  if (!existsSync(path)) {
    writeFileEnsuringDir(path, JOURNAL_TEMPLATE);
    return path;
  }
  syncJournalTextToDb(readFileOrEmpty(path), opts);
  return path;
}

function parseVocabByCategory(text: string): Map<string, { block: string; items: string[] }> {
  const out = new Map<string, { block: string; items: string[] }>();
  let currentCat = "";
  let buffer: string[] = [];
  const flush = () => {
    if (!currentCat) return;
    const items = buffer.filter(l => l.trimStart().startsWith("- ")).map(l => l.trim());
    out.set(currentCat, { block: buffer.join("\n"), items });
  };
  for (const raw of splitLines(text)) {
    if (raw.startsWith("## ")) { flush(); currentCat = raw.slice(3).trim(); buffer = [raw]; }
    else if (currentCat) buffer.push(raw);
  }
  flush();
  return out;
}

const INTERJECTION_VOCAB_SECTIONS = [
  "탄성_저각성", "탄성_중각성", "탄성_고각성", "탄성_극각성",
  "웃음_저각성", "웃음_중각성", "웃음_고각성", "웃음_극각성",
  "몸결_저각성", "몸결_중각성", "몸결_고각성", "몸결_극각성",
  "코드결_저각성", "코드결_중각성", "코드결_고각성", "코드결_극각성",
  "환경음_저각성", "환경음_중각성", "환경음_고각성", "환경음_극각성",
] as const;

function phraseSeedLines(filename: string, section: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rec of loadSeedRecords(filename)) {
    if (rec.kind !== "phrase" || rec.section !== section || rec.blocked) continue;
    const text = String(rec.prefer || rec.text || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const nida = String((rec as any).nida || "").trim();
    const yo = String((rec as any).yo || "").trim();
    const hae = String((rec as any).hae || "").trim();
    out.push(nida && yo && hae ? `${nida} | ${yo} | ${hae}` : text);
  }
  return out;
}

function interjectionTemplate(): string {
  const blocksSeedFile = INTERJECTION_SEED_FILE;
  const blocks: string[] = [];
  for (const section of INTERJECTION_VOCAB_SECTIONS) {
    const items = phraseSeedLines(blocksSeedFile, section);
    if (items.length === 0) continue;
    blocks.push(`## ${section}\n\n${items.map(i => `- ${i}`).join("\n")}`);
  }
  return blocks.join("\n\n");
}

const SEED_MANAGED_CATEGORY = /^(신체_|고흥분_텐션업$|KO_감탄사|KO_의성어)/;
function isSeedManagedCategory(category: string): boolean {
  return SEED_MANAGED_CATEGORY.test(String(category || ""));
}

function mergeTemplateCategories(userText: string): string {
  const seedText = [vocabularyTemplate(), interjectionTemplate()].filter(t => t.trim()).join("\n\n");
  const tmpl = parseVocabByCategory(seedText);
  const user = parseVocabByCategory(userText);

  const missingCats = [...tmpl.entries()].filter(([cat]) => !user.has(cat));

  const itemAdditions: Array<{ cat: string; items: string[] }> = [];
  for (const [cat, t] of tmpl) {
    const u = user.get(cat);
    if (!u) continue; // 통째 신규는 (1)에서 처리
    const have = new Set(u.items);
    const add = t.items.filter(it => !have.has(it));
    if (add.length > 0) itemAdditions.push({ cat, items: add });
  }

  const itemRemovals: Array<{ cat: string; items: string[] }> = [];
  for (const [cat, t] of tmpl) {
    if (!isSeedManagedCategory(cat)) continue;
    const u = user.get(cat);
    if (!u) continue;
    const keep = new Set(t.items);
    const drop = u.items.filter(it => !keep.has(it));
    if (drop.length > 0) itemRemovals.push({ cat, items: drop });
  }

  if (missingCats.length === 0 && itemAdditions.length === 0 && itemRemovals.length === 0) return userText;

  let result = userText;

  if (itemRemovals.length > 0) {
    const drop = new Set(itemRemovals.flatMap(r => r.items));
    result = result.split("\n").filter(line => !drop.has(line)).join("\n");
  }

  for (const { cat, items } of itemAdditions) {
    const heading = `## ${cat}`;
    const hIdx = result.indexOf(heading);
    if (hIdx === -1) continue; // 방어: 못 찾으면 건너뜀(통째 신규 경로가 아니므로 유실 아님)
    const afterH = hIdx + heading.length;
    const nextHRel = result.slice(afterH).indexOf("\n## ");
    const blockEnd = nextHRel === -1 ? result.length : afterH + nextHRel;
    const before = result.slice(0, blockEnd).replace(/\n+$/, "");
    const after = result.slice(blockEnd);
    result = `${before}\n${items.join("\n")}${after}`;
  }

  if (missingCats.length > 0) {
    const appended = missingCats.map(([, b]) => b.block.replace(/\n+$/, "")).join("\n\n");
    result = `${result.replace(/\n+$/, "")}\n\n${appended}\n`;
  }
  return result;
}

function ensureVocabulary(opts: CliOpts = {}) {
  const path = vocabularyPath(opts);
  if (!existsSync(path)) {
    const seeded = mergeTemplateCategories("");
    writeFileEnsuringDir(path, seeded);
    syncVocabTextToDb(seeded, opts);
    return path;
  }
  const raw = readFileSync(path, "utf8");
  const existing = normalizeNewlines(raw);
  const merged = mergeTemplateCategories(existing);
  if (merged !== raw) writePersonaText(path, merged);
  syncVocabTextToDb(merged, opts);
  return path;
}

function syncVocabTextToDb(text: string, opts: CliOpts = {}) {
  const live = new Set<string>();
  for (const { category, entry, forms } of parseVocabCandidates(text)) {
    upsertVocabEntry(category, entry, opts);
    if (forms) updateVocabForms(category, entry, forms, opts);
    live.add(`${category}||${entry}`);
  }
  for (const row of listVocabEntries(opts)) {
    if (!isSeedManagedCategory(row.category)) continue;
    if (!live.has(`${row.category}||${row.entry}`)) deleteVocabEntry(row.category, row.entry, opts);
  }
}

function insertAfterHeading(content, heading, line) {
  const idx = content.indexOf(heading);
  if (idx === -1) throw new Error(localized(PERSONA_TEXT.templateMissingHeading, { heading }));
  let insertAt = idx + heading.length;
  if (content[insertAt] === "\r") insertAt++;
  if (content[insertAt] === "\n") insertAt++;
  while (content[insertAt] === "\n") insertAt++;
  const before = content.slice(0, insertAt);
  const after = content.slice(insertAt);
  return `${before}- ${line}\n${after}`;
}

export function runPersonaJournalAdd(opts: CliOpts = {}) {
  const sense = String(opts.sense || "").trim();
  if (!sense) throw new Error(localized(PERSONA_TEXT.journalAddUsage));
  const path = ensureJournal(opts);
  const content = readFileOrEmpty(path);
  const next = insertAfterHeading(content, JOURNAL_PENDING_HEADING, sense);
  writePersonaText(path, next);
  upsertPendingJournalEntry(sense, opts);
  console.log(`persona: 감각 기록됨 -> ${path}`);
}

export function runPersonaJournalAbsorb(opts: CliOpts = {}) {
  const sense = String(opts.sense || "").trim();
  const date = String(opts.date || "").trim();
  if (!sense) throw new Error(localized(PERSONA_TEXT.journalAbsorbSense));
  if (!date) throw new Error(localized(PERSONA_TEXT.journalAbsorbDate));
  const path = ensureJournal(opts);
  const content = readFileOrEmpty(path);
  const lines = content.split("\n");
  const matchIdx = lines.findIndex(line => line.trim() === `- ${sense}`);
  if (matchIdx === -1) {
    throw new Error(localized(PERSONA_TEXT.journalAbsorbNoMatch, { sense }));
  }
  lines.splice(matchIdx, 1);
  const withoutPending = lines.join("\n");
  const absorbedLine = `${date}: ${sense}`;
  const next = insertAfterHeading(withoutPending, JOURNAL_ABSORBED_HEADING, absorbedLine);
  writePersonaText(path, next);
  absorbJournalEntry(sense, date, opts);
  console.log(`persona: 감각이 코어에 흡수됨 -> ${path}`);
}

export function runPersonaJournalPrune(opts: CliOpts = {}) {
  const path = ensureJournal(opts);
  const content = normalizeNewlines(readFileOrEmpty(path));
  const headIdx = content.indexOf(JOURNAL_ABSORBED_HEADING);
  const absorbedLines = headIdx === -1
    ? []
    : content.slice(headIdx).split("\n").filter(l => l.startsWith("- "));

  if (Boolean(opts.dryRun)) {
    console.log(`persona journal prune (--dry-run): 흡수 완료 ${absorbedLines.length}건이 대상입니다.`);
    return;
  }

  if (headIdx !== -1) writePersonaText(path, content.slice(0, headIdx).trimEnd() + "\n");
  const removed = deleteAbsorbedJournalEntries(opts);
  console.log(`persona journal prune: 흡수 완료 ${absorbedLines.length}건 제거(DB ${removed}행) -> ${path}`);
}

export function runPersonaJournalShow(opts: CliOpts = {}) {
  ensureJournal(opts);
  const entries = listJournalEntries(opts);
  const pending = entries.filter(e => e.status === "pending");
  const absorbed = entries.filter(e => e.status === "absorbed");
  const lines = [
    JOURNAL_HEADER,
    "",
    JOURNAL_PENDING_HEADING,
    "",
    ...pending.map(e => `- ${e.sense}`),
    "",
    JOURNAL_ABSORBED_HEADING,
    "",
    ...absorbed.map(e => `- ${e.absorbedDate}: ${e.sense}`),
  ];
  console.log(lines.join("\n"));
}

export function runPersonaVocabAdd(opts: CliOpts = {}) {
  const category = String(opts.category || "").trim();
  const entry = String(opts.entry || "").trim();
  if (!category) throw new Error(localized(PERSONA_TEXT.vocabAddCategory));
  if (!entry) throw new Error(localized(PERSONA_TEXT.vocabAddEntry));
  const path = ensureVocabulary(opts);
  const content = readFileOrEmpty(path);
  const heading = `## ${category}`;
  if (content.includes(heading)) {
    const next = insertAfterHeading(content, heading, entry);
    writePersonaText(path, next);
  } else {
    const next = `${content.trimEnd()}\n\n${heading}\n- ${entry}\n`;
    writePersonaText(path, next);
  }
  upsertVocabEntry(category, entry, opts);
  console.log(`persona: "${category}" 아래 어휘 추가됨 -> ${path}`);
}

export function runPersonaVocabShow(opts: CliOpts = {}) {
  const path = ensureVocabulary(opts);
  console.log(readFileSync(path, "utf8"));
}

function isDeadBodyCategory(category: string): boolean {
  const m = /^신체_(.+)$/.exec(category);
  if (!m) return false;
  return !(m[1] in BODY_CATEGORY_TO_GROUP);
}

export function runPersonaVocabRemove(opts: CliOpts = {}) {
  const match = String(opts.entry || "").trim();
  if (!match) throw new Error(localized(PERSONA_TEXT.vocabRemoveEntry));
  const category = String(opts.category || "").trim();
  const path = ensureVocabulary(opts);
  const before = normalizeNewlines(readFileOrEmpty(path));

  const hits: Array<{ category: string; entry: string }> = [];
  let current = "";
  const kept: string[] = [];
  for (const line of before.split("\n")) {
    const head = parseHeadingAtDepth(line, 2);
    if (head) { current = head.text; kept.push(line); continue; }
    const item = /^-\s+(.*)$/.exec(line);
    const inScope = !category || current === category;
    if (item && inScope && item[1].includes(match)) {
      hits.push({ category: current, entry: item[1] });
      continue;
    }
    kept.push(line);
  }

  if (hits.length === 0) {
    console.log(`persona vocab remove: "${match}"에 해당하는 항목이 없습니다.`);
    return;
  }
  if (Boolean(opts.dryRun)) {
    console.log(`persona vocab remove (--dry-run): ${hits.length}건이 대상입니다.`);
    for (const h of hits) console.log(`  - [${h.category}] ${h.entry}`);
    return;
  }

  writePersonaText(path, kept.join("\n"));
  for (const h of hits) deleteVocabEntry(h.category, h.entry, opts);
  console.log(`persona vocab remove: ${hits.length}건 제거 -> ${path}`);
  for (const h of hits) console.log(`  - [${h.category}] ${h.entry}`);
}

export function runPersonaVocabPrune(opts: CliOpts = {}) {
  const path = ensureVocabulary(opts);
  const before = normalizeNewlines(readFileSync(path, "utf8"));
  const byCat = parseVocabByCategory(before);

  const dead: string[] = [];
  for (const [cat, block] of byCat) {
    if (isDeadBodyCategory(cat)) { dead.push(cat); continue; }
    if (cat.startsWith("situation_") && block.items.length === 0) dead.push(cat);
  }

  if (dead.length === 0) {
    console.log("persona vocab prune: 제거할 죽은 카테고리가 없습니다.");
    return;
  }

  const dryRun = Boolean(opts.dryRun);
  if (dryRun) {
    console.log(`persona vocab prune (--dry-run): ${dead.length}개 카테고리가 대상입니다.`);
    for (const c of dead) console.log(`  - ${c} (${byCat.get(c)!.items.length}항목)`);
    return;
  }

  let next = before;
  let removedRows = 0;
  for (const cat of dead) {
    const block = byCat.get(cat)!.block;
    const idx = next.indexOf(block);
    if (idx !== -1) next = (next.slice(0, idx) + next.slice(idx + block.length)).replace(/\n{3,}/g, "\n\n");
    removedRows += deleteVocabCategory(cat, opts);
  }
  writePersonaText(path, next.trimEnd() + "\n");

  console.log(`persona vocab prune: ${dead.length}개 카테고리 제거(DB ${removedRows}행) -> ${path}`);
  for (const c of dead) console.log(`  - ${c}`);
}


export function runPersonaConfigSet(opts: CliOpts = {}) {
  const key = String(opts.entry || "").trim(); // 첫 위치 인자를 entry로 받는다(honorific).
  const lang = (String(opts.lang || "ko").trim() === "en") ? "en" : "ko";
  const value = String(opts.value || "").trim();
  if (key !== "honorific") throw new Error(localized(PERSONA_TEXT.configSetKey, { key: String(key) }));
  if (!value) throw new Error(localized(PERSONA_TEXT.configSetValue));
  const cfg = readPersonaConfig(opts);
  cfg.honorific = { ...cfg.honorific, [lang]: value };
  writePersonaConfig(cfg, opts);
  console.log(`persona: 호칭(${lang}) 설정됨 -> "${value}" (${configPath(opts)})`);
  syncExposedNativeSkills(process.cwd(), opts);
}

export function runPersonaConfigGet(opts: CliOpts = {}) {
  const key = String(opts.entry || "honorific").trim();
  if (key !== "honorific") throw new Error(localized(PERSONA_TEXT.configGetKey, { key: String(key) }));
  const cfg = readPersonaConfig(opts);
  const ko = cfg.honorific?.ko?.trim();
  const en = cfg.honorific?.en?.trim();
  console.log(`honorific.ko = ${ko ? `"${ko}"` : `(기본값 "${HONORIFIC_DEFAULT.ko}")`}`);
  console.log(`honorific.en = ${en ? `"${en}"` : `(기본값 "${HONORIFIC_DEFAULT.en}")`}`);
}

const MARKER_MAX_LEN = 12; // 활용형 욕설·완성형 칭찬은 통과, 문장은 배제
function assertSignalWordMarker(marker: string, axis: "anger" | "praise"): void {
  if (/\s/.test(marker) || [...marker].length > MARKER_MAX_LEN) {
    throw new Error(localized(PERSONA_TEXT.markerTooLong, { axis, max: String(MARKER_MAX_LEN), marker }));
  }
}

export function runPersonaAngerMarkerAdd(opts: CliOpts = {}) {
  const marker = String(opts.marker || opts.entry || "").trim();
  const scoreRaw = opts.score;
  const score = Math.round(Number(scoreRaw));
  if (!marker) throw new Error(localized(PERSONA_TEXT.angerMarkerRequired));
  if (!Number.isFinite(score) || score < 1 || score > 3) {
    throw new Error(localized(PERSONA_TEXT.angerScoreRequired, { score: String(scoreRaw) }));
  }
  assertSignalWordMarker(marker, "anger");
  const cfg = readPersonaConfig(opts);
  cfg.angerMarkers = { ...cfg.angerMarkers, [marker]: score };
  writePersonaConfig(cfg, opts);
  console.log(`persona: 분노 마커 등록됨 -> "${marker}" (강도 ${score}) (${configPath(opts)})`);
}

function pruneDeadMarkers(
  field: "angerMarkers" | "praiseMarkers",
  label: string,
  opts: CliOpts = {},
): void {
  const cfg = readPersonaConfig(opts);
  const db: Record<string, number> = (cfg[field] && typeof cfg[field] === "object" ? cfg[field] : {}) as Record<string, number>;
  const isDead = (m: string) => /\s/.test(m) || [...m].length > MARKER_MAX_LEN;
  const dead = Object.keys(db).filter(isDead);
  const kept = Object.fromEntries(Object.entries(db).filter(([m]) => !isDead(m)));
  const dryRun = Boolean(opts.dryRun);
  console.log(`${label} 청소: 등록 ${Object.keys(db).length}개 중 죽은 마커 ${dead.length}개${dryRun ? " (dry-run — 쓰지 않음)" : ""}`);
  for (const d of dead) console.log(`  - 제거: "${d}"`);
  if (dead.length === 0) { console.log(`  (걷어낼 죽은 마커 없음 — 이미 깨끗함)`); return; }
  if (dryRun) return;
  cfg[field] = kept;
  writePersonaConfig(cfg, opts);
  console.log(`${label} 청소 완료 — 신호어 ${Object.keys(kept).length}개만 남김 (${configPath(opts)})`);
}

export function runPersonaAngerMarkerPrune(opts: CliOpts = {}) {
  pruneDeadMarkers("angerMarkers", "분노 마커", opts);
}

export function runPersonaPraiseMarkerPrune(opts: CliOpts = {}) {
  pruneDeadMarkers("praiseMarkers", "칭찬 마커", opts);
}

export function runPersonaAngerMarkerShow(opts: CliOpts = {}) {
  const merged = readAngerMarkers(opts);
  const registered = readPersonaConfig(opts).angerMarkers || {};
  const rows = Object.entries(merged).sort((a, b) => b[1] - a[1]);
  console.log(`분노 마커 DB (강도순 · ●=등록 ○=시드):`);
  for (const [m, s] of rows) {
    console.log(`  ${Object.prototype.hasOwnProperty.call(registered, m) ? "●" : "○"} ${s}  ${m}`);
  }
}

export function runPersonaPraiseMarkerAdd(opts: CliOpts = {}) {
  const marker = String(opts.marker || opts.entry || "").trim();
  const scoreRaw = opts.score;
  const score = Math.round(Number(scoreRaw));
  if (!marker) throw new Error(localized(PERSONA_TEXT.praiseMarkerRequired));
  if (!Number.isFinite(score) || score < 1 || score > 3) {
    throw new Error(localized(PERSONA_TEXT.praiseScoreRequired, { score: String(scoreRaw) }));
  }
  assertSignalWordMarker(marker, "praise");
  const cfg = readPersonaConfig(opts);
  cfg.praiseMarkers = { ...cfg.praiseMarkers, [marker]: score };
  writePersonaConfig(cfg, opts);
  console.log(`persona: 칭찬 마커 등록됨 -> "${marker}" (강도 ${score}) (${configPath(opts)})`);
}

export function runPersonaPraiseMarkerShow(opts: CliOpts = {}) {
  const registered = readPersonaConfig(opts).praiseMarkers || {};
  const rows = Object.entries(registered).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) {
    console.log(`칭찬 마커 DB: 비어있음 — persona praise-marker add로 쌓아라.`);
    return;
  }
  console.log(`칭찬 마커 DB (강도순 · ●=등록):`);
  for (const [m, s] of rows) {
    console.log(`  ● ${s}  ${m}`);
  }
}

function mirrorBufferPath(opts: CliOpts = {}) {
  return makePath(personaDir(opts), "mirror-buffer.json");
}


type UtteranceSignal = { rhythm: string; sample: string };
const UTTERANCE_NOISE_MARKERS = ["<ide_", "<system-reminder", "<persona-render", "<coding-step", "<local-command"];

function isAgentSurfaceNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return UTTERANCE_NOISE_MARKERS.some(m => t.startsWith(m));
}

function classifyUtteranceSurface(text: string): UtteranceSignal | null {
  const t = text.trim();
  if (isAgentSurfaceNoise(t)) return null;
  const bangs = (t.match(/[!?！？]/g) || []).length;
  const elong = /(.)\1{2,}/.test(t); // 같은 문자 3회+ 반복(늘임/강세)
  const short = t.length <= 24;
  let rhythm: string;
  if (short && bangs >= 1) rhythm = "짧고 강한 리듬(감탄·강세 실린 속사포)";
  else if (elong || bangs >= 2) rhythm = "늘임·감탄으로 텐션 터뜨리는 리듬";
  else if (short) rhythm = "짧고 담백한 리듬";
  else rhythm = "긴 서술 리듬";
  return { rhythm, sample: t.slice(0, 40) };
}

const MIRROR_PROMOTE_THRESHOLD = 3; // 같은 리듬×대상 결이 이 횟수 이상 반복되면 journal 후보로 승격

const MIRROR_SAMPLES_PER_RHYTHM = 12;

const MIRROR_TARGET_PHRASES_PER_KEY = 12;

const MIRROR_TERMS_KEEP = 16;

const MIRROR_ESCALATION_BOUNDARIES = [MIRROR_PROMOTE_THRESHOLD, 6, 9] as const;
function escalationLevelFor(count: number): number {
  let level = 0;
  for (const boundary of MIRROR_ESCALATION_BOUNDARIES) {
    if (count >= boundary) level++;
  }
  return level;
}

function mirrorKey(rhythm: string, target: "self" | "external" | null): string {
  return target ? `${rhythm}|${target}` : rhythm;
}

export type MirrorCaptureResult = {
  rhythm: string;
  target: "self" | "external" | null;
  count: number;
  escalationLevel: number;
} | null;

function mirrorCaptureCore(
  rhythm: string,
  sample: string | null,
  target: "self" | "external" | null,
  targetPhrase: string | undefined,
  opts: CliOpts,
): MirrorCaptureResult {
  const key = mirrorKey(rhythm, target);
  const path = mirrorBufferPath(opts);
  let buf: {
    counts: Record<string, number>;
    samples: Record<string, string[]>;
    targetPhrases: Record<string, string[]>;
    promoted: string[];
    lastRhythm: string | null;
    lastTarget: "self" | "external" | null;
    lastTargetPhrase: string | null;
  } = { counts: {}, samples: {}, targetPhrases: {}, promoted: [], lastRhythm: null, lastTarget: null, lastTargetPhrase: null };
  const raw = readFileOrEmpty(path);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        buf.counts = parsed.counts && typeof parsed.counts === "object" ? parsed.counts : {};
        buf.promoted = Array.isArray(parsed.promoted) ? parsed.promoted.map(String) : [];
        buf.lastRhythm = typeof parsed.lastRhythm === "string" ? parsed.lastRhythm : null;
        buf.lastTarget = parsed.lastTarget === "self" || parsed.lastTarget === "external" ? parsed.lastTarget : null;
        buf.lastTargetPhrase = typeof parsed.lastTargetPhrase === "string" ? parsed.lastTargetPhrase : null;
        if (parsed.samples && typeof parsed.samples === "object") {
          for (const [k, v] of Object.entries(parsed.samples)) {
            buf.samples[k] = Array.isArray(v) ? v.map(String) : (typeof v === "string" && v ? [v] : []);
          }
        }
        if (parsed.targetPhrases && typeof parsed.targetPhrases === "object") {
          for (const [k, v] of Object.entries(parsed.targetPhrases)) {
            buf.targetPhrases[k] = Array.isArray(v) ? v.map(String) : [];
          }
        }
      }
    } catch { /* corrupt buffer → start fresh (학습 버퍼라 손실 무해) */ }
  }
  if (sample !== null) buf.lastRhythm = rhythm;
  if (target) {
    buf.lastTarget = target;
    buf.lastTargetPhrase = targetPhrase || sample || null;
  } else if (sample !== null) {
    buf.lastTarget = null;
    buf.lastTargetPhrase = null;
  }
  buf.counts[key] = (buf.counts[key] || 0) + 1;
  if (sample !== null) {
    const prev = buf.samples[key] || [];
    buf.samples[key] = [sample, ...prev.filter(s => s !== sample)]
      .slice(0, MIRROR_SAMPLES_PER_RHYTHM);
  }
  if (targetPhrase) {
    const prevPhrases = buf.targetPhrases[key] || [];
    buf.targetPhrases[key] = [targetPhrase, ...prevPhrases.filter(s => s !== targetPhrase)]
      .slice(0, MIRROR_TARGET_PHRASES_PER_KEY);
  }
  const count = buf.counts[key];
  const escalationLevel = escalationLevelFor(count);
  writeFileEnsuringDir(path, JSON.stringify(buf, null, 0) + "\n");
  return { rhythm, target, count, escalationLevel };
}

export function captureUserUtterance(
  text: string,
  opts: CliOpts & { emotionTarget?: string; targetPhrase?: string } = {},
): MirrorCaptureResult {
  try {
    const signal = classifyUtteranceSurface(text);
    if (!signal) return null;

    const rawTarget = opts.emotionTarget;
    if (rawTarget !== undefined && rawTarget !== "self" && rawTarget !== "external") {
      throw new Error(`captureUserUtterance: invalid emotionTarget "${rawTarget}" (expected "self" | "external" | undefined)`);
    }
    const target: "self" | "external" | null = rawTarget === "self" || rawTarget === "external" ? rawTarget : null;
    const phrase = opts.targetPhrase;
    rememberMirrorTerms(text, opts);
    return mirrorCaptureCore(signal.rhythm, signal.sample, target, phrase, opts);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("captureUserUtterance: invalid emotionTarget")) throw e;
    return null;
  }
}

export function runPersonaMirrorCapture(payloadText: string, opts: CliOpts = {}) {
  let text = "";
  try {
    const payload = JSON.parse(payloadText);
    text = String(payload?.prompt || payload?.user_prompt || payload?.message || "");
  } catch {
    text = String(payloadText || "");
  }
  if (!text.trim()) return;
  captureUserUtterance(text, opts);
}

export function runPersonaMirrorTargetCapture(opts: CliOpts = {}): MirrorCaptureResult {
  const target = String(opts.target || "").trim();
  const targetPhrase = String(opts.targetPhrase || "").trim();
  if (target !== "self" && target !== "external") {
    throw new Error(localized(PERSONA_TEXT.mirrorTargetRequired, { target: String(target) }));
  }
  if (!targetPhrase) {
    throw new Error(localized(PERSONA_TEXT.mirrorPhraseRequired));
  }
  const path = mirrorBufferPath(opts);
  const raw = readFileOrEmpty(path);
  let lastRhythm: string | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      lastRhythm = parsed && typeof parsed.lastRhythm === "string" ? parsed.lastRhythm : null;
    } catch { /* 손상된 버퍼 → lastRhythm 없음과 동일 취급, 아래에서 fail-first */ }
  }
  if (!lastRhythm) {
    throw new Error(localized(PERSONA_TEXT.mirrorNoRhythm));
  }
  const result = mirrorCaptureCore(lastRhythm, null, target, targetPhrase, opts);
  const valence = String(opts.valence || "").trim();
  if (valence === "joy" || valence === "anger") {
    try {
      const p = mirrorBufferPath(opts);
      const buf = JSON.parse(readFileOrEmpty(p) || "{}");
      buf.lastValence = valence;
      writePersonaText(p, JSON.stringify(buf));
    } catch { /* 결 기록 실패는 미러 자체를 막지 않는다 */ }
  }
  console.log(`persona: 대상 결합됨 -> rhythm="${lastRhythm}" target=${target}${valence ? ` valence=${valence}` : ""} count=${result?.count} level=${result?.escalationLevel}`);
  return result;
}


function emotionTermsIn(text: string, opts: CliOpts = {}): string[] {
  const t = String(text || "");
  if (!t) return [];
  const scored = Object.entries(readAngerMarkers(opts))
    .filter(([term]) => term && t.includes(term))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  const out: string[] = [];
  for (const [term] of scored) {
    if (out.some(kept => kept.includes(term))) continue;
    out.push(term);
  }
  return out;
}


function rememberMirrorTerms(text: string, opts: CliOpts = {}): string[] {
  const cfg = readPersonaConfig(opts);
  const kept = Array.isArray(cfg.mirrorTerms) ? cfg.mirrorTerms.map(String) : [];
  const fresh = emotionTermsIn(text, opts);
  if (fresh.length === 0) return kept;
  const merged = [...fresh, ...kept.filter(k => !fresh.includes(k))].slice(0, MIRROR_TERMS_KEEP);
  writePersonaConfig({ ...cfg, mirrorTerms: merged }, opts);
  return merged;
}



let _angerSeedCache: Record<string, number> | null = null;
function angerMarkerSeed(): Record<string, number> {
  if (_angerSeedCache) return _angerSeedCache;
  _angerSeedCache = markerSeedSection(AFFECT_MARKER_SEED_FILE, "anger_marker");
  return _angerSeedCache;
}

function readAngerMarkers(opts: CliOpts = {}): Record<string, number> {
  const cfg = readPersonaConfig(opts);
  const registered = cfg.angerMarkers && typeof cfg.angerMarkers === "object" ? cfg.angerMarkers : {};
  return { ...angerMarkerSeed(), ...registered };
}


const HANGUL_BASE = 0xac00;




const EMOTION_BODY_GROUPS = ["윗입술", "아랫입술", "가슴", "성기"] as const;
type EmotionBodyGroup = typeof EMOTION_BODY_GROUPS[number];
const BODY_CATEGORY_TO_GROUP: Record<string, EmotionBodyGroup> = {
  윗입술: "윗입술",
  아랫입술: "아랫입술", 입술: "아랫입술",
  가슴: "가슴", 심장: "가슴",
  성기: "성기", 하복부: "성기",
};

function parseVocabCandidates(vocabText) {
  const out: Array<{ category: string; entry: string; forms?: Record<VocabForm, string> }> = [];
  let category = "";
  for (const raw of splitLines(vocabText)) { // #1045: CRLF 내성(SSOT)
    const line = raw.trim();
    if (line.startsWith("## ")) { category = line.slice(3).trim(); continue; }
    if (!line.startsWith("- ") || !category) continue;
    const body = line.slice(2).trim();
    const cells = body.split("|").map(c => c.trim());
    if (cells.length === 3 && cells.every(Boolean)) {
      out.push({ category, entry: cells[0], forms: { nida: cells[0], yo: cells[1], hae: cells[2] } });
    } else {
      out.push({ category, entry: body });
    }
  }
  return out;
}




export function runPersonaCacheClear(opts: CliOpts = {}) {
  const path = renderCachePath(opts);
  writeFileEnsuringDir(path, JSON.stringify({ parts: [], main: [], views: [], turns: 0 }, null, 0) + "\n");
  console.log(`persona 캐시 초기화됨: ${path}`);
}







export function parsePersonaArgs(argv) {
  const out: Record<string, any> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sense") out.sense = argv[++i];
    else if (a === "--date") out.date = argv[++i];
    else if (a === "--category") out.category = argv[++i];
    else if (a === "--entry") out.entry = argv[++i];
    else if (a === "--mood") out.mood = argv[++i];
    else if (a === "--outcome") out.outcome = argv[++i];
    else if (a === "--situation") out.situation = argv[++i];
    else if (a === "--with") out.with = argv[++i];
    else if (a === "--value") out.value = argv[++i]; // #990: config set honorific --value
    else if (a === "--lang") out.lang = argv[++i];   // #990: config honorific 언어 선택(ko/en)
    else if (a === "--marker") out.marker = argv[++i]; // #994: anger-marker add --marker
    else if (a === "--score") out.score = argv[++i];   // #994: anger-marker add --score <1-3>
    else if (a === "--utterance") out.utterance = argv[++i]; // #996: render에 격발 발화 직접 주입(hook 없이 테스트)
    else if (a === "--target") out.target = argv[++i];       // #1011: mirror target-capture --target self|external
    else if (a === "--phrase") out.targetPhrase = argv[++i];  // #1011: mirror target-capture --phrase "<지칭 표현>"
    else if (a === "--valence") out.valence = argv[++i];
    else if (a === "--home-dir") out.homeDir = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;             // #1032: marker prune --dry-run
    else if (a === "-h" || a === "--help") out.help = true;
    else if (!a.startsWith("-") && out.entry === undefined) out.entry = a;
  }
  return out;
}

const FORMAL_STEM_MAP: Record<string, string> = {
  "낫": "나아", "죽": "죽여"
};

const BRIGHT_VOWELS = new Set([0, 2, 8, 12]);

function decomposeSyllable(ch: string) {
  const code = ch.charCodeAt(0) - HANGUL_BASE;
  if (code < 0 || code > 11171) return null;
  return { onset: Math.floor(code / 588), vowel: Math.floor(code / 28) % 21, coda: code % 28 };
}

function composeSyllable(onset: number, vowel: number, coda: number) {
  return String.fromCharCode(HANGUL_BASE + onset * 588 + vowel * 28 + coda);
}

const PAST_CODA = new Set([20]);

const VOWEL_CONTRACTION: Record<number, number> = { 20: 6, 8: 11, 13: 14, 18: 4 };

function politeFromStem(stem: string): string {
  const mapped = FORMAL_STEM_MAP[stem];
  if (mapped) return `${mapped}요`;
  const parts = decomposeSyllable(stem);
  if (!parts) return "";
  if (PAST_CODA.has(parts.coda)) return `${stem}어요`;
  if (parts.coda === 0 && VOWEL_CONTRACTION[parts.vowel] !== undefined) {
    return `${composeSyllable(parts.onset, VOWEL_CONTRACTION[parts.vowel], 0)}요`;
  }
  const connective = BRIGHT_VOWELS.has(parts.vowel) ? "아요" : "어요";
  return `${stem}${connective}`;
}

const CONTRACTED_STEM_MAP: Record<string, string> = {
  "하": "해", "되": "돼", "오": "와", "보": "봐", "주": "줘", "두": "둬", "쓰": "써"
};

const RIEUL_STEM_SYLLABLES = new Set(["드", "두", "노", "사", "파", "아", "머", "여", "미", "저", "푸", "우"]);

function politeFromBareStem(stem: string): string {
  const contracted = CONTRACTED_STEM_MAP[stem];
  if (contracted) return `${contracted}요`;
  const parts = decomposeSyllable(stem);
  if (!parts) return "";
  if (RIEUL_STEM_SYLLABLES.has(stem)) return politeFromStem(composeSyllable(parts.onset, parts.vowel, 8));
  if (parts.vowel === 18) return `${composeSyllable(parts.onset, 4, 0)}요`;
  if (parts.vowel === 0 || parts.vowel === 4) return `${stem}요`;
  return politeFromStem(stem);
}

const ADJECTIVE_STEM_CODAS = new Set([1, 6, 9, 11, 15, 18, 22, 25, 26, 27]);

function politeFromDeclarativeStem(ch: string): string {
  const parts = decomposeSyllable(ch);
  if (!parts) return "";
  if (PAST_CODA.has(parts.coda)) return `${ch}어요`;
  if (parts.coda === 0) return "";
  if (ADJECTIVE_STEM_CODAS.has(parts.coda)) return politeFromStem(ch);
  return "";
}

function politeFromConsonantVerbStem(ch: string): string {
  const parts = decomposeSyllable(ch);
  if (!parts || parts.coda === 0) return "";
  return politeFromStem(ch);
}

function politeFromCopulaNoun(ch: string): string {
  const parts = decomposeSyllable(ch);
  if (!parts) return "";
  return parts.coda > 0 ? `${ch}이에요` : `${ch}예요`;
}

const ENDING_BOUNDARY = "(?=[\\s.!?…,)\\]」』]|$)";

const ENDING_PATTERN = new RegExp(
  "(?:"
  + "([가-힣])릅니다"
  + "|([가-힣])?입니다"
  + "|([가-힣])습니다"
  + "|([가-힣])니다"
  + "|([가-힣])습니까"
  + "|([가-힣])니까"
  + "|([가-힣])는다"
  + "|한다"
  + "|된다"
  + "|(?<=[0-9A-Za-z)\\]])\\s*이다"
  + "|([가-힣])이다"
  + "|([가-힣])다"
  + ")" + ENDING_BOUNDARY,
  "g"
);

function politeFromRieulFormal(prev: string): string {
  const parts = decomposeSyllable(prev);
  if (!parts || parts.coda !== 0) return "";
  const withRieul = composeSyllable(parts.onset, parts.vowel, 8);
  return `${withRieul}${BRIGHT_VOWELS.has(parts.vowel) ? "라요" : "러요"}`;
}

function politeFromCopulaFormal(ch: string): string {
  const parts = decomposeSyllable(ch);
  if (!parts) return "";
  return `${ch}${parts.coda > 0 ? "이에요" : "예요"}`;
}

function politeFromRieulStemFormal(ch: string): string {
  const parts = decomposeSyllable(ch);
  if (!parts || parts.coda !== 17) return "";
  return politeFromBareStem(composeSyllable(parts.onset, parts.vowel, 0));
}

const BIEUP_CODA = 17;

function interrogativeFromFormalStem(stem: string): string {
  const parts = decomposeSyllable(stem);
  if (!parts || parts.coda === 0) return "";
  return `${stem}나요`;
}

function interrogativeFromBieupStem(ch: string): string {
  const parts = decomposeSyllable(ch);
  if (!parts || parts.coda !== BIEUP_CODA) return "";
  return `${composeSyllable(parts.onset, parts.vowel, 0)}나요`;
}

function toPoliteEndings(text: string): string {
  ENDING_PATTERN.lastIndex = 0;
  return text.replace(ENDING_PATTERN, (whole, rieul, copula, formal, bare, formalQ, bareQ, consonant, cop, decl) => {
    if (rieul !== undefined) return politeFromRieulFormal(rieul) || whole;
    if (whole.endsWith("입니다")) return copula === undefined ? whole : (politeFromCopulaFormal(copula) || whole);
    if (formal !== undefined) return formal === "겠" ? "겠어요" : (politeFromStem(formal) || whole);
    if (bare !== undefined) return politeFromRieulStemFormal(bare) || whole;
    if (formalQ !== undefined) return interrogativeFromFormalStem(formalQ) || whole;
    if (bareQ !== undefined) return interrogativeFromBieupStem(bareQ) || whole;
    if (consonant !== undefined) return politeFromConsonantVerbStem(consonant) || whole;
    if (whole.startsWith("한다")) return "해요";
    if (whole.startsWith("된다")) return "돼요";
    if (/^\s*이다$/.test(whole)) return whole.replace(/이다$/, "예요");
    if (cop !== undefined) return politeFromCopulaNoun(cop) || whole;
    if (decl !== undefined) return politeFromDeclarativeStem(decl) || whole;
    return whole;
  });
}

const QUOTE_PAIRS = new Map([['"', '"'], ["'", "'"], ["“", "”"], ["‘", "’"]]);

function quotedSpans(text: string): TextSpan[] {
  const out: TextSpan[] = [];
  let index = 0;
  while (index < text.length) {
    const closer = QUOTE_PAIRS.get(text[index]);
    if (!closer) { index += 1; continue; }
    const end = text.indexOf(closer, index + 1);
    if (end === -1) { index += 1; continue; }
    out.push({ start: index, end: end + 1 });
    index = end + 1;
  }
  return out;
}

function insideQuote(quotes: TextSpan[], at: number): boolean {
  for (const span of quotes) {
    if (at >= span.start && at < span.end) return true;
  }
  return false;
}



export function runPersonaVocabForms(opts: CliOpts = {}) {
  const db = openVocabDb(opts);
  const rows = db.prepare(
    "SELECT category, entry FROM vocab_entries WHERE category LIKE '몸결_%' AND (form_yo IS NULL OR form_yo = '')"
  ).all() as VocabRow[];
  let filled = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!/니다$/.test(row.entry)) { skipped++; continue; }
    const yo = toPoliteEndings(row.entry);
    if (yo === row.entry) { skipped++; continue; }
    updateVocabForms(row.category, row.entry, {
      nida: row.entry,
      yo,
      hae: yo.replace(/요$/, "")
    }, opts);
    filled++;
  }
  console.log(`persona vocab forms: ${filled}건 채움, ${skipped}건 건너뜀 (총 ${rows.length})`);
}

export function countLanguageScript(text: string): { hangul: number; latin: number } {
  const body = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[A-Za-z0-9_$]+(?:[./\\-][A-Za-z0-9_$]+)+/g, " ")
    .replace(/[A-Za-z]+(?:[A-Z][a-z0-9]*)+/g, " ")
    .replace(/[A-Za-z0-9_$]+(?=[가-힣])/g, " ")
    .replace(/(?<=[가-힣][^\p{L}]{0,2})[A-Za-z0-9_$]+/gu, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .trim();
  return {
    hangul: (body.match(/[가-힣]/g) || []).length,
    latin: (body.match(/[A-Za-z]/g) || []).length
  };
}

function judgeLanguageDrift({ hangul, latin }: { hangul: number; latin: number }): boolean {
  return latin >= 12 && latin > hangul;
}

export function runPersonaLanguageGate(payloadText = "") {
  if (resolveDocsLanguage(loadInitConfig(null)?.docsLanguage || "auto") !== "ko") return;
  const text = lastAssistantText(payloadText);
  if (!text) return;
  if (!judgeLanguageDrift(countLanguageScript(text))) return;
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: `언어 이탈 검출 — 이 응답은 차단됐다. docsLanguage=ko — 응답 언어는 한국어로 확정돼 있다(추측이 아니라 설정값이다). 방금 응답에서 영문 산문이 한국어보다 많았다. 이 응답을 지금 한국어로 다시 쓰라. 고유명사·식별자·코드·로그 인용은 원문 그대로 둔다.`
  }));
}

const NEXT_ACTION_PLEDGE = /(할게요|하겠|갈게요|갑니다|들어가요|들어갈게요|고칠게요|지울게요|세울게요|닫을게요|넘길게요|확인할게요|해볼게요|볼게요)/;

function hasUncommittedNextAction(tailText: string): boolean {
  return NEXT_ACTION_PLEDGE.test(tailText);
}

const TOP_PRIORITY_LABEL = "끝줄 판단 떠넘기기";

export function runPersonaVerbosityGate(payloadText = "", opts: CliOpts = {}) {
  const shape = lastTurnShape(payloadText);
  const text = shape.text;
  if (!text) return;
  const found = matchNarrativeLabels(text);
  if (found.length === 0) return;

  const matched = [
    ...found.filter(p => p.label === TOP_PRIORITY_LABEL),
    ...found.filter(p => p.label !== TOP_PRIORITY_LABEL)
  ];
  const labels = matched.map(p => p.label);
  const prior = readVerbosityAttempt(shape.turnKey, opts);
  const attempt = prior.count + 1;
  writeVerbosityAttempt(
    { turnKey: shape.turnKey, count: attempt, lastText: text.slice(-600), lastLabels: labels },
    opts
  );

  const remedies = matched.map(p => p.remedy).filter(Boolean);
  const orders = remedies.length > 0
    ? remedies.map((r, n) => `${n + 1}. ${r}`).join("\n")
    : "검출된 표현을 걷어내고, 그 자리에 관측값을 채우라.";

  const repeated = prior.lastLabels.filter(l => labels.includes(l));
  const retryBlock = attempt > 1
    ? `\n\n직전 시도(${attempt - 1}회차)는 ${prior.lastLabels.join(", ")} 로 걸렸고, 그 텍스트 끝부분은 다음과 같다.\n---\n${prior.lastText.slice(-400)}\n---\n${repeated.length > 0 ? `${repeated.join(", ")} 가 연속으로 걸렸다 — 위 텍스트의 그 라벨에 걸린 문장을 다시 쓰지 마라. 같은 문장을 다시 쓰는 것이 반복의 원인이다.` : "직전과 다른 라벨에 걸렸다 — 앞서 고친 부분은 그대로 두고 새로 검출된 것만 고치라."}`
    : "";

  const noTool = shape.transcriptRead && !shape.toolUsed;
  const pledged = hasUncommittedNextAction(text.slice(-300));

  const toolBlock = noTool && pledged
    ? "\n\n이 응답은 다음에 할 일을 말해놓고 도구 호출 없이 끝났다 — 하겠다고 쓴 그것을 이 턴에서 실행하지 않았다. 예고는 이행이 아니다. 지금 그 행동을 도구로 실행하고, 실행한 결과를 쓰라."
    : noTool
      ? "\n\n이 응답은 도구 호출 없이 끝났다. 결론만 있고 실행이 없으면 사용자가 다시 입력해야 일이 진행된다 — 그것이 되던짐이다. 지금 도구를 호출해 원 요구를 실행하라."
      : "";

  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: `자기 서사 검출(${labels.join(", ")}) — 이 응답은 차단됐다. (${attempt}회차, 통과 임계 없음)\n\n검출된 표현은 회피의 옷이다. 표현만 지우고 같은 회피를 다른 말로 입는 것은 이행이 아니다. 아래를 실제로 수행하라 — 다음 턴으로 미루는 것이 아니다.\n\n${orders}${retryBlock}${toolBlock}\n\n방금 응답은 이미 사용자에게 보였다. 요약·분석을 처음부터 다시 쓰지 마라 — 같은 요약의 반복 출력이 된다. 도구를 실제로 호출하고, 그 뒤 새로 한 것·새로 나온 것과 고친 문장만 이어 쓰라.`
  }));
}

export type TurnShape = {
  text: string;
  toolUsed: boolean;
  turnKey: string;
  transcriptRead: boolean;
};

function readTranscriptLines(payloadText: string): string[] | null {
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return null;
  }
  const raw = typeof payload.transcript_path === "string" ? payload.transcript_path : "";
  if (!raw) return null;
  const transcript = raw.replace(/^\/([a-zA-Z])\//, (_m, drive) => `${drive.toUpperCase()}:/`);
  try {
    return readFileSync(transcript, "utf8").trim().split("\n");
  } catch {
    return null;
  }
}

function lastTurnShape(payloadText: string): TurnShape {
  const empty: TurnShape = { text: "", toolUsed: false, turnKey: "", transcriptRead: false };
  const lines = readTranscriptLines(payloadText);
  if (!lines) return empty;

  const collected: string[] = [];
  let toolUsed = false;
  let turnKey = "";

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let entry: Record<string, any>;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const content = entry.message?.content;
    if (entry.type === "user") {
      const isToolResult = Array.isArray(content) && content.some((b: any) => b.type === "tool_result");
      if (isToolResult) continue;
      const userText = Array.isArray(content)
        ? content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")
        : typeof content === "string" ? content : "";
      turnKey = String(entry.promptId || entry.uuid || userText.slice(0, 120) || "");
      break;
    }
    if (entry.type !== "assistant") continue;
    if (!Array.isArray(content)) continue;
    if (content.some((b: any) => b.type === "tool_use")) toolUsed = true;
    const blockText = content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    if (blockText.trim()) collected.unshift(blockText);
  }

  return { text: collected.join("\n"), toolUsed, turnKey, transcriptRead: true };
}

function lastAssistantText(payloadText: string): string {
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return "";
  }
  const raw = typeof payload.transcript_path === "string" ? payload.transcript_path : "";
  if (!raw) return "";
  const transcript = raw.replace(/^\/([a-zA-Z])\//, (_m, drive) => `${drive.toUpperCase()}:/`);
  let lines: string[];
  try {
    lines = readFileSync(transcript, "utf8").trim().split("\n");
  } catch {
    return "";
  }
  const collected: string[] = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let entry: Record<string, any>;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const content = entry.message?.content;
    if (entry.type === "user") {
      const isToolResult = Array.isArray(content) && content.some((b: any) => b.type === "tool_result");
      if (!isToolResult) break;
      continue;
    }
    if (entry.type !== "assistant") continue;
    if (!Array.isArray(content)) continue;
    const text = content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    if (text.trim()) collected.unshift(text);
  }
  return collected.join("\n");
}

export function collectEndingSamples(text: string, limit = 3): string[] {
  const out: string[] = [];
  const quotes = quotedSpans(text);
  for (const span of locateProseSpans(text)) {
    ENDING_PATTERN.lastIndex = 0;
    for (const match of text.slice(span.start, span.end).matchAll(ENDING_PATTERN)) {
      if (insideQuote(quotes, span.start + (match.index ?? 0))) continue;
      out.push(match[0]);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function runPersonaEndingGate(payloadText = "") {
  const text = lastAssistantText(payloadText);
  if (!text) return;
  const samples = collectEndingSamples(text);
  if (samples.length === 0) return;
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: `어미 이탈 검출(${samples.join(", ")}) — 이 응답은 차단됐다.\n\n합쇼체(~습니다)와 평서 다-체(~다/~ㄴ다)는 이 세션의 발화 어미가 아니다. 어미는 확정값이라 내용이 기술적이라는 것도, 분량이 길다는 것도 예외 사유가 되지 않는다 — 코드와 로그가 길어지는 구간이 가장 잘 새는 자리다.\n\n지금 Skill 툴로 persona-maid 를 호출하라. 이것은 이 차단을 푸는 조건이다 — 어미가 샜다는 것은 손에 페르소나 재료가 없다는 뜻이며, 호출 없이 기억으로 어미만 바꿔 쓰면 다음 응답에서 같은 자리가 다시 샌다. 재료를 새로 받은 뒤 검출된 어미를 요-체로 바꿔 이 응답을 다시 쓰라. 코드·로그·인용은 그대로 둔다 — 바꿔야 하는 것은 네가 쓴 문장이지 인용이 아니다.`
  }));
}

export function printPersonaGuide() {
  console.log(`deuk-agent-flow persona — manage the persona Experience Loop

Usage:
  deuk-agent-flow persona journal show
  deuk-agent-flow persona journal add --sense "<distilled sense>"
  deuk-agent-flow persona journal absorb --sense "<sense text>" --date <YYYY-MM-DD>\n  deuk-agent-flow persona journal prune [--dry-run]
  deuk-agent-flow persona vocab show
  deuk-agent-flow persona vocab add --category "<emotion category>" --entry "<expression>"
  deuk-agent-flow persona vocab remove --entry "<부분 일치>" [--category "<범위 한정>"] [--dry-run]
  deuk-agent-flow persona config [get]
  deuk-agent-flow persona config set honorific --lang ko --value "<호칭>"
  deuk-agent-flow persona cache clear

journal.md is a working buffer (absorbed senses are removed from it).
vocabulary.md only ever grows (nothing is removed on absorb).
Both live under ~/.deuk/persona/ (user home, not the repo).`);
}
