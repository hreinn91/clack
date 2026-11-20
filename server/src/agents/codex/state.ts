import { execFile } from 'node:child_process';
import type { ModelOption, PlanUsage, UsageWindow } from '../../../../shared/protocol.ts';
import { config } from '../../config.ts';
import { usageBus } from '../bus.ts';
import { appServer } from './appserver.ts';
import type { Account, Model, RateLimitSnapshot, RateLimitWindow, SandboxPolicy } from './protocol.ts';

// What Codex says about the account rather than a chat: its models, how much
// of the plan's limits is used, and whether its sandbox works here. Each is
// asked of the shared app-server and kept for a while.

const MODELS_KEEP_MS = 10 * 60_000;
/** How long figures are served without asking again. Finished turns bring fresh ones on their own. */
const USAGE_MAX_AGE_MS = 5 * 60_000;
const USAGE_MIN_GAP_MS = 15_000;

let models: { at: number; list: Promise<ModelOption[]> } | undefined;

export function codexModels(): Promise<ModelOption[]> {
  if (models && Date.now() - models.at < MODELS_KEEP_MS) return models.list;
  const list = appServer.request<{ data: Model[] }>('model/list', {}).then((answer) =>
    answer.data
      .filter((model) => !model.hidden)
      .map(
        (model): ModelOption => ({
          provider: 'codex',
          value: model.model || model.id,
          label: model.displayName,
          description: model.description,
          efforts: model.supportedReasoningEfforts.map((option) => option.reasoningEffort),
          defaultEffort: model.defaultReasoningEffort,
          ...(model.isDefault ? { isDefault: true } : {}),
        }),
      ),
  );
  models = { at: Date.now(), list };
  list.catch(() => (models = undefined));
  return list;
}

/** The model Codex uses when none is chosen. Plan mode has to name one. */
export async function defaultModel(): Promise<string> {
  const list = await codexModels();
  const chosen = list.find((m) => m.isDefault) ?? list[0];
  if (!chosen) throw new Error('Codex lists no models for this account.');
  return chosen.value;
}

/** "Plus", "Pro", "API key" and so on: what the account is signed in with. */
function planName(account: Account | null): string | undefined {
  if (!account) return undefined;
  if (account.type === 'chatgpt') return account.planType;
  if (account.type === 'apiKey') return 'API key';
  return account.type;
}

export async function codexStatus(): Promise<{ available: boolean; plan?: string; reason?: string }> {
  try {
    const answer = await appServer.request<{ account: Account | null; requiresOpenaiAuth: boolean }>('account/read', {});
    if (!answer.account && answer.requiresOpenaiAuth) {
      return { available: false, reason: 'Codex is not signed in. Run `codex login` on the server.' };
    }
    const plan = planName(answer.account);
    return { available: true, ...(plan ? { plan } : {}) };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

// ---- plan usage ---------------------------------------------------------------

let latest: PlanUsage | undefined;
let pending: Promise<PlanUsage> | undefined;

/** "Current 5 hours", "This week": a window's name from how long it is. */
function windowLabel(window: RateLimitWindow, fallback: string): string {
  const mins = window.windowDurationMins;
  if (!mins) return fallback;
  if (mins === 10_080) return 'This week';
  if (mins % 1440 === 0) return `Current ${mins / 1440} days`;
  if (mins % 60 === 0) return `Current ${mins / 60} hours`;
  return `Current ${mins} minutes`;
}

function windowsOf(snapshot: RateLimitSnapshot, prefix: string, named?: string): UsageWindow[] {
  const windows: UsageWindow[] = [];
  const add = (id: string, window: RateLimitWindow | null, fallback: string) => {
    if (!window) return;
    const label = windowLabel(window, fallback);
    windows.push({
      id: `${prefix}${id}`,
      label: named ? `${label}, ${named}` : label,
      used: Math.max(0, Math.min(100, Math.round(window.usedPercent))),
      ...(window.resetsAt ? { resetsAt: window.resetsAt * 1000 } : {}),
    });
  };
  add('session', snapshot.primary, 'Current window');
  add('week', snapshot.secondary, 'Longer window');
  return windows;
}

type RateLimitsAnswer = { rateLimits: RateLimitSnapshot; rateLimitsByLimitId?: Record<string, RateLimitSnapshot | undefined> | null };

function toUsage(answer: RateLimitsAnswer): PlanUsage {
  const main = answer.rateLimits;
  const windows = windowsOf(main, '');
  // Some models have limits of their own, next to the plan's.
  for (const [id, snapshot] of Object.entries(answer.rateLimitsByLimitId ?? {})) {
    if (!snapshot || id === main.limitId) continue;
    windows.push(...windowsOf(snapshot, `${id}-`, snapshot.limitName ?? id));
  }
  const credits = main.credits;
  return {
    provider: 'codex',
    available: windows.length > 0,
    ...(main.planType ? { plan: main.planType } : {}),
    windows,
    ...(credits && (credits.hasCredits || credits.unlimited) ? { credits: { balance: credits.balance, unlimited: credits.unlimited } } : {}),
    fetchedAt: Date.now(),
  };
}

function store(usage: PlanUsage): PlanUsage {
  latest = usage;
  usageBus.emit('changed', usage);
  return usage;
}

// The app-server says when the limits move, while it runs.
appServer.events.on('account/rateLimits/updated', (params: { rateLimits?: RateLimitSnapshot }) => {
  if (params.rateLimits) store(toUsage({ rateLimits: params.rateLimits, rateLimitsByLimitId: null }));
});

export function codexUsage(fresh = false): Promise<PlanUsage> {
  const age = latest ? Date.now() - latest.fetchedAt : Number.POSITIVE_INFINITY;
  if (latest && age < (fresh ? USAGE_MIN_GAP_MS : USAGE_MAX_AGE_MS)) return Promise.resolve(latest);
  pending ??= appServer
    .request<RateLimitsAnswer>('account/rateLimits/read', {})
    .then((answer) => store(toUsage(answer)))
    .catch((err): PlanUsage => {
      if (latest) return latest;
      return { provider: 'codex', available: false, windows: [], fetchedAt: Date.now(), error: err instanceof Error ? err.message : String(err) };
    })
    .finally(() => (pending = undefined));
  return pending;
}

/** After a turn: the figures again, unless they were read moments ago. */
export async function refreshCodexUsage(): Promise<void> {
  await codexUsage(true).catch(() => undefined);
}

// ---- the sandbox ---------------------------------------------------------------

/**
 * Whether Codex's own sandbox can run here. On macOS it always can; in a
 * container it needs bubblewrap and user namespaces, which Docker often does
 * not allow. Without it the container itself is the sandbox.
 */
let sandboxWorks: boolean | undefined;

export function probeSandbox(): Promise<boolean> {
  if (sandboxWorks !== undefined) return Promise.resolve(sandboxWorks);
  if (!config.container) return Promise.resolve((sandboxWorks = true));
  return new Promise((resolve) => {
    execFile(config.codexPath, ['sandbox', '--', 'true'], { timeout: 15_000 }, (err) => {
      sandboxWorks = !err;
      resolve(sandboxWorks);
    });
  });
}

/** Whether the last probe found Codex's sandbox working; undefined before it has run. */
export function sandboxState(): boolean | undefined {
  return sandboxWorks;
}

/**
 * The sandbox a turn runs in. Writing is limited to the chat's folder and the
 * network is off unless Codex asks for it and is allowed. Reading is not
 * limited: Codex's sandbox does not offer that.
 */
export function sandboxPolicy(cwd: string, write: boolean): SandboxPolicy {
  if (sandboxWorks === false) return { type: 'externalSandbox', networkAccess: 'enabled' };
  return write
    ? { type: 'workspaceWrite', writableRoots: [cwd], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false }
    : { type: 'readOnly', networkAccess: false };
}
