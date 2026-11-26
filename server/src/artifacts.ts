import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import type { Artifact, ArtifactType } from '../../shared/protocol.ts';
import { config } from './config.ts';
import { insideDir } from './folders.ts';

// Artifacts: things an agent made for you in a chat (a page, a document, a
// diagram, a picture, a piece of code), kept apart from the chat's folder in
// data/artifacts/<chat id>/<artifact id>/, with every version:
//
//   meta.json   what it is, its title, and its versions
//   v1.html     the first version
//   v2.html     the next, and so on
//
// Agents make and change them with Clack's own tools (see agents/clackTools.ts).

/** Emits 'changed' (chatId, artifactId) when an artifact is made, changed or deleted. */
export const artifactsBus = new EventEmitter();

export const ARTIFACT_TYPES: ArtifactType[] = ['html', 'svg', 'markdown', 'mermaid', 'code', 'file'];

const MAX_TEXT = 2 * 1024 * 1024;
const MAX_FILE = 25 * 1024 * 1024;
const MAX_VERSIONS = 100;
const CHAT_ID = /^[0-9a-f-]{36}$/i;
const ARTIFACT_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

export class ArtifactError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const root = () => join(config.dataDir, 'artifacts');

function chatDir(chatId: string): string {
  if (!CHAT_ID.test(chatId)) throw new ArtifactError(400, 'That is not a chat.');
  return join(root(), chatId.toLowerCase());
}

function artifactDir(chatId: string, id: string): string {
  if (!ARTIFACT_ID.test(id)) throw new ArtifactError(400, 'That is not an artifact.');
  return join(chatDir(chatId), id);
}

const CODE_EXT: Record<string, string> = {
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', tsx: 'tsx', jsx: 'jsx', python: 'py', py: 'py', rust: 'rs', go: 'go',
  java: 'java', kotlin: 'kt', swift: 'swift', ruby: 'rb', php: 'php', c: 'c', cpp: 'cpp', 'c++': 'cpp', csharp: 'cs', 'c#': 'cs',
  shell: 'sh', bash: 'sh', sh: 'sh', zsh: 'sh', sql: 'sql', json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', css: 'css',
  scss: 'scss', html: 'html', xml: 'xml', svelte: 'svelte', vue: 'vue', lua: 'lua', r: 'r', dockerfile: 'dockerfile', makefile: 'mk',
};

const MIME: Record<string, string> = {
  html: 'text/html', htm: 'text/html', svg: 'image/svg+xml', md: 'text/markdown', mmd: 'text/plain', txt: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
  csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json',
};

function mimeOf(ext: string, type: ArtifactType): string {
  if (type === 'code' || type === 'mermaid') return 'text/plain';
  return MIME[ext] ?? 'application/octet-stream';
}

function extFor(type: ArtifactType, language?: string, path?: string): string {
  switch (type) {
    case 'html':
      return 'html';
    case 'svg':
      return 'svg';
    case 'markdown':
      return 'md';
    case 'mermaid':
      return 'mmd';
    case 'code':
      return CODE_EXT[(language ?? '').toLowerCase()] || (path ? safeExt(path) : '') || 'txt';
    case 'file':
      return path ? safeExt(path) || 'bin' : 'bin';
  }
}

function safeExt(path: string): string {
  return extname(path).slice(1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
}

function slug(title: string): string {
  const base = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return `${base || 'artifact'}-${randomBytes(2).toString('hex')}`;
}

async function readMeta(chatId: string, id: string): Promise<Artifact> {
  // A name that is not an artifact's is refused before anything is read.
  const dir = artifactDir(chatId, id);
  try {
    return JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as Artifact;
  } catch {
    throw new ArtifactError(404, `There is no artifact "${id}" in this chat.`);
  }
}

async function writeMeta(meta: Artifact): Promise<void> {
  const path = join(artifactDir(meta.chatId, meta.id), 'meta.json');
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(meta, null, 2));
  await rename(temp, path);
}

/** The bytes of a new version: written text, or a file the agent made in the chat's folder. */
async function contentOf(input: { content?: unknown; path?: unknown }, cwd: string, type: ArtifactType): Promise<{ data: Buffer; path?: string }> {
  if (typeof input.path === 'string' && input.path.trim()) {
    const wanted = resolve(cwd, input.path.trim());
    let real: string;
    try {
      real = await realpath(wanted);
    } catch {
      throw new ArtifactError(404, `There is no file at ${input.path}.`);
    }
    // Only a file inside the chat's own folder, wherever a link might lead.
    if (!insideDir(real, await realpath(cwd).catch(() => cwd))) throw new ArtifactError(403, `${input.path} is outside this chat's folder.`);
    const info = await stat(real);
    if (!info.isFile()) throw new ArtifactError(400, `${input.path} is not a file.`);
    if (info.size > (type === 'file' ? MAX_FILE : MAX_TEXT)) throw new ArtifactError(413, `${input.path} is too big to keep as an artifact.`);
    return { data: await readFile(real), path: real };
  }
  if (type === 'file') throw new ArtifactError(400, 'A file artifact needs the path of a file in the chat\'s folder.');
  if (typeof input.content !== 'string' || !input.content.trim()) throw new ArtifactError(400, 'An artifact needs its content.');
  if (Buffer.byteLength(input.content) > MAX_TEXT) throw new ArtifactError(413, 'That artifact is too big (2 MB at most).');
  return { data: Buffer.from(input.content, 'utf8') };
}

function cleanTitle(title: unknown): string {
  const text = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (!text) throw new ArtifactError(400, 'An artifact needs a title.');
  return text;
}

export async function createArtifact(
  chatId: string,
  cwd: string,
  input: { title?: unknown; type?: unknown; content?: unknown; language?: unknown; path?: unknown },
): Promise<Artifact> {
  const title = cleanTitle(input.title);
  const type = ARTIFACT_TYPES.includes(input.type as ArtifactType) ? (input.type as ArtifactType) : undefined;
  if (!type) throw new ArtifactError(400, `The type must be one of ${ARTIFACT_TYPES.join(', ')}.`);
  const language = typeof input.language === 'string' && input.language.trim() ? input.language.trim().slice(0, 40) : undefined;
  const { data, path } = await contentOf(input, cwd, type);
  const ext = extFor(type, language, path);
  const id = slug(title);
  const dir = artifactDir(chatId, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `v1.${ext}`), data);
  const now = Date.now();
  const meta: Artifact = {
    id,
    chatId: chatId.toLowerCase(),
    title,
    type,
    ...(language ? { language } : {}),
    ext,
    mime: mimeOf(ext, type),
    created: now,
    updated: now,
    versions: [{ n: 1, at: now, size: data.length }],
  };
  await writeMeta(meta);
  artifactsBus.emit('changed', meta.chatId, id);
  return meta;
}

export async function updateArtifact(
  chatId: string,
  cwd: string,
  id: unknown,
  input: { title?: unknown; content?: unknown; path?: unknown; note?: unknown },
): Promise<Artifact> {
  if (typeof id !== 'string') throw new ArtifactError(400, 'Which artifact?');
  const meta = await readMeta(chatId, id);
  if (meta.versions.length >= MAX_VERSIONS) throw new ArtifactError(409, `"${meta.title}" has ${MAX_VERSIONS} versions already: make a new artifact instead.`);
  const { data } = await contentOf(input, cwd, meta.type);
  const n = (meta.versions.at(-1)?.n ?? 0) + 1;
  await writeFile(join(artifactDir(chatId, id), `v${n}.${meta.ext}`), data);
  const now = Date.now();
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 200) : undefined;
  meta.versions.push({ n, at: now, size: data.length, ...(note ? { note } : {}) });
  meta.updated = now;
  if (input.title !== undefined) meta.title = cleanTitle(input.title);
  await writeMeta(meta);
  artifactsBus.emit('changed', meta.chatId, id);
  return meta;
}

/** Every artifact, or a chat's: newest first. */
export async function listArtifacts(chatId?: string): Promise<Artifact[]> {
  const chats = chatId ? [chatId.toLowerCase()] : (await readdir(root()).catch(() => [] as string[])).filter((name) => CHAT_ID.test(name));
  const out: Artifact[] = [];
  for (const chat of chats) {
    const dir = chatDir(chat);
    for (const id of await readdir(dir).catch(() => [] as string[])) {
      if (!ARTIFACT_ID.test(id)) continue;
      try {
        out.push(JSON.parse(await readFile(join(dir, id, 'meta.json'), 'utf8')) as Artifact);
      } catch {
        // Half made, or not an artifact: left out.
      }
    }
  }
  return out.sort((a, b) => b.updated - a.updated);
}

export async function getArtifact(chatId: string, id: string): Promise<Artifact> {
  return readMeta(chatId, id);
}

/** One version's file (the latest when `n` is not given), to send. */
export async function artifactFile(chatId: string, id: string, n?: number): Promise<{ meta: Artifact; path: string; version: number }> {
  const meta = await readMeta(chatId, id);
  const version = n ?? meta.versions.at(-1)?.n ?? 1;
  if (!meta.versions.some((v) => v.n === version)) throw new ArtifactError(404, 'There is no such version.');
  const path = join(artifactDir(chatId, id), `v${version}.${meta.ext}`);
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isFile()) throw new ArtifactError(404, 'That version is missing on disk.');
  return { meta, path, version };
}

export async function deleteArtifact(chatId: string, id: string): Promise<void> {
  await readMeta(chatId, id);
  await rm(artifactDir(chatId, id), { recursive: true, force: true });
  artifactsBus.emit('changed', chatId.toLowerCase(), id);
}

/** A deleted chat's artifacts: removed, or (by default) kept with the chat's title so they can still be told apart. */
export async function settleChatArtifacts(chatId: string, remove: boolean, title?: string): Promise<number> {
  const artifacts = await listArtifacts(chatId);
  if (remove) {
    await rm(chatDir(chatId), { recursive: true, force: true });
  } else {
    for (const meta of artifacts) {
      meta.chatTitle = title ?? meta.chatTitle ?? 'A deleted chat';
      await writeMeta(meta);
    }
  }
  if (artifacts.length) artifactsBus.emit('changed', chatId.toLowerCase(), '');
  return artifacts.length;
}
