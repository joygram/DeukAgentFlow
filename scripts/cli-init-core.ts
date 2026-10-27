import { createHash } from "crypto";
import { existsSync,readFileSync } from "fs";
import { DEUK_ROOT_DIR,LEGACY_DEUK,makePath } from "./cli-utils.js";

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
export const CLAUDE_USERPROMPT_SUBMIT_COMMAND = "deuk-agent-flow rules";
export const CLAUDE_PRETOOLUSE_MATCHER = "Edit|Write";
export const CLAUDE_PRETOOLUSE_COMMAND = `deuk-agent-flow hook pre-tool-use 2>/dev/null`;
export const CLAUDE_POSTTOOLUSE_MATCHER = "Bash|Edit|Write";
export const CLAUDE_POSTTOOLUSE_COMMAND = `deuk-agent-flow hook post-tool-use 2>/dev/null`;
export const CLAUDE_STOP_MATCHER = "";
export const CLAUDE_STOP_COMMAND = `deuk-agent-flow hook stop 2>/dev/null`;
export const CLAUDE_TOOL_GUARD_MATCHER = "AskUserQuestion";
export const CLAUDE_TOOL_GUARD_COMMAND = `deuk-agent-flow hook block-tool 2>/dev/null`;
export const CLAUDE_NORMALIZE_EOL_MATCHER = "Edit|Write";
export const CANONICAL_INIT_CLEANUP_PATHS = {
  runtimeTemplateCopies: [makePath(DEUK_ROOT_DIR, "templates"), LEGACY_DEUK.templateDir],
  localSkillCopies: [
    makePath(DEUK_ROOT_DIR, "skill-templates"),
    makePath(".claude", "skills"),
    makePath(".cursor", "rules", "deuk-agent-skills.mdc")
  ],
  duplicateRuleCopies: [makePath(DEUK_ROOT_DIR, "rules"), makePath(".cursor", "rules", "deuk-agent-rule-multi-ai-workflow.mdc")],
  localAgentSurfaces: [
    makePath(".cursor", "rules", "deuk-agent.mdc"),
    makePath(".claude", "rules", "deuk-agent.md"),
    makePath(".windsurf", "rules", "deuk-agent.md"),
    makePath(".aiassistant", "rules", "deuk-agent.md"),
    ".cursorrules",
    ".windsurfrules"
  ],
  sharedAgentSurfaces: [
    makePath(".codex", "AGENTS.md"),
    makePath(".github", "copilot-instructions.md"),
    "CLAUDE.md",
    "GEMINI.md"
  ],
};

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
