import { createReadStream } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { open, readdir, realpath, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { FileEntry, FileListing, FilePreview } from '../../shared/protocol.ts';
import { config } from './config.ts';
import { insideDir } from './folders.ts';

/** A problem with a path the UI asked for, with the HTTP status that describes it. */
export class FileError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MAX_ENTRIES = 1000;
const MAX_PREVIEW_BYTES = 256 * 1024;

// Pictures the browser can show as they are. SVG is left out: it can carry scripts, so it is shown as text.
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** A path under the data directory as the UI writes it: relative, with forward slashes, '' for the directory itself. */
export function dataPath(absolute: string): string {
  return relative(config.dataDir, absolute).split(sep).join('/');
}

/**
 * Turns a path from the UI into a real path, and refuses anything that is not
 * inside the data directory. Symlinks are followed first, so a link planted
 * in there cannot be used to look elsewhere.
 */
export async function resolveInData(path: unknown): Promise<string> {
  if (typeof path !== 'string' || path.includes('\0') || path.length > 4096) throw new FileError(400, 'That is not a path.');
  // A leading slash would otherwise make the path absolute and ignore the data directory.
  const target = resolve(config.dataDir, path.replace(/^[/\\]+/, ''));
  if (!insideDir(target, config.dataDir)) throw new FileError(403, 'That is outside the data directory.');
  let real: string;
  try {
    real = await realpath(target);
  } catch {
    throw new FileError(404, 'That file or folder does not exist.');
  }
  if (!insideDir(real, config.dataDir)) throw new FileError(403, 'That leads outside the data directory.');
  return real;
}

export async function listDir(path: unknown): Promise<FileListing> {
  const dir = await resolveInData(path);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    throw new FileError(400, 'That is not a folder.');
  }
  const entries: FileEntry[] = [];
  for (const name of names.slice(0, MAX_ENTRIES)) {
    try {
      // Follows symlinks, so a link to a folder opens like one. A broken link is left out.
      const info = await stat(join(dir, name));
      entries.push({ name, kind: info.isDirectory() ? 'dir' : 'file', size: info.size, modified: info.mtimeMs });
    } catch {
      continue;
    }
  }
  entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1));
  return { path: dataPath(dir), entries, truncated: names.length > MAX_ENTRIES };
}

/** What the UI needs to show a file: its text if it is text, otherwise what kind of thing it is. */
export async function previewFile(path: unknown): Promise<FilePreview> {
  const file = await resolveInData(path);
  const info = await stat(file);
  if (!info.isFile()) throw new FileError(400, 'That is not a file.');
  const base = { path: dataPath(file), size: info.size, modified: info.mtimeMs };
  if (IMAGE_TYPES[extname(file).toLowerCase()]) return { ...base, kind: 'image' };

  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(info.size, MAX_PREVIEW_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    // Text files do not contain NUL bytes; almost everything else does early on.
    if (bytes.includes(0)) return { ...base, kind: 'binary' };
    return { ...base, kind: 'text', text: new TextDecoder().decode(bytes), truncated: info.size > bytesRead };
  } finally {
    await handle.close();
  }
}

/** Opens a picture for the browser to show. Only the image types above are ever served this way. */
export async function openImage(path: unknown): Promise<{ stream: ReadStream; type: string; size: number }> {
  return imageAt(await resolveInData(path));
}

/**
 * Opens a picture in a chat's folder, by its path from there. This works for
 * chats in any folder, including those outside the data directory.
 */
export async function openChatImage(cwd: string, path: unknown): Promise<{ stream: ReadStream; type: string; size: number }> {
  if (typeof path !== 'string' || !path || path.includes('\0') || path.length > 4096) throw new FileError(400, 'That is not a path.');
  const target = resolve(cwd, path.replace(/^[/\\]+/, ''));
  if (!insideDir(target, cwd)) throw new FileError(403, "That is outside the chat's folder.");
  let real: string;
  try {
    real = await realpath(target);
  } catch {
    throw new FileError(404, 'That file does not exist.');
  }
  if (!insideDir(real, await realpath(cwd))) throw new FileError(403, "That leads outside the chat's folder.");
  return imageAt(real);
}

async function imageAt(file: string): Promise<{ stream: ReadStream; type: string; size: number }> {
  const type = IMAGE_TYPES[extname(file).toLowerCase()];
  if (!type) throw new FileError(415, 'Only pictures can be shown this way.');
  const info = await stat(file);
  if (!info.isFile()) throw new FileError(400, 'That is not a file.');
  return { stream: createReadStream(file), type, size: info.size };
}
