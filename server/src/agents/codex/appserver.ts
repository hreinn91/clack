import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { createInterface } from 'node:readline';
import { config } from '../../config.ts';
import type { RequestId } from './protocol.ts';

// One `codex app-server` process serves every Codex chat: it speaks JSON-RPC
// over stdin and stdout, one message per line, and runs many threads at once.
// It is started when first needed (never when clack starts) and started again
// after it goes away. Where the codex command is not installed it is never
// started at all: Codex then counts as not available, like one not signed in.
// Notifications and requests that name a thread go to whoever listens for that
// thread (a chat's CodexRun); the rest are emitted on `events`.

/** What a thread's owner is told. */
export type ThreadListener = {
  notify(method: string, params: Record<string, unknown>): void;
  /** A request the server needs answered (an approval, a question). */
  request(id: RequestId, method: string, params: Record<string, unknown>): void;
  /** The app-server went away: the thread is no longer loaded, and anything it asked is moot. */
  closed(): void;
};

type Waiting = { resolve: (value: unknown) => void; reject: (err: Error) => void; method: string };

const REQUEST_TIMEOUT_MS = 120_000;

const INSTALL_KEEP_MS = 30_000;
let install: { at: number; found: boolean } | undefined;

/**
 * Whether the codex command is there: CLACK_CODEX_PATH, or `codex` on the
 * PATH. Looked up again after a while, or when `fresh`, so installing it while
 * clack runs is noticed without a restart.
 */
export function codexInstalled(fresh = false): boolean {
  if (!fresh && install && Date.now() - install.at < INSTALL_KEEP_MS) return install.found;
  const command = config.codexPath;
  const candidates = isAbsolute(command) ? [command] : (process.env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, command));
  const found = candidates.some((path) => {
    try {
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  install = { at: Date.now(), found };
  return found;
}

export const NOT_INSTALLED = 'Codex is not installed on the server. Install the `codex` command, sign in with `codex login`, then check again.';

export class CodexError extends Error {
  code: number | undefined;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

class AppServer {
  /** Notifications that name no thread (rate limits, the account), by method. */
  readonly events = new EventEmitter();
  private child: ChildProcessWithoutNullStreams | undefined;
  private ready: Promise<void> | undefined;
  private nextId = 1;
  private waiting = new Map<RequestId, Waiting>();
  private threads = new Map<string, ThreadListener>();
  /** The last lines the process wrote to stderr, for when it fails to start. */
  private errors: string[] = [];
  private failures = 0;
  private stopped = false;

  /** Starts the process if it is not running, and waits for the handshake. */
  private start(): Promise<void> {
    if (this.ready) return this.ready;
    // Nothing to start: said at once, and not counted as a failed start.
    if (!codexInstalled()) return Promise.reject(new CodexError(NOT_INSTALLED));
    this.stopped = false;
    this.ready = new Promise<void>((resolve, reject) => {
      const args = ['app-server', '--listen', 'stdio://'];
      // In a container no keyring is at hand: the sign-in is kept in a file in CODEX_HOME.
      if (config.container) args.push('-c', 'cli_auth_credentials_store="file"');
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(config.codexPath, args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
      } catch (err) {
        this.ready = undefined;
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      this.child = child;
      this.errors = [];
      // Writing to a process that has just died fails on the pipe; that is dealt with as the process going away.
      child.stdin.on('error', () => undefined);
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        this.errors.push(...chunk.split('\n').filter(Boolean));
        this.errors = this.errors.slice(-20);
      });
      createInterface({ input: child.stdout }).on('line', (line) => this.receive(line));
      child.on('error', (err) => {
        this.gone(child, `Codex could not be started (${err.message}). Is the codex command installed?`);
        reject(err);
      });
      child.on('exit', (code, signal) => {
        const why = this.errors.at(-1) ?? `exit ${code ?? signal}`;
        this.gone(child, `Codex stopped unexpectedly (${why}).`);
        reject(new Error(`Codex app-server exited: ${why}`));
      });
      this.call('initialize', {
        clientInfo: { name: 'clack', title: 'clack', version: '1' },
        capabilities: { experimentalApi: true, requestAttestation: false },
      })
        .then(async () => {
          this.send({ method: 'initialized' });
          // clack's own skills (diagrams), read from its folder rather than copied into ~/.codex.
          await this.call('skills/extraRoots/set', { extraRoots: [join(config.pluginDir, 'skills')] }).catch((err: unknown) => {
            console.warn('clack: Codex did not take clack\'s skills:', err instanceof Error ? err.message : err);
          });
          this.failures = 0;
          resolve();
        })
        .catch(reject);
    });
    this.ready.catch(() => undefined);
    return this.ready;
  }

  private gone(child: ChildProcessWithoutNullStreams, message: string): void {
    if (this.child !== child) return;
    this.child = undefined;
    this.ready = undefined;
    for (const waiting of this.waiting.values()) waiting.reject(new CodexError(message));
    this.waiting.clear();
    const owners = [...this.threads.values()];
    this.threads.clear();
    for (const owner of owners) owner.closed();
    if (!this.stopped) this.failures++;
  }

  private send(message: Record<string, unknown>): void {
    this.child?.stdin.write(JSON.stringify(message) + '\n');
  }

  private call(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.waiting.delete(id)) reject(new CodexError(`Codex did not answer ${method} in time.`));
      }, REQUEST_TIMEOUT_MS);
      timer.unref?.();
      this.waiting.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.send({ id, method, params });
    });
  }

  private receive(line: string): void {
    let msg: { id?: RequestId; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message?: string; code?: number } };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.method && msg.id !== undefined) {
      // A request from the server.
      const params = msg.params ?? {};
      const owner = typeof params.threadId === 'string' ? this.threads.get(params.threadId) : undefined;
      if (owner) owner.request(msg.id, msg.method, params);
      else this.fail(msg.id, `clack does not handle ${msg.method} here.`);
      return;
    }
    if (msg.method) {
      const params = msg.params ?? {};
      const owner = typeof params.threadId === 'string' ? this.threads.get(params.threadId) : undefined;
      if (owner) owner.notify(msg.method, params);
      this.events.emit(msg.method, params);
      return;
    }
    if (msg.id === undefined) return;
    const waiting = this.waiting.get(msg.id);
    if (!waiting) return;
    this.waiting.delete(msg.id);
    if (msg.error) waiting.reject(new CodexError(msg.error.message ?? `Codex refused ${waiting.method}.`, msg.error.code));
    else waiting.resolve(msg.result);
  }

  /** Asks the app-server something, starting it first if needed. */
  async request<T>(method: string, params: unknown): Promise<T> {
    // Several failed starts in a row: wait a little before trying again, rather than spinning.
    if (this.failures > 2 && !this.ready) await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, 1000 * this.failures)));
    await this.start();
    return (await this.call(method, params)) as T;
  }

  /** Answers a request the server sent. */
  respond(id: RequestId, result: unknown): void {
    this.send({ id, result });
  }

  fail(id: RequestId, message: string): void {
    this.send({ id, error: { code: -32601, message } });
  }

  /** Routes a thread's notifications and requests to its owner. */
  listen(threadId: string, listener: ThreadListener): void {
    this.threads.set(threadId, listener);
  }

  unlisten(threadId: string, listener: ThreadListener): void {
    if (this.threads.get(threadId) === listener) this.threads.delete(threadId);
  }

  get running(): boolean {
    return this.child !== undefined;
  }

  stop(): void {
    this.stopped = true;
    this.child?.kill();
  }
}

export const appServer = new AppServer();
