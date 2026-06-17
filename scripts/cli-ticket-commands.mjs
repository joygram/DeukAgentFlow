import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, copyFileSync, readdirSync, rmSync, statSync } from "fs";
import { basename, join, dirname, relative, resolve } from "path";
import { toSlug, toRepoRelativePath, inferRefTitleAndTopic, resolveReferencedTicketPath, toPosixPath } from "./cli-utils.mjs";
import { TICKET_DIR_NAME, appendTicketEntry, rebuildTicketIndexFromTopicFilesIfNeeded, detectConsumerTicketDir, readTicketIndexJson, writeTicketIndexJson, writeTicketListFile } from "./cli-ticket-logic.mjs";

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

export function pickTicketEntry(opts, indexJson) {
  const rows = [...indexJson.entries].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  if (rows.length === 0) return null;
  if (opts.topic) {
    const key = String(opts.topic).toLowerCase();
    return rows.find(e => String(e.topic || "").toLowerCase().includes(key)) || null;
  }
  return rows[0];
}

export async function runTicketArchive(opts) {
  if (!opts.latest && !opts.topic) {
    if (process.stdout.isTTY) {
      const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, opts);
      const choices = index.entries
        .filter(e => e.status !== "archived")
        .map(e => ({ label: `[${e.group}] ${e.title}`, value: e.topic }));
      if (choices.length > 0) {
        const { createInterface } = await import("readline");
        const { selectOne } = await import("./cli-prompts.mjs");
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          opts.topic = await selectOne(rl, "Choose a ticket to archive (this will move the file to archive/):", choices);
        } finally {
          rl.close();
        }
      } else {
        throw new Error("No active tickets found to archive.");
      }
    } else {
      throw new Error("ticket archive requires --latest or --topic <prefix>");
    }
  }
  
  const indexJson = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, opts);
  const found = pickTicketEntry(opts, indexJson);
  if (!found) throw new Error("ticket archive: no matching entry");

  const absPath = join(opts.cwd, found.path);
  if (!existsSync(absPath)) {
    throw new Error("ticket archive: file not found " + found.path);
  }

  const archiveDir = join(opts.cwd, TICKET_DIR_NAME, "archive", found.group || "sub");
  if (!opts.dryRun) mkdirSync(archiveDir, { recursive: true });
  
  const fileName = found.path.split(/[/\\]/).pop();
  const newAbsPath = join(archiveDir, fileName);
  const bodyLines = readFileSync(absPath, "utf8").trimEnd().split(/\r?\n/);
  
  if (opts.report) {
    const reportSrc = resolve(opts.cwd, opts.report);
    if (!existsSync(reportSrc)) {
      throw new Error("ticket archive: report file not found " + opts.report);
    }
    const reportDir = join(opts.cwd, TICKET_DIR_NAME, "reports");
    if (!opts.dryRun) mkdirSync(reportDir, { recursive: true });
    
    const reportDest = join(reportDir, `REPORT-${fileName}`);
    if (!opts.dryRun) copyFileSync(reportSrc, reportDest);
    console.log("ticket archive: copied report to " + toRepoRelativePath(opts.cwd, reportDest));
    
    bodyLines.push("");
    bodyLines.push("## 📄 Attached Report");
    const relativeLink = toPosixPath(relative(dirname(newAbsPath), reportDest));
    bodyLines.push(`- [View Report](${relativeLink})`);
  }

  if (opts.dryRun) {
    console.log("ticket archive: would move " + toRepoRelativePath(opts.cwd, absPath) + " to " + toRepoRelativePath(opts.cwd, newAbsPath));
    return;
  }

  writeFileSync(newAbsPath, bodyLines.join("\n") + "\n", "utf8");
  rmSync(absPath);
  console.log("ticket archive: moved ticket to " + toRepoRelativePath(opts.cwd, newAbsPath));

  const entryIdx = indexJson.entries.findIndex(e => e.id === found.id);
  if (entryIdx >= 0) {
    indexJson.entries[entryIdx].status = "archived";
    indexJson.entries[entryIdx].path = toRepoRelativePath(opts.cwd, newAbsPath);
    indexJson.entries[entryIdx].updatedAt = new Date().toISOString();
  }

  writeTicketIndexJson(opts.cwd, indexJson, opts);
  writeTicketListFile(opts.cwd, indexJson.entries, opts);
}

export async function runTicketReports(opts) {
  const reportDir = join(opts.cwd, TICKET_DIR_NAME, "reports");
  console.log("\n📄 Agent Reports:");
  if (!existsSync(reportDir)) {
    console.log("  No reports found.");
    return;
  }
  const files = readdirSync(reportDir).filter(f => f.startsWith("REPORT-") && f.endsWith(".md"));
  if (files.length === 0) {
    console.log("  No reports found.");
    return;
  }
  
  const sorted = files.sort((a, b) => {
    return statSync(join(reportDir, b)).mtime.getTime() - statSync(join(reportDir, a)).mtime.getTime();
  });
  
  sorted.slice(0, opts.limit || 30).forEach(f => {
    console.log(`  - [${f}]`);
  });
  console.log("");
}
