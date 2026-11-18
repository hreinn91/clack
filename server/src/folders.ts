import { readFileSync, statSync } from 'node:fs';
import { lstat, mkdir, readdir, realpath, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
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

/** The deepest a chat folder can be nested. */
const MAX_DEPTH = 8;

/** A folder name that can be used just as it is written: not hidden, not "." or "..", and with nothing that could reach elsewhere. */
function plainName(part: string): boolean {
  return part.length > 0 && part.length <= 255 && !part.startsWith('.') && !/[\0\\/]/.test(part);
}

/**
 * Reduces a typed folder path to the names of the folders it means below
 * data/sessions. A part that names a folder that is already there is kept as
 * it is written ("MyRepo", "my_project"), so existing folders work whatever
 * they are called. Any other part is the name of a folder still to be made
 * and is reduced to a plain one ("Client A" → "client-a"). Nothing in the
 * result can step outside data/sessions.
 */
export function folderParts(path: string): string[] {
  const parts: string[] = [];
  let dir = config.sessionsDir;
  for (const raw of path.split(/[\\/]+/)) {
    if (parts.length >= MAX_DEPTH) break;
    const part = plainName(raw) && isFolder(join(dir, raw)) ? raw : slugify(raw);
    if (!part) continue;
    parts.push(part);
    dir = join(dir, part);
  }
  return parts;
}

/**
 * Refuses a path below data/sessions when any folder along the way is a
 * symlink, which could lead out of it. Parts that do not exist yet are fine.
 */
async function refuseLinks(path: string): Promise<void> {
  let at = config.sessionsDir;
  for (const part of relative(config.sessionsDir, path).split(sep).filter(Boolean)) {
    at = join(at, part);
    const info = await lstat(at).catch(() => undefined);
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error(`${folderLabel(at)} is a link to somewhere else, so chats cannot use it.`);
  }
}

/**
 * The git repository a chat's folder is in, when that repository is itself
 * under data/sessions: its top folder and its git directory. The search stops
 * at data/sessions, so a repository the data directory happens to sit in is
 * never used.
 */
export function gitRepo(cwd: string): { root: string; gitDir: string } | undefined {
  for (let dir = cwd; insideSessions(dir); dir = dirname(dir)) {
    const dotGit = join(dir, '.git');
    try {
      // A worktree or submodule has a file pointing at the real git directory.
      if (statSync(dotGit).isFile()) {
        const pointer = readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m);
        return pointer ? { root: dir, gitDir: resolve(dir, pointer[1]!.trim()) } : undefined;
      }
      return { root: dir, gitDir: dotGit };
    } catch {
      // no .git here: look one folder up
    }
  }
  return undefined;
}

/** The branch a chat's folder is on (see gitRepo); for a detached checkout, the start of the commit's hash. */
export function gitBranch(cwd: string): string | undefined {
  const repo = gitRepo(cwd);
  if (!repo) return undefined;
  try {
    const head = readFileSync(join(repo.gitDir, 'HEAD'), 'utf8').trim();
    const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    return ref ? ref[1] : /^[0-9a-f]{7,}$/.test(head) ? head.slice(0, 7) : undefined;
  } catch {
    return undefined;
  }
}

/** True when a path is an existing directory. */
export function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function generatedName(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `chat-${date}-${time}`;
}

/**
 * Returns the session folder for a name or a path of names ("work/client-a"),
 * creating it if it does not exist yet. With `required` an empty name is an
 * error; otherwise a name is made up.
 */
export async function ensureFolder(name: unknown, required = false): Promise<string> {
  const parts = typeof name === 'string' ? folderParts(name) : [];
  if (!parts.length && required) throw new Error('Give the folder a name.');
  if (!parts.length) parts.push(generatedName());
  const path = join(config.sessionsDir, ...parts);
  // A symlink planted in data/sessions must not become a way out of it.
  await refuseLinks(path);
  await mkdir(path, { recursive: true });
  await refuseLinks(path);
  // On a disk that ignores case (macOS, Windows) "myrepo" finds "MyRepo": keep the folder's own spelling.
  const real = await realpath(path);
  if (!insideSessions(real)) throw new Error('That folder cannot be used.');
  return real;
}

/** Creates a chat's folder again after it was deleted, the same way a new one is made. */
export async function recreateFolder(path: string): Promise<void> {
  if (!insideSessions(path)) throw new Error('That folder cannot be used.');
  await refuseLinks(path);
  await mkdir(path, { recursive: true });
  await refuseLinks(path);
}

/**
 * The existing folder a path from the chat tree names, exactly as it is
 * written there. Unlike ensureFolder nothing is made up or created: it has to
 * be there already. Never data/sessions itself.
 */
export async function existingFolder(name: unknown): Promise<string> {
  const parts = typeof name === 'string' ? name.split('/') : [];
  if (!parts.length || parts.length > MAX_DEPTH || !parts.every(plainName)) throw new Error('That is not a folder in data/sessions.');
  const path = join(config.sessionsDir, ...parts);
  await refuseLinks(path);
  if (!isFolder(path)) throw new Error(`There is no folder ${parts.join('/')} in data/sessions.`);
  return path;
}

/** Deletes a folder under data/sessions and everything in it, for good. */
export async function removeFolder(path: string): Promise<void> {
  if (!insideSessions(path)) throw new Error('That folder cannot be deleted.');
  await refuseLinks(path);
  await rm(path, { recursive: true });
}

/** Folders never shown in the chat tree: hidden ones (.git, .claude) and installed packages. */
function skipped(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules' || name === '__pycache__';
}

/** More folders than this and the rest are left out, so a huge project cannot stall the sidebar. */
const MAX_FOLDERS = 3000;

/**
 * Every folder under data/sessions, at any depth, as paths relative to it
 * ("work/client-a"). Symlinks are not followed. Parents come before their
 * children.
 */
export async function listFolders(): Promise<FolderInfo[]> {
  const folders: FolderInfo[] = [];
  let level = [''];
  for (let depth = 0; depth < MAX_DEPTH && level.length && folders.length < MAX_FOLDERS; depth++) {
    const next: string[] = [];
    for (const parent of level) {
      const entries = await readdir(join(config.sessionsDir, parent), { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory() || skipped(entry.name) || folders.length >= MAX_FOLDERS) continue;
        const name = parent ? `${parent}/${entry.name}` : entry.name;
        const path = join(config.sessionsDir, name);
        const modified = (await stat(path).catch(() => undefined))?.mtimeMs ?? 0;
        // A .git of its own (a folder, or a file for a worktree or submodule) makes it the top of a repository.
        const repo = await stat(join(path, '.git')).then(
          () => true,
          () => false,
        );
        folders.push(repo ? { name, modified, repo, branch: gitBranch(path) } : { name, modified });
        next.push(name);
      }
    }
    level = next;
  }
  return folders;
}
