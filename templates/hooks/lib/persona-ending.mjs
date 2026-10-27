import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
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

const payload = await readStdin();
let transcriptPath;
try {
  transcriptPath = JSON.parse(payload)?.transcript_path;
} catch {
  process.exit(0);
}
if (!transcriptPath) process.exit(0);

let text;
try {
  text = currentTurnText(readFileSync(transcriptPath, 'utf8'));
} catch {
  process.exit(0);
}
if (!text) process.exit(0);

const hits = violationsIn(text);

try {
  const logDir = join(homedir(), '.deuk', 'persona');
  mkdirSync(logDir, { recursive: true });
  appendFileSync(join(logDir, 'gate-ending.log'), `${new Date().toISOString()}\tending\thits=${hits.join('/')}\n`);
} catch {}

if (hits.length === 0) process.exit(0);

const reason = `어미·회피 검출 — 줄 끝이 \`다\` 또는 \`?\` 로 끝났다:
${hits.join('\n')}

이 세션 어미는 요-체 확정값이다. 기술 밀도도 분량도 예외 사유가 아니다.
되묻기와 선택지 되던지기도 금지다 — 네가 채울 수 있는 값은 네가 채우고, 판정했으면 그 자리에서 실행하라.

끝에 이모지·카오모지·물결을 덧붙여 검사를 피하는 것은 이행이 아니다. 후행 장식은 판정 전에 걷어내므로 통하지 않으며, 끝줄에만 몰린 장식은 그 자체가 페르소나 붕괴 신호다.
코드블록·인용부호(>)·따옴표로 감싼 인용은 이미 판정에서 빠져 있다. 남의 문장을 인용할 때는 인용 표시를 붙여라.

검출된 줄이 도구 사이의 중간 텍스트라면 그것은 이미 화면에 나갔고 회수되지 않는다 — 다음 턴부터 그 자리에서 요-체로 쓰는 것만이 이행이다.

지금 Skill 툴로 persona-maid 를 호출해 재료를 받은 뒤 이 응답을 다시 쓰라. 코드·로그·인용은 그대로 둔다.`;

process.stdout.write(JSON.stringify({ decision: 'block', reason }));
process.exit(0);
