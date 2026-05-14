# ── Build stages run on the host platform (no QEMU emulation) ────────────────
FROM --platform=$BUILDPLATFORM node:22-bookworm AS deps

RUN apt-get update && apt-get install -y openssl

WORKDIR /app

COPY .yarn ./.yarn
COPY yarn.lock package.json .yarnrc.yml tsconfig.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/component-library/package.json packages/component-library/package.json
COPY packages/crdt/package.json packages/crdt/package.json
COPY packages/desktop-client/package.json packages/desktop-client/package.json
COPY packages/desktop-electron/package.json packages/desktop-electron/package.json
COPY packages/eslint-plugin-actual/package.json packages/eslint-plugin-actual/package.json
COPY packages/loot-core/package.json packages/loot-core/package.json
COPY packages/sync-server/package.json packages/sync-server/package.json
COPY packages/plugins-service/package.json packages/plugins-service/package.json

COPY ./bin/package-browser ./bin/package-browser

RUN --mount=type=cache,target=/root/.yarn/berry/cache \
    yarn install

FROM --platform=$BUILDPLATFORM deps AS builder

WORKDIR /app

COPY packages/ ./packages/

ENV NODE_OPTIONS=--max_old_space_size=8192

# Build directly instead of via `yarn build:server` (which calls lage).
# lage requires glob-hasher-linux-arm64-gnu, a native binary absent from the
# lockfile (generated on macOS). All workspace deps export TS source so vite
# resolves them without a separate pre-build step.
RUN --mount=type=cache,target=/app/packages/desktop-client/node_modules/.vite \
    yarn workspace plugins-service build && \
    yarn workspace @actual-app/web build:browser && \
    yarn workspace @actual-app/sync-server build

# ── Production deps stage runs on the TARGET platform (arm64 for Pi) ─────────
# Only installs npm packages + compiles native modules — no big JS builds.
FROM node:22-bookworm AS prod-deps

RUN apt-get update && apt-get install -y openssl

WORKDIR /app

COPY .yarn ./.yarn
COPY yarn.lock package.json .yarnrc.yml tsconfig.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/component-library/package.json packages/component-library/package.json
COPY packages/crdt/package.json packages/crdt/package.json
COPY packages/desktop-client/package.json packages/desktop-client/package.json
COPY packages/desktop-electron/package.json packages/desktop-electron/package.json
COPY packages/eslint-plugin-actual/package.json packages/eslint-plugin-actual/package.json
COPY packages/loot-core/package.json packages/loot-core/package.json
COPY packages/sync-server/package.json packages/sync-server/package.json
COPY packages/plugins-service/package.json packages/plugins-service/package.json

COPY ./bin/package-browser ./bin/package-browser

RUN --mount=type=cache,target=/root/.yarn/berry/cache \
    yarn workspaces focus @actual-app/sync-server --production

FROM node:22-bookworm-slim AS prod

# Minimal runtime dependencies
RUN apt-get update && apt-get install -y tini && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Create a non-root user
ARG USERNAME=actual
ARG USER_UID=1001
ARG USER_GID=$USER_UID
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && mkdir /data && chown -R ${USERNAME}:${USERNAME} /data

WORKDIR /app
ENV NODE_ENV=production

# node_modules from prod-deps (arm64 native modules), JS artifacts from builder
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=builder /app/packages/sync-server/package.json ./
COPY --from=builder /app/packages/sync-server/build ./build

# Wire up the web frontend (symlink was removed; copy build artifacts directly)
COPY --from=builder /app/packages/desktop-client/package.json /app/node_modules/@actual-app/web/package.json
COPY --from=builder /app/packages/desktop-client/build /app/node_modules/@actual-app/web/build

ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
EXPOSE 5006
CMD ["node", "build/app.js"]
