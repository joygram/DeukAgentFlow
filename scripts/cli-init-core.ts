import { readFileSync } from "fs";
import { createHash } from "crypto";
import { LEGACY_DEUK, DEUK_ROOT_DIR, CliOpts, makePath } from "./cli-utils.js";

export function safeReadText(absPath, fallback = "") {
  try {
    return readFileSync(absPath, "utf8");
  } catch {
    return fallback;
  }
}

export const MANAGED_BLOCK_BEGIN = "<!-- deuk-agent-managed:begin -->";
export const MANAGED_BLOCK_END = "<!-- deuk-agent-managed:end -->";
export const GLOBAL_POINTER_BEGIN_PREFIX = "--- DEUK_AGENT_FLOW_BEGIN :";
export const GLOBAL_POINTER_END = "--- DEUK_AGENT_FLOW_END";
export const CLAUDE_SETTINGS_PATH = makePath(".claude", "settings.json");
export const CLAUDE_USERPROMPT_SUBMIT_MATCHER = "";
// #871-followup: drop `ticket use --latest` — it stole focus to the cwd index's
// newest ticket every turn, ignoring the per-session workspace cookie (this is the
// "지멋대로 아무 워크스페이스를 잡는" bug). `rules` already derives the active
// ticket from the session cookie when given --session-id, so just forward the
// session id and let rules resolve the last-used workspace. Claude exposes the
// turn's session id as $CLAUDE_SESSION_ID to UserPromptSubmit hooks.
export const CLAUDE_USERPROMPT_SUBMIT_COMMAND = "deuk-agent-flow rules --session-id \"$CLAUDE_SESSION_ID\" 2>/dev/null || deuk-agent-flow rules";
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
