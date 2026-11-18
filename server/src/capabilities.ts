import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { McpServerStatus, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Capabilities } from '../../shared/protocol.ts';
import { config } from './config.ts';
import { existingFolder } from './folders.ts';

// What Claude Code can use: asked of a short-lived Claude Code process started
// in the folder, without sending it anything, so it costs no tokens. MCP
// servers connect in the background, so the answer waits a few seconds for
// them to settle. Answers are kept for a few minutes per folder.

const KEEP_MS = 5 * 60_000;
/** The longest the answer waits for MCP servers to connect. */
const MCP_WAIT_MS = 8000;
const toolsFile = join(config.dataDir, 'tools.json');

const cache = new Map<string, Promise<Capabilities> & { at?: number }>();

/** The built-in tools the latest chat reported when it started, kept on disk across restarts. */
let knownTools: Capabilities['tools'] = (() => {
  try {
    const saved = JSON.parse(readFileSync(toolsFile, 'utf8')) as Capabilities['tools'];
    return saved && Array.isArray(saved.names) ? saved : undefined;
  } catch {
    return undefined;
  }
})();

/** Called with the tool list a chat reports when it starts. MCP tools are listed with their servers instead. */
export function rememberTools(names: string[]): void {
  const builtIn = names.filter((name) => !name.startsWith('mcp__')).sort((a, b) => a.localeCompare(b));
  if (!builtIn.length) return;
  const same = knownTools && knownTools.names.join() === builtIn.join();
  knownTools = { names: builtIn, seenAt: Date.now() };
  if (same) return;
  try {
    writeFileSync(toolsFile, JSON.stringify(knownTools, null, 2) + '\n');
  } catch {
    // Kept in memory only.
  }
}

/** A prompt stream that never sends anything: enough to start Claude Code and ask it questions. */
async function* silence(signal: AbortSignal): AsyncGenerator<SDKUserMessage> {
  await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The description in a skill file's frontmatter, for a skill Claude Code lists without one. */
function describedIn(path: string | undefined): string {
  if (!path) return '';
  try {
    const file = statSync(path).isDirectory() ? join(path, 'SKILL.md') : path;
    const head = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const line = head?.[1]!.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
    return line.replace(/^(['"])(.*)\1$/, '$2');
  } catch {
    return '';
  }
}

async function measure(cwd: string): Promise<Capabilities> {
  const done = new AbortController();
  const q = query({
    prompt: silence(done.signal),
    options: {
      cwd,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      ...(config.claudePath ? { pathToClaudeCodeExecutable: config.claudePath } : {}),
    },
  });
  try {
    const [commands, agents] = await Promise.all([q.supportedCommands(), q.supportedAgents()]);
    // Servers appear in the list as they are found and stay "pending" while connecting.
    let servers: McpServerStatus[] = [];
    const started = Date.now();
    let settledOnce = false;
    while (Date.now() - started < MCP_WAIT_MS) {
      servers = await q.mcpServerStatus();
      // The list starts out empty even when servers are set up; still empty after a few seconds means there are none.
      const settled = servers.every((server) => server.status !== 'pending') && (servers.length > 0 || Date.now() - started > 3000);
      // Two settled answers in a row: nothing more is on its way.
      if (settled && settledOnce) break;
      settledOnce = settled;
      await sleep(700);
    }
    // The context breakdown says which slash commands are skills, and where each skill comes from.
    const usage = await q.getContextUsage({ detail: 'summary' });
    const skillInfo = new Map((usage.skills?.skillFrontmatter ?? []).map((skill) => [skill.name, skill]));
    const commandNamed = new Map(commands.map((command) => [command.name, command]));

    return {
      folder: null,
      measuredAt: Date.now(),
      mcpServers: servers
        .map((server) => ({
          name: server.name,
          status: server.status,
          ...(server.scope || server.source ? { scope: server.scope ?? server.source } : {}),
          ...(server.serverInfo?.version ? { version: server.serverInfo.version } : {}),
          ...(server.error ? { error: server.error } : {}),
          tools: (server.tools ?? []).map((tool) => ({
            name: tool.name,
            ...(tool.description ? { description: tool.description } : {}),
            ...(tool.annotations?.readOnly ? { readOnly: true } : {}),
            ...(tool.annotations?.destructive ? { destructive: true } : {}),
          })),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      // Every skill Claude Code loads. Most can also be run as a slash command, which is where their
      // description comes from; the rest are only for Claude to use, and are described from their file.
      skills: [...skillInfo.values()]
        .map((info) => {
          const command = commandNamed.get(info.name);
          return {
            name: info.name,
            description: command?.description || describedIn(info.path),
            source: info.source,
            ...(info.pluginName ? { plugin: info.pluginName } : {}),
            invocable: command !== undefined,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      agents: agents
        .map((agent) => ({ name: agent.name, description: agent.description, ...(agent.model ? { model: agent.model } : {}) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      commands: commands
        .filter((command) => !command.builtin && !skillInfo.has(command.name))
        .map((command) => ({
          name: command.name,
          description: command.description,
          ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  } finally {
    done.abort();
    q.close();
  }
}

/**
 * What Claude Code can use in a chat folder (under data/sessions or an added one), or at the top of data/sessions
 * when `folder` is empty. `fresh` asks again instead of using a recent answer.
 */
export async function capabilities(folder: string, fresh = false): Promise<Capabilities> {
  const cwd = folder ? await existingFolder(folder) : config.sessionsDir;
  const key = folder || '.';
  const kept = cache.get(key);
  if (!fresh && kept && (kept.at === undefined || Date.now() - kept.at < KEEP_MS)) return withTools(await kept, folder);
  const pending: Promise<Capabilities> & { at?: number } = measure(cwd);
  cache.set(key, pending);
  try {
    const answer = await pending;
    pending.at = Date.now();
    return withTools(answer, folder);
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

function withTools(answer: Capabilities, folder: string): Capabilities {
  return { ...answer, folder: folder || null, ...(knownTools ? { tools: knownTools } : {}) };
}
