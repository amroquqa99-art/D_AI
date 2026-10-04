# D_AI architecture reference

## Summary

D_AI extends the official Harness source tree through Cordis packages, profile composition, sessions and agents. This document maps the approved D_AI responsibilities to native mechanisms; it does not certify unimplemented responsibilities. The binding requirements are in [PRODUCT_SPEC.md](PRODUCT_SPEC.md), and demonstrated capability status belongs in [FEATURE_MATRIX.md](FEATURE_MATRIX.md).

## Native integration

The upstream [architecture reference](architecture.md) owns the Harness runtime map. Supported applications launch through `dsh` profiles. A D_AI profile composes native packages over the existing base and web bundles; it must not introduce a second application launcher or simulate agents outside the Harness runtime.

Manager instances use `ctx.agents.create()` and `resume()`. Creation setup installs scoped tools and prompt contributions before publication. The owner retains and disposes each `AgentHandle`. Child agents use published `ctx.subagents` providers and continuation services. Each agent has its own session identity and scoped context. Agent ownership trees remain separate from task dependency DAGs and evidence graphs.

## Durable research state

The append-only native session log records model-visible input and domain facts. Pure session projections reconstruct read state. Required native domain events extend `SessionEventMap` and enter the generated persistence catalog. State-carrying events contain complete post-change state. A generated summary remains derived data; it cannot replace source records.

Existing session checkpoint policy flushes before model dispatch and top-level tool execution. A completed idle agent requires an explicit flush before another process can rely on its stored output. Mission scheduling still needs task dependencies, bounded worker execution, leases, fencing, retries, resource reservations and crash-recovery tests.

## Domain responsibilities

| Responsibility | Approved owner | Native dependency |
|---|---|---|
| Mission lifecycle, stop conditions and reports | Mission Director | Agents, sessions, settings |
| Hypotheses, contradictions and verification | Investigative system manager | Tools, subagents, projections |
| Source records, claims and artifact lineage | Evidence services | Durable events and artifact storage |
| Provider selection and budgets | Model/resource services | LLM adapters and request interception |
| Grants and sensitive operations | Tool/policy services | Tool pipeline and approvals |
| Mission control and evidence inspection | D_AI client modules | Host transport and client projections |

The five domain implementations follow the priority in [MILESTONES.md](MILESTONES.md). The future model laboratory requires registration, experiment schemas and a real inference/evaluation path before any live capability claim. Heavy training remains a later milestone.

## Extension lifecycle

A domain package needs a versioned manifest, manager creation, scoped tool policy, event/projection definitions, migrations, evaluation suite and UI registration. Installation, upgrade, removal and generated-system activation require explicit lifecycle handling. These are approved requirements, not a completed System Studio. New independent missions and changes to autonomy, access or spending require owner approval.

## Current implementation limits

The checkout retains the original runtime. The D_AI Arabic/bidi package supplies a limited native client foundation. A D_AI mission UI, verified manager-to-grandchild flow, durable scheduler and live provider execution have not yet been demonstrated. [TEST_REPORT.md](TEST_REPORT.md) records executed checks; [HARNESS_DELTA.md](HARNESS_DELTA.md) lists source changes.
