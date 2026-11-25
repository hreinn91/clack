import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { config } from './config.ts';

// Chats whose agent finished a reply that nobody has opened since. A chat
// stays here, by id with when the reply finished, until a browser shows it.
// Kept on disk, so a reply that finished just before a restart is not lost.

function load(): Record<string, number> {
  try {
    const parsed = JSON.parse(readFileSync(config.unreadFile, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // A reply left unread for a month (or one of a chat that is gone) is let go.
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return Object.fromEntries(Object.entries(parsed).filter(([, at]) => typeof at === 'number' && at > cutoff)) as Record<string, number>;
  } catch {
    return {};
  }
}

const unread = load();

function save(): void {
  try {
    const temp = `${config.unreadFile}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(unread) + '\n');
    renameSync(temp, config.unreadFile);
  } catch (err) {
    console.warn('clack: could not save which replies are unread:', err instanceof Error ? err.message : err);
  }
}

/** A reply finished in this chat. */
export function markFinished(chatId: string, at = Date.now()): void {
  unread[chatId] = at;
  save();
}

/** Someone has looked at the chat. True when that changed anything. */
export function markSeen(chatId: string): boolean {
  if (!(chatId in unread)) return false;
  delete unread[chatId];
  save();
  return true;
}

/** When the unread reply finished, if there is one. */
export function unreadSince(chatId: string): number | undefined {
  return unread[chatId];
}
