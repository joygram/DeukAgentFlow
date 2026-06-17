import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getImplementationClaimGuardResult, pickTicketEntry, runTicketArchive, runTicketCreate, runTicketClose, runTicketMove, runTicketNext, runTicketStatus, runTicketUse, runTicketHandoff, runTicketEvidenceCheck, runTicketEvidenceReport } from "../cli-ticket-commands.mjs";
import { readTicketIndexJson } from "../cli-ticket-index.mjs";
import { lintMarkdownPaths } from "../lint-md.mjs";
import { TICKET_INDEX_FILENAME } from "../cli-utils.mjs";

function makeIndex(entries) {
  return { version: 1, updatedAt: "2026-05-01T00:00:00.000Z", entries };
}

function makeArchiveIndex(entries) {
  return { version: 1, updatedAt: "2026-05-01T00:00:00.000Z", activeTicketId: null, entries };
}

function makeEntry(overrides) {
  return {
    id: "001-default-host",
    title: "default",
    topic: "001-default-host",
    group: "sub",
    fileName: "001-default-host.md",
    project: "global",
    submodule: "",
    createdAt: "2026-05-01 00:00:00",
    status: "open",
    ...overrides
  };
}

function minimalEvidencePhase1Plan(title = "dry-run validation ticket") {
  return [
    `# ${title}`,
    "",
    "## Agent Permission Contract (APC)",
    "### [BOUNDARY]",
    "- Change only ticket-create dry-run validation behavior.",
    "### [CONTRACT]",
    "- Dry-run must fail on the same lifecycle blockers as real creation.",
    "### [PATCH PLAN]",
    "- Validate generated content in memory and simulate the open-ticket count.",
    "",
    "## Compact Plan",
    "- Finding: `runTicketCreate` dry-run can report success before real creation fails.",
    "- Direction: reuse strict validation on in-memory content and check open-limit before success output.",
    "- Verification: `node --test --test-name-pattern='dry-run' scripts/tests/cli-ticket-commands.test.mjs`.",
    "",
    "## Problem Analysis",
    "- The preview path skipped blockers that the real create path enforces.",
    "",
    "## Source Observations",
    "- `scripts/cli-ticket-commands.mjs` owns `runTicketCreate` and open-limit handling.",
    "",
    "## Cause Hypotheses",
    "- Dry-run avoided file writes but also skipped the validation that depended on written files.",
    "",
    "## Improvement Direction",
    "- Keep validation content-based so dry-run can check quality without writing files.",
    "",
    "## Audit Evidence",
    "- `node --test scripts/tests/cli-ticket-commands.test.mjs` covers ticket create dry-run behavior."
  ].join("\n");
}

function makeTicketWorkspace(entries) {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-ticket-next-"));
  const ticketDir = join(cwd, ".deuk-agent", "tickets");
  mkdirSync(ticketDir, { recursive: true });
  writeFileSync(join(ticketDir, TICKET_INDEX_FILENAME), JSON.stringify(makeIndex(entries), null, 2) + "\n", "utf8");
  return { cwd, ticketDir };
}

function makeTicketWorkspaceAt(parent, name, entries) {
  const cwd = join(parent, name);
  const ticketDir = join(cwd, ".deuk-agent", "tickets");
  mkdirSync(ticketDir, { recursive: true });
  writeFileSync(join(ticketDir, TICKET_INDEX_FILENAME), JSON.stringify(makeIndex(entries), null, 2) + "\n", "utf8");
  return { cwd, ticketDir };
}

function writeArchiveShard(ticketDir, yearMonth, entries) {
  writeFileSync(
    join(ticketDir, `INDEX.archive.${yearMonth}.json`),
    JSON.stringify(makeArchiveIndex(entries), null, 2) + "\n",
    "utf8"
  );
}

function makeTemplateWorkspace(options = {}) {
  const { withKoTemplate = false, baseMarker = "locale: base" } = options;
  const { cwd, ticketDir } = makeTicketWorkspace([]);
  const templateDir = join(cwd, ".deuk-agent", "templates");
  mkdirSync(templateDir, { recursive: true });

  const baseTemplate = [
    "---",
    "<%- frontmatter %>",
    "---",
    "# <%= meta.title %>",
    `TemplateLocale: ${baseMarker}`,
    ""
  ].join("\n");

  writeFileSync(join(templateDir, "TICKET_TEMPLATE.md"), baseTemplate, "utf8");

  if (withKoTemplate) {
    const koTemplate = [
      "---",
      "<%- frontmatter %>",
      "---",
      "# <%= meta.title %>",
      "TemplateLocale: ko",
      ""
    ].join("\n");
    writeFileSync(join(templateDir, "TICKET_TEMPLATE.ko.md"), koTemplate, "utf8");
  }

  return { cwd, ticketDir };
}

function readNewestTicketMarkdown(ticketDir) {
  const subDir = join(ticketDir, "sub");
  if (!existsSync(subDir)) return null;

  const candidates = readdirSync(subDir).filter(name => name.endsWith(".md"));
  if (candidates.length === 0) return null;
  return join(subDir, candidates.at(-1));
}

test("pickTicketEntry applies submodule and project filters before selecting latest", () => {
  const index = makeIndex([
    makeEntry({
      id: "001-global-host",
      title: "newer global",
      topic: "001-global-host",
      createdAt: "2026-05-01 10:00:00"
    }),
    makeEntry({
      id: "002-deukpack-host",
      title: "older DeukPack",
      topic: "002-deukpack-host",
      project: "DeukAgentRules",
      submodule: "DeukPack",
      createdAt: "2026-05-01 09:00:00"
    })
  ]);

  assert.strictEqual(pickTicketEntry({}, index).id, "001-global-host");
  assert.strictEqual(pickTicketEntry({ submodule: "DeukPack" }, index).id, "002-deukpack-host");
  assert.strictEqual(pickTicketEntry({ project: "DeukAgentRules", submodule: "DeukPack" }, index).id, "002-deukpack-host");
  assert.strictEqual(pickTicketEntry({ project: "Other", submodule: "DeukPack" }, index), null);
});

test("pickTicketEntry applies filters before topic matching", () => {
  const index = makeIndex([
    makeEntry({
      id: "001-deukpack-global-host",
      topic: "001-deukpack-global-host",
      title: "matching topic outside submodule",
      createdAt: "2026-05-01 10:00:00"
    }),
    makeEntry({
      id: "002-deukpack-scoped-host",
      topic: "002-deukpack-scoped-host",
      title: "matching topic inside submodule",
      submodule: "DeukPack",
      createdAt: "2026-05-01 09:00:00"
    })
  ]);

  assert.strictEqual(
    pickTicketEntry({ topic: "deukpack", submodule: "DeukPack" }, index).id,
    "002-deukpack-scoped-host"
  );
});

test("runTicketNext selects first active/open ticket within submodule filter", async () => {
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "001-global-active-host",
      topic: "001-global-active-host",
      fileName: "001-global-active-host.md",
      status: "active",
      createdAt: "2026-05-01 08:00:00"
    }),
    makeEntry({
      id: "002-deukpack-open-host",
      topic: "002-deukpack-open-host",
      fileName: "002-deukpack-open-host.md",
      submodule: "DeukPack",
      status: "open",
      createdAt: "2026-05-01 07:00:00"
    })
  ]);

  const originalLog = console.log;
  const lines = [];
  console.log = value => lines.push(String(value));
  try {
    await runTicketNext({ cwd, submodule: "DeukPack", pathOnly: true });
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }

  assert.deepStrictEqual(lines, [join(ticketDir, "sub", "002-deukpack-open-host.md")]);
});

test("runTicketNext preserves unfiltered active-first behavior", async () => {
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "001-global-active-host",
      topic: "001-global-active-host",
      fileName: "001-global-active-host.md",
      status: "active",
      createdAt: "2026-05-01 08:00:00"
    }),
    makeEntry({
      id: "002-deukpack-open-host",
      topic: "002-deukpack-open-host",
      fileName: "002-deukpack-open-host.md",
      submodule: "DeukPack",
      status: "open",
      createdAt: "2026-05-01 07:00:00"
    })
  ]);

  const originalLog = console.log;
  const lines = [];
  console.log = value => lines.push(String(value));
  try {
    await runTicketNext({ cwd, pathOnly: true });
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }

  assert.deepStrictEqual(lines, [join(ticketDir, "sub", "001-global-active-host.md")]);
});

test("runTicketNext tells agents to inspect git history when no ticket exists", async () => {
  const { cwd } = makeTicketWorkspace([]);

  await assert.rejects(
    () => runTicketNext({ cwd, pathOnly: true }),
    /Inspect recent git history before creating a follow-up ticket/
  );

  rmSync(cwd, { recursive: true, force: true });
});

test("runTicketUse no-match error shows latest closed ticket and open tickets", async () => {
  const { cwd } = makeTicketWorkspace([
    makeEntry({
      id: "001-old-closed-host",
      title: "old closed ticket",
      topic: "001-old-closed-host",
      createdAt: "2026-04-01 00:00:00",
      updatedAt: "2026-04-01T00:00:00.000Z",
      status: "closed"
    }),
    makeEntry({
      id: "002-latest-closed-host",
      title: "latest closed ticket",
      topic: "002-latest-closed-host",
      createdAt: "2026-04-02 00:00:00",
      updatedAt: "2026-04-03T00:00:00.000Z",
      status: "closed"
    }),
    makeEntry({
      id: "003-open-host",
      title: "open ticket",
      topic: "003-open-host",
      createdAt: "2026-04-04 00:00:00",
      status: "open"
    }),
    makeEntry({
      id: "004-active-host",
      title: "active ticket",
      topic: "004-active-host",
      createdAt: "2026-04-05 00:00:00",
      status: "active"
    }),
    makeEntry({
      id: "005-archived-host",
      title: "archived ticket",
      topic: "005-archived-host",
      createdAt: "2026-04-06 00:00:00",
      status: "archived"
    })
  ]);

  try {
    await assert.rejects(
      () => runTicketUse({ cwd, topic: "missing-alias", nonInteractive: true }),
      err => {
        assert.match(err.message, /No matching ticket found for "missing-alias"/);
        assert.match(err.message, /Last closed ticket and open tickets/);
        assert.match(err.message, /002-latest-closed-host/);
        assert.doesNotMatch(err.message, /001-old-closed-host/);
        assert.match(err.message, /003-open-host/);
        assert.match(err.message, /004-active-host/);
        assert.doesNotMatch(err.message, /005-archived-host/);
        assert.match(err.message, /ticket use --topic <ticket-id> --non-interactive/);
        return true;
      }
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketArchive updates index path to archived ticket location", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/001-default-host.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      path: ticketPath,
      status: "closed"
    })
  ]);
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 001-default-host",
    "title: default",
    "phase: 4",
    "status: closed",
    "summary: default",
    "priority: P2",
    "tags: [test]",
    "---",
    "# default",
    ""
  ].join("\n"), "utf8");

  const originalLog = console.log;
  const lines = [];
  let result;
  console.log = value => lines.push(String(value));
  try {
    result = await runTicketArchive({ cwd, topic: "001", nonInteractive: true });
  } finally {
    console.log = originalLog;
  }

  const archivedPath = ".deuk-agent/tickets/archive/sub/2026-05/01/001-default-host.md";
  const index = readTicketIndexJson(cwd);
  const archiveIndexPath = join(ticketDir, "INDEX.archive.2026-05.json");
  const archiveIndex = JSON.parse(readFileSync(archiveIndexPath, "utf8"));
  assert.ok(existsSync(join(cwd, archivedPath)), "archived ticket file should exist");
  assert.strictEqual(index.entries.find(e => e.id === "001-default-host").status, "archived");
  assert.strictEqual(index.entries.find(e => e.id === "001-default-host").archiveYearMonth, "2026-05");
  assert.strictEqual(index.entries.find(e => e.id === "001-default-host").archiveDay, "01");
  assert.strictEqual(JSON.parse(readFileSync(join(ticketDir, TICKET_INDEX_FILENAME), "utf8")).entries.length, 0);
  assert.ok(!existsSync(join(ticketDir, "INDEX.archive.json")), "legacy archive index should be removed");
  assert.strictEqual(archiveIndex.entries.find(e => e.id === "001-default-host").status, "archived");
  assert.strictEqual(result.path, archivedPath);

  rmSync(cwd, { recursive: true, force: true });
});

test("runTicketArchive splits active and archive index storage", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/010-split-host.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "010-split-host",
      title: "split-index",
      topic: "010-split-host",
      fileName: "010-split-host.md",
      path: ticketPath,
      status: "closed"
    }),
    makeEntry({
      id: "011-open-host",
      title: "open-stays-active",
      topic: "011-open-host",
      fileName: "011-open-host.md",
      path: ".deuk-agent/tickets/sub/011-open-host.md",
      status: "open"
    })
  ]);
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 010-split-host",
    "title: split-index",
    "phase: 4",
    "status: closed",
    "summary: split index test",
    "priority: P2",
    "tags: [test]",
    "---",
    "# split-index",
    ""
  ].join("\n"), "utf8");
  writeFileSync(join(cwd, ".deuk-agent/tickets/sub/011-open-host.md"), [
    "---",
    "id: 011-open-host",
    "title: open-stays-active",
    "phase: 1",
    "status: open",
    "summary: open ticket",
    "priority: P2",
    "tags: [test]",
    "---",
    "# open-stays-active",
    ""
  ].join("\n"), "utf8");

  await runTicketArchive({ cwd, topic: "010", nonInteractive: true });

  const mainIndex = JSON.parse(readFileSync(join(ticketDir, TICKET_INDEX_FILENAME), "utf8"));
  const archiveIndexPath = join(ticketDir, "INDEX.archive.2026-05.json");
  assert.ok(existsSync(archiveIndexPath), "archive shard should be written");
  const archiveIndex = JSON.parse(readFileSync(archiveIndexPath, "utf8"));

  assert.ok(mainIndex.entries.every(e => e.status === "open" || e.status === "active"), "main index should only keep active/open entries");
  assert.ok(archiveIndex.entries.some(e => e.id === "010-split-host"), "archive index should keep archived entries");
  assert.ok(archiveIndex.entries.every(e => e.status !== "open" && e.status !== "active"), "archive index should not keep active/open entries");
  assert.ok(!existsSync(join(ticketDir, "INDEX.archive.json")), "legacy archive index should not remain");

  rmSync(cwd, { recursive: true, force: true });
});

test("runTicketArchive garbage collects archive shards outside retention", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/020-gc-host.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "020-gc-host",
      title: "gc-target",
      topic: "020-gc-host",
      fileName: "020-gc-host.md",
      path: ticketPath,
      status: "closed",
      createdAt: "2026-05-01 00:00:00"
    }),
    makeEntry({
      id: "021-open-host",
      title: "kept-open",
      topic: "021-open-host",
      fileName: "021-open-host.md",
      path: ".deuk-agent/tickets/sub/021-open-host.md",
      status: "open"
    })
  ]);
  writeArchiveShard(ticketDir, "2025-01", [
    {
      id: "999-old-host",
      title: "old-archive",
      topic: "999-old-host",
      group: "sub",
      fileName: "999-old-host.md",
      project: "global",
      submodule: "",
      createdAt: "2025-01-01 00:00:00",
      status: "archived",
      archiveYearMonth: "2025-01",
      archiveDay: "01"
    }
  ]);

  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 020-gc-host",
    "title: gc-target",
    "phase: 4",
    "status: closed",
    "summary: gc target",
    "priority: P2",
    "tags: [test]",
    "---",
    "# gc-target",
    ""
  ].join("\n"), "utf8");
  writeFileSync(join(cwd, ".deuk-agent/tickets/sub/021-open-host.md"), [
    "---",
    "id: 021-open-host",
    "title: kept-open",
    "phase: 1",
    "status: open",
    "summary: open ticket",
    "priority: P2",
    "tags: [test]",
    "---",
    "# kept-open",
    ""
  ].join("\n"), "utf8");

  await runTicketArchive({ cwd, topic: "020", nonInteractive: true });

  const index = readTicketIndexJson(cwd);
  assert.ok(!index.entries.some(e => e.id === "999-old-host"), "retired archive shard should fall out of the merged index");
  assert.ok(existsSync(join(ticketDir, "INDEX.archive.2026-05.json")), "current archive shard should exist");
  assert.ok(!existsSync(join(ticketDir, "INDEX.archive.2025-01.json")), "retired archive shard should be removed");

  rmSync(cwd, { recursive: true, force: true });
});

test("runTicketArchive updates activeTicketId when archiving active ticket", async () => {
  const activePath = ".deuk-agent/tickets/sub/001-default-host.md";
  const openPath = ".deuk-agent/tickets/sub/002-waiting-host.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "001-default-host",
      title: "active-ticket",
      topic: "001-default-host",
      fileName: "001-default-host.md",
      path: activePath,
      status: "active",
      phase: 4
    }),
    makeEntry({
      id: "002-waiting-host",
      title: "next-ticket",
      topic: "002-waiting-host",
      fileName: "002-waiting-host.md",
      path: openPath,
      status: "open"
    })
  ]);

  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });
  [activePath, openPath].forEach(ticketPath => {
    writeFileSync(join(cwd, ticketPath), [
      "---",
      `id: ${ticketPath === activePath ? "001-default-host" : "002-waiting-host"}`,
      `title: ${ticketPath === activePath ? "active-ticket" : "next-ticket"}`,
      "phase: 4",
      "status: open",
      "summary: status transition test",
      "priority: P2",
      "tags: [test]",
      "---",
      "# default",
      ""
    ].join("\n"), "utf8");
  });

  await runTicketArchive({ cwd, topic: "001", nonInteractive: true });

  const index = readTicketIndexJson(cwd);
  const archivedIndex = JSON.parse(readFileSync(join(ticketDir, "INDEX.archive.2026-05.json"), "utf8"));
  assert.strictEqual(index.activeTicketId, "002-waiting-host");
  const archivedEntry = index.entries.find(e => e.id === "001-default-host");
  const openEntry = index.entries.find(e => e.id === "002-waiting-host");
  assert.strictEqual(archivedEntry.status, "archived");
  assert.strictEqual(openEntry.status, "open");
  assert.strictEqual(JSON.parse(readFileSync(join(ticketDir, TICKET_INDEX_FILENAME), "utf8")).entries.length, 1);
  assert.strictEqual(archivedIndex.entries.find(e => e.id === "001-default-host").status, "archived");

  rmSync(cwd, { recursive: true, force: true });
});

test("runTicketArchive auto-detects existing walkthrough report and attaches link", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/003-default-host.md";
  const reportPath = ".deuk-agent/docs/plan/003-default-host-report.md";
  const { cwd } = makeTicketWorkspace([
    makeEntry({
      id: "003-default-host",
      title: "with-report",
      topic: "003-default-host",
      fileName: "003-default-host.md",
      path: ticketPath,
      status: "open"
    })
  ]);

  const srcDir = join(cwd, ".deuk-agent", "tickets", "sub");
  const reportDir = join(cwd, ".deuk-agent", "docs", "plan");
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(reportDir, { recursive: true });

  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 003-default-host",
    "title: with-report",
    "phase: 4",
    "status: open",
    "summary: report attach test",
    "priority: P2",
    "tags: [test]",
    "---",
    "# default",
    ""
  ].join("\n"), "utf8");

  writeFileSync(join(cwd, reportPath), [
    "---",
    "summary: walkthrough report",
    "status: draft",
    "priority: P2",
    "tags: [report]",
    "---",
    "# walkthrough",
    "## Summary",
    "- report attach test",
    "## Verification",
    "- archive detects the report",
    "## Verification Outcome",
    "- passed",
    ""
  ].join("\n"), "utf8");

  const originalLog = console.log;
  const lines = [];
  console.log = value => lines.push(String(value));

  let archived;
  try {
    archived = await runTicketArchive({ cwd, topic: "003", nonInteractive: true });
  } finally {
    console.log = originalLog;
  }

  const archivedContent = readFileSync(join(cwd, archived.path), "utf8");
  assert.ok(lines.includes("ticket archive: auto-detected report at .deuk-agent/docs/plan/003-default-host-report.md"));
  assert.ok(archivedContent.includes("## 📄 Attached Report"));
  assert.ok(archivedContent.includes("View Report"));

  rmSync(cwd, { recursive: true, force: true });
});

test("runTicketArchive distills ticket body into knowledge json", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/006-default-host.md";
  const { cwd } = makeTicketWorkspace([
    makeEntry({
      id: "006-default-host",
      title: "knowledge-rich",
      topic: "006-default-host",
      fileName: "006-default-host.md",
      path: ticketPath,
      status: "closed"
    })
  ]);

  mkdirSync(join(cwd, ".deuk-agent", "tickets", "sub"), { recursive: true });
  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 006-default-host",
    "title: knowledge-rich",
    "phase: 4",
    "status: closed",
    "summary: archive knowledge test",
    "priority: P2",
    "tags: [test]",
    "---",
    "# knowledge-rich",
    "",
    "## Scope & Constraints",
    "- Target: source module",
    "",
    "## Agent Permission Contract (APC)",
    "### [BOUNDARY]",
    "- Editable modules: source module",
    "",
    "## Tasks",
    "- [x] Done",
    "",
    "## Compact Plan",
    "- Problem: archive knowledge test",
    "- Approach: keep ticket body as the single source of truth",
    "- Verification: archive the ticket and write knowledge json",
    ""
  ].join("\n"), "utf8");

  await runTicketArchive({ cwd, topic: "006", nonInteractive: true });

  const knowledgePath = join(cwd, ".deuk-agent", "knowledge", "006-default-host.json");
  assert.ok(existsSync(knowledgePath), "knowledge json should be written");
  const knowledge = JSON.parse(readFileSync(knowledgePath, "utf8"));
  assert.strictEqual(knowledge.summary, "archive knowledge test");
  assert.strictEqual(knowledge.sourceKind, "ticket");
  assert.strictEqual(knowledge.ingestionCategory, "archived_ticket");
  assert.strictEqual(knowledge.corpus, "tickets");
  assert.strictEqual(knowledge.originTool, "ticket-archive");
  assert.strictEqual(knowledge.freshness, "archived");
  assert.strictEqual(knowledge.refreshPolicy, "refresh-on-stale");
  assert.match(knowledge.sections["Scope & Constraints"], /Target: source module/);
  assert.match(knowledge.sections["Agent Permission Contract (APC)"], /Editable modules: source module/);
  assert.match(knowledge.sections["Compact Plan"], /archive knowledge test/);
  assert.deepStrictEqual(knowledge.analysis, {});

  const telemetryPath = join(cwd, ".deuk-agent", "telemetry.jsonl");
  assert.ok(existsSync(telemetryPath), "telemetry jsonl should be written");
  const telemetryLines = readFileSync(telemetryPath, "utf8").trim().split("\n").filter(Boolean);
  const telemetryRows = telemetryLines.map(line => JSON.parse(line));
  const knowledgeTelemetry = telemetryRows.find(row => row.event === "knowledge_distilled");
  const archiveTelemetry = telemetryRows.find(row => row.event === "ticket_archived");
  assert.ok(knowledgeTelemetry, "knowledge distill telemetry event should be written");
  assert.ok(archiveTelemetry, "ticket archive telemetry event should be written");
  assert.strictEqual(knowledgeTelemetry.source, "internal");
  assert.strictEqual(knowledgeTelemetry.kind, "workflow_event");
  assert.strictEqual(knowledgeTelemetry.action, "knowledge-distill");
  assert.strictEqual(knowledgeTelemetry.ticket, "006-default-host");
  assert.strictEqual(knowledgeTelemetry.knowledgeAction, "add_knowledge");
  assert.strictEqual(knowledgeTelemetry.knowledgeSourceKind, "ticket");
  assert.strictEqual(knowledgeTelemetry.knowledgeIngestionCategory, "archived_ticket");
  assert.strictEqual(knowledgeTelemetry.knowledgeCorpus, "tickets");
  assert.strictEqual(knowledgeTelemetry.knowledgeOriginTool, "ticket-archive");
  assert.strictEqual(knowledgeTelemetry.knowledgeFreshness, "archived");
  assert.strictEqual(knowledgeTelemetry.tokenQuality, "saved");
  assert.strictEqual(archiveTelemetry.ticket, "006-default-host");

  rmSync(cwd, { recursive: true, force: true });
});

test("runTicketCreate rolls back when markdown lint fails", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace();
  writeFileSync(join(cwd, ".deuk-agent", "templates", "TICKET_TEMPLATE.md"), [
    "---",
    "<%- frontmatter %>",
    "---",
    "# <%= meta.title %>",
    "[broken](./missing.md)",
    ""
  ].join("\n"), "utf8");

  try {
    await assert.rejects(
      () => runTicketCreate({
        cwd,
        topic: "lint-guard",
        summary: "lint guard",
        nonInteractive: true,
        skipPhase0: true
      }),
      err => {
        assert.match(err.message, /markdown lint failed/);
        return true;
      }
    );

    const index = readTicketIndexJson(cwd);
    assert.strictEqual(index.entries.length, 0);

    const ticketSubDir = join(ticketDir, "sub");
    const ticketFiles = existsSync(ticketSubDir)
      ? readdirSync(ticketSubDir).filter(name => name.endsWith(".md"))
      : [];
    assert.strictEqual(ticketFiles.length, 0);

  const planDir = join(cwd, ".deuk-agent", "docs", "plan");
    const planFiles = existsSync(planDir)
      ? readdirSync(planDir).filter(name => name.endsWith(".md"))
      : [];
    assert.strictEqual(planFiles.length, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("markdown lint ignores legacy archived ticket template artifacts", () => {
  const { cwd } = makeTemplateWorkspace();
  const legacyDir = join(cwd, ".deuk-agent", "tickets", "archive", "sub", "2026-05", "05");
  mkdirSync(legacyDir, { recursive: true });
  const legacyPath = join(legacyDir, "ticket-list-template.md");
  writeFileSync(legacyPath, [
    "---",
    "summary: ticket-list-template",
    "status: archived",
    "priority: P2",
    "tags: [legacy]",
    "id: ticket-list-template",
    "---",
    "# ticket-list-template",
    "- [<%= latest.safeTitle %>](<%= latest.fileUri %>)",
    ""
  ].join("\n"), "utf8");

  try {
    const result = lintMarkdownPaths([legacyPath], cwd);
    assert.deepStrictEqual(result.errors, []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketMove ignores linked plan markdown and still moves ticket", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/001-default-host.md";
  const planPath = ".deuk-agent/docs/plan/001-default-host-plan.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "001-default-host",
      title: "move-guard",
      topic: "001-default-host",
      fileName: "001-default-host.md",
      path: ticketPath,
      status: "open",
      phase: 1
    })
  ]);

  mkdirSync(join(ticketDir, "sub"), { recursive: true });
  mkdirSync(join(cwd, ".deuk-agent", "docs", "plan"), { recursive: true });

  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 001-default-host",
    "title: move-guard",
    "phase: 1",
    "status: open",
    "summary: move guard",
    "priority: P2",
    "tags: [test]",
    `linkedDoc: ${planPath}`,
    "---",
    "# move-guard",
    "",
    "## Scope & Constraints",
    "- Target: source module",
    "",
    "## Agent Permission Contract (APC)",
    "### [BOUNDARY]",
    "- Editable modules: source module",
    "",
    "### [CONTRACT]",
    "- Input: source context",
    "- Output: minimal implementation",
    "- Side effects: docs only",
    "",
    "### [PATCH PLAN]",
    "- Plan pointer",
    "",
    "## Compact Plan",
    "",
    "- **Finding:** The move guard ticket owns a focused source-module update.",
    "- **Root cause / hypothesis:** The ticket has complete local planning evidence.",
    "- **Approach:** Move to execution after Phase 1 guards pass.",
    "- **Verification:** Inspect phase and status after move.",
    "",
    "## Problem Analysis",
    "",
    "The lifecycle move path must ignore linked plan markdown while still validating the main ticket.",
    "",
    "## Improvement Direction",
    "",
    "Keep lifecycle lint scoped to changed markdown and main-ticket state.",
    "",
    "## Tasks",
    "- [ ] placeholder",
    "",
    "## Done When",
    "- [ ] placeholder",
    ""
  ].join("\n"), "utf8");

  writeFileSync(join(cwd, planPath), [
    "---",
    "summary: move lint plan",
    "status: draft",
    "priority: P2",
    "tags: [plan]",
    "---",
    "# Agent Analysis Plan",
    "",
    "## Problem Analysis",
    "Broken [link](./missing.md)",
    ""
  ].join("\n"), "utf8");

  try {
    await runTicketMove({ cwd, topic: "001", next: true, nonInteractive: true });

    const body = readFileSync(join(cwd, ticketPath), "utf8");
    assert.match(body, /phase: 2/);
    assert.match(body, /status: active/);
    assert.doesNotMatch(body, /phase: 1/);

    const index = JSON.parse(readFileSync(join(ticketDir, TICKET_INDEX_FILENAME), "utf8"));
    assert.strictEqual(index.entries[0].status, "active");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketMove rejects scaffold-only compact plan before Phase 2", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/001-plan-guard.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "001-plan-guard",
      title: "plan-guard",
      topic: "001-plan-guard",
      fileName: "001-plan-guard.md",
      path: ticketPath,
      status: "open",
      phase: 1
    })
  ]);

  mkdirSync(join(ticketDir, "sub"), { recursive: true });
  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 001-plan-guard",
    "title: plan-guard",
    "phase: 1",
    "status: open",
    "summary: validate move compact plan guard",
    "priority: P2",
    "tags: [test]",
    "---",
    "# plan-guard",
    "",
    "## Agent Permission Contract (APC)",
    "### [BOUNDARY]",
    "- Editable modules: source module",
    "",
    "### [CONTRACT]",
    "- Input: source context",
    "- Output: minimal implementation",
    "- Side effects: docs only",
    "",
    "### [PATCH PLAN]",
    "- Implement the approved bounded change.",
    "",
    "## Compact Plan",
    "",
    "- **Finding:** Record the concrete symptom, risk, or requested change this ticket owns.",
    "- **Root cause / hypothesis:** Capture the current best explanation.",
    "- **Approach:** Capture the selected design path.",
    "- **Verification:** List the smallest relevant commands/checks.",
    ""
  ].join("\n"), "utf8");

  try {
    await assert.rejects(
      () => runTicketMove({ cwd, topic: "001", next: true, nonInteractive: true }),
      err => {
        assert.match(err.message, /incomplete Phase 1 planning evidence/);
        assert.match(err.message, /compact_plan_placeholder_or_incomplete/);
        return true;
      }
    );

    const body = readFileSync(join(cwd, ticketPath), "utf8");
    assert.match(body, /phase: 1/);
    assert.match(body, /status: open/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketMove rejects ticket without substantive analysis and design sections", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/001-analysis-guard.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "001-analysis-guard",
      title: "analysis guard",
      topic: "analysis-guard",
      fileName: "001-analysis-guard.md",
      path: ticketPath,
      status: "open",
      phase: 1
    })
  ]);

  mkdirSync(join(ticketDir, "sub"), { recursive: true });
  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 001-analysis-guard",
    "title: analysis guard",
    "phase: 1",
    "status: open",
    "summary: enforce analysis design content",
    "priority: P2",
    "tags: [test]",
    "---",
    "# analysis guard",
    "",
    "## Agent Permission Contract (APC)",
    "### [BOUNDARY]",
    "- Editable modules: source module",
    "",
    "### [CONTRACT]",
    "- Input: source context",
    "- Output: validated implementation",
    "- Side effects: tests only",
    "",
    "### [PATCH PLAN]",
    "- Implement the approved bounded change.",
    "",
    "## Compact Plan",
    "",
    "- **Finding:** The ticket needs analysis and design content.",
    "- **Root cause / hypothesis:** The lifecycle guard should reject scaffold-only sections.",
    "- **Approach:** Validate analysis and design sections before execution.",
    "- **Verification:** Move should fail with analysis/design reasons.",
    "",
    "## Problem Analysis",
    "",
    "For investigation, regression, quality, or root-cause tickets, record the current analysis here before asking the user for clarification. Chat should point back to this ticket after the analysis is recorded.",
    "",
    "## Improvement Direction",
    "",
    "- Record the proposed fix direction or follow-up design path.",
    ""
  ].join("\n"), "utf8");

  try {
    await assert.rejects(
      () => runTicketMove({ cwd, topic: "001", next: true, nonInteractive: true }),
      err => {
        assert.match(err.message, /problem_analysis_missing/);
        assert.match(err.message, /improvement_direction_missing/);
        return true;
      }
    );

    const body = readFileSync(join(cwd, ticketPath), "utf8");
    assert.match(body, /phase: 1/);
    assert.match(body, /status: open/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketMove rejects audit ticket without main-ticket durable evidence", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/001-audit-guard.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "001-audit-guard",
      title: "metadata audit",
      topic: "metadata-audit",
      fileName: "001-audit-guard.md",
      path: ticketPath,
      status: "open",
      phase: 1
    })
  ]);

  mkdirSync(join(ticketDir, "sub"), { recursive: true });
  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 001-audit-guard",
    "title: metadata audit",
    "phase: 1",
    "status: open",
    "summary: audit hardcoded metadata handling",
    "priority: P2",
    "tags: [test]",
    "---",
    "# metadata audit",
    "",
    "## Agent Permission Contract (APC)",
    "### [BOUNDARY]",
    "- Editable modules: source module",
    "",
    "### [CONTRACT]",
    "- Input: source context",
    "- Output: audit findings",
    "- Side effects: ticket only",
    "",
    "### [PATCH PLAN]",
    "- Perform a read-only audit.",
    "",
    "## Compact Plan",
    "",
    "- **Finding:** Metadata audit needs durable evidence.",
    "- **Root cause / hypothesis:** Summary-only reports can lose file-level findings.",
    "- **Approach:** Block execution until evidence is in the main ticket.",
    "- **Verification:** Move should fail with audit evidence reason.",
    "",
    "## Verification Outcome",
    "",
    "- **Key findings:** Providers contain hardcoded mappings.",
    ""
  ].join("\n"), "utf8");

  try {
    await assert.rejects(
      () => runTicketMove({ cwd, topic: "001", next: true, nonInteractive: true }),
      err => {
        assert.match(err.message, /incomplete Phase 1 planning evidence/);
        assert.match(err.message, /audit_evidence_missing/);
        return true;
      }
    );

    const body = readFileSync(join(cwd, ticketPath), "utf8");
    assert.match(body, /phase: 1/);
    assert.match(body, /status: open/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketMove accepts audit ticket with main-ticket source observations", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/001-audit-evidence.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "001-audit-evidence",
      title: "metadata audit",
      topic: "metadata-audit",
      fileName: "001-audit-evidence.md",
      path: ticketPath,
      status: "open",
      phase: 1
    })
  ]);

  mkdirSync(join(ticketDir, "sub"), { recursive: true });
  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 001-audit-evidence",
    "title: metadata audit",
    "phase: 1",
    "status: open",
    "summary: audit hardcoded metadata handling",
    "priority: P2",
    "tags: [test]",
    "---",
    "# metadata audit",
    "",
    "## Agent Permission Contract (APC)",
    "### [BOUNDARY]",
    "- Editable modules: source module",
    "",
    "### [CONTRACT]",
    "- Input: source context",
    "- Output: audit findings",
    "- Side effects: ticket only",
    "",
    "### [PATCH PLAN]",
    "- Perform a read-only audit.",
    "",
    "## Compact Plan",
    "",
    "- **Finding:** Metadata audit needs durable evidence.",
    "- **Root cause / hypothesis:** Summary-only reports can lose file-level findings.",
    "- **Approach:** Store file-level evidence in the main ticket.",
    "- **Verification:** Move should pass when evidence exists.",
    "",
    "## Source Observations",
    "",
    "- `src/codegen/plugins/rust/src/RustSerializationProvider.ts:15` maps Binary to String locally.",
    "- `scripts/bmt/reporter.js:111` keeps a local protocol display map.",
    "",
    "## Cause Hypotheses",
    "",
    "- Provider-local maps remain because metadata parity guards were incomplete.",
    "",
    "## Problem Analysis",
    "",
    "The audit ticket needs concrete source observations before it can move to execution.",
    "",
    "## Improvement Direction",
    "",
    "Use metadata-first provider parity as the follow-up design path.",
    ""
  ].join("\n"), "utf8");

  try {
    await runTicketMove({ cwd, topic: "001", next: true, nonInteractive: true });

    const body = readFileSync(join(cwd, ticketPath), "utf8");
    assert.match(body, /phase: 2/);
    assert.match(body, /status: active/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketMove rejects implementation transition when only ticket files changed", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/001-impl-move.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "001-impl-move",
      title: "implementation move",
      topic: "implementation-move",
      fileName: "001-impl-move.md",
      path: ticketPath,
      status: "open",
      phase: 1
    })
  ]);

  mkdirSync(join(ticketDir, "sub"), { recursive: true });
  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 001-impl-move",
    "title: implementation move",
    "phase: 1",
    "status: open",
    "summary: Rust provider implementation move claim",
    "priority: P2",
    "tags: [test]",
    "---",
    "# implementation move",
    "",
    "## Agent Permission Contract (APC)",
    "### [BOUNDARY]",
    "- Editable modules: source module",
    "",
    "### [CONTRACT]",
    "- Input: source context",
    "- Output: implementation update",
    "- Side effects: scoped changes only",
    "",
    "### [PATCH PLAN]",
    "- Move to execution only when source changes exist.",
    "",
    "## Compact Plan",
    "",
    "- **Finding:** Rust provider implementation is ready to execute.",
    "- **Root cause / hypothesis:** Ticket-only progress can overstate implementation readiness.",
    "- **Approach:** Block move unless non-ticket source changes exist.",
    "- **Verification:** Move should fail when only ticket files changed.",
    "",
    "## Source Observations",
    "",
    "- `src/providers/RustSerializationProvider.ts` is the intended implementation target.",
    "",
    "## Cause Hypotheses",
    "",
    "- Implementation claims must align with real changed files.",
    "",
    "## Problem Analysis",
    "",
    "Phase transition should fail when implementation is claimed without source changes.",
    "",
    "## Improvement Direction",
    "",
    "Require a real changed source file before moving to Phase 2.",
    "",
    "## Verification Outcome",
    "",
    "- Implemented `src/providers/RustSerializationProvider.ts` and verified behavior.",
    ""
  ].join("\n"), "utf8");

  try {
    await assert.rejects(
      () => runTicketMove({
        cwd,
        topic: "001",
        next: true,
        changedFiles: [ticketPath],
        nonInteractive: true
      }),
      err => {
        assert.match(err.message, /incomplete Phase 1 planning evidence/);
        assert.match(err.message, /implementation_changed_files_missing/);
        return true;
      }
    );

    const body = readFileSync(join(cwd, ticketPath), "utf8");
    assert.match(body, /phase: 1/);
    assert.match(body, /status: open/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketMove finds ticket owner repo by topic from sibling cwd", async () => {
  const parent = mkdtempSync(join(tmpdir(), "deuk-ticket-workspace-"));
  const ticketPath = ".deuk-agent/tickets/sub/014-sibling-owned-host.md";
  const wrong = makeTicketWorkspaceAt(parent, "wrong-repo", []);
  const owner = makeTicketWorkspaceAt(parent, "owner-repo", [
    makeEntry({
      id: "014-sibling-owned-host",
      title: "sibling-owned",
      topic: "014-sibling-owned-host",
      fileName: "014-sibling-owned-host.md",
      path: ticketPath,
      status: "open",
      phase: 1
    })
  ]);

  mkdirSync(join(owner.ticketDir, "sub"), { recursive: true });
  writeFileSync(join(owner.cwd, ticketPath), [
    "---",
    "id: 014-sibling-owned-host",
    "title: sibling-owned",
    "phase: 1",
    "status: open",
    "summary: sibling owned",
    "priority: P2",
    "tags: [test]",
    "---",
    "# sibling-owned",
    "",
    "## Scope & Constraints",
    "- Target: source module",
    "",
    "## Agent Permission Contract (APC)",
    "### [BOUNDARY]",
    "- Editable modules: source module",
    "",
    "### [CONTRACT]",
    "- Input: source context",
    "- Output: minimal implementation",
    "- Side effects: docs only",
    "",
    "### [PATCH PLAN]",
    "- Plan pointer",
    "",
    "## Compact Plan",
    "",
    "- **Finding:** The sibling-owned ticket validates owner-repo discovery.",
    "- **Root cause / hypothesis:** The command cwd can be a sibling repository.",
    "- **Approach:** Resolve the ticket owner before mutating lifecycle state.",
    "- **Verification:** Check the owner ticket moved and the sibling index stayed empty.",
    "",
    "## Problem Analysis",
    "",
    "Sibling cwd resolution can mutate the wrong repo unless the owner repo is resolved first.",
    "",
    "## Improvement Direction",
    "",
    "Resolve matching ticket owners before lifecycle mutation.",
    ""
  ].join("\n"), "utf8");

  try {
    await runTicketMove({
      cwd: wrong.cwd,
      topic: "014-sibling-owned-host",
      next: true,
      nonInteractive: true
    });

    const body = readFileSync(join(owner.cwd, ticketPath), "utf8");
    assert.match(body, /phase: 2/);
    assert.match(body, /status: active/);

    const ownerIndex = JSON.parse(readFileSync(join(owner.ticketDir, TICKET_INDEX_FILENAME), "utf8"));
    assert.strictEqual(ownerIndex.entries[0].status, "active");

    const wrongIndex = JSON.parse(readFileSync(join(wrong.ticketDir, TICKET_INDEX_FILENAME), "utf8"));
    assert.strictEqual(wrongIndex.entries.length, 0);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("runTicketClose fails when topic exists in multiple sibling repos", async () => {
  const parent = mkdtempSync(join(tmpdir(), "deuk-ticket-workspace-"));
  const ticketPath = ".deuk-agent/tickets/sub/015-ambiguous-host.md";
  const wrong = makeTicketWorkspaceAt(parent, "wrong-repo", []);
  const ownerA = makeTicketWorkspaceAt(parent, "owner-a", [
    makeEntry({ id: "015-ambiguous-host", topic: "015-ambiguous-host", fileName: "015-ambiguous-host.md", path: ticketPath })
  ]);
  const ownerB = makeTicketWorkspaceAt(parent, "owner-b", [
    makeEntry({ id: "015-ambiguous-host", topic: "015-ambiguous-host", fileName: "015-ambiguous-host.md", path: ticketPath })
  ]);

  mkdirSync(join(ownerA.ticketDir, "sub"), { recursive: true });
  mkdirSync(join(ownerB.ticketDir, "sub"), { recursive: true });

  try {
    await assert.rejects(
      () => runTicketClose({ cwd: wrong.cwd, topic: "015-ambiguous-host", nonInteractive: true }),
      err => {
        assert.match(err.message, /Ambiguous ticket topic/);
        assert.match(err.message, /owner-a/);
        assert.match(err.message, /owner-b/);
        return true;
      }
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("runTicketMove lints changed markdown outside the ticket", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/003-default-host.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "003-default-host",
      title: "changed-md-guard",
      topic: "003-default-host",
      fileName: "003-default-host.md",
      path: ticketPath,
      status: "open",
      phase: 1
    })
  ]);

  mkdirSync(join(ticketDir, "sub"), { recursive: true });
  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 003-default-host",
    "title: changed-md-guard",
    "phase: 1",
    "status: open",
    "summary: changed markdown guard",
    "priority: P2",
    "tags: [test]",
    "---",
    "# changed-md-guard",
    "",
    "## Scope & Constraints",
    "- Target: source module",
    "",
    "## Agent Permission Contract (APC)",
    "### [BOUNDARY]",
    "- Editable modules: source module",
    "",
    "### [CONTRACT]",
    "- Input: source context",
    "- Output: minimal implementation",
    "- Side effects: docs only",
    "",
    "### [PATCH PLAN]",
    "- Plan pointer",
    "",
    "## Compact Plan",
    "",
    "- **Finding:** The changed markdown guard validates lifecycle linting.",
    "- **Root cause / hypothesis:** Changed non-ticket markdown must still block lifecycle moves when lint fails.",
    "- **Approach:** Move only after Phase 1 evidence passes, then expect lint to reject broken markdown.",
    "- **Verification:** Confirm the move rolls back and reports the broken relative link.",
    "",
    "## Problem Analysis",
    "",
    "Lifecycle moves must not bypass markdown lint when non-ticket markdown is changed.",
    "",
    "## Improvement Direction",
    "",
    "Validate main-ticket planning first, then run changed-markdown lint.",
    ""
  ].join("\n"), "utf8");

  try {
    writeFileSync(join(cwd, "AGENTS.md"), "# Rules\n\nValid.\n", "utf8");
    spawnSync("git", ["init"], { cwd, encoding: "utf8" });
    spawnSync("git", ["add", "AGENTS.md"], { cwd, encoding: "utf8" });
    spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "seed"], { cwd, encoding: "utf8" });
    writeFileSync(join(cwd, "AGENTS.md"), "# Rules\n\nBroken [link](./missing.md)\n", "utf8");

    await assert.rejects(
      () => runTicketMove({ cwd, topic: "003", next: true, nonInteractive: true }),
      err => {
        assert.match(err.message, /markdown lint failed/);
        assert.match(err.message, /AGENTS\.md: broken relative link/);
        return true;
      }
    );

    const body = readFileSync(join(cwd, ticketPath), "utf8");
    assert.match(body, /phase: 1/);
    assert.match(body, /status: open/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketClose ignores linked plan markdown and still closes ticket", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/002-default-host.md";
  const planPath = ".deuk-agent/docs/plan/002-default-host-plan.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "002-default-host",
      title: "close-guard",
      topic: "002-default-host",
      fileName: "002-default-host.md",
      path: ticketPath,
      status: "open",
      phase: 1
    })
  ]);

  mkdirSync(join(ticketDir, "sub"), { recursive: true });
  mkdirSync(join(cwd, ".deuk-agent", "docs", "plan"), { recursive: true });

  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 002-default-host",
    "title: close-guard",
    "phase: 1",
    "status: open",
    "summary: close guard",
    "priority: P2",
    "tags: [test]",
    `linkedDoc: ${planPath}`,
    "---",
    "# close-guard",
    "",
    "## Scope & Constraints",
    "- Target: source module",
    "",
    "## Agent Permission Contract (APC)",
    "### [BOUNDARY]",
    "- Editable modules: source module",
    "",
    "### [CONTRACT]",
    "- Input: source context",
    "- Output: minimal implementation",
    "- Side effects: docs only",
    "",
    "### [PATCH PLAN]",
    "- Plan pointer",
    "",
    "## Problem Analysis",
    "",
    "The close command must ignore broken linked plan markdown when the main ticket is complete.",
    "",
    "## Improvement Direction",
    "",
    "Validate and close the main ticket without traversing linked plan markdown.",
    ""
  ].join("\n"), "utf8");

  writeFileSync(join(cwd, planPath), [
    "---",
    "summary: close lint plan",
    "status: draft",
    "priority: P2",
    "tags: [plan]",
    "---",
    "# Agent Analysis Plan",
    "",
    "## Problem Analysis",
    "Broken [link](./missing.md)",
    ""
  ].join("\n"), "utf8");

  try {
    await runTicketClose({ cwd, topic: "002", nonInteractive: true });

    const body = readFileSync(join(cwd, ticketPath), "utf8");
    assert.match(body, /phase: 4/);
    assert.match(body, /status: closed/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketClose defaults to latest instead of prompting when stdout is not a TTY", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/002-default-host.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "002-default-host",
      title: "close-latest",
      topic: "002-default-host",
      fileName: "002-default-host.md",
      path: ticketPath,
      status: "open",
      phase: 1,
      createdAt: "2026-05-04 10:00:00"
    })
  ]);

  mkdirSync(join(ticketDir, "sub"), { recursive: true });
  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 002-default-host",
    "title: close-latest",
    "phase: 1",
    "status: open",
    "summary: close latest",
    "priority: P2",
    "tags: [test]",
    "createdAt: 2026-05-04 10:00:00",
    "---",
    "# close-latest",
    "",
    "## Problem Analysis",
    "",
    "The no-topic close command should use latest in non-TTY terminals.",
    "",
    "## Improvement Direction",
    "",
    "Default to latest while preserving lifecycle mutation behavior.",
    ""
  ].join("\n"), "utf8");

  const originalDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });

  try {
    await runTicketClose({ cwd });

    const body = readFileSync(join(cwd, ticketPath), "utf8");
    assert.match(body, /phase: 4/);
    assert.match(body, /status: closed/);
  } finally {
    if (originalDescriptor) Object.defineProperty(process.stdout, "isTTY", originalDescriptor);
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketClose rejects audit ticket without main-ticket durable evidence", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/002-audit-close.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "002-audit-close",
      title: "metadata audit close",
      topic: "metadata-audit-close",
      fileName: "002-audit-close.md",
      path: ticketPath,
      status: "active",
      phase: 2
    })
  ]);

  mkdirSync(join(ticketDir, "sub"), { recursive: true });
  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 002-audit-close",
    "title: metadata audit close",
    "phase: 2",
    "status: active",
    "summary: audit hardcoded metadata handling before close",
    "priority: P2",
    "tags: [test]",
    "---",
    "# metadata audit close",
    "",
    "## Verification Outcome",
    "",
    "- **Key findings:** Providers contain hardcoded mappings.",
    "",
    "## Problem Analysis",
    "",
    "The close path must preserve detailed audit findings in the main ticket.",
    "",
    "## Improvement Direction",
    "",
    "Block close until file-level durable evidence has been recorded.",
    ""
  ].join("\n"), "utf8");

  try {
    await assert.rejects(
      () => runTicketClose({ cwd, topic: "002", nonInteractive: true }),
      err => {
        assert.match(err.message, /cannot close without complete main-ticket analysis\/design evidence/);
        assert.match(err.message, /audit_evidence_missing/);
        return true;
      }
    );

    const body = readFileSync(join(cwd, ticketPath), "utf8");
    assert.match(body, /phase: 2/);
    assert.match(body, /status: active/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketClose rejects implementation completion when only ticket files changed", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/002-impl-close.md";
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "002-impl-close",
      title: "implementation close",
      topic: "implementation-close",
      fileName: "002-impl-close.md",
      path: ticketPath,
      status: "active",
      phase: 2
    })
  ]);

  mkdirSync(join(ticketDir, "sub"), { recursive: true });
  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 002-impl-close",
    "title: implementation close",
    "phase: 2",
    "status: active",
    "summary: Rust provider implementation close claim",
    "priority: P2",
    "tags: [test]",
    "---",
    "# implementation close",
    "",
    "## Verification Outcome",
    "",
    "- Implemented `src/providers/RustSerializationProvider.ts` and verified behavior.",
    "",
    "## Problem Analysis",
    "",
    "Close should fail when implementation was claimed without source changes.",
    "",
    "## Improvement Direction",
    "",
    "Require a real changed source file before close.",
    ""
  ].join("\n"), "utf8");

  try {
    await assert.rejects(
      () => runTicketClose({
        cwd,
        topic: "002",
        changedFiles: [ticketPath],
        nonInteractive: true
      }),
      /implementation_changed_files_missing/
    );

    const body = readFileSync(join(cwd, ticketPath), "utf8");
    assert.match(body, /phase: 2/);
    assert.match(body, /status: active/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketArchive ignores linked plan markdown and still archives ticket", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/007-default-host.md";
  const planPath = ".deuk-agent/docs/plan/007-default-host-plan.md";
  const { cwd } = makeTicketWorkspace([
    makeEntry({
      id: "007-default-host",
      title: "archive-guard",
      topic: "007-default-host",
      fileName: "007-default-host.md",
      path: ticketPath,
      status: "closed",
      phase: 4
    })
  ]);

  mkdirSync(join(cwd, ".deuk-agent", "tickets", "sub"), { recursive: true });
  mkdirSync(join(cwd, ".deuk-agent", "docs", "plan"), { recursive: true });

  writeFileSync(join(cwd, ticketPath), [
    "---",
    "id: 007-default-host",
    "title: archive-guard",
    "phase: 4",
    "status: closed",
    "summary: archive guard",
    "priority: P2",
    "tags: [test]",
    `linkedDoc: ${planPath}`,
    "---",
    "# archive-guard",
    "",
    "## Scope & Constraints",
    "- Target: source module",
    "",
    "## Agent Permission Contract (APC)",
    "### [BOUNDARY]",
    "- Editable modules: source module",
    "",
    "### [CONTRACT]",
    "- Input: source context",
    "- Output: minimal implementation",
    "- Side effects: docs only",
    "",
    "### [PATCH PLAN]",
    "- Plan pointer",
    ""
  ].join("\n"), "utf8");

  writeFileSync(join(cwd, planPath), [
    "---",
    "summary: archive lint plan",
    "status: draft",
    "priority: P2",
    "tags: [plan]",
    "---",
    "# Agent Analysis Plan",
    "",
    "## Problem Analysis",
    "Broken [link](./missing.md)",
    ""
  ].join("\n"), "utf8");

  try {
    const archived = await runTicketArchive({ cwd, topic: "007", nonInteractive: true });

    assert.ok(!existsSync(join(cwd, ticketPath)), "original ticket should be moved out of active tickets");
    assert.ok(archived?.path, "archived ticket path should be returned");
    assert.ok(existsSync(join(cwd, archived.path)), "archived copy should exist");
    assert.ok(existsSync(join(cwd, ".deuk-agent", "knowledge", "007-default-host.json")), "knowledge json should be written");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate/next/archive roundtrip keeps ticket scaffold compact", async () => {
  const cases = [
    { label: "en", docsLanguage: "en", expectedTemplate: "TemplateLocale: locale: base", withKoTemplate: false },
    { label: "ko", docsLanguage: "ko", expectedTemplate: "TemplateLocale: ko", withKoTemplate: true }
  ];

  for (const tc of cases) {
    const { cwd, ticketDir } = makeTemplateWorkspace({ withKoTemplate: tc.withKoTemplate, baseMarker: "locale: base" });
    const originalLog = console.log;
    const originalWarn = console.warn;
    const output = [];
    const topic = `roundtrip-${tc.label}-ticket`;
    console.log = value => output.push(String(value));
    console.warn = value => output.push(`WARN:${String(value)}`);

    try {
      await runTicketCreate({
        cwd,
        topic,
        summary: `roundtrip verify for ${tc.label}`,
        nonInteractive: true,
        docsLanguage: tc.docsLanguage,
        skipPhase0: true
      });

      const createdFile = readNewestTicketMarkdown(ticketDir);
      assert.ok(createdFile, "ticket markdown should be created");
      const createdFileName = createdFile.split("/").pop();
      const createdText = readFileSync(createdFile, "utf8");
      assert.match(createdText, new RegExp(tc.expectedTemplate));
      assert.ok(!/## Problem Analysis/.test(createdText), "ticket scaffold should stay compact");
      assert.ok(!/## Source Observations/.test(createdText), "ticket scaffold should avoid long analysis sections");

      const index = readTicketIndexJson(cwd);
      const entry = index.entries.find(item => item.path && item.path.endsWith(`sub/${createdFileName}`));
      assert.ok(entry, `index should contain created entry with path, entries=${JSON.stringify(index.entries)}`);
      assert.strictEqual(entry.path, `.deuk-agent/tickets/sub/${createdFileName}`);

      output.length = 0;
      await runTicketNext({ cwd, pathOnly: true });
      assert.ok(output.some(line => line.endsWith(createdFileName)), "runTicketNext should resolve and print created ticket path");

      const archived = await runTicketArchive({ cwd, topic, nonInteractive: true });
      assert.match(archived?.path || "", /^\.deuk-agent\/tickets\/archive\/sub\/\d{4}-\d{2}\/\d{2}\//);
      assert.ok(archived.path.endsWith(`/${createdFileName}`));

      const archivedText = readFileSync(join(cwd, archived.path), "utf8");
      assert.ok(archivedText.includes(`# ${topic}`));
      assert.match(archivedText, new RegExp(tc.expectedTemplate));

      const updatedIndex = readTicketIndexJson(cwd);
      const archivedEntry = updatedIndex.entries.find(item => item.id === entry.id);
      assert.ok(archivedEntry, "archived entry should remain in index");
      assert.strictEqual(archivedEntry.status, "archived");
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});

test("runTicketCreate blocks excess open tickets and asks user to choose archive target", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace();
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(join(cwd, ".deuk-agent", "docs", "plan"), { recursive: true });

  const entries = [];
  for (let i = 1; i <= 20; i++) {
    const id = `${String(i).padStart(3, "0")}-old-open-host`;
    const fileName = `${id}.md`;
    const createdAt = `2026-04-${String(i).padStart(2, "0")} 00:00:00`;
    entries.push(makeEntry({
      id,
      title: `old open ${i}`,
      topic: id,
      fileName,
      createdAt,
      status: "open"
    }));
    writeFileSync(join(srcDir, fileName), [
      "---",
      `id: ${id}`,
      `title: old open ${i}`,
      "phase: 1",
      "status: open",
      `createdAt: ${createdAt}`,
      "summary: old open ticket",
      "priority: P2",
      "tags: [test]",
      "---",
      `# old open ${i}`,
      ""
    ].join("\n"), "utf8");
  }
  writeFileSync(join(ticketDir, TICKET_INDEX_FILENAME), JSON.stringify(makeIndex(entries), null, 2) + "\n", "utf8");

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await assert.rejects(
      () => runTicketCreate({
        cwd,
        topic: "new-overflow-ticket",
        summary: "create one more ticket after twenty open entries",
        nonInteractive: true,
        docsLanguage: "en",
        skipPhase0: true
      }),
      err => {
        assert.match(err.message, /Open tickets: 21\/20/);
        assert.match(err.message, /ticket list --active --non-interactive/);
        assert.match(err.message, /ticket archive --topic <ticket-id> --non-interactive/);
        assert.match(err.message, /001-old-open-host/);
        return true;
      }
    );

    const index = readTicketIndexJson(cwd);
    const openCount = index.entries.filter(e => e.status === "open" || e.status === "active").length;
    assert.strictEqual(openCount, 20);

    const oldest = index.entries.find(e => e.id === "001-old-open-host");
    assert.strictEqual(oldest.status, "open");
    assert.ok(existsSync(join(cwd, ".deuk-agent/tickets/sub/001-old-open-host.md")));
    assert.ok(!existsSync(join(cwd, ".deuk-agent/tickets/archive/sub/2026-04/01/001-old-open-host.md")));
    const subFiles = readdirSync(srcDir);
    assert.ok(!subFiles.some(name => name.includes("new-overflow-ticket")));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate dry-run blocks excess open tickets before claiming success", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace();
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });

  const entries = [];
  for (let i = 1; i <= 20; i++) {
    const id = `${String(i).padStart(3, "0")}-dry-open-host`;
    const fileName = `${id}.md`;
    entries.push(makeEntry({
      id,
      title: `dry open ${i}`,
      topic: id,
      fileName,
      createdAt: `2026-04-${String(i).padStart(2, "0")} 00:00:00`,
      status: "open"
    }));
    writeFileSync(join(srcDir, fileName), [
      "---",
      `id: ${id}`,
      `title: dry open ${i}`,
      "phase: 1",
      "status: open",
      "summary: existing dry-run open ticket",
      "priority: P2",
      "tags: [test]",
      "---",
      `# dry open ${i}`,
      ""
    ].join("\n"), "utf8");
  }
  writeFileSync(join(ticketDir, TICKET_INDEX_FILENAME), JSON.stringify(makeIndex(entries), null, 2) + "\n", "utf8");
  const beforeIndexText = readFileSync(join(ticketDir, TICKET_INDEX_FILENAME), "utf8");

  const originalLog = console.log;
  const originalWarn = console.warn;
  const logs = [];
  console.log = msg => logs.push(String(msg));
  console.warn = () => {};

  try {
    await assert.rejects(
      () => runTicketCreate({
        cwd,
        topic: "dry-overflow-ticket",
        summary: "preview should fail before exceeding the open ticket limit",
        planBody: minimalEvidencePhase1Plan("dry overflow ticket"),
        nonInteractive: true,
        docsLanguage: "en",
        skipPhase0: true,
        requireFilled: true,
        dryRun: true
      }),
      err => {
        assert.match(err.message, /Open tickets: 21\/20/);
        assert.match(err.message, /ticket archive --topic <ticket-id> --non-interactive/);
        return true;
      }
    );

    assert.strictEqual(readFileSync(join(ticketDir, TICKET_INDEX_FILENAME), "utf8"), beforeIndexText);
    assert.ok(!readdirSync(srcDir).some(name => name.includes("dry-overflow-ticket")));
    assert.ok(!logs.some(line => line.includes("Ticket would be created:")));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate dry-run does not write ticket, plan, index, or active ticket frontmatter", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace();
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });

  const activeId = "001-active-host";
  const activeFileName = `${activeId}.md`;
  const activeEntry = makeEntry({
    id: activeId,
    title: "active completed ticket",
    topic: activeId,
    fileName: activeFileName,
    createdAt: "2026-04-01 00:00:00",
    status: "active"
  });
  const activePath = join(srcDir, activeFileName);
  writeFileSync(activePath, [
    "---",
    `id: ${activeId}`,
    "title: active completed ticket",
    "phase: 3",
    "status: active",
    "summary: active ticket should not be closed during dry-run",
    "priority: P2",
    "tags: [test]",
    "---",
    "# active completed ticket",
    "",
    "## Tasks",
    "- [x] Done",
    ""
  ].join("\n"), "utf8");

  const initialIndex = makeIndex([activeEntry]);
  initialIndex.activeTicketId = activeId;
  writeFileSync(join(ticketDir, TICKET_INDEX_FILENAME), JSON.stringify(initialIndex, null, 2) + "\n", "utf8");
  const beforeIndexText = readFileSync(join(ticketDir, TICKET_INDEX_FILENAME), "utf8");
  const beforeActiveText = readFileSync(activePath, "utf8");

  const originalLog = console.log;
  const originalWarn = console.warn;
  const logs = [];
  console.log = msg => logs.push(String(msg));
  console.warn = () => {};

  try {
    await runTicketCreate({
      cwd,
      topic: "dry-run-ticket",
      summary: "preview ticket creation without writing any files",
      planBody: minimalEvidencePhase1Plan("dry run ticket"),
      nonInteractive: true,
      docsLanguage: "en",
      skipPhase0: true,
      dryRun: true,
      chain: true,
      requireFilled: true
    });

    assert.strictEqual(readFileSync(join(ticketDir, TICKET_INDEX_FILENAME), "utf8"), beforeIndexText);
    assert.strictEqual(readFileSync(activePath, "utf8"), beforeActiveText);
    assert.ok(!readdirSync(srcDir).some(name => name.includes("dry-run-ticket")));
    assert.ok(!existsSync(join(cwd, ".deuk-agent/docs/plan")));
    assert.ok(logs.some(line => line.includes("Ticket would be created:")));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate rolls back when strict create rejects placeholder summary", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace();
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await assert.rejects(
      () => runTicketCreate({
        cwd,
        topic: "strict-placeholder-ticket",
        summary: "placeholder summary for strict create",
        nonInteractive: true,
        docsLanguage: "en",
        skipPhase0: true,
        requireFilled: true
      }),
      err => {
        assert.match(err.message, /strict mode rejected incomplete Phase 1/);
        assert.match(err.message, /summary_missing_or_placeholder/);
        assert.match(err.message, /Required one-pass inputs/);
        assert.match(err.message, /Required --plan-body sections/);
        assert.match(err.message, /Copy\/paste command shape/);
        assert.match(err.message, /--plan-body/);
        assert.match(err.message, /Manual fallback is forbidden/);
        return true;
      }
    );

    const index = readTicketIndexJson(cwd);
    assert.strictEqual(index.entries.length, 0);
    assert.ok(!readdirSync(srcDir).some(name => name.includes("strict-placeholder-ticket")));
    const planDir = join(cwd, ".deuk-agent", "docs", "plan");
    const planFiles = existsSync(planDir)
      ? readdirSync(planDir).filter(name => name.endsWith(".md"))
      : [];
    assert.strictEqual(planFiles.length, 0);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate dry-run rejects incomplete strict Phase 1 before claiming success", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace();
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });
  const beforeIndexText = readFileSync(join(ticketDir, TICKET_INDEX_FILENAME), "utf8");

  const originalLog = console.log;
  const originalWarn = console.warn;
  const logs = [];
  console.log = msg => logs.push(String(msg));
  console.warn = () => {};

  try {
    await assert.rejects(
      () => runTicketCreate({
        cwd,
        topic: "dry-strict-incomplete-ticket",
        summary: "validate dry-run strict incomplete Phase 1 rejection",
        nonInteractive: true,
        docsLanguage: "en",
        skipPhase0: true,
        requireFilled: true,
        dryRun: true
      }),
      err => {
        assert.match(err.message, /strict mode rejected incomplete Phase 1/);
        assert.match(err.message, /compact_plan_placeholder_or_incomplete/);
        assert.match(err.message, /Manual fallback is forbidden/);
        return true;
      }
    );

    assert.strictEqual(readFileSync(join(ticketDir, TICKET_INDEX_FILENAME), "utf8"), beforeIndexText);
    assert.ok(!readdirSync(srcDir).some(name => name.includes("dry-strict-incomplete-ticket")));
    assert.ok(!logs.some(line => line.includes("Ticket would be created:")));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate strict mode rejects scaffold-only compact plan drafts", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace();
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await assert.rejects(
      () => runTicketCreate({
        cwd,
        topic: "strict-plan-scaffold-ticket",
        summary: "validate strict plan scaffold rejection",
        nonInteractive: true,
        docsLanguage: "en",
        skipPhase0: true,
        requireFilled: true
      }),
      err => {
        assert.match(err.message, /strict mode rejected incomplete Phase 1/);
        assert.match(err.message, /compact_plan_placeholder_or_incomplete/);
        assert.match(err.message, /Required one-pass inputs/);
        assert.match(err.message, /## Source Observations/);
        assert.match(err.message, /--plan-body/);
        assert.match(err.message, /Manual fallback is forbidden/);
        return true;
      }
    );

    const index = readTicketIndexJson(cwd);
    assert.strictEqual(index.entries.length, 0);
    assert.ok(!readdirSync(srcDir).some(name => name.includes("strict-plan-scaffold-ticket")));
    const planDir = join(cwd, ".deuk-agent", "docs", "plan");
    const planFiles = existsSync(planDir)
      ? readdirSync(planDir).filter(name => name.endsWith(".md"))
      : [];
    assert.strictEqual(planFiles.length, 0);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketStatus compact mode emits one-line phase summary", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace();
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(join(cwd, ".deuk-agent", "docs", "plan"), { recursive: true });

  const ticketId = "001-compact-status-host";
  writeFileSync(join(srcDir, `${ticketId}.md`), [
    "---",
    `id: ${ticketId}`,
    "title: compact status host",
    "phase: 1",
    "status: open",
    "lifecycleSource: ticket-create",
    "summary: compact status test",
    "---",
    "",
    "# compact status host",
    "",
    "## Agent Permission Contract",
    "### [BOUNDARY]",
    "- editable",
    "### [CONTRACT]",
    "- output",
    "### [PATCH PLAN]",
    "- plan",
    "## Compact Plan",
    "- **Problem:** compact status needs one-line output",
    "- **Approach:** keep status output terse",
    "- **Verification:** run compact status command",
    "- **Ticket Numbering:** infer the master/sub ticket from the numbered ticket ID; do not add inline child-ticket links.",
    "",
    "## Problem Analysis",
    "Compact status should report one concise lifecycle line for complete tickets.",
    "",
    "## Improvement Direction",
    "Keep compact status output terse while surfacing incomplete planning reasons.",
    ""
  ].join("\n"), "utf8");
  writeFileSync(join(cwd, ".deuk-agent", "docs", "plan", "001-compact-status-host-plan.md"), [
    "---",
    "summary: compact status plan",
    "status: draft",
    "priority: P2",
    "tags:",
    "  - plan",
    "---",
    "",
    "# Plan",
    "",
    "## Problem Analysis",
    "Explain the actual issue.",
    "",
    "## Source Observations",
    "- scripts/cli-ticket-commands.mjs",
    "",
    "## Cause Hypotheses",
    "- status output is too verbose",
    "",
    "## Decision Rationale",
    "- compact output reduces repetition",
    "",
    "## Execution Strategy",
    "- add one-line status mode",
    "",
    "## Verification Design",
    "- node --test scripts/tests/cli-ticket-commands.test.mjs",
    ""
  ].join("\n"), "utf8");
  writeFileSync(join(ticketDir, "INDEX.json"), JSON.stringify(makeIndex([makeEntry({
    id: ticketId,
    title: "compact status host",
    topic: ticketId,
    fileName: `${ticketId}.md`,
    createdAt: "2026-05-03 00:00:00",
    status: "open"
  })]), null, 2) + "\n", "utf8");

  const originalLog = console.log;
  const lines = [];
  console.log = value => { lines.push(String(value)); };
  try {
    await runTicketStatus({ cwd, topic: ticketId, compact: true });
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }

  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /^001-compact-status-host \| phase=1 \| status=open \| ok$/);
});

test("runTicketStatus rejects manually written execution ticket without CLI provenance", async () => {
  const { cwd, ticketDir } = makeTicketWorkspace([]);
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });

  const ticketId = "001-manual-ticket-host";
  writeFileSync(join(srcDir, `${ticketId}.md`), [
    "---",
    `id: ${ticketId}`,
    "title: manual ticket host",
    "phase: 1",
    "status: open",
    "summary: manual ticket should not be executable",
    "---",
    "",
    "# manual ticket host",
    "",
    "## Compact Plan",
    "- **Problem:** manual ticket exists",
    "- **Approach:** reject it",
    "- **Verification:** status fails",
    ""
  ].join("\n"), "utf8");
  writeFileSync(join(ticketDir, "INDEX.json"), JSON.stringify(makeIndex([makeEntry({
    id: ticketId,
    title: "manual ticket host",
    topic: ticketId,
    fileName: `${ticketId}.md`,
    createdAt: "2026-05-03 00:00:00",
    status: "open"
  })]), null, 2) + "\n", "utf8");

  try {
    await assert.rejects(
      () => runTicketStatus({ cwd, topic: ticketId, compact: true }),
      err => {
        assert.match(err.message, /manual_ticket_lifecycle_provenance_missing/);
        assert.match(err.message, /do not create or repair tickets/i);
        assert.match(err.message, /ticket create --topic/);
        return true;
      }
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketUse rejects manually written execution ticket without CLI provenance", async () => {
  const { cwd, ticketDir } = makeTicketWorkspace([]);
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });

  const ticketId = "001-manual-use-host";
  writeFileSync(join(srcDir, `${ticketId}.md`), [
    "---",
    `id: ${ticketId}`,
    "title: manual use host",
    "phase: 1",
    "status: open",
    "summary: manual use should not be executable",
    "---",
    "",
    "# manual use host",
    ""
  ].join("\n"), "utf8");
  writeFileSync(join(ticketDir, "INDEX.json"), JSON.stringify(makeIndex([makeEntry({
    id: ticketId,
    title: "manual use host",
    topic: ticketId,
    fileName: `${ticketId}.md`,
    createdAt: "2026-05-03 00:00:00",
    status: "open"
  })]), null, 2) + "\n", "utf8");

  try {
    await assert.rejects(
      () => runTicketUse({ cwd, topic: ticketId, nonInteractive: true }),
      err => {
        assert.match(err.message, /manual_ticket_lifecycle_provenance_missing/);
        assert.match(err.message, /--plan-body/);
        return true;
      }
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketEvidenceCheck rejects claim not covered by same-topic investigation sections", async () => {
  const { cwd, ticketDir } = makeTicketWorkspace([]);
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });

  const ticketId = "001-java-harness-claim";
  writeFileSync(join(srcDir, `${ticketId}.md`), [
    "---",
    `id: ${ticketId}`,
    "title: java harness claim",
    "phase: 1",
    "status: open",
    "summary: Java harness generated source investigation",
    "---",
    "",
    "# java harness claim",
    "",
    "## Problem Analysis",
    "TypeScript documentation and RecordGenerator parity need review.",
    "",
    "## Source Observations",
    "- docs/architecture/SERIALIZATION_MATRIX.md records TypeScript strategy drift.",
    "",
    "## Cause Hypotheses",
    "- Language strategy labels evolved independently.",
    "",
    "## Improvement Direction",
    "- Align TypeScript and JavaScript documentation wording.",
    ""
  ].join("\n"), "utf8");
  writeFileSync(join(ticketDir, "INDEX.json"), JSON.stringify(makeIndex([makeEntry({
    id: ticketId,
    title: "java harness claim",
    topic: ticketId,
    fileName: `${ticketId}.md`,
    path: `.deuk-agent/tickets/sub/${ticketId}.md`,
    createdAt: "2026-05-03 00:00:00",
    status: "open"
  })]), null, 2) + "\n", "utf8");

  try {
    await assert.rejects(
      () => runTicketEvidenceCheck({
        cwd,
        topic: ticketId,
        claim: "Java generated source and java-codegen-evidence-adapter.js harness transform were separated",
        nonInteractive: true
      }),
      /claim_coverage_missing/
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketEvidenceReport emits report only when claim is covered by ticket evidence", async () => {
  const { cwd, ticketDir } = makeTicketWorkspace([]);
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });

  const ticketId = "001-java-harness-report";
  writeFileSync(join(srcDir, `${ticketId}.md`), [
    "---",
    `id: ${ticketId}`,
    "title: java harness report",
    "phase: 1",
    "status: open",
    "summary: Java harness generated source investigation",
    "---",
    "",
    "# java harness report",
    "",
    "## Problem Analysis",
    "Java generated source and java-codegen-evidence-adapter.js harness transform must be separated before reporting.",
    "",
    "## Source Observations",
    "- scripts/bmt/java-codegen-evidence-adapter.js rewrites Java harness sources.",
    "",
    "## Cause Hypotheses",
    "- Raw generated Java may fail, or harness transform may introduce the compile failure.",
    "",
    "## Improvement Direction",
    "- Compile raw generated Java and transformed harness Java as separate evidence rows.",
    ""
  ].join("\n"), "utf8");
  writeFileSync(join(ticketDir, "INDEX.json"), JSON.stringify(makeIndex([makeEntry({
    id: ticketId,
    title: "java harness report",
    topic: ticketId,
    fileName: `${ticketId}.md`,
    path: `.deuk-agent/tickets/sub/${ticketId}.md`,
    createdAt: "2026-05-03 00:00:00",
    status: "open"
  })]), null, 2) + "\n", "utf8");

  const lines = [];
  const originalLog = console.log;
  console.log = (line = "") => lines.push(String(line));

  try {
    await runTicketEvidenceReport({
      cwd,
      topic: ticketId,
      claim: "Java generated source and java-codegen-evidence-adapter.js harness transform were separated",
      nonInteractive: true
    });
    assert.match(lines.join("\n"), /Claim-bound ticket report/);
    assert.match(lines.join("\n"), /java-codegen-evidence-adapter\.js/);
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("getImplementationClaimGuardResult rejects implementation claims without non-ticket changed files", () => {
  const result = getImplementationClaimGuardResult("/tmp/unused", {
    claim: "Rust provider code was implemented and fixed",
    content: "",
    changedFiles: [".deuk-agent/tickets/sub/001-sample.md"]
  });

  assert.strictEqual(result.ok, false);
  assert.match(result.reasons.join(","), /implementation_changed_files_missing/);
});

test("runTicketEvidenceReport rejects implementation claim when only ticket files changed", async () => {
  const { cwd, ticketDir } = makeTicketWorkspace([]);
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });

  const ticketId = "001-impl-claim-report";
  writeFileSync(join(srcDir, `${ticketId}.md`), [
    "---",
    `id: ${ticketId}`,
    "title: implementation claim report",
    "phase: 2",
    "status: active",
    "summary: Rust provider implementation claim",
    "---",
    "",
    "# implementation claim report",
    "",
    "## Problem Analysis",
    "Rust provider implementation must be reported only with real source changes.",
    "",
    "## Source Observations",
    "- `src/providers/RustSerializationProvider.ts` is the intended implementation target.",
    "",
    "## Cause Hypotheses",
    "- Ticket-only reporting can overstate implementation progress.",
    "",
    "## Improvement Direction",
    "- Block implementation reports unless source changes exist.",
    ""
  ].join("\n"), "utf8");
  writeFileSync(join(ticketDir, "INDEX.json"), JSON.stringify(makeIndex([makeEntry({
    id: ticketId,
    title: "implementation claim report",
    topic: ticketId,
    fileName: `${ticketId}.md`,
    path: `.deuk-agent/tickets/sub/${ticketId}.md`,
    createdAt: "2026-05-03 00:00:00",
    status: "active"
  })]), null, 2) + "\n", "utf8");

  try {
    await assert.rejects(
      () => runTicketEvidenceReport({
        cwd,
        topic: ticketId,
        claim: "RustSerializationProvider.ts implementation was fixed",
        changedFiles: [`.deuk-agent/tickets/sub/${ticketId}.md`],
        nonInteractive: true
      }),
      /implementation_changed_files_missing/
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketEvidenceReport accepts implementation claim when affected source file changed", async () => {
  const { cwd, ticketDir } = makeTicketWorkspace([]);
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });

  const ticketId = "001-impl-claim-pass";
  writeFileSync(join(srcDir, `${ticketId}.md`), [
    "---",
    `id: ${ticketId}`,
    "title: implementation claim pass",
    "phase: 2",
    "status: active",
    "summary: Rust provider implementation claim",
    "---",
    "",
    "# implementation claim pass",
    "",
    "## Problem Analysis",
    "Rust provider implementation must align with real changed files.",
    "",
    "## Source Observations",
    "- `src/providers/RustSerializationProvider.ts` is the implementation target.",
    "",
    "## Cause Hypotheses",
    "- Matching changed files should permit the claim-bound report.",
    "",
    "## Improvement Direction",
    "- Use the changed source file as proof for the claim.",
    ""
  ].join("\n"), "utf8");
  writeFileSync(join(ticketDir, "INDEX.json"), JSON.stringify(makeIndex([makeEntry({
    id: ticketId,
    title: "implementation claim pass",
    topic: ticketId,
    fileName: `${ticketId}.md`,
    path: `.deuk-agent/tickets/sub/${ticketId}.md`,
    createdAt: "2026-05-03 00:00:00",
    status: "active"
  })]), null, 2) + "\n", "utf8");

  const lines = [];
  const originalLog = console.log;
  console.log = (line = "") => lines.push(String(line));

  try {
    await runTicketEvidenceReport({
      cwd,
      topic: ticketId,
      claim: "src/providers/RustSerializationProvider.ts implementation was fixed",
      changedFiles: ["src/providers/RustSerializationProvider.ts"],
      nonInteractive: true
    });
    assert.match(lines.join("\n"), /Claim-bound ticket report/);
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketHandoff compact mode emits current and next ticket summary", async () => {
  const { cwd, ticketDir } = makeTicketWorkspace([
    makeEntry({
      id: "001-current-host",
      topic: "001-current-host",
      fileName: "001-current-host.md",
      status: "active",
      createdAt: "2026-05-01 08:00:00"
    }),
    makeEntry({
      id: "002-next-host",
      topic: "002-next-host",
      fileName: "002-next-host.md",
      status: "open",
      createdAt: "2026-05-01 09:00:00"
    })
  ]);

  mkdirSync(join(ticketDir, "sub"), { recursive: true });
  writeFileSync(join(ticketDir, "sub", "001-current-host.md"), [
    "---",
    "id: 001-current-host",
    "title: current host",
    "phase: 2",
    "status: active",
    "summary: handoff test",
    "---",
    "",
    "# current host",
    "",
    "## Compact Plan",
    "- **Problem:** handoff test",
    "- **Approach:** keep it short",
    "- **Verification:** compact mode"
  ].join("\n"), "utf8");

  const originalLog = console.log;
  const lines = [];
  console.log = value => { lines.push(String(value)); };
  try {
    await runTicketHandoff({ cwd, topic: "001-current-host", compact: true });
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }

  assert.deepStrictEqual(lines, ["001-current-host | phase=2 | status=active | next=002-next-host:open | blockers=none"]);
});

test("runTicketCreate auto-archives closed tickets before enforcing open ticket limit", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace();
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });

  const entries = [];
  for (let i = 1; i <= 19; i++) {
    const id = `${String(i).padStart(3, "0")}-old-open-host`;
    const fileName = `${id}.md`;
    const createdAt = `2026-04-${String(i).padStart(2, "0")} 00:00:00`;
    entries.push(makeEntry({
      id,
      title: `old open ${i}`,
      topic: id,
      fileName,
      createdAt,
      status: "open"
    }));
    writeFileSync(join(srcDir, fileName), [
      "---",
      `id: ${id}`,
      `title: old open ${i}`,
      "phase: 1",
      "status: open",
      `createdAt: ${createdAt}`,
      "summary: old open ticket",
      "priority: P2",
      "tags: [test]",
      "---",
      `# old open ${i}`,
      ""
    ].join("\n"), "utf8");
  }

  const closedId = "020-closed-host";
  entries.push(makeEntry({
    id: closedId,
    title: "closed ticket",
    topic: closedId,
    fileName: `${closedId}.md`,
    createdAt: "2026-04-20 00:00:00",
    status: "closed"
  }));
  writeFileSync(join(srcDir, `${closedId}.md`), [
    "---",
    `id: ${closedId}`,
    "title: closed ticket",
    "phase: 4",
    "status: closed",
    "createdAt: 2026-04-20 00:00:00",
    "summary: closed ticket",
    "priority: P2",
    "tags: [test]",
    "---",
    "# closed ticket",
    ""
  ].join("\n"), "utf8");
  writeFileSync(join(ticketDir, TICKET_INDEX_FILENAME), JSON.stringify(makeIndex(entries), null, 2) + "\n", "utf8");

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await runTicketCreate({
      cwd,
      topic: "new-after-closed-cleanup",
      summary: "create after archiving closed ticket",
      nonInteractive: true,
      docsLanguage: "en",
      skipPhase0: true
    });

    const index = readTicketIndexJson(cwd);
    const openCount = index.entries.filter(e => e.status === "open" || e.status === "active").length;
    assert.strictEqual(openCount, 20);

    const closed = index.entries.find(e => e.id === closedId);
    assert.strictEqual(closed.status, "archived");
    assert.strictEqual(closed.archiveYearMonth, "2026-04");
    assert.strictEqual(closed.archiveDay, "20");
    assert.ok(existsSync(join(cwd, ".deuk-agent/tickets/archive/sub/2026-04/20/020-closed-host.md")));
    assert.ok(!existsSync(join(cwd, ".deuk-agent/tickets/sub/020-closed-host.md")));

    const subFiles = readdirSync(srcDir);
    assert.ok(subFiles.some(name => name.includes("new-after-closed-cleanup")));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate normalizes stale closed archive metadata without requiring a sub ticket file", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace();
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });

  const openId = "001-open-host";
  writeFileSync(join(srcDir, `${openId}.md`), [
    "---",
    `id: ${openId}`,
    "title: open ticket",
    "phase: 1",
    "status: open",
    "createdAt: 2026-05-01 00:00:00",
    "summary: open ticket",
    "priority: P2",
    "tags: [test]",
    "---",
    "# open ticket",
    ""
  ].join("\n"), "utf8");

  const staleClosedId = "229-stale-closed-host";
  const entries = [
    makeEntry({
      id: openId,
      title: "open ticket",
      topic: openId,
      fileName: `${openId}.md`,
      createdAt: "2026-05-01 00:00:00",
      status: "open"
    }),
    makeEntry({
      id: staleClosedId,
      title: "stale closed ticket",
      topic: staleClosedId,
      fileName: `${staleClosedId}.md`,
      createdAt: "2026-05-02 00:00:00",
      status: "closed",
      phase: 4,
      archiveYearMonth: "2026-05",
      archiveDay: "03"
    })
  ];
  writeArchiveShard(ticketDir, "2026-05", [entries[1]]);
  writeFileSync(join(ticketDir, TICKET_INDEX_FILENAME), JSON.stringify(makeIndex([entries[0]]), null, 2) + "\n", "utf8");

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await runTicketCreate({
      cwd,
      topic: "new-after-stale-closed",
      summary: "create after stale closed normalization",
      nonInteractive: true,
      docsLanguage: "en",
      skipPhase0: true,
      render: true
    });

    const index = readTicketIndexJson(cwd);
    const staleClosed = index.entries.find(e => e.id === staleClosedId);
    assert.ok(staleClosed);
    assert.strictEqual(staleClosed.status, "archived");

    const ticketListPath = join(ticketDir, "TICKET_LIST.md");
    assert.ok(!existsSync(ticketListPath));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate preserves closed auto-archive when new ticket exceeds open limit", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace();
  const srcDir = join(ticketDir, "sub");
  mkdirSync(srcDir, { recursive: true });

  const entries = [];
  for (let i = 1; i <= 20; i++) {
    const id = `${String(i).padStart(3, "0")}-old-open-host`;
    const fileName = `${id}.md`;
    const createdAt = `2026-04-${String(i).padStart(2, "0")} 00:00:00`;
    entries.push(makeEntry({
      id,
      title: `old open ${i}`,
      topic: id,
      fileName,
      createdAt,
      status: "open"
    }));
    writeFileSync(join(srcDir, fileName), [
      "---",
      `id: ${id}`,
      `title: old open ${i}`,
      "phase: 1",
      "status: open",
      `createdAt: ${createdAt}`,
      "summary: old open ticket",
      "priority: P2",
      "tags: [test]",
      "---",
      `# old open ${i}`,
      ""
    ].join("\n"), "utf8");
  }

  const closedId = "021-closed-host";
  entries.push(makeEntry({
    id: closedId,
    title: "closed ticket",
    topic: closedId,
    fileName: `${closedId}.md`,
    createdAt: "2026-04-21 00:00:00",
    status: "closed"
  }));
  writeFileSync(join(srcDir, `${closedId}.md`), [
    "---",
    `id: ${closedId}`,
    "title: closed ticket",
    "phase: 4",
    "status: closed",
    "createdAt: 2026-04-21 00:00:00",
    "summary: closed ticket",
    "priority: P2",
    "tags: [test]",
    "---",
    "# closed ticket",
    ""
  ].join("\n"), "utf8");
  writeFileSync(join(ticketDir, TICKET_INDEX_FILENAME), JSON.stringify(makeIndex(entries), null, 2) + "\n", "utf8");

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await assert.rejects(
      () => runTicketCreate({
        cwd,
        topic: "new-overflow-after-closed-cleanup",
        summary: "create should fail but keep closed archive consistent",
        nonInteractive: true,
        docsLanguage: "en",
        skipPhase0: true
      }),
      err => {
        assert.match(err.message, /Open tickets: 21\/20/);
        return true;
      }
    );

    const index = readTicketIndexJson(cwd);
    const openCount = index.entries.filter(e => e.status === "open" || e.status === "active").length;
    assert.strictEqual(openCount, 20);
    assert.ok(!index.entries.some(e => e.topic === "new-overflow-after-closed-cleanup"));

    const closed = index.entries.find(e => e.id === closedId);
    assert.strictEqual(closed.status, "archived");
    assert.strictEqual(closed.archiveYearMonth, "2026-04");
    assert.strictEqual(closed.archiveDay, "21");
    assert.ok(existsSync(join(cwd, ".deuk-agent/tickets/archive/sub/2026-04/21/021-closed-host.md")));
    assert.ok(!existsSync(join(cwd, ".deuk-agent/tickets/sub/021-closed-host.md")));

    const subFiles = readdirSync(srcDir);
    assert.ok(!subFiles.some(name => name.includes("new-overflow-after-closed-cleanup")));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate repairs closed index entry when ticket file is already archived", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace();
  const srcDir = join(ticketDir, "sub");
  const archiveDir = join(ticketDir, "archive", "sub", "2026-04", "19");
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(archiveDir, { recursive: true });

  const closedId = "001-already-archived-host";
  const entries = [
    makeEntry({
      id: closedId,
      title: "already archived",
      topic: closedId,
      fileName: `${closedId}.md`,
      createdAt: "2026-04-19 00:00:00",
      status: "closed"
    })
  ];
  writeFileSync(join(archiveDir, `${closedId}.md`), [
    "---",
    `id: ${closedId}`,
    "title: already archived",
    "phase: 4",
    "status: closed",
    "createdAt: 2026-04-19 00:00:00",
    "summary: already archived ticket",
    "priority: P2",
    "tags: [test]",
    "---",
    "# already archived",
    ""
  ].join("\n"), "utf8");
  writeFileSync(join(ticketDir, TICKET_INDEX_FILENAME), JSON.stringify(makeIndex(entries), null, 2) + "\n", "utf8");

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await runTicketCreate({
      cwd,
      topic: "new-after-repair",
      summary: "create after repairing archived ticket index",
      nonInteractive: true,
      docsLanguage: "en",
      skipPhase0: true
    });

    const index = readTicketIndexJson(cwd);
    const closed = index.entries.find(e => e.id === closedId);
    assert.strictEqual(closed.status, "archived");
    assert.strictEqual(closed.archiveYearMonth, "2026-04");
    assert.strictEqual(closed.archiveDay, "19");
    assert.ok(existsSync(join(cwd, ".deuk-agent/tickets/archive/sub/2026-04/19/001-already-archived-host.md")));
    assert.ok(index.entries.some(e => e.id.includes("new-after-repair")));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate generates main-ticket compact plan by default", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-ticket-plan-draft-"));
  const summary = "unique duplicated summary phrase must stay ticket-owned";
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await runTicketCreate({
      cwd,
      topic: "non-duplicate-draft",
      summary,
      nonInteractive: true,
      docsLanguage: "en",
      skipPhase0: true
    });

    const ticketDir = join(cwd, ".deuk-agent", "tickets");
    const ticketFile = readNewestTicketMarkdown(ticketDir);
    assert.ok(ticketFile, "ticket markdown should be created");

    const ticketText = readFileSync(ticketFile, "utf8");
    assert.match(ticketText, /## Compact Plan/);
    assert.match(ticketText, /## Tasks/);
    assert.match(ticketText, /## Done When/);
    assert.doesNotMatch(ticketText, /## Problem Analysis/);
    assert.doesNotMatch(ticketText, /## Source Observations/);
    assert.doesNotMatch(ticketText, /## Cause Hypotheses/);
    assert.doesNotMatch(ticketText, /## Improvement Direction/);
    assert.doesNotMatch(ticketText, /## Open Questions/);
    assert.match(ticketText, new RegExp(summary));

    const planDir = join(cwd, ".deuk-agent", "docs", "plan");
    const planFiles = existsSync(planDir)
      ? readdirSync(planDir).filter(name => name.endsWith(".md"))
      : [];
    assert.strictEqual(planFiles.length, 0);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate auto-enables strict mode for investigation tickets", async () => {
  const { cwd } = makeTemplateWorkspace();
  const templateDir = join(cwd, ".deuk-agent", "templates");
  writeFileSync(join(templateDir, "TICKET_TEMPLATE.md"), [
    "---",
    "<%- frontmatter %>",
    "---",
    "# <%= meta.title %>",
    "TemplateLocale: base",
    ""
  ].join("\n"), "utf8");

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await assert.rejects(
      () => runTicketCreate({
        cwd,
        topic: "investigate-root-cause",
        summary: "Investigate why the agent still talks despite silent-by-default rules",
        nonInteractive: true,
        docsLanguage: "en",
        skipPhase0: true
      }),
      err => {
        assert.match(err.message, /strict mode rejected incomplete Phase 1/);
        assert.match(err.message, /compact_plan_placeholder_or_incomplete/);
        assert.match(err.message, /Required one-pass inputs/);
        assert.match(err.message, /## Cause Hypotheses/);
        assert.match(err.message, /--plan-body/);
        assert.match(err.message, /Manual fallback is forbidden/);
        return true;
      }
    );
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate does not generate ticket list markdown anymore", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-ticket-list-frontmatter-"));
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await runTicketCreate({
      cwd,
      topic: "ticket-list-frontmatter",
      summary: "render is deprecated and should not create ticket list markdown",
      nonInteractive: true,
      docsLanguage: "en",
      skipPhase0: true,
      render: true
    });

    const ticketListPath = join(cwd, ".deuk-agent", "tickets", "TICKET_LIST.md");
    assert.ok(!existsSync(ticketListPath));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate prefers bundled localized template over local base fallback", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace({ withKoTemplate: false });
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await runTicketCreate({
      cwd,
      topic: "fallback-risk-ticket",
      summary: "validate ko language fallback risk in template lookup",
      nonInteractive: true,
      docsLanguage: "ko",
      skipPhase0: true
    });

    const ticketFile = readNewestTicketMarkdown(ticketDir);
    assert.ok(ticketFile, "ticket markdown should be created");
    const ticketText = readFileSync(ticketFile, "utf8");
    assert.match(ticketText, /## Compact Plan/);
    assert.match(ticketText, /찾은 점|방향|검증|메모/);
    assert.ok(!/## Problem Analysis/.test(ticketText), "localized scaffold should stay minimal");
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate uses localized template when present and keeps it compact", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace({ withKoTemplate: true });
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await runTicketCreate({
      cwd,
      topic: "localized-ko-ticket",
      summary: "validate template rendering for ko",
      nonInteractive: true,
      docsLanguage: "ko",
      skipPhase0: true
    });

    const ticketFile = readNewestTicketMarkdown(ticketDir);
    assert.ok(ticketFile, "ticket markdown should be created");
    const ticketText = readFileSync(ticketFile, "utf8");
    assert.match(ticketText, /TemplateLocale: ko/);
    assert.ok(!/## Problem Analysis/.test(ticketText), "localized scaffold should stay minimal");
    assert.ok(!/## Source Observations/.test(ticketText), "localized scaffold should avoid long analysis sections");
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate keeps saved English config ahead of Korean prompt text", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace({ withKoTemplate: true });
  writeFileSync(join(cwd, ".deuk-agent", "config.json"), JSON.stringify({
    version: 1,
    docsLanguage: "en"
  }, null, 2) + "\n", "utf8");

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await runTicketCreate({
      cwd,
      topic: "prompt-language-korean",
      summary: "티켓과 계획 문서를 사용자 프롬프트 언어로 생성한다",
      nonInteractive: true,
      skipPhase0: true
    });

    const ticketFile = readNewestTicketMarkdown(ticketDir);
    assert.ok(ticketFile, "ticket markdown should be created");
    const ticketText = readFileSync(ticketFile, "utf8");
    assert.match(ticketText, /docsLanguage: en/);
    assert.match(ticketText, /TemplateLocale: locale: base/);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate keeps ticket filename ascii while preserving Korean content", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace({ withKoTemplate: true });
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await runTicketCreate({
      cwd,
      topic: "에이전트룰 한글 티켓 생성",
      summary: "티켓 파일명은 영문이고 본문은 사용자 언어로 생성한다",
      nonInteractive: true,
      skipPhase0: true
    });

    const ticketFile = readNewestTicketMarkdown(ticketDir);
    assert.ok(ticketFile, "ticket markdown should be created");
    assert.match(ticketFile, /001-ticket-[a-z0-9-]+\.md$/);
    assert.doesNotMatch(ticketFile, /[^\x00-\x7F]/);

    const ticketText = readFileSync(ticketFile, "utf8");
    assert.match(ticketText, /title: 에이전트룰 한글 티켓 생성/);
    assert.match(ticketText, /docsLanguage: ko/);
    assert.match(ticketText, /TemplateLocale: ko/);

    const indexJson = readTicketIndexJson(cwd);
    assert.strictEqual(indexJson.entries[0].topic, "ticket");
    assert.match(indexJson.entries[0].id, /^001-ticket-[a-z0-9-]+$/);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate keeps saved Korean config ahead of English prompt text", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace({ withKoTemplate: true });
  writeFileSync(join(cwd, ".deuk-agent", "config.json"), JSON.stringify({
    version: 1,
    docsLanguage: "ko"
  }, null, 2) + "\n", "utf8");

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    await runTicketCreate({
      cwd,
      topic: "prompt-language-english",
      summary: "create ticket and plan documents in the user prompt language",
      nonInteractive: true,
      skipPhase0: true
    });

    const ticketFile = readNewestTicketMarkdown(ticketDir);
    assert.ok(ticketFile, "ticket markdown should be created");
    const ticketText = readFileSync(ticketFile, "utf8");
    assert.match(ticketText, /docsLanguage: ko/);
    assert.match(ticketText, /TemplateLocale: ko/);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});
