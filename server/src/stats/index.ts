import { mkdirSync, readFileSync, statSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provider, StatsRange, StatsReport, StatsScope, StatsTotals, TokenSplit } from '../../../shared/protocol.ts';
import { chatOf } from '../chats.ts';
import { config } from '../config.ts';
import { folderLabel, insideDir, shortPath } from '../folders.ts';
import { claudeRoot, codexRoots, folderExists, readClaude, readCodex, transcriptFiles } from './sources.ts';
import type { Fact, FileFacts } from './sources.ts';
import { readTurns } from './turns.ts';

// The Stats page's figures, worked out on the server from the facts in the
// agents' transcripts (see sources.ts) and Clack's own records. Transcripts
// are read once and kept, numbers only, in data/stats/index.json; after that
// only files that changed are read again.

const VERSION = 2;
const statsDir = join(config.dataDir, 'stats');
const indexFile = join(statsDir, 'index.json');

type Cached = { size: number; mtime: number; data: FileFacts | null };
let files: Map<string, Cached> | undefined;
let scanning: Promise<void> | undefined;
let scannedAt = 0;
let dirty = false;

function loadIndex(): Map<string, Cached> {
  try {
    const saved = JSON.parse(readFileSync(indexFile, 'utf8')) as { version?: number; files?: Record<string, Cached> };
    if (saved.version === VERSION && saved.files) return new Map(Object.entries(saved.files));
  } catch {
    // Nothing kept yet, or from an older version: read everything again.
  }
  return new Map();
}

function saveIndex(): void {
  if (!files || !dirty) return;
  try {
    mkdirSync(statsDir, { recursive: true });
    const temp = `${indexFile}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify({ version: VERSION, files: Object.fromEntries(files) }));
    renameSync(temp, indexFile);
    dirty = false;
  } catch (err) {
    console.warn('clack: could not save the Stats index:', err instanceof Error ? err.message : err);
  }
}

/** Reads any transcript that is new or changed since the last look. One look at a time, and not more than every few seconds. */
async function scan(): Promise<void> {
  files ??= loadIndex();
  if (Date.now() - scannedAt < 5_000) return;
  scanning ??= (async () => {
    const wanted: [string, Provider][] = [];
    for (const path of await transcriptFiles(claudeRoot())) wanted.push([path, 'claude']);
    for (const root of codexRoots()) for (const path of await transcriptFiles(root)) wanted.push([path, 'codex']);
    const seen = new Set<string>();
    for (const [path, provider] of wanted) {
      seen.add(path);
      const info = await lstat(path).catch(() => undefined);
      if (!info?.isFile()) continue;
      const kept = files!.get(path);
      if (kept && kept.size === info.size && kept.mtime === info.mtimeMs) continue;
      const data = await (provider === 'claude' ? readClaude(path) : readCodex(path)).catch(() => undefined);
      files!.set(path, { size: info.size, mtime: info.mtimeMs, data: data ?? null });
      dirty = true;
    }
    for (const path of [...files!.keys()]) {
      if (!seen.has(path)) {
        files!.delete(path);
        dirty = true;
      }
    }
    saveIndex();
    scannedAt = Date.now();
  })().finally(() => (scanning = undefined));
  await scanning;
}

// ---- Clack's own records ---------------------------------------------------------------

type LogFacts = { size: number; chats: string[]; permissions: [number, 'allowed' | 'always' | 'declined', Provider, string][] };
const logCache = new Map<string, LogFacts>();

/** From the activity log: which chats are Clack's, and the answers given to permission cards. */
function clackLog(): { chats: Set<string>; permissions: LogFacts['permissions'] } {
  const dir = join(config.dataDir, 'logs');
  const chats = new Set<string>();
  const permissions: LogFacts['permissions'] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.jsonl'));
  } catch {
    return { chats, permissions };
  }
  for (const name of names) {
    const path = join(dir, name);
    let size = 0;
    try {
      size = statSync(path).size;
    } catch {
      continue;
    }
    let facts = logCache.get(path);
    if (!facts || facts.size !== size) {
      facts = { size, chats: [], permissions: [] };
      const ids = new Set<string>();
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line) continue;
        try {
          const entry = JSON.parse(line) as { ts?: number; sessionId?: string; kind?: string; text?: string; provider?: Provider; folder?: string };
          if (entry.sessionId) ids.add(entry.sessionId);
          if (entry.kind === 'permission' && typeof entry.ts === 'number' && typeof entry.text === 'string') {
            const verdict = entry.text.startsWith('Always') ? 'always' : entry.text.startsWith('Allowed') ? 'allowed' : 'declined';
            facts.permissions.push([entry.ts, verdict, entry.provider ?? 'claude', entry.folder ?? '']);
          }
        } catch {
          // Skipped.
        }
      }
      facts.chats = [...ids];
      logCache.set(path, facts);
    }
    for (const id of facts.chats) chats.add(id);
    permissions.push(...facts.permissions);
  }
  return { chats, permissions };
}

// ---- time, in the browser's time zone ------------------------------------------------------------

type Local = { day: string; weekday: number; hour: number };

function localClock(timeZone: string): (ts: number) => Local {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
  } catch {
    format = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
  }
  const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  // Time zones move in steps of at least a quarter of an hour, so each quarter hour is worked out once.
  const cache = new Map<number, Local>();
  return (ts: number) => {
    const key = Math.floor(ts / 900_000);
    let local = cache.get(key);
    if (!local) {
      const parts = Object.fromEntries(format.formatToParts(new Date(key * 900_000)).map((part) => [part.type, part.value]));
      local = { day: `${parts.year}-${parts.month}-${parts.day}`, weekday: WEEKDAYS[parts.weekday!] ?? 0, hour: Number(parts.hour) % 24 };
      cache.set(key, local);
    }
    return local;
  };
}

// ---- the report ------------------------------------------------------------------------

export type StatsQuery = { range: StatsRange; provider: Provider | 'all'; scope: StatsScope; folder?: string; timeZone: string; titles: Map<string, string> };

const DAY = 86_400_000;

function emptyTotals(): StatsTotals {
  return { sessions: 0, prompts: 0, tokens: 0, agentMs: 0, toolCalls: 0, costUsd: 0, linesAdded: 0, linesRemoved: 0, activeDays: 0 };
}

const tokensOf = (fact: Extract<Fact, ['k', ...unknown[]]>) => fact[3] + fact[4] + fact[5] + fact[6];

export async function statsReport(query: StatsQuery): Promise<StatsReport> {
  await scan();
  const now = Date.now();
  const local = localClock(query.timeZone);
  const log = clackLog();

  // Every conversation, with the Clack chat it belongs to, kept to the agent, scope and folder asked for.
  type Conversation = FileFacts & { chatId?: string };
  const conversations: Conversation[] = [];
  const sources: StatsReport['sources'] = {
    claude: { found: await folderExists(claudeRoot()), files: 0 },
    codex: { found: (await Promise.all(codexRoots().map(folderExists))).some(Boolean), files: 0 },
  };
  for (const cached of files!.values()) {
    const data = cached.data;
    if (!data) continue;
    sources[data.provider].files++;
    for (const fact of data.facts) {
      const since = sources[data.provider].since;
      if (fact[1] && (since === undefined || fact[1] < since)) sources[data.provider].since = fact[1];
    }
    if (query.provider !== 'all' && data.provider !== query.provider) continue;
    if (query.folder !== undefined && data.cwd !== query.folder) continue;
    const chatId = chatOf(data.provider, data.session) ?? (log.chats.has(data.session) ? data.session : undefined);
    if (query.scope === 'clack' && !chatId) continue;
    conversations.push({ ...data, ...(chatId ? { chatId } : {}) });
  }

  // The days of the range, oldest first.
  const today = local(now).day;
  let earliest = now;
  for (const c of conversations) for (const fact of c.facts) if (fact[1] && fact[1] < earliest) earliest = fact[1];
  const span = query.range === 'all' ? Math.max(1, Math.ceil((now - earliest) / DAY) + 1) : Number(query.range);
  const dayList: string[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const day = local(now - i * DAY).day;
    if (dayList.at(-1) !== day) dayList.push(day);
  }
  if (dayList.at(-1) !== today) dayList.push(today);
  const firstDay = dayList[0]!;
  // Where the range starts, as a time: the first moment of its first day.
  let from = now - span * DAY;
  while (local(from).day < firstDay) from += 900_000;
  const previousFrom = from - (now - from);
  const inRange = (ts: number) => ts >= from && ts <= now;

  const totals = emptyTotals();
  const previous = emptyTotals();
  const split: TokenSplit = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
  const days = new Map(dayList.map((day) => [day, { day, prompts: 0, tokens: 0, claude: 0, codex: 0, costUsd: 0, agentMs: 0 }]));
  const weekHours = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const models = new Map<string, { model: string; provider: Provider; tokens: number; replies: number; costUsd: number }>();
  const projects = new Map<string, StatsReport['projects'][number] & { ids: Set<string> }>();
  const tools = new Map<string, { name: string; provider: Provider; calls: number }>();
  const sessions = new Map<string, StatsReport['topSessions'][number]>();
  const activeDays = new Set<string>();
  const previousSessions = new Set<string>();
  const previousDays = new Set<string>();
  const calendarStart = now - 371 * DAY;
  const calendar = new Map<string, { day: string; prompts: number; tokens: number }>();
  const everyActiveDay = new Set<string>();

  for (const c of conversations) {
    const key = `${c.provider}:${c.session}`;
    for (const fact of c.facts) {
      const ts = fact[1];
      if (!ts) continue;
      const when = local(ts);
      const tokens = fact[0] === 'k' ? tokensOf(fact) : 0;
      if (fact[0] === 'p' || fact[0] === 'k') everyActiveDay.add(when.day);
      if (ts >= calendarStart && (fact[0] === 'p' || fact[0] === 'k')) {
        const cell = calendar.get(when.day) ?? { day: when.day, prompts: 0, tokens: 0 };
        if (fact[0] === 'p') cell.prompts++;
        cell.tokens += tokens;
        calendar.set(when.day, cell);
      }

      if (ts >= previousFrom && ts < from) {
        add(previous, fact, tokens);
        previousSessions.add(key);
        if (fact[0] === 'p' || fact[0] === 'k') previousDays.add(when.day);
        continue;
      }
      if (!inRange(ts)) continue;

      add(totals, fact, tokens);
      const day = days.get(when.day);
      const project =
        projects.get(c.cwd) ??
        projects
          .set(c.cwd, { cwd: c.cwd, label: labelOf(c.cwd), clack: false, sessions: 0, prompts: 0, tokens: 0, agentMs: 0, costUsd: 0, lastActive: 0, ids: new Set() })
          .get(c.cwd)!;
      project.ids.add(key);
      project.clack ||= !!c.chatId;
      project.lastActive = Math.max(project.lastActive, ts);
      const session =
        sessions.get(key) ??
        sessions
          .set(key, {
            id: c.session,
            provider: c.provider,
            ...(c.chatId ? { chatId: c.chatId } : {}),
            ...(c.chatId && query.titles.get(c.chatId) ? { title: query.titles.get(c.chatId) } : {}),
            cwd: c.cwd,
            label: labelOf(c.cwd),
            tokens: 0,
            prompts: 0,
            agentMs: 0,
            costUsd: 0,
            lastActive: 0,
          })
          .get(key)!;
      session.lastActive = Math.max(session.lastActive, ts);

      switch (fact[0]) {
        case 'p':
          activeDays.add(when.day);
          weekHours[when.weekday]![when.hour]!++;
          if (day) day.prompts++;
          project.prompts++;
          session.prompts++;
          break;
        case 'k': {
          activeDays.add(when.day);
          split.input += fact[3];
          split.output += fact[4];
          split.cacheRead += fact[5];
          split.cacheWrite += fact[6];
          split.reasoning += fact[7];
          if (day) {
            day.tokens += tokens;
            day[c.provider] += tokens;
          }
          project.tokens += tokens;
          session.tokens += tokens;
          const model = models.get(fact[2]) ?? models.set(fact[2], { model: fact[2], provider: c.provider, tokens: 0, replies: 0, costUsd: 0 }).get(fact[2])!;
          model.tokens += tokens;
          model.replies++;
          break;
        }
        case 't': {
          const tool = tools.get(`${c.provider}:${fact[2]}`) ?? tools.set(`${c.provider}:${fact[2]}`, { name: fact[2], provider: c.provider, calls: 0 }).get(`${c.provider}:${fact[2]}`)!;
          tool.calls++;
          break;
        }
        case 'a':
          if (day) day.agentMs += fact[2];
          project.agentMs += fact[2];
          session.agentMs += fact[2];
          break;
        case 'c': {
          if (day) day.costUsd += fact[2];
          project.costUsd += fact[2];
          session.costUsd += fact[2];
          const model = models.get(fact[3]) ?? models.set(fact[3], { model: fact[3], provider: c.provider, tokens: 0, replies: 0, costUsd: 0 }).get(fact[3])!;
          model.costUsd += fact[2];
          break;
        }
        case 'l':
          break;
      }
    }
  }

  totals.sessions = sessions.size;
  totals.activeDays = activeDays.size;
  previous.sessions = previousSessions.size;
  previous.activeDays = previousDays.size;

  // Clack's answers to permission cards, and its record of each reply.
  const permissions = { allowed: 0, always: 0, declined: 0 };
  const folderWanted = query.folder === undefined ? undefined : folderLabel(query.folder);
  for (const [ts, verdict, provider, folder] of log.permissions) {
    if (!inRange(ts) || (query.provider !== 'all' && provider !== query.provider) || (folderWanted !== undefined && folder !== folderWanted)) continue;
    permissions[verdict]++;
  }
  const allTurns = readTurns();
  const turns = allTurns.filter(
    (turn) => inRange(turn.end) && (query.provider === 'all' || turn.provider === query.provider) && (query.folder === undefined || turn.cwd === query.folder),
  );
  const turnSummary = {
    count: turns.length,
    stopped: turns.filter((turn) => turn.outcome === 'stopped').length,
    failed: turns.filter((turn) => turn.outcome === 'failed').length,
    averageMs: turns.length ? Math.round(turns.reduce((sum, turn) => sum + (turn.end - turn.start), 0) / turns.length) : 0,
    ...(allTurns[0] ? { since: allTurns[0].start } : {}),
  };

  return {
    generatedAt: now,
    range: { from, to: now, days: dayList.length },
    sources,
    totals,
    previous: query.range === 'all' ? null : previous,
    tokens: split,
    streak: streaks(everyActiveDay, today, local, now),
    days: [...days.values()],
    calendar: calendarDays(calendar, local, now),
    weekHours,
    models: [...models.values()].sort((a, b) => b.tokens - a.tokens || b.costUsd - a.costUsd),
    projects: [...projects.values()]
      .map(({ ids, ...project }) => ({ ...project, sessions: ids.size }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 40),
    tools: [...tools.values()].sort((a, b) => b.calls - a.calls).slice(0, 30),
    permissions,
    topSessions: [...sessions.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 10),
    turns: turnSummary,
  };
}

function add(totals: StatsTotals, fact: Fact, tokens: number): void {
  switch (fact[0]) {
    case 'p':
      totals.prompts++;
      break;
    case 'k':
      totals.tokens += tokens;
      break;
    case 't':
      totals.toolCalls++;
      break;
    case 'a':
      totals.agentMs += fact[2];
      break;
    case 'c':
      totals.costUsd += fact[2];
      break;
    case 'l':
      totals.linesAdded += fact[2];
      totals.linesRemoved += fact[3];
      break;
  }
}

/** A folder as the page shows it: a chat folder's name, or the path with ~ for home. */
function labelOf(cwd: string): string {
  if (!cwd) return 'Unknown folder';
  return insideDir(cwd, config.sessionsDir) ? folderLabel(cwd) : shortPath(cwd);
}

/** The last 53 weeks, a cell a day, oldest first. */
function calendarDays(cells: Map<string, { day: string; prompts: number; tokens: number }>, local: (ts: number) => Local, now: number) {
  const out: { day: string; prompts: number; tokens: number }[] = [];
  for (let i = 370; i >= 0; i--) {
    const day = local(now - i * DAY).day;
    if (out.at(-1)?.day === day) continue;
    out.push(cells.get(day) ?? { day, prompts: 0, tokens: 0 });
  }
  return out;
}

/** Days in a row with any use: the run up to today (or yesterday, when today has none yet), and the longest. */
function streaks(active: Set<string>, today: string, local: (ts: number) => Local, now: number): { current: number; longest: number } {
  let current = 0;
  for (let i = active.has(today) ? 0 : 1; ; i++) {
    if (!active.has(local(now - i * DAY).day)) break;
    current++;
  }
  const sorted = [...active].sort();
  let longest = 0;
  let run = 0;
  let before = '';
  for (const day of sorted) {
    const next = before && new Date(Date.parse(`${before}T12:00:00Z`) + DAY).toISOString().slice(0, 10) === day;
    run = next ? run + 1 : 1;
    longest = Math.max(longest, run);
    before = day;
  }
  return { current, longest };
}
