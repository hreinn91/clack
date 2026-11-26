// Numbers for the Stats page, said briefly: 1,284 · 12.9K · 768M; 7 h 1 min; $234.41.

export function compact(value: number): string {
  const n = Math.round(value);
  if (Math.abs(n) < 10_000) return n.toLocaleString('en-US');
  for (const [size, unit] of [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ] as const) {
    if (Math.abs(n) >= size) {
      const scaled = n / size;
      return `${scaled >= 100 ? Math.round(scaled) : +scaled.toFixed(1)}${unit}`;
    }
  }
  return String(n);
}

/** In full, for tooltips and tables: 768,130,397. */
export function full(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

export function money(usd: number): string {
  if (usd >= 10_000) return `$${compact(usd)}`;
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function share(part: number, whole: number): string {
  if (!whole) return '0%';
  const value = (part / whole) * 100;
  return value > 0 && value < 1 ? '<1%' : `${Math.round(value)}%`;
}

/** A day ("2026-11-18") said briefly: "Tue 18 Nov". */
export function dayName(day: string, withWeekday = true): string {
  const date = new Date(`${day}T12:00:00`);
  return date.toLocaleDateString(undefined, { ...(withWeekday ? { weekday: 'short' } : {}), day: 'numeric', month: 'short' });
}

/** Clean axis ticks from 0 up to a little over `max`: 0, 50K, 100K, 150K. */
export function ticks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
  const out: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) out.push(v);
  return out;
}

/** The change from the period before, for a tile: "+12%", or null when there is nothing to compare. */
export function change(now: number, before: number | undefined): { text: string; up: boolean } | null {
  if (before === undefined || before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: 'no change', up: true };
  return { text: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`, up: pct > 0 };
}
