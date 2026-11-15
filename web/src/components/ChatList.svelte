<script lang="ts">
  import type { SessionSummary } from '../../../shared/protocol';
  import { ago } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import ActionMenu from './ActionMenu.svelte';

  // The chats in the sidebar, each under the folder it works in.
  type Group = { folder: string; chats: SessionSummary[]; recent: number };

  const COLLAPSED_KEY = 'clack.collapsed';

  function savedCollapsed(): Record<string, boolean> {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? 'null') as Record<string, boolean> | null;
      if (saved && typeof saved === 'object') return saved;
    } catch {
      // Nothing saved: every folder starts unfolded.
    }
    return {};
  }

  /** Folders folded shut, by name. Remembered by this browser. */
  let collapsed = $state(savedCollapsed());
  let showArchived = $state(false);

  function toggle(folder: string) {
    if (collapsed[folder]) delete collapsed[folder];
    else collapsed[folder] = true;
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch {
      // Not remembered this time.
    }
  }

  const query = $derived(app.search.trim().toLowerCase());
  const openFolder = $derived(app.route.name === 'new' ? app.route.folder : undefined);

  const groups = $derived.by(() => {
    const byFolder = new Map<string, Group>();
    for (const folder of app.folders) byFolder.set(folder.name, { folder: folder.name, chats: [], recent: folder.modified });
    for (const chat of app.sessions) {
      if (chat.archived) continue;
      let group = byFolder.get(chat.folder);
      if (!group) byFolder.set(chat.folder, (group = { folder: chat.folder, chats: [], recent: 0 }));
      group.chats.push(chat);
    }
    const out: Group[] = [];
    for (const group of byFolder.values()) {
      // The folder with the most recent conversation comes first; one without chats goes by when it was last touched.
      if (group.chats.length) group.recent = Math.max(...group.chats.map((chat) => chat.lastModified));
      if (!query) out.push(group);
      else if (group.folder.toLowerCase().includes(query)) out.push(group);
      else {
        const chats = group.chats.filter((chat) => chat.title.toLowerCase().includes(query));
        if (chats.length) out.push({ ...group, chats });
      }
    }
    return out.sort((a, b) => Number(b.chats.length > 0) - Number(a.chats.length > 0) || b.recent - a.recent);
  });

  const archived = $derived(
    app.sessions.filter((chat) => chat.archived && (!query || `${chat.title} ${chat.folder}`.toLowerCase().includes(query))),
  );

  function actions(chat: SessionSummary) {
    return [
      { label: 'Rename…', run: () => (app.dialog = { kind: 'rename', session: chat }) },
      { label: 'Change folder…', run: () => (app.dialog = { kind: 'move', session: chat }) },
      chat.archived
        ? { label: 'Take out of archive', run: () => void app.archiveChat(chat.sessionId, false) }
        : { label: 'Archive', run: () => void app.archiveChat(chat.sessionId, true) },
      { label: 'Delete…', danger: true, run: () => (app.dialog = { kind: 'delete', session: chat }) },
    ];
  }
</script>

{#snippet row(chat: SessionSummary, withFolder: boolean)}
  <li class="chat" class:active={chat.sessionId === app.sessionId}>
    <a
      href={`#/s/${chat.sessionId}`}
      aria-current={chat.sessionId === app.sessionId ? 'page' : undefined}
      title={`${chat.title}\nFolder: ${chat.folder} · ${ago(chat.lastModified)}`}
    >
      <span class="dot" class:busy={chat.running} aria-label={chat.running ? 'Working' : undefined}></span>
      <span class="label">{chat.title}</span>
      {#if withFolder}<span class="where">{chat.folder}</span>{/if}
    </a>
    <span class="more"><ActionMenu label={`More for ${chat.title}`} actions={actions(chat)} chrome /></span>
  </li>
{/snippet}

<section>
  <div class="heading">
    <h2>Chats</h2>
  </div>

  {#each groups as group (group.folder)}
    {@const open = !collapsed[group.folder] || query !== ''}
    <div class="folder" class:active={group.folder === openFolder}>
      <button class="name" aria-expanded={open} title={`Chats that work in data/sessions/${group.folder}`} onclick={() => toggle(group.folder)}>
        <svg class="chevron" class:open width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <path d="M3 1.5 7.5 5 3 8.5z" />
        </svg>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true">
          <path d="M1.75 4.25c0-.7.55-1.25 1.25-1.25h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25v5.75c0 .7-.55 1.25-1.25 1.25H3c-.7 0-1.25-.55-1.25-1.25z" />
        </svg>
        <span class="label">{group.folder}</span>
        {#if !open && group.chats.length}<span class="count">{group.chats.length}</span>{/if}
      </button>
      <a class="add" href={`#/new/${group.folder}`} aria-label={`New chat in ${group.folder}`} title="New chat in this folder">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
          <path d="M8 3v10M3 8h10" />
        </svg>
      </a>
    </div>
    {#if open}
      <ul>
        {#each group.chats as chat (chat.sessionId)}
          {@render row(chat, false)}
        {:else}
          <li class="none">No chats here yet</li>
        {/each}
      </ul>
    {/if}
  {:else}
    <p class="none">{query ? 'Nothing matches.' : 'No chats yet.'}</p>
  {/each}

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
      <ul class="flat">
        {#each archived as chat (chat.sessionId)}
          {@render row(chat, true)}
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
    padding: 4px 8px;
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

  .fold:hover {
    background: var(--chrome-hover);
  }

  ul {
    margin: 0 0 4px;
    padding: 0;
    list-style: none;
  }

  .folder,
  .chat {
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
    margin-top: 2px;
    color: var(--chrome-text);
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
    gap: 7px;
    flex: 1;
    min-width: 0;
    height: 28px;
    padding: 0 6px 0 8px;
    border-radius: 6px;
    color: inherit;
    text-decoration: none;
  }

  .name {
    font-weight: 700;
  }

  .name svg,
  .heading svg {
    flex: none;
  }

  /* A chat sits under its folder's name, in line with it. */
  .chat a {
    padding-left: 25px;
  }

  .flat .chat a {
    padding-left: 8px;
  }

  .chevron {
    opacity: 0.7;
    transition: transform 0.1s;
  }

  .chevron.open {
    transform: rotate(90deg);
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

  .count {
    flex: none;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--chrome-hover);
    font-size: 11.5px;
    font-weight: 700;
    line-height: 17px;
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

  .add,
  .more {
    display: none;
    flex: none;
    margin-right: 3px;
  }

  .add {
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    color: inherit;
  }

  .add:hover {
    background: var(--chrome-tile);
  }

  .folder:hover .add,
  .folder:focus-within .add {
    display: grid;
  }

  .chat:hover .more,
  .chat:focus-within .more,
  .more:has(:global([aria-expanded='true'])) {
    display: flex;
  }

  .none {
    margin: 0;
    padding: 4px 8px 4px 25px;
    font-size: 13px;
    opacity: 0.6;
  }

  p.none {
    padding-left: 8px;
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

    /* Nothing hovers on a touch screen, so the buttons are always there. */
    .add {
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
  }
</style>
