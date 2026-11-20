import type {
  BackgroundTask,
  Capabilities,
  ContextDetail,
  ContextUsage,
  Draft,
  EffortLevel,
  Item,
  LogKind,
  ModelOption,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  PlanUsage,
  Provider,
} from '../../../shared/protocol.ts';

// The seam between a chat and the agent it runs on. A chat (LiveSession) keeps
// what the UI shows: the transcript, drafts, permission cards and who is
// looking. An AgentRun drives one provider's agent for it and reports back
// through the RunHost. An AgentBackend is everything else a provider offers:
// its models, plan limits, tools, and the conversations it has saved.

export type { Provider };

export type ToolItem = Extract<Item, { kind: 'tool' }>;

/** A conversation a provider has saved, as its list shows it. */
export type StoredSession = {
  provider: Provider;
  sessionId: string;
  cwd: string;
  title?: string;
  gitBranch?: string;
  /** Milliseconds since epoch. */
  lastModified: number;
  archived: boolean;
  model?: string;
  effort?: EffortLevel;
};

/** What a run reports to, and asks of, the chat it belongs to. */
export interface RunHost {
  readonly chatId: string;
  readonly cwd: string;
  readonly mode: PermissionMode;
  readonly model: string | null;
  readonly effort: EffortLevel | null;

  /** The agent is working on a turn. */
  running(): void;
  /** The turn is over (finished, stopped or failed). */
  turnEnded(): void;
  /** The agent's process went away; the chat is idle and nothing it asked can be answered any more. */
  processEnded(): void;
  /** The provider has written the conversation down, so it is resumed from now on. */
  saved(): void;
  /** The model the agent says it is running. */
  setActiveModel(model: string | undefined): void;
  /** The mode the agent reports it is in; `note` is said in the chat when it differs from what was asked. */
  adoptMode(mode: PermissionMode, note?: string): void;
  setContext(usage: ContextUsage): void;
  /** Background tasks changed; the chat asks the run for the list. */
  tasksChanged(): void;

  startDraft(kind: Draft['kind'], text: string): string;
  appendDraft(id: string, text: string): void;
  endDraft(id: string): void;
  /** Removes and returns the oldest draft of a kind, once its finished content has arrived. */
  takeDraft(kind: Item['kind']): string | undefined;
  clearDrafts(): void;
  addItem(item: Item, replaces?: string): void;
  /** Puts an item that is already in the transcript in again, changed (a todo list that moved on). */
  updateItem(item: Item): void;
  tool(id: string): ToolItem | undefined;
  toolResult(id: string, text: string, isError: boolean): void;

  /** Shows a permission card. The answer comes back through AgentRun.answer. */
  ask(request: PermissionRequest): void;
  /** The card is answered or no longer needed. */
  answered(id: string): void;

  notice(level: 'info' | 'error', text: string): void;
  log(kind: LogKind, text: string, error?: boolean): void;
  /** Files in the folder may have changed: the git summary is looked at again. */
  filesChanged(delay?: number): void;
  /** The whole transcript changed (replies signed afterwards): everyone gets a fresh snapshot. */
  resnapshot(): void;
}

/** One provider's agent working for one chat. It may stop and start its process many times. */
export interface AgentRun {
  readonly provider: Provider;
  /** The provider's id for the conversation; unknown for Codex until its thread exists. */
  readonly sessionId: string | undefined;
  /** A process is running for this chat. */
  readonly alive: boolean;
  /** The provider has saved the conversation (it is resumed, not created, next time). */
  readonly saved: boolean;
  /** Background tasks still going, which end if the process is stopped. */
  readonly runningTasks: number;

  /** Sends a message. `text` is what the agent reads; the chat has already shown its own copy. */
  prompt(id: string, text: string): Promise<void>;
  interrupt(): Promise<void>;
  setMode(mode: PermissionMode): Promise<void>;
  /** A new model or effort, from the next message on. */
  configure(model: string | null, effort: EffortLevel | null): Promise<void>;
  answer(id: string, decision: PermissionDecision, answers?: Record<string, string>): void;
  stopTask(id: string): Promise<void>;
  tasks(): BackgroundTask[];
  contextDetail(): Promise<ContextDetail>;
  /** Stops the process without waiting. */
  shutdown(): void;
  /** Stops the process and waits until it has really gone. */
  settle(): Promise<void>;
  /** The chat now works in another folder (the process is already stopped). */
  relocate(cwd: string): Promise<void>;
}

/** Everything one provider offers, besides running a chat. */
export interface AgentBackend {
  readonly provider: Provider;
  /** The agent's name, as people know it: "Claude", "Codex". */
  readonly name: string;
  /** Switched on for this server (Codex can be turned off, or not be installed). */
  enabled(): boolean;
  /** Whether it can be used now (installed and signed in), with which plan, or why not. `fresh` asks again. */
  status(fresh?: boolean): Promise<{ available: boolean; plan?: string; reason?: string }>;
  models(): Promise<ModelOption[]>;
  usage(fresh: boolean): Promise<PlanUsage>;
  /** What the agent can use in a folder; `folder` is the folder's label, '' for data/sessions itself. */
  capabilities(folder: string, fresh: boolean): Promise<Capabilities>;
  /** The conversations it has saved, anywhere on this computer. */
  list(): Promise<StoredSession[]>;
  find(sessionId: string): Promise<StoredSession | undefined>;
  history(sessionId: string): Promise<Item[]>;
  rename(sessionId: string, title: string): Promise<void>;
  setArchived(sessionId: string, archived: boolean): Promise<void>;
  remove(sessionId: string): Promise<void>;
  /** A run for a chat: a saved conversation to resume, or a new one (`sessionId` is a wish, where the provider takes one). */
  run(host: RunHost, sessionId: string | undefined, saved: boolean): AgentRun;
  /** Stops everything it runs, when the server shuts down. */
  shutdown(): void;
}
