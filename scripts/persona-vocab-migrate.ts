import { existsSync,readFileSync } from "fs";
import { CliOpts,makePath,resolveUserHome } from "./cli-utils.js";
import { closeVocabDb,upsertVocabEntry,vocabEntryCount } from "./persona-vocab-db.js";

function vocabularyMdPath(opts: CliOpts = {}): string {
  return makePath(resolveUserHome(opts), ".deuk", "persona", "vocabulary.md");
}

function parseVocabMd(text: string): Array<{ category: string; entry: string }> {
  const out: Array<{ category: string; entry: string }> = [];
  let category = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("## ")) category = line.slice(3).trim();
    else if (line.startsWith("- ") && category) out.push({ category, entry: line.slice(2).trim() });
  }
  return out;
}

export function runPersonaVocabMigrate(opts: CliOpts = {}): { migrated: number; skippedExisting: number; sourcePath: string } {
  const mdPath = vocabularyMdPath(opts);
  if (!existsSync(mdPath)) {
    throw new Error(`persona vocab migrate: source not found — ${mdPath} (마이그레이션할 vocabulary.md가 없다)`);
  }
  const text = readFileSync(mdPath, "utf8");
  const entries = parseVocabMd(text);
  if (entries.length === 0) {
    throw new Error(`persona vocab migrate: ${mdPath} 에서 파싱된 항목이 0개 — 포맷("## 카테고리"/"- 항목")을 확인하라`);
  }

  const before = vocabEntryCount(opts);
  for (const { category, entry } of entries) {
    upsertVocabEntry(category, entry, opts);
  }
  const after = vocabEntryCount(opts);

  return {
    migrated: entries.length,
    skippedExisting: entries.length - (after - before),
    sourcePath: mdPath,
  };
}

export function runPersonaVocabMigrateCli(opts: CliOpts = {}): void {
  const result = runPersonaVocabMigrate(opts);
  console.log(
    `persona vocab migrate: ${result.sourcePath} 에서 ${result.migrated}개 항목 처리 ` +
    `(신규 삽입 ${result.migrated - result.skippedExisting}개, 이미 존재해 건너뜀 ${result.skippedExisting}개)`
  );
  closeVocabDb();
}
