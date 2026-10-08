# syntax=docker/dockerfile:1.7
# Deterministic Linux tooling for the D_AI / DeepSeek Harness source tree.
# This is a development/test image, not a production or desktop launcher.
FROM node:22.19.0-bookworm

ENV CI=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    npm_config_store_dir=/pnpm/store

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git python3 make gcc g++ pkg-config musl-tools \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /workspace

# Resolve third-party packages before copying frequently changing sources.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=dai-pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

COPY . .
RUN --mount=type=cache,id=dai-pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile

# Native N-API compilation needs the C toolchain installed above.
RUN pnpm run build:native-system

# Replace with a focused command through "docker compose run".
CMD ["pnpm", "exec", "vitest", "run", "packages/experimental/d-ai/tests"]
