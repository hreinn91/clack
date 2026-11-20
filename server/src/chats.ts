import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Provider } from '../../shared/protocol.ts';
import { config } from './config.ts';

// A chat in clack can run on Claude, on Codex, or on one and then the other.
// Each provider keeps its own conversation (a "segment"), so a chat is a chain
// of them, oldest first. Chats that only ever ran on Claude with the chat's own
// id need no record here: that is how every chat started before Codex came
// along, and they keep working as they are.

export type Segment = {
  provider: Provider;
  /** The provider's id for this part of the chat. */
  sessionId: string;
  startedAt: number;
  /** The model it started on, for the line that marks a switch. */
  model?: string;
};

/**
 * A chat's segments, and where it works and what it is called: each provider
 * keeps those too, but a chat must still open and be listed when the
 * provider's own list misses its latest part.
 */
export type ChatRecord = { segments: Segment[]; cwd?: string; title?: string };

const file = join(config.dataDir, 'chats.json');

function load(): Record<string, ChatRecord> {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { chats?: Record<string, ChatRecord> };
    return parsed.chats ?? {};
  } catch {
    return {};
  }
}

const chats = load();
/** "provider:sessionId" → the chat it belongs to. */
const owners = new Map<string, string>();
for (const [chatId, record] of Object.entries(chats)) for (const s of record.segments) owners.set(`${s.provider}:${s.sessionId}`, chatId);

function write(): void {
  writeFileSync(file, JSON.stringify({ chats }, null, 2) + '\n');
}

/** A chat's segments, oldest first; undefined for a chat with no record (a plain Claude chat). */
export function segmentsOf(chatId: string): Segment[] | undefined {
  return chats[chatId]?.segments;
}

export function recordOf(chatId: string): ChatRecord | undefined {
  return chats[chatId];
}

/** Every chat with a record, by id. */
export function allRecords(): [string, ChatRecord][] {
  return Object.entries(chats);
}

/** The chat a provider's conversation belongs to, when it is part of one with a record. */
export function chatOf(provider: Provider, sessionId: string): string | undefined {
  return owners.get(`${provider}:${sessionId}`);
}

/** A segment that is neither a chat of its own nor its chat's latest: history, not listed. */
export function isEarlierSegment(provider: Provider, sessionId: string): boolean {
  const chatId = chatOf(provider, sessionId);
  if (!chatId) return false;
  const segments = chats[chatId]!.segments;
  const last = segments[segments.length - 1]!;
  return !(last.provider === provider && last.sessionId === sessionId);
}

/**
 * Keeps a chat's segments. A chat with one Claude segment under its own id is
 * left without a record, as before.
 */
export function saveSegments(chatId: string, segments: Segment[], about: { cwd: string; title?: string }): void {
  for (const s of chats[chatId]?.segments ?? []) owners.delete(`${s.provider}:${s.sessionId}`);
  const plain = segments.length === 1 && segments[0]!.provider === 'claude' && segments[0]!.sessionId === chatId;
  if (plain || !segments.length) delete chats[chatId];
  else {
    chats[chatId] = { segments, cwd: about.cwd, ...(about.title ? { title: about.title } : {}) };
    for (const s of segments) owners.set(`${s.provider}:${s.sessionId}`, chatId);
  }
  write();
}

/** A chat with a record moved folder or was renamed. Chats without one keep this in the provider's records only. */
export function noteChat(chatId: string, about: { cwd?: string; title?: string }): void {
  const record = chats[chatId];
  if (!record) return;
  if (about.cwd) record.cwd = about.cwd;
  if (about.title) record.title = about.title;
  write();
}

export function forgetChat(chatId: string): void {
  if (!chats[chatId]) return;
  for (const s of chats[chatId].segments) owners.delete(`${s.provider}:${s.sessionId}`);
  delete chats[chatId];
  write();
}
