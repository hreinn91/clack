<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte';
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
    copyText = '',
  }: { kind: 'person' | 'model' | 'system'; name: string; ts?: number; provider?: Provider; children: Snippet; copyText?: string } = $props();
  let feedback = $state('');
  let reset: ReturnType<typeof setTimeout>;
  onDestroy(() => clearTimeout(reset));

  async function copy(event: MouseEvent) {
    const button = event.currentTarget as HTMLButtonElement;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
      } else {
        // Plain HTTP on the LAN has no Clipboard API.
        const field = document.createElement('textarea');
        field.value = copyText;
        field.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.append(field);
        try {
          field.select();
          if (!document.execCommand('copy')) throw new Error('Copy unavailable');
        } finally {
          field.remove();
          button.focus({ preventScroll: true });
        }
      }
      feedback = 'Copied';
    } catch {
      feedback = 'Copy failed';
    }
    clearTimeout(reset);
    reset = setTimeout(() => (feedback = ''), 2000);
  }
</script>

<article class="message">
  <div class="gutter">
    <Avatar {kind} label={name} {provider} />
    {#if copyText}
      <button class="copy" aria-label={kind === 'person' ? 'Copy prompt' : 'Copy response'} title="Copy to clipboard" onclick={copy}>
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 3.5v-1h-8v8h1" stroke-linejoin="round" />
        </svg>
      </button>
    {/if}
  </div>
  <div class="main">
    <header>
      <span class="name">{name}</span>
      {#if ts}<time datetime={new Date(ts).toISOString()} title={fullDate(ts)}>{clock(ts)}</time>{/if}
      {#if copyText}
        <span class="feedback" role="status">{feedback}</span>
      {/if}
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

  .copy {
    display: inline-grid;
    place-items: center;
    position: sticky;
    top: 6px;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--muted);
    background: var(--surface);
    opacity: 0;
  }

  .message:hover .copy, .message:focus-within .copy { opacity: 1; }
  .copy:hover { background: var(--hover); color: var(--text); }
  .feedback { color: var(--muted); font-size: 12px; }
  @media (hover: none) {
    .copy { opacity: 1; }
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
