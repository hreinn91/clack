<script lang="ts">
  import { full } from '../../lib/statsFormat';

  // When messages are sent: a row per weekday, a cell per hour, darker the more.
  let { grid }: { grid: number[][] } = $props();

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const max = $derived(Math.max(0, ...grid.flat()));
  const level = (v: number) => (v <= 0 || !max ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;

  const busiest = $derived.by(() => {
    let best = { day: 0, hour: 0, value: 0 };
    grid.forEach((row, day) => row.forEach((value, h) => value > best.value && (best = { day, hour: h, value })));
    return best;
  });
</script>

<p class="headline">
  {#if busiest.value}
    Busiest: <strong>{DAYS[busiest.day]}s, {hour(busiest.hour)}–{hour((busiest.hour + 1) % 24)}</strong>
  {:else}
    No messages in this period.
  {/if}
</p>
<div class="grid" role="table" aria-label="Messages by weekday and hour">
  <span></span>
  {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
    <span class="hour" role="columnheader">{h % 6 === 0 ? h : ''}</span>
  {/each}
  {#each grid as row, day (day)}
    <span class="day" role="rowheader">{DAYS[day]!.slice(0, 3)}</span>
    {#each row as value, h (h)}
      <span
        class="cell l{level(value)}"
        role="cell"
        aria-label={`${DAYS[day]} ${hour(h)}: ${value} messages`}
        title={`${DAYS[day]}s ${hour(h)}–${hour((h + 1) % 24)}: ${full(value)} message${value === 1 ? '' : 's'}`}
      ></span>
    {/each}
  {/each}
</div>

<style>
  .headline {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 13px;
  }

  .headline strong {
    color: var(--text);
  }

  .grid {
    display: grid;
    grid-template-columns: 30px repeat(24, minmax(0, 1fr));
    gap: 3px;
  }

  .hour,
  .day {
    color: var(--muted);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
  }

  .day {
    align-self: center;
  }

  .cell {
    aspect-ratio: 1;
    min-height: 8px;
    border-radius: 2.5px;
  }

  .cell:hover {
    outline: 1.5px solid var(--text);
  }

  .l0 {
    background: var(--sunken);
  }

  .l1 {
    background: color-mix(in srgb, var(--series-1) 28%, var(--surface));
  }

  .l2 {
    background: color-mix(in srgb, var(--series-1) 52%, var(--surface));
  }

  .l3 {
    background: color-mix(in srgb, var(--series-1) 76%, var(--surface));
  }

  .l4 {
    background: var(--series-1);
  }
</style>
