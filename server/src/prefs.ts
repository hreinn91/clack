import { readFileSync, writeFileSync } from 'node:fs';
import type { EffortLevel, Provider } from '../../shared/protocol.ts';
import { config } from './config.ts';

/** A chat's provider, model and effort. null means "whatever the agent defaults to". Older records have no provider: Claude. */
export type Prefs = { provider?: Provider; model: string | null; effort: EffortLevel | null };

type Stored = {
  defaults: Prefs;
  byProvider: Partial<Record<Provider, Prefs>>;
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
    const defaults = parsed.defaults ?? NONE;
    return {
      defaults,
      byProvider: parsed.byProvider ?? { [defaults.provider ?? 'claude']: defaults },
      sessions: parsed.sessions ?? {},
      folders: parsed.folders ?? {},
    };
  } catch {
    return { defaults: NONE, byProvider: {}, sessions: {}, folders: {} };
  }
}

const stored = load();

export function prefsFor(sessionId: string): Prefs | undefined {
  return stored.sessions[sessionId];
}

/** What a brand-new chat starts with: the most recent choice made in any chat. */
export function defaultPrefs(provider?: Provider): Prefs {
  if (!provider) return stored.defaults;
  return stored.byProvider[provider] ?? { ...NONE, provider };
}

function write(): void {
  writeFileSync(config.prefsFile, JSON.stringify(stored, null, 2) + '\n');
}

export function savePrefs(sessionId: string, prefs: Prefs): void {
  stored.defaults = prefs;
  stored.byProvider[prefs.provider ?? 'claude'] = prefs;
  saveSessionPrefs(sessionId, prefs);
}

/** Inheriting preferences belongs to this chat and leaves the latest explicit choice intact. */
export function saveSessionPrefs(sessionId: string, prefs: Prefs): void {
  stored.sessions[sessionId] = prefs;
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
