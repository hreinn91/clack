<script lang="ts">
  import type { Provider, StatsRange, StatsReport, StatsScope } from '../../../shared/protocol';
  import { api } from '../lib/api';
  import { ago, modelName } from '../lib/format';
  import { change, compact, dayName, duration, full, money, share } from '../lib/statsFormat';
  import Calendar from './stats/Calendar.svelte';
  import DailyChart from './stats/DailyChart.svelte';
  import WeekHours from './stats/WeekHours.svelte';
  import ProviderMark from './ProviderMark.svelte';

  let { onmenu }: { onmenu: () => void } = $props();

  // How the agents have been used, from their own records on this computer
  // (Claude Code's and Codex's transcripts) and Clack's: when, how much, on
  // what and where. Reading them costs no tokens.

  const SAVED = 'clack.stats';
  function saved(): { range: StatsRange; provider: Provider | 'all'; scope: StatsScope } {
    try {
      const value = JSON.parse(localStorage.getItem(SAVED) ?? 'null');
      if (value && typeof value === 'object') return { range: value.range ?? '30', provider: value.provider ?? 'all', scope: value.scope ?? 'all' };
    } catch {
      // Defaults below.
    }
    return { range: '30', provider: 'all', scope: 'all' };
  }

  const start = saved();
  let range = $state<StatsRange>(start.range);
  let provider = $state<Provider | 'all'>(start.provider);
  let scope = $state<StatsScope>(start.scope);
  let folder = $state<{ cwd: string; label: string } | null>(null);
  let metric = $state<'tokens' | 'prompts' | 'agentMs' | 'costUsd'>('tokens');
  let view = $state<'chart' | 'table'>('chart');
  let showAllProjects = $state(false);

  let report = $state<StatsReport | null>(null);
  let loading = $state(false);
  let error = $state('');
  let request = 0;

  const RANGES: { value: StatsRange; label: string }[] = [
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
    { value: '90', label: '90 days' },
    { value: 'all', label: 'All time' },
  ];

  async function load() {
    const mine = ++request;
    loading = true;
    error = '';
    const params = new URLSearchParams({ range, provider, scope, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (folder) params.set('folder', folder.cwd);
    try {
      const answer = await api<StatsReport>(`/api/stats?${params}`);
      if (mine === request) report = answer;
    } catch (err) {
      if (mine === request) error = err instanceof Error ? err.message : String(err);
    } finally {
      if (mine === request) loading = false;
    }
  }

  // Every filter scopes the whole page; the last ones are remembered in this browser.
  $effect(() => {
    void [range, provider, scope, folder];
    try {
      localStorage.setItem(SAVED, JSON.stringify({ range, provider, scope }));
    } catch {
      // Not remembered this time.
    }
    void load();
  });

  const agents = $derived<('claude' | 'codex')[]>(provider === 'all' ? ['claude', 'codex'] : [provider]);
  const periodName = $derived(range === 'all' ? '' : `previous ${RANGES.find((r) => r.value === range)!.label}`);
  const t = $derived(report?.totals);
  const p = $derived(report?.previous ?? undefined);
  const tokenTotal = $derived(report ? report.tokens.input + report.tokens.output + report.tokens.cacheRead + report.tokens.cacheWrite : 0);
  const inputTotal = $derived(report ? report.tokens.input + report.tokens.cacheRead + report.tokens.cacheWrite : 0);
  const maxModel = $derived(Math.max(1, ...(report?.models.map((m) => m.tokens) ?? [])));
  const maxTool = $derived(Math.max(1, ...(report?.tools.map((x) => x.calls) ?? [])));
  const maxProject = $derived(Math.max(1, ...(report?.projects.map((x) => x.tokens) ?? [])));
  const projects = $derived(showAllProjects ? (report?.projects ?? []) : (report?.projects ?? []).slice(0, 8));
  const permissionCount = $derived(report ? report.permissions.allowed + report.permissions.always + report.permissions.declined : 0);
  const nothing = $derived(!!report && !report.totals.prompts && !report.totals.tokens);
  const selection = $derived(report?.days.length ? { from: report.days[0]!.day, to: report.days.at(-1)!.day } : undefined);
  const claudeOnly = $derived(provider === 'codex');

  /** "mcp__github__create_issue" reads better as "github · create_issue". */
  function toolName(name: string): string {
    const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
    return mcp ? `${mcp[1]} · ${mcp[2]}` : name;
  }

  function pickFolder(cwd: string, label: string) {
    folder = folder?.cwd === cwd ? null : { cwd, label };
  }
</script>

{#snippet tile(label: string, value: string, note: string, delta: { text: string; up: boolean } | null)}
  <div class="tile">
    <span class="label">{label}</span>
    <span class="value">{value}</span>
    <span class="note">
      {#if delta}<span class="delta" title={`Compared with the ${periodName}`}>{delta.up ? '▲' : '▼'} {delta.text}</span>{/if}
      {note}
    </span>
  </div>
{/snippet}

{#snippet agentDot(agent: Provider)}
  <span class="agent-dot {agent}" title={agent === 'claude' ? 'Claude' : 'Codex'}></span>
{/snippet}

<header class="pane-bar">
  <button class="icon-btn menu" aria-label="Open menu" onclick={onmenu}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  </button>
  <h1>Stats</h1>
  <span class="grow"></span>
  {#if report}<span class="age" title={new Date(report.generatedAt).toLocaleString()}>Updated {ago(report.generatedAt) === 'now' ? 'just now' : `${ago(report.generatedAt)} ago`}</span>{/if}
  <button class="icon-btn" aria-label="Read the records again" title="Read the records again" disabled={loading} onclick={() => void load()}>
    <svg class:spin={loading} width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 10a6 6 0 1 1-1.8-4.3M16.5 3.5v3h-3" />
    </svg>
  </button>
</header>

<div class="scroll">
  <div class="page" class:stale={loading && report}>
    <!-- One row of filters, above everything they scope. -->
    <div class="filters">
      <div class="seg" role="group" aria-label="Period">
        {#each RANGES as r (r.value)}
          <button class:on={range === r.value} aria-pressed={range === r.value} onclick={() => (range = r.value)}>{r.label}</button>
        {/each}
      </div>
      <div class="seg" role="group" aria-label="Agent">
        <button class:on={provider === 'all'} aria-pressed={provider === 'all'} onclick={() => (provider = 'all')}>Both</button>
        <button class:on={provider === 'claude'} aria-pressed={provider === 'claude'} onclick={() => (provider = 'claude')}><ProviderMark provider="claude" size={12} /> Claude</button>
        <button class:on={provider === 'codex'} aria-pressed={provider === 'codex'} onclick={() => (provider = 'codex')}><ProviderMark provider="codex" size={12} /> Codex</button>
      </div>
      <label class="switch" title="Count only chats run through Clack, not the claude and codex commands or apps">
        <input type="checkbox" checked={scope === 'clack'} onchange={(e) => (scope = e.currentTarget.checked ? 'clack' : 'all')} />
        Only Clack's chats
      </label>
      {#if folder}
        <span class="chip">
          {folder.label}
          <button aria-label="Show every project" title="Show every project" onclick={() => (folder = null)}>×</button>
        </span>
      {/if}
    </div>

    {#if report}
      {#each agents as agent (agent)}
        {#if !report.sources[agent].found}
          <p class="missing">
            {agent === 'claude' ? 'No Claude Code use found on this computer (~/.claude).' : 'No Codex use found on this computer (~/.codex).'}
          </p>
        {/if}
      {/each}
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if !report}
      <div class="loading"><span class="spinner"></span> Reading the records…</div>
    {:else if nothing}
      <div class="empty">
        <h2>Nothing in this period</h2>
        <p>No messages {folder ? `in ${folder.label} ` : ''}{scope === 'clack' ? "in Clack's chats " : ''}for these filters. Try a longer period{scope === 'clack' ? ', or include the claude and codex commands' : ''}.</p>
      </div>
    {:else if t}
      <div class="tiles">
        {@render tile('Messages', compact(t.prompts), `in ${compact(t.sessions)} conversation${t.sessions === 1 ? '' : 's'}`, change(t.prompts, p?.prompts))}
        {@render tile('Tokens', compact(t.tokens), `${share(report.tokens.cacheRead, tokenTotal)} from cache`, change(t.tokens, p?.tokens))}
        {@render tile('Agent time', duration(t.agentMs), 'the agents spent working', change(t.agentMs, p?.agentMs))}
        {@render tile('Tool calls', compact(t.toolCalls), `${compact(report.tools.length)} different tools`, change(t.toolCalls, p?.toolCalls))}
        {#if claudeOnly}
          {@render tile('Cost at API prices', '—', 'Codex records no cost', null)}
        {:else}
          {@render tile('Cost at API prices', money(t.costUsd), provider === 'all' ? 'Claude only; Codex records none' : 'as Claude Code reports it', change(t.costUsd, p?.costUsd))}
        {/if}
        {#if claudeOnly}
          {@render tile('Lines changed', '—', 'Codex does not count them', null)}
        {:else}
          {@render tile('Lines changed', `+${compact(t.linesAdded)}`, `and −${compact(t.linesRemoved)} removed, by Claude`, null)}
        {/if}
        {@render tile('Active days', String(t.activeDays), `of ${report.range.days}`, change(t.activeDays, p?.activeDays))}
        {@render tile('Streak', `${report.streak.current} day${report.streak.current === 1 ? '' : 's'}`, `longest ${report.streak.longest}`, null)}
      </div>

      <section class="card">
        <div class="card-head">
          <h2>Activity</h2>
          <span class="sub">Messages a day, the last 12 months{range !== 'all' ? '; the chosen period stands out' : ''}</span>
        </div>
        <Calendar calendar={report.calendar} selected={range === 'all' ? undefined : selection} />
      </section>

      <section class="card">
        <div class="card-head">
          <h2>{metric === 'tokens' ? 'Tokens' : metric === 'prompts' ? 'Messages' : metric === 'agentMs' ? 'Agent time' : 'Cost at API prices'} per {report.days.length > 120 ? 'week' : 'day'}</h2>
          <span class="grow"></span>
          <div class="seg small" role="group" aria-label="Measure">
            <button class:on={metric === 'tokens'} onclick={() => (metric = 'tokens')}>Tokens</button>
            <button class:on={metric === 'prompts'} onclick={() => (metric = 'prompts')}>Messages</button>
            <button class:on={metric === 'agentMs'} onclick={() => (metric = 'agentMs')}>Agent time</button>
            {#if !claudeOnly}<button class:on={metric === 'costUsd'} onclick={() => (metric = 'costUsd')}>Cost</button>{/if}
          </div>
          <div class="seg small" role="group" aria-label="Show as">
            <button class:on={view === 'chart'} onclick={() => (view = 'chart')}>Chart</button>
            <button class:on={view === 'table'} onclick={() => (view = 'table')}>Table</button>
          </div>
        </div>
        {#if metric === 'tokens' && agents.length > 1 && view === 'chart'}
          <div class="legend">
            <span><span class="swatch claude"></span>Claude</span>
            <span><span class="swatch codex"></span>Codex</span>
          </div>
        {/if}
        <DailyChart days={report.days} metric={metric === 'costUsd' && claudeOnly ? 'tokens' : metric} {agents} {view} />
      </section>

      <div class="two">
        <section class="card">
          <div class="card-head"><h2>Models</h2><span class="sub">by tokens</span></div>
          {#if report.models.length}
            <ul class="bars">
              {#each report.models as m (m.model)}
                <li>
                  <span class="name">{@render agentDot(m.provider)}{modelName(m.model)}</span>
                  <span class="track"><span class="fill {m.provider}" style:width={`${Math.max(1, (m.tokens / maxModel) * 100)}%`}></span></span>
                  <span class="figure">{compact(m.tokens)}{m.costUsd ? ` · ${money(m.costUsd)}` : ''}</span>
                </li>
              {/each}
            </ul>
            {#if agents.length > 1}<p class="foot">{@render agentDot('claude')} Claude {@render agentDot('codex')} Codex</p>{/if}
          {:else}
            <p class="none">No replies in this period.</p>
          {/if}
        </section>

        <section class="card">
          <div class="card-head"><h2>When you work</h2><span class="sub">messages by weekday and hour</span></div>
          <WeekHours grid={report.weekHours} />
        </section>
      </div>

      <div class="two">
        <section class="card">
          <div class="card-head"><h2>Where the tokens went</h2></div>
          <p class="headline">
            <strong>{share(report.tokens.cacheRead, inputTotal)}</strong> of what the agents read came from the cache, which is cheaper and
            counts less against plan limits.
          </p>
          <ul class="bars">
            {#each [{ label: 'Cache reads', value: report.tokens.cacheRead }, { label: 'Cache writes', value: report.tokens.cacheWrite }, { label: 'Input', value: report.tokens.input }, { label: 'Output', value: report.tokens.output }] as row (row.label)}
              <li>
                <span class="name">{row.label}</span>
                <span class="track"><span class="fill one" style:width={`${Math.max(row.value ? 1 : 0, (row.value / Math.max(1, tokenTotal)) * 100)}%`}></span></span>
                <span class="figure" title={full(row.value)}>{compact(row.value)} · {share(row.value, tokenTotal)}</span>
              </li>
            {/each}
          </ul>
          {#if report.tokens.reasoning}<p class="foot">Output includes {compact(report.tokens.reasoning)} tokens of thinking.</p>{/if}
        </section>

        <section class="card">
          <div class="card-head"><h2>Tools</h2><span class="sub">most used</span></div>
          {#if report.tools.length}
            <ul class="bars">
              {#each report.tools.slice(0, 12) as tool (tool.provider + tool.name)}
                <li>
                  <span class="name" title={tool.name}>{@render agentDot(tool.provider)}{toolName(tool.name)}</span>
                  <span class="track"><span class="fill {tool.provider}" style:width={`${Math.max(1, (tool.calls / maxTool) * 100)}%`}></span></span>
                  <span class="figure">{full(tool.calls)}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="none">No tool calls in this period.</p>
          {/if}
          {#if permissionCount}
            <p class="foot">
              Permission cards in Clack: {full(report.permissions.allowed)} allowed, {full(report.permissions.always)} always allowed,
              {full(report.permissions.declined)} declined.
            </p>
          {/if}
        </section>
      </div>

      <section class="card">
        <div class="card-head">
          <h2>Projects</h2>
          <span class="sub">click one to see only it</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th class="opt">Conversations</th>
                <th>Messages</th>
                <th class="wide">Tokens</th>
                <th class="opt">Agent time</th>
                <th>Cost</th>
                <th class="opt">Last active</th>
              </tr>
            </thead>
            <tbody>
              {#each projects as project (project.cwd)}
                <tr class:picked={folder?.cwd === project.cwd}>
                  <td>
                    <button class="project" title={project.cwd} onclick={() => pickFolder(project.cwd, project.label)}>
                      {project.label}{#if project.clack}<span class="tag">Clack</span>{/if}
                    </button>
                  </td>
                  <td class="opt">{full(project.sessions)}</td>
                  <td>{full(project.prompts)}</td>
                  <td class="wide">
                    <span class="inline"><span class="track thin"><span class="fill one" style:width={`${(project.tokens / maxProject) * 100}%`}></span></span>{compact(project.tokens)}</span>
                  </td>
                  <td class="opt">{duration(project.agentMs)}</td>
                  <td>{project.costUsd ? money(project.costUsd) : '—'}</td>
                  <td class="opt">{ago(project.lastActive)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if (report.projects.length ?? 0) > 8}
          <button class="more" onclick={() => (showAllProjects = !showAllProjects)}>
            {showAllProjects ? 'Show fewer' : `Show all ${report.projects.length}`}
          </button>
        {/if}
      </section>

      <div class="two">
        <section class="card">
          <div class="card-head"><h2>Heaviest conversations</h2><span class="sub">by tokens</span></div>
          <ol class="top">
            {#each report.topSessions as s (s.provider + s.id)}
              <li>
                {@render agentDot(s.provider)}
                <span class="what">
                  {#if s.chatId}
                    <a href={`#/s/${s.chatId}`}>{s.title ?? 'A chat'}</a>
                  {:else}
                    <span>{s.provider === 'claude' ? 'claude' : 'codex'} in {s.label}</span>
                  {/if}
                  <span class="meta">{s.chatId ? `${s.label} · ` : ''}{dayName(new Date(s.lastActive).toISOString().slice(0, 10), false)}</span>
                </span>
                <span class="figure">{compact(s.tokens)}{s.costUsd ? ` · ${money(s.costUsd)}` : ''}</span>
              </li>
            {/each}
          </ol>
        </section>

        <section class="card">
          <div class="card-head"><h2>Replies in Clack</h2></div>
          {#if report.turns.count}
            <div class="mini">
              <div><span class="value">{full(report.turns.count)}</span><span class="label">replies</span></div>
              <div><span class="value">{duration(report.turns.averageMs)}</span><span class="label">on average</span></div>
              <div><span class="value">{full(report.turns.stopped)}</span><span class="label">stopped</span></div>
              <div><span class="value">{full(report.turns.failed)}</span><span class="label">failed</span></div>
            </div>
          {:else}
            <p class="none">No replies recorded in this period.</p>
          {/if}
          <p class="foot">
            Clack keeps its own record of each reply in its chats{report.turns.since ? `, since ${dayName(new Date(report.turns.since).toISOString().slice(0, 10), false)}` : ' from now on'}:
            how long it took and how it ended.
          </p>
        </section>
      </div>

      <p class="about">
        These figures come from Claude Code's and Codex's own records on this computer (<code>~/.claude</code> and
        <code>~/.codex</code>) and from Clack's. Only numbers are read out of them, never what was said, and reading them uses no
        tokens. They include the <code>claude</code> and <code>codex</code> commands and apps unless <strong>Only Clack's chats</strong> is
        on. Codex records no cost and does not count lines changed. Cost is what the same use would cost at API prices; on a plan you pay the plan instead.
      </p>
    {/if}
  </div>
</div>

<style>
  .grow {
    flex: 1;
  }

  .age {
    color: var(--muted);
    font-size: 12.5px;
  }

  .spin {
    animation: spin 0.8s linear infinite;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 20px 20px calc(40px + env(safe-area-inset-bottom));
  }

  .page {
    display: grid;
    gap: 16px;
    max-width: 1120px;
    margin: 0 auto;
    transition: opacity 0.15s;
  }

  /* While new figures load, the old ones stay, faded: no jump, no flash. */
  .page.stale {
    opacity: 0.55;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .seg {
    display: inline-flex;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--sunken);
  }

  .seg button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 11px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
  }

  .seg button:hover {
    color: var(--text);
  }

  .seg button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 2px rgb(0 0 0 / 14%);
  }

  .seg.small button {
    height: 24px;
    padding: 0 8px;
    font-size: 12px;
  }

  .switch {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--text);
    font-size: 13.5px;
    cursor: pointer;
  }

  .switch input {
    accent-color: var(--accent);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 4px 3px 10px;
    border-radius: 999px;
    background: var(--accent-soft);
    font-size: 13px;
    font-weight: 700;
  }

  .chip button {
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: inherit;
    font-size: 15px;
    line-height: 1;
  }

  .chip button:hover {
    background: var(--hover);
  }

  .missing,
  .error {
    margin: 0;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--sunken);
    color: var(--muted);
    font-size: 13.5px;
  }

  .error {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .loading {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
  }

  .empty {
    padding: 40px 0;
  }

  .empty h2 {
    margin: 0 0 6px;
    font-size: 20px;
  }

  .empty p {
    margin: 0;
    color: var(--muted);
  }

  /* Two even rows of four on a wide screen, two columns on a phone. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  @media (max-width: 1100px) and (min-width: 821px) {
    .tiles {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .tile .value {
      font-size: 22px;
    }
  }

  .tile {
    display: grid;
    gap: 2px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
  }

  .tile .label {
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 700;
  }

  /* Proportional figures at display size. */
  .tile .value {
    font-size: 26px;
    font-weight: 800;
    line-height: 1.2;
  }

  .tile .note {
    color: var(--muted);
    font-size: 12px;
  }

  .delta {
    margin-right: 4px;
    color: var(--text);
    font-weight: 700;
  }

  /* One column that may shrink below its content, so a chart measures the card, not the other way round. */
  .card {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 12px;
    min-width: 0;
    padding: 16px 18px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
  }

  .card-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }

  .card-head h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
  }

  .sub {
    color: var(--muted);
    font-size: 12.5px;
  }

  .card-head .seg {
    align-self: center;
  }

  .two {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 16px;
  }

  .legend,
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }

  .swatch.claude,
  .agent-dot.claude,
  .fill.claude {
    background: var(--series-2);
  }

  .swatch.codex,
  .agent-dot.codex,
  .fill.codex {
    background: var(--series-3);
  }

  .fill.one {
    background: var(--series-1);
  }

  .agent-dot {
    display: inline-block;
    flex: none;
    width: 8px;
    height: 8px;
    margin-right: 7px;
    border-radius: 50%;
  }

  .foot .agent-dot {
    margin: 0 -8px 0 0;
  }

  .headline {
    margin: 0;
    color: var(--muted);
    font-size: 13.5px;
  }

  .headline strong {
    color: var(--text);
  }

  .bars {
    display: grid;
    gap: 9px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .bars li {
    display: grid;
    grid-template-columns: minmax(110px, 46%) minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }

  .name {
    display: flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .track {
    height: 10px;
    border-radius: 0 4px 4px 0;
  }

  .track.thin {
    display: inline-block;
    width: 70px;
    height: 6px;
    margin-right: 8px;
    vertical-align: middle;
    background: var(--sunken);
    border-radius: 3px;
  }

  .fill {
    display: block;
    height: 100%;
    border-radius: 0 4px 4px 0;
  }

  .track.thin .fill {
    border-radius: 3px;
  }

  .figure {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .none {
    margin: 0;
    color: var(--muted);
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    text-align: right;
    white-space: nowrap;
  }

  th:first-child,
  td:first-child {
    text-align: left;
  }

  th {
    color: var(--muted);
    font-weight: 700;
  }

  tr.picked td {
    background: var(--accent-soft);
  }

  .project {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 360px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--link);
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project:hover {
    text-decoration: underline;
  }

  .tag {
    padding: 0 5px;
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 700;
  }

  .inline {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
  }

  .more {
    justify-self: start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--link);
    font-size: 13px;
    font-weight: 700;
  }

  .top {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .top li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .top .agent-dot {
    margin-right: 0;
  }

  .what {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .what a,
  .what > span:first-child {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .what a {
    color: var(--link);
    font-weight: 700;
    text-decoration: none;
  }

  .what a:hover {
    text-decoration: underline;
  }

  .meta {
    color: var(--muted);
    font-size: 12px;
  }

  .mini {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .mini div {
    display: grid;
  }

  .mini .value {
    font-size: 20px;
    font-weight: 800;
  }

  .mini .label {
    color: var(--muted);
    font-size: 12px;
  }

  .about {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.55;
  }

  .about code {
    font: 0.95em var(--mono);
  }

  @media (max-width: 820px) {
    .scroll {
      padding: 14px 12px calc(32px + env(safe-area-inset-bottom));
    }

    .card {
      padding: 14px 12px;
    }

    .card-head .grow {
      display: none;
    }

    .project {
      max-width: 44vw;
    }

    .track.thin,
    .opt {
      display: none;
    }

    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .two {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }

    .page {
      transition: none;
    }
  }
</style>
