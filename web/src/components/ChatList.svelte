<script lang="ts">
  import { tick } from 'svelte';
  import type { SessionSummary } from '../../../shared/protocol';
  import { ago, folderPath } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import ActionMenu from './ActionMenu.svelte';

  // The sidebar's chats, as a tree of the folders under data/sessions. Each
  // folder lists the chats that work in it, then the folders inside it.
  type Node = {
    /** From data/sessions, with slashes: "work/client-a". '' is data/sessions itself. */
    path: string;
    name: string;
    depth: number;
    chats: SessionSummary[];
    children: Node[];
    /** Chats in this folder and every folder below it. */
    total: number;
    /** The latest activity among those chats. */
    recent: number;
  };

  const OPEN_KEY = 'clack.tree';

  /** Folders unfolded (true) or folded (false) by hand. Remembered by this browser. */
  function savedOpen(): Record<string, boolean> {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? 'null') as Record<string, boolean> | null;
      if (saved && typeof saved === 'object') return saved;
      // Folders folded shut in the flat list this tree replaced stay shut.
      const old = JSON.parse(localStorage.getItem('clack.collapsed') ?? 'null') as Record<string, boolean> | null;
      if (old && typeof old === 'object') return Object.fromEntries(Object.keys(old).map((folder) => [folder, false]));
    } catch {
      // Nothing saved: folders with chats start unfolded, the rest folded.
    }
    return {};
  }

  let opened = $state(savedOpen());
  let showArchived = $state(false);

  function remember() {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(opened));
    } catch {
      // Not remembered this time.
    }
  }

  const query = $derived(app.search.trim().toLowerCase());
  const openFolder = $derived(app.route.name === 'new' ? app.route.folder : undefined);

  /** Put away by hand, or left without a folder when it was deleted. */
  const away = (chat: SessionSummary) => chat.archived || chat.missing;

  const tree = $derived.by(() => {
    const root: Node = { path: '', name: '', depth: -1, chats: [], children: [], total: 0, recent: 0 };
    const nodes = new Map<string, Node>([['', root]]);
    const ensure = (path: string): Node => {
      const known = nodes.get(path);
      if (known) return known;
      const cut = path.lastIndexOf('/');
      const parent = ensure(cut === -1 ? '' : path.slice(0, cut));
      const node: Node = { path, name: path.slice(cut + 1), depth: parent.depth + 1, chats: [], children: [], total: 0, recent: 0 };
      parent.children.push(node);
      nodes.set(path, node);
      return node;
    };
    for (const folder of app.folders) ensure(folder.name);
    // A chat's folder can be missing from the list (it is cut short in huge projects), so chats add their own.
    for (const chat of app.sessions) if (!away(chat)) ensure(chat.folder).chats.push(chat);

    const finish = (node: Node) => {
      for (const child of node.children) finish(child);
      node.chats.sort((a, b) => b.lastModified - a.lastModified);
      node.total = node.chats.length + node.children.reduce((sum, child) => sum + child.total, 0);
      node.recent = Math.max(0, ...node.chats.map((chat) => chat.lastModified), ...node.children.map((child) => child.recent));
      // Folders with chats first, the most recently used at the top; the rest by name.
      node.children.sort((a, b) => Number(b.total > 0) - Number(a.total > 0) || b.recent - a.recent || a.name.localeCompare(b.name));
    };
    finish(root);
    return root;
  });

  /** While searching: the folders whose name matches, or that hold a matching chat, with the way down to them. */
  function filter(node: Node): Node | null {
    const children = node.children.map(filter).filter((child) => child !== null);
    const named = node.name.toLowerCase().includes(query);
    const chats = named ? node.chats : node.chats.filter((chat) => chat.title.toLowerCase().includes(query));
    if (!named && !chats.length && !children.length) return null;
    return { ...node, chats, children };
  }

  const shown = $derived(query ? tree.children.map(filter).filter((node) => node !== null) : tree.children);

  function isOpen(node: Node): boolean {
    if (query) return true;
    return opened[node.path] ?? node.total > 0;
  }

  /** data/sessions itself, at the top of the tree: open unless folded by hand. */
  const rootOpen = $derived(query !== '' || (opened[''] ?? true));

  function toggleRoot() {
    opened[''] = !rootOpen;
    remember();
  }

  function toggle(node: Node) {
    opened[node.path] = !isOpen(node);
    remember();
  }

  const archived = $derived(
    app.sessions.filter((chat) => away(chat) && (!query || `${chat.title} ${chat.folder}`.toLowerCase().includes(query))),
  );

  // ---- making a folder ----------------------------------------------------------

  /** The folder a new folder is being typed into; '' for the top level, null when none is. */
  let creating = $state<string | null>(null);
  let newName = $state('');
  let createError = $state('');
  let saving = $state(false);
  /** The folder just made, marked for a moment so it is easy to spot. */
  let fresh = $state('');

  const newPath = $derived(folderPath(newName));

  async function startCreate(parent: string) {
    creating = parent;
    newName = '';
    createError = '';
    if (parent) {
      opened[parent] = true;
      remember();
    }
    await tick();
    document.querySelector<HTMLInputElement>('.new-folder input')?.focus();
  }

  function stopCreate() {
    if (!saving) creating = null;
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (creating === null || saving) return;
    if (!newPath) return stopCreate();
    saving = true;
    createError = '';
    try {
      const name = await app.createFolder(creating ? `${creating}/${newPath}` : newPath);
      opened[name] = true;
      remember();
      creating = null;
      fresh = name;
      setTimeout(() => {
        if (fresh === name) fresh = '';
      }, 2500);
      await tick();
      document.querySelector('.folder.fresh')?.scrollIntoView({ block: 'nearest' });
    } catch (err) {
      createError = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }

  function actions(chat: SessionSummary) {
    return [
      { label: 'Rename…', run: () => (app.dialog = { kind: 'rename', session: chat }) },
      ...(chat.missing ? [{ label: 'Recreate folder', run: () => void app.restoreFolder(chat.sessionId) }] : []),
      { label: 'Change folder…', run: () => (app.dialog = { kind: 'move', session: chat }) },
      ...(chat.archived
        ? [{ label: 'Take out of archive', run: () => void app.archiveChat(chat.sessionId, false) }]
        : chat.missing
          ? []
          : [{ label: 'Archive', run: () => void app.archiveChat(chat.sessionId, true) }]),
      { label: 'Delete…', danger: true, run: () => (app.dialog = { kind: 'delete', session: chat }) },
    ];
  }
</script>

{#snippet folderIcon(withChats: boolean)}
  {#if withChats}
    <!-- A folder that chats work in: filled, with a speech bubble cut out of it. -->
    <svg class="icon chats" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        fill-rule="evenodd"
        d="M1.75 4.25c0-.7.55-1.25 1.25-1.25h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25v5.75c0 .7-.55 1.25-1.25 1.25H3c-.7 0-1.25-.55-1.25-1.25zM5.5 7a.75.75 0 0 0-.75.75v1.5c0 .41.34.75.75.75h.5v1l1.4-1h3.1c.41 0 .75-.34.75-.75v-1.5A.75.75 0 0 0 10.5 7z"
      />
    </svg>
  {:else}
    <svg class="icon" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true">
      <path d="M1.75 4.25c0-.7.55-1.25 1.25-1.25h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25v5.75c0 .7-.55 1.25-1.25 1.25H3c-.7 0-1.25-.55-1.25-1.25z" />
    </svg>
  {/if}
{/snippet}

{#snippet newFolderIcon()}
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M8 13H3c-.7 0-1.25-.55-1.25-1.25v-7.5C1.75 3.55 2.3 3 3 3h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25V8" />
    <path d="M12 10v4.5M9.75 12.25h4.5" />
  </svg>
{/snippet}

{#snippet chatRow(chat: SessionSummary, depth: number | null)}
  <li class="chat" class:active={chat.sessionId === app.sessionId} style:--depth={depth ?? 0} class:flat={depth === null}>
    <a
      href={`#/s/${chat.sessionId}`}
      aria-current={chat.sessionId === app.sessionId ? 'page' : undefined}
      title={`${chat.title}\nFolder: ${chat.folder}${chat.missing ? ' (deleted)' : ''} · ${ago(chat.lastModified)}`}
    >
      <span class="dot" class:busy={chat.running} aria-label={chat.running ? 'Working' : undefined}></span>
      <span class="label">{chat.title}</span>
      {#if depth === null}
        <span class="where" class:gone={chat.missing}>{chat.folder}</span>
        {#if chat.missing}<span class="tag" title="This chat's folder was deleted">deleted</span>{/if}
      {/if}
    </a>
    <span class="more"><ActionMenu label={`More for ${chat.title}`} actions={actions(chat)} chrome /></span>
  </li>
{/snippet}

{#snippet newFolderRow(depth: number)}
  <li class="new-folder" style:--depth={depth}>
    <form onsubmit={create}>
      {@render folderIcon(false)}
      <input
        type="text"
        aria-label={creating ? `New folder in ${creating}` : 'New folder'}
        placeholder="folder-name"
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
        maxlength="80"
        disabled={saving}
        bind:value={newName}
        onkeydown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            stopCreate();
          }
        }}
        onblur={() => {
          if (!newName.trim()) stopCreate();
        }}
      />
    </form>
    {#if createError}
      <p class="hint error" role="alert">{createError}</p>
    {:else if newPath}
      <p class="hint">data/sessions/{creating ? `${creating}/` : ''}<strong>{newPath}</strong> · Enter to create</p>
    {/if}
  </li>
{/snippet}

{#snippet folderRow(node: Node)}
  {@const open = isOpen(node)}
  {@const own = node.chats.length > 0}
  <li>
    <div
      class="folder"
      class:active={node.path === openFolder}
      class:fresh={node.path === fresh}
      class:quiet={node.total === 0}
      class:holds={own}
      style:--depth={node.depth}
    >
      <button
        class="name"
        aria-expanded={open}
        title={`data/sessions/${node.path}${own ? `\n${node.chats.length} chat${node.chats.length === 1 ? '' : 's'} work here` : ''}`}
        onclick={() => toggle(node)}
      >
        <svg class="chevron" class:open width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <path d="M3 1.5 7.5 5 3 8.5z" />
        </svg>
        {@render folderIcon(own)}
        <span class="label">{node.name}</span>
        {#if own}
          <span class="count" aria-label={`${node.chats.length} chats`}>{node.chats.length}</span>
        {:else if !open && node.total}
          <span class="count below" aria-label={`${node.total} chats in folders inside`}>{node.total}</span>
        {/if}
      </button>
      <button class="tool" aria-label={`New chat in ${node.path}`} title="New chat in this folder" onclick={() => void app.newSession(node.path)}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8.5 2.75H4A1.75 1.75 0 0 0 2.25 4.5v5.25c0 .97.78 1.75 1.75 1.75h1v2.25l3-2.25h3A1.75 1.75 0 0 0 12.75 9.75V7.5" />
          <path d="M12.25 1.5v4.5M10 3.75h4.5" />
        </svg>
      </button>
      <button class="tool" aria-label={`New folder in ${node.path}`} title="New folder inside this one" onclick={() => void startCreate(node.path)}>
        {@render newFolderIcon()}
      </button>
    </div>
    {#if open}
      <ul class="kids" style:--depth={node.depth}>
        {#each node.chats as chat (chat.sessionId)}
          {@render chatRow(chat, node.depth + 1)}
        {/each}
        {#if creating === node.path}
          {@render newFolderRow(node.depth + 1)}
        {/if}
        {#each node.children as child (child.path)}
          {@render folderRow(child)}
        {/each}
        {#if !node.chats.length && !node.children.length && creating !== node.path && !query}
          <li class="none" style:--depth={node.depth + 1}>No chats here yet</li>
        {/if}
      </ul>
    {/if}
  </li>
{/snippet}

<section>
  <div class="heading">
    <h2>Chats</h2>
  </div>

  <!-- Every chat folder lives in data/sessions, so the tree starts there. -->
  <ul class="tree">
    <li>
      <div class="folder root" class:quiet={tree.total === 0} style:--depth={-1}>
        <button
          class="name"
          aria-expanded={rootOpen}
          title={`data/sessions: every chat works in a folder in here${tree.total ? ` (${tree.total} chat${tree.total === 1 ? '' : 's'})` : ''}`}
          onclick={toggleRoot}
        >
          <svg class="chevron" class:open={rootOpen} width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
            <path d="M3 1.5 7.5 5 3 8.5z" />
          </svg>
          <svg class="icon" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true">
            <path d="M3.75 2.5h2.5l1.25 1.25h4.75c.55 0 1 .45 1 1v1" />
            <path d="M1.75 6.75c0-.55.45-1 1-1h3l1.25 1.25h6.25c.55 0 1 .45 1 1v4.75c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1z" />
          </svg>
          <span class="label"><span class="pre">data/</span>sessions</span>
          {#if !rootOpen && tree.total}
            <span class="count below" aria-label={`${tree.total} chats inside`}>{tree.total}</span>
          {/if}
        </button>
        <button class="tool shown" aria-label="New folder in data/sessions" title="New folder in data/sessions" onclick={() => void startCreate('')}>
          {@render newFolderIcon()}
        </button>
      </div>
      {#if rootOpen}
        <ul class="kids" style:--depth={-1}>
          {#if creating === ''}
            {@render newFolderRow(0)}
          {/if}
          {#each shown as node (node.path)}
            {@render folderRow(node)}
          {/each}
          {#if !shown.length && creating !== ''}
            <li class="none" style:--depth={0}>{query ? 'Nothing matches.' : 'No folders yet. Make one with the button on this row, or start a chat.'}</li>
          {/if}
        </ul>
      {/if}
    </li>
  </ul>

  {#if !query}
    <a class="new" href="#/new">
      <span class="plus" aria-hidden="true">+</span>
      <span class="label">New chat</span>
    </a>
  {/if}
</section>

{#if archived.length}
  <section>
    <button class="heading fold" aria-expanded={showArchived || query !== ''} onclick={() => (showArchived = !showArchived)}>
      <svg class="chevron" class:open={showArchived || query !== ''} width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
        <path d="M3 1.5 7.5 5 3 8.5z" />
      </svg>
      <h2>Archived</h2>
      <span class="count">{archived.length}</span>
    </button>
    {#if showArchived || query !== ''}
      <ul>
        {#each archived as chat (chat.sessionId)}
          {@render chatRow(chat, null)}
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  section + section {
    margin-top: 14px;
  }

  .heading {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 4px 8px;
  }

  .heading h2 {
    flex: 1;
  }

  h2 {
    margin: 0;
    color: var(--chrome-text);
    font-size: 15px;
    font-weight: 700;
  }

  button {
    border: 0;
    background: none;
    color: inherit;
    text-align: left;
  }

  .fold {
    width: 100%;
    border-radius: 6px;
  }

  .fold h2 {
    flex: none;
  }

  .fold:hover {
    background: var(--chrome-hover);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tree {
    margin-bottom: 4px;
  }

  /* Inside the tree everything sits one step in from data/sessions, the root row. */
  .tree .folder,
  .tree .chat,
  .tree .new-folder {
    --indent: calc(8px + (var(--depth, 0) + 1) * 14px);
  }

  .tree .none {
    padding-left: calc(8px + (var(--depth, 0) + 1) * 14px + 16px);
  }

  /* A thin line down from each open folder's arrow, along everything inside it. */
  .kids {
    position: relative;
  }

  .kids::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 6px;
    left: calc(8px + (var(--depth, 0) + 1) * 14px + 4.5px);
    border-left: 1px solid color-mix(in srgb, var(--chrome-text) 40%, transparent);
    pointer-events: none;
  }

  .folder.root {
    color: var(--chrome-strong);
  }

  .root .name {
    font-weight: 800;
  }

  .pre {
    color: var(--chrome-muted);
    font-weight: 500;
  }

  .folder,
  .chat {
    --indent: calc(8px + var(--depth, 0) * 14px);
    display: flex;
    align-items: center;
    border-radius: 6px;
  }

  .folder:hover,
  .folder:focus-within,
  .chat:hover,
  .chat:focus-within {
    background: var(--chrome-hover);
  }

  .folder {
    margin-top: 1px;
    color: var(--chrome-text);
    transition: background 0.4s;
  }

  /* Folders with no chats anywhere inside step back, so the ones that matter stand out. */
  .folder.quiet {
    color: var(--chrome-muted);
  }

  .folder.holds {
    color: var(--chrome-strong);
  }

  .folder.fresh {
    background: var(--chrome-tile);
  }

  .folder.active,
  .chat.active {
    background: var(--chrome-active);
    color: var(--chrome-active-text);
  }

  .name,
  .chat a {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    height: 28px;
    padding: 0 6px 0 var(--indent);
    border-radius: 6px;
    color: inherit;
    text-decoration: none;
  }

  .name {
    font-weight: 600;
  }

  .holds .name {
    font-weight: 700;
  }

  .name svg,
  .heading svg {
    flex: none;
  }

  /* A chat sits under its folder's name, in line with it. */
  .chat a {
    padding-left: calc(var(--indent) + 16px);
  }

  .chat.flat a {
    padding-left: 8px;
  }

  .chevron {
    opacity: 0.7;
    transition: transform 0.1s;
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .icon.chats {
    color: var(--presence);
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .where {
    flex: 0 1 auto;
    max-width: 45%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font: 11.5px var(--mono);
    opacity: 0.7;
  }

  .where.gone {
    text-decoration: line-through;
  }

  .tag {
    flex: none;
    padding: 0 5px;
    border: 1px solid currentColor;
    border-radius: 4px;
    font-size: 10.5px;
    line-height: 15px;
    opacity: 0.75;
  }

  .count {
    flex: none;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--chrome-hover);
    font-size: 11.5px;
    font-weight: 700;
    line-height: 17px;
  }

  .count.below {
    background: none;
    font-weight: 500;
    opacity: 0.8;
  }

  /* Where a person's presence would be: hollow when the chat is idle, lit while Claude is working in it. */
  .dot {
    flex: none;
    width: 9px;
    height: 9px;
    border: 1.5px solid currentColor;
    border-radius: 50%;
    opacity: 0.55;
  }

  /* In the tree the dots share the green of the chat folders, so chats are easy to spot. Archived ones stay quiet. */
  .chat:not(.flat) .dot {
    border-color: var(--presence);
    opacity: 1;
  }

  .dot.busy {
    border-color: var(--presence);
    background: var(--presence);
    opacity: 1;
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }

  .tool,
  .more {
    display: none;
    flex: none;
  }

  .tool {
    place-items: center;
    width: 24px;
    height: 24px;
    margin-right: 2px;
    padding: 0;
    border-radius: 4px;
    color: var(--chrome-text);
  }

  .tool:hover {
    background: var(--chrome-tile);
    color: var(--chrome-strong);
  }

  .tool.shown,
  .folder:hover .tool,
  .folder:focus-within .tool {
    display: grid;
  }

  .more {
    margin-right: 3px;
  }

  .chat:hover .more,
  .chat:focus-within .more,
  .more:has(:global([aria-expanded='true'])) {
    display: flex;
  }

  .new-folder {
    --indent: calc(8px + var(--depth, 0) * 14px);
    padding: 2px 4px 4px calc(var(--indent) + 16px);
    color: var(--chrome-text);
  }

  .new-folder form {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .new-folder input {
    flex: 1;
    min-width: 0;
    height: 26px;
    padding: 0 7px;
    border: 1px solid var(--chrome-tile);
    border-radius: 5px;
    background: var(--chrome-field);
    color: var(--chrome-strong);
    font: 13px var(--mono);
  }

  .hint {
    margin: 3px 0 0 21px;
    overflow-wrap: anywhere;
    font: 11.5px var(--mono);
    opacity: 0.75;
  }

  .hint strong {
    color: var(--chrome-strong);
  }

  .hint.error {
    font-family: inherit;
    font-size: 12.5px;
    opacity: 1;
  }

  .none {
    margin: 0;
    padding: 4px 8px 4px calc(8px + var(--depth, 0) * 14px + 16px);
    font-size: 13px;
    opacity: 0.6;
  }


  .new {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    margin-top: 6px;
    padding: 0 8px;
    border-radius: 6px;
    color: inherit;
    text-decoration: none;
  }

  .new:hover {
    background: var(--chrome-hover);
  }

  .plus {
    display: grid;
    place-items: center;
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: var(--chrome-hover);
    font-size: 16px;
  }

  @media (max-width: 820px), (pointer: coarse) {
    .name,
    .chat a,
    .new {
      height: 36px;
    }

    .new-folder input {
      height: 34px;
      font-size: 16px;
    }

    /* Nothing hovers on a touch screen, so the buttons are always there. */
    .tool {
      display: grid;
    }

    .more {
      display: flex;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot.busy {
      animation: none;
    }

    .folder {
      transition: none;
    }
  }
</style>
