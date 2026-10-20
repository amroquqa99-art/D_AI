> HISTORICAL — not active routing policy. Owner choices in config/routing-preferences.json and native hooks supersede this table.

# Worker routing table (semi-permanent worker-of-record + failure memory)

Updated by dai-auto-delegation. Status vocabulary: `PROBED_OK`, `BLOCKED_QUOTA`, `BLOCKED_PROVIDER`, `QUALITY_FAIL`, `NOT_PROBED`, `RETRY_AFTER`.
Observed entries are real, dated. No promotion without a passing probe.

## Worker-of-record by task class

| Task class | Worker of record | Since | Notes |
|---|---|---|---|
| Bulk web research | `opencode/nemotron-3.5-lightning-free` | 2026-10-15 | PROBED_OK — returned structured research report with real URLs (quality caveats: verify citations before reuse) |
| File/extract retrieval | T0 tools first (`search_files`, `extract_pdf`, `summarize_csv`) | 2026-10-15 | Zero-LLM default; no worker needed |
| Extraction/scouting (spare) | `opencode/step-5-preview-free` | 2026-10-15 | NOT_PROBED — next candidate for rotation |
| Cheap paid fallback | `google/gemini-flash-lite-latest` | 2026-10-15 | NOT_PROBED — T2, needs benchmark before first real use |

## Blocked / failed (skip until re-probe window)

| Model | Status | Observed | Evidence |
|---|---|---|---|
| `google/gemini-3.8-flash` | BLOCKED_QUOTA | 2026-10-15 | Free tier limit: 5 requests/min (`generate_content_free_tier_requests`), failed dispatch within first minute |
| `opencode/big-pickle` | BLOCKED_PROVIDER | 2026-10-15 | `dai_model_catalog`: benchmark_status BLOCKED_PROVIDER_403, routing_eligible false |
| `lmstudio/*`, `ollama`, `vllm` | BLOCKED_PROVIDER | 2026-10-15 | All local servers UNREACHABLE (`dai_model_catalog`) — no local tier available |

## Rules encoded here

- Failure marks are session/day-scoped unless re-tested; retry only after the stated window (quota reset, server back, config change).
- `QUALITY_FAIL` requires a new passing probe before any promotion.
- Owner naming a model in chat bypasses this table for that request (explicit override wins).
