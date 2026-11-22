<script lang="ts">
  import type { NoteNode } from '../../../shared/protocol';
  import { noteHref, notes } from '../lib/notes.svelte';
  import { app } from '../lib/state.svelte';
  import ActionMenu from './ActionMenu.svelte';
  import NoteBranch from './NoteBranch.svelte';

  // One level of the notes tree in the sidebar. A note with sub-notes folds
  // open to another of these.
  let { nodes, depth, query }: { nodes: NoteNode[]; depth: number; query: string } = $props();

  const matches = (node: NoteNode): boolean => node.title.toLowerCase().includes(query) || node.children.some(matches);
  // Searching keeps a note when it or a note under it matches, and shows the way down to it.
  const shown = $derived(query ? nodes.filter(matches) : nodes);
  const indent = $derived(`${depth * 14}px`);
  const current = $derived(app.route.name === 'notes' ? app.route.path : null);

  /** The note a dragged one would be dropped under. */
  let over = $state<string | null>(null);
  let unfoldTimer: ReturnType<typeof setTimeout> | undefined;

  function actions(node: NoteNode) {
    return [
      { label: 'New sub-note', run: () => void notes.create(node.path) },
      { label: 'Rename', run: () => (notes.renaming = node.path) },
      { label: 'Move to…', run: () => (notes.moving = node) },
      { label: 'Export as Markdown', run: () => void notes.download(node.path, false) },
      ...(node.children.length ? [{ label: 'Export with sub-notes (.zip)', run: () => void notes.download(node.path, true) }] : []),
      { label: 'Delete…', run: () => (notes.deleting = node), danger: true },
    ];
  }

  function dragStart(event: DragEvent, node: NoteNode) {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', node.title);
    notes.dragging = node.path;
  }

  function dragOver(event: DragEvent, node: NoteNode) {
    if (!notes.canDrop(node.path)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (over !== node.path) {
      over = node.path;
      // Held over a folded note for a moment, it opens, to drop further down.
      clearTimeout(unfoldTimer);
      if (node.children.length && !notes.unfolded[node.path]) unfoldTimer = setTimeout(() => notes.toggleFold(node.path, true), 700);
    }
  }

  function dragLeave(event: DragEvent, node: NoteNode) {
    if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) return;
    if (over === node.path) over = null;
    clearTimeout(unfoldTimer);
  }

  function drop(event: DragEvent, node: NoteNode) {
    event.preventDefault();
    clearTimeout(unfoldTimer);
    const from = notes.dragging;
    const allowed = notes.canDrop(node.path);
    notes.dragging = null;
    over = null;
    if (from && allowed) void notes.move(from, node.path);
  }

  function dragEnd() {
    notes.dragging = null;
    over = null;
    clearTimeout(unfoldTimer);
  }

  function focusSelect(input: HTMLInputElement) {
    input.focus();
    input.select();
  }

  function finishRename(input: HTMLInputElement, node: NoteNode, keep: boolean) {
    if (notes.renaming !== node.path) return;
    notes.renaming = null;
    const title = input.value.trim();
    if (keep && title && title !== node.title) void notes.rename(node.path, title);
  }
</script>

<ul role={depth ? 'group' : undefined}>
  {#each shown as node (node.path)}
    {@const open = query ? true : notes.unfolded[node.path] === true}
    <li>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="row"
        class:active={current === node.path}
        class:over={over === node.path}
        class:dragged={notes.dragging === node.path}
        ondragover={(event) => dragOver(event, node)}
        ondragleave={(event) => dragLeave(event, node)}
        ondrop={(event) => drop(event, node)}
      >
        <span class="indent" style:width={indent}></span>
        {#if node.children.length}
          <button
            class="fold"
            aria-label={open ? `Hide the notes under ${node.title}` : `Show the notes under ${node.title}`}
            aria-expanded={open}
            onclick={() => notes.toggleFold(node.path)}
          >
            <svg class="chevron" class:open width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
              <path d="M3 1.5 7.5 5 3 8.5z" />
            </svg>
          </button>
        {:else}
          <span class="fold"></span>
        {/if}
        {#if notes.renaming === node.path}
          <span class="main">
            {@render icon(node)}
            <input
              class="rename"
              value={node.title}
              aria-label={`New name for ${node.title}`}
              maxlength="120"
              use:focusSelect
              onkeydown={(event) => {
                if (event.key === 'Enter') finishRename(event.currentTarget, node, true);
                else if (event.key === 'Escape') {
                  event.stopPropagation();
                  finishRename(event.currentTarget, node, false);
                }
              }}
              onblur={(event) => finishRename(event.currentTarget, node, true)}
            />
          </span>
        {:else}
          <a
            class="main"
            href={noteHref(node.path)}
            title={node.title}
            aria-current={current === node.path ? 'page' : undefined}
            draggable="true"
            ondragstart={(event) => dragStart(event, node)}
            ondragend={dragEnd}
            ondblclick={(event) => {
              event.preventDefault();
              notes.renaming = node.path;
            }}
          >
            {@render icon(node)}
            <span class="label">{node.title}</span>
            {#if node.children.length && !open}<span class="count">{node.children.length}</span>{/if}
          </a>
          <span class="acts">
            <button aria-label={`New note under ${node.title}`} title="New sub-note" onclick={() => void notes.create(node.path)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>
            <ActionMenu label={`More for ${node.title}`} actions={actions(node)} chrome />
          </span>
        {/if}
      </div>
      {#if open && node.children.length}
        <NoteBranch nodes={node.children} depth={depth + 1} {query} />
      {/if}
    </li>
  {/each}
</ul>

{#snippet icon(node: NoteNode)}
  <svg class="doc" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
    {#if node.children.length}
      <!-- A note with notes under it: a small stack. -->
      <path d="M5.5 1.75h4.25l2.75 2.75v7.25c0 .55-.45 1-1 1H5.5c-.55 0-1-.45-1-1v-9c0-.55.45-1 1-1z" />
      <path d="M2.75 4.5v8.25c0 .83.67 1.5 1.5 1.5h6" />
      <path d="M6.75 7h3.5M6.75 9.5h3.5" />
    {:else}
      <path d="M4 1.75h5l3.25 3.25v8.25c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1v-10.5c0-.55.45-1 1-1z" />
      <path d="M5.5 8h5M5.5 10.5h3.5" />
    {/if}
  </svg>
{/snippet}

<style>
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    border-radius: 6px;
  }

  .row:hover,
  .row:focus-within {
    background: var(--chrome-hover);
  }

  .row.active {
    background: var(--chrome-active);
    color: var(--chrome-active-text);
  }

  /* Where a dragged note would land. */
  .row.over {
    background: var(--chrome-hover);
    box-shadow: inset 0 0 0 2px var(--link);
  }

  .row.dragged {
    opacity: 0.5;
  }

  .indent {
    flex: none;
  }

  .fold {
    display: grid;
    place-items: center;
    flex: none;
    width: 20px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: inherit;
  }

  button.fold:hover {
    color: var(--chrome-strong);
  }

  .chevron {
    opacity: 0.7;
    transition: transform 0.1s;
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .main {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    height: 28px;
    padding-right: 8px;
    border-radius: 6px;
    color: inherit;
    text-decoration: none;
  }

  .doc {
    flex: none;
    opacity: 0.85;
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .count {
    flex: none;
    min-width: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--chrome-tile);
    font-size: 11px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    opacity: 0.85;
  }

  .rename {
    flex: 1;
    min-width: 0;
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--link);
    border-radius: 4px;
    background: var(--chrome-field);
    color: var(--chrome-strong);
    font-size: 14px;
  }

  .rename:focus {
    outline: none;
  }

  .acts {
    display: none;
    align-items: center;
    flex: none;
    gap: 1px;
    padding-right: 4px;
  }

  .row:hover .acts,
  .row:focus-within .acts {
    display: flex;
  }

  .row:hover .count,
  .row:focus-within .count {
    display: none;
  }

  .acts button {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: inherit;
  }

  .acts button:hover {
    background: var(--chrome-tile);
    color: var(--chrome-strong);
  }

  @media (max-width: 820px), (pointer: coarse) {
    .main,
    .fold {
      height: 36px;
    }

    .fold {
      width: 26px;
    }

    /* Nothing hovers on a touch screen, so the actions are always there. */
    .acts {
      display: flex;
    }

    .count {
      display: none;
    }

    .acts button,
    .acts :global(.trigger) {
      width: 32px;
      height: 32px;
    }
  }
</style>
