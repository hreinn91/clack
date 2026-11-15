<script lang="ts">
  import { renderMarkdown } from '../lib/markdown';

  let { text }: { text: string } = $props();

  const html = $derived(renderMarkdown(text));
</script>

<!-- Sanitized in renderMarkdown before it reaches the page. -->
<div class="md">{@html html}</div>

<style>
  .md {
    overflow-wrap: anywhere;
  }

  .md :global(> :first-child) {
    margin-top: 0;
  }

  .md :global(> :last-child) {
    margin-bottom: 0;
  }

  .md :global(p),
  .md :global(ul),
  .md :global(ol),
  .md :global(pre),
  .md :global(table),
  .md :global(blockquote) {
    margin: 0 0 0.75em;
  }

  .md :global(h1),
  .md :global(h2),
  .md :global(h3),
  .md :global(h4) {
    margin: 1.1em 0 0.4em;
    font-size: 1.05em;
    font-weight: 900;
    line-height: 1.3;
  }

  .md :global(h1) {
    font-size: 1.25em;
  }

  .md :global(h2) {
    font-size: 1.15em;
  }

  .md :global(ul),
  .md :global(ol) {
    padding-left: 1.4em;
  }

  .md :global(li + li) {
    margin-top: 0.2em;
  }

  .md :global(a) {
    color: var(--link);
    text-decoration: none;
  }

  .md :global(a:hover) {
    text-decoration: underline;
  }

  .md :global(strong) {
    font-weight: 700;
  }

  .md :global(code) {
    padding: 0.1em 0.3em;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--sunken);
    color: var(--code);
    font: 0.8em var(--mono);
  }

  .md :global(pre) {
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--sunken);
    overflow-x: auto;
  }

  .md :global(pre code) {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font-size: 12.5px;
    line-height: 1.5;
  }

  .md :global(blockquote) {
    padding-left: 12px;
    border-left: 3px solid var(--border);
    color: var(--muted);
  }

  .md :global(table) {
    display: block;
    max-width: 100%;
    overflow-x: auto;
    border-collapse: collapse;
    font-size: 0.93em;
  }

  .md :global(th),
  .md :global(td) {
    padding: 5px 10px;
    border: 1px solid var(--border);
    text-align: left;
  }

  .md :global(hr) {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 1em 0;
  }
</style>
