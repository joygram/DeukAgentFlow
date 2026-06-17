import { existsSync, appendFileSync, writeFileSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { AGENT_ROOT_DIR, LEGACY_IGNORE_DIR, LEGACY_TICKET_DIR, LEGACY_TICKET_DIR_PLURAL, TICKET_DIR_NAME } from "./cli-utils.mjs";

const GITIGNORE_AGENT_MARKER = "# deuk-agent-rule: agent hub directory (local, not committed by default)";

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
  const ticketPath = join(opts.cwd, TICKET_DIR_NAME);
  const gitignorePath = join(opts.cwd, ".gitignore");
  const ignoreLine = AGENT_ROOT_DIR + "/";

  if (opts.dryRun) return;

  mkdirSync(ticketPath, { recursive: true });
  if (opts.shareTickets) {
    console.log(`[INIT] Ticket sharing enabled. Skipping .gitignore entry for ${AGENT_ROOT_DIR}/`);
    return;
  }

  let gi = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  
  // 1. Create document directories
  const docsPath = join(opts.cwd, AGENT_ROOT_DIR, "docs");
  mkdirSync(join(docsPath, "plan"), { recursive: true });
  mkdirSync(join(docsPath, "archive"), { recursive: true });

  // Also check for legacy ignore lines to clean up or at least check presence
  const legacyIgnore1 = `${LEGACY_TICKET_DIR}/`;
  const legacyIgnore2 = `${LEGACY_TICKET_DIR_PLURAL}/`;
  const legacyIgnore3 = LEGACY_IGNORE_DIR;
  const cleanedGi = removeExactGitignoreLines(gi, [legacyIgnore1, legacyIgnore2, legacyIgnore3]);
  if (cleanedGi !== gi) {
    writeFileSync(gitignorePath, cleanedGi.replace(/\n*$/, "\n"), "utf8");
    gi = cleanedGi;
    console.log("[INIT] Removed legacy deuk-agent-rule .gitignore entries");
  }

  if (!hasExactGitignoreLine(gi, ignoreLine) && !opts.shareTickets) {
    const block = "\n" + GITIGNORE_AGENT_MARKER + "\n" + ignoreLine + "\n";
    appendFileSync(gitignorePath, block, "utf8");
    console.log(`[INIT] Added ${ignoreLine} to .gitignore`);
  }
}
