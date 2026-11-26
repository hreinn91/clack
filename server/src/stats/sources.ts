import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Provider } from '../../../shared/protocol.ts';

// What Claude Code and Codex have written on this computer, read for the Stats
// page. Only numbers, names and times are taken out: when something happened,
// which model, how many tokens, what it cost, which tool and in which folder.
// What was said is never kept, here or anywhere the page can reach.

/**
 * One thing that happened, as a short tuple so a big history stays small:
 * - `p` a turn was asked for (a message sent to the agent)
 * - `k` one API response's tokens: model, input (not from cache), output, cache read, cache write, reasoning
 * - `t` a tool call, by name
 * - `a` time the agent spent working, in milliseconds
 * - `c` cost at API prices, in dollars, for a model (Claude Code reports it; Codex does not)
 * - `l` lines added and removed by the agent (Claude Code)
 */
export type Fact =
  | ['p', number]
  | ['k', number, string, number, number, number, number, number]
  | ['t', number, string]
  | ['a', number, number]
  | ['c', number, number, string]
  | ['l', number, number, number];

/** The facts of one transcript file, with the conversation and folder they belong to. */
export type FileFacts = { provider: Provider; session: string; cwd: string; facts: Fact[] };

export function claudeRoot(): string {
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
}

export function codexRoots(): string[] {
  const home = process.env.CODEX_HOME || join(homedir(), '.codex');
  return [join(home, 'sessions'), join(home, 'archived_sessions')];
}

/** Transcript files under a folder, a few levels deep, without following symlinks out of it. */
export async function transcriptFiles(root: string, depth = 5, out: string[] = [], limit = 20_000): Promise<string[]> {
  if (depth < 0 || out.length >= limit) return out;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (out.length >= limit) break;
    const path = join(root, entry.name);
    if (entry.isDirectory()) await transcriptFiles(path, depth - 1, out, limit);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(path);
  }
  return out;
}

export async function folderExists(path: string): Promise<boolean> {
  const info = await lstat(path).catch(() => undefined);
  return !!info?.isDirectory();
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
const time = (value: unknown): number => (typeof value === 'string' ? Date.parse(value) || 0 : 0);

async function eachLine(path: string, wanted: (line: string) => boolean, take: (entry: Record<string, unknown>) => void): Promise<void> {
  const lines = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) {
    // A transcript can hold very long lines (a pasted file); none of those carry what is counted here.
    if (line.length > 2_000_000 || !wanted(line)) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) take(entry as Record<string, unknown>);
  }
}

/** A message the person typed, as opposed to a tool's result or something Claude Code added itself. */
function typedByPerson(message: Record<string, unknown> | undefined): boolean {
  const content = message?.content;
  if (typeof content === 'string') return !content.startsWith('<');
  if (!Array.isArray(content)) return false;
  let text = false;
  for (const block of content as Record<string, unknown>[]) {
    if (block?.type === 'tool_result') return false;
    if (block?.type === 'text' && typeof block.text === 'string' && !block.text.startsWith('<')) text = true;
    if (block?.type === 'image') text = true;
  }
  return text;
}

const WANTED_CLAUDE = /"type"\s*:\s*"(?:assistant|user|cost-state)"/;

/** A Claude Code transcript: replies with their tokens and tools, turns asked for, and the running cost. */
export async function readClaude(path: string): Promise<FileFacts | undefined> {
  const facts: Fact[] = [];
  let session = '';
  let cwd = '';
  let lastTs = 0;
  /** A reply's lines repeat its usage once per content block: counted once. */
  const counted = new Set<string>();
  const toolIds = new Set<string>();
  /** The running totals Claude Code writes, per model, to turn into what each step added. */
  let previous: { cost: Record<string, number>; agent: number; added: number; removed: number } | undefined;

  await eachLine(
    path,
    // A quick look before parsing: only these entries carry anything counted. Spacing is allowed for.
    (line) => WANTED_CLAUDE.test(line),
    (entry) => {
      const ts = time(entry.timestamp);
      if (ts) lastTs = ts;
      if (!session && typeof entry.sessionId === 'string') session = entry.sessionId;
      if (!cwd && typeof entry.cwd === 'string') cwd = entry.cwd;
      const message = entry.message as Record<string, unknown> | undefined;

      if (entry.type === 'assistant' && message) {
        const model = typeof message.model === 'string' ? message.model : '';
        const id = `${String(message.id ?? '')}:${String(entry.requestId ?? '')}`;
        const usage = message.usage as Record<string, unknown> | undefined;
        if (usage && model && model !== '<synthetic>' && !counted.has(id)) {
          counted.add(id);
          const details = usage.output_tokens_details as Record<string, unknown> | undefined;
          facts.push([
            'k',
            ts || lastTs,
            model,
            num(usage.input_tokens),
            num(usage.output_tokens),
            num(usage.cache_read_input_tokens),
            num(usage.cache_creation_input_tokens),
            num(details?.thinking_tokens),
          ]);
        }
        if (Array.isArray(message.content)) {
          for (const block of message.content as Record<string, unknown>[]) {
            if (block?.type !== 'tool_use' || typeof block.name !== 'string') continue;
            const blockId = String(block.id ?? `${id}:${toolIds.size}`);
            if (toolIds.has(blockId)) continue;
            toolIds.add(blockId);
            facts.push(['t', ts || lastTs, block.name.slice(0, 80)]);
          }
        }
      } else if (entry.type === 'user' && !entry.isSidechain && !entry.isMeta && typedByPerson(message)) {
        if (ts) facts.push(['p', ts]);
      } else if (entry.type === 'cost-state') {
        if (!session && typeof entry.sessionId === 'string') session = entry.sessionId;
        const models = (entry.modelUsage ?? {}) as Record<string, Record<string, unknown>>;
        const cost: Record<string, number> = {};
        for (const [model, usage] of Object.entries(models)) cost[model] = num(usage?.costUSD);
        const now = {
          cost,
          agent: num(entry.totalAPIDuration) + num(entry.totalToolDuration),
          added: num(entry.totalLinesAdded),
          removed: num(entry.totalLinesRemoved),
        };
        // The totals start again when Claude Code does; a smaller figure is a fresh start.
        const step = (value: number, before: number | undefined) => (before !== undefined && value >= before ? value - before : value);
        const at = lastTs || time(entry.startTime) || Date.now();
        for (const [model, value] of Object.entries(cost)) {
          const added = step(value, previous?.cost[model]);
          if (added > 0) facts.push(['c', at, added, model]);
        }
        const agent = step(now.agent, previous?.agent);
        if (agent > 0) facts.push(['a', at, agent]);
        const linesAdded = step(now.added, previous?.added);
        const linesRemoved = step(now.removed, previous?.removed);
        if (linesAdded || linesRemoved) facts.push(['l', at, linesAdded, linesRemoved]);
        previous = now;
      }
    },
  );
  if (!session) return undefined;
  return { provider: 'claude', session, cwd, facts };
}

/** A Codex session: turns with their time, each API response's tokens, and tool calls. Codex records no cost. */
export async function readCodex(path: string): Promise<FileFacts | undefined> {
  const facts: Fact[] = [];
  let session = '';
  let cwd = '';
  let model = '';
  let records = 0;
  const started = new Map<string, number>();
  /** Older Codex versions only write running totals: used when there are no per-response records. */
  const fallback: Fact[] = [];
  let lastTotal = -1;

  await eachLine(
    path,
    () => true,
    (entry) => {
      const ts = time(entry.timestamp);
      const payload = (entry.payload ?? {}) as Record<string, unknown>;
      if (entry.type === 'session_meta') {
        if (typeof payload.id === 'string') session = payload.id;
        if (typeof payload.cwd === 'string') cwd = payload.cwd;
      } else if (entry.type === 'turn_context') {
        if (typeof payload.model === 'string') model = payload.model;
        if (!cwd && typeof payload.cwd === 'string') cwd = payload.cwd;
      } else if (entry.type === 'token_usage_record') {
        const usage = (payload.usage ?? {}) as Record<string, unknown>;
        const cached = num(usage.cached_input_tokens);
        records++;
        facts.push(['k', ts, model || 'codex', Math.max(0, num(usage.input_tokens) - cached), num(usage.output_tokens), cached, num(usage.cache_write_input_tokens), num(usage.reasoning_output_tokens)]);
      } else if (entry.type === 'event_msg') {
        const kind = payload.type;
        const turn = String(payload.turn_id ?? (payload.turn_attribution as Record<string, unknown> | undefined)?.turn_id ?? '');
        if (kind === 'task_started' && ts) {
          facts.push(['p', ts]);
          if (turn) started.set(turn, ts);
        } else if ((kind === 'task_complete' || kind === 'turn_aborted') && ts) {
          const from = started.get(turn);
          if (from !== undefined && ts > from) facts.push(['a', from, ts - from]);
          started.delete(turn);
        } else if (kind === 'token_count') {
          const info = (payload.info ?? {}) as Record<string, unknown>;
          const total = (info.total_token_usage ?? {}) as Record<string, unknown>;
          const last = (info.last_token_usage ?? {}) as Record<string, unknown>;
          // The same totals are written again now and then: only a change is a new response.
          if (num(total.total_tokens) !== lastTotal && num(last.total_tokens) > 0) {
            lastTotal = num(total.total_tokens);
            const cached = num(last.cached_input_tokens);
            fallback.push(['k', ts, model || 'codex', Math.max(0, num(last.input_tokens) - cached), num(last.output_tokens), cached, 0, num(last.reasoning_output_tokens)]);
          }
        }
      } else if (entry.type === 'response_item') {
        const kind = payload.type;
        if (kind === 'function_call' || kind === 'custom_tool_call' || kind === 'local_shell_call' || kind === 'web_search_call') {
          const name = typeof payload.name === 'string' ? payload.name : String(kind).replace(/_call$/, '');
          facts.push(['t', ts, name.slice(0, 80)]);
        }
      }
    },
  );
  if (!session) return undefined;
  if (!records) facts.push(...fallback);
  return { provider: 'codex', session, cwd, facts };
}
