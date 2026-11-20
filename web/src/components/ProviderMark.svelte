<script lang="ts">
  import type { Provider } from '../../../shared/protocol';

  // The small sign that says which agent something belongs to: Claude's spark,
  // or a terminal prompt for Codex. Drawn in the current text colour.
  let { provider, size = 14 }: { provider: Provider; size?: number } = $props();
</script>

{#if provider === 'codex'}
  <svg class="mark" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="1.75" y="2.5" width="12.5" height="11" rx="2.5" />
    <path d="M4.75 6.25 7 8.25l-2.25 2M8.5 10.5h3" />
  </svg>
{:else}
  <svg class="mark" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5c.5 5.4 3.6 8.5 9 9.5-5.4 1-8.5 4.1-9 9.5-.5-5.4-3.6-8.5-9-9.5 5.4-1 8.5-4.1 9-9.5z" />
  </svg>
{/if}

<style>
  .mark {
    flex: none;
  }
</style>
