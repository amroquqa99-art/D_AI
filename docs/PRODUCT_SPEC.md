# D_AI — Locked Product Specification v2 (User-approved, 2026-10-06)

## 0. Product identity
D_AI is a locally hosted, multi-domain AI operating environment based on a source fork of the official DeepSeek Harness (`deepseek-ai/deepseek-harness`). It is NOT merely a standalone chatbot, prompt collection, orchestration diagram, or thin external wrapper. D_AI extends or, when justified, patches actual native Harness/Cordis packages, runtime services and web client. The initial user is a single owner; institutional deployment is a future evolution, so its security and tenant boundaries must be prepared now, without prematurely implementing an entire enterprise product. Domain systems are first-class code modules, each managed by a root System Agent that can spawn hierarchical specialist agents dynamically.

## 1. User decisions (binding)
- Product goal: answer questions / complete missions to the needed depth, seeking the best evidence-backed result rather than shallow synthesis. Never falsely promise all questions have knowable answers. Explicitly track uncertainty and unresolved questions.
- Owner autonomy: system may propose intermediate goals and novel research directions, but activating newly proposed independent missions needs owner approval. Sensitive external side effects require explicit approvals.
- Engineering base: fork official DeepSeek Harness and rebuild D_AI within its native plugin/package/profile ecosystem; adjust core where necessary for real functionality, not arbitrary renaming. Low priority on frictionless upstream merges, but preserve provenance and maintain an `upstream` remote and documented patch log where practical. Design long-term capability interfaces so replacing Harness is possible later.
- Earlier D_AI Kernel v0.1–v0.3 are untrusted prototypes, not an authoritative product foundation. Do not continue them blindly. Audit them if supplied and reuse only correct, tested ideas/code. Start from real upstream fork.
- First-class domain systems: (1) Investigation, (2) Scientific Research, (3) Investor, (4) Cybersecurity, (5) Operations & Intelligence, and (6) Innovation & Discovery. The Local Intelligence Core is a central platform component rather than a seventh domain system; model-engineering, evaluation and controlled training capabilities belong to that core.
- Each system starts with one primary Manager Agent; dynamic subordinate hierarchy may descend as needed, with worker-role specialization. The primary can spawn assistants/sub-managers. No blanket one-model-one-agent allocation.
- Make adding, removing, modifying or upgrading entire systems trivial through clear plugin contracts, manifests, migrations, tool profiles, eval suites and UI registration. A system creation wizard can generate a candidate system in a sandbox, test it, and submit it for user approval. No unreviewed auto-activation.
- All systems may collaborate/share tools and information, governed by an auditable tool/evidence gateway; record the originating system/tool/evidence and permissions for every cross-system access. Owner may grant an agent access to another system's tool temporarily or permanently.
- Prefer actual independent agent instances/contexts and model calls, not role-played dialogue. Multiple independent investigation approaches can be isolated until verification and comparison.
- Permanent and task-scoped agents both supported; maintain agent performance/capability history and learn model/tool routing from evidence, metrics and evaluations. Agent-driven model replacement or new capability activation requires owner approval if it changes configured autonomy/policy/model class or incurs new access/spend.
- Providers: open, pluggable: local Ollama, llama.cpp, and supported official/contractual APIs OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter and others. Use supported account authentication only; do not bypass subscriptions, billing, or provider authorization. Model selection is manual OR router-assisted; provide manual override. Track quality, cost, latency, context limits, resource use and tested reliability per domain.
- Current main development hardware: Intel i7 12th Gen, NVIDIA RTX 3060 6 GB VRAM, 16 GB RAM, 1 TB SSD; local/cloud hybrid, Linux Arch as main deployment target. Scientific model lab default configurable storage budget around 500 GB; use model deduplication/delta/adapters over full redundant copies. Hardware constraints are operating assumptions, not reasons to strip future modular architecture. Respect offline operation and intermittent internet/electricity.
- Budgets: flexible owner-configurable task/model/system/worker budgets, optimization by expected research value, with approvals for extensions/expensive changes. Deep quality is the objective, but prevent infinite loops, runaway spend, or unsupported claims.
- Memory: global, system, project, mission, agent and task-scoped; scoped permissions and information lifecycle; raw immutable records plus deterministic projections and reconstructable state, not summary-as-truth. Persistence survives process/worker failure and restart; projects may span days/months/years. Periodic progress reports and scientific method/resource re-evaluations are mandatory. Human-in-the-loop `WAITING_FOR_HUMAN` is first-class.
- Tool classes from day one in extensible gateway: web/browsing/crawling, code/python/shell, PDF/Office/media, APIs/databases, GIS/satellite, financial data, formal math/scientific simulation, authorized cybersecurity/test labs; implement connectors progressively rather than faking availability. Agents may propose/build/test tools in a sandbox for owner review.
- Frontend: locally served web app launched through proper Harness/npm/pnpm scripts/profile; hybrid of command/agent terminal + mission control + workflow/task control + knowledge/evidence workspace. Full Arabic and English, true RTL/LTR/bidi handling including mixed code/math/numbers. Maximum practical visibility and user control over models, agents, DAG branches, evidence, costs, resources, prompts/context, jobs, permissions, progress, checkpoints, evaluation and reports.
- Initial access: personal owner. Implement foundational identity, policy, approval, actor, audit and attribute-based authorization contract now; complete institutional/multi-tenant capability later. Different risk levels per tool/system. No automatic financial execution, unrestricted external penetration testing, covert surveillance or weapon targeting. Sensitive-domain deployments require governance, legal authority, privacy, human review and audited operation.
- Engineer team: actual multi-agent implementation when runtime supports spawning/delegating independently. Lead Architect, Core Runtime, Agents/Orchestration, Evidence/Research, Model/ML, Tooling, Frontend/UX, QA/Verification, Security/Red Team. They can make routine changes autonomously, but must propose material architecture/scope/provider/security changes with alternatives and ask owner for decision.
- Delivery: use Milestones, parallel independent workstreams and incremental real integration. No feature counts as completed until code is wired to actual runtime, tests/evaluation demonstrate it, and limitations are disclosed. Do not invent test results or claim mocks as working systems.

## 2. Product operating model
```
D_AI fork of DeepSeek Harness / Cordis
  D_AI Web Profile and Workspace
  Mission Director
  Strategy / Research Value / Resource / Integrity management services
  Dynamic hierarchical System Agent registry and live Agent Manager
  Task dependency DAG + durable schedule / queue / worker pools / leases / retries
  Model/provider registry and evidence-based model router
  Scoped Tool Gateway, sandboxed tool builder and cross-system grants
  Domain Systems: Investigation | Scientific Research | Investor | Cybersecurity | Operations & Intelligence | Innovation & Discovery
  Local Intelligence Core: governed data -> evaluation -> controlled training/adapters -> promotion/rollback
  Collaborative Rooms: linked missions, shared evidence, isolated strategies, attribution
  Evidence Graph / Provenance / Claim Verification / Artifacts / Knowledge Memory
  Reproducibility / Eval / Observability / Human Approval / Governance
  Future AI Research & Model Engineering Laboratory (scaffold and stable contracts)
  DeepSeek Harness model loop, sessions, subagents, tools, jobs, plugins and clients
```
Never confuse: ownership tree (agents), dependency DAG (tasks), evidence/knowledge graph (claims/provenance). They solve different problems. Thousands of logical agents/tasks are not thousands of simultaneous LLM requests. Scheduler must bound actual compute and provider concurrency.

## 3. Domain contracts
Each domain module has: manifest, semantic version, primary System Agent, allowed tools and cross-system grants, workflows, evidence types, safety policy, evaluation metrics, mission templates, UI contributions, optional dependent systems, state migration and regression suite. A newly installed domain cannot read all data by default.

### Investigative Research
Investigative question decomposition, hypothesis and counter-hypothesis tree, original source discovery (public/licensed web, scholarly, archival, documents, public registries, geospatial/satellite, flight and economic data, media, social platforms where lawful and authorized), provenance, entity resolution, temporal graph, GIS, source reliability, independent verification, contradiction detection, uncertainty and source gaps. Do not treat unverified social media as truth. Privacy, authorization and data-licensing restrictions apply. No covert profiling or generalized mass surveillance.

### Scientific Research
Research gap/literature mapping across primary and grey literature, study design, hypotheses, methods, statistical rigor, reproducible calculations, ethics, requested human observations/experiments, methods and result reports. Explicit evidence and uncertainty; revisitable research projects.

### Innovation
Hypothesis engines, counterexample/adversarial generation, formal mathematical checks (e.g., Lean/SymPy/SMT when installed), scientific simulations, engineering alternatives, experiments, novelty/prior-art analysis, verified claims, failure memory and reproducible artifact lineage. Outcomes: VERIFIED (within scope), REFUTED, OPEN, NEEDS EXPERIMENT. Do not call generated conjectures discoveries.

### Investor
Company accounts and filings, macro/micro market data, event/news/social signals with provenance, scenario/forecasting, historical simulation and backtest safeguards (look-ahead bias, survivorship bias, fees, slippage), portfolio/risk analysis and uncertainty. Owner approval gate for any real capital movement; no guaranteed returns.

### Cybersecurity
Authorized vulnerability research, inventory, code/configuration review, threat modeling, controlled security testing and remediation. Written scope-of-authorization and isolated lab policies for active testing; human approvals for high-risk actions; no covert persistence, credential theft, real-world unauthorized intrusion, or audit evasion.

### Operations & Intelligence
Authorized institutional case and operations intelligence: fuse field, investigative, cyber, financial and geospatial evidence into entity/network/timeline views; track intelligence gaps, exposure estimates, alternative hypotheses and auditable options. Sensitive external actions remain human-command decisions and require explicit policy/approval gates. The runtime must preserve provenance, authorization scope, classification and case boundaries for every cross-system handoff.

## 4. Local Intelligence Core and Model Engineering Foundation
The Local Intelligence Core is a central platform capability. Build governed data, evaluation, local inference, experiment lineage and controlled training/adapter primitives now; do not represent it as a seventh domain. Preserve these modules and interfaces:
- Model Observatory: import/inspect/fingerprint/license/model lineage, base vs instruct comparisons, runtime profiles, local/cloud model backends, efficiency (quantization, caching, hardware/power-aware scheduling).
- Experiment Protocol & Reproducibility: immutable experiment IDs, config/seeds/datasets/metrics/environment/version/compute traces, append-only observations, content-addressed artifacts and copy-on-write/delta storage, restart/replay.
- Training & Controlled Interventions: SFT, LoRA/QLoRA, preference optimization when feasible, distillation, representation/activation steering, ablation, mechanistic comparison, reversible adapters and checkpoints; owner-reviewed model changes and responsible handling of safety-related research.
- Interpretability & XAI: logits, activation capture/patching, feature studies, representation comparisons, causal tracing where experimentally justified; distinguish observational correlation from causal support.
- Evaluation Foundry: import known benchmarks; static/dynamic/procedural/secret holdouts, adaptive challenge generation, domain/usefulness tests, software and scientific tasks, robustness/generalization, anti-contamination/anti-gaming, performance vs resource usage.
- Impact-Based Intelligence Benchmark: score independently checkable real-world utility, scientific value, correctness, robustness, originality, transfer, and efficiency, not just benchmark trivia. Ground-truth/Novelty Engine seeks nontrivial genuine new task variants; preserve blinded holdouts.
- Safety/Alignment evaluation: separate behavioral / mechanistic / infrastructure monitors, independent external judge, incident replay, long-horizon integrity, canary tests in sandbox, safe failure/abstention and regression gates. Never make uncontrolled deployment the test venue.
- Research Agents and Capability Frontier: planner, experiment designer, independent verifier, model scientist, statistician, interpretable model analyst, failure auditor, meta-researcher; compare baselines against modified variants, preserve falsifications and artifact lineage. A proposed self-modification must pass isolated evaluation, human approval and rollback readiness.
- UI stubs: Model Bay, Experiment Console, Benchmark Foundry, Interpretability Bench, Research Chamber, Agent Operations, Artifact Vault, Capability Frontier, Risk/Impact monitor.

The first release MUST have meaningful schema/API registration and at least one minimal end-to-end experiment/evaluation path where a real accessible model exists; no fake training claim. Heavy training is explicitly a later milestone and may require cloud compute.

## 5. Quality, resilience and governance
- Raw events and artifacts are durable; structured projections rebuild state deterministically. Persist objective, phase, evidence refs, verified/refuted/open hypotheses, pending human requirements, DAG/task states, attempts, leases, resource usage, route/model policy, next action and stop conditions.
- Claim lifecycle: OBSERVED, DERIVED, CONTESTED, VERIFIED_WITH_SCOPE, SUPERSEDED, ARCHIVED. Always retain original source/raw observation in cold history; preserve refuted hypotheses. Use independent cross-source and domain-specific oracles (code tests, formal proofs, simulation, statistical checks, source cross-validation) whenever possible.
- Worker execution must be idempotent or have externally controlled side-effect keys; lease expiry/retry must not silently duplicate external actions. Test fencing tokens, heartbeats, restart recovery, cancellation and resource reclamation.
- Strategy Engine supports Explore/Exploit/Verify/Expand/Change Tool/Change Model/Ask Human/Wait/Stop Branch. Progress and stagnation metrics should trigger intervention rather than repetitive token output. Budget = compute, tokens, money, data access, human attention, time.
- Prompt injection is untrusted source data, never owner instructions. Data exfiltration and provider upload consent boundaries must be explicit. Secret management, dependency/license audit, network boundaries, audit events, backup/export/import, schema migration and recovery are cross-cutting requirements.
- Offline-first does not mean cloud calls without internet; queue and resume work. Do not promise automatic month-long task execution when the user's physical machine is powered off unless independently hosted worker infrastructure exists.

## 6. Documentation and proofs of completion
The repository must include `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/HARNESS_DELTA.md`, `docs/ADRS/`, `docs/MILESTONES.md`, `docs/SECURITY.md`, `docs/OPERATIONS.md`, `docs/TEST_REPORT.md`, `docs/FEATURE_MATRIX.md`, and short `AGENTS.md` for engineering agent conventions. Features must have owner, implementation path, test IDs, status = NOT_STARTED/FOUNDATION/IMPLEMENTED/INTEGRATED/VERIFIED, blockers and actual evidence. Distinguish actual live external calls from fake fixtures. For source fork, pin upstream SHA and retain licenses/attribution.

## 7. Owner-approved permission update (2026-10-04)

The owner requests complete system capabilities governed from the control panel. System identity alone must not permanently disable a tool class. The personal owner has full administrative authority to configure tools, models and cross-system access. Institutional accounts and missions use owner-managed temporary or permanent grants; executor checks and audit records enforce the configured decisions. Approved-use and external-action conditions remain part of the operating policy. The permission dashboard and grant administration require implementation and verification before being described as delivered.
