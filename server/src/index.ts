import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify from 'fastify';
import type {
  FileListing,
  FilePreview,
  FolderInfo,
  LogPage,
  Me,
  ModelOption,
  PlanUsage,
  TerminalInfo,
  Upload,
} from '../../shared/protocol.ts';
import { isAuthed, login, logout, sameOrigin } from './auth.ts';
import { config, tokenFile } from './config.ts';
import { FileError, listDir, openImage, previewFile } from './files.ts';
import { MAX_UPLOAD_BYTES, saveUpload } from './uploads.ts';
import { ensureFolder, listFolders } from './folders.ts';
import { logDir, recentLogs } from './log.ts';
import { listModels } from './models.ts';
import { createSession, deleteChat, listSummaries, moveChat, openSession, renameChat, setArchived, shutdownAll } from './sessions.ts';
import { closeAllTerminals, closeTerminal, listTerminals, openTerminal } from './terminal.ts';
import { planUsage } from './usage.ts';
import { registerWs } from './ws.ts';

const app = Fastify({ logger: { level: 'warn' } });

await app.register(fastifyWebsocket, { options: { maxPayload: 1024 * 1024 } });

// Everything under /api and the WebSocket need the session cookie. The UI
// shell itself is public: it holds no data until the browser has signed in.
const OPEN_ROUTES = new Set(['/api/login', '/api/logout', '/api/me']);

app.addHook('onRequest', async (req, reply) => {
  const path = req.url.split('?')[0]!;
  if (!path.startsWith('/api/') && path !== '/ws' && !path.startsWith('/ws/')) return;
  if (!sameOrigin(req)) return reply.code(403).send({ error: 'Cross-origin request refused' });
  if (OPEN_ROUTES.has(path)) return;
  if (!isAuthed(req)) return reply.code(401).send({ error: 'Not signed in' });
});

app.get('/api/me', async (req): Promise<Me> => {
  // The name is the server account's by default, so it is kept from anyone not signed in.
  return isAuthed(req)
    ? { authed: true, name: config.userName, dataDir: config.dataDir, terminal: config.terminal }
    : { authed: false };
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

// Changes to an existing chat: its name, whether it is put away, and the folder it works in.
app.patch('/api/sessions/:id', async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const body = (req.body ?? {}) as { title?: unknown; archived?: unknown; folder?: unknown };
  try {
    if (body.title !== undefined) await renameChat(id, body.title);
    if (body.folder !== undefined) await moveChat(id, body.folder);
    if (typeof body.archived === 'boolean') await setArchived(id, body.archived);
    return { ok: true };
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'That change could not be made.' });
  }
});

app.delete('/api/sessions/:id', async (req, reply) => {
  try {
    await deleteChat((req.params as { id: string }).id);
    return { ok: true };
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'That chat could not be deleted.' });
  }
});

app.get('/api/folders', async (): Promise<FolderInfo[]> => listFolders());

// The most recent activity. The complete record is in the files under `dir`.
app.get('/api/logs', async (req): Promise<LogPage> => {
  const limit = Number((req.query as { limit?: string }).limit) || 500;
  return { dir: logDir, entries: recentLogs(limit) };
});

// How much of the Claude plan's limits is used. `fresh=1` asks Claude Code again rather than answering from memory.
app.get('/api/usage', async (req): Promise<PlanUsage> => planUsage((req.query as { fresh?: string }).fresh === '1'));

app.get('/api/models', async (_req, reply): Promise<ModelOption[] | undefined> => {
  try {
    return await listModels();
  } catch (err) {
    app.log.warn(err, 'could not list models');
    reply.code(502).send({ error: 'Could not get the model list from Claude Code.' });
    return;
  }
});

// ---- the data directory: its files and folders, and shells opened in them ----

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof FileError) return reply.code(err.status).send({ error: err.message });
  return reply.send(err);
});

const pathOf = (req: { query: unknown }) => (req.query as { path?: unknown }).path ?? '';

app.get('/api/files', async (req): Promise<FileListing> => listDir(pathOf(req)));

app.get('/api/files/preview', async (req): Promise<FilePreview> => previewFile(pathOf(req)));

app.get('/api/files/image', async (req, reply) => {
  const image = await openImage(pathOf(req));
  return (
    reply
      .header('content-type', image.type)
      .header('content-length', image.size)
      .header('cache-control', 'no-store')
      // Whatever the file really contains, the browser may only ever treat it as a picture.
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "sandbox; default-src 'none'")
      .send(image.stream)
  );
});

// A file attached to a chat arrives as its raw bytes and is saved in that chat's folder.
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES }, (_req, body, done) => {
  done(null, body);
});

app.post('/api/sessions/:id/files', { bodyLimit: MAX_UPLOAD_BYTES }, async (req, reply): Promise<Upload | undefined> => {
  if (!Buffer.isBuffer(req.body)) {
    reply.code(400).send({ error: 'Send the file itself as the body.' });
    return;
  }
  let cwd: string;
  try {
    cwd = (await openSession((req.params as { id: string }).id)).cwd;
  } catch {
    reply.code(404).send({ error: 'That chat does not exist.' });
    return;
  }
  return saveUpload(cwd, (req.query as { name?: unknown }).name, req.body);
});

app.get('/api/terminals', async (): Promise<TerminalInfo[]> => listTerminals());

app.post('/api/terminals', async (req): Promise<TerminalInfo> => {
  return openTerminal((req.body as { path?: unknown } | null)?.path);
});

app.delete('/api/terminals/:id', async (req) => {
  closeTerminal((req.params as { id: string }).id);
  return { ok: true };
});

registerWs(app);

const hasWebBuild = existsSync(config.webDist);
if (hasWebBuild) {
  await app.register(fastifyStatic, { root: config.webDist });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    shutdownAll();
    closeAllTerminals();
    void app.close().finally(() => process.exit(0));
  });
}

await app.listen({ port: config.port, host: config.host });

const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a!.address);

const lines = ['', 'clack is running', ''];
if (config.container) {
  // The container's own addresses mean nothing outside it: what counts is the port the host publishes.
  lines.push('  In a container. Open the port it is published on (4317 unless changed):');
  lines.push('  http://localhost:4317 on the host, or the host\'s address from another device.');
} else {
  lines.push(`  This computer:  http://localhost:${config.port}`);
  if (config.host === '0.0.0.0') {
    for (const address of lanAddresses) lines.push(`  Local network:  http://${address}:${config.port}`);
  }
}
lines.push('', `  Access token:   ${config.token}`);
lines.push(config.tokenSource === 'env' ? '  (from CLACK_TOKEN)' : `  (saved in ${tokenFile})`);
lines.push('', `  Chats work in folders under ${config.sessionsDir}`);
lines.push(`  Activity is logged to ${logDir}`);
lines.push(`  Terminals in the UI are ${config.terminal ? 'on (set CLACK_TERMINAL=off to turn them off)' : 'off'}`);
if (!hasWebBuild) {
  lines.push('', '  No web build found. Run `npm run build`, or use `npm run dev` and open the Vite URL.');
}
console.log(lines.join('\n') + '\n');
