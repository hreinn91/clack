import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemsFromTurns, itemsOf } from '../src/agents/codex/items.ts';
import type { ThreadItem, Turn } from '../src/agents/codex/protocol.ts';

test('a finished command becomes a Bash card with its output and exit code', () => {
  const item: ThreadItem = {
    type: 'commandExecution',
    id: 'c1',
    command: 'false',
    cwd: '/w',
    processId: null,
    status: 'failed',
    aggregatedOutput: 'nope\n',
    exitCode: 1,
    durationMs: 3,
  };
  const [card] = itemsOf(item);
  assert.equal(card?.kind, 'tool');
  if (card?.kind !== 'tool') return;
  assert.equal(card.name, 'Bash');
  assert.deepEqual(card.input, { command: 'false', cwd: '/w' });
  assert.deepEqual(card.result, { text: 'nope\n(exit code 1)', isError: true });
});

test('a file change becomes a Patch card with one diff per file', () => {
  const item: ThreadItem = {
    type: 'fileChange',
    id: 'f1',
    status: 'completed',
    changes: [
      { path: '/w/a.txt', kind: { type: 'add' }, diff: '+hi' },
      { path: '/w/b.txt', kind: { type: 'update', move_path: '/w/c.txt' }, diff: '-x\n+y' },
    ],
  };
  const [card] = itemsOf(item);
  assert.ok(card?.kind === 'tool' && card.name === 'Patch');
  if (card?.kind !== 'tool') return;
  assert.deepEqual((card.input as { changes: unknown[] }).changes, [
    { path: '/w/a.txt', kind: 'add', diff: '+hi' },
    { path: '/w/b.txt', kind: 'update', movePath: '/w/c.txt', diff: '-x\n+y' },
  ]);
  assert.equal(card.result?.text, 'Added /w/a.txt\nUpdated /w/b.txt');
});

test('MCP calls keep the name the UI knows, and their text result', () => {
  const item: ThreadItem = {
    type: 'mcpToolCall',
    id: 'm1',
    server: 'docs',
    tool: 'search',
    status: 'completed',
    arguments: { q: 'x' },
    result: { content: [{ type: 'text', text: 'found it' }], structuredContent: null },
    error: null,
  };
  const [card] = itemsOf(item);
  assert.ok(card?.kind === 'tool');
  if (card?.kind !== 'tool') return;
  assert.equal(card.name, 'mcp__docs__search');
  assert.equal(card.result?.text, 'found it');
});

test('a saved thread reads back with the model signed on the replies, and stopped turns said', () => {
  const turns: Turn[] = [
    {
      id: 't1',
      status: 'interrupted',
      error: null,
      startedAt: 1_700_000_000,
      completedAt: 1_700_000_010,
      items: [
        { type: 'userMessage', id: 'u', content: [{ type: 'text', text: 'hi', text_elements: [] }] },
        { type: 'reasoning', id: 'r', summary: ['Thinking about it'], content: [] },
        { type: 'agentMessage', id: 'a', text: 'Hello!', phase: null },
      ],
    },
  ];
  const items = itemsFromTurns(turns, 'gpt-6.2-sol', 'low');
  assert.deepEqual(
    items.map((item) => item.kind),
    ['user', 'thinking', 'text', 'notice'],
  );
  assert.equal(items[2]?.model, 'gpt-6.2-sol');
  assert.equal(items[2]?.effort, 'low');
  assert.equal(items[0]?.model, undefined);
});
