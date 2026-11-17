<script lang="ts">
  import type { FolderInfo } from '../../../shared/protocol';
  import { ago, folderPath } from '../lib/format';
  import { fuzzyMatch } from '../lib/fuzzy';
  import { app } from '../lib/state.svelte';

  // A search box over every folder under data/sessions, fuzzy like fzf: type
  // a few letters of a path ("wca" for work/client-a) and pick with the arrow
  // keys and Enter, or the pointer. A name that matches nothing can be made.

  let {
    current,
    allowCreate = true,
    busy = false,
    action = 'Pick',
    placeholder = 'Find a folder',
    initial = '',
    onpick,
  }: {
    /** The folder the chat works in now, marked and not offered again. */
    current?: string;
    /** Offer to create the typed name when it is not a folder yet. */
    allowCreate?: boolean;
    busy?: boolean;
    /** What picking does, shown on the chosen row ("Move here", "Start chat"). */
    action?: string;
    placeholder?: string;
    /** What the search box starts with. */
    initial?: string;
    onpick: (path: string, created: boolean) => void;
  } = $props();

  type Piece = { text: string; hit: boolean; parent: boolean };
  type Row = { path: string; pieces: Piece[]; meta: string; isNew: boolean; here: boolean };

  // svelte-ignore state_referenced_locally
  let query = $state(initial);
  let active = $state(0);
  let list = $state<HTMLElement>();
  const uid = `finder-${Math.random().toString(36).slice(2, 8)}`;
  const LIMIT = 50;

  /** Chats per folder, so a row can say how busy the folder is. */
  const counts = $derived.by(() => {
    const map = new Map<string, number>();
    for (const chat of app.sessions) if (!chat.archived && !chat.missing) map.set(chat.folder, (map.get(chat.folder) ?? 0) + 1);
    return map;
  });

  /** The path cut into runs: letters that matched stand out, and the part before the last "/" steps back. */
  function pieces(path: string, positions: number[]): Piece[] {
    const hits = new Set(positions);
    const parentEnd = path.lastIndexOf('/') + 1;
    const out: Piece[] = [];
    for (let i = 0; i < path.length; i++) {
      const hit = hits.has(i);
      const parent = i < parentEnd;
      const last = out.at(-1);
      if (last && last.hit === hit && last.parent === parent) last.text += path[i];
      else out.push({ text: path[i]!, hit, parent });
    }
    return out;
  }

  function row(folder: FolderInfo, positions: number[]): Row {
    const chats = counts.get(folder.name) ?? 0;
    return {
      path: folder.name,
      pieces: pieces(folder.name, positions),
      meta: chats ? `${chats} chat${chats === 1 ? '' : 's'}` : ago(folder.modified),
      isNew: false,
      here: folder.name === current,
    };
  }

  const rows = $derived.by(() => {
    const typed = query.trim();
    if (!typed) return app.pickableFolders.slice(0, LIMIT).map((folder) => row(folder, []));
    const matches = app.folders
      .map((folder) => ({ folder, match: fuzzyMatch(typed, folder.name) }))
      .filter((entry) => entry.match !== null)
      .sort((a, b) => b.match!.score - a.match!.score || b.folder.modified - a.folder.modified)
      .slice(0, LIMIT);
    const ranked = matches.map((entry) => row(entry.folder, entry.match!.positions));
    const slug = folderPath(typed);
    if (allowCreate && slug && !app.folders.some((folder) => folder.name === slug)) {
      const create: Row = { path: slug, pieces: pieces(slug, []), meta: 'New folder', isNew: true, here: false };
      // A good match has its letters in runs or at the starts of words (about 3 points a letter or more).
      // Without one, the typed name is more likely a new folder, so making it comes first.
      const strong = (matches[0]?.match!.score ?? 0) >= typed.replace(/\s+/g, '').length * 3;
      return strong ? [...ranked, create] : [create, ...ranked];
    }
    return ranked;
  });

  // A new search starts again at the top, on the first row that can be picked.
  $effect(() => {
    query;
    active = Math.max(0, rows.findIndex((entry) => !entry.here));
  });

  function pick(target: Row | undefined) {
    if (!target || busy || target.here) return;
    onpick(target.path, target.isNew);
  }

  function move(step: number) {
    if (!rows.length) return;
    active = (active + step + rows.length) % rows.length;
    list?.querySelector<HTMLElement>(`#${uid}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(rows[active]);
    }
  }
</script>

<div class="finder">
  <label class="field">
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
    <input
      type="text"
      role="combobox"
      aria-label="Folder"
      aria-expanded="true"
      aria-controls={`${uid}-list`}
      aria-autocomplete="list"
      aria-activedescendant={rows[active] ? `${uid}-${active}` : undefined}
      {placeholder}
      autocapitalize="off"
      autocomplete="off"
      spellcheck="false"
      maxlength="200"
      data-autofocus
      disabled={busy}
      bind:value={query}
      {onkeydown}
    />
  </label>

  <ul id={`${uid}-list`} role="listbox" aria-label="Folders" bind:this={list}>
    {#each rows as entry, index (`${entry.isNew ? '+' : ''}${entry.path}`)}
      <!-- The keyboard stays in the search box; a row only needs the pointer. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        id={`${uid}-${index}`}
        role="option"
        aria-selected={index === active}
        aria-disabled={entry.here}
        class:active={index === active}
        class:new={entry.isNew}
        class:here={entry.here}
        onpointermove={() => (active = index)}
        onclick={() => pick(entry)}
      >
        {#if entry.isNew}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 13H3c-.7 0-1.25-.55-1.25-1.25v-7.5C1.75 3.55 2.3 3 3 3h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25V8" />
            <path d="M12 10v4.5M9.75 12.25h4.5" />
          </svg>
          <span class="path"><span class="verb">Create</span> {entry.path}</span>
        {:else}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true">
            <path d="M1.75 4.25c0-.7.55-1.25 1.25-1.25h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25v5.75c0 .7-.55 1.25-1.25 1.25H3c-.7 0-1.25-.55-1.25-1.25z" />
          </svg>
          <span class="path">
            {#each entry.pieces as piece, i (i)}<span class:hit={piece.hit} class:parent={piece.parent}>{piece.text}</span>{/each}
          </span>
        {/if}
        <span class="meta">
          {#if entry.here}
            Works here now
          {:else if index === active}
            <span class="go">{entry.isNew ? `${action} · new` : action} ↵</span>
          {:else}
            {entry.meta}
          {/if}
        </span>
      </li>
    {:else}
      <li class="none" role="presentation">{query.trim() ? 'No folder matches.' : 'No folders yet.'}</li>
    {/each}
  </ul>

  <p class="keys">
    Letters in order, gaps allowed: <kbd>wca</kbd> finds <code>work/client-a</code>. <kbd>↑</kbd><kbd>↓</kbd> to choose,
    <kbd>Enter</kbd> to pick{allowCreate ? ', or type a new name to create it' : ''}.
  </p>
</div>

<style>
  .finder {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 0 12px;
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    background: var(--bg);
    color: var(--muted);
  }

  .field:focus-within {
    border-color: var(--accent);
    outline: 2px solid var(--accent-soft);
  }

  input {
    flex: 1;
    min-width: 0;
    height: 40px;
    padding: 0;
    border: 0;
    outline: none;
    background: none;
    color: var(--text);
    font: 15px var(--mono);
  }

  ul {
    display: grid;
    gap: 1px;
    max-height: min(320px, 45dvh);
    margin: 0;
    padding: 4px;
    overflow-y: auto;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  li {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 36px;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
  }

  li svg {
    flex: none;
    color: var(--muted);
  }

  li.active {
    background: var(--accent-soft);
  }

  li.active svg,
  li.new svg {
    color: var(--accent);
  }

  li.here {
    cursor: default;
    opacity: 0.6;
  }

  li.none {
    color: var(--muted);
    cursor: default;
  }

  .path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font: 14px var(--mono);
  }

  .parent {
    color: var(--muted);
  }

  .hit {
    color: var(--text);
    font-weight: 800;
    text-decoration: underline;
    text-decoration-color: var(--accent);
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
  }

  .verb {
    color: var(--accent);
    font-family: var(--font);
    font-weight: 700;
  }

  .meta {
    flex: none;
    color: var(--muted);
    font-size: 12.5px;
  }

  .go {
    color: var(--accent);
    font-weight: 700;
  }

  .keys {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  kbd,
  code {
    padding: 0 4px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--sunken);
    font: 11.5px var(--mono);
  }

  kbd + kbd {
    margin-left: 2px;
  }
</style>
