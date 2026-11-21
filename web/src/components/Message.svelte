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
  /** How the last copy went, for the button's little animation; '' when it has settled again. */
  let result = $state<'' | 'ok' | 'failed'>('');
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
      result = 'ok';
    } catch {
      result = 'failed';
    }
    clearTimeout(reset);
    reset = setTimeout(() => (result = ''), 1600);
  }
</script>

<article class="message">
  <div class="gutter">
    <Avatar {kind} label={name} {provider} />
    {#if copyText}
      <button
        class="copy"
        class:ok={result === 'ok'}
        class:failed={result === 'failed'}
        aria-label={kind === 'person' ? 'Copy prompt' : 'Copy response'}
        title="Copy to clipboard"
        onclick={copy}
      >
        {#key result}
          {#if result === 'ok'}
            <svg class="icon pop" width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path class="tick" d="M3.5 8.5l3 3 6-7" />
            </svg>
          {:else}
            <svg class="icon" width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
              <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
              <path d="M10.5 3.5v-1h-8v8h1" stroke-linejoin="round" />
            </svg>
          {/if}
        {/key}
      </button>
    {/if}
  </div>
  <div class="main">
    <header>
      <span class="name">{name}</span>
      {#if ts}<time datetime={new Date(ts).toISOString()} title={fullDate(ts)}>{clock(ts)}</time>{/if}
      {#if copyText}
        <span class="feedback" class:failed={result === 'failed'} role="status">
          {result === 'ok' ? 'Copied' : result === 'failed' ? 'Copy failed' : ''}
        </span>
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
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    /* A shade lighter than the page behind the message, so it stands out a little. */
    background: color-mix(in srgb, var(--surface) 86%, var(--text));
    color: var(--text);
    box-shadow: 0 1px 2px rgb(0 0 0 / 12%);
    opacity: 0;
    transition:
      opacity 0.15s,
      background-color 0.2s,
      border-color 0.2s,
      color 0.2s,
      transform 0.1s;
  }

  .message:hover .copy,
  .message:focus-within .copy,
  .copy.ok,
  .copy.failed {
    opacity: 1;
  }

  .copy:hover {
    background: color-mix(in srgb, var(--surface) 76%, var(--text));
  }

  .copy:active {
    transform: scale(0.9);
  }

  /* Copied: the button turns green and the copy icon becomes a tick that draws itself. */
  .copy.ok {
    border-color: var(--presence);
    background: color-mix(in srgb, var(--presence) 22%, var(--surface));
    color: var(--presence);
  }

  .copy.failed {
    border-color: var(--danger);
    background: var(--danger-soft);
    color: var(--danger);
    animation: shake 0.35s;
  }

  .icon.pop {
    animation: pop 0.3s ease-out;
  }

  .tick {
    stroke-dasharray: 16;
    stroke-dashoffset: 16;
    animation: draw 0.3s 0.05s ease-out forwards;
  }

  @keyframes pop {
    0% {
      transform: scale(0.4);
    }
    70% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes shake {
    25% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
  }

  .feedback:not(.failed) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .feedback.failed {
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

    .icon.pop,
    .tick,
    .copy.failed {
      animation: none;
      stroke-dashoffset: 0;
    }
  }
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
