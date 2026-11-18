import { createReadStream } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.ts';
import { FileError } from './files.ts';

// The person's own picture, shown instead of their initials. The browser
// crops and shrinks it before sending, so only a small picture is kept.

/** Larger than this and it was not shrunk first. */
export const MAX_AVATAR_BYTES = 1024 * 1024;

const TYPES = [
  { ext: 'png', type: 'image/png', magic: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', type: 'image/jpeg', magic: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', type: 'image/webp', magic: (b: Buffer) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
] as const;

const fileFor = (ext: string) => join(config.dataDir, `avatar.${ext}`);

/** The saved picture, if there is one: its file, type and when it was saved. */
async function current(): Promise<{ file: string; type: string; savedAt: number } | undefined> {
  for (const { ext, type } of TYPES) {
    const info = await stat(fileFor(ext)).catch(() => undefined);
    if (info?.isFile()) return { file: fileFor(ext), type, savedAt: Math.round(info.mtimeMs) };
  }
  return undefined;
}

/** When the picture was saved, so the UI can ask for the new one after a change. Undefined with no picture. */
export async function avatarVersion(): Promise<number | undefined> {
  return (await current())?.savedAt;
}

/** Keeps a new picture in place of the old one. Only PNG, JPEG and WebP are taken, by what the bytes are, not what they are called. */
export async function saveAvatar(data: Buffer): Promise<number> {
  if (data.length > MAX_AVATAR_BYTES) throw new FileError(413, 'That picture is too large.');
  const kind = TYPES.find((type) => type.magic(data));
  if (!kind) throw new FileError(415, 'Use a PNG, JPEG or WebP picture.');
  await removeAvatar();
  await writeFile(fileFor(kind.ext), data, { mode: 0o600 });
  return (await avatarVersion()) ?? Date.now();
}

export async function removeAvatar(): Promise<void> {
  await Promise.all(TYPES.map(({ ext }) => rm(fileFor(ext), { force: true })));
}

export async function openAvatar(): Promise<{ stream: ReadStream; type: string }> {
  const saved = await current();
  if (!saved) throw new FileError(404, 'There is no picture.');
  return { stream: createReadStream(saved.file), type: saved.type };
}
