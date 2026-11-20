<script lang="ts">
  // A line of text where `this` is code, as the server writes commands in its messages.
  let { text }: { text: string } = $props();
  const parts = $derived(text.split('`'));
</script>

{#each parts as part, i (i)}{#if i % 2}<code>{part}</code>{:else}{part}{/if}{/each}

<style>
  code {
    padding: 0.05em 0.3em;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--sunken);
    font: 0.9em var(--mono);
  }
</style>
