import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { 
  normalizeWorkflowMode, resolveWorkflowMode, WORKFLOW_MODE_EXECUTE, WORKFLOW_MODE_PLAN,
  parseFrontMatter, stringifyFrontMatter, deriveTopicFromBaseName, toSlug, computeTicketPath,
  normalizeTicketGroup,
  normalizeDocsLanguage, inferDocsLanguageFromText, resolveDocsLanguage, AGENT_ROOT_DIR, TICKET_SUBDIR, isMcpActive
} from "../cli-utils.mjs";
import { generateTicketId, computeNextTicketNumber } from "../cli-ticket-index.mjs";
import { parseArgs, parseSkillArgs, parseTelemetryArgs, parseTicketArgs } from "../cli-args.mjs";

test("cli-utils.mjs - normalizeWorkflowMode", (t) => {
  assert.strictEqual(normalizeWorkflowMode(undefined), WORKFLOW_MODE_PLAN, "default is plan");
  assert.strictEqual(normalizeWorkflowMode(null), WORKFLOW_MODE_PLAN, "null is plan");
  assert.strictEqual(normalizeWorkflowMode(""), WORKFLOW_MODE_PLAN, "empty is plan");
  assert.strictEqual(normalizeWorkflowMode("execute"), WORKFLOW_MODE_EXECUTE, "execute maps to execute");
  assert.strictEqual(normalizeWorkflowMode("approved"), WORKFLOW_MODE_EXECUTE, "approved maps to execute");
  assert.strictEqual(normalizeWorkflowMode("approval"), WORKFLOW_MODE_EXECUTE, "approval maps to execute");
  assert.strictEqual(normalizeWorkflowMode("apply"), WORKFLOW_MODE_EXECUTE, "apply maps to execute");
  assert.strictEqual(normalizeWorkflowMode("plan"), WORKFLOW_MODE_PLAN, "plan maps to plan");
  assert.strictEqual(normalizeWorkflowMode("pending"), WORKFLOW_MODE_PLAN, "pending maps to plan");
  assert.strictEqual(normalizeWorkflowMode("review"), WORKFLOW_MODE_PLAN, "review maps to plan");
  assert.strictEqual(normalizeWorkflowMode("unknown-val"), WORKFLOW_MODE_PLAN, "unknown fallback to plan");
});

test("cli-utils.mjs - resolveWorkflowMode fallback logic", (t) => {
  assert.strictEqual(resolveWorkflowMode({}, null), WORKFLOW_MODE_PLAN);
  assert.strictEqual(resolveWorkflowMode({ workflowMode: "execute" }, null), WORKFLOW_MODE_EXECUTE);
  assert.strictEqual(resolveWorkflowMode({ approvalState: "approved" }, null), WORKFLOW_MODE_EXECUTE);
  // opts has priority over saved config
  assert.strictEqual(resolveWorkflowMode({ workflowMode: "plan" }, { workflowMode: "execute" }), WORKFLOW_MODE_PLAN);
  assert.strictEqual(resolveWorkflowMode({}, { workflowMode: "execute" }), WORKFLOW_MODE_EXECUTE);
  assert.strictEqual(resolveWorkflowMode({}, { approvalState: "approved" }), WORKFLOW_MODE_EXECUTE);
});

test("cli-utils.mjs - parseFrontMatter", (t) => {
  const content = `---\ntitle: Hello\ntopic: hello-world\n---\nbody text`;
  const res = parseFrontMatter(content);
  assert.deepStrictEqual(res.meta, { title: "Hello", topic: "hello-world" });
  assert.strictEqual(res.content, "body text");

  // Invalid YAML should throw, meaning it won't be swallowed silently now
  assert.throws(() => parseFrontMatter(`---\ninvalid: yaml:\n  - boom\n---\nbody`), /Nested mappings|Map keys must be unique|end of the stream or a document separator is expected/i);

  // Missing frontmatter
  const noFm = parseFrontMatter("Just a text file");
  assert.deepStrictEqual(noFm.meta, {});
  assert.strictEqual(noFm.content, "Just a text file");
});

test("cli-utils.mjs - stringifyFrontMatter", (t) => {
  const meta = { title: "Test", topic: "should-be-removed", project: "global", submodule: "" };
  const content = "Test content";
  const result = stringifyFrontMatter(meta, content);
  assert.ok(!result.includes("topic:"), "topic should be removed");
  assert.ok(!result.includes("project:"), "global project should be removed");
  assert.ok(!result.includes("submodule:"), "empty submodule should be removed");
  assert.ok(result.startsWith("---\ntitle: Test\n---"), "rendered properly");
  assert.ok(result.includes("Test content"), "content preserved");
});

test("cli-utils.mjs - deriveTopicFromBaseName", (t) => {
  assert.strictEqual(deriveTopicFromBaseName("001-hello-world-local.md"), "001-hello-world-local");
  assert.strictEqual(deriveTopicFromBaseName("topic-name-20260426-071208.md"), "topic-name");
  assert.strictEqual(deriveTopicFromBaseName("simple.md"), "simple");
});

test("cli-utils.mjs - normalizeTicketGroup", (t) => {
  assert.strictEqual(normalizeTicketGroup("tickets"), "sub");
  assert.strictEqual(normalizeTicketGroup(".deuk-agent-ticket"), "sub");
  assert.strictEqual(normalizeTicketGroup(".deuk-agent-tickets"), "sub");
  assert.strictEqual(normalizeTicketGroup("main"), "main");
  assert.strictEqual(normalizeTicketGroup(undefined), "sub");
});

test("cli-utils.mjs - toSlug", (t) => {
  assert.strictEqual(toSlug("Hello World! 123"), "hello-world-123");
  assert.strictEqual(toSlug("  spaced  "), "spaced");
  assert.strictEqual(toSlug("Crème Brûlée"), "creme-brulee");
  assert.strictEqual(toSlug("한글 티켓 생성"), "ticket");
  assert.strictEqual(toSlug("!@#$"), "ticket"); // fallback
});

test("cli-ticket-index.mjs - computeNextTicketNumber", (t) => {
  assert.strictEqual(computeNextTicketNumber([]).num, 1);
  assert.strictEqual(computeNextTicketNumber([{id: "005-test-local"}]).num, 6);
  assert.strictEqual(computeNextTicketNumber([{id: "invalid-id"}]).num, 1);
  assert.strictEqual(computeNextTicketNumber([{id: "099-test-local"}, {id: "001-foo-local"}]).num, 100);
});

test("cli-ticket-index.mjs - generateTicketId", (t) => {
  const id1 = generateTicketId("hello world", []);
  assert.ok(id1.startsWith("001-hello-world-"));
  
  const id2 = generateTicketId("005-prefixed-topic", []);
  assert.ok(id2.startsWith("005-prefixed-topic-")); // Keeps the prefix

  const id3 = generateTicketId("new topic", [{id: "008-something-host"}]);
  assert.ok(id3.startsWith("009-new-topic-"));
});

test("cli-utils.mjs - computeTicketPath", (t) => {
  const activeEntry = { id: "092-test-host", group: "sub", status: "open" };
  assert.strictEqual(computeTicketPath(activeEntry), ".deuk-agent/tickets/sub/092-test-host.md");

  const archivedEntry = { id: "080-old-host", group: "main", status: "archived" };
  assert.strictEqual(computeTicketPath(archivedEntry), ".deuk-agent/tickets/archive/main/080-old-host.md");

  const groupedArchivedEntry = {
    id: "081-old-host",
    group: "main",
    status: "archived",
    archiveYearMonth: "2026-05",
    archiveDay: "01"
  };
  assert.strictEqual(computeTicketPath(groupedArchivedEntry), ".deuk-agent/tickets/archive/main/2026-05/01/081-old-host.md");

  const defaultGroup = { id: "100-no-group-host", status: "open" };
  assert.strictEqual(computeTicketPath(defaultGroup), ".deuk-agent/tickets/sub/100-no-group-host.md");

  const legacyRootEntry = {
    id: "001-044-deukagentrules-hardening-joy-nucb",
    topic: "044-deukagentrules-hardening-joy-nucb",
    group: "tickets",
    status: "open"
  };
  assert.strictEqual(computeTicketPath(legacyRootEntry), ".deuk-agent/tickets/sub/044-deukagentrules-hardening-joy-nucb.md");

  const fileNameEntry = {
    id: "001-044-deukagentrules-hardening-joy-nucb",
    fileName: "044-deukagentrules-hardening-joy-nucb.md",
    group: "tickets",
    status: "open"
  };
  assert.strictEqual(computeTicketPath(fileNameEntry), ".deuk-agent/tickets/sub/044-deukagentrules-hardening-joy-nucb.md");

  const legacyDotGroupEntry = {
    id: "001-legacy-dot-group-host",
    group: ".deuk-agent-ticket",
    status: "archived",
    fileName: "001-legacy-dot-group-host.md"
  };
  assert.strictEqual(computeTicketPath(legacyDotGroupEntry), ".deuk-agent/tickets/archive/sub/001-legacy-dot-group-host.md");
});

test("cli-utils.mjs - normalizeDocsLanguage", (t) => {
  assert.strictEqual(normalizeDocsLanguage("Korean"), "ko");
  assert.strictEqual(normalizeDocsLanguage("ko-KR"), "ko");
  assert.strictEqual(normalizeDocsLanguage("English"), "en");
  assert.strictEqual(normalizeDocsLanguage("en-US"), "en");
  assert.strictEqual(normalizeDocsLanguage("unknown"), "auto");
});

test("cli-utils.mjs - resolveDocsLanguage", (t) => {
  assert.strictEqual(resolveDocsLanguage("ko"), "ko");
  assert.strictEqual(resolveDocsLanguage("auto", { LC_ALL: "ko_KR.UTF-8" }), "ko");
  assert.strictEqual(resolveDocsLanguage("auto", { LANG: "en_US.UTF-8" }), "en");
  assert.strictEqual(resolveDocsLanguage("auto", {}), "en"); // fallback
});

test("cli-utils.mjs - inferDocsLanguageFromText", (t) => {
  assert.strictEqual(inferDocsLanguageFromText("티켓과 plan 문서를 한국어로 생성"), "ko");
  assert.strictEqual(inferDocsLanguageFromText("create ticket and plan documents in English"), "en");
  assert.strictEqual(inferDocsLanguageFromText("123"), null);
});

test("cli-utils.mjs - isMcpActive detects stdio command configs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "deuk-mcp-command-"));
  try {
    writeFileSync(join(dir, ".mcp.json"), JSON.stringify({
      mcpServers: {
        "deuk-agent-context": { command: "deukcontext-mcp" }
      }
    }), "utf8");

    assert.strictEqual(await isMcpActive(dir), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli-utils.mjs - isMcpActive falls back to GET for SSE configs", async () => {
  const server = http.createServer((req, res) => {
    if (req.method === "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end("event: ready\ndata: ok\n\n");
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const dir = mkdtempSync(join(tmpdir(), "deuk-mcp-sse-"));

  try {
    mkdirSync(join(dir, ".cursor"), { recursive: true });
    writeFileSync(join(dir, ".cursor", "mcp.json"), JSON.stringify({
      mcpServers: {
        "deuk-agent-context": { url: `http://127.0.0.1:${port}/sse` }
      }
    }), "utf8");

    assert.strictEqual(await isMcpActive(dir), true);
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli-utils.mjs - isMcpActive skips malformed config and checks next MCP path", async () => {
  const dir = mkdtempSync(join(tmpdir(), "deuk-mcp-malformed-"));
  try {
    writeFileSync(join(dir, ".mcp.json"), "{ not-json", "utf8");
    mkdirSync(join(dir, ".cursor"), { recursive: true });
    writeFileSync(join(dir, ".cursor", "mcp.json"), JSON.stringify({
      mcpServers: {
        "deuk-agent-context": { command: "deukcontext-mcp" }
      }
    }), "utf8");

    assert.strictEqual(await isMcpActive(dir), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli-args.mjs - parseTelemetryArgs supports remote sync target", () => {
  const opts = parseTelemetryArgs([
    "--cwd", "/tmp/work",
    "--tokens", "42",
    "--remote", "http://127.0.0.1:8001/ingest",
    "--rag-result", "hit",
    "--local-fallback",
    "--knowledge-action", "add_knowledge",
    "--token-quality", "saved",
    "--saved-tokens", "1200",
    "--source", "internal",
    "--kind", "workflow_event",
    "--event", "ticket_created",
    "--occurred-at", "2026-05-02T00:00:00.000Z",
    "--phase", "1",
    "--status", "open"
  ]);
  assert.strictEqual(opts.cwd, "/tmp/work");
  assert.strictEqual(opts.tokens, 42);
  assert.strictEqual(opts.remote, "http://127.0.0.1:8001/ingest");
  assert.strictEqual(opts.ragResult, "hit");
  assert.strictEqual(opts.localFallback, true);
  assert.strictEqual(opts.knowledgeAction, "add_knowledge");
  assert.strictEqual(opts.tokenQuality, "saved");
  assert.strictEqual(opts.savedTokens, 1200);
  assert.strictEqual(opts.source, "internal");
  assert.strictEqual(opts.kind, "workflow_event");
  assert.strictEqual(opts.event, "ticket_created");
  assert.strictEqual(opts.occurredAt, "2026-05-02T00:00:00.000Z");
  assert.strictEqual(opts.phase, 1);
  assert.strictEqual(opts.status, "open");
});

test("cli-args.mjs - parseTicketArgs supports strict/guard flags", () => {
  const opts = parseTicketArgs([
    "--topic", "demo",
    "--summary", "summary",
    "--require-filled",
    "--status-detail"
  ]);
  assert.strictEqual(opts.topic, "demo");
  assert.strictEqual(opts.summary, "summary");
  assert.strictEqual(opts.requireFilled, true);
  assert.strictEqual(opts.statusDetail, true);
  assert.strictEqual(opts.compact, undefined);
});

test("cli-args.mjs - parseTicketArgs supports inline plan body", () => {
  const opts = parseTicketArgs(["--topic", "demo", "--plan-body", "# Demo\n\nbody"]);
  assert.strictEqual(opts.topic, "demo");
  assert.strictEqual(opts.planBody, "# Demo\n\nbody");
});

test("cli-args.mjs - parseTicketArgs supports compact ticket output", () => {
  const opts = parseTicketArgs(["--topic", "demo", "--compact"]);
  assert.strictEqual(opts.compact, true);
});

test("cli-args.mjs - parseArgs supports compact rule audit output", () => {
  const opts = parseArgs(["--cwd", "/tmp/demo", "--compact"]);
  assert.strictEqual(opts.cwd, "/tmp/demo");
  assert.strictEqual(opts.compact, true);
});

test("cli-args.mjs - parseSkillArgs supports registry and expose flags", () => {
  const opts = parseSkillArgs([
    "--cwd", "/tmp/work",
    "--skill", "safe-refactor",
    "--platform", "claude",
    "--dry-run",
    "--non-interactive",
    "--json"
  ]);
  assert.strictEqual(opts.cwd, "/tmp/work");
  assert.strictEqual(opts.skill, "safe-refactor");
  assert.strictEqual(opts.platform, "claude");
  assert.strictEqual(opts.dryRun, true);
  assert.strictEqual(opts.nonInteractive, true);
  assert.strictEqual(opts.json, true);
});

test("cli-args.mjs - parseSkillArgs accepts --id as skill alias", () => {
  const opts = parseSkillArgs(["--id", "context-recall"]);
  assert.strictEqual(opts.skill, "context-recall");
});
