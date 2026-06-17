import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, copyFileSync, readdirSync, rmSync, statSync } from "fs";
import { hostname } from "os";
import { basename, join, dirname, relative, resolve } from "path";
import { 
  toSlug, toRepoRelativePath, inferRefTitleAndTopic, resolveReferencedTicketPath, toPosixPath, stringifyFrontMatter,
  AGENT_ROOT_DIR, TICKET_SUBDIR, TEMPLATE_SUBDIR, TICKET_DIR_NAME
} from "./cli-utils.mjs";
import { 
  appendTicketEntry, rebuildTicketIndexFromTopicFilesIfNeeded, detectConsumerTicketDir, 
  readTicketIndexJson, writeTicketIndexJson, writeTicketListFile, syncActiveTicketId, 
  generateTicketId, syncToPipeline, updateTicketEntryStatus 
} from "./cli-ticket-logic.mjs";
import { loadInitConfig } from "./cli-utils.mjs";
import ejs from "ejs";

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
    let tplText = "";
    const consumerTplPath = join(opts.cwd, AGENT_ROOT_DIR, TEMPLATE_SUBDIR, "TICKET_TEMPLATE.md");
    const legacyTplPath = join(opts.cwd, ".deuk-agent-templates", "TICKET_TEMPLATE.md");
    const bundleTplPath = join(new URL('.', import.meta.url).pathname, "..", "bundle", "templates", "TICKET_TEMPLATE.md");
    
    if (existsSync(consumerTplPath)) tplText = readFileSync(consumerTplPath, "utf8");
    else if (existsSync(legacyTplPath)) tplText = readFileSync(legacyTplPath, "utf8");
    else if (existsSync(bundleTplPath)) tplText = readFileSync(bundleTplPath, "utf8");
    else throw new Error("ticket create: Template not found. Please run 'npx deuk-agent-rule init' to deploy templates.");

    let planTplText = "";
    const consumerPlanTplPath = join(opts.cwd, AGENT_ROOT_DIR, TEMPLATE_SUBDIR, "PLAN_TEMPLATE.md");
    const bundlePlanTplPath = join(new URL('.', import.meta.url).pathname, "..", "bundle", "templates", "PLAN_TEMPLATE.md");
    if (existsSync(consumerPlanTplPath)) planTplText = readFileSync(consumerPlanTplPath, "utf8");
    else if (existsSync(bundlePlanTplPath)) planTplText = readFileSync(bundlePlanTplPath, "utf8");

    // Find nearest or create in CWD if missing
    const ticketDir = detectConsumerTicketDir(opts.cwd, { createIfMissing: true });
    
    const indexJson = readTicketIndexJson(opts.cwd);
    const ticketId = generateTicketId(topic, indexJson.entries);
    const finalFileName = `${ticketId}.md`;

    const abs = join(ticketDir, group, finalFileName);
    mkdirSync(join(ticketDir, group), { recursive: true });
    path = toRepoRelativePath(opts.cwd, abs);

    // Auto-Scaffold Plan Document
    const plansDir = join(opts.cwd, AGENT_ROOT_DIR, "docs", "plans");
    const planFileName = `${ticketId}-plan.md`;
    const planAbs = join(plansDir, planFileName);
    const planLink = `[${planFileName}](file://${planAbs})`;
    
    const meta = {
      id: ticketId,
      title,
      topic,
      status: "open",
      submodule: opts.submodule || "",
      project: opts.project || "global",
      planLink: planLink,
      createdAt: new Date().toISOString(),
    };

    const ejsFrontMatter = `---
id: <%= meta.id %>
title: "<%- meta.title.replace(/"/g, '\\"') %>"
topic: <%= meta.topic %>
status: open
submodule: <%= meta.submodule %>
project: <%= meta.project %>
createdAt: <%= meta.createdAt %>
---

`;
    const finalContent = ejs.render(ejsFrontMatter + tplText, { meta });
    writeFileSync(abs, finalContent, "utf8");
    source = "ticket-create";
    
    // Write Plan Document
    if (planTplText) {
      mkdirSync(plansDir, { recursive: true });
      const planContent = ejs.render(planTplText, { meta });
      writeFileSync(planAbs, planContent, "utf8");
      console.log(`Plan scaffolded: ${toRepoRelativePath(opts.cwd, planAbs)}`);
    }
    
    // Remote Sync Hook
    const config = loadInitConfig(opts.cwd);
    if (config && config.remoteSync && config.pipelineUrl) {
      syncToPipeline(config.pipelineUrl, { action: "create", ticket: meta });
    }

    appendTicketEntry(opts.cwd, {
      id: ticketId,
      title, topic, group, project: opts.project || "global",
      createdAt: new Date().toISOString(), path, source
    }, opts);
  }

  syncActiveTicketId(opts.cwd);
}

export async function runTicketList(opts) {
  const ticketDir = detectConsumerTicketDir(opts.cwd);
  if (!ticketDir) {
    throw new Error("No ticket system found. Please run 'npx deuk-agent-rule init' first.");
  }
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, opts);
  syncActiveTicketId(opts.cwd);
  let rows = index.entries;

  
  if (opts.active) {
    rows = rows.filter(e => e.status === "active" || e.status === "open");
  } else if (opts.archived) {
    rows = rows.filter(e => e.status === "archived");
  } else if (!opts.all) {
    // Default: major/active list (open or active)
    rows = rows.filter(e => e.status === "open" || e.status === "active");
  }
  
  if (opts.group) rows = rows.filter(e => e.group === opts.group);
  if (opts.project) rows = rows.filter(e => e.project === opts.project);
  if (opts.submodule) rows = rows.filter(e => e.submodule === opts.submodule);
  
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log("#  STATUS   SUBMODULE   GROUP       PROJECT     CREATED                  TITLE");
  rows.slice(0, opts.limit).forEach((e, idx) => {
    const stat = (e.status === "closed" ? "[x]" : "[ ]").padEnd(7);
    const sub = (e.submodule || "-").padEnd(11);
    const safeTitle = String(e.title || e.topic || "").replace(/(\n|\\n)+/g, " ").slice(0, 50);
    console.log(`${String(idx+1).padEnd(2)} ${stat} ${sub} ${String(e.group||"").padEnd(10)} ${String(e.project||"").padEnd(11)} ${String(e.createdAt||"").padEnd(24)} ${safeTitle}`);
  });
}

export async function runTicketMeta(opts) {
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, opts);
  const found = pickTicketEntry(opts, index);
  if (!found) throw new Error("ticket meta: no matching ticket found");

  if (opts.json) {
    console.log(JSON.stringify(found, null, 2));
  } else {
    console.log(`Ticket Meta [${found.topic}]`);
    Object.entries(found).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  }
}

export async function runTicketConnect(opts) {
  const config = loadInitConfig(opts.cwd);
  const url = opts.remote || config?.pipelineUrl;
  if (!url) throw new Error("ticket connect: no pipeline URL configured or provided via --remote");

  console.log(`Connecting to AI Pipeline at ${url} ...`);
  const success = await syncToPipeline(url, { action: "ping", timestamp: new Date().toISOString() });
  if (success) {
    console.log("SUCCESS: Pipeline is reachable.");
  } else {
    console.error("FAILED: Could not connect to pipeline or returned non-OK status.");
  }
}


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
  syncActiveTicketId(opts.cwd);
  console.log(`ticket: closed -> ${entry.topic} (${entry.path})`);
}

export async function runTicketUse(opts) {
  const index = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, opts);
  syncActiveTicketId(opts.cwd);
  
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
  const indexJson = rebuildTicketIndexFromTopicFilesIfNeeded(opts.cwd, opts);
  const ticketDir = detectConsumerTicketDir(opts.cwd);

  if (!opts.latest && !opts.topic) {
    if (process.stdout.isTTY) {
      const choices = indexJson.entries
        .filter(e => e.status !== "archived")
        .map(e => ({ label: `[${e.group}] ${e.title}`, value: e.topic }));
      if (choices.length > 0) {
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
  
  const found = pickTicketEntry(opts, indexJson);
  if (!found) throw new Error("ticket archive: no matching entry");

  const absPath = join(opts.cwd, found.path);
  if (!existsSync(absPath)) {
    throw new Error("ticket archive: file not found " + found.path);
  }

  const archiveDir = join(ticketDir, "archive", found.group || "sub");
  if (!opts.dryRun) mkdirSync(archiveDir, { recursive: true });
  
  const fileName = found.path.split(/[/\\]/).pop();
  const newAbsPath = join(archiveDir, fileName);
  const bodyLines = readFileSync(absPath, "utf8").trimEnd().split(/\r?\n/);
  
  if (opts.report) {
    const reportSrc = resolve(opts.cwd, opts.report);
    if (!existsSync(reportSrc)) {
      throw new Error("ticket archive: report file not found " + opts.report);
    }
    const reportDir = join(ticketDir, "reports");
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
  if (opts.render) writeTicketListFile(opts.cwd, indexJson.entries, opts);
  syncActiveTicketId(opts.cwd);
}

export async function runTicketReports(opts) {
  const ticketDir = detectConsumerTicketDir(opts.cwd);
  if (!ticketDir) throw new Error("No ticket system found.");
  const reportDir = join(ticketDir, "reports");
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
