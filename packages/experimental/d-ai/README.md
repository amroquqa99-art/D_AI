# @deepseek-ai/dsh-experimental-d-ai

Native experimental D_AI investigation service over the original Harness Agent, Session, subagent, tools, web and storage services. Activate explicitly through a D_AI profile overlay; this package does not change shipped upstream profiles.

## Use this package

Mount `dsh-experimental-d-ai` after the base Harness services and a configured `storage-domain` backend. Configure `subagentProvider` (default `spawn`) and register `web_search` and `web_fetch` for its default worker allow list. A local or permitted cloud model must be configured on the owner Agent before real execution.

The five native tools create/read missions, capture decoded public HTTP(S) sources, append exact-source-anchored observations/counterclaims, and run fresh research and independently researching verifier Agents. Mutation requires an open native Agent turn so its facts survive released-session replay. Only the exact live owner root identity can access its missions. A creation objective must exactly match an admitted direct human message or receive an audited native one-shot owner approval. Missing approval answerers fail closed.

Raw `d_ai/fact` events contain complete mission state and rebuild the `dai` Session projection. The storage-domain index is discoverability only; the Session log is authoritative. Captured sources retain retrieval URLs/status/time, truncation and SHA256 of UTF-8 decoded captured content, never a purported original HTTP-byte archive. Counterclaims retain original claims and source records. Delegated assessments remain unverified model output.

## Verification

`pnpm exec vitest run packages/experimental/d-ai/tests` exercises native Loader composition, AgentLoop tools, actual native child loops, configured model separation, worker bounds, source/ownership policy, append-only replay, and JSONL restart. The model adapter and public web provider are explicitly scripted fixtures. This proves internal integration, not live model or internet research.

## Model Experience

### Investigation tools

#### What the model sees

The five `d_ai_*` schemas and bounded JSON mission state. Source content and independent assessments are untrusted data. Claim tools append observations but provide no operation to self-promote claims to `VERIFIED_WITH_SCOPE`.

#### Token effect

Tool schemas add a fixed prompt cost. Captured content and mission results add variable history cost bounded by configured source/mission limits. Each delegated role has a configured token/request/time/output-byte budget.

#### KV Cache effect

Tool registration changes the assembled tool prefix once at activation. Subsequent missions append tool results and Session facts without rewriting prior source content. Role children use fresh independent contexts.

## Known Limitations and Deferred Work

Only the investigation slice executes. Other system registrations are foundations. A distinct durable system-manager tree, continuable grandchildren, task DAG leases/retries, cross-system grants, experimental laboratory execution, original binary artifacts, and claim verification authority remain future milestones. Child runs are sequential one-shot native Agents; this is not a durable scheduler. Selecting worker model IDs remains on the owner Agent provider. Resource limits are bounds rather than measured money/VRAM reservations.

The index is not reconciled automatically after a Session-success/index-failure. A failed Session flush rejects the mutation but native pending in-memory Session events remain visible until retry or restart; no cross-store transaction or rollback is promised. Events emitted inside an interrupted turn retain native Harness recovery semantics. Process-crash fault injection and live-provider acceptance remain unverified.
