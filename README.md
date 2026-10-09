# D_AI — Depth AI

English | [中文](README.zh.md)

> Latest checkpoint: [PR #21](https://github.com/amroquqa99-art/D_AI/pull/21), draft and unmerged. The source remains on the development branch; this main-branch update changes documentation only.

D_AI is a multi-system AI operating environment built from the real DeepSeek Harness source. It uses native Cordis plugins, independent child agents, durable Session events, explicit permissions and bounded execution. Upstream changes are reviewed and integrated manually; the application does not fetch a live upstream checkout at runtime.

## Development status

The current development branch is `dai/container-environment-20261009`, based on the unmerged scheduler-owner fairness checkpoint. D_AI is not a finished production release. Source changes, fixture evidence and live-provider acceptance have separate statuses.

The six domain slices—Investigation, Scientific Research, Investor, Cybersecurity, Operations & Intelligence, and Innovation & Discovery—have native runtime paths. Shared infrastructure includes task plans, fenced execution leases, checkpoints, evidence/control projections, routing policies and a local decision adviser. The complete Control Center, live connectors, distributed scheduling and governed training remain unfinished.

Use these current reports for implementation and readiness:

- [Arabic execution status](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/D_AI_EXECUTION_STATUS_AR.md).
- [Feature acceptance matrix](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docs/FEATURE_MATRIX.md).
- [Executed checks and limitations](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docs/TEST_REPORT.md).

## Container development checks

The [container guide](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docker/README.md) describes a digest-pinned Node image, the repository's exact pnpm version, frozen dependencies, build/check services and image transfer. Container configuration and failure-propagation checks pass locally. Building the image and running the complete native checks inside it remain pending on a Docker host; the proposed commands are not a completed container deployment.

Check out `dai/container-environment-20261009` before using the proposed container commands below; their Engine acceptance is pending.

```sh
docker compose config --quiet
docker compose build check
docker compose run --rm check
```

The copied-source environment avoids changing the host checkout. It includes no models or user data and does not start the product web app. Rebuild after source/lockfile changes. CI has a separate container job; failed or unstarted workflow steps do not count as verification.

## Source application

The existing source path uses the supported `dsh` launcher:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm dsh web
```

This launches the underlying Harness web application. A polished D_AI launcher and Control Center are still required. [The opt-in local inference/search guide](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docs/user/d-ai-local.md) connects explicitly selected local providers; complete live missions and offline deployment need further acceptance.

## Engineering and attribution

Read [AGENTS.md](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/AGENTS.md), [the product specification](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docs/PRODUCT_SPEC.md) and [the engineering agreement](https://github.com/amroquqa99-art/D_AI/blob/dai/container-environment-20261009/docs/ENGINEERING_WORKING_AGREEMENT.md) before changing shared contracts. Runtime permissions, approvals, audit and persistence rules remain enforced; packaging does not expand them.

The source originated in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Preserve its [MIT license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
