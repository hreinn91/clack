<script lang="ts">
  import { app } from '../lib/state.svelte';
  import ChatList from './ChatList.svelte';
  import TreeDir from './TreeDir.svelte';

  // On the Data page the sidebar shows the data directory instead of the chats.
  const onData = $derived(app.route.name === 'data');

  let refreshing = $state(false);

  async function refresh() {
    refreshing = true;
    await app.refreshData();
    refreshing = false;
  }
</script>

<nav class="side" aria-label={onData ? 'Files' : 'Chats'}>
  <header>
    <span class="brand">clack</span>
    {#if onData}
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
    placeholder={onData ? 'Filter files' : 'Search chats and folders'}
    aria-label={onData ? 'Filter files' : 'Search chats and folders'}
    bind:value={app.search}
  />

  <div class="scroll">
    {#if onData}
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
