<script lang="ts">
  // A "more" button that opens a short list of things to do.
  type Action = { label: string; run: () => void; danger?: boolean };

  let { label, actions, chrome = false }: { label: string; actions: Action[]; /** Drawn for the sidebar rather than the page. */ chrome?: boolean } = $props();

  let open = $state(false);
  let trigger = $state<HTMLElement>();
  let menu = $state<HTMLElement>();
  let place = $state('');

  // The menu is placed against the window, not its surroundings, so a scrolling
  // list or a narrow sidebar cannot cut it off.
  function toggle(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!open && trigger) {
      const box = trigger.getBoundingClientRect();
      const below = box.bottom + 6 + actions.length * 32 + 16 < innerHeight;
      const left = Math.max(8, Math.min(box.left, innerWidth - 216));
      place = `left:${left}px;${below ? `top:${box.bottom + 4}px` : `bottom:${innerHeight - box.top + 4}px`}`;
    }
    open = !open;
  }

  $effect(() => {
    if (open) menu?.querySelector<HTMLElement>('button')?.focus();
  });

  function onkeydown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      open = false;
      trigger?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = [...(menu?.querySelectorAll<HTMLElement>('button') ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (event.key === 'Tab') {
      open = false;
    }
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    if (open && !menu?.contains(event.target as Node) && !trigger?.contains(event.target as Node)) open = false;
  }}
  onresize={() => (open = false)}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span class="wrap" class:chrome class:open {onkeydown}>
  <button class="trigger" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} bind:this={trigger} onclick={toggle}>
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="13" cy="8" r="1.4" />
    </svg>
  </button>
  {#if open}
    <div class="menu" role="menu" style={place} bind:this={menu}>
      {#each actions as action (action.label)}
        <button
          role="menuitem"
          class:danger={action.danger}
          onclick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            open = false;
            action.run();
          }}
        >
          {action.label}
        </button>
      {/each}
    </div>
  {/if}
</span>

<style>
  .wrap {
    display: inline-flex;
    flex: none;
  }

  .trigger {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
  }

  .trigger:hover,
  .open .trigger {
    background: var(--hover);
    color: var(--text);
  }

  .chrome .trigger {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    color: inherit;
  }

  .chrome .trigger:hover,
  .chrome.open .trigger {
    background: var(--chrome-tile);
    color: inherit;
  }

  .menu {
    position: fixed;
    z-index: 70;
    display: grid;
    width: 208px;
    padding: 6px 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .menu button {
    height: 32px;
    padding: 0 16px;
    border: 0;
    background: none;
    color: inherit;
    font: 14px var(--font);
    text-align: left;
  }

  .menu button:hover,
  .menu button:focus-visible {
    outline: none;
    background: var(--accent);
    color: var(--accent-ink);
  }

  .menu .danger {
    color: var(--danger);
  }

  .menu .danger:hover,
  .menu .danger:focus-visible {
    background: var(--danger);
    color: #fff;
  }
</style>
