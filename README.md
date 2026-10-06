# D_AI — Depth AI

> **Development status:** active build on `dai/v2-core-foundation` · PR #15 · last status update: 2026-10-06

D_AI is a multi-system AI operating environment built by modifying the real DeepSeek Harness source rather than wrapping it as an external dependency. The repository preserves the useful Harness runtime/plugin architecture while D_AI is being developed as its own codebase, control plane, domain system registry, durable state model, and agent orchestration layer.

This repository is **not yet a finished release**. The sections below are the current implementation ledger so the repository itself shows what is real, what is being validated, and what remains.

## Current build status

Legend:

- **TESTED** — implemented and has passed the D_AI test gate at least once.
- **IMPLEMENTED / CI PENDING** — runtime code and tests exist on the active branch, but the latest complete gate has not yet passed after the newest changes.
- **FOUNDATION** — contracts/core primitives exist, but the full production behavior is not complete.
- **NOT BUILT** — planned but not implemented yet.

| Area | Current state | What exists now |
| --- | --- | --- |
| Investigation | **TESTED / native** | Durable missions, bounded source capture, source hashes/provenance, anchored claims/counterclaims, independent research + verification child Agents, replay after restart. |
| Scientific Research | **IMPLEMENTED / CI PENDING** | Durable research projects, open hypotheses, human/lab experiment handoff, result recording, independent literature + methodology Agents, restart projection. |
| Investor | **IMPLEMENTED / CI PENDING** | Durable cases, immutable captured financial sources, explicit theses + invalidation conditions, independent fundamental + risk Agents. No capital execution tool. |
| Cybersecurity | **IMPLEMENTED / CI PENDING** | Explicit authorization scope, defensive findings, remediation, safe retest recording, independent assessment + remediation-review Agents. |
| Operations & Intelligence | **IMPLEMENTED / CI PENDING** | Durable cases, entities, relationships, timelines, intelligence gaps, human-gated proposed options, fusion + adversarial analysis Agents. |
| Innovation & Discovery | **IMPLEMENTED / CI PENDING** | Testable candidates, mechanisms, falsification tests, experiment handoff/results, independent explorer + critic Agents. Generated ideas cannot self-declare as discoveries. |
| Shared Task DAG | **IMPLEMENTED / CI PENDING** | Task states, dependencies, retry accounting, durable task-ledger replay, and scheduler admission that respects dependencies/blocking states. |
| Mission Director | **FOUNDATION** | Mission planning primitives, runnable-work selection, resource admission and Value-of-Information ranking. Full long-running scheduler/executor loop is still being built. |
| Capability control plane | **IMPLEMENTED / CI PENDING** | Scoped ALLOW/DENY grants, fail-closed authorization, human-approved durable grant changes, append-only audit hash chain, durable control-plane projection. |
| Evidence / Knowledge graph | **FOUNDATION** | Cross-system evidence nodes/edges, support/contradiction representation and claim-tension queries. Persistence/runtime integration is still incomplete. |
| Cross-system handoff | **IMPLEMENTED / CI PENDING** | Persisted grant-backed authorization and durable audit records exist for declared system-to-system handoffs. Automatic target-task execution/routing is still incomplete. |
| Model Router | **FOUNDATION** | Hard capability/context/locality requirements plus weighted model ranking. Live provider telemetry/routing integration is not complete. |
| Resource budgets + VoI | **IMPLEMENTED / CI PENDING** | Durable scoped budget profiles now store token, money, wall-clock, human-attention and data-access limits plus measured usage; VoI ranking primitives exist. Full automatic metering/enforcement across every tool call is still incomplete. |
| Training governance | **FOUNDATION** | Explicit eligibility, dataset lineage, sensitive-data exclusion rules, evaluation/promotion and rollback primitives. |
| Local Intelligence Core | **FOUNDATION ONLY** | Architecture, governance, dataset/promotion gates and model-release pointers exist. **There is no claim that a D_AI local model has already been trained.** |
| Admin / Control Center UI | **NOT BUILT** | Runtime control APIs are being built first; full GUI for users, grants, systems, models, budgets and audit is still pending. |

## What is being worked on right now

The active engineering path is:

1. Finish the durable shared core integration: scheduler execution leases/checkpoints, automatic resource metering, and control-plane enforcement at every sensitive tool boundary.
2. Regenerate the Harness persistence catalog for all new D_AI Session events.
3. Pass the strict D_AI gate:
   - native system addon build
   - persistence catalog generation/verification
   - TypeScript strict check
   - system registry tests
   - all D_AI package/integration tests
4. Promote system registry statuses only after the gate is green.
5. Continue from primitives to the long-running Mission Director/scheduler and full cross-system runtime.
6. Build the Control Center/Admin UI after the control APIs and durable state are stable.

The CI workflow used for this branch is `.github/workflows/d-ai-v2-checks.yml`.

## D_AI core currently in the repository

The main implementation is under:

```text
packages/experimental/d-ai/
├── src/
│   ├── index.ts
│   ├── systems.ts
│   ├── state.ts
│   ├── orchestration.ts
│   ├── scientific-state.ts
│   ├── scientific-orchestration.ts
│   ├── investor-state.ts
│   ├── investor-orchestration.ts
│   ├── cyber-state.ts
│   ├── cyber-orchestration.ts
│   ├── operations-state.ts
│   ├── operations-orchestration.ts
│   ├── innovation-state.ts
│   ├── innovation-orchestration.ts
│   ├── task-dag.ts
│   ├── task-ledger-state.ts
│   ├── mission-director.ts
│   ├── capability-grants.ts
│   ├── control-plane-state.ts
│   ├── audit-log.ts
│   ├── cross-system.ts
│   ├── evidence-graph.ts
│   ├── resource-value.ts
│   ├── budget-state.ts
│   ├── runtime-scheduler.ts
│   ├── model-router.ts
│   ├── training-governance.ts
│   └── model-evaluation.ts
└── tests/
```

D_AI uses native Harness concepts instead of storing everything in prompts:

- native AgentLoop + child Agents
- Session facts and deterministic projections
- JSONL persistence/replay
- native tools
- native approval flow
- Domain Storage for recoverable indexes
- explicit system registry
- append-only evidence/control facts
- bounded resources and fail-closed authorization

## Domain boundaries currently enforced

These are intentional engineering boundaries, not placeholders:

- **Investigation:** claims require captured-source anchors.
- **Scientific Research:** hypotheses remain hypotheses; real experiment observations are recorded separately.
- **Investor:** analysis is allowed; there is no buy/sell/order/capital-movement tool in the current slice.
- **Cybersecurity:** the engagement stores explicit authorization scope; current tools are defensive assessment/remediation/retest oriented.
- **Operations & Intelligence:** the system can build an operational picture and propose options, but proposed options require human approval and are not external action execution.
- **Innovation & Discovery:** candidates require falsification tests; model-generated candidates cannot automatically become verified discoveries.
- **Capability changes:** durable capability grants/denials require native human approval and are audit-chained.

## Local Intelligence Core

The Local Intelligence Core is a platform component, not a seventh domain system.

Current implemented foundation includes:

- explicit training-data eligibility
- opt-in/opt-out concepts
- source ownership/license metadata
- sensitive-data exclusion
- dataset lineage
- holdout evaluation
- before/after model evaluation
- promotion gates
- rollback pointer

Still required before it can be called a working D_AI model:

- real governed dataset pipeline
- local training/fine-tuning jobs
- benchmark/evaluation harness wired to model artifacts
- live model registry
- runtime model-router telemetry
- promoted model artifact
- rollback exercised on a real model release

## What still needs major work

The repository is already beyond a design-only prototype, but major engineering remains:

- durable long-running scheduler/executor for missions that last hours/days/weeks
- checkpoint/recovery across active tool execution, not only Session projection replay
- cross-system runtime dispatch using the shared grants/control plane
- persistent shared Evidence/Knowledge Graph backend
- full per-tool resource-budget enforcement
- real model-provider manager and live routing telemetry
- real Local Intelligence Core training pipeline
- complete Control Center/Admin UI
- user/role/organization administration for institutional deployments
- configurable permission templates and temporary grants
- real connectors/data providers for finance, scholarly research, geospatial/OSINT, and authorized institutional data
- production observability, secrets/configuration management, deployment packaging and migration tooling
- full security review and institutional hardening
- live-provider verification beyond fixture-model integration tests

## Validation commands

From a repository checkout:

```sh
pnpm install --frozen-lockfile
pnpm run gen-persistence-catalog
pnpm run verify-persistence-catalog
pnpm run build:native-system
pnpm exec tsc -b packages/experimental/d-ai/tsconfig.json --pretty false
pnpm exec vitest run packages/experimental/d-ai/tests
```

The project does not mark a subsystem as tested merely because source files exist. CI status and integration tests are part of the readiness definition.

## Repository relationship to DeepSeek Harness

D_AI started from the DeepSeek Harness source because its native AgentLoop, Session/event model, plugin architecture and tool runtime are useful foundations. The goal of this repository is to evolve that source into D_AI directly, not to depend on a live upstream checkout at runtime.

Upstream project: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

Upstream documentation: [deepseek-harness.github.io/deepseek-harness](https://deepseek-harness.github.io/deepseek-harness/)

When an upstream change is useful, it should be reviewed and deliberately integrated into D_AI rather than automatically changing this repository underneath the D_AI code.

## Running the underlying Harness application

### Run from source

```sh
pnpm install
pnpm run build
pnpm dsh web
```

The current D_AI engineering work is source-first. A dedicated polished D_AI product launcher and Control Center are still pending.

## Safety and deployment note

D_AI is under active development and is not yet a production-certified system. Review [SAFETY.md](SAFETY.md) before running it. High-impact external actions, sensitive institutional deployments, real-money actions, active security testing and physical experiments require explicit authorization/approval layers appropriate to the deployment.

## Development

The upstream repository architecture and development notes remain useful while D_AI is being modified:

- [Development guide](docs/development.md)
- [Architecture documentation](docs/architecture.md)
- [AGENTS.md](AGENTS.md)

## License and upstream attribution

The inherited DeepSeek Harness code remains subject to its repository license and third-party notices.

- [MIT License](LICENSE)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

DeepSeek Harness upstream attribution is retained because D_AI is being built from that source base.
