# clack

Clack is a wrapper around Claude Code, with future support for other coding tools.

It runs a small web server on one computer and serves a chat UI you can open from any
other device on the same network, such as a laptop or a phone. Claude Code itself runs
on the server computer, where it reads files, runs commands and edits code.

```
browser  <-- WebSocket -->  clack server  <-- Agent SDK -->  Claude Code  <-->  Anthropic
```

![clack showing a chat in the Synthwave theme: chats grouped by folder on the left, the conversation on the right](docs/screenshot-synthwave.png)

*A chat in the Synthwave theme, one of the [themes](#themes) that come with clack.*

## What it does

- Chat with streaming replies, laid out like a team chat app: chats in a sidebar, and every
  message under the name of who sent it
- Each chat works in its own folder under `data/sessions`, which you name when you start it.
  Folders can be nested, and the sidebar shows them as a tree
- Lists the chats started through clack and resumes them
- Pick the model and effort level per chat
- Attach pictures and documents to a message for Claude to look at
- See how much of your Claude plan's limits is used, on a page of its own and as a ring
  beside the send button
- Logs every prompt, response, tool call and permission decision, with a live log page in the UI
- Shows permission prompts in the UI: allow once, always allow, or deny
- Answers Claude's multiple-choice questions and plan approvals
- Stop button, and a switch between "auto" (the default for every chat), "ask before changes",
  "accept file edits" and "plan only". In auto a safety check approves routine actions and
  only the rest are asked about; where auto is unavailable, chats ask before changes
- Up and down arrows in an empty message box step through what you sent earlier in the chat
- Reconnects on its own, so a phone that went to sleep picks up where the conversation is now
- A Data page with the data directory as a folder tree, file previews, and terminals that
  run a shell on the server computer

## Setup

Requires Node 24 or newer and a Claude subscription.

```bash
npm install
```

Sign in to Claude Code once on the server computer, if you have not already:

```bash
claude auth login
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

To run it in a container instead, see [Docker](#docker).

## Docker

With Docker and Docker Compose (2.24 or newer) nothing else needs installing:

```bash
docker compose up -d
```

The first run builds the image, which takes a few minutes. Then:

(Homebrew installs Compose as `docker-compose`. If `docker compose` is not found, use
`docker-compose` in these commands instead, or follow the note Homebrew prints about
adding its plugin folder to `~/.docker/config.json`.)

1. **Get the access token.** It is printed when the container starts:

   ```bash
   docker compose logs clack
   ```

2. **Sign Claude Code in**, once. It asks you to open a link and paste a code back:

   ```bash
   docker compose exec clack claude auth login
   ```

   Or, without touching the container, run `claude setup-token` on any computer and put
   the token it prints in `.env` as `CLAUDE_CODE_OAUTH_TOKEN`, then `docker compose up -d`
   again.

3. **Open** `http://localhost:4317`, or the host's address from another device.

### What lives where

| In the container | On the host | Holds |
| --- | --- | --- |
| `/data` | `./data`, or `CLACK_DATA_PATH` | The data directory: chat folders, logs, remembered settings |
| `/home/node` | the Docker volume `clack-home` | Claude Code's sign-in and the conversations themselves, and clack's access token |

The data directory is an ordinary folder on the host, so you can look at and edit what
the chats produce there. The conversations are not in it: Claude Code keeps them in its
own folder (`~/.claude`), which is why the container's home is a volume too. Both
survive `docker compose down` and rebuilding the image. `docker compose down -v` deletes
the `clack-home` volume, and with it the conversations and the sign-in.

Chats started without Docker do not show up in the container, and the other way round:
Claude Code files conversations under the path of the folder they ran in, and that path
is different inside the container. The files in the data directory are shared either way.

### Settings

Copy `.env.example` to `.env`. Docker Compose reads it and hands every line to the
container, so the settings under [Configuration](#configuration) work as usual, with
these differences:

- `CLACK_PORT` is the port on the host. Inside the container it is always 4317.
- `CLACK_HOST` and `CLACK_DATA_DIR` are ignored; use `CLACK_DATA_PATH` to keep the data
  directory somewhere other than `./data`.
- `CLACK_UID` and `CLACK_GID` set the user the app runs as in the container (1000 by
  default). On a Linux host, set them to your own ids (`id -u`, `id -g`) so the files in
  the data directory belong to you. Docker Desktop and colima on a Mac do not need them.
- Your messages are signed with the name of the account that ran `docker compose`,
  unless `CLACK_USER_NAME` says otherwise.

After changing `.env`, run `docker compose up -d` again. After updating the code, run
`docker compose up -d --build`.

### What is in the image

Debian with Node, the app, Claude Code (the copy that comes with the Agent SDK, on the
`PATH` as `claude`), and a few tools a shell is expected to have: `git`, `curl`,
`python3`, `ripgrep`, `jq`, `nano`, `less` and an SSH client. Terminals on the
[data page](#data-page) are shells inside the container, running `bash` as the app's
user, so they see the container's files and tools, not the host's. To have more tools,
add them to the `apt-get install` line in the `Dockerfile` and rebuild.

The container starts as root only to make the two mounted places usable by the app's
user, then drops to that user; clack itself never runs as root.

## The interface

The window has four parts:

- **Top bar:** back and forward, and a search field that narrows the chats and folders
  in the sidebar as you type. Escape clears it.
- **Rail** on the far left: **Home** returns to the most recent chat, **Usage** shows
  your plan's [limits](#usage), **Activity** opens
  the [activity log](#activity-log), **Data** opens the [data page](#data-page),
  **Theme** opens the [themes](#themes), **+** starts a chat, and your picture at the bottom shows whether the browser is connected
  and holds **Sign out**.
- **Sidebar:** **Chats** shows the folders under `data/sessions` as a tree, with each
  folder's chats listed under it. The dot before a chat is lit and pulsing while Claude
  is working in it. See [Managing chats](#managing-chats).
- **Conversation:** messages are stacked on the left, each with a picture, a name and
  the time. Yours carry your name. Claude's carry the model and the effort it ran at,
  such as **Fable 5.2 High**, so a chat that switched model or effort part-way shows
  who wrote what. Everything Claude did in one turn (thinking, tool calls, text) sits
  under a single name.

Your name is the name of the account the server runs as; set `CLACK_USER_NAME` in `.env`
to change it. With "Default effort" chosen, a reply is first signed with the model alone
and gains the effort when the turn ends, because Claude Code only records which effort
it picked in the chat's transcript.

The sidebar can be resized and put away to leave the conversation more room:

- Drag its right edge to make it narrower or wider. Double-click the edge to go back to
  the usual width.
- Hide or show it with the button at the left of the top bar, or with Cmd+Shift+D
  (Ctrl+Shift+D on Windows and Linux). Dragging the edge all the way to the left hides
  it too, and dragging the edge back out shows it again.
- The edge also takes keyboard focus: the left and right arrow keys resize, Enter hides
  or shows.

The width and whether the sidebar is hidden are remembered per browser.

On a phone the rail and sidebar slide in from the left with the menu button, and the
search field moves into the sidebar.

Out of the box the colours follow the device's light or dark setting; see
[Themes](#themes) for the rest. The fonts are bundled with the app, so the UI loads
nothing from outside the clack server.

## Data page

**Data** in the rail shows what is in the data directory and lets you work in it.

**Folder tree.** While the page is open the sidebar shows the data directory instead of
the chats. Click a folder to unfold it and a file to look at it. The search field narrows
the files by name. The round arrow at the top reads the folders again; Claude changes
files behind the page's back, and the tree is otherwise only read when you open the page
or unfold a folder. Hovering a folder shows two buttons: start a chat in it (session
folders only) and open a terminal in it.

**File preview.** Text files show their first 256 KB, pictures (PNG, JPEG, GIF, WebP)
are shown as pictures, and anything else is reported as not being text. The preview is
read-only. Drag the line between the preview and the terminals to give either more room.

**Terminals.** Each tab is a login shell on the server computer, started in the folder
you picked, or in the data directory with **+**. It is the same shell with the same
configuration you get in a terminal on that computer.

- A shell keeps running on the server when you leave the page, close the browser or a
  phone goes to sleep. Coming back reconnects and redraws its recent output (the last
  400,000 characters).
- Typing `exit`, or closing the tab, ends the shell and whatever was running in it.
  Stopping the clack server ends all of them.
- Up to 12 shells can be open at once.
- On a touch screen a row of extra keys (Esc, Tab, Ctrl+C, Ctrl+D, arrows) appears under
  the terminal.
- What you do in a terminal is not written to the [activity log](#activity-log).

The terminal emulator is [xterm.js](https://xtermjs.org), drawn in the colours of the
chosen theme with JetBrains Mono. It is part of the web app: nothing needs to be
installed on the computer you browse from. A shell is started at the size of the browser
that opens it. The shell side uses
[node-pty](https://github.com/microsoft/node-pty), which ships ready-built for macOS and
Windows. On Linux it is compiled during `npm install`, which needs a C++ toolchain
(`build-essential` and `python3` on Debian and Ubuntu). Newer versions of npm only run a
package's install script when the project allows it; `package.json` allows node-pty's.
The [Docker image](#docker) takes care of all this.

To remove terminals, set `CLACK_TERMINAL=off` in `.env`. The tree and previews stay.
See [Security](#security) before using terminals on a network you share.

## Where chats work

On first start the server creates a `data` directory next to the code. It is not checked in.

```
data/
  sessions/
    new-chat-session/     one folder per project; Claude Code runs with this as its working directory
    work/
      client-a/           folders can be nested; a chat can work in any of them
  logs/
    clack-2026-11-14.jsonl  the activity log, one file per day
  preferences.json        the model and effort chosen for each chat
```

The **New chat** page asks where the chat should work, with two choices:

- **New folder** (the default): pick where it goes (the top level, or inside one of your
  folders) and type a name. A preview shows the folder tree with the new folder marked
  **New**, and the button says **Create folder and start chat**. The name is reduced to
  lowercase letters, digits and dashes; a name with slashes, such as `work/client-a`,
  makes nested folders (up to eight deep). Leaving the name empty makes one up, such as
  `chat-20261117-203112`. If the folder is already there, the preview says so and the
  chat joins it.
- **Existing folder:** a list of your top-level folders and the folders that already
  have chats, with how many chats each has. Click one to start. Deeper folders can be
  picked in the sidebar.

There is no way to start or resume a chat anywhere else from
the UI, and Claude Code sessions from elsewhere on the computer are not listed.

See [Security](#security) for what this limit does and does not guarantee.

## Model and effort

The message box has a model menu and an effort menu, next to the one for the permission
mode. Each opens as a list of every choice, with a line saying what it is for. The list
of models comes from Claude Code, so it matches what your Claude account can use. A choice applies from the
next message, is remembered for that chat, and becomes the starting point for new chats.
"Default" leaves the choice to Claude Code.

## Usage

**Usage** in the rail shows how much of your Claude plan's limits is used: the current
five-hour session, the week, and any limits that apply to one model, each with the time
it starts over. These limits cover everything you do with Claude, on any device, not
only what goes through clack. Extra pay-as-you-go usage is listed too when it is
switched on. With an API key or a cloud provider there are no plan limits, and the page
says so.

In a chat, the small ring beside the send button shows the limit that is closest to
running out. It is blue while there is plenty left, turns amber as it runs low and red
near the end. Clicking it lists every limit, and how full the model's context window is
in that chat (known once a turn has finished there).

The figures are read again after every turn in any chat, when Claude Code reports that
a limit has moved, and with **Refresh** on the page. They come from a part of the Agent
SDK that is marked experimental, so a future version may change or remove it; clack
then shows what it can still read.

## Managing chats

The sidebar shows every folder under `data/sessions` as a tree, at any depth. Hidden
folders (such as `.git`) and `node_modules` are left out, and so are files: those are on
the [data page](#data-page).

- A folder that chats work in has a filled green icon and the number of its chats. A
  folder with no chats anywhere inside it is dimmed. A folded folder with chats further
  down shows how many.
- Folders with chats come first, the most recently used at the top; the rest follow by
  name. Folders with chats start unfolded, the rest folded. Click a folder's name to fold
  or unfold it; the browser remembers it.
- **New chat in a folder:** hover the folder (on a touch screen the buttons are always
  there) and click the speech-bubble button. The chat starts there straight away.
- **New folder:** the folder button beside **Chats** makes one at the top level, and the
  same button on a folder's row makes one inside it. Type the name and press Enter, or
  Escape to cancel.

- **Rename:** click the title at the top of a chat, or use **Rename…** in a chat's
  **⋯** menu (in the sidebar row, or at the top right of the chat).
- **Change folder:** click the folder button beside the title, or **Change folder…** in
  the menu. Pick an existing folder or type a new name to create one under
  `data/sessions`. Claude works there from the next message and keeps the conversation
  so far. No files are moved: what the chat made or was given earlier stays in the old
  folder, and pictures attached before the move are shown by name only.
- **Archive:** puts a chat in the **Archived** section, folded shut at the bottom of the
  sidebar. Take it out again from its menu; sending a message in it does the same.
- **Deleted folders:** a chat whose folder no longer exists counts as archived. It is
  listed in **Archived**, marked **deleted**, and can still be read. To carry on with it,
  use **Recreate folder** (an empty folder with the old name) or **Change folder…**,
  from its menu or from the bar above the message box. Either one puts it back in the
  tree.
- **Delete:** removes the conversation for good, after asking. The files in its folder
  stay.

**Quick switcher:** Cmd+K (Ctrl+K on Windows and Linux), or the button in the search
field, opens a box for jumping around. Type part of a chat's name or folder and press
Enter to open it. Typing a folder name also offers to start a new chat there, creating
the folder if it is new. The pages (Usage, Activity, Data, Theme) are listed too.

Changing a chat's folder moves the conversation's file inside Claude Code's own storage
(`~/.claude/projects`), which is not a public interface of Claude Code, so a future
version of Claude Code could break it.

## Themes

**Theme** in the rail changes how clack looks. The choice is remembered per browser.

- **Presets:** Aubergine (automatic light or dark, or either one fixed), One Dark,
  Dracula, Solarized Dark and Light, Cyberpunk, Synthwave, Tokyo Night, Nord, Gruvbox,
  Catppuccin Mocha and Latte. Each also colours the terminal.
- **Colours:** any of a theme's main colours can be changed with a colour picker or a
  hex code; hover shades and soft backgrounds are worked out from them. **Back to …**
  undoes the changes, and picking another preset starts over from its colours.
- **Text:** the font (Lato, system, serif or monospace) and the size of message text.

## Attaching files

The **+** at the left of the message box attaches files to the next message: pictures,
text documents, or anything else Claude should look at. Dropping files on the message
box or pasting a copied picture does the same. Each file is shown above the message
until you send it, and can be taken off again with its ×.

An attached file is saved in the chat's own folder, under `uploads/`, at most 25 MB
each, and the message tells Claude where it is, so Claude reads it like any other file
in the folder. A file with the same name as an earlier one gets a number added rather
than replacing it. Taking a file off a message before sending does not delete it from
`uploads/`. In the conversation, attached pictures are shown as pictures and other
files by name; clicking one opens it on the [data page](#data-page).

## Activity log

Everything that happens in a chat is logged: your prompts, Claude's responses (with the
model that wrote them), tool calls and their results, permission decisions including
requests the server refused on its own, and errors.

- **In the UI:** open **Activity** in the rail, or go to `#/debug/log`. The page shows the
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
the idle timeout, the name your messages are shown under, or to turn terminals off.
Everything has a default.

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
| `server/src/transcript.ts` | Turns Claude Code's saved messages into what the UI shows, with each reply's time, model and effort |
| `server/src/log.ts` | Writes the activity log and keeps the recent entries for the activity page |
| `server/src/files.ts` | Lists folders and previews files for the data page, and keeps both inside the data directory |
| `server/src/terminal.ts` | Runs the shells behind the data page's terminals |
| `server/src/uploads.ts` | Saves files attached to a message into the chat's folder |
| `server/src/usage.ts` | Reads how much of the Claude plan's limits is used |
| `server/src/relocate.ts` | Moves a conversation within Claude Code's storage when a chat changes folder |
| `web/src/lib/theme.svelte.ts` | The themes, and how the app's colours are worked out from one |
| `server/src/index.ts` | Fastify server: sign-in, session list, folders, models, static files |
| `shared/protocol.ts` | Message types shared by server and UI |
| `web/src/App.svelte` | The window: top bar, rail, sidebar and the open page |
| `web/src/components` | Svelte components; `Chat.svelte` groups the transcript into messages by sender, `Data.svelte` is the data page |
| `web/src/app.css` | The colour scheme and shared styles |
| `Dockerfile`, `docker-compose.yml` | The container image and how to run it |
| `docker/` | The container's start-up script and the `claude` command it offers |

## Security

Anyone who can sign in can make Claude Code run commands on the server computer as you.

### What the folder limit covers

- Chats can only be started and resumed in folders under `data/sessions`.
- When Claude asks for permission to touch a path outside the chat's folder, the server
  refuses on its own and the UI never shows the request. This covers the file tools
  (read, edit, write, search) and shell commands where Claude Code can see the path,
  such as `cat /etc/hosts`.
- In auto mode Claude Code's safety check approves most actions without asking, so the
  server checks the file tools itself before that happens and refuses any path outside
  the chat's folder. Claude Code's own files for that folder (its memory, saved tool
  output) stay reachable, as they are in the other modes.

### What it does not cover

It is a guard, not a sandbox. Shell commands still run as your user account:

- A command that hides its target (a script, `python -c`, an environment variable) shows
  up as an ordinary permission request, and whoever is using the UI can approve it.
- Claude Code loads your own settings from `~/.claude`, so any commands you have already
  allowed there run without asking, and any MCP servers you have set up are available.
- In auto mode a shell command that names a path outside the folder is judged by Claude
  Code's safety check rather than refused: if the check finds it routine, it runs.

If people other than you will use the UI, treat it as giving them a shell on the server.

### Terminals and files

- A terminal on the data page is a shell running as your user account. It starts in the
  data directory but is not held there: `cd` goes anywhere you can go. This gives a
  signed-in person nothing they could not already get by having Claude run commands, but
  it is direct and asks no permission.
- The folder tree and file previews are held to the data directory. Paths that lead out
  of it, including through symlinks, are refused by the server.
- Over plain HTTP everything typed into a terminal, such as a `sudo` password, can be
  read by others on the same network, like the rest of the traffic.
- The shell does not get the server's `CLACK_TOKEN` variable, but it can read the token
  file like any program run as you.
- Set `CLACK_TERMINAL=off` to remove terminals from the UI and the server.
- In the [Docker](#docker) setup, terminals and the commands Claude runs are inside the
  container. They reach the data directory and the container's own files, not the rest
  of the host's disk. That narrows what a mistake or a stolen sign-in can touch; it is
  still not a place to run things you do not trust.
- Attached files can only land in the `uploads/` folder of a chat. Their names are
  reduced to plain file names first, and an existing file is never overwritten.

### Network and token

- Keep it on a network you trust. Do not forward the port to the internet.
- The connection is plain HTTP, so the token and your conversations are readable by
  others on the same network. On a shared network, set `CLACK_HOST=127.0.0.1` and reach
  it through a VPN or SSH tunnel instead.
- The access token is stored in `~/.config/clack/token`. Delete that file and restart to
  get a new one, which also signs every browser out.
- `data/logs` holds every prompt and response in plain text, and anyone signed in to the
  UI can read all of it on the activity page, across all chats.
- `data/` is not checked in, but it holds whatever the chats produced. Claude Code's own
  transcripts are stored outside the repository, in `~/.claude/projects`.
- This is for your own use with your own Claude subscription. Anthropic's terms do not
  allow offering your subscription login to other people through a tool like this.
