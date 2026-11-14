import { mkdir, readdir, realpath, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { FolderInfo } from '../../shared/protocol.ts';
import { config } from './config.ts';

/** True when `path` is `dir` itself or somewhere below it. Compares paths as written; it does not follow symlinks. */
export function insideDir(path: string, dir: string): boolean {
  const target = resolve(path);
  return target === dir || target.startsWith(dir + sep);
}

/** True when a working directory is one of the session folders (or below one), never the sessions root itself. */
export function insideSessions(cwd: string): boolean {
  return resolve(cwd).startsWith(config.sessionsDir + sep);
}

/** A session folder's path as the UI shows it: relative to data/sessions. */
export function folderLabel(cwd: string): string {
  return relative(config.sessionsDir, cwd) || '.';
}

/** Reduces whatever was typed to a plain folder name, so it can never point outside data/sessions. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

function generatedName(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `chat-${date}-${time}`;
}

/** Returns the session folder for a name, creating it if it does not exist yet. */
export async function ensureFolder(name: unknown): Promise<string> {
  const slug = (typeof name === 'string' ? slugify(name) : '') || generatedName();
  const path = join(config.sessionsDir, slug);
  await mkdir(path, { recursive: true });
  // A symlink planted in data/sessions must not become a way out of it.
  const real = await realpath(path);
  if (real !== path) throw new Error('That folder cannot be used.');
  return real;
}

export async function listFolders(): Promise<FolderInfo[]> {
  const entries = await readdir(config.sessionsDir, { withFileTypes: true });
  const folders = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(async (entry) => ({
        name: entry.name,
        modified: (await stat(join(config.sessionsDir, entry.name))).mtimeMs,
      })),
  );
  return folders.sort((a, b) => b.modified - a.modified);
}
