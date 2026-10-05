# D_AI feature acceptance reference

## Status meanings

`NOT_STARTED` means no accepted implementation evidence. `FOUNDATION` means useful code/contracts exist but the complete user path is missing. `IMPLEMENTED` means component behavior is implemented. `INTEGRATED` means the real runtime path is wired. `VERIFIED` requires actual appropriate checks of that integrated path. Provider credentials, source access and browser verification are separate blockers; fixtures cannot satisfy live acceptance.

## Current checkpoint

| Capability | Owner | Implementation/evidence location | Status | Blocker or missing proof |
|---|---|---|---|---|
| Official native source baseline | Integrator | Upstream runtime and TEST_REPORT | VERIFIED | Build and loopback start pass; live-provider acceptance remains separate |
| Portable native build | Runtime engineer | native/system/scripts/build.ts; root scripts | VERIFIED | This execution image needs explicit verified Node headers and an 8 GiB heap |
| Arabic common/language dictionary | Frontend engineer | packages/client/d-ai-locale | INTEGRATED | Built profile loads package; visual browser verification pending |
| Bidi layout isolation | Frontend engineer | Locale client CSS | FOUNDATION | Full shell RTL, keyboard and accessibility QA |
| D_AI profile composition and boot | Integrator | Native package and overlay in packages/experimental/d-ai | INTEGRATED | Built loopback server passes; no live provider configured |
| D_AI Mission Control workspace | Frontend engineer | Product and UX specifications | FOUNDATION | No accepted mission UI or evidence inspection path |
| Investigative manager and real child tree | Orchestration engineer | packages/experimental/d-ai/src/index.ts, orchestration.ts; native tests | INTEGRATED | Fixture models only; durable scheduler and live provider pending |
| Durable mission/task scheduling | Orchestration engineer | Native session extension required | NOT_STARTED | DAG, concurrency, leases/fencing and process recovery tests |
| Evidence/claim verification | Evidence engineer | packages/experimental/d-ai/src/index.ts, state.ts; native tests | INTEGRATED | Verification authority and live source/provider acceptance pending |
| Scoped tool/cross-system gateway | Tooling/security | orchestration toolFilter, owner/turn checks, negative tests | FOUNDATION | Full owner control panel and temporary/permanent grants pending |
| Provider router/resource budgets | AI/ML engineer | Upstream LLM adapters available | NOT_STARTED | D_AI policy, metrics and live evaluation |
| Scientific Research | Domain engineer | Approved product specification | NOT_STARTED | Reproducible domain slice |
| Scientific Innovation | Domain engineer | Approved product specification | NOT_STARTED | Deterministic oracle and artifact verification |
| Financial Intelligence | Domain engineer | Approved product specification | NOT_STARTED | Sourced analysis and backtest safeguards |
| Authorized Cybersecurity | Security/domain engineer | Approved product specification | NOT_STARTED | Scope enforcement and isolated defensive test |
| Model engineering laboratory | AI/ML engineer | Approved product specification | NOT_STARTED | Registry/contracts plus real baseline evaluation |
| Collaborative rooms/scoped memory | Systems engineer | Native persisted domain integration required | NOT_STARTED | Two-system sharing and permission evidence |
| Backup/export/import and Arch handoff | Integrator/QA | Operations and test report | NOT_STARTED | Fresh-checkout and restore verification |
| Private-repository CI baseline | Integrator/QA | .github/workflows/d-ai-ci.yml | IMPLEMENTED | Requires first GitHub run on this branch before VERIFIED |

Exact commands and test identifiers are maintained in [TEST_REPORT.md](TEST_REPORT.md). This checkpoint makes no live-model, mission-UI or completed-domain claim. Update rows only after the responsible integration is inspected and appropriate tests have run.
