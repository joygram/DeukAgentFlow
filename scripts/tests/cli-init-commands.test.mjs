import test from "node:test";
import assert from "node:assert";
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGlobalCodexInstructions, canonicalizeDocsArchiveBuckets, enforceCanonicalAgentLayout, ensureSourceModeCommandShims, generateSpokeContent, mergeManagedRuleContent, migrateLegacyStructure, runInit } from "../cli-init-commands.mjs";

test("source mode creates installed-command shims when CLI commands are not on PATH", () => {
  const root = mkdtempSync(join(tmpdir(), "deuk-source-mode-"));
  const binDir = join(root, "bin-out");
  const sourceRoot = join(root, "DeukAgentFlow");
  const sourceBin = join(sourceRoot, "bin");
  mkdirSync(sourceBin, { recursive: true });
  writeFileSync(join(sourceBin, "deuk-agent-flow.js"), "#!/usr/bin/env node\n", "utf8");
  writeFileSync(join(sourceBin, "deuk-agent-rule.js"), "#!/usr/bin/env node\n", "utf8");

  try {
    const result = ensureSourceModeCommandShims(sourceRoot, {
      binDir,
      pathEnv: "",
      platform: "linux"
    });

    assert.deepStrictEqual(result.created, ["deuk-agent-flow", "deukagentflow", "deuk-agent-rule", "deukagentrule"]);
    assert.strictEqual(result.onPath, false);
    assert.ok(lstatSync(join(binDir, "deuk-agent-flow")).isSymbolicLink());
    assert.ok(lstatSync(join(binDir, "deuk-agent-rule")).isSymbolicLink());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("source mode skips shim creation when installed command already exists on PATH", () => {
  const root = mkdtempSync(join(tmpdir(), "deuk-source-mode-installed-"));
  const sourceRoot = join(root, "DeukAgentFlow");
  const sourceBin = join(sourceRoot, "bin");
  const pathBin = join(root, "path-bin");
  const shimBin = join(root, "shim-bin");
  mkdirSync(sourceBin, { recursive: true });
  mkdirSync(pathBin, { recursive: true });
  writeFileSync(join(sourceBin, "deuk-agent-flow.js"), "#!/usr/bin/env node\n", "utf8");
  writeFileSync(join(sourceBin, "deuk-agent-rule.js"), "#!/usr/bin/env node\n", "utf8");
  writeFileSync(join(pathBin, "deuk-agent-flow"), "#!/bin/sh\n", "utf8");

  try {
    const result = ensureSourceModeCommandShims(sourceRoot, {
      binDir: shimBin,
      pathEnv: pathBin,
      platform: "linux"
    });

    assert.ok(result.skipped.includes("deuk-agent-flow"));
    assert.ok(!existsSync(join(shimBin, "deuk-agent-flow")));
    assert.ok(existsSync(join(shimBin, "deuk-agent-rule")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runInit replaces broken DeukAgentRules AGENTS pointer with DeukAgentFlow canonical pointer", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-canonical-agents-"));
  try {
    writeFileSync(join(cwd, "AGENTS.md"), [
      "---",
      "",
      "## DeukAgentRules",
      "",
      "> Managed by DeukAgentRules. Remove this section if not installed.",
      "",
      "# Deuk Agent Rules",
      "",
      "**[MANDATORY — TOOL CALL REQUIRED]** Core rules are at: [AGENTS.md](file:///home/joy/workspace/DeukAgentRules/core-rules/AGENTS.md)",
      "",
      "This pointer is a thin bootstrap, not a second workflow contract.",
      ""
    ].join("\n"), "utf8");

    await runInit({
      cwd,
      dryRun: false,
      nonInteractive: true,
      workflow: "execute",
      approval: "approved",
      sourceShims: false
    }, "/home/joy/workspace/DeukAgentFlow");

    const body = readFileSync(join(cwd, "AGENTS.md"), "utf8");
    assert.match(body, /## DeukAgentFlow/);
    assert.match(body, /file:\/\/\/home\/joy\/workspace\/DeukAgentFlow\/core-rules\/AGENTS\.md/);
    assert.doesNotMatch(body, /DeukAgentRules/);
    assert.doesNotMatch(body, /DeukAgentRules\/core-rules/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runInit migrates nested legacy AGENTS surfaces through init", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-nested-agents-"));
  try {
    const nestedDir = join(cwd, "apps", "web");
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(join(nestedDir, "AGENTS.md"), [
      "<!-- deuk-agent-rule:begin -->",
      "# Old Workflow",
      "Use npx deuk-agent-rule ticket create.",
      "<!-- deuk-agent-rule:end -->",
      ""
    ].join("\n"), "utf8");

    await runInit({
      cwd,
      dryRun: false,
      nonInteractive: true,
      workflow: "execute",
      approval: "approved",
      sourceShims: false
    }, "/home/joy/workspace/DeukAgentFlow");

    const body = readFileSync(join(nestedDir, "AGENTS.md"), "utf8");
    assert.match(body, /## DeukAgentFlow/);
    assert.match(body, /file:\/\/\/home\/joy\/workspace\/DeukAgentFlow\/core-rules\/AGENTS\.md/);
    assert.doesNotMatch(body, /deuk-agent-rule/);
    assert.doesNotMatch(body, /<!-- deuk-agent-rule:begin -->/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("enforceCanonicalAgentLayout preserves runtime skill and usage state files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-agent-layout-state-"));
  try {
    const agentRoot = join(cwd, ".deuk-agent");
    mkdirSync(agentRoot, { recursive: true });
    writeFileSync(join(agentRoot, "skills.json"), JSON.stringify({ installed: ["project-pilot"] }, null, 2) + "\n", "utf8");
    writeFileSync(join(agentRoot, "usage.json"), JSON.stringify({ platform: "codex" }, null, 2) + "\n", "utf8");

    enforceCanonicalAgentLayout(cwd, false);

    assert.ok(existsSync(join(agentRoot, "skills.json")));
    assert.ok(existsSync(join(agentRoot, "usage.json")));
    assert.strictEqual(JSON.parse(readFileSync(join(agentRoot, "skills.json"), "utf8")).installed[0], "project-pilot");
    assert.strictEqual(JSON.parse(readFileSync(join(agentRoot, "usage.json"), "utf8")).platform, "codex");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runInit replaces legacy generated spoke content and rewrites gitignore marker", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-legacy-spoke-"));
  try {
    mkdirSync(join(cwd, ".claude", "rules"), { recursive: true });
    mkdirSync(join(cwd, ".cursor", "rules"), { recursive: true });
    writeFileSync(join(cwd, ".claude", "rules", "deuk-agent.md"), [
      "---",
      "",
      "## DeukAgentRules",
      "",
      "> Managed by DeukAgentRules. Remove this section if not installed.",
      "",
      "# Deuk Agent Rules",
      "",
      "**[MANDATORY — TOOL CALL REQUIRED]** Core rules are at: [AGENTS.md](file:///home/joy/workspace/DeukAgentRules/core-rules/AGENTS.md)",
      "",
      "This pointer is a thin bootstrap, not a second workflow contract.",
      "",
      "1. FIRST tool call: read the core rules file above and internally note its frontmatter version.",
      "2. Then read local `PROJECT_RULE.md` and internally identify applicable DC-* rules.",
      "3. After the core hub is loaded, `core-rules/AGENTS.md` is the DeukAgentRules SSoT for TDW, RAG, silence, scope, and verification.",
      "",
      "Do not print pointer/core metadata, version, DC-* lists, progress commentary, or interim summaries. Before the final answer, only the single required ticket-start line, blockers, explicit user-requested output, or explicit command results may appear. After approval, do not narrate progress unless the user explicitly asks for live narration or a blocker/user decision must be surfaced.",
      ""
    ].join("\n"), "utf8");
    writeFileSync(join(cwd, ".cursor", "rules", "deuk-agent.mdc"), [
      "---",
      'description: "Deuk Agent Rules - Project conventions and ticket workflow"',
      'globs: ["**/*"]',
      "alwaysApply: true",
      "---",
      "# Deuk Agent Rules",
      "",
      "**[MANDATORY — TOOL CALL REQUIRED]** Core rules are at: [AGENTS.md](file:///home/joy/workspace/DeukAgentRules/core-rules/AGENTS.md)",
      "",
      "This pointer is a thin bootstrap, not a second workflow contract.",
      "",
      "1. FIRST tool call: read the core rules file above and internally note its frontmatter version.",
      "2. Then read local `PROJECT_RULE.md` and internally identify applicable DC-* rules.",
      "3. After the core hub is loaded, `core-rules/AGENTS.md` is the DeukAgentRules SSoT for TDW, RAG, silence, scope, and verification.",
      "",
      "Do not print pointer/core metadata, version, DC-* lists, progress commentary, or interim summaries. Before the final answer, only the single required ticket-start line, blockers, explicit user-requested output, or explicit command results may appear. After approval, do not narrate progress unless the user explicitly asks for live narration or a blocker/user decision must be surfaced.",
      ""
    ].join("\n"), "utf8");
    writeFileSync(join(cwd, ".gitignore"), [
      "# deuk-agent-rule: agent hub directory (local, not committed by default)",
      ".deuk-agent/",
      ""
    ].join("\n"), "utf8");

    await runInit({
      cwd,
      dryRun: false,
      nonInteractive: true,
      workflow: "execute",
      approval: "approved",
      sourceShims: false
    }, "/home/joy/workspace/DeukAgentFlow");

    const claudeBody = readFileSync(join(cwd, ".claude", "rules", "deuk-agent.md"), "utf8");
    const cursorBody = readFileSync(join(cwd, ".cursor", "rules", "deuk-agent.mdc"), "utf8");
    const gitignoreBody = readFileSync(join(cwd, ".gitignore"), "utf8");

    assert.doesNotMatch(claudeBody, /DeukAgentRules/);
    assert.doesNotMatch(cursorBody, /DeukAgentRules/);
    assert.match(claudeBody, /## DeukAgentFlow/);
    assert.match(cursorBody, /# Deuk Agent Flow/);
    assert.equal((claudeBody.match(/deuk-agent-managed:begin/g) || []).length, 1);
    assert.equal((cursorBody.match(/deuk-agent-managed:begin/g) || []).length, 1);
    assert.doesNotMatch(gitignoreBody, /# deuk-agent-rule:/);
    assert.match(gitignoreBody, /# deuk-agent-flow: agent hub directory/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runInit replaces legacy CLAUDE.md with claude spoke without backup churn", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-claude-legacy-"));
  try {
    writeFileSync(join(cwd, "CLAUDE.md"), [
      "---",
      "",
      "## DeukAgentRules",
      "",
      "> Managed by DeukAgentRules. Remove this section if not installed.",
      "",
      "# Deuk Agent Rules",
      "",
      "**[MANDATORY — TOOL CALL REQUIRED]** Core rules are at: [AGENTS.md](file:///home/joy/workspace/DeukAgentRules/core-rules/AGENTS.md)",
      "",
      "This pointer is a thin bootstrap, not a second workflow contract.",
      ""
    ].join("\n"), "utf8");

    await runInit({
      cwd,
      dryRun: false,
      nonInteractive: true,
      workflow: "execute",
      approval: "approved",
      sourceShims: false
    }, "/home/joy/workspace/DeukAgentFlow");

    assert.ok(!existsSync(join(cwd, "CLAUDE.md")));
    assert.ok(!existsSync(join(cwd, "CLAUDE.md.bak")));
    const spoke = readFileSync(join(cwd, ".claude", "rules", "deuk-agent.md"), "utf8");

    assert.match(spoke, /## DeukAgentFlow/);
    assert.match(spoke, /deuk-agent-managed:begin/);
    assert.doesNotMatch(spoke, /DeukAgentRules/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runInit installs root AGENTS.md for existing .deuk-agent projects without detected tools", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-agent-root-default-"));
  try {
    mkdirSync(join(cwd, ".deuk-agent"), { recursive: true });

    await runInit({
      cwd,
      dryRun: false,
      nonInteractive: true,
      workflow: "execute",
      approval: "approved",
      sourceShims: false
    }, "/home/joy/workspace/DeukAgentFlow");

    const body = readFileSync(join(cwd, "AGENTS.md"), "utf8");
    assert.match(body, /## DeukAgentFlow/);
    assert.match(body, /Core rules are at:/);
    assert.doesNotMatch(body, /DeukAgentRules/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runInit moves legacy .deuk-agent-ticket out of active ticket roots", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-legacy-ticket-root-"));
  try {
    const legacySub = join(cwd, ".deuk-agent-ticket", "sub");
    mkdirSync(legacySub, { recursive: true });
    writeFileSync(join(legacySub, "001-legacy.md"), [
      "# Legacy Ticket",
      "- old command: deuk-agent-rule ticket use",
      ""
    ].join("\n"), "utf8");

    await runInit({
      cwd,
      dryRun: false,
      nonInteractive: true,
      workflow: "execute",
      approval: "approved",
      sourceShims: false
    }, "/home/joy/workspace/DeukAgentFlow");

    assert.ok(!existsSync(join(cwd, ".deuk-agent-ticket")), "legacy ticket root should be removed");
    assert.ok(!existsSync(join(cwd, ".deuk-agent", "tickets", "sub", "001-legacy.md")), "legacy tickets should not become active tickets");

    const archiveRoot = join(cwd, ".deuk-agent", "tickets", "archive", "sub");
    const stack = [archiveRoot];
    let archived = false;
    while (stack.length > 0) {
      const dir = stack.pop();
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (lstatSync(p).isDirectory()) stack.push(p);
        if (p.endsWith("001-legacy.md")) archived = true;
      }
    }
    assert.ok(archived, "legacy ticket should be moved under archive import");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

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
  assert.match(content, /core-rules\/AGENTS\.md` is the DeukAgentFlow SSoT/);
  assert.match(content, /Do not print pointer\/core metadata/);
  assert.match(content, /only the single required ticket-start line, blockers, explicit user-requested output, or explicit command results may appear/i);
  assert.match(content, /During approved_execution, command_running, or search_running, stay silent unless the user explicitly asks for live narration/i);
});

test("global codex instructions stay locator-only", () => {
  const content = buildGlobalCodexInstructions();

  assert.match(content, /Global DeukAgentFlow Locator/);
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
    "# Deuk Agent Flow\n\nManaged block.\n"
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
      nonInteractive: true,
      workflow: "execute",
      approval: "approved",
      sourceShims: false
    }, "/home/joy/workspace/DeukAgentFlow");

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

test("runInit canonicalizes legacy day-depth archive tickets into year-month buckets", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-archive-month-only-"));
  try {
    const archiveDayDir = join(cwd, ".deuk-agent", "tickets", "archive", "sub", "2026-05", "07");
    mkdirSync(archiveDayDir, { recursive: true });

    const legacyTicketPath = join(archiveDayDir, "301-legacy-archive-depth-host.md");
    writeFileSync(legacyTicketPath, [
      "---",
      "id: 301-legacy-archive-depth-host",
      "title: legacy archive depth",
      "phase: 4",
      "status: archived",
      "summary: legacy archive depth ticket",
      "priority: P2",
      "tags: [test]",
      "---",
      "# legacy archive depth",
      ""
    ].join("\n"), "utf8");

    await runInit({
      cwd,
      dryRun: false,
      nonInteractive: true,
      workflow: "execute",
      approval: "approved",
      sourceShims: false
    }, "/home/joy/workspace/DeukAgentFlow");

    const normalizedPath = join(cwd, ".deuk-agent", "tickets", "archive", "sub", "2026-05", "301-legacy-archive-depth-host.md");
    assert.ok(existsSync(normalizedPath), "legacy day-depth archive ticket should move to year-month bucket");
    assert.ok(!existsSync(legacyTicketPath), "legacy day-depth archive ticket should be removed from day bucket");

    const archiveIndex = JSON.parse(readFileSync(join(cwd, ".deuk-agent", "tickets", "INDEX.archive.2026-05.json"), "utf8"));
    const entry = archiveIndex.entries.find(item => item.id === "301-legacy-archive-depth-host");
    assert.ok(entry, "archive index should include normalized ticket");
    assert.strictEqual(entry.archiveYearMonth, "2026-05");
    assert.ok(!Object.prototype.hasOwnProperty.call(entry, "archiveDay"), "archive index should drop archiveDay metadata");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runInit merges conflicting legacy-docs archive tickets into canonical month buckets", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-init-archive-legacy-docs-"));
  try {
    const monthDir = join(cwd, ".deuk-agent", "tickets", "archive", "sub", "2026-05");
    const legacyDir = join(cwd, ".deuk-agent", "tickets", "archive", "sub", "legacy-docs");
    mkdirSync(monthDir, { recursive: true });
    mkdirSync(legacyDir, { recursive: true });

    writeFileSync(join(monthDir, "project-rule.md"), "---\nsummary: a\nstatus: archived\npriority: P3\ntags: migrated\n---\nA\n", "utf8");
    writeFileSync(join(legacyDir, "project-rule.md"), "---\nsummary: b\nstatus: archived\npriority: P3\ntags: migrated\n---\nA\n\nB with different history\n", "utf8");

    await runInit({
      cwd,
      dryRun: false,
      nonInteractive: true,
      workflow: "execute",
      approval: "approved",
      sourceShims: false
    }, "/home/joy/workspace/DeukAgentFlow");

    assert.ok(existsSync(join(monthDir, "project-rule.md")));
    assert.ok(!existsSync(join(monthDir, "project-rule-legacy-docs.md")));
    assert.ok(!existsSync(join(legacyDir, "project-rule.md")));
    const merged = readFileSync(join(monthDir, "project-rule.md"), "utf8");
    assert.match(merged, /B with different history/);
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
    mkdirSync(join(cwd, ".deuk-agent", "skills", "safe-refactor"), { recursive: true });
    mkdirSync(join(cwd, ".deuk-agent", "skill-templates", "context-recall"), { recursive: true });
    mkdirSync(join(cwd, ".deuk-agent", "templates"), { recursive: true });
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
    writeFileSync(join(cwd, ".deuk-agent", "skills", "safe-refactor", "SKILL.md"), "# Safe Refactor\n", "utf8");
    writeFileSync(join(cwd, ".deuk-agent", "skill-templates", "context-recall", "SKILL.md"), "# Context Recall\n", "utf8");
    writeFileSync(join(cwd, ".deuk-agent", "templates", "PROJECT_RULE.md"), "# Project Rule Template\n", "utf8");
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
    assert.ok(existsSync(join(cwd, ".deuk-agent", "tickets", "archive", "sub", "2026-05", "200-old.md")));
    assert.ok(existsSync(join(cwd, ".deuk-agent", "tickets", "sub", "201-open.md")));
    assert.ok(existsSync(join(cwd, ".deuk-agent", "skills", "safe-refactor", "SKILL.md")));
    assert.ok(existsSync(join(cwd, ".deuk-agent", "skill-templates", "context-recall", "SKILL.md")));
    assert.ok(existsSync(join(cwd, ".deuk-agent", "templates", "PROJECT_RULE.md")));
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
