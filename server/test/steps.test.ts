import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item } from '../../shared/protocol.ts';
import { layoutTurn } from '../../web/src/lib/steps.ts';

// The Steps view's reading of a turn (web/src/lib/steps.ts): pure, so tested here.

const ok = { text: 'ok', isError: false };
/** A tool call; `null` for one with no result yet. */
const call = (id: string, name: string, input: Record<string, unknown>, result: { text: string; isError: boolean } | null = ok): Item =>
  ({ kind: 'tool', id, name, input, ...(result ? { result } : {}) }) as Item;
const text = (id: string, body: string, parent?: string): Item => ({ kind: 'text', id, text: body, ...(parent ? { parent } : {}) });

test('without a plan, calls of one kind in a row make a step, and the answer is shown in full', () => {
  const turn: Item[] = [
    text('t1', 'Let me look around.'),
    call('r1', 'Read', { file_path: '/repo/src/index.ts' }),
    call('r2', 'Read', { file_path: '/repo/src/auth.ts' }),
    { kind: 'thinking', id: 'th', text: 'The hook is wrong.' },
    call('e1', 'Edit', { file_path: '/repo/src/index.ts' }),
    call('b1', 'Bash', { command: 'npm test\n--verbose' }, { text: '1 failed', isError: true }),
    call('b2', 'Bash', { command: 'npm test' }),
    text('t2', 'Fixed: the hook now checks the route.'),
  ];
  const layout = layoutTurn(turn);
  assert.equal(layout.source, 'calls');
  assert.deepEqual(layout.steps.map((step) => step.label), ['Read index.ts and auth.ts', 'Edited index.ts', 'Ran 2 commands']);
  assert.deepEqual(layout.steps[0]!.items.map((item) => item.id), ['t1', 'r1', 'r2'], 'the text leading up to the calls goes with them');
  assert.deepEqual(layout.steps[1]!.items.map((item) => item.id), ['th', 'e1']);
  assert.equal(layout.steps[2]!.failed, 1);
  assert.ok(layout.steps.every((step) => step.status === 'done'));
  assert.deepEqual(layout.shown.map((item) => item.id), ['t2']);
});

test("with the agent's plan, each entry goes under the step that was under way", () => {
  const before = 'prompt';
  const turn: Item[] = [
    call('look', 'Grep', { pattern: 'token' }),
    call('s1', 'mcp__clack__update_steps', {}),
    call('r1', 'Read', { file_path: '/a.ts' }),
    call('s2', 'mcp__clack__update_steps', {}),
    call('e1', 'Edit', { file_path: '/a.ts' }),
    call('agent', 'Agent', { description: 'Check the tests' }),
    call('sub', 'Bash', { command: 'npm test' }),
    text('answer', 'All done.'),
  ];
  for (const item of turn) if (item.kind === 'tool' && item.id.startsWith('s') && item.id !== 'sub') item.planId = 'claude:x:plan';
  (turn[6] as { parent?: string }).parent = 'agent';
  turn.push({
    kind: 'plan', id: 'claude:x:plan', steps: [
      { label: 'Find the check', status: 'completed', since: 's1' },
      { label: 'Fix it', status: 'in_progress', since: 's2' },
      { label: 'Write it up', status: 'pending' },
    ],
  });
  const layout = layoutTurn(turn, { before, live: true });
  assert.equal(layout.source, 'plan');
  assert.deepEqual(layout.steps.map((step) => [step.label, step.status]), [['Find the check', 'done'], ['Fix it', 'running'], ['Write it up', 'pending']]);
  assert.deepEqual(layout.steps[0]!.items.map((item) => item.id), ['look', 'r1'], 'work before the plan goes to the first step');
  assert.deepEqual(layout.steps[1]!.items.map((item) => item.id), ['e1', 'agent', 'sub'], "a subagent's work goes with the call that started it");
  assert.equal(layout.steps[1]!.calls, 3);
  assert.deepEqual(layout.shown.map((item) => item.id), ['answer']);

  // A step that started with the turn (before its first entry).
  const fromStart = layoutTurn(
    [call('r', 'Read', { file_path: '/a' }), { kind: 'plan', id: 'p', steps: [{ label: 'A', status: 'completed', since: 'x' }, { label: 'B', status: 'completed', since: 'prompt' }] }],
    { before },
  );
  assert.deepEqual(fromStart.steps[1]!.items.map((item) => item.id), ['r']);
});

test('a turn with no calls is shown as it is; one still running has no answer yet', () => {
  assert.equal(layoutTurn([text('a', 'Hello!')]).source, 'none');
  const running = layoutTurn([text('t', 'Checking.'), call('b', 'Bash', { command: 'make' }, null)], { live: true });
  assert.equal(running.steps[0]!.status, 'running');
  assert.deepEqual(running.shown, []);
  // Stopped there: the last text is the answer, and the call was not finished.
  const stopped = layoutTurn([text('t', 'Checking.'), call('b', 'Bash', { command: 'make' }, null)]);
  assert.equal(stopped.steps[0]!.status, 'unfinished');
  assert.deepEqual(stopped.shown.map((item) => item.id), ['t']);
});

test('steps are named after what was done', () => {
  const label = (...calls: Item[]) => layoutTurn(calls).steps.map((step) => step.label);
  assert.deepEqual(label(call('a', 'Grep', { pattern: 'routeOptions' })), ['Searched for “routeOptions”']);
  assert.deepEqual(label(call('a', 'Grep', { pattern: 'x' }), call('b', 'Read', { file_path: 'a/b.ts' })), ['Searched the code and read b.ts']);
  assert.deepEqual(label(call('a', 'Read', { file_path: '1' }), call('b', 'Read', { file_path: '2' }), call('c', 'Read', { file_path: '3' })), ['Read 3 files']);
  assert.deepEqual(label(call('a', 'Patch', { changes: [{ path: '/r/new.ts', kind: 'add' }] })), ['Wrote new.ts']);
  assert.deepEqual(label(call('a', 'WebSearch', { query: 'svelte 5 runes' })), ['Searched the web for “svelte 5 runes”']);
  assert.deepEqual(label(call('a', 'mcp__clack__create_artifact', { title: 'Dashboard' })), ['Made “Dashboard”']);
  assert.deepEqual(label(call('a', 'mcp__linear__list_issues', {}), call('b', 'mcp__linear__get_issue', {})), ['Used linear twice']);
  assert.deepEqual(label(call('a', 'Agent', { description: 'Explore the repo' })), ['Subagent: Explore the repo']);
  // An artifact is also shown outside the steps.
  assert.deepEqual(layoutTurn([call('a', 'mcp__clack__create_artifact', { title: 'X' })]).shown.map((item) => item.id), ['a']);
});

test('loading tools or a skill goes with the step it leads up to', () => {
  const layout = layoutTurn([
    call('skill', 'Skill', { skill: 'clack:artifacts' }),
    call('search', 'ToolSearch', { query: 'select:mcp__clack__create_artifact' }),
    call('make', 'mcp__clack__create_artifact', { title: 'Snake' }),
    text('answer', 'Made it.'),
  ]);
  assert.deepEqual(layout.steps.map((step) => step.label), ['Made “Snake”']);
  assert.deepEqual(layout.steps[0]!.items.map((item) => item.id), ['skill', 'search', 'make']);
  assert.equal(layout.steps[0]!.calls, 3);
  // A turn of nothing else is still one step.
  assert.deepEqual(layoutTurn([call('skill', 'Skill', { skill: 'pdf' }), text('a', 'Loaded.')]).steps.map((step) => step.label), ['Used the pdf skill']);
});
