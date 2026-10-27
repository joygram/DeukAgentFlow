import { parseMarkdown, isVerbatim } from './markdown-ast.mjs';

const SCRIPT_RANGES = [
  [0x0041, 0x005a],
  [0x0061, 0x007a],
  [0x0030, 0x0039],
  [0x00c0, 0x024f],
  [0x0370, 0x03ff],
  [0x0400, 0x04ff],
  [0x1100, 0x11ff],
  [0x3040, 0x30ff],
  [0x3130, 0x318f],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa960, 0xa97f],
  [0xac00, 0xd7af],
  [0xd7b0, 0xd7ff],
  [0xf900, 0xfaff],
];

function isMeaningful(ch) {
  if (ch === '?') return true;
  const code = ch.codePointAt(0);
  for (const [low, high] of SCRIPT_RANGES) {
    if (code >= low && code <= high) return true;
  }
  return false;
}

function stripDecoration(text) {
  const chars = [...text];
  let end = chars.length;
  while (end > 0 && !isMeaningful(chars[end - 1])) end -= 1;
  return chars.slice(0, end).join('');
}

export function violationsIn(text, limit = 5) {
  const hits = [];
  for (const block of parseMarkdown(text)) {
    if (block.kind !== 'paragraph') continue;
    if (isVerbatim(block)) continue;
    const trimmed = stripDecoration(block.prose);
    if (trimmed === '') continue;
    const last = [...trimmed].pop();
    if (last === '다' || last === '?') hits.push(block.raw.trim());
    if (hits.length >= limit) break;
  }
  return hits;
}

function hasToolResult(entry) {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return false;
  for (const part of content) {
    if (part.type === 'tool_result') return true;
  }
  return false;
}

export function currentTurnText(transcript) {
  const entries = [];
  for (const line of transcript.split('\n')) {
    if (line.trim() === '') continue;
    try {
      entries.push(JSON.parse(line));
    } catch {}
  }
  const collected = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type === 'user' && !hasToolResult(entry)) break;
    if (entry.type !== 'assistant') continue;
    const parts = entry.message?.content ?? [];
    const text = parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    if (text.trim() !== '') collected.unshift(text);
  }
  return collected.join('\n');
}
