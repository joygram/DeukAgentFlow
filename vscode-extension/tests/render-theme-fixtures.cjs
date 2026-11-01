const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { pathToFileURL } = require('node:url');

const out = path.resolve(process.argv[2]);
fs.mkdirSync(out, { recursive: true });
const load = Module._load;
Module._load = function (id, ...args) {
  if (id === 'vscode') return { env: { language: 'ko' }, Uri: { file: value => value } };
  return load.call(this, id, ...args);
};
const { AgentFlowCommandCenter } = require('../out/agentFlowView');
Module._load = load;
const extensionPath = path.resolve(__dirname, '..');
const ticket = {
  id: '1173-brand-refresh', title: '문서·웹·상품 이미지 정리',
  summary: '스킬 기반 행동 교정과 검증 근거를 소개하고 테마 정합 확인.',
  phase: '2', status: 'active', priority: 'medium', createdAt: '2026-11-01',
  filePath: '/example/1173-brand-refresh.md', body: '# 문서·브랜드 정리\n\n- 변경 범위·실제 검증·잔여 위험 기록.', recentTelemetry: [],
};
const snapshot = {
  workspaceName: 'DeukAgentFlow', workspacePath: '/example',
  workspaces: [{ name: 'DeukAgentFlow', label: 'DeukAgentFlow', path: '/example', detail: '', ticketCount: 1, activeTicketCount: 1 }],
  activeTicket: ticket, previewTicket: ticket, selectedTicketIds: [ticket.id],
  allTickets: [ticket], tickets: [ticket], totalTicketCount: 1,
  target: 'codex', statusFilter: 'open', ticketQuery: '', lastAction: '검증', prompt: '', handoff: '',
  command: { label: '문서 검사', command: 'npm run check:surface', status: 'success', output: 'PASS · 문서 표면 검사', exitCode: 0 },
  globalConfig: { path: '/example/config.json', exists: true, body: '{}', scmIgnoreDeukAgent: true, mcpConfigured: false, mcpPath: '', mcpEnabled: false, mcpAddress: '', ticketLanguage: 'ko' },
  skills: [{ id: 'safe-refactor', installed: true, exposed: ['codex'], summary: '작은 범위와 검증', category: 'refactor', body: '# Safe refactor\n\n- 범위 안에서 수정·검증.' }, { id: 'doc-sync', installed: false, exposed: [], summary: '설계 기준 문서 정합', category: 'documentation' }],
  previewSkillId: 'safe-refactor', workspaceLoading: false,
};
const center = new AgentFlowCommandCenter({ extensionPath, extension: { packageJSON: { version: 'theme-preview' } } }, { getSnapshot: () => snapshot });
const webview = { asWebviewUri: value => pathToFileURL(value).href, cspSource: 'file:' };
for (const state of ['workspace', 'skill', 'empty', 'loading']) {
  center.activeTab = state === 'skill' ? 'skill' : 'workspace';
  center.workspaceLoading = state === 'loading';
  center.skillsLoading = false;
  const saved = { ...snapshot };
  if (state === 'empty') Object.assign(snapshot, { activeTicket: null, previewTicket: null, selectedTicketIds: [], allTickets: [], tickets: [], totalTicketCount: 0, command: { ...snapshot.command, output: '', status: 'idle' } });
  fs.writeFileSync(path.join(out, `${state}.html`), center.renderHtml(webview, 'sidebar'));
  Object.assign(snapshot, saved);
}
console.log('Rendered actual extension HTML for workspace, skills, empty and loading states.');
