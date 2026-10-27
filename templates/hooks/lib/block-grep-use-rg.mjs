import { parseShell, commandName, commandArgs, readPayload, extractCommand, deny, allow } from './shell-ast.mjs';

const BLOCKED = new Set(['grep', 'egrep', 'fgrep', 'zgrep', 'zegrep', 'zfgrep']);

const MESSAGE = `grep 은 차단됩니다 — rg(ripgrep) 를 쓰세요. 같은 트리에서 약 24배 빠릅니다(7.98s -> 0.33s).

플래그가 다릅니다. 그대로 옮기면 조용히 틀린 결과가 나옵니다:
  grep -r PAT DIR        ->  rg PAT DIR          (재귀가 기본, rg 의 -r 은 --replace 라 뜻이 다릅니다)
  grep -R PAT DIR        ->  rg PAT DIR
  grep --include='*.rs'  ->  rg -g '*.rs'
  grep -E PAT            ->  rg PAT              (확장 정규식이 기본)
  grep -F PAT            ->  rg -F PAT
  grep -P PAT            ->  rg -P PAT           (PCRE2)
  grep -A/-B/-C -v -n -l -i -w -o -c -q -e       ->  동일

기본 동작 차이: rg 는 .gitignore 를 존중하고 숨김/바이너리를 건너뜁니다.
무시된 파일까지 보려면 -uu, 숨김은 --hidden, 바이너리는 --binary, NUL 데이터는 -a 를 쓰세요.

여러 패턴을 루프로 N 번 호출하지 말고 rg 'a|b|c' 로 한 번에 훑으세요.`;

const payload = await readPayload();
const command = extractCommand(payload);
if (!command) allow();

for (const parsed of parseShell(command)) {
  let name = commandName(parsed);
  if (name === 'sudo') name = commandArgs(parsed)[0] ?? '';
  if (BLOCKED.has(name)) deny(MESSAGE);
}
allow();
