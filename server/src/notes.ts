import { EventEmitter } from 'node:events';
import { mkdirSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import type { NoteContent, NoteNode } from '../../shared/protocol.ts';
import { config } from './config.ts';

// Notes live in data/notes as plain markdown, so they can be read and edited
// outside clack too. A note is NAME.md; its sub-notes are in a folder NAME
// beside it. A folder without a .md beside it is a note with nothing written
// yet. A note's path is its place from data/notes without ".md": "Project/Plan".

/** Emits 'changed' when notes are added, renamed, moved or deleted, and 'saved' (path, modified) when one is saved. */
export const notesBus = new EventEmitter();

mkdirSync(config.notesDir, { recursive: true });

export class NoteError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Changes to notes happen one at a time: a rename racing a save or another
 * rename could otherwise write a note back under a name it just left. A file
 * system error comes out as something to tell the person.
 */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work).catch((err: unknown) => {
    if (err instanceof NoteError) throw err;
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') throw new NoteError(404, 'That note does not exist any more.');
    if (code === 'EEXIST' || code === 'ENOTEMPTY') throw new NoteError(409, 'There is already a note with that name.');
    if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') throw new NoteError(403, 'The notes folder cannot be written to.');
    if (code === 'ENOSPC') throw new NoteError(507, 'The server is out of disk space.');
    throw err;
  });
  queue = run.catch(() => {});
  return run;
}

/** The deepest notes can be nested. */
const MAX_DEPTH = 12;
/** More notes than this and the rest are left out of the tree. */
const MAX_NOTES = 5000;
const MAX_NOTE_BYTES = 5 * 1024 * 1024;

/** A note's name as typed, made safe as a file name: no slashes or other characters file systems refuse. */
function cleanTitle(title: unknown): string {
  const raw = typeof title === 'string' ? title : '';
  return raw
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.md$/i, '')
    .slice(0, 120)
    .trim();
}

function validPart(part: string): boolean {
  return part.length > 0 && part.length <= 120 && !part.startsWith('.') && !/[\0\\/]/.test(part);
}

/** A note path from the UI as its parts, refused when it could point anywhere but a note. '' is the top of the notes. */
function partsOf(path: unknown, allowRoot = false): string[] {
  if (typeof path !== 'string') throw new NoteError(400, 'Which note?');
  if (path === '' && allowRoot) return [];
  const parts = path.split('/');
  if (!parts.length || parts.length > MAX_DEPTH || !parts.every(validPart)) throw new NoteError(400, 'That is not a note.');
  return parts;
}

const fileOf = (parts: string[]) => join(config.notesDir, ...parts.slice(0, -1), `${parts.at(-1)}.md`);
const folderOf = (parts: string[]) => join(config.notesDir, ...parts);

async function kind(path: string): Promise<'file' | 'dir' | 'link' | undefined> {
  const info = await lstat(path).catch(() => undefined);
  if (!info) return undefined;
  if (info.isSymbolicLink()) return 'link';
  return info.isDirectory() ? 'dir' : 'file';
}

/** Refuses a note any part of whose way there is a symlink, which could lead out of data/notes. */
async function refuseLinks(parts: string[]): Promise<void> {
  let at = config.notesDir;
  for (const part of parts.slice(0, -1)) {
    at = join(at, part);
    if ((await kind(at)) === 'link') throw new NoteError(403, 'That note cannot be used.');
  }
  for (const path of parts.length ? [fileOf(parts), folderOf(parts)] : []) {
    if ((await kind(path)) === 'link') throw new NoteError(403, 'That note cannot be used.');
  }
}

async function exists(parts: string[]): Promise<boolean> {
  return (await kind(fileOf(parts))) === 'file' || (await kind(folderOf(parts))) === 'dir';
}

/**
 * A name not yet taken among a note's sub-notes: "Plan", or "Plan 2", "Plan 3"…
 * Names differing only in case count as taken too: most Mac and Windows disks
 * cannot hold both, and a zip of them could not be unpacked there. `except` is
 * the note's own name, when it is being renamed.
 */
async function freeName(parent: string[], wanted: string, except?: string): Promise<string> {
  const entries = await readdir(folderOf(parent)).catch(() => [] as string[]);
  const taken = new Set(
    entries
      .map((name) => (name.toLowerCase().endsWith('.md') ? name.slice(0, -3) : name))
      .filter((name) => name !== except)
      .map((name) => name.toLowerCase()),
  );
  for (let n = 1; n < 1000; n++) {
    const name = n === 1 ? wanted : `${wanted} ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
  throw new NoteError(409, 'There are too many notes with that name.');
}

// ---- the tree ---------------------------------------------------------------------

export async function listNotes(): Promise<NoteNode[]> {
  let count = 0;
  async function level(parts: string[]): Promise<NoteNode[]> {
    if (parts.length >= MAX_DEPTH) return [];
    const entries = await readdir(join(config.notesDir, ...parts), { withFileTypes: true }).catch(() => []);
    const names = new Map<string, { file: boolean; dir: boolean }>();
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const name = entry.name.slice(0, -3);
        if (validPart(name)) names.set(name, { ...(names.get(name) ?? { dir: false }), file: true });
      } else if (entry.isDirectory() && validPart(entry.name)) {
        names.set(entry.name, { ...(names.get(entry.name) ?? { file: false }), dir: true });
      }
    }
    const nodes: NoteNode[] = [];
    for (const [name, found] of names) {
      if (++count > MAX_NOTES) break;
      const here = [...parts, name];
      const info = await stat(found.file ? fileOf(here) : folderOf(here)).catch(() => undefined);
      nodes.push({ path: here.join('/'), title: name, modified: info?.mtimeMs ?? 0, children: found.dir ? await level(here) : [] });
    }
    return nodes.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
  }
  return level([]);
}

// ---- one note -----------------------------------------------------------------------

export async function readNote(path: unknown): Promise<NoteContent> {
  const parts = partsOf(path);
  await refuseLinks(parts);
  if (!(await exists(parts))) throw new NoteError(404, 'That note does not exist any more.');
  const file = fileOf(parts);
  const info = await stat(file).catch(() => undefined);
  if (info && info.size > MAX_NOTE_BYTES) throw new NoteError(413, 'That note is too big to open here.');
  const text = info ? await readFile(file, 'utf8') : '';
  return { path: parts.join('/'), title: parts.at(-1)!, text, modified: info?.mtimeMs ?? 0 };
}

/**
 * Saves a note's text. `base` is when the note was last saved as the editor
 * knows it: when the file changed since (another browser, an editor outside
 * clack), nothing is written and the newer text comes back with a 409.
 */
export async function saveNote(path: unknown, text: unknown, base: unknown): Promise<{ modified: number }> {
  return serial(async () => {
    const parts = partsOf(path);
    if (typeof text !== 'string') throw new NoteError(400, 'A note is text.');
    if (Buffer.byteLength(text) > MAX_NOTE_BYTES) throw new NoteError(413, 'That note is too big to save.');
    await refuseLinks(parts);
    if (!(await exists(parts))) throw new NoteError(404, 'That note does not exist any more.');
    const file = fileOf(parts);
    const before = await stat(file).catch(() => undefined);
    if (typeof base === 'number' && before && Math.abs(before.mtimeMs - base) > 1) {
      throw new NoteError(409, 'This note was changed somewhere else since it was opened here.');
    }
    await mkdir(dirname(file), { recursive: true });
    // Written next to it first and then put in place, so a note is never left half written.
    const temp = join(dirname(file), `.${parts.at(-1)}.${process.pid}.tmp`);
    await writeFile(temp, text, 'utf8');
    await rename(temp, file);
    const modified = (await stat(file)).mtimeMs;
    notesBus.emit('saved', parts.join('/'), modified);
    return { modified };
  });
}

/** A new note, at the top or under `parent`. Returns its path. */
export async function createNote(parent: unknown, title: unknown): Promise<string> {
  return serial(async () => {
    const under = partsOf(parent ?? '', true);
    if (under.length >= MAX_DEPTH) throw new NoteError(400, 'Notes cannot be nested any deeper.');
    await refuseLinks(under);
    if (under.length && !(await exists(under))) throw new NoteError(404, 'The note to put it under does not exist any more.');
    const name = await freeName(under, cleanTitle(title) || 'Untitled');
    const parts = [...under, name];
    await mkdir(dirname(fileOf(parts)), { recursive: true });
    await writeFile(fileOf(parts), '', { flag: 'wx' });
    notesBus.emit('changed');
    return parts.join('/');
  });
}

/** Moves a note's file and its sub-notes' folder together, to another name or place. */
async function relocate(from: string[], to: string[]): Promise<void> {
  await mkdir(dirname(fileOf(to)), { recursive: true });
  if ((await kind(fileOf(from))) === 'file') await rename(fileOf(from), fileOf(to));
  if ((await kind(folderOf(from))) === 'dir') await rename(folderOf(from), folderOf(to));
}

/** Gives a note another name, and (with `parent`) another place: '' for the top. Returns its new path. */
export async function moveNote(path: unknown, title: unknown, parent: unknown): Promise<string> {
  return serial(async () => {
    const parts = partsOf(path);
    await refuseLinks(parts);
    if (!(await exists(parts))) throw new NoteError(404, 'That note does not exist any more.');
    const under = parent === undefined ? parts.slice(0, -1) : partsOf(parent, true);
    await refuseLinks(under);
    if (under.length && !(await exists(under))) throw new NoteError(404, 'The note to move it under does not exist any more.');
    const joined = parts.join('/');
    if (under.join('/') === joined || under.join('/').startsWith(`${joined}/`)) throw new NoteError(400, 'A note cannot go inside itself.');
    if (under.length + 1 > MAX_DEPTH) throw new NoteError(400, 'Notes cannot be nested any deeper.');
    const sameParent = under.join('/') === parts.slice(0, -1).join('/');
    const wanted = title === undefined ? parts.at(-1)! : cleanTitle(title);
    if (!wanted) throw new NoteError(400, 'A note needs a name.');
    const name = await freeName(under, wanted, sameParent ? parts.at(-1) : undefined);
    const to = [...under, name];
    if (to.join('/') === joined) return joined;
    // A change of case only ("plan" to "Plan") goes through another name first, for disks that ignore case.
    if (sameParent && name.toLowerCase() === parts.at(-1)!.toLowerCase()) {
      const step = [...under, `.${name}.${process.pid}.renaming`];
      await relocate(parts, step);
      await relocate(step, to);
    } else {
      await relocate(parts, to);
    }
    notesBus.emit('changed');
    return to.join('/');
  });
}

/** Deletes a note and every note under it, for good. */
export async function deleteNote(path: unknown): Promise<void> {
  return serial(async () => {
    const parts = partsOf(path);
    await refuseLinks(parts);
    if (!(await exists(parts))) throw new NoteError(404, 'That note does not exist any more.');
    await rm(fileOf(parts), { force: true });
    await rm(folderOf(parts), { recursive: true, force: true });
    notesBus.emit('changed');
  });
}

// ---- export -------------------------------------------------------------------------

/** Every note file under a place (with the note itself first), as [name inside the zip, file]. */
async function collect(parts: string[]): Promise<[string, string][]> {
  const found: [string, string][] = [];
  async function walk(here: string[], inZip: string[]): Promise<void> {
    if (here.length && (await kind(fileOf(here))) === 'file') found.push([`${inZip.join('/')}.md`, fileOf(here)]);
    const entries = await readdir(folderOf(here), { withFileTypes: true }).catch(() => []);
    const names = new Set<string>();
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) names.add(entry.name.slice(0, -3));
      else if (entry.isDirectory()) names.add(entry.name);
    }
    for (const name of [...names].sort()) if (validPart(name)) await walk([...here, name], [...inZip, name]);
  }
  await walk(parts, parts.length ? [parts.at(-1)!] : []);
  return found;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A zip file of [name, contents] pairs, deflated, with UTF-8 names. Small: notes are text. */
function zip(files: [string, Buffer][]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [name, data] of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // names in UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    chunks.push(local, nameBytes, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

/**
 * A note for download: its own .md, or (`withSubNotes`) a zip of it and every
 * note under it, the tree kept as folders. With no path, a zip of all notes.
 */
export async function exportNotes(path: unknown, withSubNotes: boolean): Promise<{ name: string; type: string; data: Buffer }> {
  const parts = partsOf(path ?? '', true);
  await refuseLinks(parts);
  if (parts.length && !(await exists(parts))) throw new NoteError(404, 'That note does not exist any more.');
  if (parts.length && !withSubNotes) {
    const data = await readFile(fileOf(parts)).catch(() => Buffer.alloc(0));
    return { name: `${parts.at(-1)}.md`, type: 'text/markdown; charset=utf-8', data };
  }
  const files: [string, Buffer][] = [];
  for (const [name, file] of await collect(parts)) files.push([name, await readFile(file)]);
  return { name: `${parts.at(-1) ?? 'notes'}.zip`, type: 'application/zip', data: zip(files) };
}
