<script lang="ts">
  import { renderMarkdown, toggleTask } from '../lib/markdown';

  // A note as it reads: its markdown rendered, code coloured in the theme's
  // code colours, and its task boxes clickable, which ticks them in the text.
  let { text, ontoggle }: { text: string; ontoggle: (text: string) => void } = $props();

  const html = $derived(renderMarkdown(text));
  let body = $state<HTMLElement>();

  $effect(() => {
    void html;
    const root = body;
    if (!root) return;
    for (const box of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      box.disabled = false;
      box.setAttribute('aria-label', box.checked ? 'Done: click to untick' : 'Not done: click to tick');
    }
    const blocks = [...root.querySelectorAll<HTMLElement>('pre code[class*="language-"]')];
    if (!blocks.length) return;
    let stale = false;
    void import('highlight.js/lib/common').then(({ default: hljs }) => {
      if (stale) return;
      for (const block of blocks) {
        const language = /language-(\S+)/.exec(block.className)?.[1];
        if (!language || !hljs.getLanguage(language)) continue;
        block.innerHTML = hljs.highlight(block.textContent ?? '', { language, ignoreIllegals: true }).value;
      }
    });
    return () => (stale = true);
  });

  function onclick(event: MouseEvent) {
    const box = event.target as HTMLElement;
    if (!(box instanceof HTMLInputElement) || box.type !== 'checkbox' || !body) return;
    event.preventDefault();
    const index = [...body.querySelectorAll('input[type="checkbox"]')].indexOf(box);
    if (index !== -1) ontoggle(toggleTask(text, index));
  }
</script>

{#if text.trim()}
  <!-- Sanitized in renderMarkdown before it reaches the page. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="doc syntax" bind:this={body} {onclick}>{@html html}</div>
{:else}
  <p class="nothing">Nothing written yet.</p>
{/if}

<style>
  .doc {
    overflow-wrap: anywhere;
    font-size: 15.5px;
    line-height: 1.65;
  }

  .doc :global(> :first-child) {
    margin-top: 0;
  }

  .doc :global(> :last-child) {
    margin-bottom: 0;
  }

  .doc :global(p),
  .doc :global(ul),
  .doc :global(ol),
  .doc :global(pre),
  .doc :global(table),
  .doc :global(blockquote) {
    margin: 0 0 0.9em;
  }

  .doc :global(h1),
  .doc :global(h2),
  .doc :global(h3),
  .doc :global(h4),
  .doc :global(h5),
  .doc :global(h6) {
    margin: 1.4em 0 0.5em;
    font-weight: 900;
    line-height: 1.25;
  }

  .doc :global(h1) {
    font-size: 1.6em;
  }

  .doc :global(h2) {
    padding-bottom: 0.2em;
    border-bottom: 1px solid var(--border);
    font-size: 1.3em;
  }

  .doc :global(h3) {
    font-size: 1.12em;
  }

  .doc :global(h4),
  .doc :global(h5),
  .doc :global(h6) {
    font-size: 1em;
  }

  .doc :global(ul),
  .doc :global(ol) {
    padding-left: 1.5em;
  }

  .doc :global(li + li) {
    margin-top: 0.25em;
  }

  .doc :global(li > ul),
  .doc :global(li > ol) {
    margin: 0.25em 0 0;
  }

  /* Task lists: the box stands in for the bullet. */
  .doc :global(li:has(> input[type='checkbox'])) {
    list-style: none;
    margin-left: -1.4em;
  }

  .doc :global(input[type='checkbox']) {
    width: 15px;
    height: 15px;
    margin: 0 0.45em 0 0;
    vertical-align: -2px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .doc :global(li:has(> input[type='checkbox']:checked)) {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent);
  }

  .doc :global(a) {
    color: var(--link);
    text-decoration: none;
  }

  .doc :global(a:hover) {
    text-decoration: underline;
  }

  .doc :global(strong) {
    font-weight: 700;
  }

  .doc :global(code) {
    padding: 0.1em 0.35em;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--sunken);
    color: var(--code);
    font: 0.85em var(--mono);
  }

  .doc :global(pre) {
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--code-bg);
    color: var(--code-fg);
    overflow-x: auto;
  }

  .doc :global(pre code) {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font-size: 13px;
    line-height: 1.55;
  }

  .doc :global(blockquote) {
    padding: 2px 0 2px 14px;
    border-left: 3px solid var(--accent);
    color: var(--muted);
  }

  .doc :global(table) {
    display: block;
    max-width: 100%;
    overflow-x: auto;
    border-collapse: collapse;
    font-size: 0.93em;
  }

  .doc :global(th),
  .doc :global(td) {
    padding: 6px 12px;
    border: 1px solid var(--border);
    text-align: left;
  }

  .doc :global(th) {
    background: var(--sunken);
  }

  .doc :global(hr) {
    margin: 1.6em 0;
    border: 0;
    border-top: 1px solid var(--border);
  }

  .doc :global(img) {
    max-width: 100%;
    border-radius: 6px;
  }

  .nothing {
    margin: 0;
    color: var(--muted);
  }
</style>
