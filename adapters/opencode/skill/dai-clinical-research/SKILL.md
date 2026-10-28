---
name: dai-clinical-research
description: "Clinical and medical AI research: study design, patient data handling, evidence grading, systematic review, regulatory awareness, and reproducible analysis. Use for medical research questions, clinical AI validation, and health-data studies. Never fabricate clinical evidence or claim medical authority."
---

# Clinical and medical AI research

This skill extends `dai-scientific-research` for health and medical domains. It
adds clinical study design, patient-data ethics, regulatory awareness, and
evidence grading to the research spine.

## When to use it

Use this skill when the research question involves:
- patient data, electronic health records, or clinical measurements;
- medical imaging, signals, or biomarkers;
- drug, device, or diagnostic validation;
- clinical outcomes, safety, or efficacy;
- health policy, epidemiology, or public health.

## The clinical research spine

Every clinical research task follows the core spine (see `dai-core` reference
"the core is the spine") with these additions:

1. **Frame** — define the clinical question (PICO or PECO), the population,
   the intervention/exposure, the comparator, and the outcome. State the
   clinical significance, not only the statistical one.
2. **Ethics and data** — identify the data source (EHR, registry, trial),
   the consent basis, the de-identification level, and the data-use
   agreement. No patient-identifying data enters a record. If the data is
   not available, state `UNKNOWN` and stop, do not invent data.
3. **Search** — systematic search across PubMed, Europe PMC, ClinicalTrials.gov
   and the relevant specialty index. Use `dai_crossref_search` for metadata.
   Distinguish abstracts from full text; an abstract is not evidence of a
   result.
4. **Screen** — apply inclusion/exclusion criteria before reading. Record the
   criteria and the counts (identified → screened → included → excluded with
   reasons).
5. **Extract** — for each included study: design, sample, intervention,
   outcome, effect size, confidence interval, limitations, funding, COI.
   Use `dai_extract_pdf` for full-text reading; never claim full-text access
   from an abstract.
6. **Appraise** — risk of bias (RoB 2 for RCTs, ROBINS-I for observational,
   QUADAS-2 for diagnostic). Grade the evidence (GRADE: high/moderate/low/
   very low). A single study is never "conclusive".
7. **Synthesise** — when conditions allow, a meta-analysis with heterogeneity
   assessment (I², τ²) and sensitivity analysis. When they do not, a
   structured narrative synthesis.
8. **Claim** — register each claim with `dai_claim_add` and its type:
   `FACT` only for a source you actually checked, `HYPOTHESIS` for a proposal,
   `UNKNOWN` for what you could not establish. A `FACT` with no source is
   rejected by the core.
9. **Checkpoint** — `dai_mission_checkpoint` with the artifacts that exist,
   the receipts, the pending human or experimental inputs, and the next
   action.

## Clinical AI validation

When the research involves an AI model on clinical data, additionally:

- **Dataset**: state the source, the date range, the population, the
  inclusion/exclusion criteria, and the train/validation/test split if the
  model was trained. A model trained on one site and tested on another is
  a generalisation test; a model tested on its own training data is not.
- **Metric**: report discrimination (AUROC, AUPRC), calibration (Brier,
  reliability curve), and clinical utility (net benefit, decision curve) —
  not only the headline number.
- **Subgroup**: report performance by sex, age, ethnicity and disease
  severity where the data allows. A model that is excellent on average and
  harmful in a subgroup is not a good model.
- **Leakage**: state how temporal leakage, label leakage and selection
  leakage were prevented. A model that uses data not available at decision
  time is not deployable.
- **External validity**: state whether the model was tested on an
  independent cohort, and whether that cohort differs from the training one.
- **Safety**: state what happens when the model is wrong (false positive
  cost, false negative cost) and whether a human override exists.

## Regulatory awareness

D_AI is not a medical device and this skill is not clinical advice. When the
research touches a regulated domain, state the awareness explicitly:

- **FDA / MHRA / EU MDR**: a software that supports a diagnostic decision may
  be a medical device. The research must not claim regulatory clearance.
- **HIPAA / GDPR / local law**: patient data handling must comply with the
  applicable privacy regime. State which regime applies and whether the data
  was de-identified.
- **Clinical trial registration**: interventional studies should be
  registered (ClinicalTrials.gov, EU-CTR) before enrolment.
- **Pre-registration**: observational and experimental studies should be
  pre-registered where the discipline expects it.

These are awareness points, not legal advice. The legal advisor system must
confirm the applicable law for the owner's jurisdiction.

## Evidence grading (GRADE)

| Grade | Meaning |
|---|---|
| High | further research is very unlikely to change the conclusion |
| Moderate | further research is likely to have an important impact |
| Low | further research is very likely to have an important impact |
| Very low | any estimate is very uncertain |

A single observational study starts at Low. A single RCT starts at High.
Downgrade for risk of bias, inconsistency, indirectness, imprecision,
publication bias. Upgrade for large effect, dose-response, and plausible
confounding.

## What this skill does not do

- It does not diagnose, treat, or advise any patient.
- It does not claim regulatory clearance for any method.
- It does not fabricate a cohort, a measurement, or a result.
- It does not present an abstract as full text.
- It does not present a model's internal confidence as clinical evidence.

## Cooperation

- **Innovation** is asked for the hypothesis shape and the mechanism.
- **Investment** is asked when the research has a commercial path.
- **Cyber** is asked when the study involves a data breach or a security
  incident.
- **Advisors (legal)** is asked for the applicable privacy regime and the
  data-use agreement.
- **Engineering** is asked for the reproducible pipeline and the data
  versioning.

The findings of each system are attributed to it; they are not merged into one
confident summary.
