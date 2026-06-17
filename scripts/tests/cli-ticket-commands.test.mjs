import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  pickTicketEntry,
  runTicketArchive,
  runTicketCreate,
  runTicketClose,
  runTicketMove,
  runTicketStatus,
  runTicketGuard,
  runTicketUse
} from "../cli-ticket-commands.mjs";
import { readTicketIndexJson, syncActiveTicketId } from "../cli-ticket-index.mjs";
import { lintMarkdownPaths } from "../lint-md.mjs";
import { TICKET_INDEX_FILENAME } from "../cli-utils.mjs";

function makeIndex(entries) {
  return { version: 1, updatedAt: "2026-05-01T00:00:00.000Z", entries };
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

function minimalEvidencePhase1Plan(title = "phase1 ticket") {
  return [
    `# ${title}`,
    "",
    "## Agent Permission Contract (APC)",
    "[BOUNDARY]",
    "- Change only the ticket lifecycle behavior under test.",
    "[CONTRACT]",
    "- Keep ticket validation aligned with the runtime contract.",
    "[PATCH PLAN]",
    "- Use the smallest ticket fixture that exercises the requested guard.",
    "",
    "## Compact Plan",
    "- Finding: the ticket owns a single lifecycle contract.",
    "- Direction: validate the contract with one focused fixture.",
    "- Verification: run the focused ticket-command tests.",
    "",
    "## Problem Analysis",
    "- The lifecycle command must enforce the intended ticket contract.",
    "",
    "## Source Observations",
    "- `scripts/cli-ticket-commands.mjs` owns the command behavior.",
    "",
    "## Cause Hypotheses",
    "- The lifecycle path can drift when guard logic is not exercised directly.",
    "",
    "## Improvement Direction",
    "- Keep one durable test per important lifecycle contract.",
    "",
    "## Audit Evidence",
    "- `node --test scripts/tests/cli-ticket-commands.test.mjs` verifies the compact lifecycle suite."
  ].join("\n");
}

function makeTicketWorkspace(entries) {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-ticket-next-"));
  const ticketDir = join(cwd, ".deuk-agent", "tickets");
  mkdirSync(ticketDir, { recursive: true });
  writeFileSync(join(ticketDir, TICKET_INDEX_FILENAME), JSON.stringify(makeIndex(entries), null, 2) + "\n", "utf8");
  return { cwd, ticketDir };
}

function makeTemplateWorkspace() {
  const { cwd, ticketDir } = makeTicketWorkspace([]);
  const templateDir = join(cwd, ".deuk-agent", "templates");
  mkdirSync(templateDir, { recursive: true });
  writeFileSync(join(templateDir, "TICKET_TEMPLATE.md"), [
    "---",
    "<%- frontmatter %>",
    "---",
    "# <%= meta.title %>",
    ""
  ].join("\n"), "utf8");
  return { cwd, ticketDir };
}

function writeTicketFile(cwd, relPath, lines) {
  const absPath = join(cwd, relPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, lines.join("\n"), "utf8");
  return absPath;
}

function writeCliTicketFile(cwd, entry, overrides = {}) {
  const relPath = entry.path || join(".deuk-agent", "tickets", "sub", entry.fileName || `${entry.id}.md`);
  writeTicketFile(cwd, relPath, [
    "---",
    `id: ${entry.id}`,
    `topic: ${entry.topic || entry.id}`,
    `title: ${entry.title || entry.topic || entry.id}`,
    `phase: ${overrides.phase || 1}`,
    `status: ${overrides.status || entry.status || "open"}`,
    "lifecycleSource: ticket-create",
    `project: ${entry.project || "global"}`,
    `submodule: ${entry.submodule || ""}`,
    `summary: ${overrides.summary || "cli-created ticket"}`,
    "---",
    `# ${entry.title || entry.topic || entry.id}`,
    ""
  ]);
  return relPath;
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
      project: "DeukAgentFlow",
      submodule: "DeukPack",
      createdAt: "2026-05-01 09:00:00"
    })
  ]);

  assert.strictEqual(pickTicketEntry({}, index).id, "001-global-host");
  assert.strictEqual(pickTicketEntry({ submodule: "DeukPack" }, index).id, "002-deukpack-host");
  assert.strictEqual(pickTicketEntry({ project: "DeukAgentFlow", submodule: "DeukPack" }, index).id, "002-deukpack-host");
  assert.strictEqual(pickTicketEntry({ project: "Other", submodule: "DeukPack" }, index), null);
});

test("runTicketUse compact output is only one clickable ticket-start line", async () => {
  const entry = makeEntry({
    id: "001-compact-use-host",
    topic: "001-compact-use-host",
    title: "compact use",
    fileName: "001-compact-use-host.md",
    path: ".deuk-agent/tickets/sub/001-compact-use-host.md",
    project: "DeukPack",
    status: "open"
  });
  const { cwd } = makeTicketWorkspace([entry]);
  writeCliTicketFile(cwd, entry);

  const originalLog = console.log;
  const lines = [];
  console.log = value => lines.push(String(value));
  try {
    await runTicketUse({ cwd, topic: "001-compact", nonInteractive: true });
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }

  assert.deepStrictEqual(lines, [`Ticket start: [${entry.id}](${join(cwd, entry.path)})`]);
  assert.ok(lines.every(line => !/Active ticket|Path:|file:\/\/|Usage|deuk-agent-flow/i.test(line)));
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
        assert.match(err.message, /ticket create requires a filled Phase 1 plan body/);
        assert.match(err.message, /plan_body_file_required/);
        return true;
      }
    );

    const index = readTicketIndexJson(cwd);
    assert.strictEqual(index.entries.length, 0);
    assert.ok(!readdirSync(srcDir).some(name => name.includes("strict-plan-scaffold-ticket")));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
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
        skipPhase0: true,
        planBody: `${minimalEvidencePhase1Plan("lint guard")}\n\n[broken](./missing.md)\n`
      }),
      /markdown lint failed/
    );

    const index = readTicketIndexJson(cwd);
    assert.strictEqual(index.entries.length, 0);
    const ticketSubDir = join(ticketDir, "sub");
    const ticketFiles = existsSync(ticketSubDir)
      ? readdirSync(ticketSubDir).filter(name => name.endsWith(".md"))
      : [];
    assert.strictEqual(ticketFiles.length, 0);
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

test("runTicketCreate prints compact clickable ticket start and approval state", async () => {
  const { cwd } = makeTicketWorkspace([]);
  const originalLog = console.log;
  const originalWarn = console.warn;
  const lines = [];
  console.log = value => { lines.push(String(value)); };
  console.warn = () => {};

  try {
    await runTicketCreate({
      cwd,
      topic: "create-needs-approval",
      summary: "ticket create should stop on approval pending",
      planBody: minimalEvidencePhase1Plan("create needs approval"),
      nonInteractive: true,
      docsLanguage: "en",
      skipPhase0: true,
      requireFilled: true
    });

    assert.ok(lines.some(line => /^Ticket created: /.test(line)));
    assert.ok(lines.some(line => /^Ticket start: \[001-create-needs-approval-.*\]\(\/.*\.md\)$/.test(line)));
    assert.ok(lines.some(line => line === "Approval pending: explicit user approval is required before work."));
    assert.ok(lines.some(line => /^Guard topic: 001-create-needs-approval-/.test(line)));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketCreate rejects non-ascii topic instead of creating a generic fallback slug", async () => {
  const { cwd, ticketDir } = makeTemplateWorkspace();

  try {
    await assert.rejects(
      () => runTicketCreate({
        cwd,
        topic: "기본 프로토콜 동작 테스트 재정의",
        summary: "reject generic fallback slug",
        planBody: minimalEvidencePhase1Plan("basic protocol pack unpack test redefinition"),
        nonInteractive: true,
        docsLanguage: "ko",
        skipPhase0: true,
        requireFilled: true
      }),
      err => {
        assert.match(err.message, /ticket topic must produce a non-empty ASCII slug/);
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
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketGuard accepts only complete CLI-created Phase 1 tickets", async () => {
  const { cwd } = makeTicketWorkspace([]);
  const originalLog = console.log;
  const originalWarn = console.warn;
  const lines = [];
  console.log = value => { lines.push(String(value)); };
  console.warn = () => {};

  try {
    await runTicketCreate({
      cwd,
      topic: "guard-complete-ticket",
      summary: "guard validates durable ticket before workflow context",
      planBody: minimalEvidencePhase1Plan("guard complete ticket"),
      nonInteractive: true,
      docsLanguage: "en",
      skipPhase0: true,
      requireFilled: true
    });

    lines.length = 0;
    const out = await runTicketGuard({
      cwd,
      topic: "guard-complete-ticket",
      nonInteractive: true,
      ticketStarted: true,
      ticketReviewed: true,
      approval: "approved"
    });

    assert.match(out.id, /^001-guard-complete-ticket-/);
    assert.strictEqual(out.phase, 1);
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], /^ticket-context-ok 001-guard-complete-ticket-/);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketMove requires explicit approval before Phase 2 execution", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/001-approval-gate.md";
  const { cwd } = makeTicketWorkspace([
    makeEntry({
      id: "001-approval-gate",
      title: "approval gate",
      topic: "approval-gate",
      fileName: "001-approval-gate.md",
      path: ticketPath,
      status: "open",
      phase: 1
    })
  ]);

  writeTicketFile(cwd, ticketPath, [
    "---",
    "id: 001-approval-gate",
    "title: approval gate",
    "phase: 1",
    "status: open",
    "summary: require explicit review approval before execution",
    "priority: P2",
    "tags: [test]",
    "---",
    "# approval gate",
    "",
    "## Agent Permission Contract (APC)",
    "### [BOUNDARY]",
    "- Editable modules: source module",
    "",
    "### [CONTRACT]",
    "- Input: source context",
    "- Output: bounded implementation",
    "",
    "### [PATCH PLAN]",
    "- Implement the reviewed bounded change.",
    "",
    "## Compact Plan",
    "",
    "- **Finding:** The ticket has complete planning evidence.",
    "- **Root cause / hypothesis:** Planning completeness is separate from review approval.",
    "- **Approach:** Require an explicit approval flag before execution.",
    "- **Verification:** Move without approval is rejected.",
    "",
    "## Problem Analysis",
    "",
    "The lifecycle move path must not treat a complete plan as approval to execute.",
    "",
    "## Source Observations",
    "",
    "- runTicketMove can receive a complete ticket without an approval flag.",
    "",
    "## Cause Hypotheses",
    "",
    "- Planning completeness and review approval are currently separate lifecycle states.",
    "",
    "## Improvement Direction",
    "",
    "Keep Phase 2 blocked until the caller passes --workflow execute or --approval approved.",
    "",
    "## Audit Evidence",
    "",
    "- `scripts/cli-ticket-commands.mjs` must distinguish planning completeness from approval.",
    ""
  ]);

  try {
    await assert.rejects(
      () => runTicketMove({ cwd, topic: "001", next: true, nonInteractive: true }),
      /APPROVAL REQUIRED/
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketMove ignores unrelated dirty markdown during lifecycle lint", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/003-default-host.md";
  const { cwd } = makeTicketWorkspace([
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

  writeTicketFile(cwd, ticketPath, [
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
    "",
    "### [PATCH PLAN]",
    "- Plan pointer",
    "",
    "## Compact Plan",
    "",
    "- **Finding:** Lifecycle lint should focus on ticket-related markdown only.",
    "- **Root cause / hypothesis:** Unrelated dirty markdown should not block ticket lifecycle moves.",
    "- **Approach:** Move only after Phase 1 evidence passes, while leaving unrelated markdown dirty.",
    "- **Verification:** Confirm the move succeeds and ignores the unrelated broken markdown.",
    "",
    "## Problem Analysis",
    "",
    "Lifecycle moves should not depend on unrelated dirty markdown elsewhere in the worktree.",
    "",
    "## Improvement Direction",
    "",
    "Validate main-ticket planning first, then lint only the lifecycle-related markdown.",
    ""
  ]);

  try {
    writeFileSync(join(cwd, "AGENTS.md"), "# Rules\n\nValid.\n", "utf8");
    spawnSync("git", ["init"], { cwd, encoding: "utf8" });
    spawnSync("git", ["add", "AGENTS.md"], { cwd, encoding: "utf8" });
    spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "seed"], { cwd, encoding: "utf8" });
    writeFileSync(join(cwd, "AGENTS.md"), "# Rules\n\nBroken [link](./missing.md)\n", "utf8");

    await runTicketMove({ cwd, topic: "003", next: true, nonInteractive: true, approval: "approved" });

    const body = readFileSync(join(cwd, ticketPath), "utf8");
    assert.match(body, /phase: 2/);
    assert.match(body, /status: active/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketClose accepts explicit no-follow-up decision without improvement direction", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/002-no-follow-up-close.md";
  const { cwd } = makeTicketWorkspace([
    makeEntry({
      id: "002-no-follow-up-close",
      title: "no follow-up close",
      topic: "no-follow-up-close",
      fileName: "002-no-follow-up-close.md",
      path: ticketPath,
      status: "active",
      phase: 2
    })
  ]);

  writeTicketFile(cwd, ticketPath, [
    "---",
    "id: 002-no-follow-up-close",
    "title: no follow-up close",
    "phase: 2",
    "status: active",
    "summary: workflow close should allow explicit no-follow-up",
    "priority: P2",
    "tags: [test]",
    "---",
    "# no follow up close",
    "",
    "## Verification Outcome",
    "",
    "- Verified the workflow closes cleanly without a new follow-up ticket.",
    "",
    "## Problem Analysis",
    "",
    "This ticket should be closable when the result is complete and no extra work remains.",
    "",
    "## Follow-up Decision",
    "",
    "- no-follow-up: verification passed and no further work is required.",
    "",
    "## Audit Evidence",
    "",
    "- `scripts/cli-ticket-commands.mjs` owns the close guard path.",
    ""
  ]);

  try {
    await runTicketClose({ cwd, topic: "002", nonInteractive: true });
    const body = readFileSync(join(cwd, ticketPath), "utf8");
    assert.match(body, /phase: 4/);
    assert.match(body, /status: closed/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketArchive ignores unrelated dirty markdown during lifecycle lint", async () => {
  const ticketPath = ".deuk-agent/tickets/sub/004-default-host.md";
  const { cwd } = makeTicketWorkspace([
    makeEntry({
      id: "004-default-host",
      title: "archive-with-dirty-worktree",
      topic: "004-default-host",
      fileName: "004-default-host.md",
      path: ticketPath,
      status: "closed"
    })
  ]);

  writeTicketFile(cwd, ticketPath, [
    "---",
    "id: 004-default-host",
    "title: archive-with-dirty-worktree",
    "phase: 4",
    "status: closed",
    "summary: archive dirty worktree test",
    "priority: P2",
    "tags: [test]",
    "---",
    "# default",
    ""
  ]);

  spawnSync("git", ["init"], { cwd, encoding: "utf8" });
  spawnSync("git", ["add", ".deuk-agent"], { cwd, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "seed"], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com"
    }
  });

  mkdirSync(join(cwd, ".codex"), { recursive: true });
  writeFileSync(join(cwd, ".codex", "AGENTS.md"), [
    "---",
    "> invalid YAML pointer content",
    "---",
    "# Generated pointer",
    ""
  ].join("\n"), "utf8");

  try {
    const archived = await runTicketArchive({ cwd, topic: "004", nonInteractive: true });
    assert.ok(archived.path.includes("archive/"));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketStatus compact mode emits one-line phase summary", async () => {
  const ticketId = "001-compact-status-host";
  const { cwd, ticketDir } = makeTemplateWorkspace();
  mkdirSync(join(cwd, ".deuk-agent", "docs", "plan"), { recursive: true });

  writeTicketFile(cwd, join(".deuk-agent", "tickets", "sub", `${ticketId}.md`), [
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
    "",
    "## Problem Analysis",
    "Compact status should report one concise lifecycle line for complete tickets.",
    "",
    "## Improvement Direction",
    "Keep compact status output terse while surfacing incomplete planning reasons.",
    ""
  ]);
  writeTicketFile(cwd, join(".deuk-agent", "docs", "plan", `${ticketId}-plan.md`), [
    "---",
    "summary: compact status plan",
    "status: draft",
    "priority: P2",
    "tags: [plan]",
    "---",
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
  ]);
  writeFileSync(join(ticketDir, "INDEX.json"), JSON.stringify(makeIndex([makeEntry({
    id: ticketId,
    title: "compact status host",
    topic: ticketId,
    fileName: `${ticketId}.md`,
    path: `.deuk-agent/tickets/sub/${ticketId}.md`,
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

test("syncActiveTicketId prefers the newest open ticket for continuation", () => {
  const oldTicket = makeEntry({
    id: "001-old-open-host",
    topic: "001-old-open-host",
    title: "old open",
    fileName: "001-old-open-host.md",
    createdAt: "2026-05-01 00:00:00",
    status: "open"
  });
  const newTicket = makeEntry({
    id: "002-new-open-host",
    topic: "002-new-open-host",
    title: "new open",
    fileName: "002-new-open-host.md",
    createdAt: "2026-05-08 12:00:00",
    status: "open"
  });
  const { cwd } = makeTicketWorkspace([oldTicket, newTicket]);

  try {
    writeCliTicketFile(cwd, oldTicket, { summary: "old ticket", phase: 1, status: "open" });
    writeCliTicketFile(cwd, newTicket, { summary: "new ticket", phase: 1, status: "open" });

    syncActiveTicketId(cwd);

    const index = readTicketIndexJson(cwd);
    assert.strictEqual(index.activeTicketId, "002-new-open-host");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runTicketHandoff compact mode includes telemetry summary", async () => {
  const ticketId = "001-handoff-telemetry-host";
  const { cwd, ticketDir } = makeTemplateWorkspace();
  const entry = makeEntry({
    id: ticketId,
    topic: ticketId,
    title: "handoff telemetry host",
    fileName: `${ticketId}.md`,
    createdAt: "2026-05-08 12:00:00",
    status: "open"
  });

  writeFileSync(join(ticketDir, "INDEX.json"), JSON.stringify(makeIndex([entry]), null, 2) + "\n", "utf8");
  writeCliTicketFile(cwd, { ...entry, path: `.deuk-agent/tickets/sub/${entry.fileName}` }, { summary: "handoff telemetry", phase: 2, status: "open" });
  mkdirSync(join(cwd, ".deuk-agent"), { recursive: true });
  writeFileSync(join(cwd, ".deuk-agent", "telemetry.jsonl"), [
    JSON.stringify({ ts: 1, tokens: 30, tdw: 10, model: "gpt-5", client: "Codex", ticket: ticketId, action: "work", event: "work", file: "", synced: false }),
    JSON.stringify({ ts: 2, tokens: 20, tdw: 0, model: "gpt-5", client: "Codex", ticket: ticketId, action: "review", event: "", file: "", synced: false })
  ].join("\n") + "\n", "utf8");

  const originalLog = console.log;
  const lines = [];
  console.log = value => { lines.push(String(value)); };
  try {
    const { runTicketHandoff } = await import("../cli-ticket-commands.mjs");
    await runTicketHandoff({ cwd, topic: ticketId, compact: true });
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }

  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /telemetry logs 2, coverage 50\.0%, tdw 50\.0%/);
});
