import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.ts';

const COOKIE = 'clack_session';
const ONE_YEAR = 60 * 60 * 24 * 365;

// The cookie never holds the token itself, only a value derived from it, and
// it stays valid across server restarts for as long as the token is unchanged.
const sessionValue = createHmac('sha256', config.token).update('clack-session-v1').digest('base64url');

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function readCookie(req: FastifyRequest, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export function isAuthed(req: FastifyRequest): boolean {
  const value = readCookie(req, COOKIE);
  return value !== undefined && safeEqual(value, sessionValue);
}

/**
 * Browsers send an Origin header on cross-site requests and on every WebSocket
 * handshake. Rejecting a mismatch stops another website from driving this
 * server through the signed-in browser.
 */
export function sameOrigin(req: FastifyRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

const failures = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILURES = 10;
const WINDOW_MS = 10 * 60_000;

export function login(req: FastifyRequest, reply: FastifyReply, token: unknown): boolean {
  const now = Date.now();
  const entry = failures.get(req.ip);
  if (entry && entry.resetAt < now) failures.delete(req.ip);
  const current = failures.get(req.ip);
  if (current && current.count >= MAX_FAILURES) {
    reply.code(429).send({ error: 'Too many attempts. Try again in a few minutes.' });
    return false;
  }
  if (typeof token !== 'string' || !safeEqual(token.trim(), config.token)) {
    failures.set(req.ip, { count: (current?.count ?? 0) + 1, resetAt: current?.resetAt ?? now + WINDOW_MS });
    reply.code(401).send({ error: 'Wrong token' });
    return false;
  }
  failures.delete(req.ip);
  reply.header('set-cookie', `${COOKIE}=${sessionValue}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ONE_YEAR}`);
  return true;
}

export function logout(reply: FastifyReply): void {
  reply.header('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}
