import type { Item, PlanItem } from '../../../shared/protocol';

// The Steps view of an agent's turn: a short checklist of the work, with the
// entries Raw would show folded under each step, then the answer in full.
//
// The steps come from the agent when it wrote some (Claude's to-do list or
// tasks, Codex's plan, or Clack's own update_steps tool): each entry then goes
// under the step that was under way when it was made, which the server marks
// on the plan (PlanStep.since). Otherwise Clack puts the steps together itself
// from the calls the agent made in a row: "Read 4 files", "Ran npm test",
// "Edited index.ts and sessions.ts". Pure functions, no Svelte.

type Tool = Extract<Item, { kind: 'tool' }>;

export type StepStatus = 'pending' | 'running' | 'done' | 'unfinished';

export type TurnStep = {
  key: string;
  label: string;
  /** A longer description, for the tooltip (the whole command, say). */
  title?: string;
  status: StepStatus;
  /** The step's entries as Raw shows them, in order: tool calls, thinking, the text between. */
  items: Item[];
  /** How many tool calls the step made, and how many of them failed. */
  calls: number;
  failed: number;
};

export type TurnLayout = {
  /** Where the steps come from: the agent's own plan, Clack's reading of the calls, or none (no calls). */
  source: 'plan' | 'calls' | 'none';
  steps: TurnStep[];
  /** The turn's plan: its checklist (when the steps come from it) and plan-mode proposal. */
  plan?: PlanItem;
  /** What is shown outside the steps, in order: the answer, and artifact cards (everything, with no steps). */
  shown: Item[];
};

/** A call that only updates the turn's checklist: shown through the checklist, never as a call. */
export function isPlanCall(item: Item): boolean {
  return item.kind === 'tool' && !!item.planId && !item.result?.isError;
}

const ARTIFACT_CARD = /^mcp__clack__(create|update)_artifact$/;

/**
 * Lays out one run of the agent's entries (a Message's worth). `before` is the
 * id of the entry just before it, which a step may have started after; `live`
 * says the agent is still at work on it.
 */
export function layoutTurn(items: Item[], options: { live?: boolean; before?: string } = {}): TurnLayout {
  const live = options.live ?? false;
  const plan = items.filter((item): item is PlanItem => item.kind === 'plan').at(-1);
  const entries = items.filter((item) => item.kind !== 'plan' && !isPlanCall(item));
  const isWork = (item: Item) => item.kind === 'tool' || ('parent' in item && !!item.parent);
  const calls = entries.filter((item) => item.kind === 'tool');
  const fromPlan = !!plan?.steps.length;

  // No calls: shown as Raw shows it, with a plan-mode proposal where it was made.
  if (!calls.length && !fromPlan) return { source: 'none', steps: [], shown: items.filter((item) => item.kind !== 'plan' ? !isPlanCall(item) : !!item.markdown) };

  // The answer: the text after the last call. When the turn ended on a call, its last text.
  const lastWork = entries.reduce((at, item, index) => (isWork(item) ? index : at), -1);
  let answer = entries.slice(lastWork + 1).filter((item) => item.kind === 'text' && !item.parent);
  if (!answer.length && !live) {
    const last = entries.filter((item) => item.kind === 'text' && !item.parent).at(-1);
    if (last) answer = [last];
  }
  const answers = new Set(answer.map((item) => item.id));
  const shown = entries.filter(
    (item) => answers.has(item.id) || (item.kind === 'tool' && !item.parent && ARTIFACT_CARD.test(item.name) && item.result && !item.result.isError),
  );

  const steps = fromPlan ? planSteps(plan!, items, answers, live, options.before) : callSteps(entries, answers, live);
  return { source: fromPlan ? 'plan' : 'calls', steps, ...(plan ? { plan } : {}), shown };
}

/** The agent's own steps, each with the entries made while it was under way. */
function planSteps(plan: PlanItem, items: Item[], answers: Set<string>, live: boolean, before?: string): TurnStep[] {
  const steps: TurnStep[] = plan.steps.map((step, index) => ({
    key: step.taskId ?? `${index}:${step.label}`,
    label: step.label,
    status: step.status === 'completed' ? 'done' : step.status === 'in_progress' ? (live ? 'running' : 'unfinished') : 'pending',
    items: [],
    calls: 0,
    failed: 0,
  }));
  // Where each step started. Steps marked at the same moment: the one under way, else the last of them.
  const starts = new Map<string, number>();
  plan.steps.forEach((step, index) => {
    if (!step.since) return;
    const other = starts.get(step.since);
    if (other === undefined || plan.steps[other]?.status !== 'in_progress') starts.set(step.since, index);
  });
  let current = (before && starts.get(before)) || 0;
  const stepOfCall = new Map<string, number>();
  for (const item of items) {
    if (item.kind !== 'plan' && !isPlanCall(item) && !answers.has(item.id)) {
      const parent = 'parent' in item && item.parent ? stepOfCall.get(item.parent) : undefined;
      const at = parent ?? current;
      add(steps[at]!, item);
      if (item.kind === 'tool') stepOfCall.set(item.id, at);
    }
    const next = starts.get(item.id);
    if (next !== undefined) current = next;
  }
  return steps;
}

/** Steps Clack puts together from the calls: calls of one kind in a row make one step. */
function callSteps(entries: Item[], answers: Set<string>, live: boolean): TurnStep[] {
  const groups: { kind: string; items: Item[] }[] = [];
  const stepOfCall = new Map<string, number>();
  /** Text and thinking waiting for the call they lead up to. */
  let carry: Item[] = [];
  for (const item of entries) {
    if (answers.has(item.id)) continue;
    const parent = 'parent' in item && item.parent ? stepOfCall.get(item.parent) : undefined;
    if (parent !== undefined) {
      groups[parent]!.items.push(item);
      if (item.kind === 'tool') stepOfCall.set(item.id, parent);
    } else if (item.kind === 'tool' && !QUIET.test(item.name)) {
      const kind = kindOf(item.name);
      if (groups.at(-1)?.kind !== kind) groups.push({ kind, items: [] });
      const group = groups.at(-1)!;
      group.items.push(...carry, item);
      for (const carried of [...carry, item]) if (carried.kind === 'tool') stepOfCall.set(carried.id, groups.length - 1);
      carry = [];
    } else {
      carry.push(item);
    }
  }
  if (carry.length) {
    // What comes after the last call goes with it; a turn of nothing but housekeeping is a step of its own.
    const calls = carry.filter((item): item is Tool => item.kind === 'tool');
    if (groups.length) groups.at(-1)!.items.push(...carry);
    else if (calls.length) groups.push({ kind: kindOf(calls[0]!.name), items: carry });
  }

  return groups.map((group, index) => {
    const step: TurnStep = { key: `${index}:${group.kind}`, label: '', status: 'done', items: [], calls: 0, failed: 0 };
    for (const item of group.items) add(step, item);
    const own = group.items.filter((item): item is Tool => item.kind === 'tool' && !item.parent);
    const named = own.filter((call) => !QUIET.test(call.name));
    const { label, title } = describe(group.kind, named.length ? named : own);
    step.label = label;
    if (title) step.title = title;
    if (own.some((call) => !call.result)) step.status = live ? 'running' : 'unfinished';
    return step;
  });
}

function add(step: TurnStep, item: Item): void {
  step.items.push(item);
  if (item.kind !== 'tool') return;
  step.calls += 1;
  if (item.result?.isError) step.failed += 1;
}

/**
 * Housekeeping calls: loading the definitions of more tools, or a skill's
 * instructions. They go with the step they lead up to, not one of their own.
 */
const QUIET = /^(ToolSearch|Skill)$/;

/** Which calls are alike enough to make one step together. */
export function kindOf(name: string): string {
  if (/^(Read|NotebookRead|Glob|Grep|LS)$/.test(name)) return 'look';
  if (/^(Edit|MultiEdit|Write|NotebookEdit|Patch)$/.test(name)) return 'edit';
  if (/^(Bash|BashOutput|KillShell|KillBash)$/.test(name)) return 'run';
  if (name === 'WebSearch' || name === 'WebFetch') return 'web';
  if (name === 'Agent' || name === 'Task') return 'agent';
  if (name === 'AskUserQuestion') return 'ask';
  if (name === 'Skill') return 'skill';
  if (name.startsWith('mcp__clack__')) return 'artifact';
  const server = name.match(/^mcp__(.+?)__/)?.[1];
  return server ? `mcp:${server}` : 'other';
}

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function clip(text: string, max = 60): string {
  const line = text.trim().split('\n')[0] ?? '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line + (text.trim().includes('\n') ? ' …' : '');
}

const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** "a", "a and b", or "3 files". */
function names(list: string[], noun: string, plural = `${noun}s`): string {
  const unique = [...new Set(list.filter(Boolean))];
  if (unique.length === 0) return `${list.length || 1} ${list.length === 1 ? noun : plural}`;
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.length} ${plural}`;
}

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** A step's name, from the calls in it. */
function describe(kind: string, calls: Tool[]): { label: string; title?: string } {
  const input = (call: Tool) => fields(call.input);
  const n = calls.length;
  switch (kind) {
    case 'look': {
      const reads = calls.filter((call) => call.name === 'Read' || call.name === 'NotebookRead');
      const searches = calls.filter((call) => !reads.includes(call));
      const files = reads.map((call) => fileName(str(input(call).file_path) || str(input(call).notebook_path) || str(input(call).path)));
      if (!searches.length) return { label: `Read ${names(files, 'file')}` };
      const pattern = str(input(searches[0]!).pattern);
      if (!reads.length) return { label: searches.length === 1 && pattern ? `Searched for “${clip(pattern, 40)}”` : `Searched the code ${times(searches.length)}` };
      return { label: `Searched the code and read ${names(files, 'file')}` };
    }
    case 'edit': {
      const paths = calls.flatMap((call) => {
        const f = input(call);
        if (call.name === 'Patch') return (Array.isArray(f.changes) ? f.changes : []).map((change) => str(fields(change).path));
        return [str(f.file_path) || str(f.notebook_path)];
      });
      const created = calls.every(
        (call) => call.name === 'Write' || (call.name === 'Patch' && (Array.isArray(input(call).changes) ? (input(call).changes as unknown[]) : []).every((change) => fields(change).kind === 'add')),
      );
      return { label: `${created ? 'Wrote' : 'Edited'} ${names(paths.map(fileName), 'file')}`, title: [...new Set(paths)].join('\n') };
    }
    case 'run': {
      const commands = calls.map((call) => str(input(call).command)).filter(Boolean);
      const title = commands.join('\n');
      if (n === 1) return { label: commands[0] ? `Ran ${clip(commands[0])}` : 'Ran a command', title };
      return { label: `Ran ${n} commands`, title };
    }
    case 'web': {
      const searches = calls.filter((call) => call.name === 'WebSearch');
      const pages = calls.filter((call) => call.name === 'WebFetch').map((call) => {
        try {
          return new URL(str(input(call).url)).host;
        } catch {
          return str(input(call).url);
        }
      });
      if (n === 1 && searches.length) return { label: `Searched the web for “${clip(str(input(searches[0]!).query), 50)}”` };
      if (!searches.length) return { label: `Read ${names(pages, 'web page')}` };
      if (!pages.length) return { label: `Searched the web ${times(n)}` };
      return { label: `Searched the web and read ${names(pages, 'page')}` };
    }
    case 'agent': {
      const what = str(input(calls[0]!).description);
      return n === 1 && what ? { label: `Subagent: ${clip(what)}` } : { label: `Ran ${n} subagents`, title: calls.map((call) => str(input(call).description)).join('\n') };
    }
    case 'ask':
      return { label: n === 1 ? 'Asked you a question' : `Asked you ${n} questions` };
    case 'skill': {
      const skills = [...new Set(calls.map((call) => str(input(call).skill) || str(Object.values(input(call)).find((v) => typeof v === 'string'))))];
      return { label: skills.length === 1 && skills[0] ? `Used the ${skills[0]} skill` : `Used ${skills.length} skills`, title: skills.join('\n') };
    }
    case 'artifact': {
      const made = calls.filter((call) => call.name.endsWith('create_artifact')).map((call) => str(input(call).title));
      const changed = calls.filter((call) => call.name.endsWith('update_artifact'));
      if (made.length) return { label: `Made ${made.length === 1 && made[0] ? `“${clip(made[0], 50)}”` : names(made.map((t) => (t ? `“${t}”` : '')), 'artifact')}` };
      if (changed.length) return { label: changed.length === 1 ? 'Saved a new version of an artifact' : `Saved ${changed.length} new artifact versions` };
      return { label: 'Looked at the artifacts' };
    }
    default: {
      if (kind.startsWith('mcp:')) {
        const server = kind.slice(4);
        const tools = calls.map((call) => call.name.replace(/^mcp__.+?__/, ''));
        return n === 1 ? { label: `Used ${tools[0]} (${server})` } : { label: `Used ${server} ${times(n)}`, title: tools.join('\n') };
      }
      return { label: `Used ${names(calls.map((call) => call.name), 'tool')}` };
    }
  }
}
