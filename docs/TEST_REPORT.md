# D_AI verification report

Date: 2026-10-06

This document separates **historical verified evidence** from the **current branch checkpoint**. A source file, fixture path or failed CI launch is never promoted to test evidence.

## Current branch checkpoint

- Branch: `dai/v2-core-foundation`
- Pull request: #15 (draft)
- Current checkpoint head when this report was updated: `2b02af66dfcbdfc5f5db18178f92e978e3fe7d9f`
- Latest D_AI check observed before this documentation commit:
  - workflow run `37473988812`
  - head `2b02af66dfcbdfc5f5db18178f92e978e3fe7d9f`
  - job `112304493986`
  - conclusion: FAILURE
  - executed steps: **none** (`steps: []`)

### Interpretation

The current GitHub Actions failure is an **execution/infrastructure blocker**. The job failed before checkout/install/build/typecheck/tests began.

Therefore:

- it is **not** evidence of a D_AI assertion/test failure;
- it is **not** evidence that current branch code passes;
- every change since the last verified baseline remains **CI PENDING**;
- maturity/status must not be promoted on the basis of source presence alone.

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
- Mission Director plans, isolated planner, single-task execution and bounded multi-task execution cycles;
- durable execution leases/checkpoints/expired-lease recovery plus fail-closed heartbeat renewal during Director work;
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

The branch now includes an integration characterization test that expects exactly **75 unique `d_ai_*` native tools**, including the bounded `d_ai_director_execute_cycle` surface. Additional source tests cover lease-heartbeat failure/renewal behavior, Director execution-cycle limits, cross-system policy blocking, task/mission/system wall-clock metering, shared budget-scope selection and exact budget exhaustion. These tests exist in source but have **not run successfully on the current checkpoint because Actions does not reach test execution**.

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
- production unattended long-running worker infrastructure;
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
