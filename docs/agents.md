# Claude and Codex

[← README](../README.md) · [All docs](../README.md#documentation)

Clack runs each chat on Claude Code or Codex, and a chat can move between them.

## Signing in

At least one of the two has to be signed in on the computer the server runs on.
Either one is enough; with both, chats can use either. Claude needs a Claude
subscription (Pro or Max) or an Anthropic API key; Codex needs a ChatGPT plan (Plus or
higher) or an OpenAI API key. API keys go in `.env` (see [Configuration](configuration.md)).

Sign in to Claude Code once on the server computer, if you have not already:

```bash
claude auth login
```

To have Codex too, install the `codex` command
([Codex CLI](https://github.com/openai/codex), for example `brew install codex` or
`npm install -g @openai/codex`) and sign it in once:

```bash
codex login
```

Clack finds `codex` on the `PATH`; without it, Clack runs on Claude alone and lists Codex as
not installed. See [how the two work together](#how-the-two-work-together).

The **Help** page in Clack says whether each agent is signed in, and has the same
instructions, including how to sign in inside the [Docker](../README.md#docker) container.

On a server without a browser, use `codex login --device-auth` and complete the
login on another device. For Claude, run `claude setup-token` on a computer with a
browser and set `CLAUDE_CODE_OAUTH_TOKEN` on the server.

## How the two work together

Clack runs each chat on one of two agents: **Claude Code** (Anthropic, through the Claude
Agent SDK) or **Codex** (OpenAI, through `codex app-server`).

- **Starting them.** Nothing needs starting by hand. Clack starts Claude Code for a chat when
  it is needed, as before, and starts `codex app-server` itself the first time it needs
  Codex (when the model list is first asked for). One app-server serves every Codex chat,
  and it is started again if it stops. All Codex needs is the `codex` command installed
  and signed in (`codex login`). Without the command, Clack still starts and runs as
  usual: Codex is listed as not installed, the same way as one that is not signed in, and
  Clack never tries to start it. Install it and press **Check again** on the **Help** page.
- **One agent is enough.** With only one signed in, Clack works on that one: new chats
  start on it, and the other is listed in the model menu with why it cannot be used (such as
  "not signed in"). The message box says so too if a chat's agent is not signed in. Sign in
  on the server and press **Check again** on the **Help** page; there is no need to restart.

- **Picking.** The model menu in the message box lists both agents' models, grouped
  under **Claude · Anthropic** and **Codex · OpenAI**, each headed by the plan it is
  signed in with. An agent that cannot be used is listed with the reason (such as "not
  signed in"). Before the first message any model can be picked: the chat starts on its
  agent. New chats start on the agent and model you used last.
- **Telling them apart.** The agent's sign is everywhere a chat shows up: Claude's spark,
  or a `>_` prompt for Codex, each in its own colour. It is on the replies, before each
  chat's name in the sidebar, in the quick switcher, the activity log, and on the
  **agent chip** first under the chat's title. The chip opens a card with the agent, the
  plan, the model and mode, the plan's limits, and a button to switch.
- **Switching mid-chat.** Pick the other agent's model in the menu (or **Switch to …** on
  the chip) and confirm. The chat keeps everything said so far. A line across the
  conversation marks where it moved, and with your next message the new agent is handed
  the conversation as text: the latest turns in full, older ones shortened, one line per
  tool call. It starts with an empty memory otherwise: what the other agent changed in
  the folder is on disk, but what it read or ran is not in the new agent's memory. You
  can switch back and forth; each agent keeps its own part of the chat, and rename,
  archive and delete apply to all of it.
- **Modes.** The four modes mean the same on both agents and are carried out by each in
  its own way. For Codex: **Ask before changes** runs in Codex's read-only sandbox and asks
  before changing anything or going online; **Accept file edits** lets Codex write and
  run commands inside the folder and asks before going outside it or online; **Plan
  only** uses Codex's plan mode; **Auto** has Codex's own reviewer answer its approvals,
  and only what it would refuse is asked.
- **What differs.** For Codex, "Always allow" on a permission card reads **Allow for this
  chat**: it lasts while the chat runs, not for good. Codex's context card shows how full
  the window is and how it splits into input, cached input, replies and thinking, but not
  the breakdown by category that Claude Code gives. Codex has no subagent list or slash
  commands of its own, so those sections stay empty for it. When an MCP server asks for
  details (Codex passes those requests on), the card shows a small form.
- **Conversations started elsewhere.** As with Claude Code, chats you had with the
  `codex` command in a folder Clack knows show up in the sidebar and can be carried on.

## Conversations outside Clack

Claude Code stores its conversations under `~/.claude/projects` on the server. They
are separate from the chats on claude.ai. For a chat that started and stayed on Claude,
use the ID from its address (`#/s/<id>`) and run this in the project folder:

```bash
claude --resume <session-id>
```

For a chat that switched agents, look up the provider and session ID for the part you
want in `data/chats.json`. Use its Claude session ID with the command above, or
`codex resume <session-id>` for a Codex conversation.
