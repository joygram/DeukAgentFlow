import { dirname } from "path";
import { writeFileSync, mkdirSync } from "fs";
import { createHash } from "crypto";
import { makePath, resolveUserHome } from "./cli-utils.js";
import { CLAUDE_SETTINGS_PATH, CLAUDE_USERPROMPT_SUBMIT_COMMAND, CLAUDE_USERPROMPT_SUBMIT_MATCHER, safeReadText } from "./cli-init-core.js";
function isManagedClaudePromptHookCommand(value) {
    const command = String(value || "").trim();
    if (!/\bdeuk-agent-flow\b/.test(command))
        return false;
    // 현재 정식 커맨드이거나, rules를 포함하는 관리형 커맨드(구버전 포함)
    if (command === CLAUDE_USERPROMPT_SUBMIT_COMMAND)
        return true;
    if (/\brules\b/.test(command))
        return true;
    return false;
}
function isCommandHookItem(item) {
    return Boolean(item && typeof item === "object" && item.type === "command" && typeof item.command === "string");
}
function readClaudeSettings(homeDir = resolveUserHome()) {
    const settingsPath = makePath(homeDir, CLAUDE_SETTINGS_PATH);
    const raw = safeReadText(settingsPath);
    if (!raw.trim())
        return { ok: false };
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return { ok: false };
        return { ok: true, path: settingsPath, parsed };
    }
    catch {
        return { ok: false };
    }
}
function writeClaudeSettings(settingsPath, next, dryRun) {
    if (dryRun)
        return;
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}
function hashClaudeSettingsState(settings) {
    return createHash("sha256").update(JSON.stringify(settings, null, 2), "utf8").digest("hex");
}
export function upsertClaudeUserPromptSubmitHook({ homeDir = resolveUserHome(), dryRun = false } = {}) {
    const state = readClaudeSettings(homeDir);
    if (!state.ok)
        return { changed: false };
    const settings = state.parsed;
    const hooksRoot = (settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks))
        ? { ...settings.hooks }
        : {};
    const rawEntries = Array.isArray(hooksRoot.UserPromptSubmit) ? [...hooksRoot.UserPromptSubmit] : [];
    const nextEntries = [];
    let changed = false;
    let hadManagedPromptSubmitHook = false;
    let inserted = false;
    let matcherIndex = -1;
    for (const rawEntry of rawEntries) {
        if (!rawEntry || typeof rawEntry !== "object") {
            nextEntries.push(rawEntry);
            continue;
        }
        const entry = { ...rawEntry };
        const hooks = Array.isArray(entry.hooks) ? entry.hooks : [];
        const keptHooks = [];
        for (const hook of hooks) {
            if (isCommandHookItem(hook) && isManagedClaudePromptHookCommand(hook.command)) {
                hadManagedPromptSubmitHook = true;
                changed = true;
                if (!inserted) {
                    keptHooks.push({ type: "command", command: CLAUDE_USERPROMPT_SUBMIT_COMMAND });
                    inserted = true;
                }
                continue;
            }
            keptHooks.push(hook);
        }
        entry.hooks = keptHooks;
        if (entry.matcher === CLAUDE_USERPROMPT_SUBMIT_MATCHER && matcherIndex === -1) {
            matcherIndex = nextEntries.length;
        }
        nextEntries.push(entry);
    }
    const hasCanonicalNow = nextEntries.some((entry) => {
        if (!entry || typeof entry !== "object" || !Array.isArray(entry.hooks))
            return false;
        return entry.hooks.some((hook) => isCommandHookItem(hook) && hook.command === CLAUDE_USERPROMPT_SUBMIT_COMMAND);
    });
    if (!hasCanonicalNow) {
        if (nextEntries.length === 0) {
            nextEntries.push({
                matcher: CLAUDE_USERPROMPT_SUBMIT_MATCHER,
                hooks: [{ type: "command", command: CLAUDE_USERPROMPT_SUBMIT_COMMAND }]
            });
            changed = true;
        }
        else {
            const targetIndex = matcherIndex >= 0 ? matcherIndex : 0;
            const target = nextEntries[targetIndex];
            const targetHooks = Array.isArray(target.hooks) ? target.hooks : [];
            target.hooks = [...targetHooks, { type: "command", command: CLAUDE_USERPROMPT_SUBMIT_COMMAND }];
            if (typeof target.matcher !== "string")
                target.matcher = CLAUDE_USERPROMPT_SUBMIT_MATCHER;
            changed = true;
        }
    }
    const filteredEntries = nextEntries.filter((entry) => {
        if (!entry || typeof entry !== "object")
            return true;
        if (!Array.isArray(entry.hooks))
            return true;
        return entry.hooks.length > 0;
    });
    const finalEntries = filteredEntries.length > 0 ? filteredEntries : nextEntries;
    const nextSettings = {
        ...settings,
        hooks: {
            ...(hooksRoot),
            UserPromptSubmit: finalEntries
        }
    };
    const beforeHash = hashClaudeSettingsState(settings);
    const afterHash = hashClaudeSettingsState(nextSettings);
    if (beforeHash === afterHash)
        return { changed: false, hash: beforeHash };
    writeClaudeSettings(state.path, nextSettings, dryRun);
    return { changed: true, hash: afterHash };
}
export function removeClaudeUserPromptSubmitHook({ homeDir = resolveUserHome(), dryRun = false } = {}) {
    const state = readClaudeSettings(homeDir);
    if (!state.ok)
        return { changed: false };
    const settings = state.parsed;
    const hooksRoot = settings.hooks;
    if (!hooksRoot || typeof hooksRoot !== "object" || Array.isArray(hooksRoot))
        return { changed: false };
    const current = Array.isArray(hooksRoot.UserPromptSubmit) ? hooksRoot.UserPromptSubmit : [];
    const next = [];
    let changed = false;
    for (const entry of current) {
        if (!entry || typeof entry !== "object") {
            next.push(entry);
            continue;
        }
        const hooks = Array.isArray(entry.hooks) ? entry.hooks : [];
        const nextHooks = hooks.filter((hook) => !(isCommandHookItem(hook) && isManagedClaudePromptHookCommand(hook.command)));
        if (nextHooks.length !== hooks.length)
            changed = true;
        if (nextHooks.length > 0) {
            next.push({ ...entry, hooks: nextHooks });
        }
        else {
            changed = true;
        }
    }
    if (!changed)
        return { changed: false };
    const nextHooksRoot = { ...hooksRoot };
    if (next.length > 0) {
        nextHooksRoot.UserPromptSubmit = next;
    }
    else {
        delete nextHooksRoot.UserPromptSubmit;
    }
    const nextSettings = {
        ...settings,
        hooks: nextHooksRoot
    };
    const beforeHash = hashClaudeSettingsState(settings);
    const afterHash = hashClaudeSettingsState(nextSettings);
    if (beforeHash === afterHash)
        return { changed: false, hash: beforeHash };
    writeClaudeSettings(state.path, nextSettings, dryRun);
    return { changed: true, hash: afterHash };
}
//# sourceMappingURL=cli-init-claude.js.map