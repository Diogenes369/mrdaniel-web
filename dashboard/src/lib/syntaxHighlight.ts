/**
 * Minimal canvas-targeted syntax highlighter.
 *
 * Existing highlighters (Prism/Shiki/highlight.js) all emit HTML/DOM — useless when the target is
 * `ctx.fillText` on a <canvas>. This tokenises a line into `{ text, color }` runs the slide
 * renderer can draw directly, with zero new dependencies.
 *
 * Deliberately a lexer, not a parser: it covers the token classes that actually carry meaning in a
 * 12-line teaching snippet (comments, strings, numbers, keywords, builtins, functions, operators)
 * for the handful of languages this studio emits. It is NOT a correctness-critical component — a
 * mis-coloured token is a cosmetic issue, never a wrong slide.
 */

export type TokenColor = 'plain' | 'comment' | 'string' | 'number' | 'keyword' | 'builtin' | 'func' | 'operator' | 'punct';

export interface CodeToken {
  text: string;
  color: TokenColor;
}

/** Dark-cyber palette, tuned against the studio's obsidian slide background. */
export const TOKEN_PALETTE: Record<TokenColor, string> = {
  plain: '#E2E8F0',
  comment: '#5A6675',
  string: '#9FE870',
  number: '#F0B429',
  keyword: '#22D3EE',
  builtin: '#7DD3FC',
  func: '#C4B5FD',
  operator: '#94A3B8',
  punct: '#64748B',
};

const KEYWORDS: Record<string, string[]> = {
  python: ['def', 'class', 'return', 'import', 'from', 'as', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'try', 'except', 'finally', 'with', 'yield', 'lambda', 'async', 'await', 'raise', 'pass', 'None', 'True', 'False', 'global', 'assert'],
  ts: ['const', 'let', 'var', 'function', 'return', 'import', 'export', 'from', 'as', 'if', 'else', 'for', 'while', 'of', 'in', 'new', 'class', 'extends', 'interface', 'type', 'enum', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'yield', 'typeof', 'instanceof', 'implements', 'public', 'private', 'readonly', 'satisfies', 'null', 'undefined', 'true', 'false'],
  js: ['const', 'let', 'var', 'function', 'return', 'import', 'export', 'from', 'as', 'if', 'else', 'for', 'while', 'of', 'in', 'new', 'class', 'extends', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'yield', 'typeof', 'instanceof', 'null', 'undefined', 'true', 'false'],
  bash: ['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'while', 'case', 'esac', 'function', 'export', 'return', 'local', 'echo', 'cd', 'source'],
  json: ['true', 'false', 'null'],
};

const BUILTINS: Record<string, string[]> = {
  python: ['print', 'len', 'range', 'list', 'dict', 'set', 'str', 'int', 'float', 'bool', 'open', 'enumerate', 'zip', 'map', 'filter', 'sum', 'min', 'max', 'sorted', 'isinstance', 'super', 'self'],
  ts: ['console', 'JSON', 'Object', 'Array', 'Promise', 'Math', 'Number', 'String', 'Boolean', 'Map', 'Set', 'Date', 'fetch', 'this'],
  js: ['console', 'JSON', 'Object', 'Array', 'Promise', 'Math', 'Number', 'String', 'Boolean', 'Map', 'Set', 'Date', 'fetch', 'this'],
  bash: ['npm', 'npx', 'pip', 'python', 'node', 'git', 'curl', 'docker'],
  json: [],
};

function langKey(lang: string): string {
  const l = (lang || '').toLowerCase();
  if (l.startsWith('py')) return 'python';
  if (l === 'typescript' || l === 'ts' || l === 'tsx') return 'ts';
  if (l === 'javascript' || l === 'js' || l === 'jsx') return 'js';
  if (l === 'sh' || l === 'shell' || l === 'bash' || l === 'zsh') return 'bash';
  if (l === 'json') return 'json';
  return 'ts';
}

const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/y;
const NUMBER_RE = /(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/y;
const OPERATOR_CHARS = '+-*/%=<>!&|^~?:';
const PUNCT_CHARS = '()[]{},;.';

/**
 * Tokenises ONE line. Multi-line constructs (triple-quoted strings, block comments) are not
 * tracked across lines — teaching snippets in this studio are short and line-oriented, and the
 * failure mode is only a colour, never dropped or altered text: every input character is emitted
 * exactly once, in order.
 */
export function highlightLine(line: string, lang: string): CodeToken[] {
  const key = langKey(lang);
  const keywords = new Set(KEYWORDS[key] ?? KEYWORDS.ts);
  const builtins = new Set(BUILTINS[key] ?? []);
  const commentPrefix = key === 'python' || key === 'bash' ? '#' : '//';

  const tokens: CodeToken[] = [];
  let i = 0;
  const push = (text: string, color: TokenColor) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last && last.color === color) last.text += text;
    else tokens.push({ text, color });
  };

  while (i < line.length) {
    const ch = line[i];

    // whitespace
    if (ch === ' ' || ch === '\t') {
      push(ch, 'plain');
      i++;
      continue;
    }

    // line comment
    if (line.startsWith(commentPrefix, i)) {
      push(line.slice(i), 'comment');
      break;
    }

    // string (single, double, backtick) — tolerates an unterminated quote by running to EOL
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === '\\') {
          j += 2;
          continue;
        }
        if (line[j] === ch) {
          j++;
          break;
        }
        j++;
      }
      push(line.slice(i, Math.min(j, line.length)), 'string');
      i = Math.min(j, line.length);
      continue;
    }

    // number
    NUMBER_RE.lastIndex = i;
    const numMatch = NUMBER_RE.exec(line);
    if (numMatch && numMatch.index === i) {
      push(numMatch[0], 'number');
      i += numMatch[0].length;
      continue;
    }

    // identifier / keyword / builtin / function-call
    IDENT_RE.lastIndex = i;
    const idMatch = IDENT_RE.exec(line);
    if (idMatch && idMatch.index === i) {
      const word = idMatch[0];
      const nextNonSpace = line.slice(i + word.length).match(/^\s*\(/);
      let color: TokenColor = 'plain';
      if (keywords.has(word)) color = 'keyword';
      else if (builtins.has(word)) color = 'builtin';
      else if (nextNonSpace) color = 'func';
      push(word, color);
      i += word.length;
      continue;
    }

    if (OPERATOR_CHARS.includes(ch)) {
      push(ch, 'operator');
      i++;
      continue;
    }
    if (PUNCT_CHARS.includes(ch)) {
      push(ch, 'punct');
      i++;
      continue;
    }

    push(ch, 'plain');
    i++;
  }

  return tokens;
}

/** Splits a snippet into lines and tokenises each. Tabs become 4 spaces so canvas measurement
 * (which renders \t as zero-width) keeps indentation visible. */
export function highlightCode(code: string, lang: string): CodeToken[][] {
  return (code || '')
    .replace(/\t/g, '    ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => highlightLine(line, lang));
}
