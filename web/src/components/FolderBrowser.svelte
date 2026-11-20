<script lang="ts">
  import type { BrowseListing } from '../../../shared/protocol';
  import { app } from '../lib/state.svelte';

  // Walks the folders of the server computer to pick one for chats to work in.
  // Click a folder to go into it; the folder you are in is the one picked.
  // A path can also be typed or pasted into the field at the top.

  let {
    busy = false,
    onstart,
    onadd,
  }: {
    busy?: boolean;
    /** Adds the folder and starts a chat in it. */
    onstart: (path: string) => void;
    /** Adds the folder to the sidebar only. */
    onadd: (path: string) => void;
  } = $props();

  const LAST_KEY = 'clack.browse';

  let listing = $state<BrowseListing | null>(null);
  let typed = $state('');
  let error = $state('');
  let loading = $state(false);
  let list = $state<HTMLElement>();

  function lastPlace(): string | undefined {
    try {
      return localStorage.getItem(LAST_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  }

  async function go(path?: string) {
    loading = true;
    error = '';
    try {
      listing = await app.browse(path);
      typed = listing.label;
      list?.scrollTo({ top: 0 });
      try {
        localStorage.setItem(LAST_KEY, listing.path);
      } catch {
        // Not remembered this time.
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      // A remembered place that is gone: start at home instead.
      if (!listing && path) return go();
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void go(lastPlace());
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (typed.trim()) void go(typed.trim());
  }

  /** The folders from the top of the disk down to here, for the breadcrumbs. */
  const crumbs = $derived.by(() => {
    if (!listing) return [];
    const parts = listing.path.split('/').filter(Boolean);
    return [{ name: '/', path: '/' }, ...parts.map((name, index) => ({ name, path: `/${parts.slice(0, index + 1).join('/')}` }))];
  });

  const blocked = $derived(listing?.inData ? "This is inside clack's own data directory. Its folders are under data/sessions already." : '');
</script>

{#snippet branchIcon()}
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
    <circle cx="4.5" cy="3.5" r="1.75" />
    <circle cx="4.5" cy="12.5" r="1.75" />
    <circle cx="11.5" cy="5.5" r="1.75" />
    <path d="M4.5 5.25v5.5M11.5 7.25c0 2.5-2.5 3-6 3.75" />
  </svg>
{/snippet}

<div class="browser">
  <form class="bar" onsubmit={submit}>
    <button
      type="button"
      class="icon-btn"
      aria-label="Up one folder"
      title="Up one folder"
      disabled={!listing?.parent || loading}
      onclick={() => listing?.parent && void go(listing.parent)}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M8 13V3.5M3.5 8 8 3.5 12.5 8" />
      </svg>
    </button>
    <button type="button" class="icon-btn" aria-label="Home folder" title="Home folder" disabled={loading} onclick={() => void go(listing?.home)}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">
        <path d="M2.5 7.5 8 2.75l5.5 4.75v5.75c0 .4-.35.75-.75.75H9.5v-3.5h-3V14H3.25c-.4 0-.75-.35-.75-.75z" />
      </svg>
    </button>
    <input
      type="text"
      aria-label="Folder path"
      placeholder="~/code/my-project"
      autocapitalize="off"
      autocomplete="off"
      spellcheck="false"
      bind:value={typed}
    />
    <button class="btn" disabled={loading || !typed.trim() || typed.trim() === listing?.label}>Go</button>
  </form>

  {#if listing}
    <nav class="crumbs" aria-label="Where you are">
      {#each crumbs as crumb, index (crumb.path)}
        {#if index > 1}<span class="sep" aria-hidden="true">/</span>{/if}
        {#if index === crumbs.length - 1}
          <span class="here" aria-current="location">{crumb.name}</span>
        {:else}
          <button class="crumb" onclick={() => void go(crumb.path)}>{crumb.name}</button>
        {/if}
      {/each}
    </nav>

    <ul class="list" bind:this={list} aria-label={`Folders in ${listing.label}`} aria-busy={loading}>
      {#each listing.entries as entry (entry.name)}
        <li>
          <button onclick={() => void go(`${listing!.path === '/' ? '' : listing!.path}/${entry.name}`)} disabled={loading}>
            <svg class="folder" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true">
              <path d="M1.75 4.25c0-.7.55-1.25 1.25-1.25h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25v5.75c0 .7-.55 1.25-1.25 1.25H3c-.7 0-1.25-.55-1.25-1.25z" />
            </svg>
            {#if entry.repo}<span class="repo" title="Git repository">{@render branchIcon()}</span>{/if}
            <span class="name">{entry.name}</span>
            <svg class="go" width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
              <path d="M3 1.5 7.5 5 3 8.5z" />
            </svg>
          </button>
        </li>
      {:else}
        <li class="none">No folders in here.</li>
      {/each}
      {#if listing.truncated}<li class="none">Only the first 1,000 are listed. Type a path to go further.</li>{/if}
    </ul>

    <div class="picked">
      <div class="where">
        <span class="caption">Chats will work in</span>
        <span class="path">
          <code>{listing.label}</code>
          {#if listing.repo}
            <span class="badge">{@render branchIcon()} {listing.branch ?? 'git'}</span>
          {/if}
          {#if listing.added}<span class="badge same">Already in clack</span>{/if}
        </span>
      </div>
      {#if blocked}
        <p class="note">{blocked}</p>
      {:else}
        <p class="note">
          The agent can change the files in this folder and the folders inside it, and nothing outside it. It gets its
          own tree in the sidebar.
        </p>
      {/if}
      <div class="actions">
        {#if !listing.added}
          <button class="btn" disabled={busy || loading || !!blocked} onclick={() => onadd(listing!.path)}>Add to sidebar</button>
        {/if}
        <button class="btn primary" disabled={busy || loading || !!blocked} onclick={() => onstart(listing!.path)}>
          {busy ? 'Starting…' : listing.added ? 'Start chat here' : 'Add folder and start chat'}
        </button>
      </div>
    </div>
  {:else if loading}
    <p class="none">Loading…</p>
  {/if}

  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .browser {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .bar {
    display: flex;
    gap: 6px;
    min-width: 0;
  }

  .bar input {
    flex: 1;
    min-width: 0;
    min-height: 36px;
    padding: 4px 10px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--bg);
    font: 14px var(--mono);
  }

  .icon-btn {
    display: grid;
    place-items: center;
    flex: none;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
  }

  .icon-btn:hover:not(:disabled) {
    border-color: var(--border-strong);
  }

  .icon-btn:disabled {
    opacity: 0.45;
  }

  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    font: 13px var(--mono);
    color: var(--muted);
  }

  .crumb {
    padding: 1px 4px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--link);
    font: inherit;
  }

  .crumb:hover {
    background: var(--hover);
  }

  .here {
    padding: 1px 4px;
    color: var(--text);
    font-weight: 700;
  }

  .list {
    max-height: min(46vh, 360px);
    margin: 0;
    padding: 4px;
    overflow-y: auto;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }

  .list button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--text);
    text-align: left;
  }

  .list button:hover:not(:disabled),
  .list button:focus-visible {
    background: var(--hover);
  }

  .list .folder {
    flex: none;
    color: var(--muted);
  }

  .list .repo {
    display: grid;
    place-items: center;
    flex: none;
    color: var(--accent);
  }

  .list .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .list .go {
    flex: none;
    opacity: 0.4;
  }

  .none {
    margin: 0;
    padding: 8px;
    color: var(--muted);
    font-size: 14px;
  }

  .picked {
    display: grid;
    gap: 10px;
    padding-top: 4px;
  }

  .where {
    display: grid;
    gap: 4px;
  }

  .caption {
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .path {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  code {
    padding: 2px 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--sunken);
    font: 14px var(--mono);
    overflow-wrap: anywhere;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-ink);
    font: 600 12px var(--mono);
  }

  .badge.same {
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-family: var(--font);
  }

  .note {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .actions .btn {
    min-height: 42px;
    padding-inline: 18px;
  }

  .error {
    margin: 0;
    color: var(--danger);
  }

  @media (max-width: 820px), (pointer: coarse) {
    .list button {
      min-height: 40px;
    }

    .bar input {
      font-size: 16px;
    }
  }
</style>
