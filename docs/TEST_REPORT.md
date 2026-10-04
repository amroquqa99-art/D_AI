# D_AI verification report

Date: 2026-10-04

This report records commands that were actually run in the independent D_AI checkout. A fixture passing test is evidence of the tested contract; it is not evidence of a live provider, browser session or production deployment.

## Source and independence

- Official DeepSeek Harness source: `https://github.com/deepseek-ai/deepseek-harness`
- Pinned source commit: `5badb15009ae1756c3afe0ae0cef1faafc290ccc`
- The D_AI repository contains the source tree and complete upstream ancestry, then applies D_AI commits. The one-time importer was removed after import; no workflow fetches or merges upstream updates.
- The native system addon was built locally from verified Node v24.19.0 headers.

## Commands and results

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm dsh --profile web --dump-config` | PASS |
| Native addon build with `NODE_HEADERS_DIR=/tmp/d-ai-node-headers/node-v24.19.0/include/node` | PASS; `native/system/packages/linux-x64/bin/glibc/system.node` produced |
| Selected upstream Vitest suite after native build | PASS; 9 files, 220 tests |
| `node_modules/.bin/vitest run packages/experimental/d-ai/tests/mission.spec.ts packages/experimental/d-ai/tests/orchestration.spec.ts packages/client/d-ai-locale/tests/locale.client.spec.ts` | PASS; 3 files, 15 tests |
| Persistence catalog generation | PASS; `pnpm gen:persistence-catalog` |
| Full `pnpm run build` with 4 GiB heap | BLOCKED by Node heap exhaustion during host bundling |
| Full `pnpm run build` with 8 GiB heap | PASS |

## Verified D_AI behavior

- Native Cordis service composition for missions, evidence, claims and delegation.
- Exact live owner identity checks and fail-closed native approval for mission creation.
- Mutation restricted to an open native Agent turn; append-only `d_ai/fact` replay rebuilds the mission projection.
- Public HTTP(S) source capture through the native web service, decoded UTF-8 content hashing, retrieval provenance and anchor checks.
- Counterclaims are retained; delegated assessments remain unverified.
- Independent child Agents use fresh contexts, bounded requests/tokens/time/output bytes and an enforced native tool allow-list. A mutation-tool denial test passes.
- Arabic language registration, live `document.dir` switching, RTL/LTR reversible isolation for code/URLs/numbers/math, and cleanup tests.

## Not yet accepted

The D_AI profile and mission workspace are not yet accepted as a running browser path. The complete owner control panel for system capabilities, temporary/permanent institutional grants and grant audit is a documented requirement and remains FOUNDATION. Durable DAG scheduling, leases/fencing, process-crash recovery, provider routing/real budget accounting, live web/model credentials, cross-system sharing, and the other domain systems remain pending. No claim of production readiness is made.
