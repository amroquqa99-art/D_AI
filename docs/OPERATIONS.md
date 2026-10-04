# D_AI operations reference

## Current runnable state

The checkout contains the real Harness source and build tooling. A verified D_AI mission workflow and complete mission UI are not yet available. The integrator records exact successful install, build and startup commands in [TEST_REPORT.md](TEST_REPORT.md). Upstream contributor instructions remain in [development.md](development.md), and profile composition remains in [architecture.md](architecture.md).

## Prerequisites and builds

The upstream workspace requires a supported Node release and pnpm. This development run uses Node 24.19.0 and pnpm 11.25.0. Linux native-addon compilation needs a C compiler and Node-API headers. The root host-addon build does not require a full Landlock release build. An optional `NODE_HEADERS_DIR` can select an existing header directory; invalid explicit paths fail before compilation. The complete native release build has separate compiler requirements documented by the native workspace.

The tested native build invocation and its environment-dependent header path belong in [TEST_REPORT.md](TEST_REPORT.md). Do not treat a local header cache path as a portable Arch installation instruction. Full-build success, browser startup and a fresh-checkout Arch procedure must be recorded independently.

## Launch and providers

Supported application launches use named `dsh` profiles. A source overlay or native bundle composes D_AI into that runtime. A separate Node application executable is not an approved launcher. Until a D_AI profile and startup are verified, do not substitute an unrelated external web application.

Configure an authorized local or cloud model before claiming live agent behavior. No configured provider credential has yet produced accepted D_AI live-model evidence. Local model execution requires a running compatible model service and a tested route. Offline operation queues or pauses unavailable remote work; a powered-off local machine cannot continue computation without separately hosted workers.

## Data, recovery and upgrades

Harness sessions persist through the native provider. D_AI task/evidence reconstruction, export/import and backup/restore remain acceptance items. Avoid deleting persistent session generations or overwriting raw evidence. Validate a backup restore against an isolated copy before upgrading the active workspace. Retain the source licenses. The upstream remote supports optional manual audits only; D_AI has no automatic upstream update workflow.

## Failure reporting

Record the exact command, environment, failure and repair evidence. Native header errors require a real header installation or validated build-time override. Provider authentication and network errors are blockers, not successful research results. Stop or cancel through runtime controls when available; do not claim a D_AI kill switch until its complete path is tested.
