# D_AI model routing — automatic value or exact manual choice

The original OpenCode session model picker remains in place and user-controlled.
The value-based decision code is present in both D_AI Core's project-scoped
ModelRegistry route command and the separate D_AI OpenCode worker router. It
does not replace the main OpenCode conversation selector or connect the
read-only D_AI Desktop mission panel to live model execution.

## Automatic (initial worker policy)

Auto selects again for each new delegated research, implementation or review
task; it never freezes a single provider/model for all future tasks. Free and
paid models are considered equally if available through the current connected
OpenCode catalog. There is no special bonus for a free model.

It checks native tool support, availability, documented input/output pricing
in USD per million tokens, and task-specific quality scores when the owner's
benchmark profile has a VERIFIED_OK label and a nonempty evidence reference.
Benchmark sources must actually be checked by the owner; a string and flag
alone are not cryptographic proof of performance.

Among models whose documented quality is within the configured number of
points of the highest measured score, Auto picks the lower estimated cost.
Without task-quality evidence it records a cost-only fallback, and never
presents that as proven best-quality routing. Missing pricing is UNKNOWN,
never zero. Different price tiers are conservatively estimated at the highest
applicable catalog tier.

The default quality band is 5/100. Expected token profiles are editable in
config/model-routing-policy.json. The optional max_estimated_usd_per_task is a
*forecast filter*, NOT a provider-enforced spending limit. A real spend cap
requires host/provider enforcement and an approved charter. No model is retried
on another paid provider after ambiguous execution or a failure.

## Manual

An exact provider/model/variant can be selected in OpenCode's normal model
picker. D_AI worker model selections can additionally be pinned for individual
task classes, globally or per workspace, using the native /dai-models form.
Manual choices always override Auto; there is no unrequested automatic change
of a pinned model.

A worker preference that stores mode=auto is a policy. A worker preference
that stores model=provider/model is an exact model pin.

## Example benchmark metadata (illustrative; NOT measured results)

A record in config/model-profiles.json may describe:
- id: provider/model
- allow_worker: true
- benchmark_status: VERIFIED_OK
- benchmark_evidence: project://benchmarks/implementation-run-18
- quality_by_task: { implementation: 92, review: 89 }

Scores must be populated from relevant repeatable tests or validated evidence
rather than model vendor marketing claims or inferred performance. The routing
receipt records a SHA-256 digest of the quality evidence locator, predicted
task USD, reason and catalog model ID. The original locator stays in the
owner-maintained profile and is not copied into plaintext job receipts.

## Integration boundary

The D_AI OpenCode router now supports this selection strategy. D_AI Desktop
still provides the inherited OpenCode manual model picker and provider login;
its separate D_AI mission bridge is read-only. This is not proof of packaged
GUI sign-in, a live paid request, a final installer, or OS-wide billing limits.

## D_AI Core project-scoped CLI

The Core command supports `dai model route --project PROJECT --task-class review`
(value mode by default), and explicit `--selection-mode lowest_cost`,
`--quality-slack 0` for quality-first ranking among assessed models. Model
registration can accept `--quality-by-task '{"review":"94"}'` together with
`--quality-evidence benchmark://your-real-report`. These scores and source
references belong in the encrypted project model record, not the plaintext
model index. Core prices are USD per **1,000** tokens; the native OpenCode
plugin consumes USD per **million** tokens from the host catalog. Each path
normalizes its own pricing units before comparison.

These interfaces are development-stage. No current integration proves a hard
money cap or production-quality performance data for any specific model.
