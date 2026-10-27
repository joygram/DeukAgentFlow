import { createHash } from "crypto";
import { mkdirSync,writeFileSync } from "fs";
import { dirname } from "path";
import { CLAUDE_NORMALIZE_EOL_MATCHER,CLAUDE_POSTTOOLUSE_COMMAND,CLAUDE_POSTTOOLUSE_MATCHER,CLAUDE_PRETOOLUSE_COMMAND,CLAUDE_PRETOOLUSE_MATCHER,CLAUDE_SETTINGS_PATH,CLAUDE_STOP_COMMAND,CLAUDE_STOP_MATCHER,CLAUDE_TOOL_GUARD_COMMAND,CLAUDE_TOOL_GUARD_MATCHER,CLAUDE_USERPROMPT_SUBMIT_COMMAND,CLAUDE_USERPROMPT_SUBMIT_MATCHER,readTextIfExists } from "./cli-init-core.js";
import { makePath,resolveUserHome } from "./cli-utils.js";

function isManagedClaudePromptHookCommand(value) {
  const command = String(value || "").trim();
  if (!/\bdeuk-agent-flow\b/.test(command)) return false;
  if (command === CLAUDE_USERPROMPT_SUBMIT_COMMAND) return true;
  if (/\brules\b/.test(command)) return true;
  return false;
}

function isManagedClaudePreToolUseHookCommand(value) {
  const command = String(value || "").trim();
  if (!/\bdeuk-agent-flow\b/.test(command)) return false;
  if (command === CLAUDE_PRETOOLUSE_COMMAND) return true;
  if (/\bhook\s+pre-tool-use\b/.test(command)) return true;
  return /\brules\b/.test(command);
}

function isManagedClaudePostToolUseHookCommand(value) {
  const command = String(value || "").trim();
  if (!/\bdeuk-agent-flow\b/.test(command)) return false;
  if (command === CLAUDE_POSTTOOLUSE_COMMAND) return true;
  return /\bhook\s+post-tool-use\b/.test(command);
}

function isManagedClaudeNormalizeEolHookCommand(value) {
  const command = String(value || "").trim();
  if (/\bhook\s+normalize-eol\b/.test(command)) return true;
  return /jq(\.exe)?['"]?\s/.test(command) && /\\r\\n/.test(command);
}

function isManagedClaudeStopHookCommand(value) {
  const command = String(value || "").trim();
  if (!/\bdeuk-agent-flow\b/.test(command)) return false;
  if (command === CLAUDE_STOP_COMMAND) return true;
  return /\bhook\s+stop\b/.test(command);
}

function isManagedClaudeToolGuardHookCommand(value) {
  const command = String(value || "").trim();
  if (!/\bdeuk-agent-flow\b/.test(command)) return false;
  if (command === CLAUDE_TOOL_GUARD_COMMAND) return true;
  return /\bhook\s+block-tool\b/.test(command);
}

function isCommandHookItem(item) {
  return Boolean(item && typeof item === "object" && item.type === "command" && typeof item.command === "string");
}

function readClaudeSettings(homeDir = resolveUserHome()) {
  const settingsPath = makePath(homeDir, CLAUDE_SETTINGS_PATH);
  const raw = readTextIfExists(settingsPath);
  if (!raw.trim()) return { ok: false };

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false };
    return { ok: true, path: settingsPath, parsed };
  } catch {
    return { ok: false };
  }
}

function writeClaudeSettings(settingsPath, next, dryRun) {
  if (dryRun) return;
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function hashClaudeSettingsState(settings) {
  return createHash("sha256").update(JSON.stringify(settings, null, 2), "utf8").digest("hex");
}

const HOOK_KINDS = {
  userPromptSubmit: { settingsKey: "UserPromptSubmit", matcher: CLAUDE_USERPROMPT_SUBMIT_MATCHER, command: CLAUDE_USERPROMPT_SUBMIT_COMMAND, isManaged: isManagedClaudePromptHookCommand },
  preToolUse: { settingsKey: "PreToolUse", matcher: CLAUDE_PRETOOLUSE_MATCHER, command: CLAUDE_PRETOOLUSE_COMMAND, isManaged: isManagedClaudePreToolUseHookCommand },
  postToolUse: { settingsKey: "PostToolUse", matcher: CLAUDE_POSTTOOLUSE_MATCHER, command: CLAUDE_POSTTOOLUSE_COMMAND, isManaged: isManagedClaudePostToolUseHookCommand },
  stop: { settingsKey: "Stop", matcher: CLAUDE_STOP_MATCHER, command: CLAUDE_STOP_COMMAND, isManaged: isManagedClaudeStopHookCommand },
  toolGuard: { settingsKey: "PreToolUse", matcher: CLAUDE_TOOL_GUARD_MATCHER, command: CLAUDE_TOOL_GUARD_COMMAND, isManaged: isManagedClaudeToolGuardHookCommand },
  normalizeEol: { settingsKey: "PostToolUse", matcher: CLAUDE_NORMALIZE_EOL_MATCHER, command: "", isManaged: isManagedClaudeNormalizeEolHookCommand }
};

function removeClaudeHook(kind, { homeDir = resolveUserHome(), dryRun = false } = {}) {
  const { settingsKey, matcher: canonicalMatcher, isManaged } = kind;
  const state = readClaudeSettings(homeDir);
  if (!state.ok) return { changed: false };

  const settings = state.parsed;
  const hooksRoot = settings.hooks;
  if (!hooksRoot || typeof hooksRoot !== "object" || Array.isArray(hooksRoot)) return { changed: false };

  const current = Array.isArray(hooksRoot[settingsKey]) ? hooksRoot[settingsKey] : [];
  const next = [];
  let changed = false;

  for (const entry of current) {
    if (!entry || typeof entry !== "object") {
      next.push(entry);
      continue;
    }
    if ((typeof entry.matcher === "string" ? entry.matcher : "") !== canonicalMatcher) {
      next.push(entry);
      continue;
    }
    const hooks = Array.isArray(entry.hooks) ? entry.hooks : [];
    const nextHooks = hooks.filter((hook) => !(isCommandHookItem(hook) && isManaged(hook.command)));
    if (nextHooks.length !== hooks.length) changed = true;
    if (nextHooks.length > 0) {
      next.push({ ...entry, hooks: nextHooks });
    } else {
      changed = true;
    }
  }

  if (!changed) return { changed: false };

  const nextHooksRoot = { ...hooksRoot };
  if (next.length > 0) {
    nextHooksRoot[settingsKey] = next;
  } else {
    delete nextHooksRoot[settingsKey];
  }

  const nextSettings = {
    ...settings,
    hooks: nextHooksRoot
  };
  const beforeHash = hashClaudeSettingsState(settings);
  const afterHash = hashClaudeSettingsState(nextSettings);
  if (beforeHash === afterHash) return { changed: false, hash: beforeHash };
  writeClaudeSettings(state.path, nextSettings, dryRun);
  return { changed: true, hash: afterHash };
}

export function removeClaudeUserPromptSubmitHook(opts = {}) {
  return removeClaudeHook(HOOK_KINDS.userPromptSubmit, opts);
}

export function removeClaudePreToolUseHook(opts = {}) {
  return removeClaudeHook(HOOK_KINDS.preToolUse, opts);
}

export function removeClaudeNormalizeEolHook(opts = {}) {
  return removeClaudeHook(HOOK_KINDS.normalizeEol, opts);
}

export function removeClaudePostToolUseHook(opts = {}) {
  return removeClaudeHook(HOOK_KINDS.postToolUse, opts);
}

export function removeClaudeStopHook(opts = {}) {
  return removeClaudeHook(HOOK_KINDS.stop, opts);
}

export function removeClaudeToolGuardHook(opts = {}) {
  return removeClaudeHook(HOOK_KINDS.toolGuard, opts);
}
