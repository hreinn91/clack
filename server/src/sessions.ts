import { randomUUID } from 'node:crypto';
import { mkdir, realpath } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  archiveSession,
  deleteSession,
  getSessionInfo,
  getSessionMessages,
  listSessions,
  query,
  renameSession,
  unarchiveSession,
} from '@anthropic-ai/claude-agent-sdk';
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
  ContextDetail,
  ContextUsage,
  Draft,
  EffortLevel,
  Item,
  LogKind,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  ServerMessage,
  SessionEvent,
  SessionMeta,
  SessionState,
  SessionSummary,
  Stamp,
} from '../../shared/protocol.ts';
import { rememberTools } from './capabilities.ts';
import { config } from './config.ts';
import { ensureFolder, folderLabel, gitBranch, insideDir, insideSessions, isFolder } from './folders.ts';
import { log } from './log.ts';
import { defaultPrefs, forgetSession, movedFolder, prefsFor, saveMovedFolder, savePrefs } from './prefs.ts';
import { projectDirName, relocateTranscript } from './relocate.ts';
import type { Prefs } from './prefs.ts';
import { assistantItems, blocksOf, itemsFromHistory, modelOf, readEfforts, toolResultText } from './transcript.ts';
import { refreshUsageWith } from './usage.ts';

export type Listener = (msg: ServerMessage) => void;

/** Emits 'sessions_changed' whenever the session list may look different. */
export const bus = new EventEmitter();

const MODES: readonly PermissionMode[] = ['default', 'acceptEdits', 'plan', 'auto'];
const EFFORTS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPermissionMode(value: unknown): value is PermissionMode {
  return MODES.includes(value as PermissionMode);
}

export function isEffort(value: unknown): value is EffortLevel {
  return EFFORTS.includes(value as EffortLevel);
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

type ToolItem = Extract<Item, { kind: 'tool' }>;

/** Tool inputs and outputs can be whole files; the log keeps the start of them. */
function clip(text: string, max = 2000): string {
  return text.length > max ? `${text.slice(0, max)}… (${text.length - max} more characters)` : text;
}

type Pending = {
  request: PermissionRequest;
  suggestions: PermissionUpdate[] | undefined;
  finish: (result: PermissionResult) => void;
};

/**
 * One conversation. It holds the transcript the UI shows and, once the first
 * prompt arrives, a running Claude Code process driven through the Agent SDK.
 * Every change is mirrored to subscribers as an event, so a browser that
 * reconnects only needs a fresh snapshot to be back in sync.
 */
export class LiveSession {
  readonly sessionId: string;
  /** The folder Claude Code works in. Changes only through `move`. */
  cwd: string;
  items: Item[];
  drafts: Draft[] = [];
  state: SessionState = 'idle';
  /** Chats start in auto mode; Claude Code falls back to 'default' where auto is unavailable. */
  mode: PermissionMode = 'auto';
  /** Whether the person picked auto mode themselves, rather than starting in it. */
  private choseAuto = false;
  /** Chosen model and effort; null leaves the choice to Claude Code. */
  model: string | null;
  effort: EffortLevel | null;
  /** The model the running process reports, which is how "default" gets a name. */
  activeModel: string | undefined;
  title: string | undefined;
  /** How full the context window was when the last turn ended. */
  context: ContextUsage | undefined;
  lastActivity = Date.now();

  /** False until Claude Code has written this session's transcript, after which it must be resumed rather than created. */
  private onDisk: boolean;
  private q: Query | undefined;
  /** Settles when the running process has gone and its last messages are dealt with. */
  private pumping: Promise<void> | undefined;
  private input: InputQueue | undefined;
  private listeners = new Set<Listener>();
  private pending = new Map<string, Pending>();
  private tools = new Map<string, ToolItem>();
  private streamDrafts = new Map<number, string>();
  private interrupting = false;
  /** Replies added while no effort was chosen, by message uuid: what they ran at is looked up when the turn ends. */
  private unsigned = new Map<string, Item[]>();

  constructor(init: { sessionId: string; cwd: string; onDisk: boolean; prefs: Prefs; items?: Item[]; title?: string }) {
    this.sessionId = init.sessionId;
    this.cwd = init.cwd;
    this.onDisk = init.onDisk;
    this.model = init.prefs.model;
    this.effort = init.prefs.effort;
    this.title = init.title;
    this.items = init.items ?? [];
    for (const item of this.items) if (item.kind === 'tool') this.tools.set(item.id, item);
  }

  get hasProcess(): boolean {
    return this.q !== undefined;
  }

  get hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  get hasPending(): boolean {
    return this.pending.size > 0;
  }

  meta(): SessionMeta {
    return {
      sessionId: this.sessionId,
      cwd: this.cwd,
      folder: folderLabel(this.cwd),
      state: this.state,
      mode: this.mode,
      model: this.model,
      effort: this.effort,
      activeModel: this.activeModel,
      title: this.title,
      context: this.context,
      folderMissing: !isFolder(this.cwd),
      gitBranch: gitBranch(this.cwd),
    };
  }

  snapshot(): ServerMessage {
    return {
      t: 'snapshot',
      sessionId: this.sessionId,
      meta: this.meta(),
      items: this.items,
      drafts: this.drafts,
      pending: [...this.pending.values()].map((p) => p.request),
    };
  }

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
  }

  unsubscribe(listener: Listener): void {
    this.listeners.delete(listener);
  }

  // ---- actions from the UI -------------------------------------------------

  prompt(text: string): void {
    if (this.state === 'running') throw new Error('Claude is still working. Stop it first or wait for it to finish.');
    if (!isFolder(this.cwd)) {
      throw new Error(`This chat's folder, ${folderLabel(this.cwd)}, was deleted. Recreate it or pick another folder to continue.`);
    }
    const id = randomUUID();
    if (!this.title) {
      // A list of attached files at the end of the message is not what the chat is about.
      // (The format is described with the Upload type in the shared protocol.)
      const said = text.split('\n\nAttached files:\n')[0]!.trim() || text;
      this.title = said.length > 80 ? `${said.slice(0, 80)}…` : said;
    }
    this.addItem({ kind: 'user', id, text, ts: Date.now() });
    this.setState('running');
    this.start();
    this.input!.push({
      type: 'user',
      uuid: id,
      parent_tool_use_id: null,
      message: { role: 'user', content: text },
    });
    bus.emit('sessions_changed');
  }

  async interrupt(): Promise<void> {
    if (!this.q || this.state !== 'running') return;
    this.interrupting = true;
    await this.q.interrupt();
  }

  async setMode(mode: PermissionMode): Promise<void> {
    this.mode = mode;
    this.choseAuto = mode === 'auto';
    if (this.q) await this.q.setPermissionMode(mode);
    this.emitMeta();
  }

  /** Switches model and effort. Takes effect from the next message. */
  async configure(prefs: Prefs): Promise<void> {
    if (this.state === 'running') throw new Error('Wait for Claude to finish before changing the model or effort.');
    const modelChanged = prefs.model !== this.model;
    const effortChanged = prefs.effort !== this.effort;
    if (this.q) {
      if (modelChanged) await this.q.setModel(prefs.model ?? undefined);
      // null clears the override, which puts the session back on the model's default effort.
      if (effortChanged) await this.q.applyFlagSettings({ effortLevel: prefs.effort });
    }
    this.model = prefs.model;
    this.effort = prefs.effort;
    // The next reply says which model the new choice really is; until then nothing is known.
    if (modelChanged) this.activeModel = undefined;
    savePrefs(this.sessionId, prefs);
    this.log('notice', `Model set to ${prefs.model ?? 'default'}, effort ${prefs.effort ?? 'default'}`);
    this.emitMeta();
  }

  resolvePermission(id: string, decision: PermissionDecision, answers?: Record<string, string>): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    const { request, suggestions } = entry;
    const verdict = decision === 'deny' ? 'Denied' : decision === 'always' ? 'Always allowed' : 'Allowed';
    this.log('permission', `${verdict}: ${request.toolName} ${clip(JSON.stringify(request.input), 500)}`);
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

  /** Stops the Claude Code process. The transcript stays, and the next prompt resumes the session. */
  shutdown(): void {
    this.input?.close();
    this.q?.close();
  }

  /** Stops the process and waits until it has really gone, so its files can be touched. */
  private async settle(): Promise<void> {
    if (!this.q) return;
    this.shutdown();
    await this.pumping;
  }

  /** Gives the chat a title of the person's choosing. */
  async rename(title: string): Promise<void> {
    if (this.onDisk) await renameSession(this.sessionId, title);
    this.title = title;
    this.emitMeta();
    bus.emit('sessions_changed');
  }

  /**
   * Makes the chat work in another folder from the next message on. Nothing
   * in either folder is moved or copied: only where Claude Code runs changes.
   */
  async move(cwd: string): Promise<void> {
    if (this.state === 'running') throw new Error('Wait for Claude to finish before changing the folder.');
    if (cwd === this.cwd) return;
    await this.settle();
    if (this.onDisk) await relocateTranscript(this.sessionId, cwd);
    this.cwd = cwd;
    saveMovedFolder(this.sessionId, folderLabel(cwd));
    this.emitMeta();
    this.notice('info', `This chat now works in the folder ${folderLabel(cwd)}.`);
    bus.emit('sessions_changed');
  }

  /** Creates this chat's folder again, empty, after it was deleted. */
  async restoreFolder(): Promise<void> {
    if (isFolder(this.cwd)) return;
    if (!insideSessions(this.cwd)) throw new Error('That folder cannot be used.');
    await mkdir(this.cwd, { recursive: true });
    // A symlink planted along the way must not become a way out of data/sessions.
    if ((await realpath(this.cwd)) !== this.cwd) throw new Error('That folder cannot be used.');
    this.emitMeta();
    this.notice('info', `The folder ${folderLabel(this.cwd)} was created again. Files that were in it are not back.`);
    bus.emit('sessions_changed');
  }

  /** Ends the chat for good: stops its process and tells anyone looking at it. */
  async discard(): Promise<void> {
    await this.settle();
    for (const entry of [...this.pending.values()]) entry.finish({ behavior: 'deny', message: 'The chat was deleted.' });
    const gone: ServerMessage = { t: 'error', sessionId: this.sessionId, message: 'This chat was deleted.' };
    for (const listener of this.listeners) listener(gone);
    this.listeners.clear();
  }

  get savedOnDisk(): boolean {
    return this.onDisk;
  }

  // ---- the Claude Code process ----------------------------------------------

  private start(): void {
    if (this.q) return;
    const input = new InputQueue();
    const options: Options = {
      cwd: this.cwd,
      permissionMode: this.mode,
      includePartialMessages: true,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      canUseTool: this.canUseTool,
      hooks: { PreToolUse: [{ hooks: [this.autoFence] }] },
      ...(this.model ? { model: this.model } : {}),
      ...(this.effort ? { effort: this.effort } : {}),
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
      this.notice('error', err instanceof Error ? err.message : String(err));
    } finally {
      if (this.q === q) {
        this.q = undefined;
        this.input = undefined;
      }
      for (const entry of [...this.pending.values()]) {
        entry.finish({ behavior: 'deny', message: 'The session ended before this was answered.' });
      }
      this.clearDrafts();
      this.interrupting = false;
      this.setState('idle');
      bus.emit('sessions_changed');
    }
  }

  private handle(msg: SDKMessage): void {
    this.lastActivity = Date.now();
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          this.activeModel = msg.model;
          rememberTools(msg.tools);
          this.adoptMode(msg.permissionMode);
          this.emitMeta();
        } else if (msg.subtype === 'status') {
          if (isPermissionMode(msg.permissionMode) && msg.permissionMode !== this.mode) {
            this.adoptMode(msg.permissionMode);
            this.emitMeta();
          }
        } else if (msg.subtype === 'compact_boundary') {
          this.notice('info', 'Earlier conversation was compacted to free up context.');
        }
        break;

      case 'stream_event':
        if (msg.parent_tool_use_id === null) this.handleStream(msg.event);
        break;

      case 'assistant': {
        this.onDisk = true;
        this.setState('running');
        const parent = msg.parent_tool_use_id;
        if (!parent) {
          // Each reply names the model that wrote it, which keeps the header right after a switch.
          const model = modelOf(msg.message);
          if (model && model !== this.activeModel) {
            this.activeModel = model;
            this.emitMeta();
          }
          // Thinking can arrive with its text withheld: the draft has nothing to turn into.
          for (const block of blocksOf(msg.message.content)) {
            if (block.type === 'thinking' && !String(block.thinking ?? '').trim()) {
              const id = this.takeDraft('thinking');
              if (id) this.emit({ t: 'draft_end', id });
            }
          }
        }
        const stamp: Stamp = { ts: Date.now() };
        if (!parent) {
          stamp.model = modelOf(msg.message);
          if (this.effort) stamp.effort = this.effort;
        }
        const added = assistantItems(msg.uuid, msg.message.content, parent, stamp);
        if (!parent && !this.effort) this.unsigned.set(msg.uuid, [...(this.unsigned.get(msg.uuid) ?? []), ...added]);
        for (const item of added) this.addItem(item, parent ? undefined : this.takeDraft(item.kind));
        break;
      }

      case 'user':
        for (const block of blocksOf(msg.message.content)) {
          if (block.type !== 'tool_result') continue;
          const tool = this.tools.get(String(block.tool_use_id));
          if (!tool) continue;
          tool.result = { text: toolResultText(block.content), isError: block.is_error === true };
          this.log('tool_result', `${tool.name}: ${clip(tool.result.text)}`, tool.result.isError);
          this.emit({ t: 'tool_result', id: tool.id, ...tool.result });
        }
        break;

      case 'result':
        this.clearDrafts();
        if (this.interrupting) {
          this.notice('info', 'Stopped.');
        } else if (msg.subtype !== 'success') {
          this.notice('error', msg.errors.length ? msg.errors.join('\n') : `The turn ended early (${msg.subtype}).`);
        }
        this.interrupting = false;
        this.setState('idle');
        bus.emit('sessions_changed');
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
    if (!isFolder(this.cwd)) throw new Error(`This chat's folder, ${folderLabel(this.cwd)}, was deleted.`);
    this.lastActivity = Date.now();
    this.start();
    const usage = await this.q!.getContextUsage({ detail: 'full' });
    const home = homedir();
    const short = (path: string) =>
      insideDir(path, this.cwd)
        ? `./${path.slice(this.cwd.length + 1)}`
        : insideDir(path, home)
          ? `~/${path.slice(home.length + 1)}`
          : path;
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
    this.context = { tokens: detail.tokens, max: detail.max, percent: detail.percent };
    this.emitMeta();
    return detail;
  }

  /** After a turn: how full the context window is now, and how much of the plan's limits is used. */
  private async measure(): Promise<void> {
    const q = this.q;
    if (!q) return;
    try {
      const usage = await q.getContextUsage({ detail: 'summary' });
      this.context = { tokens: usage.totalTokens, max: usage.maxTokens, percent: Math.round(usage.percentage) };
      this.emitMeta();
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
    if (!changed) return;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private handleStream(event: Extract<SDKMessage, { type: 'stream_event' }>['event']): void {
    this.setState('running');
    if (event.type === 'message_start') {
      this.streamDrafts.clear();
    } else if (event.type === 'content_block_start') {
      const block = event.content_block;
      let draft: Draft | undefined;
      if (block.type === 'text') draft = { id: randomUUID(), kind: 'text', text: '' };
      else if (block.type === 'thinking') draft = { id: randomUUID(), kind: 'thinking', text: '' };
      else if (block.type === 'tool_use') draft = { id: randomUUID(), kind: 'tool', text: block.name };
      if (!draft) return;
      this.streamDrafts.set(event.index, draft.id);
      this.drafts.push(draft);
      this.emit({ t: 'draft', draft });
    } else if (event.type === 'content_block_delta') {
      const id = this.streamDrafts.get(event.index);
      const draft = id ? this.drafts.find((d) => d.id === id) : undefined;
      if (!draft) return;
      const text =
        event.delta.type === 'text_delta' ? event.delta.text : event.delta.type === 'thinking_delta' ? event.delta.thinking : '';
      if (!text) return;
      draft.text += text;
      this.emit({ t: 'draft_delta', id: draft.id, text });
    }
  }

  /**
   * The first path in a permission request that points outside this chat's
   * folder, if any. Claude Code only asks about paths beyond its working
   * directory, so refusing these keeps file access inside the folder.
   */
  private pathOutsideFolder(input: Record<string, unknown>, blockedPath: string | undefined): string | undefined {
    for (const value of [blockedPath, input.file_path, input.notebook_path, input.path]) {
      if (typeof value !== 'string' || !value) continue;
      if (value.startsWith('~') || !insideDir(resolve(this.cwd, value), this.cwd)) return value;
    }
    return undefined;
  }

  /** Takes the mode Claude Code reports, saying so when it would not run in auto mode. */
  private adoptMode(reported: unknown): void {
    if (!isPermissionMode(reported)) return;
    // Starting in auto mode and falling back is expected where it is unavailable; only a deliberate choice is worth a word.
    if (this.mode === 'auto' && reported !== 'auto' && this.choseAuto) {
      this.notice('info', 'Auto mode is not available for this account or model, so Claude will ask before changes instead.');
    }
    if (reported !== 'auto') this.choseAuto = false;
    this.mode = reported;
  }

  /**
   * Claude Code's own directory for this chat's folder: memory and saved tool
   * output live there, and Claude Code reaches them without asking.
   */
  private get ownClaudeDir(): string {
    const root = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    return join(root, 'projects', projectDirName(this.cwd));
  }

  /**
   * In auto mode a classifier approves most calls itself, so they never reach
   * `canUseTool` and its folder check. This hook applies the same check to
   * every file path a tool names before the classifier is asked. Shell
   * commands are not covered: the classifier is what judges those.
   */
  private autoFence: HookCallback = async (input) => {
    if (this.mode !== 'auto' || input.hook_event_name !== 'PreToolUse') return { continue: true };
    const args = (input.tool_input ?? {}) as Record<string, unknown>;
    const outside = this.pathOutsideFolder(args, undefined);
    if (!outside || (!outside.startsWith('~') && insideDir(resolve(this.cwd, outside), this.ownClaudeDir))) {
      return { continue: true };
    }
    this.log('permission', `Refused automatically: ${input.tool_name} wanted ${outside}, outside the chat's folder`, true);
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Access to ${outside} was refused: this chat can only work with files inside its own folder (${this.cwd}).`,
      },
    };
  };

  private canUseTool: CanUseTool = (toolName, input, opts) =>
    new Promise<PermissionResult>((resolve) => {
      const outside = this.pathOutsideFolder(input, opts.blockedPath);
      if (outside) {
        this.log('permission', `Refused automatically: ${toolName} wanted ${outside}, outside the chat's folder`, true);
        resolve({
          behavior: 'deny',
          message: `Access to ${outside} was refused: this chat can only work with files inside its own folder (${this.cwd}).`,
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
      };
      const onAbort = () => finish({ behavior: 'deny', message: 'Cancelled.' });
      const finish = (result: PermissionResult) => {
        if (!this.pending.delete(id)) return;
        opts.signal.removeEventListener('abort', onAbort);
        this.emit({ t: 'permission_done', id });
        resolve(result);
      };
      this.pending.set(id, { request, suggestions: opts.suggestions, finish });
      opts.signal.addEventListener('abort', onAbort, { once: true });
      this.emit({ t: 'permission', request });
    });

  // ---- transcript bookkeeping -----------------------------------------------

  private log(kind: LogKind, text: string, error = false): void {
    log({
      sessionId: this.sessionId,
      folder: folderLabel(this.cwd),
      kind,
      text,
      ...(kind === 'response' && this.activeModel ? { model: this.activeModel } : {}),
      ...(error ? { error: true } : {}),
    });
  }

  private emit(event: SessionEvent): void {
    const msg: ServerMessage = { t: 'event', sessionId: this.sessionId, event };
    for (const listener of this.listeners) listener(msg);
  }

  private emitMeta(): void {
    this.emit({ t: 'meta', meta: this.meta() });
  }

  private setState(state: SessionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emitMeta();
  }

  private addItem(item: Item, replaces?: string): void {
    this.items.push(item);
    if (item.kind === 'tool') this.tools.set(item.id, item);
    // Everything added here is new activity; history loaded from disk never passes through.
    if (item.kind === 'user') this.log('prompt', item.text);
    else if (item.kind === 'text') this.log('response', item.text);
    else if (item.kind === 'tool') this.log('tool', `${item.name} ${clip(JSON.stringify(item.input))}`);
    else if (item.kind === 'notice') this.log('notice', item.text, item.level === 'error');
    this.emit({ t: 'item', item, ...(replaces ? { replaces } : {}) });
  }

  private notice(level: 'info' | 'error', text: string): void {
    this.addItem({ kind: 'notice', id: randomUUID(), level, text, ts: Date.now() });
  }

  /** Removes and returns the oldest draft of a kind, once its finished content has arrived. */
  private takeDraft(kind: Item['kind']): string | undefined {
    const index = this.drafts.findIndex((d) => d.kind === kind);
    if (index === -1) return undefined;
    return this.drafts.splice(index, 1)[0]!.id;
  }

  private clearDrafts(): void {
    this.streamDrafts.clear();
    if (!this.drafts.length) return;
    this.drafts = [];
    this.emit({ t: 'drafts_clear' });
  }
}

// ---- registry ---------------------------------------------------------------

const live = new Map<string, LiveSession>();
const loading = new Map<string, Promise<LiveSession>>();

export function createSession(cwd: string): LiveSession {
  const session = new LiveSession({ sessionId: randomUUID(), cwd, onDisk: false, prefs: defaultPrefs() });
  live.set(session.sessionId, session);
  return session;
}

/** Returns the session if it is already in memory, otherwise loads its transcript from disk. */
export function openSession(sessionId: string): Promise<LiveSession> {
  if (!UUID.test(sessionId)) return Promise.reject(new Error('Invalid session id'));
  const existing = live.get(sessionId);
  if (existing) return Promise.resolve(existing);
  let pending = loading.get(sessionId);
  if (!pending) {
    pending = loadFromDisk(sessionId).finally(() => loading.delete(sessionId));
    loading.set(sessionId, pending);
  }
  return pending;
}

async function loadFromDisk(sessionId: string): Promise<LiveSession> {
  const info = await getSessionInfo(sessionId);
  // Sessions from anywhere else on this computer are treated as if they did not exist.
  if (!info?.cwd || !insideSessions(info.cwd)) throw new Error('Session not found');
  const [messages, efforts] = await Promise.all([getSessionMessages(sessionId), readEfforts(sessionId)]);
  const session = new LiveSession({
    sessionId,
    cwd: currentCwd(sessionId, info.cwd),
    onDisk: true,
    prefs: prefsFor(sessionId),
    items: itemsFromHistory(messages, efforts),
    title: info.customTitle || info.summary || info.firstPrompt,
  });
  live.set(sessionId, session);
  return session;
}

/**
 * Where a saved chat works. For a chat that was moved, clack's own record
 * wins over what the transcript says, as long as that folder still exists
 * under data/sessions.
 */
function currentCwd(sessionId: string, recorded: string): string {
  const moved = movedFolder(sessionId);
  if (!moved) return recorded;
  const cwd = resolve(config.sessionsDir, moved);
  return insideSessions(cwd) ? cwd : recorded;
}

/** Trims a title someone typed to something that fits on a line. */
function cleanTitle(title: unknown): string {
  const clean = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (!clean) throw new Error('A chat needs a name.');
  return clean;
}

export async function renameChat(sessionId: string, title: unknown): Promise<void> {
  await (await openSession(sessionId)).rename(cleanTitle(title));
}

/** Makes a chat work in a folder under data/sessions, creating the folder if the name is new. */
export async function moveChat(sessionId: string, folder: unknown): Promise<void> {
  const session = await openSession(sessionId);
  await session.move(await ensureFolder(folder, true));
}

/** What fills a chat's context window right now. */
export async function contextDetail(sessionId: string): Promise<ContextDetail> {
  return (await openSession(sessionId)).contextDetail();
}

/** Creates a chat's deleted folder again, so the chat can carry on. */
export async function restoreFolder(sessionId: string): Promise<void> {
  await (await openSession(sessionId)).restoreFolder();
}

/** Puts a chat away, or takes it back out. Its conversation and files are untouched either way. */
export async function setArchived(sessionId: string, archived: boolean): Promise<void> {
  const session = await openSession(sessionId);
  if (!session.savedOnDisk) throw new Error('This chat has nothing saved yet. Delete it instead.');
  await (archived ? archiveSession(sessionId) : unarchiveSession(sessionId));
  bus.emit('sessions_changed');
}

/** Deletes a chat's conversation for good. The files in its folder stay. */
export async function deleteChat(sessionId: string): Promise<void> {
  const session = await openSession(sessionId);
  await session.discard();
  live.delete(sessionId);
  if (session.savedOnDisk) await deleteSession(sessionId);
  forgetSession(sessionId);
  bus.emit('sessions_changed');
}

export async function listSummaries(): Promise<SessionSummary[]> {
  // Claude Code keeps every session on this computer in one place; only the
  // ones that ran inside data/sessions belong to clack.
  const infos = await listSessions();
  const seen = new Set<string>();
  const summaries: SessionSummary[] = [];
  for (const info of infos) {
    if (!info.cwd || !insideSessions(info.cwd)) continue;
    seen.add(info.sessionId);
    const open = live.get(info.sessionId);
    const cwd = open?.cwd ?? currentCwd(info.sessionId, info.cwd);
    summaries.push({
      sessionId: info.sessionId,
      title: info.customTitle || info.summary || info.firstPrompt || 'Untitled',
      folder: folderLabel(cwd),
      missing: !isFolder(cwd),
      gitBranch: info.gitBranch,
      lastModified: info.lastModified,
      running: open?.state === 'running',
      archived: info.archived === true,
    });
  }
  // A brand-new chat is not on disk until Claude Code has answered once.
  for (const session of live.values()) {
    if (seen.has(session.sessionId) || !session.items.length) continue;
    summaries.push({
      sessionId: session.sessionId,
      title: session.title ?? 'New chat',
      folder: folderLabel(session.cwd),
      lastModified: session.lastActivity,
      running: session.state === 'running',
      archived: false,
      missing: !isFolder(session.cwd),
    });
  }
  return summaries.sort((a, b) => b.lastModified - a.lastModified).slice(0, 200);
}

/** Frees idle Claude Code processes and forgets sessions nobody is looking at. */
function reap(): void {
  const now = Date.now();
  for (const session of live.values()) {
    if (session.state === 'running' || session.hasPending) continue;
    if (now - session.lastActivity < config.idleMs) continue;
    if (session.hasProcess) session.shutdown();
    if (!session.hasListeners) live.delete(session.sessionId);
  }
}

setInterval(reap, 60_000).unref();

export function shutdownAll(): void {
  for (const session of live.values()) session.shutdown();
}
