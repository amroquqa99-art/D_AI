# D_AI container checks

English | [中文](README.zh.md)

This contributor tutorial defines the container build/check path. It requires a complete source checkout and a working Docker Engine with Docker Compose v2 or newer. The configuration and runner checks pass locally; image build and complete in-container acceptance remain pending. [The verification report](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docs/TEST_REPORT.md) owns that distinction.

## 1. Build the source environment

The proposed Engine commands below require acceptance on a Docker host. The base is the official Node 24.19.0 Bookworm multi-platform image, pinned by its registry index digest. pnpm 11.7.0 matches the root package manager declaration. The image uses the repository lockfile and reviewed install-script/patch policy. The base supplies native compilers, Python and Node headers; build assertions reject missing tools. No additional mutable apt packages are installed.

```sh
docker compose config --quiet
docker compose build check
```

BuildKit retains a locked pnpm download cache; image layers retain installed dependencies. Source or lockfile changes require rebuilding. Caches accelerate builds but are not required for correctness. The image copies source without host `node_modules`, generated package output, Git metadata, environment files or model weights. Supply only a reviewed checkout as the context; the ignore list is not a general-purpose secret scanner.

pnpm command-time dependency verification uses `error`: an inconsistent installed snapshot stops the check rather than performing an implicit network installation. Rebuild the image to update dependencies; do not repair its lockfile during acceptance.

## 2. Run acceptance checks

```sh
docker compose run --rm check
```

The runner tests its own command sequencing, checks owner ordering, verifies the committed persistence catalog without regenerating it, checks strict D_AI types, builds the full workspace and runs coordinator/provider/package regressions. Each command must succeed before the next starts. Only the HTTP fixture test invocations disable Node's environment-proxy feature; they do not silently send loopback fixture traffic through a host proxy. Runner regressions substitute commands and establish orchestration/failure propagation only.

The source image runs as the existing unprivileged `node` user. Compose adds a process reaper. Neither service mounts the host checkout, credentials, Docker socket or a persistent application home. `CI=true` avoids installing Git hooks into the copied source. The Node heap limit is 8 GiB; allow additional memory for native processes and build tools. Tests use at most four Vitest workers. This environment is not an institutional isolation boundary.

## 3. Build or inspect the snapshot

```sh
docker compose build build
docker compose run --rm build
docker compose run --rm check bash
```

The `build` service runs the existing full workspace build. A shell sees the source/dependencies baked into that image; it does not edit the host checkout. Edit source on the host, then rebuild. Build outputs and shell edits in a `--rm` container are temporary. Neither service starts the product web app, a model server, search engines, a database or a GPU runtime. Application deployment, persistent Session storage, model artifacts and live-provider verification are separate work.

## 4. Transfer the prepared environment

After a successful host build, preserve the source/dependency image explicitly:

```sh
docker image save dai-source:local -o dai-source-environment.tar
docker image load -i dai-source-environment.tar
docker run --rm --init dai-source:local
```

Use a matching CPU architecture on the destination. A transferred image avoids reinstalling its baked dependencies; the first build still requires the registry and package network. It does not contain models, user data, optional tool downloads or a tested complete offline deployment. Treat image archives as private project source and keep them outside the checkout. A Docker build failure or failing test blocks acceptance; a generated configuration is not an image-build receipt.
