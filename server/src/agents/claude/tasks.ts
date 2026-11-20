import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { BackgroundTask } from '../../../../shared/protocol.ts';

// The work a chat's Claude Code process is doing in the background: shell
// commands it started with run_in_background, agents it handed work to, and
// watchers. Built from the task events Claude Code sends; a level message
// (background_tasks_changed) says which ones are live, and the edge messages
// (task_started, task_progress, task_updated, task_notification) fill in the
// details and how each one ended.

type Tracked = BackgroundTask & {
  /** Started in the background, or moved there later. Foreground work shows in the conversation instead. */
  background: boolean;
  /** Housekeeping Claude Code itself runs; not shown. */
  ambient: boolean;
};

/** Finished tasks kept for the list, newest first; older ones are dropped. */
const KEEP_FINISHED = 20;

type TaskMessage = Extract<
  SDKMessage,
  { type: 'system'; subtype: 'task_started' | 'task_progress' | 'task_updated' | 'task_notification' | 'background_tasks_changed' }
>;

function kindOf(taskType: string | undefined): BackgroundTask['kind'] {
  if (taskType === 'local_agent') return 'agent';
  if (taskType === 'local_bash') return 'shell';
  if (taskType === 'local_workflow') return 'workflow';
  if (taskType?.includes('monitor')) return 'monitor';
  return 'other';
}

/**
 * Whether a summary Claude Code sends tells a person anything. Shell commands often repeat their
 * description, and an agent's often only tells Claude where its report went.
 */
function worthShowing(summary: string, description: string): boolean {
  return summary !== description && !/SubagentHandback|report was delivered to you/i.test(summary);
}

export class TaskBoard {
  private tasks = new Map<string, Tracked>();

  /** How many background tasks are still going. A chat with any is not shut down as idle. */
  get running(): number {
    let count = 0;
    for (const task of this.tasks.values()) if (task.background && !task.ambient && task.status === 'running') count++;
    return count;
  }

  /** What the UI lists: background work still going (newest first), then what finished. */
  list(): BackgroundTask[] {
    const shown = [...this.tasks.values()].filter((task) => task.background && !task.ambient);
    const running = shown.filter((task) => task.status === 'running').sort((a, b) => b.startedAt - a.startedAt);
    const finished = shown.filter((task) => task.status !== 'running').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
    return [...running, ...finished].map(({ background: _background, ambient: _ambient, ...task }) => task);
  }

  /** A background agent's task, when that is what this id is. */
  agent(id: string): BackgroundTask | undefined {
    const task = this.tasks.get(id);
    return task && task.background && !task.ambient && task.kind === 'agent' ? task : undefined;
  }

  /** Takes in one message from Claude Code. Returns true when the list may look different. */
  handle(msg: SDKMessage): boolean {
    if (msg.type !== 'system') return false;
    const m = msg as TaskMessage;
    switch (m.subtype) {
      case 'task_started': {
        this.tasks.set(m.task_id, {
          id: m.task_id,
          kind: kindOf(m.task_type),
          description: m.description,
          ...(m.subagent_type ? { agentType: m.subagent_type } : {}),
          status: 'running',
          startedAt: Date.now(),
          background: m.is_backgrounded === true,
          ambient: m.ambient === true || m.skip_transcript === true,
        });
        return true;
      }
      case 'background_tasks_changed': {
        const live = new Set(m.tasks.map((entry) => entry.task_id));
        for (const entry of m.tasks) {
          const known = this.tasks.get(entry.task_id);
          this.tasks.set(entry.task_id, {
            ...(known ?? { id: entry.task_id, status: 'running' as const, startedAt: Date.now() }),
            kind: kindOf(entry.task_type),
            description: entry.description,
            ...(entry.subagent_type ? { agentType: entry.subagent_type } : {}),
            background: true,
            ambient: entry.ambient === true,
          });
        }
        // Gone from the live set means it has ended; its notification, which may come a moment later, says how.
        for (const task of this.tasks.values()) {
          if (task.background && task.status === 'running' && !live.has(task.id)) {
            task.status = 'completed';
            task.endedAt = Date.now();
          }
        }
        this.trim();
        return true;
      }
      case 'task_progress': {
        const task = this.tasks.get(m.task_id);
        if (!task) return false;
        task.toolUses = m.usage.tool_uses;
        task.tokens = m.usage.total_tokens;
        if (m.last_tool_name) task.lastTool = m.last_tool_name;
        if (m.summary) task.summary = m.summary;
        return task.background;
      }
      case 'task_updated': {
        const task = this.tasks.get(m.task_id);
        if (!task) return false;
        const { status, is_backgrounded, description, error, end_time } = m.patch;
        if (is_backgrounded !== undefined) task.background = is_backgrounded;
        if (description) task.description = description;
        if (error) task.error = error;
        if (status === 'completed' || status === 'failed') task.status = status;
        else if (status === 'killed') task.status = 'stopped';
        else if (status) task.status = 'running';
        if (end_time) task.endedAt = end_time;
        this.trim();
        return task.background;
      }
      case 'task_notification': {
        const task = this.tasks.get(m.task_id);
        if (!task) return false;
        task.status = m.status;
        task.endedAt ??= Date.now();
        if (m.summary && worthShowing(m.summary, task.description)) task.summary = m.summary;
        if (m.usage) {
          task.toolUses = m.usage.tool_uses;
          task.tokens = m.usage.total_tokens;
        }
        this.trim();
        return task.background;
      }
      default:
        return false;
    }
  }

  /** The Claude Code process has gone, and its background work with it. */
  endAll(): boolean {
    let changed = false;
    for (const task of this.tasks.values()) {
      if (task.status !== 'running') continue;
      task.status = 'stopped';
      task.endedAt = Date.now();
      task.error ??= 'Claude Code stopped for this chat, which ends its background work.';
      changed = true;
    }
    return changed;
  }

  private trim(): void {
    const finished = [...this.tasks.values()]
      .filter((task) => task.status !== 'running')
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
    for (const task of finished.slice(KEEP_FINISHED)) this.tasks.delete(task.id);
  }
}
