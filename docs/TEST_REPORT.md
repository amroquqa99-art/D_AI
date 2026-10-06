# D_AI verification report

Date: 2026-10-07

This document separates **historical verified evidence** from the **current branch checkpoint**. A source file, fixture path or failed CI launch is never promoted to test evidence.

## Current branch checkpoint

- Branch: `dai/v2-core-foundation`
- Pull request: #15 (draft)
- Latest D_AI check inspected before this documentation update:
  - workflow run `37535402015`
  - job `112514916395`
  - conclusion: FAILURE
  - executed steps: **none** (`steps: null`)
  - job log download: `BlobNotFound`, consistent with the runner never starting

### Interpretation

The current GitHub Actions failure is an **execution/infrastructure blocker**. The job failed before checkout/install/build/typecheck/tests began.

Therefore:

- it is **not** evidence of a D_AI assertion/test failure;
- it is **not** evidence that current branch code passes;
- complete native runtime/build acceptance remains **CI PENDING**, while focused local evidence is recorded below;
- maturity/status must not be promoted on the basis of source presence alone.

## Focused local verification — 2026-10-06

Source was materialized from the active branch through the authenticated repository connector. The verification environment uses Node `24.19.0`, Vitest `4.1.8`, TypeScript `6.0.3`, Zod `4.4.3` and Node types `22.20.0`. These verification dependencies were installed separately with exact versions; this was not a frozen-lockfile workspace installation.

The isolated Vitest configuration uses forked workers, an ES2024/Bundler transform configuration, and source aliases to the repository's actual vendored Schemastery/Cosmokit implementations. No D_AI logic or assertions were replaced. The original monorepo Vitest configuration, native addon, Loader/AgentLoop integration and full project-reference build were not exercised.

| Executed check | Result |
|---|---|
| Lease-heartbeat regression suite against the previous helper | 5 FAIL / 5 PASS; five defects reproduced before the fix |
| Lease-heartbeat regression suite against the fixed helper | PASS; 10 tests |
| Focused D_AI unit/projection suite | PASS; 21 files, 86 tests |
| Strict TypeScript check of `src/lease-heartbeat.ts` | PASS |
| Strict TypeScript check of `tests/lease-heartbeat.spec.ts` and its helper import | PASS; dependency declarations use the repository's `skipLibCheck` policy |
| `git diff --check` | PASS |

The selected specs are `architecture`, `audit-log`, `capability-grants`, `config`, `cross-system`, `durable-core`, `evidence-graph`, `execution-fencing`, `execution-state`, `lease-heartbeat`, `mission-director`, `model-evaluation`, `model-router`, `resource-value`, `runtime-scheduler`, `side-effect-gateway`, `side-effect-runtime`, `side-effect-state`, `systems`, `task-dag` and `training-governance`, each under `packages/experimental/d-ai/tests/` with the `.spec.ts` suffix.

Exact local commands, run from the materialized D_AI source directory:

```sh
../verification/node_modules/.bin/vitest run --config ../verification/vitest.config.mts packages/experimental/d-ai/tests/lease-heartbeat.spec.ts
../verification/node_modules/.bin/vitest run --config ../verification/vitest.config.mts $(cat ../verification/pure-tests.txt)
../verification/node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --target ES2024 --module NodeNext --moduleResolution NodeNext --types node packages/experimental/d-ai/src/lease-heartbeat.ts
../verification/node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --allowImportingTsExtensions --target ES2024 --module NodeNext --moduleResolution NodeNext --types node packages/experimental/d-ai/tests/lease-heartbeat.spec.ts
git diff --check
```

The renewal/cleanup races use promise barriers and observed abort signals rather than fixed sleeps. The old helper incorrectly returned success when renewal failed or the caller cancelled during cleanup, invoked work cancelled before deferred startup, lost an `undefined` rejection, and rejected valid short leases because of its default renewal interval. The fix preserves those failures and still waits for both worker and renewal quiescence.

These receipts verify the pre-scheduler tested helpers and deterministic projection logic. They do not verify the newly added unattended scheduler, current native Session persistence, real-provider execution, arbitrary tool recovery, or a production release. Since that receipt, scheduler state, tool schemas, public exports and runtime wiring changed; dedicated projection, wake-admission, hand-built integration and REAL Loader-composition tests were authored but have not executed under the blocked current gate.

## Last verified baseline — 2026-10-04

These commands/results were actually obtained in the independent D_AI checkout at that earlier checkpoint:

| Command / check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm dsh --profile web --dump-config` | PASS |
| Native addon build with `NODE_HEADERS_DIR=/tmp/d-ai-node-headers/node-v24.19.0/include/node` | PASS; `native/system/packages/linux-x64/bin/glibc/system.node` produced |
| Selected upstream Vitest suite after native build | PASS; 9 files, 220 tests |
| `node_modules/.bin/vitest run packages/experimental/d-ai/tests/mission.spec.ts packages/experimental/d-ai/tests/orchestration.spec.ts packages/client/d-ai-locale/tests/locale.client.spec.ts` | PASS; 3 files, 15 tests |
| Persistence catalog generation | PASS |
| Full `pnpm run build` with 4 GiB heap | BLOCKED by Node heap exhaustion during host bundling |
| Full `pnpm run build` with 8 GiB heap | PASS |

Those PASS results apply to the code that existed at that checkpoint. They do **not** automatically verify later D_AI v2 additions.

## Behavior verified at the historical baseline

- Native Cordis service composition for the original investigative mission slice.
- Exact live owner identity checks and fail-closed native approval for mission creation.
- Mutation restricted to an open native Agent turn; append-only `d_ai/fact` replay rebuilt mission projection.
- Public HTTP(S) source capture through the native web service, decoded UTF-8 content hashing, retrieval provenance and anchor checks.
- Counterclaims retained; delegated assessments remained unverified.
- Independent child Agents used fresh contexts, bounded requests/tokens/time/output bytes and an enforced native tool allow-list.
- Arabic language registration and reversible RTL/LTR isolation tests.

## Current branch implementation awaiting executable verification

The active branch now contains substantially more runtime code than the verified 2026-10-04 baseline. These items are **implemented/integrated in source but pending a successful current gate**:

- six native domain slices: Investigation, Scientific Research, Investor, Cybersecurity, Operations & Intelligence, Innovation & Discovery;
- durable Task DAG / Task Ledger;
- Mission Director plans, isolated planner, single-task/bounded-cycle execution, approval-gated unattended scheduling, fair/bounded cross-owner wake coordination, exact-task claims and budget-safe same-plan parallel worker waves whose mutations remain inside native Agent turns;
- durable execution leases/checkpoints/expired-lease recovery plus fail-closed heartbeat renewal during Director work;
- monotonic per-task lease fencing: renew/checkpoint/executor state changes/release require exact `taskId + leaseId + fence`; legacy execution facts migrate deterministically from v1 to fenced v2 and ambiguous history fails closed;
- durable external side-effect idempotency journal and connector gateway with safe pre-dispatch rebind, replay suppression after commit, conservative `OUTCOME_UNKNOWN` handling and human reconciliation; no production mutable connector is enabled;
- scoped budgets and scheduler admission, including exact-exhaustion blocking and automatic real wall-clock metering for Director tasks across matching TASK/MISSION/SYSTEM profiles;
- durable grants, human approval and append-only audit chain;
- persisted grant-backed cross-system handoff now enforced directly by Director execution before target-system work starts;
- shared evidence/knowledge graph persistence;
- model registry and routing policies;
- training-governance metadata/dataset lineage;
- model evaluation/promotion/rollback records;
- Local Intelligence Core governance foundation;
- consolidated platform snapshot;
- runtime decomposition into configuration, projection registry, public API and bounded-context tool registrars;
- centralized runtime kernel for owner/open-turn/mutation-order invariants and a typed projection-reader boundary.

### Characterization added during decomposition

The branch includes an integration characterization test that expects exactly **77 unique `d_ai_*` native tools**, including bounded Director cycle execution plus unattended schedule read/set surfaces. Native integration tests cover Director cycles, cross-system policy blocking, scoped wall-clock metering and Session restart. New scheduler/parallelism coverage additionally includes schedule-projection invariants, due/runnable admission, expired-lease wake recovery, approval denial, no-parent-LLM scheduler turns, fair ordering, bounded concurrent-cycle admission, budget-safe wave planning, a barrier-based runtime proof that two same-plan child executors overlap, cycle receipts, partial-failure accounting, restart replay, and a Loader-composed runtime path. Those new tests are authored and remain pending execution. The focused local receipt above covers unit/projection tests for heartbeat behavior, budget admission, monotonic lease fences, execution v1→v2 normalization, side-effect journal lifecycle and replay suppression; it does not replace native integration evidence.

## Current required gate

When Actions execution is restored, the branch must pass at least:

```sh
pnpm install --frozen-lockfile
pnpm run gen-persistence-catalog
pnpm run verify-persistence-catalog
pnpm run build:native-system
pnpm exec tsc -b packages/experimental/d-ai/tsconfig.json --pretty false
pnpm exec vitest run packages/experimental/d-ai/tests
```

A failure must be treated as code/test evidence and fixed before further maturity promotion.

## Live integration truth

### Proven historically

- Harness/Cordis native plugin path.
- Native Session/persistence path for the original investigation slice.
- Fixture-model child-Agent orchestration.
- Fixture/public-source web boundary used by integration tests.

### Not yet live-verified for the current v2 branch

- real LLM provider routing across the six domain roles;
- real financial/scholarly/GIS/institutional connectors;
- real Local Intelligence Core model artifact/training job;
- live browser Control Center;
- institutional multi-user deployment;
- distributed/multi-process unattended worker infrastructure and scheduler crash/fault-injection acceptance; the single-process root-Agent coordinator and same-plan worker waves are implemented but not yet verified by the current gate;
- live token/cost/data-access/human-attention metering (current automatic metering is wall-clock only at the Director task boundary).

Fixture or mock execution is labeled as such and does not satisfy live-provider acceptance.

## Verification policy

For current development, a feature is not marked VERIFIED merely because:

- source code exists;
- a schema validates;
- a fixture test was written but not executed;
- an Action workflow failed before steps;
- an LLM produced a plausible result.

Verification requires the appropriate executable gate and, where the acceptance matrix demands it, live-provider or browser proof.
