import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'clack-artifacts-'));
process.env.CLACK_DATA_DIR = data;
process.env.CLACK_TOKEN ??= 'test-token';
const store = await import('../src/artifacts.ts');
const { runClackTool } = await import('../src/agents/clackTools.ts');
after(() => rmSync(data, { recursive: true, force: true }));

const chat = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const cwd = join(data, 'sessions', 'site');
mkdirSync(cwd, { recursive: true });

test('an artifact is made, changed and read back through the tools, every version kept', async () => {
  const made = await runClackTool(chat, cwd, 'create_artifact', { title: 'Budget dashboard', type: 'html', content: '<h1>v1</h1>' });
  const id = /id is ([a-z0-9-]+)/.exec(made)![1]!;
  assert.match(made, new RegExp(`\\[clack-artifact chat=${chat} id=${id} version=1\\]`), 'the line the chat card is drawn from');
  assert.ok(id.startsWith('budget-dashboard-'));

  const changed = await runClackTool(chat, cwd, 'update_artifact', { id, content: '<h1>v2</h1>', note: 'bigger title' });
  assert.match(changed, /version=2\]/);

  const meta = await store.getArtifact(chat, id);
  assert.deepEqual(meta.versions.map((v) => v.n), [1, 2]);
  assert.equal(meta.versions[1]!.note, 'bigger title');
  assert.equal(readFileSync(join(data, 'artifacts', chat, id, 'v1.html'), 'utf8'), '<h1>v1</h1>', 'the first version is kept');

  assert.match(await runClackTool(chat, cwd, 'read_artifact', { id }), /<h1>v2<\/h1>/);
  assert.match(await runClackTool(chat, cwd, 'read_artifact', { id, version: 1 }), /<h1>v1<\/h1>/);
  assert.match(await runClackTool(chat, cwd, 'list_artifacts', {}), new RegExp(`${id}: "Budget dashboard" \\(html, version 2\\)`));
});

test('a file the agent made in the chat\'s folder can be kept; nothing from outside it', async () => {
  writeFileSync(join(cwd, 'chart.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const meta = await store.createArtifact(chat, cwd, { title: 'Sales chart', type: 'file', path: 'chart.png' });
  assert.equal(meta.ext, 'png');
  assert.equal(meta.mime, 'image/png');

  writeFileSync(join(data, 'secret.txt'), 'not for artifacts');
  await assert.rejects(store.createArtifact(chat, cwd, { title: 'x', type: 'file', path: '../../secret.txt' }), { status: 403 });
  symlinkSync(join(data, 'secret.txt'), join(cwd, 'link.txt'));
  await assert.rejects(store.createArtifact(chat, cwd, { title: 'x', type: 'code', path: 'link.txt' }), { status: 403 }, 'not through a symlink either');
  await assert.rejects(store.createArtifact(chat, cwd, { title: 'x', type: 'file' }), { status: 400 });
  await assert.rejects(store.createArtifact(chat, cwd, { title: 'x', type: 'exe', content: 'x' }), { status: 400 });
  await assert.rejects(store.createArtifact('../../etc', cwd, { title: 'x', type: 'html', content: 'x' }), { status: 400 });
  await assert.rejects(runClackTool(chat, cwd, 'update_artifact', { id: '../meta', content: 'x' }), { status: 400 });
});

test('a deleted chat\'s artifacts are kept with its title, or deleted on request', async () => {
  const kept = await store.settleChatArtifacts(chat, false, 'Site work');
  assert.equal(kept, 2);
  assert.ok((await store.listArtifacts(chat)).every((a) => a.chatTitle === 'Site work'));

  await store.settleChatArtifacts(chat, true);
  assert.equal((await store.listArtifacts(chat)).length, 0);
  assert.ok(!existsSync(join(data, 'artifacts', chat)));
});
