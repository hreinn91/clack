import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
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

/**
 * The account the server runs under, as a name: "hreinn" becomes "Hreinn".
 * In a container that account is the image's own, so Docker Compose passes
 * along the name of whoever started it instead.
 */
function accountName(): string {
  try {
    const name = process.env.CLACK_HOST_USER?.trim() || (process.env.CLACK_CONTAINER ? '' : userInfo().username);
    return name ? name[0]!.toUpperCase() + name.slice(1) : 'You';
  } catch {
    return 'You';
  }
}

export const config = {
  port: Number(process.env.CLACK_PORT ?? 4317),
  /** 0.0.0.0 so other devices on the local network can reach the UI. */
  host: process.env.CLACK_HOST ?? '0.0.0.0',
  dataDir,
  /** The only place chats can run: each one works in a folder directly under this. */
  sessionsDir: join(dataDir, 'sessions'),
  /** Folders outside data/sessions that chats may work in too, added from the UI. */
  rootsFile: join(dataDir, 'roots.json'),
  /** Whether folders outside data/sessions can be browsed and added. On unless CLACK_OUTSIDE_FOLDERS says otherwise. */
  outsideFolders: !/^(0|off|false|no)$/i.test(process.env.CLACK_OUTSIDE_FOLDERS?.trim() ?? ''),
  /** Model and effort choices, remembered per chat. */
  prefsFile: join(dataDir, 'preferences.json'),
  /**
   * Codex as a second agent. Listed unless off; where the codex command is not
   * installed it shows as not available. (auto and on mean the same.)
   */
  codex: ((): 'auto' | 'on' | 'off' => {
    const value = process.env.CLACK_CODEX?.trim().toLowerCase() ?? '';
    if (/^(0|off|false|no)$/.test(value)) return 'off';
    if (/^(1|on|true|yes)$/.test(value)) return 'on';
    return 'auto';
  })(),
  /** The codex command; found on the PATH unless CLACK_CODEX_PATH says where. */
  codexPath: process.env.CLACK_CODEX_PATH?.trim() || 'codex',
  /** Optional path to a `claude` binary; the SDK's bundled one is used otherwise. */
  claudePath: process.env.CLACK_CLAUDE_PATH || undefined,
  /** An idle Claude Code process is shut down after this long; the chat resumes on the next prompt. */
  idleMs: Number(process.env.CLACK_IDLE_MINUTES ?? 20) * 60_000,
  /** Whether the UI may open shells on this computer. On unless CLACK_TERMINAL says otherwise. */
  terminal: !/^(0|off|false|no)$/i.test(process.env.CLACK_TERMINAL?.trim() ?? ''),
  /** The name the person's own messages are shown under. */
  userName: process.env.CLACK_USER_NAME?.trim() || accountName(),
  /** True in the Docker image, where addresses and ports seen from inside are not the ones people use. */
  container: !!process.env.CLACK_CONTAINER,
  webDist: resolve(here, '../../web/dist'),
  token,
  tokenSource,
};
