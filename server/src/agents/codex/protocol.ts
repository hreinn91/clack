// The part of the Codex app-server protocol clack uses, written out by hand
// from the types `codex app-server generate-ts --experimental` produces
// (`npm run codex:types` writes them to server/codex-types to compare with).
// Checked against Codex CLI 0.170.0. Types only.

export type RequestId = string | number;

export type ReasoningEffort = string;

export type AskForApproval = 'untrusted' | 'on-request' | 'never';
export type ApprovalsReviewer = 'user' | 'auto_review';
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
export type SandboxPolicy =
  | { type: 'dangerFullAccess' }
  | { type: 'readOnly'; networkAccess: boolean }
  | { type: 'externalSandbox'; networkAccess: 'restricted' | 'enabled' }
  | { type: 'workspaceWrite'; writableRoots: string[]; networkAccess: boolean; excludeTmpdirEnvVar: boolean; excludeSlashTmp: boolean };

export type CollaborationMode = {
  mode: 'plan' | 'default';
  settings: { model: string; reasoning_effort: ReasoningEffort | null; developer_instructions: string | null };
};

export type UserInput =
  | { type: 'text'; text: string; text_elements: unknown[] }
  | { type: 'image'; url: string }
  | { type: 'localImage'; path: string };

export type ThreadSourceKind = 'cli' | 'vscode' | 'exec' | 'appServer' | 'subAgent' | 'unknown';

export type Thread = {
  id: string;
  preview: string;
  ephemeral: boolean;
  modelProvider: string;
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  /** Seconds since epoch. */
  createdAt: number;
  updatedAt: number;
  status: { type: 'notLoaded' | 'idle' | 'systemError' | 'active' };
  cwd: string;
  parentThreadId: string | null;
  gitInfo: { sha: string | null; branch: string | null; originUrl: string | null } | null;
  name: string | null;
  turns: Turn[];
};

export type TurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress';

export type TurnError = { message: string; codexErrorInfo: unknown; additionalDetails: string | null };

export type Turn = {
  id: string;
  items: ThreadItem[];
  status: TurnStatus;
  error: TurnError | null;
  /** Seconds since epoch. */
  startedAt: number | null;
  completedAt: number | null;
};

export type FileUpdateChange = {
  path: string;
  kind: { type: 'add' } | { type: 'delete' } | { type: 'update'; move_path: string | null };
  diff: string;
};

type Timed = { startedAtMs?: number | null; completedAtMs?: number | null };

export type ThreadItem = Timed &
  (
    | { type: 'userMessage'; id: string; content: UserInput[] }
    | { type: 'agentMessage'; id: string; text: string; phase: string | null }
    | { type: 'plan'; id: string; text: string }
    | { type: 'reasoning'; id: string; summary: string[]; content: string[] }
    | {
        type: 'commandExecution';
        id: string;
        command: string;
        cwd: string;
        processId: string | null;
        status: 'inProgress' | 'completed' | 'failed' | 'declined';
        aggregatedOutput: string | null;
        exitCode: number | null;
        durationMs: number | null;
      }
    | { type: 'fileChange'; id: string; changes: FileUpdateChange[]; status: 'inProgress' | 'completed' | 'failed' | 'declined' }
    | {
        type: 'mcpToolCall';
        id: string;
        server: string;
        tool: string;
        status: 'inProgress' | 'completed' | 'failed';
        arguments: unknown;
        result: { content: unknown[]; structuredContent: unknown } | null;
        error: { message: string } | null;
      }
    | { type: 'dynamicToolCall'; id: string; tool: string; arguments: unknown; status: string; success: boolean | null }
    | {
        type: 'collabAgentToolCall';
        id: string;
        tool: string;
        status: string;
        prompt: string | null;
        model: string | null;
        agentsStates: Record<string, { status: string; message: string | null } | undefined>;
      }
    | { type: 'webSearch'; id: string; query: string; results: unknown[] | null }
    | { type: 'imageView'; id: string; path: string }
    | { type: 'imageGeneration'; id: string; [key: string]: unknown }
    | { type: 'enteredReviewMode' | 'exitedReviewMode'; id: string; review: string }
    | { type: 'contextCompaction'; id: string }
    | { type: 'hookPrompt' | 'functionCallOutput' | 'subAgentActivity' | 'sleep'; id: string }
  );

export type TokenUsageBreakdown = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};

export type ThreadTokenUsage = { total: TokenUsageBreakdown; last: TokenUsageBreakdown; modelContextWindow: number | null };

export type Model = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  supportedReasoningEfforts: { reasoningEffort: ReasoningEffort; description: string }[];
  defaultReasoningEffort: ReasoningEffort;
  isDefault: boolean;
};

export type RateLimitWindow = { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null };

export type RateLimitSnapshot = {
  limitId: string | null;
  limitName: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  credits: { hasCredits: boolean; unlimited: boolean; balance: string | null } | null;
  planType: string | null;
};

export type Account =
  | { type: 'apiKey' }
  | { type: 'chatgpt'; email: string | null; planType: string; workspaceName: string | null }
  | { type: 'amazonBedrock' }
  | { type: 'gcp' };

export type McpServerStatus = {
  name: string;
  runtimeStatus: 'notStarted' | 'starting' | 'connected' | 'authenticationRequired' | 'failed' | 'cancelled' | 'disabled' | null;
  pluginId: string | null;
  serverInfo: { name?: string; version?: string } | null;
  tools: Record<string, { name: string; title?: string; description?: string; annotations?: Record<string, unknown> } | undefined>;
  toolsError: string | null;
  authStatus: 'unknown' | 'unsupported' | 'notLoggedIn' | 'bearerToken' | 'oAuth';
};

export type SkillMetadata = {
  name: string;
  description: string;
  shortDescription?: string;
  path: string;
  scope: 'user' | 'repo' | 'system' | 'admin';
  enabled: boolean;
  pluginId: string | null;
};

export type ElicitationProperty = {
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  oneOf?: { const: string; title?: string }[];
  items?: { enum?: string[] };
};

// ---- requests the server sends to the client ----

export type CommandApprovalParams = {
  threadId: string;
  turnId: string;
  itemId: string;
  reason?: string | null;
  command?: string | null;
  cwd?: string | null;
  networkApprovalContext?: { host: string; protocol: string } | null;
  availableDecisions?: unknown[] | null;
};

export type FileChangeApprovalParams = { threadId: string; turnId: string; itemId: string; reason?: string | null; grantRoot?: string | null };

export type PermissionsApprovalParams = {
  threadId: string;
  turnId: string;
  itemId: string;
  cwd: string;
  reason: string | null;
  permissions: {
    network: { enabled: boolean | null } | null;
    fileSystem: { read: string[] | null; write: string[] | null } | null;
  };
};

export type UserInputParams = {
  threadId: string;
  turnId: string;
  itemId: string;
  questions: { id: string; header: string; question: string; isOther: boolean; isSecret: boolean; options: { label: string; description: string }[] | null }[];
};

export type ElicitationParams = { threadId: string; turnId: string | null; serverName: string } & (
  | { mode: 'form'; message: string; requestedSchema: { properties?: Record<string, ElicitationProperty | undefined>; required?: string[] } }
  | { mode: 'url'; message: string; url: string; elicitationId: string }
  | { mode: string; message?: string }
);
