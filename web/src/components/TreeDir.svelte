<script lang="ts">
  import { app } from '../lib/state.svelte';
  import TreeDir from './TreeDir.svelte';

  // The contents of one folder in the data directory. Unfolded folders nest another of these.
  let { path, depth }: { path: string; depth: number } = $props();

  const listing = $derived(app.tree[path]);
  const query = $derived(app.search.trim().toLowerCase());
  // Searching narrows the files; folders stay, since what is looked for may be inside one.
  const entries = $derived(
    listing && query
      ? listing.entries.filter((entry) => entry.kind === 'dir' || entry.name.toLowerCase().includes(query))
      : (listing?.entries ?? []),
  );
  const indent = $derived(`${8 + depth * 14}px`);
</script>

<ul>
  {#each entries as entry (entry.name)}
    {@const child = path ? `${path}/${entry.name}` : entry.name}
    <li>
      {#if entry.kind === 'dir'}
        {@const open = app.treeOpen[child] === true}
        <div class="row">
          <button class="main" style:padding-left={indent} aria-expanded={open} onclick={() => app.toggleDir(child)}>
            <svg class="chevron" class:open width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
              <path d="M3 1.5 7.5 5 3 8.5z" />
            </svg>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true">
              <path d="M1.75 4.25c0-.7.55-1.25 1.25-1.25h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25v5.75c0 .7-.55 1.25-1.25 1.25H3c-.7 0-1.25-.55-1.25-1.25z" />
            </svg>
            <span class="label">{entry.name}</span>
          </button>
          <span class="acts">
            {#if path === 'sessions'}
              <a href={`#/new/${entry.name}`} aria-label={`Start a chat in ${entry.name}`} title="Start a chat in this folder">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">
                  <path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z" />
                </svg>
              </a>
            {/if}
            {#if app.terminalEnabled}
              <button aria-label={`Open a terminal in ${entry.name}`} title="Open a terminal here" onclick={() => app.newTerminal(child)}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
                  <path d="M4.5 6l2 2-2 2M8.5 10h3" />
                </svg>
              </button>
            {/if}
          </span>
        </div>
        {#if open}
          <TreeDir path={child} depth={depth + 1} />
        {/if}
      {:else}
        <div class="row" class:active={app.file?.path === child}>
          <button class="main" style:padding-left={indent} onclick={() => app.openFile(child)}>
            <span class="chevron"></span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 1.75h5l3.25 3.25v8.25c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1v-10.5c0-.55.45-1 1-1z" />
              <path d="M9 1.750V5h3.250" />
            </svg>
            <span class="label">{entry.name}</span>
          </button>
        </div>
      {/if}
    </li>
  {/each}
  {#if !listing}
    <li class="note" style:padding-left={indent}>Loading…</li>
  {:else if !listing.entries.length}
    <li class="note" style:padding-left={indent}>Empty</li>
  {:else if listing.truncated}
    <li class="note" style:padding-left={indent}>Only the first 1,000 are listed.</li>
  {/if}
</ul>

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

  .main {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    height: 28px;
    padding: 0 8px 0 0;
    border: 0;
    border-radius: 6px;
    background: none;
    color: inherit;
    text-align: left;
  }

  .main svg {
    flex: none;
  }

  .chevron {
    width: 10px;
    flex: none;
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

  .acts {
    display: none;
    flex: none;
    padding-right: 4px;
  }

  .row:hover .acts,
  .row:focus-within .acts {
    display: flex;
  }

  .acts a,
  .acts button {
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

  .acts a:hover,
  .acts button:hover {
    background: var(--chrome-tile);
    color: var(--chrome-strong);
  }

  .note {
    height: 26px;
    display: flex;
    align-items: center;
    margin-left: 22px;
    font-size: 13px;
    opacity: 0.7;
  }

  @media (max-width: 820px), (pointer: coarse) {
    .main {
      height: 36px;
    }

    /* Nothing hovers on a touch screen, so the actions are always there. */
    .acts {
      display: flex;
    }

    .acts a,
    .acts button {
      width: 32px;
      height: 32px;
    }
  }
</style>
