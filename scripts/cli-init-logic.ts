import { existsSync,readFileSync,writeFileSync } from "fs";
import { DEUK_ROOT_DIR,isInsideGitWorkTree,LEGACY_DEUK,makePath } from "./cli-utils.js";

const GITIGNORE_AGENT_MARKER = "# deuk-agent-flow: agent hub directory (local, not committed by default)";
const LEGACY_GITIGNORE_AGENT_MARKER = "# deuk-agent-rule: agent hub directory (local, not committed by default)";

function removeExactGitignoreLines(content, lines) {
  const remove = new Set(lines);
  return content
    .split(/\r?\n/)
    .filter(line => !remove.has(line.trim()))
    .join("\n");
}

export function ensureTicketDirAndGitignore(opts) {
  const gitignorePath = makePath(opts.workspaceRoot, ".gitignore");

  if (opts.dryRun) return;

  if (!isInsideGitWorkTree(opts.workspaceRoot)) return;

  let gi = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";

  const legacyIgnoreLines = LEGACY_DEUK.dirs.flatMap(dir => [`${dir}/`, `${dir}/tickets/`]);
  const cleanedGi = removeExactGitignoreLines(gi, [
    ...legacyIgnoreLines,
    GITIGNORE_AGENT_MARKER,
    LEGACY_GITIGNORE_AGENT_MARKER,
    `${DEUK_ROOT_DIR}/`,  // new .deuk/ root line (if ever added)
  ]);
  if (cleanedGi !== gi) {
    writeFileSync(gitignorePath, cleanedGi.replace(/\n*$/, "\n"), "utf8");
    console.log("[INIT] Removed legacy .deuk-agent/ .gitignore entries");
  }
}
