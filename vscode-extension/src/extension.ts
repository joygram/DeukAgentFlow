import * as vscode from 'vscode';
import { AgentFlowModel, AgentTarget } from './agentFlowModel';
import { AgentFlowCommandCenter } from './agentFlowView';

export function activate(context: vscode.ExtensionContext): void {
  const currentVersion: string = context.extension.packageJSON?.version ?? '';
  const lastVersion = context.globalState.get<string>('lastVersion', '');
  if (currentVersion && lastVersion && currentVersion !== lastVersion) {
    void vscode.window.showInformationMessage(
      `Deuk Agent Flow updated to v${currentVersion}`,
      'What\'s New'
    ).then((selection) => {
      if (selection === 'What\'s New') {
        void vscode.env.openExternal(vscode.Uri.parse('https://github.com/joygram/DeukAgentFlow/blob/master/CHANGELOG.md'));
      }
    });
  }
  void context.globalState.update('lastVersion', currentVersion);

  const agentFlowModel = new AgentFlowModel(context);
  const agentFlowView = new AgentFlowCommandCenter(context, agentFlowModel);
  void agentFlowModel.refresh().then(() => agentFlowView.broadcast());
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void agentFlowView.refresh();
    })
  );
  const revealAgentFlowPanel = async (): Promise<void> => {
    const availableCommands = new Set(await vscode.commands.getCommands(true));
    if (availableCommands.has('workbench.action.toggleSecondarySideBarVisibility')) {
      await vscode.commands.executeCommand('workbench.action.toggleSecondarySideBarVisibility');
    }
    if (availableCommands.has('workbench.view.extension.deukagentflow-secondary')) {
      await vscode.commands.executeCommand('workbench.view.extension.deukagentflow-secondary');
      return;
    }
    await agentFlowView.openPanel();
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AgentFlowCommandCenter.viewType, agentFlowView, {
      webviewOptions: { retainContextWhenHidden: false },
    }),
    vscode.commands.registerCommand('deukagentflow.agentflow.openCommandCenter', () => agentFlowView.openPanel()),
    vscode.commands.registerCommand('deukagentflow.agentflow.openSidebar', () => vscode.commands.executeCommand('deukagentflow.agentflow.revealPanel')),
    vscode.commands.registerCommand('deukagentflow.agentflow.openEditor', () => agentFlowView.openPanel()),
    vscode.commands.registerCommand('deukagentflow.agentflow.revealPanel', revealAgentFlowPanel),
    vscode.commands.registerCommand('deukagentflow.agentflow.refresh', () => agentFlowView.refresh()),
    vscode.commands.registerCommand('deukagentflow.agentflow.setActiveTicket', () => agentFlowView.setActiveTicket()),
    vscode.commands.registerCommand('deukagentflow.agentflow.openTicket', (ticketId?: string) => agentFlowView.openTicket(ticketId)),
    vscode.commands.registerCommand('deukagentflow.agentflow.copyHandoff', () => agentFlowView.copyHandoff()),
    vscode.commands.registerCommand('deukagentflow.agentflow.runGuard', () => agentFlowView.runCliCommand('guard')),
    vscode.commands.registerCommand('deukagentflow.agentflow.switchTarget', (target: AgentTarget) => agentFlowView.switchTarget(target))
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'deukagentflow.agentflow.revealPanel';
  status.tooltip = 'Open the AgentFlow Panel in the Secondary Side Bar';
  context.subscriptions.push(status);

  const updateStatus = (): void => {
    // #737: 세션 쿠키 기준 — 현재 세션이 claim한 워크스페이스+티켓 표시
    const { workspaceName, ticketNum, phase } = agentFlowModel.getStatusBarSummary();
    if (ticketNum) {
      status.text = `$(hubot) ${workspaceName} #${ticketNum}${phase ? ` ${phase}` : ''}`;
      status.tooltip = `Active ticket #${ticketNum} in ${workspaceName} — Click to open AgentFlow panel`;
    } else if (workspaceName && workspaceName !== 'No Workspace') {
      status.text = `$(hubot) ${workspaceName}`;
      status.tooltip = `${workspaceName} — Click to open AgentFlow panel`;
    } else {
      status.text = '$(hubot) AgentFlow';
      status.tooltip = 'Open the AgentFlow Panel in the Secondary Side Bar';
    }
  };

  const originalBroadcast = agentFlowView.broadcast.bind(agentFlowView);
  agentFlowView.broadcast = (): void => {
    originalBroadcast();
    updateStatus();
  };

  updateStatus();
  status.show();
}

export function deactivate(): void {}
