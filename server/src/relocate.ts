import { appendFile, mkdir, open, readdir, rename, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Claude Code keeps each conversation as one file, <session id>.jsonl, in a
// directory named after the folder the conversation runs in, and it only
// resumes a conversation from the directory that belongs to the folder it is
// started in. Changing a chat's folder therefore means moving that file. None
// of this is public API, so everything here is written to fail loudly rather
// than leave a conversation half moved.

function projectsRoot(): string {
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
}

/** The name Claude Code gives the directory that holds a folder's conversations. */
export function projectDirName(cwd: string): string {
  const flat = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  if (flat.length <= 200) return flat;
  // Long paths are cut short and told apart by a hash of the whole path.
  let hash = 0;
  for (let i = 0; i < cwd.length; i++) hash = ((hash << 5) - hash + cwd.charCodeAt(i)) | 0;
  return `${flat.slice(0, 200)}-${Math.abs(hash).toString(36)}`;
}

/** The directory that currently holds a conversation's file, if it has one. */
export async function findProjectDir(sessionId: string): Promise<string | undefined> {
  const root = projectsRoot();
  let dirs: string[];
  try {
    dirs = await readdir(root);
  } catch {
    return undefined;
  }
  for (const dir of dirs) {
    const found = await stat(join(root, dir, `${sessionId}.jsonl`)).then(
      (info) => info.isFile(),
      () => false,
    );
    if (found) return join(root, dir);
  }
  return undefined;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/**
 * Moves a saved conversation so that Claude Code will resume it from `cwd`,
 * and notes the new folder in the conversation the way Claude Code itself
 * does. The conversation must not be in use by a running process.
 */
export async function relocateTranscript(sessionId: string, cwd: string): Promise<void> {
  const from = await findProjectDir(sessionId);
  if (!from) throw new Error('The saved conversation could not be found.');
  const to = join(projectsRoot(), projectDirName(cwd));
  const file = `${sessionId}.jsonl`;

  if (from !== to) {
    await mkdir(to, { recursive: true });
    if (await exists(join(to, file))) throw new Error('That folder already holds a conversation with this id.');
    // What belongs to the conversation besides its transcript (its title, subagent transcripts) sits in a directory beside it.
    const hasExtras = await exists(join(from, sessionId));
    if (hasExtras && (await exists(join(to, sessionId)))) throw new Error('That folder already holds files for this conversation.');
    await rename(join(from, file), join(to, file));
    if (hasExtras) {
      try {
        await rename(join(from, sessionId), join(to, sessionId));
      } catch (err) {
        // Put the transcript back, so the two never end up in different places.
        await rename(join(to, file), join(from, file)).catch(() => undefined);
        throw err;
      }
    }
  }

  // An entry must start on a line of its own.
  const handle = await open(join(to, file), 'r');
  let endsWithNewline = true;
  try {
    const { size } = await handle.stat();
    if (size > 0) {
      const last = Buffer.alloc(1);
      await handle.read(last, 0, 1, size - 1);
      endsWithNewline = last[0] === 0x0a;
    }
  } finally {
    await handle.close();
  }
  const entry = JSON.stringify({ type: 'relocated', sessionId, relocatedCwd: cwd });
  await appendFile(join(to, file), `${endsWithNewline ? '' : '\n'}${entry}\n`);
}
