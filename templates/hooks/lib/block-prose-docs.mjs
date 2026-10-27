import { parseMarkdown } from './markdown-ast.mjs';
import { readPayload, deny, allow } from './shell-ast.mjs';

const LINE_LIMIT = 120;
const CELL_LIMIT = 60;
const SENTENCE_LIMIT = 2;
const EXEMPT_NAMES = [/^CHANGELOG/i];

const message = (hits) => `문서를 산문으로 쓰는 것은 차단됩니다 — core-rules/AGENTS.md "문서는 메모체로 쓴다".

걸린 줄:
${hits.map((hit) => `  - ${hit}`).join('\n')}

고치는 법:
  한 항목 = 한 줄 불릿, ${LINE_LIMIT}자 이내, 문장 ${SENTENCE_LIMIT}개 이하
  표 칸 = 한 구절(${CELL_LIMIT}자 이내)
  근거·까닭·대안 비교는 빼고 결론만`;

function writtenText(input) {
  if (typeof input.content === 'string') return input.content;
  if (typeof input.new_string === 'string') return input.new_string;
  if (Array.isArray(input.edits)) return input.edits.map((edit) => edit.new_string ?? '').join('\n');
  return '';
}

function isTarget(path) {
  if (!path || !path.toLowerCase().endsWith('.md')) return false;
  const name = path.split(/[\\/]/).pop();
  return !EXEMPT_NAMES.some((pattern) => pattern.test(name));
}

function sentenceCount(prose) {
  let count = 0;
  for (let i = 0; i < prose.length; i += 1) {
    const ch = prose[i];
    const next = prose[i + 1];
    if ((ch === '.' || ch === '?' || ch === '!') && (next === undefined || next === ' ')) count += 1;
  }
  return count;
}

function isDelimiterCell(cell) {
  for (const ch of cell) {
    if (ch !== '-' && ch !== ':') return false;
  }
  return true;
}

function tableCells(text) {
  return text
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell && !isDelimiterCell(cell));
}

function dropLinkTargets(text) {
  let out = '';
  let index = 0;
  while (index < text.length) {
    if (text[index] === ']' && text[index + 1] === '(') {
      const close = text.indexOf(')', index + 2);
      if (close !== -1) {
        out += ']';
        index = close + 1;
        continue;
      }
    }
    out += text[index];
    index += 1;
  }
  return out;
}

function snippet(text) {
  return text.length > 50 ? `${text.slice(0, 50)}…` : text;
}

export function findProse(source) {
  const hits = [];
  for (const block of parseMarkdown(source.replace(/\r/g, ''))) {
    if (block.kind !== 'paragraph') continue;
    if (block.text.startsWith('#')) continue;
    if (block.text.startsWith('|')) {
      for (const cell of tableCells(block.text)) {
        if (cell.length > CELL_LIMIT) hits.push(`표 칸 ${cell.length}자: ${snippet(cell)}`);
      }
      continue;
    }
    const prose = dropLinkTargets(block.prose);
    const sentences = sentenceCount(prose);
    if (prose.length > LINE_LIMIT) hits.push(`${prose.length}자: ${snippet(prose)}`);
    else if (sentences > SENTENCE_LIMIT) hits.push(`문장 ${sentences}개: ${snippet(prose)}`);
  }
  return hits;
}

async function main() {
  let payload;
  try {
    payload = JSON.parse(await readPayload());
  } catch {
    allow();
  }
  const input = payload?.tool_input ?? {};
  if (!isTarget(input.file_path)) allow();
  const hits = findProse(writtenText(input));
  if (hits.length > 0) deny(message(hits.slice(0, 5)));
  allow();
}

if (!process.env.PROSE_GATE_LIB) await main();
