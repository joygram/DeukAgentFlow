
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { isAbsolute,join } from "path";

function hasPlaceholderTokensLocal(text) {
  const lines = String(text || "")
    .split("\n")
    .map(line => line.trim().toLowerCase())
    .filter(Boolean);

  return lines.some(line => {
    const normalized = line
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .trim();
    return /^\[(?:add|fill|todo|tbd)[^\]]*\]$/.test(normalized)
      || /^<[^>]*(?:placeholder|todo|tbd|fill|add)[^>]*>$/.test(normalized)
      || /^(?:placeholder|todo|tbd)$/.test(normalized);
  });
}

const NON_SUBSTANTIVE_DECISION_PATTERNS = [
  /^(?:skip(?:ped)?|todo|tbd|n\/?a|none|ok|done|pass(?:ed)?|no(?:t)?\s*(?:applicable|needed)?)$/i,
  /^(?:skip|todo|tbd)\b/i
];

export function isSubstantiveDecisionText(text, minLength = 12) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  if (trimmed.length < minLength) return false;
  if (NON_SUBSTANTIVE_DECISION_PATTERNS.some(pattern => pattern.test(trimmed))) return false;
  return true;
}

const COMMAND_SIGNAL = new RegExp([
  "(?:^|\\n)\\s*[$#>]\\s+\\S",                    // 쉘 프롬프트 라인($ / # / >)
  "```",                                            // 코드펜스(명령·출력 블록)
].join("|"));
const OUTPUT_SIGNAL = new RegExp([
  "\\bexit\\s*(?:code)?\\s*[:=]?\\s*\\d+",         // exit code
  "\\b(?:changed\\s+)?\\d+\\s*(?:passed|failed|error|warning|건|개|packages?|tests?|insertions?|deletions?|files?)\\b", // 수치 결과
  "[\\w./-]+\\.[A-Za-z]{1,5}:\\d+",               // file:line 참조
  "(?:→|=>|\\bstdout\\b|\\bstderr\\b)",           // 출력 기호/키워드
].join("|"), "i");

export function hasCommandOrOutputSignal(text) {
  const trimmed = String(text || "").trim();
  return COMMAND_SIGNAL.test(trimmed) || OUTPUT_SIGNAL.test(trimmed);
}

export function isSubstantiveExecutionText(text, minLength = 8) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  if (trimmed.length < minLength) return false;
  const normalized = trimmed.toLowerCase();
  if (/^(?:skip(?:ped)?|todo|tbd|n\/a|none|pending)\.?$/.test(normalized)) return false;
  if (hasPlaceholderTokensLocal(trimmed)) return false;
  if (!hasCommandOrOutputSignal(trimmed)) return false;
  return true;
}

export function extractReferencedFilePaths(sectionText) {
  const matches = String(sectionText || "").match(/[\w][\w./-]*\.[A-Za-z][\w]{0,5}\b/g) || [];
  return [...new Set(matches.map(p => p.replace(/^[-*\s]+/, "")))];
}

function fileExistsUnderRoot(workspaceRoot, refPath) {
  return Boolean(workspaceRoot) && isAbsolute(workspaceRoot) && existsSync(join(workspaceRoot, refPath));
}

function changedSinceHead(workspaceRoot, refPath) {
  if (!fileExistsUnderRoot(workspaceRoot, refPath)) return false;
  try {
    const dirty = execFileSync("git", ["status", "--porcelain", "--", refPath], {
      cwd: workspaceRoot,
      encoding: "utf8"
    }).trim();
    if (dirty) return true;
    const said = execFileSync("git", ["log", "-1", "--format=%H", "--", refPath], {
      cwd: workspaceRoot,
      encoding: "utf8"
    }).trim();
    if (!said) return false;
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspaceRoot,
      encoding: "utf8"
    }).trim();
    return said === head;
  } catch {
    return false;
  }
}

export function isDocsReflectedVerified(workspaceRoot, docsReflectedText) {
  const referencedFiles = extractReferencedFilePaths(docsReflectedText);
  if (referencedFiles.length === 0) return true;
  return referencedFiles.some(refPath => changedSinceHead(workspaceRoot, refPath));
}

function referencedDesignPaths(content) {
  const scopeText = String(content || "").match(/##\s*Scope\s*\n([\s\S]*?)(?=\n##\s|$)/)?.[1] || "";
  const designText = String(content || "").match(/##\s*Design\s*\n([\s\S]*?)(?=\n##\s|$)/)?.[1] || "";
  return [
    ...extractReferencedFilePaths(scopeText),
    ...extractReferencedFilePaths(designText)
  ];
}

export function getCodeDesignMismatchReasons(content, workspaceRoot) {
  const referencedFiles = referencedDesignPaths(content);
  if (referencedFiles.length === 0) return [];
  const anyTouched = referencedFiles.some(refPath => fileExistsUnderRoot(workspaceRoot, refPath));
  return anyTouched ? [] : ["code_design_mismatch"];
}

export function getCodeDesignMismatchPaths(content, workspaceRoot) {
  if (getCodeDesignMismatchReasons(content, workspaceRoot).length === 0) return [];
  return referencedDesignPaths(content).filter(refPath => !fileExistsUnderRoot(workspaceRoot, refPath));
}
