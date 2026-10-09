# @deepseek-ai/dsh-experimental-d-ai

Native D_AI platform over the original Harness Agent, Session, subagent, tools, web and storage services. All six approved domain slices have runtime implementations; native fixture integration passes locally; the full workspace build passes locally; CI and complete live mission acceptance remain pending. Activate explicitly through a D_AI profile overlay; this package does not change shipped upstream profiles. [The verification report](../../../docs/TEST_REPORT.md) separates current local evidence from historical runtime evidence.

## Use this package

Mount `dsh-experimental-d-ai` after the base Harness services and a configured `storage-domain` backend. Configure `subagentProvider` (default `spawn`) and register `web_search` and `web_fetch` for its default worker allow list. A local or permitted cloud model must be configured on the owner Agent before real execution.

The five investigation tools create/read missions, capture decoded public HTTP(S) sources, append exact-source-anchored observations/counterclaims, and run fresh research and independently researching verifier Agents. Additional registrars expose the other domain workflows and shared platform controls. Mutation requires an open native Agent turn so its facts survive released-session replay. Only the exact live owner root identity can access its missions. A creation objective must exactly match an admitted direct human message or receive an audited native one-shot owner approval. Missing approval answerers fail closed.

Raw `d_ai/fact` events contain complete mission state and rebuild the `dai` Session projection. The storage-domain index is discoverability only; the Session log is authoritative. Captured sources retain retrieval URLs/status/time, truncation and SHA256 of UTF-8 decoded captured content, never a purported original HTTP-byte archive. Counterclaims retain original claims and source records. Delegated assessments remain unverified model output.

## Verification

`pnpm exec vitest run packages/experimental/d-ai/tests` exercises native Loader composition, AgentLoop tools, actual native child loops, configured model separation, worker bounds, source/ownership policy, append-only replay, and JSONL restart. The model adapter and public web provider are explicitly scripted fixtures. This proves internal integration, not live model or internet research.

The current native package suite passes 219 fixture tests in 46 package files with one opt-in live test skipped. It covers exact-task parallel workers, native restart/wakes, cancellation, human-wait boundaries, durable flush failures, legacy schedule defaults, two-owner admission and scheduler shutdown. Cold recovery uses the real Loader and persistence services; the model adapter remains scripted. A deterministic 1,000-task admission test establishes logical scheduling, not live worker capacity. Current build, abrupt-process and CI evidence is recorded in [the verification report](../../../docs/TEST_REPORT.md).

### Unattended Mission Director

The scheduler is deliberately split into two authority levels. A process-local coordinator may only inspect durable schedule state and enqueue a validated wake payload using the existing Harness `schedule` message source for an idle root Agent. It cannot append D_AI facts. The wake is consumed by an `agent/pre-step` hook inside a native turn; only there may the service execute the bounded Director cycle and append a durable cycle receipt. The coordinator defaults to disabled (`directorSchedulerEnabled: false`). Schedule enable/update/disable operations are owner-approval gated, and the scheduler will not enqueue ahead of already queued human/agent work.

This preserves the package invariant that durable D_AI mutation happens inside an owned native turn rather than from an untracked timer callback. Parallel waves use exact transactional task claims, wait for all started workers to settle, and preserve partial cycle results when a later worker fails. Scheduler disposal aborts active cycles, waits for their cleanup and prevents new scans. Legacy v1 schedules replay with default settings; task failure retains the v1 FAILED outcome with a D_AI_TASK_FAILED marker.

Live root owners are considered in stable identity order, starting after the last owner whose wake was successfully enqueued. Each scan admits at most one wake per owner; unused slots remain available to the next scan. Busy owners, queued human work and failed wake enqueueing do not advance that owner's cursor. Existing per-owner schedule ordering, approvals, native-turn execution and resource limits still apply. The cursor is process-local and resets on scheduler restart; distributed fairness is not provided. Eight dependency-free ordering checks and twelve production-coordinator isolation checks pass; Context/Agent/Director execution are fixtures, with genuine wake-schema and message-helper implementations. The exact pre-fix coordinator fails four of twelve checks. The native two-owner regression and current complete package suite pass.

Cold root recovery is opt-in through `directorSchedulerResumeOwners`. The scheduler reads bounded logs for an explicit allowlist, restores useful approved work under native single-writer ownership, revalidates at publication and releases only its own handles on shutdown. It preserves pending human input and can continue a sole persisted schedule wake. [Configuration and operating limits](../../../docs/OPERATIONS.md#unattended-owner-recovery) are owned by the operations guide.

## Immutable experiment artifacts

Mount the optional `@deepseek-ai/dsh-experimental-d-ai/artifact-store` plugin before creating owners, with native `attachments`, `storage-domain`, `agents` and `tools` services. In a source checkout, add `--patch packages/experimental/d-ai/cordis.artifacts.patch.yml` to the Web-derived D_AI launch. A restricted local profile must explicitly include `d_ai_artifact_put_text`, `d_ai_artifact_read_text` and `d_ai_artifact_list` in its root tool allow list.

`ctx.daiArtifacts.put` stores exact binary bytes and an immutable version-one lineage manifest; `read` verifies the manifest and content; `list` returns only the live root's receipts. The text tools retain exact UTF-8, including a leading BOM, and refuse invalid UTF-8 on read. A receipt's `manifest.attachmentId` is its artifact identity and can be cited by existing artifact-reference fields. Up to 32 distinct same-owner parent identities are admitted; child and foreign root access is refused. Declared media types do not validate content or authorize training.

Content and manifests use the native SHA256 attachment store. The owner catalog uses the configured native storage-domain backend, separate from Session events; tool inputs and results remain native logged transcript data. Repeating identical bytes and metadata yields the same receipt without using another catalog slot. An owner at its configured capacity cannot write new content. Reads fail on missing/corrupt files or disagreement between an immutable manifest and its catalog. Catalog owner/key disagreement fails plugin initialization.

| Configuration | Default | Applied limit |
|---|---:|---|
| `maxArtifactBytes` | 1,048,576 | Exact stored/read content bytes |
| `maxManifestBytes` | 16,384 | Complete immutable manifest bytes |
| `maxArtifactsPerOwner` | 1,000 | Newly admitted manifests per root |
| `maxToolResultBytes` | 2,097,152 | Complete serialized JSON tool envelope |

Interrupted or rejected saves can leave unreachable immutable files. A successful catalog commit can precede a failed tool-result publication; retry is idempotent, and the host read/list APIs expose the durable receipt. Preserve both the attachment root and catalog backend in backups. Owner identity is a native live Agent identity, not an organizational login. Export/import, retention, delta storage, automated experiment/dataset curation and organizational sharing remain deferred.

## Local decision and open-source search

The opt-in `local-intelligence` entry runs one tool-free, fresh-context native child against an explicitly configured model, validates bounded advisory JSON and rejects invented references. It does not mutate domain facts or promote models. The opt-in `web-searxng` entry registers a bounded native web search provider against a deployment-owned SearXNG JSON endpoint. Both contributions are disposed with their Cordis plugin. The adviser rejects and disposes a provider run without an in-process native child; an explicit local or remote inference endpoint is still supported.

The adviser defaults `includeExecutionContext` to false: executor runtime snapshots are omitted only from its child before native message admission. Owner and unrelated worker contexts retain their contributions. Tool restrictions, approvals and resource checks remain enforced. Set this option to true to reproduce the executor-context baseline; the adviser instruction and supplied task data stay the same.

[Launch instructions](../../../docs/user/d-ai-local.md) cover separate or shared local servers, the restricted root tool catalog and native compaction. The real local acceptance is an environment-gated test, separate from scripted fixture tests. No inference binary, model weight or public search service is bundled into the package.

## Model Experience

### Investigation tools

#### What the model sees

The base D_AI schemas and bounded JSON state, plus three artifact schemas when that plugin is mounted. Source content and independent assessments are untrusted data. Claim tools append observations but provide no operation to self-promote claims to `VERIFIED_WITH_SCOPE`.

#### Token effect

Tool schemas add a fixed prompt cost. Captured content and mission results add variable history cost bounded by configured source/mission limits. Each delegated role has a configured token/request/time/output-byte budget. Artifact writes add no model requests; text reads and receipt lists add history bounded by the artifact tool-result byte limit.

#### KV Cache effect

Tool registration changes the assembled tool prefix once at activation. Subsequent missions append tool results and Session facts without rewriting prior source content. Role children use fresh independent contexts.

## Known Limitations and Deferred Work

The Local Intelligence Core is a separate governed platform component, not a seventh domain, and has no trained or activated D_AI model. Durable task ledgers, fenced leases/checkpoints, budgets, grants, model routing, bounded Director cycles, a durable unattended Director scheduler and budget-safe same-plan parallel worker waves now exist. The scheduler persists cadence/cycle receipts, wakes only idle root Agents, executes inside native Agent turns, preserves lease/fencing recovery, requires human approval for schedule changes, orders due plans fairly within one owner, bounds cross-owner concurrency and can execute independent tasks in exact-task parallel waves without sharing an applicable durable budget profile. Distributed scheduling, broad crash acceptance, provider health/secrets/telemetry, artifact export/import, a complete system-manager hierarchy and the Control Center UI remain unfinished. Real wall-clock usage is measured; automatic token/money/data/human-attention metering and VRAM reservations remain incomplete.

The index is not reconciled automatically after a Session-success/index-failure. A failed Session flush rejects the mutation but native pending in-memory Session events remain visible until retry or restart; no cross-store transaction or rollback is promised. Events emitted inside an interrupted turn retain native Harness recovery semantics. Two POSIX process-crash cases pass through the ordinary built package entry: SIGKILL interrupts either a running worker or a claim between durable lease acquisition and RUNNING; a new process completes the task under fence 2 and both leases remain in the log. Claims persist the lease first, and cold recovery waits for the latest unreleased generation even when the task is still READY. Broader storage/power-loss faults, multiple live writers and live-provider recovery remain unverified.
