# Development

[← README](../README.md) · [All docs](../README.md#documentation)

Run Clack from source with hot reload:

```bash
npm run dev
```

This runs the server with auto-restart and Vite with hot reload. Open the Vite URL
(port 5173); it proxies `/api` and `/ws` to the server.

```bash
npm run check
```

Clack's Codex support talks to `codex app-server` with a hand-written subset of its
protocol (`server/src/agents/codex/protocol.ts`). To compare it with the installed
Codex's own types, generate them into `server/codex-types` (not checked in):

```bash
npm run codex:types --workspace server
```

`npm test` runs the server's tests: notes, drafts, plans, the Codex item mapping and the handover between agents.

The desktop app is built separately, with Rust; see [Desktop app](desktop.md).

When a feature changes, update its page in `docs/`. Update the README when the change
affects setup, requirements or the feature overview. Put screenshots in `docs/images/`.

## Code layout

| Path | What is there |
| --- | --- |
| `server/src/index.ts` | The Fastify server: sign-in, the HTTP API and the web app's files |
| `server/src/ws.ts` | The WebSocket the UI talks to: chats as they happen, and the terminals |
| `server/src/sessions.ts` | A chat while it is open (`LiveSession`): its transcript, drafts, permission requests and state, whichever agent runs it |
| `server/src/chats.ts` | Chats as chains of agent conversations, for chats that ran on Codex or switched agent (`data/chats.json`) |
| `server/src/agents/` | The agents behind one interface (`types.ts`, `registry.ts`); `handover.ts` writes the conversation out for the agent a chat moves to |
| `server/src/agents/claude/` | Claude Code through the Agent SDK: running a chat (`run.ts`), its transcript, models, plan limits, sign-in, the Tools page, background tasks, and moving a conversation when a chat changes folder |
| `server/src/agents/codex/` | Codex through `codex app-server`: the shared process (`appserver.ts`), running a chat, turning its items into the transcript, models, plan limits and sign-in |
| `server/src/folders.ts` | The chat folders under `data/sessions` and the folders added from the computer |
| `server/src/git.ts` | A chat's uncommitted changes and diffs, from git |
| `server/src/notes.ts` | Notes as markdown files in `data/notes`: the tree, saving, renaming, moving, deleting and the `.md` / `.zip` export |
| `server/src/drafts.ts` | Each chat's unsent message, kept on the server across devices and restarts |
| `server/src/plans.ts` | Plan checklists saved per turn, for chats read back later |
| `server/src/prefs.ts` | Each chat's model and effort, and where moved chats work now |
| `server/src/files.ts`, `server/src/terminal.ts` | The Data page: folder listings and file previews held to the data directory, and the shells behind its terminals |
| `server/src/uploads.ts`, `server/src/avatar.ts` | Attached files, and your picture |
| `server/src/log.ts` | The activity log on disk and for the Activity page |
| `server/src/auth.ts`, `server/src/config.ts` | Sign-in with the access token, and the settings |
| `server/plugin/` | Clack's own skills (diagrams), handed to Claude Code as a plugin and to Codex as a skills folder |
| `server/test/` | The server's tests |
| `shared/protocol.ts` | The message types the server and the web app share |
| `web/src/App.svelte` | The window: top bar, rail, sidebar and the open page |
| `web/src/components/` | The Svelte components; `Chat.svelte` is a chat, `Data.svelte` the Data page, `Notes.svelte` a note |
| `web/src/lib/state.svelte.ts` | The app's state in the browser, and its connection to the server |
| `web/src/lib/notes.svelte.ts`, `web/src/lib/drafts.svelte.ts` | Notes and unsent messages in the browser |
| `web/src/lib/theme.svelte.ts` | The themes, and how the app's colours are worked out from one |
| `web/src/lib/diagrams.ts` | Draws Mermaid diagrams in the theme's colours, and makes PNG and SVG files of them |
| `web/src/app.css` | Shared styles |
| `desktop/` | The [desktop app](desktop.md) (Tauri): `src-tauri/` is the Rust side (window, server start-up, downloads), `launcher/` the page that picks the server |
| `Dockerfile`, `docker-compose.yml`, `docker-compose.ssh.yml` | The container image, how to run it, and (optional) passing your SSH agent in |
| `docker/` | The container's start-up script and the `claude` and `codex` commands it offers |
