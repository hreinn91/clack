<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Provider } from '../../../shared/protocol';
  import { clock, fullDate } from '../lib/format';
  import Avatar from './Avatar.svelte';

  // One sender's turn: a picture, the name and time, then everything they sent.
  let {
    kind,
    name,
    ts,
    provider = 'claude',
    children,
  }: { kind: 'person' | 'model' | 'system'; name: string; ts?: number; provider?: Provider; children: Snippet } = $props();
</script>

<article class="message">
  <Avatar {kind} label={name} {provider} />
  <div class="main">
    <header>
      <span class="name">{name}</span>
      {#if ts}<time datetime={new Date(ts).toISOString()} title={fullDate(ts)}>{clock(ts)}</time>{/if}
    </header>
    <div class="body">{@render children()}</div>
  </div>
</article>

<style>
  .message {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 10px;
    padding: 8px 20px;
  }

  .message:hover {
    background: var(--hover);
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    /* Lines the name up with the top of the picture. */
    margin-top: -3px;
  }

  .name {
    font-weight: 900;
  }

  time {
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 920px;
  }

  @media (max-width: 820px) {
    .message {
      padding-left: 14px;
      padding-right: 14px;
    }
  }
</style>
