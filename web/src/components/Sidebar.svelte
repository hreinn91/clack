<script lang="ts">
  import type { NoteNode } from '../../../shared/protocol';
  import { notes } from '../lib/notes.svelte';
  import { app } from '../lib/state.svelte';
  import ChatList from './ChatList.svelte';
  import NoteBranch from './NoteBranch.svelte';
  import TreeDir from './TreeDir.svelte';

  // On the Data page the sidebar shows the data directory instead of the chats, and on Notes the notes.
  const onData = $derived(app.route.name === 'data');
  const onNotes = $derived(app.route.name === 'notes');
  const query = $derived(app.search.trim().toLowerCase());
  const hint = $derived(onData ? 'Filter files' : onNotes ? 'Filter notes' : 'Search chats and folders');
  const named = (node: NoteNode): boolean => node.title.toLowerCase().includes(query) || node.children.some(named);
  const noMatch = $derived(onNotes && query !== '' && !notes.tree.some(named));

  $effect(() => {
    if (onNotes && !notes.loaded) void notes.load();
  });

  /** A dragged note held over the Notes heading, to go back to the top. */
  let topOver = $state(false);

  function dropTop(event: DragEvent) {
    event.preventDefault();
    const from = notes.dragging;
    const allowed = notes.canDrop('');
    notes.dragging = null;
    topOver = false;
    if (from && allowed) void notes.move(from, '');
  }

  let refreshing = $state(false);

  async function refresh() {
    refreshing = true;
    await app.refreshData();
    refreshing = false;
  }
</script>

<nav class="side" aria-label={onData ? 'Files' : onNotes ? 'Notes' : 'Chats'}>
  <header>
    <span class="brand">Clack</span>
    {#if onNotes}
      <button class="compose" aria-label="New note" title="New note" onclick={() => void notes.create()}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 2.75H5.5a1.5 1.5 0 0 0-1.5 1.5v11.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V7.75z" />
          <path d="M11 2.75v5h5M10 10.25v4.5M7.75 12.5h4.5" />
        </svg>
      </button>
    {:else if onData}
      <button class="compose" class:spin={refreshing} aria-label="Refresh" title="Read the folders again" onclick={refresh}>
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 10a6 6 0 1 1-1.8-4.3M16.5 3.5v3h-3" />
        </svg>
      </button>
    {:else}
    <a class="compose" href="#/new" aria-label="New chat" title="New chat">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 4H5a1.5 1.5 0 0 0-1.5 1.5v9.5A1.5 1.5 0 0 0 5 16.5h9.5A1.5 1.5 0 0 0 16 15v-4" />
        <path d="M14.5 3.2a1.4 1.4 0 0 1 2 2L10 11.7l-2.7.7.7-2.7z" />
      </svg>
    </a>
    {/if}
  </header>

  <!-- On a phone the top bar is hidden, so the search field lives here instead. -->
  <input
    class="find"
    type="search"
    placeholder={hint}
    aria-label={hint}
    bind:value={app.search}
  />

  <div class="scroll">
    {#if onNotes}
      <section>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="root"
          class:over={topOver}
          ondragover={(event) => {
            if (!notes.canDrop('')) return;
            event.preventDefault();
            topOver = true;
          }}
          ondragleave={() => (topOver = false)}
          ondrop={dropTop}
        >
          <h2 title="Kept as markdown files in data/notes">{topOver ? 'Move to the top' : 'Notes'}</h2>
          {#if notes.tree.length}
            <button aria-label="Export all notes as a zip" title="Export all notes (.zip)" onclick={() => void notes.download('', true)}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 2.5v7.5M4.75 7 8 10.25 11.25 7M2.75 12.5v.75c0 .41.34.75.75.75h9c.41 0 .75-.34.75-.75v-.75" />
              </svg>
            </button>
          {/if}
        </div>
        {#if !notes.loaded}
          <p class="empty">Loading…</p>
        {:else if !notes.tree.length}
          <div class="empty">
            <p>No notes yet.</p>
            <button class="start" onclick={() => void notes.create()}>New note</button>
          </div>
        {:else}
          <NoteBranch nodes={notes.tree} depth={0} {query} />
          {#if noMatch}
            <p class="empty">No note is called that.</p>
          {/if}
        {/if}
      </section>
    {:else if onData}
      <section>
        <div class="root">
          <h2 title={app.dataDir}>Data</h2>
          {#if app.terminalEnabled}
            <button aria-label="Open a terminal in the data directory" title="Open a terminal in the data directory" onclick={() => app.newTerminal()}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
                <path d="M4.5 6l2 2-2 2M8.5 10h3" />
              </svg>
            </button>
          {/if}
        </div>
        <TreeDir path="" depth={0} />
      </section>
    {:else}
      <ChatList />
    {/if}
  </div>
</nav>

<style>
  .side {
    display: flex;
    flex-direction: column;
    min-height: 0;
    color: var(--chrome-muted);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 50px;
    padding: 6px 12px 6px 16px;
    padding-top: calc(6px + env(safe-area-inset-top));
  }

  .brand {
    color: var(--chrome-strong);
    font-size: 18px;
    font-weight: 900;
  }

  .compose {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    color: var(--chrome-text);
  }

  .compose:hover {
    background: var(--chrome-hover);
    color: var(--chrome-strong);
  }

  button.compose {
    padding: 0;
    border: 0;
    background: none;
  }

  .compose.spin svg {
    animation: spin 0.8s linear infinite;
  }

  .root {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-right: 4px;
  }

  .root button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--chrome-text);
  }

  .root button:hover {
    background: var(--chrome-tile);
    color: var(--chrome-strong);
  }

  .root.over {
    border-radius: 6px;
    box-shadow: inset 0 0 0 2px var(--link);
  }

  .empty {
    margin: 4px 8px;
    font-size: 13px;
  }

  .empty p {
    margin: 0 0 8px;
  }

  .start {
    height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 6px;
    background: var(--chrome-tile);
    color: var(--chrome-strong);
    font-weight: 700;
  }

  .start:hover {
    background: var(--chrome-hover);
  }

  .find {
    display: none;
    margin: 0 12px 8px;
    height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: var(--chrome-field);
    color: var(--chrome-strong);
    font-size: 16px;
  }

  .find::placeholder {
    color: var(--chrome-text);
    opacity: 1;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 8px calc(16px + env(safe-area-inset-bottom));
  }

  h2 {
    margin: 0;
    padding: 4px 8px;
    color: var(--chrome-text);
    font-size: 15px;
    font-weight: 700;
  }

  @media (max-width: 820px) {
    .find {
      display: block;
    }
  }
</style>
