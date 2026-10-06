# ADR 0003 — Fence durable execution generations

- Status: Accepted
- Date: 2026-10-06
- Scope: durable task execution, leases, checkpoints and Mission Director

## Context

D_AI may retry a task after a worker stalls, loses connectivity, crashes or lets its lease expire. Multiple attempts for the same logical task can therefore exist over time.

The first execution implementation identified leases by `taskId` plus the owner root Agent. That is insufficient because all Director work for one owner runs under the same root Agent identity. A stale executor from an earlier attempt could theoretically resume after recovery and accidentally mutate state belonging to a newer attempt.

The product specification requires retries and lease expiry to avoid silently duplicating or corrupting execution.

## Decision

Every task lease has two identities:

- immutable `leaseId`;
- monotonically increasing per-task `fence`.

The fence starts at 1 for the first lease and increments for every later lease acquisition for the same logical task.

Executor-owned mutations must present the exact triple:

```text
taskId + leaseId + fence
```

The runtime rejects the mutation when the lease generation is:

- unknown;
- released;
- expired;
- owned by another executor;
- replaced by a newer generation.

This fence is required for:

- lease renewal;
- durable checkpoints;
- executor-owned task-state transitions;
- lease release.

Mission Director retains the claimed lease identity throughout the execution and never re-resolves ownership by `taskId` alone.

## Persistence

Execution persistence moves from event payload version 1 to version 2.

Version 1 remains replayable:

- legacy leases are assigned deterministic fences in persisted order per task;
- legacy checkpoints are attached to the only lease generation valid at their recorded timestamp;
- ambiguous legacy history fails closed instead of guessing.

The execution projection state version is incremented accordingly.

## What fencing guarantees

Fencing prevents a stale executor from committing durable D_AI state after execution ownership has moved to another lease generation.

It protects:

- checkpoints;
- task transitions performed by the Director executor;
- lease renewal/release.

## What fencing does not guarantee

Fencing alone cannot undo an external side effect that a stale worker already sent to another system.

For external side-effecting tools, D_AI still needs a separate idempotency/fencing gateway that propagates a stable execution key and fence to the connector or records a side-effect claim before execution.

Examples include:

- financial transactions;
- infrastructure changes;
- external messages;
- active security-test actions;
- mutable third-party APIs.

Those connectors must not be considered exactly-once merely because the internal Session state is fenced.

## Consequences

Positive:

- stale workers cannot write into newer task attempts;
- recovery/retry ownership is explicit;
- checkpoint lineage identifies the exact execution generation;
- replay can audit which attempt produced each checkpoint.

Costs:

- execution tool callers must retain `lease_id` and `fence`;
- execution persistence schema requires a migration;
- external side effects still need their own idempotency protocol.

## Verification requirements

Acceptance requires:

1. unit tests for fence allocation and stale-generation resolution;
2. migration tests for v1 execution history;
3. integration test showing a stale first lease cannot checkpoint after a second lease is acquired;
4. persistence catalog regeneration;
5. package TypeScript build and D_AI test suite.

Until the current CI runner executes workflow steps successfully, these new tests remain source-level evidence and are not marked VERIFIED.
