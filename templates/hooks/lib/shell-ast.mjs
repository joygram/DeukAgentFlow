const OPERATORS = ['>>&', '<<<', '&&', '||', ';;', '<<', '>>', '<&', '>&', '>|', '|&', '|', ';', '&', '<', '>', '(', ')'];

const isBlank = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
const isNameChar = (ch) => /[A-Za-z0-9_]/.test(ch);

class Scanner {
  constructor(src) {
    this.src = src;
    this.pos = 0;
    this.tokens = [];
    this.pendingHeredocs = [];
  }

  atEnd() {
    return this.pos >= this.src.length;
  }

  peek(offset = 0) {
    return this.src[this.pos + offset];
  }

  startsWith(text) {
    return this.src.startsWith(text, this.pos);
  }

  push(token) {
    this.tokens.push(token);
  }

  scan() {
    while (!this.atEnd()) {
      const ch = this.peek();
      if (ch === '\n') {
        this.pos += 1;
        this.push({ type: 'operator', value: '\n' });
        this.consumeHeredocBodies();
        continue;
      }
      if (isBlank(ch)) {
        this.pos += 1;
        continue;
      }
      if (ch === '#' && this.atWordStart()) {
        while (!this.atEnd() && this.peek() !== '\n') this.pos += 1;
        continue;
      }
      if (this.startsWith('[[') && this.atWordStart()) {
        this.skipConditional(']]');
        continue;
      }
      if (this.startsWith('((') && this.atWordStart()) {
        this.skipConditional('))');
        continue;
      }
      const fd = /^([0-9]+)(?=(>>|<<|<&|>&|>\||>|<))/.exec(this.src.slice(this.pos));
      if (fd) {
        this.pos += fd[1].length;
        continue;
      }
      const operator = this.matchOperator();
      if (operator) {
        this.pos += operator.length;
        this.push({ type: 'operator', value: operator });
        if (operator === '<<' || operator === '<<-') this.queueHeredoc(operator);
        continue;
      }
      this.scanWord();
    }
    return this.tokens;
  }

  skipConditional(closing) {
    const start = this.pos;
    this.pos += 2;
    let quote = null;
    while (!this.atEnd()) {
      const ch = this.peek();
      if (quote) {
        if (ch === '\\' && quote === '"') this.pos += 1;
        else if (ch === quote) quote = null;
        this.pos += 1;
        continue;
      }
      if (ch === '\\') {
        this.pos += 2;
        continue;
      }
      if (ch === "'" || ch === '"') {
        quote = ch;
        this.pos += 1;
        continue;
      }
      if (this.startsWith(closing)) {
        this.pos += 2;
        break;
      }
      this.pos += 1;
    }
    this.push({ type: 'word', value: this.src.slice(start, this.pos), raw: this.src.slice(start, this.pos), parts: [], quoted: true });
  }

  atWordStart() {
    const previous = this.src[this.pos - 1];
    return previous === undefined || isBlank(previous) || '(;&|'.includes(previous);
  }

  matchOperator() {
    if (this.startsWith('<<-')) return '<<-';
    for (const operator of OPERATORS) {
      if (this.startsWith(operator)) return operator;
    }
    return null;
  }

  queueHeredoc(operator) {
    this.pendingHeredocs.push({ operator, delimiter: null });
  }

  consumeHeredocBodies() {
    while (this.pendingHeredocs.length > 0) {
      const heredoc = this.pendingHeredocs.shift();
      if (!heredoc.delimiter) continue;
      const { delimiter, strip } = heredoc;
      const body = [];
      while (!this.atEnd()) {
        let lineEnd = this.src.indexOf('\n', this.pos);
        if (lineEnd === -1) lineEnd = this.src.length;
        const line = this.src.slice(this.pos, lineEnd);
        this.pos = lineEnd < this.src.length ? lineEnd + 1 : this.src.length;
        const compared = strip ? line.replace(/^\t+/, '') : line;
        if (compared === delimiter) break;
        body.push(line);
      }
      this.push({ type: 'heredoc', value: body.join('\n') });
    }
  }

  scanWord() {
    const start = this.pos;
    const parts = [];
    let literal = '';
    let quotedOnly = true;
    let sawQuote = false;

    while (!this.atEnd()) {
      const ch = this.peek();
      if (isBlank(ch)) break;
      if (this.matchOperator()) break;

      if (ch === '\\') {
        const next = this.peek(1);
        this.pos += 2;
        if (next !== undefined && next !== '\n') literal += next;
        quotedOnly = quotedOnly && true;
        sawQuote = true;
        continue;
      }
      if (ch === "'") {
        const end = this.src.indexOf("'", this.pos + 1);
        const stop = end === -1 ? this.src.length : end;
        literal += this.src.slice(this.pos + 1, stop);
        this.pos = stop === this.src.length ? stop : stop + 1;
        sawQuote = true;
        continue;
      }
      if (ch === '"') {
        const result = this.scanDoubleQuoted();
        literal += result.literal;
        parts.push(...result.parts);
        sawQuote = true;
        continue;
      }
      if (ch === '$' && this.peek(1) === '(') {
        const inner = this.scanBalanced('(', ')', this.pos + 1);
        parts.push({ type: 'subshell', value: inner });
        continue;
      }
      if (ch === '`') {
        const end = this.findBacktickEnd(this.pos + 1);
        parts.push({ type: 'subshell', value: this.src.slice(this.pos + 1, end) });
        this.pos = end + 1;
        continue;
      }
      if (ch === '$' && this.peek(1) === '{') {
        const inner = this.scanBalanced('{', '}', this.pos + 1);
        literal += '${' + inner + '}';
        continue;
      }
      this.pos += 1;
      literal += ch;
      quotedOnly = false;
    }

    const raw = this.src.slice(start, this.pos);
    if (raw.length === 0) {
      this.pos += 1;
      return;
    }
    const token = { type: 'word', value: literal, raw, parts, quoted: sawQuote && quotedOnly };
    this.push(token);
    this.attachHeredocDelimiter(token);
  }


  attachHeredocDelimiter(token) {
    for (const heredoc of this.pendingHeredocs) {
      if (heredoc.delimiter === null) {
        heredoc.delimiter = token.value;
        heredoc.strip = heredoc.operator === '<<-';
        return;
      }
    }
  }

  scanDoubleQuoted() {
    const parts = [];
    let literal = '';
    this.pos += 1;
    while (!this.atEnd()) {
      const ch = this.peek();
      if (ch === '"') {
        this.pos += 1;
        break;
      }
      if (ch === '\\') {
        const next = this.peek(1);
        this.pos += 2;
        if (next === undefined) break;
        if (next === '\n') continue;
        if ('"\\$`'.includes(next)) literal += next;
        else literal += '\\' + next;
        continue;
      }
      if (ch === '$' && this.peek(1) === '(') {
        const inner = this.scanBalanced('(', ')', this.pos + 1);
        parts.push({ type: 'subshell', value: inner });
        continue;
      }
      if (ch === '`') {
        const end = this.findBacktickEnd(this.pos + 1);
        parts.push({ type: 'subshell', value: this.src.slice(this.pos + 1, end) });
        this.pos = end + 1;
        continue;
      }
      this.pos += 1;
      literal += ch;
    }
    return { literal, parts };
  }

  scanBalanced(open, close, openIndex) {
    let depth = 0;
    let index = openIndex;
    let quote = null;
    while (index < this.src.length) {
      const ch = this.src[index];
      if (quote) {
        if (ch === '\\' && quote === '"') index += 1;
        else if (ch === quote) quote = null;
        index += 1;
        continue;
      }
      if (ch === "'" || ch === '"') {
        quote = ch;
        index += 1;
        continue;
      }
      if (ch === '\\') {
        index += 2;
        continue;
      }
      if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) break;
      }
      index += 1;
    }
    const inner = this.src.slice(openIndex + 1, Math.min(index, this.src.length));
    this.pos = Math.min(index + 1, this.src.length);
    return inner;
  }

  findBacktickEnd(from) {
    let index = from;
    while (index < this.src.length) {
      if (this.src[index] === '\\') {
        index += 2;
        continue;
      }
      if (this.src[index] === '`') return index;
      index += 1;
    }
    return this.src.length;
  }
}

const SEPARATORS = new Set(['&&', '||', ';', ';;', '&', '\n', '(', ')']);
const REDIRECTIONS = new Set(['<', '>', '>>', '<&', '>&', '>|', '<<', '<<-', '<<<', '>>&']);

function buildCommands(tokens) {
  const commands = [];
  let current = newCommand();
  let expectRedirectTarget = false;

  for (const token of tokens) {
    if (token.type === 'heredoc') {
      current.heredocs.push(token.value);
      continue;
    }
    if (token.type === 'operator') {
      if (token.value === '|' || token.value === '|&') {
        current.pipedTo = true;
        commands.push(current);
        current = newCommand();
        current.pipedFrom = true;
        expectRedirectTarget = false;
        continue;
      }
      if (SEPARATORS.has(token.value)) {
        commands.push(current);
        current = newCommand();
        expectRedirectTarget = false;
        continue;
      }
      if (REDIRECTIONS.has(token.value)) {
        current.redirections.push({ operator: token.value, target: null });
        expectRedirectTarget = token.value !== '<<' && token.value !== '<<-';
        continue;
      }
      continue;
    }
    if (expectRedirectTarget) {
      const last = current.redirections[current.redirections.length - 1];
      if (last) last.target = token;
      expectRedirectTarget = false;
      continue;
    }
    current.words.push(token);
  }
  commands.push(current);
  return commands.filter((command) => command.words.length > 0 || command.redirections.length > 0);
}

function newCommand() {
  return { words: [], redirections: [], heredocs: [], pipedTo: false, pipedFrom: false };
}

export function parseShell(source) {
  const tokens = new Scanner(source).scan();
  const commands = buildCommands(tokens);
  const nested = [];
  for (const token of tokens) {
    if (token.type !== 'word') continue;
    for (const part of token.parts || []) {
      if (part.type === 'subshell' && part.value.trim()) nested.push(...parseShell(part.value));
    }
  }
  return [...commands, ...nested];
}

export function commandName(command) {
  for (const word of command.words) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word.raw)) continue;
    return word.value;
  }
  return '';
}

export function commandArgs(command) {
  const name = commandName(command);
  const words = command.words.map((word) => word.value);
  const index = words.indexOf(name);
  return index === -1 ? words : words.slice(index + 1);
}

export function readPayload() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data.replace(/\r/g, '')));
  });
}

export function extractCommand(payload) {
  try {
    return JSON.parse(payload)?.tool_input?.command ?? '';
  } catch {
    return '';
  }
}

export function deny(message) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: message,
      },
    })
  );
  process.exit(0);
}

export function allow() {
  process.exit(0);
}
