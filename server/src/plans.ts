import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlanItem, Provider } from '../../shared/protocol.ts';
import { config } from './config.ts';

// Provider histories can omit live checklist updates and approval payloads.
// Store one snapshot per turn, grouped by the provider conversation that owns it.
const dir = join(config.dataDir, 'plans');
function file(provider: Provider, sessionId: string): string {
  return join(dir, provider + '-' + createHash('sha256').update(sessionId).digest('hex') + '.json');
}

function load(provider: Provider, sessionId: string): Record<string, PlanItem> {
  try {
    return JSON.parse(readFileSync(file(provider, sessionId), 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

export function readPlans(provider: Provider, sessionId: string): Record<string, PlanItem> {
  try {
    return load(provider, sessionId);
  } catch (err) {
    console.warn('clack: could not read saved plans:', err);
    return {};
  }
}

export function savePlan(provider: Provider, sessionId: string, item: PlanItem): void {
  const plans = load(provider, sessionId);
  plans[item.id] = item;
  mkdirSync(dir, { recursive: true });
  const target = file(provider, sessionId);
  writeFileSync(target + '.tmp', JSON.stringify(plans), { mode: 0o600 });
  renameSync(target + '.tmp', target);
}

export function forgetPlans(provider: Provider, sessionId: string): void {
  rmSync(file(provider, sessionId), { force: true });
}
