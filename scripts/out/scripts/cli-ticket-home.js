// ─── 티켓 홈 이전 + self-healing 레지스트리 (#622) ──────────────────────────
//
// 티켓 데이터(.md/INDEX.json/claim/archive)는 워크스페이스 git 저장소가 아니라
// ~/.deuk-agent/tickets/{ticketKey}/ 에만 존재한다. 워크스페이스에는 git-ignore되는
// 불변 ID 마커(.deuk-agent/workspace-id) 1개만 남아 "주소록 열쇠" 역할을 한다.
//
// 매 명령 진입 시 reconcileWorkspace()가:
//   1. 마커(UUID) 읽기 — 없으면 발급·생성
//   2. 레지스트리 조회 (id → {path, ticketKey, migratedAt})
//   3. path 불일치(경로 이동/rename) → 자동 갱신(self-heal)
//   4. 구 위치(.deuk-agent/tickets)에 잔재 있으면 홈으로 흡수 + 삭제 + .gitignore
// 모두 idempotent — 여러 번 실행해도 안전하고 데이터 손실 0.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync, rmSync, statSync, copyFileSync } from "fs";
import { randomUUID, createHash } from "crypto";
import { LEGACY_DEUK, DEUK_ROOT_DIR, TICKET_SUBDIR, WORKSPACE_MARKER_FILE, basenameAnyOS, hasWorkspaceMarker, isHomeDirectChild, makePath, normalizeRegistryPath, registerTicketHomeModule, resolveUserHome } from "./cli-utils.js";
import { collectTicketMarkdownFiles } from "./cli-ticket-scan.js";
const WORKSPACE_ID_FILE = "workspace-id";
// ─── 홈 경로 ────────────────────────────────────────────────────────────────
export function homeTicketRoot(opts = {}) {
    return makePath([resolveUserHome(opts), DEUK_ROOT_DIR, "tickets"], opts);
}
export function resolveHomeTicketDir(ticketKey, opts = {}) {
    return makePath(homeTicketRoot(opts), ticketKey);
}
// ─── 불변 ID 마커 ───────────────────────────────────────────────────────────
function workspaceIdMarkerPath(workspaceRoot) {
    // New: .deuk-workspace-id file at workspace root. Fall back to legacy path for
    // read-only callers (readWorkspaceId) so old workspaces still resolve until migration.
    // #736: normalizeRegistryPath converts backslash Windows paths (D:\workspace\X) to
    // a consistent form so makePath does not mangle escape sequences (\w, \D etc.)
    // when running under POSIX node (Git Bash / WSL).
    return makePath(normalizeRegistryPath(workspaceRoot), WORKSPACE_MARKER_FILE);
}
function legacyWorkspaceIdMarkerPath(workspaceRoot) {
    return makePath(normalizeRegistryPath(workspaceRoot), LEGACY_DEUK.rootDir, WORKSPACE_ID_FILE);
}
// Reads the workspace's immutable id WITHOUT creating one (pure read). Returns null
// if no marker exists yet (workspace not migrated).
// Checks new .deuk-workspace-id first, then falls back to legacy .deuk-agent/workspace-id.
export function readWorkspaceId(workspaceRoot) {
    for (const markerPath of [workspaceIdMarkerPath(workspaceRoot), legacyWorkspaceIdMarkerPath(workspaceRoot)]) {
        try {
            const existing = String(readFileSync(markerPath, "utf8") || "").trim();
            if (existing)
                return existing;
        }
        catch { /* try next */ }
    }
    return null;
}
// Reads the workspace's immutable id. The id survives path moves and renames, so
// it — not the path — is the stable key for tickets.
//
// #645: minting a NEW id (and thus a marker) is gated behind opts.allowCreate.
// Only `deuk-agent-flow init` passes it. Every other entry point (ticket commands
// running in some cwd) reads an EXISTING marker or gets null — it must never mint
// a workspace just because a command ran in a directory. Auto-registration on cwd
// is exactly what spawned the ghost workspaces; the only way in is an explicit init.
export function readOrCreateWorkspaceId(workspaceRoot, opts = {}) {
    // Never materialize anything under a path that doesn't exist (a stale-cookie
    // JOIN can fabricate <parentWS>\<childName>).
    if (!existsSync(workspaceRoot))
        return null;
    // readWorkspaceId checks new .deuk-workspace-id then legacy .deuk-agent/workspace-id.
    const existing = readWorkspaceId(workspaceRoot);
    if (existing)
        return existing;
    // No marker yet: this workspace was never initialized. Mint one ONLY when an
    // explicit init asked for it; otherwise return null so callers skip cleanly.
    if (!opts.allowCreate)
        return null;
    const id = randomUUID();
    if (!opts.dryRun) {
        writeFileSync(workspaceIdMarkerPath(workspaceRoot), id + "\n", "utf8");
    }
    return id;
}
// ─── ticketKey: basename 우선, 동명 충돌만 id suffix ──────────────────────────
function shortIdSuffix(id) {
    return createHash("sha256").update(String(id), "utf8").digest("hex").slice(0, 8);
}
// Picks a folder name under the home tickets root. Prefers the bare basename for
// readability; only when another workspace already owns that name (different id)
// does it disambiguate with an id-derived suffix.
export function computeTicketKey(workspaceId, workspaceRoot, registry, opts = {}) {
    // #632: normalizeRegistryPath returns a Windows-style path (e.g. D:\workspace\DeukPack)
    // even when this code runs under a POSIX node (WSL / Git Bash), where path.basename
    // does NOT treat "\\" as a separator — basename("D:\\workspace\\DeukPack") wrongly
    // yields "workspaceDeukPack". That bogus key spawns ~/.deuk-agent/tickets/workspaceDeukPack/
    // and, because the derived id never matches the registry, makes reconcile fire on every
    // command. Split on BOTH separators so the last real path segment is taken.
    const base = basenameAnyOS(normalizeRegistryPath(workspaceRoot)) || "workspace";
    const owner = registry.byKey?.[base];
    if (!owner || owner === workspaceId)
        return base;
    return `${base}-${shortIdSuffix(workspaceId)}`;
}
// ─── .gitignore 보강 ─────────────────────────────────────────────────────────
function ensureGitignored(workspaceRoot, opts = {}) {
    if (opts.dryRun)
        return;
    // .deuk-workspace-id is committed (not ignored). Remove any stale .deuk-agent/ entry.
    const giPath = makePath(workspaceRoot, ".gitignore");
    if (!existsSync(giPath))
        return;
    const gi = readFileSync(giPath, "utf8");
    const legacyLine = `${LEGACY_DEUK.rootDir}/`;
    const cleaned = gi.split(/\r?\n/).filter(l => l.trim() !== legacyLine && l.trim() !== LEGACY_DEUK.rootDir).join("\n");
    if (cleaned !== gi) {
        writeFileSync(giPath, cleaned.replace(/\n*$/, "\n"), "utf8");
    }
}
// ─── 잔재 흡수: 구 위치 tickets → 홈 ─────────────────────────────────────────
// rename fails across drives (Windows D:\ → C:\ raises EXDEV). Fall back to
// copy+unlink so workspaces on a different volume than home still migrate.
function moveFile(src, dest) {
    try {
        renameSync(src, dest);
    }
    catch (err) {
        if (err && err.code === "EXDEV") {
            copyFileSync(src, dest);
            rmSync(src, { force: true });
        }
        else {
            throw err;
        }
    }
}
function moveTreeInto(srcDir, destDir) {
    mkdirSync(destDir, { recursive: true });
    for (const ent of readdirSync(srcDir, { withFileTypes: true })) {
        const src = makePath(srcDir, ent.name);
        const dest = makePath(destDir, ent.name);
        if (ent.isDirectory()) {
            moveTreeInto(src, dest);
        }
        else {
            // Don't clobber a home file that already exists (home is source of truth).
            if (!existsSync(dest))
                moveFile(src, dest);
            else
                rmSync(src, { force: true });
        }
    }
    rmSync(srcDir, { recursive: true, force: true });
}
// #727: the workspace must end with ONLY the .deuk-workspace-id file — no .deuk or
// .deuk-agent directory may survive. The two names are handled DIFFERENTLY:
//   - .deuk-agent (LEGACY_DEUK.rootDir): a legitimate former ticket location. Its
//     tickets/ subtree is absorbed into the home (uuid) store first (no data loss),
//     then the whole dir is removed.
//   - .deuk (DEUK_ROOT_DIR): must NEVER exist in a workspace; any occurrence is a
//     BUG artifact (report/knowledge/defrag wrote here by mistake). Delete it whole
//     — there is no real data to preserve (언니 지시).
// `homeDir` is the only out-of-workspace write target; the workspace itself is only
// ever DELETED here (migration sync) — never written with new content.
function absorbWorkspaceResidue(workspaceRoot, homeDir, opts = {}) {
    let absorbed = false;
    // Legacy .deuk-agent: preserve tickets into home, then remove the dir.
    const legacyDir = makePath(workspaceRoot, LEGACY_DEUK.rootDir);
    try {
        if (existsSync(legacyDir) && statSync(legacyDir).isDirectory()) {
            absorbed = true;
            if (!opts.dryRun) {
                const legacyTickets = makePath(legacyDir, TICKET_SUBDIR);
                try {
                    if (existsSync(legacyTickets) && statSync(legacyTickets).isDirectory()) {
                        moveTreeInto(legacyTickets, homeDir);
                    }
                }
                catch { /* tolerate; dir removed next regardless */ }
                rmSync(legacyDir, { recursive: true, force: true });
            }
        }
    }
    catch { /* not a dir / inaccessible — skip */ }
    // Bug-produced .deuk: delete whole, no preservation.
    const bugDir = makePath(workspaceRoot, DEUK_ROOT_DIR);
    try {
        if (existsSync(bugDir) && statSync(bugDir).isDirectory()) {
            absorbed = true;
            if (!opts.dryRun)
                rmSync(bugDir, { recursive: true, force: true });
        }
    }
    catch { /* not a dir / inaccessible — skip */ }
    return absorbed;
}
// The user home itself (~/.deuk-agent) is the ticket STORE, not a workspace. If a
// command runs with cwd at/above home, detect must NOT treat home as a workspace —
// reconciling it would try to absorb the home tickets into themselves (infinite
// recursion). Returns true when workspaceRoot is the home dir or an ancestor of the
// home ticket store.
export function isHomeStoreRoot(workspaceRoot, opts = {}) {
    const home = normalizeRegistryPath(resolveUserHome(opts));
    const root = normalizeRegistryPath(workspaceRoot);
    if (root === home)
        return true;
    // home tickets live under <home>/.deuk-agent/tickets — guard that whole subtree.
    const store = normalizeRegistryPath(makePath([resolveUserHome(opts), DEUK_ROOT_DIR], opts));
    return root === store || store.startsWith(root + "/") || root.startsWith(store + "/");
}
// ─── uuid 스토어: workspace.json + wp-{name} 더미 (#638) ──────────────────────
//
// 홈 스토어 폴더명을 불변 UUID로 쓰면 사람이 폴더를 못 읽는다. 두 가지 단서를 둔다:
//   - workspace.json: { uuid, path, name, aliases } — 기계가 읽는 권위 메타데이터
//   - wp-{name}     : 빈 더미 파일 — `ls`만 해도 사람이 워크스페이스를 식별
// 둘 다 reconcile 시 멱등하게 갱신한다(이름/경로 변경에도 폴더 rename 불필요).
const WORKSPACE_META_FILE = "workspace.json";
function readWorkspaceMeta(homeDir) {
    try {
        return JSON.parse(readFileSync(makePath(homeDir, WORKSPACE_META_FILE), "utf8"));
    }
    catch {
        return null;
    }
}
function writeWorkspaceStoreMarkers(homeDir, { uuid, path, name }, opts = {}) {
    if (opts.dryRun)
        return;
    mkdirSync(homeDir, { recursive: true });
    const meta = { uuid, path, name, updatedAt: new Date().toISOString() };
    writeFileSync(makePath(homeDir, WORKSPACE_META_FILE), JSON.stringify(meta, null, 2) + "\n", "utf8");
    // Refresh the human-readable wp-{name} dummy: remove stale wp-* then write the
    // current one, so a rename leaves exactly one correct label.
    for (const ent of readdirSync(homeDir, { withFileTypes: true })) {
        if (ent.isFile() && ent.name.startsWith("wp-") && ent.name !== `wp-${name}`) {
            rmSync(makePath(homeDir, ent.name), { force: true });
        }
    }
    if (name)
        writeFileSync(makePath(homeDir, `wp-${name}`), "", "utf8");
}
// One-time, idempotent relocation of a legacy name-keyed folder to the uuid folder.
// If the uuid folder already exists, migration is already done → no-op. Otherwise,
// if the legacy {ticketKey}/ folder exists, move its whole tree under {uuid}/.
function migrateLegacyKeyFolderToUuid(uuid, ticketKey, opts = {}) {
    const uuidDir = resolveHomeTicketDir(uuid, opts);
    if (existsSync(uuidDir))
        return uuidDir; // already on uuid layout
    const legacyDir = resolveHomeTicketDir(ticketKey, opts);
    if (ticketKey && ticketKey !== uuid && existsSync(legacyDir) && !opts.dryRun) {
        moveTreeInto(legacyDir, uuidDir); // {ticketKey}/* → {uuid}/*
    }
    return uuidDir;
}
// ─── reconcile: 매 명령 진입 훅 ──────────────────────────────────────────────
//
// 마커 → 레지스트리 → 보정 → 잔재 흡수. 홈 티켓 디렉토리 절대경로를 반환한다.
export function reconcileWorkspace(workspaceRoot, opts = {}) {
    // Never treat the home ticket store as a workspace (would recurse / pollute the
    // registry with a "home" entry). Callers should guard too, but enforce here.
    if (isHomeStoreRoot(workspaceRoot, opts)) {
        return {
            id: null, ticketKey: null,
            homeDir: homeTicketRoot(opts),
            pathChanged: false, absorbed: false, skipped: true,
        };
    }
    const id = readOrCreateWorkspaceId(workspaceRoot, opts);
    // #645: readOrCreateWorkspaceId returns null when workspaceRoot does not exist
    // (a fabricated ghost path). Bail out before touching the registry so we never
    // register a phantom workspace under a non-existent path.
    if (id == null) {
        return {
            id: null, ticketKey: null,
            homeDir: homeTicketRoot(opts),
            pathChanged: false, absorbed: false, skipped: true,
        };
    }
    const normPath = normalizeRegistryPath(workspaceRoot);
    // #645: registry.json is retired. The SSOT is the uuid folder's workspace.json.
    // Prefer the name already recorded there; otherwise derive it from the path.
    // computeTicketKey is called with an empty registry — the folder is uuid-keyed,
    // so there is no name collision to disambiguate; it just yields the basename.
    const uuidDir = resolveHomeTicketDir(id, opts);
    const priorMeta = readWorkspaceMeta(uuidDir);
    const name = priorMeta?.name
        || computeTicketKey(id, workspaceRoot, { workspaces: {}, byKey: {} }, opts);
    // Idempotent: move a legacy {name}/ folder onto {uuid}/ exactly once. After this
    // the uuid folder exists and subsequent runs short-circuit inside the helper.
    const homeDir = migrateLegacyKeyFolderToUuid(id, name, opts);
    // self-heal: path moved/renamed since workspace.json was last written.
    const pathChanged = !priorMeta || priorMeta.path !== normPath;
    // Write the in-folder clues (workspace.json + wp-{name}) so the uuid folder is
    // self-describing — this IS the registration record (single source of truth).
    writeWorkspaceStoreMarkers(homeDir, { uuid: id, path: normPath, name }, opts);
    // Absorb any in-workspace residue (.deuk / .deuk-agent) into the (uuid) home dir
    // and delete the residue dirs, so the workspace keeps only .deuk-workspace-id.
    const absorbed = absorbWorkspaceResidue(workspaceRoot, homeDir, opts);
    if (absorbed)
        ensureGitignored(workspaceRoot, opts);
    if (!opts.dryRun)
        mkdirSync(homeDir, { recursive: true });
    return { id, ticketKey: name, uuid: id, homeDir, pathChanged, absorbed };
}
// PURE READ resolver used by detectConsumerTicketDir (#623). Resolves the home
// ticket dir for a workspace using only existing state — never creates a marker,
// moves files, or writes anything. #645: registry.json is retired; the uuid
// folder's workspace.json is the only record. Resolution order:
//   1. existing marker id → {uuid}/ folder (the migrated, authoritative location)
//   2. existing marker id but uuid folder absent → legacy {name}/ folder if present
//   3. no marker yet (not migrated) → basename (matches what reconcile will pick)
export function resolveHomeTicketDirForWorkspace(workspaceRoot, opts = {}) {
    const id = readWorkspaceId(workspaceRoot);
    if (id) {
        // #638: uuid-keyed layout. If the {uuid}/ folder exists (migrated), that IS the
        // home dir. Otherwise resolve the legacy {name}/ folder so reads keep working
        // until reconcile relocates it — this read NEVER creates or moves anything.
        const uuidDir = resolveHomeTicketDir(id, opts);
        if (existsSync(uuidDir))
            return uuidDir;
        const name = readWorkspaceMeta(uuidDir)?.name
            || computeTicketKey(id, workspaceRoot, { workspaces: {}, byKey: {} }, opts);
        const legacyDir = resolveHomeTicketDir(name, opts);
        return existsSync(legacyDir) ? legacyDir : uuidDir;
    }
    // Not migrated yet (no marker): mirror what reconcile will pick. Pure read.
    // #632: basenameAnyOS — a POSIX runtime would turn D:\workspace\DeukPack into
    // "workspaceDeukPack" with path.basename.
    const name = basenameAnyOS(normalizeRegistryPath(workspaceRoot)) || "workspace";
    return resolveHomeTicketDir(name, opts);
}
// Idempotent migration entry point (#623). Called once on ticket-command entry and
// on init — NOT from detect. Skips quickly when already migrated (marker present,
// registry current, no residue). Returns the reconcile result (or a skip marker).
export function ensureWorkspaceMigrated(workspaceRoot, opts = {}) {
    if (!workspaceRoot)
        return { skipped: true };
    if (isHomeStoreRoot(workspaceRoot, opts))
        return { skipped: true };
    return reconcileWorkspace(workspaceRoot, opts);
}
// ─── ghost 워크스페이스 청소 (#638) ──────────────────────────────────────────
//
// 이름 기반 ticketKey 폴더는 동명 워크스페이스 충돌 시 {name}-{idSuffix} 폴더를
// 양산했고(computeTicketKey), 그 중 다수가 .md 0개인 빈 껍데기로 남았다. 이들은
// 손으로 rm 하지 않고(메모리 무결성 게이트) 이 함수로 안전하게 제거한다.
//
// ghost 판정(보수적, 2조건 모두 충족):
//   1. 폴더명이 computeTicketKey의 동명 충돌 suffix 패턴 {name}-{8hex} 이고
//   2. .md 파일이 하나도 없음
// 즉 "동명 충돌로 생긴 빈 중복 폴더"만 ghost로 본다. suffix 없는 빈 폴더는 티켓이
// 없을 뿐인 실재 워크스페이스이므로(사용자 지시: 빈 거라도 존재하면 유지) 건드리지
// 않는다. 데이터가 한 줄이라도 있으면 당연히 제외.
const GHOST_SUFFIX_RE = /-[0-9a-f]{8}$/;
// #645: a path is a nested ghost when it lives strictly UNDER another workspace's
// path (parent + separator + child). The real workspaces are never prefixes of one
// another, so any path that is a child of another's path was fabricated by a
// stale-cookie JOIN / cwd auto-registration — never a real workspace.
function isNestedUnderAnotherWorkspace(targetPath, allPaths) {
    const target = normalizeRegistryPath(String(targetPath || "")).replace(/[\\/]+$/, "");
    if (!target)
        return false;
    for (const other of allPaths) {
        const parent = normalizeRegistryPath(String(other || "")).replace(/[\\/]+$/, "");
        if (!parent || parent === target)
            continue;
        // case-insensitive: Windows paths. target must start with parent + a separator.
        const t = target.toLowerCase();
        const p = parent.toLowerCase();
        if (t.startsWith(p + "\\") || t.startsWith(p + "/"))
            return true;
    }
    return false;
}
// #645: SSOT is each uuid folder's workspace.json — registry.json is retired. A
// folder is a ghost when it carries NO ticket data (.md) AND its workspace.json
// path is not a real, top-level workspace. The classification is two-pass because
// "nested under another workspace" needs the full set of legitimate paths first.
function listGhostTicketFolders(opts = {}) {
    const root = homeTicketRoot(opts);
    if (!existsSync(root))
        return [];
    // Pass 1: read every folder's workspace.json + data-bearing flag.
    const entries = [];
    for (const ent of readdirSync(root, { withFileTypes: true })) {
        if (!ent.isDirectory())
            continue;
        const dir = makePath(root, ent.name);
        const hasMarkdown = collectTicketMarkdownFiles(dir).length > 0;
        const meta = readWorkspaceMeta(dir);
        const path = meta?.path ? normalizeRegistryPath(String(meta.path)) : "";
        entries.push({ key: ent.name, dir, hasMarkdown, path });
    }
    // The set of paths that look like genuine top-level workspaces: they exist on
    // disk with a .deuk-agent marker, are not under the home store, and are not a
    // direct child of the home dir. These anchor the nested-ghost predicate.
    const legitPaths = entries
        .map(e => e.path)
        .filter(p => p && hasWorkspaceMarker(p) && !isHomeDirectChild(p, opts));
    const ghosts = [];
    for (const e of entries) {
        if (e.hasMarkdown)
            continue; // data-bearing — never a ghost
        // (a) legacy: collision-suffix folder ({name}-{8hex}) with no workspace.json
        //     and no .md — a pre-#638 leftover.
        const suffixGhost = GHOST_SUFFIX_RE.test(e.key) && !e.path;
        // (b) #645: a folder describing a path that is NOT a real workspace.
        let pathGhost = false;
        if (e.path) {
            const absent = !hasWorkspaceMarker(e.path);
            const homeChild = isHomeDirectChild(e.path, opts);
            const nested = isNestedUnderAnotherWorkspace(e.path, legitPaths);
            pathGhost = absent || homeChild || nested;
        }
        if (suffixGhost || pathGhost)
            ghosts.push({ key: e.key, dir: e.dir });
    }
    return ghosts;
}
// Remove empty ghost workspace folders from the home store. Dry-run by default;
// pass { apply: true } to delete. Returns a summary. Data-bearing folders (any
// .md) are never touched. #645: registry.json is no longer consulted or written —
// the uuid folder's workspace.json IS the registration record.
export function pruneGhostWorkspaces(opts = {}) {
    const apply = Boolean(opts.apply);
    const ghosts = listGhostTicketFolders(opts);
    const removed = [];
    for (const { key, dir } of ghosts) {
        if (apply)
            rmSync(dir, { recursive: true, force: true });
        removed.push(key);
    }
    return { ghosts: ghosts.map(g => g.key), removed, apply };
}
// Register with cli-utils so detectConsumerTicketDir can route to the home dir
// without a static circular import.
registerTicketHomeModule({
    reconcileWorkspace,
    ensureWorkspaceMigrated,
    resolveHomeTicketDirForWorkspace,
    readOrCreateWorkspaceId,
    readWorkspaceId,
    computeTicketKey,
    resolveHomeTicketDir,
    isHomeStoreRoot,
});
//# sourceMappingURL=cli-ticket-home.js.map