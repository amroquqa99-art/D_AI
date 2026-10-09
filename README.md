# D_AI — Depth AI

English | [中文](README.zh.md)

D_AI is a multi-system AI operating environment built from the real DeepSeek Harness source. It uses native Cordis plugins, independent child agents, durable Session events, explicit permissions and bounded execution. Upstream changes are reviewed and integrated manually; the application does not fetch a live upstream checkout at runtime.

## Development status

The current development branch is `dai/artifact-store-20261010`, based on the unmerged scheduler-owner fairness checkpoint. D_AI is not a finished production release. Source changes, fixture evidence and live-provider acceptance have separate statuses.

The six domain slices—Investigation, Scientific Research, Investor, Cybersecurity, Operations & Intelligence, and Innovation & Discovery—have native runtime paths. Shared infrastructure includes task plans, fenced execution leases, checkpoints, evidence/control projections, routing policies and a local decision adviser. The complete Control Center, live connectors, distributed scheduling and governed training remain unfinished.

Use these current reports for implementation and readiness:

- [Arabic execution status](https://github.com/amroquqa99-art/D_AI/blob/dai/artifact-store-20261010/D_AI_EXECUTION_STATUS_AR.md).
- [Feature acceptance matrix](https://github.com/amroquqa99-art/D_AI/blob/dai/artifact-store-20261010/docs/FEATURE_MATRIX.md).
- [Executed checks and limitations](https://github.com/amroquqa99-art/D_AI/blob/dai/artifact-store-20261010/docs/TEST_REPORT.md).

## Restart recovery

The opt-in scheduler can restore explicitly configured cold root Sessions with due approved work through native single-writer recovery. It preserves human input, budgets, approvals and fenced task attempts. See [the recovery guide](https://github.com/amroquqa99-art/D_AI/blob/dai/artifact-store-20261010/docs/OPERATIONS.md#unattended-owner-recovery) for configuration and limits; complete outage, distributed and live-provider acceptance remains separate.

## Experiment artifacts

The optional native artifact plugin preserves exact files with SHA256 identities, immutable parent lineage and an owner-scoped durable catalog. Its text tools and host byte API enforce live-root access and configured limits. [The artifact guide](https://github.com/amroquqa99-art/D_AI/blob/dai/artifact-store-20261010/packages/experimental/d-ai/README.md#immutable-experiment-artifacts) documents activation, backup and failure behavior. Export/import, retention, automatic training curation and organizational sharing remain unfinished.

## Container development checks

The [container guide](docker/README.md) describes a digest-pinned Node image, the repository's exact pnpm version, frozen dependencies, build/check services and image transfer. Container configuration and failure-propagation checks pass locally; [the verification report](https://github.com/amroquqa99-art/D_AI/blob/dai/artifact-store-20261010/docs/TEST_REPORT.md) records the current complete-source host checks separately. Building the image and running the complete native checks inside it remain pending on a Docker host; the proposed commands are not a completed container deployment.

```sh
docker compose config --quiet
docker compose build check
docker compose run --rm check
```

The copied-source environment avoids changing the host checkout. It includes no models or user data and does not start the product web app. Rebuild after source/lockfile changes. CI has a separate container job; failed or unstarted workflow steps do not count as verification.

<a id="run"></a><a id="run-from-source"></a>

## Source application

The existing source path uses the supported `dsh` launcher:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm dsh web
```

This launches the underlying Harness web application. A polished D_AI launcher and Control Center are still required. [The opt-in local inference/search guide](https://github.com/amroquqa99-art/D_AI/blob/dai/artifact-store-20261010/docs/user/d-ai-local.md) connects explicitly selected local providers; complete live missions and offline deployment need further acceptance.

## Engineering and attribution

Read [AGENTS.md](https://github.com/amroquqa99-art/D_AI/blob/dai/artifact-store-20261010/AGENTS.md), [the product specification](https://github.com/amroquqa99-art/D_AI/blob/dai/artifact-store-20261010/docs/PRODUCT_SPEC.md) and [the engineering agreement](https://github.com/amroquqa99-art/D_AI/blob/dai/artifact-store-20261010/docs/ENGINEERING_WORKING_AGREEMENT.md) before changing shared contracts. Runtime permissions, approvals, audit and persistence rules remain enforced; packaging does not expand them.

The source originated in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Preserve its [MIT license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
