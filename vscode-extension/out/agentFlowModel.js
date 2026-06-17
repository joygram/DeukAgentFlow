"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentFlowModel = exports.ticketLifecycleActions = exports.describeTicketProgress = exports.describeTarget = exports.DEFAULT_DEUK_AI_CONTEXT_MCP_ADDRESS = void 0;
const fs = require("fs");
const os = require("os");
const path = require("path");
const vscode = require("vscode");
const child_process_1 = require("child_process");
const ticketHome_1 = require("./ticketHome");
// 워크스페이스 폴더 경로 → CLI registry workspace name 매핑.
// CLI `deuk-agent-flow workspace` 는 `<name>\t<path>` 줄들을 출력한다. WSL(/d/...)과
// Windows(D:\...) 경로 표기가 달라도 동작하도록 basename(마지막 세그먼트)으로 매칭한다.
// 확장은 홈/경로를 직접 만지지 않고 이 name 으로 CLI 에 모든 티켓 데이터를 요청한다.
let workspaceRegistryCache = null;
function baseSeg(p) {
    return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';
}
async function loadWorkspaceRegistry() {
    if (workspaceRegistryCache)
        return workspaceRegistryCache;
    const map = new Map(); // basename → registry name
    const out = await new Promise((resolve) => {
        (0, child_process_1.execFile)('deuk-agent-flow', ['workspace'], { encoding: 'utf8', shell: true }, (err, stdout) => {
            resolve(err ? '' : (stdout || ''));
        });
    });
    for (const line of out.split(/\r?\n/)) {
        const tab = line.indexOf('\t');
        if (tab === -1)
            continue;
        const name = line.slice(0, tab).trim();
        const wsPath = line.slice(tab + 1).trim();
        if (name && wsPath)
            map.set(baseSeg(wsPath), name);
    }
    workspaceRegistryCache = map;
    return map;
}
// 확장 워크스페이스 경로 → CLI registry name. 매칭 실패 시 basename 을 그대로 사용
// (CLI 가 동일 규칙으로 registry 를 구성하므로 basename 이 곧 name 인 경우가 많다).
async function resolveWorkspaceName(workspacePath) {
    const registry = await loadWorkspaceRegistry();
    const base = baseSeg(workspacePath);
    return registry.get(base) ?? base;
}
const ACTIVE_TICKET_KEY = 'deukagentflow.agentflow.activeTicketId';
const PREVIEW_TICKET_KEY = 'deukagentflow.agentflow.previewTicketId';
const SELECTED_TICKETS_KEY = 'deukagentflow.agentflow.selectedTicketIds';
const TARGET_KEY = 'deukagentflow.agentflow.target';
const WORKSPACE_KEY = 'deukagentflow.agentflow.workspacePath';
const STATUS_FILTER_KEY = 'deukagentflow.agentflow.statusFilter';
const TICKET_QUERY_KEY = 'deukagentflow.agentflow.ticketQuery';
const OPEN_TICKET_STATUSES = new Set(['open', 'draft', 'blocked', 'phase1_incomplete']);
const ACTIVE_TICKET_STATUSES = new Set(['active', 'in_progress']);
const TERMINAL_TICKET_STATUSES = new Set(['closed', 'completed', 'cancelled', 'wontfix', 'deprecated']);
const ARCHIVED_TICKET_STATUSES = new Set(['archived']);
exports.DEFAULT_DEUK_AI_CONTEXT_MCP_ADDRESS = 'http://localhost:8001/sse';
function parseFrontmatter(text) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) {
        return { meta: {}, body: text };
    }
    const meta = {};
    for (const line of match[1].split(/\r?\n/)) {
        const idx = line.indexOf(':');
        if (idx === -1)
            continue;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        meta[key] = value;
    }
    return { meta, body: text.slice(match[0].length) };
}
function userConfigDir() {
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'), 'deuk-agent-flow');
    }
    return path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || '', '.config'), 'deuk-agent-flow');
}
async function readGlobalConfig(workspacePath = '') {
    const configPath = path.join(userConfigDir(), 'config.json');
    const mcpPath = workspacePath ? path.join(workspacePath, '.mcp.json') : '';
    const mcpConfigured = mcpPath ? fs.existsSync(mcpPath) : false;
    try {
        const raw = await fs.promises.readFile(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        const docsLanguage = typeof parsed.docsLanguage === 'string' ? parsed.docsLanguage : '';
        const shareTickets = parsed.shareTickets === true;
        const mcpAddress = typeof parsed.mcpAddress === 'string' && parsed.mcpAddress.trim()
            ? parsed.mcpAddress.trim()
            : exports.DEFAULT_DEUK_AI_CONTEXT_MCP_ADDRESS;
        const scmIgnoreDeukAgent = typeof parsed.scmIgnoreDeukAgent === 'boolean'
            ? parsed.scmIgnoreDeukAgent
            : !shareTickets;
        return {
            path: configPath,
            exists: true,
            body: JSON.stringify(parsed, null, 2),
            scmIgnoreDeukAgent,
            mcpConfigured,
            mcpPath,
            mcpEnabled: parsed.mcpEnabled !== false,
            mcpAddress,
            ticketLanguage: docsLanguage.toLowerCase().startsWith('en') ? 'en' : 'ko',
        };
    }
    catch {
        return {
            path: configPath,
            exists: false,
            body: '{}',
            scmIgnoreDeukAgent: true,
            mcpConfigured,
            mcpPath,
            mcpEnabled: true,
            mcpAddress: exports.DEFAULT_DEUK_AI_CONTEXT_MCP_ADDRESS,
            ticketLanguage: 'ko',
        };
    }
}
function cleanText(value, fallback = '') {
    return (value ?? fallback).trim();
}
function deriveTicketLifecycleStatus(meta, filePath) {
    if (filePath.includes(`${path.sep}archive${path.sep}`)) {
        return 'archived';
    }
    const rawStatus = cleanText(meta.status, '').toLowerCase();
    const phase = Number.parseInt(cleanText(meta.phase, '1'), 10) || 1;
    if (TERMINAL_TICKET_STATUSES.has(rawStatus) || ARCHIVED_TICKET_STATUSES.has(rawStatus)) {
        return rawStatus;
    }
    if (phase >= 4) {
        return 'closed';
    }
    if (phase >= 2) {
        return rawStatus && rawStatus !== 'open' ? rawStatus : 'active';
    }
    return rawStatus || 'open';
}
// active 티켓 판정은 CLI(deuk-agent-flow ticket status) 에 위임한다. 확장이 claim-*.json
// 을 직접 읽던 로직(홈 디렉토리 의존)은 #722 에서 제거했다 — cliActiveTicketId 사용.
function firstSentence(text) {
    const compact = text.replace(/\s+/g, ' ').trim();
    const idx = compact.search(/[.!?。](\s|$)/);
    return idx >= 0 ? compact.slice(0, idx + 1) : compact.slice(0, 120);
}
function clipText(value, maxLength) {
    const text = value.replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}
function handoffSummary(ticket) {
    const sections = ticket.body
        .split(/^##\s+/m)
        .map((section) => section.trim())
        .filter(Boolean);
    const usefulSection = sections.find((section) => /^(Problem Analysis|Improvement Direction|Compact Plan)\b/.test(section));
    const source = usefulSection
        ? usefulSection.replace(/^[^\n]*\n?/, '')
        : ticket.summary || firstSentence(ticket.body);
    const compact = source
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*]\s+|\d+\.\s+/, '').trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(' ');
    return clipText(compact || ticket.summary || ticket.title, 260);
}
// CLI(ticket list --json --print-content) 가 준 항목들에서 TicketSummary 를 만든다.
// 파일을 직접 읽지 않고 entry.content(본문)와 entry 메타를 쓴다. 본문 파싱은 기존
// parseFrontmatter 를 그대로 재사용한다.
function summariesFromCliEntries(entries, options = {}) {
    const openOnly = options.openOnly ?? false;
    const tickets = entries.map((entry) => {
        const { meta, body } = parseFrontmatter(entry.content ?? '');
        const phaseNum = parseInt(String(meta.phase ?? entry.phase ?? '1'), 10);
        // openOnly 모드: phase>=4(closed/terminal)는 null 반환해 필터링
        if (openOnly && phaseNum >= 4)
            return null;
        const id = cleanText(meta.id, entry.id);
        // 본문 status 도출엔 파일경로 대신 entry.id(파일명 역할)를 넘긴다.
        const idPath = `${id}.md`;
        return {
            id,
            title: cleanText(meta.title, cleanText(meta.summary, cleanText(entry.title, id))),
            summary: cleanText(meta.summary, firstSentence(body)),
            phase: cleanText(meta.phase, String(entry.phase ?? '1')),
            status: deriveTicketLifecycleStatus(meta, idPath),
            priority: cleanText(meta.priority, 'P2'),
            // 파일 mtime 대신 CLI 가 준 createdAt/updatedAt 을 쓴다(홈/파일 미접근).
            createdAt: cleanText(meta.createdAt, cleanText(entry.createdAt, cleanText(entry.updatedAt, ''))),
            filePath: idPath,
            body,
            // telemetry 는 홈 디렉토리(telemetry.jsonl) 접근이 필요해 CLI 위임 범위 밖 →
            // 홈을 직접 만지지 않기 위해 제거. (#722)
            recentTelemetry: [],
        };
    }).filter((t) => t !== null);
    tickets.sort((a, b) => {
        const aTime = Date.parse(a.createdAt) || 0;
        const bTime = Date.parse(b.createdAt) || 0;
        return bTime - aTime;
    });
    return tickets;
}
// CLI 위임: workspace 의 티켓을 deuk-agent-flow ticket list 에서 받는다.
// 홈/경로/파일시스템을 직접 만지지 않는다. (#722)
async function readWorkspaceTickets(workspacePath, options = {}) {
    const includeArchive = options.includeArchive ?? false;
    const openOnly = options.openOnly ?? false;
    const name = await resolveWorkspaceName(workspacePath);
    const [listed, active] = await Promise.all([
        (0, ticketHome_1.listWorkspaceTicketsWithTotal)(name, { all: includeArchive, withContent: true }),
        (0, ticketHome_1.activeTicketId)(name),
    ]);
    const tickets = summariesFromCliEntries(listed.tickets, { openOnly });
    return { tickets, activeTicketId: active, totalCount: listed.total };
}
// archive 티켓도 CLI(ticket list --all) 에 위임한다. terminal/archived 상태만 남긴다.
// 홈/파일 미접근이라 과거 mtime 기반 캐시키는 의미가 없어 단순 카운트 기반으로 둔다.
async function readArchiveTickets(workspacePath) {
    const name = await resolveWorkspaceName(workspacePath);
    const entries = await (0, ticketHome_1.listWorkspaceTickets)(name, { all: true, withContent: true });
    const all = summariesFromCliEntries(entries);
    return all.filter((t) => {
        const s = t.status.toLowerCase();
        return s === 'archived' || s === 'closed' || s === 'terminal' || (parseInt(t.phase, 10) || 1) >= 4;
    });
}
function buildWorkspaceSummary(folder, workspacePath, ticketCount, activeTicketCount = 0) {
    const relativePath = path.relative(folder.uri.fsPath, workspacePath);
    const isRoot = relativePath === '';
    const name = path.basename(workspacePath);
    const folderName = folder.name || path.basename(folder.uri.fsPath);
    return {
        name,
        label: isRoot ? folderName : `${name} (${folderName}/${relativePath})`,
        detail: isRoot ? folder.uri.fsPath : `${folder.uri.fsPath}/${relativePath}`,
        path: workspacePath,
        ticketCount,
        activeTicketCount,
    };
}
function sortTickets(tickets) {
    const statusRank = (status) => {
        switch (status.toLowerCase()) {
            case 'active':
                return 0;
            case 'open':
                return 1;
            case 'archived':
            case 'closed':
                return 3;
            default:
                return 2;
        }
    };
    return [...tickets].sort((a, b) => {
        const rankDiff = statusRank(a.status) - statusRank(b.status);
        if (rankDiff !== 0)
            return rankDiff;
        const aTime = Date.parse(a.createdAt) || 0;
        const bTime = Date.parse(b.createdAt) || 0;
        return bTime - aTime;
    });
}
function normalizeTarget(value) {
    switch (value) {
        case 'antigravity':
        case 'claude-code':
        case 'copilot':
            return value;
        default:
            return 'codex';
    }
}
function normalizeStatusFilter(value) {
    switch (value) {
        case 'open':
        case 'closed':
        case 'all':
            return value;
        case 'active':
            return 'open';
        default:
            return 'open';
    }
}
function matchesStatusFilter(ticket, filter) {
    const family = ticketStatusFamily(ticket.status);
    switch (filter) {
        case 'open':
            return family === 'open' || family === 'active';
        case 'closed':
            return family === 'terminal' || family === 'archived';
        default:
            return true;
    }
}
function normalizeTicketQuery(value) {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}
function isPathInside(childPath, parentPath) {
    const normalizedChild = path.resolve(childPath);
    const normalizedParent = path.resolve(parentPath);
    const relativePath = path.relative(normalizedParent, normalizedChild);
    return Boolean(relativePath &&
        !relativePath.startsWith('..') &&
        !path.isAbsolute(relativePath)) || normalizedChild === normalizedParent;
}
function ticketSearchHaystack(ticket) {
    return [
        ticket.id,
        ticket.title,
        ticket.summary,
        ticket.phase,
        ticket.status,
        ticket.priority,
        ticket.createdAt,
        ticket.filePath,
        ticket.body,
    ].join('\n').toLowerCase();
}
function parseTicketQueryGroups(query) {
    const normalized = normalizeTicketQuery(query).toLowerCase();
    if (!normalized)
        return [];
    return normalized
        .split(/\s*\|\s*|\s+or\s+/i)
        .map((group) => group.split(/\s+/).map((term) => term.trim()).filter(Boolean))
        .filter((group) => group.length > 0);
}
function matchesTicketQuery(ticket, query) {
    const haystack = ticketSearchHaystack(ticket);
    const normalized = normalizeTicketQuery(query).toLowerCase();
    if (!normalized) {
        return true;
    }
    if (haystack.includes(normalized)) {
        return true;
    }
    const groups = parseTicketQueryGroups(normalized);
    if (groups.length === 0) {
        return true;
    }
    return groups.some((group) => group.every((term) => haystack.includes(term)));
}
function describeTarget(target) {
    switch (target) {
        case 'antigravity':
            return 'Antigravity';
        case 'claude-code':
            return 'Claude Code';
        case 'copilot':
            return 'GitHub Copilot';
        default:
            return 'Codex';
    }
}
exports.describeTarget = describeTarget;
function ticketStatusFamily(status) {
    const normalized = status.trim().toLowerCase();
    if (ARCHIVED_TICKET_STATUSES.has(normalized)) {
        return 'archived';
    }
    if (TERMINAL_TICKET_STATUSES.has(normalized)) {
        return 'terminal';
    }
    if (ACTIVE_TICKET_STATUSES.has(normalized)) {
        return 'active';
    }
    if (OPEN_TICKET_STATUSES.has(normalized) || !normalized) {
        return 'open';
    }
    return 'unknown';
}
function describeTicketProgress(ticket) {
    const status = ticket.status.trim().toLowerCase() || 'open';
    const phase = ticket.phase.trim() || '1';
    const family = ticketStatusFamily(status);
    if (family === 'archived') {
        return `archived · phase ${phase}`;
    }
    if (family === 'terminal') {
        return `${status} · completed/terminal · phase ${phase}`;
    }
    if (family === 'active') {
        return `${status} · executing · phase ${phase}`;
    }
    if (status === 'phase1_incomplete') {
        return `${status} · planning incomplete · phase ${phase}`;
    }
    if (family === 'open') {
        return `${status} · planning/open · phase ${phase}`;
    }
    return `${status} · custom · phase ${phase}`;
}
exports.describeTicketProgress = describeTicketProgress;
function ticketLifecycleActions(ticket) {
    const status = ticket.status.trim().toLowerCase();
    const family = ticketStatusFamily(status);
    const phase = Number.parseInt(ticket.phase.trim(), 10) || 1;
    if (family === 'archived') {
        return [];
    }
    if (family === 'terminal') {
        return ['archive'];
    }
    if (status === 'open' && phase <= 1) {
        return ['close', 'discard', 'archive'];
    }
    if (family === 'open' && phase <= 1) {
        return ['close', 'archive'];
    }
    return ['close', 'archive'];
}
exports.ticketLifecycleActions = ticketLifecycleActions;
class AgentFlowModel {
    constructor(context) {
        this.context = context;
        // Archive tickets are loaded lazily (only for closed/all filters) and cached per
        // workspace. The cache is reused while the archive directory's key (file count +
        // newest mtime) is unchanged.
        this.archiveCache = new Map();
        this.snapshot = {
            workspaceName: 'No Workspace',
            workspacePath: '',
            workspaces: [],
            activeTicket: null,
            previewTicket: null,
            selectedTicketIds: [],
            allTickets: [],
            totalTicketCount: 0,
            tickets: [],
            target: 'codex',
            statusFilter: 'open',
            ticketQuery: '',
            lastAction: 'Ready',
            prompt: '',
            handoff: '',
            command: {
                label: 'No command yet',
                command: '',
                status: 'idle',
                output: '',
                exitCode: null,
            },
            globalConfig: {
                path: path.join(userConfigDir(), 'config.json'),
                exists: false,
                body: '{}',
                scmIgnoreDeukAgent: true,
                mcpConfigured: false,
                mcpPath: '',
                mcpEnabled: true,
                mcpAddress: exports.DEFAULT_DEUK_AI_CONTEXT_MCP_ADDRESS,
                ticketLanguage: 'ko',
            },
            skills: [],
            previewSkillId: null,
            workspaceLoading: false,
        };
    }
    invalidateArchiveCache() {
        this.archiveCache.clear();
    }
    // Returns archive tickets for a workspace, reusing the cached list while the
    // archive directory key is unchanged. Only called when the active filter needs
    // archived tickets (closed/all).
    async loadArchiveTickets(workspacePath) {
        // archive 는 'closed'/'all' 필터 시에만 호출된다. CLI 위임이라 홈/파일 접근이
        // 없고, 과거 mtime 기반 캐시키가 의미 없어 매 호출 CLI 조회로 단순화한다(#722).
        return readArchiveTickets(workspacePath);
    }
    setSkills(skills) {
        const previewSkillId = this.snapshot.previewSkillId && skills.some((skill) => skill.id === this.snapshot.previewSkillId)
            ? this.snapshot.previewSkillId
            : null;
        this.snapshot = { ...this.snapshot, skills, previewSkillId };
    }
    setPreviewSkill(skillId) {
        this.snapshot = { ...this.snapshot, previewSkillId: skillId };
    }
    async refresh() {
        const _t0 = Date.now();
        const configuredWorkspacePath = this.context.workspaceState.get(WORKSPACE_KEY) ?? '';
        const globalConfig = await readGlobalConfig(configuredWorkspacePath);
        console.log(`[perf] readGlobalConfig: ${Date.now() - _t0}ms`);
        const folders = vscode.workspace.workspaceFolders ?? [];
        if (folders.length === 0) {
            this.snapshot = {
                ...this.snapshot,
                globalConfig,
                workspaceName: 'No Workspace',
                workspacePath: '',
                workspaces: [],
                activeTicket: null,
                previewTicket: null,
                selectedTicketIds: [],
                allTickets: [],
                totalTicketCount: 0,
                tickets: [],
                ticketQuery: '',
                prompt: 'Open a workspace to load AgentFlow tickets.',
                handoff: 'No workspace is open.',
            };
            return this.snapshot;
        }
        const workspaceEntries = [];
        const folderEntryPairs = folders.map((folder) => ({
            folder,
            workspacePath: folder.uri.fsPath,
        }));
        // Read the status filter BEFORE loading tickets so archive (closed/all only)
        // can be skipped entirely on the common 'open' path. The same value is re-read
        // later for in-memory filtering; reading it twice is cheap and keeps the load
        // decision local.
        const earlyStatusFilter = normalizeStatusFilter(this.context.workspaceState.get(STATUS_FILTER_KEY));
        const needArchive = earlyStatusFilter === 'closed' || earlyStatusFilter === 'all';
        // Selected workspace: storedWorkspacePath → activeEditor → first.
        // readdirSync 루프(ticketId prefix 스캔)는 제거 — 동기 블록 병목이었음.
        const earlyActiveEditorPath = vscode.window.activeTextEditor?.document?.uri?.scheme === 'file'
            ? vscode.window.activeTextEditor.document.uri.fsPath
            : '';
        const selectedWorkspacePath = (() => {
            if (configuredWorkspacePath) {
                const byStored = folderEntryPairs.find(({ workspacePath }) => workspacePath === configuredWorkspacePath);
                if (byStored)
                    return byStored.workspacePath;
            }
            const byEditor = folderEntryPairs.find(({ folder }) => earlyActiveEditorPath && isPathInside(earlyActiveEditorPath, folder.uri.fsPath));
            if (byEditor)
                return byEditor.workspacePath;
            return folderEntryPairs[0]?.workspacePath ?? '';
        })();
        // 선택 워크스페이스: open 티켓만 본문 파싱(openOnly).
        // 비선택 워크스페이스: CLI 카운트만(본문 없이), I/O 최소화.
        const _tLoad = Date.now();
        const [selectedState, ...nonSelectedCounts] = await Promise.all([
            readWorkspaceTickets(selectedWorkspacePath, { openOnly: true }),
            ...folderEntryPairs
                .filter(({ workspacePath }) => workspacePath !== selectedWorkspacePath)
                .map(async ({ workspacePath }) => {
                const name = await resolveWorkspaceName(workspacePath);
                const { tickets: entries, total } = await (0, ticketHome_1.listWorkspaceTicketsWithTotal)(name);
                const activeCount = entries.filter((e) => {
                    const s = (e.status ?? '').toLowerCase();
                    const p = typeof e.phase === 'number' ? e.phase : parseInt(String(e.phase ?? '1'), 10);
                    return (s === 'open' || s === 'draft' || s === 'blocked') && p < 4;
                }).length;
                // #756: count = workspace-wide total (all statuses), not just open rows.
                return { workspacePath, count: total, activeCount };
            }),
        ]);
        console.log(`[perf] ticket load (selected+counts): ${Date.now() - _tLoad}ms, selected=${selectedWorkspacePath}`);
        // 선택 ws archive (needArchive 시만)
        const selectedArchive = needArchive
            ? await this.loadArchiveTickets(selectedWorkspacePath)
            : [];
        const selectedMerged = needArchive
            ? [...selectedState.tickets, ...selectedArchive]
            : selectedState.tickets;
        // workspaceEntries 구성: 선택 ws 먼저, 나머지는 카운트만
        const selectedActiveCount = selectedMerged.filter((t) => {
            const s = t.status.toLowerCase();
            const p = parseInt(t.phase, 10) || 1;
            return (s === 'open' || s === 'draft' || s === 'blocked') && p < 4;
        }).length;
        workspaceEntries.push({
            summary: buildWorkspaceSummary(folderEntryPairs.find(({ workspacePath }) => workspacePath === selectedWorkspacePath).folder, selectedWorkspacePath, 
            // #756: denominator = workspace-wide total (all statuses), not just the
            // loaded open/merged subset, so the panel shows "open / total" correctly.
            selectedState.totalCount, selectedActiveCount),
            tickets: selectedMerged,
            activeTicketId: selectedState.activeTicketId,
        });
        const nonSelectedPairs = folderEntryPairs.filter(({ workspacePath }) => workspacePath !== selectedWorkspacePath);
        for (let i = 0; i < nonSelectedPairs.length; i++) {
            const { folder, workspacePath } = nonSelectedPairs[i];
            const countResult = nonSelectedCounts[i];
            const count = countResult?.count ?? 0;
            const activeCount = countResult?.activeCount ?? 0;
            workspaceEntries.push({
                summary: buildWorkspaceSummary(folder, workspacePath, count, activeCount),
                tickets: [],
                activeTicketId: null,
            });
        }
        if (workspaceEntries.length === 0) {
            this.snapshot = {
                ...this.snapshot,
                globalConfig,
                workspaceName: 'No AgentFlow Workspace',
                workspacePath: '',
                workspaces: [],
                activeTicket: null,
                previewTicket: null,
                selectedTicketIds: [],
                allTickets: [],
                totalTicketCount: 0,
                tickets: [],
                ticketQuery: '',
                lastAction: 'No AgentFlow workspace found',
                prompt: 'No AgentFlow workspace was found under the opened folders.',
                handoff: 'Open a folder that contains a .deuk-workspace-id file.',
            };
            return this.snapshot;
        }
        const target = normalizeTarget(this.context.workspaceState.get(TARGET_KEY));
        const storedWorkspacePath = configuredWorkspacePath;
        const storedTicketId = this.context.workspaceState.get(ACTIVE_TICKET_KEY);
        const storedPreviewTicketId = this.context.workspaceState.get(PREVIEW_TICKET_KEY);
        const storedSelectedTicketIds = this.context.workspaceState.get(SELECTED_TICKETS_KEY) ?? [];
        const statusFilter = normalizeStatusFilter(this.context.workspaceState.get(STATUS_FILTER_KEY));
        const ticketQuery = normalizeTicketQuery(this.context.workspaceState.get(TICKET_QUERY_KEY));
        const activeEditorPath = vscode.window.activeTextEditor?.document?.uri?.scheme === "file"
            ? vscode.window.activeTextEditor.document.uri.fsPath
            : "";
        const activeEditorWorkspace = workspaceEntries.find((entry) => activeEditorPath && isPathInside(activeEditorPath, entry.summary.path));
        const storedWorkspace = workspaceEntries.find((entry) => entry.summary.path === storedWorkspacePath);
        const ticketWorkspace = workspaceEntries.find((entry) => entry.tickets.some((ticket) => ticket.id === storedTicketId));
        const selectedWorkspace = activeEditorWorkspace ?? storedWorkspace ?? ticketWorkspace ?? workspaceEntries[0];
        const selectedGlobalConfig = await readGlobalConfig(selectedWorkspace.summary.path);
        const sortedTickets = sortTickets(selectedWorkspace.tickets);
        const filteredTickets = sortedTickets.filter((ticket) => matchesStatusFilter(ticket, statusFilter) && matchesTicketQuery(ticket, ticketQuery));
        const durableActiveTicketId = selectedWorkspace.activeTicketId;
        const activeTicket = sortedTickets.find((ticket) => ticket.id === durableActiveTicketId) ??
            sortedTickets.find((ticket) => ticket.id === storedTicketId) ??
            sortedTickets[0] ??
            null;
        const previewTicket = filteredTickets.find((ticket) => ticket.id === storedPreviewTicketId) ??
            filteredTickets[0] ??
            null;
        const selectedTicketIds = storedSelectedTicketIds.filter((ticketId) => sortedTickets.some((ticket) => ticket.id === ticketId));
        if (activeTicket && activeTicket.id !== storedTicketId) {
            await this.context.workspaceState.update(ACTIVE_TICKET_KEY, activeTicket.id);
        }
        if (selectedTicketIds.length !== storedSelectedTicketIds.length) {
            await this.context.workspaceState.update(SELECTED_TICKETS_KEY, selectedTicketIds);
        }
        const prompt = activeTicket
            ? this.buildPrompt(activeTicket, target)
            : `No active ticket selected for ${selectedWorkspace.summary.label}.`;
        const handoff = activeTicket
            ? this.buildHandoff(activeTicket, target)
            : `No active ticket selected for ${selectedWorkspace.summary.label}.`;
        this.snapshot = {
            workspaceName: selectedWorkspace.summary.label,
            workspacePath: selectedWorkspace.summary.path,
            workspaces: workspaceEntries.map((entry) => entry.summary),
            activeTicket,
            previewTicket,
            selectedTicketIds,
            allTickets: sortedTickets,
            tickets: filteredTickets,
            totalTicketCount: selectedWorkspace.summary.ticketCount,
            target,
            statusFilter,
            ticketQuery,
            lastAction: activeTicket
                ? `Loaded ${activeTicket.id} from ${selectedWorkspace.summary.name}`
                : `Selected ${selectedWorkspace.summary.name}`,
            prompt,
            handoff,
            command: this.snapshot.command,
            globalConfig: selectedGlobalConfig,
            skills: this.snapshot.skills,
            previewSkillId: this.snapshot.previewSkillId,
            workspaceLoading: this.snapshot.workspaceLoading,
        };
        console.log(`[perf] refresh() TOTAL: ${Date.now() - _t0}ms`);
        return this.snapshot;
    }
    getSnapshot() {
        return this.snapshot;
    }
    // #737: 세션 쿠키(~/.deuk/cookie-{wsId}-{ticketId}-{sessionId}) 스캔 →
    // 현재 활성 세션이 claim한 워크스페이스+티켓을 statusBar에 표시하기 위한 요약.
    // 에디터 탭 기준이 아닌 세션 기준이므로 멀티 워크스페이스에서 정확한 컨텍스트 제공.
    getStatusBarSummary() {
        const COOKIE_PREFIX = 'cookie-';
        const COOKIE_TTL_MS = 30 * 60 * 1000;
        const deukHome = path.join(os.homedir(), '.deuk');
        try {
            if (!fs.existsSync(deukHome))
                return { workspaceName: this.snapshot.workspaceName, ticketNum: null, phase: null };
            const files = fs.readdirSync(deukHome).filter(f => f.startsWith(COOKIE_PREFIX));
            const now = Date.now();
            // workspaceId(sanitized) → { ticketId, phase } — 가장 최근 mtime 우선
            const byWs = new Map();
            for (const f of files) {
                const body = f.slice(COOKIE_PREFIX.length);
                // format: {wsId}-{ticketId}-{sessionId} — wsId는 첫 번째 세그먼트
                const firstDash = body.indexOf('-');
                if (firstDash < 0)
                    continue;
                const wsId = body.slice(0, firstDash);
                const rest = body.slice(firstDash + 1);
                const lastDash = rest.lastIndexOf('-');
                const ticketId = lastDash >= 0 ? rest.slice(0, lastDash) : null;
                try {
                    const mtime = fs.statSync(path.join(deukHome, f)).mtimeMs;
                    if (now - mtime > COOKIE_TTL_MS)
                        continue;
                    const existing = byWs.get(wsId);
                    if (!existing || mtime > existing.mtime)
                        byWs.set(wsId, { ticketId: ticketId === 'none' ? null : ticketId, mtime });
                }
                catch {
                    continue;
                }
            }
            // workspaces 배열에서 sanitized name(path basename 소문자)으로 매칭
            for (const ws of this.snapshot.workspaces) {
                const sanitized = path.basename(ws.path).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
                const entry = byWs.get(sanitized);
                if (entry) {
                    const ticketNum = entry.ticketId ? entry.ticketId.split('-')[0] : null;
                    // phase는 allTickets에서 찾기
                    let phase = null;
                    if (entry.ticketId) {
                        const ticket = this.snapshot.allTickets.find(t => t.id.startsWith(entry.ticketId));
                        if (ticket?.phase)
                            phase = `ph${ticket.phase}`;
                    }
                    return { workspaceName: ws.name, ticketNum, phase };
                }
            }
        }
        catch { /* 쿠키 스캔 실패 시 현재 snapshot 폴백 */ }
        return { workspaceName: this.snapshot.workspaceName, ticketNum: null, phase: null };
    }
    async setActiveTicket(ticketId) {
        await this.context.workspaceState.update(ACTIVE_TICKET_KEY, ticketId);
        return this.refresh();
    }
    async setPreviewTicket(ticketId) {
        await this.context.workspaceState.update(PREVIEW_TICKET_KEY, ticketId);
        return this.updateSelectionSnapshot(this.snapshot.selectedTicketIds, ticketId);
    }
    async toggleSelectedTicket(ticketId) {
        const currentIds = this.context.workspaceState.get(SELECTED_TICKETS_KEY) ?? [];
        const nextIds = currentIds.includes(ticketId)
            ? currentIds.filter((currentId) => currentId !== ticketId)
            : [...currentIds, ticketId];
        await this.context.workspaceState.update(SELECTED_TICKETS_KEY, nextIds);
        await this.context.workspaceState.update(PREVIEW_TICKET_KEY, ticketId);
        return this.updateSelectionSnapshot(nextIds, ticketId);
    }
    async setSelectedTickets(ticketIds, previewTicketId) {
        const uniqueTicketIds = Array.from(new Set(ticketIds));
        await this.context.workspaceState.update(SELECTED_TICKETS_KEY, uniqueTicketIds);
        await this.context.workspaceState.update(PREVIEW_TICKET_KEY, previewTicketId);
        return this.updateSelectionSnapshot(uniqueTicketIds, previewTicketId);
    }
    updateSelectionSnapshot(ticketIds, previewTicketId) {
        const knownTicketIds = new Set(this.snapshot.allTickets.map((ticket) => ticket.id));
        const selectedTicketIds = ticketIds.filter((ticketId) => knownTicketIds.has(ticketId));
        const previewTicket = this.findTicket(previewTicketId) ?? this.snapshot.previewTicket;
        this.snapshot = {
            ...this.snapshot,
            previewTicket,
            selectedTicketIds,
            lastAction: previewTicket ? `Preview ${previewTicket.id}` : this.snapshot.lastAction,
        };
        return this.snapshot;
    }
    async setActiveWorkspace(workspacePath) {
        await this.context.workspaceState.update(WORKSPACE_KEY, workspacePath);
        return this.refresh();
    }
    async switchTarget(target) {
        await this.context.workspaceState.update(TARGET_KEY, target);
        return this.refresh();
    }
    async setStatusFilter(statusFilter) {
        await this.context.workspaceState.update(STATUS_FILTER_KEY, statusFilter);
        return this.refresh();
    }
    async setTicketQuery(ticketQuery) {
        await this.context.workspaceState.update(TICKET_QUERY_KEY, normalizeTicketQuery(ticketQuery));
        return this.refresh();
    }
    setCommand(command) {
        this.snapshot = {
            ...this.snapshot,
            command,
            lastAction: command.label,
        };
        return this.snapshot;
    }
    appendCommandOutput(chunk) {
        const nextOutput = `${this.snapshot.command.output}${chunk}`.slice(-12000);
        this.snapshot = {
            ...this.snapshot,
            command: {
                ...this.snapshot.command,
                output: nextOutput,
            },
        };
        return this.snapshot;
    }
    async chooseActiveTicket() {
        const tickets = this.snapshot.allTickets.length > 0 ? this.snapshot.allTickets : this.snapshot.tickets;
        if (tickets.length === 0) {
            return null;
        }
        const quickPick = vscode.window.createQuickPick();
        const toItem = (ticket) => ({
            label: `${ticket.id}  ${ticket.title}  ${ticket.summary.slice(0, 60)}`,
            description: `${ticket.phase} · ${ticket.status} · ${ticket.priority}`,
            detail: ticket.body.replace(/^#+\s.*$/gm, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 900),
            ticketId: ticket.id,
        });
        const applySearch = (value) => {
            const query = normalizeTicketQuery(value);
            const matched = query ? tickets.filter((ticket) => matchesTicketQuery(ticket, query)) : tickets;
            quickPick.items = matched.slice(0, 80).map(toItem);
        };
        quickPick.title = 'Search Ticket';
        quickPick.placeholder = 'id, title, summary, body search. Spaces mean all words; OR or | means alternatives.';
        quickPick.matchOnDescription = false;
        quickPick.matchOnDetail = false;
        applySearch('');
        const picked = await new Promise((resolve) => {
            quickPick.onDidChangeValue(applySearch);
            quickPick.onDidAccept(() => {
                resolve(quickPick.selectedItems[0]);
                quickPick.hide();
            });
            quickPick.onDidHide(() => resolve(undefined));
            quickPick.show();
        });
        quickPick.dispose();
        return picked ? this.setActiveTicket(picked.ticketId) : null;
    }
    findTicket(ticketId) {
        return this.snapshot.tickets.find((ticket) => ticket.id === ticketId)
            ?? this.snapshot.allTickets.find((ticket) => ticket.id === ticketId)
            ?? (this.snapshot.activeTicket?.id === ticketId ? this.snapshot.activeTicket : undefined);
    }
    buildPrompt(ticket, target) {
        const role = describeTarget(target);
        return [
            `You are operating inside the Deuk Agent Flow control loop.`,
            `Target: ${role}`,
            `Workspace: ${this.snapshot.workspaceName}`,
            `Workspace path: ${this.snapshot.workspacePath}`,
            `Ticket: ${ticket.id}`,
            `Phase: ${ticket.phase}`,
            `Status: ${ticket.status}`,
            `Priority: ${ticket.priority}`,
            `Title: ${ticket.title}`,
            `Summary: ${ticket.summary}`,
            `Ticket path: ${ticket.filePath}`,
            '',
            'Follow the active ticket scope, keep changes minimal, and preserve protocol and version contracts.',
            'If the scope changes, record the correction before proceeding.',
        ].join('\n');
    }
    buildHandoff(ticket, _target) {
        const progress = describeTicketProgress(ticket);
        return [
            `flow:[${this.snapshot.workspaceName}:티켓시작] [${ticket.id}](${ticket.filePath})`,
            `Workspace: ${this.snapshot.workspaceName}`,
            `Workspace path: ${this.snapshot.workspacePath}`,
            `Ticket: ${ticket.id}`,
            `State: phase=${ticket.phase}, status=${ticket.status}, ${progress}`,
            `Summary: ${handoffSummary(ticket)}`,
            `Continue: deuk-agent-flow ticket use --id ${ticket.id}`,
        ].join('\n');
    }
}
exports.AgentFlowModel = AgentFlowModel;
//# sourceMappingURL=agentFlowModel.js.map