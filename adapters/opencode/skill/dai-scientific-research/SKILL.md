---
name: dai-scientific-research
description: "Scientific and scholarly tasks: question framing and claim boundaries, method selection (systematic, scoping, experimental, qualitative, mixed, computational), documented search strategy with dedup and screening, lawful full-text retrieval, source-linked extraction, study quality and bias appraisal, appropriate statistical or qualitative analysis, adversarial checks, cited writing. Use for research assignments and literature reviews. Never reduce research to search-result summaries or fabricate a source, experiment, or full-text access."
---

# dai-scientific-research

Read systems/research/specification.md when the domain contract is needed. Frame question and inclusion/exclusion; retrieve primary sources; distinguish Crossref metadata/abstracts from full text. Delegate literature and methods; analyze study design, bias and independence; calculate actual statistics with bounded tools or installed scientific packages. Preserve evidence and methods, test claims, request missing experiments, review independently and checkpoint. Cooperation with dai-innovation never merges system ownership.

Run this work through the core, not around it. Frame the research question and its acceptance criteria with `dai_mission_create`; record every material source with `dai_evidence_add` (locator and kind, original text preserved); register each claim with `dai_claim_add` and its type — `FACT` only for a source you actually checked, `HYPOTHESIS` for a proposal, `UNKNOWN` for what you could not establish. Checkpoint with `dai_mission_checkpoint` when the work spans steps, when you are waiting, or before you stop. A source that exists is not a source that supports the claim; an abstract is not full text; a proposal is not a finding. See the dai-core reference "the core is the spine" for the full sequence.
