import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { Upload } from '../../shared/protocol.ts';
import { FileError } from './files.ts';
import { insideDir } from './folders.ts';

/** The largest file the UI may hand over, in bytes. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Files attached to a chat are kept together in this folder inside the chat's own folder. */
const UPLOAD_DIR = 'uploads';

/** Reduces a name from someone's computer to a plain file name that is safe to create here. */
function cleanName(name: unknown): string {
  const raw = typeof name === 'string' ? name : '';
  const cleaned = basename(raw.replace(/\\/g, '/'))
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} ._()-]/gu, '_')
    .replace(/^[. ]+/, '')
    .trim()
    .slice(-100);
  return cleaned || 'file';
}

/**
 * Saves a file the person attached to a chat into that chat's folder, where
 * Claude can read it like any other file there. An existing file is never
 * overwritten: the new one gets a number added to its name.
 */
export async function saveUpload(cwd: string, name: unknown, data: Buffer): Promise<Upload> {
  if (data.length > MAX_UPLOAD_BYTES) throw new FileError(413, 'That file is too large to attach.');
  const dir = join(cwd, UPLOAD_DIR);
  await mkdir(dir, { recursive: true });
  // A symlink called "uploads" must not send the file somewhere else.
  if (!insideDir(await realpath(dir), cwd)) throw new FileError(403, 'The uploads folder of this chat cannot be used.');

  const wanted = cleanName(name);
  const ext = extname(wanted);
  const stem = wanted.slice(0, wanted.length - ext.length);
  for (let n = 1; n <= 500; n++) {
    const candidate = n === 1 ? wanted : `${stem}-${n}${ext}`;
    try {
      // 'wx' fails if the file is already there, instead of replacing it.
      await writeFile(join(dir, candidate), data, { flag: 'wx' });
      return { name: candidate, path: `${UPLOAD_DIR}/${candidate}`, size: data.length };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new FileError(409, 'There are too many files with that name already.');
}
