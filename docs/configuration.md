# Configuration

[← README](../README.md) · [All docs](../README.md#documentation)

Every setting is optional and has a default. Copy `.env.example` to `.env` beside
`package.json` and set the ones you want; the server reads it when it starts, so restart
it after a change. Settings can also be passed as environment variables, which take
precedence over `.env`.

Docker Compose overrides the listen address, internal port and data directory. See
[Docker settings](docker.md#settings) for host port and volume mappings.

| Applies to | Setting | Default | What it does |
| --- | --- | --- | --- |
| Server | `CLACK_PORT` | `4317` | The port the server listens on. |
| Server | `CLACK_HOST` | `0.0.0.0` | The address it listens on. `0.0.0.0` makes it reachable from other devices on your network; `127.0.0.1` keeps it to this computer (reach it from elsewhere through a VPN or SSH tunnel). |
| Server | `CLACK_DATA_DIR` | `./data` in the repository | The [data directory](chats.md#where-chats-work): chat folders, notes, logs, uploads and remembered settings. Chats run in folders under `<this>/sessions`, or in folders added from the UI. |
| Server | `CLACK_TOKEN` | generated | The access token for signing in. Unset, one is made on first start and saved in `~/.config/clack/token`; delete that file and restart for a new one, which signs every browser out. |
| Server | `CLACK_USER_NAME` | the account's name | The name your own messages are shown under. |
| Server | `CLACK_IDLE_MINUTES` | `20` | Minutes before an idle Claude Code process is shut down. The chat resumes on your next message. |
| Features | `CLACK_TERMINAL` | on | `off` removes the terminals from the [Data page](interface.md#data-page) and the server. The folder tree and file previews stay. |
| Features | `CLACK_OUTSIDE_FOLDERS` | on | `off` keeps chats in `data/sessions` only: folders on the computer can then not be added or browsed from the UI. |
| Agents | `CLACK_CODEX` | `auto` | `off` leaves Codex out altogether. Otherwise it is listed, and shows as not available until `codex` is installed and signed in. See [Claude and Codex](agents.md). |
| Agents | `CLACK_CODEX_PATH` | `codex` on the `PATH` | A `codex` command that is not on the `PATH`. |
| Agents | `CLACK_CLAUDE_PATH` | the one in the Agent SDK | A specific `claude` binary to use instead of the copy that comes with the Agent SDK. |
| Agents | `ANTHROPIC_API_KEY` | — | Use Claude with an API key (billed per token) instead of a Claude subscription. |
| Agents | `CLAUDE_CODE_OAUTH_TOKEN` | — | A long-lived Claude sign-in made with `claude setup-token` on any computer; useful in Docker. |
| Agents | `CODEX_API_KEY` | — | Use Codex with an OpenAI API key instead of a ChatGPT plan. |
| Only with Docker | `CLACK_DATA_PATH` | `./data` beside `docker-compose.yml` | Where the data directory is on the host. |
| Only with Docker | `CLACK_UID`, `CLACK_GID` | `1000` | The user the app runs as in the container. On a Linux host, set them to your own ids (`id -u`, `id -g`) so the files in the data directory belong to you. |
| Only with Docker | `COMPOSE_FILE` | `docker-compose.yml` | Set to `docker-compose.yml:docker-compose.ssh.yml` to let `git` and `ssh` in the container use your [SSH agent](docker.md#ssh-keys). |
| Only with Docker | `CLACK_SSH_AUTH_SOCK` | — | On Linux, where your SSH agent's socket is. Docker Desktop, OrbStack and colima started with `--ssh-agent` need nothing here. |
