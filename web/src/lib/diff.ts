import type { HLJSApi } from 'highlight.js';

// A unified diff read into hunks and lines, each line with its numbers in the
// old and the new file, and highlighted as code. highlight.js is only loaded
// the first time a diff is shown. Each side of a hunk is highlighted as one
// piece, so comments and strings that span lines are coloured right, and then
// cut back into lines.

export type DiffLine = {
  kind: 'context' | 'add' | 'del' | 'note';
  text: string;
  /** Line numbers in the old and the new file; missing on the side the line is not in. */
  old?: number;
  new?: number;
  /** The line highlighted as code, as HTML (escaped text in spans). */
  html?: string;
  /** One of git's conflict markers (<<<<<<<, =======, >>>>>>>). */
  marker?: boolean;
};

export type Hunk = { header: string; context: string; lines: DiffLine[] };

const HUNK = /^@@+ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@+ ?(.*)$/;
const MARKER = /^(<{7}|={7}|>{7})( |$)/;

export function parseDiff(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  let hunk: Hunk | undefined;
  let oldNo = 0;
  let newNo = 0;
  const lines = diff.split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const raw of lines) {
    const head = HUNK.exec(raw);
    if (head) {
      oldNo = Number(head[1]);
      newNo = Number(head[2]);
      hunk = { header: raw.slice(0, raw.lastIndexOf('@@') + 2), context: head[3] ?? '', lines: [] };
      hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    const sign = raw[0];
    const text = raw.slice(1);
    if (sign === '+') hunk.lines.push({ kind: 'add', text, new: newNo++ });
    else if (sign === '-') hunk.lines.push({ kind: 'del', text, old: oldNo++ });
    else if (sign === '\\') hunk.lines.push({ kind: 'note', text: raw.slice(2) });
    else hunk.lines.push({ kind: 'context', text: sign === ' ' ? text : raw, old: oldNo++, new: newNo++, ...(MARKER.test(text) ? { marker: true } : {}) });
  }
  return hunks;
}

/** highlight.js's name for a file's language, from its name; undefined where it is not known. */
const BY_EXTENSION: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json', json5: 'json',
  py: 'python', pyi: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', kts: 'kotlin',
  swift: 'swift', c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', m: 'objectivec', mm: 'objectivec',
  cs: 'csharp', php: 'php', lua: 'lua', pl: 'perl', pm: 'perl', r: 'r', sql: 'sql', graphql: 'graphql', gql: 'graphql',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash', ps1: 'shell',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', env: 'ini',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', svelte: 'xml', vue: 'xml', astro: 'xml',
  vb: 'vbnet', wat: 'wasm', diff: 'diff', patch: 'diff',
};

const BY_NAME: Record<string, string> = {
  makefile: 'makefile', gnumakefile: 'makefile', dockerfile: 'bash', gemfile: 'ruby', rakefile: 'ruby',
  '.bashrc': 'bash', '.zshrc': 'bash', '.profile': 'bash', '.gitconfig': 'ini', '.editorconfig': 'ini',
};

export function languageOf(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  const dot = name.lastIndexOf('.');
  return dot > 0 ? BY_EXTENSION[name.slice(dot + 1)] : undefined;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Highlighted HTML cut into lines. A span that runs over a line break is
 * closed at the end of the line and opened again at the start of the next, so
 * each line stands on its own.
 */
function splitLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let line = '';
  for (const part of html.match(/<span[^>]*>|<\/span>|\n|[^<\n]+|</g) ?? []) {
    if (part.startsWith('<span')) {
      open.push(part);
      line += part;
    } else if (part === '</span>') {
      open.pop();
      line += part;
    } else if (part === '\n') {
      lines.push(line + '</span>'.repeat(open.length));
      line = open.join('');
    } else {
      line += part;
    }
  }
  lines.push(line + '</span>'.repeat(open.length));
  return lines;
}

let loading: Promise<HLJSApi> | undefined;

function loadHighlighter(): Promise<HLJSApi> {
  loading ??= import('highlight.js/lib/common').then((module) => module.default);
  return loading;
}

/** More lines than this and the rest is shown without colours, to keep the page quick. */
const MAX_HIGHLIGHTED = 20_000;

/** Fills in each line's `html`: highlighted where the language is known, escaped text otherwise. */
export async function highlight(hunks: Hunk[], path: string): Promise<void> {
  const language = languageOf(path);
  const plain = () => {
    for (const hunk of hunks) for (const line of hunk.lines) line.html ??= escapeHtml(line.text);
  };
  if (!language) return plain();
  let hljs: HLJSApi;
  try {
    hljs = await loadHighlighter();
  } catch {
    return plain();
  }
  if (!hljs.getLanguage(language)) return plain();
  let budget = MAX_HIGHLIGHTED;
  for (const hunk of hunks) {
    if (budget <= 0) break;
    budget -= hunk.lines.length;
    // The old side (unchanged and removed lines) and the new side (unchanged and added), each as one piece of code.
    const before = hunk.lines.filter((line) => line.kind === 'context' || line.kind === 'del');
    const after = hunk.lines.filter((line) => line.kind === 'context' || line.kind === 'add');
    const paint = (lines: DiffLine[]) => {
      const html = splitLines(hljs.highlight(lines.map((line) => line.text).join('\n'), { language, ignoreIllegals: true }).value);
      lines.forEach((line, i) => (line.html = html[i] ?? escapeHtml(line.text)));
    };
    paint(before);
    paint(after);
  }
  plain();
}
