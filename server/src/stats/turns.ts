import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Provider } from '../../../shared/protocol.ts';
import { config } from '../config.ts';

// Clack's own record of every reply in its chats: when it was asked for, how
// long it took, and how it ended. Numbers only, one line each, for the Stats page.

export type Turn = {
  start: number;
  end: number;
  chat: string;
  provider: Provider;
  model?: string;
  cwd: string;
  outcome: 'done' | 'stopped' | 'failed';
};

const dir = join(config.dataDir, 'stats');
const file = join(dir, 'turns.jsonl');

export function recordTurn(turn: Turn): void {
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(file, JSON.stringify(turn) + '\n');
  } catch (err) {
    console.warn('clack: could not record a turn for Stats:', err instanceof Error ? err.message : err);
  }
}

let cache: { size: number; turns: Turn[] } | undefined;

export function readTurns(): Turn[] {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  if (cache && cache.size === text.length) return cache.turns;
  const turns: Turn[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const turn = JSON.parse(line) as Turn;
      if (typeof turn.start === 'number' && typeof turn.end === 'number') turns.push(turn);
    } catch {
      // A torn last line from a crash: skipped.
    }
  }
  cache = { size: text.length, turns };
  return turns;
}
