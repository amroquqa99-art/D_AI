# D_AI verification report

Date: 2026-10-06

This document separates **historical verified evidence** from the **current branch checkpoint**. A source file, fixture path or failed CI launch is never promoted to test evidence.

## Current branch checkpoint

- Branch: `dai/v2-core-foundation`
- Pull request: #15 (draft)
- Current checkpoint head when this report was updated: `78a12ff3eb646e8735bc1cc3b519941284abf08a`
- Latest D_AI check observed before this documentation commit:
  - workflow run `37457295066`
  - head `0075ee1b0eabe138a0c2b73fd5f32d18d57da4c3`
  - job `112247906618`
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
- Mission Director plans, isolated planner and single-task executor path;
- durable execution leases/checkpoints/expired-lease recovery;
- scoped budgets and scheduler admission;
- durable grants, human approval and append-only audit chain;
- persisted grant-backed cross-system handoff;
- shared evidence/knowledge graph persistence;
- model registry and routing policies;
- training-governance metadata/dataset lineage;
- model evaluation/promotion/rollback records;
- Local Intelligence Core governance foundation;
- consolidated platform snapshot;
- runtime decomposition into configuration, projection registry, public API and bounded-context tool registrars.

### Characterization added during decomposition

The branch now includes an integration characterization test that expects exactly **74 unique `d_ai_*` native tools** after tool-registration extraction. This test exists in source but has **not run successfully on the current checkpoint because Actions does not reach test execution**.

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
- production long-running worker infrastructure.

Fixture or mock execution is labeled as such and does not satisfy live-provider acceptance.

## Verification policy

For current development, a feature is not marked VERIFIED merely because:

- source code exists;
- a schema validates;
- a fixture test was written but not executed;
- an Action workflow failed before steps;
- an LLM produced a plausible result.

Verification requires the appropriate executable gate and, where the acceptance matrix demands it, live-provider or browser proof.
