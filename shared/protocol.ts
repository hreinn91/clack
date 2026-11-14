// Wire protocol shared by the server and the web UI.
// Types only: nothing in this file may have a runtime footprint.

export type PermissionMode = 'default' | 'acceptEdits' | 'plan';
export type SessionState = 'idle' | 'running';
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** A model the signed-in Claude account can use, with the effort levels it accepts. */
export type ModelOption = {
  value: string;
  label: string;
  description: string;
  efforts: EffortLevel[];
};

/** One entry in a conversation transcript. */
export type Item =
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
  | { kind: 'notice'; id: string; level: 'info' | 'error'; text: string };

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
};

export type FolderInfo = { name: string; modified: number };

export type Me = { authed: boolean };
