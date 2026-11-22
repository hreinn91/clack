import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

// The notes module reads its folder from the config, so the data directory is set before it loads.
const data = mkdtempSync(join(tmpdir(), 'clack-notes-'));
process.env.CLACK_DATA_DIR = data;
process.env.CLACK_TOKEN ??= 'test-token';
const notes = await import('../src/notes.ts');
const dir = join(data, 'notes');
after(() => rmSync(data, { recursive: true, force: true }));

test('notes nest, save, rename, move and go away together with their sub-notes', async () => {
  const plan = await notes.createNote('', 'Plan');
  assert.equal(plan, 'Plan');
  assert.equal(await notes.createNote('', 'Plan'), 'Plan 2', 'a name already taken gets a number');
  const step = await notes.createNote(plan, 'Step: one/two');
  assert.equal(step, 'Plan/Step- one-two', 'characters a file name cannot have are replaced');

  const { modified } = await notes.saveNote(step, '# One\n\nHello', undefined);
  assert.equal(readFileSync(join(dir, 'Plan', 'Step- one-two.md'), 'utf8'), '# One\n\nHello');
  assert.equal((await notes.readNote(step)).text, '# One\n\nHello');

  // Saved from somewhere else since: refused, so nothing is lost.
  await assert.rejects(notes.saveNote(step, 'stale', modified - 5000), { status: 409 });

  const tree = await notes.listNotes();
  assert.deepEqual(
    tree.map((n) => [n.path, n.children.map((c) => c.path)]),
    [
      ['Plan', ['Plan/Step- one-two']],
      ['Plan 2', []],
    ],
  );

  const renamed = await notes.moveNote(plan, 'Roadmap', undefined);
  assert.equal(renamed, 'Roadmap');
  assert.ok(existsSync(join(dir, 'Roadmap.md')) && existsSync(join(dir, 'Roadmap', 'Step- one-two.md')), 'the sub-notes move with it');
  assert.equal(await notes.moveNote('Roadmap', 'roadmap', undefined), 'roadmap', 'a change of case alone is a rename too');

  await assert.rejects(notes.moveNote('roadmap', undefined, 'roadmap/Step- one-two'), { status: 400 }, 'not inside itself');
  assert.equal(await notes.moveNote('roadmap/Step- one-two', undefined, 'Plan 2'), 'Plan 2/Step- one-two');

  await notes.deleteNote('Plan 2');
  assert.ok(!existsSync(join(dir, 'Plan 2.md')) && !existsSync(join(dir, 'Plan 2')));
});

test('a folder without a file is a note with nothing written yet', async () => {
  execFileSync('mkdir', ['-p', join(dir, 'Inbox', 'Later')]);
  writeFileSync(join(dir, 'Inbox', 'Later', 'Idea.md'), 'idea');
  writeFileSync(join(dir, '.hidden.md'), 'not shown');
  writeFileSync(join(dir, 'picture.png'), 'not a note');
  const tree = await notes.listNotes();
  const inbox = tree.find((n) => n.path === 'Inbox');
  assert.ok(inbox);
  assert.equal(inbox.children[0]?.children[0]?.path, 'Inbox/Later/Idea');
  assert.equal((await notes.readNote('Inbox')).text, '');
  assert.ok(!tree.some((n) => n.title.startsWith('.') || n.title.startsWith('picture')));
  // Writing in it makes its file.
  await notes.saveNote('Inbox', 'now written', undefined);
  assert.equal(readFileSync(join(dir, 'Inbox.md'), 'utf8'), 'now written');
});

test('paths that could reach outside the notes are refused', async () => {
  for (const path of ['../x', 'a/../../x', '/etc/passwd', '.git', '', 'a//b']) {
    await assert.rejects(notes.readNote(path), { status: 400 }, path);
  }
  symlinkSync(tmpdir(), join(dir, 'Escape'));
  await assert.rejects(notes.readNote('Escape/anything'), { status: 403 });
  assert.ok(!(await notes.listNotes()).some((n) => n.path === 'Escape'), 'a symlink is not listed');
});

test('export: one note as .md, a note with its sub-notes or everything as .zip', async () => {
  const one = await notes.exportNotes('Inbox', false);
  assert.equal(one.name, 'Inbox.md');
  assert.equal(one.data.toString(), 'now written');

  const all = await notes.exportNotes('', true);
  assert.equal(all.name, 'notes.zip');
  const zipFile = join(data, 'all.zip');
  writeFileSync(zipFile, all.data);
  assert.ok(statSync(zipFile).size > 0);
  // unzip ships with macOS and most Linux; it checks every entry's CRC too.
  const listing = execFileSync('unzip', ['-Z1', zipFile], { encoding: 'utf8' }).trim().split('\n').sort();
  assert.deepEqual(listing, ['Inbox.md', 'Inbox/Later/Idea.md', 'roadmap.md']);
  execFileSync('unzip', ['-tq', zipFile]);
  assert.equal(execFileSync('unzip', ['-p', zipFile, 'Inbox/Later/Idea.md'], { encoding: 'utf8' }), 'idea');

  const branch = await notes.exportNotes('Inbox', true);
  assert.equal(branch.name, 'Inbox.zip');
  const branchFile = join(data, 'branch.zip');
  writeFileSync(branchFile, branch.data);
  assert.deepEqual(execFileSync('unzip', ['-Z1', branchFile], { encoding: 'utf8' }).trim().split('\n').sort(), ['Inbox.md', 'Inbox/Later/Idea.md']);
});
