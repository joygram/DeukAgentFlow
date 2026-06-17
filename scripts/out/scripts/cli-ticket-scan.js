// Read-only ticket scanning: derive ticket entries from the .md files that are
// the single source of truth. This module performs NO writes and depends only on
// cli-utils + ticket-workflow, so it can be imported by both cli-ticket-index.mjs
// and cli-ticket-parser.mjs without creating an import cycle.
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { basename, dirname } from "path";
import { DEUK_ROOT_DIR, TICKET_LIST_FILENAME, toPosixPath, toRepoRelativePath, detectProjectFromBody, normalizeTicketGroup, parseFrontMatter, detectConsumerTicketDir, ARCHIVE_YEAR_MONTH_RE, ARCHIVE_DAY_RE, makePath } from "./cli-utils.js";
import { inferTicketWorkflowStatus } from "./ticket-workflow.js";
export function collectTicketMarkdownFiles(dir, out = []) {
    if (!existsSync(dir))
        return out;
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const abs = makePath(dir, ent.name);
        if (ent.name === "node_modules" || ent.name === ".git")
            continue;
        if (ent.isDirectory())
            collectTicketMarkdownFiles(abs, out);
        else if (ent.isFile() && /\.md$/i.test(ent.name)) {
            const base = ent.name;
            if (base === "LATEST.md" || base === TICKET_LIST_FILENAME || base === "ACTIVE_TICKET.md" || base === "project-memory.md" || base === "PROJECT_RULE.md")
                continue;
            out.push(abs);
        }
    }
    return out;
}
function parseTicketStorage(rel, isArchived, abs) {
    if (!isArchived) {
        return { group: basename(dirname(abs)) };
    }
    const parts = rel.split("/");
    const archiveIdx = parts.indexOf("archive");
    const group = parts[archiveIdx + 1] || basename(dirname(abs));
    const maybeYearMonth = parts[archiveIdx + 2];
    const maybeDay = parts[archiveIdx + 3];
    if (ARCHIVE_YEAR_MONTH_RE.test(String(maybeYearMonth || "")) && ARCHIVE_DAY_RE.test(String(maybeDay || ""))) {
        return { group: normalizeTicketGroup(group), archiveYearMonth: maybeYearMonth, archiveDay: maybeDay };
    }
    if (ARCHIVE_YEAR_MONTH_RE.test(String(maybeYearMonth || ""))) {
        return { group: normalizeTicketGroup(group), archiveYearMonth: maybeYearMonth };
    }
    return { group: normalizeTicketGroup(group) };
}
// Build a single ticket entry from its .md file. Read-only: always parses the
// file (no mtime-cache reuse) — the active ticket count is bounded (MAX_OPEN_TICKETS),
// so a full parse of the live set is negligible.
export function buildTicketEntry(abs, cwd) {
    const rel = toPosixPath(toRepoRelativePath(cwd, abs));
    const filename = basename(abs);
    const idFromFilename = filename.replace(/\.md$/i, "");
    const isAlreadyInArchive = rel.includes("/archive/");
    const storage = parseTicketStorage(rel, isAlreadyInArchive, abs);
    const group = storage.group;
    const mtimeIso = statSync(abs).mtime.toISOString();
    let meta = {}, content = "";
    try {
        const body = readFileSync(abs, "utf8");
        const parsed = parseFrontMatter(body);
        meta = parsed.meta;
        content = parsed.content;
    }
    catch (err) {
        console.warn(`[WARNING] Failed to parse ${rel}: ${err.message}`);
    }
    const title = meta.title || idFromFilename;
    const project = meta.project || detectProjectFromBody(content);
    const phase = Number(meta.phase || 1);
    const status = inferTicketWorkflowStatus(meta, isAlreadyInArchive);
    return {
        id: meta.id || idFromFilename,
        title,
        group,
        fileName: filename,
        project,
        mainTicket: meta.mainTicket,
        submodule: meta.submodule || (rel.startsWith(DEUK_ROOT_DIR) ? "" : rel.split("/")[0]),
        createdAt: meta.createdAt || mtimeIso,
        updatedAt: mtimeIso,
        source: "ticket-sync",
        phase,
        status,
        archiveYearMonth: storage.archiveYearMonth,
    };
}
// Derive the full ticket entry list from .md files under the official ticket dir.
export function collectTicketEntriesFromTopicFiles(cwd) {
    const ticketDir = detectConsumerTicketDir(cwd);
    if (!ticketDir)
        return [];
    const files = collectTicketMarkdownFiles(ticketDir);
    return files.map(abs => buildTicketEntry(abs, cwd));
}
//# sourceMappingURL=cli-ticket-scan.js.map