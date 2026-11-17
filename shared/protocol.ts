// Wire protocol shared by the server and the web UI.
// Types only: nothing in this file may have a runtime footprint.

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto';
export type SessionState = 'idle' | 'running';
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** A model the signed-in Claude account can use, with the effort levels it accepts. */
export type ModelOption = {
  value: string;
  label: string;
  description: string;
  efforts: EffortLevel[];
};

/**
 * When an entry was written (milliseconds since epoch) and, for Claude's own
 * entries, the model that wrote it and the effort it ran at. All of it is
 * missing where the saved conversation does not say.
 */
export type Stamp = { ts?: number; model?: string; effort?: EffortLevel };

/** One entry in a conversation transcript. */
export type Item = Stamp &
  (
    | { kind: 'user'; id: string; text: string }
    | { kind: 'text'; id: string; text: string; parent?: string }
    | { kind: 'thinking'; id: string; text: string; parent?: string }
    | {
        kind: 'tool';
        id: string;
        name: string;
        input: unknown;
        /** Set when the call was made by a subagent: the id of the tool call that spawned it. */
        parent?: string;
        result?: { text: string; isError: boolean };
      }
    | { kind: 'notice'; id: string; level: 'info' | 'error'; text: string }
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
  canAlways: boolean;
};

export type PermissionDecision = 'allow' | 'always' | 'deny';

export type SessionMeta = {
  sessionId: string;
  /** Absolute working directory on the server. */
  cwd: string;
  /** The same directory as shown to people: its name under data/sessions. */
  folder: string;
  state: SessionState;
  mode: PermissionMode;
  /** Chosen model and effort; null leaves the choice to Claude Code. */
  model: string | null;
  effort: EffortLevel | null;
  /** The model Claude Code reports it is actually running, once it has started. */
  activeModel?: string;
  title?: string;
  /** How full the model's context window is, as of the last finished turn. Unknown until a turn has run. */
  context?: ContextUsage;
};

/** Tokens in the conversation against the most the model can hold; `percent` is 0 to 100. */
export type ContextUsage = { tokens: number; max: number; percent: number };

/** One of the plan's limits: how much of it is used (0 to 100) and when it starts over. */
export type UsageWindow = { id: string; label: string; used: number; resetsAt?: number };

/** How much of the Claude plan's limits is used. `available` is false where plan limits do not apply, such as with an API key. */
export type PlanUsage = {
  available: boolean;
  /** The kind of subscription: "pro", "max", "team" and so on. */
  plan?: string;
  windows: UsageWindow[];
  /** Pay-as-you-go usage beyond the plan, when it is switched on. */
  extra?: { used: number; limit: number | null; currency: string | null; percent: number | null };
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
  | { t: 'config'; sessionId: string; model: string | null; effort: EffortLevel | null }
  /** Start or stop receiving new log entries as they are written. */
  | { t: 'logs'; on: boolean };

export type SessionSummary = {
  sessionId: string;
  title: string;
  folder: string;
  gitBranch?: string;
  lastModified: number;
  running: boolean;
  /** Put away: kept, but out of the main list until it is taken back out or written in again. */
  archived: boolean;
};

export type FolderInfo = { name: string; modified: number };

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
export type Me = { authed: boolean; name?: string; dataDir?: string; terminal?: boolean };
