#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, dirname, resolve } from "path";
import { spawnSync } from "child_process";
import YAML from "yaml";
import { AGENT_ROOT_DIR, TICKET_DIR_NAME } from "./cli-utils.mjs";

const ignoredDirs = new Set([".git", "node_modules"]);

export function collectChangedFiles(repoRoot) {
  const changed = new Set();

  const gitArgs = ["-C", repoRoot, "diff", "--name-only", "--diff-filter=ACMRTUXB"];
  const gitDiff = spawnSync("git", gitArgs, { encoding: "utf8" });
  if (gitDiff.status === 0) {
    gitDiff.stdout
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(f => changed.add(f));
  }

  const gitUntracked = spawnSync("git", ["-C", repoRoot, "ls-files", "--others", "--exclude-standard"], { encoding: "utf8" });
  if (gitUntracked.status === 0) {
    gitUntracked.stdout
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(f => changed.add(f));
  }

  return Array.from(changed).sort();
}

export function collectChangedMarkdownFiles(repoRoot) {
  return collectChangedFiles(repoRoot).filter(isMarkdownFile);
}

function isMarkdownFile(filePath) {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown");
}

function isPlanReport(relPath) {
  return relPath.includes(`${AGENT_ROOT_DIR}/docs/plan/`) && relPath.endsWith("-report.md");
}

const LEGACY_ARCHIVED_TEMPLATE_NAMES = new Set([
  "module-rule-template.md",
  "ticket-list-template.md",
  "ticket-template-ko.md",
  "ticket-template.md"
]);

function isLegacyArchivedTemplateArtifact(relPath, content) {
  const normalized = relPath.replace(/\\/g, "/");
  if (!normalized.includes(`${TICKET_DIR_NAME}/archive/`)) return false;
  if (!LEGACY_ARCHIVED_TEMPLATE_NAMES.has(normalized.split("/").pop())) return false;

  const src = String(content || "");
  return src.includes("<%=") || src.includes("<%-") || /^id:\s*(module-rule-template|ticket-list-template|ticket-template-ko|ticket-template)\s*$/m.test(src);
}

function lintWalkthroughReportStructure(relPath, content) {
  const errors = [];
  const hasSummary = /##\s+(Summary|요약)(?:\s|$)/i.test(content);
  const hasVerification = /##\s+(Verification|검증)(?:\s|$)/i.test(content);
  const hasOutcome = /##\s+(Verification Outcome|Verification Results|검증 결과)(?:\s|$)/i.test(content);

  if (!hasSummary) {
    errors.push(`${relPath}: report missing Summary/요약 section`);
  }
  if (!hasVerification) {
    errors.push(`${relPath}: report missing Verification/검증 section`);
  }
  if (!hasOutcome) {
    errors.push(`${relPath}: report missing Verification Outcome/Verification Results/검증 결과 section`);
  }

  return errors;
}

function walkMarkdownFiles(rootDir, out = []) {
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      walkMarkdownFiles(join(rootDir, entry.name), out);
      continue;
    }
    const filePath = join(rootDir, entry.name);
    if (isMarkdownFile(filePath)) out.push(filePath);
  }
  return out;
}

function lintFile(absPath, repoRoot) {
  const rel = relative(repoRoot, absPath);
  const content = readFileSync(absPath, "utf8");
  const errors = [];

  if (isLegacyArchivedTemplateArtifact(rel, content)) {
    return errors;
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/\s+$/.test(line)) {
      errors.push(`${rel}:${idx + 1}: trailing whitespace`);
    }
  });

  const fenceCount = lines.filter(line => /^```/.test(line.trim())).length;
  if (fenceCount % 2 !== 0) {
    errors.push(`${rel}: unmatched fenced code block`);
  }

  if (content.startsWith("---\n") || content.startsWith("---\r\n")) {
    const match = content.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n?/);
    if (!match) {
      const afterOpeningRule = content.replace(/^---\r?\n/, "");
      if (!/^\s*\r?\n#{1,6}\s/.test(afterOpeningRule)) {
        errors.push(`${rel}: invalid or unterminated frontmatter`);
      }
    } else {
      try {
        const parsed = YAML.parse(match[1]);
        const isDeukAgentDoc = rel.includes(`${AGENT_ROOT_DIR}/docs/`) || rel.includes(`${AGENT_ROOT_DIR}/tickets/`);
        const isArchive = rel.includes("archive/");
        const isTemplate = rel.includes("templates/");
        if (isDeukAgentDoc && !isArchive && !isTemplate) {
          const requiredKeys = ["summary", "status", "priority", "tags"];
          for (const key of requiredKeys) {
            if (!parsed || parsed[key] === undefined || parsed[key] === null || parsed[key] === "") {
              errors.push(`${rel}: missing required frontmatter key: ${key}`);
            }
          }
        }
      } catch (err) {
        errors.push(`${rel}: invalid frontmatter YAML (${err.message})`);
      }
    }
  } else {
    const isDeukAgentDoc = rel.includes(`${AGENT_ROOT_DIR}/docs/`) || rel.includes(`${AGENT_ROOT_DIR}/tickets/`);
    const isArchive = rel.includes("archive/");
    const isTemplate = rel.includes("templates/");
    if (isDeukAgentDoc && !isArchive && !isTemplate) {
      errors.push(`${rel}: missing required frontmatter`);
    }
  }

  const linkPattern = /!?\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    const target = String(match[1] || "").trim();
    if (!target || target.startsWith("#") || /^[a-z]+:\/\//i.test(target) || target.startsWith("mailto:")) {
      continue;
    }
    const pathOnly = target.split("#")[0].split("?")[0];
    if (!pathOnly) continue;
    const resolved = join(dirname(absPath), pathOnly);
    if (!statExists(resolved)) {
      errors.push(`${rel}: broken relative link -> ${target}`);
    }
  }

  if (isPlanReport(rel)) {
    errors.push(...lintWalkthroughReportStructure(rel, content));
  }

  return errors;
}

function statExists(absPath) {
  try {
    return statSync(absPath).isFile() || statSync(absPath).isDirectory();
  } catch {
    return false;
  }
}

function resolveMarkdownLintTargets(repoRoot, explicitPaths = []) {
  const files = explicitPaths.length > 0
    ? explicitPaths.map(p => resolve(repoRoot, p)).filter(statExists).filter(isMarkdownFile)
    : collectChangedMarkdownFiles(repoRoot).map(p => join(repoRoot, p));

  const targets = files.length > 0 ? files : walkMarkdownFiles(repoRoot);
  return Array.from(new Set(targets));
}

function parseLintArgs(argv) {
  const out = { cwd: process.cwd(), paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--cwd") {
      out.cwd = argv[++i] || out.cwd;
    } else if (arg.startsWith("--cwd=")) {
      out.cwd = arg.slice("--cwd=".length);
    } else if (!arg.startsWith("-")) {
      out.paths.push(arg);
    }
  }
  return out;
}

export function lintMarkdownPaths(paths, cwd = process.cwd()) {
  const repoRoot = resolve(cwd);
  const targets = Array.from(new Set(
    (Array.isArray(paths) ? paths : [])
      .map(p => resolve(repoRoot, p))
      .filter(statExists)
      .filter(isMarkdownFile)
  ));
  const errors = [];
  for (const filePath of targets) {
    errors.push(...lintFile(filePath, repoRoot));
  }
  return { repoRoot, targets, errors };
}

export function runMarkdownLint(argv = process.argv.slice(2)) {
  const opts = parseLintArgs(argv);
  const repoRoot = resolve(opts.cwd);
  const targets = opts.paths.length > 0
    ? lintMarkdownPaths(opts.paths, opts.cwd).targets
    : resolveMarkdownLintTargets(repoRoot);
  const errors = [];
  for (const filePath of targets) {
    errors.push(...lintFile(filePath, repoRoot));
  }

  if (targets.length === 0) {
    console.log("lint:md: no markdown files found");
    return;
  }

  if (errors.length > 0) {
    console.error("lint:md failed");
    for (const err of errors) console.error(`- ${err}`);
    process.exit(1);
  }

  console.log(`lint:md passed (${targets.length} file${targets.length === 1 ? "" : "s"})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMarkdownLint();
}
