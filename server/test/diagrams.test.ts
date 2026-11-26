import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'clack-diagrams-'));
process.env.CLACK_DATA_DIR = data;
process.env.CLACK_TOKEN ??= 'test-token';
const { diagramsDir, forgetDiagrams, keepDiagrams, mermaidBlocks } = await import('../src/diagrams.ts');
after(() => rmSync(data, { recursive: true, force: true }));

const chat = '2b3c4d5e-6f70-4a81-92a3-b4c5d6e7f809';
const reply = [
  'Here is how it flows:',
  '',
  '```mermaid',
  'flowchart LR',
  '  a["Browser"] --> b["Server"]',
  '```',
  '',
  'And the shares:',
  '',
  '~~~mermaid',
  'pie title Time',
  '  "Coding" : 60',
  '  "Review" : 40',
  '~~~',
  '',
  '```js',
  'console.log("not a diagram")',
  '```',
].join('\n');

test('the diagrams in a reply are found, and nothing else', () => {
  assert.deepEqual(mermaidBlocks(reply), ['flowchart LR\n  a["Browser"] --> b["Server"]', 'pie title Time\n  "Coding" : 60\n  "Review" : 40']);
  assert.deepEqual(mermaidBlocks('no diagrams here'), []);
});

test("a reply's diagrams are kept in data/diagrams/<chat>, once each, and go with the chat", async () => {
  const kept = await keepDiagrams(chat, reply, { reply: 'r1', provider: 'claude', model: 'claude-opus-5-5' });
  assert.deepEqual(kept.map((k) => k.kind), ['flowchart', 'pie']);
  const dir = diagramsDir(chat);
  assert.ok(dir.endsWith(join('diagrams', chat)), 'data/diagrams/<chat id>');
  const files = readdirSync(dir).sort();
  assert.equal(files.length, 3, 'two diagrams and the index');
  assert.ok(files.some((f) => /^\d{4}-\d{2}-\d{2}-\d{6}-flowchart-[0-9a-f]{8}\.mmd$/.test(f)));
  assert.match(readFileSync(join(dir, files.find((f) => f.includes('-pie-'))!), 'utf8'), /"Coding" : 60/);

  // The same diagram drawn again in a later reply is not kept twice.
  assert.deepEqual(await keepDiagrams(chat, reply, { reply: 'r2', provider: 'codex' }), []);
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  assert.equal(index.length, 2);
  assert.equal(index[0].model, 'claude-opus-5-5');

  // Nothing for a chat id that is not one.
  assert.deepEqual(await keepDiagrams('../../etc', reply, { reply: 'r3', provider: 'claude' }), []);

  await forgetDiagrams(chat);
  assert.ok(!existsSync(dir));
});
