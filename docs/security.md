# Security

[← README](../README.md) · [All docs](../README.md#documentation)

Anyone who can sign in can make Claude Code run commands on the server computer as you.

### What the folder limit covers

- Chats can only be started and resumed in folders under `data/sessions`, or in folders
  someone added from the UI (see [Where chats work](chats.md#where-chats-work)). Anyone who can sign
  in can add one, and browse the names of folders on the computer to find it; set
  `CLACK_OUTSIDE_FOLDERS=off` to stop that.
- When Claude asks for permission to touch a path outside the chat's folder, the server
  refuses on its own and the UI never shows the request. This covers the file tools
  (read, edit, write, search) and shell commands where Claude Code can see the path,
  such as `cat /etc/hosts`.
- In auto mode Claude Code's safety check approves most actions without asking, so the
  server checks the file tools itself before that happens and refuses any path outside
  the chat's folder. Claude Code's own files for that folder (its memory, saved tool
  output) stay reachable, as they are in the other modes.

For Codex, the folder limit is Codex's own sandbox (Seatbelt on macOS, bubblewrap on
Linux): a turn may write only in the chat's folder, and the network is off unless Codex
asks and you allow it. Reading is not limited to the folder: Codex's sandbox does not
offer that. In Docker, where bubblewrap often cannot run, Clack checks at the first use;
if Codex's sandbox does not work there, the container itself is the sandbox and Codex is
not held to the folder inside it.

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
- In the [Docker](docker.md) setup, terminals and the commands Claude runs are inside the
  container. They reach the data directory and the container's own files, not the rest
  of the host's disk. That narrows what a mistake or a stolen sign-in can touch; it is
  still not a place to run things you do not trust.
- With the [SSH agent](docker.md#ssh-keys) passed in, anything running in the container can ask
  the agent to sign with every key loaded in it, for as long as Clack runs. The keys
  themselves cannot be copied out.
- Attached files are stored under `data/uploads/`. Their names are
  reduced to plain file names first, and an existing file is never overwritten.

### Network and token

- Keep it on a network you trust. Do not forward the port to the internet.
- The connection is plain HTTP, so the token and your conversations are readable by
  others on the same network. On a shared network, set `CLACK_HOST=127.0.0.1` and reach
  it through an SSH tunnel. In Docker, restrict the [published port](docker.md#settings).
- If you set `CLACK_TOKEN`, change that value to rotate the token. Otherwise, delete
  the generated `~/.config/clack/token` file. Restart to sign every browser out.
- `data/logs` holds every prompt and response in plain text, and anyone signed in to the
  UI can read all of it on the activity page, across all chats. Unsent messages are kept
  in plain text in `data/drafts.json` until they are sent or cleared.
- `data/` is not checked in, but it holds whatever the chats produced. Claude Code's own
  transcripts are stored outside the repository, in `~/.claude/projects`.
- This is for your own use with your own Claude subscription. Anthropic's terms do not
  allow offering your subscription login to other people through a tool like this.
