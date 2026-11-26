<script lang="ts">
  import type { StatsReport } from '../../../../shared/protocol';
  import { compact, dayName, full } from '../../lib/statsFormat';

  // A year of days, a square each, darker the more messages were sent: one
  // hue, light to dark. Hover, or arrow keys, give a day's figures.
  let { calendar, selected }: { calendar: StatsReport['calendar']; selected?: { from: string; to: string } } = $props();

  const CELL = 12;
  const GAP = 3;
  const LEFT = 28;
  const TOP = 18;

  /** Monday is the first row. */
  const weekday = (day: string) => (new Date(`${day}T12:00:00`).getDay() + 6) % 7;

  const cells = $derived.by(() => {
    if (!calendar.length) return [];
    const offset = weekday(calendar[0]!.day);
    return calendar.map((c, i) => ({ ...c, col: Math.floor((i + offset) / 7), row: (i + offset) % 7 }));
  });
  const columns = $derived((cells.at(-1)?.col ?? 0) + 1);
  const width = $derived(LEFT + columns * (CELL + GAP));
  const height = TOP + 7 * (CELL + GAP);

  /** Four steps of activity, from the quartiles of the days that had any. */
  const steps = $derived.by(() => {
    const values = calendar.map((c) => c.prompts).filter((v) => v > 0).sort((a, b) => a - b);
    if (!values.length) return [1, 1, 1];
    const at = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))]!;
    return [at(0.25), at(0.5), at(0.75)];
  });
  const level = (v: number) => (v <= 0 ? 0 : v <= steps[0]! ? 1 : v <= steps[1]! ? 2 : v <= steps[2]! ? 3 : 4);

  const months = $derived.by(() => {
    const out: { col: number; name: string }[] = [];
    for (const c of cells) {
      if (c.day.endsWith('-01') || (c === cells[0] && Number(c.day.slice(8)) < 8)) {
        const name = new Date(`${c.day}T12:00:00`).toLocaleDateString(undefined, { month: 'short' });
        if (!out.length || c.col - out.at(-1)!.col >= 3) out.push({ col: c.col, name });
      }
    }
    return out;
  });

  let hovered = $state<number | null>(null);
  let scroller = $state<HTMLElement>();

  // The latest weeks are the ones looked for: a narrow screen starts scrolled to them.
  $effect(() => {
    void cells.length;
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  });

  function onkeydown(event: KeyboardEvent) {
    const moves: Record<string, number> = { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 };
    if (event.key in moves) {
      event.preventDefault();
      hovered = Math.max(0, Math.min(cells.length - 1, (hovered ?? cells.length - 1) + moves[event.key]!));
    } else if (event.key === 'Escape') hovered = null;
  }

  const tip = $derived(hovered === null ? null : cells[hovered]);
  const inSelection = (day: string) => !!selected && day >= selected.from && day <= selected.to;
</script>

<!-- Focusable so the arrow keys can step through the values; the figures are in the tooltip and the table view too. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="wrap"
  bind:this={scroller}
  tabindex="0"
  role="img"
  aria-label="Messages per day over the last year. Use the arrow keys to read each day."
  {onkeydown}
  onpointerleave={() => (hovered = null)}
  onblur={() => (hovered = null)}
>
  <svg {width} {height} aria-hidden="true">
    {#each months as m (m.col)}
      <text class="label" x={LEFT + m.col * (CELL + GAP)} y="11">{m.name}</text>
    {/each}
    {#each ['Mon', 'Wed', 'Fri'] as name, i (name)}
      <text class="label" x="0" y={TOP + (i * 2) * (CELL + GAP) + CELL - 2}>{name}</text>
    {/each}
    {#each cells as c, i (c.day)}
      <rect
        x={LEFT + c.col * (CELL + GAP)}
        y={TOP + c.row * (CELL + GAP)}
        width={CELL}
        height={CELL}
        rx="2.5"
        class="cell l{level(c.prompts)}"
        class:dim={selected && !inSelection(c.day)}
        class:on={hovered === i}
        role="presentation"
        onpointerenter={() => (hovered = i)}
      />
    {/each}
  </svg>
  {#if tip}
    <div class="tip" style:left={`${LEFT + tip.col * (CELL + GAP) + CELL / 2}px`} style:top={`${TOP + tip.row * (CELL + GAP)}px`}>
      <strong>{full(tip.prompts)} message{tip.prompts === 1 ? '' : 's'}</strong>
      <span>{compact(tip.tokens)} tokens · {dayName(tip.day)}</span>
    </div>
  {/if}
</div>
<div class="legend" aria-hidden="true">
  Less
  {#each [0, 1, 2, 3, 4] as l (l)}<span class="swatch l{l}"></span>{/each}
  More
</div>

<style>
  .wrap {
    position: relative;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 46px 2px 2px;
    margin-top: -40px;
    outline: none;
  }

  .wrap:focus-visible {
    box-shadow: 0 0 0 2px var(--link);
    border-radius: 6px;
  }

  svg {
    display: block;
  }

  .label {
    fill: var(--muted);
    font-size: 10.5px;
  }

  /* One hue, light to dark: nothing, then four steps of the first chart colour. */
  .l0 {
    fill: var(--sunken);
    background: var(--sunken);
  }

  .l1 {
    fill: color-mix(in srgb, var(--series-1) 28%, var(--surface));
    background: color-mix(in srgb, var(--series-1) 28%, var(--surface));
  }

  .l2 {
    fill: color-mix(in srgb, var(--series-1) 52%, var(--surface));
    background: color-mix(in srgb, var(--series-1) 52%, var(--surface));
  }

  .l3 {
    fill: color-mix(in srgb, var(--series-1) 76%, var(--surface));
    background: color-mix(in srgb, var(--series-1) 76%, var(--surface));
  }

  .l4 {
    fill: var(--series-1);
    background: var(--series-1);
  }

  .cell.dim {
    opacity: 0.35;
  }

  .cell.on {
    stroke: var(--text);
    stroke-width: 1.5;
  }

  .tip {
    position: absolute;
    z-index: 2;
    display: grid;
    gap: 2px;
    padding: 6px 9px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow);
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    transform: translate(-50%, calc(-100% - 6px));
  }

  .tip strong {
    color: var(--text);
  }

  .legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 3px;
    margin-top: 6px;
    color: var(--muted);
    font-size: 11.5px;
  }

  .swatch {
    width: 11px;
    height: 11px;
    border-radius: 2.5px;
  }

  .legend .swatch:first-of-type {
    margin-left: 4px;
  }

  .legend .swatch:last-of-type {
    margin-right: 4px;
  }
</style>
