# ADR 0004 — Native modular runtime with separate inference and search services

English | [中文](0004-local-inference-and-open-source-reuse.zh.md)

- Status: Accepted within the approved native plugin architecture
- Date: 2026-10-07

## Decision

Retain the native Harness/Cordis runtime as a modular monolith and continue the extraction in ADR 0002 (`0002-runtime-decomposition.md`). Keep inference and search in independently configurable external services. Reuse the native provider, subagent, token-meter, compaction, persistence and scoped tool APIs. Local decision assistance is an opt-in plugin, separate from domain mutation and training governance.

## Rationale

The current runtime already owns durable Sessions, independent Agents, projections, fenced task execution and approval. Replacing it would discard verified behavior without evidence of an improved requirement fit. Process-local scheduling and the large service composition root still need work; the architecture is a useful foundation, not proof of production readiness or distributed operation. Small models benefit from concise isolated context and restricted tool catalogs, while domain quality can be evaluated independently of provider transport.

A VM or persistent container can host the same profile and remote inference can reduce desktop load. Serverless request lifetimes do not provide a durable home for active long-running agents. Multi-host workers, cold-session activation and distributed scheduling require explicit future design and failure testing rather than merely deploying the current process in the cloud.

## Consequences and verification

Inference location, endpoint authentication, model licenses and artifact hashes are deployment-owned. Advice is unverified and never widens authority. Existing source/evidence remains authoritative even after context compaction. New model-facing input and output use native child Session logging; no new persistence event generation is introduced. Test real Loader composition, scoped isolation, malformed output, invented references, resource limits, cancellation, disposal and actual model inference separately. Do not promote a tiny model based on one successful output or fixture-only tests.
