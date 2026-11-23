import { existsSync } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify from 'fastify';
import type { FastifyReply } from 'fastify';
import type {
  Capabilities,
  ContextDetail,
  FileListing,
  FilePreview,
  BrowseListing,
  FolderInfo,
  FolderRoot,
  LogPage,
  Me,
  MessageDraft,
  NoteContent,
  NoteNode,
  ProviderModels,
  PlanUsage,
  TerminalInfo,
  Upload,
} from '../../shared/protocol.ts';
import { isAuthed, login, logout, sameOrigin } from './auth.ts';
import { config, tokenFile } from './config.ts';
import { FileError, listDir, openChatImage, openImage, previewFile } from './files.ts';
import { MAX_UPLOAD_BYTES, saveUpload } from './uploads.ts';
import { avatarVersion, MAX_AVATAR_BYTES, openAvatar, removeAvatar, saveAvatar } from './avatar.ts';
import { backend, backends, isProvider, startingProvider } from './agents/registry.ts';
import { addRoot, browse, ensureFolder, folderLabel, listFolders, listRoots } from './folders.ts';
import { logDir, recentLogs } from './log.ts';
import { flushDrafts, listDrafts, saveDraft } from './drafts.ts';
import { createNote, deleteNote, exportNotes, listNotes, moveNote, NoteError, readNote, saveNote } from './notes.ts';
import { bus, contextDetail, createSession, deleteChat, deleteFolder, forgetRoot, gitDetail, gitDiff, listSummaries, moveChat, openSession, renameChat, restoreFolder, setArchived, shutdownAll, stopTask } from './sessions.ts';
import { closeAllTerminals, closeTerminal, listTerminals, openTerminal } from './terminal.ts';
import { defaultPrefs } from './prefs.ts';
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
    ? {
        authed: true,
        name: config.userName,
        dataDir: config.dataDir,
        terminal: config.terminal,
        outsideFolders: config.outsideFolders,
        home: homedir(),
        avatar: await avatarVersion(),
      }
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

// A chat always runs in a folder under data/sessions, at any depth. The name is
// reduced to plain folder names first, so it cannot reach anywhere else.
app.post('/api/sessions', async (req, reply) => {
  const name = (req.body as { folder?: unknown } | null)?.folder;
  try {
    const cwd = await ensureFolder(name);
    return { sessionId: createSession(cwd, await startingProvider(defaultPrefs().provider ?? 'claude')).sessionId };
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not create that folder.' });
  }
});

// Changes to an existing chat: its name, whether it is put away, and the folder it works in.
app.patch('/api/sessions/:id', async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const body = (req.body ?? {}) as { title?: unknown; archived?: unknown; folder?: unknown; restoreFolder?: unknown };
  try {
    if (body.title !== undefined) await renameChat(id, body.title);
    if (body.restoreFolder === true) await restoreFolder(id);
    if (body.folder !== undefined) await moveChat(id, body.folder);
    if (typeof body.archived === 'boolean') await setArchived(id, body.archived);
    return { ok: true };
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'That change could not be made.' });
  }
});

// What fills a chat's context window, for the panel under the chat's title.
// What was typed in each chat and not sent yet, so it waits in its own chat, on any device.
app.get('/api/drafts', async (): Promise<Record<string, MessageDraft>> => listDrafts());

app.put('/api/drafts/:id', { bodyLimit: 1024 * 1024 }, async (req, reply) => {
  try {
    const draft = saveDraft((req.params as { id: string }).id, req.body, req.headers['x-clack-client']);
    return { at: draft?.at ?? null };
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'That draft could not be saved.' });
  }
});

app.get('/api/sessions/:id/context', async (req, reply): Promise<ContextDetail | undefined> => {
  try {
    return await contextDetail((req.params as { id: string }).id);
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'The context could not be measured.' });
  }
});

// What is changed and not committed in a chat's git repository, file by file.
app.get('/api/sessions/:id/git', async (req, reply) => {
  try {
    return { status: await gitDetail((req.params as { id: string }).id) };
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'git could not be asked.' });
  }
});

// One changed file's diff, for the diff view: `area` is how the Changes list grouped it, `whole=1` for the whole file.
app.get('/api/sessions/:id/git/diff', async (req, reply) => {
  const q = req.query as { path?: string; from?: string; area?: string; whole?: string };
  try {
    return await gitDiff((req.params as { id: string }).id, { path: q.path, from: q.from, area: q.area }, q.whole === '1');
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'The diff could not be read.' });
  }
});

// Stops one of a chat's background tasks (a shell command or agent Claude left running).
app.post('/api/sessions/:id/tasks/:task/stop', async (req, reply) => {
  const { id, task } = req.params as { id: string; task: string };
  try {
    await stopTask(id, task);
    return { ok: true };
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'That task could not be stopped.' });
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

// Folders outside data/sessions that chats can work in, each with its own tree in the sidebar.
app.get('/api/roots', async (): Promise<FolderRoot[]> => listRoots());

// Adds one. The answer is where a chat started from the picker works: the folder's real path.
app.post('/api/roots', async (req, reply) => {
  try {
    const path = await addRoot((req.body as { path?: unknown } | null)?.path);
    bus.emit('sessions_changed');
    return { path };
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'That folder could not be added.' });
  }
});

// Takes one off the list. Its files are not touched.
app.delete('/api/roots', async (req, reply) => {
  try {
    await forgetRoot((req.body as { path?: unknown } | null)?.path);
    return { ok: true };
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'That folder could not be removed.' });
  }
});

// The folders inside one folder of the server computer, for the picker that adds outside folders.
app.get('/api/browse', async (req, reply): Promise<BrowseListing | undefined> => {
  try {
    return await browse((req.query as { path?: string }).path);
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'That folder could not be read.' });
  }
});

// Deletes a folder under data/sessions, with everything in it. The path is the one the chat tree shows ("work/MyRepo").
app.delete('/api/folders', async (req, reply) => {
  try {
    await deleteFolder((req.body as { path?: unknown } | null)?.path);
    return { ok: true };
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'That folder could not be deleted.' });
  }
});

// What an agent can use in a folder (or, with no folder, everywhere): MCP servers, skills, agents, tools.
app.get('/api/capabilities', async (req, reply): Promise<Capabilities | undefined> => {
  const params = req.query as { folder?: string; fresh?: string; provider?: string };
  try {
    const provider = isProvider(params.provider) ? params.provider : 'claude';
    return await backend(provider).capabilities(params.folder ?? '', params.fresh === '1');
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'The agent could not be asked.' });
  }
});

// A new, empty folder for chats, at any depth under data/sessions ("work/client-a").
app.post('/api/folders', async (req, reply) => {
  try {
    const path = await ensureFolder((req.body as { path?: unknown } | null)?.path, true);
    bus.emit('sessions_changed');
    return { name: folderLabel(path) };
  } catch (err) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'Could not create that folder.' });
  }
});

// The most recent activity. The complete record is in the files under `dir`.
app.get('/api/logs', async (req): Promise<LogPage> => {
  const limit = Number((req.query as { limit?: string }).limit) || 500;
  return { dir: logDir, entries: recentLogs(limit) };
});

// How much of each provider's plan limits is used. `fresh=1` asks again rather than answering from memory;
// `provider` asks only that one.
app.get('/api/usage', async (req): Promise<PlanUsage[]> => {
  const { fresh, provider } = req.query as { fresh?: string; provider?: string };
  const asked = backends().filter((b) => !isProvider(provider) || b.provider === provider);
  return Promise.all(
    asked.map((b) =>
      b.usage(fresh === '1').catch(
        (err): PlanUsage => ({ provider: b.provider, available: false, windows: [], fetchedAt: Date.now(), error: err instanceof Error ? err.message : String(err) }),
      ),
    ),
  );
});

// Every provider's models, and whether it can be used. One that cannot is still listed, saying why.
// `fresh=1` looks at the sign-ins again (after signing in on the server, say).
app.get('/api/models', async (req): Promise<ProviderModels[]> =>
  Promise.all(
    backends().map(async (b): Promise<ProviderModels> => {
      try {
        const status = await b.status((req.query as { fresh?: string }).fresh === '1');
        if (!status.available) return { provider: b.provider, ...status, models: [] };
        return { provider: b.provider, ...status, models: await b.models() };
      } catch (err) {
        app.log.warn(err, `could not list ${b.name} models`);
        return { provider: b.provider, available: false, reason: err instanceof Error ? err.message : String(err), models: [] };
      }
    }),
  ),
);

// ---- the data directory: its files and folders, and shells opened in them ----

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof FileError || err instanceof NoteError) return reply.code(err.status).send({ error: err.message });
  return reply.send(err);
});

const pathOf = (req: { query: unknown }) => (req.query as { path?: unknown }).path ?? '';

app.get('/api/files', async (req): Promise<FileListing> => listDir(pathOf(req)));

app.get('/api/files/preview', async (req): Promise<FilePreview> => previewFile(pathOf(req)));

function sendImage(reply: FastifyReply, image: { stream: ReadStream; type: string; size: number }) {
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
}

app.get('/api/files/image', async (req, reply) => sendImage(reply, await openImage(pathOf(req))));

// A picture in a chat's folder, by its path from there: attachments, wherever the chat works.
app.get('/api/sessions/:id/image', async (req, reply) => {
  let cwd: string;
  try {
    cwd = (await openSession((req.params as { id: string }).id)).cwd;
  } catch {
    return reply.code(404).send({ error: 'That chat does not exist.' });
  }
  return sendImage(reply, await openChatImage(cwd, (req.query as { path?: unknown }).path));
});

// The person's own picture, shown instead of their initials. It arrives as raw bytes, already cropped and shrunk.
app.get('/api/me/avatar', async (_req, reply) => {
  const avatar = await openAvatar();
  return reply
    .header('content-type', avatar.type)
    .header('cache-control', 'private, max-age=31536000, immutable')
    .header('x-content-type-options', 'nosniff')
    .header('content-security-policy', "sandbox; default-src 'none'")
    .send(avatar.stream);
});

app.put('/api/me/avatar', { bodyLimit: MAX_AVATAR_BYTES }, async (req, reply) => {
  if (!Buffer.isBuffer(req.body)) return reply.code(400).send({ error: 'Send the picture itself as the body.' });
  return { avatar: await saveAvatar(req.body) };
});

app.delete('/api/me/avatar', async () => {
  await removeAvatar();
  return { ok: true };
});

// A file attached to a chat arrives as its raw bytes and is saved in the data directory.
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES }, (_req, body, done) => {
  done(null, body);
});

app.post('/api/sessions/:id/files', { bodyLimit: MAX_UPLOAD_BYTES }, async (req, reply): Promise<Upload | undefined> => {
  if (!Buffer.isBuffer(req.body)) {
    reply.code(400).send({ error: 'Send the file itself as the body.' });
    return;
  }
  let sessionId: string;
  try {
    sessionId = (await openSession((req.params as { id: string }).id)).sessionId;
  } catch {
    reply.code(404).send({ error: 'That chat does not exist.' });
    return;
  }
  return saveUpload(sessionId, (req.query as { name?: unknown }).name, req.body);
});

// ---- notes: markdown files in data/notes, sub-notes in a folder beside each ----

app.get('/api/notes', async (): Promise<NoteNode[]> => listNotes());

app.get('/api/notes/content', async (req): Promise<NoteContent> => readNote(pathOf(req)));

app.put('/api/notes/content', { bodyLimit: 6 * 1024 * 1024 }, async (req, reply) => {
  const body = (req.body ?? {}) as { path?: unknown; text?: unknown; base?: unknown };
  try {
    return await saveNote(body.path, body.text, body.base);
  } catch (err) {
    // Changed somewhere else: the newer text goes back, for the editor to show.
    if (err instanceof NoteError && err.status === 409) {
      return reply.code(409).send({ error: err.message, note: await readNote(body.path) });
    }
    throw err;
  }
});

app.post('/api/notes', async (req) => {
  const body = (req.body ?? {}) as { parent?: unknown; title?: unknown };
  return { path: await createNote(body.parent ?? '', body.title) };
});

app.patch('/api/notes', async (req) => {
  const body = (req.body ?? {}) as { path?: unknown; title?: unknown; parent?: unknown };
  return { path: await moveNote(body.path, body.title, body.parent) };
});

app.delete('/api/notes', async (req) => {
  await deleteNote(pathOf(req));
  return { ok: true };
});

// A note as a .md file, or it and its sub-notes (or every note, with no path) as a .zip.
app.get('/api/notes/export', async (req, reply) => {
  const query = req.query as { path?: unknown; format?: unknown };
  const file = await exportNotes(query.path ?? '', query.format === 'zip');
  const ascii = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return reply
    .header('content-type', file.type)
    .header('content-disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`)
    .header('cache-control', 'no-store')
    .header('x-content-type-options', 'nosniff')
    .send(file.data);
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
    flushDrafts();
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
