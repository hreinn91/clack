import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import type {
  ContextDetail,
  ContextUsage,
  Draft,
  EffortLevel,
  GitDiff,
  GitStatus,
  GitSummary,
  Item,
  LogKind,
  PlanContent,
  PlanItem,
  Stamp,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  Provider,
  ServerMessage,
  SessionEvent,
  SessionMeta,
  SessionState,
  SessionSummary,
} from '../../shared/protocol.ts';
import { buildHandover, stripHandover, withHandover } from './agents/handover.ts';
import { backend, backends } from './agents/registry.ts';
import type { AgentRun, RunHost, StoredSession, ToolItem } from './agents/types.ts';
import { allRecords, chatOf, forgetChat, isEarlierSegment, noteChat, recordOf, saveSegments, segmentsOf } from './chats.ts';
import type { Segment } from './chats.ts';
import { planId } from './agents/types.ts';
import { forgetPlans, savePlan } from './plans.ts';
import { config } from './config.ts';
import { ensureFolder, existingFolder, folderLabel, gitBranch, insideDir, insideRoots, isFolder, recreateFolder, removeFolder, removeRoot } from './folders.ts';
import { gitFileDiff, gitStatus } from './git.ts';
import { log } from './log.ts';
import { defaultPrefs, forgetSession, movedFolder, prefsFor, saveMovedFolder, savePrefs, saveSessionPrefs } from './prefs.ts';
import { forgetDraft } from './drafts.ts';
import { markFinished, markSeen, unreadSince } from './unread.ts';
import type { Prefs } from './prefs.ts';

export type Listener = (msg: ServerMessage) => void;

/** Emits 'sessions_changed' whenever the session list may look different. */
export const bus = new EventEmitter();

const MODES: readonly PermissionMode[] = ['default', 'acceptEdits', 'plan', 'auto'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPermissionMode(value: unknown): value is PermissionMode {
  return MODES.includes(value as PermissionMode);
}

/** An effort level's name; which ones a model accepts is up to its provider. */
export function isEffort(value: unknown): value is EffortLevel {
  return typeof value === 'string' && /^[a-z]{1,20}$/.test(value);
}

/** Tool inputs and outputs can be whole files; the log keeps the start of them. */
function clip(text: string, max = 2000): string {
  return text.length > max ? `${text.slice(0, max)}… (${text.length - max} more characters)` : text;
}

/** "Claude" or "Codex", for what a chat says about its agent. */
function agentName(provider: Provider): string {
  return provider === 'codex' ? 'Codex' : 'Claude';
}

/**
 * One chat. It holds the transcript the UI shows and the agent it runs on,
 * which does the work through a provider's AgentRun. Every change is mirrored
 * to subscribers as an event, so a browser that reconnects only needs a fresh
 * snapshot to be back in sync.
 */
export class LiveSession implements RunHost {
  /** The chat's own id, which the UI uses. Each provider has its own id for its part (see `segments`). */
  readonly sessionId: string;
  /** The folder the agent works in. Changes only through `move`. */
  cwd: string;
  items: Item[];
  drafts: Draft[] = [];
  state: SessionState = 'idle';
  /** Chats start in auto mode; the agent falls back where auto is unavailable. */
  mode: PermissionMode = 'auto';
  provider: Provider;
  /** Chosen model and effort; null leaves the choice to the agent. */
  model: string | null;
  effort: EffortLevel | null;
  /** The model the agent reports, which is how "default" gets a name. */
  activeModel: string | undefined;
  title: string | undefined;
  /** How full the context window was when the last turn ended. */
  context: ContextUsage | undefined;
  lastActivity = Date.now();
  /** When the reply being written was asked for. */
  turnStartedAt = Date.now();

  /** The providers' conversations this chat is made of, oldest first. Empty until the agent has saved anything. */
  private segments: Segment[];
  private run: AgentRun;
  /** Uncommitted changes in the folder's repository, counted, as of the last look. */
  private gitSummary: GitSummary | undefined;
  private gitTimer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<Listener>();
  /** Permission cards waiting for an answer, by id. */
  private requests = new Map<string, PermissionRequest>();
  private tools = new Map<string, ToolItem>();
  /** After a switch: the conversation so far, sent to the new agent ahead of the next message. */
  private handover: string | undefined;

  constructor(init: { chatId: string; cwd: string; prefs: Prefs; segments: Segment[]; items?: Item[]; title?: string }) {
    this.sessionId = init.chatId;
    this.cwd = init.cwd;
    this.segments = init.segments;
    this.provider = init.segments.at(-1)?.provider ?? init.prefs.provider ?? 'claude';
    // A choice made for the other provider (before a switch) does not carry over.
    const sameProvider = (init.prefs.provider ?? 'claude') === this.provider;
    this.model = sameProvider ? init.prefs.model : null;
    this.effort = sameProvider ? init.prefs.effort : null;
    this.title = init.title;
    this.items = init.items ?? [];
    for (const item of this.items) if (item.kind === 'tool') this.tools.set(item.id, item);
    this.run = this.makeRun();
  }

  get chatId(): string {
    return this.sessionId;
  }

  /** A run for the chat's current provider, resuming its latest conversation when it has one. */
  private makeRun(): AgentRun {
    const last = this.segments.at(-1);
    const current = last && last.provider === this.provider ? last : undefined;
    // A chat's first Claude conversation takes the chat's own id; one started later, after a switch, a new one.
    const fresh = !current && this.provider === 'claude' && this.segments.length ? randomUUID() : undefined;
    return backend(this.provider).run(this, current?.sessionId ?? fresh, current !== undefined);
  }

  get hasProcess(): boolean {
    return this.run.alive;
  }

  get hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  get hasPending(): boolean {
    return this.requests.size > 0;
  }

  /** Background work is still going, which ends if the process is shut down. */
  get hasBackgroundWork(): boolean {
    return this.run.runningTasks > 0;
  }

  /** Some provider has saved part of this chat. */
  get savedOnDisk(): boolean {
    return this.segments.length > 0;
  }

  meta(): SessionMeta {
    return {
      sessionId: this.sessionId,
      provider: this.provider,
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
      tasks: this.run.tasks(),
      ...(this.gitSummary ? { gitChanges: this.gitSummary } : {}),
    };
  }

  snapshot(): ServerMessage {
    return {
      t: 'snapshot',
      sessionId: this.sessionId,
      meta: this.meta(),
      items: this.items,
      drafts: this.drafts,
      pending: [...this.requests.values()],
    };
  }

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
    // Someone is looking: files may have changed since the last look, here or elsewhere.
    this.lookAtGitSoon(0);
  }

  unsubscribe(listener: Listener): void {
    this.listeners.delete(listener);
  }

  // ---- actions from the UI -------------------------------------------------

  prompt(text: string): void {
    if (this.state === 'running') throw new Error(`${agentName(this.provider)} is still working. Stop it first or wait for it to finish.`);
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
    this.lastActivity = Date.now();
    // Just switched: the new agent reads the conversation so far first. The chat shows only what was typed.
    const said = this.handover ? withHandover(text, this.handover) : text;
    this.handover = undefined;
    this.run.prompt(id, said).catch((err: unknown) => {
      this.notice('error', err instanceof Error ? err.message : String(err));
      this.setState('idle');
    });
    bus.emit('sessions_changed');
  }

  async interrupt(): Promise<void> {
    if (this.state !== 'running') return;
    await this.run.interrupt();
  }

  async setMode(mode: PermissionMode): Promise<void> {
    this.mode = mode;
    await this.run.setMode(mode);
    this.emitMeta();
  }

  /** Switches model and effort, and provider before the chat has started. Takes effect from the next message. */
  async configure(prefs: Prefs): Promise<void> {
    const provider = prefs.provider ?? this.provider;
    if (this.state === 'running') throw new Error(`Wait for ${agentName(this.provider)} to finish before changing the model or effort.`);
    if (provider !== this.provider) {
      const started = this.savedOnDisk || this.items.some((item) => item.kind === 'user');
      const from = this.provider;
      const fromModel = this.activeModel ?? this.model ?? undefined;
      await this.run.settle();
      this.provider = provider;
      this.model = prefs.model;
      this.effort = prefs.effort;
      this.activeModel = undefined;
      this.context = undefined;
      this.run = this.makeRun();
      if (started) {
        // The new agent starts with an empty memory: it is handed the conversation with the next message.
        this.handover = buildHandover(this.items, from, fromModel, this.cwd);
        this.addItem({
          kind: 'divider',
          id: randomUUID(),
          from,
          to: provider,
          ...(fromModel ? { fromModel } : {}),
          ...(prefs.model ? { toModel: prefs.model } : {}),
          ts: Date.now(),
        });
        this.log('notice', `Switched from ${agentName(from)} to ${agentName(provider)}`);
        bus.emit('sessions_changed');
      }
    } else {
      await this.run.configure(prefs.model, prefs.effort);
      if (prefs.model !== this.model) this.activeModel = undefined;
      this.model = prefs.model;
      this.effort = prefs.effort;
    }
    savePrefs(this.sessionId, { provider, model: prefs.model, effort: prefs.effort });
    this.log('notice', `Model set to ${prefs.model ?? 'default'}, effort ${prefs.effort ?? 'default'}`);
    this.emitMeta();
  }

  resolvePermission(id: string, decision: PermissionDecision, answers?: Record<string, string>): void {
    const request = this.requests.get(id);
    if (!request) return;
    const verdict = decision === 'deny' ? 'Denied' : decision === 'always' ? 'Always allowed' : 'Allowed';
    this.log('permission', `${verdict}: ${request.toolName} ${clip(JSON.stringify(request.input), 500)}`);
    this.run.answer(id, decision, answers);
  }

  /** Stops the agent's process. The conversation stays, and the next prompt resumes it. */
  shutdown(): void {
    this.run.shutdown();
  }

  /** Stops the agent's process and waits for it to go. The next prompt starts it again. */
  async stopProcess(): Promise<void> {
    await this.run.settle();
  }

  /** Tells anyone looking at the chat that its folder was deleted. */
  folderGone(): void {
    this.emitMeta();
    this.notice('info', `The folder ${folderLabel(this.cwd)} was deleted. Recreate it or change this chat's folder to carry on.`);
  }

  /** Gives the chat a title of the person's choosing, in every provider's record of it. */
  async rename(title: string): Promise<void> {
    for (const segment of this.segments) await backend(segment.provider).rename(segment.sessionId, title);
    this.title = title;
    noteChat(this.sessionId, { title });
    this.emitMeta();
    bus.emit('sessions_changed');
  }

  /**
   * Makes the chat work in another folder from the next message on. Nothing
   * in either folder is moved or copied: only where the agent runs changes.
   */
  async move(cwd: string): Promise<void> {
    if (this.state === 'running') throw new Error(`Wait for ${agentName(this.provider)} to finish before changing the folder.`);
    if (cwd === this.cwd) return;
    await this.run.settle();
    await this.run.relocate(cwd);
    this.cwd = cwd;
    saveMovedFolder(this.sessionId, folderLabel(cwd));
    noteChat(this.sessionId, { cwd });
    this.gitSummary = undefined;
    this.lookAtGitSoon(0);
    this.emitMeta();
    this.notice('info', `This chat now works in the folder ${folderLabel(cwd)}.`);
    bus.emit('sessions_changed');
  }

  /**
   * Looks at the folder's git repository again after a moment. Calls close together, such as one
   * per tool the agent runs, end up as a single look.
   */
  private lookAtGitSoon(delay = 1500): void {
    clearTimeout(this.gitTimer);
    this.gitTimer = setTimeout(() => void this.gitDetail().catch(() => undefined), delay);
    this.gitTimer.unref?.();
  }

  /** What is changed and not committed in the folder's repository; null when it is not in one. */
  async gitDetail(): Promise<GitStatus | null> {
    const status = await gitStatus(this.cwd);
    const next: GitSummary | undefined = status
      ? { files: status.files, untracked: status.untracked, added: status.added, deleted: status.deleted, checkedAt: status.checkedAt }
      : undefined;
    const before = this.gitSummary;
    this.gitSummary = next;
    const same =
      before?.files === next?.files &&
      before?.untracked === next?.untracked &&
      before?.added === next?.added &&
      before?.deleted === next?.deleted;
    if (!same) this.emitMeta();
    // While someone has the chat open, files changed outside it (a terminal, an editor) show up too.
    if (status && this.listeners.size) this.lookAtGitSoon(20_000);
    return status;
  }

  /** Stops one piece of background work. The agent then reports it as stopped. */
  async stopTask(taskId: string): Promise<void> {
    this.log('notice', `Stopping background task ${taskId}`);
    await this.run.stopTask(taskId);
  }

  /** Creates this chat's folder again, empty, after it was deleted. */
  async restoreFolder(): Promise<void> {
    if (isFolder(this.cwd)) return;
    await recreateFolder(this.cwd);
    this.emitMeta();
    this.notice('info', `The folder ${folderLabel(this.cwd)} was created again. Files that were in it are not back.`);
    bus.emit('sessions_changed');
  }

  /** Ends the chat for good: stops its process and tells anyone looking at it. */
  async discard(): Promise<void> {
    for (const id of [...this.requests.keys()]) this.run.answer(id, 'deny');
    await this.run.settle();
    const gone: ServerMessage = { t: 'error', sessionId: this.sessionId, message: 'This chat was deleted.' };
    for (const listener of this.listeners) listener(gone);
    this.listeners.clear();
  }

  /** Every provider conversation this chat is made of, for listing and deleting. */
  get parts(): readonly Segment[] {
    return this.segments;
  }

  /**
   * What fills the context window. A chat without a running process may get
   * one: some providers have to be running to count.
   */
  async contextDetail(): Promise<ContextDetail> {
    this.lastActivity = Date.now();
    return this.run.contextDetail();
  }

  // ---- what the agent reports (RunHost) -------------------------------------

  running(): void {
    this.lastActivity = Date.now();
    this.setState('running');
  }

  turnEnded(): void {
    this.lastActivity = Date.now();
    this.setState('idle');
    bus.emit('sessions_changed');
    this.lookAtGitSoon(300);
  }

  processEnded(): void {
    for (const id of [...this.requests.keys()]) this.answered(id);
    this.clearDrafts();
    this.setState('idle');
    this.emitMeta();
    bus.emit('sessions_changed');
  }

  saved(): void {
    this.lastActivity = Date.now();
    const id = this.run.sessionId;
    if (!id) return;
    const last = this.segments.at(-1);
    if (last && last.provider === this.run.provider && last.sessionId === id) return;
    if (!prefsFor(this.sessionId)) {
      saveSessionPrefs(this.sessionId, { provider: this.provider, model: this.model, effort: this.effort });
    }
    this.segments.push({ provider: this.run.provider, sessionId: id, startedAt: Date.now(), ...(this.model ? { model: this.model } : {}) });
    saveSegments(this.sessionId, this.segments, { cwd: this.cwd, ...(this.title ? { title: this.title } : {}) });
    // A conversation started after a switch would be titled by its first message, the handover: it gets the chat's title.
    if (this.segments.length > 1 && this.title) void backend(this.run.provider).rename(id, this.title).catch(() => undefined);
  }

  setActiveModel(model: string | undefined): void {
    if (!model || model === this.activeModel) return;
    this.activeModel = model;
    this.emitMeta();
  }

  adoptMode(mode: PermissionMode, note?: string): void {
    if (note) this.notice('info', note);
    if (mode === this.mode) return;
    this.mode = mode;
    this.emitMeta();
  }

  setContext(usage: ContextUsage): void {
    this.context = usage;
    this.emitMeta();
  }

  tasksChanged(): void {
    this.emitMeta();
  }

  startDraft(kind: Draft['kind'], text: string): string {
    const draft: Draft = { id: randomUUID(), kind, text };
    this.drafts.push(draft);
    this.emit({ t: 'draft', draft });
    return draft.id;
  }

  appendDraft(id: string, text: string): void {
    const draft = this.drafts.find((d) => d.id === id);
    if (!draft || !text) return;
    draft.text += text;
    this.emit({ t: 'draft_delta', id, text });
  }

  endDraft(id: string): void {
    this.emit({ t: 'draft_end', id });
  }

  /** Removes and returns the oldest draft of a kind, once its finished content has arrived. */
  takeDraft(kind: Item['kind']): string | undefined {
    const index = this.drafts.findIndex((d) => d.kind === kind);
    if (index === -1) return undefined;
    return this.drafts.splice(index, 1)[0]!.id;
  }

  clearDrafts(): void {
    if (!this.drafts.length) return;
    this.drafts = [];
    this.emit({ t: 'drafts_clear' });
  }

  addItem(item: Item, replaces?: string): void {
    this.items.push(item);
    if (item.kind === 'tool') this.tools.set(item.id, item);
    // Everything added here is new activity; history loaded from disk never passes through.
    if (item.kind === 'user') this.log('prompt', item.text);
    else if (item.kind === 'text') this.log('response', item.text);
    else if (item.kind === 'tool') this.log('tool', `${item.name} ${clip(JSON.stringify(item.input))}`);
    else if (item.kind === 'notice') this.log('notice', item.text, item.level === 'error');
    this.emit({ t: 'item', item, ...(replaces ? { replaces } : {}) });
  }

  updateItem(item: Item): void {
    const index = this.items.findIndex((existing) => existing.id === item.id);
    if (index === -1) return this.addItem(item);
    this.items[index] = item;
    if (item.kind === 'tool') this.tools.set(item.id, item);
    this.emit({ t: 'item', item, replaces: item.id });
  }

  private turnPlan(turnId: string, stamp: Stamp): PlanItem {
    const id = planId(this.provider, turnId);
    const existing = this.items.findLast(item => item.id === id);
    return existing?.kind === 'plan' ? existing : { kind: 'plan', id, steps: [], ts: Date.now(), ...stamp };
  }

  updatePlan(turnId: string, patch: Partial<PlanContent>, stamp: Stamp = {}): PlanItem {
    const item = { ...this.turnPlan(turnId, stamp), ...patch };
    this.updateItem(item);
    if (this.run.sessionId) {
      try {
        savePlan(this.provider, this.run.sessionId, item);
      } catch (err) {
        this.log('notice', `Could not save plan progress: ${String(err)}`, true);
      }
    }
    return item;
  }

  appendPlan(turnId: string, text: string, stamp: Stamp = {}): void {
    if (!text) return;
    const item = this.turnPlan(turnId, stamp);
    if (item.markdown === undefined) {
      this.updateItem({ ...item, markdown: text });
    } else {
      item.markdown += text;
      this.emit({ t: 'plan_delta', id: item.id, text });
    }
  }

  tool(id: string): ToolItem | undefined {
    return this.tools.get(id);
  }

  toolResult(id: string, text: string, isError: boolean): void {
    const tool = this.tools.get(id);
    if (!tool) return;
    tool.result = { text, isError };
    this.log('tool_result', `${tool.name}: ${clip(text)}`, isError);
    this.emit({ t: 'tool_result', id, text, isError });
    // Any tool may have changed files (a shell command as much as an edit), so the repository is looked at again.
    this.lookAtGitSoon();
  }

  ask(request: PermissionRequest): void {
    this.requests.set(request.id, request);
    this.emit({ t: 'permission', request });
    // The Active list shows the chat as waiting for you.
    if (this.requests.size === 1) bus.emit('sessions_changed');
  }

  answered(id: string): void {
    if (!this.requests.delete(id)) return;
    this.emit({ t: 'permission_done', id });
    if (this.requests.size === 0) bus.emit('sessions_changed');
  }

  notice(level: 'info' | 'error', text: string): void {
    this.addItem({ kind: 'notice', id: randomUUID(), level, text, ts: Date.now() });
  }

  log(kind: LogKind, text: string, error = false): void {
    log({
      sessionId: this.sessionId,
      folder: folderLabel(this.cwd),
      provider: this.provider,
      kind,
      text,
      ...(kind === 'response' && this.activeModel ? { model: this.activeModel } : {}),
      ...(error ? { error: true } : {}),
    });
  }

  filesChanged(delay?: number): void {
    this.lookAtGitSoon(delay);
  }

  resnapshot(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  // ---- plumbing -------------------------------------------------------------

  private emit(event: SessionEvent): void {
    const msg: ServerMessage = { t: 'event', sessionId: this.sessionId, event };
    for (const listener of this.listeners) listener(msg);
  }

  private emitMeta(): void {
    this.emit({ t: 'meta', meta: this.meta() });
  }

  private setState(state: SessionState): void {
    if (this.state === state) return;
    const was = this.state;
    this.state = state;
    if (state === 'running') this.turnStartedAt = Date.now();
    // A reply is done (or stopped, or failed): it waits in the Active list until someone opens the chat.
    if (was === 'running' && state === 'idle') {
      markFinished(this.sessionId);
      bus.emit('sessions_changed');
    }
    this.emitMeta();
  }

  /** The chat is on someone's screen: its finished reply has been seen. */
  seen(): void {
    if (this.state !== 'running' && markSeen(this.sessionId)) bus.emit('sessions_changed');
  }
}

// ---- registry ---------------------------------------------------------------

const live = new Map<string, LiveSession>();
const loading = new Map<string, Promise<LiveSession>>();

/** A new chat in a folder, on the agent it should start on (see startingProvider). */
export function createSession(cwd: string, provider?: Provider): LiveSession {
  const chatId = randomUUID();
  const prefs = defaultPrefs(provider);
  const session = new LiveSession({ chatId, cwd, prefs, segments: [] });
  live.set(chatId, session);
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

/**
 * A chat with no record of its own is one provider's conversation under its
 * own id: every chat from before Codex, and conversations started elsewhere
 * (the claude or codex command) in a folder clack knows.
 */
async function plainSegments(chatId: string): Promise<Segment[] | undefined> {
  for (const b of backends()) {
    const found = await b.find(chatId).catch(() => undefined);
    if (found) return [{ provider: b.provider, sessionId: chatId, startedAt: found.lastModified }];
  }
  return undefined;
}

async function loadFromDisk(chatId: string): Promise<LiveSession> {
  const segments = segmentsOf(chatId) ?? (await plainSegments(chatId));
  if (!segments?.length) throw new Error('Session not found');
  const last = segments.at(-1)!;
  const record = recordOf(chatId);
  // The provider's own record says where the chat works; clack's record stands in where the provider's list misses it.
  const providerSession = await backend(last.provider).find(last.sessionId).catch(() => undefined);
  const info = providerSession ??
    (record?.cwd ? { cwd: record.cwd, title: record.title } : undefined);
  // Sessions from anywhere else on this computer are treated as if they did not exist.
  if (!info?.cwd || !insideRoots(info.cwd)) throw new Error('Session not found');
  const items: Item[] = [];
  let before: Segment | undefined;
  for (const segment of segments) {
    if (before && before.provider !== segment.provider) {
      items.push({
        kind: 'divider',
        id: `${segment.sessionId}:switch`,
        from: before.provider,
        to: segment.provider,
        ...(before.model ? { fromModel: before.model } : {}),
        ...(segment.model ? { toModel: segment.model } : {}),
        ts: segment.startedAt,
      });
    }
    // A provider that is switched off now still has its part of the chat on disk, but cannot read it back.
    const part = await backend(segment.provider)
      .history(segment.sessionId)
      .catch((err: unknown): Item[] => [
        { kind: 'notice', id: `${segment.sessionId}:missing`, level: 'error', text: `This part of the chat could not be read (${err instanceof Error ? err.message : String(err)}).` },
      ]);
    for (const item of part) {
      // The conversation handed over at a switch is for the agent, not for reading again here.
      if (item.kind === 'user') item.text = stripHandover(item.text).text;
      items.push(item);
    }
    before = segment;
  }
  const session = new LiveSession({
    chatId,
    cwd: currentCwd(chatId, info.cwd),
    prefs: prefsFor(chatId) ?? {
      provider: last.provider,
      model: last.provider === 'codex' ? providerSession?.model ?? last.model ?? null : null,
      effort: providerSession?.effort ?? null,
    },
    segments: [...segments],
    items,
    title: record?.title ?? info.title,
  });
  live.set(chatId, session);
  return session;
}

/**
 * Where a saved chat works. For a chat that was moved, clack's own record
 * wins over what the transcript says, as long as that folder still exists
 * under data/sessions.
 */
function currentCwd(chatId: string, recorded: string): string {
  const moved = movedFolder(chatId);
  if (!moved) return recorded;
  const cwd = resolve(config.sessionsDir, moved);
  return insideRoots(cwd) ? cwd : recorded;
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

/** One changed file's diff, in a chat's git repository. */
export async function gitDiff(sessionId: string, change: { path: unknown; from?: unknown; area: unknown }, whole: boolean): Promise<GitDiff> {
  return gitFileDiff((await openSession(sessionId)).cwd, change, whole);
}

/** What is changed and not committed in a chat's git repository; null when it is not in one. */
export async function gitDetail(sessionId: string): Promise<GitStatus | null> {
  return (await openSession(sessionId)).gitDetail();
}

/** Stops one piece of background work in a chat. */
export async function stopTask(sessionId: string, taskId: unknown): Promise<void> {
  if (typeof taskId !== 'string' || !taskId) throw new Error('Which task?');
  await (await openSession(sessionId)).stopTask(taskId);
}

/** Creates a chat's deleted folder again, so the chat can carry on. */
export async function restoreFolder(sessionId: string): Promise<void> {
  await (await openSession(sessionId)).restoreFolder();
}

/** Puts a chat away, or takes it back out. Its conversation and files are untouched either way. */
export async function setArchived(sessionId: string, archived: boolean): Promise<void> {
  const session = await openSession(sessionId);
  if (!session.savedOnDisk) throw new Error('This chat has nothing saved yet. Delete it instead.');
  for (const part of session.parts) await backend(part.provider).setArchived(part.sessionId, archived);
  bus.emit('sessions_changed');
}

/** Deletes a chat's conversation for good, on every provider it ran on. The files in its folder stay. */
export async function deleteChat(sessionId: string): Promise<void> {
  const session = await openSession(sessionId);
  await session.discard();
  live.delete(sessionId);
  for (const part of session.parts) {
    await backend(part.provider).remove(part.sessionId);
    forgetPlans(part.provider, part.sessionId);
  }
  forgetSession(sessionId);
  forgetChat(sessionId);
  forgetDraft(sessionId);
  markSeen(sessionId);
  bus.emit('sessions_changed');
}

/**
 * Deletes a folder under data/sessions, with every file and folder in it, for
 * good. Not while a chat working there is busy. The chats that worked in it
 * are kept: they show as having lost their folder, which can be made again.
 */
export async function deleteFolder(name: unknown): Promise<void> {
  const path = await existingFolder(name);
  const inside = [...live.values()].filter((session) => insideDir(session.cwd, path));
  if (inside.some((session) => session.state === 'running' || session.hasPending || session.hasBackgroundWork)) {
    throw new Error('A chat in this folder is still working. Stop it or wait for it to finish first.');
  }
  // Their agents' processes would be left in a folder that is gone; they start again on the next message.
  await Promise.all(inside.map((session) => session.stopProcess()));
  await removeFolder(path);
  for (const session of inside) session.folderGone();
  bus.emit('sessions_changed');
}

/**
 * Takes a folder outside data/sessions off clack's list. Its files stay. Not
 * while a chat working there is busy. Its chats leave the sidebar, and come
 * back if the folder is added again.
 */
export async function forgetRoot(path: unknown): Promise<void> {
  if (typeof path !== 'string') throw new Error('Which folder?');
  const inside = [...live.values()].filter((session) => insideDir(session.cwd, path));
  if (inside.some((session) => session.state === 'running' || session.hasPending || session.hasBackgroundWork)) {
    throw new Error('A chat in this folder is still working. Stop it or wait for it to finish first.');
  }
  removeRoot(path);
  await Promise.all(inside.map((session) => session.stopProcess()));
  for (const session of inside) live.delete(session.sessionId);
  bus.emit('sessions_changed');
}

export async function listSummaries(): Promise<SessionSummary[]> {
  // Each provider keeps every conversation on this computer in one place; only
  // the ones that ran in a folder clack knows belong to it.
  const lists = await Promise.all(backends().map((b) => b.list().catch((): StoredSession[] => [])));
  const seen = new Set<string>();
  const summaries: SessionSummary[] = [];
  for (const stored of lists.flat()) {
    if (!insideRoots(stored.cwd)) continue;
    // A chat that switched provider is listed once, by the conversation it carries on in.
    if (isEarlierSegment(stored.provider, stored.sessionId)) continue;
    const chatId = chatOf(stored.provider, stored.sessionId) ?? stored.sessionId;
    if (seen.has(chatId)) continue;
    seen.add(chatId);
    const open = live.get(chatId);
    const cwd = open?.cwd ?? currentCwd(chatId, stored.cwd);
    summaries.push({
      sessionId: chatId,
      provider: open?.provider ?? stored.provider,
      ...(stored.model ? { model: stored.model } : {}),
      title: recordOf(chatId)?.title ?? stored.title ?? open?.title ?? 'Untitled',
      folder: folderLabel(cwd),
      missing: !isFolder(cwd),
      ...(stored.gitBranch ? { gitBranch: stored.gitBranch } : {}),
      lastModified: stored.lastModified,
      running: open?.state === 'running',
      archived: stored.archived,
      ...activityOf(chatId, open),
    });
  }
  // A chat that switched agent, whose latest part its provider does not list (or not yet): from clack's own record.
  for (const [chatId, record] of allRecords()) {
    if (seen.has(chatId) || !record.cwd || !insideRoots(record.cwd)) continue;
    const last = record.segments.at(-1);
    if (!last) continue;
    seen.add(chatId);
    const open = live.get(chatId);
    const cwd = open?.cwd ?? record.cwd;
    summaries.push({
      sessionId: chatId,
      provider: open?.provider ?? last.provider,
      ...(last.model ? { model: last.model } : {}),
      title: open?.title ?? record.title ?? 'Untitled',
      folder: folderLabel(cwd),
      missing: !isFolder(cwd),
      lastModified: open?.lastActivity ?? last.startedAt,
      running: open?.state === 'running',
      archived: false,
      ...activityOf(chatId, open),
    });
  }
  // A brand-new chat is not on disk until its agent has answered once.
  for (const session of live.values()) {
    if (seen.has(session.sessionId) || !session.items.length) continue;
    summaries.push({
      sessionId: session.sessionId,
      provider: session.provider,
      title: session.title ?? 'New chat',
      folder: folderLabel(session.cwd),
      lastModified: session.lastActivity,
      running: session.state === 'running',
      archived: false,
      missing: !isFolder(session.cwd),
      ...activityOf(session.sessionId, session),
    });
  }
  return summaries.sort((a, b) => b.lastModified - a.lastModified).slice(0, 200);
}

/** What a chat's agent is up to, for the Active list in the sidebar. */
function activityOf(chatId: string, open: LiveSession | undefined): Pick<SessionSummary, 'activity' | 'activityAt'> {
  if (open?.state === 'running') return { activity: open.hasPending ? 'waiting' : 'working', activityAt: open.turnStartedAt };
  const at = unreadSince(chatId);
  return at === undefined ? {} : { activity: 'done', activityAt: at };
}

/** Frees idle agent processes and forgets sessions nobody is looking at. */
function reap(): void {
  const now = Date.now();
  for (const session of live.values()) {
    // Shutting the process down would end its background work too.
    if (session.state === 'running' || session.hasPending || session.hasBackgroundWork) continue;
    if (now - session.lastActivity < config.idleMs) continue;
    if (session.hasProcess) session.shutdown();
    if (!session.hasListeners) live.delete(session.sessionId);
  }
}

setInterval(reap, 60_000).unref();

export function shutdownAll(): void {
  for (const session of live.values()) session.shutdown();
  for (const b of backends()) b.shutdown();
}
