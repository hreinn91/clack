import { readPlans } from '../../plans.ts';
import type { Capabilities, Item } from '../../../../shared/protocol.ts';
import { config } from '../../config.ts';
import { existingFolder } from '../../folders.ts';
import type { AgentBackend, StoredSession } from '../types.ts';
import { stripHandover } from '../handover.ts';
import { appServer, codexInstalled, NOT_INSTALLED } from './appserver.ts';
import { itemsFromTurns } from './items.ts';
import type { McpServerStatus, SkillMetadata, Thread, Turn } from './protocol.ts';
import { CodexRun } from './run.ts';
import { codexModels, codexStatus, codexUsage, probeSandbox } from './state.ts';

/** Codex's own tools, which the app-server does not list. */
const BUILT_IN_TOOLS = ['apply_patch', 'shell', 'update_plan', 'view_image', 'web_search'];

/** The sources whose threads clack lists: Codex left alone lists only the interactive ones. */
const SOURCES = ['cli', 'vscode', 'exec', 'appServer'];

/** A thread's title: the name it was given, or the start of its first message. */
function titleOf(thread: Thread): string | undefined {
  if (thread.name) return thread.name;
  const first = stripHandover(thread.preview).text.split('\n\nAttached files:\n')[0]!.trim();
  if (!first) return undefined;
  return first.length > 80 ? `${first.slice(0, 80)}…` : first;
}

function stored(thread: Thread, archived: boolean): StoredSession {
  return {
    provider: 'codex',
    sessionId: thread.id,
    cwd: thread.cwd,
    ...(titleOf(thread) ? { title: titleOf(thread) } : {}),
    ...(thread.gitInfo?.branch ? { gitBranch: thread.gitInfo.branch } : {}),
    lastModified: thread.updatedAt * 1000,
    archived,
    ...(thread.reasoningEffort ? { effort: thread.reasoningEffort } : {}),
    ...(thread.model ? { model: thread.model } : {}),
  };
}

const MCP_STATUS: Record<string, Capabilities['mcpServers'][number]['status']> = {
  connected: 'connected',
  starting: 'pending',
  notStarted: 'pending',
  authenticationRequired: 'needs-auth',
  failed: 'failed',
  cancelled: 'failed',
  disabled: 'disabled',
};

/** Codex, through its app-server (`codex app-server`), which the codex command provides. */
export const codex: AgentBackend = {
  provider: 'codex',
  name: 'Codex',

  // Listed unless switched off: a server without the codex command shows Codex as not available, saying why.
  enabled: () => config.codex !== 'off',

  async status(fresh) {
    if (!codexInstalled(fresh)) return { available: false, reason: NOT_INSTALLED };
    await probeSandbox();
    return codexStatus();
  },


  models: () => codexModels(),
  usage: (fresh) => codexUsage(fresh),

  async capabilities(folder, fresh) {
    const cwd = folder ? await existingFolder(folder) : config.sessionsDir;
    const [servers, skills] = await Promise.all([
      appServer.request<{ data: McpServerStatus[] }>('mcpServerStatus/list', { detail: 'full' }),
      appServer.request<{ data: { cwd: string; skills: SkillMetadata[] }[] }>('skills/list', { cwds: [cwd], forceReload: fresh }),
    ]);
    return {
      provider: 'codex',
      folder: folder || null,
      measuredAt: Date.now(),
      mcpServers: servers.data
        .map((server) => ({
          name: server.name,
          status: server.authStatus === 'notLoggedIn' ? ('needs-auth' as const) : (MCP_STATUS[server.runtimeStatus ?? ''] ?? ('connected' as const)),
          scope: server.pluginId ? 'plugin' : 'config',
          ...(server.serverInfo?.version ? { version: server.serverInfo.version } : {}),
          ...(server.toolsError ? { error: server.toolsError } : {}),
          tools: Object.values(server.tools)
            .filter((tool) => tool !== undefined)
            .map((tool) => ({
              name: tool.name,
              ...(tool.description ? { description: tool.description } : {}),
              ...(tool.annotations?.readOnlyHint ? { readOnly: true } : {}),
              ...(tool.annotations?.destructiveHint ? { destructive: true } : {}),
            })),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      skills: (skills.data.find((entry) => entry.cwd === cwd)?.skills ?? skills.data[0]?.skills ?? [])
        .filter((skill) => skill.enabled)
        .map((skill) => ({
          name: skill.name,
          description: skill.shortDescription || skill.description,
          source: skill.scope,
          ...(skill.pluginId ? { plugin: skill.pluginId } : {}),
          invocable: true,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      agents: [],
      commands: [],
      tools: { names: BUILT_IN_TOOLS, seenAt: Date.now() },
    };
  },

  async list() {
    const found: StoredSession[] = [];
    if (!codexInstalled()) return found;
    for (const archived of [false, true]) {
      let cursor: string | null = null;
      for (let page = 0; page < 3; page++) {
        const answer: { data: Thread[]; nextCursor: string | null } = await appServer.request('thread/list', {
          limit: 100,
          sortKey: 'updated_at',
          sourceKinds: SOURCES,
          archived,
          ...(cursor ? { cursor } : {}),
        });
        for (const thread of answer.data) if (!thread.ephemeral && !thread.parentThreadId) found.push(stored(thread, archived));
        cursor = answer.nextCursor;
        if (!cursor) break;
      }
    }
    return found;
  },

  async find(sessionId) {
    if (!codexInstalled()) return undefined;
    try {
      const answer = await appServer.request<{ thread: Thread }>('thread/read', { threadId: sessionId, includeTurns: false });
      return stored(answer.thread, false);
    } catch {
      return undefined;
    }
  },

  async history(sessionId): Promise<Item[]> {
    const { thread } = await appServer.request<{ thread: Thread }>('thread/read', { threadId: sessionId, includeTurns: false });
    const turns: Turn[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 40; page++) {
      const answer: { data: Turn[]; nextCursor: string | null } = await appServer.request('thread/turns/list', {
        threadId: sessionId,
        itemsView: 'full',
        sortDirection: 'asc',
        limit: 50,
        ...(cursor ? { cursor } : {}),
      });
      turns.push(...answer.data);
      cursor = answer.nextCursor;
      if (!cursor) break;
    }
    return itemsFromTurns(turns, thread.model, thread.reasoningEffort, readPlans('codex', sessionId));
  },

  rename: async (sessionId, title) => {
    await appServer.request('thread/name/set', { threadId: sessionId, name: title });
  },

  setArchived: async (sessionId, archived) => {
    await appServer.request(archived ? 'thread/archive' : 'thread/unarchive', { threadId: sessionId });
  },

  remove: async (sessionId) => {
    await appServer.request('thread/delete', { threadId: sessionId });
  },

  run: (host, sessionId, saved) => new CodexRun(host, sessionId, saved),

  shutdown() {
    appServer.stop();
  },
};
