import { marked } from "marked";

export type TextSpan = { start: number; end: number };

const OPAQUE_TOKENS = new Set(["code", "codespan", "html", "link", "image", "def", "table", "blockquote"]);

function walkTextSpans(tokens: any[], from: number, out: TextSpan[]): number {
  let cursor = from;
  for (const token of tokens || []) {
    if (!token) continue;
    const raw = String(token.raw ?? "");
    if (OPAQUE_TOKENS.has(token.type)) {
      cursor += raw.length;
      continue;
    }
    if (token.type === "text" && !token.tokens) {
      out.push({ start: cursor, end: cursor + raw.length });
      cursor += raw.length;
      continue;
    }
    const children = token.tokens || token.items;
    if (!children) {
      cursor += raw.length;
      continue;
    }
    const inner = walkTextSpans(children, cursor, out);
    cursor = raw.length > 0 ? cursor + raw.length : inner;
  }
  return cursor;
}

export function locateProseSpans(text: string): TextSpan[] {
  let tokens: any[];
  try {
    tokens = marked.lexer(text);
  } catch {
    return [{ start: 0, end: text.length }];
  }
  const out: TextSpan[] = [];
  walkTextSpans(tokens, 0, out);
  return out.filter(span => span.start >= 0 && span.end <= text.length && span.start < span.end);
}

export function proseOnly(text: string): string {
  const body = String(text || "");
  if (!body) return "";
  const spans = locateProseSpans(body);
  if (spans.length === 0) return "";
  return spans.map(span => body.slice(span.start, span.end)).join("\n");
}
