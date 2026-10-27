import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const hooks = dirname(here);

const cases = [
  { hook: 'block-pipe.sh', cmd: String.raw`rg -n "\"(start|launch|dev|up|serve)" package.json`, expect: 'allow' },
  { hook: 'block-pipe.sh', cmd: String.raw`rg -n "error\|warn" src`, expect: 'allow' },
  { hook: 'block-pipe.sh', cmd: `cat foo.log | rg PAT`, expect: 'allow' },
  { hook: 'block-pipe.sh', cmd: `git log --oneline | rg fix`, expect: 'allow' },
  { hook: 'block-pipe.sh', cmd: `npm run build 2>&1 | tee logs/build.log`, expect: 'deny' },
  { hook: 'block-pipe.sh', cmd: `cargo build --release 2>&1 | rg "^error"`, expect: 'deny' },
  { hook: 'block-pipe.sh', cmd: `cargo test 2>&1 | tail -20`, expect: 'deny' },
  { hook: 'block-pipe.sh', cmd: `awk 'BEGIN{print "a|b"}'`, expect: 'allow' },
  { hook: 'block-pipe.sh', cmd: `git commit -m "fix: a|b"`, expect: 'allow' },
  { hook: 'block-pipe.sh', cmd: `ls`, expect: 'allow' },
  { hook: 'block-pipe.sh', cmd: `npm run build 2>&1 | Select-Object -Last 30`, expect: 'deny' },
  { hook: 'block-pipe.sh', cmd: `cargo test | select -First 20`, expect: 'deny' },
  { hook: 'block-pipe.sh', cmd: `npm test | Select-String FAIL`, expect: 'deny' },
  { hook: 'block-pipe.sh', cmd: `dotnet build | Measure-Object -Line`, expect: 'deny' },
  { hook: 'block-pipe.sh', cmd: `npm run build 2>&1 | Tee-Object logs/build.log`, expect: 'deny' },
  { hook: 'block-pipe.sh', cmd: `Get-Content foo.log | Select-Object -Last 30`, expect: 'allow' },
  { hook: 'block-pipe.sh', cmd: `Get-ChildItem src | Where-Object Length -gt 0`, expect: 'allow' },

  { hook: 'block-log-redirect.sh', cmd: `npm run build > logs/build.log 2>&1`, expect: 'deny' },
  { hook: 'block-log-redirect.sh', cmd: `echo hi > out.txt`, expect: 'deny' },
  { hook: 'block-log-redirect.sh', cmd: `cmd 2>/dev/null`, expect: 'allow' },
  { hook: 'block-log-redirect.sh', cmd: `cargo build 2>&1`, expect: 'allow' },
  { hook: 'block-log-redirect.sh', cmd: `git commit -m "redirect a > b"`, expect: 'allow' },
  { hook: 'block-log-redirect.sh', cmd: `rg "a -> b" src`, expect: 'allow' },
  { hook: 'block-log-redirect.sh', cmd: `timeout 5 ls`, expect: 'allow' },

  { hook: 'block-shell-timeout.sh', cmd: `timeout 30 cargo build`, expect: 'deny' },
  { hook: 'block-shell-timeout.sh', cmd: `sudo timeout 30 ls`, expect: 'deny' },
  { hook: 'block-shell-timeout.sh', cmd: `git commit -m "add timeout param"`, expect: 'allow' },
  { hook: 'block-shell-timeout.sh', cmd: `rg timeout src`, expect: 'allow' },

  { hook: 'block-grep-use-rg.sh', cmd: `grep -r foo src`, expect: 'deny' },
  { hook: 'block-grep-use-rg.sh', cmd: `cat a | grep foo`, expect: 'deny' },
  { hook: 'block-grep-use-rg.sh', cmd: String.raw`rg -n "grep -r foo" src`, expect: 'allow' },
  { hook: 'block-grep-use-rg.sh', cmd: `git commit -m "replace grep with rg"`, expect: 'allow' },
  { hook: 'block-grep-use-rg.sh', cmd: `pgrep node`, expect: 'allow' },

  { hook: 'block-rg-replace-misuse.sh', cmd: `rg -rn typst src`, expect: 'deny' },
  { hook: 'block-rg-replace-misuse.sh', cmd: `rg -n typst src`, expect: 'allow' },
  { hook: 'block-rg-replace-misuse.sh', cmd: `rg --replace n typst src`, expect: 'allow' },
  { hook: 'block-rg-replace-misuse.sh', cmd: `git commit -m "fix rg -rn misuse"`, expect: 'allow' },
  { hook: 'block-rg-replace-misuse.sh', cmd: `rg -n "rg -rl" docs`, expect: 'allow' },

  { hook: 'block-prose-docs.sh', input: { file_path: 'a.md', content: '이 설계는 이렇게 동작한다. 그러므로 저렇게 된다. 따라서 정답이다.' }, expect: 'deny' },
  { hook: 'block-prose-docs.sh', input: { file_path: 'a.md', content: `- ${'가'.repeat(121)}` }, expect: 'deny' },
  { hook: 'block-prose-docs.sh', input: { file_path: 'a.md', content: `| a | ${'나'.repeat(61)} |` }, expect: 'deny' },
  { hook: 'block-prose-docs.sh', input: { file_path: 'a.md', content: '- 참조문서 = 재편집 대상. 학습 아님' }, expect: 'allow' },
  { hook: 'block-prose-docs.sh', input: { file_path: 'a.md', content: `- 참고: [a](https://example.com/${'x'.repeat(150)})` }, expect: 'allow' },
  { hook: 'block-prose-docs.sh', input: { file_path: 'a.md', content: '```\n' + '다. '.repeat(10) + '\n```' }, expect: 'allow' },
  { hook: 'block-prose-docs.sh', input: { file_path: 'a.ts', content: '다. 다. 다. 다.' }, expect: 'allow' },
  { hook: 'block-prose-docs.sh', input: { file_path: 'CHANGELOG.md', content: '다. 다. 다. 다.' }, expect: 'allow' },
];

let failures = 0;
for (const testCase of cases) {
  const result = spawnSync('bash', [join(hooks, testCase.hook)], {
    input: JSON.stringify({ tool_input: testCase.input ?? { command: testCase.cmd } }),
    encoding: 'utf8',
  });
  const out = (result.stdout || '').trim();
  const decision = out ? 'deny' : 'allow';
  const ok = decision === testCase.expect;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${decision.padEnd(5)} (want ${testCase.expect.padEnd(5)}) ${testCase.hook}  ${testCase.cmd ?? testCase.input.file_path}`);
}

process.exit(failures === 0 ? 0 : 1);
