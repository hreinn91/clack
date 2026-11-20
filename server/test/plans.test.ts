import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item, PlanItem } from '../../shared/protocol.ts';
import { ClaudePlans, restoreClaudePlans } from '../src/agents/claude/plans.ts';
import { itemsFromTurns } from '../src/agents/codex/items.ts';
import type { Turn } from '../src/agents/codex/protocol.ts';
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
  assert.deepEqual(plans[0]?.steps, [{ label: 'Check the build', status: 'in_progress' }]);
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
