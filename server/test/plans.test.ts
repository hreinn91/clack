import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item, PlanItem } from '../../shared/protocol.ts';
import { ClaudePlans, restoreClaudePlans } from '../src/agents/claude/plans.ts';
import { itemsFromTurns } from '../src/agents/codex/items.ts';
import type { Turn } from '../src/agents/codex/protocol.ts';
import { markStarts, STEPS_TOOL } from '../src/agents/types.ts';
import type { ToolItem } from '../src/agents/types.ts';

function tool(id: string, name: string, input: unknown, text = ''): ToolItem {
  return { kind: 'tool', id, name, input, result: { text, isError: false } };
}

test('Claude checklist snapshots coalesce, and errors and subagent work stay separate', () => {
  const todo = (state: string) => ({ todos: [{ content: 'Check the build', status: state }] });
  const items: Item[] = [
    { kind: 'user', id: 'one', text: 'Start' },
    tool('a', 'TodoWrite', todo('pending')),
    tool('b', 'TodoWrite', todo('in_progress')),
    { ...tool('c', 'TodoWrite', todo('completed')), result: { text: 'Stopped', isError: true } },
    { ...tool('d', 'TodoWrite', todo('completed')), parent: 'subagent' },
    { kind: 'user', id: 'two', text: 'What happened?' },
    { kind: 'text', id: 'answer', text: 'We stopped.' },
  ];
  const history = restoreClaudePlans(items, {}, new Map());
  const plans = history.filter(item => item.kind === 'plan');
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0]?.steps, [{ label: 'Check the build', status: 'in_progress', since: 'b' }], 'it started after the call that set it under way');
  assert.equal(history.filter(item => item.kind === 'tool' && !item.planId).length, 2);
});

test('Claude task IDs keep renamed, completed and deleted steps consistent across turns', () => {
  const tracker = new ClaudePlans();
  tracker.start('one');
  tracker.result(tool('a', 'TaskCreate', { subject: 'First' }), { task: { id: '1', subject: 'First' } });
  tracker.result(tool('b', 'TaskCreate', { subject: 'Second' }, 'Task #2 created successfully: Second'));
  tracker.start('two');
  const updated = tracker.result(tool('c', 'TaskUpdate', { taskId: '1', subject: 'First check', status: 'completed' }));
  assert.deepEqual(updated?.steps?.map(step => [step.label, step.status]), [['First check', 'completed'], ['Second', 'pending']]);
  const deleted = tracker.result(tool('d', 'TaskUpdate', { taskId: '2', status: 'deleted' }));
  assert.deepEqual(deleted?.steps?.map(step => step.taskId), ['1']);
});

test('Claude restores the edited Markdown once and retains an approval-only proposal', () => {
  const prompt: Item = { kind: 'user', id: 'one', text: 'Plan this' };
  const call = tool('exit', 'ExitPlanMode', { plan: '# Original' }, 'User has approved your plan.\n## Approved Plan (edited by user):\n# Revised');
  const items = restoreClaudePlans([prompt, call], {}, new Map());
  assert.equal(items[1]?.kind === 'plan' && items[1].markdown, '# Revised');
  const saved: PlanItem = { kind: 'plan', id: 'claude:one:plan', markdown: '## Proposed', steps: [] };
  const restored = restoreClaudePlans([prompt, tool('exit', 'ExitPlanMode', {})], { [saved.id]: saved }, new Map());
  assert.equal(restored.filter(item => item.kind === 'plan').length, 1);
  assert.equal(restored[1], saved);
  const afterApproval = restoreClaudePlans([prompt, call], { [saved.id]: saved }, new Map());
  assert.deepEqual(afterApproval[1], { ...saved, markdown: '# Revised' });
});

test('Codex merges revisions and a saved live checklist within its original turn', () => {
  const turns: Turn[] = [
    { id: 'one', status: 'interrupted', error: null, startedAt: 10, completedAt: 12, items: [
      { type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'Plan this', text_elements: [] }] },
      { type: 'plan', id: 'p1', text: '# Original' }, { type: 'plan', id: 'p2', text: '# Revised' },
    ] },
    { id: 'two', status: 'completed', error: null, startedAt: 14, completedAt: 15, items: [
      { type: 'userMessage', id: 'u2', content: [{ type: 'text', text: 'Hello', text_elements: [] }] },
      { type: 'agentMessage', id: 'm', phase: null, text: 'Hello!' },
    ] },
  ];
  const saved: PlanItem = { kind: 'plan', id: 'codex:one:plan', steps: [{ label: 'Review', status: 'in_progress' }] };
  const items = itemsFromTurns(turns, null, null, { [saved.id]: saved });
  assert.deepEqual(items.map(item => item.kind), ['user', 'plan', 'notice', 'user', 'text']);
  assert.deepEqual(items[1], { ...saved, markdown: '# Revised', ts: 10000 });
});

test("Clack's steps tool is a turn's checklist for Claude, live and from the transcript", () => {
  const steps = (first: string, second: string) => ({ steps: [{ step: 'Find the check', status: first }, { step: 'Fix it', status: second }] });
  const items: Item[] = [
    { kind: 'user', id: 'one', text: 'Fix the login' },
    tool('s1', STEPS_TOOL, steps('in_progress', 'pending'), 'Shown: 0 of 2 done.'),
    tool('r', 'Read', { file_path: '/x/auth.ts' }),
    tool('s2', STEPS_TOOL, steps('completed', 'in_progress'), 'Shown: 1 of 2 done.'),
    { kind: 'text', id: 'answer', text: 'Fixed.' },
  ];
  const history = restoreClaudePlans(items, {}, new Map());
  const plan = history.find(item => item.kind === 'plan');
  assert.deepEqual(plan?.kind === 'plan' && plan.steps, [{ label: 'Find the check', status: 'completed', since: 's1' }, { label: 'Fix it', status: 'in_progress', since: 's2' }]);
  assert.deepEqual(history.filter(item => item.kind === 'tool' && item.planId).map(item => item.id), ['s1', 's2']);
  // A call without steps is an ordinary call.
  const tracker = new ClaudePlans();
  tracker.start('two');
  assert.equal(tracker.result(tool('s3', STEPS_TOOL, { steps: [] })), undefined);
});

test("Clack's steps tool is a turn's checklist for Codex history too", () => {
  const call = (id: string, status: string) => ({
    type: 'mcpToolCall' as const, id, server: 'clack', tool: 'update_steps', status: 'completed' as const,
    arguments: { steps: [{ step: 'Look around', status }] }, result: { content: [{ type: 'text', text: 'Shown.' }], structuredContent: null }, error: null,
  });
  const turns: Turn[] = [{ id: 't', status: 'completed', error: null, startedAt: 10, completedAt: 12, items: [
    { type: 'userMessage', id: 'u', content: [{ type: 'text', text: 'Go', text_elements: [] }] },
    call('c1', 'in_progress'),
    call('c2', 'completed'),
    { type: 'agentMessage', id: 'm', phase: null, text: 'Done.' },
  ] }];
  const items = itemsFromTurns(turns, null, null);
  assert.deepEqual(items.map(item => item.kind), ['user', 'plan', 'tool', 'tool', 'text']);
  assert.deepEqual(items[1]?.kind === 'plan' && items[1].steps, [{ label: 'Look around', status: 'completed', since: 'c1' }]);
  assert.ok(items.every(item => item.kind !== 'tool' || item.planId === 'codex:t:plan'));
});

test('a step remembers where it started, through later updates', () => {
  const first = markStarts([], [{ label: 'A', status: 'in_progress' }, { label: 'B', status: 'pending' }], 'call-1');
  assert.deepEqual(first, [{ label: 'A', status: 'in_progress', since: 'call-1' }, { label: 'B', status: 'pending' }]);
  const second = markStarts(first, [{ label: 'A', status: 'completed' }, { label: 'B', status: 'in_progress' }], 'call-7');
  assert.deepEqual(second.map(step => step.since), ['call-1', 'call-7']);
  // Task ids match a renamed step.
  const tasks = markStarts([{ label: 'Old', status: 'in_progress', taskId: '1', since: 'x' }], [{ label: 'New', status: 'completed', taskId: '1' }], 'y');
  assert.equal(tasks[0]?.since, 'x');
  // A start that came along from an earlier turn's task list is replaced by this turn's.
  assert.equal(markStarts([], [{ label: 'Old', status: 'completed', taskId: '1', since: 'last-turn' }], 'now')[0]?.since, 'now');
});
