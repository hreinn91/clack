import { readFileSync, statSync } from 'node:fs';
import { mkdir, readdir, realpath, stat } from 'node:fs/promises';
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

/**
 * Reduces a typed folder path, such as "Work/Client A", to plain names joined
 * by slashes ("work/client-a"). Each part is slugified on its own, so the
 * result can never step outside data/sessions.
 */
export function slugPath(path: string): string {
  return path.split(/[\\/]+/).map(slugify).filter(Boolean).slice(0, MAX_DEPTH).join('/');
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
  let slug = typeof name === 'string' ? slugPath(name) : '';
  if (!slug && required) throw new Error('Give the folder a name.');
  slug ||= generatedName();
  const path = join(config.sessionsDir, ...slug.split('/'));
  await mkdir(path, { recursive: true });
  // A symlink planted in data/sessions must not become a way out of it.
  const real = await realpath(path);
  if (real !== path) throw new Error('That folder cannot be used.');
  return real;
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
        const modified = (await stat(join(config.sessionsDir, name)).catch(() => undefined))?.mtimeMs ?? 0;
        folders.push({ name, modified });
        next.push(name);
      }
    }
    level = next;
  }
  return folders;
}
