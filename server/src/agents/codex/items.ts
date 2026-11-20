import { planId } from '../types.ts';
import type { Item, PlanItem, Stamp } from '../../../../shared/protocol.ts';
import type { ThreadItem, Turn } from './protocol.ts';

// Codex's thread items as clack's transcript items. Tools take the names the
// UI already knows where they mean the same thing (Bash, WebSearch, Read,
// Agent, mcp__server__tool), so their cards look as they do for Claude. A
// file change is a "Patch": one call can touch several files, each with a diff.

type ToolItem = Extract<Item, { kind: 'tool' }>;

/** What a user message says, as text. Pictures sent with it are listed as attachments already. */
function userText(item: Extract<ThreadItem, { type: 'userMessage' }>): string {
  return item.content
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
    .trim();
}

/** The text an MCP tool sent back. */
function mcpText(result: { content: unknown[]; structuredContent: unknown } | null): string {
  if (!result) return '';
  const parts = result.content.map((part) => {
    const block = part as { type?: string; text?: string };
    return block.type === 'text' && typeof block.text === 'string' ? block.text : JSON.stringify(part);
  });
  return parts.join('\n') || (result.structuredContent ? JSON.stringify(result.structuredContent, null, 2) : '');
}

/** A tool call's card, without its result. Undefined for items that are not tool calls. */
export function toolOf(item: ThreadItem, stamp: Stamp = {}): ToolItem | undefined {
  const base = { kind: 'tool' as const, id: item.id, ...stamp };
  switch (item.type) {
    case 'commandExecution':
      return { ...base, name: 'Bash', input: { command: item.command, cwd: item.cwd } };
    case 'fileChange':
      return {
        ...base,
        name: 'Patch',
        input: {
          changes: item.changes.map((change) => ({
            path: change.path,
            kind: change.kind.type,
            ...(change.kind.type === 'update' && change.kind.move_path ? { movePath: change.kind.move_path } : {}),
            diff: change.diff,
          })),
        },
      };
    case 'mcpToolCall':
      return { ...base, name: `mcp__${item.server}__${item.tool}`, input: item.arguments ?? {} };
    case 'dynamicToolCall':
      return { ...base, name: item.tool, input: item.arguments ?? {} };
    case 'webSearch':
      return { ...base, name: 'WebSearch', input: { query: item.query } };
    case 'imageView':
      return { ...base, name: 'Read', input: { file_path: item.path } };
    case 'collabAgentToolCall':
      return { ...base, name: 'Agent', input: { description: item.prompt ?? item.tool, subagent_type: item.tool, ...(item.model ? { model: item.model } : {}) } };
    case 'imageGeneration':
      return { ...base, name: 'ImageGeneration', input: {} };
    default:
      return undefined;
  }
}

/** A finished tool call's result; undefined while it is still going. */
export function resultOf(item: ThreadItem): { text: string; isError: boolean } | undefined {
  switch (item.type) {
    case 'commandExecution': {
      if (item.status === 'inProgress') return undefined;
      if (item.status === 'declined') return { text: 'The command was not run.', isError: true };
      const output = (item.aggregatedOutput ?? '').trimEnd();
      const code = item.exitCode;
      const failed = item.status === 'failed' || (code !== null && code !== 0);
      return { text: code !== null && code !== 0 ? `${output}${output ? '\n' : ''}(exit code ${code})` : output, isError: failed };
    }
    case 'fileChange':
      if (item.status === 'inProgress') return undefined;
      if (item.status === 'declined') return { text: 'The change was not made.', isError: true };
      if (item.status === 'failed') return { text: 'The change could not be made.', isError: true };
      return { text: item.changes.map((change) => `${change.kind.type === 'add' ? 'Added' : change.kind.type === 'delete' ? 'Deleted' : 'Updated'} ${change.path}`).join('\n'), isError: false };
    case 'mcpToolCall':
      if (item.status === 'inProgress') return undefined;
      if (item.error) return { text: item.error.message, isError: true };
      return { text: mcpText(item.result), isError: item.status === 'failed' };
    case 'dynamicToolCall':
      if (item.status === 'inProgress') return undefined;
      return { text: '', isError: item.success === false };
    case 'webSearch':
      return { text: item.results ? `${item.results.length} results` : '', isError: false };
    case 'imageView':
      return { text: 'Looked at the picture.', isError: false };
    case 'collabAgentToolCall': {
      if (item.status === 'inProgress') return undefined;
      const states = Object.values(item.agentsStates).filter((state) => state !== undefined);
      const said = states.map((state) => state.message).filter(Boolean).join('\n\n');
      return { text: said || item.status, isError: item.status === 'failed' };
    }
    case 'imageGeneration':
      return { text: 'Made a picture.', isError: false };
    default:
      return undefined;
  }
}

/** The transcript entries one Codex item stands for (none for bookkeeping items). */
export function itemsOf(item: ThreadItem, stamp: Stamp = {}): Item[] {
  switch (item.type) {
    case 'userMessage': {
      const text = userText(item);
      return text ? [{ kind: 'user', id: item.id, text, ...(stamp.ts ? { ts: stamp.ts } : {}) }] : [];
    }
    case 'agentMessage':
      return item.text.trim() ? [{ kind: 'text', id: item.id, text: item.text, ...stamp }] : [];
    case 'reasoning': {
      const text = (item.summary.length ? item.summary : item.content).join('\n\n').trim();
      return text ? [{ kind: 'thinking', id: item.id, text, ...stamp }] : [];
    }
    case 'contextCompaction':
      return [{ kind: 'notice', id: item.id, level: 'info', text: 'Earlier conversation was compacted to free up context.', ...(stamp.ts ? { ts: stamp.ts } : {}) }];
    case 'enteredReviewMode':
      return [{ kind: 'notice', id: item.id, level: 'info', text: 'Codex started a review.', ...(stamp.ts ? { ts: stamp.ts } : {}) }];
    case 'exitedReviewMode':
      return [{ kind: 'notice', id: item.id, level: 'info', text: 'The review is done.', ...(stamp.ts ? { ts: stamp.ts } : {}) }];
    default: {
      const tool = toolOf(item, stamp);
      if (!tool) return [];
      const result = resultOf(item);
      return [result ? { ...tool, result } : tool];
    }
  }
}

/** A saved thread's turns as a transcript, signed with the model the thread ran. */
export function itemsFromTurns(turns: Turn[], model: string | null, effort: string | null, saved: Record<string, PlanItem> = {}): Item[] {
  const items: Item[] = [];
  for (const turn of turns) {
    const turnTs = turn.startedAt ? turn.startedAt * 1000 : undefined;
    const id = planId('codex', turn.id);
    let plan = saved[id];
    let at = -1;
    for (const item of turn.items) {
      const ts = item.completedAtMs ?? item.startedAtMs ?? turnTs;
      const stamp: Stamp = { ...(ts ? { ts } : {}) };
      if (item.type !== 'userMessage') {
        if (model) stamp.model = model;
        if (effort) stamp.effort = effort;
      }
      if (item.type === 'plan' && item.text.trim()) {
        plan = { ...stamp, ...plan, kind: 'plan', id, steps: plan?.steps ?? [], markdown: item.text };
        if (at === -1) at = items.length;
      } else {
        if (plan && at === -1 && item.type !== 'userMessage' && plan.ts !== undefined && ts !== undefined && ts >= plan.ts) at = items.length;
        items.push(...itemsOf(item, stamp));
      }
    }
    if (plan) items.splice(at === -1 ? items.length : at, 0, plan);
    if (turn.status === 'interrupted') items.push({ kind: 'notice', id: `${turn.id}:stopped`, level: 'info', text: 'Stopped.', ...(turnTs ? { ts: turnTs } : {}) });
    else if (turn.status === 'failed' && turn.error) items.push({ kind: 'notice', id: `${turn.id}:failed`, level: 'error', text: turn.error.message, ...(turnTs ? { ts: turnTs } : {}) });
  }
  return items;
}
