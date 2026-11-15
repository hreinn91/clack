import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { chmodSync, statSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, delimiter, dirname, join } from 'node:path';
import type { IPty } from 'node-pty';
import type { TerminalInfo, TerminalServerMessage } from '../../shared/protocol.ts';
import { config } from './config.ts';
import { dataPath, FileError, resolveInData } from './files.ts';

// node-pty is a CommonJS package with a native part, so it is loaded the CommonJS way.
const require = createRequire(import.meta.url);

/** Emits 'changed' whenever a terminal is opened or goes away. */
export const terminalBus = new EventEmitter();

const MAX_TERMINALS = 12;
/** How much recent output is kept per terminal, to redraw the screen for a browser that (re)connects. */
const MAX_SCROLLBACK_CHARS = 400_000;

type Send = (msg: TerminalServerMessage) => void;

let helperChecked = false;

/**
 * node-pty starts shells through a small helper program. npm can leave it
 * without permission to run (it does when install scripts are not allowed),
 * and every shell then fails to start. Putting the permission back is harmless.
 */
function fixHelper(): void {
  if (helperChecked || process.platform === 'win32') return;
  helperChecked = true;
  const root = dirname(dirname(require.resolve('node-pty')));
  for (const helper of [
    join(root, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
    join(root, 'build', 'Release', 'spawn-helper'),
  ]) {
    try {
      if (!(statSync(helper).mode & 0o111)) chmodSync(helper, 0o755);
    } catch {
      // Not there in this install: the other location is the one in use.
    }
  }
}

/** The environment a shell starts with: the server's own, minus what only makes sense for the server. */
function shellEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    // The access token is the server's secret, and npm's variables describe how the server was started.
    if (key === 'CLACK_TOKEN' || key.startsWith('npm_') || key === 'INIT_CWD') continue;
    env[key] = value;
  }
  // `npm start` puts this project's own tools first on the PATH; a shell should not inherit that.
  if (env.PATH) {
    env.PATH = env.PATH.split(delimiter)
      .filter((dir) => !/[\\/]node_modules[\\/]\.bin$/.test(dir))
      .join(delimiter);
  }
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.TERM_PROGRAM = 'clack';
  return env;
}

/**
 * One shell running on the server. It keeps running when no browser is
 * looking, and remembers its recent output so a browser that comes back sees
 * the screen as it is now.
 */
class Shell {
  readonly id = randomUUID();
  readonly created = Date.now();
  readonly cwd: string;
  readonly title: string;

  private proc: IPty | undefined;
  private ended = false;
  private startTimer: ReturnType<typeof setTimeout>;
  private scrollback: string[] = [];
  private scrollbackChars = 0;
  private clients = new Set<Send>();
  private onExit: () => void;

  constructor(cwd: string, onExit: () => void) {
    this.cwd = cwd;
    this.title = basename(cwd);
    this.onExit = onExit;
    // The shell starts when the first browser says how big its screen is, so the
    // prompt is drawn for that size from the start. If nobody turns up, it starts anyway.
    this.startTimer = setTimeout(() => this.start(100, 30), 3000);
  }

  private start(cols: number, rows: number): void {
    if (this.proc || this.ended) return;
    clearTimeout(this.startTimer);
    try {
      fixHelper();
      const pty = require('node-pty') as typeof import('node-pty');
      this.proc = pty.spawn(process.env.SHELL || '/bin/sh', ['-l'], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: this.cwd,
        env: shellEnv(),
      });
    } catch (err) {
      this.output(`The shell could not be started: ${err instanceof Error ? err.message : String(err)}\r\n`);
      this.end(1);
      return;
    }
    this.proc.onData((data) => this.output(data));
    this.proc.onExit(({ exitCode }) => this.end(exitCode));
  }

  private output(data: string): void {
    this.scrollback.push(data);
    this.scrollbackChars += data.length;
    while (this.scrollbackChars > MAX_SCROLLBACK_CHARS && this.scrollback.length > 1) {
      this.scrollbackChars -= this.scrollback.shift()!.length;
    }
    for (const send of this.clients) send({ t: 'out', data });
  }

  private end(code: number): void {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.startTimer);
    for (const send of this.clients) send({ t: 'exit', code });
    this.clients.clear();
    this.onExit();
  }

  info(): TerminalInfo {
    return { id: this.id, title: this.title, cwd: dataPath(this.cwd), created: this.created };
  }

  /** Starts sending this shell's output to a browser, beginning with what is already on screen. */
  attach(send: Send): void {
    if (this.scrollback.length) send({ t: 'out', data: this.scrollback.join('') });
    this.clients.add(send);
  }

  detach(send: Send): void {
    this.clients.delete(send);
  }

  write(data: string): void {
    this.proc?.write(data);
  }

  resize(cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows)) return;
    if (cols < 2 || rows < 2 || cols > 1000 || rows > 1000) return;
    if (!this.proc) {
      this.start(cols, rows);
      return;
    }
    try {
      this.proc.resize(cols, rows);
    } catch {
      // The shell has just exited: there is nothing left to resize.
    }
  }

  kill(): void {
    if (!this.proc) {
      this.end(0);
      return;
    }
    try {
      this.proc.kill();
    } catch {
      // Already gone.
    }
  }
}

const shells = new Map<string, Shell>();

function assertEnabled(): void {
  if (!config.terminal) throw new FileError(404, 'The terminal is turned off on this server.');
}

export function listTerminals(): TerminalInfo[] {
  if (!config.terminal) return [];
  return [...shells.values()].map((shell) => shell.info()).sort((a, b) => a.created - b.created);
}

/** Starts a shell in a folder under the data directory; the data directory itself when none is given. */
export async function openTerminal(path: unknown): Promise<TerminalInfo> {
  assertEnabled();
  if (shells.size >= MAX_TERMINALS) throw new FileError(409, `There are already ${MAX_TERMINALS} terminals open. Close one first.`);
  const cwd = await resolveInData(path ?? '');
  if (!(await stat(cwd)).isDirectory()) throw new FileError(400, 'A terminal can only be opened in a folder.');
  const shell: Shell = new Shell(cwd, () => {
    shells.delete(shell.id);
    terminalBus.emit('changed');
  });
  shells.set(shell.id, shell);
  terminalBus.emit('changed');
  return shell.info();
}

/** Ends a shell and whatever is running in it. */
export function closeTerminal(id: string): void {
  shells.get(id)?.kill();
}

export function getTerminal(id: string): Shell | undefined {
  return config.terminal ? shells.get(id) : undefined;
}

export function closeAllTerminals(): void {
  for (const shell of shells.values()) shell.kill();
}
