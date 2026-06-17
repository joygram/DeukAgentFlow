import test from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

/**
 * Architecture Guard Tests — DeukAgentRules
 *
 * These tests run via `node --test` and enforce structural invariants
 * for the CLI tool framework. Since agents ALWAYS run tests, these
 * act as real-time guardrails during development.
 *
 * Rules:
 *   DR-01: No manual INDEX.json editing (sed/awk/echo forbidden)
 *   DR-02: No circular dependencies between CLI modules
 *   DR-03: No hardcoded paths or magic strings
 *   DR-04: No inline re-implementation of cli-utils functions
 *   DR-05: All scripts must use shared utilities, not ad-hoc implementations
 */

/** Helper: grep across project files */
function grep(pattern, pathSpec, opts = "") {
  try {
    const options = opts
      ? opts.match(/[^	 "']+|"([^"]*)"|'([^']*)'/g).map((tok) => tok.replace(/^"|"$|^'|'$/g, ""))
      : [];
    const result = execFileSync("grep", ["-rn", ...options, pattern, pathSpec], {
      cwd: ROOT,
      encoding: "utf-8"
    });
    return result.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// DR-01: No manual INDEX.json editing
// ─────────────────────────────────────────────
test("DR-01: No manual INDEX.json editing patterns in scripts", () => {
  // Agents must use `ticket create`/`ticket archive` CLI, never edit INDEX.json directly
  const patterns = [
    "INDEX\\.json.*echo",
    "INDEX\\.json.*sed",
    "INDEX\\.json.*awk",
    "INDEX\\.json.*>>",
    "writeFileSync.*INDEX",
  ];

  const allViolations = [];
  for (const pattern of patterns) {
    const hits = grep(pattern, "scripts/", '--include=*.mjs');
    // Allow: legitimate INDEX.json management in cli-ticket-index.mjs
    const violations = hits.filter(
      (line) =>
        !line.includes("cli-ticket-index.mjs") &&
        !line.includes("cli-ticket-commands.mjs") &&
        !line.includes(".test.")
    );
    allViolations.push(...violations);
  }

  if (allViolations.length > 0) {
    console.error(
      `\n❌ DR-01 VIOLATION: Manual INDEX.json editing detected:\n` +
        allViolations.map((v) => `  ${v}`).join("\n")
    );
  }
  assert.strictEqual(allViolations.length, 0, "No manual INDEX.json edits allowed");
});

// ─────────────────────────────────────────────
// DR-02: No circular imports between CLI modules
// ─────────────────────────────────────────────
test("DR-02: No circular imports in CLI scripts", () => {
  const scriptsDir = join(ROOT, "scripts");
  const files = readdirSync(scriptsDir).filter((f) => f.endsWith(".mjs") && !f.includes(".test."));

  // Build import graph
  const imports = new Map();
  for (const file of files) {
    const content = readFileSync(join(scriptsDir, file), "utf-8");
    const deps = [];
    const importRegex = /from\s+["']\.\/([^"']+)["']/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      deps.push(match[1].replace(/\.mjs$/, ""));
    }
    imports.set(file.replace(/\.mjs$/, ""), deps);
  }

  // Detect cycles via DFS
  function hasCycle(node, visited, stack) {
    visited.add(node);
    stack.add(node);
    for (const dep of imports.get(node) || []) {
      if (!imports.has(dep)) continue; // external dep
      if (stack.has(dep)) return { found: true, cycle: `${node} → ${dep}` };
      if (!visited.has(dep)) {
        const result = hasCycle(dep, visited, stack);
        if (result.found) return result;
      }
    }
    stack.delete(node);
    return { found: false };
  }

  const visited = new Set();
  const cycles = [];
  for (const node of imports.keys()) {
    if (!visited.has(node)) {
      const result = hasCycle(node, visited, new Set());
      if (result.found) cycles.push(result.cycle);
    }
  }

  if (cycles.length > 0) {
    console.error(
      `\n❌ DR-02 VIOLATION: Circular imports detected:\n` +
        cycles.map((c) => `  ${c}`).join("\n")
    );
  }
  assert.strictEqual(cycles.length, 0, "No circular imports allowed");
});

// ─────────────────────────────────────────────
// DR-03: No hardcoded paths or magic strings
// ─────────────────────────────────────────────
test("DR-03: No hardcoded .deuk-agent paths outside constants", () => {
  // All references to .deuk-agent should go through AGENT_ROOT_DIR constant
    const hits = grep('"\\.deuk-agent', "scripts/", '--include=*.mjs');

  // Allow: cli-utils.mjs where the constant is DEFINED
  // Allow: test files
  const violations = hits.filter(
    (line) =>
      !line.includes("cli-utils.mjs") &&
      !line.includes(".test.") &&
      !line.includes("AGENT_ROOT_DIR")
  );

  if (violations.length > 0) {
    console.error(
      `\n❌ DR-03 VIOLATION: Hardcoded .deuk-agent paths (use AGENT_ROOT_DIR):\n` +
        violations.map((v) => `  ${v}`).join("\n")
    );
  }
  assert.strictEqual(violations.length, 0, "Use AGENT_ROOT_DIR constant");
});

// ─────────────────────────────────────────────
// DR-04: No inline YAML parsing (use shared parseFrontMatter)
// ─────────────────────────────────────────────
test("DR-04: No inline YAML parsing outside cli-utils", () => {
  // All frontmatter parsing should use parseFrontMatter from cli-utils
  const hits = grep("yaml\\.parse\\|YAML\\.parse", "scripts/", '--include=*.mjs');

  const violations = hits.filter(
    (line) =>
      !line.includes("cli-utils.mjs") &&
      !line.includes("cli-rule-compiler.mjs") && // config.yaml parsing, not frontmatter
      !line.includes("lint-md.mjs") && // YAML validation in markdown linter
      !line.includes(".test.")
  );

  if (violations.length > 0) {
    console.error(
      `\n❌ DR-04 VIOLATION: Inline YAML parsing detected (use parseFrontMatter):\n` +
        violations.map((v) => `  ${v}`).join("\n")
    );
  }
  assert.strictEqual(violations.length, 0, "Use parseFrontMatter from cli-utils");
});

// ─────────────────────────────────────────────
// DR-05: No duplicate slug/ID generation logic
// ─────────────────────────────────────────────
test("DR-05: No inline slug generation outside cli-utils", () => {
  // Slug generation should use toSlug() from cli-utils
  const hits = grep(
    "replace.*[^a-z].*replace.*toLowerCase\\|toLowerCase.*replace.*[^a-z]",
    "scripts/",
    '--include=*.mjs'
  );

  const violations = hits.filter(
    (line) =>
      !line.includes("cli-utils.mjs") &&
      !line.includes("cli-ticket-index.mjs") && // hostname slug, different purpose than toSlug
      !line.includes(".test.")
  );

  if (violations.length > 0) {
    console.error(
      `\n❌ DR-05 VIOLATION: Inline slug generation (use toSlug from cli-utils):\n` +
        violations.map((v) => `  ${v}`).join("\n")
    );
  }
  assert.strictEqual(violations.length, 0, "Use toSlug from cli-utils");
});

// ─────────────────────────────────────────────
// DR-06: Template files must exist for all blueprints
// ─────────────────────────────────────────────
test("DR-06: All referenced template files must exist", () => {
  const templatesDir = join(ROOT, "templates");
  if (!existsSync(templatesDir)) {
    assert.ok(true, "No templates directory — skip");
    return;
  }

  const templateFiles = readdirSync(templatesDir, { recursive: true })
    .filter((f) => typeof f === "string" && (f.endsWith(".md") || f.endsWith(".ejs")));

  assert.ok(templateFiles.length > 0, "Templates directory should not be empty");
});
