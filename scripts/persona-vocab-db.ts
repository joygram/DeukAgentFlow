import Database from "better-sqlite3";
import { existsSync,mkdirSync } from "fs";
import { dirname } from "path";
import { CliOpts,makePath,resolveUserHome } from "./cli-utils.js";

const BUSY_TIMEOUT_MS = 500;

function personaDbPath(opts: CliOpts = {}): string {
  return makePath(resolveUserHome(opts), ".deuk", "persona", "vocabulary.db");
}

let _db: InstanceType<typeof Database> | null = null;
let _dbPath: string | null = null;

export function openVocabDb(opts: CliOpts = {}): InstanceType<typeof Database> {
  const path = personaDbPath(opts);
  if (_db && _dbPath === path) return _db;
  if (_db) _db.close();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS vocab_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      entry TEXT NOT NULL,
      seq INTEGER NOT NULL,
      UNIQUE(category, entry)
    );
    CREATE INDEX IF NOT EXISTS idx_vocab_category ON vocab_entries(category);
  `);
  const columns = new Set(db.prepare("PRAGMA table_info(vocab_entries)").all().map((c: any) => c.name));
  for (const column of ["form_nida", "form_yo", "form_hae"]) {
    if (!columns.has(column)) db.exec(`ALTER TABLE vocab_entries ADD COLUMN ${column} TEXT`);
  }
  _db = db;
  _dbPath = path;
  return db;
}

export function closeVocabDb(): void {
  if (_db) { _db.close(); _db = null; _dbPath = null; }
}

export type VocabRow = { category: string; entry: string };
export type VocabForm = "nida" | "yo" | "hae";

export function listVocabEntries(opts: CliOpts = {}, form: VocabForm = "yo"): VocabRow[] {
  const db = openVocabDb(opts);
  return db.prepare(
    `SELECT category, COALESCE(NULLIF(form_${form}, ''), entry) AS entry FROM vocab_entries ORDER BY category, seq`
  ).all() as VocabRow[];
}

export function updateVocabForms(category: string, entry: string, forms: Partial<Record<VocabForm, string>>, opts: CliOpts = {}): void {
  const db = openVocabDb(opts);
  const keys = Object.keys(forms) as VocabForm[];
  if (keys.length === 0) return;
  db.prepare(
    `UPDATE vocab_entries SET ${keys.map(k => `form_${k} = ?`).join(", ")} WHERE category = ? AND entry = ?`
  ).run(...keys.map(k => forms[k] ?? ""), category, entry);
}

export function upsertVocabEntry(category: string, entry: string, opts: CliOpts = {}): void {
  const db = openVocabDb(opts);
  const nextSeq = db.prepare(
    "SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM vocab_entries WHERE category = ?"
  ).get(category) as { next: number };
  db.prepare(
    "INSERT OR IGNORE INTO vocab_entries (category, entry, seq) VALUES (?, ?, ?)"
  ).run(category, entry, nextSeq.next);
}

export function deleteVocabCategory(category: string, opts: CliOpts = {}): number {
  const db = openVocabDb(opts);
  const info = db.prepare("DELETE FROM vocab_entries WHERE category = ?").run(category);
  return Number(info.changes || 0);
}

export function deleteVocabEntry(category: string, entry: string, opts: CliOpts = {}): number {
  const db = openVocabDb(opts);
  const info = db.prepare("DELETE FROM vocab_entries WHERE category = ? AND entry = ?").run(category, entry);
  return Number(info.changes || 0);
}

export function vocabEntryCount(opts: CliOpts = {}): number {
  const db = openVocabDb(opts);
  const row = db.prepare("SELECT COUNT(*) AS n FROM vocab_entries").get() as { n: number };
  return row.n;
}
