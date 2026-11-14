<script lang="ts">
  import type { EffortLevel, PermissionMode } from '../../../shared/protocol';
  import { app } from '../lib/state.svelte';

  const MODES: { value: PermissionMode; label: string }[] = [
    { value: 'default', label: 'Ask before changes' },
    { value: 'acceptEdits', label: 'Accept file edits' },
    { value: 'plan', label: 'Plan only' },
  ];

  const EFFORT_LABELS: Record<EffortLevel, string> = {
    low: 'Low effort',
    medium: 'Medium effort',
    high: 'High effort',
    xhigh: 'Extra high effort',
    max: 'Max effort',
  };

  // The list's own "default" row stands for "let Claude Code choose".
  const DEFAULT_MODEL = 'default';

  let text = $state('');
  let area = $state<HTMLTextAreaElement>();

  // On a touch keyboard Enter should add a line; sending is the button's job.
  const touch = matchMedia('(pointer: coarse)').matches;
  const ready = $derived(app.connected && app.meta !== null);

  const modelValue = $derived(app.meta?.model ?? DEFAULT_MODEL);
  /** Effort levels the chosen model accepts; empty when it has none to choose from. */
  const efforts = $derived(app.models.find((m) => m.value === modelValue)?.efforts ?? []);
  // Switching mid-turn would change the model under a reply that is still being written.
  const canConfigure = $derived(ready && !app.running);

  function pickModel(value: string) {
    const next = app.models.find((m) => m.value === value);
    const effort = app.meta?.effort ?? null;
    // Keep the effort only if the new model has that level.
    app.configure(value === DEFAULT_MODEL ? null : value, effort && next?.efforts.includes(effort) ? effort : null);
  }

  function pickEffort(value: string) {
    app.configure(app.meta?.model ?? null, value ? (value as EffortLevel) : null);
  }

  function send() {
    const message = text.trim();
    if (!message || !ready || app.running) return;
    if (app.prompt(message)) text = '';
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !touch) {
      event.preventDefault();
      send();
    }
  }

  // Grow with the text, up to a point.
  $effect(() => {
    text;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 220)}px`;
  });
</script>

<div class="composer">
  <div class="box">
    <textarea
      bind:this={area}
      bind:value={text}
      {onkeydown}
      rows="1"
      placeholder={app.running ? 'Claude is working…' : 'Message Claude…'}
      aria-label="Message"
      disabled={!ready}
    ></textarea>
    <div class="row">
      <div class="pickers">
        <select
          aria-label="Permission mode"
          value={app.meta?.mode ?? 'default'}
          disabled={!ready}
          onchange={(event) => app.setMode(event.currentTarget.value as PermissionMode)}
        >
          {#each MODES as mode (mode.value)}
            <option value={mode.value}>{mode.label}</option>
          {/each}
        </select>
        {#if app.models.length}
          <select
            aria-label="Model"
            value={modelValue}
            disabled={!canConfigure}
            onchange={(event) => pickModel(event.currentTarget.value)}
          >
            {#each app.models as model (model.value)}
              <option value={model.value}>{model.label}</option>
            {/each}
          </select>
          {#if efforts.length}
            <select
              aria-label="Effort"
              value={app.meta?.effort ?? ''}
              disabled={!canConfigure}
              onchange={(event) => pickEffort(event.currentTarget.value)}
            >
              <option value="">Default effort</option>
              {#each efforts as effort (effort)}
                <option value={effort}>{EFFORT_LABELS[effort]}</option>
              {/each}
            </select>
          {/if}
        {/if}
      </div>
      {#if app.running}
        <button class="btn stop" onclick={() => app.interrupt()}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill="currentColor" /></svg>
          Stop
        </button>
      {:else}
        <button class="btn primary" disabled={!ready || !text.trim()} onclick={send}>Send</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .composer {
    padding: 8px 16px calc(12px + env(safe-area-inset-bottom));
  }

  .box {
    max-width: 780px;
    margin: 0 auto;
    display: grid;
    gap: 6px;
    padding: 10px 10px 8px 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
  }

  .box:focus-within {
    border-color: var(--accent);
  }

  textarea {
    width: 100%;
    padding: 2px 0;
    border: 0;
    outline: 0;
    resize: none;
    background: none;
    font-size: 16px;
    line-height: 1.45;
  }

  .row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8px;
  }

  .pickers {
    display: flex;
    flex-wrap: wrap;
    min-width: 0;
    margin-left: -6px;
  }

  select {
    min-width: 0;
    max-width: 100%;
    height: 32px;
    padding: 0 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    font-size: 13px;
  }

  .stop {
    color: var(--danger);
  }
</style>
