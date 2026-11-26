import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

process.env.CLACK_DATA_DIR = mkdtempSync(join(tmpdir(), 'clack-stats-data-'));
process.env.CLACK_TOKEN ??= 'test-token';
const { readClaude, readCodex } = await import('../src/stats/sources.ts');

const dir = mkdtempSync(join(tmpdir(), 'clack-stats-'));
after(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(process.env.CLACK_DATA_DIR!, { recursive: true, force: true });
});

const SECRET = 'the launch codes are 1234';
const lines = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join('\n') + '\nnot json at all\n';

test('a Claude Code transcript gives numbers only: tokens once per reply, tools, prompts, cost steps', async () => {
  const path = join(dir, 'claude.jsonl');
  const reply = { id: 'msg_1', model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 300, cache_creation_input_tokens: 40, output_tokens_details: { thinking_tokens: 5 } } };
  writeFileSync(
    path,
    lines([
      { type: 'user', sessionId: 's1', cwd: '/work/site', timestamp: '2026-11-20T10:00:00Z', message: { role: 'user', content: SECRET } },
      // One reply written as two lines (one per content block), with the same usage on both.
      { type: 'assistant', sessionId: 's1', requestId: 'r1', timestamp: '2026-11-20T10:00:05Z', message: { ...reply, content: [{ type: 'text', text: SECRET }] } },
      { type: 'assistant', sessionId: 's1', requestId: 'r1', timestamp: '2026-11-20T10:00:06Z', message: { ...reply, content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: SECRET } }] } },
      // A tool result and a command are not prompts.
      { type: 'user', sessionId: 's1', timestamp: '2026-11-20T10:00:07Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: SECRET }] } },
      { type: 'user', sessionId: 's1', timestamp: '2026-11-20T10:00:08Z', message: { role: 'user', content: '<command-name>/usage</command-name>' } },
      { type: 'cost-state', sessionId: 's1', totalCostUSD: 1.5, totalAPIDuration: 4000, totalToolDuration: 1000, totalLinesAdded: 12, totalLinesRemoved: 3, modelUsage: { 'claude-opus-5-5': { costUSD: 1.5 } } },
      { type: 'cost-state', sessionId: 's1', totalCostUSD: 2, totalAPIDuration: 6000, totalToolDuration: 1000, totalLinesAdded: 20, totalLinesRemoved: 3, modelUsage: { 'claude-opus-5-5': { costUSD: 2 } } },
      // Claude Code started again: its totals start from nothing.
      { type: 'cost-state', sessionId: 's1', totalCostUSD: 0.25, totalAPIDuration: 500, totalToolDuration: 0, totalLinesAdded: 0, totalLinesRemoved: 0, modelUsage: { 'claude-opus-5-5': { costUSD: 0.25 } } },
    ]),
  );
  const facts = await readClaude(path);
  assert.ok(facts);
  assert.equal(facts.session, 's1');
  assert.equal(facts.cwd, '/work/site');
  const kinds = (kind: string) => facts.facts.filter((f) => f[0] === kind);
  assert.equal(kinds('p').length, 1, 'only the typed message counts as a prompt');
  assert.deepEqual(kinds('k').map((f) => f.slice(2)), [['claude-opus-5-5', 10, 20, 300, 40, 5]], 'a reply counted once');
  assert.deepEqual(kinds('t').map((f) => f[2]), ['Bash']);
  assert.deepEqual(kinds('c').map((f) => f[2]), [1.5, 0.5, 0.25], 'cost in steps, starting again after a restart');
  assert.deepEqual(kinds('a').map((f) => f[2]), [5000, 2000, 500]);
  assert.deepEqual(kinds('l').map((f) => f.slice(2)), [[12, 3], [8, 0]]);
  assert.ok(!JSON.stringify(facts).includes('launch codes'), 'nothing that was said is kept');

  // The same transcript written with spaces after the colons reads the same.
  const spaced = join(dir, 'claude-spaced.jsonl');
  writeFileSync(spaced, (await import('node:fs')).readFileSync(path, 'utf8').split('\n').map((line) => line.replaceAll('":', '": ')).join('\n'));
  assert.deepEqual((await readClaude(spaced))?.facts.map((f) => f[0]), facts.facts.map((f) => f[0]));
});

test('a Codex session gives turns with their time, tokens per response and tools, and no cost', async () => {
  const path = join(dir, 'codex.jsonl');
  writeFileSync(
    path,
    lines([
      { timestamp: '2026-11-21T09:00:00Z', type: 'session_meta', payload: { id: 'thread-1', cwd: '/work/api' } },
      { timestamp: '2026-11-21T09:00:00Z', type: 'turn_context', payload: { model: 'gpt-6.2-astra', cwd: '/work/api' } },
      { timestamp: '2026-11-21T09:00:01Z', type: 'event_msg', payload: { type: 'task_started', turn_id: 't1' } },
      { timestamp: '2026-11-21T09:00:02Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: SECRET }] } },
      { timestamp: '2026-11-21T09:00:03Z', type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', input: SECRET } },
      { timestamp: '2026-11-21T09:00:04Z', type: 'token_usage_record', payload: { usage: { input_tokens: 1000, cached_input_tokens: 800, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 10 } } },
      { timestamp: '2026-11-21T09:00:04Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 1050 }, last_token_usage: { total_tokens: 1050 } } } },
      { timestamp: '2026-11-21T09:00:31Z', type: 'event_msg', payload: { type: 'task_complete', turn_id: 't1', last_agent_message: SECRET } },
    ]),
  );
  const facts = await readCodex(path);
  assert.ok(facts);
  assert.equal(facts.session, 'thread-1');
  const kinds = (kind: string) => facts.facts.filter((f) => f[0] === kind);
  assert.equal(kinds('p').length, 1);
  assert.deepEqual(kinds('a').map((f) => f[2]), [30_000], 'from the turn starting to finishing');
  assert.deepEqual(kinds('k').map((f) => f.slice(2)), [['gpt-6.2-astra', 200, 50, 800, 0, 10]], 'per-response records win over running totals');
  assert.deepEqual(kinds('t').map((f) => f[2]), ['exec']);
  assert.equal(kinds('c').length, 0, 'Codex records no cost');
  assert.ok(!JSON.stringify(facts).includes('launch codes'));
});
