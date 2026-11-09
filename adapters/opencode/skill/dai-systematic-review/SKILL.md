---
name: dai-systematic-review
description: "Systematic review and meta-analysis: PRISMA 2020, registered protocols, multi-database search strategies, screening decisions, risk of bias assessment, GRADE evidence grading, and quantitative synthesis. Use when the task is a systematic review, a meta-analysis, or a scoping review. Never fabricate a source, a study, or an effect size."
---

# dai-systematic-review

Read systems/research/specification.md when the domain contract is needed.

## What this skill does

It turns a broad research question into a reproducible, defensible systematic
review: a registered protocol, a documented search, screened and extracted
studies, assessed risk of bias, a synthesis with its limits, and a GRADE
evidence profile.

## The sequence

1. **Frame the question** — PICO (Population, Intervention, Comparison, Outcome)
   with explicit inclusion/exclusion criteria and a registered protocol
   (PROSPERO or equivalent).
2. **Search** — multi-database (PubMed, Embase, Cochrane, Web of Science),
   multi-language, grey literature, hand-searching. Document the strategy so
   it can be reproduced.
3. **Screen** — two independent reviewers, title/abstract then full text,
   with Cohen's kappa for agreement. Record the reason for every exclusion.
4. **Extract** — standardized form, two independent extractors, with a
   reconciliation step.
5. **Assess risk of bias** — RoB 2 for RCTs, ROBINS-I for non-randomized,
   QUADAS-2 for diagnostic studies.
6. **Synthesize** — narrative synthesis, or quantitative (meta-analysis) with
   forest plots, heterogeneity (I², τ²), sensitivity analysis, and
   publication bias assessment.
7. **Grade** — GRADE for every outcome: starting point, downgrade for risk of
   bias, inconsistency, indirectness, imprecision, publication bias.
8. **Report** — PRISMA 2020 abstract and full report, with a PRISMA flow
   diagram.

## The core is the spine

Open a mission (`dai_mission_create`) with the PICO and acceptance criteria.
Record every material source with `dai_evidence_add` (locator, kind, original
text). Register claims with `dai_claim_add` — `FACT` only for a source you
actually checked, `HYPOTHESIS` for a proposal, `UNKNOWN` for what you could
not establish. Checkpoint before you stop, wait, or switch model. Complete only
with artefacts, real receipts and an independent review.

## Hard rules

- **No fabricated source.** Every study in the review must be retrievable.
- **No fabricated effect size.** Every number must come from a real extraction.
- **No abstract-as-full-text.** An abstract is not a full text; say so.
- **No agreement-as-evidence.** Two reviewers agreeing is not evidence of
  correctness.
- **No silent exclusion.** Every excluded study has a recorded reason.
- **No PRISMA without a flow diagram.** The diagram is part of the report.

## Delegation

- `dai/research/literature` — search strategy and retrieval
- `dai/research/methods` — study design and bias critique
- `dai/research/statistics` — meta-analysis and heterogeneity
- `dai/research/domain-specialist` — domain expertise
- `dai/research/verifier` — independent verification
- `dai/research/reporter` — report synthesis
- `dai/research/systematic-review` — the systematic review specialist
- `dai/research/meta-analysis` — the meta-analysis specialist
- `dai/research/biostatistics` — the biostatistics specialist
