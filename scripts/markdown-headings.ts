export type ParsedHeading = { depth: number; text: string };

const HEADING_MARKER = "(#{1,6})";
const HEADING_TEXT = "(.+?)";
const LEADING_INDENT = "\\s{0,3}";
const TRAILING_HASHES = "#*";

const STRICT_HEADING = new RegExp(`^${HEADING_MARKER}\\s+${HEADING_TEXT}\\s*$`);
const LENIENT_HEADING = new RegExp(`^${LEADING_INDENT}${HEADING_MARKER}\\s+${HEADING_TEXT}\\s*${TRAILING_HASHES}\\s*$`);
const LEADING_HASHES = /^#+\s*/;
const LEADING_SECTION_NUMBER = /^\d{1,3}(?:[.\-]\d{1,3})*(?:[).](?=\S)|[).]?\s+)/;

export function parseHeading(line: string, lenient = false): ParsedHeading | null {
  const match = String(line ?? "").match(lenient ? LENIENT_HEADING : STRICT_HEADING);
  if (!match) return null;
  return { depth: match[1].length, text: match[2].trim() };
}

export function parseHeadingAtDepth(line: string, depth: number, lenient = false): ParsedHeading | null {
  const heading = parseHeading(line, lenient);
  return heading && heading.depth === depth ? heading : null;
}

export function stripLeadingHashes(text: string): string {
  return String(text ?? "").replace(LEADING_HASHES, "");
}

export function stripLeadingSectionNumber(text: string): string {
  return String(text ?? "").replace(LEADING_SECTION_NUMBER, "");
}
