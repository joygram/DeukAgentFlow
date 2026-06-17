// 티켓 데이터 획득 — CLI(deuk-agent-flow)에 전적으로 위임한다.
//
// 과거 이 모듈(과 agentFlowModel)은 os.homedir() + '.deuk'/tickets 를 직접 조립해
// ticket-home 을 추측하고 그 폴더를 fs 로 직접 readdir/readFile 했다. 그 방식은
// 확장이 도는 런타임($HOME)에 묶여 있어, CLI 가 Windows(C:\Users\joy\.deuk)에
// 쓰는데 확장이 WSL($HOME=/home/joy)로 돌면 빈 폴더를 보고 모든 워크스페이스가
// 0 tickets 로 표시되는 버그를 낳았다.
//
// 핵심 통찰: `deuk-agent-flow` CLI 는 호출되는 그 시점에 이미 자기 환경(Windows
// 든 Linux 든)에서 실행되므로, 자기 환경 기준의 올바른 홈에서 티켓을 읽는다.
// 따라서 확장은 홈/경로/파일을 스스로 만질 필요가 전혀 없다 — CLI 에 목록과
// 본문(content)을 요청해 그대로 받아쓰면 된다.

import { execFile } from 'child_process';

// CLI `ticket list --json [--print-content]` 의 한 항목.
export interface CliTicketEntry {
  id: string;
  path: string;       // index-relative (main/x.md) — 표시용, 파일 접근에는 쓰지 않음
  group?: string;
  status?: string;
  phase?: number;
  title?: string;
  fileName?: string;
  summary?: string;
  createdAt?: string;
  updatedAt?: string;
  content?: string;   // --print-content 시 CLI 가 읽어 실어준 본문
}

function runCli(args: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    execFile('deuk-agent-flow', args, { encoding: 'utf8', shell: true }, (err, stdout) => {
      resolve({ stdout: stdout || '', code: err ? (err as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0 });
    });
  });
}

/**
 * 워크스페이스의 티켓을 CLI 에서 그대로 받아온다(SSOT). 카운트는 배열 길이.
 * withContent=true 면 각 항목에 본문(content)이 실린다. all=true 면 archive 포함.
 * 확장은 이 결과만 쓰고 홈/경로/파일시스템을 직접 만지지 않는다.
 */
export async function listWorkspaceTickets(
  workspaceName: string,
  opts: { all?: boolean; withContent?: boolean } = {}
): Promise<CliTicketEntry[]> {
  const { tickets } = await listWorkspaceTicketsWithTotal(workspaceName, opts);
  return tickets;
}

/**
 * Like {@link listWorkspaceTickets} but also returns the workspace-wide total
 * ticket count (all statuses incl. archived) via `--with-total`. Lets the panel
 * show "open / total" without a second archive-loading call. #756.
 */
export async function listWorkspaceTicketsWithTotal(
  workspaceName: string,
  opts: { all?: boolean; withContent?: boolean } = {}
): Promise<{ tickets: CliTicketEntry[]; total: number }> {
  const args = ['ticket', 'list', '--workspace', workspaceName, '--json', '--with-total'];
  if (opts.all) args.push('--all');
  if (opts.withContent) args.push('--print-content');
  const { stdout, code } = await runCli(args);
  if (code !== 0) return { tickets: [], total: 0 };
  try {
    const parsed = JSON.parse(stdout);
    // --with-total wraps as { tickets, total }; tolerate a bare array too.
    if (Array.isArray(parsed)) return { tickets: parsed as CliTicketEntry[], total: parsed.length };
    const tickets = Array.isArray(parsed?.tickets) ? (parsed.tickets as CliTicketEntry[]) : [];
    const total = typeof parsed?.total === 'number' ? parsed.total : tickets.length;
    return { tickets, total };
  } catch {
    return { tickets: [], total: 0 };
  }
}

/** 워크스페이스의 활성(claim) 티켓 id 를 CLI status 에서 받는다. 없으면 null. */
export async function activeTicketId(workspaceName: string): Promise<string | null> {
  const { stdout, code } = await runCli(['ticket', 'status', '--workspace', workspaceName, '--json']);
  if (code !== 0) return null;
  try {
    const o = JSON.parse(stdout) as { id?: string };
    return o && typeof o.id === 'string' ? o.id : null;
  } catch {
    return null;
  }
}
