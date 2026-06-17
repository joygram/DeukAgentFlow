import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from "fs";
import { basename, dirname, join, relative } from "path";
import { toPosixPath, toRepoRelativePath, toSlug, formatTimestampForFile, makeEntryId, detectProjectFromBody, deriveTopicFromBaseName } from "./cli-utils.mjs";

export const TICKET_DIR_NAME = ".deuk-agent-ticket";
export const TICKET_INDEX_FILENAME = "INDEX.json";
export const TICKET_LIST_FILENAME = "TICKET_LIST.md";
export const TICKET_LIST_TEMPLATE_FILENAME = "TICKET_LIST.template.md";

const DEFAULT_TICKET_LIST_TEMPLATE = `# Ticket List

> Source index: \`{{SOURCE_INDEX}}\`

## Latest

{{LATEST_BLOCK}}

## Entries

| # | Title | Group | Project | Created | Path |
|---|---|---|---|---|---|
{{ENTRIES_ROWS}}

## Commands

\`\`\`bash
{{CMD_LIST}}
{{CMD_USE_LATEST}}
\`\`\`
`;

export function detectConsumerTicketDir(startDir, opts = {}) {
  let curr = startDir;
  while (curr && curr !== dirname(curr)) {
    const p = join(curr, TICKET_DIR_NAME);
    if (existsSync(p)) return p;
    curr = dirname(curr);
  }
  // If not found and creation allowed (init), return default local path.
  // Otherwise return null to indicate no ticket system found.
  return opts.createIfMissing ? join(startDir, TICKET_DIR_NAME) : null;
}

export function readTicketIndexJson(cwd) {
  const dir = detectConsumerTicketDir(cwd);
  if (!dir) return { version: 1, updatedAt: null, entries: [] };
  const p = join(dir, TICKET_INDEX_FILENAME);
  if (!existsSync(p)) return { version: 1, updatedAt: null, entries: [] };
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    const entries = Array.isArray(j.entries) ? j.entries.map(e => ({ ...e, status: e.status || "open" })) : [];
    return { version: 1, updatedAt: j.updatedAt ?? null, entries };
  } catch {
    return { version: 1, updatedAt: null, entries: [] };
  }
}

export function writeTicketIndexJson(cwd, indexJson, opts = {}) {
  const dir = detectConsumerTicketDir(cwd, { createIfMissing: true });
  const p = join(dir, TICKET_INDEX_FILENAME);
  if (opts.dryRun) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(indexJson, null, 2) + "\n", "utf8");
}

export function renderTicketListMarkdown(cwd, entries) {
  const sorted = [...entries].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const latest = sorted[0] || null;

  const ticketDir = detectConsumerTicketDir(cwd, { createIfMissing: true });
  const templatePath = join(ticketDir, TICKET_LIST_TEMPLATE_FILENAME);
  const template = existsSync(templatePath) ? readFileSync(templatePath, "utf8") : DEFAULT_TICKET_LIST_TEMPLATE;

  let latestBlock = "- No ticket entries yet.";
  if (latest) {
    const relPath = toPosixPath(relative(ticketDir, join(cwd, latest.path)));
    const safeLatestTitle = String(latest.title || "").replace(/\[|\]/g, '').replace(/\n/g, ' ');
    latestBlock = `- [${safeLatestTitle}](${relPath})\n- group: \`${latest.group}\` / project: \`${latest.project}\` / created: \`${latest.createdAt}\``;
  }

  let rows = sorted.slice(0, 30).map((e, i) => {
    const relPath = toPosixPath(relative(ticketDir, join(cwd, e.path)));
    const statusPrefix = e.status === "closed" ? "✓ " : "";
    const safeTitle = String(e.title || "").replace(/\|/g, '&#124;').replace(/(\n|\\n)+/g, ' ');
    return `| ${i + 1} | ${statusPrefix}${safeTitle} | ${e.group} | ${e.project} | ${e.createdAt} | [open](${relPath}) |`;
  }).join("\n");

  return template
    .replaceAll("{{SOURCE_INDEX}}", `${TICKET_DIR_NAME}/${TICKET_INDEX_FILENAME}`)
    .replaceAll("{{LATEST_BLOCK}}", latestBlock)
    .replaceAll("{{ENTRIES_ROWS}}", rows || "| - | No entries yet | - | - | - | - |")
    .replaceAll("{{CMD_LIST}}", "npx deuk-agent-rule ticket list")
    .replaceAll("{{CMD_USE_LATEST}}", "npx deuk-agent-rule ticket use --latest");
}

export function writeTicketListFile(cwd, entries, opts = {}) {
  const ticketDir = detectConsumerTicketDir(cwd, { createIfMissing: true });
  const p = join(ticketDir, TICKET_LIST_FILENAME);
  if (opts.dryRun) return;
  const body = renderTicketListMarkdown(cwd, entries);
  mkdirSync(ticketDir, { recursive: true });
  writeFileSync(p, body, "utf8");
}

export function appendTicketEntry(cwd, entry, opts = {}) {
  const indexJson = readTicketIndexJson(cwd);
  entry.status = entry.status || "open";
  const next = { version: 1, updatedAt: new Date().toISOString(), entries: [entry, ...indexJson.entries] };
  writeTicketIndexJson(cwd, next, opts);
  writeTicketListFile(cwd, next.entries, opts);
}

export function updateTicketEntryStatus(cwd, opts = {}) {
  const indexJson = rebuildTicketIndexFromTopicFilesIfNeeded(cwd, opts);
  let foundIndex = -1;
  const targetTopic = opts.topic ? String(opts.topic).toLowerCase() : null;
  
  if (opts.latest) {
    foundIndex = 0;
  } else if (targetTopic) {
    foundIndex = indexJson.entries.findIndex(e => String(e.topic).toLowerCase().includes(targetTopic));
  }

  if (foundIndex === -1) {
    throw new Error("No matching ticket found to update status");
  }

  const entry = indexJson.entries[foundIndex];
  entry.status = opts.status || "closed";
  entry.updatedAt = new Date().toISOString(); // optional metadata update
  
  const next = { version: indexJson.version, updatedAt: new Date().toISOString(), entries: indexJson.entries };
  writeTicketIndexJson(cwd, next, opts);
  writeTicketListFile(cwd, next.entries, opts);
  return entry;
}

export function collectTicketMarkdownFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) collectTicketMarkdownFiles(abs, out);
    else if (ent.isFile() && /\.md$/i.test(ent.name)) out.push(abs);
  }
  return out;
}

export function rebuildTicketIndexFromTopicFilesIfNeeded(cwd, opts = {}) {
  const indexJson = readTicketIndexJson(cwd);
  const root = join(cwd, TICKET_DIR_NAME);
  const files = collectTicketMarkdownFiles(root).filter(p => {
    const base = basename(p);
    return base !== "LATEST.md" && base !== TICKET_LIST_FILENAME && base !== TICKET_LIST_TEMPLATE_FILENAME;
  });

  let dirty = false;
  const existingPaths = new Set(indexJson.entries.map(e => toPosixPath(e.path)));

  for (let i = 0; i < files.length; i++) {
    const abs = files[i];
    const rel = toPosixPath(toRepoRelativePath(cwd, abs));
    if (!existingPaths.has(rel)) {
      const body = readFileSync(abs, "utf8");
      const titleMatch = body.match(/^##\s+Task:\s*(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : basename(abs).replace(/\.md$/i, "");
      indexJson.entries.push({
        id: `ticket_recovered_${Date.now()}_${i}`,
        title,
        topic: deriveTopicFromBaseName(basename(abs)),
        group: basename(dirname(abs)),
        project: detectProjectFromBody(body),
        createdAt: statSync(abs).mtime.toISOString(),
        path: rel,
        source: "ticket-recover-scan",
        status: "open",
      });
      dirty = true;
    }
  }

  const physicalPaths = new Set(files.map(abs => toPosixPath(toRepoRelativePath(cwd, abs))));
  const originalLength = indexJson.entries.length;
  indexJson.entries = indexJson.entries.filter(e => physicalPaths.has(toPosixPath(e.path)));
  
  if (indexJson.entries.length !== originalLength) {
    dirty = true;
  }

  if (dirty) {
    indexJson.entries.sort((a,b) => String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
    const next = { version: 1, updatedAt: new Date().toISOString(), entries: indexJson.entries };
    writeTicketIndexJson(cwd, next, opts);
    writeTicketListFile(cwd, next.entries, opts);
    return next;
  }

  return indexJson;
}

export function parseLegacyTicketMeta(legacyBody) {
  // Supports ## Task: ... or # Plan: ... or # Implementation Plan: ...
  const titleMatch = legacyBody.match(/^(?:##\s+Task:|#\s+Plan:|#\s+Implementation Plan:)\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "Migrated legacy plan";

  let group = "sub";
  const lower = legacyBody.toLowerCase();
  if (lower.includes("discussion")) group = "discussion";
  else if (lower.includes("main")) group = "main";

  return { title, group, project: detectProjectFromBody(legacyBody) };
}

export function getLegacyMigrationCandidate(cwd) {
  const candidateFiles = ["LATEST.md", "implementation_plan.md"];
  const candidateDirs = [cwd, join(cwd, TICKET_DIR_NAME), join(cwd, "ticket")];
  for (const dir of candidateDirs) {
    for (const file of candidateFiles) {
      const p = join(dir, file);
      if (existsSync(p)) {
        const body = readFileSync(p, "utf8");
        // Check for common plan or task markers
        if (body.length > 50 && (/^##\s+Task:/m.test(body) || /^#\s+Plan:/m.test(body) || /^#\s+Implementation Plan:/m.test(body))) {
          return { latestPath: p, body };
        }
      }
    }
  }
  return null;
}
