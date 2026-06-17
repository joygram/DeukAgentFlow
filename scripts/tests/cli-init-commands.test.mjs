import test from "node:test";
import assert from "node:assert";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGlobalCodexInstructions, canonicalizeDocsArchiveBuckets, enforceCanonicalAgentLayout, generateSpokeContent, mergeManagedRuleContent, migrateLegacyStructure, runInit } from "../cli-init-commands.mjs";

test("init migration moves legacy reports and prunes empty legacy ticket dirs", () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-migrate-"));
  try {
    const ticketRoot = join(cwd, ".deuk-agent", "tickets");
    const legacyReportsDir = join(ticketRoot, "reports");
    const archiveDir = join(ticketRoot, "archive", "sub");
    const docsPlanDir = join(cwd, ".deuk-agent", "docs", "plan");

    mkdirSync(legacyReportsDir, { recursive: true });
    mkdirSync(archiveDir, { recursive: true });
    mkdirSync(join(ticketRoot, "core"), { recursive: true });
    mkdirSync(join(ticketRoot, "global"), { recursive: true });
    mkdirSync(join(ticketRoot, "main"), { recursive: true });

    const reportName = "REPORT-051-agent-fast-track-hardening-joy-nucb.md";
    const legacyReportPath = join(legacyReportsDir, reportName);
    const targetReportPath = join(docsPlanDir, reportName);
    const archiveTicketPath = join(archiveDir, "051-agent-fast-track-hardening-joy-nucb.md");

    writeFileSync(legacyReportPath, [
      "---",
      "summary: legacy report",
      "status: archived",
      "priority: P2",
      "tags:",
      "  - report",
      "  - legacy",
      "---",
      "",
      "# Legacy Report",
      ""
    ].join("\n"), "utf8");

    writeFileSync(archiveTicketPath, [
      "---",
      "id: 051-agent-fast-track-hardening-joy-nucb",
      "status: archived",
      "planLink: .deuk-agent/docs/plan/051-agent-fast-track-hardening-joy-nucb-plan.md",
      "---",
      "",
      "# Ticket",
      "",
      "## 📄 Attached Report",
      "- [View Report](../../reports/REPORT-051-agent-fast-track-hardening-joy-nucb.md)",
      ""
    ].join("\n"), "utf8");

    migrateLegacyStructure(cwd, false);

    assert.ok(existsSync(targetReportPath), "legacy report should move to walkthroughs");
    assert.ok(!existsSync(legacyReportPath), "legacy reports dir copy should be removed");
    assert.ok(!existsSync(join(ticketRoot, "reports")), "empty legacy reports dir should be pruned");
    assert.ok(!existsSync(join(ticketRoot, "core")), "empty legacy core dir should be pruned");
    assert.ok(!existsSync(join(ticketRoot, "global")), "empty legacy global dir should be pruned");
    assert.ok(!existsSync(join(ticketRoot, "main")), "empty legacy main dir should be pruned");

    const ticketBody = readFileSync(archiveTicketPath, "utf8");
    assert.match(ticketBody, /\(\.\.\/\.\.\/\.\.\/docs\/plan\/REPORT-051-agent-fast-track-hardening-joy-nucb\.md\)/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("generated agent spoke is a thin bootstrap with clear precedence", () => {
  const content = generateSpokeContent({ format: "markdown" }, "/repo/deuk-rules");

  assert.match(content, /thin bootstrap, not a second workflow contract/);
  assert.match(content, /internally note its frontmatter version/);
  assert.doesNotMatch(content, /confirming its version number/);
  assert.match(content, /core-rules\/AGENTS\.md` is the DeukAgentRules SSoT/);
  assert.match(content, /Do not print pointer\/core metadata/);
  assert.match(content, /Only the single required ticket-start line may appear before the final answer/);
});

test("global codex instructions stay locator-only", () => {
  const content = buildGlobalCodexInstructions();

  assert.match(content, /Global DeukAgentRules Locator/);
  assert.match(content, /locator, not a behavior contract/);
  assert.match(content, /load the local `AGENTS\.md` or `\.deuk-agent\/` pointer first/);
  assert.match(content, /core hub owns TDW, RAG, silence, scope, and verification policy/);
  assert.doesNotMatch(content, /## Core Directives/);
  assert.doesNotMatch(content, /Follow TDW/);
  assert.doesNotMatch(content, /Stay silent while working/);
});

test("managed rule content appends without deleting existing prose", () => {
  const merged = mergeManagedRuleContent(
    "# Notes\n\nKeep this line.\n",
    "# Deuk Agent Rules\n\nManaged block.\n"
  );

  assert.match(merged, /# Notes/);
  assert.match(merged, /Keep this line\./);
  assert.match(merged, /deuk-agent-managed:begin/);
  assert.match(merged, /Managed block\./);
});

test("init migration removes duplicate scratch reports and moves legacy archive ticket shards", () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-migrate-shards-"));
  try {
    const scratchDir = join(cwd, ".deuk-agent", "docs", "scratch");
    const walkthroughsDir = join(cwd, ".deuk-agent", "docs", "plan");
    const legacyArchiveTicketsDir = join(cwd, ".deuk-agent", "tickets", "archive", "tickets");
    const canonicalArchiveDir = join(cwd, ".deuk-agent", "tickets", "archive", "sub");

    mkdirSync(scratchDir, { recursive: true });
    mkdirSync(walkthroughsDir, { recursive: true });
    mkdirSync(legacyArchiveTicketsDir, { recursive: true });

    const reportName = "065-doc-lint-after-document-write-ru-joy-nucb-report.md";
    const scratchReportPath = join(scratchDir, reportName);
    const walkthroughReportPath = join(walkthroughsDir, reportName);
    const legacyArchiveTicketPath = join(legacyArchiveTicketsDir, "044-deukagentrules-hardening-joy-nucb.md");
    const canonicalArchiveTicketPath = join(canonicalArchiveDir, "044-deukagentrules-hardening-joy-nucb.md");

    const sharedReportBody = [
      "---",
      "summary: report",
      "status: complete",
      "priority: P3",
      "tags:",
      "  - report",
      "---",
      "",
      "# Report",
      ""
    ].join("\n");

    writeFileSync(scratchReportPath, sharedReportBody, "utf8");
    writeFileSync(walkthroughReportPath, sharedReportBody, "utf8");

    writeFileSync(legacyArchiveTicketPath, [
      "---",
      "id: 001-044-deukagentrules-hardening-joy-nucb",
      "phase: 4",
      "status: closed",
      "planLink: .deuk-agent/docs/plan/001-044-deukagentrules-hardening-joy-nucb-plan.md",
      "---",
      "",
      "# Archived Ticket",
      ""
    ].join("\n"), "utf8");

    migrateLegacyStructure(cwd, false);

    assert.ok(!existsSync(scratchReportPath), "duplicate scratch report should be removed");
    assert.ok(existsSync(walkthroughReportPath), "canonical plan report should remain");
    assert.ok(existsSync(canonicalArchiveTicketPath), "legacy archive ticket should move to archive/sub");
    assert.ok(!existsSync(legacyArchiveTicketPath), "legacy archive/tickets shard should be removed");
    assert.ok(!existsSync(legacyArchiveTicketsDir), "empty legacy archive/tickets directory should be pruned");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("init migration skips empty legacy docs instead of creating placeholder tickets", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-empty-legacy-doc-"));
  try {
    const docsRoot = join(cwd, ".deuk-agent", "docs", "plan");
    mkdirSync(docsRoot, { recursive: true });

    writeFileSync(join(docsRoot, "123-empty-legacy.md"), [
      "---",
      "summary: empty legacy doc",
      "status: draft",
      "priority: P3",
      "tags:",
      "  - legacy",
      "---",
      ""
    ].join("\n"), "utf8");

    writeFileSync(join(docsRoot, "124-nonempty-legacy.md"), [
      "---",
      "summary: nonempty legacy doc",
      "status: draft",
      "priority: P3",
      "createdAt: 2026-05-03 10:00:00",
      "tags:",
      "  - legacy",
      "---",
      "",
      "# Legacy Note",
      "",
      "Useful historical content.",
      ""
    ].join("\n"), "utf8");

    writeFileSync(join(cwd, ".deuk-agent", "config.json"), JSON.stringify({
      version: 1,
      agentsMode: "inject",
      workflowMode: "execute",
      approvalState: "approved",
      docsLanguage: "en",
      shareTickets: false,
      remoteSync: false,
      updatedAt: "2026-05-03T00:00:00.000Z"
    }, null, 2), "utf8");

    await runInit({
      cwd,
      dryRun: false,
      nonInteractive: true
    }, "/home/joy/workspace/DeukAgentRules");

    const emptyTicketPath = join(cwd, ".deuk-agent", "tickets", "archive", "sub", "legacy-docs", "123.md");
    const nonEmptyTicketPath = join(cwd, ".deuk-agent", "tickets", "archive", "sub", "legacy-docs", "124.md");
    assert.ok(!existsSync(emptyTicketPath), "empty legacy doc should not become a ticket");
    assert.ok(existsSync(nonEmptyTicketPath), "non-empty legacy doc should still be merged");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("init migration archives root .agent workflows and removes .agent", () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-agent-workflows-"));
  try {
    const workflowsDir = join(cwd, ".agent", "workflows");
    mkdirSync(workflowsDir, { recursive: true });
    writeFileSync(join(workflowsDir, "decide.md"), [
      "---",
      "description: legacy workflow",
      "---",
      "",
      "# Decide",
      ""
    ].join("\n"), "utf8");

    migrateLegacyStructure(cwd, false);

    const archiveRoot = join(cwd, ".deuk-agent", "docs", "archive");
    const archivedFiles = [
      join(archiveRoot, "2026-05", "agent-workflow-decide.md"),
      join(archiveRoot, "2026-04", "agent-workflow-decide.md")
    ];
    assert.ok(archivedFiles.some((p) => existsSync(p)), "legacy workflow should move into docs archive");
    assert.ok(!existsSync(join(cwd, ".agent")), "empty .agent container should be removed");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("docs archive cleanup updates ticket planLink references", () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-planlink-"));
  try {
    const ticketDir = join(cwd, ".deuk-agent", "tickets");
    const plansDir = join(cwd, ".deuk-agent", "docs", "plan");
    mkdirSync(join(ticketDir, "sub"), { recursive: true });
    mkdirSync(plansDir, { recursive: true });

    const oldPlanLink = ".deuk-agent/docs/plan/200-closed-plan.md";
    const newPlanLink = ".deuk-agent/docs/archive/2026-05/200-closed-plan.md";
    writeFileSync(join(plansDir, "200-closed-plan.md"), [
      "---",
      "summary: closed plan",
      "status: verified",
      "priority: P2",
      "tags:",
      "  - plan",
      "---",
      "",
      "# Plan",
      ""
    ].join("\n"), "utf8");
    writeFileSync(join(ticketDir, "sub", "200-closed.md"), [
      "---",
      "id: 200-closed",
      "status: closed",
      `planLink: ${oldPlanLink}`,
      "---",
      "",
      "# Closed",
      "",
      `- **PlanLink:** \`${oldPlanLink}\` owns details.`,
      ""
    ].join("\n"), "utf8");
    writeFileSync(join(ticketDir, "INDEX.json"), JSON.stringify({
      entries: [{
        id: "200-closed",
        status: "closed",
        group: "sub",
        fileName: "200-closed.md",
        createdAt: "2026-05-01 10:00:00"
      }]
    }, null, 2), "utf8");

    canonicalizeDocsArchiveBuckets(cwd, false);

    const ticketBody = readFileSync(join(ticketDir, "sub", "200-closed.md"), "utf8");
    assert.ok(existsSync(join(cwd, newPlanLink)), "closed plan should move to archive");
    assert.match(ticketBody, new RegExp(newPlanLink.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(!ticketBody.includes(oldPlanLink), "ticket should not keep stale planLink");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("init enforces canonical docs knowledge tickets layout", () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-layout-"));
  try {
    mkdirSync(join(cwd, ".deuk-agent", "docs", "random"), { recursive: true });
    mkdirSync(join(cwd, ".deuk-agent", "legacy"), { recursive: true });
    mkdirSync(join(cwd, ".deuk-agent", "notes"), { recursive: true });
    mkdirSync(join(cwd, ".deuk-agent", "tmp-data"), { recursive: true });
    mkdirSync(join(cwd, ".deuk-agent", "tickets", "core"), { recursive: true });
    mkdirSync(join(cwd, ".deuk-agent", "tickets", "archive", "main"), { recursive: true });

    writeFileSync(join(cwd, ".deuk-agent", "notes", "loose-plan.md"), "# Plan\n", "utf8");
    writeFileSync(join(cwd, ".deuk-agent", "tmp-data", "fact.json"), "{\"ok\":true}\n", "utf8");
    writeFileSync(join(cwd, ".deuk-agent", "tmp-data", "distilled.json"), JSON.stringify({
      id: "distilled",
      summary: "distilled fact",
      sourceKind: "ticket",
      ingestionCategory: "archived_ticket",
      corpus: "tickets",
      originTool: "ticket-archive",
      freshness: "archived",
      refreshPolicy: "refresh-on-stale",
      sourceTicketPath: ".deuk-agent/tickets/sub/distilled.md",
      sections: {},
      analysis: {}
    }, null, 2), "utf8");
    writeFileSync(join(cwd, ".deuk-agent", "tmp-data", "legacy-distilled.json"), JSON.stringify({
      id: "legacy-distilled",
      summary: "legacy distilled fact",
      sourceTicketPath: ".deuk-agent/tickets/sub/legacy-distilled.md",
      sections: {},
      analysis: {}
    }, null, 2), "utf8");
    writeFileSync(join(cwd, ".deuk-agent", "legacy", "junk.md"), "# Junk\n", "utf8");
    writeFileSync(join(cwd, ".deuk-agent", "extra.txt"), "extra\n", "utf8");
    writeFileSync(join(cwd, ".deuk-agent", "docs", "random", "misplaced-report.md"), "# Report\n", "utf8");
    writeFileSync(join(cwd, ".deuk-agent", "tickets", "core", "200-old.md"), [
      "---",
      "id: 200-old",
      "status: archived",
      "createdAt: 2026-05-01 10:00:00",
      "---",
      "",
      "# Old",
      ""
    ].join("\n"), "utf8");
    writeFileSync(join(cwd, ".deuk-agent", "tickets", "archive", "main", "201-open.md"), [
      "---",
      "id: 201-open",
      "status: open",
      "---",
      "",
      "# Open",
      ""
    ].join("\n"), "utf8");

    enforceCanonicalAgentLayout(cwd, false);

    assert.ok(existsSync(join(cwd, ".deuk-agent", "docs", "plan", "loose-plan.md")));
    assert.ok(existsSync(join(cwd, ".deuk-agent", "docs", "plan", "fact.json")));
    assert.ok(existsSync(join(cwd, ".deuk-agent", "knowledge", "distilled.json")));
    assert.ok(existsSync(join(cwd, ".deuk-agent", "docs", "plan", "junk.md")));
    assert.ok(existsSync(join(cwd, ".deuk-agent", "docs", "plan", "extra.txt")));
    assert.ok(existsSync(join(cwd, ".deuk-agent", "docs", "plan", "misplaced-report.md")));
    assert.ok(existsSync(join(cwd, ".deuk-agent", "tickets", "archive", "sub", "2026-05", "01", "200-old.md")));
    assert.ok(existsSync(join(cwd, ".deuk-agent", "tickets", "sub", "201-open.md")));
    assert.ok(existsSync(join(cwd, ".deuk-agent", "knowledge", "legacy-distilled.json")), "legacy distilled knowledge should remain knowledge");
    assert.ok(!existsSync(join(cwd, ".deuk-agent", "legacy")));
    assert.ok(!existsSync(join(cwd, ".deuk-agent", "notes")));
    assert.ok(!existsSync(join(cwd, ".deuk-agent", "tmp-data")));
    assert.ok(!existsSync(join(cwd, ".deuk-agent", "tickets", "core")));
    assert.ok(!existsSync(join(cwd, ".deuk-agent", "tickets", "archive", "main")));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
