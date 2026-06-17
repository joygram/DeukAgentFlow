#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { relative, dirname, resolve } from "path";
import YAML from "yaml";
import { DEUK_ROOT_DIR, CliOpts, TICKET_SUBDIR, makePath, toFileUri } from "./cli-utils.js";

const ignoredDirs = new Set([".git", "node_modules"]);

export function normalizeMarkdownContent(content) {
  const src = String(content || "").replace(/\r\n/g, "\n");
  return src
    .split("\n")
    .map(line => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trimEnd() + "\n";
}

export function normalizeMarkdownFile(absPath) {
  if (!statExists(absPath) || !isMarkdownFile(absPath)) return false;
  const current = readFileSync(absPath, "utf8");
  const next = normalizeMarkdownContent(current);
  if (next === current) return false;
  writeFileSync(absPath, next, "utf8");
  return true;
}

export function collectChangedFiles(repoRoot) {
  return [];
}

export function collectChangedMarkdownFiles(repoRoot) {
  return collectChangedFiles(repoRoot).filter(isMarkdownFile);
}

function isMarkdownFile(filePath) {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown");
}

function isPlanReport(relPath) {
  return relPath.includes(`${DEUK_ROOT_DIR}/docs/plan/`) && relPath.endsWith("-report.md");
}

function isTicketPath(repoRoot, absPath) {
  try {
    const relPath = relative(repoRoot, absPath).replace(/\\/g, "/");
    return relPath.startsWith(`${DEUK_ROOT_DIR}/${TICKET_SUBDIR}/`);
  } catch {
    return false;
  }
}

function isImplicitUpwardEvidenceLink(target) {
  const normalized = String(target || "").replace(/\\/g, "/");
  return normalized.startsWith("../") && !normalized.includes(`${DEUK_ROOT_DIR}/${TICKET_SUBDIR}/`);
}

function looksLikeYamlFrontmatter(content) {
  if (!(content.startsWith("---\n") || content.startsWith("---\r\n"))) return false;
  const afterOpening = content.replace(/^---\r?\n/, "");
  const lines = afterOpening.split(/\r?\n/);
  const frontmatterLines = [];

  for (const line of lines) {
    if (line.trim() === "---") break;
    frontmatterLines.push(line);
  }

  if (frontmatterLines.length === 0) return false;

  const firstNonEmpty = frontmatterLines.find(line => line.trim());
  if (!firstNonEmpty) return false;
  if (/^(#|>|- |\* |\d+\.)/.test(firstNonEmpty.trim())) return false;

  return frontmatterLines.some(line => /^[A-Za-z0-9_-]+\s*:/.test(line.trim()));
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
      walkMarkdownFiles(makePath(rootDir, entry.name), out);
      continue;
    }
    const filePath = makePath(rootDir, entry.name);
    if (isMarkdownFile(filePath)) out.push(filePath);
  }
  return out;
}

function lintFile(absPath, repoRoot) {
  const rel = relative(repoRoot, absPath);
  const content = readFileSync(absPath, "utf8");
  const errors = [];

  const lines = content.split(/\r?\n/);

  const fenceCount = lines.filter(line => /^```/.test(line.trim())).length;
  if (fenceCount % 2 !== 0) {
    errors.push(`${rel}: unmatched fenced code block`);
  }

  if (looksLikeYamlFrontmatter(content)) {
    const match = content.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n?/);
    if (!match) {
      const afterOpeningRule = content.replace(/^---\r?\n/, "");
      if (!/^\s*\r?\n#{1,6}\s/.test(afterOpeningRule)) {
        errors.push(`${rel}: invalid or unterminated frontmatter`);
      }
    } else {
      try {
        const parsed = YAML.parse(match[1]);
        const isDeukAgentDoc = rel.includes(`${DEUK_ROOT_DIR}/docs/`) || rel.includes(`${DEUK_ROOT_DIR}/tickets/`);
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
    const isDeukAgentDoc = rel.includes(`${DEUK_ROOT_DIR}/docs/`) || rel.includes(`${DEUK_ROOT_DIR}/tickets/`);
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
    if (isImplicitUpwardEvidenceLink(pathOnly)) continue;

    const resolved = makePath(dirname(absPath), pathOnly);

    if (!isTicketPath(repoRoot, resolved)) {
      continue;
    }

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
    : walkMarkdownFiles(repoRoot);

  return Array.from(new Set(files));
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

if (import.meta.url === toFileUri(process.argv[1])) {
  runMarkdownLint();
}
