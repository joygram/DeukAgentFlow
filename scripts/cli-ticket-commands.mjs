import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { basename, join } from "path";
import { toSlug, toRepoRelativePath, inferRefTitleAndTopic, resolveReferencedTicketPath } from "./cli-utils.mjs";
import { TICKET_DIR_NAME, appendTicketEntry, rebuildTicketIndexFromTopicFilesIfNeeded, detectConsumerTicketDir } from "./cli-ticket-logic.mjs";

import { createInterface } from "readline";
import { selectOne } from "./cli-prompts.mjs";

export async function runTicketCreate(opts) {
  if (!opts.topic && !opts.ref) throw new Error("ticket create requires --topic or --ref");
  
  const inferred = opts.ref ? inferRefTitleAndTopic(opts) : null;
  const topic = toSlug(opts.topic || inferred?.topic || "ticket");
  const title = opts.topic || inferred?.title || "ticket";
  const group = toSlug(opts.group || "sub");

  let path, source;
  if (opts.ref) {
    path = resolveReferencedTicketPath(opts);
    source = "ticket-reference";
  } else {
    let body = opts.content ? String(opts.content).replace(/\\n/g, '\n') : "";
    if (!body && opts.from) body = readFileSync(join(opts.cwd, opts.from), "utf8");
    const abs = join(opts.cwd, TICKET_DIR_NAME, group, `${topic}-${Date.now()}.md`);
    mkdirSync(join(opts.cwd, TICKET_DIR_NAME, group), { recursive: true });
    path = toRepoRelativePath(opts.cwd, abs);
    const marker = `\n\n<!-- Ticket (repo-relative): ${path} -->\n`;
    writeFileSync(abs, body.trimEnd() + marker, "utf8");
    source = "ticket-create";
  }

  appendTicketEntry(opts.cwd, {
    id: `ticket_${Date.now()}`,
    title, topic, group, project: opts.project || "global",
    createdAt: new Date().toISOString(), path, source
  }, opts);
}

export async function runTicketList(opts) {
  const ticketDir = detectConsumerTicketDir(opts.cwd);
  if (!ticketDir) {
    throw new Error("No ticket system found. Please run 'npx deuk-agent-rule init' first.");
  }
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, opts);
  let rows = index.entries;
  
  if (!opts.all) {
    const targetStatus = opts.status || "open";
    rows = rows.filter(e => e.status === targetStatus);
  }
  
  if (opts.group) rows = rows.filter(e => e.group === opts.group);
  if (opts.project) rows = rows.filter(e => e.project === opts.project);
  
  console.log("#  STATUS  GROUP       PROJECT     CREATED                  TITLE");
  rows.slice(0, opts.limit).forEach((e, idx) => {
    const stat = (e.status === "closed" ? "[x]" : "[ ]").padEnd(7);
    const safeTitle = String(e.title || e.topic || "").replace(/(\n|\\n)+/g, " ").slice(0, 50);
    console.log(`${String(idx+1).padEnd(2)} ${stat} ${e.group.padEnd(10)} ${e.project.padEnd(11)} ${e.createdAt.padEnd(24)} ${safeTitle}`);
  });
}

import { updateTicketEntryStatus } from "./cli-ticket-logic.mjs";

export async function runTicketClose(opts) {
  if (!opts.topic && !opts.latest) {
    if (process.stdout.isTTY) {
      const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, opts);
      const choices = index.entries
        .filter(e => e.status !== "closed")
        .map(e => ({ label: `[${e.group}] ${e.title}`, value: e.topic }));
      if (choices.length > 0) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          opts.topic = await selectOne(rl, "Choose a ticket to close:", choices);
        } finally {
          rl.close();
        }
      } else {
        throw new Error("No open tickets found to close.");
      }
    } else {
      throw new Error("ticket close requires --topic or --latest");
    }
  }
  opts.status = "closed";
  const entry = updateTicketEntryStatus(opts.cwd, opts);
  console.log(`ticket: closed -> ${entry.topic} (${entry.path})`);
}

export async function runTicketUse(opts) {
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, opts);
  
  let targetTopic = opts.topic;
  if (!targetTopic && !opts.latest) {
    if (process.stdout.isTTY) {
      const choices = index.entries
        .map(e => ({ label: `${e.status === 'closed' ? '✓ ' : ''}[${e.group}] ${e.title}`, value: e.topic }));
      if (choices.length > 0) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          targetTopic = await selectOne(rl, "Choose a ticket to use:", choices);
        } finally {
          rl.close();
        }
      }
    }
  }

  const found = opts.latest ? index.entries[0] : index.entries.find(e => e.topic.includes(targetTopic));
  if (!found) throw new Error("No matching ticket found");
  
  if (opts.pathOnly) console.log(found.path);
  else {
    console.log(`Path: ${found.path}`);
    if (opts.printContent) console.log("\n" + readFileSync(join(opts.cwd, found.path), "utf8"));
  }
}

import { getLegacyMigrationCandidate, parseLegacyTicketMeta } from "./cli-ticket-logic.mjs";
import { dirname } from "path";

export async function runTicketMigrate(opts) {
  const candidate = getLegacyMigrationCandidate(opts.cwd);
  if (!candidate) {
    console.log("ticket: no legacy LATEST.md migration candidate found");
    return;
  }

  const { title, group, project } = parseLegacyTicketMeta(candidate.body);
  const topic = toSlug(title);
  const stamp = Date.now();
  const relPath = join(TICKET_DIR_NAME, group, `${topic}-${stamp}.md`);
  const absPath = join(opts.cwd, relPath);

  if (opts.dryRun) {
    console.log("ticket: would migrate -> " + relPath);
  } else {
    mkdirSync(dirname(absPath), { recursive: true });
    const marker = `\n\n<!-- Ticket (repo-relative): ${relPath} -->\n`;
    writeFileSync(absPath, candidate.body.trimEnd() + marker, "utf8");
    console.log("ticket: migrated body -> " + relPath);

    appendTicketEntry(opts.cwd, {
      id: `ticket_migrated_${stamp}`,
      title,
      topic,
      group,
      project,
      createdAt: new Date().toISOString(),
      path: relPath,
      source: "ticket-migrate",
    }, opts);
    if (existsSync(candidate.latestPath)) {
      unlinkSync(candidate.latestPath);
      console.log("ticket: deleted legacy LATEST.md");
    }
  }
}
