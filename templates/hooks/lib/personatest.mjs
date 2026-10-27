import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const hooks = dirname(here);

const assistant = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const toolResult = () => ({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } });
const userTurn = (text) => ({ type: 'user', message: { content: [{ type: 'text', text }] } });

const cases = [
  { name: 'plain violation', entries: [assistant('이것은 문장입니다')], expect: 'block' },
  { name: 'emoji bypass', entries: [assistant('이것은 문장입니다 ✨')], expect: 'block' },
  { name: 'kaomoji bypass', entries: [assistant('이것은 문장입니다 (๑>◡<๑)')], expect: 'block' },
  { name: 'double emoji bypass', entries: [assistant('이것은 문장입니다💗💕')], expect: 'block' },
  { name: 'question', entries: [assistant('맞나요?')], expect: 'block' },
  { name: 'question + emoji', entries: [assistant('맞나요? 💕')], expect: 'block' },
  { name: 'clean yo-che', entries: [assistant('이렇게 해요~')], expect: 'pass' },
  { name: 'clean + emoji', entries: [assistant('이렇게 해드릴게요 ✨')], expect: 'pass' },
  { name: 'exclamation', entries: [assistant('고쳤어요!')], expect: 'pass' },
  { name: 'code fence ignored', entries: [assistant('```\nconst x = 1;\n// 이것은 코드입니다\n```\n고쳤어요~')], expect: 'pass' },
  { name: 'inner line violation', entries: [assistant('판정은 이래요:\n  cargo build 는 느립니다\n뭐 그런 거예요~')], expect: 'block' },
  {
    name: 'mid-turn text between tools',
    entries: [
      userTurn('해줘'),
      assistant('그 함수 본문을 읽습니다.'),
      toolResult(),
      assistant('그대로 흘려서 봅니다.'),
      toolResult(),
      assistant('고쳤어요~'),
    ],
    expect: 'block',
  },
  { name: 'quoted sentence exempt', entries: [assistant('- "그 함수 본문을 읽습니다."')], expect: 'pass' },
  { name: 'bold quoted exempt', entries: [assistant('- "그대로 흘려서 **봅니다**."')], expect: 'pass' },
  { name: 'blockquote exempt', entries: [assistant('> 이것은 인용입니다')], expect: 'pass' },
  { name: 'inline code only exempt', entries: [assistant('`cargo build --release`')], expect: 'pass' },
  { name: 'quote plus own words still checked', entries: [assistant('"인용입니다" 라고 썼습니다')], expect: 'block' },
  {
    name: 'previous turn violation not re-blocked',
    entries: [
      userTurn('첫 요청'),
      assistant('이전 턴 문장입니다'),
      userTurn('두번째 요청'),
      assistant('이번엔 깨끗해요~'),
    ],
    expect: 'pass',
  },
];

const liveCases = [
  { name: 'live: mid-turn violation warns', entries: [userTurn('해줘'), assistant('행이 몇 개 서는지 잽니다.')], expect: 'warn' },
  { name: 'live: clean turn silent', entries: [userTurn('해줘'), assistant('행이 몇 개 서는지 재볼게요~')], expect: 'silent' },
  { name: 'live: quoted exempt', entries: [userTurn('해줘'), assistant('> 인용문 안에서는 이것이 사실이다')], expect: 'silent' },
  {
    name: 'live: corrected retry passes',
    entries: [userTurn('해줘'), assistant('행이 몇 개 서는지 잽니다.'), assistant('행이 몇 개 서는지 재볼게요~')],
    expect: 'twice',
  },
  {
    name: 'live: previous turn violation not re-blocked',
    entries: [userTurn('첫 요청'), assistant('이전 턴 문장입니다'), userTurn('두번째'), assistant('이번엔 깨끗해요~')],
    expect: 'silent',
  },
];

const dir = mkdtempSync(join(tmpdir(), 'personatest-'));
let failures = 0;

const run = (hook, transcript, extra) =>
  spawnSync('bash', [join(hooks, hook)], {
    input: JSON.stringify({ transcript_path: transcript, ...extra }),
    encoding: 'utf8',
  });

for (const [index, testCase] of cases.entries()) {
  const transcript = join(dir, `t${index}.jsonl`);
  writeFileSync(transcript, testCase.entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  const result = run('persona-ending-gate.sh', transcript);
  const decision = (result.stdout || '').trim() ? 'block' : 'pass';
  const ok = decision === testCase.expect;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${decision.padEnd(6)} (want ${testCase.expect.padEnd(6)}) ${testCase.name}`);
}

for (const [index, testCase] of liveCases.entries()) {
  const transcript = join(dir, `live${index}.jsonl`);
  writeFileSync(transcript, testCase.entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  const session = `s${index}-${Date.now()}`;
  const extra = { tool_name: 'Bash', tool_input: { command: 'ls' }, session_id: session };
  const first = run('persona-ending-live.sh', transcript, extra);
  let decision = (first.stdout || '').trim() ? 'warn' : 'silent';
  if (testCase.expect === 'twice') {
    const second = run('persona-ending-live.sh', transcript, extra);
    decision = (second.stdout || '').trim() ? 'warn' : 'twice';
  }
  const ok = decision === testCase.expect;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${decision.padEnd(6)} (want ${testCase.expect.padEnd(6)}) ${testCase.name}`);
}

process.exit(failures === 0 ? 0 : 1);
