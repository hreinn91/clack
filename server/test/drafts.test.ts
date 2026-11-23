import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

// The drafts module reads its file from the config, so the data directory is set before it loads.
const data = mkdtempSync(join(tmpdir(), 'clack-drafts-'));
process.env.CLACK_DATA_DIR = data;
process.env.CLACK_TOKEN ??= 'test-token';
const { draftsBus, flushDrafts, forgetDraft, listDrafts, saveDraft } = await import('../src/drafts.ts');
after(() => rmSync(data, { recursive: true, force: true }));

const chat = '1691aba8-b304-4049-8777-dbfcc86649df';
const file = { name: 'shot.png', path: 'data/uploads/x/shot.png', size: 12 };

test('a draft is kept per chat, passed on to other tabs, and forgotten once empty', () => {
  const heard: unknown[] = [];
  draftsBus.on('changed', (...args) => heard.push(args));
  const draft = saveDraft(chat, { text: 'half a thought', attached: [{ ...file, extra: 'dropped' }] }, 'tab-1');
  assert.equal(draft?.text, 'half a thought');
  assert.deepEqual(listDrafts()[chat]?.attached, [file], 'only what a file is made of is kept');
  assert.deepEqual(heard.at(-1), [chat, draft, 'tab-1']);

  flushDrafts();
  assert.equal(JSON.parse(readFileSync(join(data, 'drafts.json'), 'utf8'))[chat].text, 'half a thought');

  // Sending empties the box: nothing is left behind.
  assert.equal(saveDraft(chat, { text: '  ', attached: [] }, 'tab-2'), null);
  assert.equal(listDrafts()[chat], undefined);
  assert.deepEqual(heard.at(-1), [chat, null, 'tab-2']);
});

test('drafts that are not drafts are refused', () => {
  assert.throws(() => saveDraft('../etc', { text: 'x', attached: [] }, ''), /not a chat/);
  assert.throws(() => saveDraft(chat, { text: 42, attached: [] }, ''), /is text/);
  assert.throws(() => saveDraft(chat, { text: 'x', attached: [{ name: 1 }] }, ''), /not files/);
  assert.throws(() => saveDraft(chat, { text: 'x'.repeat(200_001), attached: [] }, ''), /too long/);
});

test('a deleted chat takes its draft with it', () => {
  saveDraft(chat, { text: 'gone soon', attached: [] }, '');
  forgetDraft(chat);
  flushDrafts();
  assert.equal(listDrafts()[chat], undefined);
  assert.ok(existsSync(join(data, 'drafts.json')));
});
