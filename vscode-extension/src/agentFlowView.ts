import * as fs from 'fs';
import * as path from 'path';
import { spawn, execFileSync } from 'child_process';
import * as vscode from 'vscode';
import { AgentFlowModel, AgentFlowSnapshot, AgentTarget, DEFAULT_DEUK_AI_CONTEXT_MCP_ADDRESS, GlobalConfigSummary, TicketLifecycleAction, SkillSummary, TicketStatusFilter, TicketSummary, TicketTelemetryEntry, describeTarget, describeTicketProgress, ticketLifecycleActions } from './agentFlowModel';
import { clip, compactPathLabel, compactPhase, compactPriority, compactProgressLabel, delay, escapeHtml, formatCommandOutput, renderCommandOutputHtml, buildActiveFlowLineHtml, formatTicketDate, parseSkillDoc, renderGlobalConfigPanel, renderPreviewPanel, renderSkillPreview, renderTelemetryRows, renderTicket, renderTicketItem, shellArg, ticketFileName, ticketPreviewText } from './agentFlowViewUtils';
import { buildWebviewScript } from './agentFlowViewScript';
import { t, tf, detectUiLang } from './i18n';

const VIEW_TYPE = 'deukagentflow-command-center';
const PANEL_TYPE = 'deukagentflow-panel';

export class AgentFlowCommandCenter {
  private readonly views = new Map<vscode.Webview, 'sidebar' | 'panel'>();
  private panel: vscode.WebviewPanel | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly model: AgentFlowModel
  ) {}

  static readonly viewType = VIEW_TYPE;

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.views.set(webviewView.webview, 'sidebar');
    webviewView.onDidDispose(() => this.views.delete(webviewView.webview));
    this.configure(webviewView.webview);
    webviewView.webview.html = this.renderHtml(webviewView.webview, 'sidebar');
    void this.refreshWorkspace();
  }

  async openPanel(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      PANEL_TYPE,
      'AgentFlow Panel',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
      }
    );
    const panel = this.panel;
    panel.onDidDispose(() => {
      this.views.delete(panel.webview);
      if (this.panel === panel) {
        this.panel = null;
      }
    });
    this.views.set(panel.webview, 'panel');
    this.configure(panel.webview);
    panel.webview.html = this.renderHtml(panel.webview, 'panel');
    void this.refreshWorkspace();
  }

  async refresh(): Promise<void> {
    await this.refreshWorkspace();
    // 스킬은 이미 로드된 경우에만 강제 재조회. 첫 진입 전이면 lazy 로드에 맡겨 콜드스타트 비용을 피함.
    if (this.skillsLoaded) {
      void this.broadcastSkills(true);
    }
  }

  private async refreshWorkspace(): Promise<void> {
    this.workspaceLoading = true;
    this.broadcast();
    await this.model.refresh();
    this.workspaceLoading = false;
    this.broadcast();
  }

  async setActiveTicket(ticketId?: string): Promise<void> {
    if (!ticketId) {
      const updated = await this.model.chooseActiveTicket();
      if (!updated) {
        return;
      }
    } else {
      await this.model.setActiveTicket(ticketId);
    }
    this.broadcast();
  }

  async setPreviewTicket(ticketId: string): Promise<void> {
    await this.model.setPreviewTicket(ticketId);
    this.broadcast();
  }

  async openTicket(ticketId?: string): Promise<void> {
    const snapshot = this.model.getSnapshot();
    const ticket = ticketId ? this.model.findTicket(ticketId) : (snapshot.previewTicket ?? snapshot.activeTicket);
    if (!ticket) {
      void vscode.window.showInformationMessage(t('noActiveTicket'));
      return;
    }
    void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(ticket.filePath));
  }

  async switchTarget(target: AgentTarget): Promise<void> {
    await this.model.switchTarget(target);
    this.broadcast();
  }

  async switchWorkspace(workspacePath: string): Promise<void> {
    await this.model.setActiveWorkspace(workspacePath);
    // 스킬 설치/노출은 워크스페이스(cwd)별이므로 캐시를 무효화해 다음 진입 시 재로드.
    this.skillsLoaded = false;
    this.broadcast();
  }

  async setStatusFilter(statusFilter: TicketStatusFilter): Promise<void> {
    await this.model.setStatusFilter(statusFilter);
    this.broadcast();
  }

  async copyHandoff(): Promise<void> {
    const snapshot = this.model.getSnapshot();
    const selectedTickets = snapshot.selectedTicketIds
      .map((ticketId) => this.model.findTicket(ticketId))
      .filter((ticket): ticket is TicketSummary => Boolean(ticket));
    const ticket = snapshot.previewTicket ?? snapshot.activeTicket;
    if (selectedTickets.length === 0 && !ticket) {
      void vscode.window.showInformationMessage(t('noActiveTicket'));
      return;
    }
    const handoff = selectedTickets.length > 0
      ? selectedTickets.map((selectedTicket) => this.model.buildHandoff(selectedTicket, snapshot.target)).join('\n\n')
      : this.model.buildHandoff(ticket!, snapshot.target);
    await vscode.env.clipboard.writeText(handoff);
    void vscode.window.showInformationMessage(t('handoffCopied'));
  }

  async sendHandoffToTarget(): Promise<void> {
    await this.sendTextToTarget(this.model.getSnapshot().handoff, 'handoff');
  }

  async sendChatToTarget(text: string): Promise<void> {
    await this.sendTextToTarget(text, 'message');
  }

  // 빈 상태 CTA: 활성 티켓이 없을 때 타깃 에이전트(채팅창)로 "새 티켓 생성" 지시를 보내
  // 작업 시작 동선을 열어준다. handoff/chat-send 와 동일하게 deliverToTarget 을 재사용한다.
  async createTicketViaAgent(): Promise<void> {
    const snapshot = this.model.getSnapshot();
    const targetLabel = describeTarget(snapshot.target);
    const prompt = t('createTicketPrompt');
    const delivery = await this.deliverToTarget(snapshot.target, prompt);
    if (delivery === 'direct') {
      void vscode.window.showInformationMessage(t('createTicketSentDirect').replace('{target}', targetLabel));
      return;
    }
    if (delivery === 'attempted') {
      void vscode.window.showInformationMessage(t('createTicketSentAttempted').replace('{target}', targetLabel));
      return;
    }
    void vscode.window.showInformationMessage(t('createTicketSentClipboard').replace('{target}', targetLabel));
  }

  private async sendTextToTarget(text: string, source: 'handoff' | 'message'): Promise<void> {
    const snapshot = this.model.getSnapshot();
    if (!snapshot.activeTicket) {
      void vscode.window.showInformationMessage(t('noActiveTicket'));
      return;
    }
    const payload = text.trim();
    if (!payload) {
      void vscode.window.showInformationMessage(t('nothingToSend'));
      return;
    }

    const delivery = await this.deliverToTarget(snapshot.target, payload);
    const sourceLabel = source === 'handoff' ? '핸드오프' : '메시지';
    const targetLabel = describeTarget(snapshot.target);
    if (delivery === 'direct') {
      void vscode.window.showInformationMessage(`${sourceLabel}를 ${targetLabel}에 바로 전달했습니다.`);
      return;
    }
    if (delivery === 'attempted') {
      void vscode.window.showInformationMessage(`${sourceLabel} 전송을 시도했고 클립보드에도 준비했습니다. ${targetLabel} 입력창 반영은 직접 확인해 주세요.`);
      return;
    }
    void vscode.window.showInformationMessage(`${sourceLabel}를 클립보드에 준비했습니다. ${targetLabel}에서 붙여넣으면 됩니다.`);
  }

  async runCliCommand(kind: 'guard' | 'context'): Promise<void> {
    const snapshot = this.model.getSnapshot();
    if (!snapshot.activeTicket) {
      void vscode.window.showInformationMessage(t('noActiveTicket'));
      return;
    }
    if (snapshot.command.status === 'running') {
      void vscode.window.showInformationMessage(t('commandAlreadyRunning'));
      return;
    }

    const command = this.createCliCommand(kind, snapshot);
    const label = kind === 'guard' ? 'Run Guard' : 'Run Context';
    this.model.setCommand({
      label,
      command,
      status: 'running',
      output: '',
      exitCode: null,
    });
    this.broadcast();

    try {
      const result = await this.executeShellCommand(command, snapshot.workspacePath || undefined);
      await this.refreshWorkspace();
      this.model.setCommand({
        label,
        command,
        status: result.exitCode === 0 ? 'success' : 'error',
        output: result.output,
        exitCode: result.exitCode,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.refreshWorkspace();
      this.model.setCommand({
        label,
        command,
        status: 'error',
        output: message,
        exitCode: -1,
      });
    }

    this.broadcast();
  }

  async runTicketLifecycleAction(action: TicketLifecycleAction, ticketId?: string): Promise<void> {
    const snapshot = this.model.getSnapshot();
    const ticket = ticketId ? this.model.findTicket(ticketId) : (snapshot.previewTicket ?? snapshot.activeTicket);
    if (!ticket) {
      void vscode.window.showInformationMessage(t('noSelectedTicket'));
      return;
    }
    if (!ticketLifecycleActions(ticket).includes(action)) {
      void vscode.window.showInformationMessage(`현재 상태에서는 ${action}를 실행할 수 없습니다.`);
      return;
    }
    if (snapshot.command.status === 'running') {
      void vscode.window.showInformationMessage(t('commandAlreadyRunning'));
      return;
    }

    const confirmLabel = action === 'discard' ? 'Discard' : action === 'archive' ? 'Archive' : 'Close';
    const confirmed = await vscode.window.showWarningMessage(
      `${ticket.id} 티켓에 ${confirmLabel} 액션을 실행할까요?`,
      { modal: action !== 'close' },
      confirmLabel
    );
    if (confirmed !== confirmLabel) {
      return;
    }

    const command = this.createTicketLifecycleCommand(action, ticket.id);
    const label = `Ticket ${confirmLabel}`;
    this.model.setCommand({
      label,
      command,
      status: 'running',
      output: '',
      exitCode: null,
    });
    this.broadcast();

    try {
      const result = await this.executeShellCommand(command, snapshot.workspacePath || undefined);
      await this.refreshWorkspace();
      this.model.setCommand({
        label,
        command,
        status: result.exitCode === 0 ? 'success' : 'error',
        output: result.output,
        exitCode: result.exitCode,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.refreshWorkspace();
      this.model.setCommand({
        label,
        command,
        status: 'error',
        output: message,
        exitCode: -1,
      });
    }

    this.broadcast();
  }

  private async executeShellCommand(command: string, cwd?: string, trackOutput = true): Promise<{ output: string; exitCode: number }> {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, {
        cwd,
        env: process.env,
        shell: true,
      });

      let output = '';
      const append = (chunk: string) => {
        output = `${output}${chunk}`.slice(-12000);
        // 내부 조회(skill list/action 등)는 명령 출력 박스를 오염시키면 안 된다.
        // trackOutput=false 면 결과만 모으고 command.output·broadcast는 건드리지 않는다.
        if (!trackOutput) return;
        this.model.appendCommandOutput(chunk);
        this.broadcast();
      };

      child.stdout?.on('data', (data) => append(String(data)));
      child.stderr?.on('data', (data) => append(String(data)));
      child.on('error', (error) => reject(error));
      child.on('close', (code) => resolve({ output, exitCode: code ?? 0 }));
    });
  }

  private skillTemplatesDir: string | null | undefined = undefined;
  private skillsLoaded = false;
  private skillsLoading = false;
  private workspaceLoading = false;
  private activeTab: 'workspace' | 'skill' = 'workspace';

  /** deuk-agent-flow CLI 패키지의 templates/skills 디렉터리를 한 번만 해석해 캐시. */
  private resolveSkillTemplatesDir(): string | null {
    if (this.skillTemplatesDir !== undefined) {
      return this.skillTemplatesDir;
    }
    const candidates: string[] = [];
    // 1) PATH 상의 deuk-agent-flow 바이너리에서 패키지 루트 역산.
    try {
      const finder = process.platform === 'win32' ? 'where' : 'which';
      const located = execFileSync(finder, ['deuk-agent-flow'], { encoding: 'utf8' })
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)[0];
      if (located) {
        // npm 전역 bin 디렉터리 → node_modules/deuk-agent-flow/templates/skills
        const binDir = path.dirname(located);
        candidates.push(path.join(binDir, 'node_modules', 'deuk-agent-flow', 'templates', 'skills'));
        candidates.push(path.join(binDir, '..', 'lib', 'node_modules', 'deuk-agent-flow', 'templates', 'skills'));
      }
    } catch {
      // ignore — fall through to other candidates
    }
    // 2) 전역 node_modules (npm root -g 흔한 위치)
    if (process.platform === 'win32' && process.env.APPDATA) {
      candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'deuk-agent-flow', 'templates', 'skills'));
    }
    const resolved = candidates.find((dir) => {
      try {
        return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
      } catch {
        return false;
      }
    });
    this.skillTemplatesDir = resolved ?? null;
    return this.skillTemplatesDir;
  }

  /** 전역 사용자 스킬 디렉토리(~/.deuk/skills). */
  private userSkillsDir(): string {
    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    return path.join(homeDir, '.deuk', 'skills');
  }

  /** SKILL.md 를 읽어 summary/body 를 반환. 사용자본 우선, 못 찾으면 번들. */
  private readSkillDoc(skillId: string): { summary: string; body: string } {
    const candidates = [
      path.join(this.userSkillsDir(), skillId, 'SKILL.md'),
      this.resolveSkillTemplatesDir() ? path.join(this.resolveSkillTemplatesDir() as string, skillId, 'SKILL.md') : '',
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        const raw = fs.readFileSync(candidate, 'utf8');
        return parseSkillDoc(raw);
      } catch {
        // try next
      }
    }
    return { summary: '', body: '' };
  }

  /** 특정 스킬의 편집 대상 SKILL.md 절대경로(사용자본 우선, 없으면 번들). */
  private resolveSkillFilePath(skillId: string): string | null {
    const userPath = path.join(this.userSkillsDir(), skillId, 'SKILL.md');
    if (fs.existsSync(userPath)) return userPath;
    const dir = this.resolveSkillTemplatesDir();
    if (dir && fs.existsSync(path.join(dir, skillId, 'SKILL.md'))) return path.join(dir, skillId, 'SKILL.md');
    return null;
  }

  /** `skill list --json` 결과를 파싱해 webview로 보낼 스킬 목록을 반환. body 는 SKILL.md 에서 보강. */
  async loadSkills(): Promise<Array<{ id: string; installed: boolean; exposed: string[]; summary?: string; body?: string; category?: string; source?: 'user' | 'bundled' }>> {
    const snapshot = this.model.getSnapshot();
    const cwd = snapshot.workspacePath || undefined;
    const { output, exitCode } = await this.executeShellCommand('deuk-agent-flow skill list --json', cwd, false);
    if (exitCode !== 0) return [];
    try {
      const start = output.indexOf('[');
      const end = output.lastIndexOf(']');
      if (start < 0 || end < 0) return [];
      const skills = JSON.parse(output.slice(start, end + 1)) as Array<{ id: string; installed: boolean; exposed: string[]; summary?: string; category?: string; source?: 'user' | 'bundled' }>;
      return skills.map((skill) => {
        const doc = this.readSkillDoc(skill.id);
        return { ...skill, summary: skill.summary || doc.summary, body: doc.body };
      });
    } catch {
      return [];
    }
  }

  /** UI 토글에 대응하는 스킬 액션을 CLI로 실행한 뒤 목록을 새로고침. */
  async runSkillAction(action: 'add' | 'remove' | 'expose' | 'unexpose', skillId: string, platform?: string): Promise<void> {
    const snapshot = this.model.getSnapshot();
    const cwd = snapshot.workspacePath || undefined;
    const parts = ['deuk-agent-flow', 'skill', action, '--skill', shellArg(skillId)];
    if (platform) parts.push('--platform', shellArg(platform));
    parts.push('--non-interactive');
    await this.executeShellCommand(parts.join(' '), cwd, false);
    await this.broadcastSkills(true);
  }

  /**
   * expose 시 같은 category 의 다른 스킬이 이미 같은 플랫폼에 노출돼 있으면 경고 후 진행 확인.
   * 그 외 액션은 그대로 위임.
   */
  async runSkillActionGuarded(action: 'add' | 'remove' | 'expose' | 'unexpose', skillId: string, platform?: string): Promise<void> {
    if (action === 'expose' && platform) {
      const skills = this.model.getSnapshot().skills;
      const target = skills.find((skill) => skill.id === skillId);
      const category = target?.category?.trim();
      if (category) {
        const conflicts = skills.filter((skill) =>
          skill.id !== skillId &&
          skill.category?.trim() === category &&
          skill.exposed.includes(platform)
        );
        if (conflicts.length > 0) {
          const names = conflicts.map((skill) => skill.id).join(', ');
          const proceed = await vscode.window.showWarningMessage(
            `'${platform}'에 이미 같은 종류(${category}) 스킬이 노출돼 있어요: ${names}. ${skillId}도 함께 노출할까요?`,
            { modal: true },
            '노출'
          );
          if (proceed !== '노출') {
            return;
          }
        }
      }
    }
    await this.runSkillAction(action, skillId, platform);
  }

  /** 스킬 편집: 번들 원본이면 전역 사용자 디렉토리로 fork 후, 사용자본 SKILL.md 를 에디터로 연다. */
  async editSkill(skillId: string): Promise<void> {
    const snapshot = this.model.getSnapshot();
    const cwd = snapshot.workspacePath || undefined;
    const userPath = path.join(this.userSkillsDir(), skillId, 'SKILL.md');
    if (!fs.existsSync(userPath)) {
      // CLI fork 로 전역 사용자 디렉토리에 복사.
      const command = `deuk-agent-flow skill fork --skill ${shellArg(skillId)} --non-interactive`;
      const { exitCode, output } = await this.executeShellCommand(command, cwd, false);
      if (exitCode !== 0 || !fs.existsSync(userPath)) {
        const detail = output.trim() ? ` (${output.trim().slice(0, 200)})` : '';
        void vscode.window.showWarningMessage(`스킬 fork에 실패했습니다: ${skillId}${detail}`);
        return;
      }
      void vscode.window.showInformationMessage(`${skillId}를 내 스킬로 복사했어요. 저장하면 반영됩니다.`);
    }
    // 캐시 무효화: 편집/저장 후 내용·source 가 바뀌므로 다음 진입 시 재로드.
    this.skillsLoaded = false;
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(userPath));
    await this.broadcastSkills(true);
  }

  /** 선택한 스킬을 미리보기로 지정(같은 스킬 재클릭 시 해제). */
  setPreviewSkill(skillId: string): void {
    const current = this.model.getSnapshot().previewSkillId;
    this.model.setPreviewSkill(current === skillId ? null : skillId);
    this.broadcast();
  }

  /**
   * 스킬 목록을 모델에 반영하고 재렌더.
   * 티켓처럼 1회 로드 후 캐시 재사용 — 이미 로드됐고 force=false 면 CLI 재spawn 없이 broadcast만.
   */
  async broadcastSkills(force = false): Promise<void> {
    if (this.skillsLoaded && !force) {
      if (this.activeTab === 'skill') this.postActiveTab('skill');
      return;
    }
    this.skillsLoading = true;
    this.broadcast();
    const skills = await this.loadSkills();
    this.model.setSkills(skills);
    this.skillsLoaded = true;
    this.skillsLoading = false;
    this.broadcast();
    // 비동기 로딩 완료 시점에 탭이 바뀌었을 수 있으므로 activeTab 재확인
    if (this.activeTab === 'skill') this.postActiveTab('skill');
  }

  private createCliCommand(kind: 'guard' | 'context', snapshot: AgentFlowSnapshot): string {
    const base = 'deuk-agent-flow';
    const topic = snapshot.activeTicket?.id ?? '';
    switch (kind) {
      case 'guard':
        return `${base} ticket guard --topic ${topic} --ticket-started --ticket-reviewed --approval approved --non-interactive --compact`;
      case 'context':
        return `${base} ticket context --topic ${topic} --phase ${snapshot.activeTicket?.phase ?? '1'} --ticket-started --ticket-reviewed --approval approved --non-interactive --compact`;
    }
    return '';
  }

  private createTicketLifecycleCommand(action: TicketLifecycleAction, ticketId: string): string {
    return `deuk-agent-flow ticket ${action} --topic ${shellArg(ticketId)} --non-interactive --compact`;
  }

  async openGlobalConfig(): Promise<void> {
    const configPath = this.model.getSnapshot().globalConfig.path;
    if (!configPath) {
      void vscode.window.showInformationMessage('전역 설정 경로를 찾을 수 없습니다.');
      return;
    }
    void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(configPath));
  }

  async setGlobalSettings(settings: { scmIgnoreDeukAgent?: boolean; ticketLanguage?: 'en' | 'ko'; mcpEnabled?: boolean; mcpAddress?: string }): Promise<void> {
    const snapshot = this.model.getSnapshot();
    if (snapshot.command.status === 'running') {
      void vscode.window.showInformationMessage(t('commandAlreadyRunning'));
      return;
    }

    const commands: string[] = [];
    if (typeof settings.scmIgnoreDeukAgent === 'boolean') {
      commands.push(`deuk-agent-flow config set scmIgnoreDeukAgent ${settings.scmIgnoreDeukAgent ? 'true' : 'false'}`);
      commands.push(`deuk-agent-flow config set shareTickets ${settings.scmIgnoreDeukAgent ? 'false' : 'true'}`);
    }
    if (settings.ticketLanguage) {
      commands.push(`deuk-agent-flow config set docsLanguage ${shellArg(settings.ticketLanguage)}`);
    }
    if (typeof settings.mcpEnabled === 'boolean') {
      commands.push(`deuk-agent-flow config set mcpEnabled ${settings.mcpEnabled ? 'true' : 'false'}`);
    }
    if (typeof settings.mcpAddress === 'string') {
      const mcpAddress = settings.mcpAddress.trim() || DEFAULT_DEUK_AI_CONTEXT_MCP_ADDRESS;
      commands.push(`deuk-agent-flow config set mcpAddress ${shellArg(mcpAddress)}`);
    }
    if (commands.length === 0) {
      return;
    }

    const command = commands.join(' && ');
    const label = 'Global Settings';
    this.model.setCommand({
      label,
      command,
      status: 'running',
      output: '',
      exitCode: null,
    });
    this.broadcast();

    try {
      const result = await this.executeShellCommand(command, snapshot.workspacePath || undefined);
      await this.refreshWorkspace();
      this.model.setCommand({
        label,
        command,
        status: result.exitCode === 0 ? 'success' : 'error',
        output: result.output,
        exitCode: result.exitCode,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.refreshWorkspace();
      this.model.setCommand({
        label,
        command,
        status: 'error',
        output: message,
        exitCode: -1,
      });
    }

    this.broadcast();
  }

  private async deliverToTarget(target: AgentTarget, text: string): Promise<'direct' | 'attempted' | 'clipboard'> {
    await vscode.env.clipboard.writeText(text);

    switch (target) {
      case 'claude-code':
        if (await this.commandExists('claude-vscode.primaryEditor.open')) {
          await vscode.commands.executeCommand('claude-vscode.primaryEditor.open', undefined, text);
          return 'direct';
        }
        if (await this.focusAndPaste(['claude-vscode.editor.openLast', 'claude-vscode.focus'], text)) {
          return 'attempted';
        }
        return 'clipboard';
      case 'codex':
        if (await this.focusAndPaste(['chatgpt.openSidebar'], text)) {
          return 'attempted';
        }
        return 'clipboard';
      case 'copilot':
        if (await this.focusAndPaste(['workbench.action.chat.open', 'workbench.action.chat.newChat'], text)) {
          return 'attempted';
        }
        return 'clipboard';
      default:
        return 'clipboard';
    }
  }

  private async focusAndPaste(commands: string[], text: string): Promise<boolean> {
    let usedCommand = false;
    for (const command of commands) {
      if (!(await this.commandExists(command))) {
        continue;
      }
      usedCommand = true;
      await vscode.commands.executeCommand(command);
      await delay(120);
    }

    if (!usedCommand) {
      return false;
    }

    try {
      await vscode.commands.executeCommand('type', { text });
      return true;
    } catch {
      try {
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        return true;
      } catch {
        return false;
      }
    }
  }

  private async commandExists(command: string): Promise<boolean> {
    const commands = await vscode.commands.getCommands(true);
    return commands.includes(command);
  }

  handleMessage(message: unknown): void {
    const data = message as { type?: string; ticketId?: string; ticketIds?: string[]; target?: AgentTarget; text?: string; filter?: TicketStatusFilter; action?: TicketLifecycleAction; scmIgnoreDeukAgent?: boolean; ticketLanguage?: 'en' | 'ko'; mcpEnabled?: boolean; mcpAddress?: string; skillAction?: 'add' | 'remove' | 'expose' | 'unexpose'; skillId?: string; platform?: string };
    switch (data.type) {
      case 'refresh':
        void this.refresh();
        break;
      case 'skills-refresh':
        // 수동 ↻: 항상 CLI 재조회.
        void this.broadcastSkills(true);
        break;
      case 'skill-tab-enter':
        this.activeTab = 'skill';
        void this.broadcastSkills(false);
        break;
      case 'workspace-tab-enter':
        this.activeTab = 'workspace';
        this.postActiveTab('workspace');
        break;
      case 'skill-action':
        if (data.skillAction && data.skillId) {
          void this.runSkillActionGuarded(data.skillAction, data.skillId, data.platform);
        }
        break;
      case 'skill-edit':
        if (data.skillId) {
          void this.editSkill(data.skillId);
        }
        break;
      case 'preview-skill':
        if (data.skillId) {
          this.setPreviewSkill(data.skillId);
        }
        break;
      case 'choose-ticket':
        void this.setActiveTicket(data.ticketId);
        break;
      case 'open-ticket':
        void this.openTicket(data.ticketId);
        break;
      case 'create-ticket':
        void this.createTicketViaAgent();
        break;
      case 'open-file':
        // #647: CLI 출력의 리뷰 파일 링크 클릭 → 해당 .md를 에디터에서 연다.
        if (data.text) {
          void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(data.text));
        }
        break;
      case 'preview-ticket':
        if (data.ticketId) {
          void this.setPreviewTicket(data.ticketId);
        }
        break;
      case 'toggle-selected-ticket':
        if (data.ticketId) {
          void this.model.toggleSelectedTicket(data.ticketId).then(() => this.broadcast());
        }
        break;
      case 'set-selected-tickets':
        if (data.ticketId && Array.isArray(data.ticketIds)) {
          void this.model.setSelectedTickets(data.ticketIds, data.ticketId).then(() => this.broadcast());
        }
        break;
      case 'bind-preview':
        if (this.model.getSnapshot().previewTicket) {
          void this.setActiveTicket(this.model.getSnapshot().previewTicket?.id);
        }
        break;
      case 'switch-target':
        if (data.target) {
          void this.switchTarget(data.target);
        }
        break;
      case 'set-status-filter':
        if (data.filter) {
          void this.setStatusFilter(data.filter);
        }
        break;
      case 'set-ticket-query':
        void this.model.setTicketQuery(data.text ?? '');
        this.broadcast();
        break;
      case 'switch-workspace':
        if (data.text) {
          void this.switchWorkspace(data.text);
        }
        break;
      case 'copy-handoff':
        void this.copyHandoff();
        break;
      case 'run-guard':
        void this.runCliCommand('guard');
        break;
      case 'run-context':
        void this.runCliCommand('context');
        break;
      case 'ticket-lifecycle-action':
        if (data.action) {
          void this.runTicketLifecycleAction(data.action, data.ticketId);
        }
        break;
      case 'open-readme':
        void vscode.env.openExternal(vscode.Uri.parse('https://github.com/joygram/DeukAgentFlow#readme'));
        break;
      case 'global-settings':
        void this.setGlobalSettings({
          scmIgnoreDeukAgent: data.scmIgnoreDeukAgent,
          ticketLanguage: data.ticketLanguage,
          mcpEnabled: data.mcpEnabled,
          mcpAddress: data.mcpAddress,
        });
        break;
      case 'send-handoff':
        void this.sendHandoffToTarget();
        break;
      case 'chat-send':
        void this.sendChatToTarget(data.text ?? '');
        break;
    }
  }

  broadcast(): void {
    for (const [webview, mode] of this.views) {
      webview.html = this.renderHtml(webview, mode);
    }
  }

  private postActiveTab(tab: 'workspace' | 'skill'): void {
    for (const [webview] of this.views) {
      void webview.postMessage({ type: 'set-active-tab', tab });
    }
  }

  private buildState(): AgentFlowSnapshot & {
    workspaceBadge: string;
    targetLabel: string;
    isMultiSelected: boolean;
    previewTicketActions: TicketLifecycleAction[];
    previewTicketProgress: string;
    globalConfig: GlobalConfigSummary;
    skillsLoading: boolean;
    workspaceLoading: boolean;
    activeTab: 'workspace' | 'skill';
  } {
    const snapshot = this.model.getSnapshot();
    const promptTicket = snapshot.previewTicket ?? snapshot.activeTicket;
    const selectedTickets = snapshot.selectedTicketIds
      .map((ticketId) => snapshot.allTickets.find((ticket) => ticket.id === ticketId))
      .filter((ticket): ticket is TicketSummary => Boolean(ticket));
    return {
      ...snapshot,
      workspaceBadge: snapshot.workspaceName ? `${snapshot.workspaceName} · ${tf('ticketsCountBadge', snapshot.tickets.length, snapshot.totalTicketCount)}` : t('noWorkspace'),
      targetLabel: describeTarget(snapshot.target),
      isMultiSelected: selectedTickets.length > 1,
      previewTicketActions: promptTicket ? ticketLifecycleActions(promptTicket) : [],
      previewTicketProgress: promptTicket ? describeTicketProgress(promptTicket) : 'no ticket',
      globalConfig: snapshot.globalConfig,
      skillsLoading: this.skillsLoading,
      workspaceLoading: this.workspaceLoading,
      activeTab: this.activeTab,
    };
  }

  private configure(webview: vscode.Webview): void {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))],
    };
    webview.onDidReceiveMessage((message) => this.handleMessage(message));
  }

  private renderHtml(webview: vscode.Webview, mode: 'sidebar' | 'panel'): string {
    const nonce = String(Date.now());
    const svgUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'agentflow.svg')));
    const cssUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'agentflow.css')));
    const version = String(this.context.extension.packageJSON?.version ?? 'unknown');
    const state = this.buildState();
    const clientState = {
      activeTicket: state.activeTicket ? { id: state.activeTicket.id } : null,
      previewTicket: state.previewTicket ? { id: state.previewTicket.id } : null,
      selectedTicketIds: state.selectedTicketIds,
      tickets: state.tickets.map((ticket) => ({ id: ticket.id })),
      ticketQuery: state.ticketQuery,
    };
    const encodedState = encodeURIComponent(JSON.stringify(clientState));
    const uiLang = detectUiLang();
    return `<!DOCTYPE html>
<html lang="${uiLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';" />
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body data-tab="${state.activeTab}">
  <div class="shell">
    <section class="grid">
      <article class="card ticket">
        <div class="row">
          <div class="brand">
            <img src="${svgUri}" alt="AgentFlow" />
            <div>
              <div class="eyebrow">📦♒ Deuk Agent Flow</div>
              <h1>AgentFlow Panel</h1>
              <div class="version-line">VSIX <strong>${escapeHtml(version)}</strong></div>
            </div>
          </div>
          <div class="button-row">
            <button class="secondary settings-button" data-action="toggle-settings" title="${escapeHtml(t('settings'))}">⚙</button>
            <button class="secondary" data-action="open-readme" title="${escapeHtml(t('help'))}">?</button>
          </div>
        </div>
        <div class="tab-bar">
          <button class="tab-button" data-tab-button="workspace">${escapeHtml(t('tabWorkspace'))}</button>
          <button class="tab-button" data-tab-button="skill">${escapeHtml(t('tabSkill'))}</button>
        </div>
        <div class="tab-panel" data-tab="workspace">
        ${state.workspaceLoading ? `
        <div class="workspace-loading-bar">${escapeHtml(t('loading'))}</div>
        <div class="ticket-list"><div class="tickets-empty">${escapeHtml(t('ticketListLoading'))}</div></div>
        ` : `
        <div class="workspace-row">
          <div class="workspace-toolbar">
            <select id="workspaceSelect" ${state.command.status === 'running' ? 'disabled' : ''}>
              ${state.workspaces
                .map(
                  (workspace) => `
                <option value="${escapeHtml(workspace.path)}" ${workspace.path === state.workspacePath ? 'selected' : ''}>
                  ${escapeHtml(`${workspace.label} · ${workspace.activeTicketCount}/${workspace.ticketCount} tickets`)}
                </option>`
                )
                .join('')}
            </select>
          </div>
          <button class="secondary fixed-refresh" data-action="refresh">${escapeHtml(t('refresh'))}</button>
        </div>
        ${(() => {
          const hasOutput = state.command.output && state.command.output.trim().length > 0;
          const flowLine = buildActiveFlowLineHtml(state.workspaceName, state.activeTicket);
          // #650: 활성 티켓이 있거나 명령 출력이 있으면 카드를 항상 보여준다.
          // flowLine(📦 워크스페이스 · 단계 · #티켓)을 상단에 두어 터미널·채팅과 표현을 통일.
          if (!flowLine && !hasOutput) return '';
          return `
        <article class="card session">
          ${flowLine}
          <div class="meta" style="margin-top: 6px;">
            <span class="pill ${state.command.status === 'running' ? 'warn' : state.command.status === 'error' ? 'bad' : state.command.status === 'success' ? 'ok' : ''}">${escapeHtml(state.command.status.toUpperCase())}</span>
            <span class="pill">${escapeHtml(state.command.label || state.lastAction)}</span>
          </div>
          ${hasOutput ? `
          <div class="summary" style="margin-top: 8px;">
            <pre class="cmd-output" style="white-space: pre-wrap; margin: 0; font: inherit;">${renderCommandOutputHtml(state.command.output)}</pre>
          </div>` : ''}
        </article>`;
        })()}
        <div class="ticket-toolbar">
          <span class="filter-control">
            <span class="filter-icon" aria-hidden="true">⛃</span>
            <select id="statusFilter" class="${state.statusFilter !== 'all' ? 'lit-control' : ''}" title="${escapeHtml(t('filter'))}">
            <option value="open" ${state.statusFilter === 'open' ? 'selected' : ''}>${escapeHtml(t('filterOpen'))}</option>
            <option value="closed" ${state.statusFilter === 'closed' ? 'selected' : ''}>${escapeHtml(t('filterClosed'))}</option>
            <option value="all" ${state.statusFilter === 'all' ? 'selected' : ''}>${escapeHtml(t('filterAll'))}</option>
            </select>
          </span>
          <button class="secondary ${state.selectedTicketIds.length > 0 ? 'lit-control' : ''}" data-action="copy-handoff" title="${escapeHtml(t('handoffTitle'))}">${escapeHtml(t('handoff'))}</button>
          <select id="ticketLifecycleAction" class="${state.selectedTicketIds.length > 0 || state.previewTicket ? 'lit-control' : ''}" title="${escapeHtml(t('lifecycleTitle'))}">
            <option value="">${escapeHtml(t('lifecyclePlaceholder'))}</option>
            ${state.previewTicketActions.map((action) => `<option value="${escapeHtml(action)}">${escapeHtml(action)}</option>`).join('')}
          </select>
          <span class="chip active-chip">${escapeHtml(state.activeTicket?.id ?? 'none')}</span>
          <span class="selection-summary">
            <span class="chip selection-chip ${state.selectedTicketIds.length > 0 ? 'active' : ''}">${escapeHtml(tf('selectionSelected', state.selectedTicketIds.length))}</span>
            <span class="chip selection-chip">${escapeHtml(tf('selectionTickets', state.tickets.length, state.totalTicketCount))}</span>
          </span>
        </div>
        <div class="ticket-list">
          ${state.tickets.length === 0 ? `<div class="tickets-empty tickets-empty-cta">
            <div class="tickets-empty-title">${escapeHtml(t('ticketsEmptyTitle'))}</div>
            <div class="tickets-empty-hint">${escapeHtml(t('ticketsEmptyHint'))}</div>
            <button class="primary create-ticket-cta" data-action="create-ticket" title="${escapeHtml(t('createTicketTitle'))}">${escapeHtml(t('createTicketCta'))}</button>
          </div>` : state.tickets.map((ticket) => renderTicketItem(ticket, state.activeTicket?.id, state.previewTicket?.id, state.selectedTicketIds)).join('')}
        </div>
        ${state.previewTicket ? renderPreviewPanel(state.previewTicket, state.activeTicket?.id) : ''}
        `}
        </div>
        <div class="tab-panel" data-tab="skill">
      ${state.skillsLoading ? `<div class="skills-loading-bar">${escapeHtml(t('loading'))}</div>` : ''}
      <article class="card skills">
        <div class="row">
          <div>
            <div class="eyebrow">📦♒ Skills</div>
            <h1 style="font-size:13px;margin:2px 0 0;">스킬 관리</h1>
          </div>
          <button class="secondary" data-action="skills-refresh" title="${escapeHtml(t('skillsRefresh'))}">↻</button>
        </div>
        <div class="skills-hint">설치(+) 후 각 에이전트에 노출(ON/OFF). 스킬명 클릭=미리보기, edit=내 스킬로 편집.</div>
        <div class="skills-scroll">
          ${(() => {
            if (state.skillsLoading) return `<div class="skills-empty">${escapeHtml(t('skillsLoading'))}</div>`;
            if (state.skills.length === 0) return `<div class="skills-empty">${escapeHtml(t('skillsEmpty'))}</div>`;
            
            const CATEGORY_LIMITS: Record<string, number> = { persona: 1, coding: 3, data: 2 };
            const TOTAL_MAX_SKILLS = 5;

            const groups: Record<string, typeof state.skills> = {};
            for (const skill of state.skills) {
              const cat = skill.category || 'uncategorized';
              if (!groups[cat]) groups[cat] = [];
              groups[cat].push(skill);
            }

            return Object.entries(groups).map(([cat, skills]) => {
              const limit = CATEGORY_LIMITS[cat];
              const limitText = limit ? ` (최대 ${limit}개)` : '';
              return `
              <details class="skill-category-node" open>
                <summary class="skill-category-summary">
                  📁 ${escapeHtml(cat)}${limitText}
                </summary>
                <table class="skills-table">
                  <thead>
                    <tr><th>스킬</th><th>설치</th><th>claude</th><th>codex</th><th>copilot</th><th>antigravity</th></tr>
                  </thead>
                  <tbody>
                    ${skills.map((skill) => {
                      const cell = (platform: string): string => {
                        const on = skill.exposed.includes(platform);
                        const disabled = skill.installed ? '' : 'disabled';
                        return `<td><button class="skill-toggle ${on ? 'on' : ''}" ${disabled} data-skill="${escapeHtml(skill.id)}" data-platform="${platform}" data-on="${on ? '1' : '0'}" title="${on ? '노출 해제' : '노출'}">${on ? 'ON' : 'OFF'}</button></td>`;
                      };
                      const isPreview = skill.id === state.previewSkillId;
                      return `<tr class="${isPreview ? 'skill-row-active' : ''}">
                        <td class="skill-name skill-preview-trigger" data-skill="${escapeHtml(skill.id)}" title="스킬 내용 미리보기">${escapeHtml(skill.id)}</td>
                        <td><button class="skill-install ${skill.installed ? 'on' : ''}" data-skill="${escapeHtml(skill.id)}" data-installed="${skill.installed ? '1' : '0'}" title="${skill.installed ? '설치 제거' : '설치'}">${skill.installed ? '✓' : '+'}</button></td>
                        ${cell('claude')}${cell('codex')}${cell('copilot')}${cell('antigravity')}
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </details>`;
            }).join('');
          })()}
        </div>
        ${renderSkillPreview(state.skills.find((skill) => skill.id === state.previewSkillId) ?? null)}
      </article>
        </div>
    </section>
    ${renderGlobalConfigPanel(state.globalConfig)}
  </div>

  ${buildWebviewScript(nonce, encodedState, DEFAULT_DEUK_AI_CONTEXT_MCP_ADDRESS)}
</body>
</html>`;
  }
}
