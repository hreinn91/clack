<script lang="ts">
  import { folderPath, providerName } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import Modal from './Modal.svelte';

  // The quick switcher: type a few letters, press Enter, and be in another
  // chat, a new chat, or another page.
  type Entry = { id: string; kind: 'chat' | 'new' | 'page'; label: string; hint?: string; run: () => void };

  let query = $state('');
  let at = $state(0);
  let list = $state<HTMLElement>();

  const PAGES: { label: string; hash: string }[] = [
    { label: 'Usage and limits', hash: '#/usage' },
    { label: 'Tools, skills and MCP servers', hash: '#/tools' },
    { label: 'Activity log', hash: '#/debug/log' },
    { label: 'Data and terminals', hash: '#/data' },
    { label: 'Theme', hash: '#/theme' },
  ];

  function go(hash: string) {
    location.hash = hash;
  }

  const slug = $derived(folderPath(query));

  const entries = $derived.by(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (text: string) => words.every((word) => text.toLowerCase().includes(word));
    const out: Entry[] = [];

    if (!words.length) out.push({ id: 'new', kind: 'new', label: 'New chat…', hint: 'Choose a folder', run: () => go('#/new') });

    // Chats in use first, most recent at the top; archived ones only when looked for.
    for (const session of app.sessions) {
      if (session.archived ? !words.length || !matches(`${session.title} ${session.folder}`) : !matches(`${session.title} ${session.folder}`)) continue;
      out.push({
        id: session.sessionId,
        kind: 'chat',
        label: session.title,
        hint: `${session.folder} · ${providerName(session.provider)}${session.archived ? ' · archived' : ''}`,
        run: () => go(`#/s/${session.sessionId}`),
      });
    }

    if (words.length) {
      for (const folder of app.pickableFolders) {
        if (!matches(folder.name) || folder.name === slug) continue;
        out.push({ id: `folder:${folder.name}`, kind: 'new', label: `New chat in ${folder.name}`, hint: 'Existing folder', run: () => void app.newSession(folder.name) });
      }
      if (slug) {
        const known = app.folders.some((folder) => folder.name === slug);
        out.push({ id: 'create', kind: 'new', label: `New chat in ${slug}`, hint: known ? 'Existing folder' : 'New folder', run: () => void app.newSession(slug) });
      }
      for (const page of PAGES) {
        if (matches(page.label)) out.push({ id: page.hash, kind: 'page', label: page.label, hint: 'Page', run: () => go(page.hash) });
      }
    } else {
      for (const page of PAGES) out.push({ id: page.hash, kind: 'page', label: page.label, hint: 'Page', run: () => go(page.hash) });
    }
    return out.slice(0, 60);
  });

  // A new search starts again from the best match.
  $effect(() => {
    query;
    at = 0;
  });

  $effect(() => {
    list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  });

  function close() {
    app.paletteOpen = false;
  }

  function choose(entry: Entry | undefined) {
    if (!entry) return;
    close();
    entry.run();
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (entries.length) at = (at + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
    } else if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      choose(entries[at]);
    }
  }
</script>

<Modal title="Go to a chat" onclose={close} top width={620}>
  <label class="field">
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13.2 13.2 17 17" />
    </svg>
    <input
      type="text"
      placeholder="Go to a chat, or name a folder to start one in"
      aria-label="Go to a chat, or name a folder to start one in"
      role="combobox"
      aria-expanded="true"
      aria-controls="palette-list"
      aria-activedescendant={entries[at] ? `palette-${at}` : undefined}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      bind:value={query}
      {onkeydown}
    />
  </label>

  <ul id="palette-list" role="listbox" bind:this={list}>
    {#each entries as entry, index (entry.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li id={`palette-${index}`} role="option" aria-selected={index === at} onpointermove={() => (at = index)} onclick={() => choose(entry)}>
        <span class="icon" aria-hidden="true">
          {#if entry.kind === 'chat'}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z" /></svg>
          {:else if entry.kind === 'new'}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3v10M3 8h10" /></svg>
          {:else}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
          {/if}
        </span>
        <span class="label">{entry.label}</span>
        {#if entry.hint}<span class="hint">{entry.hint}</span>{/if}
      </li>
    {:else}
      <li class="none">Nothing matches.</li>
    {/each}
  </ul>

  <p class="keys"><kbd>↑</kbd><kbd>↓</kbd> to move <kbd>↵</kbd> to open <kbd>esc</kbd> to close</p>
</Modal>

<style>
  .field {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    border-bottom: 1px solid var(--border);
    color: var(--muted);
  }

  input {
    flex: 1;
    min-width: 0;
    height: 52px;
    padding: 0;
    border: 0;
    outline: 0;
    background: none;
    color: var(--text);
    font-size: 17px;
  }

  ul {
    min-height: 0;
    max-height: min(52vh, 440px);
    margin: 0;
    padding: 6px;
    overflow-y: auto;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
  }

  li[aria-selected='true'] {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .icon {
    display: grid;
    flex: none;
    opacity: 0.75;
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .hint {
    flex: none;
    max-width: 45%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 12.5px;
    opacity: 0.7;
  }

  .none {
    color: var(--muted);
    cursor: default;
  }

  .keys {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 0;
    padding: 8px 16px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 12.5px;
  }

  kbd {
    min-width: 20px;
    padding: 0 5px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--sunken);
    font: 11.5px var(--font);
    text-align: center;
  }

  kbd:not(:first-child):not(kbd + kbd) {
    margin-left: 10px;
  }
</style>
