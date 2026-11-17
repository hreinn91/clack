#!/bin/sh
# Starts as root for one job: making sure the app's user can use what is
# mounted into the container (the data directory, the home volume, and an SSH
# agent if one is passed in). Then it becomes that user and starts the app.
# Nothing of clack itself ever runs as root; only the SSH relay below might.
set -e

if [ "$(id -u)" != "0" ]; then
  # Started as some other user on purpose (docker run --user): nothing to prepare.
  if [ -n "${CLACK_SSH_AGENT:-}" ]; then export SSH_AUTH_SOCK="$CLACK_SSH_AGENT"; fi
  exec "$@"
fi

uid="${CLACK_UID:-1000}"
gid="${CLACK_GID:-1000}"

# The app runs as the image's "node" user, given the ids asked for. On a Linux
# host, your own ids make the files in the data directory yours.
[ "$(id -g node)" = "$gid" ] || groupmod --non-unique --gid "$gid" node
[ "$(id -u node)" = "$uid" ] || usermod --non-unique --uid "$uid" --gid "$gid" node

as_node() {
  setpriv --reuid=node --regid=node --init-groups env HOME=/home/node USER=node LOGNAME=node "$@"
}

# The home volume holds Claude Code's sign-in and conversations. It belongs to
# the user that first used it, which is not this one if the ids were changed.
if [ "$(stat -c %u:%g /home/node)" != "$uid:$gid" ]; then
  chown -R node:node /home/node 2>/dev/null || true
fi

# A data folder that did not exist on the host is created by Docker, as root.
if ! as_node test -w /data; then
  chown node:node /data 2>/dev/null || true
fi
if ! as_node test -w /data; then
  echo "clack: the data directory mounted at /data cannot be written by user $uid:$gid." >&2
  echo "clack: set CLACK_UID and CLACK_GID in .env to the owner of that folder on the host (id -u, id -g)." >&2
  exit 1
fi

# An SSH agent passed in from the host (docker-compose.ssh.yml). Who owns its
# socket depends on what runs Docker: root with Docker Desktop, the virtual
# machine's user with colima, you on Linux. When the app's user can use it as
# it is, it is used directly. Otherwise a small relay, running as root, offers
# it on a socket of the app's user's own, so nothing outside the container is
# changed. Problems here only cost SSH: they are reported and the app starts.
if [ -n "${CLACK_SSH_AGENT:-}" ]; then
  if [ ! -S "$CLACK_SSH_AGENT" ]; then
    echo "clack: no SSH agent was passed in at $CLACK_SSH_AGENT; see \"SSH keys\" in the README." >&2
  elif as_node test -w "$CLACK_SSH_AGENT"; then
    export SSH_AUTH_SOCK="$CLACK_SSH_AGENT"
  else
    relay=/run/clack-ssh/agent.sock
    mkdir -p /run/clack-ssh
    chown node:node /run/clack-ssh
    chmod 700 /run/clack-ssh
    socat "UNIX-LISTEN:$relay,fork,unlink-early,user=node,group=node,mode=600" "UNIX-CONNECT:$CLACK_SSH_AGENT" &
    # The socket appears within moments; the app is not started before it is there.
    tries=0
    while [ ! -S "$relay" ] && [ "$tries" -lt 50 ]; do
      sleep 0.1
      tries=$((tries + 1))
    done
    if [ -S "$relay" ]; then
      export SSH_AUTH_SOCK="$relay"
    else
      echo "clack: could not pass on the SSH agent at $CLACK_SSH_AGENT." >&2
    fi
  fi
fi

exec setpriv --reuid=node --regid=node --init-groups env HOME=/home/node USER=node LOGNAME=node "$@"
