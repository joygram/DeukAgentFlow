import { CliOpts } from "./cli-utils.js";
import { deleteNarrativeRow, narrativeRowCount, upsertNarrativeRow } from "./integrity-narrative-db.js";
import { compiledNarrativePatterns, loadNarrativeSeed, matchNarrativeLabels, mergedNarrativeRows } from "./integrity-narrative-source.js";

export function printIntegrityGuide(): void {
  console.log(`deuk-agent-flow integrity — 보고 무결성 패턴 관리

Usage:
  deuk-agent-flow integrity narrative <command> [options]

Commands:
  list                      씨앗+등록분 병합 결과를 출력한다
  add                       패턴을 등록/갱신한다 (--label, --pattern, [--remedy], [--scope tail])
  remove                    등록분에서 제거한다 (--label). 씨앗 패턴은 이 명령으로 지워지지 않는다
  test                      임의 문장이 어떤 패턴에 걸리는지 확인한다 (--text)

Notes:
  씨앗 SSOT 는 templates/integrity/narrative.seed.jsonl 이며 패키지와 함께 배포된다.
  등록분은 ~/.deuk/integrity/narrative.db 에 쌓이고 같은 label 이면 씨앗을 덮는다.
  따라서 씨앗 개정이 등록분을 지우지 않는다.`);
}

export function runIntegrityNarrativeList(opts: CliOpts = {}): void {
  const seedLabels = new Set(loadNarrativeSeed(opts).map(r => r.label));
  const rows = mergedNarrativeRows(opts);
  if (rows.length === 0) {
    console.log("integrity narrative: 비어있음 — 씨앗을 찾지 못했다.");
    return;
  }
  console.log(`자기 서사 패턴 (● 등록분 · ○ 씨앗) — 총 ${rows.length}종, 등록분 ${narrativeRowCount(opts)}종`);
  for (const row of rows) {
    const mark = seedLabels.has(row.label) && !isOverridden(row.label, opts) ? "○" : "●";
    const scope = row.scope === "tail" ? " [끝 200자]" : "";
    console.log(`  ${mark} ${row.label}${scope}`);
    console.log(`      ${row.pattern}`);
    if (!row.remedy) console.log("      (remedy 없음 — 차단 시 일반 문구만 나간다)");
  }
}

function isOverridden(label: string, opts: CliOpts): boolean {
  try {
    const seed = loadNarrativeSeed(opts).find(r => r.label === label);
    const merged = mergedNarrativeRows(opts).find(r => r.label === label);
    if (!seed || !merged) return false;
    return seed.pattern !== merged.pattern || seed.remedy !== merged.remedy;
  } catch {
    return false;
  }
}

export function runIntegrityNarrativeAdd(
  label: string, pattern: string, remedy: string, scope: string, opts: CliOpts = {}
): void {
  if (!label || !pattern) {
    console.error("integrity narrative add: --label 과 --pattern 이 필요하다");
    process.exitCode = 1;
    return;
  }
  try {
    new RegExp(pattern);
  } catch (e) {
    console.error(`integrity narrative add: 정규식 컴파일 실패 — ${(e as Error).message}`);
    process.exitCode = 1;
    return;
  }
  upsertNarrativeRow({ label, pattern, remedy: remedy || null, scope: scope || null }, opts);
  console.log(`integrity: "${label}" 등록됨 (총 ${compiledNarrativePatterns({ ...opts, noCache: true }).length}종)`);
}

export function runIntegrityNarrativeRemove(label: string, opts: CliOpts = {}): void {
  if (!label) {
    console.error("integrity narrative remove: --label 이 필요하다");
    process.exitCode = 1;
    return;
  }
  const removed = deleteNarrativeRow(label, opts);
  if (removed === 0) {
    console.log(`integrity: "${label}" 등록분이 없다 — 씨앗 패턴은 이 명령으로 지워지지 않는다.`);
    return;
  }
  console.log(`integrity: "${label}" 등록분 제거됨 (${removed}행)`);
}

export function runIntegrityNarrativeTest(text: string, opts: CliOpts = {}): void {
  if (!text) {
    console.error("integrity narrative test: --text 가 필요하다");
    process.exitCode = 1;
    return;
  }
  const matched = matchNarrativeLabels(text, opts);
  if (matched.length === 0) {
    console.log("통과 — 검출된 자기 서사 없음");
    return;
  }
  console.log(`차단 — 검출: ${matched.map(p => p.label).join(", ")}`);
  for (const p of matched) {
    if (p.remedy) console.log(`\n[${p.label}] ${p.remedy}`);
  }
}
