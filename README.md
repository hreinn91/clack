# clack

Clack is a wrapper around Claude Code, with future support for other coding tools.

It runs a small web server on one computer and serves a chat UI you can open from any
other device on the same network, such as a laptop or a phone. Claude Code itself runs
on the server computer, where it reads files, runs commands and edits code.

```
browser  <-- WebSocket -->  clack server  <-- Agent SDK -->  Claude Code  <-->  Anthropic
```

## What it does

- Chat with streaming replies
- Each chat works in its own folder under `data/sessions`, which you name when you start it
- Lists the chats started through clack and resumes them
- Pick the model and effort level per chat
- Logs every prompt, response, tool call and permission decision, with a live log page in the UI
- Shows permission prompts in the UI: allow once, always allow, or deny
- Answers Claude's multiple-choice questions and plan approvals
- Stop button, and a switch between "ask before changes", "accept file edits" and "plan only"
- Reconnects on its own, so a phone that went to sleep picks up where the conversation is now

## Setup

Requires Node 24 or newer and a Claude subscription.

```bash
npm install
```

Sign in to Claude Code once on the server computer, if you have not already:

```bash
claude login
```

Build the UI and start the server:

```bash
npm run build
```

```bash
npm start
```

The server prints its addresses and an access token. Open the "Local network" address on
your other device and enter the token once; the browser stays signed in after that.

## Where chats work

On first start the server creates a `data` directory next to the code. It is not checked in.

```
data/
  sessions/
    new-chat-session/     one folder per project; Claude Code runs with this as its working directory
    another-project/
  logs/
    clack-2026-11-14.jsonl  the activity log, one file per day
  preferences.json        the model and effort chosen for each chat
```

Starting a chat asks for a folder name. The name is reduced to lowercase letters, digits
and dashes, and the folder is created under `data/sessions` if it does not exist. Leaving
the name empty generates one. There is no way to start or resume a chat anywhere else from
the UI, and Claude Code sessions from elsewhere on the computer are not listed.

See [Security](#security) for what this limit does and does not guarantee.

## Model and effort

The message box has a model picker and an effort picker. The list of models comes from
Claude Code, so it matches what your Claude account can use. A choice applies from the
next message, is remembered for that chat, and becomes the starting point for new chats.
"Default" leaves the choice to Claude Code.

## Activity log

Everything that happens in a chat is logged: your prompts, Claude's responses (with the
model that wrote them), tool calls and their results, permission decisions including
requests the server refused on its own, and errors.

- **In the UI:** open **Debug** in the sidebar, or go to `#/debug/log`. The page shows the
  most recent 1,000 entries, follows new ones as they arrive, and can be filtered by type
  or by text. The folder name on each entry links to that chat.
- **On disk:** `data/logs/clack-YYYY-MM-DD.jsonl`, one JSON object per line. These files
  are the complete record and are never trimmed or deleted by clack.

```bash
tail -f data/logs/clack-$(date +%F).jsonl
```

Prompts and responses are logged in full. Tool inputs and results are cut to their first
2,000 characters.

### Seeing the chats outside clack

Each chat is an ordinary Claude Code session, stored on the server computer under
`~/.claude/projects`. They are not claude.ai conversations, so they do not appear in the
chat list on claude.ai or in the Claude apps. To open one in Claude Code on the server,
run this from the chat's folder, using the id from the chat's address (`#/s/<id>`):

```bash
claude --resume <session-id>
```

## Configuration

Copy `.env.example` to `.env` to change the port, the data directory, the access token,
or the idle timeout. Everything has a default.

## Development

```bash
npm run dev
```

This runs the server with auto-restart and Vite with hot reload. Open the Vite URL
(port 5173); it proxies `/api` and `/ws` to the server.

```bash
npm run check
```

## Layout

| Path | What is there |
| --- | --- |
| `server/src/sessions.ts` | Runs Claude Code through the Agent SDK and keeps each conversation's transcript |
| `server/src/ws.ts` | WebSocket endpoint the UI talks to |
| `server/src/folders.ts` | Creates and lists the chat folders under `data/sessions` |
| `server/src/models.ts` | Asks Claude Code which models are available |
| `server/src/prefs.ts` | Remembers each chat's model and effort |
| `server/src/log.ts` | Writes the activity log and keeps the recent entries for the debug page |
| `server/src/index.ts` | Fastify server: sign-in, session list, folders, models, static files |
| `shared/protocol.ts` | Message types shared by server and UI |
| `web/src` | Svelte UI |

## Security

Anyone who can sign in can make Claude Code run commands on the server computer as you.

### What the folder limit covers

- Chats can only be started and resumed in folders under `data/sessions`.
- When Claude asks for permission to touch a path outside the chat's folder, the server
  refuses on its own and the UI never shows the request. This covers the file tools
  (read, edit, write, search) and shell commands where Claude Code can see the path,
  such as `cat /etc/hosts`.

### What it does not cover

It is a guard, not a sandbox. Shell commands still run as your user account:

- A command that hides its target (a script, `python -c`, an environment variable) shows
  up as an ordinary permission request, and whoever is using the UI can approve it.
- Claude Code loads your own settings from `~/.claude`, so any commands you have already
  allowed there run without asking, and any MCP servers you have set up are available.

If people other than you will use the UI, treat it as giving them a shell on the server.

### Network and token

- Keep it on a network you trust. Do not forward the port to the internet.
- The connection is plain HTTP, so the token and your conversations are readable by
  others on the same network. On a shared network, set `CLACK_HOST=127.0.0.1` and reach
  it through a VPN or SSH tunnel instead.
- The access token is stored in `~/.config/clack/token`. Delete that file and restart to
  get a new one, which also signs every browser out.
- `data/logs` holds every prompt and response in plain text, and anyone signed in to the
  UI can read all of it on the debug page, across all chats.
- `data/` is not checked in, but it holds whatever the chats produced. Claude Code's own
  transcripts are stored outside the repository, in `~/.claude/projects`.
- This is for your own use with your own Claude subscription. Anthropic's terms do not
  allow offering your subscription login to other people through a tool like this.
