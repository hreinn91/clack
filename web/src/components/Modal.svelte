<script lang="ts">
  import type { Snippet } from 'svelte';

  // A box in the middle of the window that has to be dealt with before anything else.
  let {
    title,
    onclose,
    children,
    top = false,
    width = 440,
  }: {
    title: string;
    onclose: () => void;
    children: Snippet;
    /** Sits near the top of the window instead of the middle, so a list inside can grow downwards. */
    top?: boolean;
    width?: number;
  } = $props();

  let box = $state<HTMLElement>();

  // Start in the first field, or on the box itself, so the keyboard is inside the dialog.
  $effect(() => {
    const first = box?.querySelector<HTMLElement>('[data-autofocus], input, textarea');
    (first ?? box)?.focus();
    if (first instanceof HTMLInputElement) first.select();
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onclose();
    } else if (event.key === 'Tab' && box) {
      // Tab stays inside the dialog.
      const items = [...box.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, a[href], [tabindex="0"]')];
      if (!items.length) return;
      const first = items[0]!;
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
  class="backdrop"
  class:top
  onpointerdown={(event) => {
    if (event.target === event.currentTarget) onclose();
  }}
  {onkeydown}
>
  <div class="box" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" style:width={`min(${width}px, 100%)`} bind:this={box}>
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgb(0 0 0 / 45%);
  }

  .backdrop.top {
    align-items: start;
    padding-top: min(14vh, 120px);
  }

  .box {
    max-height: 100%;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .box:focus {
    outline: none;
  }
</style>
