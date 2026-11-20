import {
  archiveSession,
  deleteSession,
  getSessionInfo,
  getSessionMessages,
  listSessions,
  renameSession,
  unarchiveSession,
} from '@anthropic-ai/claude-agent-sdk';
import type { SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import type { Item } from '../../../../shared/protocol.ts';
import type { AgentBackend, StoredSession } from '../types.ts';
import { claudeAccount } from './account.ts';
import { capabilities } from './capabilities.ts';
import { listModels } from './models.ts';
import { ClaudeRun } from './run.ts';
import { itemsFromHistory, readEfforts } from './transcript.ts';
import { planUsage } from './usage.ts';

function stored(info: SDKSessionInfo): StoredSession | undefined {
  if (!info.cwd) return undefined;
  return {
    provider: 'claude',
    sessionId: info.sessionId,
    cwd: info.cwd,
    title: info.customTitle || info.summary || info.firstPrompt || undefined,
    ...(info.gitBranch ? { gitBranch: info.gitBranch } : {}),
    lastModified: info.lastModified,
    archived: info.archived === true,
  };
}

/** Claude Code, through the Claude Agent SDK. Always on: it comes with the SDK. */
export const claude: AgentBackend = {
  provider: 'claude',
  name: 'Claude',

  enabled: () => true,

  status: (fresh) => claudeAccount(fresh),

  models: () => listModels(),
  usage: (fresh) => planUsage(fresh),
  capabilities: (folder, fresh) => capabilities(folder, fresh),

  async list() {
    return (await listSessions()).map(stored).filter((s): s is StoredSession => s !== undefined);
  },

  async find(sessionId) {
    const info = await getSessionInfo(sessionId).catch(() => undefined);
    return info ? stored(info) : undefined;
  },

  async history(sessionId): Promise<Item[]> {
    const [messages, efforts] = await Promise.all([getSessionMessages(sessionId), readEfforts(sessionId)]);
    return itemsFromHistory(messages, efforts);
  },

  rename: (sessionId, title) => renameSession(sessionId, title),
  setArchived: (sessionId, archived) => (archived ? archiveSession(sessionId) : unarchiveSession(sessionId)),
  remove: (sessionId) => deleteSession(sessionId),

  run(host, sessionId, saved) {
    // A new Claude conversation takes the id it is given, which for a chat's first segment is the chat's own.
    return new ClaudeRun(host, sessionId ?? host.chatId, saved);
  },

  shutdown() {
    // Each chat's run stops its own process; nothing is shared.
  },
};
