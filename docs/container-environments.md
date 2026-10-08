# D_AI reproducible development container

**Status:** Container configuration added; an end-to-end Docker build and test run must pass before it is counted as verified. This is not a production deployment.

## Why

A fresh checkout must not require manually installing Node, pnpm, a native C
compiler and all workspace packages on each host. The project owns its test
toolchain; it must not rely on a mutable globally installed pnpm or an
untracked host `node_modules`.

## Quick start

Requires Docker Engine with the Compose v2 and BuildKit plugins, and a Linux
container host (or Docker Desktop's Linux-container mode):

```sh
docker compose build verify
docker compose run --rm verify
docker compose run --rm verify pnpm run build:native-system
docker compose run --rm verify pnpm run test:approval-policy
docker compose run --rm verify pnpm exec tsc -b packages/experimental/d-ai/tsconfig.json --pretty false
```

The image includes Node 22.19.0, pnpm 11.7.0, C compilers, Python 3 and the
repository's workspace dependencies. Dependency installation uses the committed
`pnpm-lock.yaml` in frozen, offline install mode after `pnpm fetch`.
The BuildKit cache preserves downloaded packages between image builds on the
same builder. Rebuild after changing source; dependency downloads should be
reused when the lockfile is unchanged.

```sh
docker compose build verify
docker image save dai-dev:local -o dai-dev-image.tar
# On another compatible host:
docker image load -i dai-dev-image.tar
docker compose run --rm --no-deps verify
```

**Important:** `docker compose run` may try to build a missing image; after
loading the saved image, check `docker image inspect dai-dev:local` and use
`docker compose run --rm --no-deps --no-build verify` if the installed Compose
version supports `--no-build`. Do not confuse an image tarball with checked-in
source. Images are platform-specific; build/publish multi-arch images separately.

## Engineering policy

- Docker/Compose definitions, base toolchain versions, lockfiles and launch
  instructions belong in Git. Do not commit secrets, personal data, session
  data, local models, generated node_modules or image tarballs.
- Use Docker for reproducible builds/tests; native desktop GUI, direct host
  sandbox features, GPU drivers and privileged system integrations require
  separate platform testing. Running this image does not certify production use.
- Run focused checks first, then the existing D_AI repository gates when
  appropriate. Never treat an image that merely builds as evidence that product
  functionality passes.
- The image freezes its installed dependencies once built; fresh image builds
  still depend on the availability of upstream registries/base image tags.
  Pin base images by verified digest for a release and publish the resulting
  image by immutable digest. Do not silently upgrade versions.
- When a test requires network access, credentials or external model services,
  supply these separately with explicit authorization. The default test
  container must not inherit a host `.env` or authentication files.
- Carry the Docker policy forward in `AGENTS.md` and the main README and keep
  this document synchronized with the actual stack and commands.

## Validation still needed

1. Complete a fresh online `docker compose build verify` on Linux/amd64.
2. Run the focused D_AI vitest command in that image, then targeted
   native/build/typecheck checks; record exact results.
3. Confirm `docker image save` / `load` and offline test execution on the
   same architecture. This does not imply that fresh builds work without
   Internet access.
4. Assess a separately versioned runtime image and optional model-service
   profiles when real deployment contracts stabilize.
