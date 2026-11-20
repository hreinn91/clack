<script lang="ts">
  import { app } from '../lib/state.svelte';

  const summary = $derived(app.meta?.gitChanges);
  const dirty = $derived((summary?.files ?? 0) > 0);
  const label = $derived(
    !summary
      ? ''
      : dirty
        ? `Uncommitted changes: ${summary.files} file${summary.files === 1 ? '' : 's'}, ${summary.added} lines added, ${summary.deleted} removed`
        : 'No uncommitted changes',
  );
</script>

{#if summary}
  <button
    class="chip"
    class:dirty
    id="review-changes"
    aria-label={dirty ? `Review changes. ${label}` : label}
    title={dirty ? `Review changes · ${label}` : label}
    disabled={!dirty}
    onclick={() => app.openChanges()}
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
    {:else}
      <span>No changes</span>
    {/if}
  </button>
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

  .chip.dirty:hover {
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
    color: var(--presence);
  }

  .minus {
    color: var(--danger);
  }

  @media (max-width: 600px) {
    .chip .plus, .chip .minus { display: none; }
  }
</style>
