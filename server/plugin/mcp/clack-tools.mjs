#!/usr/bin/env node
// Clack's tools (artifacts) for Codex, as an MCP server over stdio. Codex starts
// it for a chat; each call is passed on to the Clack server that started Codex,
// which does the work and keeps the files. Nothing to install: plain Node.
//
// Set by Clack: CLACK_TOOLS_URL (where to call), CLACK_TOOLS_TOKEN (a secret
// made when Clack started), CLACK_CHAT_ID (the chat this Codex thread belongs to).

import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const url = process.env.CLACK_TOOLS_URL;
const token = process.env.CLACK_TOOLS_TOKEN;
const chatId = process.env.CLACK_CHAT_ID;
const debug = process.env.CLACK_TOOLS_DEBUG;

function note(text) {
  if (debug) appendFileSync(debug, `${new Date().toISOString()} ${text}\n`);
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

async function ask(body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-clack-tool-token': token },
    body: JSON.stringify({ chatId, ...body }),
  });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error ?? `Clack answered ${res.status}.`);
  return answer;
}

async function handle(message) {
  const { id, method, params } = message;
  note(`<- ${method}`);
  if (id === undefined) return; // A notification, such as notifications/initialized.
  try {
    switch (method) {
      case 'initialize':
        return send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params?.protocolVersion ?? '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'clack', version: '1.0.0' },
          },
        });
      case 'ping':
        return send({ jsonrpc: '2.0', id, result: {} });
      case 'tools/list': {
        const { tools } = await ask({ list: true });
        return send({ jsonrpc: '2.0', id, result: { tools } });
      }
      case 'tools/call': {
        const { text, isError } = await ask({ name: params?.name, arguments: params?.arguments ?? {} });
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: !!isError } });
      }
      default:
        return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method ${method}` } });
    }
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    note(`!! ${text}`);
    if (method === 'tools/call') return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } });
    return send({ jsonrpc: '2.0', id, error: { code: -32603, message: text } });
  }
}

if (!url || !token || !chatId) {
  process.stderr.write('clack-tools: started without CLACK_TOOLS_URL, CLACK_TOOLS_TOKEN and CLACK_CHAT_ID\n');
  process.exit(1);
}
note(`started for chat ${chatId}`);
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    continue;
  }
  void handle(message);
}
