import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { lstat, mkdir, readdir, realpath, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import type { BrowseListing, FolderInfo, FolderRoot } from '../../shared/protocol.ts';
import { config } from './config.ts';

/** True when `path` is `dir` itself or somewhere below it. Compares paths as written; it does not follow symlinks. */
export function insideDir(path: string, dir: string): boolean {
  const target = resolve(path);
  return target === dir || target.startsWith(dir + sep);
}

// ---- where chats can work ------------------------------------------------------
//
// Chats work in folders under data/sessions, and in folders outside it that
// were added from the UI ("outside folders"). Each of those is a root: it has
// its own tree in the sidebar. A folder under data/sessions is named by its
// path from there ("work/client-a"); one in an outside folder by its absolute
// path ("/Users/me/code/site/docs").

/** The outside folders, as absolute real paths. None is inside another, or inside the data directory. */
let outside: string[] = loadRoots();

function loadRoots(): string[] {
  try {
    const saved = JSON.parse(readFileSync(config.rootsFile, 'utf8')) as unknown;
    return Array.isArray(saved) ? saved.filter((path): path is string => typeof path === 'string' && isAbsolute(path)) : [];
  } catch {
    return [];
  }
}

function saveRoots(): void {
  writeFileSync(config.rootsFile, JSON.stringify(outside, null, 2) + '\n');
}

/** "~/code/site" for a folder in the home folder, the whole path otherwise. */
export function shortPath(path: string): string {
  const home = homedir();
  return path === home ? '~' : path.startsWith(home + sep) ? `~/${path.slice(home.length + 1)}` : path;
}

function expandHome(path: string): string {
  return path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path;
}

/**
 * The root a path is in: data/sessions for anything below it (never
 * data/sessions itself), or the outside folder it is in or is. Undefined for
 * anywhere else, including the rest of the data directory.
 */
export function rootOf(path: string): string | undefined {
  const target = resolve(path);
  if (target.startsWith(config.sessionsDir + sep)) return config.sessionsDir;
  if (insideDir(target, config.dataDir)) return undefined;
  return outside.find((root) => insideDir(target, root));
}

/** True when a chat may work in this folder: below data/sessions, or in or below an outside folder. */
export function insideRoots(cwd: string): boolean {
  return rootOf(cwd) !== undefined;
}

/** A chat folder's name as the UI shows it: from data/sessions for those under it, the absolute path for the rest. */
export function folderLabel(cwd: string): string {
  return insideDir(cwd, config.sessionsDir) ? relative(config.sessionsDir, cwd) || '.' : resolve(cwd);
}

/** The outside folders, for the sidebar. */
export function listRoots(): FolderRoot[] {
  return outside.map((path) => ({ path, label: shortPath(path), missing: !isFolder(path) }));
}

/**
 * Adds a folder outside data/sessions, so chats can work in it. Returns its
 * real path, which is where a chat started from the picker works. A folder
 * inside one already added is fine as it is and adds nothing; one that holds
 * folders added before takes their place, since its tree has them.
 */
export async function addRoot(path: unknown): Promise<string> {
  if (!config.outsideFolders) throw new Error('This server only lets chats work in data/sessions.');
  if (typeof path !== 'string' || !path.trim()) throw new Error('Pick a folder.');
  const expanded = expandHome(path.trim());
  if (!isAbsolute(expanded)) throw new Error('Give the whole path of the folder, starting with / or ~.');
  let real: string;
  try {
    real = await realpath(expanded);
  } catch {
    throw new Error(`There is no folder ${path.trim()}.`);
  }
  if (!isFolder(real)) throw new Error(`${shortPath(real)} is a file, not a folder.`);
  if (real === parse(real).root) throw new Error('The whole disk is too much for one tree. Pick a folder on it.');
  if (insideDir(real, config.dataDir)) throw new Error("That is inside clack's data directory. Use the folders under data/sessions instead.");
  if (outside.some((root) => insideDir(real, root))) return real;
  outside = [...outside.filter((root) => !insideDir(root, real)), real].sort((a, b) => a.localeCompare(b));
  saveRoots();
  return real;
}

/** Takes an outside folder off the list. Nothing in it is touched. */
export function removeRoot(path: string): void {
  if (!outside.includes(path)) throw new Error('That folder was not added.');
  outside = outside.filter((root) => root !== path);
  saveRoots();
}

/** Where a folder name from the UI points: its root, and the rest of the path from there. */
function placeOf(name: string): { root: string; rest: string } {
  const expanded = expandHome(name.trim());
  if (!isAbsolute(expanded)) return { root: config.sessionsDir, rest: expanded };
  const target = resolve(expanded);
  const root = rootOf(target);
  if (!root) throw new Error(`${shortPath(target)} is not in data/sessions or in a folder added to clack.`);
  return { root, rest: relative(root, target) };
}

/** Folders on the server computer, for the picker that adds outside folders. Hidden ones are left out. */
export async function browse(path: unknown): Promise<BrowseListing> {
  if (!config.outsideFolders) throw new Error('This server only lets chats work in data/sessions.');
  const wanted = typeof path === 'string' && path.trim() ? expandHome(path.trim()) : homedir();
  if (!isAbsolute(wanted)) throw new Error('Give the whole path of the folder, starting with / or ~.');
  let dir: string;
  try {
    dir = await realpath(resolve(wanted));
  } catch {
    throw new Error(`There is no folder ${shortPath(resolve(wanted))}.`);
  }
  if (!isFolder(dir)) throw new Error(`${shortPath(dir)} is a file, not a folder.`);
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => !name.startsWith('.'));
  } catch {
    throw new Error(`${shortPath(dir)} cannot be read.`);
  }
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  const entries: BrowseListing['entries'] = [];
  for (const name of names) {
    if (entries.length >= MAX_BROWSE) break;
    // Follows symlinks, so a link to a folder can be opened like one.
    if (!isFolder(join(dir, name))) continue;
    entries.push({ name, repo: hasGit(join(dir, name)) });
  }
  const repo = hasGit(dir);
  const root = rootOf(dir);
  return {
    path: dir,
    label: shortPath(dir),
    parent: dir === parse(dir).root ? null : dirname(dir),
    home: homedir(),
    entries,
    truncated: entries.length >= MAX_BROWSE,
    repo,
    ...(repo ? { branch: gitBranch(dir) } : {}),
    added: root !== undefined && root !== config.sessionsDir,
    inData: insideDir(dir, config.dataDir),
  };
}

const MAX_BROWSE = 1000;

/** Reduces whatever was typed to a plain folder name, so it can never point outside its root. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

/** The deepest a chat folder can be nested below its root. */
const MAX_DEPTH = 8;

/** A folder name that can be used just as it is written: not hidden, not "." or "..", and with nothing that could reach elsewhere. */
function plainName(part: string): boolean {
  return part.length > 0 && part.length <= 255 && !part.startsWith('.') && !/[\0\\/]/.test(part);
}

/**
 * Reduces a typed folder path, from a root, to the names of the folders it
 * means. A part that names a folder that is already there is kept as it is
 * written ("MyRepo", "my_project"), so existing folders work whatever they are
 * called. Any other part is the name of a folder still to be made and is
 * reduced to a plain one ("Client A" → "client-a"). Nothing in the result can
 * step outside the root.
 */
function folderParts(root: string, path: string): string[] {
  const parts: string[] = [];
  let dir = root;
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
 * Refuses a chat folder when any folder along the way from its root is a
 * symlink, which could lead out of it. Parts that do not exist yet are fine.
 */
async function refuseLinks(path: string): Promise<void> {
  const root = rootOf(path);
  if (!root) throw new Error('That folder cannot be used.');
  let at = root;
  for (const part of relative(root, path).split(sep).filter(Boolean)) {
    at = join(at, part);
    const info = await lstat(at).catch(() => undefined);
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error(`${folderLabel(at)} is a link to somewhere else, so chats cannot use it.`);
  }
}

/** True when a folder has a .git of its own (a folder, or a file for a worktree or submodule): it is the top of a repository. */
function hasGit(dir: string): boolean {
  try {
    statSync(join(dir, '.git'));
    return true;
  } catch {
    return false;
  }
}

/**
 * The git repository a chat's folder is in, when that repository is itself
 * inside the chat's root: its top folder and its git directory. The search
 * stops at the root, so a repository the data directory happens to sit in is
 * never used.
 */
export function gitRepo(cwd: string): { root: string; gitDir: string } | undefined {
  const top = rootOf(cwd);
  if (!top) return undefined;
  const within = (dir: string) => (top === config.sessionsDir ? dir.startsWith(top + sep) : insideDir(dir, top));
  for (let dir = resolve(cwd); within(dir); dir = dirname(dir)) {
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
 * Returns the chat folder for a name: a path from data/sessions
 * ("work/client-a"), or an absolute path in an outside folder. It is created
 * if it does not exist yet. A name that comes to nothing under data/sessions
 * is an error with `required`, and is made up otherwise. An outside folder
 * itself is a fine place for a chat.
 */
export async function ensureFolder(name: unknown, required = false): Promise<string> {
  const { root, rest } = typeof name === 'string' ? placeOf(name) : { root: config.sessionsDir, rest: '' };
  const parts = folderParts(root, rest);
  if (!parts.length && root === config.sessionsDir) {
    if (required) throw new Error('Give the folder a name.');
    parts.push(generatedName());
  }
  const path = join(root, ...parts);
  // A symlink planted along the way must not become a way out of the root.
  await refuseLinks(path);
  await mkdir(path, { recursive: true });
  await refuseLinks(path);
  // On a disk that ignores case (macOS, Windows) "myrepo" finds "MyRepo": keep the folder's own spelling.
  const real = await realpath(path);
  if (rootOf(real) !== root) throw new Error('That folder cannot be used.');
  return real;
}

/** Creates a chat's folder again after it was deleted, the same way a new one is made. */
export async function recreateFolder(path: string): Promise<void> {
  if (!insideRoots(path)) throw new Error('That folder cannot be used.');
  await refuseLinks(path);
  await mkdir(path, { recursive: true });
  await refuseLinks(path);
}

/**
 * The existing folder a name from the chat tree points at, exactly as it is
 * written there. Unlike ensureFolder nothing is made up or created: it has to
 * be there already. Never data/sessions itself.
 */
export async function existingFolder(name: unknown): Promise<string> {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Which folder?');
  const { root, rest } = placeOf(name);
  const parts = rest.split(/[\\/]+/).filter(Boolean);
  if ((!parts.length && root === config.sessionsDir) || !parts.every(plainName)) throw new Error(`${name} is not a folder chats can use.`);
  const path = join(root, ...parts);
  await refuseLinks(path);
  if (!isFolder(path)) throw new Error(`There is no folder ${folderLabel(path)}.`);
  return path;
}

/** Deletes a chat folder and everything in it, for good. Never a root: an outside folder is removed from the list instead. */
export async function removeFolder(path: string): Promise<void> {
  const root = rootOf(path);
  if (!root) throw new Error('That folder cannot be deleted.');
  if (resolve(path) === root) throw new Error('An added folder is not deleted from here. Remove it from clack instead; its files stay.');
  await refuseLinks(path);
  await rm(path, { recursive: true });
}

/** Folders never shown in the chat tree: hidden ones (.git, .claude) and installed packages. */
function skipped(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules' || name === '__pycache__';
}

/** More folders than this in one root and the rest are left out, so a huge project cannot stall the sidebar. */
const MAX_FOLDERS = 3000;

async function folderInfo(path: string, name: string): Promise<FolderInfo> {
  const modified = (await stat(path).catch(() => undefined))?.mtimeMs ?? 0;
  return hasGit(path) ? { name, modified, repo: true, branch: gitBranch(path) } : { name, modified };
}

/** Every folder below a root, at any depth, parents before their children. Symlinks are not followed. */
async function foldersUnder(root: string, nameOf: (relativePath: string) => string): Promise<FolderInfo[]> {
  const folders: FolderInfo[] = [];
  let level = [''];
  for (let depth = 0; depth < MAX_DEPTH && level.length && folders.length < MAX_FOLDERS; depth++) {
    const next: string[] = [];
    for (const parent of level) {
      const entries = await readdir(join(root, parent), { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory() || skipped(entry.name) || folders.length >= MAX_FOLDERS) continue;
        const rel = parent ? `${parent}/${entry.name}` : entry.name;
        const path = join(root, rel);
        // clack's own data directory, inside a project that was added (clack itself, say), is not part of its tree.
        if (path === config.dataDir) continue;
        folders.push(await folderInfo(path, nameOf(rel)));
        next.push(rel);
      }
    }
    level = next;
  }
  return folders;
}

/**
 * Every folder chats can work in: those under data/sessions, named from there
 * ("work/client-a"), then each outside folder and the folders in it, named by
 * absolute path.
 */
export async function listFolders(): Promise<FolderInfo[]> {
  const folders = await foldersUnder(config.sessionsDir, (rel) => rel);
  for (const root of outside) {
    if (!isFolder(root)) continue;
    folders.push(await folderInfo(root, root), ...(await foldersUnder(root, (rel) => join(root, rel))));
  }
  return folders;
}
