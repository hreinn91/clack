# Docker

[← README](../README.md) · [All docs](../README.md#documentation)

How to start Clack with Docker is in the README, under [Docker](../README.md#docker).
This page has the details: what is kept where, the settings, what the image holds,
and using your SSH keys from the container.

## What lives where

| In the container | On the host | Holds |
| --- | --- | --- |
| `/data` | `./data`, or `CLACK_DATA_PATH` | The data directory: chat folders, logs, remembered settings |
| `/home/node` | the Docker volume `clack-home` | Claude Code's and Codex's sign-ins and the conversations themselves (`~/.claude`, `~/.codex`), and Clack's access token |

The data directory is an ordinary folder on the host, so you can look at and edit what
the chats produce there. The conversations are not in it: Claude Code keeps them in its
own folder (`~/.claude`), which is why the container's home is a volume too. Both
survive `docker compose down` and rebuilding the image. `docker compose down -v` deletes
the `clack-home` volume, and with it the conversations and the sign-in.

Chats started without Docker do not show up in the container, and the other way round:
Claude Code files conversations under the path of the folder they ran in, and that path
is different inside the container. The files in the data directory are shared either way.

## Settings

Copy `.env.example` to `.env`. Docker Compose reads it and hands every line to the
container, so the settings under [Configuration](configuration.md) work as usual, with
these differences:

- `CLACK_PORT` is the port on the host. Inside the container it is always 4317.
  For access only from the host or through an SSH tunnel, change the `ports` entry in
  `docker-compose.yml` to `"127.0.0.1:${CLACK_PORT:-4317}:4317"`.
- `CLACK_HOST` and `CLACK_DATA_DIR` are ignored; use `CLACK_DATA_PATH` to keep the data
  directory somewhere other than `./data`.
- `CLACK_UID` and `CLACK_GID` set the user the app runs as in the container (1000 by
  default). On a Linux host, set them to your own ids (`id -u`, `id -g`) so the files in
  the data directory belong to you. Docker Desktop and colima on a Mac do not need them.
- Your messages are signed with the name of the account that ran `docker compose`,
  unless `CLACK_USER_NAME` says otherwise.

After changing `.env`, run `docker compose up -d` again. After updating the code, run
`docker compose up -d --build`.

## What is in the image

Debian with Node, the app, Claude Code (the copy that comes with the Agent SDK, on the
`PATH` as `claude`), Codex (`codex`, at the version Clack's Codex support was written
for; `CODEX_VERSION` is a build argument), and a few tools a shell is expected to have: `git`, `curl`,
`python3`, `ripgrep`, `jq`, `nano`, `less` and an SSH client. Terminals on the
[data page](interface.md#data-page) are shells inside the container, running `bash` as the app's
user, so they see the container's files and tools, not the host's. To have more tools,
add them to the `apt-get install` line in the `Dockerfile` and rebuild.

The container starts as root only to make what is mounted into it (the data directory,
the home volume and, if you use it, the SSH agent) usable by the app's user, then drops
to that user; Clack itself never runs as root. The one exception is a small `socat`
relay for the SSH agent, described under [SSH keys](#ssh-keys).

The first time `ssh` or `git` meets a server, its key is accepted and remembered in the
home volume (`~/.ssh/known_hosts`); a key that changes later is refused. Without that,
a first `git clone git@github.com:…` would stop at a question Claude cannot answer.

## SSH keys

Clack can use the SSH agent on your computer, so `git` and `ssh` in the container
(Claude's commands and the terminals) sign in with your keys. The private keys never
enter the container: only the agent's socket is passed in, and the agent does the
signing on the host.

1. Load the keys Clack should use into your agent (`ssh-add -l` lists them).
2. Turn the feature on in `.env`:

   ```bash
   COMPOSE_FILE=docker-compose.yml:docker-compose.ssh.yml
   ```

3. Tell Docker where the agent is, depending on what runs it:
   - **Docker Desktop or OrbStack on a Mac:** nothing to do; they pass your Mac's agent
     to containers at a fixed place.
   - **colima:** start it with the agent forwarded, `colima start --ssh-agent`. That is
     remembered (`forwardAgent: true` in `~/.colima/default/colima.yaml`), and colima
     then offers the agent at the same place as Docker Desktop.
   - **Linux:** set `CLACK_SSH_AUTH_SOCK` in `.env` to your agent's socket. Pick a path
     that stays the same between logins, such as the one the `ssh-agent` systemd user
     service makes (`/run/user/1000/ssh-agent.socket`) or GNOME Keyring's
     (`/run/user/1000/keyring/ssh`).
4. Run `docker compose up -d`, then check from a terminal on the data page:

   ```bash
   ssh-add -l
   ```

   It should list the same keys as on the host. If the agent cannot be reached, the
   reason is in `docker compose logs clack`.

The agent's socket belongs to root with Docker Desktop, to the virtual machine's user
with colima, and to you on Linux, so the app's user usually cannot open it as it is.
The start-up script then runs a small `socat` relay as root that offers the agent on a
socket only the app's user can open (`/run/clack-ssh/agent.sock`), and points
`SSH_AUTH_SOCK` there. Nothing about the socket outside the container is changed.

If `ssh-add -l` in the container stops working after colima or Docker Desktop was
restarted, the container may still hold the old agent socket: recreate it with
`docker compose up -d --force-recreate`.

Anyone who can sign in to Clack can use these keys while it runs, and in auto mode
Claude can run `git push` or `ssh` without asking. Load only the keys Clack should
have, ideally a deploy key limited to the repositories it works on, or run a separate
agent just for Clack.
