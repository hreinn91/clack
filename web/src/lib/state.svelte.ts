import type {
  ClientMessage,
  Draft,
  EffortLevel,
  FileListing,
  FilePreview,
  Capabilities,
  ContextDetail,
  GitStatus,
  BrowseListing,
  FolderInfo,
  FolderRoot,
  Item,
  LogEntry,
  LogPage,
  Me,
  ModelOption,
  Provider,
  ProviderModels,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  PlanUsage,
  ServerMessage,
  SessionEvent,
  SessionMeta,
  SessionSummary,
  TerminalInfo,
  Upload,
} from '../../../shared/protocol';
import { api, ApiError } from './api';
import { authorName, isOutside, within, withEffort } from './format';

export type Route =
  | { name: 'new'; folder?: string; elsewhere?: boolean }
  | { name: 'session'; id: string }
  | { name: 'debug'; tab: 'log' }
  | { name: 'data' }
  | { name: 'theme' }
  | { name: 'help' }
  | { name: 'usage' }
  | { name: 'tools' };

function parseRoute(): Route {
  const match = location.hash.match(/^#\/s\/([0-9a-f-]{36})$/i);
  if (match) return { name: 'session', id: match[1]! };
  // Only one debug view so far, so #/debug lands on it too.
  if (/^#\/debug(\/log)?$/.test(location.hash)) return { name: 'debug', tab: 'log' };
  if (location.hash === '#/data') return { name: 'data' };
  if (location.hash === '#/theme') return { name: 'theme' };
  if (location.hash === '#/help') return { name: 'help' };
  if (location.hash === '#/usage') return { name: 'usage' };
  if (location.hash === '#/tools') return { name: 'tools' };
  // The new-chat page, opened on picking a folder anywhere on this computer.
  if (location.hash === '#/new-elsewhere') return { name: 'new', elsewhere: true };
  // A folder picked in the sidebar: the new-chat page opens with it filled in.
  // Any name a folder in the tree can have ("MyRepo", "my_project"), but nothing hidden or stepping up.
  const folder = location.hash.match(/^#\/new\/(.+)$/);
  const path = folder ? safeDecode(folder[1]!) : '';
  const parts = path.split('/');
  // An absolute path is a folder in an added outside folder; the server checks it is one.
  const rest = isOutside(path) ? parts.slice(1) : parts;
  const plain = path !== '' && rest.every((part) => part !== '' && part !== '.' && part !== '..' && !part.includes('\\'));
  return plain ? { name: 'new', folder: path } : { name: 'new' };
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return '';
  }
}

const MAX_LOGS = 2000;
/** The server refuses anything larger. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** How narrow and wide the sidebar can be dragged, and where it starts, in pixels. */
export const SIDEBAR = { min: 180, max: 520, initial: 260 };
const SIDEBAR_KEY = 'clack.sidebar';

// A layout preference belongs to the screen it was set on, so it stays in the browser.
function savedSidebar(): { width: number; hidden: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(SIDEBAR_KEY) ?? 'null') as { width?: unknown; hidden?: unknown } | null;
    const width = Number(saved?.width);
    if (width >= SIDEBAR.min && width <= SIDEBAR.max) return { width, hidden: saved?.hidden === true };
  } catch {
    // Storage is unavailable or holds something else: start from the defaults.
  }
  return { width: SIDEBAR.initial, hidden: false };
}

class AppState {
  /** null until the first check has come back. */
  authed = $state<boolean | null>(null);
  /** The name the person's own messages are shown under. */
  userName = $state('You');
  /** When the person's own picture was saved, to ask for the new one after a change; undefined with no picture. */
  avatar = $state<number | undefined>();
  /** Typed into the search field: narrows the chats and folders in the sidebar. */
  search = $state('');
  /** How much of each provider's plan limits is used, by provider. Empty until the first answer. */
  usages = $state<Partial<Record<Provider, PlanUsage>>>({});
  /** True while the figures are being asked for. */
  usageLoading = $state(false);
  /** Whether the quick switcher (Cmd+K) is showing. */
  paletteOpen = $state(false);
  /** A question about one chat that is waiting for an answer: its new name, its new folder, or whether to delete it. */
  dialog = $state<{ kind: 'rename' | 'move' | 'delete'; session: SessionSummary } | null>(null);
  /** A folder in the chat tree waiting for its deletion to be confirmed: its name, as the tree has it. */
  deletingFolder = $state<string | null>(null);
  /** A switch of the open chat to the other agent, waiting to be confirmed. */
  switching = $state<{ provider: Provider; model: string | null; effort: EffortLevel | null } | null>(null);
  /** An added outside folder waiting for its removal from clack to be confirmed. */
  removingRoot = $state<FolderRoot | null>(null);
  /** The sidebar's width in pixels, and whether it is tucked away to leave the page more room. */
  sidebarWidth = $state(savedSidebar().width);
  sidebarHidden = $state(savedSidebar().hidden);
  sessions = $state<SessionSummary[]>([]);
  folders = $state<FolderInfo[]>([]);
  /** Folders outside data/sessions that were added, each with its own tree. */
  roots = $state<FolderRoot[]>([]);
  /** Each provider's models and whether it can be used. Empty until the server has been asked. */
  providers = $state<ProviderModels[]>([]);
  connected = $state(false);
  route = $state<Route>(parseRoute());

  // The open session, kept in sync by snapshots and events from the server.
  meta = $state<SessionMeta | null>(null);
  items = $state<Item[]>([]);
  drafts = $state<Draft[]>([]);
  pending = $state<PermissionRequest[]>([]);
  opening = $state(false);
  error = $state<string | null>(null);

  // The Data page: the data directory as a tree, the file being looked at, and the shells opened in it.
  /** Where the data directory is on the server. */
  dataDir = $state('');
  /** Whether this server lets the UI open terminals. */
  terminalEnabled = $state(false);
  /** Whether chats may work in folders outside data/sessions on this server. */
  outsideFolders = $state(false);
  /** The server account's home folder, so paths in it can be shown as ~/…. */
  home = $state('');
  /** Folder listings loaded so far, by path relative to the data directory ('' is the directory itself). */
  tree = $state<Record<string, FileListing>>({});
  /** Which folders are unfolded in the tree. */
  treeOpen = $state<Record<string, boolean>>({ '': true, sessions: true });
  file = $state<FilePreview | null>(null);
  /** The path of a file that is being fetched, so the page can say so. */
  fileLoading = $state<string | null>(null);
  terminals = $state<TerminalInfo[]>([]);
  /** The terminal whose tab is in front. */
  terminalId = $state<string | null>(null);

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

  /**
   * The name Claude's next reply will be shown under, such as "Fable 5.2 High".
   * Until Claude Code reports the model it is running, the model picker's own
   * label stands in, then whoever replied last in this chat.
   */
  /**
   * The open chat as the sidebar lists it, so menus and dialogs can act on it.
   * A brand-new chat is not listed until it has something in it; it is made up from what is known.
   */
  get currentChat(): SessionSummary | undefined {
    const id = this.sessionId;
    if (!id) return undefined;
    const listed = this.sessions.find((chat) => chat.sessionId === id);
    if (listed) return listed;
    const meta = this.meta;
    if (!meta) return undefined;
    return {
      sessionId: id,
      provider: meta.provider,
      title: meta.title ?? 'New chat',
      folder: meta.folder,
      lastModified: Date.now(),
      running: this.running,
      archived: false,
      missing: meta.folderMissing,
    };
  }

  /** Every model of every provider that can be used, Claude's first. */
  get models(): ModelOption[] {
    return this.providers.flatMap((p) => (p.available ? p.models : []));
  }

  /** The provider of the open chat; Claude where there is none. */
  get provider(): Provider {
    return this.meta?.provider ?? 'claude';
  }

  /** The open chat's provider's plan usage, which is what the ring by the send button shows. */
  get usage(): PlanUsage | null {
    return this.usages[this.provider] ?? null;
  }

  get modelName(): string {
    const meta = this.meta;
    if (meta?.activeModel) return authorName(meta.activeModel, meta.effort);
    const picked = meta?.model ? this.models.find((m) => m.provider === meta.provider && m.value === meta.model)?.label : undefined;
    if (picked) return withEffort(picked, meta?.effort);
    let last: string | undefined;
    for (const item of this.items) if (item.model) last = item.model;
    return authorName(last, meta?.effort, this.provider);
  }

  /** Sets the sidebar's width, kept within its limits. Resizing a hidden sidebar brings it back. */
  resizeSidebar(width: number): void {
    this.sidebarWidth = Math.round(Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, width)));
    this.sidebarHidden = false;
    this.#saveSidebar();
  }

  toggleSidebar(hidden = !this.sidebarHidden): void {
    this.sidebarHidden = hidden;
    this.#saveSidebar();
  }

  #saveSidebar(): void {
    try {
      localStorage.setItem(SIDEBAR_KEY, JSON.stringify({ width: this.sidebarWidth, hidden: this.sidebarHidden }));
    } catch {
      // Not remembered this time; the layout still changes.
    }
  }

  async init(): Promise<void> {
    window.addEventListener('hashchange', () => this.#onRouteChange());
    window.addEventListener('online', () => this.#wake());
    // A phone drops the socket while its screen is off: reconnect as soon as it is back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      this.#wake();
      // Folders can be deleted or made outside clack (a terminal, the file manager): look again on coming back.
      if (this.authed) {
        void this.loadSessions();
        void this.loadFolders();
      }
    });
    await this.#checkAuth();
  }

  async login(token: string): Promise<void> {
    await api('/api/login', { token });
    await this.#checkAuth();
  }

  /**
   * Makes a picture the person's own: the middle square of it, shrunk to
   * 256 pixels, so any photo will do. Throws, so the menu can say what went wrong.
   */
  async setAvatar(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) throw new Error('That is not a picture.');
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error('That picture could not be opened.');
    }
    const SIZE = 256;
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
    bitmap.close();
    // WebP where the browser can make it; others hand back a PNG instead.
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/webp', 0.9));
    if (!blob) throw new Error('That picture could not be prepared.');
    const res = await fetch('/api/me/avatar', { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: blob });
    if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'The picture could not be saved.');
    this.avatar = ((await res.json()) as { avatar: number }).avatar;
  }

  /** Goes back to initials. Throws, so the menu can say what went wrong. */
  async clearAvatar(): Promise<void> {
    await api('/api/me/avatar', undefined, 'DELETE');
    this.avatar = undefined;
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
      [this.folders, this.roots] = await Promise.all([api<FolderInfo[]>('/api/folders'), api<FolderRoot[]>('/api/roots')]);
    } catch (err) {
      this.#fail(err);
    }
  }

  /** Reads how much of the plan's limits is used. `fresh` asks Claude Code again instead of taking the server's last answer. */
  async loadUsage(fresh = false): Promise<void> {
    this.usageLoading = true;
    try {
      const all = await api<PlanUsage[]>(`/api/usage${fresh ? '?fresh=1' : ''}`);
      for (const usage of all) this.usages[usage.provider] = usage;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) this.authed = false;
    } finally {
      this.usageLoading = false;
    }
  }

  /** Each agent's models and sign-in. `fresh` looks at the sign-ins again, after signing in on the server. */
  async loadModels(fresh = false): Promise<void> {
    if (this.providers.length && !fresh) return;
    try {
      this.providers = await api<ProviderModels[]>(`/api/models${fresh ? '?fresh=1' : ''}`);
    } catch (err) {
      // The chat works without the list; the pickers just stay hidden.
      if (err instanceof ApiError && err.status === 401) this.authed = false;
    }
  }

  // ---- changes to an existing chat. These throw, so whoever asked can say what went wrong. ----

  async renameChat(id: string, title: string): Promise<void> {
    await api(`/api/sessions/${id}`, { title }, 'PATCH');
    await this.loadSessions();
  }

  /** Makes a chat work in another folder under data/sessions, creating it if the name is new. */
  async moveChat(id: string, folder: string): Promise<void> {
    await api(`/api/sessions/${id}`, { folder }, 'PATCH');
    await Promise.all([this.loadSessions(), this.loadFolders()]);
  }

  /** What Claude Code can use in a folder ('' for everywhere). Throws, so the page can say what went wrong. */
  async loadCapabilities(folder: string, fresh = false, provider: Provider = 'claude'): Promise<Capabilities> {
    const query = new URLSearchParams({ provider, ...(folder ? { folder } : {}), ...(fresh ? { fresh: '1' } : {}) }).toString();
    return api<Capabilities>(`/api/capabilities${query ? `?${query}` : ''}`);
  }

  /** What is changed and not committed in a chat's git repository; null when it is not in one. Throws, so the list can say what went wrong. */
  async loadGitStatus(sessionId: string): Promise<GitStatus | null> {
    return (await api<{ status: GitStatus | null }>(`/api/sessions/${sessionId}/git`)).status;
  }

  /** Stops one of a chat's background tasks. Throws, so the list can say what went wrong. */
  async stopTask(sessionId: string, taskId: string): Promise<void> {
    await api(`/api/sessions/${sessionId}/tasks/${encodeURIComponent(taskId)}/stop`, {});
  }

  /** What fills a chat's context window. Throws, so the panel can say what went wrong. */
  async loadContext(id: string): Promise<ContextDetail> {
    return api<ContextDetail>(`/api/sessions/${id}/context`);
  }

  /** Creates a chat's deleted folder again, empty, so the chat can carry on. */
  async restoreFolder(id: string): Promise<void> {
    try {
      await api(`/api/sessions/${id}`, { restoreFolder: true }, 'PATCH');
      await Promise.all([this.loadSessions(), this.loadFolders()]);
    } catch (err) {
      this.#fail(err);
    }
  }

  /** Creates an empty folder under data/sessions and returns its path from there. Throws, so the form can say what went wrong. */
  async createFolder(path: string): Promise<string> {
    const { name } = await api<{ name: string }>('/api/folders', { path });
    await this.loadFolders();
    return name;
  }

  /** Folders on the server computer, for the picker. Throws, so the picker can say what went wrong. */
  async browse(path?: string): Promise<BrowseListing> {
    return api<BrowseListing>(`/api/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`);
  }

  /** Adds a folder outside data/sessions and returns its real path, where a chat can start. Throws, so the picker can say what went wrong. */
  async addRoot(path: string): Promise<string> {
    const { path: real } = await api<{ path: string }>('/api/roots', { path });
    await this.loadFolders();
    return real;
  }

  /** Takes an added folder off the list; its files stay. Throws, so the dialog can say what went wrong. */
  async removeRoot(path: string): Promise<void> {
    await api('/api/roots', { path }, 'DELETE');
    if (this.route.name === 'new' && this.route.folder && within(this.route.folder, path)) location.hash = '#/new';
    // The open chat worked in it: it is no longer one clack has.
    if (this.sessionId && this.meta && within(this.meta.folder, path)) location.hash = '#/new';
    await Promise.all([this.loadSessions(), this.loadFolders()]);
  }

  /** Deletes a chat folder and everything in it. Throws, so the dialog can say what went wrong. */
  async deleteFolder(path: string): Promise<void> {
    await api('/api/folders', { path }, 'DELETE');
    // A new-chat page offering that folder would offer one that is gone.
    if (this.route.name === 'new' && this.route.folder && within(this.route.folder, path)) location.hash = '#/new';
    await Promise.all([this.loadSessions(), this.loadFolders()]);
  }

  /**
   * The folders worth offering in a list: the top-level ones and any that
   * hold chats. Deeper folders inside projects can still be typed or picked
   * in the sidebar's tree.
   */
  get pickableFolders(): FolderInfo[] {
    const used = new Set(this.sessions.map((chat) => chat.folder));
    const roots = new Set(this.roots.map((root) => root.path));
    return this.folders
      .filter((folder) => (!isOutside(folder.name) && !folder.name.includes('/')) || roots.has(folder.name) || used.has(folder.name))
      .sort((a, b) => b.modified - a.modified);
  }

  async archiveChat(id: string, archived: boolean): Promise<void> {
    try {
      await api(`/api/sessions/${id}`, { archived }, 'PATCH');
      await this.loadSessions();
    } catch (err) {
      this.#fail(err);
    }
  }

  async deleteChat(id: string): Promise<void> {
    await api(`/api/sessions/${id}`, undefined, 'DELETE');
    // Leave before the list refreshes, so the page never shows a chat that is gone.
    if (this.sessionId === id) location.hash = '#/new';
    await this.loadSessions();
  }

  /** Starts a chat in a folder under data/sessions, creating the folder if the name is new. */
  async newSession(folder: string): Promise<void> {
    try {
      const { sessionId } = await api<{ sessionId: string }>('/api/sessions', { folder });
      location.hash = `#/s/${sessionId}`;
      void this.loadFolders();
    } catch (err) {
      this.#fail(err);
    }
  }

  // ---- the data directory ---------------------------------------------------------

  async loadDir(path: string): Promise<void> {
    try {
      this.tree[path] = await api<FileListing>(`/api/files?path=${encodeURIComponent(path)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // The folder was removed since the tree last looked.
        delete this.tree[path];
        delete this.treeOpen[path];
      } else {
        this.#fail(err);
      }
    }
  }

  toggleDir(path: string): void {
    this.treeOpen[path] = !this.treeOpen[path];
    if (this.treeOpen[path]) void this.loadDir(path);
  }

  /** Reads every unfolded folder again, and the open file with them. */
  async refreshData(): Promise<void> {
    const open = Object.keys(this.treeOpen).filter((path) => this.treeOpen[path]);
    await Promise.all(open.map((path) => this.loadDir(path)));
    if (this.file) await this.openFile(this.file.path);
  }

  async openFile(path: string): Promise<void> {
    this.fileLoading = path;
    try {
      const preview = await api<FilePreview>(`/api/files/preview?path=${encodeURIComponent(path)}`);
      // A slow answer must not replace a file picked after it.
      if (this.fileLoading === path) this.file = preview;
    } catch (err) {
      if (this.file?.path === path) this.file = null;
      this.#fail(err);
    } finally {
      if (this.fileLoading === path) this.fileLoading = null;
    }
  }

  closeFile(): void {
    this.file = null;
    this.fileLoading = null;
  }

  async loadTerminals(): Promise<void> {
    if (!this.terminalEnabled) return;
    try {
      this.terminals = await api<TerminalInfo[]>('/api/terminals');
      if (!this.terminals.some((t) => t.id === this.terminalId)) this.terminalId = this.terminals.at(-1)?.id ?? null;
    } catch (err) {
      this.#fail(err);
    }
  }

  /** Starts a shell in a folder of the data directory and brings its tab to the front. */
  async newTerminal(path = ''): Promise<void> {
    try {
      const terminal = await api<TerminalInfo>('/api/terminals', { path });
      if (!this.terminals.some((t) => t.id === terminal.id)) this.terminals.push(terminal);
      this.terminalId = terminal.id;
      if (this.route.name !== 'data') location.hash = '#/data';
    } catch (err) {
      this.#fail(err);
    }
  }

  /** Ends a shell, and with it whatever was running there. */
  async closeTerminal(id: string): Promise<void> {
    try {
      await api(`/api/terminals/${id}`, undefined, 'DELETE');
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

  /** A model and effort for the open chat; a model of the other provider moves the chat over to it. */
  configure(model: string | null, effort: EffortLevel | null, provider: Provider = this.provider): void {
    if (this.sessionId) this.#send({ t: 'config', sessionId: this.sessionId, provider, model, effort });
  }

  /** Saves a file in the open chat's folder so it can be attached to a message. */
  async upload(file: File): Promise<Upload | null> {
    const id = this.sessionId;
    if (!id) return null;
    if (file.size > MAX_UPLOAD_BYTES) {
      this.error = `${file.name} is larger than 25 MB, which is the most that can be attached.`;
      return null;
    }
    try {
      const res = await fetch(`/api/sessions/${id}/files?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: file,
      });
      if (res.status === 401) this.authed = false;
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `${file.name} could not be attached (${res.status}).`);
      return (await res.json()) as Upload;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      return null;
    }
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
      if (me.name) this.userName = me.name;
      this.dataDir = me.dataDir ?? '';
      this.terminalEnabled = me.terminal === true;
      this.outsideFolders = me.outsideFolders === true;
      this.home = me.home ?? '';
      this.avatar = me.avatar;
      if (me.authed) {
        this.#connect();
        void this.loadSessions();
        void this.loadFolders();
        void this.loadModels();
        void this.loadUsage();
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
    // Back after a while: the limits may have moved, or started over, in the meantime.
    const stale = Object.values(this.usages).some((usage) => usage && Date.now() - usage.fetchedAt > 5 * 60_000);
    if (this.authed && stale) void this.loadUsage();
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
        this.#listTimer = setTimeout(() => {
          void this.loadSessions();
          void this.loadFolders();
        }, 150);
        break;
      case 'terminals_changed':
        void this.loadTerminals();
        break;
      case 'usage':
        this.usages[msg.usage.provider] = msg.usage;
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
      case 'item': {
        if (event.replaces) this.drafts = this.drafts.filter((d) => d.id !== event.replaces);
        // An item that replaces itself is one that changed (a todo list moving on): it keeps its place.
        const at = event.replaces === event.item.id ? this.items.findIndex((item) => item.id === event.item.id) : -1;
        if (at === -1) this.items.push(event.item);
        else this.items[at] = event.item;
        break;
      }
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
