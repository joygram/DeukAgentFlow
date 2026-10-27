import { parseShell, commandName, commandArgs, readPayload, extractCommand, deny, allow } from './shell-ast.mjs';

const MESSAGE = `rg 의 -r 은 --replace 입니다 — 재귀 옵션이 아닙니다.

  rg -rn "typst" src/     ->  -r n 으로 파싱됩니다
                              매치가 전부 "n" 으로 치환되고 줄번호(-n)도 사라집니다.
                              에러가 나지 않습니다. 그럴듯한 출력이 나오고 결과만 틀립니다.

실측:
  rg -rn "typst" dss_typst.py   ->  """DSS를 n 서식으로 옮긴다..."""   (줄번호 없음)
  rg -n  "typst" dss_typst.py   ->  1:"""DSS를 typst 서식으로..."""    (정상)

고치는 법 — -r 을 빼세요. rg 는 재귀가 기본입니다:
  rg -rn PAT DIR   ->  rg -n PAT DIR
  rg -rl PAT DIR   ->  rg -l PAT DIR
  rg -ri PAT DIR   ->  rg -i PAT DIR

정말로 치환 출력을 원하면 --replace 를 풀어 쓰세요.`;

const payload = await readPayload();
const command = extractCommand(payload);
if (!command) allow();

for (const parsed of parseShell(command)) {
  if (commandName(parsed) !== 'rg') continue;
  for (const arg of commandArgs(parsed)) {
    if (arg === '--') break;
    if (!/^-[A-Za-z]{2,}$/.test(arg)) continue;
    if (arg.slice(1).includes('r')) deny(MESSAGE);
  }
}
allow();
