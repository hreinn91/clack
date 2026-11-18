<script lang="ts">
  import { folderPath } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import FolderBrowser from './FolderBrowser.svelte';
  import FolderFinder from './FolderFinder.svelte';
  import Picker from './Picker.svelte';

  let { onmenu }: { onmenu: () => void } = $props();

  // A chat always works in a folder. This page is about choosing it: a new
  // one, created in the tree, or one that is already there.
  type Mode = 'create' | 'existing' | 'elsewhere';

  const TOP = '';

  let mode = $state<Mode>('create');
  /** Where the new folder goes: TOP for data/sessions itself, or a folder path. */
  let parent = $state(TOP);
  let name = $state('');
  let starting = $state(false);
  let nameField = $state<HTMLInputElement>();

  const touch = matchMedia('(pointer: coarse)').matches;

  /** A name for a folder the person did not name, like the server would make up. */
  function madeUpName(): string {
    const now = new Date();
    const two = (n: number) => String(n).padStart(2, '0');
    return `chat-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  }

  const known = $derived(new Set(app.folders.map((folder) => folder.name)));
  const typed = $derived(folderPath(name));
  /** The folder the chat will work in, from data/sessions. Empty when no name is typed yet. */
  const target = $derived(typed ? (parent ? `${parent}/${typed}` : typed) : '');
  const exists = $derived(target !== '' && known.has(target));

  /** The rows of the preview: every folder from data/sessions down to the new one, and which of them will be made. */
  const preview = $derived.by(() => {
    const parts = (target || (parent ? `${parent}/${'\u0000'}` : '\u0000')).split('/');
    return parts.map((part, index) => {
      const path = parts.slice(0, index + 1).join('/');
      const placeholder = part === '\u0000';
      return { name: placeholder ? 'chat-…' : part, depth: index, placeholder, isNew: placeholder || !known.has(path), last: index === parts.length - 1 };
    });
  });

  const parentOptions = $derived([
    { value: TOP, label: 'Top level', description: 'Directly in data/sessions' },
    ...app.pickableFolders
      .map((folder) => folder.name)
      .sort((a, b) => a.localeCompare(b))
      .map((path) => ({ value: path, label: path, description: `Inside data/sessions/${path}` })),
  ]);

  async function start(folder: string) {
    starting = true;
    await app.newSession(folder);
    starting = false;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (starting) return;
    // With no name, make one up here: sending only the parent would put the chat in the parent itself.
    void start(target || (parent ? `${parent}/${madeUpName()}` : madeUpName()));
  }

  function choose(next: Mode) {
    mode = next;
  }

  /** What happened to the last folder added without a chat, so the page can say so. */
  let added = $state('');

  /** Adds a folder from elsewhere on this computer, then starts a chat in it. */
  async function startElsewhere(path: string) {
    starting = true;
    app.error = null;
    try {
      await app.newSession(await app.addRoot(path));
    } catch (err) {
      app.error = err instanceof Error ? err.message : String(err);
    } finally {
      starting = false;
    }
  }

  async function addElsewhere(path: string) {
    starting = true;
    app.error = null;
    try {
      const real = await app.addRoot(path);
      added = `${real} is in the sidebar now, with its own tree.`;
    } catch (err) {
      app.error = err instanceof Error ? err.message : String(err);
    } finally {
      starting = false;
    }
  }

  $effect(() => {
    void app.loadFolders();
  });

  // Arriving with a folder in the address (#/new/<folder>): offer that folder, ready to start in.
  let offered = $state<string | undefined>();
  $effect(() => {
    offered = app.route.name === 'new' ? app.route.folder : undefined;
    if (offered) mode = 'existing';
    else if (app.route.name === 'new' && app.route.elsewhere && app.outsideFolders) mode = 'elsewhere';
  });

  // Ready to type straight away, except on a touch screen where that would throw up the keyboard.
  $effect(() => {
    if (mode === 'create' && !touch) nameField?.focus();
  });
</script>

{#snippet folderIcon()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">
    <path d="M1.75 4.25c0-.7.55-1.25 1.25-1.25h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25v5.75c0 .7-.55 1.25-1.25 1.25H3c-.7 0-1.25-.55-1.25-1.25z" />
  </svg>
{/snippet}

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
    <div class="intro">
      <h2>Where should Claude work?</h2>
      <p>
        Every chat works in a folder of its own, and Claude can only touch the files inside it. Start with a fresh folder,
        carry on in one you already have{app.outsideFolders ? ', or pick one anywhere on this computer' : ''}.
      </p>
    </div>

    <div class="modes" role="radiogroup" aria-label="Folder for this chat">
      <button role="radio" aria-checked={mode === 'create'} class:on={mode === 'create'} onclick={() => choose('create')}>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 13H3c-.7 0-1.25-.55-1.25-1.25v-7.5C1.75 3.55 2.3 3 3 3h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25V8" />
          <path d="M12 10v4.5M9.75 12.25h4.5" />
        </svg>
        <span>
          <strong>New folder</strong>
          <small>Creates an empty folder in the tree</small>
        </span>
      </button>
      <button role="radio" aria-checked={mode === 'existing'} class:on={mode === 'existing'} onclick={() => choose('existing')}>
        {@render folderIcon()}
        <span>
          <strong>Existing folder</strong>
          <small>{app.pickableFolders.length ? `${app.pickableFolders.length} to choose from` : 'None yet'}</small>
        </span>
      </button>
      {#if app.outsideFolders}
        <button role="radio" aria-checked={mode === 'elsewhere'} class:on={mode === 'elsewhere'} onclick={() => choose('elsewhere')}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 13H3c-.7 0-1.25-.55-1.25-1.25v-7.5C1.75 3.55 2.3 3 3 3h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25V7.5" />
            <path d="M10.5 13.5l4-4M11.5 9.5h3v3" />
          </svg>
          <span>
            <strong>On this computer</strong>
            <small>Any folder, outside data/sessions</small>
          </span>
        </button>
      {/if}
    </div>

    {#if mode === 'create'}
      <form class="card" onsubmit={submit}>
        <div class="row">
          <span class="field-label" aria-hidden="true">Create it in</span>
          <span class="location">
            <Picker label="Create the folder in" value={parent} options={parentOptions} placement="down" onpick={(value) => (parent = value)} />
          </span>
        </div>

        <div class="row">
          <label for="new-folder-name">Folder name</label>
          <input
            id="new-folder-name"
            type="text"
            placeholder="my-project"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            maxlength="80"
            aria-describedby="new-folder-rules"
            bind:this={nameField}
            bind:value={name}
          />
          <p class="rules" id="new-folder-rules">
            Lowercase letters, digits and dashes; anything else turns into a dash. Leave it empty and a name is made up.
          </p>
        </div>

        <div class="preview" aria-live="polite">
          <p class="caption">{exists ? 'This folder is already there' : 'This will be added to your folders'}</p>
          <ul aria-label="Where the folder goes">
            <li class="root">{@render folderIcon()} <span>data/sessions</span></li>
            {#each preview as row, index (index)}
              <li style:--depth={row.depth + 1} class:new={row.isNew && !exists} class:target={row.last}>
                <span class="branch" aria-hidden="true">└</span>
                {@render folderIcon()}
                <span class="label" class:placeholder={row.placeholder}>{row.name}</span>
                {#if row.last}
                  {#if exists}
                    <span class="badge same">Exists · the chat joins it</span>
                  {:else if row.placeholder}
                    <span class="badge">New · name made up</span>
                  {:else}
                    <span class="badge">New</span>
                  {/if}
                {:else if row.isNew}
                  <span class="badge soft">New</span>
                {/if}
              </li>
            {/each}
          </ul>
        </div>

        <div class="actions">
          <button class="btn primary" disabled={starting}>
            {starting ? 'Starting…' : exists ? 'Start chat in this folder' : 'Create folder and start chat'}
          </button>
        </div>
      </form>
    {:else if mode === 'elsewhere'}
      <div class="card">
        <FolderBrowser busy={starting} onstart={(path) => void startElsewhere(path)} onadd={(path) => void addElsewhere(path)} />
        {#if added}<p class="added" role="status">{added}</p>{/if}
      </div>
    {:else}
      <div class="card">
        {#if app.folders.length}
          <FolderFinder
            allowCreate={false}
            busy={starting}
            action="Start chat"
            placeholder="Find a folder"
            initial={offered ?? ''}
            onpick={(path) => void start(path)}
          />
        {:else}
          <p class="empty">
            There are no folders yet.
            <button class="link" onclick={() => choose('create')}>Create one</button> to start.
          </p>
        {/if}
      </div>
    {/if}

    {#if app.error}<p class="error" role="alert">{app.error}</p>{/if}
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
    gap: 18px;
  }

  .intro {
    display: grid;
    gap: 6px;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 900;
  }

  .intro p {
    margin: 0;
    color: var(--muted);
  }

  /* The two ways to go, as cards side by side. */
  .modes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 10px;
  }

  .modes button {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    text-align: left;
  }

  .modes button:hover {
    border-color: var(--border-strong);
  }

  .modes button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .modes svg {
    flex: none;
    color: var(--muted);
  }

  .modes .on svg {
    color: var(--accent);
  }

  .modes span {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .modes small {
    color: var(--muted);
    font-size: 13px;
  }

  .card {
    display: grid;
    gap: 16px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .row {
    display: grid;
    gap: 6px;
  }

  label,
  .field-label {
    font-size: 14px;
    font-weight: 700;
  }

  input {
    min-width: 0;
    min-height: 42px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    font: 16px var(--mono);
  }

  input:focus {
    border-color: var(--accent);
    outline: 2px solid var(--accent-soft);
  }

  /* The location picker, dressed as a field. */
  .location {
    display: flex;
  }

  .location :global(.picker) {
    flex: 1;
  }

  .location :global(.trigger) {
    flex: 1;
    justify-content: space-between;
    height: 42px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    font: 15px var(--mono);
  }

  .rules {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  /* The folder tree as it will be, with what is new picked out. */
  .preview {
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    border-radius: 8px;
    background: var(--sunken);
  }

  .caption {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .preview ul {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
    font: 14px var(--mono);
  }

  .preview li {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 26px;
    padding-left: calc((var(--depth, 0) - 1) * 18px);
    color: var(--muted);
  }

  .preview li.root {
    padding-left: 0;
  }

  .preview li svg {
    flex: none;
  }

  .branch {
    width: 12px;
    opacity: 0.6;
  }

  .preview .label {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .preview li.target {
    color: var(--text);
    font-weight: 700;
  }

  .preview li.new svg {
    color: var(--accent);
  }

  .placeholder {
    font-style: italic;
    font-weight: 400;
  }

  .badge {
    flex: none;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font: 700 11.5px var(--font);
  }

  .badge.soft {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .badge.same {
    background: var(--surface);
    border: 1px solid var(--border-strong);
    color: var(--text);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .actions .btn {
    min-height: 42px;
    padding-inline: 18px;
  }

  .empty {
    margin: 0;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--link);
    font: inherit;
    text-decoration: underline;
  }

  .error {
    margin: 0;
    color: var(--danger);
  }

  .added {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  @media (max-width: 520px) {
    .modes {
      grid-template-columns: 1fr;
    }

    .actions .btn {
      flex: 1;
    }
  }
</style>
