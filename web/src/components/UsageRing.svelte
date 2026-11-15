<script lang="ts">
  // A small ring that fills as something is used up, going from blue through amber to red.
  let { percent, size = 18 }: { percent: number; size?: number } = $props();

  const clamped = $derived(Math.max(0, Math.min(100, percent)));
  const radius = 7;
  const around = 2 * Math.PI * radius;

  /** Blue while there is plenty left, amber as it runs low, red at the end. */
  function usageColor(used: number): string {
    const stops: [number, number][] = [
      [0, 208],
      [55, 208],
      [80, 38],
      [100, 2],
    ];
    let hue = stops[0]![1];
    for (let i = 1; i < stops.length; i++) {
      const [from, fromHue] = stops[i - 1]!;
      const [to, toHue] = stops[i]!;
      if (used >= from) hue = used >= to ? toHue : fromHue + ((toHue - fromHue) * (used - from)) / (to - from);
    }
    return `hsl(${Math.round(hue)} 85% 52%)`;
  }
</script>

<svg class="ring" width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
  <circle class="track" cx="9" cy="9" r={radius} />
  <circle
    class="fill"
    cx="9"
    cy="9"
    r={radius}
    stroke={usageColor(clamped)}
    stroke-dasharray={`${(around * clamped) / 100} ${around}`}
    transform="rotate(-90 9 9)"
  />
</svg>

<style>
  .ring {
    flex: none;
    display: block;
  }

  circle {
    fill: none;
    stroke-width: 2.6;
  }

  .track {
    stroke: var(--border-strong);
    opacity: 0.45;
  }

  .fill {
    stroke-linecap: round;
    transition:
      stroke-dasharray 0.4s ease,
      stroke 0.4s ease;
  }
</style>
