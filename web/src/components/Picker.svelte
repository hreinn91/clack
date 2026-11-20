<script lang="ts">
  // A button that opens a menu of choices. Unlike a native select, the menu
  // shows every choice at once, with room for a line explaining each.
  import type { Snippet } from 'svelte';

  type Option = {
    value: string;
    label: string;
    description?: string;
    /** Options with the same group are listed together under its name. */
    group?: string;
    /** Said beside the group's name (the plan it is signed in with, say). */
    groupNote?: string;
    /** Shown but cannot be picked. */
    disabled?: boolean;
  };

  let {
    label,
    value,
    options,
    onpick,
    disabled = false,
    placement = 'up',
    align = 'left',
    lead,
    groupLead,
  }: {
    /** What is being chosen, for screen readers and the tooltip. */
    label: string;
    value: string;
    options: Option[];
    onpick: (value: string) => void;
    disabled?: boolean;
    /** Whether the menu opens above or below the button. */
    placement?: 'up' | 'down';
    align?: 'left' | 'right';
    /** Drawn before the chosen option's name on the button. */
    lead?: Snippet;
    /** Drawn before each group's name. */
    groupLead?: Snippet<[string]>;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();
  let menu = $state<HTMLElement>();

  const current = $derived(options.find((option) => option.value === value));

  function toggle() {
    open = !open;
  }

  function pick(next: string) {
    open = false;
    root?.querySelector<HTMLElement>('.trigger')?.focus();
    if (next !== value) onpick(next);
  }

  // Opening puts the keyboard on the current choice, so the arrow keys start from there.
  $effect(() => {
    if (open) (menu?.querySelector<HTMLElement>('[aria-selected="true"]') ?? menu?.querySelector<HTMLElement>('button'))?.focus();
  });

  function onkeydown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      open = false;
      root?.querySelector<HTMLElement>('.trigger')?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = [...(menu?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === 'Tab') {
      open = false;
    }
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    if (open && !root?.contains(event.target as Node)) open = false;
  }}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span class="picker" class:down={placement === 'down'} class:right={align === 'right'} bind:this={root} {onkeydown}>
  <button type="button" class="trigger" class:open aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${current?.label ?? value}`} title={label} {disabled} onclick={toggle}>
    {@render lead?.()}
    <span>{current?.label ?? value}</span>
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 3.5 5 6.5l3-3" />
    </svg>
  </button>
  {#if open}
    <div class="menu" role="listbox" aria-label={label} bind:this={menu}>
      {#each options as option, index (option.value)}
        {#if option.group && option.group !== options[index - 1]?.group}
          <div class="group" role="presentation">
            {@render groupLead?.(option.group)}
            <span>{option.group}</span>
            {#if option.groupNote}<em>{option.groupNote}</em>{/if}
          </div>
        {/if}
        <button
          type="button"
          role="option"
          aria-selected={option.value === value}
          aria-disabled={option.disabled}
          disabled={option.disabled}
          onclick={() => pick(option.value)}
        >
          <svg class="check" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            {#if option.value === value}<path d="M3 7.5 6 10.5l5-6.5" />{/if}
          </svg>
          <span class="text">
            <strong>{option.label}</strong>
            {#if option.description}<span>{option.description}</span>{/if}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</span>

<style>
  .picker {
    position: relative;
    display: inline-flex;
    min-width: 0;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    height: 28px;
    padding: 0 7px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: inherit;
    font-size: 13px;
  }

  .trigger span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .trigger svg {
    flex: none;
    opacity: 0.7;
  }

  .trigger:hover:not(:disabled),
  .trigger.open {
    background: var(--picker-hover, var(--hover));
    color: var(--picker-hover-text, var(--text));
  }

  .trigger:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + 6px);
    z-index: 30;
    display: grid;
    width: max-content;
    min-width: 200px;
    max-width: min(380px, calc(100vw - 32px));
    /* Every choice is shown. Scrolling is only a last resort on a screen too short to hold them. */
    max-height: calc(100dvh - 90px);
    overflow-y: auto;
    padding: 6px 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .down .menu {
    top: calc(100% + 6px);
    bottom: auto;
  }

  .right .menu {
    left: auto;
    right: 0;
  }

  .menu button {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 16px 6px 10px;
    border: 0;
    background: none;
    color: inherit;
    font: 14px/1.35 var(--font);
    text-align: left;
  }

  .group {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px 4px;
    color: var(--muted);
    font: 700 11.5px var(--font);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .group:not(:first-child) {
    margin-top: 4px;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }

  .group em {
    margin-left: auto;
    font-style: normal;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
  }

  .menu button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .menu button:hover:not(:disabled),
  .menu button:focus-visible {
    outline: none;
    background: var(--accent);
    color: var(--accent-ink);
  }

  .check {
    flex: none;
    margin-top: 2px;
  }

  .text {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .text strong {
    font-weight: 700;
  }

  .text span {
    font-size: 12.5px;
    opacity: 0.75;
  }
</style>
