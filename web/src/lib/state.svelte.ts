import type {
  ClientMessage,
  Draft,
  EffortLevel,
  FolderInfo,
  Item,
  LogEntry,
  LogPage,
  Me,
  ModelOption,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  ServerMessage,
  SessionEvent,
  SessionMeta,
  SessionSummary,
} from '../../../shared/protocol';
import { api, ApiError } from './api';

export type Route = { name: 'new' } | { name: 'session'; id: string } | { name: 'debug'; tab: 'log' };

function parseRoute(): Route {
  const match = location.hash.match(/^#\/s\/([0-9a-f-]{36})$/i);
  if (match) return { name: 'session', id: match[1]! };
  // Only one debug view so far, so #/debug lands on it too.
  if (/^#\/debug(\/log)?$/.test(location.hash)) return { name: 'debug', tab: 'log' };
  return { name: 'new' };
}

const MAX_LOGS = 2000;

class AppState {
  /** null until the first check has come back. */
  authed = $state<boolean | null>(null);
  sessions = $state<SessionSummary[]>([]);
  folders = $state<FolderInfo[]>([]);
  /** Empty until Claude Code has been asked which models this account can use. */
  models = $state<ModelOption[]>([]);
  connected = $state(false);
  route = $state<Route>(parseRoute());

  // The open session, kept in sync by snapshots and events from the server.
  meta = $state<SessionMeta | null>(null);
  items = $state<Item[]>([]);
  drafts = $state<Draft[]>([]);
  pending = $state<PermissionRequest[]>([]);
  opening = $state(false);
  error = $state<string | null>(null);

  // The activity log, filled only while the debug page is open.
  logs = $state<LogEntry[]>([]);
  logDir = $state('');
  #watchingLogs = false;

  #ws: WebSocket | null = null;
  #retryMs = 500;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;
  #listTimer: ReturnType<typeof setTimeout> | undefined;

  get sessionId(): string | null {
    return this.route.name === 'session' ? this.route.id : null;
  }

  get running(): boolean {
    return this.meta?.state === 'running';
  }

  async init(): Promise<void> {
    window.addEventListener('hashchange', () => this.#onRouteChange());
    window.addEventListener('online', () => this.#wake());
    // A phone drops the socket while its screen is off: reconnect as soon as it is back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.#wake();
    });
    await this.#checkAuth();
  }

  async login(token: string): Promise<void> {
    await api('/api/login', { token });
    await this.#checkAuth();
  }

  async logout(): Promise<void> {
    await api('/api/logout', {});
    this.authed = false;
    this.#ws?.close();
  }

  async loadSessions(): Promise<void> {
    try {
      this.sessions = await api<SessionSummary[]>('/api/sessions');
    } catch (err) {
      this.#fail(err);
    }
  }

  async loadFolders(): Promise<void> {
    try {
      this.folders = await api<FolderInfo[]>('/api/folders');
    } catch (err) {
      this.#fail(err);
    }
  }

  async loadModels(): Promise<void> {
    if (this.models.length) return;
    try {
      this.models = await api<ModelOption[]>('/api/models');
    } catch (err) {
      // The chat works without the list; the pickers just stay hidden.
      if (err instanceof ApiError && err.status === 401) this.authed = false;
    }
  }

  /** Starts a chat in a folder under data/sessions, creating the folder if the name is new. */
  async newSession(folder: string): Promise<void> {
    try {
      const { sessionId } = await api<{ sessionId: string }>('/api/sessions', { folder });
      location.hash = `#/s/${sessionId}`;
    } catch (err) {
      this.#fail(err);
    }
  }

  /** Loads recent log entries and, while `on`, keeps receiving new ones as they are written. */
  async watchLogs(on: boolean): Promise<void> {
    this.#watchingLogs = on;
    if (this.#ws?.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify({ t: 'logs', on } satisfies ClientMessage));
    if (!on) return;
    try {
      const page = await api<LogPage>('/api/logs?limit=1000');
      this.logDir = page.dir;
      this.logs = page.entries;
    } catch (err) {
      this.#fail(err);
    }
  }

  configure(model: string | null, effort: EffortLevel | null): void {
    if (this.sessionId) this.#send({ t: 'config', sessionId: this.sessionId, model, effort });
  }

  prompt(text: string): boolean {
    const id = this.sessionId;
    return id !== null && this.#send({ t: 'prompt', sessionId: id, text });
  }

  interrupt(): void {
    if (this.sessionId) this.#send({ t: 'interrupt', sessionId: this.sessionId });
  }

  decide(id: string, decision: PermissionDecision, answers?: Record<string, string>): void {
    if (this.sessionId) this.#send({ t: 'permission', sessionId: this.sessionId, id, decision, answers });
  }

  setMode(mode: PermissionMode): void {
    if (this.sessionId) this.#send({ t: 'mode', sessionId: this.sessionId, mode });
  }

  // ---- connection -------------------------------------------------------------

  async #checkAuth(): Promise<void> {
    try {
      const me = await api<Me>('/api/me');
      this.authed = me.authed;
      if (me.authed) {
        this.#connect();
        void this.loadSessions();
        void this.loadModels();
      }
    } catch {
      // The server is unreachable: keep trying rather than showing a login form that cannot work.
      setTimeout(() => void this.#checkAuth(), 2000);
    }
  }

  #connect(): void {
    if (this.#ws && this.#ws.readyState <= WebSocket.OPEN) return;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/ws`);
    this.#ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.#retryMs = 500;
      // The server keeps the transcript, so (re)opening always yields a full, current snapshot.
      if (this.sessionId) this.#send({ t: 'open', sessionId: this.sessionId });
      // Entries written while the connection was down are picked up by loading again.
      if (this.#watchingLogs) void this.watchLogs(true);
      void this.loadSessions();
    };
    ws.onmessage = (event) => this.#onMessage(JSON.parse(event.data));
    ws.onclose = () => {
      if (this.#ws !== ws) return;
      this.#ws = null;
      this.connected = false;
      if (this.authed) this.#scheduleReconnect();
    };
  }

  #scheduleReconnect(): void {
    clearTimeout(this.#retryTimer);
    this.#retryTimer = setTimeout(async () => {
      try {
        const me = await api<Me>('/api/me');
        if (!me.authed) {
          this.authed = false;
          return;
        }
      } catch {
        // Unreachable for now; the failed socket below schedules the next attempt.
      }
      this.#connect();
    }, this.#retryMs);
    this.#retryMs = Math.min(this.#retryMs * 2, 5000);
  }

  #wake(): void {
    if (!this.authed || this.#ws) return;
    clearTimeout(this.#retryTimer);
    this.#retryMs = 500;
    this.#connect();
  }

  #send(message: ClientMessage): boolean {
    if (this.#ws?.readyState !== WebSocket.OPEN) {
      this.error = 'Not connected to the server. Reconnecting…';
      return false;
    }
    this.error = null;
    this.#ws.send(JSON.stringify(message));
    return true;
  }

  #fail(err: unknown): void {
    if (err instanceof ApiError && err.status === 401) this.authed = false;
    else this.error = err instanceof Error ? err.message : String(err);
  }

  // ---- routing and incoming messages -----------------------------------------

  #onRouteChange(): void {
    this.route = parseRoute();
    this.meta = null;
    this.items = [];
    this.drafts = [];
    this.pending = [];
    this.error = null;
    const id = this.sessionId;
    this.opening = id !== null;
    if (this.#ws?.readyState !== WebSocket.OPEN) return;
    this.#send(id ? { t: 'open', sessionId: id } : { t: 'close' });
  }

  #onMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case 'snapshot':
        if (msg.sessionId !== this.sessionId) return;
        this.meta = msg.meta;
        this.items = msg.items;
        this.drafts = msg.drafts;
        this.pending = msg.pending;
        this.opening = false;
        break;
      case 'event':
        if (msg.sessionId === this.sessionId) this.#apply(msg.event);
        break;
      case 'sessions_changed':
        clearTimeout(this.#listTimer);
        this.#listTimer = setTimeout(() => void this.loadSessions(), 150);
        break;
      case 'log':
        // The initial load and the live feed can overlap by an entry or two.
        if (this.logs.slice(-50).some((entry) => entry.id === msg.entry.id)) return;
        this.logs.push(msg.entry);
        if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
        break;
      case 'error':
        if (msg.sessionId && msg.sessionId !== this.sessionId) return;
        this.error = msg.message;
        this.opening = false;
        break;
    }
  }

  #apply(event: SessionEvent): void {
    switch (event.t) {
      case 'item':
        if (event.replaces) this.drafts = this.drafts.filter((d) => d.id !== event.replaces);
        this.items.push(event.item);
        break;
      case 'draft':
        this.drafts.push(event.draft);
        break;
      case 'draft_delta': {
        const draft = this.drafts.find((d) => d.id === event.id);
        if (draft) draft.text += event.text;
        break;
      }
      case 'draft_end':
        this.drafts = this.drafts.filter((d) => d.id !== event.id);
        break;
      case 'drafts_clear':
        this.drafts = [];
        break;
      case 'tool_result': {
        const tool = this.items.find((i) => i.kind === 'tool' && i.id === event.id);
        if (tool?.kind === 'tool') tool.result = { text: event.text, isError: event.isError };
        break;
      }
      case 'permission':
        this.pending.push(event.request);
        break;
      case 'permission_done':
        this.pending = this.pending.filter((p) => p.id !== event.id);
        break;
      case 'meta':
        this.meta = event.meta;
        break;
    }
  }
}

export const app = new AppState();
