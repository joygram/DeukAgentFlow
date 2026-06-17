import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUsage } from "../cli-usage-commands.mjs";

test("usage set writes generic usage state with codex-first defaults", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-usage-set-"));
  const originalLog = console.log;
  console.log = () => {};
  try {
    await runUsage("set", {
      cwd,
      platform: "codex",
      client: "Codex",
      agentId: "codex-main",
      weeklyRemaining: 76,
      fiveHourRemaining: 42,
      weeklyReset: "2026-05-12 07:30",
      fiveHourReset: "2026-05-07 12:30",
      json: false
    });

    const saved = JSON.parse(readFileSync(join(cwd, ".deuk-agent", "usage.json"), "utf8"));
    assert.strictEqual(saved.platform, "codex");
    assert.strictEqual(saved.client, "Codex");
    assert.strictEqual(saved.agentId, "codex-main");
    assert.strictEqual(saved.weeklyRemainingPct, 76);
    assert.strictEqual(saved.fiveHourRemainingPct, 42);
    assert.strictEqual(saved.weeklyResetAt, "2026-05-12 07:30");
    assert.strictEqual(saved.fiveHourResetAt, "2026-05-07 12:30");
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("usage status prints compact lines", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-usage-status-"));
  const originalLog = console.log;
  const lines = [];
  console.log = (value) => lines.push(String(value));
  try {
    await runUsage("set", {
      cwd,
      client: "Codex",
      agentId: "codex-main",
      weeklyRemaining: 76,
      fiveHourRemaining: 42,
      weeklyReset: "2026-05-12 07:30",
      fiveHourReset: "",
      json: false
    });
    lines.length = 0;

    await runUsage("status", { cwd, json: false });

    assert.match(lines[0], /usage: Codex weekly 76%, 5h 42%/);
    assert.match(lines[1], /agent: codex-main/);
    assert.match(lines[2], /reset: weekly 2026-05-12 07:30/);
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("usage advise returns split guidance when budget is tight", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-usage-advise-"));
  const originalLog = console.log;
  const lines = [];
  console.log = (value) => lines.push(String(value));
  try {
    await runUsage("set", {
      cwd,
      client: "Codex",
      agentId: "codex-refactor",
      weeklyRemaining: 18,
      fiveHourRemaining: 12,
      weeklyReset: "2026-05-12 07:30",
      fiveHourReset: "2026-05-07 12:30",
      json: false
    });
    lines.length = 0;

    await runUsage("advise", {
      cwd,
      taskGrade: "S",
      taskLabel: "large refactor",
      turnCount: 18,
      json: false
    });

    assert.match(lines[0], /usage: Codex weekly 18%, 5h 12%/);
    assert.match(lines[1], /agent: codex-refactor/);
    assert.match(lines[2], /budget: S split/);
    assert.match(lines[3], /gate: no broad refactor/);
    assert.match(lines[4], /next: split ticket/);
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("usage advise recommends handoff and new chat for dense low-budget conversation", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-usage-chat-split-"));
  const originalLog = console.log;
  const lines = [];
  console.log = (value) => lines.push(String(value));
  try {
    await runUsage("set", {
      cwd,
      client: "Codex",
      agentId: "codex-main",
      weeklyRemaining: 34,
      fiveHourRemaining: 11,
      weeklyReset: "2026-05-12 07:30",
      fiveHourReset: "2026-05-07 12:30",
      json: false
    });
    lines.length = 0;

    await runUsage("advise", {
      cwd,
      taskGrade: "A",
      turnCount: 42,
      linkedTicketCount: 3,
      crossWorkspace: true,
      json: false
    });

    assert.match(lines[0], /usage: Codex weekly 34%, 5h 11%/);
    assert.match(lines[1], /agent: codex-main/);
    assert.match(lines[2], /budget: A split/);
    assert.match(lines[3], /gate: no broad refactor/);
    assert.match(lines[4], /next: split ticket/);
    assert.match(lines[5], /chat: handoff and start new chat/);
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("usage advise emits json payload", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-usage-advise-json-"));
  const originalLog = console.log;
  const lines = [];
  console.log = (value) => lines.push(String(value));
  try {
    await runUsage("set", {
      cwd,
      client: "Codex",
      agentId: "codex-main",
      weeklyRemaining: 76,
      fiveHourRemaining: 42,
      weeklyReset: "2026-05-12 07:30",
      fiveHourReset: "2026-05-07 12:30",
      json: false
    });
    lines.length = 0;

    await runUsage("advise", {
      cwd,
      taskGrade: "A",
      taskLabel: "rules cleanup",
      turnCount: 8,
      json: true
    });

    const payload = JSON.parse(lines.at(-1));
    assert.strictEqual(payload.client, "Codex");
    assert.strictEqual(payload.agentId, "codex-main");
    assert.strictEqual(payload.taskGrade, "A");
    assert.strictEqual(payload.taskLabel, "rules cleanup");
    assert.strictEqual(payload.budget, "A ok");
    assert.strictEqual(payload.next, "execute");
    assert.strictEqual(payload.conversationAction, "keep-current-chat");
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("usage set maps copilot platform to Copilot client by default", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "deuk-usage-copilot-"));
  const originalLog = console.log;
  console.log = () => {};
  try {
    await runUsage("set", {
      cwd,
      platform: "copilot",
      client: "",
      agentId: "copilot-main",
      weeklyRemaining: 64,
      fiveHourRemaining: 31,
      weeklyReset: "2026-05-12 07:30",
      fiveHourReset: "2026-05-07 12:30",
      json: false
    });

    const saved = JSON.parse(readFileSync(join(cwd, ".deuk-agent", "usage.json"), "utf8"));
    assert.strictEqual(saved.platform, "copilot");
    assert.strictEqual(saved.client, "Copilot");
    assert.strictEqual(saved.agentId, "copilot-main");
  } finally {
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }
});
