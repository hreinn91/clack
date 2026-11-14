import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify from 'fastify';
import type { FolderInfo, LogPage, Me, ModelOption } from '../../shared/protocol.ts';
import { isAuthed, login, logout, sameOrigin } from './auth.ts';
import { config, tokenFile } from './config.ts';
import { ensureFolder, listFolders } from './folders.ts';
import { logDir, recentLogs } from './log.ts';
import { listModels } from './models.ts';
import { createSession, listSummaries, shutdownAll } from './sessions.ts';
import { registerWs } from './ws.ts';

const app = Fastify({ logger: { level: 'warn' } });

await app.register(fastifyWebsocket, { options: { maxPayload: 1024 * 1024 } });

// Everything under /api and the WebSocket need the session cookie. The UI
// shell itself is public: it holds no data until the browser has signed in.
const OPEN_ROUTES = new Set(['/api/login', '/api/logout', '/api/me']);

app.addHook('onRequest', async (req, reply) => {
  const path = req.url.split('?')[0]!;
  if (!path.startsWith('/api/') && path !== '/ws') return;
  if (!sameOrigin(req)) return reply.code(403).send({ error: 'Cross-origin request refused' });
  if (OPEN_ROUTES.has(path)) return;
  if (!isAuthed(req)) return reply.code(401).send({ error: 'Not signed in' });
});

app.get('/api/me', async (req): Promise<Me> => {
  return { authed: isAuthed(req) };
});

app.post('/api/login', async (req, reply) => {
  const token = (req.body as { token?: unknown } | null)?.token;
  if (!login(req, reply, token)) return reply;
  return { ok: true };
});

app.post('/api/logout', async (_req, reply) => {
  logout(reply);
  return { ok: true };
});

app.get('/api/sessions', async () => listSummaries());

// A chat always runs in a folder directly under data/sessions. The name is
// reduced to a plain folder name first, so it cannot reach anywhere else.
app.post('/api/sessions', async (req, reply) => {
  const name = (req.body as { folder?: unknown } | null)?.folder;
  try {
    return { sessionId: createSession(await ensureFolder(name)).sessionId };
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not create that folder.' });
  }
});

app.get('/api/folders', async (): Promise<FolderInfo[]> => listFolders());

// The most recent activity. The complete record is in the files under `dir`.
app.get('/api/logs', async (req): Promise<LogPage> => {
  const limit = Number((req.query as { limit?: string }).limit) || 500;
  return { dir: logDir, entries: recentLogs(limit) };
});

app.get('/api/models', async (_req, reply): Promise<ModelOption[] | undefined> => {
  try {
    return await listModels();
  } catch (err) {
    app.log.warn(err, 'could not list models');
    reply.code(502).send({ error: 'Could not get the model list from Claude Code.' });
    return;
  }
});

registerWs(app);

const hasWebBuild = existsSync(config.webDist);
if (hasWebBuild) {
  await app.register(fastifyStatic, { root: config.webDist });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    shutdownAll();
    void app.close().finally(() => process.exit(0));
  });
}

await app.listen({ port: config.port, host: config.host });

const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a!.address);

const lines = ['', 'clack is running', '', `  This computer:  http://localhost:${config.port}`];
if (config.host === '0.0.0.0') {
  for (const address of lanAddresses) lines.push(`  Local network:  http://${address}:${config.port}`);
}
lines.push('', `  Access token:   ${config.token}`);
lines.push(config.tokenSource === 'env' ? '  (from CLACK_TOKEN)' : `  (saved in ${tokenFile})`);
lines.push('', `  Chats work in folders under ${config.sessionsDir}`);
lines.push(`  Activity is logged to ${logDir}`);
if (!hasWebBuild) {
  lines.push('', '  No web build found. Run `npm run build`, or use `npm run dev` and open the Vite URL.');
}
console.log(lines.join('\n') + '\n');
