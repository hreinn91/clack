import { EventEmitter } from 'node:events';
import { createWriteStream, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import type { WriteStream } from 'node:fs';
import { join } from 'node:path';
import type { LogEntry } from '../../shared/protocol.ts';
import { config } from './config.ts';

/** One file per day, one JSON object per line: easy to grep, tail or load elsewhere. */
export const logDir = join(config.dataDir, 'logs');
mkdirSync(logDir, { recursive: true });

/** Emits 'entry' for every line written, for anyone watching the log live. */
export const logBus = new EventEmitter();

// The files are the full record. This is only what the debug page shows.
const MAX_RECENT = 2000;
const MAX_TEXT = 100_000;

function day(ts: number): string {
  const d = new Date(ts);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

function fileFor(ts: number): string {
  return join(logDir, `clack-${day(ts)}.jsonl`);
}

/** Reads the newest entries back from disk, so the debug page is not empty after a restart. */
function loadRecent(): LogEntry[] {
  const files = readdirSync(logDir)
    .filter((name) => /^clack-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .sort()
    .reverse();
  let entries: LogEntry[] = [];
  for (const name of files) {
    const lines = readFileSync(join(logDir, name), 'utf8').split('\n');
    const parsed: LogEntry[] = [];
    for (const line of lines) {
      if (!line) continue;
      try {
        parsed.push(JSON.parse(line) as LogEntry);
      } catch {
        // A line cut short by a crash: skip it.
      }
    }
    entries = parsed.concat(entries);
    if (entries.length >= MAX_RECENT) break;
  }
  return entries.slice(-MAX_RECENT);
}

const recent = loadRecent();

let stream: WriteStream | undefined;
let streamDay = '';
let counter = 0;

function write(entry: LogEntry): void {
  const today = day(entry.ts);
  if (!stream || today !== streamDay) {
    stream?.end();
    stream = createWriteStream(fileFor(entry.ts), { flags: 'a' });
    stream.on('error', (err) => console.warn(`clack: could not write the log: ${err.message}`));
    streamDay = today;
  }
  stream.write(JSON.stringify(entry) + '\n');
}

export function log(fields: Omit<LogEntry, 'id' | 'ts'>): void {
  const ts = Date.now();
  const text = fields.text.length > MAX_TEXT ? `${fields.text.slice(0, MAX_TEXT)}… (cut)` : fields.text;
  const entry: LogEntry = { id: `${ts}-${counter++}`, ts, ...fields, text };
  recent.push(entry);
  if (recent.length > MAX_RECENT) recent.shift();
  write(entry);
  logBus.emit('entry', entry);
}

export function recentLogs(limit: number): LogEntry[] {
  return recent.slice(-Math.max(1, Math.min(limit, MAX_RECENT)));
}
