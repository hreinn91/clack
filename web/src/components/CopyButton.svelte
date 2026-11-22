<script lang="ts">
  import { onDestroy } from 'svelte';

  // Copies text, and says so: the button turns green and its icon becomes a
  // tick that draws itself, or it shakes red when the copy did not work.
  let {
    text,
    label = 'Copy to clipboard',
    size = 32,
    result = $bindable(''),
  }: {
    /** What is copied, or a function that gives it at the moment of copying. */
    text: string | (() => string);
    label?: string;
    size?: number;
    /** How the last copy went, for the button's little animation; '' when it has settled again. */
    result?: '' | 'ok' | 'failed';
  } = $props();

  let reset: ReturnType<typeof setTimeout>;
  onDestroy(() => clearTimeout(reset));

  async function copy(event: MouseEvent) {
    const button = event.currentTarget as HTMLButtonElement;
    const value = typeof text === 'function' ? text() : text;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Plain HTTP on the LAN has no Clipboard API.
        const field = document.createElement('textarea');
        field.value = value;
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

<button
  class="copy"
  class:ok={result === 'ok'}
  class:failed={result === 'failed'}
  style:width={`${size}px`}
  style:height={`${size}px`}
  aria-label={label}
  title={result === 'ok' ? 'Copied' : result === 'failed' ? 'Copy failed' : label}
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
  <span class="status" role="status">{result === 'ok' ? 'Copied' : result === 'failed' ? 'Copy failed' : ''}</span>
</button>

<style>
  .copy {
    display: inline-grid;
    place-items: center;
    flex: none;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    /* A shade lighter than the page behind it, so it stands out a little. */
    background: color-mix(in srgb, var(--surface) 86%, var(--text));
    color: var(--text);
    box-shadow: 0 1px 2px rgb(0 0 0 / 12%);
    transition:
      background-color 0.2s,
      border-color 0.2s,
      color 0.2s,
      transform 0.1s;
  }

  .copy:hover {
    background: color-mix(in srgb, var(--surface) 76%, var(--text));
  }

  .copy:active {
    transform: scale(0.9);
  }

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

  .icon {
    grid-area: 1 / 1;
  }

  .icon.pop {
    animation: pop 0.3s ease-out;
  }

  .tick {
    stroke-dasharray: 16;
    stroke-dashoffset: 16;
    animation: draw 0.3s 0.05s ease-out forwards;
  }

  /* Read out by screen readers; the icon says it to everyone else. */
  .status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
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
</style>
