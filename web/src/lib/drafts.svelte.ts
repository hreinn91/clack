import type { MessageDraft, Upload } from '../../../shared/protocol';
import { api } from './api';

// What was typed in each chat's message box and not sent yet. The server
// keeps them (data/drafts.json), so a draft stays in its own chat when
// another is opened, comes back after a restart, and is there on another
// device too. They are all held here as well, so changing chats needs no wait.

/** How long after the last keystroke a draft goes to the server. */
const SAVE_DELAY = 500;

/** This tab's name, to tell its own saves from other tabs' and devices' when the server passes them on. */
const CLIENT = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

class DraftsState {
  /** By chat id. */
  all = $state<Record<string, MessageDraft>>({});
  loaded = $state(false);

  #timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Drafts changed here and not yet sent to the server, by chat id. */
  #waiting = new Map<string, { text: string; attached: Upload[] }>();

  constructor() {
    // Closing the tab or reloading right after typing: what is waiting goes out anyway.
    window.addEventListener('pagehide', () => {
      for (const id of [...this.#waiting.keys()]) this.#send(id, true);
    });
  }

  async load(): Promise<void> {
    try {
      const all = await api<Record<string, MessageDraft>>('/api/drafts');
      // What this tab has changed and not saved yet is newer than what the server had.
      for (const [id, draft] of this.#waiting) {
        if (draft.text.trim() || draft.attached.length) all[id] = { ...draft, at: Date.now() };
        else delete all[id];
      }
      this.all = all;
      this.loaded = true;
    } catch {
      // Offline for now: drafts typed here are still kept, and sent once the server answers.
    }
  }

  get(chatId: string): MessageDraft | undefined {
    return this.all[chatId];
  }

  /** The message box of a chat changed. Saved a moment later; an emptied box at once. */
  set(chatId: string, text: string, attached: Upload[]): void {
    const current = this.all[chatId];
    const empty = !text.trim() && !attached.length;
    if (empty ? !current : current && current.text === text && sameFiles(current.attached, attached)) return;
    if (empty) delete this.all[chatId];
    else this.all[chatId] = { text, attached: attached.map((file) => ({ ...file })), at: Date.now() };
    this.#waiting.set(chatId, { text, attached: attached.map((file) => ({ ...file })) });
    clearTimeout(this.#timers.get(chatId));
    // A sent message empties the box: that is saved straight away, so a reload cannot bring the message back.
    if (empty) this.#send(chatId);
    else this.#timers.set(chatId, setTimeout(() => this.#send(chatId), SAVE_DELAY));
  }

  #send(chatId: string, leaving = false): void {
    clearTimeout(this.#timers.get(chatId));
    this.#timers.delete(chatId);
    const draft = this.#waiting.get(chatId);
    if (!draft) return;
    this.#waiting.delete(chatId);
    void fetch(`/api/drafts/${chatId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-clack-client': CLIENT },
      body: JSON.stringify(draft),
      keepalive: leaving,
    })
      .then((res) => {
        // Not saved (the server was away): tried again with the next change, or on reconnecting.
        if (!res.ok && !this.#waiting.has(chatId)) this.#waiting.set(chatId, draft);
      })
      .catch(() => {
        if (!this.#waiting.has(chatId)) this.#waiting.set(chatId, draft);
      });
  }

  /** Back online: anything that could not be saved is tried again, then the others' drafts are read. */
  async resync(): Promise<void> {
    for (const id of [...this.#waiting.keys()]) this.#send(id);
    await this.load();
  }

  /** Another tab or device changed a draft. This tab's own changes are already here. */
  onRemote(chatId: string, draft: MessageDraft | null, client: string): void {
    if (client === CLIENT || this.#waiting.has(chatId)) return;
    if (draft) this.all[chatId] = draft;
    else delete this.all[chatId];
  }
}

function sameFiles(a: Upload[], b: Upload[]): boolean {
  return a.length === b.length && a.every((file, i) => file.path === b[i]!.path);
}

export const drafts = new DraftsState();
