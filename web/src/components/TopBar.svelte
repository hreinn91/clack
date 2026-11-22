<script lang="ts">
  import { app } from '../lib/state.svelte';

  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  // The field narrows whatever the sidebar is showing.
  const hint = $derived(app.changesOpen ? 'Filter changed files' : app.route.name === 'data' ? 'Filter files' : app.route.name === 'notes' ? 'Filter notes' : 'Search chats and folders');

  const hidden = $derived(app.changesOpen ? app.changesListHidden : app.sidebarHidden);

  function filter(text: string) {
    if (app.changesOpen) {
      app.changesFilter = text;
      app.changesListHidden = false;
    } else {
      app.search = text;
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (app.changesOpen) app.changesFilter = '';
      else app.search = '';
    }
  }
</script>

<header class="top">
  <div class="nav">
    <button
      class="toggle"
      aria-label={hidden ? 'Show sidebar' : 'Hide sidebar'}
      aria-pressed={!hidden}
      title={`${hidden ? 'Show' : 'Hide'} sidebar (${mac ? '⌘⇧D' : 'Ctrl+Shift+D'})`}
      onclick={() => app.changesOpen ? (app.changesListHidden = !hidden) : app.toggleSidebar()}
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
        <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
        <path d="M7.5 3.5v13" />
        {#if !hidden}<path d="M3 5.5h4.5v9H3z" fill="currentColor" stroke="none" opacity="0.55" />{/if}
      </svg>
    </button>
    <button aria-label="Back" title="Back" onclick={() => history.back()}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 10H4M9 5l-5 5 5 5" />
      </svg>
    </button>
    <button aria-label="Forward" title="Forward" onclick={() => history.forward()}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 10h12M11 5l5 5-5 5" />
      </svg>
    </button>
  </div>

  <label class="search">
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13.2 13.2 17 17" />
    </svg>
    <input type="search" placeholder={hint} aria-label={hint}
      bind:value={() => app.changesOpen ? app.changesFilter : app.search, filter} {onkeydown} />
    <button class="jump" title="Go to a chat or start one" aria-label="Open the quick switcher" onclick={() => (app.paletteOpen = true)}>
      {mac ? '⌘K' : 'Ctrl K'}
    </button>
  </label>

  <div class="end">
    {#if !app.connected}<span class="offline" role="status">Reconnecting…</span>{/if}
  </div>
</header>

<style>
  .top {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr minmax(0, 720px) 1fr;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    color: var(--chrome-text);
  }

  .nav {
    display: flex;
    justify-content: flex-end;
    gap: 2px;
  }

  /* Sits above the sidebar's left edge, which is the edge it moves. */
  .toggle {
    margin-right: auto;
    margin-left: 63px;
  }

  button {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--chrome-muted);
  }

  button:hover {
    background: var(--chrome-hover);
    color: var(--chrome-strong);
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 10px;
    border-radius: 6px;
    background: var(--chrome-field);
  }

  .search:focus-within {
    background: rgb(255 255 255 / 28%);
    outline: 1px solid rgb(255 255 255 / 50%);
  }

  input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: none;
    color: var(--chrome-strong);
    font-size: 13px;
  }

  input::placeholder {
    color: var(--chrome-text);
    opacity: 1;
  }

  .jump {
    width: auto;
    height: 20px;
    padding: 0 6px;
    border-radius: 4px;
    background: var(--chrome-hover);
    color: var(--chrome-text);
    font-size: 11.5px;
    font-weight: 700;
    white-space: nowrap;
  }

  .end {
    display: flex;
    justify-content: flex-end;
  }

  .offline {
    padding: 1px 10px;
    border-radius: 999px;
    background: rgb(0 0 0 / 30%);
    font-size: 12.5px;
  }
</style>
