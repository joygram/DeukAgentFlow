// #691 follow-up: design-driven-flow.md §6.0 요구 — "텍스트 존재 검사(Boolean(evidence[key]))를
// 서브 FSM 완주 + code↔설계 대조로 대체한다". 이 모듈은 각 evidence 슬롯의 *내용*이 실제로
// 그 state의 일을 완수했다는 증거인지 판정하는 콘텐츠-완주 검증기를 모은다("skipped"/"TODO"/
// 한 단어 텍스트는 불통). 500줄 Refactor Gate(#870) 때문에 cli-ticket-evidence.ts에서 분리했다
// — 순환 import를 피하려 markdown 섹션 파싱은 호출측(cli-ticket-evidence.ts)에서 텍스트로
// 넘기고, 여기는 git/파일시스템 대조 같은 순수 판정 로직만 담는다.
// No-Fallback Gate: 판정 기준 미달이면 그대로 실패 사유를 반환한다 — 방어적 fallback 없음.

import { existsSync } from "fs";
import { join, isAbsolute } from "path";
import { spawnSync } from "child_process";

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

// 실질적 판단 없이 넘어가려는 문구(스킵/투두/미정) 탐지. 짧은 한 단어 사유("ok", "done")도
// 실제 판단 근거가 아니므로 최소 길이를 함께 요구한다.
const NON_SUBSTANTIVE_DECISION_PATTERNS = [
  /^(?:skip(?:ped)?|todo|tbd|n\/?a|none|ok|done|pass(?:ed)?|no(?:t)?\s*(?:applicable|needed)?)$/i,
  /^(?:skip|todo|tbd)\b/i
];

// #691: debuggingDecision/reopenDecision 같은 "결정" 증거는 `--reason` 한 줄로 채워진다.
// 과거엔 Boolean(opts.reason)만 봐서 "ok" 한 마디로도 게이트를 통과했다 — 이는 실제 판단이
// 아니라 텍스트 존재 검사의 재현이다. 최소 실질 길이 + 스킵성 문구 배제로 대체한다.
export function isSubstantiveDecisionText(text, minLength = 12) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  if (trimmed.length < minLength) return false;
  if (NON_SUBSTANTIVE_DECISION_PATTERNS.some(pattern => pattern.test(trimmed))) return false;
  return true;
}

// 실행증거(reproduction/verification command/result) 안에 실제 커맨드 + 실제 출력이 있는지
// 판정한다. 빈 텍스트, "skipped", "N/A", 아주 짧은 텍스트는 산출-입력 성립을 위장한 것이라
// 통과시키지 않는다.
export function isSubstantiveExecutionText(text, minLength = 8) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  if (trimmed.length < minLength) return false;
  const normalized = trimmed.toLowerCase();
  if (/^(?:skip(?:ped)?|todo|tbd|n\/a|none|pending)\.?$/.test(normalized)) return false;
  if (hasPlaceholderTokensLocal(trimmed)) return false;
  return true;
}

// git 워크트리에서 변경된 파일 목록(작업트리 diff + staged diff + untracked 합집합,
// repo-relative POSIX 경로). git이 없거나 repo가 아니면 빈 배열 — 이 경우 code↔design
// 대조는 강제하지 않는다(그 조건은 별도 문제이고 이 게이트가 대신 막지 않는다).
export function collectGitChangedFiles(cwd) {
  if (!cwd || !isAbsolute(cwd)) return [];
  const runGit = (args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0 || !result.stdout) return [];
    return result.stdout.split("\n").map(line => line.trim()).filter(Boolean);
  };
  const unstaged = runGit(["diff", "--name-only"]);
  const staged = runGit(["diff", "--name-only", "--cached"]);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...unstaged, ...staged, ...untracked])].map(p => p.replace(/\\/g, "/"));
}

// Scope/Design/Docs Reflected 섹션 본문에서 파일 경로처럼 보이는 토큰을 추출한다
// (확장자 포함 상대경로).
export function extractReferencedFilePaths(sectionText) {
  const matches = String(sectionText || "").match(/[\w][\w./-]*\.[A-Za-z][\w]{0,5}\b/g) || [];
  return [...new Set(matches.map(p => p.replace(/^[-*\s]+/, "")))];
}

function isFileTouchedOrExists(cwd, refPath, changedFiles) {
  const changedFileSet = new Set(changedFiles);
  if (changedFileSet.has(refPath)) return true;
  if (changedFiles.some(f => f.endsWith("/" + refPath) || f === refPath)) return true;
  if (cwd && isAbsolute(cwd) && existsSync(join(cwd, refPath))) return true;
  return false;
}

// code↔design 대조 게이트(getCodeDesignMismatchReasons)는 제거했다 — Design 섹션에 적힌
// 파일이 git 변경목록에 있나 코드 대조해 완주를 판정하는 것은 role-layer.md §3.1(코드
// 현상을 설계 판정에 섞지 않는다)·design-driven-flow.md §6.0(출력을 코드로 대조하는 위장
// 게이트 금지) 위반이었다. 설계↔구현 정합의 실질은 qa-verifier 롤이 프롬프트로 담당한다.

// 문서반영 섹션(Docs Reflected)에 언급된 파일이 실제로 git상 변경됐거나 존재하는지 판정한다.
// 참조 파일이 하나도 없으면(자유 서술만 있는 경우) true — 파일 경로 언급 자체를 강제하진
// 않는다(그건 별도 요구사항).
export function isDocsReflectedVerified(cwd, docsReflectedText) {
  const referencedFiles = extractReferencedFilePaths(docsReflectedText);
  if (referencedFiles.length === 0) return true;
  const changedFiles = collectGitChangedFiles(cwd);
  return referencedFiles.some(refPath => isFileTouchedOrExists(cwd, refPath, changedFiles));
}
