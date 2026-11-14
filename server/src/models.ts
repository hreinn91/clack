import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ModelOption } from '../../shared/protocol.ts';
import { config } from './config.ts';

let cached: Promise<ModelOption[]> | undefined;

/** A prompt stream that never sends anything: enough to start Claude Code and ask it questions. */
async function* silence(signal: AbortSignal): AsyncGenerator<SDKUserMessage> {
  await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
}

async function fetchModels(): Promise<ModelOption[]> {
  const done = new AbortController();
  const q = query({
    prompt: silence(done.signal),
    options: {
      cwd: config.dataDir,
      ...(config.claudePath ? { pathToClaudeCodeExecutable: config.claudePath } : {}),
    },
  });
  try {
    const models = await q.supportedModels();
    return models.map((model) => ({
      value: model.value,
      label: model.displayName,
      description: model.description,
      efforts: model.supportsEffort ? (model.supportedEffortLevels ?? []) : [],
    }));
  } finally {
    done.abort();
    q.close();
  }
}

/** The models this Claude account can use, asked of Claude Code once and then remembered. */
export function listModels(): Promise<ModelOption[]> {
  cached ??= fetchModels().catch((err) => {
    cached = undefined; // let the next request try again
    throw err;
  });
  return cached;
}
