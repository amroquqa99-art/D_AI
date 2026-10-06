# D_AI verification report

Date: 2026-10-06

This document separates **historical verified evidence** from the **current branch checkpoint**. A source file, fixture path or failed CI launch is never promoted to test evidence.

## Current branch checkpoint

- Branch: `dai/v2-core-foundation`
- Development pull request: #15 (draft)
- Recovery verification branch: `dai/v2-native-recovery`
- Latest D_AI check inspected before this documentation update:
  - workflow run `37532703605`
  - job `112505811309`
  - conclusion: FAILURE
  - executed steps: **none** (`steps: []`)

### Interpretation

The current GitHub Actions failure is an **execution/infrastructure blocker**. The job failed before checkout/install/build/typecheck/tests began.

Therefore:

- it is **not** evidence of a D_AI assertion/test failure;
- it is **not** evidence that current branch code passes;
- complete native runtime/build acceptance remains **CI PENDING**, while focused local evidence is recorded below;
- maturity/status must not be promoted on the basis of source presence alone.

## Focused local verification — 2026-10-06

Source was materialized from the active branch through the authenticated repository connector. The verification environment uses Node `24.19.0`, Vitest `4.1.8`, TypeScript `6.0.3`, Zod `4.4.3` and Node types `22.20.0`. These verification dependencies were installed separately with exact versions; this was not a frozen-lockfile workspace installation.

The isolated Vitest configuration uses forked workers, an ES2024/Bundler transform configuration, and source aliases to the repository's actual vendored Schemastery/Cosmokit implementations. No D_AI logic or assertions were replaced. At that earlier heartbeat-only checkpoint, the original monorepo Vitest configuration, native addon, Loader/AgentLoop integration and full project-reference build were not exercised. The subsequent native checkpoint below extends this evidence.

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

These receipts verify the tested helpers and deterministic projection logic. They do not verify native Session persistence, real-provider execution, arbitrary tool recovery, production unattended scheduling, or a production release. The native checkpoint below extends coverage to Session persistence and bounded Director restart recovery. Full workspace acceptance and unattended scheduling within the native turn/ownership model remain required. No Session schemas, tool schemas, grants or public exports changed in that heartbeat-only repair.

## Native integration checkpoint — 2026-10-06

The recovery verification branch is based on development commit `ef77475f18f7c65af7e605f3eed7581544036444`, preserving concurrent scheduler work through that checkpoint. The subsequent isolated runner uses the repository's actual `standardDecoratorPlugin`, source aliases derived from its TypeScript paths, native Loader/AgentLoop/Session services, JSONL persistence and the unchanged C flock addon compiled by the repository build script. Model and public web adapters remain explicitly scripted fixtures. No native service behavior or D_AI assertions were replaced. The full monorepo Vitest configuration and frozen-lockfile workspace installation were not used.

| Executed check | Result |
|---|---|
| Complete D_AI package suite | PASS; 41 files, 157 tests |
| New recovery/cancellation regressions against previous runtime | 4 FAIL / 1 PASS; four runtime defects reproduced |
| Same five regressions against fixed runtime | PASS, included in the complete suite |
| Scheduled-cycle undefined rejection against previous schedule runtime | FAIL; arbitrary rejection was falsely reported as IDLE |
| Schedule restart/native wake and arbitrary-rejection regressions | PASS; included in the complete suite |
| Native addon build from unchanged repository C source | PASS; host Linux x64 glibc addon |
| Persistence catalog freshness | PASS; all 17 D_AI event roots present |
| Persistence acknowledgement history | PASS; 79 roots match 9 records |
| Generated schema comparison with previous branch catalog | 11 D_AI roots added; no roots removed; no existing root digests changed |
| Scoped D_AI source and nine touched package-test compiler diagnostics | Zero D_AI diagnostics; 124 upstream diagnostics remain in this partial workspace |
| Standalone strict checks for audit, resource, routing and evidence primitives | PASS |
| Aggregate `doc-sync` gate | BLOCKED before gate execution; partial checkout lacks `scripts/client-build-environment.ts` |

The restart test releases the original native Session, advances only the Date clock past lease expiry, reopens persisted state and executes a bounded Director cycle. The recovered task completes under fence 2, its checkpoint retains that fence, and both lease generations are released. Another test proves that expiry releases a human-wait lease without making the task runnable. Pre-cancelled single-task execution leaves the task PENDING without acquiring a lease. Retry exhaustion remains terminal, while an injected native Session flush failure propagates its original error instead of reporting successful exhaustion.

During verification, the remote branch added durable schedules and an opt-in wake loop. These changes were merged before retesting. A direct `MessageSourceMap` augmentation targeted the wrong module and broke source annotations; a new semantic source kind also violated the accepted v4 baseline. Scheduler wakes now use the existing Harness `schedule` source with validated D_AI routing JSON in content, preserving every existing root digest. Native restart/wake tests verify a durable approved schedule, duplicate-scan suppression, task completion and persisted cycle receipt. A stale due token is rejected without changing the schedule ledger. A separate negative control reproduces swallowed `undefined` rejection; the fix tracks failure independently from its value. The native pre-step hook consumes scheduler content before a root model request. The new schedule test files and two schedule tools are included in the complete package check.

The catalog correction fixes native replay refusal for previously unregistered Task Ledger, Director and shared-platform facts. The acknowledgement records all 17 D_AI event contracts; existing event, envelope and header digests remain unchanged. Readonly collection and optional-field type alignment fixes current D_AI compiler diagnostics without changing existing persisted payloads, native tool schemas or approval defaults. The concurrently added schedule APIs require native human approval and remain opt-in by default. Two stale assertions were corrected to match existing retry accounting and the Investor-only prohibition on capital execution.

Exact native checkpoint commands, run from the materialized source directory:

```sh
NODE_HEADERS_DIR=../verification/node_modules/node-api-headers/include node native/system/scripts/build.ts --host-addon-only
../verification/node_modules/.bin/vitest run --config ../verification/vitest.native.config.mts packages/experimental/d-ai/tests
node --import tsx/esm scripts/gen-persistence-catalog.ts --check
node --import tsx/esm scripts/persistence-changes.ts --check --json
node ../verification/typecheck-dai.mjs
../verification/node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --target ES2024 --module NodeNext --moduleResolution NodeNext --types node packages/experimental/d-ai/src/audit-log.ts packages/experimental/d-ai/src/model-router.ts packages/experimental/d-ai/src/resource-value.ts packages/experimental/d-ai/src/evidence-graph.ts
```

The scoped diagnostic command is not a successful full TypeScript build: its complete output still contains upstream errors from the partially restored workspace. Full frozen-lockfile installation, project-reference compilation, aggregate documentation checks and CI execution remain acceptance work. Normal Session restart and an injected flush failure are covered; process-crash fault injection, live providers and cold-session activation and production worker stress remain unverified.

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

## Current branch implementation with local fixture verification

The active branch now contains substantially more runtime code than the verified 2026-10-04 baseline. These items are **implemented/integrated and covered by the passing local package suite; full workspace and CI acceptance remain pending**:

- six native domain slices: Investigation, Scientific Research, Investor, Cybersecurity, Operations & Intelligence, Innovation & Discovery;
- durable Task DAG / Task Ledger;
- Mission Director plans, isolated planner, single-task/bounded-cycle execution and approved durable schedules whose process coordinator enqueues native wakes while durable mutation occurs inside an owned turn;
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

The branch includes an integration characterization test that expects exactly **77 unique `d_ai_*` native tools**, including the bounded `d_ai_director_execute_cycle` and approved schedule read/set surfaces. Native integration tests cover Director cycles, cross-system policy blocking, scoped wall-clock metering and Session restart. Those integration tests now pass in the native checkpoint below. Unit/projection coverage also passes for heartbeat behavior, budget admission, monotonic lease fences, execution v1→v2 normalization, side-effect journal lifecycle and replay suppression. Approved schedule projection/admission and restart/wake tests also pass. Scripted providers do not replace live-provider acceptance.

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
- multi-process/distributed worker infrastructure and scheduler crash/fault-injection acceptance; loaded-owner single-process restart/wake fixture integration passes;
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
