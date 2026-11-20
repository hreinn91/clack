// Wire protocol shared by the server and the web UI.
// Types only: nothing in this file may have a runtime footprint.

/** The agent a chat runs on: Claude Code (Anthropic) or Codex (OpenAI). */
export type Provider = 'claude' | 'codex';
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto';
export type SessionState = 'idle' | 'running';
/**
 * How hard the model thinks. Claude uses low to max; Codex models add others
 * (minimal, ultra…). Which ones a model accepts is in its ModelOption.
 */
export type EffortLevel = string;

/** A model a signed-in account can use, with the effort levels it accepts. */
export type ModelOption = {
  provider: Provider;
  value: string;
  label: string;
  description: string;
  efforts: EffortLevel[];
  /** The effort the model uses when none is chosen, where the provider says. */
  defaultEffort?: EffortLevel;
  /** The provider's own default model. */
  isDefault?: boolean;
};

/** One provider's models, and whether it can be used at all on this server. */
export type ProviderModels = {
  provider: Provider;
  /** Installed and signed in. */
  available: boolean;
  /** Why it cannot be used, when it cannot. */
  reason?: string;
  /** The plan or kind of account it is signed in with ("max", "plus", "API key"). */
  plan?: string;
  models: ModelOption[];
};

/**
 * When an entry was written (milliseconds since epoch) and, for Claude's own
 * entries, the model that wrote it and the effort it ran at. All of it is
 * missing where the saved conversation does not say.
 */
export type Stamp = { ts?: number; model?: string; effort?: EffortLevel };

export type PlanStep = { label: string; status: 'pending' | 'in_progress' | 'completed'; taskId?: string };
export type PlanContent = { steps: PlanStep[]; markdown?: string };
export type PlanItem = Stamp & PlanContent & { kind: 'plan'; id: string };

/** One entry in a conversation transcript. */
export type Item = Stamp &
  (
    | PlanItem
    | { kind: 'user'; id: string; text: string }
    | { kind: 'text'; id: string; text: string; parent?: string }
    | { kind: 'thinking'; id: string; text: string; parent?: string }
    | {
        kind: 'tool';
        id: string;
        name: string;
        input: unknown;
        /** This tool call is displayed through its plan entry. */
        planId?: string;
        /** Set when the call was made by a subagent: the id of the tool call that spawned it. */
        parent?: string;
        result?: { text: string; isError: boolean };
      }
    | { kind: 'notice'; id: string; level: 'info' | 'error'; text: string }
    /** The chat moved to the other agent here; it was handed the conversation so far. */
    | { kind: 'divider'; id: string; from: Provider; to: Provider; fromModel?: string; toModel?: string }
  );

/** Content that is still streaming in. For kind 'tool', `text` is the tool name. */
export type Draft = { id: string; kind: 'text' | 'thinking' | 'tool'; text: string };

export type PermissionRequest = {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
  description?: string;
  reason?: string;
  /** Whether "always allow" can be offered for this request. */
  planId?: string;
  canAlways: boolean;
  /** What the "always" button says; the providers mean different things by it. */
  alwaysLabel?: string;
  /** An MCP server asking for details: a small form instead of yes and no. */
  form?: { message: string; fields: FormField[]; url?: string };
};

/** One field of a form an MCP server asks to be filled in. */
export type FormField = {
  name: string;
  label: string;
  description?: string;
  type: 'string' | 'number' | 'boolean' | 'choice';
  required: boolean;
  options?: string[];
};

export type PermissionDecision = 'allow' | 'always' | 'deny';

export type SessionMeta = {
  sessionId: string;
  /** The agent the chat runs on now. A chat that switched has run on the other one before. */
  provider: Provider;
  /** Absolute working directory on the server. */
  cwd: string;
  /** The same directory as shown to people: its name under data/sessions. */
  folder: string;
  state: SessionState;
  mode: PermissionMode;
  /** Chosen model and effort; null leaves the choice to the agent. */
  model: string | null;
  effort: EffortLevel | null;
  /** The model the agent reports it is actually running, once it has started. */
  activeModel?: string;
  title?: string;
  /** How full the model's context window is, as of the last finished turn. Unknown until a turn has run. */
  context?: ContextUsage;
  /** The chat's folder was deleted: it can be read, but not continued until the folder is back. */
  folderMissing: boolean;
  /** The git branch the folder is on, when it is in a git repository under data/sessions. */
  gitBranch?: string;
  /** Work Claude Code is doing in the background in this chat, then what finished there lately. */
  tasks: BackgroundTask[];
  /** Uncommitted changes in the folder's git repository, counted; missing when it is not in one. */
  gitChanges?: GitSummary;
};

/** How much is changed and not committed in a chat's git repository. */
export type GitSummary = {
  /** Files with any change: staged, not staged, untracked or in conflict. */
  files: number;
  untracked: number;
  /** Lines added and removed over all of them (untracked files count as all added). */
  added: number;
  deleted: number;
  checkedAt: number;
};

/** One changed file. A file changed both in the index and after it shows up twice, once per area. */
export type GitChange = {
  /** From the repository's top folder, with forward slashes. */
  path: string;
  /** For a rename or copy: where it came from. */
  from?: string;
  area: 'staged' | 'unstaged' | 'untracked' | 'conflict';
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'type changed' | 'untracked' | 'conflict';
  added?: number;
  deleted?: number;
  binary?: boolean;
};

/** One changed file's changes, as a unified diff, for the diff view. */
export type GitDiff = {
  path: string;
  from?: string;
  area: GitChange['area'];
  /** The diff, starting at its first "@@" line. Empty for a binary file or one too big to show. */
  diff: string;
  binary: boolean;
  /** Too big to show; the numbers in the list still say how much changed. */
  tooLarge: boolean;
  /** Only the start is shown. */
  truncated: boolean;
  /** With the whole file around the changes, rather than a few lines. */
  whole: boolean;
};

/** The full picture behind GitSummary, for the list under the chat's title. */
export type GitStatus = GitSummary & {
  /** The repository's top folder, from data/sessions. */
  root: string;
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  changes: GitChange[];
  /** More files changed than are listed. */
  truncated: boolean;
};

/** A shell command, agent or watcher Claude Code runs in the background of a chat. */
export type BackgroundTask = {
  id: string;
  kind: 'agent' | 'shell' | 'monitor' | 'workflow' | 'other';
  description: string;
  /** For an agent: which kind ("general-purpose", "Explore", a custom agent's name). */
  agentType?: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  /** When this server saw it start, and end; milliseconds since epoch. */
  startedAt: number;
  endedAt?: number;
  toolUses?: number;
  tokens?: number;
  /** The tool an agent used last, while it runs. */
  lastTool?: string;
  /** A line about where it stands, or how it ended. */
  summary?: string;
  error?: string;
};

/** Tokens in the conversation against the most the model can hold; `percent` is 0 to 100. */
export type ContextUsage = { tokens: number; max: number; percent: number };

/**
 * What fills a chat's context window, as Claude Code's /context counts it.
 * Paths are shortened: "./" for the chat's folder, "~/" for the home folder.
 */
export type ContextDetail = ContextUsage & {
  provider: Provider;
  model: string;
  measuredAt: number;
  /** Where Claude Code compacts the conversation on its own, in tokens; missing when it does not. */
  autoCompactAt?: number;
  /**
   * Rows with tokens in them. 'used' is in the window, 'free' is room left, 'buffer' is held back for
   * compacting, 'deferred' is tool definitions that are only loaded when needed (not counted).
   */
  categories: { id: string; name: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }[];
  /** How the conversation itself splits up; rows with nothing in them are left out. */
  messages: { label: string; tokens: number }[];
  memoryFiles: { path: string; type: string; tokens: number }[];
  mcpServers: { name: string; tools: number; tokens: number }[];
  skills?: { included: number; total: number; tokens: number };
  agents: { name: string; tokens: number }[];
};

/** One of the plan's limits: how much of it is used (0 to 100) and when it starts over. */
export type UsageWindow = { id: string; label: string; used: number; resetsAt?: number };

/** How much of a provider's plan limits is used. `available` is false where plan limits do not apply, such as with an API key. */
export type PlanUsage = {
  provider: Provider;
  available: boolean;
  /** The kind of subscription: "pro", "max", "plus", "team" and so on. */
  plan?: string;
  windows: UsageWindow[];
  /** Pay-as-you-go usage beyond the plan, when it is switched on. */
  extra?: { used: number; limit: number | null; currency: string | null; percent: number | null };
  /** Prepaid credits that take over when the plan's limits run out (Codex). */
  credits?: { balance: string | null; unlimited: boolean };
  fetchedAt: number;
  /** Why there are no figures, when asking for them failed. */
  error?: string;
};

export type LogKind = 'prompt' | 'response' | 'tool' | 'tool_result' | 'permission' | 'notice';

/** One line of the activity log. */
export type LogEntry = {
  id: string;
  /** Milliseconds since epoch. */
  ts: number;
  sessionId: string;
  folder: string;
  kind: LogKind;
  text: string;
  provider?: Provider;
  /** For responses: the model that wrote it. */
  model?: string;
  error?: boolean;
};

export type LogPage = {
  /** Directory on the server that holds the full log files. */
  dir: string;
  entries: LogEntry[];
};

export type SessionEvent =
  | { t: 'item'; item: Item; replaces?: string }
  | { t: 'draft'; draft: Draft }
  | { t: 'plan_delta'; id: string; text: string }
  | { t: 'draft_delta'; id: string; text: string }
  | { t: 'draft_end'; id: string }
  | { t: 'drafts_clear' }
  | { t: 'tool_result'; id: string; text: string; isError: boolean }
  | { t: 'permission'; request: PermissionRequest }
  | { t: 'permission_done'; id: string }
  | { t: 'meta'; meta: SessionMeta };

export type ServerMessage =
  | {
      t: 'snapshot';
      sessionId: string;
      meta: SessionMeta;
      items: Item[];
      drafts: Draft[];
      pending: PermissionRequest[];
    }
  | { t: 'event'; sessionId: string; event: SessionEvent }
  | { t: 'sessions_changed' }
  /** A terminal was opened or went away: the list should be fetched again. */
  | { t: 'terminals_changed' }
  /** Fresh figures for the plan's limits. */
  | { t: 'usage'; usage: PlanUsage }
  | { t: 'log'; entry: LogEntry }
  | { t: 'error'; message: string; sessionId?: string };

export type ClientMessage =
  | { t: 'open'; sessionId: string }
  | { t: 'close' }
  | { t: 'prompt'; sessionId: string; text: string }
  | { t: 'interrupt'; sessionId: string }
  | {
      t: 'permission';
      sessionId: string;
      id: string;
      decision: PermissionDecision;
      /** Answers for AskUserQuestion, keyed by question text. */
      answers?: Record<string, string>;
    }
  | { t: 'mode'; sessionId: string; mode: PermissionMode }
  /** A model of the other provider switches the chat over to it, handing the conversation so far along. */
  | { t: 'config'; sessionId: string; provider: Provider; model: string | null; effort: EffortLevel | null }
  /** Start or stop receiving new log entries as they are written. */
  | { t: 'logs'; on: boolean };

export type SessionSummary = {
  sessionId: string;
  /** The agent it runs on now. */
  provider: Provider;
  /** The model it last ran, where known. */
  model?: string;
  title: string;
  folder: string;
  gitBranch?: string;
  lastModified: number;
  running: boolean;
  /** Put away: kept, but out of the main list until it is taken back out or written in again. */
  archived: boolean;
  /** The folder it works in no longer exists. Shown with the archived chats until the folder is back. */
  missing: boolean;
};

/**
 * What Claude Code can use in a folder: MCP servers and their tools, skills,
 * agents, custom slash commands, and its built-in tools. `folder` is null for
 * the top of data/sessions, where only your own (user-wide) setup applies.
 */
export type Capabilities = {
  provider: Provider;
  folder: string | null;
  measuredAt: number;
  mcpServers: {
    name: string;
    status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled';
    /** Where it is set up: user, project, local, claudeai, plugin, managed… */
    scope?: string;
    version?: string;
    error?: string;
    tools: { name: string; description?: string; readOnly?: boolean; destructive?: boolean }[];
  }[];
  /**
   * Every skill Claude Code loads. `invocable` is false for one only Claude can use (it is not a slash
   * command); `description` is empty when Claude Code gives none (some built-in skills).
   */
  skills: { name: string; description: string; source: string; plugin?: string; invocable: boolean }[];
  agents: { name: string; description: string; model?: string }[];
  /** Slash commands that are not Claude Code's own and not skills. */
  commands: { name: string; description: string; argumentHint?: string }[];
  /**
   * Claude Code's built-in tools, as the most recent chat to start reported them (it only says so
   * when a conversation begins). Missing until a chat has started since this list was first kept.
   */
  tools?: { names: string[]; seenAt: number };
};

/** A folder under data/sessions; `name` is its path from there, with forward slashes ("work/client-a"). */
export type FolderInfo = {
  name: string;
  modified: number;
  /** The folder is the top of a git repository (it has a .git of its own). */
  repo?: boolean;
  /** For a repository: the branch it is on, or the start of the commit's hash when detached. */
  branch?: string;
};

/** A folder outside data/sessions that was added to clack: chats can work in it and below it, and it has its own tree. */
export type FolderRoot = {
  /** The real, absolute path. Folders and chats in it use absolute paths as their names. */
  path: string;
  /** The path for showing, with the home folder as ~ ("~/code/site"). */
  label: string;
  /** The folder is no longer there (deleted, renamed, or a disk that is not mounted). */
  missing: boolean;
};

/** One folder of the server computer, as the folder picker shows it: the folders inside it. */
export type BrowseListing = {
  path: string;
  label: string;
  /** The folder it is in; null at the top of the disk. */
  parent: string | null;
  home: string;
  entries: { name: string; repo: boolean }[];
  truncated: boolean;
  repo: boolean;
  branch?: string;
  /** Chats can already work here: it is an added folder or inside one. */
  added: boolean;
  /** Inside clack's own data directory, which cannot be added. */
  inData: boolean;
};

/** One file or folder under the data directory. */
export type FileEntry = { name: string; kind: 'dir' | 'file'; size: number; modified: number };

/** Paths here are relative to the data directory, with forward slashes; '' is the directory itself. */
export type FileListing = {
  path: string;
  entries: FileEntry[];
  /** True when the folder holds more than the server is willing to list. */
  truncated: boolean;
};

export type FilePreview = {
  path: string;
  size: number;
  modified: number;
  kind: 'text' | 'image' | 'binary';
  /** For text: the start of the file. */
  text?: string;
  /** True when the file is longer than `text`. */
  truncated?: boolean;
};

/**
 * A file attached to a chat. `path` is where it was saved, relative to the
 * chat's folder. Attached files travel to Claude as text at the end of the
 * prompt: a blank line, the line "Attached files:", then one "- path" line
 * per file. The UI recognises that ending and shows the files instead.
 */
export type Upload = { name: string; path: string; size: number };

/** A shell running on the server. `cwd` is where it was started, relative to the data directory. */
export type TerminalInfo = { id: string; title: string; cwd: string; created: number };

// What travels over a terminal's own WebSocket (/ws/term/<id>).
export type TerminalClientMessage = { t: 'in'; data: string } | { t: 'resize'; cols: number; rows: number };
export type TerminalServerMessage = { t: 'out'; data: string } | { t: 'exit'; code: number };

/**
 * Everything but `authed` is sent only once signed in: the name the person's
 * own messages are signed with, where the data directory is on the server,
 * and whether the server offers terminals.
 */
export type Me = {
  authed: boolean;
  name?: string;
  dataDir?: string;
  terminal?: boolean;
  outsideFolders?: boolean;
  home?: string;
  /** When the person's own picture was saved; absent when they have none. */
  avatar?: number;
};
