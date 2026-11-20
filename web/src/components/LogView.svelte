<script lang="ts">
  import type { LogEntry, LogKind } from '../../../shared/protocol';
  import { providerName } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import ProviderMark from './ProviderMark.svelte';

  // Tool calls and their results are one thing to a reader, so they share a filter.
  const GROUPS: { key: string; label: string; kinds: LogKind[] }[] = [
    { key: 'prompt', label: 'Prompts', kinds: ['prompt'] },
    { key: 'response', label: 'Responses', kinds: ['response'] },
    { key: 'tool', label: 'Tools', kinds: ['tool', 'tool_result'] },
    { key: 'permission', label: 'Permissions', kinds: ['permission'] },
    { key: 'notice', label: 'Notices', kinds: ['notice'] },
  ];

  const KIND_LABELS: Record<LogKind, string> = {
    prompt: 'prompt',
    response: 'response',
    tool: 'tool',
    tool_result: 'result',
    permission: 'permission',
    notice: 'notice',
  };

  const LONG = 600;

  let shown = $state<Record<string, boolean>>(Object.fromEntries(GROUPS.map((g) => [g.key, true])));
  let search = $state('');
  let expanded = $state<Record<string, boolean>>({});

  let scroller = $state<HTMLElement>();
  let list = $state<HTMLElement>();
  let follow = true;

  const visible = $derived.by(() => {
    const kinds = new Set(GROUPS.filter((g) => shown[g.key]).flatMap((g) => g.kinds));
    const needle = search.trim().toLowerCase();
    return app.logs.filter(
      (entry) =>
        kinds.has(entry.kind) &&
        (!needle || entry.text.toLowerCase().includes(needle) || entry.folder.toLowerCase().includes(needle)),
    );
  });

  const today = new Date().toDateString();

  function time(entry: LogEntry): string {
    const date = new Date(entry.ts);
    const clock = date.toLocaleTimeString(undefined, { hour12: false });
    return date.toDateString() === today
      ? clock
      : `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${clock}`;
  }

  function onscroll() {
    if (!scroller) return;
    follow = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  }

  $effect(() => {
    void app.watchLogs(true);
    return () => void app.watchLogs(false);
  });

  // Stay on the newest line, like `tail -f`, unless the reader has scrolled up.
  $effect(() => {
    const view = scroller;
    const content = list;
    if (!view || !content) return;
    const observer = new ResizeObserver(() => {
      if (follow) view.scrollTop = view.scrollHeight;
    });
    observer.observe(view);
    observer.observe(content);
    return () => observer.disconnect();
  });
</script>

<div class="tools">
  <div class="filters" role="group" aria-label="Show">
    {#each GROUPS as group (group.key)}
      <button class="chip" class:on={shown[group.key]} aria-pressed={shown[group.key]} onclick={() => (shown[group.key] = !shown[group.key])}>
        {group.label}
      </button>
    {/each}
  </div>
  <input type="search" placeholder="Filter by text or folder" aria-label="Filter log" bind:value={search} />
</div>

<div class="scroll" bind:this={scroller} {onscroll}>
  <div class="list" bind:this={list}>
    {#each visible as entry (entry.id)}
      {@const long = entry.text.length > LONG}
      <div class="entry" class:error={entry.error}>
        <div class="meta">
          <time datetime={new Date(entry.ts).toISOString()}>{time(entry)}</time>
          <span class={`kind ${entry.kind}`}>{KIND_LABELS[entry.kind]}</span>
          <a href={`#/s/${entry.sessionId}`} title="Open this chat">{entry.folder}</a>
          {#if entry.provider}
            <span class="agent {entry.provider}" title={`Ran on ${providerName(entry.provider)}`}><ProviderMark provider={entry.provider} size={11} />{providerName(entry.provider)}</span>
          {/if}
          {#if entry.model}<span class="model">{entry.model}</span>{/if}
        </div>
        <pre>{long && !expanded[entry.id] ? `${entry.text.slice(0, LONG)}…` : entry.text}</pre>
        {#if long}
          <button class="more" onclick={() => (expanded[entry.id] = !expanded[entry.id])}>
            {expanded[entry.id] ? 'Show less' : `Show all ${entry.text.length.toLocaleString()} characters`}
          </button>
        {/if}
      </div>
    {:else}
      <p class="empty">
        {app.logs.length ? 'Nothing matches the filters.' : 'Nothing logged yet. Send a message in a chat and it shows up here.'}
      </p>
    {/each}
  </div>
</div>

<footer>
  <span>{visible.length.toLocaleString()} of {app.logs.length.toLocaleString()} recent entries</span>
  {#if app.logDir}<span class="dir">Full log files on the server: <code>{app.logDir}</code></span>{/if}
</footer>

<style>
  .agent {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--provider-claude);
    font-size: 12px;
    font-weight: 700;
  }

  .agent.codex {
    color: var(--provider-codex);
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    padding: 4px 11px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: none;
    color: var(--muted);
    font-size: 13px;
  }

  .chip.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--text);
  }

  input {
    flex: 1;
    min-width: 160px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    font-size: 14px;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .entry {
    padding: 8px 16px;
    border-bottom: 1px solid var(--border);
  }

  .entry.error {
    background: var(--danger-soft);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    color: var(--muted);
    font: 12.5px var(--mono);
  }

  .meta a {
    color: var(--link);
    text-decoration: none;
  }

  .meta a:hover {
    text-decoration: underline;
  }

  .kind {
    padding: 0 7px;
    border-radius: 999px;
    background: var(--sunken);
    color: var(--text);
  }

  .kind.prompt,
  .kind.response {
    background: var(--accent-soft);
  }

  .kind.response {
    font-weight: 600;
  }

  pre {
    margin: 4px 0 0;
    font: 12.5px/1.5 var(--mono);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .more {
    margin-top: 2px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--link);
    font-size: 12.5px;
  }

  .empty {
    margin: 0;
    padding: 12vh 16px;
    color: var(--muted);
    text-align: center;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px 16px;
    padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 12.5px;
  }

  .dir {
    overflow-wrap: anywhere;
  }

  code {
    font-family: var(--mono);
  }
</style>
