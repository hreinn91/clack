import { execFile } from 'node:child_process';
import { open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { GitChange, GitDiff, GitStatus } from '../../shared/protocol.ts';
import { folderLabel, gitRepo, insideDir } from './folders.ts';

// What is changed and not committed in a chat's git repository, for the
// Changes list under the chat's title. git is asked directly. Its settings
// that would run other programs (a filesystem monitor, external diff tools,
// text conversion filters) are switched off for these calls, so a
// repository's own config cannot make clack run anything.

/** More changed files than this are left out of the list (they are still counted). */
const MAX_LISTED = 500;
/** Untracked files bigger than this are not read to count their lines. */
const MAX_COUNTED_BYTES = 1024 * 1024;

const SAFE = ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'diff.external=', '-c', 'core.quotePath=false'];

function git(root: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [...SAFE, '-C', root, ...args],
      { timeout: 10_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });
}

const STATUS: Record<string, GitChange['status']> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'type changed',
};

/** Lines added and removed per path, from `git diff --numstat -z`. */
function numstat(out: string): Map<string, { added?: number; deleted?: number; binary?: boolean }> {
  const counts = new Map<string, { added?: number; deleted?: number; binary?: boolean }>();
  const parts = out.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]!;
    if (!entry) continue;
    const [added, deleted, path] = entry.split('\t');
    // A rename leaves the path empty and gives the old and new paths as the next two entries.
    const target = path ? path : parts[(i += 2)];
    if (!target) continue;
    counts.set(target, added === '-' ? { binary: true } : { added: Number(added), deleted: Number(deleted) });
  }
  return counts;
}

/** How many lines a new file has, or that it is binary; nothing when it is too big to read. */
async function countLines(path: string): Promise<{ added?: number; binary?: boolean }> {
  try {
    const file = await open(path, 'r');
    try {
      const { size } = await file.stat();
      if (size > MAX_COUNTED_BYTES) return {};
      const data = await file.readFile();
      if (data.subarray(0, 8000).includes(0)) return { binary: true };
      let lines = 0;
      for (const byte of data) if (byte === 10) lines++;
      if (data.length && data[data.length - 1] !== 10) lines++;
      return { added: lines };
    } finally {
      await file.close();
    }
  } catch {
    return {};
  }
}

/** The uncommitted changes in the repository a folder is in, or null when it is in none under data/sessions. */
export async function gitStatus(cwd: string): Promise<GitStatus | null> {
  const repo = gitRepo(cwd);
  if (!repo) return null;
  const root = repo.root;
  let statusOut: string, unstagedOut: string, stagedOut: string;
  try {
    [statusOut, unstagedOut, stagedOut] = await Promise.all([
      git(root, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']),
      git(root, ['diff', '--numstat', '-z', '--no-ext-diff', '--no-textconv', '-M']),
      git(root, ['diff', '--cached', '--numstat', '-z', '--no-ext-diff', '--no-textconv', '-M']),
    ]);
  } catch {
    // git is missing, or the repository is broken: nothing can be said.
    return null;
  }
  const unstagedCounts = numstat(unstagedOut);
  const stagedCounts = numstat(stagedOut);

  const status: GitStatus = { root: folderLabel(root), changes: [], truncated: false, files: 0, untracked: 0, added: 0, deleted: 0, checkedAt: 0 };
  const changes: GitChange[] = [];
  const entries = statusOut.split('\0');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (!entry) continue;
    if (entry.startsWith('# ')) {
      const [, key, ...rest] = entry.split(' ');
      const value = rest.join(' ');
      if (key === 'branch.head' && value !== '(detached)') status.branch = value;
      else if (key === 'branch.upstream') status.upstream = value;
      else if (key === 'branch.ab') {
        const ab = value.match(/^\+(\d+) -(\d+)$/);
        if (ab) {
          status.ahead = Number(ab[1]);
          status.behind = Number(ab[2]);
        }
      }
      continue;
    }
    const kind = entry[0];
    if (kind === '?') {
      changes.push({ path: entry.slice(2), area: 'untracked', status: 'untracked' });
    } else if (kind === 'u') {
      // u XY sub m1 m2 m3 mW h1 h2 h3 path
      changes.push({ path: entry.split(' ').slice(10).join(' '), area: 'conflict', status: 'conflict' });
    } else if (kind === '1' || kind === '2') {
      // 1 XY sub mH mI mW hH hI path, and for 2 a score before the path and the old path as the next entry.
      const fields = entry.split(' ');
      const xy = fields[1]!;
      const path = fields.slice(kind === '1' ? 8 : 9).join(' ');
      const from = kind === '2' ? entries[++i] : undefined;
      if (xy[0] !== '.') {
        changes.push({ path, ...(from ? { from } : {}), area: 'staged', status: STATUS[xy[0]!] ?? 'modified', ...stagedCounts.get(path) });
      }
      if (xy[1] !== '.') {
        changes.push({ path, area: 'unstaged', status: STATUS[xy[1]!] ?? 'modified', ...unstagedCounts.get(path) });
      }
    }
  }

  // New files have no diff to count: their lines are counted from the files themselves.
  await Promise.all(
    changes
      .filter((change) => change.area === 'untracked')
      .slice(0, MAX_LISTED)
      .map(async (change) => Object.assign(change, await countLines(join(root, change.path)))),
  );

  status.files = new Set(changes.map((change) => change.path)).size;
  status.untracked = changes.filter((change) => change.area === 'untracked').length;
  for (const change of changes) {
    status.added += change.added ?? 0;
    status.deleted += change.deleted ?? 0;
  }
  status.truncated = changes.length > MAX_LISTED;
  status.changes = changes.slice(0, MAX_LISTED);
  status.checkedAt = Date.now();
  return status;
}

/** More than this and a diff is cut short. */
const MAX_DIFF_CHARS = 1_000_000;
/** A new or conflicted file bigger than this is not shown in full. */
const MAX_FILE_BYTES = 1024 * 1024;

/** The part of a diff from its first hunk on: the file headers are said elsewhere. */
function hunks(diff: string): string {
  const at = diff.indexOf('\n@@');
  return at === -1 ? (diff.startsWith('@@') ? diff : '') : diff.slice(at + 1);
}

/** A file's text as a diff: every line added (a new file), or every line unchanged (a file in conflict, markers and all). */
function asDiff(text: string, sign: '+' | ' '): string {
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  const header = sign === '+' ? `@@ -0,0 +1,${lines.length} @@` : `@@ -1,${lines.length} +1,${lines.length} @@`;
  return `${header}\n${lines.map((line) => sign + line).join('\n')}\n`;
}

/**
 * What changed in one file of a chat's repository, as a unified diff. `path`
 * (and `from`, for a rename) are from the repository's top folder, as the
 * Changes list has them; `whole` shows the whole file around the changes.
 */
export async function gitFileDiff(cwd: string, change: { path: unknown; from?: unknown; area: unknown }, whole: boolean): Promise<GitDiff> {
  const repo = gitRepo(cwd);
  if (!repo) throw new Error('This chat\'s folder is not in a git repository.');
  const root = repo.root;
  const path = typeof change.path === 'string' ? change.path : '';
  const from = typeof change.from === 'string' && change.from ? change.from : undefined;
  const area = (['staged', 'unstaged', 'untracked', 'conflict'] as const).find((a) => a === change.area);
  if (!area) throw new Error('Which kind of change?');
  for (const p of [path, from]) {
    if (p === undefined) continue;
    if (!p || p.includes('\0') || !insideDir(resolve(root, p), root)) throw new Error('That file is not in this repository.');
  }
  const base: GitDiff = { path, ...(from ? { from } : {}), area, diff: '', binary: false, tooLarge: false, truncated: false, whole };

  if (area === 'untracked' || area === 'conflict') {
    // A new file has nothing to compare with; a file in conflict is shown as it is, with git's markers in it.
    let data: Buffer;
    try {
      const file = await open(resolve(root, path), 'r');
      try {
        const { size } = await file.stat();
        if (size > MAX_FILE_BYTES) return { ...base, tooLarge: true };
        data = await file.readFile();
      } finally {
        await file.close();
      }
    } catch {
      throw new Error('That file could not be read.');
    }
    if (data.subarray(0, 8000).includes(0)) return { ...base, binary: true };
    return { ...base, diff: asDiff(data.toString('utf8'), area === 'untracked' ? '+' : ' ') };
  }

  const args = [
    'diff',
    ...(area === 'staged' ? ['--cached'] : []),
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '-M',
    `-U${whole ? 100_000 : 3}`,
    '--',
    ...(from ? [from] : []),
    path,
  ];
  const out = await git(root, args);
  if (/^Binary files .* differ$/m.test(out)) return { ...base, binary: true };
  const diff = hunks(out);
  if (diff.length > MAX_DIFF_CHARS) {
    const cut = diff.lastIndexOf('\n', MAX_DIFF_CHARS);
    return { ...base, diff: diff.slice(0, cut + 1), truncated: true };
  }
  return { ...base, diff };
}
