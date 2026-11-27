import { ClaudePlans } from './plans.ts';
import { readPlans } from '../../plans.ts';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { CLACK_TOOL_NAMES, CLACK_TOOLS, runClackTool } from '../clackTools.ts';
import type {
  CanUseTool,
  HookCallback,
  Options,
  PermissionResult,
  PermissionUpdate,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type {
  BackgroundTask,
  ContextDetail,
  EffortLevel,
  Item,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  Stamp,
} from '../../../../shared/protocol.ts';
import { config } from '../../config.ts';
import { folderLabel, insideDir, isFolder } from '../../folders.ts';
import type { AgentRun, RunHost } from '../types.ts';
import { rememberTools } from './capabilities.ts';
import { projectDirName, relocateTranscript } from './relocate.ts';
import { TaskBoard } from './tasks.ts';
import { agentReport, assistantItems, blocksOf, modelOf, readEfforts, toolResultText } from './transcript.ts';
import { refreshUsageWith } from './usage.ts';

const MODES: readonly PermissionMode[] = ['default', 'acceptEdits', 'plan', 'auto'];

function isPermissionMode(value: unknown): value is PermissionMode {
  return MODES.includes(value as PermissionMode);
}

/** The prompt stream handed to the SDK: stays open so a session can take many turns. */
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private buffer: SDKUserMessage[] = [];
  private wake: (() => void) | null = null;
  private closed = false;

  push(message: SDKUserMessage): void {
    this.buffer.push(message);
    this.wake?.();
  }

  close(): void {
    this.closed = true;
    this.wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
    while (true) {
      while (this.buffer.length) yield this.buffer.shift()!;
      if (this.closed) return;
      await new Promise<void>((resolve) => (this.wake = resolve));
      this.wake = null;
    }
  }
}

type Pending = {
  request: PermissionRequest;
  suggestions: PermissionUpdate[] | undefined;
  finish: (result: PermissionResult) => void;
};

/**
 * A chat's Claude Code process, driven through the Agent SDK. It starts on
 * the first message, stays for later turns, and is stopped when the chat goes
 * idle; the next message resumes the same conversation.
 */
export class ClaudeRun implements AgentRun {
  readonly provider = 'claude' as const;
  readonly sessionId: string;
  /** False until Claude Code has written the transcript, after which it must be resumed rather than created. */
  private onDisk: boolean;
  private q: Query | undefined;
  /** Settles when the running process has gone and its last messages are dealt with. */
  private pumping: Promise<void> | undefined;
  private input: InputQueue | undefined;
  private pending = new Map<string, Pending>();
  private streamDrafts = new Map<number, string>();
  private interrupting = false;
  /** Whether the person picked auto mode themselves, rather than starting in it. */
  private choseAuto = false;
  /** Replies added while no effort was chosen, by message uuid: what they ran at is looked up when the turn ends. */
  private unsigned = new Map<string, Item[]>();
  private plans = new ClaudePlans();
  private approvalPlan: { toolId: string; planId: string } | undefined;
  private board = new TaskBoard();
  private host: RunHost;

  constructor(host: RunHost, sessionId: string, saved: boolean) {
    this.host = host;
    this.sessionId = sessionId;
    this.onDisk = saved;
    if (saved) {
      for (const plan of Object.values(readPlans('claude', sessionId))) this.plans.recall(plan.steps);
    }
  }

  get alive(): boolean {
    return this.q !== undefined;
  }

  get saved(): boolean {
    return this.onDisk;
  }

  get runningTasks(): number {
    return this.board.running;
  }

  tasks(): BackgroundTask[] {
    return this.board.list();
  }

  async prompt(id: string, text: string): Promise<void> {
    this.plans.start(id);
    this.approvalPlan = undefined;
    this.start();
    this.input!.push({ type: 'user', uuid: id as SDKUserMessage['uuid'] & string, parent_tool_use_id: null, message: { role: 'user', content: text } });
  }

  async interrupt(): Promise<void> {
    if (!this.q) return;
    this.interrupting = true;
    await this.q.interrupt();
  }

  async setMode(mode: PermissionMode): Promise<void> {
    this.choseAuto = mode === 'auto';
    if (this.q) await this.q.setPermissionMode(mode);
  }

  async configure(model: string | null, effort: EffortLevel | null): Promise<void> {
    if (!this.q) return;
    if (model !== this.host.model) await this.q.setModel(model ?? undefined);
    // null clears the override, which puts the session back on the model's default effort.
    if (effort !== this.host.effort) await this.q.applyFlagSettings({ effortLevel: (effort ?? null) as never });
  }

  answer(id: string, decision: PermissionDecision, answers?: Record<string, string>): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    const { request, suggestions } = entry;
    if (decision === 'deny') {
      entry.finish({ behavior: 'deny', message: 'The user declined this action.' });
      return;
    }
    const updatedInput = answers ? { ...request.input, answers } : request.input;
    entry.finish({
      behavior: 'allow',
      updatedInput,
      ...(decision === 'always' && request.canAlways && suggestions ? { updatedPermissions: suggestions } : {}),
    });
  }

  async stopTask(taskId: string): Promise<void> {
    if (!this.q) throw new Error('Nothing is running in this chat.');
    await this.q.stopTask(taskId);
  }

  shutdown(): void {
    this.input?.close();
    this.q?.close();
  }

  async settle(): Promise<void> {
    if (!this.q) return;
    this.shutdown();
    await this.pumping;
  }

  async relocate(cwd: string): Promise<void> {
    if (this.onDisk) await relocateTranscript(this.sessionId, cwd);
  }

  // ---- the Claude Code process ----------------------------------------------

  private start(): void {
    if (this.q) return;
    const input = new InputQueue();
    const host = this.host;
    const options: Options = {
      cwd: host.cwd,
      permissionMode: host.mode,
      includePartialMessages: true,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      // clack's own skills (diagrams), from its folder: nothing is put in ~/.claude or the chat's folder.
      plugins: [{ type: 'local', path: config.pluginDir }],
      // Clack's own tools (artifacts), which only save into data/artifacts: they need no permission card.
      mcpServers: { clack: clackTools(host) },
      allowedTools: CLACK_TOOL_NAMES.map((name) => `mcp__clack__${name}`),
      canUseTool: this.canUseTool,
      hooks: { PreToolUse: [{ hooks: [this.autoFence] }] },
      ...(host.model ? { model: host.model } : {}),
      ...(host.effort ? { effort: host.effort as Options['effort'] } : {}),
      ...(this.onDisk ? { resume: this.sessionId } : { sessionId: this.sessionId }),
      ...(config.claudePath ? { pathToClaudeCodeExecutable: config.claudePath } : {}),
    };
    const q = query({ prompt: input, options });
    this.input = input;
    this.q = q;
    this.pumping = this.pump(q);
  }

  private async pump(q: Query): Promise<void> {
    try {
      for await (const message of q) this.handle(message);
    } catch (err) {
      this.host.notice('error', err instanceof Error ? err.message : String(err));
    } finally {
      if (this.q === q) {
        this.q = undefined;
        this.input = undefined;
      }
      for (const entry of [...this.pending.values()]) {
        entry.finish({ behavior: 'deny', message: 'The session ended before this was answered.' });
      }
      this.streamDrafts.clear();
      this.interrupting = false;
      this.board.endAll();
      this.host.processEnded();
    }
  }

  private handle(msg: SDKMessage): void {
    const host = this.host;
    if (this.board.handle(msg)) host.tasksChanged();
    // A background agent being done is said in the conversation too, as it is when the chat is loaded again later.
    if (msg.type === 'system' && msg.subtype === 'task_notification') {
      const agent = this.board.agent(msg.task_id);
      if (agent) host.notice('info', agentReport(agent.agentType, msg.status));
    }
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          host.setActiveModel(msg.model);
          rememberTools(msg.tools);
          this.adoptMode(msg.permissionMode);
        } else if (msg.subtype === 'status') {
          if (isPermissionMode(msg.permissionMode) && msg.permissionMode !== host.mode) this.adoptMode(msg.permissionMode);
        } else if (msg.subtype === 'compact_boundary') {
          host.notice('info', 'Earlier conversation was compacted to free up context.');
        }
        break;

      case 'stream_event':
        if (msg.parent_tool_use_id === null) this.handleStream(msg.event);
        break;

      case 'assistant': {
        host.saved();
        this.onDisk = true;
        const parent = msg.parent_tool_use_id;
        // An agent working in the background keeps talking after the turn has ended; only the main
        // conversation means Claude is working on the chat.
        if (!parent) {
          host.running();
          // Each reply names the model that wrote it, which keeps the header right after a switch.
          host.setActiveModel(modelOf(msg.message));
          // Thinking can arrive with its text withheld: the draft has nothing to turn into.
          for (const block of blocksOf(msg.message.content)) {
            if (block.type === 'thinking' && !String(block.thinking ?? '').trim()) {
              const id = host.takeDraft('thinking');
              if (id) host.endDraft(id);
            }
          }
        }
        const stamp: Stamp = { ts: Date.now() };
        if (!parent) {
          stamp.model = modelOf(msg.message);
          if (host.effort) stamp.effort = host.effort;
        }
        const added = assistantItems(msg.uuid, msg.message.content, parent, stamp);
        if (!parent && !host.effort) this.unsigned.set(msg.uuid, [...(this.unsigned.get(msg.uuid) ?? []), ...added]);
        for (const item of added) {
          if (item.kind === 'tool' && item.id === this.approvalPlan?.toolId) item.planId = this.approvalPlan.planId;
          host.addItem(item, parent ? undefined : host.takeDraft(item.kind));
        }
        break;
      }

      case 'user':
        for (const block of blocksOf(msg.message.content)) {
          if (block.type !== 'tool_result') continue;
          const id = String(block.tool_use_id);
          host.toolResult(id, toolResultText(block.content), block.is_error === true);
          const tool = host.tool(id);
          if (tool && this.plans.turnId) {
            const patch = this.plans.result(tool, msg.tool_use_result);
            if (patch) {
              const plan = host.updatePlan(this.plans.turnId, patch, { model: tool.model, effort: tool.effort, ts: tool.ts });
              host.updateItem({ ...tool, planId: plan.id });
            }
          }
        }
        break;

      case 'result':
        this.streamDrafts.clear();
        host.clearDrafts();
        if (this.interrupting) {
          host.notice('info', 'Stopped.');
        } else if (msg.subtype !== 'success') {
          host.notice('error', msg.errors.length ? msg.errors.join('\n') : `The turn ended early (${msg.subtype}).`);
        }
        this.interrupting = false;
        host.turnEnded();
        void this.signReplies();
        void this.measure();
        break;

      case 'rate_limit_event':
        // The plan's limits moved: read them again while a process is at hand.
        if (this.q) void refreshUsageWith(this.q);
        break;
    }
  }

  /**
   * The full breakdown of what is in the context window, as /context shows it.
   * A chat without a running process gets one: Claude Code has to be running
   * to count. It then stays until it has been idle for a while, like after a turn.
   */
  async contextDetail(): Promise<ContextDetail> {
    const cwd = this.host.cwd;
    if (!isFolder(cwd)) throw new Error(`This chat's folder, ${folderLabel(cwd)}, was deleted.`);
    this.start();
    const usage = await this.q!.getContextUsage({ detail: 'full' });
    const home = homedir();
    const short = (path: string) =>
      insideDir(path, cwd) ? `./${path.slice(cwd.length + 1)}` : insideDir(path, home) ? `~/${path.slice(home.length + 1)}` : path;
    const servers = new Map<string, { name: string; tools: number; tokens: number }>();
    for (const tool of usage.mcpTools) {
      const server = servers.get(tool.serverName) ?? { name: tool.serverName, tools: 0, tokens: 0 };
      server.tools++;
      server.tokens += tool.tokens;
      servers.set(tool.serverName, server);
    }
    // The conversation's own parts. Claude Code's "attachments" figure also counts things the other
    // categories already hold (a snapshot of the system prompt, the skills list), so instead the rest
    // of the Messages row is shown as one part, and the parts add up to that row.
    const m = usage.messageBreakdown;
    const inMessages = usage.categories.find((row) => row.id === 'messages')?.tokens ?? 0;
    const conversation = m
      ? [
          { label: 'Your messages', tokens: m.userMessageTokens },
          { label: "Claude's replies", tokens: m.assistantMessageTokens },
          { label: 'Tool calls', tokens: m.toolCallTokens },
          { label: 'Tool results', tokens: m.toolResultTokens },
        ]
      : [];
    const said = conversation.reduce((sum, row) => sum + row.tokens, 0);
    if (m && inMessages > said) conversation.push({ label: 'Added by Claude Code', tokens: inMessages - said });
    const detail: ContextDetail = {
      provider: 'claude',
      model: usage.model,
      tokens: usage.totalTokens,
      max: usage.maxTokens,
      percent: Math.round(usage.percentage),
      measuredAt: Date.now(),
      ...(usage.isAutoCompactEnabled && usage.autoCompactThreshold ? { autoCompactAt: usage.autoCompactThreshold } : {}),
      categories: usage.categories
        .filter((row) => row.tokens > 0)
        .map((row) => ({ id: row.id ?? 'other', name: row.name, tokens: row.tokens, kind: row.kind })),
      messages: conversation.filter((row) => row.tokens > 0),
      memoryFiles: usage.memoryFiles.map((file) => ({ path: short(file.path), type: file.type, tokens: file.tokens })),
      mcpServers: [...servers.values()].sort((a, b) => b.tokens - a.tokens),
      ...(usage.skills?.tokens ? { skills: { included: usage.skills.includedSkills, total: usage.skills.totalSkills, tokens: usage.skills.tokens } } : {}),
      agents: usage.agents.map((agent) => ({ name: agent.agentType, tokens: agent.tokens })).sort((a, b) => b.tokens - a.tokens),
    };
    // The ring by the send button shows the same figure, so it is brought up to date too.
    this.host.setContext({ tokens: detail.tokens, max: detail.max, percent: detail.percent });
    return detail;
  }

  /** After a turn: how full the context window is now, and how much of the plan's limits is used. */
  private async measure(): Promise<void> {
    const q = this.q;
    if (!q) return;
    try {
      const usage = await q.getContextUsage({ detail: 'summary' });
      this.host.setContext({ tokens: usage.totalTokens, max: usage.maxTokens, percent: Math.round(usage.percentage) });
    } catch {
      // Nothing to show for this turn; the next one tries again.
    }
    await refreshUsageWith(q);
  }

  /**
   * With "default effort" only Claude Code knows what a reply ran at, and it
   * says so in the transcript file rather than on the reply. Once a turn is
   * over the file is read and the replies from it are signed.
   */
  private async signReplies(): Promise<void> {
    if (!this.unsigned.size) return;
    const waiting = this.unsigned;
    this.unsigned = new Map();
    const efforts = await readEfforts(this.sessionId);
    let changed = false;
    for (const [uuid, items] of waiting) {
      const effort = efforts.get(uuid);
      if (!effort) continue;
      for (const item of items) item.effort = effort;
      changed = true;
    }
    if (changed) this.host.resnapshot();
  }

  private handleStream(event: Extract<SDKMessage, { type: 'stream_event' }>['event']): void {
    this.host.running();
    if (event.type === 'message_start') {
      this.streamDrafts.clear();
    } else if (event.type === 'content_block_start') {
      const block = event.content_block;
      let id: string | undefined;
      if (block.type === 'text') id = this.host.startDraft('text', '');
      else if (block.type === 'thinking') id = this.host.startDraft('thinking', '');
      else if (block.type === 'tool_use') id = this.host.startDraft('tool', block.name);
      if (id) this.streamDrafts.set(event.index, id);
    } else if (event.type === 'content_block_delta') {
      const id = this.streamDrafts.get(event.index);
      if (!id) return;
      const text =
        event.delta.type === 'text_delta' ? event.delta.text : event.delta.type === 'thinking_delta' ? event.delta.thinking : '';
      if (text) this.host.appendDraft(id, text);
    }
  }

  /**
   * The first path in a permission request that points outside this chat's
   * folder, if any. Claude Code only asks about paths beyond its working
   * directory, so refusing these keeps file access inside the folder.
   */
  private pathOutsideFolder(input: Record<string, unknown>, blockedPath: string | undefined): string | undefined {
    const cwd = this.host.cwd;
    for (const value of [blockedPath, input.file_path, input.notebook_path, input.path]) {
      if (typeof value !== 'string' || !value) continue;
      if (value.startsWith('~') || !insideDir(resolve(cwd, value), cwd)) return value;
    }
    return undefined;
  }

  /** Takes the mode Claude Code reports, saying so when it would not run in auto mode. */
  private adoptMode(reported: unknown): void {
    if (!isPermissionMode(reported)) return;
    // Starting in auto mode and falling back is expected where it is unavailable; only a deliberate choice is worth a word.
    const note =
      this.host.mode === 'auto' && reported !== 'auto' && this.choseAuto
        ? 'Auto mode is not available for this account or model, so Claude will ask before changes instead.'
        : undefined;
    if (reported !== 'auto') this.choseAuto = false;
    this.host.adoptMode(reported, note);
  }

  /**
   * Claude Code's own directory for this chat's folder: memory and saved tool
   * output live there, and Claude Code reaches them without asking.
   */
  private get ownClaudeDir(): string {
    const root = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    return join(root, 'projects', projectDirName(this.host.cwd));
  }

  /**
   * In auto mode a classifier approves most calls itself, so they never reach
   * `canUseTool` and its folder check. This hook applies the same check to
   * every file path a tool names before the classifier is asked. Shell
   * commands are not covered: the classifier is what judges those.
   */
  private autoFence: HookCallback = async (input) => {
    if (this.host.mode !== 'auto' || input.hook_event_name !== 'PreToolUse') return { continue: true };
    const args = (input.tool_input ?? {}) as Record<string, unknown>;
    const outside = this.pathOutsideFolder(args, undefined);
    const cwd = this.host.cwd;
    if (!outside || (!outside.startsWith('~') && insideDir(resolve(cwd, outside), this.ownClaudeDir))) {
      return { continue: true };
    }
    this.host.log('permission', `Refused automatically: ${input.tool_name} wanted ${outside}, outside the chat's folder`, true);
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Access to ${outside} was refused: this chat can only work with files inside its own folder (${cwd}).`,
      },
    };
  };

  private canUseTool: CanUseTool = (toolName, input, opts) =>
    new Promise<PermissionResult>((resolve) => {
      const outside = this.pathOutsideFolder(input, opts.blockedPath);
      if (outside) {
        this.host.log('permission', `Refused automatically: ${toolName} wanted ${outside}, outside the chat's folder`, true);
        resolve({
          behavior: 'deny',
          message: `Access to ${outside} was refused: this chat can only work with files inside its own folder (${this.host.cwd}).`,
        });
        return;
      }
      const id = randomUUID();
      const request: PermissionRequest = {
        id,
        toolName,
        input,
        title: opts.title,
        description: opts.description,
        reason: opts.decisionReason,
        canAlways: !!opts.suggestions?.length && !opts.suppressAlwaysAllowRule,
        alwaysLabel: 'Always allow',
      };
      if (toolName === 'ExitPlanMode' && !opts.agentID && this.plans.turnId) {
        const tool = this.host.tool(opts.toolUseID);
        const markdown = input.plan;
        if (typeof markdown === 'string' && markdown.trim()) {
          const plan = this.host.updatePlan(this.plans.turnId, { markdown });
          request.planId = plan.id;
          this.approvalPlan = { toolId: opts.toolUseID, planId: plan.id };
          if (tool) this.host.updateItem({ ...tool, planId: plan.id });
        }
      }
      const onAbort = () => finish({ behavior: 'deny', message: 'Cancelled.' });
      const finish = (result: PermissionResult) => {
        if (!this.pending.delete(id)) return;
        opts.signal.removeEventListener('abort', onAbort);
        this.host.answered(id);
        resolve(result);
      };
      this.pending.set(id, { request, suggestions: opts.suggestions, finish });
      opts.signal.addEventListener('abort', onAbort, { once: true });
      this.host.ask(request);
    });
}

/** Clack's tools for one chat, as an MCP server inside this process. They read the chat's folder when called, so a move is followed. */
function clackTools(host: RunHost) {
  const describe = (name: string) => CLACK_TOOLS.find((t) => t.name === name)!.description;
  const run = (name: string) => async (args: Record<string, unknown>) => {
    try {
      return { content: [{ type: 'text' as const, text: await runClackTool(host.chatId, host.cwd, name, args) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }], isError: true };
    }
  };
  return createSdkMcpServer({
    name: 'clack',
    version: '1.0.0',
    tools: [
      tool(
        'update_steps',
        describe('update_steps'),
        { steps: z.array(z.object({ step: z.string(), status: z.enum(['pending', 'in_progress', 'completed']) })) },
        run('update_steps'),
      ),
      tool(
        'create_artifact',
        describe('create_artifact'),
        {
          title: z.string(),
          type: z.enum(['html', 'svg', 'markdown', 'mermaid', 'code', 'file']),
          content: z.string().optional(),
          language: z.string().optional(),
          path: z.string().optional(),
        },
        run('create_artifact'),
      ),
      tool(
        'update_artifact',
        describe('update_artifact'),
        { id: z.string(), content: z.string().optional(), path: z.string().optional(), title: z.string().optional(), note: z.string().optional() },
        run('update_artifact'),
      ),
      tool('list_artifacts', describe('list_artifacts'), {}, run('list_artifacts')),
      tool('read_artifact', describe('read_artifact'), { id: z.string(), version: z.number().optional() }, run('read_artifact')),
    ],
  });
}
