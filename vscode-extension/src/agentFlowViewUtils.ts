import { SkillSummary, TicketSummary, TicketTelemetryEntry } from './agentFlowModel';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function clip(value: string, length = 96): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

export function compactPathLabel(value: string): string {
  const normalized = value.replace(/\\/g, '/').trim();
  if (!normalized) {
    return '';
  }
  const segments = normalized.split('/').filter(Boolean);
  return segments.slice(-2).join('/');
}

export function formatTicketDate(value: string): string {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return value;
  }
  const yy = String(dt.getFullYear()).slice(-2);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return `${yy}/${mm}/${dd} ${hh}:${min}`;
}

export function ticketFileName(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const leaf = normalized.split('/').pop() ?? value;
  return leaf.replace(/\.md$/i, '');
}

export function compactPhase(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return 'ph-';
  }
  if (normalized.startsWith('ph')) {
    return normalized;
  }
  if (normalized.startsWith('phase')) {
    return `ph${normalized.slice(5).trim()}`;
  }
  return `ph${normalized}`;
}

export function compactPriority(value: string): string {
  return value.trim().toLowerCase() || 'p-';
}

export function compactProgressLabel(value: string): string {
  return value
    .replace(/\s*·\s*/g, ' / ')
    .replace(/planning\/open/gi, 'planning')
    .replace(/completed\/terminal/gi, 'done')
    .replace(/phase\s*/gi, 'ph')
    .trim();
}

export function shellArg(value: string): string {
  if (process.platform === 'win32') {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function formatCommandOutput(value: string): string {
  const text = value.trim();
  return text.length > 0 ? text : '아직 실행 로그가 없습니다.';
}

// CLI 출력의 마크다운 링크 [label](path) 를 클릭 가능한 앵커로 렌더한다.
// 나머지 텍스트는 escapeHtml로 안전 처리. 앵커 클릭은 data-action="open-file"
// 으로 라우팅되어 확장이 vscode.open 으로 해당 파일을 연다(#647 회귀 복원).
export function renderCommandOutputHtml(value: string): string {
  const text = formatCommandOutput(value);
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(text)) !== null) {
    result += escapeHtml(text.slice(lastIndex, match.index));
    const label = escapeHtml(match[1]);
    const rawPath = match[2].trim();
    // 파일 경로처럼 보이는 링크만 클릭 앵커로(스킴 없는 로컬 경로). http(s) 등은 평문 유지.
    if (/^[a-zA-Z]:[\\/]|^\//.test(rawPath)) {
      result += `<a href="#" class="cmd-file-link" data-action="open-file" data-path="${escapeHtml(rawPath)}" title="${escapeHtml(rawPath)}">${label}</a>`;
    } else {
      result += escapeHtml(match[0]);
    }
    lastIndex = linkPattern.lastIndex;
  }
  result += escapeHtml(text.slice(lastIndex));
  return result;
}

// #650: status 카드 상단에 항상 보여줄 flowLine. 터미널·채팅의
// "📦 workspace · <phase> · #ticket" 표현을 패널 카드와 통일한다.
// 활성 티켓이 없으면 워크스페이스만, 워크스페이스도 없으면 빈 문자열.
export function buildActiveFlowLineHtml(workspaceName: string, ticket: TicketSummary | null): string {
  const ws = String(workspaceName || '').trim();
  if (!ws && !ticket) {
    return '';
  }
  const parts: string[] = [];
  if (ws) {
    parts.push(`📦 ${escapeHtml(ws)}`);
  }
  if (ticket) {
    const phaseLabel = String(ticket.phase || '').trim();
    if (phaseLabel) {
      parts.push(`ph${escapeHtml(phaseLabel)}`);
    }
    parts.push(`#${escapeHtml(String(ticket.id || ''))}`);
  }
  return `<div class="flow-line">${parts.join(' · ')}</div>`;
}

export function ticketPreviewText(ticket: TicketSummary | null): string {
  if (!ticket) {
    return '미리볼 티켓이 없습니다.';
  }
  const body = ticket.body
    .replace(/^#+\s.*$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return body.length > 0 ? body.slice(0, 520) : ticket.summary;
}

export function renderTelemetryRows(entries: TicketTelemetryEntry[]): string {
  if (entries.length === 0) return '';
  const rows = entries
    .slice()
    .reverse()
    .map((e) => {
      const ts = e.occurredAt ? e.occurredAt.replace('T', ' ').slice(0, 16) : '-';
      const label = e.event || e.action || '-';
      const extra = [e.client, e.model, e.tokens != null && e.tokens > 0 ? `${e.tokens} tok` : ''].filter(Boolean).join(' · ');
      return `<div class="telem-row"><span class="telem-ts">${escapeHtml(ts)}</span><span class="telem-label">${escapeHtml(label)}</span>${extra ? `<span class="telem-meta">${escapeHtml(extra)}</span>` : ''}</div>`;
    })
    .join('');
  return `<div class="telem-block"><div class="micro-label" style="margin-bottom:4px">Telemetry</div>${rows}</div>`;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** SKILL.md 에서 frontmatter summary 와 본문을 추출. */
export function parseSkillDoc(raw: string): { summary: string; body: string } {
  const fmMatch = raw.replace(/^﻿/, '').match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  let summary = '';
  let body = raw;
  if (fmMatch) {
    const fm = fmMatch[1];
    body = fmMatch[2];
    const summaryMatch = fm.match(/^\s*summary\s*:\s*(.+)\s*$/m);
    if (summaryMatch) {
      summary = summaryMatch[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return { summary, body: body.trim() };
}

export function renderPreviewPanel(ticket: TicketSummary, activeId?: string): string {
  const previewText = ticketPreviewText(ticket);
  const telemHtml = renderTelemetryRows(ticket.recentTelemetry ?? []);
  const fileLabel = ticketFileName(ticket.filePath);
  return `
    <div class="ticket-preview-panel">
      <div class="meta">
        <button data-action="open-ticket">open</button>
        <span class="preview-file">${escapeHtml(fileLabel)}</span>
        <span class="pill">${escapeHtml(compactPhase(ticket.phase))}</span>
        <span class="pill">${escapeHtml(ticket.status)}</span>
        <span class="pill">${escapeHtml(compactPriority(ticket.priority))}</span>
      </div>
      <div class="preview-body">${escapeHtml(previewText)}</div>
      ${telemHtml}
    </div>
  `;
}

export function renderSkillPreview(skill: SkillSummary | null): string {
  if (!skill) {
    return '';
  }
  const exposed = skill.exposed.length > 0 ? skill.exposed.join(', ') : 'none';
  const body = (skill.body ?? '').slice(0, 1400);
  const bodyHtml = body
    ? `<div class="preview-body">${escapeHtml(body)}${(skill.body ?? '').length > 1400 ? '\n…' : ''}</div>`
    : '<div class="preview-body compact">본문을 찾을 수 없습니다. (SKILL.md 미발견)</div>';
  const summaryHtml = skill.summary
    ? `<div class="skill-preview-summary">${escapeHtml(skill.summary)}</div>`
    : '';
  const categoryEmoji: Record<string, string> = { persona: '🎭', guard: '🛡️', refactor: '✂️', memory: '🧠', agent: '🤖' };
  const catEmoji = skill.category ? (categoryEmoji[skill.category] ?? '📦') : '';
  const categoryHtml = skill.category ? `<span class="pill">${catEmoji} ${escapeHtml(skill.category)}</span>` : '';
  const sourceHtml = `<span class="pill ${skill.source === 'user' ? 'ok' : ''}">${skill.source === 'user' ? 'my skill' : 'bundled'}</span>`;
  return `
    <div class="ticket-preview-panel skill-preview-panel">
      <div class="meta">
        <button data-action="skill-edit" data-skill="${escapeHtml(skill.id)}" title="내 스킬로 편집(전역 사용자 디렉토리에 복사 후 에디터로 열기)">edit</button>
        <span class="preview-file">${escapeHtml(skill.id)}</span>
        <span class="pill ${skill.installed ? 'ok' : ''}">${skill.installed ? 'installed' : 'not installed'}</span>
        ${sourceHtml}
        ${categoryHtml}
        <span class="pill">expose: ${escapeHtml(exposed)}</span>
      </div>
      ${summaryHtml}
      ${bodyHtml}
    </div>
  `;
}

export function renderGlobalConfigPanel(config: import('./agentFlowModel').GlobalConfigSummary): string {
  return `
    <div class="global-config">
      <div class="config-head">
        <div>
          <div class="micro-label">Global Settings</div>
          <div class="config-path">settings</div>
        </div>
        <button class="ghost" data-action="close-settings">close</button>
      </div>
      <div class="config-settings">
        <div class="settings-row">
          <div class="settings-row-name">ignore</div>
          <label class="check-row">
            <input id="scmIgnoreDeukAgent" type="checkbox" ${config.scmIgnoreDeukAgent ? 'checked' : ''} />
            <span>SCM ignore .deuk</span>
          </label>
        </div>
        <div class="settings-row">
          <div class="settings-row-name">mcp</div>
          <div class="mcp-row">
            <input id="mcpEnabled" type="checkbox" title="Use Deuk AI Context MCP" ${config.mcpEnabled ? 'checked' : ''} />
            <input id="mcpAddress" type="text" value="${escapeHtml(config.mcpAddress)}" title="Deuk AI Context MCP address" />
            <button id="mcpReset" class="ghost mcp-reset" data-action="reset-mcp-address">reset</button>
          </div>
          <div class="settings-row-value mcp-status">${escapeHtml(config.mcpConfigured ? `configured · ${config.mcpPath}` : 'not configured')}</div>
        </div>
        <div class="settings-row">
          <div class="settings-row-name">language</div>
          <select id="ticketLanguage" title="Ticket language">
            <option value="ko" ${config.ticketLanguage === 'ko' ? 'selected' : ''}>ko</option>
            <option value="en" ${config.ticketLanguage === 'en' ? 'selected' : ''}>en</option>
          </select>
        </div>
      </div>
    </div>
  `;
}

export function renderTicket(ticket: TicketSummary | null): string {
  if (!ticket) {
    return `
      <div class="summary">활성 티켓이 없습니다. 티켓을 선택하면 핸드오프 내용이 채워집니다.</div>
    `;
  }
  return `
    <div class="title">${escapeHtml(ticket.title)}</div>
    <div class="meta">
      <span class="pill ok">${escapeHtml(ticket.id)}</span>
      <span class="pill">${escapeHtml(ticket.phase)}</span>
      <span class="pill">${escapeHtml(ticket.status)}</span>
      <span class="pill">${escapeHtml(ticket.priority)}</span>
    </div>
    <div class="summary">${escapeHtml(ticket.summary)}</div>
  `;
}

export function renderTicketItem(ticket: TicketSummary, activeId?: string, previewId?: string, selectedIds: string[] = []): string {
  const selected = selectedIds.includes(ticket.id);
  const classes = [
    'ticket-item',
    ticket.id === activeId ? 'active' : '',
    ticket.id === previewId ? 'preview' : '',
    selected ? 'selected' : '',
  ].filter(Boolean).join(' ');
  const lane = ticket.filePath.includes('/main/') ? 'm' : 's';
  const fileName = ticketFileName(ticket.filePath);
  const snippet = clip((ticket.summary.split(/\r?\n/, 1)[0] ?? '').trimStart(), 118);
  return `
    <div class="${classes}" data-ticket-id="${escapeHtml(ticket.id)}">
      <span class="ticket-active-dot" aria-hidden="true"></span>
      <div class="ticket-file-name">${escapeHtml(fileName)}</div>
      <div class="ticket-snippet">${escapeHtml(snippet)}</div>
      <div class="ticket-phase">${escapeHtml(compactPhase(ticket.phase))}</div>
      <div class="ticket-status">${escapeHtml(ticket.status)}</div>
      <div class="ticket-priority">${escapeHtml(compactPriority(ticket.priority))}</div>
      <div class="ticket-date">${escapeHtml(formatTicketDate(ticket.createdAt))}</div>
    </div>
  `;
}
