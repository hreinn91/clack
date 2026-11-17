<script lang="ts">
  import { tick } from 'svelte';
  import type { ContextDetail } from '../../../shared/protocol';
  import { ago, tokens } from '../lib/format';
  import { placeBelow } from '../lib/popover';
  import { app } from '../lib/state.svelte';
  import UsageRing from './UsageRing.svelte';

  // The context chip beside a chat's folder, and the breakdown it opens: how
  // full the context window is, and what is taking up the room.

  let open = $state(false);
  let loading = $state(false);
  let error = $state('');
  /** The last breakdown per chat, so reopening shows something at once while it is measured again. */
  let details = $state<Record<string, ContextDetail>>({});
  let chip = $state<HTMLButtonElement>();
  let card = $state<HTMLElement>();
  let place = $state({ top: 0, left: 0, width: 380 });
  /** The part of the window being pointed at, picked out in both the bar and the list. */
  let hovered = $state<string | null>(null);

  const id = $derived(app.sessionId);
  const detail = $derived(id ? details[id] : undefined);
  const known = $derived(app.meta?.context);
  // The figure the server keeps after every turn; the breakdown brings it up to date when it is measured.
  const percent = $derived(known?.percent ?? detail?.percent);

  /**
   * Each part keeps one colour wherever it shows up, in a fixed order: the
   * conversation first, then what Claude Code brings along every time.
   */
  const SLOTS: Record<string, number> = {
    messages: 1,
    system_prompt: 2,
    system_tools: 3,
    memory_files: 4,
    skills: 5,
    mcp_tools: 6,
    mcp_instructions: 7,
    custom_agents: 8,
  };
  const colour = (rowId: string) => (SLOTS[rowId] ? `var(--series-${SLOTS[rowId]})` : 'var(--border-strong)');

  const used = $derived(
    (detail?.categories ?? [])
      .filter((row) => row.kind === 'used')
      .sort((a, b) => (SLOTS[a.id] ?? 99) - (SLOTS[b.id] ?? 99)),
  );
  const usedTotal = $derived(used.reduce((sum, row) => sum + row.tokens, 0));
  const deferred = $derived((detail?.categories ?? []).filter((row) => row.kind === 'deferred'));
  const share = (part: number, whole: number) => (whole ? `${Math.max(1, Math.round((part / whole) * 100))}%` : '');
  const summary = $derived(percent === undefined ? 'Context window: not measured yet' : `Context window: ${percent}% full`);

  async function measure() {
    const session = id;
    if (!session || loading) return;
    loading = true;
    error = '';
    try {
      details[session] = await app.loadContext(session);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  function position() {
    if (chip) place = placeBelow(chip);
  }

  async function toggle() {
    open = !open;
    if (!open) return;
    position();
    void measure();
    await tick();
    card?.focus();
  }

  // Another chat, another context: close and forget what was showing.
  $effect(() => {
    id;
    open = false;
    error = '';
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

<button class="chip" class:open bind:this={chip} aria-haspopup="dialog" aria-expanded={open} aria-label={summary} title={summary} onclick={toggle}>
  {#if percent !== undefined}
    <UsageRing {percent} size={14} />
    <span class="word">Context</span>
    <strong>{percent}%</strong>
  {:else}
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="2" />
      <path d="M2 7h12" />
    </svg>
    <span class="word">Context</span>
  {/if}
  <svg class="caret" width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 3.5 5 6.5l3-3" />
  </svg>
</button>

{#if open}
  <div
    class="card"
    role="dialog"
    aria-label="Context window"
    tabindex="-1"
    bind:this={card}
    style:top={`${place.top}px`}
    style:left={`${place.left}px`}
    style:width={`${place.width}px`}
  >
    <header>
      <h2>Context window</h2>
      <button class="refresh" class:spin={loading} aria-label="Measure again" title="Measure again" disabled={loading} onclick={measure}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M16 10a6 6 0 1 1-1.8-4.3M16.5 3.5v3h-3" />
        </svg>
      </button>
    </header>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    {#if detail}
      <div class="headline">
        <UsageRing percent={detail.percent} size={34} />
        <div>
          <p class="big"><strong>{detail.percent}%</strong> full</p>
          <p class="sub">{tokens(detail.tokens)} of {tokens(detail.max)} tokens</p>
        </div>
      </div>
      {#if detail.autoCompactAt}
        <p class="note">
          Claude Code compacts the conversation on its own at {tokens(detail.autoCompactAt)}
          ({Math.round((detail.autoCompactAt / detail.max) * 100)}%), {tokens(Math.max(0, detail.autoCompactAt - detail.tokens))} from now.
        </p>
      {:else}
        <p class="note">Automatic compacting is off: when the window is full, the conversation has to be compacted or cleared by hand.</p>
      {/if}

      <section>
        <h3>What is in it</h3>
        <!-- The parts of what is used, side by side; every figure is also in the list below. -->
        <div class="bar" role="img" aria-label={used.map((row) => `${row.name} ${tokens(row.tokens)}`).join(', ')}>
          {#each used as row (row.id)}
            <!-- Pointing only picks the part out; the list below says the same in words. -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
              class="part"
              class:dim={hovered !== null && hovered !== row.id}
              style:flex-grow={row.tokens}
              style:background={colour(row.id)}
              title={`${row.name}: ${tokens(row.tokens)} tokens (${share(row.tokens, usedTotal)} of what is used)`}
              onpointerenter={() => (hovered = row.id)}
              onpointerleave={() => (hovered = null)}
            ></span>
          {/each}
        </div>
        <table>
          <tbody>
            {#each used as row (row.id)}
              <tr class:dim={hovered !== null && hovered !== row.id} onpointerenter={() => (hovered = row.id)} onpointerleave={() => (hovered = null)}>
                <th scope="row"><span class="swatch" style:background={colour(row.id)}></span>{row.name}</th>
                <td>{tokens(row.tokens)}</td>
                <td class="pct">{share(row.tokens, usedTotal)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if deferred.length}
          <p class="note">
            Loaded only when Claude needs them, so not counted: {deferred.map((row) => `${row.name.replace(/\s*\(deferred\)/i, '')} (${tokens(row.tokens)})`).join(', ')}.
          </p>
        {/if}
      </section>

      {#if detail.messages.length}
        <section>
          <h3>Messages, in parts</h3>
          <table>
            <tbody>
              {#each detail.messages as row (row.label)}
                <tr>
                  <th scope="row">{row.label}</th>
                  <td>{tokens(row.tokens)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if detail.messages.some((row) => row.label === 'Added by Claude Code')}
            <p class="note">What Claude Code adds along the way: reminders, lists of what it can use, and the contents of files it attaches.</p>
          {/if}
        </section>
      {/if}

      {#if detail.memoryFiles.length}
        <section>
          <h3>Instructions and memory</h3>
          <table>
            <tbody>
              {#each detail.memoryFiles as file (file.path)}
                <tr>
                  <th scope="row" title={file.path}><span class="path">{file.path}</span><span class="kind">{file.type}</span></th>
                  <td>{tokens(file.tokens)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/if}

      {#if detail.mcpServers.length}
        <section>
          <h3>MCP servers</h3>
          <table>
            <tbody>
              {#each detail.mcpServers as server (server.name)}
                <tr>
                  <th scope="row">{server.name}<span class="kind">{server.tools} tool{server.tools === 1 ? '' : 's'}</span></th>
                  <td>{tokens(server.tokens)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/if}

      {#if detail.skills || detail.agents.length}
        <section>
          <h3>Skills and agents</h3>
          <table>
            <tbody>
              {#if detail.skills}
                <tr>
                  <th scope="row">Skills<span class="kind">{detail.skills.included} of {detail.skills.total} listed</span></th>
                  <td>{tokens(detail.skills.tokens)}</td>
                </tr>
              {/if}
              {#each detail.agents as agent (agent.name)}
                <tr>
                  <th scope="row">{agent.name}<span class="kind">agent</span></th>
                  <td>{tokens(agent.tokens)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/if}

      <p class="foot">
        {#if loading}
          {detail.model} · measuring again…
        {:else}
          {@const when = ago(detail.measuredAt)}
          {detail.model} · measured {when === 'now' ? 'just now' : `${when} ago`}
        {/if}
      </p>
    {:else if loading}
      <p class="wait"><span class="spinner"></span> Measuring… The first time, Claude Code has to start for this chat.</p>
    {/if}
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
    gap: 14px;
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
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 900;
  }

  h3 {
    margin: 0 0 6px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .refresh {
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

  .refresh:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }

  .refresh.spin svg {
    animation: spin 0.8s linear infinite;
  }

  .headline {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .headline p {
    margin: 0;
  }

  .big {
    font-size: 15px;
  }

  .big strong {
    font-size: 22px;
    font-weight: 900;
  }

  .sub,
  .note,
  .foot {
    color: var(--muted);
  }

  .note {
    margin: -6px 0 0;
    font-size: 12.5px;
  }

  section .note {
    margin-top: 6px;
  }

  .foot {
    margin: 0;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    font-size: 12px;
  }

  /* A thin bar split into parts, 2px apart, with rounded ends. */
  .bar {
    display: flex;
    gap: 2px;
    height: 8px;
    margin-bottom: 8px;
    overflow: hidden;
    border-radius: 999px;
  }

  .part {
    flex: 1 1 0;
    min-width: 3px;
    transition: opacity 0.15s;
  }

  .dim {
    opacity: 0.35;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 3px 0;
    font-weight: 400;
    text-align: left;
    vertical-align: baseline;
  }

  th {
    width: 100%;
    max-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  td {
    padding-left: 12px;
    white-space: nowrap;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  td.pct {
    min-width: 38px;
    color: var(--muted);
  }

  tr {
    transition: opacity 0.15s;
  }

  .swatch {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 8px;
    border-radius: 3px;
    vertical-align: -0.5px;
  }

  .path {
    font: 12.5px var(--mono);
  }

  .kind {
    margin-left: 7px;
    color: var(--muted);
    font-size: 12px;
  }

  .error {
    margin: 0;
    color: var(--danger);
  }

  .wait {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--muted);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 600px) {
    .word {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .part,
    tr {
      transition: none;
    }

    .refresh.spin svg {
      animation: none;
    }
  }
</style>
