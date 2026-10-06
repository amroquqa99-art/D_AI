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
| Mission Director | **IMPLEMENTED / CI PENDING** | Durable cross-system plans, isolated planner decomposition, single-task/bounded-cycle execution, and a durable unattended scheduler now exist. Schedules are human-approval gated, retain cadence and cycle receipts, wake only idle root Agents, and execute inside a native Agent turn so leases/fencing/checkpoints remain authoritative. Full CI/native acceptance and multi-process worker scheduling are still pending. |
| Durable execution | **IMPLEMENTED / CI PENDING** | Runnable tasks use durable leases with monotonically increasing per-task fencing tokens. Renew/checkpoint/executor-state/release mutations require the exact `taskId + leaseId + fence`, stale workers fail closed, checkpoints retain lease lineage, expired leases recover through retry accounting, and persisted execution facts migrate deterministically from v1 to fenced v2. The unattended Director wake loop is implemented; distributed worker-pool/fault-injection acceptance remains pending. |
| External side-effect idempotency | **IMPLEMENTED FOUNDATION / CI PENDING** | A durable journal and connector gateway now model `RESERVED → DISPATCHED → COMMITTED`, preserve `OUTCOME_UNKNOWN`, suppress replay of committed keys, allow safe rebind only before dispatch, and require human reconciliation for uncertain outcomes. No production mutable connector is enabled yet. |
| Capability control plane | **IMPLEMENTED / CI PENDING** | Scoped ALLOW/DENY grants, fail-closed authorization, human-approved durable grant changes, append-only audit hash chain, durable control-plane projection. |
| Evidence / Knowledge graph | **IMPLEMENTED / CI PENDING** | Shared append-only evidence nodes/edges now persist through Session replay with provenance and confidence; support/contradiction graph primitives exist. Automatic domain-to-graph ingestion and graph UI are still incomplete. |
| Cross-system handoff | **IMPLEMENTED / CI PENDING** | Mission Director execution now enforces persisted capability grants fail-closed before cross-system task work begins, derives handoff sources from durable dependencies, records authorized handoffs in the audit chain, and moves denied work to `BLOCKED_POLICY`. Broader cross-system tool/data gateways remain incomplete. |
| Model Router | **IMPLEMENTED / CI PENDING** | Durable non-secret Model Profiles and per-system/role Routing Policies persist, route by hard capability/context/locality constraints plus weighted ranking, and automatically inject the selected provider/model into native worker roles across all six domains. Provider-secret storage and live telemetry are still incomplete. |
| Resource budgets + VoI | **IMPLEMENTED / CI PENDING** | Durable TASK/MISSION/SYSTEM budget profiles participate in scheduler admission; exact exhaustion is fail-closed. Mission Director task execution now meters real wall-clock time into all matching scopes atomically. Token, money, human-attention and data-access telemetry are not yet automatically measured. |
| Training governance | **IMPLEMENTED / CI PENDING** | Governed training-artifact metadata now persists with deterministic eligibility decisions; raw training content is referenced by artifact ID rather than embedded, and versioned datasets require eligible training candidates plus an independent holdout. Actual training jobs are not implemented yet. |
| Local Intelligence Core | **FOUNDATION ONLY** | Architecture, governed candidate/dataset pipeline, durable evaluation records, recomputed promotion decisions and rollback pointers now exist. **No D_AI local model has been trained, deployed or activated yet.** Training execution and real model artifacts are still missing. |
| Control Center read API | **IMPLEMENTED / CI PENDING** | A consolidated platform snapshot now exposes domain counts, task states, control-plane grants/audit, budgets, evidence-graph size and execution lease/checkpoint health for future dashboards. |
| Admin / Control Center UI | **NOT BUILT** | Runtime control APIs are being built first; full GUI for users, grants, systems, models, budgets and audit is still pending. |

## Current CI blocker

As of 2026-10-07, the latest inspected scheduler-code checkpoint `D_AI v2 checks` run is [37532703605](https://github.com/amroquqa99-art/D_AI/actions/runs/37532703605), job `112505811309`. The job concluded `failure` with **no workflow steps**, so checkout/install/persistence generation/build/typecheck/tests did not execute. The precise runner rejection reason remains unavailable through the connected API.

The complete native integration/build gate remains **CI PENDING**. Focused local verification is recorded separately below and does not establish full runtime readiness.

## Latest local engineering checkpoint

The lease heartbeat now preserves renewal failures that settle during cleanup, prevents cancelled work from reporting success, checks cancellation before deferred worker startup, retains arbitrary rejection values and supports short lease intervals. Cleanup still waits for both the worker and renewal to settle.

The last recorded focused local verification on 2026-10-06 passed **86 tests across 21 D_AI test files**, including ten lease-heartbeat cases, plus strict TypeScript checks for the changed helper and its tests. Five regression cases failed against the previous helper before the fix. Scheduler projection/wake/runtime/REAL-Loader tests were added after that receipt and remain **authored / CI_PENDING**, not claimed passing. Exact scope and remaining checks are in [TEST_REPORT.md](docs/TEST_REPORT.md).

## What is being worked on right now

The active engineering path is:

1. Continue thinning the runtime composition root behind characterization tests; shared owner/turn/mutation invariants and typed projection reads are already centralized.
2. Restore an executable CI gate and run the full current branch validation. No maturity promotion happens while Actions is failing before steps.
3. Validate and harden the new unattended scheduler under restart/cancellation/fault injection, then extend from one-process root-Agent wake coordination to a bounded multi-worker execution model.
4. Extend resource telemetry beyond real wall-clock metering to model tokens/cost, data-access cost and human-attention accounting without fabricated estimates.
5. Expand cross-system authorization from Director task execution into the general tool/evidence gateway.
6. Regenerate/verify the Harness persistence catalog for all D_AI Session events as part of the gate.
7. Pass the strict D_AI gate:
   - native system addon build
   - persistence catalog generation/verification
   - TypeScript strict check
   - system registry tests
   - all D_AI package/integration tests
8. Promote system registry statuses only after the gate is green.
9. Continue long-horizon Mission Director policies (stagnation/saturation, fairness and multi-worker recovery) and the full cross-system runtime.
10. Build the Control Center/Admin UI after the control APIs and durable state are stable.

The CI workflow used for this branch is `.github/workflows/d-ai-v2-checks.yml`.

## D_AI core currently in the repository

The main implementation is under:

```text
packages/experimental/d-ai/
├── src/
│   ├── index.ts                  # runtime composition/service
│   ├── public-api.ts             # package export surface
│   ├── config.ts                 # deployment/runtime normalization
│   ├── runtime-projections.ts    # persistent projection registry
│   ├── runtime-kernel.ts         # owner/turn/mutation-order invariants
│   ├── runtime-state.ts          # typed immutable projection reads
│   ├── runtime-errors.ts         # stable D_AI error routing
│   ├── lease-heartbeat.ts        # fail-closed lease renewal during work
│   ├── director-runtime.ts       # bounded Director execution contracts
│   ├── tool-support.ts           # shared native-tool boundary helpers
│   ├── *-tools.ts                # bounded-context tool registrars
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
│   ├── director-state.ts
│   ├── capability-grants.ts
│   ├── control-plane-state.ts
│   ├── audit-log.ts
│   ├── cross-system.ts
│   ├── evidence-graph.ts
│   ├── evidence-store-state.ts
│   ├── resource-value.ts
│   ├── budget-state.ts
│   ├── runtime-scheduler.ts
│   ├── execution-state.ts
│   ├── model-router.ts
│   ├── model-registry-state.ts
│   ├── training-governance.ts
│   ├── training-state.ts
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

- raw-artifact storage/redaction/materialization pipeline behind the governed metadata/lineage layer
- local training/fine-tuning jobs
- benchmark/evaluation executor wired to real model artifacts (the durable evaluation/promotion ledger now exists)
- live model artifact registry and deployment lifecycle
- runtime model-router telemetry
- promoted model artifact
- rollback exercised on a real model release

## What still needs major work

The repository is already beyond a design-only prototype, but major engineering remains:

- bounded multi-process/distributed worker scheduling, crash/restart fault injection and fairness/stagnation policies around the implemented unattended Director wake loop
- checkpoint/recovery across arbitrary active external tool execution, not only Session projection replay and Director child-agent execution
- generalized cross-system tool/evidence dispatch using the shared grants/control plane
- persistent scalable shared Evidence/Knowledge Graph backend beyond the current append-only Session projection
- automatic token/cost/data/human-attention metering plus full per-tool resource-budget enforcement
- provider-secret/configuration layer, live model telemetry, provider health/failover and runtime cost accounting
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

D_AI changes follow the repository engineering operating system:

- [D_AI Engineering Working Agreement](docs/ENGINEERING_WORKING_AGREEMENT.md)
- [ADR 0002 — incremental runtime decomposition](docs/ADRS/0002-runtime-decomposition.md)
- [AGENTS.md](AGENTS.md)

The upstream repository architecture and development notes remain useful while D_AI is being modified:

- [Development guide](docs/development.md)
- [Architecture documentation](docs/architecture.md)
- [AGENTS.md](AGENTS.md)

## License and upstream attribution

The inherited DeepSeek Harness code remains subject to its repository license and third-party notices.

- [MIT License](LICENSE)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

DeepSeek Harness upstream attribution is retained because D_AI is being built from that source base.
