import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { CliOpts, makePath, resolveUserHome } from "./cli-utils.js";

export const VERBOSITY_BLOCK_THRESHOLD = 3;

export type VerbosityAttempt = {
  turnKey: string;
  count: number;
  lastText: string;
  lastLabels: string[];
};

const EMPTY: VerbosityAttempt = { turnKey: "", count: 0, lastText: "", lastLabels: [] };

function attemptPath(opts: CliOpts = {}): string {
  return makePath(resolveUserHome(opts), ".deuk", "persona", "verbosity-attempts.json");
}

export function readVerbosityAttempt(turnKey: string, opts: CliOpts = {}): VerbosityAttempt {
  const path = attemptPath(opts);
  if (!existsSync(path)) return { ...EMPTY, turnKey };
  let parsed: any;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { ...EMPTY, turnKey };
  }
  if (!parsed || typeof parsed !== "object") return { ...EMPTY, turnKey };
  if (parsed.turnKey !== turnKey) return { ...EMPTY, turnKey };
  return {
    turnKey,
    count: Number.isFinite(parsed.count) ? Number(parsed.count) : 0,
    lastText: typeof parsed.lastText === "string" ? parsed.lastText : "",
    lastLabels: Array.isArray(parsed.lastLabels) ? parsed.lastLabels.map(String) : []
  };
}

export function writeVerbosityAttempt(state: VerbosityAttempt, opts: CliOpts = {}): void {
  const path = attemptPath(opts);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state), "utf8");
  } catch { /* 저장 실패는 1회차 취급으로 이어진다 */ }
}
