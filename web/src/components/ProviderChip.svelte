<script lang="ts">
  import { tick } from 'svelte';
  import type { Provider } from '../../../shared/protocol';
  import { modelName, providerMaker, providerName, until } from '../lib/format';
  import { placeBelow } from '../lib/popover';
  import { app } from '../lib/state.svelte';
  import ProviderMark from './ProviderMark.svelte';
  import UsageRing from './UsageRing.svelte';

  // The first thing under a chat's title: which agent it runs on. A click
  // shows the agent's account and plan, what the chat runs, the plan's limits,
  // and a way over to the other agent.

  let open = $state(false);
  let chip = $state<HTMLButtonElement>();
  let card = $state<HTMLElement>();
  let place = $state({ top: 0, left: 0, width: 340 });
  let now = $state(Date.now());

  const provider = $derived(app.provider);
  const name = $derived(providerName(provider));
  const account = $derived(app.providers.find((p) => p.provider === provider));
  const usage = $derived(app.usages[provider]);
  const model = $derived(app.meta?.activeModel ?? app.meta?.model ?? undefined);
  /** The agents this chat could move to, and the model each would start on. */
  const others = $derived(
    app.providers
      .filter((p) => p.provider !== provider && p.available && p.models.length)
      .map((p) => ({ provider: p.provider, model: (p.models.find((m) => m.isDefault) ?? p.models[0])!.value })),
  );
  const switched = $derived(app.items.some((item) => item.kind === 'divider'));
  const MODES: Record<string, string> = { default: 'Ask before changes', acceptEdits: 'Accept file edits', plan: 'Plan only', auto: 'Auto' };

  function position() {
    if (chip) place = placeBelow(chip, 340);
  }

  async function toggle() {
    open = !open;
    if (!open) return;
    now = Date.now();
    position();
    void app.loadModels();
    await tick();
    card?.focus();
  }

  function moveTo(to: Provider, toModel: string) {
    open = false;
    // Claude's own list starts with a "default" row; Codex names its default model.
    app.switching = { provider: to, model: to === 'claude' ? null : toModel, effort: null };
  }

  $effect(() => {
    app.sessionId;
    open = false;
  });
</script>

<svelte:window
  onpointerdown={(event) => {
    const target = event.target as Node;
    if (open && !chip?.contains(target) && !card?.contains(target)) open = false;
  }}
  onkeydown={(event) => {
    if (open && event.key === 'Escape') {
      open = false;
      chip?.focus();
    }
  }}
  onresize={() => {
    if (open) position();
  }}
/>

<button
  class="chip {provider}"
  class:open
  bind:this={chip}
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-label={`Runs on ${name}${switched ? ', switched during the chat' : ''}`}
  title={`Runs on ${name} (${providerMaker(provider)})`}
  onclick={toggle}
>
  <ProviderMark {provider} size={12} />
  <strong>{name}</strong>
  <svg class="caret" width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 3.5 5 6.5l3-3" />
  </svg>
</button>

{#if open}
  <div
    class="card"
    role="dialog"
    aria-label={`${name} in this chat`}
    tabindex="-1"
    bind:this={card}
    style:top={`${place.top}px`}
    style:left={`${place.left}px`}
    style:width={`${place.width}px`}
  >
    <header>
      <span class="tile {provider}"><ProviderMark {provider} size={16} /></span>
      <div>
        <h2>{name}</h2>
        <p>
          {providerMaker(provider)}{account?.plan ? ` · ${account.plan.charAt(0).toUpperCase()}${account.plan.slice(1)}` : ''}
        </p>
      </div>
    </header>

    <dl>
      <dt>Model</dt>
      <dd>{model ? modelName(model) : 'Default'}</dd>
      <dt>Mode</dt>
      <dd>{MODES[app.meta?.mode ?? 'auto']}</dd>
    </dl>

    {#if usage?.available && usage.windows.length}
      <ul class="limits">
        {#each usage.windows as window (window.id)}
          <li>
            <UsageRing percent={window.used} size={15} />
            <span>{window.label}</span>
            <strong>{window.used}%</strong>
            {#if window.resetsAt}<small>Starts over {until(window.resetsAt, now)}</small>{/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if switched}
      <p class="note">This chat has run on more than one agent; the lines in the conversation show where it switched.</p>
    {/if}

    <div class="actions">
      {#each others as other (other.provider)}
        <button class="btn" disabled={app.running} onclick={() => moveTo(other.provider, other.model)}>
          <ProviderMark provider={other.provider} size={13} /> Switch to {providerName(other.provider)}…
        </button>
      {/each}
      <a href="#/usage" onclick={() => (open = false)}>Usage</a>
      <a href="#/tools" onclick={() => (open = false)}>Tools</a>
    </div>
  </div>
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 6px 2px 5px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: none;
    color: inherit;
    font-size: 12px;
    vertical-align: middle;
  }

  .chip :global(.mark) {
    color: var(--provider-claude);
  }

  .chip.codex :global(.mark) {
    color: var(--provider-codex);
  }

  .chip:hover,
  .chip.open {
    border-color: var(--border-strong);
    background: var(--hover);
    color: var(--text);
  }

  .chip strong {
    color: var(--text);
    font-weight: 700;
  }

  .caret {
    opacity: 0.7;
  }

  .card {
    position: fixed;
    z-index: 40;
    display: grid;
    gap: 12px;
    max-height: calc(100dvh - 80px);
    overflow-y: auto;
    padding: 14px 16px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
    font-size: 13.5px;
    white-space: normal;
  }

  .card:focus {
    outline: none;
  }

  header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  header h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 900;
  }

  header p {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  .tile {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 7px;
    background: var(--provider-claude);
    color: #fff;
  }

  .tile.codex {
    background: var(--provider-codex);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
    font-weight: 600;
  }

  .limits {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .limits li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 2px 8px;
  }

  .limits small {
    grid-column: 2 / -1;
    color: var(--muted);
    font-size: 12px;
  }

  .note {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .actions .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .actions a {
    color: var(--link);
    font-size: 13px;
  }
</style>
