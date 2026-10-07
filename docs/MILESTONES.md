# D_AI acceptance milestones

## Summary

The owner-approved acceptance sequence below controls implementation order. Status reflects demonstrated behavior, not directory or class counts. Exact command evidence belongs in [TEST_REPORT.md](TEST_REPORT.md); component status belongs in [FEATURE_MATRIX.md](FEATURE_MATRIX.md).

| Milestone | Required result | Current assessment |
|---|---|---|
| P0 Source truth and lineage | Official source, pinned revision, install/build/tests/start evidence | In progress; complete private source import verified, current frozen-lockfile workspace build and authenticated source-profile HTTP boot pass; full D_AI browser workflow pending; historical build evidence retained |
| P1 Native D_AI boot | Native profile, loaded web surface, real state inspection | In progress; client foundation exists, source profile + local overlay boots and serves authenticated web HTML; full mission UI acceptance pending |
| P2 Actual delegated execution | Manager, child, grandchild; independent provider calls and handoff | Native independent planner/worker contexts verified with scripted providers; live models and complete manager/child/grandchild acceptance pending |
| P3 Durable scheduling | DAG, bounds, leases/fencing, retries, restart, unattended native-turn scheduling, parallel workers and 1,000-task checks | In progress; single-process scheduler, within-owner fairness, guardrail/reset controls, bounded cross-owner concurrency and per-worker holder identities implemented; distributed execution, native fixture restart, parallel workers and shutdown pass; 1,000-task logical admission passes; cold-session/distributed/crash/live scale acceptance pending |
| P4 Shared intelligence | Evidence lifecycle, scoped memory, audited cross-system sharing | Not accepted |
| P5 Domain slices | Investigation, Scientific Research, Investor, Cybersecurity, Operations & Intelligence, Innovation & Discovery | In progress; all six native slices are integrated in source, all 45 fixture package test files pass locally; CI and live-connector depth acceptance pending |
| P6 Local Intelligence Core foundation | Governed dataset pipeline, model registry/lineage, local inference, baseline evaluation, controlled training/adapter experiment and rollback | Isolated local decision runtime connected; one real CPU 2B model scenario passes. Governed artifact adoption, held-out evaluation, training and rollback are not accepted |
| P7 UI/security hardening | Mission panels, Arabic/English RTL, enforced policy and audit | Not accepted; limited locale foundation |
| P8 Delivery verification | Integrated checks, fresh-checkout operations, backup/recovery | Not accepted |

## Acceptance rules

A milestone cannot pass using fixtures as proof of an external model or source call. Missing credentials are a live-integration blocker. Runtime failures and failed checks remain visible until repaired and rerun. Review must be independent of the implementation where available. Every merge needs focused tests before a capability status advances.

## Domain sequence

All six approved domains now have integrated native slices. Remaining domain work is depth, live connectors, scale and acceptance rather than first-slice creation. The Local Intelligence Core develops in parallel as a governed platform capability with meaningful model/data/evaluation primitives. Contract registration alone never counts as a completed domain.
