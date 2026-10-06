# D_AI Engineering Working Agreement

This document defines the engineering operating system for D_AI. It is intentionally stricter than a style guide: it governs how changes are understood, designed, implemented, verified, reviewed, documented, and promoted.

It consolidates the project’s prior operating methods into one executable agreement: evidence-first investigation, AREP/DSRP/SESE research discipline, AICPOS-style context/decision/quality gates, durable-state engineering, adversarial review, failure memory, and small reversible change sets.

## 1. Source-of-truth hierarchy

When two sources disagree, use this order:

1. Approved locked product specification and acceptance matrix.
2. Security, policy, persistence and migration invariants.
3. Accepted ADRs.
4. Executable contracts and tests.
5. Current implementation.
6. Explanatory documentation and examples.

Never “fix” a test merely to make CI green when the test encodes a higher-level invariant.

## 2. Capability truth

Every capability is classified as one of:

- `AVAILABLE`: implemented and usable in the current runtime path.
- `NEEDS_INPUT`: implementation exists but requires missing user/project data.
- `NEEDS_APPROVAL`: implementation exists but the action is approval-gated.
- `UNAVAILABLE`: not implemented or not connected to a real runtime path.

Product maturity is tracked separately:

- `DESIGNED`
- `FOUNDATION`
- `INTEGRATED`
- `TESTED`
- `LIVE_VERIFIED`
- `BLOCKED`

Do not infer a stronger state from source-file existence.

## 3. Mandatory change loop

Every non-trivial change follows:

```text
UNDERSTAND
→ MAP CONTRACTS
→ IDENTIFY BLAST RADIUS
→ DESIGN
→ IMPLEMENT
→ TEST
→ ADVERSARIAL REVIEW
→ REFACTOR
→ RETEST
→ DOCUMENT
→ PROMOTE
```

### 3.1 Understand

Before editing:

- state the behavioral objective in one sentence;
- identify current runtime entrypoints;
- read the closest tests, state/projection contracts and relevant ADRs;
- distinguish required behavior from optional improvement;
- identify invariants that must not change.

### 3.2 Map contracts

For the touched subsystem, identify:

- inputs and outputs;
- persistent event/schema contracts;
- tool/API contracts;
- authorization requirements;
- ownership and isolation boundaries;
- idempotency/retry semantics;
- resource budgets;
- failure states;
- observability/audit requirements.

### 3.3 Blast-radius analysis

Before modifying a shared service, enumerate its consumers.

A change is high-blast-radius when it touches any of:

- Session event types or persistence schemas;
- authorization/policy;
- task state machines;
- model/tool routing;
- shared evidence state;
- public tool schemas;
- recovery/replay behavior;
- cross-system interfaces.

High-blast-radius changes require a focused regression test before promotion.

## 4. Architecture rules

### 4.1 Separate responsibilities

D_AI keeps these concerns distinct:

- domain state and schemas;
- deterministic projections;
- orchestration/agent strategy;
- application services;
- tool/API adapters;
- policy/approval;
- persistence;
- evidence/provenance;
- scheduling/execution;
- model routing;
- UI/presentation.

A file that begins mixing unrelated concerns is split before more behavior is added.

### 4.2 Composition roots stay thin

Composition modules should wire services, projections, tools and configuration. They must not become the permanent home for every domain implementation.

### 4.3 State is external and reconstructible

The authoritative state is not an LLM conversation summary.

Use:

- append-only raw events where appropriate;
- typed structured state;
- deterministic projections;
- immutable evidence/artifacts;
- explicit provenance;
- recoverable derived indexes.

Restart must reconstruct logical state without relying on hidden model reasoning.

### 4.4 Graphs are not interchangeable

Keep separate:

- agent ownership tree;
- task dependency DAG;
- evidence/knowledge graph;
- model lineage graph;
- organizational/permission relationships.

A shared UI may visualize them together, but persistence and semantics remain distinct.

### 4.5 No silent shared mutable state

Mutable process-local state must be scoped, bounded, observable and reconstructible where durability is required.

## 5. Contract-first TypeScript

- Prefer explicit domain types over primitive bags.
- Validate boundary input once, then operate on typed values.
- Avoid `any`, unsafe casts and duplicated schema definitions.
- Optional properties must honor `exactOptionalPropertyTypes`; omit absent fields rather than writing `undefined`.
- State transitions go through named transition functions.
- Error states use stable error codes/classes at runtime boundaries.
- Public contracts document invariants, not obvious syntax.

Comments explain **why, invariants, non-obvious trade-offs or protocol constraints**. Do not narrate obvious code.

## 6. Persistence discipline

Any persistent Session/event change requires:

1. schema definition;
2. event JSDoc;
3. deterministic projection behavior;
4. replay/restart test;
5. persistence catalog regeneration;
6. compatibility/migration review;
7. documentation of externally observable format changes when applicable.

Never rewrite historical facts to simplify a projection.

## 7. Safe modification protocol

To reduce regressions:

- separate behavior-preserving refactors from feature changes when practical;
- make the smallest coherent change that establishes the next contract;
- add a regression test before fixing a reproduced bug;
- preserve old behavior unless the change explicitly replaces it;
- avoid broad search/replace across domain logic;
- do not rename or move persistence/public contracts without migration analysis;
- after touching a shared primitive, run its direct tests and at least one downstream integration path.

A “cleanup” that changes behavior is a feature and is reviewed as one.

## 8. Research and reasoning protocols

### 8.1 AREP — Advanced Research & Experimentation Protocol

Use when architecture or behavior is uncertain:

```text
Problem
→ Subproblems
→ Competing hypotheses
→ Tests
→ Evidence
→ Counter-evidence
→ Decision
→ Action
```

Include baseline/control, edge cases, stress cases, ablation where useful, reproducibility and independent verification.

### 8.2 DSRP — Deep Source Research Protocol

Use for external technical claims or design choices:

- prefer primary documentation/source code;
- trace claims to evidence;
- search for contradictory results;
- distinguish what a source says from what it proves;
- record limitations and confidence;
- identify unresolved gaps before treating a conclusion as settled.

### 8.3 SESE — Simulation & Experimentation System

Use for algorithms, schedulers, model behavior and resource policies:

```text
Hypothesis
→ Variables
→ Controls
→ Procedure
→ Measurement
→ Error analysis
→ Revision
```

Simulation is evidence about the model of a system, not automatic proof about production reality.

## 9. Context preflight

Before a substantial coding change, the engineer/agent should know:

- current branch/head;
- relevant product requirement;
- current subsystem status;
- files and contracts being changed;
- latest test evidence;
- known blockers/failures;
- intended rollback point.

Do not load unrelated project history into the active context. Retrieve detailed knowledge only when it affects the current decision.

## 10. Failure memory

Failures are engineering data.

For non-trivial failures record:

- symptom;
- root cause;
- affected invariant;
- reproduction;
- fix;
- regression test;
- whether the failure pattern can recur elsewhere.

Do not repeatedly retry the same strategy without new evidence.

## 11. Verification model

Generation and verification are separate roles.

Prefer, in order:

1. deterministic verifier/compiler/type system;
2. executable test;
3. independent source/data verification;
4. independent reviewer/agent;
5. model self-review.

A model judge is not the sole authority when a deterministic check exists.

## 12. Testing expectations

Changes should use the smallest relevant set, then the package gate.

Typical D_AI gates:

- unit tests for pure logic;
- state-machine transition tests;
- projection/replay tests;
- authorization negative tests;
- restart/recovery integration tests;
- fixture-model orchestration tests;
- live-provider tests only when real credentials/environment are available and explicitly identified;
- persistence catalog generation/verification;
- TypeScript project-reference build.

Critical workflows also test cancellation, timeout, duplicate execution and retry/idempotency when applicable.

## 13. Code quality

Code should look like it was produced and reviewed by an experienced engineering team:

- domain terminology is consistent;
- modules have a single understandable purpose;
- functions are short enough to reason about locally;
- complex invariants are named;
- magic constants are centralized;
- duplication is removed when semantics are truly shared;
- abstractions are introduced after a stable pattern emerges, not before;
- APIs are boring and predictable;
- comments are sparse and useful;
- no decorative prose, self-congratulation or AI-oriented wording in implementation comments;
- no generated-looking blocks of nearly identical code when a typed shared abstraction is clearer.

Readable explicit code is preferred over clever code.

## 14. Review gates

Before promotion, ask:

### Correctness
- Does the implementation satisfy the specified behavior?
- Are invalid states rejected?

### Evidence
- What executable evidence proves the change works?
- Is any claim still fixture-only?

### Regression
- What existing behavior could this break?
- Which regression test covers that path?

### Security/policy
- Did permissions or data exposure change?
- Are approvals enforced in code rather than prose?

### Durability
- Does restart/replay preserve the state correctly?
- Can a retry duplicate an external side effect?

### Resources
- Is execution bounded by time/concurrency/cost where relevant?

### Maintainability
- Is the responsibility in the right module?
- Did the change increase coupling or duplicate contracts?

A failed gate produces a fix/retest loop, not a documentation excuse.

## 15. Commit discipline

A commit should communicate one engineering intent.

Preferred sequence for risky work:

1. characterization/regression tests;
2. behavior-preserving extraction/refactor;
3. feature implementation;
4. additional verification/hardening;
5. documentation/status update.

Do not mix unrelated domains in one commit.

## 16. Status reporting

Every engineering checkpoint reports:

- Delivered — concrete files/commits;
- Tests — exact pass/fail state;
- Live Integrations Proven;
- Mock/Fixture-only Paths;
- Blockers;
- Security/Resource notes;
- Next executable task.

No invented test results, model runs, commits, metrics or completion percentages.

## 17. Definition of done

A feature is not done because code exists.

For a normal D_AI runtime feature, done means:

- contract implemented;
- runtime path connected;
- authorization/resource rules connected where applicable;
- persistence/recovery behavior addressed;
- tests pass;
- negative path tested;
- documentation/status updated;
- no known regression left hidden.

For high-impact features, independent review and live verification may also be required.
