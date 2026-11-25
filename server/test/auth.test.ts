import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

// The sign-in check, against a real server: however a request spells its URL,
// if it reaches the API or a socket it needs the session cookie.

const port = 43000 + Math.floor(Math.random() * 2000);
const data = mkdtempSync(join(tmpdir(), 'clack-auth-'));
const server = spawn(process.execPath, ['src/index.ts'], {
  cwd: join(import.meta.dirname, '..'),
  env: { ...process.env, CLACK_DATA_DIR: data, CLACK_TOKEN: 'auth-test', CLACK_PORT: String(port), CLACK_HOST: '127.0.0.1', CLACK_CODEX: 'off', CLACK_TERMINAL: 'off' },
  stdio: 'ignore',
});

after(() => {
  server.kill();
  rmSync(data, { recursive: true, force: true });
});

/** Sends `target` exactly as given as the request line's target, which fetch() would tidy up first. */
function send(target: string, { method = 'GET', headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; body: string; cookie?: string }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path: target, headers }, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] }));
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve({ status: res.statusCode ?? 0, body: '' });
    });
    req.on('error', reject);
    req.end(body);
  });
}

const upgrade = { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' };

before(async () => {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await send('/api/me')).status === 200) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the server did not start');
});

test('the API refuses requests without a sign-in, however the URL is written', async () => {
  for (const target of [
    '/api/sessions',
    `http://127.0.0.1:${port}/api/sessions`,
    'http://elsewhere.example/api/sessions',
    '/%61pi/sessions',
    `http://127.0.0.1:${port}/%61pi/folders`,
  ]) {
    assert.equal((await send(target)).status, 401, target);
  }
  const create = await send('/%61pi/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"title":"x"}' });
  assert.equal(create.status, 401, 'a change through an encoded path');
});

test('the WebSocket refuses an upgrade without a sign-in, however the URL is written', async () => {
  for (const target of ['/ws', `http://127.0.0.1:${port}/ws`, '/%77s']) {
    assert.equal((await send(target, { headers: upgrade })).status, 401, target);
  }
});

test('signed in, the same requests go through; the page itself is open', async () => {
  const login = await send('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"token":"auth-test"}' });
  assert.equal(login.status, 200);
  const cookie = login.cookie!;
  assert.equal((await send('/api/sessions', { headers: { cookie } })).status, 200);
  assert.equal((await send(`http://127.0.0.1:${port}/api/sessions`, { headers: { cookie } })).status, 200);
  assert.equal((await send('/ws', { headers: { ...upgrade, cookie } })).status, 101);
  assert.equal((await send('/api/me')).status, 200);
  // Cross-origin stays refused even with the cookie.
  assert.equal((await send('/api/sessions', { headers: { cookie, origin: 'http://elsewhere.example' } })).status, 403);
});
