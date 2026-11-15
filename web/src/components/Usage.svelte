<script lang="ts">
  import { onMount } from 'svelte';
  import { ago, tokens, until, when } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import UsageRing from './UsageRing.svelte';

  let { onmenu }: { onmenu: () => void } = $props();

  // "Resets in 2 h 14 min" has to keep counting while the page is open.
  let now = $state(Date.now());

  onMount(() => {
    void app.loadUsage();
    const tick = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(tick);
  });

  const usage = $derived(app.usage);
  const plan = $derived(usage?.plan ? usage.plan[0]!.toUpperCase() + usage.plan.slice(1) : '');

  /** What each limit is, in a sentence. */
  const NOTES: Record<string, string> = {
    session: 'Everything you do with Claude in the current five-hour window, across all your devices.',
    week: 'Everything you do with Claude in the current week.',
  };

  function money(amount: number, currency: string | null): string {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency ?? 'USD' }).format(amount);
    } catch {
      return String(amount);
    }
  }
</script>

<header class="pane-bar">
  <button class="icon-btn menu" aria-label="Open menu" onclick={onmenu}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  </button>
  <h1>Usage</h1>
  {#if plan}<span class="plan">Claude {plan}</span>{/if}
  <span class="spacer"></span>
  {#if usage}<span class="age">Updated {ago(usage.fetchedAt) === 'now' ? 'just now' : `${ago(usage.fetchedAt)} ago`}</span>{/if}
  <button class="btn" disabled={app.usageLoading} onclick={() => app.loadUsage(true)}>
    {#if app.usageLoading}<span class="spinner"></span>{/if}
    Refresh
  </button>
</header>

<div class="scroll">
  <div class="page">
    {#if !usage}
      <p class="note"><span class="spinner"></span> Asking Claude Code how much of your plan is used…</p>
    {:else if !usage.available}
      <section>
        <h2>Plan limits</h2>
        <p class="note">
          {#if usage.error}
            The figures could not be read: {usage.error}
          {:else}
            There are no plan limits to show. They apply to Claude subscriptions; with an API key or a cloud provider,
            usage is billed as it goes instead.
          {/if}
        </p>
      </section>
    {:else}
      <section>
        <h2>Plan limits</h2>
        <p class="hint">
          How much of your Claude plan is used. These limits are shared by everything you do with Claude, not only what
          goes through clack.
        </p>
        <ul class="limits">
          {#each usage.windows as window (window.id)}
            <li>
              <div class="top">
                <UsageRing percent={window.used} size={22} />
                <strong>{window.label}</strong>
                <span class="value">{window.used}% used</span>
              </div>
              <div class="bar" role="meter" aria-label={window.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={window.used}>
                <span style:width={`${window.used}%`} class:warn={window.used >= 70} class:full={window.used >= 90}></span>
              </div>
              <p class="foot">
                <span>{100 - window.used}% left</span>
                {#if window.resetsAt}<span>Starts over {until(window.resetsAt, now)} ({when(window.resetsAt)})</span>{/if}
              </p>
              {#if NOTES[window.id]}<p class="what">{NOTES[window.id]}</p>{/if}
            </li>
          {/each}
        </ul>
      </section>

      {#if usage.extra}
        <section>
          <h2>Extra usage</h2>
          <p class="hint">Pay-as-you-go usage that takes over when a plan limit is reached.</p>
          <ul class="limits">
            <li>
              <div class="top">
                {#if usage.extra.percent !== null}<UsageRing percent={usage.extra.percent} size={22} />{/if}
                <strong>This month</strong>
                <span class="value">
                  {money(usage.extra.used, usage.extra.currency)}{usage.extra.limit !== null ? ` of ${money(usage.extra.limit, usage.extra.currency)}` : ''}
                </span>
              </div>
              {#if usage.extra.percent !== null}
                <div class="bar"><span style:width={`${usage.extra.percent}%`} class:warn={usage.extra.percent >= 70} class:full={usage.extra.percent >= 90}></span></div>
              {/if}
            </li>
          </ul>
        </section>
      {/if}
    {/if}

    {#if app.meta?.context}
      {@const context = app.meta.context}
      <section>
        <h2>Open chat</h2>
        <p class="hint">How full the model's context window is in the chat that is open. When it fills up, Claude Code sums up the earlier conversation to make room.</p>
        <ul class="limits">
          <li>
            <div class="top">
              <UsageRing percent={context.percent} size={22} />
              <strong>{app.meta.title ?? 'This chat'}</strong>
              <span class="value">{context.percent}% full</span>
            </div>
            <div class="bar"><span style:width={`${Math.min(100, context.percent)}%`} class:warn={context.percent >= 70} class:full={context.percent >= 90}></span></div>
            <p class="foot"><span>{tokens(context.tokens)} of {tokens(context.max)} tokens</span></p>
          </li>
        </ul>
      </section>
    {/if}
  </div>
</div>

<style>
  .plan {
    flex: none;
    padding: 2px 9px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 700;
  }

  .spacer {
    flex: 1;
  }

  .age {
    flex: none;
    color: var(--muted);
    font-size: 12.5px;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 24px 20px calc(32px + env(safe-area-inset-bottom));
  }

  .page {
    display: grid;
    gap: 32px;
    max-width: 720px;
  }

  section {
    display: grid;
    gap: 10px;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 900;
  }

  .hint,
  .note {
    margin: 0;
    color: var(--muted);
  }

  .note {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .limits {
    display: grid;
    gap: 12px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }

  .limits li {
    display: grid;
    gap: 8px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
  }

  .top {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .top strong {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 900;
  }

  .value {
    flex: none;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .bar {
    height: 8px;
    border-radius: 999px;
    background: var(--sunken);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    min-width: 2px;
    border-radius: 999px;
    background: hsl(208 85% 52%);
    transition: width 0.4s ease;
  }

  .bar .warn {
    background: hsl(38 85% 52%);
  }

  .bar .full {
    background: hsl(2 85% 52%);
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 16px;
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  .what {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  @media (max-width: 820px) {
    .scroll {
      padding-left: 14px;
      padding-right: 14px;
    }

    .age {
      display: none;
    }
  }
</style>
