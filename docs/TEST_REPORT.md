# D_AI verification report

Date: 2026-10-07

This document separates **historical verified evidence** from the **current branch checkpoint**. A source file, fixture path or failed CI launch is never promoted to test evidence.

## Adviser context ablation checkpoint — 2026-10-07

The executor's delegated-permission snapshot caused several recorded recommendations to reason about the adviser's own lack of tools instead of the supplied task. The adviser now defaults `includeExecutionContext` to false. Its native pre-step listener removes that child's prepared executor snapshots before message admission and suppresses future runtime contributions in that child's scope. The owner and unrelated workers retain their context. A provider without an in-process native child is rejected and its run disposed; inference may still use an explicitly configured remote model endpoint. The native tool executor still rejects a scripted child tool attempt; output validation, confidence threshold, one-request budget and authority limits are unchanged.

The [baseline receipt](../packages/experimental/d-ai/tests/fixtures/qwen35-2b-context-baseline.receipt.json) and [isolated-context receipt](../packages/experimental/d-ai/tests/fixtures/qwen35-2b-context-isolated.receipt.json) contain two fresh runs of the same hash-verified Qwen3.5-2B artifact and server binary. All sixteen paired canonical requests have identical instruction, task data, tool catalog and output cap; the baseline alone includes the executor-context message. Dataset, instruction, model, binary, CPU context window and thread settings match. Each case issues one request and finishes with `stop`; neither run has a native tool error. The original smoke scenario also passes in both runs. Expected labels remain outside model input.

| Development measurement | Executor-context baseline | Isolated adviser |
|---|---:|---:|
| Native advisory validation accepts | 7/16 | 13/16 |
| Accepted expected next action | 3/16 | 12/16 |
| English expected next action | 2/8 | 7/8 |
| Arabic expected next action | 1/8 | 5/8 |
| Uncached input tokens | 3,794 | 2,450 |
| Cache-read tokens | 3,264 | 3,264 |
| Output tokens | 1,908 | 1,511 |
| Reported aggregate tokens | 8,966 | 7,225 |
| Median complete native context bytes | 3,031 | 2,037 |
| Median native advice elapsed time | 9.58 s | 6.42 s |

Promptfoo 0.124.0 independently replays both native receipts: baseline 3 pass / 13 fail, isolated 12 pass / 4 fail, zero evaluator errors in either run. Both exit with code 100 because remaining assertions fail. Reported aggregate tokens decrease by 19.4%. Native elapsed ranges are 6.45–12.08 seconds and 5.22–9.84 seconds respectively; timing includes scripted-parent/Session/tool overhead and is not an isolated performance benchmark. Peak RAM and GPU memory remain unmeasured.

The three rejected isolated responses put explanatory sentences in `evidence_refs`: both owner-input cases and the Arabic external-dependency case. The Arabic collection case passes JSON validation but selects `VERIFY` instead of the expected `EXPLORE`. These failures are retained; reference strings are not clipped or repaired. The 12/16 result measures accepted next-action selection on published development examples, not rationale correctness, calibrated confidence, held-out quality or full mission performance. No model adoption, registry promotion, training or cloud deployment occurs.

Version 2 receipts bind explicit adviser settings, canonical model-visible messages/tool schemas/output cap and request hashes; they preserve actual complete-context byte counts. The reader rejects mismatched configuration hashes, mismatched input hashes and missing request metadata. Failures before inference retain empty request metadata and cannot pass grading. Version 1 recordings remain readable and unchanged. Promptfoo metadata distinguishes receipt versions and context modes.

| Executed check | Result and scope |
|---|---|
| Before-fix native context regression | FAIL as intended; the child receives the delegated executor warning |
| Native D_AI plus context/admission/scoped-prompt tests | PASS; 250 tests in 49 files, one opt-in live test skipped without explicit model inputs |
| Final adviser/receipt regressions | PASS; 26 tests, including scoped Session admission, unrelated-child context, denied tool execution and remote-run disposal |
| Frozen-lockfile install and full workspace build | PASS; native addon, Host/Client libraries, desktop bundle and frontend; 357 client artifacts recorded |
| Published declaration consumers | PASS; 330 workspace declaration APIs compile under NodeNext |
| Public built adviser Loader smoke | PASS; real built plugin, native child, persisted result and disposal; inference scripted |
| Two real native recordings | PASS; original smoke plus sixteen real CPU cases per run, all outcomes retained |
| TypeScript declaration correction | PASS in owning project build; the native public entry retains the existing `runtime-context` source augmentation for built consumers |
| Configuration ownership and dependency rules | PASS; 219 configs and 75 checked packages; dependency/module/config catalogs current |
| Persistence catalog | PASS; existing catalog remains current, no new Session event generation |
| Documentation aggregates and full-lint entry | Startup blocked by the existing tsx IPC `listen EPERM`; changed-code and paired-document checks run directly |
| Changed-code lint, four bilingual pairs and Markdown links | PASS; relative links across 1,731 files resolve |
| Documentation corpus debt | Five existing locale README hard-wrap violations and unchanged root `AGENTS.md` at 1,983 words against a 1,960-word ceiling; changed architecture is within its ceiling |

The first broad test run inherited `NODE_USE_ENV_PROXY=1`: four SearXNG HTTP fixtures timed out while 245 other tests passed. The same search file passes all ten cases with only that flag removed; the complete selected native set then passes 249 tests with one opt-in skip. No timeout, assertion or implementation is weakened. Initial workspace compilation also rejected the missing published message-source augmentation; its retained type export repairs the built consumer without altering emitted runtime behavior.

Reproduction uses [the local guide](user/d-ai-local.md): record to separate new paths with `D_AI_EVAL_INCLUDE_EXECUTION_CONTEXT=true` and `false`, then replay each receipt. Current checkpoint review remains draft and unmerged on PR #18. Last inspected CI before this publication is run `37686016676`, job `113013905410`: failure with `steps: null` and unavailable runner rejection reason. Current outgoing CI, full live missions, held-out selection, live search engines and cloud/Control Center acceptance remain separate work.

## Native decision evaluation checkpoint — 2026-10-07

The source tree was restored byte-for-byte from the previously published checkpoint before implementation. The adviser instruction and input/output schemas now have one module shared by native inference and the receipt grader; model-facing instructions are unchanged. Sixteen published development cases cover eight Arabic/English pairs: evidence collection, unverified claims, owner input, external dependencies, explicit stop, missing capability, source injection and conflicting sources. Labels remain outside model input.

| Executed check | Result and scope |
|---|---|
| Frozen installation + full workspace build | PASS; native addon, Host/Client libraries, desktop bundle and web frontend |
| D_AI and complete pi-ai test directories | PASS; 553 tests in 61 files; one opt-in live test skipped without model inputs |
| Local adviser and receipt/replay regressions | PASS; 21 keyless tests; 11 evaluation tests rerun after diagnostic schema changes |
| Native GGUF decision recording | PASS as a recording fixture; original smoke check plus 16 real CPU inference cases, no assertion that every candidate answer is correct |
| Promptfoo 0.124.0 replay | Candidate FAIL; 3/16 cases pass all assertions, 13 fail, 0 evaluator errors; expected exit 100 |
| Changed source/test scoped lint | PASS; six affected source/test/helper modules |
| Changed guide/integration translation pairs + Markdown links | PASS; two pairs consistent and 1,731 files have valid relative links |
| Documentation aggregates / full lint entry | BLOCKED at startup by tsx IPC `listen EPERM`; direct scoped checks run without that CLI |
| Export JSDoc / prose-wrap corpus | Existing debt remains: 740 JSDoc violations, none in the new adviser schema; five hard-wrap violations in the existing D_AI locale README |

The final [native receipt](../packages/experimental/d-ai/tests/fixtures/qwen35-2b-development.receipt.json) records all sixteen completed model responses. Native advisory validation accepts 7/16; four accepted recommendations select the wrong expected action, while nine responses fail native acceptance. End-to-end case success is 3/16 (18.75%): English 2/8, Arabic 1/8. No response verifies evidence, changes task state or authorizes an action. This candidate/runtime configuration is not accepted for decision adoption; no registry promotion, training or cloud deployment is performed.

The final run reports 3,794 uncached input tokens, 3,264 cache-read tokens and 1,908 output tokens (8,966 aggregate tokens). Native advice elapsed time, including scripted-parent/Session/tool overhead, ranges from 5.10 to 8.32 seconds with median 6.41 seconds; Promptfoo replay duration is not inference time. Server peak RSS is unavailable because the process-status path is inaccessible in this environment; no RAM/VRAM result is invented. Timing is environment-specific, not a user-device benchmark.

The first full recording attempt reached all cases but failed to save because optional Linux `/proc` telemetry was unavailable. The fixture now omits that unavailable counter while preserving unexpected I/O failures. Teardown awaits child exit and removes its private root even on disposal/startup failure; a missing-server negative control fails with ENOENT in 114 ms and leaves no fixture root. A subsequent [initial completed receipt](../packages/experimental/d-ai/tests/fixtures/qwen35-2b-initial.receipt.json) had two native runtime errors without raw text; a diagnostic rerun captured finish reasons and cache counters, completed all sixteen with `stop`, and retained the same 3/16 action result. The earlier runtime-error cause is unresolved and is not silently reclassified as a model response. This is development evidence with published labels, not a held-out evaluation or calibrated accuracy estimate.

Promptfoo is reused only for replay/assertions/export. It invokes no model or paid judge; the native Harness still owns inference, Session records and tool/permission semantics. Receipt loading rejects stale dataset/prompt hashes, unknown, missing or duplicate cases and malformed fields. Grading rejects a mismatched raw/native recommendation or confidence below the fixture’s explicit 0.7 threshold. Rejected native fallback advice cannot masquerade as accepted model output. [The local guide](user/d-ai-local.md) owns reproduction commands. GitHub CI remains a separate required check.

## Local inference/open-source checkpoint — 2026-10-07

The complete workspace was restored from the verified native snapshot, preserving its exact Git tree, and installed using `pnpm install --frozen-lockfile`. This supersedes the earlier partially restored/noEmit workspace limitation below. The current changes are reviewed on `dai/local-intelligence-20261007`; old evidence remains historical.

| Executed check | Result and scope |
|---|---|
| Frozen-lockfile installation | PASS; complete workspace dependencies |
| Full `pnpm run build` | PASS; native addon, host/client libraries, desktop bundle and web frontend |
| Native D_AI + pi-ai tests | PASS; 193 D_AI fixture tests in 45 files plus 57 adapter/context tests in two files; live test skipped unless its explicit inputs are provided |
| Opt-in real local acceptance | PASS; one CPU Qwen3.5-2B GGUF scenario, real llama.cpp HTTP inference, native PiAiAdapter, isolated child and durable tool result; parent model is explicitly scripted |
| Source CLI + D_AI/local overlay | PASS; real Loader boot and authenticated loopback HTTP 200 serving 35,912 HTML bytes; no inference requested in this boot check |
| New source/test scoped lint | PASS; local adviser, search and their tests plus context regression |
| Changed README pairs and three new guide/decision pairs | PASS; source/translation manifests refreshed and checked |
| Relative Markdown links | PASS; 1,731 files checked with the new translated companions |
| Aggregate `pnpm run doc-sync` | BLOCKED before gates by `tsx` IPC `listen EPERM`; no aggregate pass claimed |
| Corpus-wide translation pairing | FAIL; pre-existing D_AI documents lack counterparts, including product specification, feature matrix and verification report; new three document pairs pass independently |
| Persistence catalog/history | PASS; unchanged event schema, no new D_AI persistence generation |
| Configuration ownership/schema, package paths, runtime closure, dependency catalog | PASS; endpoints explicit, credentials resolved through native service; 219 configuration files and 185-package runtime closure |
| Module graph | Regenerated for D_AI packages; freshness and existing translated pair PASS |
| Workspace lint | Incomplete; process killed with exit 137 before a report. Focused new-source/test lint passes; no full lint pass claimed |
| Export JSDoc completeness | FAIL; 740 pre-existing violations in D_AI source; none in the new local/search modules |

The adviser recommends `VERIFY` with confidence at least 0.7 for a supplied unverified observation. The assertion requires advisory=true, verified=false and forbids references outside the supplied set. Empty references are valid. The response is not fact verification. Earlier 0.8B output failed the response contract; early 2B output invented reference strings and was rejected. More explicit field guidance enabled the accepted 2B output. This single prompt is not a held-out benchmark, production promotion or proof that 2B is the best model.

The pi-ai pinned SDK reserved 4096 tokens for every request, leaving 4096-context routes with a wire output cap of one. A regression reproduced the fault before the fix; the patch scales the reserve to `min(4096, floor(contextWindow / 8))`, retaining the prior reserve for large contexts. A separate full-build failure was repaired by pinning the native Stagehand bridge to the SDK's exact Zod 4.4.3, preserving its schema type boundary.

The test artifact is the community quantization `bartowski/Qwen_Qwen3.5-2B-GGUF`, revision `7d26695454df6de5fbcce2e58681e62dae06ce43`, file `Qwen_Qwen3.5-2B-Q4_K_M.gguf`, 1,396,198,496 bytes, SHA-256 `57a1085840f497d764a7fc5d346922dbde961efb54cc792ea81d694fd846a1d8`. Its upstream base is [Qwen/Qwen3.5-2B](https://huggingface.co/Qwen/Qwen3.5-2B), Apache-2.0. llama.cpp source revision is `36a73916ee0cb3b457f356066afabd47cce68884`. CPU-only invocation uses context 4096, four threads, one slot, disabled reasoning, temperature zero and an ephemeral loopback port. No GPU/VRAM measurements were possible in this environment; user-device performance remains unmeasured.

SearXNG tests use real bounded HTTP fixtures for normal/error/redirect/malformed/oversized/cancelled responses. No live SearXNG engine result is claimed. Existing upstream Actions copies now retain inert, always-skipped manual stubs and archived originals; automatic upstream release/update triggers are disabled. D_AI checks cover `dai/**`, full workspace build and relevant adapter regressions. This changes configuration, not evidence that GitHub's previous before-step failure is resolved.

Reproduce fixture checks with the repository Vitest configuration. Reproduce local model acceptance with the three explicit environment variables documented in [the local guide](user/d-ai-local.md). Official Node headers were hash-verified for the addon build; the environment required `NODE_HEADERS_DIR` to name the installed header directory. The fixture environment removes `NODE_USE_ENV_PROXY` for local HTTP tests because a pre-existing environment proxy otherwise routes loopback requests away from their fixture server.

Remaining acceptance: GitHub CI, full user-driven local mission, local GPU/memory benchmarks, held-out model evaluation and promotion, live search/scholarly/market/defensive connectors, cloud deployment, offline distribution, distributed workers and D_AI Control Center UI. The historical CI failure below is not a current-code test failure and has not been shown fixed.

## Historical core-foundation branch checkpoint

- Branch: `dai/v2-core-foundation`
- Pull request: #15 (draft)
- Latest D_AI check inspected before this documentation update:
  - workflow run `37535776100`
  - job `112516177529`
  - conclusion: FAILURE
  - executed steps: **none** (`steps: null`)
  - runner rejection reason: unavailable through the connected API

### Interpretation

The current GitHub Actions failure is an **execution/infrastructure blocker**. The job failed before checkout/install/build/typecheck/tests began.

Therefore:

- it is **not** evidence of a D_AI assertion/test failure;
- it is **not** evidence that current branch code passes;
- complete native runtime/build acceptance remains **CI PENDING**, while focused local evidence is recorded below;
- maturity/status must not be promoted on the basis of source presence alone.

## Native local checkpoint — 2026-10-07

The initial inspected source head was `7a98345b5f2505a17169a1b9fbbec605354e86a1`; the verified outgoing snapshot also incorporates concurrent changes through `7cdfbbce861fed1a184de47e185aaca876b9e6dc`. Before repairs, its scoped native package run passed 157 tests and failed six: two stale assertions, two incorrect scheduler event assertions, an architecture ordering assertion and a parallel-provider fixture that inspected escaped prompt text. Restored native recovery regressions separately reproduced unsafe human-wait resumption, pre-cancelled task claiming, swallowed storage failure and swallowed `undefined` rejection. An added shutdown regression failed before cancellation was wired into active scheduler cycles.

Concurrent changes added per-worker holder identities and guardrail/reset projection tests. Three-way reconciliation retained those changes; local compiler checks also identified and repaired a missing comma and an inferred SessionId-only holder argument in the concurrent patch.

After reconciliation, repairs and the added acceptance cases, **all 173 tests in 43 package files pass** with native AgentLoop, Loader, JSONL Session storage, file locking and the compiled system addon. Model and web boundaries remain scripted fixtures. Scheduler shutdown aborts active cycles and awaits cleanup; subsequent scans enqueue no work. Independent exact-task workers overlap under a promise barrier and both leases/checkpoints settle. A native Session restart retains human requirements and recovers expired running work into a new fence. Logical admission over 1,000 tasks respects the eight-task batch limit, dependencies and human-wait state; this is not 1,000 live worker execution.

Scoped TypeScript checking includes every D_AI source and test file and reports **zero D_AI diagnostics**. The partially restored upstream workspace still reports 124 diagnostics, so this is not a successful full project-reference build. The checker uses the original strict host configuration and noEmit, with unused-identifier checks disabled; aggregate lint remains pending.

The regenerated catalog covers all 17 D_AI event roots. A successor acknowledgement records five optional schedule fields while preserving the v1 cycle-outcome union. Legacy schedules normalize missing parallelism to one and guardrails/counters to zero. All other root digests remain unchanged. History verification reports 79 roots and ten records; previous snapshots are retained.

Executed commands from the materialized source directory:

```sh
../verification/node_modules/.bin/vitest run --config ../verification/vitest.native.config.mts packages/experimental/d-ai/tests
node ../verification/typecheck-dai.mjs
node --import tsx/esm scripts/gen-persistence-catalog.ts --check
node --import tsx/esm scripts/persistence-changes.ts --check --json
git diff --check
```

The isolated runner uses the repository's real vendored implementations and package source aliases. Native system compilation was completed in the earlier local preparation, and native integration now executes against that binary. This checkpoint did not reinstall the full workspace from its lockfile or rebuild every package. Cold-session activation, cross-owner starvation, multi-process crash injection, live providers, production connectors and browser UI remain unverified. PR #15 remains draft and unmerged; its inspected mergeability was false. This verified snapshot is published separately to avoid overwriting continued changes on its branch; the review compares against the same feature branch.

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

The earlier receipts below verify the pre-scheduler tested helpers and deterministic projection logic. They do not verify the newly added unattended scheduler, native Session persistence at that earlier checkpoint, real-provider execution, arbitrary tool recovery, or a production release. Since that receipt, scheduler state, tool schemas, public exports and runtime wiring changed; dedicated projection, wake-admission, hand-built integration and REAL Loader-composition tests were authored and now pass locally at the newer native checkpoint above; CI remains blocked.

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

The branch includes an integration characterization test that expects exactly **77 unique `d_ai_*` native tools**, including bounded Director cycle execution plus unattended schedule read/set surfaces. Native integration tests cover Director cycles, cross-system policy blocking, scoped wall-clock metering and Session restart. New scheduler/parallelism coverage additionally includes schedule-projection invariants, due/runnable admission, expired-lease wake recovery, approval denial, no-parent-LLM scheduler turns, fair ordering, bounded concurrent-cycle admission, budget-safe wave planning, a barrier-based runtime proof that two same-plan child executors overlap, partial-failure accounting, explicit stagnation counter/reset invariants, wake suppression at configured failure/idle limits, restart replay, and a Loader-composed runtime path. Those new tests are authored and remain pending execution. The focused local receipt above covers unit/projection tests for heartbeat behavior, budget admission, monotonic lease fences, execution v1→v2 normalization, side-effect journal lifecycle and replay suppression; it does not replace native integration evidence.

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
