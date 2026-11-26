<script lang="ts">
  import type { StatsReport } from '../../../../shared/protocol';
  import { compact, dayName, duration, full, money, ticks } from '../../lib/statsFormat';

  // A column a day (a week, for long ranges): tokens stacked by agent, or one
  // other measure. Hover or arrow keys show a day's figures; the table view has them all.
  type Metric = 'tokens' | 'prompts' | 'agentMs' | 'costUsd';
  let { days, metric, agents, view }: { days: StatsReport['days']; metric: Metric; agents: ('claude' | 'codex')[]; view: 'chart' | 'table' } = $props();

  const HEIGHT = 210;
  const LEFT = 46;
  const BOTTOM = 24;
  const TOP = 10;

  let width = $state(600);
  let hovered = $state<number | null>(null);

  /** Long ranges are summed by week, so each column stays wide enough to see and point at. */
  const columns = $derived.by(() => {
    if (days.length <= 120) return days.map((d) => ({ ...d, label: dayName(d.day), short: dayName(d.day, false) }));
    const weeks: (StatsReport['days'][number] & { label: string; short: string })[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const group = days.slice(i, i + 7);
      const sum = (key: 'prompts' | 'tokens' | 'claude' | 'codex' | 'costUsd' | 'agentMs') => group.reduce((s, d) => s + d[key], 0);
      weeks.push({
        day: group[0]!.day,
        prompts: sum('prompts'),
        tokens: sum('tokens'),
        claude: sum('claude'),
        codex: sum('codex'),
        costUsd: sum('costUsd'),
        agentMs: sum('agentMs'),
        label: `Week of ${dayName(group[0]!.day, false)}`,
        short: dayName(group[0]!.day, false),
      });
    }
    return weeks;
  });

  const stacked = $derived(metric === 'tokens');
  const valueOf = (c: (typeof columns)[number]) => (metric === 'tokens' ? c.tokens : c[metric]);
  const max = $derived(Math.max(0, ...columns.map(valueOf)));
  const axis = $derived(ticks(max));
  const top = $derived(axis.at(-1) || 1);
  const plotWidth = $derived(Math.max(10, width - LEFT - 6));
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const slot = $derived(plotWidth / Math.max(1, columns.length));
  const barWidth = $derived(Math.max(1, Math.min(24, slot * 0.66)));
  const y = (v: number) => TOP + plotHeight - (v / top) * plotHeight;
  const labelEvery = $derived(Math.max(1, Math.ceil(columns.length / Math.max(2, Math.floor(plotWidth / 70)))));

  const format = (v: number) => (metric === 'costUsd' ? money(v) : metric === 'agentMs' ? duration(v) : compact(v));
  const tick = (v: number) => (metric === 'costUsd' ? `$${compact(v)}` : metric === 'agentMs' ? `${compact(v / 3_600_000)} h` : compact(v));

  /** A column with a 4px round top and a square foot on the baseline. */
  function column(x: number, top: number, w: number, h: number, round: boolean): string {
    if (h <= 0) return '';
    const r = round ? Math.min(4, w / 2, h) : 0;
    return `M${x},${top + h}V${top + r}${r ? `Q${x},${top} ${x + r},${top}` : ''}H${x + w - r}${r ? `Q${x + w},${top} ${x + w},${top + r}` : ''}V${top + h}Z`;
  }

  /** The pieces of a column, bottom up: Claude then Codex for tokens, one piece otherwise; 2px of page between pieces. */
  function pieces(c: (typeof columns)[number]): { d: string; agent: 'claude' | 'codex' | 'one' }[] {
    const x = LEFT + slot * columns.indexOf(c) + (slot - barWidth) / 2;
    if (!stacked) return [{ d: column(x, y(valueOf(c)), barWidth, TOP + plotHeight - y(valueOf(c)), true), agent: 'one' }];
    const parts = agents.map((agent) => ({ agent, value: c[agent] })).filter((p) => p.value > 0);
    let base = TOP + plotHeight;
    return parts.map((p, i) => {
      const h = (p.value / top) * plotHeight;
      const gap = i > 0 ? 2 : 0;
      const piece = { d: column(x, base - h + gap, barWidth, Math.max(0, h - gap), i === parts.length - 1), agent: p.agent };
      base -= h;
      return piece;
    });
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      hovered = Math.max(0, Math.min(columns.length - 1, (hovered ?? (step > 0 ? -1 : columns.length)) + step));
    } else if (event.key === 'Escape') {
      hovered = null;
    }
  }

  const tip = $derived(hovered === null ? null : columns[hovered]);
  const tipLeft = $derived(hovered === null ? 0 : Math.min(Math.max(LEFT + slot * hovered + slot / 2, 90), width - 90));
</script>

{#if view === 'table'}
  <div class="table">
    <table>
      <thead>
        <tr>
          <th>{days.length > 120 ? 'Week' : 'Day'}</th>
          <th>Messages</th>
          <th>Tokens</th>
          {#if agents.includes('claude') && agents.length > 1}<th>Claude</th>{/if}
          {#if agents.includes('codex') && agents.length > 1}<th>Codex</th>{/if}
          <th>Agent time</th>
          <th>Cost (Claude)</th>
        </tr>
      </thead>
      <tbody>
        {#each [...columns].reverse() as c (c.day)}
          <tr>
            <td>{c.label}</td>
            <td>{full(c.prompts)}</td>
            <td>{full(c.tokens)}</td>
            {#if agents.includes('claude') && agents.length > 1}<td>{full(c.claude)}</td>{/if}
            {#if agents.includes('codex') && agents.length > 1}<td>{full(c.codex)}</td>{/if}
            <td>{duration(c.agentMs)}</td>
            <td>{money(c.costUsd)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <!-- Focusable so the arrow keys can step through the values; the figures are in the tooltip and the table view too. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="chart"
    bind:clientWidth={width}
    tabindex="0"
    role="img"
    aria-label={`${metric === 'tokens' ? 'Tokens' : metric === 'prompts' ? 'Messages' : metric === 'agentMs' ? 'Agent time' : 'Cost'} per ${days.length > 120 ? 'week' : 'day'}. Use the arrow keys to read each one, or the table view.`}
    {onkeydown}
    onpointerleave={() => (hovered = null)}
    onblur={() => (hovered = null)}
  >
    <svg {width} height={HEIGHT} aria-hidden="true">
      {#each axis as value (value)}
        <line class="grid" x1={LEFT} x2={LEFT + plotWidth} y1={y(value)} y2={y(value)} />
        <text class="tick" x={LEFT - 8} y={y(value)} dy="0.32em" text-anchor="end">{tick(value)}</text>
      {/each}
      {#each columns as c, i (c.day)}
        {#if hovered === i}<rect class="band" x={LEFT + slot * i} y={TOP} width={slot} height={plotHeight} />{/if}
        {#each pieces(c) as piece, p (p)}
          <path d={piece.d} class="bar {piece.agent}" class:lift={hovered === i} />
        {/each}
        {#if i % labelEvery === 0}
          <text class="tick" x={LEFT + slot * i + slot / 2} y={HEIGHT - 6} text-anchor="middle">{c.short}</text>
        {/if}
        <!-- The whole height of the column answers the pointer, not only the painted part. -->
        <rect class="hit" x={LEFT + slot * i} y={TOP} width={slot} height={plotHeight} role="presentation" onpointerenter={() => (hovered = i)} />
      {/each}
    </svg>
    {#if tip}
      <div class="tip" style:left={`${tipLeft}px`}>
        <span class="when">{tip.label}</span>
        {#if stacked}
          {#each agents as agent (agent)}
            <span class="row"><span class="key {agent}"></span><strong>{full(tip[agent])}</strong> {agent === 'claude' ? 'Claude' : 'Codex'}</span>
          {/each}
          {#if agents.length > 1}<span class="row"><span class="key none"></span><strong>{full(tip.tokens)}</strong> tokens in all</span>{/if}
        {:else}
          <span class="row"><span class="key one"></span><strong>{format(valueOf(tip))}</strong></span>
        {/if}
        <span class="more">{full(tip.prompts)} messages · {duration(tip.agentMs)} · {money(tip.costUsd)}</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .chart {
    position: relative;
    outline: none;
  }

  .chart:focus-visible {
    box-shadow: 0 0 0 2px var(--link);
    border-radius: 6px;
  }

  svg {
    display: block;
    overflow: visible;
  }

  .grid {
    stroke: var(--border);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }

  .tick {
    fill: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .band {
    fill: var(--hover);
  }

  .bar.claude {
    fill: var(--series-2);
  }

  .bar.codex {
    fill: var(--series-3);
  }

  .bar.one {
    fill: var(--series-1);
  }

  .bar.lift {
    filter: brightness(1.12);
  }

  .hit {
    fill: transparent;
  }

  .tip {
    position: absolute;
    top: -6px;
    z-index: 2;
    display: grid;
    gap: 3px;
    min-width: 160px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow);
    font-size: 12.5px;
    pointer-events: none;
    transform: translate(-50%, -100%);
  }

  .when,
  .more {
    color: var(--muted);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
  }

  .row strong {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  /* Line keys, not boxes. */
  .key {
    width: 12px;
    height: 2px;
    border-radius: 1px;
    background: var(--border-strong);
  }

  .key.claude {
    background: var(--series-2);
  }

  .key.codex {
    background: var(--series-3);
  }

  .key.one {
    background: var(--series-1);
  }

  .table {
    max-height: 320px;
    overflow: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 5px 10px;
    border-bottom: 1px solid var(--border);
    text-align: right;
    white-space: nowrap;
  }

  th:first-child,
  td:first-child {
    text-align: left;
  }

  th {
    position: sticky;
    top: 0;
    background: var(--surface);
    color: var(--muted);
    font-weight: 700;
  }
</style>
