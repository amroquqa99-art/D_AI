---
name: dai-meta-analysis
description: "Quantitative synthesis and meta-analysis: effect sizes, pooling methods, heterogeneity analysis, sensitivity analysis, publication bias assessment, and GRADE evidence grading. Use when the task is a meta-analysis or quantitative synthesis. Never fabricate a study, an effect size, or a confidence interval."
---

# dai-meta-analysis

Read systems/research/specification.md when the domain contract is needed.

## What this skill does

It turns a set of studies into a quantitative synthesis: effect sizes with
confidence intervals, pooling with heterogeneity assessment, sensitivity
analysis, publication bias evaluation, and a GRADE evidence profile.

## The sequence

1. **Define the effect measure** — SMD, RR, OR, HR, or NNT.
2. **Compute effect sizes** — from raw data or extracted from studies.
3. **Choose the pooling model** — fixed-effect (Mantel-Haenszel, inverse
   variance) or random-effects (DerSimonian-Laird, REML).
4. **Assess heterogeneity** — I², τ², Q test, prediction intervals.
5. **Sensitivity analysis** — leave-one-out, subgroup analysis, meta-regression.
6. **Assess publication bias** — funnel plot, Egger test, trim-and-fill.
7. **Grade** — GRADE for each outcome.
8. **Report** — forest plot, heterogeneity table, sensitivity table, funnel
   plot, GRADE profile.

## Hard rules

- **No fabricated effect size.** Every number must come from a real extraction.
- **No pooling without heterogeneity assessment.** Report I² and τ².
- **No fixed-effect without justification.** State why fixed-effect is appropriate.
- **No publication bias assessment with fewer than 10 studies.** State the
  limitation.
- **No GRADE without the full evidence profile.**

## Delegation

- `dai/research/literature` — search strategy and retrieval
- `dai/research/methods` — study design and bias critique
- `dai/research/statistics` — statistical calculations
- `dai/research/domain-specialist` — domain expertise
- `dai/research/verifier` — independent verification
- `dai/research/reporter` — report synthesis
- `dai/research/meta-analysis` — the meta-analysis specialist
- `dai/research/biostatistics` — the biostatistics specialist
