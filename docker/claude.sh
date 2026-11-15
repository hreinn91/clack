#!/bin/sh
# `claude`, as the user clack runs as. Commands given to `docker compose exec`
# run as root unless told otherwise, and a sign-in made as root would be kept
# where clack never looks.
real="$(find /app/node_modules/@anthropic-ai -maxdepth 2 -type f -name claude | head -n 1)"
if [ "$(id -u)" = "0" ]; then
  exec setpriv --reuid=node --regid=node --init-groups env HOME=/home/node USER=node LOGNAME=node "$real" "$@"
fi
exec "$real" "$@"
