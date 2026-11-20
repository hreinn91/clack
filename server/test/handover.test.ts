import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item } from '../../shared/protocol.ts';
import { buildHandover, stripHandover, withHandover } from '../src/agents/handover.ts';

const items: Item[] = [
  { kind: 'user', id: 'u1', text: 'Make a hello page' },
  { kind: 'text', id: 't1', text: 'Sure, I will write index.html.' },
  { kind: 'tool', id: 'b1', name: 'Bash', input: { command: 'ls' }, result: { text: 'index.html\nREADME.md', isError: false } },
  { kind: 'notice', id: 'n1', level: 'info', text: 'Stopped.' },
];

test('a handover carries what was said and done, and comes off again', () => {
  const handover = buildHandover(items, 'claude', 'claude-opus-5-5', '/work/site');
  assert.match(handover, /^<clack-handover from="claude" model="claude-opus-5-5">/);
  assert.match(handover, /Make a hello page/);
  assert.match(handover, /I will write index\.html/);
  assert.match(handover, /ran `ls` → index\.html \/ README\.md/);
  assert.match(handover, /- \(Stopped\.\)/);
  const message = withHandover('Now add a footer', handover);
  assert.ok(message.startsWith('Now add a footer'));
  assert.deepEqual(stripHandover(message), { text: 'Now add a footer', from: 'claude' });
});

test('a message without a handover is left as it is', () => {
  assert.deepEqual(stripHandover('Just a question'), { text: 'Just a question' });
});

test('a long conversation is cut to size, keeping the latest exchange', () => {
  const many: Item[] = [];
  for (let i = 0; i < 400; i++) many.push({ kind: 'user', id: `u${i}`, text: `message ${i} ${'x'.repeat(400)}` });
  const handover = buildHandover(many, 'codex', undefined, '/w');
  assert.ok(handover.length < 45_000);
  assert.match(handover, /message 399/);
  assert.match(handover, /Earlier conversation left out/);
});
