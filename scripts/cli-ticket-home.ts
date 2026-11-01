
import { createHash,randomUUID } from "crypto";
import { copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,renameSync,rmSync,statSync,writeFileSync } from "fs";
import { dirname } from "path";
import { collectTicketMarkdownFiles } from "./cli-ticket-scan.js";
import { CliOpts,DEUK_ROOT_DIR,LEGACY_DEUK,TICKET_SUBDIR,WORKSPACE_MARKER_FILE,PROJECT_RULE_FILE,basenameAnyOS,getProjectRulePath,getSiblingWorkspaceRegistryRoot,hasWorkspaceMarker,isHomeDirectChild,makePath,normalizeRegistryPath,readJsonFile,registerTicketHomeModule,resolveUserHome } from "./cli-utils.js";

const WORKSPACE_ID_FILE = "workspace-id";

export function homeTicketRoot(opts: CliOpts = {}) {
  return makePath([resolveUserHome(opts), DEUK_ROOT_DIR, "tickets"], opts);
}

export function resolveHomeTicketDir(ticketKey, opts: CliOpts = {}) {
  return makePath(homeTicketRoot(opts), ticketKey);
}

function workspaceIdMarkerPath(workspaceRoot) {
  return makePath(normalizeRegistryPath(workspaceRoot), WORKSPACE_MARKER_FILE);
}

function legacyWorkspaceIdMarkerPath(workspaceRoot) {
  return makePath(normalizeRegistryPath(workspaceRoot), LEGACY_DEUK.rootDir, WORKSPACE_ID_FILE);
}

export function readWorkspaceId(workspaceRoot) {
  for (const markerPath of [workspaceIdMarkerPath(workspaceRoot), legacyWorkspaceIdMarkerPath(workspaceRoot)]) {
    try {
      const existing = String(readFileSync(markerPath, "utf8") || "").trim();
      if (existing) return existing;
    } catch { /* try next */ }
  }
  return null;
}

export function readOrCreateWorkspaceId(workspaceRoot, opts: CliOpts = {}) {
  if (!existsSync(workspaceRoot)) return null;
  const existing = readWorkspaceId(workspaceRoot);
  if (existing) return existing;
  if (!opts.allowCreate) return null;
  const id = randomUUID();
  if (!opts.dryRun) {
    writeFileSync(workspaceIdMarkerPath(workspaceRoot), id + "\n", "utf8");
  }
  return id;
}

function shortIdSuffix(id) {
  return createHash("sha256").update(String(id), "utf8").digest("hex").slice(0, 8);
}

export function computeTicketKey(workspaceId, workspaceRoot, registry, opts: CliOpts = {}) {
  const base = basenameAnyOS(normalizeRegistryPath(workspaceRoot)) || "workspace";
  const owner = registry.byKey?.[base];
  if (!owner || owner === workspaceId) return base;
  return `${base}-${shortIdSuffix(workspaceId)}`;
}

function ensureGitignored(workspaceRoot, opts: CliOpts = {}) {
  if (opts.dryRun) return;
  const giPath = makePath(workspaceRoot, ".gitignore");
  if (!existsSync(giPath)) return;
  const gi = readFileSync(giPath, "utf8");
  const legacyLine = `${LEGACY_DEUK.rootDir}/`;
  const cleaned = gi.split(/\r?\n/).filter(l => l.trim() !== legacyLine && l.trim() !== LEGACY_DEUK.rootDir).join("\n");
  if (cleaned !== gi) {
    writeFileSync(giPath, cleaned.replace(/\n*$/, "\n"), "utf8");
  }
}

function moveFile(src, dest) {
  try {
    renameSync(src, dest);
  } catch (err) {
    if (err && err.code === "EXDEV") {
      copyFileSync(src, dest);
      rmSync(src, { force: true });
    } else {
      throw err;
    }
  }
}

// Moves srcDir contents into destDir without overwriting. A conflicting file stays in srcDir,
// and srcDir is removed only once empty, so nothing is ever deleted.
function moveTreeInto(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const ent of readdirSync(srcDir, { withFileTypes: true })) {
    const src = makePath(srcDir, ent.name);
    const dest = makePath(destDir, ent.name);
    if (ent.isDirectory()) {
      moveTreeInto(src, dest);
    } else if (!existsSync(dest)) {
      moveFile(src, dest);
    }
  }
  if (readdirSync(srcDir).length === 0) rmSync(srcDir, { recursive: true, force: true });
}

// Moves only tickets/ into the home store. PROJECT_RULE.md stays in the repo at its root;
// other entries (knowledge, docs, ...) are left in place. agentDir is removed only once empty.
function absorbAgentDir(agentDir, homeDir, workspaceRoot) {
  const ticketsDir = makePath(agentDir, TICKET_SUBDIR);
  if (existsSync(ticketsDir) && statSync(ticketsDir).isDirectory()) {
    moveTreeInto(ticketsDir, homeDir);
  }
  const legacyProjectRule = makePath(agentDir, PROJECT_RULE_FILE);
  const repoProjectRule = getProjectRulePath(workspaceRoot);
  if (existsSync(legacyProjectRule) && !existsSync(repoProjectRule)) {
    moveFile(legacyProjectRule, repoProjectRule);
  }
  if (readdirSync(agentDir).length === 0) rmSync(agentDir, { recursive: true, force: true });
}

function absorbWorkspaceResidue(workspaceRoot, homeDir, opts: CliOpts = {}) {
  let absorbed = false;
  for (const agentDirName of [LEGACY_DEUK.rootDir, DEUK_ROOT_DIR]) {
    const agentDir = makePath(workspaceRoot, agentDirName);
    try {
      if (!existsSync(agentDir) || !statSync(agentDir).isDirectory()) continue;
    } catch { continue; } // inaccessible — skip
    absorbed = true;
    if (!opts.dryRun) absorbAgentDir(agentDir, homeDir, workspaceRoot);
  }
  return absorbed;
}

export function isHomeStoreRoot(workspaceRoot, opts: CliOpts = {}) {
  const home = normalizeRegistryPath(resolveUserHome(opts));
  const root = normalizeRegistryPath(workspaceRoot);
  if (root === home || dirname(root) === root) return true;
  const store = normalizeRegistryPath(makePath([resolveUserHome(opts), DEUK_ROOT_DIR], opts));
  const isUnder = (child, parent) => child.startsWith(parent + "/") || child.startsWith(parent + "\\");
  return root === store || isUnder(store, root) || isUnder(root, store);
}

const WORKSPACE_META_FILE = "workspace.json";

export function readWorkspaceMeta(homeDir) {
  return readJsonFile(makePath(homeDir, WORKSPACE_META_FILE), null);
}

function writeWorkspaceStoreMarkers(homeDir, { uuid, path, name }, opts: CliOpts = {}) {
  if (opts.dryRun) return;
  mkdirSync(homeDir, { recursive: true });
  const meta = { uuid, path, name, updatedAt: new Date().toISOString() };
  writeFileSync(makePath(homeDir, WORKSPACE_META_FILE), JSON.stringify(meta, null, 2) + "\n", "utf8");
  for (const ent of readdirSync(homeDir, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.startsWith("wp-") && ent.name !== `wp-${name}`) {
      rmSync(makePath(homeDir, ent.name), { force: true });
    }
  }
  if (name) writeFileSync(makePath(homeDir, `wp-${name}`), "", "utf8");
}

function migrateLegacyKeyFolderToUuid(uuid, ticketKey, opts: CliOpts = {}) {
  const uuidDir = resolveHomeTicketDir(uuid, opts);
  if (existsSync(uuidDir)) return uuidDir;          // already on uuid layout
  const legacyDir = resolveHomeTicketDir(ticketKey, opts);
  if (ticketKey && ticketKey !== uuid && existsSync(legacyDir) && !opts.dryRun) {
    moveTreeInto(legacyDir, uuidDir);                // {ticketKey}/* → {uuid}/*
  }
  return uuidDir;
}

export function reconcileWorkspace(workspaceRoot, opts: CliOpts = {}) {
  if (isHomeStoreRoot(workspaceRoot, opts)) {
    return {
      id: null, ticketKey: null,
      homeDir: homeTicketRoot(opts),
      pathChanged: false, absorbed: false, skipped: true,
    };
  }
  const id = readOrCreateWorkspaceId(workspaceRoot, opts);
  if (id == null) {
    return {
      id: null, ticketKey: null,
      homeDir: homeTicketRoot(opts),
      pathChanged: false, absorbed: false, skipped: true,
    };
  }
  const normPath = normalizeRegistryPath(workspaceRoot);

  const uuidDir = resolveHomeTicketDir(id, opts);
  const priorMeta = readWorkspaceMeta(uuidDir);
  const pathChanged = !priorMeta || priorMeta.path !== normPath;
  const name = computeTicketKey(id, workspaceRoot, { workspaces: {}, byKey: {} }, opts);

  const homeDir = migrateLegacyKeyFolderToUuid(id, priorMeta?.name || name, opts);

  writeWorkspaceStoreMarkers(homeDir, { uuid: id, path: normPath, name }, opts);

  const absorbed = absorbWorkspaceResidue(workspaceRoot, homeDir, opts);
  if (absorbed) ensureGitignored(workspaceRoot, opts);

  if (!opts.dryRun) mkdirSync(homeDir, { recursive: true });
  return { id, ticketKey: name, uuid: id, homeDir, pathChanged, absorbed };
}

export function resolveHomeTicketDirForWorkspace(workspaceRoot, opts: CliOpts = {}) {
  const id = readWorkspaceId(workspaceRoot);
  if (id) {
    const uuidDir = resolveHomeTicketDir(id, opts);
    if (existsSync(uuidDir)) return uuidDir;
    const name = readWorkspaceMeta(uuidDir)?.name
      || computeTicketKey(id, workspaceRoot, { workspaces: {}, byKey: {} }, opts);
    const legacyDir = resolveHomeTicketDir(name, opts);
    return existsSync(legacyDir) ? legacyDir : uuidDir;
  }
  const name = basenameAnyOS(normalizeRegistryPath(workspaceRoot)) || "workspace";
  return resolveHomeTicketDir(name, opts);
}

export function ensureWorkspaceMigrated(workspaceRoot, opts: CliOpts = {}) {
  if (!workspaceRoot) return { skipped: true };
  if (isHomeStoreRoot(workspaceRoot, opts)) return { skipped: true };
  return reconcileWorkspace(workspaceRoot, opts);
}

function isWorkspaceInHomeStore(workspaceRoot, opts: CliOpts = {}) {
  const id = readWorkspaceId(workspaceRoot);
  return Boolean(id) && existsSync(makePath(resolveHomeTicketDir(id, opts), WORKSPACE_META_FILE));
}

// Moves every workspace known to the legacy sibling registry (~/.agent-flow/workspace)
// into the home ticket store so registry-backed resolution can find it.
export function migrateLegacyRegistryWorkspaces(opts: CliOpts = {}) {
  const migratedRoots: string[] = [];
  const legacyRegistryRoot = getSiblingWorkspaceRegistryRoot(resolveUserHome(opts));
  if (!existsSync(legacyRegistryRoot)) return migratedRoots;
  for (const groupEnt of readdirSync(legacyRegistryRoot, { withFileTypes: true })) {
    if (!groupEnt.isDirectory()) continue;
    const groupDir = makePath(legacyRegistryRoot, groupEnt.name);
    for (const recordEnt of readdirSync(groupDir, { withFileTypes: true })) {
      if (!recordEnt.isFile() || !recordEnt.name.endsWith(".json")) continue;
      const record = readJsonFile(makePath(groupDir, recordEnt.name), null);
      const workspaceRoot = normalizeRegistryPath(String(record?.path || ""));
      if (!workspaceRoot || !existsSync(workspaceRoot)) continue;
      const hasLegacyAgentDir = existsSync(makePath(workspaceRoot, LEGACY_DEUK.rootDir));
      if (!hasLegacyAgentDir && !hasWorkspaceMarker(workspaceRoot)) continue;
      if (isHomeStoreRoot(workspaceRoot, opts) || isHomeDirectChild(workspaceRoot, opts)) continue;
      const hasLegacyTickets = existsSync(makePath(workspaceRoot, LEGACY_DEUK.rootDir, TICKET_SUBDIR));
      if (isWorkspaceInHomeStore(workspaceRoot, opts) && !hasLegacyTickets) continue;
      try {
        // A legacy registry record is an explicit registration, so the id marker may be created.
        const reconciled = reconcileWorkspace(workspaceRoot, { ...opts, allowCreate: true });
        if (!reconciled.skipped) migratedRoots.push(workspaceRoot);
      } catch (err) {
        console.warn(`[migrate] ${workspaceRoot}: ${(err as Error).message}`);
      }
    }
  }
  return migratedRoots;
}

const GHOST_SUFFIX_RE = /-[0-9a-f]{8}$/;

function isNestedUnderAnotherWorkspace(targetPath, allPaths) {
  const target = normalizeRegistryPath(String(targetPath || "")).replace(/[\\/]+$/, "");
  if (!target) return false;
  for (const other of allPaths) {
    const parent = normalizeRegistryPath(String(other || "")).replace(/[\\/]+$/, "");
    if (!parent || parent === target) continue;
    const t = target.toLowerCase();
    const p = parent.toLowerCase();
    if (t.startsWith(p + "\\") || t.startsWith(p + "/")) return true;
  }
  return false;
}

function listGhostTicketFolders(opts: CliOpts = {}) {
  const root = homeTicketRoot(opts);
  if (!existsSync(root)) return [];

  const entries = [];
  for (const ent of readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const dir = makePath(root, ent.name);
    const hasMarkdown = collectTicketMarkdownFiles(dir).length > 0;
    const meta = readWorkspaceMeta(dir);
    const path = meta?.path ? normalizeRegistryPath(String(meta.path)) : "";
    entries.push({ key: ent.name, dir, hasMarkdown, path });
  }

  const legitPaths = entries
    .map(e => e.path)
    .filter(p => p && hasWorkspaceMarker(p) && !isHomeDirectChild(p, opts));

  const ghosts = [];
  for (const e of entries) {
    if (e.hasMarkdown) continue;                        // data-bearing — never a ghost

    const suffixGhost = GHOST_SUFFIX_RE.test(e.key) && !e.path;

    let pathGhost = false;
    if (e.path) {
      const absent = !hasWorkspaceMarker(e.path);
      const homeChild = isHomeDirectChild(e.path, opts);
      const nested = isNestedUnderAnotherWorkspace(e.path, legitPaths);
      pathGhost = absent || homeChild || nested;
    }

    if (suffixGhost || pathGhost) ghosts.push({ key: e.key, dir: e.dir });
  }
  return ghosts;
}

export function pruneGhostWorkspaces(opts: CliOpts = {}) {
  const apply = Boolean(opts.apply);
  const ghosts = listGhostTicketFolders(opts);
  const removed = [];
  for (const { key, dir } of ghosts) {
    if (apply) rmSync(dir, { recursive: true, force: true });
    removed.push(key);
  }
  return { ghosts: ghosts.map(g => g.key), removed, apply };
}

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
