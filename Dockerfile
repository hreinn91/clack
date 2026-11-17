# syntax=docker/dockerfile:1

# ---- build: install everything, compile the native part, build the web UI ----
# The full image has the compiler that node-pty needs; Linux gets no ready-built copy.
FROM node:24-bookworm AS build
WORKDIR /app

# Only the package files first, so the slow install is reused until a dependency changes.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

# npm builds node-pty during the install where it is allowed to run install
# scripts. Where it is not, build it here; either way, fail now rather than
# ship an image whose terminals cannot start.
RUN test -f node_modules/node-pty/build/Release/pty.node \
    || (cd node_modules/node-pty && npx --yes node-gyp rebuild) \
    && test -f node_modules/node-pty/build/Release/pty.node

COPY shared shared
COPY server server
COPY web web
RUN npm run build

# What is only needed for building stays behind: the tools, and node-pty's
# sources and its ready-built copies for other systems.
RUN npm prune --omit=dev \
    && rm -rf node_modules/node-pty/prebuilds node_modules/node-pty/third_party \
              node_modules/node-pty/deps node_modules/node-pty/src


# ---- run ----
FROM node:24-bookworm-slim

# What a shell in the terminal page, and Claude Code itself, can reasonably
# expect to find. Add to this list to have more tools in the container.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash ca-certificates curl git jq less nano openssh-client procps python3 ripgrep socat tini unzip \
    && rm -rf /var/lib/apt/lists/*

# A server ssh has never seen is trusted the first time and remembered in
# ~/.ssh/known_hosts (in the home volume); a key that changes later is still
# refused. Without this the first `git clone git@github.com:…` stops at a
# question that Claude's commands cannot answer.
RUN printf 'Host *\n    StrictHostKeyChecking accept-new\n' > /etc/ssh/ssh_config.d/clack.conf

WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/shared shared
COPY --from=build /app/server server
COPY --from=build /app/web/dist web/dist

# Claude Code comes with the Agent SDK. Putting it on the PATH lets you sign in
# from the container, and use it in the terminal page.
COPY docker/claude.sh /usr/local/bin/claude
COPY docker/entrypoint.sh /usr/local/bin/clack-entrypoint
RUN chmod 755 /usr/local/bin/claude /usr/local/bin/clack-entrypoint && claude --version

# /data is the data directory: chat folders, logs, remembered settings. It is
# meant to be a folder of the host.
# /home/node holds what Claude Code keeps about itself (its sign-in and the
# conversations) and clack's access token, so it has to outlive the container.
RUN mkdir -p /data /home/node/.claude /home/node/.config/clack \
    && chown -R node:node /data /home/node
VOLUME ["/data", "/home/node"]

ENV NODE_ENV=production \
    CLACK_CONTAINER=1 \
    CLACK_HOST=0.0.0.0 \
    CLACK_PORT=4317 \
    CLACK_DATA_DIR=/data \
    SHELL=/bin/bash

# The container starts as root only so the entrypoint can make the mounted
# folders usable; it then runs the app as the "node" user (see docker/entrypoint.sh).
EXPOSE 4317

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.CLACK_PORT || 4317) + '/api/me').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# tini passes signals on and cleans up after the processes Claude Code and the terminals start.
ENTRYPOINT ["tini", "--", "clack-entrypoint"]
CMD ["node", "server/src/index.ts"]
