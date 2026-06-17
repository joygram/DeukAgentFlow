import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { loadInitConfig, AGENT_ROOT_DIR, SPOKE_REGISTRY } from "./cli-utils.mjs";

const TELEMETRY_FILE = `${AGENT_ROOT_DIR}/telemetry.jsonl`;
const RAG_RESULTS = new Set(["hit", "weak-hit", "miss", "stale"]);
const KNOWLEDGE_ACTIONS = new Set(["none", "add_knowledge", "refresh_document"]);
const TOKEN_QUALITIES = new Set(["useful", "waste", "rework", "saved"]);
const INTERNAL_SOURCE = "internal";
const WORKFLOW_EVENT_KIND = "workflow_event";

export async function runTelemetry(opts) {
  const argv = process.argv.slice(3); // skip 'telemetry' and 'log/sync/summary'
  const action = process.argv[3];

  if (action === "log") {
    await logAction(opts);
  } else if (action === "sync") {
    await syncAction(opts);
  } else if (action === "summary") {
    await summaryAction(opts);
  } else if (action === "migrate") {
    await migrateAction(opts);
  } else {
    console.error("Unknown telemetry action: " + action);
    console.log("Usage: npx deuk-agent-rule telemetry <log|sync|summary|migrate> [options]");
  }
}

async function logAction(opts) {
  let resolvedClient = opts.client;
  const lowerModel = (opts.model || "").toLowerCase();

  if (!resolvedClient) {
    if (lowerModel.includes("codex")) resolvedClient = "Codex";
    else if (lowerModel.includes("copilot")) resolvedClient = "Copilot";
    else if (lowerModel.includes("claude")) resolvedClient = "ClaudeCode";
    else {
      const config = loadInitConfig(opts.cwd);
      const tools = config?.agentTools || [];
      if (tools.includes("codex")) resolvedClient = "Codex";
      else if (tools.includes("copilot")) resolvedClient = "Copilot";
      else if (tools.includes("cursor")) resolvedClient = "Cursor";
      else if (tools.includes("claude")) resolvedClient = "ClaudeCode";
      else {
        for (const spoke of SPOKE_REGISTRY) {
          if (spoke.id !== "antigravity" && spoke.detect(opts.cwd, tools)) {
            if (spoke.id === "copilot") { resolvedClient = "Copilot"; break; }
            if (spoke.id === "codex") { resolvedClient = "Codex"; break; }
            if (spoke.id === "cursor") { resolvedClient = "Cursor"; break; }
            if (spoke.id === "claude") { resolvedClient = "ClaudeCode"; break; }
            if (spoke.id === "windsurf") { resolvedClient = "Windsurf"; break; }
            if (spoke.id === "jetbrains") { resolvedClient = "JetBrains"; break; }
          }
        }
      }
    }
    if (!resolvedClient) resolvedClient = "Antigravity";
  }

  const entry = appendTelemetryRecord(opts.cwd, {
    source: opts.source || "manual",
    kind: opts.kind || "work",
    event: opts.event || "",
    tokens: Number(opts.tokens || 0),
    tdw: Number(opts.tdw || 0),
    model: opts.model || "UNKNOWN",
    client: resolvedClient,
    ticket: opts.ticket || "",
    action: opts.action || "work",
    file: opts.file || "",
    ragResult: normalizeEnum(opts.ragResult, RAG_RESULTS),
    localFallback: Boolean(opts.localFallback),
    knowledgeAction: normalizeEnum(opts.knowledgeAction, KNOWLEDGE_ACTIONS) || "none",
    tokenQuality: normalizeEnum(opts.tokenQuality, TOKEN_QUALITIES),
    savedTokens: Number(opts.savedTokens || 0),
    occurredAt: opts.occurredAt || ""
  });

  console.log(`[TELEMETRY] Logged ${entry.tokens} tokens for ticket ${entry.ticket} in ${TELEMETRY_FILE}`);
}

async function syncAction(opts) {
  const absPath = join(opts.cwd, TELEMETRY_FILE);
  if (!existsSync(absPath)) {
    console.log("[TELEMETRY] No local logs to sync.");
    return;
  }

  const config = loadInitConfig(opts.cwd);
  const pipelineUrl = opts.remote || config?.pipelineUrl || "http://localhost:8001/api/telemetry/ingest";

  const lines = readFileSync(absPath, "utf8").split("\n").filter(l => l.trim());
  const entries = lines.map(l => JSON.parse(l));
  const unsynced = entries.filter(e => !e.synced);

  if (unsynced.length === 0) {
    console.log("[TELEMETRY] All logs already synced.");
    return;
  }

  console.log(`[TELEMETRY] Syncing ${unsynced.length} entries to ${pipelineUrl}...`);

  try {
    // In a real environment, we'd use fetch or a pipeline sync tool.
    // For now, we simulate the sync success and mark them as synced.
    // We try to use the built-in fetch if available.
    if (typeof fetch === "function") {
       const res = await fetch(pipelineUrl, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ logs: unsynced })
       });
       if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    } else {
       console.warn("[TELEMETRY] fetch not available, simulating sync...");
    }

    const updatedLines = entries.map(e => {
      if (!e.synced) e.synced = true;
      return JSON.stringify(e);
    }).join("\n") + "\n";

    writeFileSync(absPath, updatedLines, "utf8");
    console.log(`[TELEMETRY] Successfully synced ${unsynced.length} entries.`);
  } catch (err) {
    console.error(`[TELEMETRY] Sync failed: ${err.message}`);
    process.exitCode = 1;
  }
}

async function summaryAction(opts) {
  const absPath = join(opts.cwd, TELEMETRY_FILE);
  if (!existsSync(absPath)) {
    console.log("[TELEMETRY] No logs found.");
    return;
  }

  const lines = readFileSync(absPath, "utf8").split("\n").filter(l => l.trim());
  const logs = lines.map(l => JSON.parse(l));
  const workflowEvents = logs.filter(isInternalWorkflowEvent);
  const workLogs = logs.filter(l => !isInternalWorkflowEvent(l));
  const missingEventCount = logs.filter(l => !String(l.event || "").trim()).length;
  const eventCoverageRate = rate(logs.length - missingEventCount, logs.length);

  const totalTokens = workLogs.reduce((sum, l) => sum + l.tokens, 0);
  const totalTdwTokens = workLogs.reduce((sum, l) => sum + Number(l.tdw || 0), 0);
  const totalSavedTokens = workLogs.reduce((sum, l) => sum + Number(l.savedTokens || 0), 0);
  const byModel = workLogs.reduce((acc, l) => {
    acc[l.model] = (acc[l.model] || 0) + l.tokens;
    return acc;
  }, {});
  const tdwEntryCount = workLogs.filter(l => Number(l.tdw || 0) > 0).length;
  const tdwAverageTokensPerEntry = tdwEntryCount > 0 ? totalTdwTokens / tdwEntryCount : 0;
  const byRagResult = countBy(workLogs, "ragResult");
  const byTokenQuality = countBy(workLogs, "tokenQuality");
  const byKnowledgeAction = countBy(workLogs, "knowledgeAction");
  const byKnowledgeSourceKind = countBy(workflowEvents, "knowledgeSourceKind");
  const byKnowledgeIngestionCategory = countBy(workflowEvents, "knowledgeIngestionCategory");
  const byKnowledgeCorpus = countBy(workflowEvents, "knowledgeCorpus");
  const byKnowledgeOriginTool = countBy(workflowEvents, "knowledgeOriginTool");
  const localFallbackCount = workLogs.filter(l => l.localFallback).length;
  const ragCalls = Object.values(byRagResult).reduce((sum, n) => sum + n, 0);
  const ragHits = (byRagResult.hit || 0) + (byRagResult["weak-hit"] || 0);
  const ragMisses = byRagResult.miss || 0;
  const staleKnowledge = byRagResult.stale || 0;
  const workflowSummary = summarizeWorkflowEvents(workflowEvents);

  if (opts.json) {
    console.log(JSON.stringify({
      cwd: opts.cwd,
      totalTokens,
      totalTdwTokens,
      totalSavedTokens,
      logEntries: workLogs.length,
      totalLogEntries: logs.length,
      missingEventCount,
      eventCoverageRate,
      byModel,
      tdwEntryCount,
      tdwCoverageRate: rate(tdwEntryCount, workLogs.length),
      tdwTokenShare: rate(totalTdwTokens, totalTokens),
      tdwAverageTokensPerEntry,
      ragCalls,
      ragHitRate: rate(ragHits, ragCalls),
      ragMissRate: rate(ragMisses, ragCalls),
      staleKnowledgeRate: rate(staleKnowledge, ragCalls),
      localFallbackRate: rate(localFallbackCount, workLogs.length),
      byRagResult,
      byTokenQuality,
      byKnowledgeAction,
      byKnowledgeSourceKind,
      byKnowledgeIngestionCategory,
      byKnowledgeCorpus,
      byKnowledgeOriginTool,
      workflowEvents: workflowSummary
    }, null, 2));
    return;
  }

  console.log(`\n--- Local Telemetry Summary (${opts.cwd}) ---`);
  console.log(`Total Tokens: ${totalTokens}`);
  console.log(`TDW Tokens: ${totalTdwTokens}`);
  console.log(`Saved Tokens: ${totalSavedTokens}`);
  console.log(`Log Entries:  ${workLogs.length}`);
  console.log(`Total Entries: ${logs.length}`);
  console.log(`Event Coverage:`);
  console.log(`  - Missing Event Count: ${missingEventCount}`);
  console.log(`  - Coverage Rate: ${formatRate(logs.length - missingEventCount, logs.length)}`);
  console.log(`By Model:`);
  Object.entries(byModel).forEach(([m, t]) => {
    console.log(`  - ${m}: ${t}`);
  });
  console.log(`TDW:`);
  console.log(`  - Entries: ${tdwEntryCount}`);
  console.log(`  - Coverage Rate: ${formatRate(tdwEntryCount, workLogs.length)}`);
  console.log(`  - Token Share: ${formatRate(totalTdwTokens, totalTokens)}`);
  console.log(`  - Average Tokens/Entry: ${tdwAverageTokensPerEntry.toFixed(1)}`);
  console.log(`RAG Quality:`);
  console.log(`  - Calls: ${ragCalls}`);
  console.log(`  - Hit Rate: ${formatRate(ragHits, ragCalls)}`);
  console.log(`  - Miss Rate: ${formatRate(ragMisses, ragCalls)}`);
  console.log(`  - Stale Rate: ${formatRate(staleKnowledge, ragCalls)}`);
  console.log(`  - Local Fallback Rate: ${formatRate(localFallbackCount, workLogs.length)}`);
  printCounts("By RAG Result", byRagResult);
  printCounts("By Token Quality", byTokenQuality);
  printCounts("By Knowledge Action", byKnowledgeAction);
  printCounts("By Knowledge Source Kind", byKnowledgeSourceKind);
  printCounts("By Knowledge Ingestion Category", byKnowledgeIngestionCategory);
  printCounts("By Knowledge Corpus", byKnowledgeCorpus);
  printCounts("By Knowledge Origin Tool", byKnowledgeOriginTool);
  console.log(`Internal Workflow Events:`);
  console.log(`  - Events: ${workflowSummary.eventCount}`);
  console.log(`  - Tickets: ${workflowSummary.ticketCount}`);
  console.log(`  - Average Time To Phase Move: ${formatDuration(workflowSummary.averageTimeToPhaseMoveMs)}`);
  console.log(`  - Average Time To Close: ${formatDuration(workflowSummary.averageTimeToCloseMs)}`);
  console.log(`  - Average Time To Archive: ${formatDuration(workflowSummary.averageTimeToArchiveMs)}`);
  printCounts("By Workflow Event", workflowSummary.byEvent);
  console.log("-------------------------------------------\n");
}

async function migrateAction(opts) {
  const absPath = join(opts.cwd, TELEMETRY_FILE);
  if (!existsSync(absPath)) {
    console.log("[TELEMETRY] No logs found.");
    return;
  }

  const lines = readFileSync(absPath, "utf8").split("\n").filter(l => l.trim());
  const entries = lines.map(l => JSON.parse(l));
  const migrated = entries.map(entry => normalizeTelemetryRecord(entry));
  const changedCount = migrated.filter((entry, index) => JSON.stringify(entry) !== JSON.stringify(entries[index])).length;

  if (changedCount === 0) {
    console.log("[TELEMETRY] Telemetry logs already normalized.");
    return;
  }

  writeFileSync(absPath, migrated.map(entry => JSON.stringify(entry)).join("\n") + "\n", "utf8");
  console.log(`[TELEMETRY] Migrated ${changedCount} telemetry entries.`);
}

export function appendTelemetryRecord(cwd, entry = {}) {
  const telemetryDir = join(cwd, AGENT_ROOT_DIR);
  if (!existsSync(telemetryDir)) mkdirSync(telemetryDir, { recursive: true });
  const telemetryPath = join(cwd, TELEMETRY_FILE);
  const occurredAt = entry.occurredAt || new Date().toISOString();
  const event = resolveTelemetryEvent(entry);
  const payload = {
    ts: Math.floor(new Date(occurredAt).getTime() / 1000) || Math.floor(Date.now() / 1000),
    occurredAt,
    source: entry.source || "manual",
    kind: entry.kind || "work",
    event,
    tokens: Number(entry.tokens || 0),
    tdw: Number(entry.tdw || 0),
    model: entry.model || "UNKNOWN",
    client: entry.client || "",
    ticket: entry.ticket || "",
    action: entry.action || "work",
    file: entry.file || "",
    phase: entry.phase ?? "",
    status: entry.status || "",
    ragResult: normalizeEnum(entry.ragResult, RAG_RESULTS),
    localFallback: Boolean(entry.localFallback),
    knowledgeAction: normalizeEnum(entry.knowledgeAction, KNOWLEDGE_ACTIONS) || "",
    knowledgeSourceKind: normalizeText(entry.knowledgeSourceKind),
    knowledgeIngestionCategory: normalizeText(entry.knowledgeIngestionCategory),
    knowledgeCorpus: normalizeText(entry.knowledgeCorpus),
    knowledgeOriginTool: normalizeText(entry.knowledgeOriginTool),
    knowledgeFreshness: normalizeText(entry.knowledgeFreshness),
    tokenQuality: normalizeEnum(entry.tokenQuality, TOKEN_QUALITIES),
    savedTokens: Number(entry.savedTokens || 0),
    synced: false
  };
  appendFileSync(telemetryPath, JSON.stringify(payload) + "\n", "utf8");
  return payload;
}

export function appendInternalWorkflowEvent(cwd, event = {}) {
  return appendTelemetryRecord(cwd, {
    ...event,
    source: INTERNAL_SOURCE,
    kind: WORKFLOW_EVENT_KIND,
    model: event.model || "workflow",
    client: event.client || "DeukAgentRules",
    tokens: 0,
    tdw: 0,
    action: event.action || event.event || "workflow-event"
  });
}

function resolveTelemetryEvent(entry = {}) {
  const explicitEvent = normalizeText(entry.event);
  if (explicitEvent) return explicitEvent;

  if (isInternalWorkflowEvent({
    source: entry.source || INTERNAL_SOURCE,
    kind: entry.kind || WORKFLOW_EVENT_KIND
  })) {
    return normalizeText(entry.action) || normalizeText(entry.kind) || "workflow-event";
  }

  return normalizeText(entry.kind) || "work";
}

function normalizeTelemetryRecord(entry = {}) {
  const cloned = { ...entry };
  cloned.source = cloned.source || "manual";
  cloned.kind = cloned.kind || "work";
  cloned.action = cloned.action || "work";
  cloned.event = resolveTelemetryEvent(cloned);
  cloned.synced = normalizeSyncedState(cloned.synced);
  return cloned;
}

function normalizeEnum(value, allowed) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : "";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeSyncedState(value) {
  return value === true || value === "true";
}

function countBy(logs, key) {
  return logs.reduce((acc, log) => {
    const value = log[key];
    if (value) acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function isInternalWorkflowEvent(log) {
  return log?.source === INTERNAL_SOURCE && log?.kind === WORKFLOW_EVENT_KIND;
}

function summarizeWorkflowEvents(events) {
  const sorted = [...events].sort((a, b) => eventTime(a) - eventTime(b));
  const byTicket = new Map();
  for (const event of sorted) {
    const ticket = event.ticket || "";
    if (!ticket) continue;
    const rows = byTicket.get(ticket) || [];
    rows.push(event);
    byTicket.set(ticket, rows);
  }

  const closeDurations = [];
  const archiveDurations = [];
  const phaseMoveDurations = [];
  for (const rows of byTicket.values()) {
    const created = rows.find(e => e.event === "ticket_created");
    const closed = rows.find(e => e.event === "ticket_closed");
    const archived = rows.find(e => e.event === "ticket_archived");
    const firstPhaseMove = rows.find(e => e.event === "ticket_phase_moved");
    if (created && closed) closeDurations.push(eventTime(closed) - eventTime(created));
    if (created && archived) archiveDurations.push(eventTime(archived) - eventTime(created));
    if (created && firstPhaseMove) phaseMoveDurations.push(eventTime(firstPhaseMove) - eventTime(created));
  }

  return {
    eventCount: events.length,
    ticketCount: byTicket.size,
    byEvent: countBy(events, "event"),
    averageTimeToCloseMs: average(closeDurations),
    averageTimeToArchiveMs: average(archiveDurations),
    averageTimeToPhaseMoveMs: average(phaseMoveDurations)
  };
}

function eventTime(event) {
  const fromOccurredAt = Date.parse(event?.occurredAt || "");
  if (Number.isFinite(fromOccurredAt)) return fromOccurredAt;
  return Number(event?.ts || 0) * 1000;
}

function average(values) {
  return values.length > 0 ? values.reduce((sum, n) => sum + n, 0) / values.length : 0;
}

function formatDuration(ms) {
  if (!ms) return "0ms";
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function rate(value, total) {
  return total > 0 ? value / total : 0;
}

function formatRate(value, total) {
  return `${(rate(value, total) * 100).toFixed(1)}%`;
}

function printCounts(label, counts) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return;
  console.log(`${label}:`);
  entries.forEach(([name, count]) => {
    console.log(`  - ${name}: ${count}`);
  });
}
