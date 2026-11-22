<script lang="ts">
  import type { NoteNode } from '../../../shared/protocol';
  import { within } from '../lib/format';
  import { countUnder, flatten, notes, parentOf } from '../lib/notes.svelte';
  import Modal from './Modal.svelte';

  // The questions a note can raise: whether to delete it, and where to move it.

  let busy = $state(false);
  let filter = $state('');

  const deleting = $derived(notes.deleting);
  const moving = $derived(notes.moving);
  const under = $derived(deleting ? countUnder(deleting) : 0);

  /** Every place the note being moved can go: not into itself or a note under it. */
  const places = $derived.by(() => {
    if (!moving) return [];
    const query = filter.trim().toLowerCase();
    return flatten(notes.tree).filter(
      ({ node }) => !within(node.path, moving.path) && (!query || node.path.toLowerCase().includes(query)),
    );
  });

  async function remove(event: SubmitEvent) {
    event.preventDefault();
    if (!deleting) return;
    busy = true;
    await notes.remove(deleting.path);
    busy = false;
    notes.deleting = null;
  }

  async function moveTo(parent: string) {
    if (!moving) return;
    busy = true;
    await notes.move(moving.path, parent);
    busy = false;
    closeMove();
  }

  function closeMove() {
    notes.moving = null;
    filter = '';
  }
</script>

{#snippet place(label: string, path: string, depth: number, node?: NoteNode)}
  {@const here = moving !== null && parentOf(moving.path) === path}
  <li>
    <button type="button" class="place" style:padding-left={`${12 + depth * 16}px`} disabled={busy || here} onclick={() => moveTo(path)}>
      {#if node}
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
          <path d="M4 1.75h5l3.25 3.25v8.25c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1v-10.5c0-.55.45-1 1-1z" />
        </svg>
      {:else}
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
          <path d="M2.5 7.5 8 2.5l5.5 5M4 6.5V13h8V6.5" />
        </svg>
      {/if}
      <span class="label">{label}</span>
      {#if here}<span class="tag">Here now</span>{/if}
    </button>
  </li>
{/snippet}

{#if deleting}
  <Modal title="Delete note" onclose={() => (notes.deleting = null)}>
    <form onsubmit={remove}>
      <h2>Delete “{deleting.title}”?</h2>
      <p>
        {#if under}
          This note and the {under === 1 ? 'note' : `${under} notes`} inside it will be deleted for good.
        {:else}
          This note will be deleted for good.
        {/if}
        It cannot be brought back.
      </p>
      <p class="aside">
        Want a copy first?
        <button type="button" class="link" onclick={() => deleting && notes.download(deleting.path, under > 0)}>
          Export it as {under ? '.zip' : '.md'}
        </button>
      </p>
      <div class="actions">
        <!-- The keyboard starts on Cancel, so a stray Enter deletes nothing. -->
        <button type="button" class="btn" data-autofocus="" disabled={busy} onclick={() => (notes.deleting = null)}>Cancel</button>
        <button class="btn delete" disabled={busy}>Delete</button>
      </div>
    </form>
  </Modal>
{/if}

{#if moving}
  <Modal title="Move note" onclose={closeMove} top>
    <div class="move">
      <h2>Move “{moving.title}”</h2>
      <p>Pick the note to put it inside. The notes inside it come along.</p>
      <input type="search" placeholder="Find a note" aria-label="Find a note" bind:value={filter} />
      <ul>
        {#if !filter.trim()}{@render place('Top level', '', 0)}{/if}
        {#each places as { node, depth } (node.path)}
          {@render place(node.title, node.path, filter.trim() ? 0 : depth, node)}
        {/each}
        {#if filter.trim() && !places.length}<li class="none">No note matches.</li>{/if}
      </ul>
      <div class="actions">
        <button type="button" class="btn" onclick={closeMove}>Cancel</button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  form,
  .move {
    display: grid;
    gap: 12px;
    padding: 20px 24px;
    min-height: 0;
    overflow-y: auto;
  }

  .move {
    grid-template-rows: auto auto auto minmax(0, 1fr) auto;
    max-height: min(70vh, 620px);
    overflow: hidden;
  }

  h2 {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 20px;
    font-weight: 900;
  }

  p {
    margin: 0;
  }

  .aside {
    color: var(--muted);
    font-size: 14px;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--link);
    font-weight: 700;
  }

  .link:hover {
    text-decoration: underline;
  }

  input {
    min-height: 38px;
    padding: 6px 12px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--bg);
    font-size: 15px;
  }

  ul {
    min-height: 0;
    margin: 0;
    padding: 4px 0;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    list-style: none;
  }

  .place {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 34px;
    padding: 4px 12px;
    border: 0;
    background: none;
    text-align: left;
  }

  .place:hover:not(:disabled),
  .place:focus-visible {
    outline: none;
    background: var(--accent);
    color: var(--accent-ink);
  }

  .place:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .place svg {
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

  .tag {
    flex: none;
    font-size: 12px;
  }

  .none {
    padding: 8px 12px;
    color: var(--muted);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .delete {
    border-color: var(--danger);
    background: var(--danger);
    color: #fff;
  }

  .delete:hover:not(:disabled) {
    background: var(--danger);
    filter: brightness(1.1);
  }
</style>
