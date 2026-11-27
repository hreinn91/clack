import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { config } from '../../config.ts';
import { toolToken } from '../clackTools.ts';
import type {
  BackgroundTask,
  ContextDetail,
  EffortLevel,
  FormField,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  Stamp,
} from '../../../../shared/protocol.ts';
import { insideDir } from '../../folders.ts';
import { planId, STEPS_TOOL, stepsFromInput } from '../types.ts';
import type { AgentRun, RunHost } from '../types.ts';
import { appServer } from './appserver.ts';
import type { ThreadListener } from './appserver.ts';
import { itemsOf, resultOf, toolOf } from './items.ts';
import { defaultModel, refreshCodexUsage, sandboxPolicy } from './state.ts';
import type {
  ApprovalsReviewer,
  AskForApproval,
  CommandApprovalParams,
  ElicitationParams,
  RequestId,
  FileChangeApprovalParams,
  PermissionsApprovalParams,
  ThreadItem,
  ThreadTokenUsage,
  Turn,
  UserInput,
  UserInputParams,
} from './protocol.ts';

const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/** A question card's answer, waiting to be sent back to the app-server. */
type Pending = {
  rpc: RequestId;
  request: PermissionRequest;
  reply: (decision: PermissionDecision, answers?: Record<string, string>) => unknown;
};

/** How each of clack's modes is asked of Codex: approvals, who reviews them, and the sandbox. */
function modeSettings(mode: PermissionMode): { approvalPolicy: AskForApproval; approvalsReviewer: ApprovalsReviewer; write: boolean } {
  switch (mode) {
    case 'auto':
      // Codex's own reviewer answers the approvals; only what it would refuse comes back as a question.
      return { approvalPolicy: 'on-request', approvalsReviewer: 'auto_review', write: true };
    case 'acceptEdits':
      return { approvalPolicy: 'on-request', approvalsReviewer: 'user', write: true };
    case 'plan':
    case 'default':
      return { approvalPolicy: 'on-request', approvalsReviewer: 'user', write: false };
  }
}

/**
 * Pictures among a message's attached files, which Codex is sent as pictures
 * too. The files stay listed in the text as well (see Upload in the protocol).
 */
function attachedPictures(text: string, cwd: string): string[] {
  const list = text.split('\n\nAttached files:\n')[1];
  if (!list) return [];
  return list
    .split('\n')
    .map((line) => line.replace(/^- /, '').trim())
    .filter((path) => path && IMAGE.has(extname(path).toLowerCase()))
    .map((path) => resolve(cwd, path))
    .filter((path) => insideDir(path, cwd));
}

/**
 * A chat's Codex thread, driven through the shared app-server. The thread is
 * created with the first message and resumed after the app-server restarts.
 */
export class CodexRun implements AgentRun {
  readonly provider = 'codex' as const;
  private threadId: string | undefined;
  /** The thread is loaded in the running app-server and its events come here. */
  private loaded = false;
  private onDisk: boolean;
  private host: RunHost;
  private turnId: string | undefined;
  private interrupting = false;
  /** Streaming drafts, by Codex item id. */
  private drafts = new Map<string, string>();
  private pending = new Map<string, Pending>();
  private partialPlanTurn: string | undefined;
  private usage: ThreadTokenUsage | undefined;
  private terminals = new Map<string, BackgroundTask & { processId: string }>();
  private listener: ThreadListener;
  private terminalTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(host: RunHost, threadId: string | undefined, saved: boolean) {
    this.host = host;
    this.threadId = threadId;
    this.onDisk = saved;
    this.listener = {
      notify: (method, params) => this.notify(method, params),
      request: (id, method, params) => this.request(id, method, params),
      closed: () => this.closed(),
    };
  }

  get sessionId(): string | undefined {
    return this.threadId;
  }

  get alive(): boolean {
    return this.loaded;
  }

  get saved(): boolean {
    return this.onDisk;
  }

  get runningTasks(): number {
    let count = 0;
    for (const task of this.terminals.values()) if (task.status === 'running') count++;
    return count;
  }

  tasks(): BackgroundTask[] {
    return [...this.terminals.values()]
      .map(({ processId: _processId, ...task }) => task)
      .sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.startedAt - a.startedAt);
  }

  /** The model to name when Codex needs one spelled out (plan mode does). */
  private async model(): Promise<string> {
    return this.host.model ?? (await defaultModel());
  }

  /** Creates the thread, or loads it into the app-server, so a turn can start. */
  private async ensureThread(): Promise<string> {
    const host = this.host;
    const settings = modeSettings(host.mode);
    const common = {
      ...clackToolsConfig(host.chatId),
      cwd: host.cwd,
      approvalPolicy: settings.approvalPolicy,
      approvalsReviewer: settings.approvalsReviewer,
      ...(host.model ? { model: host.model } : {}),
    };
    if (!this.threadId) {
      const started = await appServer.request<{ thread: { id: string }; model: string }>('thread/start', {
        ...common,
        sandbox: settings.write ? 'workspace-write' : 'read-only',
      });
      this.threadId = started.thread.id;
      appServer.listen(this.threadId, this.listener);
      this.loaded = true;
      this.host.setActiveModel(started.model);
    } else if (!this.loaded) {
      appServer.listen(this.threadId, this.listener);
      const resumed = await appServer.request<{ model: string }>('thread/resume', { threadId: this.threadId, excludeTurns: true, ...common });
      this.loaded = true;
      this.host.setActiveModel(resumed.model);
    }
    return this.threadId;
  }

  async prompt(_id: string, text: string): Promise<void> {
    const host = this.host;
    const threadId = await this.ensureThread();
    const settings = modeSettings(host.mode);
    const input: UserInput[] = [{ type: 'text', text, text_elements: [] }];
    for (const path of attachedPictures(text, host.cwd)) input.push({ type: 'localImage', path });
    const model = await this.model();
    this.interrupting = false;
    const started = await appServer.request<{ turn: Turn }>('turn/start', {
      threadId,
      input,
      cwd: host.cwd,
      approvalPolicy: settings.approvalPolicy,
      approvalsReviewer: settings.approvalsReviewer,
      sandboxPolicy: sandboxPolicy(host.cwd, settings.write),
      model,
      ...(host.effort ? { effort: host.effort } : {}),
      summary: 'auto',
      collaborationMode: {
        mode: host.mode === 'plan' ? 'plan' : 'default',
        settings: { model, reasoning_effort: host.effort ?? null, developer_instructions: null },
      },
    });
    this.turnId = started.turn.id;
    host.running();
    if (!this.onDisk) {
      this.onDisk = true;
      host.saved();
    }
  }

  async interrupt(): Promise<void> {
    if (!this.threadId || !this.turnId) return;
    this.interrupting = true;
    await appServer.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId });
  }

  async setMode(_mode: PermissionMode): Promise<void> {
    // Each turn names its approvals and sandbox, so the next message follows the new mode.
  }

  async configure(_model: string | null, _effort: EffortLevel | null): Promise<void> {
    // Each turn names its model and effort.
  }

  answer(id: string, decision: PermissionDecision, answers?: Record<string, string>): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    appServer.respond(pending.rpc, pending.reply(decision, answers));
    this.host.answered(id);
  }

  async stopTask(taskId: string): Promise<void> {
    const task = this.terminals.get(taskId);
    if (!task || !this.threadId) throw new Error('That task is not running.');
    await appServer.request('thread/backgroundTerminals/terminate', { threadId: this.threadId, processId: task.processId });
    task.status = 'stopped';
    task.endedAt = Date.now();
    this.host.tasksChanged();
  }

  async contextDetail(): Promise<ContextDetail> {
    const usage = this.usage;
    const model = this.host.model ?? (await defaultModel());
    if (!usage) throw new Error('Codex says how full the context window is once it has replied in this session.');
    const max = usage.modelContextWindow ?? 0;
    const used = usage.last.totalTokens;
    return {
      provider: 'codex',
      model,
      tokens: used,
      max,
      percent: max ? Math.round((used / max) * 100) : 0,
      measuredAt: Date.now(),
      categories: [
        { id: 'messages', name: 'Conversation', tokens: used, kind: 'used' },
        ...(max > used ? [{ id: 'free', name: 'Free space', tokens: max - used, kind: 'free' as const }] : []),
      ],
      messages: [
        { label: 'Read in (input)', tokens: usage.last.inputTokens - usage.last.cachedInputTokens },
        { label: 'Read in again (cached)', tokens: usage.last.cachedInputTokens },
        { label: "Codex's replies", tokens: usage.last.outputTokens - usage.last.reasoningOutputTokens },
        { label: 'Thinking', tokens: usage.last.reasoningOutputTokens },
      ].filter((row) => row.tokens > 0),
      memoryFiles: [],
      mcpServers: [],
      agents: [],
    };
  }

  shutdown(): void {
    this.savePartialPlan();
    if (this.threadId && this.loaded) {
      appServer.unlisten(this.threadId, this.listener);
      void appServer.request('thread/unsubscribe', { threadId: this.threadId }).catch(() => undefined);
    }
    this.loaded = false;
  }

  async settle(): Promise<void> {
    if (this.turnId) await this.interrupt().catch(() => undefined);
    this.shutdown();
    this.ended();
  }

  async relocate(cwd: string): Promise<void> {
    // The next turn names its folder; the thread keeps it from then on.
    if (this.threadId && this.onDisk) {
      await appServer.request('thread/settings/update', { threadId: this.threadId, cwd }).catch(() => undefined);
    }
  }

  // ---- what the app-server says about this thread ---------------------------

  private stamp(): Stamp {
    const stamp: Stamp = { ts: Date.now() };
    const model = this.host.model ?? undefined;
    if (model) stamp.model = model;
    if (this.host.effort) stamp.effort = this.host.effort;
    return stamp;
  }

  private savePartialPlan(): void {
    if (!this.partialPlanTurn) return;
    this.host.updatePlan(this.partialPlanTurn, {});
    this.partialPlanTurn = undefined;
  }

  private notify(method: string, params: Record<string, unknown>): void {
    const host = this.host;
    switch (method) {
      case 'turn/started':
        this.turnId = (params.turn as Turn).id;
        host.running();
        break;

      case 'item/started': {
        const item = params.item as ThreadItem;
        if (item.type === 'plan' && typeof params.turnId === 'string') {
          host.updatePlan(params.turnId, { markdown: item.text }, this.stamp());
        } else if (item.type === 'agentMessage') this.drafts.set(item.id, host.startDraft('text', ''));
        else if (item.type === 'reasoning') this.drafts.set(item.id, host.startDraft('thinking', ''));
        else {
          const tool = toolOf(item, this.stamp());
          // A call to Clack's steps tool is shown as the turn's checklist, not as a call.
          if (tool?.name === STEPS_TOOL && typeof params.turnId === 'string') tool.planId = planId('codex', params.turnId);
          if (tool && !host.tool(tool.id)) host.addItem(tool);
        }
        break;
      }

      case 'item/plan/delta':
        if (typeof params.turnId === 'string' && typeof params.delta === 'string' && params.delta) {
          this.partialPlanTurn = params.turnId;
          host.appendPlan(params.turnId, params.delta, this.stamp());
        }
        break;

      case 'item/agentMessage/delta':
      case 'item/reasoning/summaryTextDelta': {
        const id = this.drafts.get(String(params.itemId));
        if (id) host.appendDraft(id, String(params.delta ?? ''));
        break;
      }

      case 'item/completed': {
        const item = params.item as ThreadItem;
        const draft = this.drafts.get(item.id);
        this.drafts.delete(item.id);
        if (item.type === 'userMessage') break;
        if (item.type === 'plan' && typeof params.turnId === 'string') {
          host.updatePlan(params.turnId, { markdown: item.text }, this.stamp());
          this.partialPlanTurn = undefined;
          break;
        }
        const tool = host.tool(item.id);
        if (tool) {
          const result = resultOf(item);
          const fresh = toolOf(item, {});
          if (fresh) tool.input = fresh.input;
          if (result) host.toolResult(item.id, result.text, result.isError);
          const steps = tool.name === STEPS_TOOL && result && !result.isError ? stepsFromInput(tool.input) : undefined;
          if (steps && typeof params.turnId === 'string') {
            const plan = host.updatePlan(params.turnId, { steps }, { ...this.stamp(), ...(tool.ts ? { ts: tool.ts } : {}) });
            host.updateItem({ ...tool, planId: plan.id });
          }
          break;
        }
        const items = itemsOf(item, this.stamp());
        if (!items.length && draft) host.endDraft(draft);
        // The draft becomes the finished text: the first entry takes its place.
        items.forEach((entry, index) => host.addItem(entry, index === 0 ? draft : undefined));
        break;
      }

      case 'turn/plan/updated': {
        const steps = (params.plan as { step: string; status: string }[]) ?? [];
        if (typeof params.turnId === 'string') {
          host.updatePlan(params.turnId, { steps: steps.map(({ step, status }) => ({
            label: step,
            status: status === 'completed' ? 'completed' : status === 'inProgress' ? 'in_progress' : 'pending',
          })) }, this.stamp());
        }
        break;
      }

      case 'thread/tokenUsage/updated': {
        const usage = params.tokenUsage as ThreadTokenUsage;
        this.usage = usage;
        const max = usage.modelContextWindow ?? 0;
        if (max) host.setContext({ tokens: usage.last.totalTokens, max, percent: Math.round((usage.last.totalTokens / max) * 100) });
        break;
      }

      case 'model/rerouted':
        host.setActiveModel(String(params.toModel));
        host.notice('info', `Codex moved this turn to ${String(params.toModel)}.`);
        break;

      case 'error': {
        const error = params.error as { message?: string } | undefined;
        if (!params.willRetry && error?.message) host.notice('error', error.message);
        break;
      }

      case 'serverRequest/resolved': {
        // Answered elsewhere, or no longer needed (the turn moved on): the card goes.
        for (const [id, pending] of this.pending) {
          if (pending.rpc === params.requestId) {
            this.pending.delete(id);
            host.answered(id);
          }
        }
        break;
      }

      case 'turn/completed': {
        const turn = params.turn as Turn;
        this.savePartialPlan();
        for (const draft of this.drafts.values()) host.endDraft(draft);
        this.drafts.clear();
        host.clearDrafts();
        if (turn.status === 'interrupted' || this.interrupting) host.notice('info', 'Stopped.');
        else if (turn.status === 'failed') host.notice('error', turn.error?.message ?? 'The turn failed.');
        this.interrupting = false;
        this.turnId = undefined;
        host.turnEnded();
        void refreshCodexUsage();
        void this.lookAtTerminals();
        break;
      }
    }
  }

  /**
   * Commands still running once their turn is over are background work: they
   * are listed with the chat's tasks, and looked at again while any runs.
   */
  private async lookAtTerminals(): Promise<void> {
    clearTimeout(this.terminalTimer);
    if (!this.threadId || !this.loaded) return;
    try {
      const listed = await appServer.request<{ data: { itemId: string; processId: string; command: string }[] }>(
        'thread/backgroundTerminals/list',
        { threadId: this.threadId },
      );
      const live = new Set<string>();
      for (const terminal of listed.data) {
        live.add(terminal.itemId);
        if (!this.terminals.has(terminal.itemId)) {
          this.terminals.set(terminal.itemId, {
            id: terminal.itemId,
            processId: terminal.processId,
            kind: 'shell',
            description: terminal.command,
            status: 'running',
            startedAt: Date.now(),
          });
        }
      }
      for (const task of this.terminals.values()) {
        if (task.status === 'running' && !live.has(task.id)) {
          task.status = 'completed';
          task.endedAt = Date.now();
        }
      }
      this.host.tasksChanged();
      if (this.runningTasks) {
        this.terminalTimer = setTimeout(() => void this.lookAtTerminals(), 15_000);
        this.terminalTimer.unref?.();
      }
    } catch {
      // Listing is experimental; without it the tasks simply stay as they were.
    }
  }

  // ---- what the app-server asks ---------------------------------------------

  private ask(rpc: RequestId, request: Omit<PermissionRequest, 'id'>, reply: Pending['reply']): void {
    const id = randomUUID();
    const full: PermissionRequest = { id, ...request };
    this.pending.set(id, { rpc, request: full, reply });
    this.host.ask(full);
  }

  private request(rpc: RequestId, method: string, params: Record<string, unknown>): void {
    switch (method) {
      case 'item/commandExecution/requestApproval': {
        const p = params as CommandApprovalParams;
        const network = p.networkApprovalContext;
        this.ask(
          rpc,
          {
            toolName: 'Bash',
            input: { command: p.command ?? '', ...(p.cwd ? { cwd: p.cwd } : {}) },
            ...(network ? { title: `Allow Codex to connect to ${network.host}?` } : {}),
            ...(p.reason ? { reason: p.reason } : {}),
            canAlways: true,
            alwaysLabel: 'Allow for this chat',
          },
          (decision) => ({ decision: decision === 'deny' ? 'decline' : decision === 'always' ? 'acceptForSession' : 'accept' }),
        );
        break;
      }

      case 'item/fileChange/requestApproval': {
        const p = params as FileChangeApprovalParams;
        const tool = this.host.tool(p.itemId);
        this.ask(
          rpc,
          {
            toolName: 'Patch',
            input: { ...((tool?.input as Record<string, unknown>) ?? {}), ...(p.grantRoot ? { grantRoot: p.grantRoot } : {}) },
            ...(p.reason ? { reason: p.reason } : {}),
            canAlways: true,
            alwaysLabel: 'Allow for this chat',
          },
          (decision) => ({ decision: decision === 'deny' ? 'decline' : decision === 'always' ? 'acceptForSession' : 'accept' }),
        );
        break;
      }

      case 'item/permissions/requestApproval': {
        const p = params as PermissionsApprovalParams;
        const asked = p.permissions;
        const wants = [
          ...(asked.network?.enabled ? ['the network'] : []),
          ...(asked.fileSystem?.write?.length ? [`writing in ${asked.fileSystem.write.join(', ')}`] : []),
          ...(asked.fileSystem?.read?.length ? [`reading ${asked.fileSystem.read.join(', ')}`] : []),
        ];
        this.ask(
          rpc,
          {
            toolName: 'Permissions',
            input: { permissions: asked },
            title: `Let Codex use ${wants.join(' and ') || 'more access'}?`,
            ...(p.reason ? { reason: p.reason } : {}),
            canAlways: true,
            alwaysLabel: 'Allow for this chat',
          },
          (decision) =>
            decision === 'deny'
              ? { permissions: {}, scope: 'turn' }
              : {
                  permissions: {
                    ...(asked.network ? { network: asked.network } : {}),
                    ...(asked.fileSystem ? { fileSystem: asked.fileSystem } : {}),
                  },
                  scope: decision === 'always' ? 'session' : 'turn',
                },
        );
        break;
      }

      case 'item/tool/requestUserInput': {
        const p = params as UserInputParams;
        this.ask(
          rpc,
          {
            toolName: 'AskUserQuestion',
            input: {
              questions: p.questions.map((q) => ({
                question: q.question,
                header: q.header,
                multiSelect: false,
                options: (q.options ?? []).map((option) => ({ label: option.label, description: option.description })),
              })),
            },
            canAlways: false,
          },
          // The card answers by question text; Codex wants them by the question's id.
          (decision, answers) => ({
            answers:
              decision === 'deny'
                ? {}
                : Object.fromEntries(p.questions.map((q) => [q.id, { answers: answers?.[q.question] ? [answers[q.question]!] : [] }])),
          }),
        );
        break;
      }

      case 'mcpServer/elicitation/request': {
        const p = params as ElicitationParams;
        if (p.mode !== 'form' && p.mode !== 'url') {
          appServer.respond(rpc, { action: 'decline', content: null, _meta: null });
          break;
        }
        const fields: FormField[] = [];
        if (p.mode === 'form' && 'requestedSchema' in p) {
          const required = new Set(p.requestedSchema.required ?? []);
          for (const [name, prop] of Object.entries(p.requestedSchema.properties ?? {})) {
            if (!prop) continue;
            const options = prop.enum ?? prop.oneOf?.map((o) => o.const) ?? prop.items?.enum;
            fields.push({
              name,
              label: prop.title ?? name,
              ...(prop.description ? { description: prop.description } : {}),
              type: options ? 'choice' : prop.type === 'number' || prop.type === 'integer' ? 'number' : prop.type === 'boolean' ? 'boolean' : 'string',
              required: required.has(name),
              ...(options ? { options } : {}),
            });
          }
        }
        this.ask(
          rpc,
          {
            toolName: `mcp__${p.serverName}`,
            input: {},
            title: `${p.serverName} asks for details`,
            canAlways: false,
            form: { message: 'message' in p && p.message ? p.message : '', fields, ...('url' in p ? { url: p.url } : {}) },
          },
          (decision, answers) => {
            if (decision === 'deny') return { action: 'decline', content: null, _meta: null };
            const content: Record<string, unknown> = {};
            for (const field of fields) {
              const value = answers?.[field.name];
              if (value === undefined || value === '') continue;
              content[field.name] = field.type === 'number' ? Number(value) : field.type === 'boolean' ? value === 'true' : value;
            }
            return { action: 'accept', content: fields.length ? content : null, _meta: null };
          },
        );
        break;
      }

      default:
        appServer.fail(rpc, `clack does not handle ${method}.`);
    }
  }

  /** The app-server went away under the chat. */
  private closed(): void {
    this.loaded = false;
    this.savePartialPlan();
    if (this.turnId) this.host.notice('error', 'Codex stopped in the middle of this turn.');
    this.ended();
  }

  /** Nothing is running any more: questions are moot and the chat is idle. */
  private ended(): void {
    for (const id of this.pending.keys()) this.host.answered(id);
    this.pending.clear();
    this.drafts.clear();
    this.turnId = undefined;
    this.interrupting = false;
    for (const task of this.terminals.values()) {
      if (task.status === 'running') {
        task.status = 'stopped';
        task.endedAt = Date.now();
      }
    }
    this.host.processEnded();
  }
}

const TOOLS_SCRIPT = join(config.pluginDir, 'mcp', 'clack-tools.mjs');

/**
 * Clack's own tools (artifacts) for a Codex thread: an MCP server Codex starts
 * from Clack's folder, which passes each call back to this server with a
 * secret made at start-up. Left out when the script is not there.
 */
function clackToolsConfig(chatId: string): { config?: Record<string, unknown> } {
  if (!existsSync(TOOLS_SCRIPT)) return {};
  const host = config.host === '0.0.0.0' || config.host === '::' ? '127.0.0.1' : config.host;
  return {
    config: {
      'mcp_servers.clack': {
        command: process.execPath,
        args: [TOOLS_SCRIPT],
        env: { CLACK_TOOLS_URL: `http://${host}:${config.port}/api/agent-tools`, CLACK_TOOLS_TOKEN: toolToken, CLACK_CHAT_ID: chatId },
        // Showing the steps changes nothing, so Codex never asks before it.
        tools: { update_steps: { approval_mode: 'approve' } },
      },
    },
  };
}
