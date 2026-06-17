import { existsSync, appendFileSync, writeFileSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { TICKET_DIR_NAME } from "./cli-ticket-logic.mjs";

const GITIGNORE_TICKET_MARKER = "# deuk-agent-rule: ticket directory (local, not committed by default)";

export function ensureTicketDirAndGitignore(opts) {
  const ticketPath = join(opts.cwd, TICKET_DIR_NAME);
  const gitignorePath = join(opts.cwd, ".gitignore");
  const ignoreLine = TICKET_DIR_NAME + "/";

  if (opts.dryRun) return;

  mkdirSync(ticketPath, { recursive: true });

  let gi = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  if (!gi.includes(ignoreLine)) {
    const block = "\n" + GITIGNORE_TICKET_MARKER + "\n" + ignoreLine + "\n";
    appendFileSync(gitignorePath, block, "utf8");
  }
}
