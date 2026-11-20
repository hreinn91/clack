#!/bin/sh
# `codex`, as the user clack runs as, like docker/claude.sh: a sign-in made as
# root (the default for `docker compose exec`) would be kept where clack never
# looks. Sign in with:  docker compose exec clack codex login --device-auth
real=/usr/local/lib/node_modules/@openai/codex/bin/codex.js
if [ "$(id -u)" = "0" ]; then
  exec setpriv --reuid=node --regid=node --init-groups env HOME=/home/node USER=node LOGNAME=node node "$real" "$@"
fi
exec node "$real" "$@"
