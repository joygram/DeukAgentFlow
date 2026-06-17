import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync, renameSync, statSync } from "fs";
import { basename, dirname, resolve } from "path";
import {
  DEUK_ROOT_DIR, TICKET_SUBDIR, TICKET_INDEX_FILENAME,
  requireNonEmptySlug, findFileRecursively, toRepoRelativePath, detectConsumerTicketDir, computeTicketPath, normalizeTicketGroup, writeFileLF, makePath, resolveWorkspaceContext
 , CliOpts } from "./cli-utils.js";
import { collectTicketEntriesFromTopicFiles } from "./cli-ticket-scan.js";

const ARCHIVE_INDEX_MONTH_RE = /^INDEX\.archive\.(\d{4}-\d{2})\.json$/;
const ARCHIVE_INDEX_LEGACY_RE = /^INDEX\.archive\.json$/;

function parseNextTicketSequence(value) {
  const raw = Number(value);
  if (!Number.isInteger(raw) || raw < 1) return null;
  return raw;
}

function maxTicketNumberFromEntries(entries = []) {
  const newRe = /^([0-9]{3,4})-/;
  let max = 0;
  for (const e of (entries || [])) {
    const id = String(e.id || '');
    const m = id.match(newRe);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

function normalizeNextTicketSequence(nextTicketSequence, entries = []) {
  const fallbackNum = maxTicketNumberFromEntries(entries);
  const fallbackNext = fallbackNum < 9999 ? (fallbackNum + 1) : fallbackNum;
  const parsed = parseNextTicketSequence(nextTicketSequence);
  if (parsed === null) return fallbackNext || 1;
  return Math.max(parsed, fallbackNext || 1);
}

function writeJsonFileAtomically(absPath, data) {
  const serialized = JSON.stringify(data, null, 2) + "\n";
  const tmpPath = `${absPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileLF(tmpPath, serialized);
  try {
    renameSync(tmpPath, absPath);
  } catch (err) {
    // POSIX rename(2)은 대상을 원자적으로 덮어쓰지만, Windows renameSync는 대상이
    // 이미 있으면 EEXIST/EPERM으로 throw한다. 그 경우 대상을 먼저 지우고 재시도하고,
    // 그래도 실패하면 직접 덮어쓰기로 폴백한다. 어느 경로든 tmp는 남기지 않는다.
    try {
      if (existsSync(absPath)) {
        unlinkSync(absPath);
        renameSync(tmpPath, absPath);
      } else {
        throw err;
      }
    } catch {
      writeFileLF(absPath, serialized);
      if (existsSync(tmpPath)) {
        try { unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
      }
    }
  }
}

function listArchiveIndexFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(ent => ent.isFile())
    .map(ent => makePath(dir, ent.name))
    .filter(abs => ARCHIVE_INDEX_LEGACY_RE.test(basename(abs)) || ARCHIVE_INDEX_MONTH_RE.test(basename(abs)))
    .sort((a, b) => {
      const aBase = basename(a);
      const bBase = basename(b);
      const aMatch = aBase.match(ARCHIVE_INDEX_MONTH_RE);
      const bMatch = bBase.match(ARCHIVE_INDEX_MONTH_RE);
      if (aMatch && !bMatch) return 1;
      if (!aMatch && bMatch) return -1;
      if (!aMatch && !bMatch) return aBase.localeCompare(bBase);
      return aMatch[1].localeCompare(bMatch[1]);
    });
}

function parseIndexFile(absPath) {
  if (!existsSync(absPath)) {
    return { version: 1, updatedAt: null, nextTicketSequence: 1, entries: [] };
  }
  try {
    const j = JSON.parse(readFileSync(absPath, "utf8"));
    const entries = Array.isArray(j.entries) ? j.entries.map(e => {
      const entry = { ...e, status: e.status || "open", group: normalizeTicketGroup(e.group, "sub") };
      entry.path = computeTicketPath(entry);
      return entry;
    }) : [];
    // activeTicketId/activeTickets are no longer read from INDEX.json — focus is
    // owned solely by the marker file. Any legacy fields on disk are ignored.
    return {
      version: j.version || 1,
      updatedAt: j.updatedAt ?? null,
      nextTicketSequence: parseNextTicketSequence(j.nextTicketSequence),
      entries
    };
  } catch (err) {
    console.error(`[ERROR] Failed to parse ${basename(absPath)} at ${absPath}:`, err.message);
    return { version: 1, updatedAt: null, nextTicketSequence: 1, entries: [], _corrupt: true };
  }
}

function getWorkspaceKey(cwd) {
  return resolveWorkspaceContext(cwd).breadcrumb;
}

function getWorkspaceSlug(cwd) {
  const key = getWorkspaceKey(cwd);
  return key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default';
}

function splitEntriesForStorage(entries = []) {
  const activeEntries = [];
  const archiveEntries = [];
  for (const entry of entries) {
    const status = String(entry?.status || "open").toLowerCase();
    const phase = Number(entry?.phase || 1);
    if ((status === "open" || status === "active") && phase < 4 && !entry?.archiveYearMonth) {
      activeEntries.push(entry);
    } else {
      archiveEntries.push(entry);
    }
  }
  return { activeEntries, archiveEntries };
}


export function readTicketIndexJson(cwd) {
  const dir = detectConsumerTicketDir(cwd);
  if (!dir) return { version: 1, updatedAt: null, entries: [] };
  const mainPath = makePath(dir, TICKET_INDEX_FILENAME);
  const main = parseIndexFile(mainPath);

  // The pointer file no longer stores entries — the ticket list is derived from
  // the .md files (single source of truth). Scan them here so every consumer of
  // readTicketIndexJson still sees a populated entry list.
  const entries = collectTicketEntriesFromTopicFiles(cwd).map(entry => {
    const next: Record<string, any> = { ...entry, status: entry.status || "open", group: normalizeTicketGroup(entry.group, "sub") };
    next.path = computeTicketPath(next);
    return next;
  });

  // #685: LangGraph 모델 — state(현재 노드)는 .md 프론트매터(phase/status)가 유일 SSOT.
  // sessionId/쿠키/claim 폴백 레이어는 전면 제거됨. 현재 노드(activeTicketId)는 디스크의
  // .md 스캔 결과에서 결정적으로 도출한다: live = (open/active) AND phase<4.
  // 여러 개 live면 가장 진행된 노드(phase 높은 것, 동률이면 최신 createdAt)가 현재 노드.
  // 값이 없으면 폴백이 아니라 "현재 노드 없음(null) = START 진입점"이다.
  const liveEntries = entries.filter(e => {
    const status = String(e.status || "open").toLowerCase();
    return (status === "open" || status === "active") && Number(e.phase || 1) < 4 && !e.archiveYearMonth;
  });
  const sortedLive = [...liveEntries].sort((a, b) => {
    const phaseDiff = Number(b.phase || 1) - Number(a.phase || 1);
    if (phaseDiff !== 0) return phaseDiff;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
  const activeTicketId = sortedLive.length > 0 ? sortedLive[0].id : null;

  return {
    version: main.version || 1,
    updatedAt: main.updatedAt ?? null,
    activeTicketId,
    liveTicketIds: sortedLive.map(e => e.id),
    nextTicketSequence: normalizeNextTicketSequence(main.nextTicketSequence, entries),
    entries,
    _corrupt: Boolean(main._corrupt)
  };
}

export function writeTicketIndexJson(cwd, indexJson, opts: CliOpts = {}) {
  if (indexJson._corrupt && !opts.force) {
    console.error(`[ABORT] Refusing to overwrite potentially corrupt ${TICKET_INDEX_FILENAME}. Use --force to override.`);
    return;
  }
  const dir = detectConsumerTicketDir(cwd, { createIfMissing: true });
  const p = makePath(dir, TICKET_INDEX_FILENAME);
  if (opts.dryRun) return;
  mkdirSync(dir, { recursive: true });
  
  // The pointer file is a THIN focus-state file. The ticket list itself is
  // derived from .md files (the single source of truth), so we never persist
  // entries or per-month archive index files. We keep only the two facts that
  // cannot be re-derived from .md alone: the focus pointer (activeTicketId) and
  // the monotonically increasing next ticket number (nextTicketSequence).
  const entries = Array.isArray(indexJson.entries) ? indexJson.entries : [];

  const currentDiskState = parseIndexFile(p);

  // nextTicketSequence must never go backwards: max of the stored pointer and
  // (highest known ticket number across ALL entries, active or archived) + 1.
  const callerNextSequence = normalizeNextTicketSequence(indexJson.nextTicketSequence, entries);
  const diskNextSequence = normalizeNextTicketSequence(currentDiskState.nextTicketSequence, entries);
  const nextTicketSequence = Math.max(callerNextSequence, diskNextSequence);

  const out = {
    version: indexJson.version || 1,
    updatedAt: indexJson.updatedAt || new Date().toISOString(),
    // activeTickets is deliberately omitted to prevent centralized contention
    nextTicketSequence
  };
  writeJsonFileAtomically(p, out);

  // Remove any legacy per-month archive index files — entries are no longer
  // persisted, so these stale duplicates must not linger.
  for (const filePath of listArchiveIndexFiles(dir)) {
    unlinkSync(filePath);
  }
}

// #675: Claims ticketId for the current session using cookie touch file.
// Pass ticketId=null to release.
export function setActiveTicketMarker(cwd, ticketId, opts: CliOpts = {}) {
  // #685: LangGraph 모델 — 현재 노드는 .md phase가 SSOT다. 노드 위치를 쿠키/마커에
  // 별도 저장하지 않는다(폴백 레이어 전면 제거). 이 함수는 하위 호환을 위한 no-op이며,
  // 노드 이동은 ticket move가 .md phase를 갱신하는 것으로만 일어난다.
  return;
}

// #685: getHostnameSlug 제거 — 티켓 ID에서 hostname suffix를 뺐으므로 불필요(언니 지시).

// #685: claim/actor/세션 마커 레이어 전면 제거 — LangGraph 모델에서 현재 노드는 .md
// phase가 SSOT이고 단일 사용자 환경이라 "누가 티켓을 잡았나" 추적이 불필요하다.
// resolveActor/readClaim/writeClaim/releaseClaim/isClaimStale/migrateLegacyActiveMarkers
// (전부 sessionId 쿠키 폴백 의존)와 CLAIM_STALE_MS를 삭제했다.

export function computeNextTicketNumber(indexState) {
  const maybeEntries = Array.isArray(indexState) ? indexState : indexState?.entries;
  const parsedNext = normalizeNextTicketSequence(indexState?.nextTicketSequence, maybeEntries);
  return { num: parsedNext };
}

export function generateTicketId(titleSlug, indexState) {
  // #685: 티켓 ID의 hostname suffix(-joy-deep 등) 제거 — 단일 환경이라 호스트 구분이
  // 무의미하다(언니 지시). ID는 {num}-{slug}로만 구성한다.
  const slug = requireNonEmptySlug(titleSlug, "ticket title");
  const match = slug.match(/^(\d{3,4})-(.*)/);
  const idSlug = match ? requireNonEmptySlug(match[2], "ticket title") : slug;
  if (/^\d{3,4}$/.test(idSlug)) {
    throw new Error("[VALIDATION FAILED] ticket title must include a non-numeric slug; ticket numbers are assigned by INDEX nextTicketSequence.");
  }
  const { num } = computeNextTicketNumber(indexState);
  const numStr = String(num).padStart(3, '0');
  const finalSlug = idSlug.slice(0, 32);
  return `${numStr}-${finalSlug}`;
}

export function syncActiveTicketId(cwd, opts: CliOpts = {}) {
  // #685: LangGraph 모델 — 현재 노드는 .md phase가 SSOT라 마커 동기화가 불필요하다.
  // 이 함수는 이제 레거시 포인터 파일(LATEST.md/ACTIVE_TICKET.*) 정리만 담당한다.
  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) return;
  if (opts.dryRun) return;

  const legacyLatestPath = makePath(ticketDir, "LATEST.md");
  const pointerPathMd = makePath(ticketDir, "ACTIVE_TICKET.md");
  const pointerPathJson = makePath(ticketDir, "ACTIVE_TICKET.json");
  
  for (const p of [legacyLatestPath, pointerPathMd, pointerPathJson]) {
    if (existsSync(p)) {
      unlinkSync(p);
    }
  }
}

export async function syncToPipeline(url, data) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal?.timeout ? AbortSignal.timeout(3000) : undefined
    });
    return response.ok;
  } catch (err) {
    return false;
  }
}
