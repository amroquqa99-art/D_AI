# D_AI local inference and search

English | [中文](d-ai-local.zh.md)

This source-checkout tutorial connects self-hosted models to the native Harness web profile. It enables a bounded investigation preset and a separate decision adviser; it does not provide the planned complete D_AI Control Center. Install the repository's supported Node/pnpm versions and build it before starting the web app. Model servers are separate processes; models are not downloaded automatically by the Harness.

## 1. Select and start inference

Use [llama.cpp](https://github.com/ggml-org/llama.cpp) or [Ollama's OpenAI-compatible API](https://docs.ollama.com/api/openai-compatibility). Start with a quantized small model, a 4096-token server context and one inference slot. A model file's size is not its runtime RAM or VRAM requirement. Measure memory, latency, valid tool calls and domain quality before increasing context or concurrency. Models marketed as unrestricted or modified still need a traceable base, license, artifact hash and passing evaluation; that label is not a quality measure.

The [Qwen3.5 family](https://huggingface.co/Qwen) includes 0.8B, 2B and 4B candidates. A tiny adviser can recommend a bounded next step; it cannot establish scientific truth or replace domain verification. Pick a stronger worker only after measuring available resources. Do not load multiple models into a 6 GB GPU without measuring their combined weights, caches and runtime overhead. The initial profile permits one adviser call at a time; GPU reservations and automatic model swapping are not implemented by D_AI.

For llama.cpp, download a reviewed GGUF, verify its publisher's SHA256 and start a server. The alias below matches the profile's decision route:

```sh
llama-server -m /absolute/path/reviewed-model.gguf \
  --alias dai-decision --host 127.0.0.1 --port 8081 \
  --ctx-size 4096 --parallel 1 --jinja --reasoning off
```

Start the worker separately on port 8080 with alias `dai-worker`, or point both roles at the same server/model to avoid a second resident model. CPU-only testing uses `--n-gpu-layers 0`; CUDA offload requires a CUDA-enabled build and measured headroom. Review the upstream server flags for your pinned release rather than assuming all versions accept the same arguments.

Ollama users can start its server and explicitly choose published tags such as `qwen3.5:2b`. Set the server context to 4096 using Ollama configuration or a Modelfile with `PARAMETER num_ctx 4096`. Use the exact created model name for both role variables. Tags are mutable; record the resolved model digest for reproducible evaluation.

```sh
# Set both provider baseURL fields in the local overlay or Models page to:
# http://127.0.0.1:11434/v1

export D_AI_WORKER_MODEL=qwen3.5:2b
export D_AI_DECISION_MODEL=qwen3.5:2b
```

## 2. Start the opt-in profile

The OpenAI-compatible SDK requires a credential value even for a keyless loopback server. Set `D_AI_LOCAL_API_KEY=local-only` only for such a server; an authenticated endpoint requires its real key. Do not put real secrets in overlays or commit them. Changing an endpoint to a cloud host sends the supplied context there; self-hosted is not synonymous with device-local.

```sh
export D_AI_LOCAL_API_KEY=local-only
pnpm dsh web \
  --patch packages/experimental/d-ai/cordis.source.patch.yml \
  --patch apps/cli/config/examples/d-ai/local.cordis.patch.yml \
  --no-open
```

The profile disables built-in DeepSeek adapters and search, uses explicit decision/worker routes, disables unattended scheduling and automatic model-generated titles, and selects the `dai-local` preset. Existing saved settings can override composition defaults; inspect the effective Models page and route before handling private data. There is no automatic fallback to a paid provider. Inference unavailability is an error; it is not converted to successful advice.

`d_ai_local_advise` runs one independent native child with no tools and no inherited parent conversation. Supply a concise approved objective, current situation and existing evidence references. Strict JSON validation permits six recommendations: `EXPLORE`, `VERIFY`, `ASK_HUMAN`, `WAIT`, `STOP`, `ESCALATE`. Malformed output, invented references and confidence below the configured threshold return `ESCALATE`. Confidence is self-reported and uncalibrated. Advice never grants permissions, verifies claims, changes task state or silently activates a model.

The preset exposes eight tools for the initial investigation path instead of sending the complete 78-tool registry to a small model. Its deployment-owned `rootTools` list is enforced through the native scoped tool registry. Extend it deliberately for another domain and reevaluate context pressure and tool accuracy. Tools with separate approval requirements retain those requirements. The native token meter and compaction service remain the context owners; summarization uses a 512-token limit and retains a bounded verbatim tail. Raw Session/evidence records remain authoritative.

## 3. Connect search when online

Run a [SearXNG](https://github.com/searxng/searxng) instance and enable `json` under `search.formats` in its settings. Its [search API](https://docs.searxng.org/dev/search_api.html) returns HTTP 403 when that output format is disabled. The adapter uses a fixed deployment endpoint, denies redirects, caps response/query bytes and source count, supports cancellation, and preserves source URLs/title/snippets without inventing publication dates or source authority. Searching public engines still requires internet; inference and existing records can operate offline.

```sh
# Set the search overlay baseURL to the deployment-owned SearXNG URL.
pnpm dsh web \
  --patch packages/experimental/d-ai/cordis.source.patch.yml \
  --patch apps/cli/config/examples/d-ai/local.cordis.patch.yml \
  --patch apps/cli/config/examples/d-ai/search.cordis.patch.yml \
  --no-open
```

The search overlay selects the native `dai-searxng` provider. Expose `web_search` to the intended worker through an approved tool profile if it needs autonomous searching; the initial local profile sets domain worker `allowedTools: []`. API compatibility tests use a real local HTTP fixture. Successful integration with an actual SearXNG engine instance remains a separate acceptance check.

## 4. Prepare cloud operation

Use the same native profile on a long-running Linux host and explicitly configure private inference endpoints in its provider profile or Models page. Keep `DSH_HOME` and model/evidence storage on persistent volumes, provide authenticated TLS ingress, restrict inference/search ports, back up Session records and test restart recovery. Label remote inference as cloud in the D_AI model registry; a route name alone does not enforce locality. The current scheduler is process-local and active-owner-based, so cold-session activation and distributed multi-host recovery still require implementation and acceptance tests.

No cloud deployment is created by this tutorial. A target host, access method, storage and spending limits are required for an actual deployment. Containers or a VM can reduce consumption on the desktop by moving inference; they do not remove compute costs.

## 5. Verify a model before adoption

The opt-in acceptance test starts and owns a real llama.cpp child, verifies the supplied GGUF hash, then invokes the decision tool through the native pi-ai adapter. Its parent model is a deterministic fixture; a passing case proves local child inference and validation, not a complete live mission or broad model quality. The server is drained and terminated after the test.

```sh
D_AI_LLAMA_SERVER=/absolute/path/llama-server \
D_AI_GGUF=/absolute/path/reviewed-model.gguf \
D_AI_GGUF_SHA256=publisher_verified_sha256 \
pnpm exec vitest run packages/experimental/d-ai/tests/local-intelligence.live.spec.ts
```

Add held-out Arabic/English, contradictory evidence, missing tools, approval, prompt-injection and uncertainty cases before promotion. Compare quality, valid JSON/tool rate, latency, token usage and peak memory with the same context and quantization. Retain unsuccessful candidates as evaluation evidence rather than weakening validation to accept them.
