import { existsSync, readFileSync } from "fs";
import { createHash } from "crypto";
import { LEGACY_DEUK, DEUK_ROOT_DIR, CliOpts, makePath } from "./cli-utils.js";

// #879 No-Fallback Gate: try/catch 삼킴·부재 기본값 폴백을 제거했다. 파일이 없으면 빈
// 문자열이지만 이는 명시적 부재 처리이지 숨은 catch가 아니다 — 읽기 예외(권한 등)는
// 던져서 조용히 넘어가지 않는다. 부재가 비정상인 호출부는 호출 전에 존재를 확인한다.
export function readTextIfExists(absPath) {
  if (!existsSync(absPath)) return "";
  return readFileSync(absPath, "utf8");
}

export const MANAGED_BLOCK_BEGIN = "<!-- deuk-agent-managed:begin -->";
export const MANAGED_BLOCK_END = "<!-- deuk-agent-managed:end -->";
export const GLOBAL_POINTER_BEGIN_PREFIX = "--- DEUK_AGENT_FLOW_BEGIN :";
export const GLOBAL_POINTER_END = "--- DEUK_AGENT_FLOW_END";
export const CLAUDE_SETTINGS_PATH = makePath(".claude", "settings.json");
export const CLAUDE_USERPROMPT_SUBMIT_MATCHER = "";
// #828/#685: drop both `ticket use --latest` (stole focus every turn) and the
// $CLAUDE_SESSION_ID-based session-cookie resolution (#871-followup) — neither
// exists anymore. Workspace is resolved ONLY from an explicit --workspace
// (design-driven-flow.md, LangGraph 진입 원칙, closed by 37e60c5/#685); with none
// given, `rules` reports missing-query and lists registered workspaces instead of
// guessing. No fallback command is needed since there is nothing left to fail into.
export const CLAUDE_USERPROMPT_SUBMIT_COMMAND = "deuk-agent-flow rules";
// #883 Design-First injection: right before an Edit/Write, re-inject the rules so
// the Design-Driven / Anti-Drift gate ("설계 정본을 먼저 확인하고 고쳐라") is in
// front of the agent at the exact moment it is about to mutate a file — the moment
// the drift happens. Reuses the existing `rules` command (no new judgment logic);
// this only surfaces the design-first reminder, it does not block the tool.
export const CLAUDE_PRETOOLUSE_MATCHER = "Edit|Write";
export const CLAUDE_PRETOOLUSE_COMMAND = "deuk-agent-flow rules";
// #904: ticket move/use/create/close 직후, CLI가 이미 stdout에 찍은 상태카드(📦 라인)를
// 에이전트 컨텍스트에 강제 재주입한다 — ticket-status-surface 스킬(프롬프트 지시)만으로는
// 에이전트가 응답 종합 시 누락할 수 있음이 실증됐다(확률적 준수는 구조적 보장이 아님).
// #934: 같은 훅에 DR-13(설계문서 결과서술 혼입 금지) 그렙 체크도 얹는다 — Edit|Write를
// 매칭에 추가해야 훅이 그 이벤트를 받는다. Bash|Edit|Write 전체를 매칭하고, 훅 자신
// (cli-hook-post-tool-use.ts)이 tool_name으로 분기해 각자 조건에 안 맞으면 무출력으로
// 스스로 걸러낸다.
export const CLAUDE_POSTTOOLUSE_MATCHER = "Bash|Edit|Write";
export const CLAUDE_POSTTOOLUSE_COMMAND = "deuk-agent-flow hook post-tool-use 2>/dev/null";
export const CANONICAL_INIT_CLEANUP_PATHS = {
  runtimeTemplateCopies: [makePath(DEUK_ROOT_DIR, "templates"), LEGACY_DEUK.templateDir],
  localSkillCopies: [
    makePath(DEUK_ROOT_DIR, "skill-templates"),
    makePath(".claude", "skills"),
    makePath(".cursor", "rules", "deuk-agent-skills.mdc")
  ],
  duplicateRuleCopies: [makePath(DEUK_ROOT_DIR, "rules"), makePath(".cursor", "rules", "deuk-agent-rule-multi-ai-workflow.mdc")],
  // Per-workspace agent surfaces are removed to keep repos clean — the rule lives
  // once in the agent-flow-designated home, not duplicated into every workspace.
  // deuk-EXCLUSIVE files (filename identifies deuk) — safe to delete the whole file.
  localAgentSurfaces: [
    makePath(".cursor", "rules", "deuk-agent.mdc"),
    makePath(".claude", "rules", "deuk-agent.md"),
    makePath(".windsurf", "rules", "deuk-agent.md"),
    makePath(".aiassistant", "rules", "deuk-agent.md"),
    ".cursorrules",
    ".windsurfrules"
  ],
  // SHARED-name files that may also carry the user's own content — strip only the
  // deuk-managed block (preserve user settings); delete only if nothing else remains.
  sharedAgentSurfaces: [
    makePath(".codex", "AGENTS.md"),
    makePath(".github", "copilot-instructions.md"),
    "CLAUDE.md",
    "GEMINI.md"
  ],
};

// ─── Managed Block 헬퍼 ──────────────────────────────────────────────────────
export function wrapManagedBlock(content) {
  return `${MANAGED_BLOCK_BEGIN}\n${String(content || "").trimEnd()}\n${MANAGED_BLOCK_END}`;
}

export function hashManagedContent(content) {
  return createHash("sha256").update(String(content || ""), "utf8").digest("hex");
}

export function splitManagedBlock(content) {
  const current = String(content || "");
  if (!current.includes(MANAGED_BLOCK_BEGIN) || !current.includes(MANAGED_BLOCK_END)) return null;
  const beginIdx = current.indexOf(MANAGED_BLOCK_BEGIN);
  const endIdx = current.indexOf(MANAGED_BLOCK_END, beginIdx);
  if (beginIdx === -1 || endIdx === -1) return null;
  return {
    before: current.slice(0, beginIdx).trimEnd(),
    managed: current.slice(beginIdx + MANAGED_BLOCK_BEGIN.length, endIdx).trim(),
    after: current.slice(endIdx + MANAGED_BLOCK_END.length).trimStart(),
  };
}

export function mergeManagedBlock(existing, managedContent) {
  const current = String(existing || "");
  const nextBlock = wrapManagedBlock(managedContent);
  if (!current.trim()) return `${nextBlock}\n`;
  const currentBlock = splitManagedBlock(current);
  if (currentBlock) {
    return [currentBlock.before, nextBlock, currentBlock.after].filter(Boolean).join("\n\n").trimEnd() + "\n";
  }
  const cleaned = current.trimEnd();
  const managedBody = String(managedContent || "").trim();
  if (managedBody && cleaned.includes(managedBody)) return cleaned + "\n";
  return `${cleaned}\n\n${nextBlock}\n`;
}
