import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename } from "path";
import {
  DEUK_ROOT_DIR,
  computeTicketPath,
  detectConsumerTicketDir,
  normalizeTicketGroup,
  parseFrontMatter,
  stringifyFrontMatter,
  writeFileLF,
  makePath
 , CliOpts } from "./cli-utils.js";
import { appendTicketDocMetaSection, splitTicketDocMetaSection } from "./cli-ticket-docmeta.js";
import { normalizeMarkdownContent } from "./lint-md.js";

export function resolveTicketPath(cwd, relPath) {
  // #080: stale entries (old INDEX/claim/frontmatter) may still carry the legacy
  // `.deuk-agent/tickets/` prefix from in-workspace storage. The base passed here is
  // the ticket root itself post-#622, so strip the prefix instead of nesting.
  let rel = String(relPath || "");
  const legacyPrefix = `${DEUK_ROOT_DIR}/tickets/`;
  if (rel.startsWith(legacyPrefix)) rel = rel.slice(legacyPrefix.length);
  return makePath(cwd, rel);
}

export function resolveTicketEntryPath(cwd, entry) {
  return resolveTicketPath(cwd, entry?.path || "");
}

export function resolveTicketEntryOrComputedPath(cwd, entry) {
  if (entry?.path) {
    const fallbackPath = resolveTicketPath(cwd, entry.path);
    if (existsSync(fallbackPath)) {
      return fallbackPath;
    }
  }

  const computedPath = resolveTicketPath(cwd, computeTicketPath(entry));
  if (existsSync(computedPath)) {
    return computedPath;
  }

  const ticketDir = detectConsumerTicketDir(cwd);
  if (!ticketDir) {
    return computedPath;
  }

  const fileName = entry?.fileName
    ? String(entry.fileName)
    : basename(entry?.path || computeTicketPath(entry));

  if (!fileName) {
    return computedPath;
  }

  const group = normalizeTicketGroup(entry?.group || "sub");
  const archivedYearMonth = String(entry?.archiveYearMonth || "").trim();
  const archivedDay = String(entry?.archiveDay || "").trim();
  if (String(entry?.status || "").toLowerCase() === "archived" && archivedYearMonth && archivedDay) {
    const dayPath = makePath(
      ticketDir,
      "archive",
      group,
      archivedYearMonth,
      archivedDay,
      fileName
    );
    if (existsSync(dayPath)) {
      return dayPath;
    }
  }

  const candidates = readdirSync(ticketDir, { withFileTypes: true });
  const stack = [...candidates.filter(item => item.isDirectory()).map(item => makePath(ticketDir, item.name))];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!existsSync(dir)) continue;

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const item of entries) {
      if (item.isDirectory()) {
        if (item.name === ".git" || item.name === "node_modules") continue;
        stack.push(makePath(dir, item.name));
        continue;
      }
      if (item.isFile() && item.name === fileName) {
        return makePath(dir, item.name);
      }
    }
  }

  return computedPath;
}

export function readTicketDocument(cwd, entry, options: Record<string, any> = {}) {
  const shouldCompute = options.computePath || !entry?.path;
  const absPath = shouldCompute
    ? resolveTicketEntryOrComputedPath(cwd, entry)
    : resolveTicketEntryPath(cwd, entry);
  const fallbackAbsPath = shouldCompute ? absPath : resolveTicketEntryOrComputedPath(cwd, entry);
  const finalAbsPath = absPath === fallbackAbsPath ? absPath : fallbackAbsPath;

  const parse = options.parse ?? true;
  const requireExists = options.requireExists ?? true;
  const action = options.action || "ticket";

  const exists = existsSync(finalAbsPath);
  if (!exists && requireExists) {
    const target = entry?.path || "unknown";
    throw new Error(`${action}: Ticket file not found: ${target}`);
  }

  if (!exists) {
    return {
      absPath: finalAbsPath,
      exists: false,
      body: "",
      meta: {},
      content: "",
      docmeta: null,
      docmetaRaw: ""
    };
  }

  const body = readFileSync(finalAbsPath, "utf8");
  if (!parse) {
    return { absPath: finalAbsPath, exists: true, body, meta: {}, content: "", docmeta: null, docmetaRaw: "" };
  }

  const parsed = parseFrontMatter(body);
  const ticketDocMeta = splitTicketDocMetaSection(parsed.content || "");
  return {
    absPath: finalAbsPath,
    exists: true,
    body,
    ...parsed,
    content: ticketDocMeta.body,
    docmeta: ticketDocMeta.docmeta,
    docmetaRaw: ticketDocMeta.docmetaRaw
  };
}

export function renderTicketDocument({ meta = {} as Record<string, any>, content = "", docmeta = null } = {}) {
  return stringifyFrontMatter(meta, appendTicketDocMetaSection(content, docmeta));
}

export function writeTicketMarkdownFile(absPath, body) {
  writeFileLF(absPath, normalizeMarkdownContent(body));
}

export function writeTicketDocument(absPath, doc = {}) {
  writeTicketMarkdownFile(absPath, renderTicketDocument(doc));
}
