import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { getSessionInfo, getSessionMessages, listSessions, query } from '@anthropic-ai/claude-agent-sdk';
import type {
  CanUseTool,
  Options,
  PermissionResult,
  PermissionUpdate,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type {
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
} from '../../shared/protocol.ts';
import { config } from './config.ts';
import { folderLabel, insideDir, insideSessions } from './folders.ts';
import { log } from './log.ts';
import { defaultPrefs, prefsFor, savePrefs } from './prefs.ts';
import type { Prefs } from './prefs.ts';
import { assistantItems, blocksOf, itemsFromHistory, toolResultText } from './transcript.ts';

export type Listener = (msg: ServerMessage) => void;

/** Emits 'sessions_changed' whenever the session list may look different. */
export const bus = new EventEmitter();

const MODES: readonly PermissionMode[] = ['default', 'acceptEdits', 'plan'];
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
  readonly cwd: string;
  items: Item[];
  drafts: Draft[] = [];
  state: SessionState = 'idle';
  mode: PermissionMode = 'default';
  /** Chosen model and effort; null leaves the choice to Claude Code. */
  model: string | null;
  effort: EffortLevel | null;
  /** The model the running process reports, which is how "default" gets a name. */
  activeModel: string | undefined;
  title: string | undefined;
  lastActivity = Date.now();

  /** False until Claude Code has written this session's transcript, after which it must be resumed rather than created. */
  private onDisk: boolean;
  private q: Query | undefined;
  private input: InputQueue | undefined;
  private listeners = new Set<Listener>();
  private pending = new Map<string, Pending>();
  private tools = new Map<string, ToolItem>();
  private streamDrafts = new Map<number, string>();
  private interrupting = false;

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
    const id = randomUUID();
    if (!this.title) this.title = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    this.addItem({ kind: 'user', id, text });
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
    if (modelChanged && !this.q) this.activeModel = undefined;
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
      ...(this.model ? { model: this.model } : {}),
      ...(this.effort ? { effort: this.effort } : {}),
      ...(this.onDisk ? { resume: this.sessionId } : { sessionId: this.sessionId }),
      ...(config.claudePath ? { pathToClaudeCodeExecutable: config.claudePath } : {}),
    };
    const q = query({ prompt: input, options });
    this.input = input;
    this.q = q;
    void this.pump(q);
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
          if (isPermissionMode(msg.permissionMode)) this.mode = msg.permissionMode;
          this.emitMeta();
        } else if (msg.subtype === 'status') {
          if (isPermissionMode(msg.permissionMode) && msg.permissionMode !== this.mode) {
            this.mode = msg.permissionMode;
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
          const model = msg.message.model;
          if (model && !model.startsWith('<') && model !== this.activeModel) {
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
        for (const item of assistantItems(msg.uuid, msg.message.content, parent)) {
          this.addItem(item, parent ? undefined : this.takeDraft(item.kind));
        }
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
        break;
    }
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
    this.addItem({ kind: 'notice', id: randomUUID(), level, text });
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
  const messages = await getSessionMessages(sessionId);
  const session = new LiveSession({
    sessionId,
    cwd: info.cwd,
    onDisk: true,
    prefs: prefsFor(sessionId),
    items: itemsFromHistory(messages),
    title: info.customTitle || info.summary || info.firstPrompt,
  });
  live.set(sessionId, session);
  return session;
}

export async function listSummaries(): Promise<SessionSummary[]> {
  // Claude Code keeps every session on this computer in one place; only the
  // ones that ran inside data/sessions belong to clack.
  const infos = await listSessions();
  const seen = new Set<string>();
  const summaries: SessionSummary[] = [];
  for (const info of infos) {
    if (info.archived || !info.cwd || !insideSessions(info.cwd)) continue;
    seen.add(info.sessionId);
    summaries.push({
      sessionId: info.sessionId,
      title: info.customTitle || info.summary || info.firstPrompt || 'Untitled',
      folder: folderLabel(info.cwd),
      gitBranch: info.gitBranch,
      lastModified: info.lastModified,
      running: live.get(info.sessionId)?.state === 'running',
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
