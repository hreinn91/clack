import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const tokenFile = join(homedir(), '.config', 'clack', 'token');

function loadToken(): { token: string; source: 'env' | 'file' } {
  const fromEnv = process.env.CLACK_TOKEN?.trim();
  if (fromEnv) return { token: fromEnv, source: 'env' };
  try {
    const saved = readFileSync(tokenFile, 'utf8').trim();
    if (saved) return { token: saved, source: 'file' };
  } catch {
    // No token yet: fall through and create one.
  }
  const token = randomBytes(24).toString('base64url');
  mkdirSync(dirname(tokenFile), { recursive: true, mode: 0o700 });
  writeFileSync(tokenFile, token + '\n', { mode: 0o600 });
  return { token, source: 'file' };
}

const { token, source: tokenSource } = loadToken();

// Everything Claude works on lives under data/sessions, one folder per project.
// The data directory is created on first start and is not checked in.
const dataRoot = resolve(process.env.CLACK_DATA_DIR ?? resolve(here, '../../data'));
mkdirSync(resolve(dataRoot, 'sessions'), { recursive: true });
const dataDir = realpathSync(dataRoot);

export const config = {
  port: Number(process.env.CLACK_PORT ?? 4317),
  /** 0.0.0.0 so other devices on the local network can reach the UI. */
  host: process.env.CLACK_HOST ?? '0.0.0.0',
  dataDir,
  /** The only place chats can run: each one works in a folder directly under this. */
  sessionsDir: join(dataDir, 'sessions'),
  /** Model and effort choices, remembered per chat. */
  prefsFile: join(dataDir, 'preferences.json'),
  /** Optional path to a `claude` binary; the SDK's bundled one is used otherwise. */
  claudePath: process.env.CLACK_CLAUDE_PATH || undefined,
  /** An idle Claude Code process is shut down after this long; the chat resumes on the next prompt. */
  idleMs: Number(process.env.CLACK_IDLE_MINUTES ?? 20) * 60_000,
  webDist: resolve(here, '../../web/dist'),
  token,
  tokenSource,
};
