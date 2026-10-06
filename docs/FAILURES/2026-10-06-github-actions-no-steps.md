# Failure record — GitHub Actions job terminates before steps

- Date first recorded: 2026-10-06
- Status: OPEN
- Scope: repository CI infrastructure
- Severity: HIGH for verification; LOW for runtime behavior
- Owner: build/CI

## Symptom

Pushes to `dai/v2-core-foundation` create the expected `D_AI v2 checks` workflow run, but its `d-ai-v2` job terminates with `failure` before any workflow step executes.

Observed example:

- head: `0075ee1b0eabe138a0c2b73fd5f32d18d57da4c3`
- workflow run: `37457295066`
- job: `112247906618`
- job conclusion: `failure`
- reported steps: `[]`

The same no-step behavior has appeared across multiple consecutive commits. The independent `weighted-approval` workflow also fails at job startup during the same period.

## What this proves

It proves only that GitHub Actions did not execute the current verification gate.

It does **not** prove:

- that install fails;
- that TypeScript fails;
- that D_AI tests fail;
- that current branch code passes.

## Workflow inspection

`.github/workflows/d-ai-v2-checks.yml` currently contains:

- `runs-on: ubuntu-latest`;
- checkout, pnpm and Node setup steps;
- frozen-lockfile install;
- persistence generation/verification;
- native-system build;
- TypeScript project-reference build;
- D_AI registry and package tests.

No missing `runs-on` or empty `steps` definition was found in source.

## Root cause

UNKNOWN.

Do not label the cause as runner capacity, billing, repository Actions policy, GitHub outage or YAML validation without direct evidence.

## Impact

- current refactor and v2 runtime work cannot be promoted to VERIFIED;
- persistence/type/build/test regressions cannot currently be detected by repository CI;
- high-blast-radius behavioral changes should be minimized until an executable gate is available.

## Current containment

- current work is labeled `CI_PENDING`;
- historical verified results remain separated from current branch claims;
- changes are kept small/reversible;
- characterization and architecture tests are added in source even though current CI cannot execute them;
- behavior-preserving decomposition is preferred over new high-risk behavior.

## Exit criteria

Close this failure record only when a current-head D_AI workflow run executes its steps and produces observable command results.

After recovery, immediately run the complete D_AI gate and treat any resulting code/test failures as separate failure records where appropriate.
