# @deepseek-ai/dsh-experimental-d-ai

Native D_AI platform over the original Harness Agent, Session, subagent, tools, web and storage services. All six approved domain slices have runtime implementations; native fixture integration passes locally; full workspace/CI and live-provider acceptance remain pending. Activate explicitly through a D_AI profile overlay; this package does not change shipped upstream profiles. [The verification report](../../../docs/TEST_REPORT.md) separates current local evidence from historical runtime evidence.

## Use this package

Mount `dsh-experimental-d-ai` after the base Harness services and a configured `storage-domain` backend. Configure `subagentProvider` (default `spawn`) and register `web_search` and `web_fetch` for its default worker allow list. A local or permitted cloud model must be configured on the owner Agent before real execution.

The five investigation tools create/read missions, capture decoded public HTTP(S) sources, append exact-source-anchored observations/counterclaims, and run fresh research and independently researching verifier Agents. Additional registrars expose the other domain workflows and shared platform controls. Mutation requires an open native Agent turn so its facts survive released-session replay. Only the exact live owner root identity can access its missions. A creation objective must exactly match an admitted direct human message or receive an audited native one-shot owner approval. Missing approval answerers fail closed.

Raw `d_ai/fact` events contain complete mission state and rebuild the `dai` Session projection. The storage-domain index is discoverability only; the Session log is authoritative. Captured sources retain retrieval URLs/status/time, truncation and SHA256 of UTF-8 decoded captured content, never a purported original HTTP-byte archive. Counterclaims retain original claims and source records. Delegated assessments remain unverified model output.

## Verification

`pnpm exec vitest run packages/experimental/d-ai/tests` exercises native Loader composition, AgentLoop tools, actual native child loops, configured model separation, worker bounds, source/ownership policy, append-only replay, and JSONL restart. The model adapter and public web provider are explicitly scripted fixtures. This proves internal integration, not live model or internet research.

All 173 tests in 43 package files pass locally with the compiled native addon. Coverage includes exact-task parallel workers, native restart/wakes, cancellation, human-wait boundaries, durable flush failures, legacy schedule defaults and scheduler shutdown to quiescence. Scoped source/test TypeScript checks report zero package diagnostics; the full workspace build and CI remain pending. A deterministic 1,000-task admission test proves logical scheduling, not live worker capacity.

### Unattended Mission Director

The scheduler is deliberately split into two authority levels. A process-local coordinator may only inspect durable schedule state and enqueue a validated wake payload using the existing Harness `schedule` message source for an idle root Agent. It cannot append D_AI facts. The wake is consumed by an `agent/pre-step` hook inside a native turn; only there may the service execute the bounded Director cycle and append a durable cycle receipt. The coordinator defaults to disabled (`directorSchedulerEnabled: false`). Schedule enable/update/disable operations are owner-approval gated, and the scheduler will not enqueue ahead of already queued human/agent work.

This preserves the package invariant that durable D_AI mutation happens inside an owned native turn rather than from an untracked timer callback. Parallel waves use exact transactional task claims, wait for all started workers to settle, and preserve partial cycle results when a later worker fails. Scheduler disposal aborts active cycles, waits for their cleanup and prevents new scans. Legacy v1 schedules replay with default settings; task failure retains the v1 FAILED outcome with a D_AI_TASK_FAILED marker.

## Model Experience

### Investigation tools

#### What the model sees

The five `d_ai_*` schemas and bounded JSON mission state. Source content and independent assessments are untrusted data. Claim tools append observations but provide no operation to self-promote claims to `VERIFIED_WITH_SCOPE`.

#### Token effect

Tool schemas add a fixed prompt cost. Captured content and mission results add variable history cost bounded by configured source/mission limits. Each delegated role has a configured token/request/time/output-byte budget.

#### KV Cache effect

Tool registration changes the assembled tool prefix once at activation. Subsequent missions append tool results and Session facts without rewriting prior source content. Role children use fresh independent contexts.

## Known Limitations and Deferred Work

The Local Intelligence Core is a separate governed platform component, not a seventh domain, and has no trained or activated D_AI model. Durable task ledgers, fenced leases/checkpoints, budgets, grants, model routing, bounded Director cycles, a durable unattended Director scheduler and budget-safe same-plan parallel worker waves now exist. The scheduler persists cadence/cycle receipts, wakes only idle root Agents, executes inside native Agent turns, preserves lease/fencing recovery, requires human approval for schedule changes, orders due plans fairly within one owner, bounds cross-owner concurrency and can execute independent tasks in exact-task parallel waves without sharing an applicable durable budget profile. Cold-session activation, cross-owner fairness/crash acceptance, provider health/secrets/telemetry, original binary artifact storage, a complete system-manager hierarchy and the Control Center UI remain unfinished. Real wall-clock usage is measured; automatic token/money/data/human-attention metering and VRAM reservations remain incomplete.

The index is not reconciled automatically after a Session-success/index-failure. A failed Session flush rejects the mutation but native pending in-memory Session events remain visible until retry or restart; no cross-store transaction or rollback is promised. Events emitted inside an interrupted turn retain native Harness recovery semantics. Process-crash fault injection and live-provider acceptance remain unverified.
