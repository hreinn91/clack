<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/state.svelte';
  import FileView from './FileView.svelte';
  import Terminals from './Terminals.svelte';

  let { onmenu }: { onmenu: () => void } = $props();

  const SPLIT_KEY = 'clack.split';
  const MIN = 0.15;
  const MAX = 0.85;

  function savedSplit(): number {
    try {
      const value = Number(localStorage.getItem(SPLIT_KEY));
      if (value >= MIN && value <= MAX) return value;
    } catch {
      // No storage: use the default.
    }
    return 0.45;
  }

  /** How much of the height the open file takes; the terminals get the rest. */
  let split = $state(savedSplit());
  let dragging = $state(false);
  let body = $state<HTMLElement>();

  const showFile = $derived(app.file !== null || app.fileLoading !== null);

  function setSplit(value: number) {
    split = Math.min(MAX, Math.max(MIN, value));
    try {
      localStorage.setItem(SPLIT_KEY, String(split));
    } catch {
      // Not remembered this time.
    }
  }

  function startDrag(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = true;
  }

  function drag(event: PointerEvent) {
    if (!dragging || !body) return;
    const box = body.getBoundingClientRect();
    setSplit((event.clientY - box.top) / box.height);
  }

  function gripKey(event: KeyboardEvent) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    setSplit(split + (event.key === 'ArrowUp' ? -0.05 : 0.05));
  }

  onMount(() => {
    // Files change behind the page's back (Claude writes them), so look again on every visit.
    void app.refreshData();
    void app.loadTerminals();
  });
</script>

<header class="pane-bar">
  <button class="icon-btn menu" aria-label="Open menu" onclick={onmenu}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  </button>
  <h1>Data</h1>
  <p class="where"><span title="The data directory on the server">{app.dataDir}</span></p>
</header>

{#if app.error}
  <p class="error" role="alert">
    {app.error}
    <button class="btn ghost" onclick={() => (app.error = null)}>Dismiss</button>
  </p>
{/if}

<div class="body" class:dragging bind:this={body}>
  {#if showFile}
    <section class="file" style:flex={app.terminalEnabled ? `0 0 ${split * 100}%` : '1 1 0'} aria-label="File">
      <FileView />
    </section>
    {#if app.terminalEnabled}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="grip"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize file and terminal"
        aria-valuemin={MIN * 100}
        aria-valuemax={MAX * 100}
        aria-valuenow={Math.round(split * 100)}
        tabindex="0"
        onpointerdown={startDrag}
        onpointermove={drag}
        onpointerup={() => (dragging = false)}
        onpointercancel={() => (dragging = false)}
        ondblclick={() => setSplit(0.45)}
        onkeydown={gripKey}
      ></div>
    {/if}
  {/if}

  {#if app.terminalEnabled}
    <section class="terminals" aria-label="Terminals">
      <Terminals />
    </section>
  {:else if !showFile}
    <p class="hint">Pick a file in the sidebar to look at it. Terminals are turned off on this server.</p>
  {/if}
</div>

<style>
  h1 {
    flex: none;
  }

  .where {
    flex: 1 1 0;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .where span {
    padding: 2px 7px;
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--muted);
    font: 12px var(--mono);
  }

  .error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 8px 20px;
    padding: 6px 6px 6px 12px;
    border-radius: 6px;
    background: var(--danger-soft);
    color: var(--danger);
  }

  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .body.dragging {
    cursor: row-resize;
    user-select: none;
  }

  .file,
  .terminals {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .terminals {
    flex: 1 1 0;
  }

  .grip {
    position: relative;
    z-index: 2;
    flex: none;
    height: 9px;
    margin: -4px 0;
    cursor: row-resize;
    touch-action: none;
  }

  .grip::after {
    content: '';
    position: absolute;
    inset: 3px 0;
    transition: background 0.1s;
  }

  .grip:hover::after,
  .grip:focus-visible::after,
  .dragging .grip::after {
    background: var(--link);
  }

  .grip:focus-visible {
    outline: none;
  }

  .hint {
    margin: 0;
    padding: 20px;
    color: var(--muted);
  }
</style>
