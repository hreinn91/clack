import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { config } from '../../config.ts';

// Whether Claude Code is signed in on this server, and with what. Asked of a
// short-lived Claude Code process that is sent nothing, and kept for a while:
// signing in happens outside clack, so it is looked at again now and then.

const KEEP_MS = 5 * 60_000;

export type ClaudeAccount = { available: boolean; plan?: string; reason?: string };

let latest: { at: number; answer: Promise<ClaudeAccount> } | undefined;

async function* silence(signal: AbortSignal): AsyncGenerator<SDKUserMessage> {
  await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
}

async function ask(): Promise<ClaudeAccount> {
  const done = new AbortController();
  const q = query({
    prompt: silence(done.signal),
    options: { cwd: config.dataDir, ...(config.claudePath ? { pathToClaudeCodeExecutable: config.claudePath } : {}) },
  });
  try {
    const info = await q.accountInfo();
    // Through a cloud provider (Bedrock, Vertex…) or a gateway, signing in happens elsewhere.
    if (info.apiProvider && info.apiProvider !== 'firstParty') return { available: true, plan: info.apiProvider };
    if (info.apiKeySource && info.apiKeySource !== 'none') return { available: true, plan: 'API key' };
    if (info.subscriptionType || info.email || (info.tokenSource && info.tokenSource !== 'none')) {
      const plan = info.subscriptionType?.replace(/^Claude\s+/i, '').toLowerCase();
      return { available: true, ...(plan ? { plan } : {}) };
    }
    return { available: false, reason: 'Claude Code is not signed in. Run `claude auth login` on the server.' };
  } catch (err) {
    return { available: false, reason: `Claude Code could not be started: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    done.abort();
    q.close();
  }
}

/** Whether Claude Code can be used, asked again when `fresh` or after a few minutes. */
export function claudeAccount(fresh = false): Promise<ClaudeAccount> {
  if (!fresh && latest && Date.now() - latest.at < KEEP_MS) return latest.answer;
  const answer = ask();
  latest = { at: Date.now(), answer };
  return answer;
}
