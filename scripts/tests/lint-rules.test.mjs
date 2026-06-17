import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { auditRules } from "../lint-rules.mjs";

test("rules audit passes current low-token and ticket SSoT rules", () => {
  const result = auditRules(process.cwd());
  assert.strictEqual(result.ok, true, result.violations.map((v) => v.code).join(", "));
});

test("rules audit includes explicit short-answer override for direct user requests", () => {
  const result = auditRules(process.cwd());
  assert.ok(result.ok, result.violations.map((v) => `${v.code}:${v.message}`).join(", "));
  const rulesText = result.path ? String(readFileSync(result.path, "utf8")) : "";
  assert.match(rulesText, /Commentary surface map/i);
  assert.match(rulesText, /Running-surface contract/i);
  assert.match(rulesText, /Shared interrupt contract/i);
  assert.match(rulesText, /When the user complains about verbosity, chatter, progress reports, or over-explaining/i);
  assert.match(rulesText, /Do not switch into meta labeling, terminology lessons, or general explanation/i);
  assert.match(rulesText, /짧게|매우 짧게|한 줄로|간단히/i);
  assert.match(rulesText, /one-sentence or bullet-only/i);
});

test("rules audit keeps ticket creation ahead of repo inspection for bug and regression work", () => {
  const result = auditRules(process.cwd());
  assert.ok(result.ok, result.violations.map((v) => `${v.code}:${v.message}`).join(", "));
  const rulesText = result.path ? String(readFileSync(result.path, "utf8")) : "";
  assert.match(rulesText, /do not run repo inspection commands/i);
  assert.match(rulesText, /deuk-agent-flow ticket create` or `deuk-agent-flow ticket use/i);
  assert.match(rulesText, /Do not start with `git status`, `rg`, `find`, diffs, or broad help output/i);
});

test("rules audit requires explicit approval before ticket guard context preflight", () => {
  const result = auditRules(process.cwd());
  assert.ok(result.ok, result.violations.map((v) => `${v.code}:${v.message}`).join(", "));
  const rulesText = result.path ? String(readFileSync(result.path, "utf8")) : "";
  assert.match(rulesText, /wait for explicit user approval/i);
  assert.match(rulesText, /deuk-agent-flow ticket guard --topic <id> --ticket-started --ticket-reviewed --approval approved/i);
  assert.match(rulesText, /explicit approval validated by `deuk-agent-flow ticket guard`/i);
  assert.match(rulesText, /reopen and review the durable ticket body/i);
});

test("rules audit requires stabilization ticket after repeated TDW failures", () => {
  const result = auditRules(process.cwd());
  assert.ok(result.ok, result.violations.map((v) => `${v.code}:${v.message}`).join(", "));
  const rulesText = result.path ? String(readFileSync(result.path, "utf8")) : "";
  assert.match(rulesText, /same TDW failure family appears twice/i);
  assert.match(rulesText, /stabilization\/root-cause ticket/i);
});

test("rules audit requires user requirements to be recorded and re-approved through the ticket", () => {
  const result = auditRules(process.cwd());
  assert.ok(result.ok, result.violations.map((v) => `${v.code}:${v.message}`).join(", "));
  const rulesText = result.path ? String(readFileSync(result.path, "utf8")) : "";
  assert.match(rulesText, /User requirements are ticket-first/i);
  assert.match(rulesText, /cause, analysis, and design\/approach/i);
  assert.match(rulesText, /approval or correction creates another ticket update loop/i);
  assert.match(rulesText, /update the ticket with that new input/i);
  assert.match(rulesText, /Completion reports go in the ticket first/i);
  assert.match(rulesText, /terse TDW feedback only/i);
});

test("rules audit maps AgentFlow skill status to DeukAgentFlow skill commands", () => {
  const result = auditRules(process.cwd());
  assert.ok(result.ok, result.violations.map((v) => `${v.code}:${v.message}`).join(", "));
  const rulesText = result.path ? String(readFileSync(result.path, "utf8")) : "";
  assert.match(rulesText, /AgentFlow Skill Status/i);
  assert.match(rulesText, /deuk-agent-flow skill list/i);
  assert.match(rulesText, /Do not answer from the host Codex skill list alone/i);
});

test("rules audit keeps commit and close requests inside the approved active ticket when scope does not expand", () => {
  const result = auditRules(process.cwd());
  assert.ok(result.ok, result.violations.map((v) => `${v.code}:${v.message}`).join(", "));
  const rulesText = result.path ? String(readFileSync(result.path, "utf8")) : "";
  assert.match(rulesText, /Existing-ticket close actions are not new-ticket triggers/i);
  assert.match(rulesText, /If the user asks only for commit\/report\/archive\/close/i);
  assert.match(rulesText, /reuse that ticket and continue through Phase 4/i);
  assert.match(rulesText, /create a new ticket only if the user adds new implementation, new investigation, or a broader scope/i);
});

test("rules audit requires running-surface correction interrupts", () => {
  const result = auditRules(process.cwd());
  assert.ok(result.ok, result.violations.map((v) => `${v.code}:${v.message}`).join(", "));
  const rulesText = result.path ? String(readFileSync(result.path, "utf8")) : "";
  assert.match(rulesText, /If that correction arrives during `approved_execution`, `command_running`, or `search_running`, treat it as an immediate interrupt/i);
  assert.match(rulesText, /CLI running-output contract/i);
  assert.match(rulesText, /must not print narrative labels, usage reminders, `file:\/\/` links, or progress text/i);
});

test("rules audit blocks shortcut regressions and semantic shrinkage", () => {
  const result = auditRules(process.cwd());
  assert.ok(result.ok, result.violations.map((v) => `${v.code}:${v.message}`).join(", "));
  const rulesText = result.path ? String(readFileSync(result.path, "utf8")) : "";
  assert.match(rulesText, /Shortcut regression guard/i);
  assert.match(rulesText, /temporary passes, bypasses, semantic shrinkage, and language-specific patch branches/i);
  assert.match(rulesText, /Shared-contract guard/i);
  assert.match(rulesText, /Stop for shortcut regressions/i);
  assert.match(rulesText, /verification that proves only the workaround instead of the shared contract/i);
});
