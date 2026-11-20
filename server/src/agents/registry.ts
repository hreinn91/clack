import type { Provider } from '../../../shared/protocol.ts';
import { claude } from './claude/index.ts';
import { codex } from './codex/index.ts';
import type { AgentBackend } from './types.ts';

/** Every provider clack knows, in the order the UI lists them. */
const all: AgentBackend[] = [claude, codex];

/** The providers switched on for this server. */
export function backends(): AgentBackend[] {
  return all.filter((backend) => backend.enabled());
}

export function backend(provider: Provider): AgentBackend {
  const found = all.find((b) => b.provider === provider);
  if (!found || !found.enabled()) throw new Error(`${provider === 'codex' ? 'Codex' : 'Claude'} is not available on this server.`);
  return found;
}

/**
 * The agent a new chat starts on: the one asked for (the last one used) when it
 * can be used, otherwise the first that can. With none signed in, the one asked
 * for: the chat then says what is missing when a message is sent.
 */
export async function startingProvider(wanted: Provider): Promise<Provider> {
  const order = [wanted, ...backends().map((b) => b.provider).filter((p) => p !== wanted)];
  for (const provider of order) {
    const found = backends().find((b) => b.provider === provider);
    if (found && (await found.status().catch(() => ({ available: false }))).available) return provider;
  }
  return backends().some((b) => b.provider === wanted) ? wanted : 'claude';
}

export function isProvider(value: unknown): value is Provider {
  return value === 'claude' || value === 'codex';
}
