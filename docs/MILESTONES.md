# D_AI acceptance milestones

## Summary

The owner-approved acceptance sequence below controls implementation order. Status reflects demonstrated behavior, not directory or class counts. Exact command evidence belongs in [TEST_REPORT.md](TEST_REPORT.md); component status belongs in [FEATURE_MATRIX.md](FEATURE_MATRIX.md).

| Milestone | Required result | Current assessment |
|---|---|---|
| P0 Source truth and lineage | Official source, pinned revision, install/build/tests/start evidence | In progress; complete private source import verified, build/start verification pending |
| P1 Native D_AI boot | Native profile, loaded web surface, real state inspection | In progress; client foundation exists, D_AI launch not verified |
| P2 Actual delegated execution | Manager, child, grandchild; independent provider calls and handoff | Blocked on configured model and runtime integration |
| P3 Durable scheduling | DAG, bounds, leases/fencing, retries, restart, unattended native-turn scheduling, parallel workers and 1,000-task checks | In progress; single-process scheduler, fairness, bounded cross-owner concurrency and budget-safe same-plan parallel workers implemented; distributed execution, current native acceptance and scale/fault-injection checks pending |
| P4 Shared intelligence | Evidence lifecycle, scoped memory, audited cross-system sharing | Not accepted |
| P5 Domain slices | Investigation, Scientific Research, Investor, Cybersecurity, Operations & Intelligence, Innovation & Discovery | In progress; all six native slices are integrated in source, current-gate and live-connector depth acceptance pending |
| P6 Local Intelligence Core foundation | Governed dataset pipeline, model registry/lineage, local inference, baseline evaluation, controlled training/adapter experiment and rollback | Foundation registered; runtime/evaluation path not accepted |
| P7 UI/security hardening | Mission panels, Arabic/English RTL, enforced policy and audit | Not accepted; limited locale foundation |
| P8 Delivery verification | Integrated checks, fresh-checkout operations, backup/recovery | Not accepted |

## Acceptance rules

A milestone cannot pass using fixtures as proof of an external model or source call. Missing credentials are a live-integration blocker. Runtime failures and failed checks remain visible until repaired and rerun. Review must be independent of the implementation where available. Every merge needs focused tests before a capability status advances.

## Domain sequence

All six approved domains now have integrated native slices. Remaining domain work is depth, live connectors, scale and acceptance rather than first-slice creation. The Local Intelligence Core develops in parallel as a governed platform capability with meaningful model/data/evaluation primitives. Contract registration alone never counts as a completed domain.
