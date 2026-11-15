import { readFileSync, writeFileSync } from 'node:fs';
import type { EffortLevel } from '../../shared/protocol.ts';
import { config } from './config.ts';

/** A chat's model and effort. null means "whatever Claude Code defaults to". */
export type Prefs = { model: string | null; effort: EffortLevel | null };

type Stored = {
  defaults: Prefs;
  sessions: Record<string, Prefs>;
  /** Chats that were moved: the name of the folder under data/sessions each one works in now. */
  folders: Record<string, string>;
};

const NONE: Prefs = { model: null, effort: null };

// Kept on disk so a choice survives a server restart, and so a chat that was
// dropped from memory while idle comes back with the model it was using.
function load(): Stored {
  try {
    const parsed = JSON.parse(readFileSync(config.prefsFile, 'utf8')) as Partial<Stored>;
    return { defaults: parsed.defaults ?? NONE, sessions: parsed.sessions ?? {}, folders: parsed.folders ?? {} };
  } catch {
    return { defaults: NONE, sessions: {}, folders: {} };
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

function write(): void {
  writeFileSync(config.prefsFile, JSON.stringify(stored, null, 2) + '\n');
}

export function savePrefs(sessionId: string, prefs: Prefs): void {
  stored.sessions[sessionId] = prefs;
  stored.defaults = prefs;
  write();
}

/** The folder a moved chat works in now, by name. Undefined for a chat that never moved. */
export function movedFolder(sessionId: string): string | undefined {
  return stored.folders[sessionId];
}

export function saveMovedFolder(sessionId: string, folder: string): void {
  stored.folders[sessionId] = folder;
  write();
}

/** Drops everything remembered about a chat that no longer exists. */
export function forgetSession(sessionId: string): void {
  if (!(sessionId in stored.sessions) && !(sessionId in stored.folders)) return;
  delete stored.sessions[sessionId];
  delete stored.folders[sessionId];
  write();
}
