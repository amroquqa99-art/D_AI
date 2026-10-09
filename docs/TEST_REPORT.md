# D_AI verification report

Date: 2026-10-10 (Asia/Jerusalem)

## Native artifact checkpoint — 2026-10-10

Source base: PR #23 at `5d66ee733678ed409d4dbfbdacfa9e0538ff9764`; branch `dai/artifact-store-20261010`. The optional public `artifact-store` entry connects native attachment bytes, immutable owner-bound lineage manifests, a durable storage-domain catalog and three logged text tools. Native root/turn authorization is shared with D_AI's runtime kernel. Existing Session formats and event schemas remain unchanged.

| Executed check | Result and scope |
|---|---|
| Native package and generator regression suites | PASS; 243 tests: 228 D_AI tests plus 15 configuration-generator tests; one opt-in live skip. |
| Artifact acceptance | PASS; nine cases cover exact Arabic/UTF-8/BOM output, binary bytes, invalid UTF-8, duplicate receipts at capacity, same-owner parents, foreign/forged owner denial, malformed catalog keys, corrupted native files, manifest disagreement, exact byte limits, complete envelope limits, restart and disposal/drain behavior. |
| Authorization negative control | EXPECTED FAILURE; disabling the owner assertion makes the forged-owner regression fail. Exact source bytes are restored before the final acceptance build. |
| Concurrent artifact isolation | PASS; two independent copies each run all nine cases with private roots and settled teardown. These repetitions add no distinct coverage count. |
| Published built entry | PASS; ordinary package subpath import, built native providers and a scripted model perform a real logged artifact put/read and reject a forged owner. |
| Built coordinator / interruption acceptance | PASS; 15 cases: 12 coordinator checks, two real POSIX SIGKILL boundaries and the public artifact entry smoke. |
| Runner / owner-order checks | PASS; 16 cases, including the updated runner's exact artifact acceptance command. |
| Complete workspace build | PASS; native addon, Host/Client, desktop and frontend on Node 24.19.0 and pnpm 11.7.0 with verified Node headers. Exit status and a fresh 357-file build record are checked; the build-record verifier recomputes all artifact hashes. |
| Public NodeNext declarations | PASS for current exports, including the new artifact subpath. |
| Scoped type-aware lint | PASS for the three production artifact modules and native acceptance spec. |
| Frozen dependency install | PASS offline after adding two existing workspace references; no registry version, dependency snapshot or patch changes. Full offline lock regeneration lacks cached LibreOffice metadata, so only the two exact native workspace links are recorded and checked by frozen install. |
| Configuration / persistence / module / notices checks | PASS; native Cordis configuration includes the opt-in source patch; module catalogs are regenerated. No Session persistence artifact changes. |
| Documentation checks | PASS through direct ESM pair, formatting and link verifiers. Aggregate `doc-sync`, legacy JSDoc and standing-order budget limitations remain described in the preceding checkpoint. |
| GitHub / Docker / live acceptance | The PR #24 workflow `38000791898` failed before steps in both jobs (`114058075947`, `114058076182`); steps and logs are unavailable. No Docker-host or live-provider acceptance is inferred from local fixtures. |

[The artifact receipt](../docker/verification/artifacts-20261010.json) binds current source and logs. There are 274 distinct passing checks and one opt-in skip across the reported suites. Model responses are scripted; native storage, ownership, replay and process termination are actual. HTTP fixture tests require `NODE_USE_ENV_PROXY=0`; the ordinary build uses its configured 4 GiB compiler heap and an explicit verified header directory on this host. Initial invocations without those host settings failed and are not acceptance evidence.

Artifact durability requires backing up both the catalog backend and attachment files. Catalog publication is not atomic with tool-result publication; retries preserve the same immutable receipt. Failed/interrupted saves can leave unreachable files. The store does not implement organizational accounts, multi-host catalog coordination, export/import, retention, delta storage or automatic experiment/dataset curation. These results do not finish the full product or establish power-loss acceptance.

## Task claim durability checkpoint — 2026-10-10

Source base: PR #22 at `d3d76718a70a9afd46d9975615a2dd5b09f49e39`; current branch `dai/crash-claim-order-20261010`. New claims persist and flush their execution lease before persisting RUNNING, and launch a worker only after both operations succeed. Every new-claim crash prefix has either runnable work, runnable work with a recoverable lease, or running work with that lease. Cold eligibility waits for the latest unreleased lease generation of the selected task, including READY tasks, so early wake attempts cannot exhaust schedule failure limits before expiry. Old ambiguous RUNNING records without leases are not silently reinterpreted.

| Executed check | Result and scope |
|---|---|
| Native package suite | PASS; 219 tests, one opt-in live skip. Existing claim, fencing, retry, approval, budget, side-effect, replay and Loader recovery paths retain acceptance. |
| Complete workspace build | PASS; native addon, Host/Client, desktop and frontend, using the same pinned toolchain and verified headers. |
| Built coordinator and process acceptance | PASS; 14 tests, including both POSIX SIGKILL boundaries. |
| Running-worker interruption | PASS; initial task RUNNING, fence 1 and five fixture model requests; restart completes under fence 2 with both leases released and one new scripted model request. |
| Claim-gap interruption | PASS; readiness is emitted only after the native flush of fence 1 while the task remains READY and the worker has not requested inference (four setup requests). SIGKILL occurs at this barrier. The fresh process waits for lease expiry, completes under fence 2, retains both released leases and exits normally. |
| Old-order negative control | EXPECTED FAILURE; against the preceding built source, the new claim-gap test receives worker-running readiness rather than lease-before-RUNNING readiness. The normal implementation change makes the exact same assertion pass. |
| Concurrent process isolation | PASS; two independent copies each execute both interruption cases using private temporary roots and drained child teardown. Repetition is not extra distinct test coverage. |
| Scoped recovery type-aware lint / composition staged lint | PASS. Legacy full type-aware composition debt and repository JSDoc/budget failures remain as reported below. |
| Persistence/configuration catalogs and third-party notices | PASS without generation; no Session format, event shape, released generation or lockfile changes. |
| README pair / Markdown formatting and links | PASS via the direct ESM verifiers; root README links point to this checkpoint. |
| GitHub / Docker / live acceptance | The PR #22 workflow `37995840690` failed before steps in both jobs (`114041572349`, `114041572758`). Current outgoing CI is inspected separately after publication. Docker and live-provider proof remain unavailable here. |

[The claim-order receipt](../docker/verification/claim-order-20261010.json) binds current source and local logs. These results close the new-claim ordering gap identified in the preceding checkpoint; they do not establish power-loss disk integrity, arbitrary historical repair, multiple live writers or full production acceptance. The unchanged 15 generator and 16 runner/order checks from the preceding checkpoint still apply; there are 264 distinct passing checks across the combined current scope, with one opt-in skip.

## Explicit cold-owner recovery checkpoint — 2026-10-10

Source base: `b88a20bd7fdf9745df9fb37a3ea3355d85cc58f1`, the verified complete-source PR #21 head. The current branch is `dai/cold-owner-recovery-20261010`. Recovery uses an explicit bounded root allowlist, native projection replay, exclusive native writer ownership and publication revalidation. It preserves pending human input and resumes a sole saved scheduler wake; Director mutations still occur only in native Agent turns. [The machine-readable receipt](../docker/verification/cold-recovery-20261010.json) binds the relevant source inputs, commands and log hashes.

| Executed check | Result and scope |
|---|---|
| `pnpm install --frozen-lockfile --offline` with exact pnpm 11.7.0 | PASS; all 344 workspace projects, no lockfile changes. Installed Vitest resolves to 4.1.11 under the existing lockfile. |
| `NODE_HEADERS_DIR=<verified-headers> pnpm run build` | PASS; native addon, Host/Client libraries, desktop and frontend; 357 client artifacts. Node 24.19.0 header archive matches the official SHA-256 manifest. |
| `NODE_USE_ENV_PROXY=0 node node_modules/vitest/vitest.mjs run packages/experimental/d-ai/tests scripts/gen-config-catalog.spec.ts --maxWorkers=4` | PASS; 234 tests: 219 native D_AI tests plus 15 generator regressions, with one opt-in live test skipped. |
| Real native Loader recovery | Included above: empty/saved-wake restart, completed owners staying cold, disabled/human-pending refusal, read overflow, zero capacity, excluded identity, original live-owner preservation, human-arrival publication race and cancellation/read-handle closure. Inference remains scripted. |
| Recovery disconnected negative control | EXPECTED FAILURE; removing only the constructor wiring makes both cold Loader recovery tests fail. Exact original source bytes are restored afterward. No assertions or timeouts were weakened. |
| Package-relative schema alias negative control | Both new generator tests fail before the fix. With relative resolution enabled, all 15 generator tests pass, including rejection of undeclared fields and private workspace exports. |
| `node --experimental-transform-types --test packages/experimental/d-ai/tests/director-scheduler-coordinator.test.mjs packages/experimental/d-ai/tests/director-recovery-process.test.mjs` | PASS; 13 tests: 12 production-coordinator fixture cases and one genuine POSIX process crash/restart case through the ordinary built D_AI entry. |
| Abrupt-process acceptance | A durable running task holds fence 1 and an active native worker. The parent observes readiness after a native persistence flush, sends SIGKILL and verifies the signal exit. A fresh process waits for lease expiry, restores the owner automatically, completes the task under fence 2, retains both released leases and an EXECUTED schedule receipt, makes one scripted inference request and exits normally. This is not a disk/power-loss fault test. |
| Independent-process fixture isolation | PASS; two separate copies of the crash test run concurrently with separate atomic temporary roots. Both complete. Child environments exclude model credentials; teardown kills and awaits owned children before removing files. |
| Runner / owner ordering | PASS; 16 tests. The eight runner cases substitute commands and verify the new process-test command/order/failure propagation. |
| Changed TypeScript scoped lint | PASS; configuration, recovery, configuration/Loader tests, generator and generator tests. `.mjs` tests are explicitly excluded by repository lint configuration; their acceptance is executable. |
| Committed persistence/configuration catalogs | PASS; verification runs without regeneration. Configuration generation adds the recovery option; no new durable event or released Session generation is introduced. |
| Root README pair / Markdown wrap / relative links | PASS; named English/Chinese pair, no prose hard wraps across 1,753 Markdown files, and valid relative links/fragments across 1,731 files. Existing locale README wraps are corrected mechanically. |
| Aggregate `pnpm run doc-sync` | BLOCKED at tsx CLI Unix-socket startup: `listen EPERM`; direct ESM checks above run independently. Git hooks now run the same source verifiers through the supported ESM hook, retaining all checks. The first feature commit correctly rejects inherited non-null assertions and overlong lines in the composition modules; the affected assertions are replaced with direct immutable returns of the already committed typed records, and formatting is corrected before retrying. |
| Repository export JSDoc / instruction budgets | Existing FAIL; 740 completeness violations, none for the new recovery class/config/interface; full type-aware lint of the legacy composition modules also reports existing deprecations and typing debt, while their staged lint passes; root AGENTS.md remains above its unchanged word budget. These failures prevent claiming aggregate documentation acceptance. |
| Docker image / CI / live-provider acceptance | Docker Engine unavailable; image/in-container execution is unrun. GitHub checks are independent and pending until inspected after publication. Models, web sources and approvals in these tests are fixtures. |

There are 263 passing distinct checks across the executed package/generator, built coordinator/crash and runner/ordering sets, with one opt-in skip. Concurrent repetitions establish fixture isolation and are not counted as extra distinct tests. The initial race fixture used an invalid timestamp field instead of the native `time` field; correcting the fixture makes the real durable human-input race pass. Strict full compilation caught unbranded fixture sequences, now constructed with `SessionSeq`. Earlier build attempts and historical receipts below do not substitute for this current checkpoint.

This verifies configured native cold-root restart and one abrupt-process task recovery. It does not accept arbitrary scoped-plugin restoration, multi-host scheduling, storage power-loss integrity, production mutable connectors, a complete Control Center, training or full live missions. [The operations guide](OPERATIONS.md#unattended-owner-recovery) owns configuration and limitations.

## Complete-source host checkpoint — 2026-10-09

The current source snapshot is reconstructed from the pinned official upstream commit and 258 exact D_AI Git blobs. Every overlay blob matches its Git identity, and `git write-tree` matches the complete development tree `52165a9bea2fb1b8d82cf625e4c36d26bde56c45` at source commit `a76079a7ee3be3f52f370da2499a06fe694e913a`. This removes the selected-source checkout blocker. Local Git history remains shallow upstream history plus the overlay, so client build metadata correctly records upstream HEAD and a dirty worktree rather than claiming a clean private-repository clone. [The machine-readable host receipt](../docker/verification/host-check-20261009.json) binds source identity, commands, environment, outcomes and local log hashes.

| Executed check | Result and scope |
|---|---|
| Exact pnpm `11.7.0` frozen installation | PASS; all 344 workspace projects, with the committed lockfile and patches unchanged. |
| Committed persistence catalog | PASS via `node --import tsx/esm scripts/gen-persistence-catalog.ts --check`; verification did not regenerate files. |
| Stale-catalog negative control | EXPECTED REJECTION, exit 1; an appended temporary marker is rejected and the exact original bytes are restored. Both CI lanes now verify the committed catalog before building; the native lane no longer generates it first. Workflow YAML and command order are checked. |
| `pnpm exec tsc -b packages/experimental/d-ai/tsconfig.json --pretty false` | PASS; strict package/project-reference compilation. |
| `pnpm run build` | PASS; host native addon, Host/Client libraries, desktop bundle and frontend; 357 client artifacts recorded. Node development headers match the official Node 24.19.0 SHA-256 manifest. |
| Production coordinator through normal built package entries | PASS; 12 tests, without the earlier scratch source resolver. Context/Agent/Director runtime boundaries remain fixtures. |
| Native D_AI package suite | PASS; 210 tests in 46 files, including the two-owner AgentLoop fairness regression and native Loader/restart integration; one opt-in live adviser file/test skipped. |
| Local provider budget/adapter regressions | PASS; 57 tests in two files. Inference remains scripted. |
| Runner/production owner-order regressions | PASS; 16 tests. The runner's eight cases substitute commands. |
| Published TypeScript declarations | PASS; 330 workspace package declaration APIs compile under NodeNext. |
| README pair records and relative links | PASS; root/container pairs checked, inherited `run`/`run-from-source` bookmarks restored, and links/fragments across 1,731 Markdown files resolve. |
| Ordinary `bash docker/check.sh`, `pnpm run doc-sync`, `pnpm run lint` | BLOCKED at the `tsx` CLI Unix-socket startup (`listen EPERM`). The runner stops before catalog/build. The lint entry completes its Host build prerequisite, then stops before oxlint; direct ESM checks are recorded separately. Direct full-lint execution reaches `tsgolint`, then its subprocess receives `SIGKILL` and exits 1; full lint is not passing. |
| Existing documentation formatting/budget checks | FAIL; five hard-wrapped paragraphs in the locale package README and unchanged root `AGENTS.md` at 1,983 words against 1,960. These do not become aggregate documentation success. |
| Docker image build and in-container suite | NOT RUN; no Engine/socket or permitted rootless runtime exists here. Host build/test success is not image acceptance. |

There are 295 passing tests and one opt-in skip across the four executed test sets. The initial D_AI package invocation started before the native addon prerequisite completed: 172 tests passed, 38 failed and one skipped. The missing addon was built from the repository's C source; the complete package rerun then passed 210 tests with one skip. No assertion, timeout, fixture, catalog, dependency or production code was weakened to obtain the result. Only fixture-test invocations set `NODE_USE_ENV_PROXY=0`.

This checkpoint establishes current host-source acceptance for scheduler fairness and the native package, not real-model quality, live connectors, cold-session activation, distributed scheduling, browser Control Center, Docker image transfer or production readiness. CI remains independently pending because inspected jobs stop before steps. Earlier checkpoint tables below describe their own historical sessions.

## Initial container configuration checkpoint — 2026-10-09

The container source environment pins official Node `24.19.0-bookworm` by its multi-platform registry index digest and installs pnpm `11.7.0`, matching `package.json`. It preserves the existing frozen lockfile, workspace patches and reviewed install scripts. The source image runs as `node`; Compose has build/check services without host bind mounts, credentials, Docker-socket access, models or application deployment. [The container guide](../docker/README.md) owns setup, snapshot lifetime and transfer limitations.

| Executed check | Result and scope |
|---|---|
| `node --test docker/tests/check-runner.test.mjs packages/experimental/d-ai/tests/director-owner-order.test.mjs` | PASS; 16 checks: eight current production-ordering cases plus eight command-runner regressions. Runner cases substitute `node`/`pnpm`, check order/working directory/fixture proxy settings and retain exit 37 on failure; they do not execute native build/tests. |
| `bash -n docker/check.sh` | PASS; shell syntax only. |
| Named README translation-pair check | PASS; root and container English/Chinese pages and generated consistency records pass the actual repository pairing verifier. This is not the corpus-wide documentation check. |
| Dockerfile AST parse | PASS with `dockerfile-ast` 0.7.1; toolchain/source stages are recognized. Parsing is not a BuildKit build or lint result. |
| Exact pnpm `11.7.0` inconsistent-workspace probe | EXPECTED REJECTION; `pnpm_config_verify_deps_before_run=error` stops with `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` before a marker script executes. This validates the workspace command policy, not frozen installation or a Docker image. |
| Docker Compose `5.6.0` configuration rendering | PASS using the official standalone binary, verified against its release checksum; both services resolve the source build target and expected commands. No Engine involved. |
| Official image registry manifest | Verified `node:24.19.0-bookworm` index digest `sha256:4196d66a565c6f195728d9952f161f4adfe2ad753052a08b7ec7f1c5a6bda42b`; Linux amd64/arm64/ppc64le entries are declared. This is identity evidence, not a pulled or run image. |
| Image build / frozen installation / complete in-container suite | NOT RUN; Docker Engine/socket is unavailable in this execution environment. The selected-source checkout also cannot supply a complete build context. |
| Current strict TypeScript/native AgentLoop/Loader/full build | NOT RUN; previous checkpoint receipts below remain historical. No subsystem is promoted. |

The runner verifies the committed persistence catalog without first regenerating it, builds before importing the normal built coordinator entries, and fails on the first unsuccessful command. CI adds a separate container job; its execution remains unverified until an actual job result is inspected. The container packaging does not resolve cold-session activation, distributed recovery, live connectors or Control Center acceptance. Root documentation is consolidated around current reports and its inherited Chinese page is aligned with D_AI rather than the original upstream product.

PR #21 consolidates the earlier unbuilt container draft in PR #20 on the current scheduler development line. Its permanent toolchain policy lives in the engineering agreement already required by root `AGENTS.md`, avoiding a second competing Docker recipe or additional root instruction-budget debt. Published commit `410b9d908f1fc75e50f81eca62cf8b25f2374301` contains 15 changed files, all matched to their local Git blob identities. Exact-commit Actions run `37944256405` has both `d-ai-v2` and `d-ai-container` jobs in failure with `steps: null` and no logs URL. No image-build, install or native-test step ran in those jobs; the cause is unavailable through the connector.

Validation-only Markdown/AST dependencies live outside the project and use a local `node_modules` link; they are not a workspace install and are not published or added to the production lockfile. Aggregate documentation/lint and full source compilation require the complete installed repository. This checkpoint keeps their status pending rather than substituting configuration parsing for native acceptance.

`pnpm run doc-sync` and `pnpm run lint` are BLOCKED before their scripts: the selected-source workspace lacks `@deepseek-ai/dsh-agent`, and pnpm 11's automatic dependency check attempts an install, then rejects the missing workspace package. This is incomplete-checkout evidence, not a documentation/lint pass. The image sets command-time dependency verification to `error`, retaining checks while prohibiting implicit installation of an inconsistent snapshot; explicit frozen installation remains the image-build step.

This document separates **historical verified evidence** from the **current branch checkpoint**. A source file, fixture path or failed CI launch is never promoted to test evidence.

## Cross-owner wake admission checkpoint — 2026-10-09

The native coordinator now rotates live root owners after the last successful wake enqueue, admits at most one wake per owner per scan, and retains existing within-owner schedule order and global capacity accounting. The cursor is process-local; there is no new Session event, schema migration or cold-session activation. This checkpoint does not upgrade P3 to accepted.

| Executed check | Result and scope |
|---|---|
| `node --test packages/experimental/d-ai/tests/director-owner-order.test.mjs` | PASS; eight checks use the actual production ordering module, including 300 capacity-one admissions, additional slots, owner removal/joining, wraparound and skipped/failed admission cursor semantics |
| Production coordinator isolation tests | PASS; twelve checks exercise real scan/pre-step/wake-schema code with fixture Context, Agent and Director runtime boundaries: 90 rotating cycle admissions, shared active/queued capacity in both inbox lanes, busy/human-work isolation, enqueue/projection failures, owner removal/joining, schedule eligibility, strict wake parsing, duplicate-cycle suppression, cancellation and disposal quiescence |
| Negative control against the actual pre-fix coordinator | EXPECTED FAIL; four of twelve checks fail against the exact PR #18 source blob `ef110a76300b1ad6309c189f8374f348fb871fbc` (exit 1), including an eligible first owner repeating instead of admitting the second owner; eight non-fairness checks remain passing |
| Node syntax checks for the changed ordering module and native regression | PASS; syntax checking is not TypeScript type checking |
| `node --experimental-transform-types --check packages/experimental/d-ai/src/director-scheduler.ts` | PASS; syntax/transform check only |
| Negative control with fixed registry ordering | PASS as a negative control; fixed insertion-order admission fails seven of eight checks (expected exit 1), including the capacity-one fairness case |
| Native two-owner AgentLoop regression | ADDED / NOT RUN in this session; covers a still-runnable first owner being due again before the second scan |
| Current complete workspace build, strict TypeScript, package/native Loader suite, documentation aggregates and lint | NOT RUN in this session; the workspace contains exact-head selected files only and has no repository dependency installation; direct Git transport and npm registry requests time out or fail authentication |
| Latest inspected remote D_AI workflow before publication | FAILURE before steps; run `37694129527`, job `113041387558`, `steps: null`; the connected endpoint exposes no runner rejection reason |

The current local total is 20 passing checks (eight ordering plus twelve coordinator checks), not 20 native AgentLoop/Loader integration tests. Coordinator validation uses the repository's actual schedule module and `createUserMessage`/crypto/brand/value implementations. Zod `4.6.5`, the D_AI lockfile resolution, is read from upstream commit `59bbc03e10c636b9eb3c393dfeb552819774ec21`; all 98 downloaded TypeScript blobs and the six repository helper blobs match their Git SHA identities. A scratch-only Node resolver maps package names to those source files and Zod's emitted `.js` imports to its `.ts` sources. It narrows the LLM import to the genuine message helper; the public built SDK, native addon, Cordis service composition, durable Session mutation and real models are not exercised. No dependency implementation is replaced, vendored or added to the production package.

The local reproduction is `node --experimental-transform-types --import ../validation-loader.mjs --test packages/experimental/d-ai/tests/director-owner-order.test.mjs packages/experimental/d-ai/tests/director-scheduler-coordinator.test.mjs`. The resolver/dependency snapshot is local verification setup, not a project runtime feature. On a fully installed and built checkout, the workflow runs `node --experimental-transform-types --test packages/experimental/d-ai/tests/director-scheduler-coordinator.test.mjs` after the workspace build so package imports use normal installed entries; that exact built-entry route remains unrun locally. Tests use promise barriers and abort signals rather than sleep-based assertions, and always release test work before awaiting scheduler cleanup.

The latest inspected exact-head PR #19 workflow is run `37848091696`, job `113553909433`: immediate failure, `runner_id: 0`, empty `runner_name`, and `steps: []`. The available API does not expose a cause. This is infrastructure evidence, not a code-test failure or success; current complete gates remain required.

The previous full build, 250-test native set and model recordings below are historical evidence for PR #18, not new results for this scheduler change. The new native regression, complete build and CI are required before merge or maturity promotion. Selection tests do not establish actual worker concurrency, crash recovery, live model quality or institutional readiness.

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
