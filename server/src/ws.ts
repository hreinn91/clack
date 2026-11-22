import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, TerminalClientMessage, TerminalServerMessage } from '../../shared/protocol.ts';
import { logBus } from './log.ts';
import { bus, isEffort, isPermissionMode, openSession } from './sessions.ts';
import type { LiveSession, Listener } from './sessions.ts';
import { getTerminal, terminalBus } from './terminal.ts';
import { usageBus } from './agents/bus.ts';
import { notesBus } from './notes.ts';
import { isProvider } from './agents/registry.ts';

const MAX_PROMPT_CHARS = 200_000;

export function registerWs(app: FastifyInstance): void {
  const alive = new Map<WebSocket, boolean>();
  /** Connections with the log page open. */
  const logWatchers = new Set<Listener>();

  logBus.on('entry', (entry) => {
    for (const send of logWatchers) send({ t: 'log', entry });
  });

  bus.on('sessions_changed', () => {
    const data = JSON.stringify({ t: 'sessions_changed' } satisfies ServerMessage);
    for (const socket of alive.keys()) if (socket.readyState === socket.OPEN) socket.send(data);
  });

  usageBus.on('changed', (usage) => {
    const data = JSON.stringify({ t: 'usage', usage } satisfies ServerMessage);
    for (const socket of alive.keys()) if (socket.readyState === socket.OPEN) socket.send(data);
  });

  const broadcast = (msg: ServerMessage) => {
    const data = JSON.stringify(msg);
    for (const socket of alive.keys()) if (socket.readyState === socket.OPEN) socket.send(data);
  };
  notesBus.on('changed', () => broadcast({ t: 'notes_changed' }));
  notesBus.on('saved', (path: string, modified: number) => broadcast({ t: 'note_saved', path, modified }));

  terminalBus.on('changed', () => {
    const data = JSON.stringify({ t: 'terminals_changed' } satisfies ServerMessage);
    for (const socket of alive.keys()) if (socket.readyState === socket.OPEN) socket.send(data);
  });

  // A phone that locks its screen can leave a half-open socket behind; drop those.
  setInterval(() => {
    for (const [socket, ok] of alive) {
      if (!ok) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, 30_000).unref();

  app.get('/ws', { websocket: true }, (socket) => {
    let current: LiveSession | null = null;
    let openSeq = 0;

    const send: Listener = (msg) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };

    const leave = () => {
      current?.unsubscribe(send);
      current = null;
    };

    /** The session a message targets, provided this connection has it open. */
    const target = (sessionId: string): LiveSession => {
      if (!current || current.sessionId !== sessionId) throw new Error('That session is not open on this connection.');
      return current;
    };

    const handle = async (msg: ClientMessage): Promise<void> => {
      switch (msg.t) {
        case 'open': {
          const seq = ++openSeq;
          leave();
          const session = await openSession(msg.sessionId);
          if (seq !== openSeq) return; // a newer 'open' overtook this one
          current = session;
          session.subscribe(send);
          send(session.snapshot());
          break;
        }
        case 'close':
          openSeq++;
          leave();
          break;
        case 'prompt': {
          const text = typeof msg.text === 'string' ? msg.text.trim() : '';
          if (!text) return;
          if (text.length > MAX_PROMPT_CHARS) throw new Error('That message is too long.');
          target(msg.sessionId).prompt(text);
          break;
        }
        case 'interrupt':
          await target(msg.sessionId).interrupt();
          break;
        case 'permission':
          target(msg.sessionId).resolvePermission(msg.id, msg.decision, msg.answers);
          break;
        case 'mode':
          if (!isPermissionMode(msg.mode)) throw new Error('Unknown permission mode.');
          await target(msg.sessionId).setMode(msg.mode);
          break;
        case 'logs':
          if (msg.on) logWatchers.add(send);
          else logWatchers.delete(send);
          break;
        case 'config': {
          const model = msg.model ?? null;
          const effort = msg.effort ?? null;
          if (model !== null && (typeof model !== 'string' || !model || model.length > 100)) throw new Error('Unknown model.');
          if (effort !== null && !isEffort(effort)) throw new Error('Unknown effort level.');
          const session = target(msg.sessionId);
          const provider = isProvider(msg.provider) ? msg.provider : session.provider;
          await session.configure({ provider, model, effort });
          break;
        }
      }
    };

    alive.set(socket, true);
    socket.on('pong', () => alive.set(socket, true));

    socket.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      handle(msg).catch((err: unknown) => {
        send({
          t: 'error',
          message: err instanceof Error ? err.message : String(err),
          sessionId: 'sessionId' in msg ? msg.sessionId : undefined,
        });
      });
    });

    socket.on('close', () => {
      alive.delete(socket);
      logWatchers.delete(send);
      leave();
    });
  });

  // Each terminal has a socket of its own: keystrokes go one way, the shell's output the other.
  app.get('/ws/term/:id', { websocket: true }, (socket, req) => {
    const shell = getTerminal((req.params as { id: string }).id);
    if (!shell) {
      // Tells the browser this terminal is gone for good, so it does not keep trying.
      socket.close(4404, 'No such terminal');
      return;
    }

    const send = (msg: TerminalServerMessage) => {
      if (socket.readyState !== socket.OPEN) return;
      socket.send(JSON.stringify(msg));
      if (msg.t === 'exit') socket.close(4404, 'The shell exited');
    };
    shell.attach(send);
    alive.set(socket, true);
    socket.on('pong', () => alive.set(socket, true));

    socket.on('message', (raw) => {
      let msg: TerminalClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.t === 'in' && typeof msg.data === 'string') shell.write(msg.data);
      else if (msg.t === 'resize') shell.resize(msg.cols, msg.rows);
    });

    socket.on('close', () => {
      alive.delete(socket);
      shell.detach(send);
    });
  });
}
