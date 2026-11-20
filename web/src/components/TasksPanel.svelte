<script lang="ts">
  import { tick } from 'svelte';
  import type { BackgroundTask } from '../../../shared/protocol';
  import { tokens, providerName } from '../lib/format';
  import { placeBelow } from '../lib/popover';
  import { app } from '../lib/state.svelte';

  // The Background chip beside the chat's title, and the list it opens: the
  // shell commands and agents Claude left running in this chat, each with how
  // long it has been going and a Stop button, then what finished lately.

  let open = $state(false);
  let chip = $state<HTMLButtonElement>();
  let card = $state<HTMLElement>();
  let place = $state({ top: 0, left: 0, width: 420 });
  let now = $state(Date.now());
  /** Tasks a Stop was sent for, until Claude Code reports them stopped. */
  let stopping = $state<Record<string, boolean>>({});
  let error = $state('');

  const tasks = $derived(app.meta?.tasks ?? []);
  const running = $derived(tasks.filter((task) => task.status === 'running'));
  const finished = $derived(tasks.filter((task) => task.status !== 'running'));
  const summary = $derived(
    running.length
      ? `Background: ${running.length} task${running.length === 1 ? '' : 's'} running`
      : 'Background tasks and agents: none running',
  );

  // Running times keep counting while the list is open.
  $effect(() => {
    if (!open || !running.length) return;
    now = Date.now();
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  // Another chat: close, and forget Stops sent in the last one.
  $effect(() => {
    app.sessionId;
    open = false;
    stopping = {};
    error = '';
  });

  async function toggle() {
    open = !open;
    if (!open) return;
    now = Date.now();
    if (chip) place = placeBelow(chip, 440);
    await tick();
    card?.focus();
  }

  async function stop(task: BackgroundTask) {
    const id = app.sessionId;
    if (!id) return;
    stopping[task.id] = true;
    error = '';
    try {
      await app.stopTask(id, task.id);
    } catch (err) {
      delete stopping[task.id];
      error = err instanceof Error ? err.message : String(err);
    }
  }

  /** "42 s", "3 min 5 s", "1 h 12 min". */
  function span(ms: number): string {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min${seconds % 60 ? ` ${seconds % 60} s` : ''}`;
    return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  }

  const KIND: Record<BackgroundTask['kind'], string> = {
    agent: 'Agent',
    shell: 'Shell command',
    monitor: 'Watcher',
    workflow: 'Workflow',
    other: 'Task',
  };

  const ENDED: Record<Exclude<BackgroundTask['status'], 'running'>, string> = {
    completed: 'Done',
    failed: 'Failed',
    stopped: 'Stopped',
  };

  function details(task: BackgroundTask): string {
    const parts = [task.agentType ? `${KIND[task.kind]} · ${task.agentType}` : KIND[task.kind]];
    if (task.status === 'running') parts.push(`for ${span(now - task.startedAt)}`);
    else if (task.endedAt) parts.push(`took ${span(task.endedAt - task.startedAt)}`);
    if (task.toolUses) parts.push(`${task.toolUses} tool use${task.toolUses === 1 ? '' : 's'}`);
    if (task.tokens) parts.push(`${tokens(task.tokens)} tokens`);
    return parts.join(' · ');
  }
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
    if (open && chip) place = placeBelow(chip, 440);
  }}
/>

{#snippet kindIcon(kind: BackgroundTask['kind'])}
  {#if kind === 'agent'}
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="8" cy="5.5" r="2.75" />
      <path d="M2.75 14c.6-2.6 2.7-4.25 5.25-4.25s4.65 1.65 5.25 4.25" />
    </svg>
  {:else if kind === 'shell'}
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M4.5 6l2 2-2 2M8.5 10h3" />
    </svg>
  {:else if kind === 'monitor'}
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  {:else}
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
      <path d="M7 4.5h2.5a2 2 0 0 1 2 2V9" />
    </svg>
  {/if}
{/snippet}

<button class="chip" class:open class:busy={running.length > 0} bind:this={chip} aria-haspopup="dialog" aria-expanded={open} aria-label={summary} title={summary} onclick={toggle}>
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">
    <path d="M8 1.75 14.25 5 8 8.25 1.75 5z" />
    <path d="M1.75 8 8 11.25 14.25 8M1.75 11 8 14.25 14.25 11" />
  </svg>
  <span class="word">Background</span>
  {#if running.length}
    <span class="pulse" aria-hidden="true"></span>
    <strong>{running.length}</strong>
  {/if}
  <svg class="caret" width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 3.5 5 6.5l3-3" />
  </svg>
</button>

{#if open}
  <div
    class="card"
    role="dialog"
    aria-label="Background tasks and agents"
    tabindex="-1"
    bind:this={card}
    style:top={`${place.top}px`}
    style:left={`${place.left}px`}
    style:width={`${place.width}px`}
  >
    <header>
      <h2>Background</h2>
      <p>Shell commands and agents {providerName(app.provider)} left running in this chat while it carries on.</p>
    </header>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if running.length}
      <section>
        <h3>Running <span class="count">{running.length}</span></h3>
        <ul>
          {#each running as task (task.id)}
            <li class="task">
              <span class="icon live">{@render kindIcon(task.kind)}</span>
              <div class="body">
                <p class="title" title={task.description}>{task.description}</p>
                <p class="meta">{details(task)}{task.lastTool ? ` · using ${task.lastTool}` : ''}</p>
                {#if task.summary}<p class="summary">{task.summary}</p>{/if}
              </div>
              <button class="stop" disabled={stopping[task.id]} onclick={() => stop(task)}>
                {stopping[task.id] ? 'Stopping…' : 'Stop'}
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <p class="empty">
        Nothing is running in the background. When {providerName(app.provider)} starts a long command or hands work to an agent in the
        background, it shows up here while it runs.
      </p>
    {/if}

    {#if finished.length}
      <section>
        <h3>Finished <span class="count">{finished.length}</span></h3>
        <ul>
          {#each finished as task (task.id)}
            {@const ended = task.status as Exclude<BackgroundTask['status'], 'running'>}
            <li class="task done">
              <span class="icon">{@render kindIcon(task.kind)}</span>
              <div class="body">
                <p class="title" title={task.description}>{task.description}</p>
                <p class="meta">
                  <span class="state {ended}">{ENDED[ended]}</span> · {details(task)}
                </p>
                {#if task.error || task.summary}<p class="summary" title={task.error ?? task.summary}>{task.error ?? task.summary}</p>{/if}
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: 6px;
    padding: 2px 6px 2px 5px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: none;
    color: inherit;
    font-size: 12px;
    vertical-align: middle;
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

  /* Lit and breathing while something runs, like a chat's dot in the sidebar. */
  .pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--presence);
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }

  .card {
    position: fixed;
    z-index: 40;
    display: grid;
    gap: 14px;
    max-height: calc(100dvh - 80px);
    overflow-y: auto;
    padding: 14px 16px;
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
    display: grid;
    gap: 2px;
  }

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 900;
  }

  header p,
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 6px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .count {
    padding: 0 6px;
    border-radius: 999px;
    background: var(--sunken);
    font-size: 11.5px;
    letter-spacing: 0;
    line-height: 17px;
  }

  ul {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .task {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px;
    border-radius: 8px;
  }

  .task:hover {
    background: var(--hover);
  }

  .icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: var(--sunken);
    color: var(--muted);
  }

  .icon.live {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .body {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .body p {
    margin: 0;
  }

  .title {
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    font-weight: 700;
  }

  .done .title {
    font-weight: 600;
  }

  .meta,
  .summary {
    color: var(--muted);
    font-size: 12.5px;
  }

  .summary {
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .state {
    font-weight: 700;
  }

  .state.completed {
    color: var(--presence);
  }

  .state.failed {
    color: var(--danger);
  }

  .stop {
    flex: none;
    padding: 3px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--danger);
    font-size: 12.5px;
    font-weight: 700;
  }

  .stop:hover:not(:disabled) {
    border-color: var(--danger);
    background: var(--danger-soft);
  }

  .stop:disabled {
    color: var(--muted);
    cursor: default;
  }

  .error {
    margin: 0;
    color: var(--danger);
  }

  @media (max-width: 600px) {
    .word {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
    }
  }
</style>
