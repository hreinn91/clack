<script lang="ts">
  import { ago } from '../lib/format';
  import { app } from '../lib/state.svelte';

  let { onmenu }: { onmenu: () => void } = $props();

  let name = $state('');
  let starting = $state(false);

  /** What the server will turn the typed name into, shown so the result is no surprise. */
  const slug = $derived(
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64),
  );
  const exists = $derived(app.folders.some((folder) => folder.name === slug));

  async function start(folder: string) {
    starting = true;
    await app.newSession(folder);
    starting = false;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    void start(name);
  }

  $effect(() => {
    void app.loadFolders();
  });

  // Arriving from a folder in the sidebar: start with that folder filled in.
  $effect(() => {
    if (app.route.name === 'new' && app.route.folder) name = app.route.folder;
  });
</script>

<header class="pane-bar">
  <button class="icon-btn menu" aria-label="Open menu" onclick={onmenu}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  </button>
  <h1>New chat</h1>
</header>

<div class="scroll">
  <div class="panel">
    <form onsubmit={submit}>
      <h2>Start in a new folder</h2>
      <p class="hint">
        Claude can only work with files inside the folder this chat is given. Leave the name empty and one is made
        up for you.
      </p>
      <div class="field">
        <input
          type="text"
          placeholder="new-chat-session"
          aria-label="Folder name"
          autocapitalize="off"
          autocomplete="off"
          spellcheck="false"
          maxlength="80"
          bind:value={name}
        />
        <button class="btn primary" disabled={starting}>Start chat</button>
      </div>
      {#if slug}
        <p class="path">
          data/sessions/<strong>{slug}</strong>
          {#if exists}<span class="note">already exists, so the chat joins it</span>{/if}
        </p>
      {/if}
    </form>

    {#if app.error}<p class="error" role="alert">{app.error}</p>{/if}

    {#if app.folders.length}
      <section>
        <h2>Or continue in an existing folder</h2>
        <ul>
          {#each app.folders as folder (folder.name)}
            <li>
              <button disabled={starting} onclick={() => start(folder.name)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">
                  <path d="M1.75 4.25c0-.7.55-1.25 1.25-1.25h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25v5.75c0 .7-.55 1.25-1.25 1.25H3c-.7 0-1.25-.55-1.25-1.25z" />
                </svg>
                <span class="name">{folder.name}</span>
                <span class="when">{ago(folder.modified)}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</div>

<style>
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
  }

  .panel {
    max-width: 620px;
    display: grid;
    gap: 28px;
  }

  form,
  section {
    display: grid;
    gap: 10px;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 900;
  }

  .hint {
    margin: 0;
    color: var(--muted);
  }

  .field {
    display: flex;
    gap: 8px;
  }

  input {
    flex: 1;
    min-width: 0;
    min-height: 42px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    font: 16px var(--mono);
  }

  .field .btn {
    min-height: 42px;
  }

  .path {
    margin: 0;
    color: var(--muted);
    font: 13px var(--mono);
    overflow-wrap: anywhere;
  }

  .path strong {
    color: var(--text);
  }

  .note {
    margin-left: 8px;
    font-family: var(--font);
  }

  ul {
    margin: 0;
    padding: 4px;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  li button {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: 40px;
    padding: 6px 10px;
    border: 0;
    border-radius: 7px;
    background: none;
    text-align: left;
  }

  li button:hover:not(:disabled) {
    background: var(--sunken);
  }

  li svg {
    color: var(--muted);
    flex: none;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-family: var(--mono);
    font-size: 13.5px;
  }

  .when {
    color: var(--muted);
    font-size: 12.5px;
  }

  .error {
    margin: 0;
    color: var(--danger);
  }

  @media (max-width: 480px) {
    .field {
      flex-direction: column;
    }
  }
</style>
