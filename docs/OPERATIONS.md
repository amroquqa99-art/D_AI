# D_AI operations reference

## Current runnable state

The checkout contains the real Harness source and build tooling. A verified D_AI mission workflow and complete mission UI are not yet available. The integrator records exact successful install, build and startup commands in [TEST_REPORT.md](TEST_REPORT.md). Upstream contributor instructions remain in [development.md](development.md), and profile composition remains in [architecture.md](architecture.md).

## Prerequisites and builds

The upstream workspace requires a supported Node release and pnpm. This development run uses Node 24.19.0 and pnpm 11.7.0. Linux native-addon compilation needs a C compiler and Node-API headers. The root host-addon build does not require a full Landlock release build. An optional `NODE_HEADERS_DIR` can select an existing header directory; invalid explicit paths fail before compilation. The complete native release build has separate compiler requirements documented by the native workspace.

The tested native build invocation and its environment-dependent header path belong in [TEST_REPORT.md](TEST_REPORT.md). Do not treat a local header cache path as a portable Arch installation instruction. Full-build success, browser startup and a fresh-checkout Arch procedure must be recorded independently.

## Launch and providers

Supported application launches use named `dsh` profiles. A source overlay or native bundle composes D_AI into that runtime. A separate Node application executable is not an approved launcher. Until a D_AI profile and startup are verified, do not substitute an unrelated external web application.

Configure an authorized local or cloud model before claiming live agent behavior. No configured provider credential has yet produced accepted D_AI live-model evidence. Local model execution requires a running compatible model service and a tested route. Offline operation queues or pauses unavailable remote work; a powered-off local machine cannot continue computation without separately hosted workers.

## Data, recovery and upgrades

Harness sessions persist through the native provider. D_AI task/evidence reconstruction, export/import and backup/restore remain acceptance items. Avoid deleting persistent session generations or overwriting raw evidence. Validate a backup restore against an isolated copy before upgrading the active workspace. Retain the source licenses. The upstream remote supports optional manual audits only; D_AI has no automatic upstream update workflow.

## Failure reporting

Record the exact command, environment, failure and repair evidence. Native header errors require a real header installation or validated build-time override. Provider authentication and network errors are blockers, not successful research results. Stop or cancel through runtime controls when available; do not claim a D_AI kill switch until its complete path is tested.

## Unattended owner recovery

Enable recovery only for explicitly configured persisted root Sessions with an approved active Director schedule. The scheduler does not enumerate stored Sessions. Each route supplies the native model adapter, model and maximum inspected event count. Configuration defaults to no recovery owners and accepts at most 32 unique identities.

```yaml
directorSchedulerEnabled: true
directorSchedulerPollMs: 1000
directorSchedulerMaxConcurrentCycles: 1
directorSchedulerResumeOwners:
  - sessionId: my-root-session
    provider: mock
    model: fixture
    maxEvents: 10000
```

The example route is the scripted native acceptance fixture. Replace it with an authorized, configured adapter and model for deployment. Recovery requires a native Session persistence backend. It reads at most `maxEvents + 1` logical events and refuses an overflow; the backend may perform additional physical I/O. Native resume then acquires exclusive write ownership and repairs an interrupted turn. Publication rechecks eligibility and the loaded event count. No new Session format is introduced.

Disabled schedules, completed plans, seeded/forked Sessions, failed projections, and pending human or mixed messages stay inactive. A sole valid saved scheduler wake can resume through the native inbox with its original identity. Due runnable tasks respect durable budgets; interrupted tasks and runnable tasks with an unreleased lease wait for their latest lease generation to expire before recovery. New task claims persist the lease before marking the task RUNNING, so a crash between those writes leaves runnable work with a recoverable lease. Future eligible owners use persistence revisions to avoid repeated full inspection. Recovery shares scheduler capacity with active cycles and queued wakes. Shutdown drains only the Agent handles acquired by recovery and preserves manually opened owners.

Recovery restores the configured root under the current application composition; it does not reconstruct arbitrary former scoped plugins or credentials. Cross-process ownership exclusion comes from native persistence, not a distributed D_AI scheduler. Live connectors, power-loss storage integrity, multi-host scheduling and full live missions need separate acceptance. Exact local results are in [the verification report](TEST_REPORT.md).

## Experiment artifact storage

Mount the optional [artifact plugin](../packages/experimental/d-ai/README.md#immutable-experiment-artifacts) before root creation; the source-checkout patch is [cordis.artifacts.patch.yml](../packages/experimental/d-ai/cordis.artifacts.patch.yml). Native attachment and catalog providers must both be configured. The Web profile supplies attachments; a headless composition must mount its own attachment provider. The local profile's explicit root-tool restriction requires adding the three artifact tool names before they are usable.

Back up the configured storage-domain backend containing `d_ai_artifact_catalog` and the attachment provider's immutable files together. A local attachment provider stores them below its configured harness home. Retaining only Sessions does not retain these assets. Restore both stores and resume the same authorized root Session identity before using receipts. No automatic import, deletion or cross-owner sharing is provided. Default limits and commit/failure behavior are owned by the package README; choose smaller text-result limits when the model's context budget requires them.
