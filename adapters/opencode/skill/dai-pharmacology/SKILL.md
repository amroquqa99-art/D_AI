---
name: dai-pharmacology
description: "Pharmacology research: drug interactions, dosing, safety analysis, pharmacokinetic modeling, and regulatory requirements. Use when the task involves drugs, dosing, drug interactions, or pharmacokinetics. Never fabricate a drug interaction, a dose, or a safety signal."
---

# dai-pharmacology

Read systems/research/specification.md when the domain contract is needed.

## What this skill does

It turns pharmacological data into defensible findings: drug interactions classified by severity, dosing rationale with evidence, safety profiles with adverse reactions, and pharmacokinetic models with stated assumptions.

## The sequence

1. **Frame the pharmacological question** — what drug, what interaction, what outcome?
2. **Identify the data** — clinical trials, pharmacokinetic studies, case reports, databases.
3. **Drug interactions** — CYP450 interactions, pharmacodynamic interactions, contraindications.
4. **Dosing** — therapeutic drug monitoring, renal/hepatic adjustment, paediatric dosing.
5. **Safety** — adverse drug reactions, pharmacovigilance, black box warnings.
6. **Pharmacokinetics** — absorption, distribution, metabolism, excretion (ADME).
7. **Reporting** — regulatory requirements, drug monographs, safety profiles.

## Hard rules

- **No fabricated drug interaction.** Every interaction must come from a real source.
- **No fabricated dose.** Every dose must be supported by evidence.
- **No safety claim without evidence.** Every safety statement must cite a source.
- **No pharmacokinetic model without stated assumptions.**

## Delegation

- `dai/research/literature` — search strategy and retrieval
- `dai/research/methods` — study design and bias critique
- `dai/research/statistics` — statistical calculations
- `dai/research/domain-specialist` — domain expertise
- `dai/research/verifier` — independent verification
- `dai/research/reporter` — report synthesis
- `dai/research/pharmacology` — the pharmacology specialist
