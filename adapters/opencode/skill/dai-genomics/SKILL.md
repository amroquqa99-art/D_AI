---
name: dai-genomics
description: "Genomic research: variant calling, pathway analysis, variant interpretation, pharmacogenomics, and genomic literature synthesis. Use when the task involves genomic data, variants, pathways, or gene-disease associations. Never fabricate a variant, a gene, or a pathway."
---

# dai-genomics

Read systems/research/specification.md when the domain contract is needed.

## What this skill does

It turns genomic data into defensible findings: variant calling with methodology, pathway analysis with evidence, variant interpretation with ACMG/AMP guidelines, and clinical relevance assessment.

## The sequence

1. **Frame the genomic question** — what variants, pathways, or genes are relevant?
2. **Identify the data** — WGS, WES, panel, RNA-seq, or published studies?
3. **Variant calling** — germline (GATK, DeepVariant) vs somatic (Mutect2, Strelka2).
4. **Annotation** — VEP, SnpEff, ClinVar, dbSNP, gnomAD.
5. **Pathway analysis** — KEGG, Reactome, GO enrichment, GSEA.
6. **Variant interpretation** — ACMG/AMP guidelines, pathogenicity classification.
7. **Clinical relevance** — phenotype-genotype correlation, pharmacogenomics.
8. **Report** — with evidence for every variant and pathway claim.

## Hard rules

- **No fabricated variant.** Every variant must come from a real dataset or study.
- **No fabricated pathway.** Every pathway must be supported by the data.
- **No pathogenicity without evidence.** ACMG/AMP criteria must be stated.
- **No clinical relevance without validation.** Link to phenotype data.

## Delegation

- `dai/research/literature` — search strategy and retrieval
- `dai/research/methods` — study design and bias critique
- `dai/research/statistics` — statistical calculations
- `dai/research/domain-specialist` — domain expertise
- `dai/research/verifier` — independent verification
- `dai/research/reporter` — report synthesis
- `dai/research/genomics` — the genomics specialist
