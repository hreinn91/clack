/**
 * Fuzzy matching in the manner of fzf: the letters typed must appear in order,
 * not necessarily side by side. Runs of letters, the start of a word (after
 * "/", "-", "_" or ".") and the last part of a path score higher, so "wca"
 * finds "work/client-a" first. Spaces split the query into terms that must all
 * match.
 */

export type Match = { score: number; positions: number[] };

const BOUNDARY = new Set(['/', '-', '_', '.', ' ']);

/** One term against the text: the best of a few starting points, or null when it does not fit. */
function term(query: string, text: string): Match | null {
  const lower = text.toLowerCase();
  const lastPart = text.lastIndexOf('/') + 1;
  let best: Match | null = null;
  // Try each place the first letter appears, so an early weak match does not hide a strong later one.
  for (let start = lower.indexOf(query[0]!); start !== -1; start = lower.indexOf(query[0]!, start + 1)) {
    const positions: number[] = [];
    let at = start;
    for (const char of query) {
      const found = lower.indexOf(char, at);
      if (found === -1) break;
      positions.push(found);
      at = found + 1;
    }
    if (positions.length !== query.length) break; // later starts cannot fit either
    let score = 0;
    positions.forEach((pos, i) => {
      score += 1;
      if (i > 0 && pos === positions[i - 1]! + 1) score += 5;
      else if (i > 0) score -= Math.min(3, (pos - positions[i - 1]! - 1) * 0.2);
      if (pos === 0 || BOUNDARY.has(text[pos - 1]!)) score += 4;
      if (pos >= lastPart) score += 1.5;
    });
    if (!best || score > best.score) best = { score, positions };
  }
  return best;
}

export function fuzzyMatch(query: string, text: string): Match | null {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return { score: 0, positions: [] };
  let score = 0;
  const positions = new Set<number>();
  for (const t of terms) {
    const match = term(t, text);
    if (!match) return null;
    score += match.score;
    for (const pos of match.positions) positions.add(pos);
  }
  // Between equal matches, the shorter path is the likelier one.
  return { score: score - text.length * 0.01, positions: [...positions].sort((a, b) => a - b) };
}

/** Splits a text into runs that were matched and runs that were not, for highlighting. */
export function highlight(text: string, positions: number[]): { text: string; hit: boolean }[] {
  const hits = new Set(positions);
  const parts: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const hit = hits.has(i);
    const last = parts.at(-1);
    if (last && last.hit === hit) last.text += text[i];
    else parts.push({ text: text[i]!, hit });
  }
  return parts;
}
