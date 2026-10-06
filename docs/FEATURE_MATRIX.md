# D_AI feature acceptance reference

Date: 2026-10-06

This matrix separates **implementation maturity** from **verification state**. A feature can be wired into the runtime while the latest CI gate is unavailable; that does not make it verified.

## Maturity meanings

- `NOT_STARTED` — no accepted implementation.
- `FOUNDATION` — useful contracts/primitives exist; complete runtime path is missing.
- `IMPLEMENTED` — behavior exists in code but is not fully connected.
- `INTEGRATED` — the native runtime path is connected.
- `VERIFIED` — the appropriate executable acceptance checks have passed for the relevant current code.
- `LIVE_VERIFIED` — required real-provider/browser/environment proof also exists.

Verification is tracked separately because the current branch CI runner is failing before workflow steps execute. Focused local checks now pass 86 tests in 21 files; this evidence does not replace native integration/build acceptance.

## Current checkpoint

| Capability | Evidence / implementation | Maturity | Current verification | Remaining acceptance work |
|---|---|---:|---:|---|
| Official source fork | Full Harness ancestry in D_AI, pinned upstream provenance | INTEGRATED | Historical baseline verified | Keep upstream updates manual/audited |
| Native D_AI boot foundation | Native Cordis package/service, Loader/profile integration paths | INTEGRATED | Historical partial verification; current gate pending | Dedicated D_AI launcher/workspace browser proof |
| Investigation | `state.ts`, `orchestration.ts`, native tools/service | INTEGRATED | Historical slice verified; current refactor pending | Live provider/source acceptance and richer source connectors |
| Scientific Research | durable project/hypothesis/experiment state, literature/methodology agents, tools | INTEGRATED | CI_PENDING | Live scholarly connector/data path, reproducibility workflow |
| Investor | durable cases/sources/theses, fundamental/risk agents, tools | INTEGRATED | CI_PENDING | Live market/filing connectors, backtest safeguards, portfolio layer |
| Cybersecurity | explicit authorization scope, defensive findings/remediation/retest, independent review | INTEGRATED | CI_PENDING | Isolated authorized lab/provider integrations and broader defensive tooling |
| Operations & Intelligence | durable entities/relations/timeline/gaps/options, fusion/adversarial agents | INTEGRATED | CI_PENDING | Collaborative case workspace, richer ingestion/geo integrations |
| Innovation & Discovery | candidates, mechanisms, falsification tests, experiment handoff/results, explorer/critic | INTEGRATED | CI_PENDING | Prior-art connectors, deterministic math/simulation integrations |
| Task DAG / Task Ledger | durable typed task graph, transitions, retry accounting, replay | INTEGRATED | CI_PENDING | 1000-task bounded-concurrency/fairness acceptance |
| Mission Director | durable plans, planner agent, task creation/view/status, single-task executor | INTEGRATED | CI_PENDING | unattended worker loop, long-horizon scheduling, saturation/stagnation policy |
| Durable execution | fenced leases, heartbeat renewal, checkpoint lineage, release/recovery and deterministic v1→v2 replay migration; heartbeat cancellation/cleanup regressions fixed | INTEGRATED | LOCAL_UNIT_PASS / CI_PENDING | unattended worker pool, native integration acceptance, live stress/recovery proof |
| External side-effect idempotency | durable reservation/dispatch/commit/unknown/reconcile journal + fenced connector gateway; no production mutable connector | INTEGRATED | CI_PENDING | connector-level adoption, live idempotency/reconciliation acceptance and provider-specific semantics |
| Resource budgets / VoI | durable scoped limits/usage, budget-aware scheduler, VoI primitives | INTEGRATED | CI_PENDING | automatic metering on every relevant model/tool/data boundary |
| Capability control plane | scoped grants/denies, native approval, audit hash chain | INTEGRATED | CI_PENDING | institutional ABAC/admin UI and organization/multi-user model |
| Cross-system handoff | persisted-grant authorization + durable audit | INTEGRATED | CI_PENDING | target-task dispatch/workflow coordination and collaborative rooms |
| Evidence / Knowledge Graph | persisted provenance nodes/edges + support/contradiction primitives | INTEGRATED | CI_PENDING | automatic domain ingestion, consolidation/dedup, graph UI/backend scale |
| Model Registry / Router | durable profiles/policies + hard constraints/weighted routing | INTEGRATED | CI_PENDING | provider secrets/health/failover/telemetry/cost accounting |
| Training governance | candidate eligibility, sensitive-data rules, dataset/holdout lineage | INTEGRATED | CI_PENDING | raw artifact curation/redaction/materialization pipeline |
| Model evaluation/promotion | durable evaluations, promotion gates, rollback pointers | INTEGRATED | CI_PENDING | real model artifact evaluator/deployment/rollback exercise |
| Local Intelligence Core | architecture + governed data/eval/promotion foundation | FOUNDATION | CI_PENDING | actual local model training/inference artifact and live promotion |
| Control Center read API | consolidated platform snapshot | INTEGRATED | CI_PENDING | full backend control APIs and browser UI |
| Admin / Control Center UI | product specification only | NOT_STARTED | NOT_RUN | mission/agent/task/evidence/model/policy/resource views + RTL |
| Collaborative rooms | cross-system handoff primitives only | FOUNDATION | CI_PENDING | durable room/message/task coordination + scoped sharing |
| Artifact/Experiment Store | artifact references/checksums in several state paths | FOUNDATION | CI_PENDING | content-addressed blob store, lineage manifests, export/import |
| AI Model Engineering & Research Lab | Local Core governance/lifecycle pieces | FOUNDATION | CI_PENDING | explicit lab manifest/workspace, baseline eval loop and future roadmap |
| Offline/fresh-checkout handoff | native source repository + durable Session model | FOUNDATION | Historical build evidence only | offline packaging, restore/export/import, fresh-checkout current branch proof |

## Current verification blocker

Latest inspected D_AI v2 workflow:
- run `37478707169`
- job `112320880392`
- conclusion `failure`
- `steps: []`

No checkout/install/build/typecheck/test command executed in that job. Current integrated rows therefore retain **CI_PENDING** for native acceptance. Local unit/projection checks have a separate receipt in [TEST_REPORT.md](TEST_REPORT.md).

## Current architecture-hardening work

The active branch is executing [ADR 0002](ADRS/0002-runtime-decomposition.md):

- runtime configuration extracted to `config.ts`;
- persistent projection registration extracted to `runtime-projections.ts`;
- public package exports extracted to `public-api.ts`;
- native tool result/error boundary centralized in `tool-support.ts`;
- domain and shared-core tool registration split into bounded-context `*-tools.ts` modules;
- the native D_AI tool surface is characterized as 74 unique `d_ai_*` tools in integration-test source.

The refactor is behavior-preserving by intent and remains verification-pending until the executable gate is restored.

Exact historical/current test evidence is maintained in [TEST_REPORT.md](TEST_REPORT.md).
