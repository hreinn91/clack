<script lang="ts">
  // Where a note is written: plain markdown, with a few helps. Enter carries
  // a list on (and ends it on an empty item), Tab and Shift+Tab indent list
  // items, and Cmd/Ctrl+B and +I make the selection bold or italic. The box
  // grows with the text, so the page scrolls as one document.
  let {
    value,
    oninput,
    placeholder = '',
    editor = $bindable(),
  }: { value: string; oninput: (text: string) => void; placeholder?: string; editor?: HTMLTextAreaElement } = $props();

  const LIST = /^(\s*)((?:[-*+]|(\d+)([.)]))\s+(\[[ xX]\]\s+)?)/;

  function fit() {
    const box = editor;
    if (!box) return;
    // Measuring shrinks the box for a moment; the page around it keeps its place.
    const scroller = box.closest<HTMLElement>('.scroll');
    const top = scroller?.scrollTop ?? 0;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight + 2}px`;
    if (scroller) scroller.scrollTop = top;
  }

  $effect(() => {
    void value;
    fit();
  });

  $effect(() => {
    const box = editor;
    if (!box) return;
    // Narrower or wider, the text wraps differently.
    let width = box.clientWidth;
    const watcher = new ResizeObserver(() => {
      if (box.clientWidth !== width) {
        width = box.clientWidth;
        fit();
      }
    });
    watcher.observe(box);
    return () => watcher.disconnect();
  });

  /** Puts text in place of a range the way typing would, so Undo takes it back. */
  function replace(from: number, to: number, text: string, caret = from + text.length, caretEnd = caret) {
    const box = editor!;
    box.setSelectionRange(from, to);
    const typed = document.execCommand?.('insertText', false, text);
    if (!typed) box.setRangeText(text, from, to, 'end');
    box.setSelectionRange(caret, caretEnd);
    oninput(box.value);
  }

  function lineStartOf(text: string, at: number): number {
    return text.lastIndexOf('\n', at - 1) + 1;
  }

  function onkeydown(event: KeyboardEvent) {
    const box = editor;
    if (!box || event.isComposing) return;
    const { selectionStart: start, selectionEnd: end, value: text } = box;
    const mod = event.metaKey || event.ctrlKey;

    if (event.key === 'Enter' && !event.shiftKey && !mod && !event.altKey && start === end) {
      const lineStart = lineStartOf(text, start);
      const line = text.slice(lineStart, start);
      const item = LIST.exec(line);
      if (!item) return;
      event.preventDefault();
      const [whole, indent, , number, delimiter, task] = item;
      const lineEnd = text.indexOf('\n', start);
      if (line.trim() === whole.trim() && text.slice(start, lineEnd === -1 ? undefined : lineEnd).trim() === '') {
        // An empty item: Enter ends the list instead.
        replace(lineStart, start, '');
        return;
      }
      const marker = `${number ? `${Number(number) + 1}${delimiter}` : whole.trim().charAt(0)} ${task ? '[ ] ' : ''}`;
      replace(start, end, `\n${indent}${marker}`);
      return;
    }

    if (event.key === 'Tab' && !mod && !event.altKey) {
      // Only on list items: anywhere else Tab moves on to the next control, as it should.
      const from = lineStartOf(text, start);
      const next = text.indexOf('\n', end);
      const to = next === -1 ? text.length : next;
      const lines = text.slice(from, to).split('\n');
      if (!lines.some((line) => LIST.test(line)) || !lines.every((line) => LIST.test(line) || line.trim() === '')) return;
      event.preventDefault();
      const changed = lines.map((line) => (event.shiftKey ? line.replace(/^ {1,2}|^\t/, '') : line.trim() ? `  ${line}` : line));
      const replacement = changed.join('\n');
      const first = changed[0]!.length - lines[0]!.length;
      const total = replacement.length - (to - from);
      replace(from, to, replacement, Math.max(from, start + first), Math.max(from, end + total));
      return;
    }

    if (mod && !event.altKey && !event.shiftKey && (event.key === 'b' || event.key === 'i')) {
      event.preventDefault();
      const mark = event.key === 'b' ? '**' : '_';
      const selected = text.slice(start, end);
      // Already wrapped: unwrap.
      if (text.slice(start - mark.length, start) === mark && text.slice(end, end + mark.length) === mark) {
        replace(start - mark.length, end + mark.length, selected, start - mark.length, end - mark.length);
      } else {
        replace(start, end, `${mark}${selected}${mark}`, start + mark.length, end + mark.length);
      }
    }
  }
</script>

<textarea
  class="editor"
  bind:this={editor}
  {value}
  {placeholder}
  aria-label="Note text, in markdown"
  spellcheck="true"
  oninput={(event) => oninput(event.currentTarget.value)}
  {onkeydown}
></textarea>

<style>
  .editor {
    display: block;
    width: 100%;
    min-height: 50vh;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text);
    font-size: 15.5px;
    line-height: 1.65;
    resize: none;
    overflow: hidden;
    tab-size: 2;
  }

  .editor::placeholder {
    color: var(--muted);
    opacity: 0.8;
  }
</style>
