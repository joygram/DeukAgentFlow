export function buildWebviewScript(nonce: string, encodedState: string, defaultMcpAddress: string): string {
  return `<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = JSON.parse(decodeURIComponent("${encodedState}"));
    const workspaceSelect = document.getElementById('workspaceSelect');
    const statusFilter = document.getElementById('statusFilter');
    const ticketLifecycleAction = document.getElementById('ticketLifecycleAction');
    const scmIgnoreDeukAgent = document.getElementById('scmIgnoreDeukAgent');
    const ticketLanguage = document.getElementById('ticketLanguage');
    const mcpEnabled = document.getElementById('mcpEnabled');
    const mcpAddress = document.getElementById('mcpAddress');
    const mcpReset = document.getElementById('mcpReset');
    const ticketList = document.querySelector('.ticket-list');

    function webviewState() {
      return vscode.getState() || {};
    }

    function applyActiveTab(tab) {
      const next = tab === 'skill' ? 'skill' : 'workspace';
      // 패널 표시는 CSS body[data-tab]에 묶여 있으므로 body도 즉시 갱신해야 한다.
      // 갱신하지 않으면 서버의 비동기 재렌더(broadcastSkills→loadSkills)가 돌아오기
      // 전까지 두 패널이 잘못 표시되어 티켓 뷰가 깨져 보인다.
      document.body.dataset.tab = next;
      document.querySelectorAll('[data-tab-button]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tabButton === next);
      });
    }

    applyActiveTab(document.body.dataset.tab);

    function saveTicketListScroll() {
      if (!ticketList) return;
      vscode.setState({ ...webviewState(), ticketListScrollTop: ticketList.scrollTop });
    }

    requestAnimationFrame(() => {
      const scrollTop = webviewState().ticketListScrollTop;
      if (ticketList && typeof scrollTop === 'number') {
        ticketList.scrollTop = scrollTop;
      }
    });

    function selectedTicketId() {
      return state.previewTicket ? state.previewTicket.id : (state.activeTicket ? state.activeTicket.id : '');
    }

    function shiftSelectedTicketIds(ticketId) {
      const visibleIds = state.tickets.map((ticket) => ticket.id);
      const targetIndex = visibleIds.indexOf(ticketId);
      const anchorId = state.previewTicket?.id || state.selectedTicketIds[state.selectedTicketIds.length - 1] || ticketId;
      const anchorIndex = visibleIds.indexOf(anchorId);
      if (targetIndex < 0 || anchorIndex < 0) return state.selectedTicketIds;
      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      return visibleIds.slice(start, end + 1);
    }

    workspaceSelect?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      vscode.postMessage({ type: 'switch-workspace', text: target.value });
    });

    statusFilter?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      vscode.postMessage({ type: 'set-status-filter', filter: target.value });
    });

    ticketLifecycleAction?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || !target.value) return;
      vscode.postMessage({ type: 'ticket-lifecycle-action', action: target.value, ticketId: selectedTicketId() });
      target.value = '';
    });

    scmIgnoreDeukAgent?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      vscode.postMessage({ type: 'global-settings', scmIgnoreDeukAgent: target.checked });
    });

    ticketLanguage?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      vscode.postMessage({ type: 'global-settings', ticketLanguage: target.value });
    });

    mcpEnabled?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      vscode.postMessage({ type: 'global-settings', mcpEnabled: target.checked });
    });

    mcpAddress?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      vscode.postMessage({ type: 'global-settings', mcpAddress: target.value });
    });

    document.body.addEventListener('click', (event) => {
      const tabButton = event.target.closest('[data-tab-button]');
      if (tabButton instanceof HTMLElement) {
        const tab = tabButton.dataset.tabButton;
        applyActiveTab(tab);
        if (tab === 'skill') {
          vscode.postMessage({ type: 'skill-tab-enter' });
        } else {
          vscode.postMessage({ type: 'workspace-tab-enter' });
        }
        return;
      }
      const skillPreview = event.target.closest('.skill-preview-trigger');
      if (skillPreview instanceof HTMLElement) {
        vscode.postMessage({ type: 'preview-skill', skillId: skillPreview.dataset.skill });
        return;
      }
      const fileLink = event.target.closest('.cmd-file-link');
      if (fileLink instanceof HTMLElement && fileLink.dataset.path) {
        event.preventDefault();
        vscode.postMessage({ type: 'open-file', text: fileLink.dataset.path });
        return;
      }
      const button = event.target.closest('button');
      const item = event.target.closest('.ticket-item');
      if (item?.dataset.ticketId) {
        saveTicketListScroll();
        if (event.shiftKey) {
          vscode.postMessage({ type: 'set-selected-tickets', ticketId: item.dataset.ticketId, ticketIds: shiftSelectedTicketIds(item.dataset.ticketId) });
          return;
        }
        if (event.ctrlKey || event.metaKey) {
          vscode.postMessage({ type: 'toggle-selected-ticket', ticketId: item.dataset.ticketId });
          return;
        }
        vscode.postMessage({ type: 'set-selected-tickets', ticketId: item.dataset.ticketId, ticketIds: [item.dataset.ticketId] });
        return;
      }
      const skillInstall = event.target.closest('.skill-install');
      if (skillInstall instanceof HTMLElement) {
        vscode.postMessage({
          type: 'skill-action',
          skillAction: skillInstall.dataset.installed === '1' ? 'remove' : 'add',
          skillId: skillInstall.dataset.skill,
        });
        return;
      }
      const skillToggle = event.target.closest('.skill-toggle');
      if (skillToggle instanceof HTMLElement && !skillToggle.hasAttribute('disabled')) {
        vscode.postMessage({
          type: 'skill-action',
          skillAction: skillToggle.dataset.on === '1' ? 'unexpose' : 'expose',
          skillId: skillToggle.dataset.skill,
          platform: skillToggle.dataset.platform,
        });
        return;
      }
      if (!button) return;
      const action = button.dataset.action;
      switch (action) {
        case 'toggle-settings':
          document.body.classList.toggle('settings-open');
          break;
        case 'skills-refresh':
          vscode.postMessage({ type: 'skills-refresh' });
          break;
        case 'skill-edit':
          vscode.postMessage({ type: 'skill-edit', skillId: button.dataset.skill });
          break;
        case 'close-settings':
          document.body.classList.remove('settings-open');
          break;
        case 'refresh':
          vscode.postMessage({ type: 'refresh' });
          break;
        case 'open-ticket':
          vscode.postMessage({ type: 'open-ticket', ticketId: selectedTicketId() });
          break;
        case 'create-ticket':
          vscode.postMessage({ type: 'create-ticket' });
          break;
        case 'bind-preview':
          vscode.postMessage({ type: 'bind-preview' });
          break;
        case 'copy-handoff':
          vscode.postMessage({ type: 'copy-handoff' });
          break;
        case 'run-guard':
          vscode.postMessage({ type: 'run-guard' });
          break;
        case 'run-context':
          vscode.postMessage({ type: 'run-context' });
          break;
        case 'open-readme':
          vscode.postMessage({ type: 'open-readme' });
          break;
        case 'open-global-config':
          vscode.postMessage({ type: 'open-global-config' });
          break;
        case 'reset-mcp-address':
          if (mcpAddress instanceof HTMLInputElement) {
            mcpAddress.value = '${defaultMcpAddress}';
          }
          vscode.postMessage({ type: 'global-settings', mcpAddress: '${defaultMcpAddress}' });
          break;
      }
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'set-active-tab' && msg.tab) {
        applyActiveTab(msg.tab);
      }
    });

  <\/script>`;
}
