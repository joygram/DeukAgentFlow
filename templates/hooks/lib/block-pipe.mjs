import { parseShell, commandName, readPayload, extractCommand, deny, allow } from './shell-ast.mjs';

const INSTANT = new Set([
  'cat', 'echo', 'printf', 'ls', 'pwd', 'basename', 'dirname', 'realpath', 'readlink',
  'sed', 'jq', 'yq', 'env', 'date', 'whoami', 'hostname', 'uname', 'which', 'type',
  'git', 'rg', 'fd', 'stat', 'file', 'wc', 'true', 'false', 'test', 'expr', 'seq',
  'get-content', 'gc', 'get-childitem', 'gci', 'dir', 'get-item', 'gi', 'get-itemproperty',
  'write-output', 'write-host', 'get-location', 'get-date', 'get-command', 'get-process',
  'get-service', 'get-variable', 'get-alias', 'test-path', 'resolve-path', 'split-path',
  'join-path', 'convertfrom-json', 'convertto-json', 'import-csv',
]);

const MESSAGE = `파이프가 차단됐습니다 — 출력은 콘솔에만 노출합니다.

파이프는 실행 중 출력을 끊어 진행 여부를 판단할 근거를 없애고, 타임아웃 시 고아 프로세스를 남깁니다. tee·리다이렉트로 로그 파일을 만드는 것도 금지입니다.

대신 아래 중 하나를 쓰세요:
  그냥 실행 (콘솔에 그대로 노출)  cmd
  앞부분만 보기                 sed -n '1,40p' file
  특정 줄만 보기                rg PAT file
  파일 읽기·검색                Read / Grep / Glob 도구

콘솔에서 끝까지 확인 가능한 명령만 실행하세요.

즉시 끝나는 좌변(cat/rg/git/sed/Get-Content 등)에 거는 파이프만 예외입니다.`;

const payload = await readPayload();
const command = extractCommand(payload);
if (!command) allow();

const TEE = new Set(['tee', 'tee-object']);

const commands = parseShell(command);
for (let index = 0; index < commands.length; index += 1) {
  const current = commands[index];
  if (!current.pipedTo) continue;
  const next = commands[index + 1];
  if (!next) continue;
  const producer = commandName(current).toLowerCase();
  const consumer = commandName(next).toLowerCase();
  if (TEE.has(consumer)) deny(MESSAGE);
  if (INSTANT.has(producer)) continue;
  deny(MESSAGE);
}
allow();
