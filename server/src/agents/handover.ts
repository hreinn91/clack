import type { Item, Provider } from '../../../shared/protocol.ts';

// When a chat moves to the other agent, the new one starts with an empty
// memory. It is handed the conversation so far as text, after the next
// message: what was said in full for the latest turns, shortened before that,
// and one line per tool call. The block is part of the message the agent
// reads (so it survives a resume), and is taken out again wherever the chat
// is shown. It comes after what the person typed so that each agent's own
// list names the conversation by that, not by the block.

const OPEN = '<clack-handover';
const CLOSE = '</clack-handover>';
/** About ten thousand tokens: enough to carry on, small enough to leave the new agent room. */
const BUDGET = 40_000;
/** The latest entries kept whole; older ones are cut short. */
const RECENT = 12;

function name(provider: Provider): string {
  return provider === 'codex' ? 'Codex' : 'Claude';
}

function cut(text: string, max: number): string {
  const flat = text.trim();
  return flat.length > max ? `${flat.slice(0, max)}… (cut short)` : flat;
}

/** A tool call in a line: what it was, and how it came out. */
function toolLine(item: Extract<Item, { kind: 'tool' }>): string {
  const input = (item.input && typeof item.input === 'object' ? item.input : {}) as Record<string, unknown>;
  const what =
    typeof input.command === 'string'
      ? `ran \`${cut(input.command, 200)}\``
      : typeof input.file_path === 'string'
        ? `${item.name} ${input.file_path}`
        : Array.isArray(input.changes)
          ? `changed ${(input.changes as { path?: string }[]).map((c) => c.path).join(', ')}`
          : typeof input.query === 'string'
            ? `${item.name} "${cut(input.query, 120)}"`
            : item.name;
  const result = item.result ? ` → ${item.result.isError ? 'failed: ' : ''}${cut(item.result.text.split('\n').slice(0, 3).join(' / '), 200)}` : '';
  return `- ${what}${result}`;
}

/**
 * The conversation so far, for the agent that takes over. `from` is the agent
 * that had it, `model` what it last ran.
 */
export function buildHandover(items: Item[], from: Provider, model: string | undefined, cwd: string): string {
  const who = name(from);
  const lines: string[] = [];
  items.forEach((item, index) => {
    const recent = index >= items.length - RECENT;
    switch (item.kind) {
      case 'user':
        lines.push(`\n### The person\n${recent ? stripHandover(item.text).text : cut(stripHandover(item.text).text, 600)}`);
        break;
      case 'plan':
        if (item.markdown) lines.push(cut(item.markdown, recent ? BUDGET : 800));
        for (const step of item.steps) lines.push(`- [${step.status}] ${step.label}`);
        break;
      case 'text':
        if (!item.parent) lines.push(`\n### ${who}\n${recent ? item.text.trim() : cut(item.text, 800)}`);
        break;
      case 'tool':
        if (!item.parent && !item.planId) lines.push(toolLine(item));
        break;
      case 'divider':
        lines.push(`\n(The chat moved from ${name(item.from)} to ${name(item.to)} here.)`);
        break;
      case 'notice':
        // What the chat itself said: a turn the person stopped, an error, a compaction.
        lines.push(`- (${cut(item.text, 200)})`);
        break;
      default:
        break;
    }
  });
  // Over budget: the oldest lines go first; the latest exchange always stays.
  let body = lines.join('\n');
  while (body.length > BUDGET && lines.length > 4) {
    lines.splice(0, Math.max(1, Math.floor(lines.length / 10)));
    body = `(Earlier conversation left out.)\n${lines.join('\n')}`;
  }
  return [
    `${OPEN} from="${from}"${model ? ` model="${model}"` : ''}>`,
    `You are taking over this conversation from ${who}${model ? ` (${model})` : ''}, which worked on it in clack until now.`,
    `You work in the same folder (${cwd}): what it changed there is on disk, but none of its tool calls or what it read is in your memory.`,
    'The message above this block is the person\'s new message. This block is the conversation before it, oldest first; older parts are shortened. Answer the new message, carrying on from this.',
    body,
    CLOSE,
  ].join('\n');
}

/** The message an agent is sent right after a switch: what the person typed, then the handover. */
export function withHandover(text: string, handover: string): string {
  return `${text}\n\n${handover}`;
}

/** A message without its handover block, and which agent handed it over, when it had one. */
export function stripHandover(text: string): { text: string; from?: Provider } {
  const start = text.indexOf(OPEN);
  if (start === -1) return { text };
  const end = text.indexOf(CLOSE, start);
  if (end === -1) return { text };
  const from = /from="(claude|codex)"/.exec(text.slice(start, start + 80))?.[1] as Provider | undefined;
  const rest = `${text.slice(0, start)}${text.slice(end + CLOSE.length)}`.trim();
  return { text: rest, ...(from ? { from } : {}) };
}
