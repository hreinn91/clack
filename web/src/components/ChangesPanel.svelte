<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { placeBelow } from '../lib/popover';
  import { app } from '../lib/state.svelte';
  import ChangedFileRow from './ChangedFileRow.svelte';

  const summary = $derived(app.meta?.gitChanges);
  const dirty = $derived((summary?.files ?? 0) > 0);
  const open = $derived(app.changesView === 'summary');
  const status = $derived(app.changesStatus);
  const totals = $derived(status ?? summary);
  let chip = $state<HTMLButtonElement>();
  let card = $state<HTMLElement>();
  let place = $state({ top: 0, left: 0, width: 460 });
  let limit = $state(6);
  const preview = $derived(status?.changes.slice(0, limit) ?? []);
  const label = $derived(
    !summary
      ? ''
      : dirty
        ? `Uncommitted changes in ${summary.files} file${summary.files === 1 ? '' : 's'}. Lines added ${summary.added}, lines removed ${summary.deleted}.`
        : 'No uncommitted changes',
  );

  function position() {
    if (!chip) return;
    place = placeBelow(chip, 460);
    // Leave the review action on screen even on a short phone in landscape.
    limit = Math.max(0, Math.min(6, Math.floor((innerHeight - place.top - 140) / 44)));
  }

  async function toggle() {
    if (open) {
      app.closeChanges();
      return;
    }
    position();
    app.changesView = 'summary';
    await tick();
    card?.focus({ preventScroll: true });
  }

  function dismissOutside(event: Event) {
    const target = event.target as Node;
    if (open && !card?.contains(target) && !chip?.contains(target)) app.closeChanges();
  }

  async function escape(event: KeyboardEvent) {
    if (!open || event.key !== 'Escape') return;
    event.preventDefault();
    app.closeChanges();
    await tick();
    (chip && !chip.disabled ? chip : document.querySelector<HTMLButtonElement>('.pane-bar .title'))?.focus();
  }

  onDestroy(() => {
    if (app.changesView === 'summary') app.closeChanges();
  });
</script>

<svelte:window onpointerdown={dismissOutside} onfocusin={dismissOutside}
  onresize={() => { if (open) position(); }} onkeydown={escape} />

{#if summary}
  <button
    class="chip"
    class:dirty
    bind:this={chip}
    id="review-changes"
    aria-haspopup={dirty || open ? 'dialog' : undefined}
    aria-expanded={dirty || open ? open : undefined}
    aria-controls={open ? 'changes-summary' : undefined}
    aria-label={label}
    title={label}
    disabled={!dirty && !open}
    onclick={toggle}
  >
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M1.5 8h4M10.5 8h4" />
    </svg>
    {#if dirty}
      <span>Changes</span>
      <strong>{summary.files}</strong>
      {#if summary.added}<span class="plus">+{summary.added}</span>{/if}
      {#if summary.deleted}<span class="minus">−{summary.deleted}</span>{/if}
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m2 3.5 3 3 3-3"/></svg>
    {:else}
      <span>No changes</span>
    {/if}
  </button>
{/if}

{#if open}
  <div class="card" id="changes-summary" role="dialog" aria-labelledby="changes-heading" tabindex="-1" bind:this={card}
    style:top={`${place.top}px`} style:left={`${place.left}px`} style:width={`${place.width}px`}>
    <header>
      <div class="heading">
        <h2 id="changes-heading">Uncommitted changes</h2>
        {#if totals}
          <p>{totals.files} {totals.files === 1 ? 'file' : 'files'}{#if status?.branch} · <span title={status.branch}>{status.branch}</span>{/if}</p>
        {/if}
      </div>
      {#if totals}
        <div class="totals" title="Total lines added and removed">
          <span class="plus">+{totals.added}</span><span class="minus">−{totals.deleted}</span>
        </div>
      {/if}
    </header>
    {#if app.changesError}
      <div class="notice" role="alert">{app.changesError} <button class="btn" onclick={() => { card?.focus(); void app.refreshChanges(); }}>Retry</button></div>
    {:else if preview.length}
      <ul>
        {#each preview as file (`${file.area}:${file.path}`)}
          <li><ChangedFileRow {file} showDirectory onpick={(change) => app.openChanges(change)} /></li>
        {/each}
      </ul>
    {:else if !status || !status.files}
      <p class="notice" role="status">{app.changesLoading ? 'Reading changes…' : status ? 'Working tree is clean.' : 'Git repository unavailable.'}</p>
    {/if}
    {#if !app.changesError && (app.changesLoading || status?.files)}
      <footer>
        {#if status && preview.length && (status.truncated || preview.length < status.changes.length)}
          <span class="range">{preview.length} of {status.changes.length}{status.truncated ? '+' : ''} changes</span>
        {/if}
        <button class="review-link" onclick={() => app.openChanges()}>
          Review all changes <span aria-hidden="true">→</span>
        </button>
      </footer>
    {/if}
  </div>
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
    padding: 2px 6px 2px 5px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: none;
    color: inherit;
    font-size: 12px;
    vertical-align: middle;
  }

  .chip.dirty:hover, .chip[aria-expanded='true'] {
    border-color: var(--border-strong);
    background: var(--hover);
    color: var(--text);
  }

  /* With nothing to show, it only says so. */
  .chip:disabled {
    border-style: dashed;
    cursor: default;
    opacity: 0.75;
  }

  .chip strong {
    color: var(--text);
    font-weight: 700;
  }

  .plus,
  .minus {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .plus {
    color: var(--git-added-text);
  }

  .minus {
    color: var(--danger);
  }

  .card {
    position: fixed;
    z-index: 40;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .card:focus { outline: none; }
  .card header, .card footer { display: flex; align-items: center; gap: 12px; }
  .card header { justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .heading { min-width: 0; }
  h2 { margin: 0; font-size: 15px; }
  .heading p { margin: 3px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
  .heading p span { font-family: var(--mono); }
  .totals { display: flex; gap: 6px; font: 12px var(--mono); }
  ul { list-style: none; padding: 4px 6px; margin: 0; }
  .notice { padding: 10px 16px; margin: 0; overflow-wrap: anywhere; color: var(--muted); font-size: 13px; }
  .card footer { padding: 6px 8px 6px 16px; border-top: 1px solid var(--border); }
  .range { color: var(--muted); font-size: 12px; }
  .review-link {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    padding: 8px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--link);
    font-weight: 700;
  }
  .review-link:hover { background: var(--hover); }

  @media (max-width: 600px) {
    .chip .plus, .chip .minus { display: none; }
  }
</style>
