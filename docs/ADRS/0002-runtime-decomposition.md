# ADR 0002 — Decompose the D_AI runtime composition root incrementally

- Status: Accepted
- Date: 2026-10-06
- Scope: `packages/experimental/d-ai`

## Context

The D_AI native service grew while multiple domain vertical slices and shared-core capabilities were connected to the Harness runtime. The main `src/index.ts` now contains composition, configuration, projection mounting, state access, domain application methods, policy operations, scheduling operations and tool registration.

The implementation is functional enough to expose real runtime paths, but keeping these responsibilities in one file increases review cost and regression risk. A single large rewrite would create a different risk: too many semantic changes at once, difficult review, and weak rollback granularity.

## Decision

Decompose the runtime **incrementally with behavior-preserving commits**.

The target separation is:

```text
config/
  deployment/runtime normalization

runtime/
  service composition
  projection mounting
  lifecycle/disposal

core/
  task/execution
  control plane
  budgets
  evidence
  model/training lifecycle
  mission director

domains/
  investigation
  scientific research
  investor
  cybersecurity
  operations intelligence
  innovation discovery

tools/
  shared/core tool registration
  per-domain tool registration
```

Existing source files may remain flat while extraction is in progress; the important rule is responsibility boundaries, not directory aesthetics.

## Extraction order

1. Configuration normalization.
2. Projection registration and service lifecycle wiring.
3. Tool registration by shared-core/domain boundary.
4. Shared-core application services.
5. Domain application services.
6. Final thin composition root and package exports.

Each extraction must:

- preserve tool names and schemas unless a separate contract change is approved;
- preserve Session event and projection semantics;
- add or retain characterization tests;
- avoid persistence migrations unless the extraction genuinely requires one;
- keep rollback possible at commit granularity.

## Alternatives considered

### Keep the monolithic service

Rejected. It optimizes short-term insertion speed at the cost of increasing coupling, merge conflicts and regression probability.

### Rewrite the package into a new architecture in one change

Rejected. It would mix refactor and behavior change, make failure localization difficult and violate the project’s small-reversible-change rule.

### Split only by line count

Rejected. File size is a signal, not the architecture. Boundaries are based on responsibility and contracts.

## Consequences

Positive:

- lower blast radius for future domain work;
- clearer ownership for human reviewers;
- easier targeted tests;
- less duplicated registration/configuration code;
- easier addition/removal of systems.

Costs:

- temporary adapters and intermediate seams while extraction is incomplete;
- additional commits with little visible product behavior;
- some duplicated imports until the final composition cleanup.

## Verification

A behavior-preserving extraction is accepted only when:

- package TypeScript build passes;
- D_AI tests pass;
- persistence catalog verification remains unchanged unless persistent contracts were intentionally modified;
- runtime tool names and domain behavior remain stable.

The first extraction is `src/config.ts`, which centralizes deployment configuration without changing domain behavior.
