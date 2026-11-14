<script lang="ts">
  import type { Item } from '../../../shared/protocol';
  import Markdown from './Markdown.svelte';
  import ToolCard from './ToolCard.svelte';

  let { item }: { item: Item } = $props();
</script>

{#if item.kind === 'user'}
  <div class="user">{item.text}</div>
{:else if item.kind === 'text'}
  <div class="assistant" class:sub={item.parent}><Markdown text={item.text} /></div>
{:else if item.kind === 'thinking'}
  <details class="thinking" class:sub={item.parent}>
    <summary>Thinking</summary>
    <Markdown text={item.text} />
  </details>
{:else if item.kind === 'tool'}
  <ToolCard {item} />
{:else}
  <p class="notice" class:error={item.level === 'error'} role={item.level === 'error' ? 'alert' : undefined}>
    {item.text}
  </p>
{/if}

<style>
  .user {
    align-self: flex-end;
    max-width: 85%;
    padding: 9px 14px;
    border-radius: 16px 16px 4px 16px;
    background: var(--accent-soft);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .sub {
    margin-left: 18px;
    padding-left: 12px;
    border-left: 2px solid var(--border);
  }

  .thinking {
    color: var(--muted);
    font-size: 13.5px;
  }

  .thinking summary {
    cursor: pointer;
    width: fit-content;
    font-style: italic;
  }

  .notice {
    margin: 0;
    align-self: center;
    max-width: 100%;
    padding: 4px 12px;
    border-radius: 999px;
    color: var(--muted);
    font-size: 13px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    text-align: center;
  }

  .notice.error {
    border-radius: 8px;
    background: var(--danger-soft);
    color: var(--danger);
    text-align: left;
  }
</style>
