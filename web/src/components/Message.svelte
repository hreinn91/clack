<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Provider } from '../../../shared/protocol';
  import { clock, fullDate } from '../lib/format';
  import Avatar from './Avatar.svelte';
  import CopyButton from './CopyButton.svelte';

  // One sender's turn: a picture, the name and time, then everything they sent.
  let {
    kind,
    name,
    ts,
    provider = 'claude',
    children,
    copyText = '',
  }: { kind: 'person' | 'model' | 'system'; name: string; ts?: number; provider?: Provider; children: Snippet; copyText?: string } = $props();
  /** How the last copy went: the button stays in sight while it says so. */
  let result = $state<'' | 'ok' | 'failed'>('');
</script>

<article class="message">
  <div class="gutter">
    <Avatar {kind} label={name} {provider} />
    {#if copyText}
      <span class="copy" class:shown={result !== ''}>
        <CopyButton text={copyText} label={kind === 'person' ? 'Copy prompt' : 'Copy response'} bind:result />
      </span>
    {/if}
  </div>
  <div class="main">
    <header>
      <span class="name">{name}</span>
      {#if ts}<time datetime={new Date(ts).toISOString()} title={fullDate(ts)}>{clock(ts)}</time>{/if}
      {#if result === 'failed'}<span class="failed" aria-hidden="true">Copy failed</span>{/if}
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

  .gutter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    /* Lines the name up with the top of the picture. */
    margin-top: -3px;
  }

  /* Out of sight until the message is pointed at, and kept in view while a long one scrolls by. */
  .copy {
    position: sticky;
    top: 6px;
    display: flex;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .message:hover .copy,
  .message:focus-within .copy,
  .copy.shown {
    opacity: 1;
  }

  @media (hover: none) {
    .copy {
      opacity: 1;
    }
  }

  .failed {
    padding: 0 7px;
    border-radius: 999px;
    background: var(--danger-soft);
    color: var(--danger);
    font-size: 12px;
    font-weight: 700;
  }

  @media (prefers-reduced-motion: reduce) {
    .copy {
      transition: none;
    }
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
  }

  @media (max-width: 820px) {
    .message {
      padding-left: 14px;
      padding-right: 14px;
    }
  }
</style>
