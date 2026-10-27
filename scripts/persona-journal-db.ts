import Database from "better-sqlite3";
import { existsSync,mkdirSync } from "fs";
import { dirname } from "path";
import { CliOpts,makePath,resolveUserHome } from "./cli-utils.js";

const BUSY_TIMEOUT_MS = 500;

function personaJournalDbPath(opts: CliOpts = {}): string {
  return makePath(resolveUserHome(opts), ".deuk", "persona", "journal.db");
}

let _db: InstanceType<typeof Database> | null = null;
let _dbPath: string | null = null;

export function openJournalDb(opts: CliOpts = {}): InstanceType<typeof Database> {
  const path = personaJournalDbPath(opts);
  if (_db && _dbPath === path) return _db;
  if (_db) _db.close();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL CHECK(status IN ('pending', 'absorbed')),
      sense TEXT NOT NULL,
      absorbed_date TEXT,
      seq INTEGER NOT NULL,
      UNIQUE(sense)
    );
    CREATE INDEX IF NOT EXISTS idx_journal_status ON journal_entries(status);
  `);
  _db = db;
  _dbPath = path;
  return db;
}

export type JournalRow = { status: "pending" | "absorbed"; sense: string; absorbedDate: string | null };

export function listJournalEntries(opts: CliOpts = {}): JournalRow[] {
  const db = openJournalDb(opts);
  const rows = db.prepare(
    "SELECT status, sense, absorbed_date AS absorbedDate FROM journal_entries ORDER BY status, seq"
  ).all() as Array<{ status: string; sense: string; absorbedDate: string | null }>;
  return rows as JournalRow[];
}

export function upsertPendingJournalEntry(sense: string, opts: CliOpts = {}): void {
  const db = openJournalDb(opts);
  const nextSeq = db.prepare(
    "SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM journal_entries WHERE status = 'pending'"
  ).get() as { next: number };
  db.prepare(
    "INSERT OR IGNORE INTO journal_entries (status, sense, absorbed_date, seq) VALUES ('pending', ?, NULL, ?)"
  ).run(sense, nextSeq.next);
}

export function absorbJournalEntry(sense: string, absorbedDate: string, opts: CliOpts = {}): boolean {
  const db = openJournalDb(opts);
  const nextSeq = db.prepare(
    "SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM journal_entries WHERE status = 'absorbed'"
  ).get() as { next: number };
  const result = db.prepare(
    "UPDATE journal_entries SET status = 'absorbed', absorbed_date = ?, seq = ? WHERE sense = ? AND status = 'pending'"
  ).run(absorbedDate, nextSeq.next, sense);
  return result.changes > 0;
}

export function deleteAbsorbedJournalEntries(opts: CliOpts = {}): number {
  const db = openJournalDb(opts);
  return db.prepare("DELETE FROM journal_entries WHERE status = 'absorbed'").run().changes;
}
