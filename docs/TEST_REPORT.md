# D_AI verification report

Date: 2026-10-05

This report records commands actually run in the independent D_AI checkout during M1. A passing fixture test proves only its tested contract; it does not prove a live provider, external source, browser interaction, or production deployment.

## Source and environment

- The pinned DeepSeek Harness baseline is repository tag `dsh-v0.2.1-alpha.1`.
- The M1 branch started from the D_AI foundation snapshot published on `origin/main` on 2026-10-04.
- Verification used Node v24.19.0 and the repository-pinned `pnpm@11.7.0` on Linux x64/glibc.
- The execution image did not include Node development headers beside the Node binary. The native and full builds used the official Node v24.19.0 header archive after its published SHA256 check passed.
- No model, feed, map, or other live-provider credentials were present.

## Reconciliation findings

The published `pnpm-lock.yaml` contained binary corruption, including null bytes, and `pnpm install --frozen-lockfile` failed before dependency resolution. M1 regenerated the lock from the pinned upstream baseline plus the D_AI workspace manifests using `pnpm@11.7.0`; the repaired file is ASCII, contains both D_AI importers, passes the repository supply-chain policy, and installs immutably in a clean worktree.

The repository also retained byte-identical active and `.disabled` copies of every upstream GitHub workflow. Those active workflows attempted DeepSeek release, issue-policy, preview, custom-runner and real-API jobs in the private D_AI repository. M1 removes their automatic triggers, keeps the full archived copies, retains inert compatibility stubs where historical documentation links require a path, and adds one least-privilege D_AI foundation workflow.

## Commands and results

| Command or check | Result |
|---|---|
| Initial `pnpm install --frozen-lockfile` against the published lock | FAIL as expected during diagnosis: parser rejected a null byte |
| Clean-worktree `corepack pnpm@11.7.0 install --frozen-lockfile --ignore-scripts` against the repaired lock | PASS; 1,391 packages linked and both D_AI importers present |
| `corepack pnpm@11.7.0 dsh --profile web --dump-config` | PASS; base Web profile composed |
| Isolated `d-ai` initialization followed by overlay `--dump-config` | PASS; `d-ai-missions` and `d-ai-locale` rows present |
| `build:native-system` with verified Node v24.19.0 headers | PASS; Linux x64/glibc `system.node` produced |
| Focused Vitest suite for investigation and Arabic locale | PASS; 3 files and 15 tests |
| Focused TypeScript build before generated contracts existed | BLOCKED by missing generated `remote` artifacts |
| Full root build without `NODE_HEADERS_DIR` in this image | BLOCKED by absent Node development headers |
| Full root build with `NODE_HEADERS_DIR` and an 8 GiB Node heap | PASS; host, client, D_AI packages and Web frontend built |
| Focused TypeScript build after the full build | PASS |
| Built `d-ai` profile startup | PASS; server bound to `127.0.0.1:3080` |
| Web authentication and static page check | PASS; unauthenticated request returned 401, authenticated redirect flow returned HTTP 200 and the DSH Local Build page |
| Initial `pnpm run test:docs` | FAIL during diagnosis; identified D_AI documentation structure, pairing-policy, generated-format and terminology violations |
| Final `pnpm run test:docs` after remediation | PASS; 21 gates passed, none failed or skipped |

## Verified D_AI behavior

- The native Cordis service composes missions, evidence records, claims, counterclaims and child-agent delegation.
- Exact live-owner identity checks and fail-closed native approval protect mission creation.
- Mutation requires an open native Agent turn, and append-only `d_ai/fact` replay rebuilds the mission projection.
- Public HTTP(S) source capture stores decoded UTF-8 content hashes, retrieval records and exact excerpt anchors.
- Independent child Agents use fresh contexts, bounded requests, tokens, time and output bytes, plus a native tool allow-list. The test suite includes mutation-tool denial.
- Arabic language registration, reversible `document.dir` switching, LTR isolation for code, URLs, numbers and mathematics, and cleanup behavior pass focused tests.
- The built D_AI profile starts through the native `dsh` launcher and serves the authenticated Web application on loopback.

## Evidence limits

The investigation and web-provider tests use scripted fixtures. No live model request, external research run, original binary evidence capture, institutional grant workflow, browser RTL interaction, or production deployment was verified. The built page proves server and client artifact startup; it does not prove a complete Mission Control UI because that UI has not been implemented.

Durable DAG scheduling, leases and fencing, process-crash recovery, provider routing and real budget accounting, cross-system sharing, backup restore, and the other domain systems remain pending. No production-readiness claim is made.
