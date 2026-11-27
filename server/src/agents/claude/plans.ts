import type { Item, PlanContent, PlanItem, PlanStep } from '../../../../shared/protocol.ts';
import { markStarts, planId, STEPS_TOOL, stepsFromInput } from '../types.ts';
import type { ToolItem } from '../types.ts';

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function status(value: unknown): value is PlanStep['status'] {
  return value === 'pending' || value === 'in_progress' || value === 'completed';
}

function prose(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function approvedMarkdown(tool: ToolItem, raw: unknown): string | undefined {
  if (tool.name !== 'ExitPlanMode' || !tool.result || tool.result.isError) return;
  const approved = tool.result.text.match(/(?:^|\n)#{1,6} Approved Plan(?: \(edited by user\))?:[^\S\n]*\n([\s\S]+)/i);
  return prose(fields(raw).plan) ?? prose(approved?.[1]);
}

/** Interpret the same tool results during a live turn and transcript replay. */
export class ClaudePlans {
  // An update in a later turn can refer back to an existing task list.
  private boards = new Map<string, PlanStep[]>();
  private steps: PlanStep[] = [];
  turnId = '';

  start(turnId: string) {
    this.turnId = turnId;
    this.steps = [];
  }

  recall(steps: PlanStep[]) {
    for (const step of steps) if (step.taskId) this.boards.set(step.taskId, steps);
  }

  result(tool: ToolItem, raw?: unknown): Partial<PlanContent> | undefined {
    if (tool.parent || !tool.result || tool.result.isError) return;
    const input = fields(tool.input);
    const output = fields(raw);
    if (tool.name === 'ExitPlanMode') {
      const markdown = approvedMarkdown(tool, raw) ?? prose(input.plan);
      if (markdown) return { markdown };
    }
    if (tool.name === STEPS_TOOL) {
      const steps = stepsFromInput(input);
      if (!steps) return;
      this.steps = steps;
      return { steps };
    }
    if (tool.name === 'TodoWrite' && Array.isArray(input.todos)) {
      this.steps = input.todos.flatMap(todo => {
        const entry = fields(todo);
        return typeof entry.content === 'string' && entry.content.trim() && status(entry.status)
          ? [{ label: entry.content, status: entry.status }] : [];
      });
      return { steps: this.steps };
    }
    if (tool.name !== 'TaskCreate' && tool.name !== 'TaskUpdate') return;
    if (output.success === false) return;
    const task = fields(output.task);
    const id = tool.name === 'TaskCreate'
      ? task.id ?? tool.result.text.match(/^Task #(\d+) created successfully\b/i)?.[1]
      : input.taskId;
    if (typeof id !== 'string') return;
    const board = this.boards.get(id);
    const previous = board?.find(step => step.taskId === id);
    if (tool.name === 'TaskUpdate' && !this.steps.length && board) this.steps = board;
    if (input.status === 'deleted') {
      this.boards.delete(id);
      this.steps = this.steps.filter(step => step.taskId !== id);
    } else {
      const label = prose(task.subject) ?? prose(input.subject) ?? previous?.label;
      if (!label) return;
      const priorStatus = tool.name === 'TaskUpdate' ? previous?.status : undefined;
      const step: PlanStep = { taskId: id, label, status: status(input.status) ? input.status : priorStatus ?? 'pending' };
      this.steps = this.steps.some(s => s.taskId === id)
        ? this.steps.map(s => s.taskId === id ? step : s)
        : [...this.steps, step];
    }
    this.recall(this.steps);
    return { steps: this.steps };
  }
}

/** Place one snapshot alongside its source tools in each historical turn. */
export function restoreClaudePlans(items: Item[], saved: Record<string, PlanItem>, results: Map<string, unknown>): Item[] {
  const out: Item[] = [];
  const tracker = new ClaudePlans();
  let at = -1;
  let plan: PlanItem | undefined;
  let approved: string | undefined;
  function finish() {
    if (!tracker.turnId) return;
    const snapshot = saved[planId('claude', tracker.turnId)];
    // An approval can reach the provider's transcript just before Clack exits.
    const final = snapshot && approved ? { ...snapshot, markdown: approved } : snapshot ?? plan;
    if (final) {
      out.splice(at < 0 ? out.length : at, 0, final);
      tracker.recall(final.steps);
    }
    plan = undefined;
    approved = undefined;
    at = -1;
  }
  for (const item of items) {
    if (item.kind === 'user') {
      finish();
      tracker.start(item.id);
    }
    if (item.kind === 'tool' && !item.parent && tracker.turnId) {
      const id = planId('claude', tracker.turnId);
      const result = results.get(item.id);
      const patch = tracker.result(item, result);
      if (item.name === 'ExitPlanMode') approved = approvedMarkdown(item, result);
      if (patch || (saved[id]?.markdown && item.name === 'ExitPlanMode' && !item.result?.isError)) {
        // Each step starts after the call that first showed it under way, as it did live.
        if (patch?.steps) patch.steps = markStarts(plan?.steps ?? [], patch.steps, item.id);
        plan = { kind: 'plan', id, steps: [], ts: item.ts, model: item.model, effort: item.effort, ...plan, ...patch };
        item.planId = id;
        if (at < 0) at = out.length;
      }
    }
    out.push(item);
  }
  finish();
  return out;
}
