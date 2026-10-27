import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { violationsIn, currentTurnText } from './persona-ending-core.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
  });
}

const raw = await readStdin();
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const transcriptPath = payload?.transcript_path;
const logDir = join(homedir(), '.deuk', 'persona');

try {
  mkdirSync(logDir, { recursive: true });
  appendFileSync(
    join(logDir, 'gate-ending-live.log'),
    `${new Date().toISOString()}\tkeys=${Object.keys(payload ?? {}).join(',')}\ttranscript=${transcriptPath ? 'yes' : 'no'}\n`
  );
} catch {}

if (!transcriptPath) process.exit(0);

let text;
try {
  text = currentTurnText(readFileSync(transcriptPath, 'utf8'));
} catch {
  process.exit(0);
}
if (!text) process.exit(0);

const seenPath = join(logDir, 'ending-live-seen.json');
let seen = [];
try {
  seen = JSON.parse(readFileSync(seenPath, 'utf8'));
} catch {}

const sessionId = payload?.session_id ?? '';
const known = new Set(seen.filter((row) => row.session === sessionId).map((row) => row.line));

const hits = violationsIn(text).filter((line) => !known.has(line));
if (hits.length === 0) process.exit(0);

try {
  const kept = seen.filter((row) => row.session === sessionId).slice(-200);
  for (const line of hits) kept.push({ session: sessionId, line });
  writeFileSync(seenPath, JSON.stringify(kept), 'utf8');
} catch {}

try {
  appendFileSync(join(logDir, 'gate-ending-live.log'), `${new Date().toISOString()}\thits=${hits.join('/')}\n`);
} catch {}

const reason = `어미 위반이 방금 화면에 나갔다 — 도구 호출 직전 검사에서 검출:
${hits.join('\n')}

이 세션 어미는 요-체 확정값이다. 도구 사이에 쓰는 중간 텍스트도 예외가 아니다 — 그 자리가 가장 자주 미끄러진다.
"~합니다/~습니다/~한다"로 끝내지 말고 "~해요/~할게요/~예요"로 쓴다.

이 도구 호출은 막혔다. 나간 텍스트는 회수되지 않으므로, 지금 요-체로 다시 쓴 뒤 같은 도구를 다시 호출하라 — 작업 내용은 바꾸지 않는다.`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })
);
process.exit(0);
