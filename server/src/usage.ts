import { EventEmitter } from 'node:events';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { PlanUsage, UsageWindow } from '../../shared/protocol.ts';
import { config } from './config.ts';

/** Emits 'changed' with the new figures whenever they are read again. */
export const usageBus = new EventEmitter();

/** How long figures are served without asking again. Finished turns bring fresh ones on their own. */
const MAX_AGE_MS = 5 * 60_000;
/** Asking means starting Claude Code, so even "now, please" waits this long between tries. */
const MIN_GAP_MS = 15_000;

let latest: PlanUsage | undefined;
let pending: Promise<PlanUsage> | undefined;

type Window = { utilization?: number | null; resets_at?: string | null } | null | undefined;

function percent(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : undefined;
}

function toWindow(id: string, label: string, raw: Window): UsageWindow | undefined {
  const used = percent(raw?.utilization);
  if (used === undefined) return undefined;
  const resets = raw?.resets_at ? Date.parse(raw.resets_at) : Number.NaN;
  return { id, label, used, ...(Number.isNaN(resets) ? {} : { resetsAt: resets }) };
}

/**
 * Asks a Claude Code process how much of the plan's limits is used. The call
 * is marked experimental in the Agent SDK, so its answer is read defensively:
 * whatever is missing or unexpected is simply left out.
 */
async function ask(q: Query): Promise<PlanUsage> {
  const raw = await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true });
  const limits = raw.rate_limits;
  const windows: UsageWindow[] = [];
  const add = (window: UsageWindow | undefined) => {
    if (window) windows.push(window);
  };
  if (limits) {
    add(toWindow('session', 'Current session', limits.five_hour));
    add(toWindow('week', 'This week, all models', limits.seven_day));
    add(toWindow('week-opus', 'This week, Opus', limits.seven_day_opus));
    add(toWindow('week-sonnet', 'This week, Sonnet', limits.seven_day_sonnet));
    for (const scoped of limits.model_scoped ?? []) {
      add(toWindow(`week-${scoped.display_name.toLowerCase()}`, `This week, ${scoped.display_name}`, scoped));
    }
  }
  const extra = limits?.extra_usage;
  return {
    available: raw.rate_limits_available && windows.length > 0,
    ...(raw.subscription_type ? { plan: raw.subscription_type } : {}),
    windows,
    ...(extra?.is_enabled
      ? { extra: { used: extra.used_credits ?? 0, limit: extra.monthly_limit, currency: extra.currency ?? null, percent: percent(extra.utilization) ?? null } }
      : {}),
    fetchedAt: Date.now(),
  };
}

function store(usage: PlanUsage): PlanUsage {
  latest = usage;
  usageBus.emit('changed', usage);
  return usage;
}

/** A prompt stream that never sends anything: enough to start Claude Code and ask it questions. */
async function* silence(signal: AbortSignal): AsyncGenerator<SDKUserMessage> {
  await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
}

async function probe(): Promise<PlanUsage> {
  const done = new AbortController();
  const q = query({
    prompt: silence(done.signal),
    options: { cwd: config.dataDir, ...(config.claudePath ? { pathToClaudeCodeExecutable: config.claudePath } : {}) },
  });
  try {
    return store(await ask(q));
  } finally {
    done.abort();
    q.close();
  }
}

/**
 * How much of the plan's limits is used. Served from memory while recent;
 * `fresh` asks again unless that was done moments ago.
 */
export function planUsage(fresh = false): Promise<PlanUsage> {
  const age = latest ? Date.now() - latest.fetchedAt : Number.POSITIVE_INFINITY;
  if (latest && age < (fresh ? MIN_GAP_MS : MAX_AGE_MS)) return Promise.resolve(latest);
  pending ??= probe()
    .catch((err): PlanUsage => {
      // Keep showing the last known figures if there are any; say why there are none otherwise.
      if (latest) return latest;
      return { available: false, windows: [], fetchedAt: Date.now(), error: err instanceof Error ? err.message : String(err) };
    })
    .finally(() => (pending = undefined));
  return pending;
}

/** Reads the figures through a process that is running anyway, which costs nothing extra. */
export async function refreshUsageWith(q: Query): Promise<void> {
  try {
    store(await ask(q));
  } catch {
    // The next request for the figures asks on its own.
  }
}
