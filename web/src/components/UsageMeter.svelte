<script lang="ts">
  import { tokens, until } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import UsageRing from './UsageRing.svelte';

  // The ring beside the send button: how close the plan's limits are, at a
  // glance, and the figures behind it on a click.
  let open = $state(false);
  let root = $state<HTMLElement>();
  let now = $state(Date.now());

  const windows = $derived(app.usage?.available ? app.usage.windows : []);
  const context = $derived(app.meta?.context);
  // The ring shows whichever limit is closest to running out; with no plan limits, how full this chat is.
  const tightest = $derived(windows.reduce<(typeof windows)[number] | undefined>((worst, w) => (!worst || w.used > worst.used ? w : worst), undefined));
  const percent = $derived(tightest?.used ?? context?.percent);

  const summary = $derived(
    tightest
      ? `${tightest.label}: ${tightest.used}% used`
      : context
        ? `This chat's context window: ${context.percent}% full`
        : 'Usage',
  );

  $effect(() => {
    if (open) now = Date.now();
  });
</script>

<svelte:window
  onpointerdown={(event) => {
    if (open && !root?.contains(event.target as Node)) open = false;
  }}
  onkeydown={(event) => {
    if (open && event.key === 'Escape') open = false;
  }}
/>

{#if percent !== undefined}
  <span class="meter" bind:this={root}>
    <button class:open aria-label={summary} title={summary} aria-haspopup="dialog" aria-expanded={open} onclick={() => (open = !open)}>
      <UsageRing {percent} />
    </button>
    {#if open}
      <div class="card" role="dialog" aria-label="Usage">
        {#each windows as window (window.id)}
          <div class="line">
            <UsageRing percent={window.used} size={16} />
            <span class="label">{window.label}</span>
            <strong>{window.used}%</strong>
          </div>
          {#if window.resetsAt}<p class="sub">Starts over {until(window.resetsAt, now)}</p>{/if}
        {/each}
        {#if context}
          <div class="line" class:apart={windows.length > 0}>
            <UsageRing percent={context.percent} size={16} />
            <span class="label">This chat's context</span>
            <strong>{context.percent}%</strong>
          </div>
          <p class="sub">{tokens(context.tokens)} of {tokens(context.max)} tokens</p>
        {/if}
        <a href="#/usage" onclick={() => (open = false)}>Open Usage</a>
      </div>
    {/if}
  </span>
{/if}

<style>
  .meter {
    position: relative;
    display: inline-flex;
    flex: none;
  }

  button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
  }

  button:hover,
  button.open {
    background: var(--hover);
  }

  .card {
    position: absolute;
    right: 0;
    bottom: calc(100% + 8px);
    z-index: 30;
    width: 250px;
    padding: 12px 14px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
    font-size: 13.5px;
  }

  .line {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .line + .line,
  .sub + .line {
    margin-top: 8px;
  }

  .line.apart {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  strong {
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  .sub {
    margin: 1px 0 0 24px;
    color: var(--muted);
    font-size: 12.5px;
  }

  a {
    display: block;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    color: var(--link);
    font-weight: 700;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
