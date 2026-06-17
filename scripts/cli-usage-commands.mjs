import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { AGENT_ROOT_DIR } from "./cli-utils.mjs";

const USAGE_FILENAME = `${AGENT_ROOT_DIR}/usage.json`;
const USAGE_VERSION = 1;
const VALID_TASK_GRADES = new Set(["S", "A", "B", "C"]);
const DEFAULT_PLATFORM = "codex";
const PLATFORM_ALIASES = {
  codex: "codex",
  copilot: "copilot",
  ghcopilot: "copilot",
  "github-copilot": "copilot",
  claude: "claude",
  claudecode: "claude",
  cursor: "cursor"
};
const PLATFORM_DEFAULT_CLIENT = {
  codex: "Codex",
  copilot: "Copilot",
  claude: "ClaudeCode",
  cursor: "Cursor"
};

export async function runUsage(action, opts) {
  if (action === "set") {
    return runUsageSet(opts);
  }
  if (action === "status") {
    return runUsageStatus(opts);
  }
  if (action === "advise") {
    return runUsageAdvise(opts);
  }
  console.error("Unknown usage action: " + action);
  console.log("Usage: npx deuk-agent-flow usage <set|status|advise> [options]");
}

export function loadUsageState(cwd) {
  const absPath = join(cwd, USAGE_FILENAME);
  if (!existsSync(absPath)) return null;
  try {
    const data = JSON.parse(readFileSync(absPath, "utf8"));
    if (data.version !== USAGE_VERSION) return null;
    return normalizeUsageState(data);
  } catch {
    return null;
  }
}

function writeUsageState(cwd, state) {
  const absPath = join(cwd, USAGE_FILENAME);
  const dir = join(cwd, AGENT_ROOT_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(absPath, JSON.stringify({
    version: USAGE_VERSION,
    platform: state.platform,
    client: state.client,
    agentId: state.agentId,
    weeklyRemainingPct: state.weeklyRemainingPct,
    fiveHourRemainingPct: state.fiveHourRemainingPct,
    weeklyResetAt: state.weeklyResetAt,
    fiveHourResetAt: state.fiveHourResetAt,
    updatedAt: state.updatedAt
  }, null, 2), "utf8");
}

function normalizeUsageState(raw = {}) {
  const platform = normalizePlatform(raw.platform || DEFAULT_PLATFORM);
  const normalizedClient = String(raw.client || "").trim();
  return {
    platform,
    client: normalizedClient || resolveClientForPlatform(platform),
    agentId: String(raw.agentId || ""),
    weeklyRemainingPct: clampPercent(raw.weeklyRemainingPct),
    fiveHourRemainingPct: clampPercent(raw.fiveHourRemainingPct),
    weeklyResetAt: String(raw.weeklyResetAt || ""),
    fiveHourResetAt: String(raw.fiveHourResetAt || ""),
    updatedAt: String(raw.updatedAt || "")
  };
}

function clampPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Math.min(100, Math.max(0, Number(value)));
}

function resolveTaskGrade(input = "") {
  const grade = String(input || "").trim().toUpperCase();
  if (!VALID_TASK_GRADES.has(grade)) return "";
  return grade;
}

function normalizePlatform(input = "") {
  const key = String(input || "").trim().toLowerCase();
  if (!key) return DEFAULT_PLATFORM;
  return PLATFORM_ALIASES[key] || key;
}

function resolveClientForPlatform(platform) {
  return PLATFORM_DEFAULT_CLIENT[platform] || "Codex";
}

function buildBudgetAdvice(state, taskGrade) {
  const weekly = state.weeklyRemainingPct;
  const fiveHour = state.fiveHourRemainingPct;
  const tight = weekly !== null && weekly <= 20 || fiveHour !== null && fiveHour <= 15;
  const critical = weekly !== null && weekly <= 10 || fiveHour !== null && fiveHour <= 8;

  if (!taskGrade) {
    return {
      budget: critical ? "phase1-only" : tight ? "split-large-tasks" : "normal",
      gate: critical ? "no broad work" : tight ? "keep scope narrow" : "ok",
      next: critical ? "ticket status" : "usage advise --task-grade A"
    };
  }

  if (critical) {
    return {
      budget: `${taskGrade} blocked`,
      gate: "phase1-only",
      next: "summarize and stop"
    };
  }

  if (tight) {
    if (taskGrade === "S" || taskGrade === "A") {
      return {
        budget: `${taskGrade} split`,
        gate: "no broad refactor",
        next: "split ticket"
      };
    }
    return {
      budget: `${taskGrade} ok`,
      gate: "keep local",
      next: "avoid broad search"
    };
  }

  if (taskGrade === "S") {
    return {
      budget: "S ok with ticket",
      gate: "verify before execute",
      next: "keep one active task"
    };
  }
  if (taskGrade === "A") {
    return {
      budget: "A ok",
      gate: "normal",
      next: "execute"
    };
  }
  if (taskGrade === "B") {
    return {
      budget: "B ok",
      gate: "normal",
      next: "keep concise"
    };
  }
  return {
    budget: "C ok",
    gate: "normal",
    next: "stay compact"
  };
}

function buildConversationAdvice(state, opts = {}, budgetAdvice = {}) {
  const turnCount = Number(opts.turnCount || 0);
  const linkedTicketCount = Number(opts.linkedTicketCount || 0);
  const crossWorkspace = Boolean(opts.crossWorkspace);
  const weekly = state.weeklyRemainingPct;
  const fiveHour = state.fiveHourRemainingPct;
  const lowFiveHour = fiveHour !== null && fiveHour <= 15;
  const criticalFiveHour = fiveHour !== null && fiveHour <= 8;
  const lowWeekly = weekly !== null && weekly <= 20;
  const highTurns = turnCount >= 25;
  const veryHighTurns = turnCount >= 40;
  const manyLinkedTickets = linkedTicketCount >= 3;

  if (criticalFiveHour || (lowFiveHour && veryHighTurns) || (lowFiveHour && crossWorkspace && highTurns)) {
    return {
      conversationAction: "handoff-and-new-chat",
      conversationGate: "handoff now",
      conversationNext: "handoff and start new chat"
    };
  }

  if ((crossWorkspace && highTurns) || manyLinkedTickets || (lowWeekly && highTurns)) {
    return {
      conversationAction: "split-chat",
      conversationGate: "split context",
      conversationNext: "split ticket or new chat"
    };
  }

  if (budgetAdvice.gate === "phase1-only") {
    return {
      conversationAction: "stop-in-current-chat",
      conversationGate: "phase1-only",
      conversationNext: "summarize and stop"
    };
  }

  return {
    conversationAction: "keep-current-chat",
    conversationGate: "keep current chat",
    conversationNext: "continue"
  };
}

async function runUsageSet(opts) {
  const current = loadUsageState(opts.cwd) || normalizeUsageState();
  const hasPlatformOverride = Boolean(String(opts.platform || "").trim());
  const nextPlatform = normalizePlatform(opts.platform || current.platform || DEFAULT_PLATFORM);
  const incomingClient = String(opts.client || "").trim();
  const resolvedClient = incomingClient
    || (hasPlatformOverride
      ? resolveClientForPlatform(nextPlatform)
      : (current.client || resolveClientForPlatform(nextPlatform)));
  const next = normalizeUsageState({
    ...current,
    platform: nextPlatform,
    client: resolvedClient,
    agentId: opts.agentId || current.agentId,
    weeklyRemainingPct: opts.weeklyRemaining !== null ? opts.weeklyRemaining : current.weeklyRemainingPct,
    fiveHourRemainingPct: opts.fiveHourRemaining !== null ? opts.fiveHourRemaining : current.fiveHourRemainingPct,
    weeklyResetAt: opts.weeklyReset || current.weeklyResetAt,
    fiveHourResetAt: opts.fiveHourReset || current.fiveHourResetAt,
    updatedAt: new Date().toISOString()
  });

  writeUsageState(opts.cwd, next);

  if (opts.json) {
    console.log(JSON.stringify(next, null, 2));
    return;
  }

  console.log(`usage: ${next.client} weekly ${formatPct(next.weeklyRemainingPct)}, 5h ${formatPct(next.fiveHourRemainingPct)}`);
  if (next.agentId) console.log(`agent: ${next.agentId}`);
  if (next.weeklyResetAt) console.log(`reset: weekly ${next.weeklyResetAt}`);
  if (next.fiveHourResetAt) console.log(`reset: 5h ${next.fiveHourResetAt}`);
}

async function runUsageStatus(opts) {
  const state = loadUsageState(opts.cwd);
  if (!state) {
    const message = "usage not set";
    if (opts.json) {
      console.log(JSON.stringify({ status: message }, null, 2));
      return;
    }
    console.log(message);
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  console.log(`usage: ${state.client} weekly ${formatPct(state.weeklyRemainingPct)}, 5h ${formatPct(state.fiveHourRemainingPct)}`);
  if (state.agentId) console.log(`agent: ${state.agentId}`);
  if (state.weeklyResetAt) console.log(`reset: weekly ${state.weeklyResetAt}`);
  if (state.fiveHourResetAt) console.log(`reset: 5h ${state.fiveHourResetAt}`);
}

async function runUsageAdvise(opts) {
  const state = loadUsageState(opts.cwd);
  if (!state) {
    const message = "usage not set";
    if (opts.json) {
      console.log(JSON.stringify({ status: message }, null, 2));
      return;
    }
    console.log(message);
    return;
  }

  const taskGrade = resolveTaskGrade(opts.taskGrade);
  const advice = buildBudgetAdvice(state, taskGrade);
  const conversation = buildConversationAdvice(state, opts, advice);
  const payload = {
    ...state,
    taskGrade: taskGrade || null,
    taskLabel: opts.taskLabel || "",
    turnCount: Number(opts.turnCount || 0),
    linkedTicketCount: Number(opts.linkedTicketCount || 0),
    crossWorkspace: Boolean(opts.crossWorkspace),
    ...advice,
    ...conversation
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`usage: ${state.client} weekly ${formatPct(state.weeklyRemainingPct)}, 5h ${formatPct(state.fiveHourRemainingPct)}`);
  if (state.agentId) console.log(`agent: ${state.agentId}`);
  console.log(`budget: ${advice.budget}`);
  console.log(`${advice.gate === "ok" ? "next" : "gate"}: ${advice.gate === "ok" ? advice.next : advice.gate}`);
  if (advice.gate !== "ok") console.log(`next: ${advice.next}`);
  if (conversation.conversationAction !== "keep-current-chat") {
    console.log(`chat: ${conversation.conversationNext}`);
  }
}

function formatPct(value) {
  return value === null ? "n/a" : `${value}%`;
}

export function getUsageReminderLine(cwd, opts = {}) {
  const state = loadUsageState(cwd);
  if (!state) return "";
  const taskGrade = resolveTaskGrade(opts.taskGrade || "");
  const advice = buildBudgetAdvice(state, taskGrade);
  const conversation = buildConversationAdvice(state, opts, advice);
  const gateText = advice.gate === "ok" ? advice.next : advice.gate;
  const chatText = conversation.conversationAction === "keep-current-chat"
    ? "keep current chat"
    : conversation.conversationNext;
  return `usage reminder: ${state.client} weekly ${formatPct(state.weeklyRemainingPct)}, 5h ${formatPct(state.fiveHourRemainingPct)} | budget ${advice.budget} | gate ${gateText} | chat ${chatText}`;
}
