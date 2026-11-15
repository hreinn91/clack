#!/bin/sh
# Starts as root for one job: making sure the app's user can use the two
# places that are mounted into the container. Then it becomes that user and
# starts the app. Nothing of clack itself ever runs as root.
set -e

if [ "$(id -u)" != "0" ]; then
  # Started as some other user on purpose (docker run --user): nothing to prepare.
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

exec setpriv --reuid=node --regid=node --init-groups env HOME=/home/node USER=node LOGNAME=node "$@"
