import { parseShell, commandName, commandArgs, readPayload, extractCommand, deny, allow } from './shell-ast.mjs';

const BLOCKED = new Set(['timeout', 'gtimeout']);

const MESSAGE = `셸 timeout 은 차단됩니다 — 제한 시간 내내 관측 없이 기다리다 죽고, 자식 프로세스를 고아로 남깁니다. Bash 도구의 timeout 파라미터(밀리초)를 쓰세요.`;

const payload = await readPayload();
const command = extractCommand(payload);
if (!command) allow();

for (const parsed of parseShell(command)) {
  let name = commandName(parsed);
  let args = commandArgs(parsed);
  if (name === 'sudo') {
    name = args[0] ?? '';
    args = args.slice(1);
  }
  if (BLOCKED.has(name)) deny(MESSAGE);
}
allow();
