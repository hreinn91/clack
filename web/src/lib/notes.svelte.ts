import type { NoteContent, NoteNode } from '../../../shared/protocol';
import { api, ApiError } from './api';
import { within } from './format';

// Notes are markdown files on the server, in data/notes. A note is named by
// its path from there ("Project/Plan"); its sub-notes are under that path.
// The open note saves itself a moment after each change.

const UNFOLDED_KEY = 'clack.notesUnfolded';
const MODE_KEY = 'clack.noteMode';
const LAST_KEY = 'clack.lastNote';
/** How long after the last keystroke a note is saved. */
const SAVE_DELAY = 600;

/** The page's address for a note; '' for the notes overview. */
export function noteHref(path: string): string {
  return path ? `#/notes/${path.split('/').map(encodeURIComponent).join('/')}` : '#/notes';
}

/** The note a note is under; '' for one at the top. */
export function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}

/** Every note with how deep it is, top to bottom as the tree shows them. */
export function flatten(nodes: NoteNode[], depth = 0, out: { node: NoteNode; depth: number }[] = []): { node: NoteNode; depth: number }[] {
  for (const node of nodes) {
    out.push({ node, depth });
    flatten(node.children, depth + 1, out);
  }
  return out;
}

/** How many notes are under a note, at any depth. */
export function countUnder(node: NoteNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countUnder(child), 0);
}

function stored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : (JSON.parse(value) as T);
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered this time.
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

class NotesState {
  tree = $state<NoteNode[]>([]);
  loaded = $state(false);
  /** Something that went wrong with the tree: creating, renaming, moving, deleting or exporting. */
  error = $state<string | null>(null);
  /** Which notes show their sub-notes in the sidebar, by path. Kept in this browser. */
  unfolded = $state<Record<string, boolean>>(stored(UNFOLDED_KEY, {}));
  /** Writing, or reading the note as it will look. Kept in this browser. */
  mode = $state<'edit' | 'preview'>(stored<string>(MODE_KEY, 'edit') === 'preview' ? 'preview' : 'edit');
  /** The note opened last, for the rail to go back to. */
  last = $state<string>(stored(LAST_KEY, ''));

  // ---- the open note ----
  /** The note the page is showing, or null on the overview. */
  path = $state<string | null>(null);
  /** The note as the server has it: what was last loaded or saved. */
  note = $state<NoteContent | null>(null);
  /** What is in the editor, which may be ahead of `note`. */
  text = $state('');
  loading = $state(false);
  /** The note the page is for does not exist (any more). */
  missing = $state(false);
  saving = $state(false);
  saveError = $state<string | null>(null);
  /** The note was saved somewhere else since it was opened here: the newer one, waiting for a choice. */
  conflict = $state<NoteContent | null>(null);
  dirty = $derived(this.note !== null && this.text !== this.note.text);

  // ---- asking about a note ----
  /** A note in the sidebar whose name is being edited in place. */
  renaming = $state<string | null>(null);
  /** A note waiting for its deletion to be confirmed. */
  deleting = $state<NoteNode | null>(null);
  /** A note waiting for a place to move to. */
  moving = $state<NoteNode | null>(null);
  /** The note just made, so its page starts in the title, ready to name it. */
  focusTitle = $state<string | null>(null);
  /** The note being dragged in the sidebar, to drop under another. */
  dragging = $state<string | null>(null);

  #timer: ReturnType<typeof setTimeout> | undefined;
  #saving: Promise<void> | null = null;
  #openSeq = 0;
  #loadSeq = 0;

  constructor() {
    // Closing the tab or reloading with a change not yet saved: it goes out anyway.
    window.addEventListener('pagehide', () => this.#saveNow());
  }

  find(path: string, nodes = this.tree): NoteNode | undefined {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (path.startsWith(`${node.path}/`)) return this.find(path, node.children);
    }
    return undefined;
  }

  async load(): Promise<void> {
    const seq = ++this.#loadSeq;
    try {
      const tree = await api<NoteNode[]>('/api/notes');
      if (seq !== this.#loadSeq) return;
      this.tree = tree;
      this.loaded = true;
      // Deleted in another browser, or outside clack.
      if (this.path && this.note && !this.find(this.path)) {
        this.note = null;
        this.missing = true;
      }
    } catch (err) {
      if (seq === this.#loadSeq) this.error = message(err);
    }
  }

  setMode(mode: 'edit' | 'preview'): void {
    this.mode = mode;
    store(MODE_KEY, mode);
  }

  toggleFold(path: string, open = !this.unfolded[path]): void {
    if (open) this.unfolded[path] = true;
    else delete this.unfolded[path];
    store(UNFOLDED_KEY, this.unfolded);
  }

  /** Unfolds every note above this one, so it can be seen in the sidebar. */
  reveal(path: string): void {
    let changed = false;
    for (let at = parentOf(path); at; at = parentOf(at)) {
      if (!this.unfolded[at]) {
        this.unfolded[at] = true;
        changed = true;
      }
    }
    if (changed) store(UNFOLDED_KEY, this.unfolded);
  }

  /** Opens a note on the page, after saving the one being left. null for the overview. */
  async open(path: string | null): Promise<void> {
    if (path === this.path && (this.note || this.loading || this.missing)) return;
    await this.flush();
    const seq = ++this.#openSeq;
    this.path = path;
    this.note = null;
    this.text = '';
    this.missing = false;
    this.conflict = null;
    this.saveError = null;
    if (!path) return;
    this.last = path;
    store(LAST_KEY, path);
    this.reveal(path);
    this.loading = true;
    try {
      const note = await api<NoteContent>(`/api/notes/content?path=${encodeURIComponent(path)}`);
      if (seq !== this.#openSeq) return;
      this.note = note;
      this.text = note.text;
    } catch (err) {
      if (seq !== this.#openSeq) return;
      if (err instanceof ApiError && err.status === 404) {
        this.missing = true;
        if (this.last === path) {
          this.last = '';
          store(LAST_KEY, '');
        }
      } else {
        this.saveError = message(err);
      }
    } finally {
      if (seq === this.#openSeq) this.loading = false;
    }
  }

  /** The editor changed: saved a moment later. */
  edit(text: string): void {
    this.text = text;
    this.saveError = null;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.save(), SAVE_DELAY);
  }

  /** Saves the open note now, when it has changes. One save at a time; a later change gets its own. */
  async save(): Promise<void> {
    clearTimeout(this.#timer);
    while (this.#saving) await this.#saving;
    const note = this.note;
    if (!note || this.conflict || this.text === note.text) return;
    const text = this.text;
    this.saving = true;
    this.#saving = (async () => {
      try {
        const res = await fetch('/api/notes/content', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: note.path, text, base: note.modified }),
        });
        const body = (await res.json().catch(() => null)) as { modified?: number; error?: string; note?: NoteContent } | null;
        if (res.status === 409 && body?.note) {
          if (this.note?.path === note.path) this.conflict = body.note;
          return;
        }
        if (!res.ok || typeof body?.modified !== 'number') throw new ApiError(res.status, body?.error ?? 'The note could not be saved.');
        if (this.note?.path === note.path) this.note = { ...this.note, text, modified: body.modified };
        const node = this.find(note.path);
        if (node) node.modified = body.modified;
      } catch (err) {
        if (this.note?.path === note.path) this.saveError = message(err);
      } finally {
        this.saving = false;
        this.#saving = null;
      }
    })();
    await this.#saving;
    // Typed on while it was saving: that goes in the next save.
    if (this.note?.path === note.path && this.dirty && !this.conflict && !this.saveError) {
      this.#timer = setTimeout(() => void this.save(), SAVE_DELAY);
    }
  }

  /** Saves what is waiting, before the note is left, renamed or moved. */
  async flush(): Promise<void> {
    clearTimeout(this.#timer);
    if (this.dirty || this.#saving) await this.save();
  }

  /** On leaving the page: a last save that outlives it. */
  #saveNow(): void {
    const note = this.note;
    if (!note || !this.dirty || this.conflict) return;
    void fetch('/api/notes/content', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: note.path, text: this.text, base: note.modified }),
      keepalive: true,
    }).catch(() => {});
  }

  /** Someone saved a note: when it is the open one and not this tab's own save, take the newer text. */
  async onSaved(path: string, modified: number): Promise<void> {
    if (path !== this.path || !this.note || this.saving || Math.abs(modified - this.note.modified) <= 1) {
      const node = this.find(path);
      if (node) node.modified = modified;
      return;
    }
    let newer: NoteContent;
    try {
      newer = await api<NoteContent>(`/api/notes/content?path=${encodeURIComponent(path)}`);
    } catch {
      return;
    }
    if (path !== this.path || !this.note || newer.modified <= this.note.modified) return;
    if (this.dirty) {
      this.conflict = newer;
    } else {
      this.note = newer;
      this.text = newer.text;
    }
  }

  /** Keeps this tab's text and writes it over the other save. */
  keepMine(): void {
    if (!this.note || !this.conflict) return;
    this.note = { ...this.note, modified: this.conflict.modified };
    this.conflict = null;
    void this.save();
  }

  /** Drops this tab's changes for the other save. */
  takeTheirs(): void {
    if (!this.conflict) return;
    this.note = this.conflict;
    this.text = this.conflict.text;
    this.conflict = null;
    this.saveError = null;
  }

  // ---- the tree ---------------------------------------------------------------

  /** Makes a note, at the top or under another, and opens it with its title ready to type. */
  async create(parent = '', title = 'Untitled'): Promise<void> {
    this.error = null;
    try {
      const { path } = await api<{ path: string }>('/api/notes', { parent, title });
      if (parent) this.toggleFold(parent, true);
      await this.load();
      this.focusTitle = path;
      location.hash = noteHref(path);
    } catch (err) {
      this.error = message(err);
    }
  }

  /** Renames a note. The server may add a number when the name is taken. */
  async rename(path: string, title: string): Promise<void> {
    await this.#relocate(path, { title });
  }

  /** Whether the note being dragged may be dropped under `parent` ('' for the top). */
  canDrop(parent: string): boolean {
    const from = this.dragging;
    return from !== null && parentOf(from) !== parent && !within(parent, from);
  }

  /** Moves a note, and the notes under it, under another note; '' for the top. */
  async move(path: string, parent: string): Promise<void> {
    if (parentOf(path) === parent || within(parent, path)) return;
    await this.#relocate(path, { parent });
    if (parent) this.toggleFold(parent, true);
  }

  /** Notes being renamed or moved right now: a second change waits for the answer to the first. */
  #relocating = new Set<string>();

  async #relocate(path: string, change: { title?: string; parent?: string }): Promise<void> {
    // Enter and then leaving the field both commit a title; the second finds the first under way.
    if (this.#relocating.has(path)) return;
    this.#relocating.add(path);
    this.error = null;
    try {
      // The open note may be the one moving, or under it: what it has waiting is saved where it is now.
      if (this.path && within(this.path, path)) await this.flush();
      const { path: to } = await api<{ path: string }>('/api/notes', { path, ...change }, 'PATCH');
      if (to !== path) this.#moved(path, to);
      await this.load();
    } catch (err) {
      this.error = message(err);
    } finally {
      this.#relocating.delete(path);
    }
  }

  /** A note and the notes under it have a new path: everything that remembers one follows. */
  #moved(from: string, to: string): void {
    const follow = (path: string) => (within(path, from) ? to + path.slice(from.length) : path);
    const unfolded: Record<string, boolean> = {};
    for (const path of Object.keys(this.unfolded)) unfolded[follow(path)] = true;
    this.unfolded = unfolded;
    store(UNFOLDED_KEY, unfolded);
    if (this.last && within(this.last, from)) {
      this.last = follow(this.last);
      store(LAST_KEY, this.last);
    }
    if (this.path && within(this.path, from)) {
      this.path = follow(this.path);
      if (this.note) this.note = { ...this.note, path: this.path, title: this.path.slice(this.path.lastIndexOf('/') + 1) };
      // The page's address follows too, without a step in the history; open() sees it is the same note.
      location.replace(noteHref(this.path));
    }
  }

  async remove(path: string): Promise<void> {
    this.error = null;
    const showing = this.path !== null && within(this.path, path);
    if (showing) {
      // Nothing of it is saved after this.
      clearTimeout(this.#timer);
      this.note = null;
    }
    try {
      await api(`/api/notes?path=${encodeURIComponent(path)}`, undefined, 'DELETE');
      if (showing) location.hash = noteHref(parentOf(path));
      if (this.last && within(this.last, path)) {
        this.last = '';
        store(LAST_KEY, '');
      }
      await this.load();
    } catch (err) {
      this.error = message(err);
      if (showing && this.path) {
        const reopen = this.path;
        this.path = null;
        void this.open(reopen);
      }
    }
  }

  /**
   * Downloads a note as markdown, or (`zip`) it and its sub-notes as a zip;
   * with no path, every note. Saved first, so the file has the latest text.
   */
  async download(path: string, zip: boolean): Promise<void> {
    this.error = null;
    if (this.path && within(this.path, path || this.path)) await this.flush();
    try {
      const res = await fetch(`/api/notes/export?path=${encodeURIComponent(path)}&format=${zip ? 'zip' : 'md'}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new ApiError(res.status, body?.error ?? 'The note could not be exported.');
      }
      const name = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get('content-disposition') ?? '')?.[1];
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = name ? decodeURIComponent(name) : zip ? 'notes.zip' : 'note.md';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      this.error = message(err);
    }
  }
}

export const notes = new NotesState();
