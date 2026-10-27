const FENCE_CHARS = new Set(['`', '~']);
const BULLET_CHARS = new Set(['-', '*', '+']);
const QUOTE_OPEN = new Set(['"', "'", '“', '‘', '«']);
const QUOTE_CLOSE = new Set(['"', "'", '”', '’', '»']);
const QUOTE_PAIRS = new Map([
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’'],
  ['«', '»'],
]);
const EMPHASIS = new Set(['*', '_']);
const DIGITS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

function isSpace(ch) {
  return ch === ' ' || ch === '\t';
}

function fenceRun(line) {
  let index = 0;
  while (index < line.length && isSpace(line[index])) index += 1;
  const ch = line[index];
  if (!FENCE_CHARS.has(ch)) return null;
  let length = 0;
  while (index + length < line.length && line[index + length] === ch) length += 1;
  if (length < 3) return null;
  return { char: ch, length, info: line.slice(index + length).trim() };
}

function stripIndent(line) {
  let index = 0;
  while (index < line.length && isSpace(line[index])) index += 1;
  return { indent: index, rest: line.slice(index) };
}

function stripMarkers(rest) {
  let text = rest;
  let quoteDepth = 0;
  let listDepth = 0;

  for (;;) {
    if (text.startsWith('>')) {
      quoteDepth += 1;
      text = text.slice(1);
      while (isSpace(text[0])) text = text.slice(1);
      continue;
    }
    const bulletChar = text[0];
    if (BULLET_CHARS.has(bulletChar) && isSpace(text[1])) {
      listDepth += 1;
      text = text.slice(2);
      while (isSpace(text[0])) text = text.slice(1);
      continue;
    }
    let digits = 0;
    while (DIGITS.has(text[digits])) digits += 1;
    if (digits > 0 && (text[digits] === '.' || text[digits] === ')') && isSpace(text[digits + 1])) {
      listDepth += 1;
      text = text.slice(digits + 2);
      while (isSpace(text[0])) text = text.slice(1);
      continue;
    }
    break;
  }
  return { text, quoteDepth, listDepth };
}

function scanInline(text) {
  const segments = [];
  let literal = '';
  let index = 0;

  const flush = () => {
    if (literal) segments.push({ type: 'text', value: literal });
    literal = '';
  };

  while (index < text.length) {
    const ch = text[index];

    if (ch === '\\') {
      literal += text[index + 1] ?? '';
      index += 2;
      continue;
    }

    if (ch === '`') {
      let ticks = 0;
      while (text[index + ticks] === '`') ticks += 1;
      const closer = '`'.repeat(ticks);
      const end = text.indexOf(closer, index + ticks);
      if (end === -1) {
        literal += text.slice(index, index + ticks);
        index += ticks;
        continue;
      }
      flush();
      segments.push({ type: 'code', value: text.slice(index + ticks, end) });
      index = end + ticks;
      continue;
    }

    if (EMPHASIS.has(ch)) {
      let run = 0;
      while (text[index + run] === ch) run += 1;
      index += run;
      continue;
    }

    if (QUOTE_OPEN.has(ch)) {
      const closer = QUOTE_PAIRS.get(ch);
      const end = text.indexOf(closer, index + 1);
      if (end !== -1) {
        flush();
        segments.push({ type: 'quote', value: text.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    literal += ch;
    index += 1;
  }
  flush();
  return segments;
}

export function parseMarkdown(source) {
  const lines = source.split('\n');
  const blocks = [];
  let fence = null;

  for (const line of lines) {
    const run = fenceRun(line);
    if (fence) {
      if (run && run.char === fence.char && run.length >= fence.length && run.info === '') fence = null;
      blocks.push({ kind: 'code', raw: line });
      continue;
    }
    if (run) {
      fence = run;
      blocks.push({ kind: 'code', raw: line });
      continue;
    }

    const { rest } = stripIndent(line);
    if (rest === '') {
      blocks.push({ kind: 'blank', raw: line });
      continue;
    }
    const { text, quoteDepth, listDepth } = stripMarkers(rest);
    const segments = scanInline(text);
    const prose = segments
      .filter((segment) => segment.type === 'text')
      .map((segment) => segment.value)
      .join('')
      .trim();

    blocks.push({
      kind: quoteDepth > 0 ? 'blockquote' : 'paragraph',
      raw: line,
      text,
      quoteDepth,
      listDepth,
      segments,
      prose,
    });
  }
  return blocks;
}

const PUNCTUATION_ONLY = new Set([' ', '\t', '.', ',', ';', ':', '!', '~', '-', '·']);

export function isVerbatim(block) {
  if (block.kind === 'code') return true;
  if (block.kind === 'blockquote') return true;
  if (block.kind !== 'paragraph') return false;
  for (const ch of block.prose) {
    if (!PUNCTUATION_ONLY.has(ch)) return false;
  }
  return true;
}
