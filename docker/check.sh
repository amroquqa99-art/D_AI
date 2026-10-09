#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

node --test docker/tests/check-runner.test.mjs
node --test packages/experimental/d-ai/tests/director-owner-order.test.mjs
pnpm run verify-persistence-catalog
pnpm exec tsc -b packages/experimental/d-ai/tsconfig.json --pretty false
pnpm run build
node --experimental-transform-types --test \
  packages/experimental/d-ai/tests/director-scheduler-coordinator.test.mjs \
  packages/experimental/d-ai/tests/director-recovery-process.test.mjs \
  packages/experimental/d-ai/tests/artifact-store-built.test.mjs
NODE_USE_ENV_PROXY=0 pnpm exec vitest run \
  packages/llm/llm-pi-ai/tests/small-context-budget.spec.ts \
  packages/llm/llm-pi-ai/tests/adapter.spec.ts --maxWorkers=4
NODE_USE_ENV_PROXY=0 pnpm exec vitest run packages/experimental/d-ai/tests --maxWorkers=4
