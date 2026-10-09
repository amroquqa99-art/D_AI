# D_AI feature acceptance reference

Date: 2026-10-10 (Asia/Jerusalem)

This matrix separates **implementation maturity** from **verification state**. A feature can be wired into the runtime while the latest CI gate is unavailable; that does not make it verified.

## Maturity meanings

- `NOT_STARTED` — no accepted implementation.
- `FOUNDATION` — useful contracts/primitives exist; complete runtime path is missing.
- `IMPLEMENTED` — behavior exists in code but is not fully connected.
- `INTEGRATED` — the native runtime path is connected.
- `VERIFIED` — the appropriate executable acceptance checks have passed for the relevant current code.
- `LIVE_VERIFIED` — required real-provider/browser/environment proof also exists.

The current native package and configuration-catalog regression set passes 243 tests with one opt-in live test skipped: 228 native D_AI tests plus 15 generator checks. Cold owner recovery is connected through real Cordis Loader composition and native Session persistence. New task claims persist ownership before RUNNING; two POSIX abrupt-process boundaries are tested separately from the package suite. Model responses remain scripted. Build, abrupt-process acceptance and CI results are recorded separately in [TEST_REPORT.md](TEST_REPORT.md).

## Current checkpoint

| Capability | Evidence / implementation | Maturity | Current verification | Remaining acceptance work |
|---|---|---:|---:|---|
| Official source fork | Full Harness ancestry in D_AI, pinned upstream provenance | INTEGRATED | Historical baseline verified | Keep upstream updates manual/audited |
| Native D_AI boot foundation | Native Cordis package/service, Loader/profile integration paths | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | Dedicated D_AI launcher/workspace browser proof |
| Investigation | `state.ts`, `orchestration.ts`, native tools/service | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | Live provider/source acceptance and richer source connectors |
| Scientific Research | durable project/hypothesis/experiment state, literature/methodology agents, tools | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | Live scholarly connector/data path, reproducibility workflow |
| Investor | durable cases/sources/theses, fundamental/risk agents, tools | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | Live market/filing connectors, backtest safeguards, portfolio layer |
| Cybersecurity | explicit authorization scope, defensive findings/remediation/retest, independent review | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | Isolated authorized lab/provider integrations and broader defensive tooling |
| Operations & Intelligence | durable entities/relations/timeline/gaps/options, fusion/adversarial agents | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | Collaborative case workspace, richer ingestion/geo integrations |
| Innovation & Discovery | candidates, mechanisms, falsification tests, experiment handoff/results, explorer/critic | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | Prior-art connectors, deterministic math/simulation integrations |
| Task DAG / Task Ledger | durable typed task graph, transitions, retry accounting, replay | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | 1,000-task logical admission passes; real worker concurrency/fairness acceptance pending |
| Mission Director | durable plans, planner agent, task creation/view/status, approval-gated unattended schedules, native-turn wake loop, within-owner schedule fairness, process-local cross-owner round-robin admission, bounded cross-owner concurrency, exact-task claims and budget-safe same-plan parallel worker waves with partial-failure accounting | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | distributed scheduling, broader crash/fault injection and live missions |
| Explicit cold owner recovery | Deployment-owned root allowlist, bounded replay, native single-writer resume, publication revalidation, saved wake continuation and scoped disposal | INTEGRATED | LOCAL_NATIVE_LOADER_AND_SIGKILL_PASS / CI_PENDING | broader outage/storage faults, multiple contending hosts and live-provider recovery |
| Durable execution | fenced leases, heartbeat renewal, checkpoint lineage, release/recovery, deterministic v1→v2 replay migration, bounded unattended cross-owner cycles and same-plan parallel workers; heartbeat cancellation/cleanup regressions fixed | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | distributed scheduling, crash stress and live recovery proof |
| External side-effect idempotency | durable reservation/dispatch/commit/unknown/reconcile journal + fenced connector gateway; no production mutable connector | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | connector-level adoption, live idempotency/reconciliation acceptance and provider-specific semantics |
| Resource budgets / VoI | durable scoped limits/usage, budget-aware scheduler, VoI primitives | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | automatic metering on every relevant model/tool/data boundary |
| Capability control plane | scoped grants/denies, native approval, audit hash chain | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | institutional ABAC/admin UI and organization/multi-user model |
| Cross-system handoff | persisted-grant authorization + durable audit | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | target-task dispatch/workflow coordination and collaborative rooms |
| Evidence / Knowledge Graph | persisted provenance nodes/edges + support/contradiction primitives | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | automatic domain ingestion, consolidation/dedup, graph UI/backend scale |
| Model Registry / Router | durable profiles/policies + hard constraints/weighted routing | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | provider secrets/health/failover/telemetry/cost accounting |
| Training governance | candidate eligibility, sensitive-data rules, dataset/holdout lineage | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | raw artifact curation/redaction/materialization pipeline |
| Model evaluation/promotion | durable evaluations, promotion gates, rollback pointers | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | real model artifact evaluator/deployment/rollback exercise |
| Local Intelligence Core | architecture + governed data/eval/promotion foundation | FOUNDATION | CI_PENDING | governed training, artifact registry, held-out quality evaluation and live promotion |
| Local decision adviser | isolated native child and executor context, explicit route, bounded input/output/requests, advisory JSON, cancellation/disposal | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS + ONE_LOCAL_MODEL_SCENARIO / CI_PENDING | Same-model context ablation improves development result from 3/16 to 12/16; held-out Arabic/domain evaluation, hardware measurements and governed artifact adoption pending |
| SearXNG search | fixed JSON endpoint, native web provider, byte/timeout limits, source URLs | INTEGRATED | LOCAL_HTTP_FIXTURE_PASS / CI_PENDING | live configured SearXNG engines and investigation acceptance |
| Local/self-hosted profile | explicit worker/adviser routes, eight root tools, native compaction, no implicit paid fallback | INTEGRATED | LOCAL_AUTHENTICATED_HTTP_BOOT_PASS / CI_PENDING | full user-driven mission/browser acceptance, offline packaging |
| Cloud hosting | remote endpoints and persistent VM/container guidance | FOUNDATION | NOT_DEPLOYED | select target, authentication, durable storage, restore and operational testing |
| Container build/check environment | digest-pinned Node, exact pnpm, frozen install, copied-source Compose build/check services and fail-fast check runner | IMPLEMENTED | LOCAL_CONFIG_AND_RUNNER_PASS / IMAGE_BUILD_PENDING | complete Docker-host build/install/native acceptance, in-container source proof and image transfer acceptance |
| Control Center read API | consolidated platform snapshot | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | full backend control APIs and browser UI |
| Admin / Control Center UI | product specification only | NOT_STARTED | NOT_RUN | mission/agent/task/evidence/model/policy/resource views + RTL |
| Collaborative rooms | cross-system handoff primitives only | FOUNDATION | CI_PENDING | durable room/message/task coordination + scoped sharing |
| Artifact/Experiment Store | opt-in native SHA256 attachments, immutable owner-scoped lineage manifests, durable catalog and logged text tools | INTEGRATED | LOCAL_NATIVE_ARTIFACT_PASS / CI_PENDING | export/import, retention/delta storage, automatic experiment curation, organizational sharing and broader outage acceptance |
| AI Model Engineering & Research Lab | Local Core governance/lifecycle pieces | FOUNDATION | CI_PENDING | explicit lab manifest/workspace, baseline eval loop and future roadmap |
| Offline/fresh-checkout handoff | native source repository + durable Session model | FOUNDATION | CURRENT_HOST_SOURCE_BUILD_PASS / CI_PENDING | offline packaging, restore/export/import and clean-clone/container acceptance |

## Current verification blocker

Latest inspected D_AI v2 workflow:
- run `38000791898`
- jobs `114058075947` (native) and `114058076182` (container)
- conclusion `failure`
- workflow steps: none (`steps: null`); runner rejection reason unavailable

No checkout/install/build/typecheck/test command executed in that job. Current integrated rows therefore retain **CI_PENDING** for native acceptance. Local native fixture checks have a separate receipt in [TEST_REPORT.md](TEST_REPORT.md).

## Current architecture-hardening work

The active branch is executing [ADR 0002](ADRS/0002-runtime-decomposition.md):

- runtime configuration extracted to `config.ts`;
- persistent projection registration extracted to `runtime-projections.ts`;
- public package exports extracted to `public-api.ts`;
- native tool result/error boundary centralized in `tool-support.ts`;
- domain and shared-core tool registration split into bounded-context `*-tools.ts` modules;
- the native D_AI tool surface is characterized as 77 unique `d_ai_*` tools in passing native integration.

Current exact-tree host verification passes: native package, two-owner AgentLoop regression, full workspace build and published declarations. This is source-snapshot acceptance; container execution, aggregate documentation checks, CI and full live missions remain pending.

Exact historical/current test evidence is maintained in [TEST_REPORT.md](TEST_REPORT.md).
