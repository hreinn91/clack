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
