import { existsSync, writeFileSync, readFileSync } from "fs";
import { LEGACY_DEUK, DEUK_ROOT_DIR, isInsideGitWorkTree, makePath } from "./cli-utils.js";
const GITIGNORE_AGENT_MARKER = "# deuk-agent-flow: agent hub directory (local, not committed by default)";
const LEGACY_GITIGNORE_AGENT_MARKER = "# deuk-agent-rule: agent hub directory (local, not committed by default)";
function hasExactGitignoreLine(content, line) {
    return content
        .split(/\r?\n/)
        .map(s => s.trim())
        .includes(line);
}
function removeExactGitignoreLines(content, lines) {
    const remove = new Set(lines);
    return content
        .split(/\r?\n/)
        .filter(line => !remove.has(line.trim()))
        .join("\n");
}
export function ensureTicketDirAndGitignore(opts) {
    const gitignorePath = makePath(opts.cwd, ".gitignore");
    if (opts.dryRun)
        return;
    if (!isInsideGitWorkTree(opts.cwd))
        return;
    let gi = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
    // Remove all legacy/old deuk ignore lines. The new .deuk-workspace-id file is committed
    // (not ignored), so no new ignore entry is added. Legacy dir names come from the single
    // LEGACY_DEUK.dirs SSOT — for each we strip both "<dir>/" and "<dir>/tickets/". DEUK_ROOT_DIR
    // ("<.deuk>/") is also stripped in case an older flow ever added it.
    const legacyIgnoreLines = LEGACY_DEUK.dirs.flatMap(dir => [`${dir}/`, `${dir}/tickets/`]);
    const cleanedGi = removeExactGitignoreLines(gi, [
        ...legacyIgnoreLines,
        GITIGNORE_AGENT_MARKER,
        LEGACY_GITIGNORE_AGENT_MARKER,
        `${DEUK_ROOT_DIR}/`, // new .deuk/ root line (if ever added)
    ]);
    if (cleanedGi !== gi) {
        writeFileSync(gitignorePath, cleanedGi.replace(/\n*$/, "\n"), "utf8");
        console.log("[INIT] Removed legacy .deuk-agent/ .gitignore entries");
    }
}
//# sourceMappingURL=cli-init-logic.js.map