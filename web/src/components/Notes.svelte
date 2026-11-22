<script lang="ts">
  import { untrack } from 'svelte';
  import { ago, fullDate } from '../lib/format';
  import { countUnder, flatten, noteHref, notes, parentOf } from '../lib/notes.svelte';
  import { app } from '../lib/state.svelte';
  import ActionMenu from './ActionMenu.svelte';
  import CopyButton from './CopyButton.svelte';
  import NoteEditor from './NoteEditor.svelte';
  import NotePreview from './NotePreview.svelte';

  // The Notes page: one note to write in and read, or, with none picked, the
  // notes edited most recently.
  let { onmenu }: { onmenu: () => void } = $props();

  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? '⌘' : 'Ctrl+';

  const path = $derived(app.route.name === 'notes' ? app.route.path : '');
  const node = $derived(path ? notes.find(path) : undefined);
  /** The notes above this one, for the trail at the top. */
  const trail = $derived(
    path
      .split('/')
      .slice(0, -1)
      .map((title, i, parts) => ({ title, path: parts.slice(0, i + 1).join('/') })),
  );
  const words = $derived(notes.text.match(/\S+/g)?.length ?? 0);
  const recent = $derived(
    flatten(notes.tree)
      .map(({ node }) => node)
      .sort((a, b) => b.modified - a.modified)
      .slice(0, 12),
  );

  let titleField = $state<HTMLInputElement>();
  let editor = $state<HTMLTextAreaElement>();
  /** The title as typed; follows the note until it is edited. */
  let title = $derived(notes.note?.title ?? '');

  $effect(() => {
    if (!notes.loaded) untrack(() => void notes.load());
  });

  $effect(() => {
    const open = path || null;
    untrack(() => void notes.open(open));
  });

  // A note just made starts in its title, selected, so typing names it.
  $effect(() => {
    if (notes.focusTitle !== null && notes.focusTitle === notes.note?.path && titleField) {
      notes.focusTitle = null;
      titleField.focus();
      titleField.select();
    }
  });

  function commitTitle() {
    const note = notes.note;
    if (!note) return;
    const wanted = title.trim();
    if (!wanted) title = note.title;
    else if (wanted !== note.title) void notes.rename(note.path, wanted);
  }

  function titleKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTitle();
      // On to the text, as in any editor: name it, then write.
      if (notes.mode === 'edit') {
        editor?.focus();
        editor?.setSelectionRange(0, 0);
      } else {
        titleField?.blur();
      }
    } else if (event.key === 'Escape') {
      title = notes.note?.title ?? '';
      titleField?.blur();
    }
  }

  function shortcut(event: KeyboardEvent) {
    if (!notes.note || !(mac ? event.metaKey : event.ctrlKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key === 's') {
      // Saved anyway a moment after typing; this is for the habit, and for right now.
      event.preventDefault();
      void notes.save();
    } else if (key === 'e') {
      event.preventDefault();
      toggleMode();
    }
  }

  function toggleMode() {
    notes.setMode(notes.mode === 'edit' ? 'preview' : 'edit');
    if (notes.mode === 'edit') queueMicrotask(() => editor?.focus());
  }

  const actions = $derived(
    node
      ? [
          { label: 'New sub-note', run: () => void notes.create(node.path) },
          {
            label: 'Rename',
            run: () => {
              titleField?.focus();
              titleField?.select();
            },
          },
          { label: 'Move to…', run: () => (notes.moving = node) },
          { label: 'Export as Markdown', run: () => void notes.download(node.path, false) },
          ...(node.children.length ? [{ label: 'Export with sub-notes (.zip)', run: () => void notes.download(node.path, true) }] : []),
          { label: 'Delete…', run: () => (notes.deleting = node), danger: true },
        ]
      : [],
  );

  const status = $derived(
    notes.saveError
      ? { text: 'Not saved', kind: 'bad' }
      : notes.conflict
        ? { text: 'Changed elsewhere', kind: 'bad' }
        : notes.saving || notes.dirty
          ? { text: 'Saving…', kind: 'busy' }
          : { text: 'Saved', kind: 'good' },
  );
</script>

<svelte:window onkeydown={shortcut} />

<header class="pane-bar">
  <button class="icon-btn menu" aria-label="Open menu" onclick={onmenu}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  </button>
  {#if path}
    <nav class="trail" aria-label="Where this note is">
      <a href="#/notes">Notes</a>
      {#each trail as step (step.path)}
        <span class="sep" aria-hidden="true">/</span>
        <a href={noteHref(step.path)}>{step.title}</a>
      {/each}
      <span class="sep" aria-hidden="true">/</span>
      <h1>{notes.note?.title ?? path.slice(path.lastIndexOf('/') + 1)}</h1>
    </nav>
    {#if notes.note}
      <span class="status {status.kind}" title={notes.note.modified ? `Saved ${fullDate(notes.note.modified)}` : undefined} role="status">
        <span class="dot"></span><span class="said">{status.text}</span>
      </span>
      <div class="modes" role="group" aria-label="Show the note as">
        <button class:on={notes.mode === 'edit'} aria-pressed={notes.mode === 'edit'} title={`Write (${mod}E)`} onclick={() => notes.mode !== 'edit' && toggleMode()}>
          Edit
        </button>
        <button class:on={notes.mode === 'preview'} aria-pressed={notes.mode === 'preview'} title={`Preview (${mod}E)`} onclick={() => notes.mode !== 'preview' && toggleMode()}>
          Preview
        </button>
      </div>
      <CopyButton text={() => notes.text} label="Copy the note as markdown" />
      <ActionMenu label="More for this note" {actions} />
    {/if}
  {:else}
    <h1>Notes</h1>
    <span class="grow"></span>
    {#if notes.tree.length}
      <button class="btn ghost" onclick={() => void notes.download('', true)}>Export all (.zip)</button>
    {/if}
    <button class="btn primary" onclick={() => void notes.create()}>New note</button>
  {/if}
</header>

{#if notes.error}
  <p class="banner bad" role="alert">
    <span>{notes.error}</span>
    <button class="btn ghost" onclick={() => (notes.error = null)}>Dismiss</button>
  </p>
{/if}
{#if notes.conflict}
  <div class="banner warn" role="alert">
    <span><strong>This note was changed somewhere else</strong> (another browser, or an editor on the server) while you were writing here.</span>
    <span class="choices">
      <button class="btn" onclick={() => notes.takeTheirs()}>Use the other version</button>
      <button class="btn primary" onclick={() => notes.keepMine()}>Keep mine</button>
    </span>
  </div>
{:else if notes.saveError && path}
  <p class="banner bad" role="alert">
    <span>{notes.saveError}</span>
    {#if notes.note}<button class="btn" onclick={() => void notes.save()}>Try again</button>{/if}
  </p>
{/if}

<div class="scroll">
  {#if path}
    {#if notes.missing}
      <div class="sheet empty">
        <h2>This note does not exist any more</h2>
        <p>It may have been deleted or renamed in another browser.</p>
        <a class="btn" href="#/notes">Back to notes</a>
      </div>
    {:else if notes.note}
      <article class="sheet">
        <input
          class="title"
          bind:this={titleField}
          bind:value={title}
          aria-label="Title"
          placeholder="Untitled"
          maxlength="120"
          spellcheck="false"
          onkeydown={titleKey}
          onblur={commitTitle}
        />
        <p class="meta">
          {#if notes.note.modified}<span title={fullDate(notes.note.modified)}>Edited {ago(notes.note.modified) === 'now' ? 'just now' : `${ago(notes.note.modified)} ago`}</span> ·{/if}
          {words === 1 ? '1 word' : `${words.toLocaleString()} words`}
          {#if node?.children.length}· {countUnder(node) === 1 ? '1 sub-note' : `${countUnder(node)} sub-notes`}{/if}
        </p>
        {#if notes.mode === 'edit'}
          <NoteEditor
            bind:editor
            value={notes.text}
            oninput={(text) => notes.edit(text)}
            placeholder={'Start writing. Markdown works here: # headings, - lists, - [ ] tasks, **bold**, `code`…'}
          />
        {:else}
          <NotePreview text={notes.text} ontoggle={(text) => notes.edit(text)} />
        {/if}

        <section class="subs" aria-label="Sub-notes">
          {#if node?.children.length}
            <h2>Sub-notes</h2>
            <ul>
              {#each node.children as child (child.path)}
                <li>
                  <a href={noteHref(child.path)}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
                      <path d="M4 1.75h5l3.25 3.25v8.25c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1v-10.5c0-.55.45-1 1-1z" />
                      <path d="M5.5 8h5M5.5 10.5h3.5" />
                    </svg>
                    <span class="name">{child.title}</span>
                    {#if child.children.length}<span class="under">{countUnder(child)} inside</span>{/if}
                    {#if child.modified}<time title={fullDate(child.modified)}>{ago(child.modified)}</time>{/if}
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
          <button class="add" onclick={() => void notes.create(notes.note!.path)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
            Add a sub-note
          </button>
        </section>
      </article>
    {:else if notes.loading}
      <div class="sheet"><span class="spinner"></span></div>
    {/if}
  {:else if !notes.loaded}
    <div class="sheet"><span class="spinner"></span></div>
  {:else if !notes.tree.length}
    <div class="sheet empty start">
      <span class="art" aria-hidden="true">
        <svg width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 6h15l9 9v25a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
          <path d="M28 6v9h9M17 24h14M17 30h14M17 36h8" />
        </svg>
      </span>
      <h2>Write things down</h2>
      <p>
        Notes are markdown files, kept on the server in <code>data/notes</code>. Put notes inside notes to keep them in
        order, and export one as <code>.md</code> or a whole branch as <code>.zip</code> whenever you want them elsewhere.
      </p>
      <button class="btn primary" onclick={() => void notes.create()}>New note</button>
    </div>
  {:else}
    <div class="sheet">
      <h2 class="heading">Recently edited</h2>
      <ul class="recent">
        {#each recent as item (item.path)}
          <li>
            <a href={noteHref(item.path)}>
              <span class="name">{item.title}</span>
              {#if parentOf(item.path)}<span class="where">{parentOf(item.path).split('/').join(' / ')}</span>{/if}
              {#if item.modified}<time title={fullDate(item.modified)}>{ago(item.modified)}</time>{/if}
            </a>
          </li>
        {/each}
      </ul>
      <p class="tips">
        Drag notes in the sidebar to put one inside another. In a note, {mod}E switches between writing and the preview,
        and changes are saved as you type.
      </p>
    </div>
  {/if}
</div>

<style>
  .trail {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .trail a {
    flex: 0 1 auto;
    min-width: 2ch;
    overflow: hidden;
    color: var(--muted);
    text-decoration: none;
    text-overflow: ellipsis;
  }

  .trail a:hover {
    color: var(--text);
    text-decoration: underline;
  }

  .trail h1 {
    flex: 0 1 auto;
    min-width: 4ch;
    font-size: 16px;
  }

  .sep {
    flex: none;
    color: var(--muted);
    opacity: 0.6;
  }

  .grow {
    flex: 1;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
    color: var(--muted);
    font-size: 12.5px;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--presence);
  }

  .status.busy .dot {
    background: var(--muted);
    animation: breathe 1s ease-in-out infinite alternate;
  }

  .status.bad {
    color: var(--danger);
  }

  .status.bad .dot {
    background: var(--danger);
  }

  @keyframes breathe {
    to {
      opacity: 0.3;
    }
  }

  .modes {
    display: inline-flex;
    flex: none;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--sunken);
  }

  .modes button {
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
  }

  .modes button:hover {
    color: var(--text);
  }

  .modes button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 2px rgb(0 0 0 / 14%);
  }

  .banner {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin: 0;
    padding: 8px 20px;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }

  .banner > span:first-child {
    flex: 1;
    min-width: 200px;
  }

  .banner.bad {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .banner.warn {
    background: var(--accent-soft);
  }

  .choices {
    display: flex;
    gap: 8px;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 28px 24px calc(48px + env(safe-area-inset-bottom));
  }

  .sheet {
    max-width: 760px;
    margin: 0 auto;
  }

  .title {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    outline: none;
    background: none;
    font-size: 30px;
    font-weight: 900;
    line-height: 1.2;
  }

  .title::placeholder {
    color: var(--muted);
    opacity: 0.6;
  }

  .meta {
    margin: 6px 0 22px;
    color: var(--muted);
    font-size: 12.5px;
  }

  .subs {
    display: grid;
    gap: 8px;
    margin-top: 36px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  .subs h2,
  .heading {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .subs ul,
  .recent {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .subs a,
  .recent a {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 4px 10px;
    border-radius: 6px;
    color: inherit;
    text-decoration: none;
  }

  .subs a:hover,
  .recent a:hover {
    background: var(--hover);
  }

  .subs svg {
    flex: none;
    color: var(--muted);
  }

  .name {
    min-width: 0;
    overflow: hidden;
    font-weight: 700;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .where,
  .under {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .subs a .name {
    flex: none;
    max-width: 70%;
  }

  .subs a:not(:has(.under)) .name {
    flex: 1;
  }

  time {
    flex: none;
    margin-left: auto;
    color: var(--muted);
    font-size: 12.5px;
  }

  .add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    justify-self: start;
    height: 32px;
    padding: 0 10px;
    border: 1px dashed var(--border-strong);
    border-radius: 6px;
    background: none;
    color: var(--muted);
    font-size: 13.5px;
    font-weight: 700;
  }

  .add:hover {
    border-style: solid;
    color: var(--text);
  }

  .heading {
    margin-bottom: 10px;
  }

  .recent a {
    padding-inline: 12px;
  }

  .tips {
    margin: 24px 12px 0;
    color: var(--muted);
    font-size: 13px;
  }

  .empty {
    display: grid;
    justify-items: start;
    gap: 12px;
  }

  .empty h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 900;
  }

  .empty p {
    margin: 0;
    max-width: 560px;
    color: var(--muted);
  }

  .empty code {
    padding: 0.1em 0.3em;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--sunken);
    font: 0.85em var(--mono);
  }

  .start {
    margin-top: 8vh;
  }

  .art {
    display: grid;
    place-items: center;
    width: 76px;
    height: 76px;
    border-radius: 20px;
    background: var(--accent-soft);
    color: var(--accent);
  }

  @media (max-width: 820px) {
    .scroll {
      padding: 20px 16px calc(40px + env(safe-area-inset-bottom));
    }

    .title {
      font-size: 24px;
    }

    /* Only the note's own name fits beside the buttons. */
    .trail a,
    .sep {
      display: none;
    }

    .said {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .status.busy .dot {
      animation: none;
    }
  }
</style>
