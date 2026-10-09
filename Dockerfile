FROM node:24.19.0-bookworm@sha256:4196d66a565c6f195728d9952f161f4adfe2ad753052a08b7ec7f1c5a6bda42b AS toolchain

RUN npm install --global pnpm@11.7.0 \
    && test "$(node --version)" = v24.19.0 \
    && test "$(pnpm --version)" = 11.7.0 \
    && command -v python3 \
    && command -v make \
    && command -v cc \
    && test -f /usr/local/include/node/node_api.h \
    && mkdir /workspace \
    && chown node:node /workspace

ENV CI=true \
    NODE_OPTIONS=--max-old-space-size=8192 \
    NODE_HEADERS_DIR=/usr/local/include/node \
    pnpm_config_store_dir=/home/node/.cache/pnpm \
    pnpm_config_verify_deps_before_run=error \
    DSH_HOME=/home/node/.dai

USER node
WORKDIR /workspace

FROM toolchain AS source
COPY --chown=node:node . .
RUN --mount=type=cache,id=dai-pnpm-11,target=/home/node/.cache/pnpm,uid=1000,gid=1000,sharing=locked \
    pnpm install --frozen-lockfile --store-dir /home/node/.cache/pnpm

CMD ["bash", "docker/check.sh"]
