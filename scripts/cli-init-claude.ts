import { dirname } from "path";
import { writeFileSync, mkdirSync } from "fs";
import { createHash } from "crypto";
import { CliOpts, makePath, resolveUserHome } from "./cli-utils.js";
import { CLAUDE_POSTTOOLUSE_COMMAND, CLAUDE_POSTTOOLUSE_MATCHER, CLAUDE_PRETOOLUSE_COMMAND, CLAUDE_PRETOOLUSE_MATCHER, CLAUDE_SETTINGS_PATH, CLAUDE_USERPROMPT_SUBMIT_COMMAND, CLAUDE_USERPROMPT_SUBMIT_MATCHER, readTextIfExists } from "./cli-init-core.js";

function isManagedClaudePromptHookCommand(value) {
  const command = String(value || "").trim();
  if (!/\bdeuk-agent-flow\b/.test(command)) return false;
  // 현재 정식 커맨드이거나, rules를 포함하는 관리형 커맨드(구버전 포함)
  if (command === CLAUDE_USERPROMPT_SUBMIT_COMMAND) return true;
  if (/\brules\b/.test(command)) return true;
  return false;
}

// #904: PostToolUse 상태카드 훅은 rules 커맨드가 아니라 `hook post-tool-use`이므로
// 위 predicate와 겹치지 않는 별도 판정이 필요하다 — 섞이면 upsert/remove가 서로의
// 관리 커맨드를 오인해 지우거나 중복 삽입한다.
function isManagedClaudePostToolUseHookCommand(value) {
  const command = String(value || "").trim();
  if (!/\bdeuk-agent-flow\b/.test(command)) return false;
  if (command === CLAUDE_POSTTOOLUSE_COMMAND) return true;
  return /\bhook\s+post-tool-use\b/.test(command);
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

// #883: the UserPromptSubmit upsert was hardcoded to one settings key/command. It is
// now parameterized by hook kind (settings key + matcher + canonical command) so the
// same well-tested upsert/remove machinery serves both UserPromptSubmit (rules
// injection every turn) and PreToolUse (design-first re-injection before Edit/Write).
// isManagedClaudePromptHookCommand already recognizes any deuk-agent-flow `rules`
// command, so both hook kinds share the same managed-detection predicate.
const HOOK_KINDS = {
  userPromptSubmit: { settingsKey: "UserPromptSubmit", matcher: CLAUDE_USERPROMPT_SUBMIT_MATCHER, command: CLAUDE_USERPROMPT_SUBMIT_COMMAND, isManaged: isManagedClaudePromptHookCommand },
  preToolUse: { settingsKey: "PreToolUse", matcher: CLAUDE_PRETOOLUSE_MATCHER, command: CLAUDE_PRETOOLUSE_COMMAND, isManaged: isManagedClaudePromptHookCommand },
  // #904
  postToolUse: { settingsKey: "PostToolUse", matcher: CLAUDE_POSTTOOLUSE_MATCHER, command: CLAUDE_POSTTOOLUSE_COMMAND, isManaged: isManagedClaudePostToolUseHookCommand }
};

function upsertClaudeHook(kind, { homeDir = resolveUserHome(), dryRun = false } = {}) {
  const { settingsKey, matcher: canonicalMatcher, command: canonicalCommand, isManaged } = kind;
  const state = readClaudeSettings(homeDir);
  if (!state.ok) return { changed: false };

  const settings = state.parsed;
  const hooksRoot = (settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks))
    ? { ...settings.hooks }
    : {};

  const rawEntries = Array.isArray(hooksRoot[settingsKey]) ? [...hooksRoot[settingsKey]] : [];
  const nextEntries = [];
  let changed = false;
  let matcherIndex = -1;

  // The managed hook is identified by its command via `isManaged` (which already
  // recognizes legacy/prior-version command strings, see isManagedClaudePostToolUseHookCommand's
  // "구버전 포함" comment). Strip the managed command from EVERY matcher group it's found
  // in — not just the canonicalMatcher group — because the canonical matcher itself can
  // change across versions (e.g. "Bash" -> "Bash|Edit|Write" for #934's design-doc check):
  // matching on matcher-string-equality alone left the managed command orphaned in the old
  // matcher group (never removed) while a new group was created for the new matcher,
  // duplicating the hook. isManaged is the sole source of truth for "is this our command."
  // Strip the managed command from EVERY group unconditionally first (never re-plant it
  // in whichever group happened to be visited first — that was the bug: re-inserting into
  // a non-canonical group left it there instead of moving it to canonicalMatcher). Planting
  // only ever happens afterward, in the dedicated canonicalMatcher-group step below.
  for (const rawEntry of rawEntries) {
    if (!rawEntry || typeof rawEntry !== "object") {
      nextEntries.push(rawEntry);
      continue;
    }

    const entry = { ...rawEntry };
    const isCanonicalMatcherGroup = (typeof entry.matcher === "string" ? entry.matcher : "") === canonicalMatcher;
    const hooks = Array.isArray(entry.hooks) ? entry.hooks : [];
    const keptHooks = [];
    for (const hook of hooks) {
      if (isCommandHookItem(hook) && isManaged(hook.command)) {
        changed = true;
        continue;
      }
      keptHooks.push(hook);
    }

    entry.hooks = keptHooks;
    if (isCanonicalMatcherGroup && matcherIndex === -1) {
      matcherIndex = nextEntries.length;
    }
    nextEntries.push(entry);
  }

  // "Canonical present" means: the canonical command lives inside the canonicalMatcher
  // group. Its presence in some other matcher group does NOT count.
  const hasCanonicalNow = matcherIndex >= 0 && Array.isArray(nextEntries[matcherIndex].hooks)
    && nextEntries[matcherIndex].hooks.some((hook) => isCommandHookItem(hook) && hook.command === canonicalCommand);

  if (!hasCanonicalNow) {
    if (matcherIndex >= 0) {
      const target = nextEntries[matcherIndex];
      const targetHooks = Array.isArray(target.hooks) ? target.hooks : [];
      target.hooks = [...targetHooks, { type: "command", command: canonicalCommand }];
      changed = true;
    } else {
      nextEntries.push({
        matcher: canonicalMatcher,
        hooks: [{ type: "command", command: canonicalCommand }]
      });
      changed = true;
    }
  }

  const filteredEntries = nextEntries.filter((entry) => {
    if (!entry || typeof entry !== "object") return true;
    if (!Array.isArray(entry.hooks)) return true;
    return entry.hooks.length > 0;
  });
  const finalEntries = filteredEntries.length > 0 ? filteredEntries : nextEntries;

  const nextSettings = {
    ...settings,
    hooks: {
      ...(hooksRoot),
      [settingsKey]: finalEntries
    }
  };

  const beforeHash = hashClaudeSettingsState(settings);
  const afterHash = hashClaudeSettingsState(nextSettings);
  if (beforeHash === afterHash) return { changed: false, hash: beforeHash };

  writeClaudeSettings(state.path, nextSettings, dryRun);
  return { changed: true, hash: afterHash };
}

export function upsertClaudeUserPromptSubmitHook(opts = {}) {
  return upsertClaudeHook(HOOK_KINDS.userPromptSubmit, opts);
}

export function upsertClaudePreToolUseHook(opts = {}) {
  return upsertClaudeHook(HOOK_KINDS.preToolUse, opts);
}

export function upsertClaudePostToolUseHook(opts = {}) {
  return upsertClaudeHook(HOOK_KINDS.postToolUse, opts);
}

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
    // Only strip the managed command from the canonicalMatcher group — mirror of upsert.
    // An unrelated matcher group (e.g. a Bash group) is left untouched.
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

export function removeClaudePostToolUseHook(opts = {}) {
  return removeClaudeHook(HOOK_KINDS.postToolUse, opts);
}
