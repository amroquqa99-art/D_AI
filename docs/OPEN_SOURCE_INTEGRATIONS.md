# D_AI open-source integration decisions

English | [中文](OPEN_SOURCE_INTEGRATIONS.zh.md)

Reference date: 2026-10-07. Before implementing a feature, compare maintained projects against the concrete requirement, inspect their primary documentation/source, license and dependency footprint, and test the smallest real integration. Prefer reuse that removes owned code. Keep adapters thin, preserve native Session/policy semantics, and reject a dependency that reduces quality or creates disproportionate operating cost. Proposed tools remain unavailable until wired and accepted.

| Requirement | Decision / candidate | Why and acceptance limit |
|---|---|---|
| Provider transport | Reuse native `dsh-llm-pi-ai` | Existing supported adapter; new local roles use its OpenAI-compatible protocol. No duplicate provider client. |
| Local inference | Integrate [llama.cpp](https://github.com/ggml-org/llama.cpp) / [Ollama](https://github.com/ollama/ollama) as external runtimes, both MIT | Quantized inference and model serving are already implemented. Opt-in profile supports their endpoints; actual model quality must be evaluated per artifact. |
| Context and token pressure | Reuse native token meter, bounded fresh subagents and compaction | Durable evidence stays outside lossy summaries. SDK headroom reserves at most one eighth of small model capacity, capped at the existing 4096-token reserve. Estimates are not exact tokenizer counts. |
| Decision help | Native opt-in isolated adviser | One bounded model request, strict JSON and evidence-reference validation; no tools, authority or silent provider fallback. |
| Decision evaluation | Reuse [Promptfoo](https://github.com/promptfoo/promptfoo) 0.124.0, MIT, as an optional external grader | Replays hash-bound native receipts; separate acceptance/action/advisory assertions, no paid judges or replacement inference loop. Published bilingual development cases are not promotion evidence. |
| Web search | Native adapter for [SearXNG](https://github.com/searxng/searxng), AGPL-3.0-or-later | Reuses a mature metasearch engine; configurable service required. Running separately does not automatically settle AGPL obligations for changes or distribution. Live engine acceptance remains pending. |
| Office ingestion | Evaluate [MarkItDown](https://github.com/microsoft/markitdown), MIT | Candidate for ordinary document conversion; sandbox conversion and preserve original artifact/locator references. Not yet connected. |
| Complex PDF/layout/OCR | Evaluate [Docling](https://github.com/docling-project/docling), MIT code | Candidate when simple conversion loses structure. Model-weight licenses and memory costs are separate from code licensing. Not yet connected. |
| Scholarly structure/references | Evaluate [GROBID](https://github.com/kermitt2/grobid), Apache-2.0 code | Candidate for citation-rich academic PDFs; Java service/resource cost must justify extraction improvement. Not yet connected. |
| Authorized cyber templates | Evaluate [Nuclei](https://github.com/projectdiscovery/nuclei), MIT | Candidate provider inside an authorized lab with pinned/reviewed templates and existing permission/side-effect gateway. Not yet connected. |
| Web security lab | Evaluate [ZAP](https://github.com/zaproxy/zaproxy), Apache-2.0 | Candidate for broader defensive workflows; heavier service and target authorization required. Not yet connected. |
| Embeddings/vector retrieval | Evaluate [Text Embeddings Inference](https://github.com/huggingface/text-embeddings-inference), Apache-2.0, and [Qdrant](https://github.com/qdrant/qdrant), Apache-2.0 | Candidate when measured retrieval quality requires them. Indexes must remain rebuildable from permission-scoped records. No new vector dependency installed. |

Composition follows the native Harness services: ingestion produces immutable source artifacts, search yields citeable references, scoped retrieval supplies task context, independent workers generate assessments, and deterministic/runtime verification controls state changes. Linking multiple projects is justified by a tested information path, not by project count.

The [local guide](user/d-ai-local.md) owns launch/configuration instructions. `TEST_REPORT.md` owns executed evidence. `FEATURE_MATRIX.md` owns maturity. A model marketed as modified, unrestricted or extremely light remains a candidate until its exact artifact, license and held-out evaluations pass; custom aliases/endpoints are supported without treating marketing claims as acceptance evidence.
