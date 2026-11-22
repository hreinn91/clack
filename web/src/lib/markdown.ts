import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Single line breaks are kept, as they are when Claude Code prints to a terminal.
marked.setOptions({ gfm: true, breaks: true });

// Claude's output is untrusted HTML once rendered: sanitize it, and make
// links open in a new tab without handing them a reference to this window.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(marked.parse(source, { async: false }));
}

/**
 * Ticks or unticks the `index`th task ("- [ ] …") in a markdown text, counted
 * as the preview shows them: lines inside fenced code blocks are not tasks.
 */
export function toggleTask(source: string, index: number): string {
  const lines = source.split('\n');
  let fence = '';
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const opens = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (opens) {
      if (!fence) fence = opens[1]!;
      else if (opens[1]!.startsWith(fence)) fence = '';
      continue;
    }
    if (fence) continue;
    const task = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/.exec(line);
    if (!task) continue;
    if (seen++ === index) {
      lines[i] = `${task[1]}${task[2] === ' ' ? 'x' : ' '}${line.slice(task[1]!.length + 1)}`;
      return lines.join('\n');
    }
  }
  return source;
}
