import { readFileSync } from "fs";
import { CliOpts, makePath, resolvePackageRoot } from "./cli-utils.js";
import { listNarrativeRows, NarrativeRow } from "./integrity-narrative-db.js";
import { proseOnly } from "./markdown-prose-spans.js";

const SEED_FILE = "narrative.seed.jsonl";

export type NarrativePattern = {
  label: string;
  pattern: RegExp;
  remedy: string;
  tailOnly: boolean;
};

export const TAIL_WINDOW = 200;

let _seedCache: NarrativeRow[] | null = null;

export function loadNarrativeSeed(opts: CliOpts = {}): NarrativeRow[] {
  if (_seedCache && !opts.noCache) return _seedCache;
  const rows: NarrativeRow[] = [];
  let seedPath = "";
  try {
    seedPath = makePath(resolvePackageRoot({ fromUrl: import.meta.url }), "templates", "integrity", SEED_FILE);
    const text = readFileSync(seedPath, "utf8");
    let lineNo = 0;
    for (const line of text.split(/\r?\n/)) {
      lineNo++;
      const trimmed = line.trim();
      if (!trimmed) continue;
      let rec: any;
      try {
        rec = JSON.parse(trimmed);
      } catch {
        console.error(`integrity: ${SEED_FILE}:${lineNo} JSON 파싱 실패 — 이 줄을 건너뜁니다.`);
        continue;
      }
      if (!rec || typeof rec !== "object" || rec._doc) continue;
      if (rec.kind !== "narrative") continue;
      const label = String(rec.label || "").trim();
      const pattern = String(rec.pattern || "");
      if (!label || !pattern) {
        console.error(`integrity: ${SEED_FILE}:${lineNo} label 또는 pattern 이 비어 있습니다 — 건너뜁니다.`);
        continue;
      }
      rows.push({ label, pattern, remedy: rec.remedy ?? null, scope: rec.scope ?? null });
    }
    if (rows.length === 0) {
      console.error(`integrity: ${SEED_FILE} 에 유효 레코드가 없습니다 (${seedPath}).`);
    }
  } catch (e) {
    console.error(`integrity: ${SEED_FILE} 로드 실패 — 씨앗 없이 진행합니다. (${(e as Error).message})`);
  }
  if (!opts.noCache) _seedCache = rows;
  return rows;
}

export function mergedNarrativeRows(opts: CliOpts = {}): NarrativeRow[] {
  const merged = new Map<string, NarrativeRow>();
  for (const row of loadNarrativeSeed(opts)) merged.set(row.label, row);
  let registered: NarrativeRow[] = [];
  try {
    registered = listNarrativeRows(opts);
  } catch (e) {
    console.error(`integrity: 등록분 DB 읽기 실패 — 씨앗만으로 진행합니다. (${(e as Error).message})`);
  }
  for (const row of registered) merged.set(row.label, row);
  return [...merged.values()];
}

export function compiledNarrativePatterns(opts: CliOpts = {}): NarrativePattern[] {
  const out: NarrativePattern[] = [];
  for (const row of mergedNarrativeRows(opts)) {
    let compiled: RegExp;
    try {
      compiled = new RegExp(row.pattern);
    } catch (e) {
      console.error(`integrity: "${row.label}" 정규식 컴파일 실패 — 이 패턴 없이 진행합니다. (${(e as Error).message})`);
      continue;
    }
    out.push({
      label: row.label,
      pattern: compiled,
      remedy: String(row.remedy || ""),
      tailOnly: row.scope === "tail"
    });
  }
  return out;
}

export function matchNarrativeLabels(text: string, opts: CliOpts = {}): NarrativePattern[] {
  const body = proseOnly(text);
  const tail = body.trimEnd().slice(-TAIL_WINDOW);
  return compiledNarrativePatterns(opts).filter(p => p.pattern.test(p.tailOnly ? tail : body));
}
