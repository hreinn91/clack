import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provider } from '../../shared/protocol.ts';
import { config } from './config.ts';

// Every Mermaid diagram an agent writes in a reply, kept as a file in Clack's
// data directory, so diagrams (and the figures in them) never need to be
// written into the chat's project folder, and can be found again outside the chat:
//
//   data/diagrams/<chat id>/
//     2026-11-26-142211-flowchart-3f2a9c1b.mmd   one file per diagram
//     index.json                                 when each was drawn, by which agent and model
//
// The same diagram drawn again in the same chat is kept once.

const CHAT_ID = /^[0-9a-f-]{36}$/i;
/** A fenced ```mermaid (or ~~~mermaid) block in markdown. */
const BLOCK = /(?:^|\n)[ \t]*(`{3,}|~{3,})[ \t]*mermaid[^\n]*\n([\s\S]*?)\n[ \t]*\1/g;

export type KeptDiagram = { file: string; at: number; kind: string; provider: Provider; model?: string; reply: string };

export const diagramsDir = (chatId: string) => join(config.dataDir, 'diagrams', chatId.toLowerCase());

/** The Mermaid code of each diagram in a reply, in order. */
export function mermaidBlocks(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(BLOCK)) {
    const code = match[2]!.trim();
    if (code) out.push(code);
  }
  return out;
}

/** The kind of diagram, from its first line: flowchart, sequence-diagram, pie… */
function kindOf(code: string): string {
  const first = code.split('\n').map((line) => line.trim()).find((line) => line && !line.startsWith('%%') && line !== '---') ?? '';
  return (
    (first.split(/\s+/)[0] ?? '')
      .replace(/-v2$|-beta$/, '')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 30) || 'diagram'
  );
}

function stamp(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** One write at a time per chat, so two replies close together do not lose an index entry. */
const queues = new Map<string, Promise<unknown>>();

/** Keeps the diagrams of a reply that just arrived. Never throws: a diagram that cannot be kept is only logged. */
export function keepDiagrams(chatId: string, text: string, about: { reply: string; provider: Provider; model?: string }): Promise<KeptDiagram[]> {
  const blocks = CHAT_ID.test(chatId) ? mermaidBlocks(text) : [];
  if (!blocks.length) return Promise.resolve([]);
  const key = chatId.toLowerCase();
  const run = (queues.get(key) ?? Promise.resolve())
    .then(async () => {
      const dir = diagramsDir(chatId);
      await mkdir(dir, { recursive: true });
      const indexFile = join(dir, 'index.json');
      const index = (await readFile(indexFile, 'utf8').then((t) => JSON.parse(t) as KeptDiagram[]).catch(() => [])) ?? [];
      const known = new Set(index.map((entry) => entry.file.split('-').at(-1)));
      const now = Date.now();
      const kept: KeptDiagram[] = [];
      for (const code of blocks) {
        const hash = createHash('sha256').update(code).digest('hex').slice(0, 8);
        if (known.has(`${hash}.mmd`)) continue;
        known.add(`${hash}.mmd`);
        const kind = kindOf(code);
        const file = `${stamp(now)}-${kind}-${hash}.mmd`;
        await writeFile(join(dir, file), code + '\n');
        kept.push({ file, at: now, kind, provider: about.provider, ...(about.model ? { model: about.model } : {}), reply: about.reply });
      }
      if (kept.length) {
        const temp = `${indexFile}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify([...index, ...kept], null, 2) + '\n');
        await rename(temp, indexFile);
      }
      return kept;
    })
    .catch((err: unknown) => {
      console.warn('clack: could not keep a diagram:', err instanceof Error ? err.message : err);
      return [] as KeptDiagram[];
    });
  queues.set(key, run);
  return run;
}

/** A deleted chat's diagrams go with it. */
export async function forgetDiagrams(chatId: string): Promise<void> {
  if (!CHAT_ID.test(chatId)) return;
  await rm(diagramsDir(chatId), { recursive: true, force: true });
}
