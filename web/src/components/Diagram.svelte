<script lang="ts">
  import { canCopyImage, diagramError, diagramName, diagramPng, diagramTheme, drawDiagram, saveFile, standaloneSvg } from '../lib/diagrams';
  import CopyButton from './CopyButton.svelte';
  import DiagramViewer from './DiagramViewer.svelte';

  // A ```mermaid block drawn as a diagram, in place in a reply or a note.
  // Clicking it opens it larger; pointing at it shows what can be done with it.
  let { source, streaming = false }: { source: string; streaming?: boolean } = $props();

  let svg = $state('');
  let error = $state('');
  let showCode = $state(false);
  let open = $state(false);
  let imageCopied = $state<'' | 'ok' | 'failed'>('');

  $effect(() => {
    const code = source;
    // Drawn again when the theme changes, so it keeps matching the page.
    void diagramTheme();
    if (streaming) return;
    let stale = false;
    // A moment's wait: a plan still being written changes it several times a second.
    const wait = setTimeout(() => {
      drawDiagram(code).then(
        (drawn) => {
          if (stale) return;
          svg = drawn;
          error = '';
        },
        (err: unknown) => {
          if (stale) return;
          error = diagramError(err);
        },
      );
    }, 120);
    return () => {
      stale = true;
      clearTimeout(wait);
    };
  });

  async function downloadPng() {
    saveFile(await diagramPng(svg, 2), diagramName(source, 'png'));
  }

  function downloadSvg() {
    saveFile(new Blob([standaloneSvg(svg)], { type: 'image/svg+xml' }), diagramName(source, 'svg'));
  }

  async function copyImage() {
    try {
      // Handed over as a promise, inside the click: Safari only allows it that way.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': diagramPng(svg, 2) })]);
      imageCopied = 'ok';
    } catch {
      imageCopied = 'failed';
    }
    setTimeout(() => (imageCopied = ''), 1600);
  }
</script>

<figure class="diagram">
  {#if streaming}
    <div class="placeholder"><span class="spinner"></span> Diagram, drawn when the reply is finished…</div>
  {:else if error}
    <div class="failed" role="note">
      <strong>This diagram could not be drawn.</strong>
      <span>{error}</span>
    </div>
    <pre class="code"><code>{source}</code></pre>
  {:else if !svg}
    <div class="placeholder"><span class="spinner"></span> Drawing diagram…</div>
  {:else}
    <button class="canvas" aria-label="Open the diagram larger" title="Click to zoom" onclick={() => (open = true)}>
      <!-- Drawn by Mermaid in strict mode and sanitized in drawDiagram before it reaches the page. -->
      {@html svg}
    </button>
    <div class="tools" class:shown={imageCopied !== ''}>
      <button class="tool" aria-pressed={showCode} title={showCode ? 'Hide the Mermaid code' : 'Show the Mermaid code'} onclick={() => (showCode = !showCode)}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
        </svg>
        <span class="label">Code</span>
      </button>
      {#if canCopyImage}
        <button class="tool" class:ok={imageCopied === 'ok'} class:bad={imageCopied === 'failed'} title="Copy the diagram as a picture" onclick={copyImage}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <path d="M2.5 11.5 6 8l2.5 2.5L10.5 8.5l3 3" />
          </svg>
          <span class="label">{imageCopied === 'ok' ? 'Copied' : imageCopied === 'failed' ? 'Failed' : 'Copy image'}</span>
        </button>
      {/if}
      <button class="tool" title="Download as PNG" onclick={downloadPng}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 2.5v7.5M4.75 7 8 10.25 11.25 7M2.75 12.5v.75c0 .41.34.75.75.75h9c.41 0 .75-.34.75-.75v-.75" />
        </svg>
        <span class="label">PNG</span>
      </button>
      <button class="tool" title="Download as SVG" onclick={downloadSvg}>
        <span class="label">SVG</span>
      </button>
      <CopyButton text={source} label="Copy the Mermaid code" size={28} />
    </div>
    {#if showCode}<pre class="code"><code>{source}</code></pre>{/if}
  {/if}
</figure>

{#if open}<DiagramViewer {svg} {source} onclose={() => (open = false)} />{/if}

<style>
  .diagram {
    position: relative;
    display: grid;
    gap: 8px;
    margin: 0 0 0.75em;
    font: 14px/1.4 var(--font);
    white-space: normal;
  }

  .canvas {
    display: grid;
    place-items: center;
    width: 100%;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    overflow-x: auto;
    cursor: zoom-in;
  }

  .canvas:hover {
    border-color: var(--border-strong);
  }

  .canvas :global(svg) {
    display: block;
    max-width: 100%;
    height: auto;
    max-height: 520px;
  }

  .tools {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    box-shadow: 0 2px 6px rgb(0 0 0 / 14%);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .diagram:hover .tools,
  .diagram:focus-within .tools,
  .tools.shown {
    opacity: 1;
  }

  /* Nothing hovers on a touch screen, so the tools stay in sight. */
  @media (hover: none) {
    .tools {
      opacity: 1;
    }
  }

  .tool {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: none;
    color: var(--text);
    font-size: 12.5px;
    font-weight: 700;
  }

  .tool:hover {
    background: var(--hover);
  }

  .tool[aria-pressed='true'] {
    border-color: var(--border-strong);
    background: var(--sunken);
  }

  .tool.ok {
    color: var(--presence);
  }

  .tool.bad {
    color: var(--danger);
  }

  .placeholder {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 64px;
    padding: 12px 16px;
    border: 1px dashed var(--border-strong);
    border-radius: 8px;
    color: var(--muted);
  }

  .failed {
    display: grid;
    gap: 2px;
    padding: 8px 12px;
    border-left: 3px solid var(--danger);
    border-radius: 4px;
    background: var(--danger-soft);
    font-size: 13px;
  }

  .failed span {
    color: var(--muted);
    font: 12px/1.45 var(--mono);
    white-space: pre-wrap;
  }

  .code {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--code-bg);
    color: var(--code-fg);
    font: 12.5px/1.5 var(--mono);
    white-space: pre;
    overflow-x: auto;
  }

  @media (max-width: 520px) {
    .tool .label {
      display: none;
    }

    .tool:has(.label:only-child) .label {
      display: inline;
    }

    .tools {
      position: static;
      justify-self: end;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tools {
      transition: none;
    }
  }
</style>
