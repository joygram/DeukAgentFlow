import { dirname, basename } from "path";
import { mkdirSync } from "fs";
import { createHash } from "crypto";
import { DEUK_ROOT_DIR, buildWorkspaceAliases, hasWorkspaceMarker, makePath, normalizeRegistryPath, resolveUserHome, writeFileLF } from "./cli-utils.js";
// ─── 내부 헬퍼: 워크스페이스 레지스트리 ─────────────────────────────────
function hashPath(value) {
    return createHash("sha256").update(normalizeRegistryPath(String(value || "")), "utf8").digest("hex");
}
function workspaceRegistryRoot(homeDir = resolveUserHome()) {
    return makePath(homeDir, ".agent-flow", "workspace");
}
function safeRegistryFileName(name) {
    const cleaned = String(name || "workspace")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `${cleaned || "workspace"}.json`;
}
// ─── 공개 API ─────────────────────────────────────────────────────────────
export function updateSiblingWorkspaceRegistry(cwd, opts = {}) {
    const workspacePath = normalizeRegistryPath(cwd || "");
    if (!hasWorkspaceMarker(workspacePath))
        return false;
    const homeDir = resolveUserHome(opts);
    // #623: never register the user home or anything under ~/.deuk-agent as a
    // workspace — that store holds relocated tickets, not a sibling workspace, and
    // registering it makes ticket ids look ambiguous across "workspaces".
    const homeNorm = normalizeRegistryPath(homeDir);
    const storeNorm = normalizeRegistryPath(makePath(homeDir, DEUK_ROOT_DIR));
    if (workspacePath === homeNorm
        || workspacePath === storeNorm
        || workspacePath.startsWith(storeNorm + "/")) {
        return false;
    }
    const dryRun = Boolean(opts.dryRun);
    const parentRoot = dirname(workspacePath);
    const workspaceName = basename(workspacePath);
    const parentRootHash = hashPath(parentRoot);
    const pathHash = hashPath(workspacePath);
    const registryDir = makePath(workspaceRegistryRoot(homeDir), parentRootHash);
    const registryPath = makePath(registryDir, safeRegistryFileName(workspaceName));
    const payload = {
        version: 1,
        name: workspaceName,
        path: workspacePath,
        aliases: buildWorkspaceAliases(workspaceName, workspacePath),
        parentRoot,
        parentRootHash,
        pathHash,
        updatedAt: new Date().toISOString(),
    };
    if (!dryRun) {
        mkdirSync(registryDir, { recursive: true });
        writeFileLF(registryPath, JSON.stringify(payload, null, 2) + "\n");
    }
    return { registryPath, payload };
}
//# sourceMappingURL=cli-init-workspace.js.map