import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { CliOpts, makePath, resolveUserHome } from "./cli-utils.js";

const BUSY_TIMEOUT_MS = 500;

function narrativeDbPath(opts: CliOpts = {}): string {
  return makePath(resolveUserHome(opts), ".deuk", "integrity", "narrative.db");
}

let _db: InstanceType<typeof Database> | null = null;
let _dbPath: string | null = null;

export function openNarrativeDb(opts: CliOpts = {}): InstanceType<typeof Database> {
  const path = narrativeDbPath(opts);
  if (_db && _dbPath === path) return _db;
  if (_db) _db.close();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS narrative_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE,
      pattern TEXT NOT NULL,
      remedy TEXT,
      scope TEXT,
      seq INTEGER NOT NULL
    );
  `);
  _db = db;
  _dbPath = path;
  return db;
}

export type NarrativeRow = { label: string; pattern: string; remedy: string | null; scope: string | null };

export function listNarrativeRows(opts: CliOpts = {}): NarrativeRow[] {
  const db = openNarrativeDb(opts);
  return db.prepare(
    "SELECT label, pattern, remedy, scope FROM narrative_patterns ORDER BY seq"
  ).all() as NarrativeRow[];
}

export function upsertNarrativeRow(row: NarrativeRow, opts: CliOpts = {}): void {
  const db = openNarrativeDb(opts);
  const next = db.prepare(
    "SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM narrative_patterns"
  ).get() as { next: number };
  db.prepare(`
    INSERT INTO narrative_patterns (label, pattern, remedy, scope, seq)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(label) DO UPDATE SET pattern = excluded.pattern, remedy = excluded.remedy, scope = excluded.scope
  `).run(row.label, row.pattern, row.remedy ?? null, row.scope ?? null, next.next);
}

export function deleteNarrativeRow(label: string, opts: CliOpts = {}): number {
  const db = openNarrativeDb(opts);
  const info = db.prepare("DELETE FROM narrative_patterns WHERE label = ?").run(label);
  return Number(info.changes || 0);
}

export function narrativeRowCount(opts: CliOpts = {}): number {
  const db = openNarrativeDb(opts);
  const row = db.prepare("SELECT COUNT(*) AS n FROM narrative_patterns").get() as { n: number };
  return row.n;
}
