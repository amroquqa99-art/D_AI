"""Specialized research systems for D_AI.

These systems extend the core research system with domain-specific specialists
that handle specialized research tasks. Each system is a collection of
specialists that work together under the research system's umbrella.

Specialized systems:
- Systematic Review: Cochrane-style systematic reviews with PRISMA compliance
- Meta-Analysis: Quantitative synthesis with forest plots, heterogeneity analysis
- Biostatistics: Statistical analysis, power calculations, sample size
- Clinical Trial: Trial design, randomization, blinding, endpoint analysis
- Genomics: Genomic data analysis, variant calling, pathway analysis
- Pharmacology: Drug interaction, dosing, safety analysis
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

SPECIALIZED_SYSTEMS = {
    "systematic-review": {
        "name": "Systematic Review",
        "description": "Cochrane-style systematic reviews with PRISMA compliance, "
                       "registered protocols, and comprehensive search strategies",
        "specialists": [
            "protocol-designer", "search-strategist", "screening-specialist",
            "extraction-specialist", "risk-of-bias-assessor", "synthesis-specialist",
        ],
        "skills": ["dai-systematic-review"],
        "required_tools": ["dai_search_files", "dai_extract_pdf", "dai_crossref_search"],
        "acceptance": [
            "protocol registered (PROSPERO or equivalent)",
            "search strategy documented and reproducible",
            "screening decisions recorded with reasons",
            "risk of bias assessed for every included study",
            "PRISMA flow diagram produced",
        ],
    },
    "meta-analysis": {
        "name": "Meta-Analysis",
        "description": "Quantitative synthesis with forest plots, heterogeneity "
                       "analysis, sensitivity analysis, and publication bias assessment",
        "specialists": [
            "effect-size-calculator", "heterogeneity-analyst",
            "sensitivity-analyst", "publication-bias-assessor", "forest-plot-generator",
        ],
        "skills": ["dai-meta-analysis"],
        "required_tools": ["dai_calculate_decimal", "dai_summarize_csv"],
        "acceptance": [
            "effect sizes computed with confidence intervals",
            "heterogeneity (I², τ²) reported and interpreted",
            "sensitivity analysis performed",
            "publication bias assessed (funnel plot, Egger test)",
            "GRADE evidence profile produced",
        ],
    },
    "biostatistics": {
        "name": "Biostatistics",
        "description": "Statistical analysis, power calculations, sample size "
                       "determination, and clinical endpoint analysis",
        "specialists": [
            "power-analyst", "sample-size-calculator", "endpoint-analyst",
            "survival-analyst", "diagnostic-test-analyst",
        ],
        "skills": ["dai-biostatistics"],
        "required_tools": ["dai_calculate_decimal", "dai_summarize_csv"],
        "acceptance": [
            "power calculation with stated assumptions",
            "sample size justified",
            "primary endpoint analysis plan",
            "sensitivity analysis for missing data",
            "statistical methods pre-specified",
        ],
    },
    "clinical-trial": {
        "name": "Clinical Trial",
        "description": "Trial design, randomization, blinding, endpoint analysis, "
                       "and regulatory compliance",
        "specialists": [
            "trial-designer", "randomization-specialist", "endpoint-analyst",
            "safety-analyst", "regulatory-specialist",
        ],
        "skills": ["dai-clinical-trial"],
        "required_tools": ["dai_calculate_decimal", "dai_summarize_csv"],
        "acceptance": [
            "trial design with rationale",
            "randomization method specified",
            "blinding described",
            "primary and secondary endpoints defined",
            "safety monitoring plan",
        ],
    },
    "genomics": {
        "name": "Genomics",
        "description": "Genomic data analysis, variant calling, pathway analysis, "
                       "and genomic literature synthesis",
        "specialists": [
            "variant-analyst", "pathway-analyst", "genomic-literature-specialist",
            "variant-interpretation-specialist",
        ],
        "skills": ["dai-genomics"],
        "required_tools": ["dai_search_files", "dai_extract_pdf"],
        "acceptance": [
            "variant calling methodology described",
            "pathway analysis performed",
            "variant interpretation with evidence",
            "genomic findings linked to clinical relevance",
        ],
    },
    "pharmacology": {
        "name": "Pharmacology",
        "description": "Drug interaction, dosing, safety analysis, and "
                       "pharmacokinetic modeling",
        "specialists": [
            "drug-interaction-analyst", "dosing-specialist",
            "safety-analyst", "pharmacokinetic-modeler",
        ],
        "skills": ["dai-pharmacology"],
        "required_tools": ["dai_calculate_decimal", "dai_summarize_csv"],
        "acceptance": [
            "drug interactions identified and classified",
            "dosing rationale documented",
            "safety profile reviewed",
            "pharmacokinetic model assumptions stated",
        ],
    },
}


@dataclass(frozen=True)
class SpecializedSystemSpec:
    """Specification for a specialized research system."""
    id: str
    name: str
    description: str
    specialists: list[str]
    skills: list[str]
    required_tools: list[str]
    acceptance: list[str]


def get_system(system_id: str) -> SpecializedSystemSpec | None:
    """Get a specialized system specification by ID."""
    data = SPECIALIZED_SYSTEMS.get(system_id)
    if data is None:
        return None
    return SpecializedSystemSpec(
        id=system_id,
        name=data["name"],
        description=data["description"],
        specialists=data["specialists"],
        skills=data["skills"],
        required_tools=data["required_tools"],
        acceptance=data["acceptance"],
    )


def list_systems() -> list[SpecializedSystemSpec]:
    """List all specialized research systems."""
    return [get_system(sid) for sid in SPECIALIZED_SYSTEMS]


def systems_for_task(task_description: str) -> list[str]:
    """Suggest specialized systems based on task description keywords.

    This is a heuristic suggestion, not a definitive routing decision.
    The dai-lead agent makes the final routing decision.
    """
    keywords = task_description.lower().split()
    suggestions = []
    keyword_map = {
        "systematic-review": ["systematic", "review", "prisma", "cochrane", "meta-analysis"],
        "meta-analysis": ["meta-analysis", "forest plot", "heterogeneity", "pooling", "synthesis"],
        "biostatistics": ["power", "sample size", "statistical", "endpoint", "survival", "diagnostic"],
        "clinical-trial": ["trial", "randomization", "blinding", "endpoint", "regulatory", "clinical"],
        "genomics": ["genomic", "variant", "pathway", "dna", "gene", "sequencing"],
        "pharmacology": ["drug", "dosing", "pharmacokinetic", "interaction", "safety", "dose"],
    }
    for system_id, kws in keyword_map.items():
        if any(kw in task_description.lower() for kw in kws):
            suggestions.append(system_id)
    return suggestions
