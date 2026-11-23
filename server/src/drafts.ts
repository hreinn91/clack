import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import type { MessageDraft, Upload } from '../../shared/protocol.ts';
import { config } from './config.ts';

// What was typed in a chat's message box and not sent yet, with the files
// attached to it. Kept per chat on the server, so a draft waits in its own
// chat, survives a restart, and is there on another device too.

/** Emits 'changed' (sessionId, draft or null, client) when a draft is saved or cleared. */
export const draftsBus = new EventEmitter();

const MAX_CHARS = 200_000;
const MAX_FILES = 50;
/** More drafts than this, and the oldest go. */
const MAX_DRAFTS = 1000;
const CHAT_ID = /^[0-9a-f-]{36}$/i;

function load(): Record<string, MessageDraft> {
  try {
    const parsed = JSON.parse(readFileSync(config.draftsFile, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, MessageDraft>) : {};
  } catch {
    return {};
  }
}

const drafts = load();

let writeTimer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> = Promise.resolve();

/** Written a moment after the last change, all at once, and never half: typing saves often. */
function scheduleWrite(): void {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = undefined;
    writing = writing.then(async () => {
      const temp = `${config.draftsFile}.${process.pid}.tmp`;
      try {
        await writeFile(temp, JSON.stringify(drafts) + '\n');
        await rename(temp, config.draftsFile);
      } catch (err) {
        console.warn('clack: could not save message drafts:', err instanceof Error ? err.message : err);
      }
    });
  }, 300);
}

/** On shutting down: what is waiting to be written is written now. */
export function flushDrafts(): void {
  if (writeTimer === undefined) return;
  clearTimeout(writeTimer);
  writeTimer = undefined;
  try {
    writeFileSync(config.draftsFile, JSON.stringify(drafts) + '\n');
  } catch {
    // Nothing more can be done on the way out.
  }
}

export function listDrafts(): Record<string, MessageDraft> {
  return drafts;
}

function isUpload(value: unknown): value is Upload {
  const file = value as Upload | null;
  return (
    !!file &&
    typeof file === 'object' &&
    typeof file.name === 'string' &&
    typeof file.path === 'string' &&
    typeof file.size === 'number' &&
    file.name.length <= 500 &&
    file.path.length <= 2000
  );
}

/**
 * Saves a chat's draft; an empty one (no text, no files) is forgotten.
 * `client` names the browser tab it came from, so that tab can tell its own
 * save from someone else's.
 */
export function saveDraft(sessionId: string, body: unknown, client: unknown): MessageDraft | null {
  if (!CHAT_ID.test(sessionId)) throw new Error('That is not a chat.');
  const { text, attached } = (body ?? {}) as { text?: unknown; attached?: unknown };
  if (typeof text !== 'string') throw new Error('A draft is text.');
  if (text.length > MAX_CHARS) throw new Error('That draft is too long.');
  if (!Array.isArray(attached) || attached.length > MAX_FILES || !attached.every(isUpload)) throw new Error('Those attachments are not files.');
  const from = typeof client === 'string' ? client.slice(0, 64) : '';
  if (!text.trim() && !attached.length) {
    if (!(sessionId in drafts)) return null;
    delete drafts[sessionId];
    scheduleWrite();
    draftsBus.emit('changed', sessionId, null, from);
    return null;
  }
  const draft: MessageDraft = {
    text,
    attached: attached.map(({ name, path, size }) => ({ name, path, size })),
    at: Date.now(),
  };
  drafts[sessionId] = draft;
  const ids = Object.keys(drafts);
  if (ids.length > MAX_DRAFTS) {
    ids.sort((a, b) => drafts[a]!.at - drafts[b]!.at);
    for (const id of ids.slice(0, ids.length - MAX_DRAFTS)) delete drafts[id];
  }
  scheduleWrite();
  draftsBus.emit('changed', sessionId, draft, from);
  return draft;
}

/** Drops the draft of a chat that was deleted. */
export function forgetDraft(sessionId: string): void {
  if (!(sessionId in drafts)) return;
  delete drafts[sessionId];
  scheduleWrite();
  draftsBus.emit('changed', sessionId, null, '');
}
