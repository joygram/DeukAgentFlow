import { parseShell, commandName, commandArgs } from './shell-ast.mjs';

const cases = [
  { cmd: String.raw`rg -n "\"(start|launch|dev|up|serve)" package.json`, pipe: false },
  { cmd: String.raw`rg -n "error\|warn" src`, pipe: false },
  { cmd: String.raw`rg 'a|b|c' src`, pipe: false },
  { cmd: `cat foo.log | rg PAT`, pipe: true },
  { cmd: `cargo build --release 2>&1 | rg "^error"`, pipe: true },
  { cmd: `npm run build 2>&1 | tee logs/build.log`, pipe: true },
  { cmd: `ls`, pipe: false },
  { cmd: `a && b || c`, pipe: false },
  { cmd: `echo $(ls | rg x)`, pipe: true },
  { cmd: `awk 'BEGIN{print "a|b"}'`, pipe: false },
  { cmd: `git commit -m "fix: a|b"`, pipe: false },
  { cmd: `node -e "console.log(1)" | head`, pipe: true },
  { cmd: "cat <<'EOF'\na | b\nEOF", pipe: false },
  { cmd: `[[ $x == a|b ]]`, pipe: false },
];

let failures = 0;
for (const testCase of cases) {
  const commands = parseShell(testCase.cmd);
  const piped = commands.some((command) => command.pipedTo);
  const ok = piped === testCase.pipe;
  if (!ok) failures += 1;
  const names = commands.map(commandName).filter(Boolean).join(' , ');
  console.log(`${ok ? 'ok  ' : 'FAIL'} pipe=${piped} [${names}]  ${testCase.cmd.replace(/\n/g, '\\n')}`);
}

const redirect = parseShell(`(time npm run build) > logs/build.log 2>&1`);
console.log('redirect targets:', JSON.stringify(redirect.flatMap((c) => c.redirections.map((r) => [r.operator, r.target?.value ?? null]))));

const grepish = parseShell(String.raw`rg -n "grep -r foo" src`);
console.log('names in rg-quoting-grep:', JSON.stringify(grepish.map(commandName)));
console.log('args:', JSON.stringify(grepish.map(commandArgs)));

process.exit(failures === 0 ? 0 : 1);
