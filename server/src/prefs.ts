import { readFileSync, writeFileSync } from 'node:fs';
import type { EffortLevel } from '../../shared/protocol.ts';
import { config } from './config.ts';

/** A chat's model and effort. null means "whatever Claude Code defaults to". */
export type Prefs = { model: string | null; effort: EffortLevel | null };

type Stored = { defaults: Prefs; sessions: Record<string, Prefs> };

const NONE: Prefs = { model: null, effort: null };

// Kept on disk so a choice survives a server restart, and so a chat that was
// dropped from memory while idle comes back with the model it was using.
function load(): Stored {
  try {
    const parsed = JSON.parse(readFileSync(config.prefsFile, 'utf8')) as Partial<Stored>;
    return { defaults: parsed.defaults ?? NONE, sessions: parsed.sessions ?? {} };
  } catch {
    return { defaults: NONE, sessions: {} };
  }
}

const stored = load();

export function prefsFor(sessionId: string): Prefs {
  return stored.sessions[sessionId] ?? NONE;
}

/** What a brand-new chat starts with: the most recent choice made in any chat. */
export function defaultPrefs(): Prefs {
  return stored.defaults;
}

export function savePrefs(sessionId: string, prefs: Prefs): void {
  stored.sessions[sessionId] = prefs;
  stored.defaults = prefs;
  writeFileSync(config.prefsFile, JSON.stringify(stored, null, 2) + '\n');
}
