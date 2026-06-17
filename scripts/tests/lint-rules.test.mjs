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
  assert.match(rulesText, /짧게|매우 짧게|한 줄로|간단히/i);
  assert.match(rulesText, /one-sentence or bullet-only/i);
});
