import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

// The store reads its file when it loads, so the data directory and an old file are set up first.
const data = mkdtempSync(join(tmpdir(), 'clack-unread-'));
process.env.CLACK_DATA_DIR = data;
process.env.CLACK_TOKEN ??= 'test-token';
const old = Date.now() - 40 * 24 * 60 * 60 * 1000;
writeFileSync(join(data, 'unread.json'), JSON.stringify({ stale: old, kept: Date.now() - 1000, junk: 'x' }));
const { markFinished, markSeen, unreadSince } = await import('../src/unread.ts');
after(() => rmSync(data, { recursive: true, force: true }));

test('a finished reply stays unread until the chat is seen, across a restart', () => {
  assert.equal(unreadSince('stale'), undefined, 'a month-old entry is let go');
  assert.equal(unreadSince('junk'), undefined);
  assert.ok(unreadSince('kept'));

  markFinished('chat-a', 1234);
  assert.equal(unreadSince('chat-a'), 1234);
  assert.equal(JSON.parse(readFileSync(join(data, 'unread.json'), 'utf8'))['chat-a'], 1234, 'kept on disk');

  assert.equal(markSeen('chat-a'), true);
  assert.equal(unreadSince('chat-a'), undefined);
  assert.equal(markSeen('chat-a'), false, 'seeing it twice changes nothing');
});
