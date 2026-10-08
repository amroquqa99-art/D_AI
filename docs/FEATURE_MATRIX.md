# D_AI feature acceptance reference

Date: 2026-10-09 (Asia/Jerusalem)

This matrix separates **implementation maturity** from **verification state**. A feature can be wired into the runtime while the latest CI gate is unavailable; that does not make it verified.

## Maturity meanings

- `NOT_STARTED` — no accepted implementation.
- `FOUNDATION` — useful contracts/primitives exist; complete runtime path is missing.
- `IMPLEMENTED` — behavior exists in code but is not fully connected.
- `INTEGRATED` — the native runtime path is connected.
- `VERIFIED` — the appropriate executable acceptance checks have passed for the relevant current code.
- `LIVE_VERIFIED` — required real-provider/browser/environment proof also exists.

Verification is tracked separately because the last inspected Actions run fails before workflow steps execute. The current native D_AI/context set passes 250 tests in 49 files; one live test is skipped in the keyless run. Two hash-verified CPU recordings each pass the original smoke and complete all sixteen development cases. The full workspace build and 330 public declaration APIs under NodeNext pass. CI, full live missions and live search remain pending. The 1,000-task check proves logical admission only; it does not establish distributed worker scale.

The new cross-owner scheduler ordering has eight passing dependency-free checks and a rejecting fixed-order negative control. Its native AgentLoop regression is added but unrun; complete current build, TypeScript, package tests and CI remain pending. The 250-test result and model recordings below refer to the previous PR #18 checkpoint. This update does not promote any capability.

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
| Mission Director | durable plans, planner agent, task creation/view/status, approval-gated unattended schedules, native-turn wake loop, within-owner schedule fairness, process-local cross-owner round-robin admission, bounded cross-owner concurrency, exact-task claims and budget-safe same-plan parallel worker waves with partial-failure accounting | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | new two-owner native regression, cold-session activation, distributed scheduling and crash/fault injection |
| Durable execution | fenced leases, heartbeat renewal, checkpoint lineage, release/recovery, deterministic v1→v2 replay migration, bounded unattended cross-owner cycles and same-plan parallel workers; heartbeat cancellation/cleanup regressions fixed | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | cold-session activation, distributed scheduling, crash stress and live recovery proof |
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
| Control Center read API | consolidated platform snapshot | INTEGRATED | LOCAL_NATIVE_FIXTURE_PASS / CI_PENDING | full backend control APIs and browser UI |
| Admin / Control Center UI | product specification only | NOT_STARTED | NOT_RUN | mission/agent/task/evidence/model/policy/resource views + RTL |
| Collaborative rooms | cross-system handoff primitives only | FOUNDATION | CI_PENDING | durable room/message/task coordination + scoped sharing |
| Artifact/Experiment Store | artifact references/checksums in several state paths | FOUNDATION | CI_PENDING | content-addressed blob store, lineage manifests, export/import |
| AI Model Engineering & Research Lab | Local Core governance/lifecycle pieces | FOUNDATION | CI_PENDING | explicit lab manifest/workspace, baseline eval loop and future roadmap |
| Offline/fresh-checkout handoff | native source repository + durable Session model | FOUNDATION | Historical build evidence only | offline packaging, restore/export/import, fresh-checkout current branch proof |

## Current verification blocker

Latest inspected D_AI v2 workflow:
- run `37694129527`
- job `113041387558`
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

Local native characterization and all package tests pass. Full workspace compilation passes locally; aggregate documentation checks, CI and full live missions remain pending.

Exact historical/current test evidence is maintained in [TEST_REPORT.md](TEST_REPORT.md).
