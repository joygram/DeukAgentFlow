import { parseShell, readPayload, extractCommand, deny, allow } from './shell-ast.mjs';

const DEVNULL = new Set(['/dev/null', 'NUL', 'nul']);
const WRITING = new Set(['>', '>>', '>|', '&>', '&>>', '>>&']);

const MESSAGE = `출력을 파일로 리다이렉트하는 것은 차단됩니다 — 실행 내내 화면이 백지가 되고 파일만 쌓입니다.

출력은 콘솔에만 노출합니다. 로그 파일 생성은 금지이며 tee 도 대안이 아닙니다.

대신 아래를 쓰세요:
  그냥 실행                     cmd

콘솔에서 끝까지 확인 가능한 명령만 실행하세요.`;

const payload = await readPayload();
const command = extractCommand(payload);
if (!command) allow();

for (const parsed of parseShell(command)) {
  for (const redirection of parsed.redirections) {
    if (!WRITING.has(redirection.operator)) continue;
    const target = redirection.target;
    if (!target) continue;
    if (DEVNULL.has(target.value)) continue;
    if (/^&?[0-9-]+$/.test(target.value)) continue;
    deny(MESSAGE);
  }
}
allow();
