# D_AI — شرح مفصّل (الحالة الحالية)

هذا المستند يشرح **ما هو D_AI الآن** (إصدار 0.1.0)، **أين يذهب الطلب**، **كيف يُوزَّع**، و**كل القدرات** (أنظمة، وكلاء، موظفون، أدوات، نواة، مضيفون). ليس مخططاً (PRD)، بل **وصف للواقع** (code + adapters + tests).

---

## 1. ما هو D_AI

D_AI **طبقة حالة وسياسة** فوق مضيفي النماذج (OpenCode، pi). ليست نموذجاً آخر، ولا واجهة. هي:
- **ذاكرة مشفّرة** (3 نطاقات) تحفظ معرفة العمل وقراراته.
- **عقد تأسيس** (charter) يمنع البدء بلا هدف/مخرج/معيار قبول.
- **مخطط مهام** (17 حالة) مع حجز حصري.
- **قرارات مصدّرة** (versioned) مع مصدر تفويض.
- **فريق بثلاث طبقات** (owner/coordinator/contributor/reviewer/reader).
- **توجيه صادق للتكلفة** (unknown cost ≠ 0، لا تصعيد صامت).
- **بوابة أدوات** (authorization by source, not by agent name).
- **راوتر native** (OpenCode plugin) يفرض اختيار نموذج المالك + إيصالات.

**المضيف (OpenCode/pi) هو من يدير حلقة النماذج.** D_AI لا تشغّل نماذج.

---

## 2. المعمارية (4 طبقات)

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: MHOST (OpenCode / pi) — حلقة LLM، sessions، tools│
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Adapters — agents (.md), skills, commands, MCP,   │
│            native router plugin (index.js/core.js)          │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: D_AI Core (src/dai/) — memory, charters, tasks,  │
│            decisions, teams, models, tools, components,      │
│            updates, missions, analysis_tools                 │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Data — person.db / project.db / global.db (AES-GCM)│
└─────────────────────────────────────────────────────────────┘
```

- **src/dai/**: نواة محايدة عن المضيف (Python). 19 ملف، ~5080 سطر.
- **adapters/opencode/**: وكلاء (77 ملف .md)، مهارات، أوامر، راوتر (JS)، خادم MCP (Python).
- **adapters/pi/**: capability map (unverified).
- **systems/**: 11 نظام (10 + lead) مواصفات.
- **packs/**: حزم قدرات (مصدر، نسخة، ترخيص).
- **config/**: مخططات/قيم.

---

## 3. أين يذهب الطلب (Flow)

### 3.1 نقطة الدخول
- **OpenCode**: الوكيل الافتراضي `dai-lead` (قائد) أو `dai-os` (OS). mode=primary.
- **pi**: غير مثبت/未验证.

### 3.2 تدفق الطلب (high-level)
```
المالك → dai-lead/dai-os (primary)
  → يحدد الهدف، القيود، الأدلة، المخاطر
  → يقرر: إجابة مباشرة OR تفويض
  → إن تفويض: dai_route (typed) OR subagent (direct, restricted)
  → router plugin (native) يفرض:
      - اختيار نموذج (form if missing) — saved per class/project
      - permission.assert (subagent)
      - reserve job (idempotent, writer lock for implementation)
      - create child session (title, agent, model, permissions)
      - prompt child with contract (objective + refs, NOT conversation)
      - wait (with cancellation timer)
      - compactResult
      - independent review (for implementation)
      - release writer
  → leader يدمج النتائج، يحتفظ بالتعارض
  → checkpoint mission (next_action)
```

### 3.3 Missions/Tasks/Evidence (D_AI core)
- `dai_mission_create` → mission (objective, acceptance, status=PLANNED).
- `dai_evidence_add` → source (locator, content, sha256) في project.db.
- `dai_claim_add` → claim (FACT/STATEMENT/ANALYSIS/INFERENCE/HYPOTHESIS/UNKNOWN) linked to sources.
- `dai_mission_checkpoint` → status + next_action + artifacts + receipts + review.
- `dai_task_create` → task against active charter (17 states).
- `dai_decision_record` → versioned decision with authorization source.

### 3.4 Delegation rules
- Workers **cannot re-delegate** (parentID check).
- Only router may use native subagent permission.
- Direct `subagent`/`dai_delegate_native` blocked by `before()` hook unless `dai_route`.
- Implementation restricted to `dai/engineer/implementer`; independent review follows.
- Narrow read-only work → leaf worker (`dai/<system>/<role>`) via `dai_route` with target_agent.

---

## 4. الأنظمة (11) ووكلاؤها

| System | Manager agent | Status | Specialists count |
|---|---|---:|---:|
| البحث العلمي (research) | dai-research | LIVE_SLICE (research) | 12 (literature, methods, statistics, domain-specialist, verifier, reporter, clinical, systematic-review, meta-analysis, biostatistics, genomics, pharmacology) |
| الابتكار (innovation) | dai-innovation | LIVE_PEER_LIMITED | 6 (hypotheses, mathematics, algorithms, engineering, experiments, falsifier) |
| التعلّم (teacher) | dai-teacher | CONFIGURED | 5 (diagnoser, curriculum, tutor, assessor, project-coach) |
| الاستثمار (investor) | dai-investor | CONFIGURED | 5 (filings, macro-sector, market, scenarios, risk-review) |
| المساعد (assistant) | dai-assistant | LIVE_SLICE_LIMITED | 5 (planner, followup, knowledge, project-coordinator, correspondence) |
| التحقيق (investigation) | dai-investigation | CONFIGURED | 5 (sources, entities, chronology, geospatial, verifier) |
| السيبراني (cyber) | dai-cyber | CONFIGURED | 6 (assets-threat, code-audit, domain-specialist, forensics, response, verifier) |
| الاستراتيجية (strategy) | dai-strategy | CONFIGURED | 6 (geopolitical, scenarios, logistics, challenge, economic, history-doctrine) |
| المستشارون (advisors) | dai-advisors | CONFIGURED | 7 (financial, legal, administration, accounting, career, product-marketing, decision-review) |
| الهندسة (engineer) | dai-engineer | CONFIGURED | 5 (architect, implementer, tester, reviewer, documenter) |
| القائد (lead) | dai-lead | primary | — (router, not specialist) |
| OS | dai-os | primary | — (central orchestrator) |

**Shared workers** (3): `dai/shared/explorer` (read-only discovery), `dai/shared/extractor` (faithful extraction), `dai/shared/reviewer` (independent verification).

**Specialized research systems** (6, under research): systematic-review, meta-analysis, biostatistics, clinical-trial, genomics, pharmacology (defined in `src/dai/specialized_systems.py`).

---

## 5. الأدوات (Tools)

### 5.1 MCP tools (Python, ~60+)
Exposed by `adapters/opencode/mcp/server.py` → `DaiCoreBridge`. Categories:
- **Mission**: create, get, list, checkpoint, evidence_add, evidence_list, claim_add, claim_list.
- **Project**: create, list, grant.
- **Charter**: propose, assess, approve, active.
- **Task**: create, get, list, state, lease, release, attempt, graph.
- **Decision**: record, list, supersede, withdraw, affected.
- **Team**: create, add_agent, agents, tree, assign, message, inbox, acknowledge.
- **Consultation**: open, reply, status, list.
- **Model**: register, list, route, choose, meter, usage.
- **Tool gateway**: register, list, resolve, invoke.
- **Component**: propose, decide, adopt, list, verify, import.
- **Update**: status, check, plan, decide, apply, rollback.
- **Memory**: create, get, list, search, archive, restore, history.
- **Backup**: create.
- **Utility**: search_files, calculate_decimal, summarize_csv, extract_pdf, crossref_search.

All project-scoped tools require native OpenCode session identity (ses_*) resolved via `NativeClient`; authority never comes from model text. Destructive ops (purge/restore) NOT exposed (CLI only).

### 5.2 Router tools (JS, OpenCode plugin)
- `dai_route` — dispatch retrieval/implementation/review.
- `dai_routing_status` — read choices + active job.
- `dai_jobs` — list jobs (visibility).
- `dai_job_status` — read one job receipt.
- `dai_job_cancel` — cancel running worker.
- `dai_job_message` — send follow-up to worker.
- `dai_resource_search` / `dai_resource_read` — curated resources.

### 5.3 Commands (slash)
- `/dai-models` (and `audit`), `/dai-jobs`, `/dai-resources`, `/os`.

### 5.4 Shared workers
- `dai/shared/explorer`, `extractor`, `reviewer` (via dai_route with target_agent).

---

## 6. النواة (src/dai/)

| Module | Responsibility |
|---|---|
| `contracts.py` | Principal, Scope, Record, json_bytes |
| `errors.py` | DaiError hierarchy |
| `memory.py` | MemoryStore: 3 planes (person/project/global), AES-GCM, roles, grants, versioning, archiving, purge |
| `vault.py` | encryption |
| `platform_fs.py` | cross-platform locking/ACLs |
| `charters.py` | CharterService: propose/assess/approve/active (version-fenced) |
| `missions.py` | MissionService: create/get/checkpoint/evidence/claims/list |
| `tasks.py` | TaskService: 17-state machine, leases, attempts, graph |
| `decisions.py` | DecisionService: record/supersede/withdraw/affected |
| `teams.py` | TeamService: 3-layer teams, agents, assign, messages, consultations, inbox |
| `models.py` | ModelRegistry: register/route/choose/meter/usage |
| `tools.py` | ToolGateway: register/resolve/invoke, effect policy, idempotency |
| `components.py` | ComponentRegistry: propose/decide/adopt/verify/import |
| `updates.py` | UpdateWatcher: check/plan/decide/apply/rollback |
| `scoped_files.py` | bounded read-only workspace search (secret/symlink exclusions) |
| `analysis_tools.py` | calculate_decimal, summarize_csv, extract_pdf, crossref_search |
| `specialized_systems.py` | 6 specialized research systems specs |
| `cli.py` | CLI (status, project, memory, charter, task, decision, model, component) |
| `mcp_server.py` | MCP server entry |

---

## 7. الذاكرة (Memory)

- **3 planes**: `person.db`, `project.db`, `global.db` (SQLite, AES-GCM per record).
- **Roles**: owner, coordinator, contributor, reviewer, reader (per project membership).
- **Project scoping**: `project_scope(actor, project_id)` + `_authorize`.
- **Versioning**: records have version; updates require expected_version (optimistic concurrency).
- **Archiving**: archive/restore with version fence.
- **Confirmed purge**: MHO only, interactive, key destruction (irreversible).
- **No cloud sync** (deferred from V1).
- **Cross-platform**: Windows ACLs + process locking (tested).

---

## 8. النماذج (Models)

- `ModelRegistry` per project (encrypted memory).
- `model route --task-class {retrieval,implementation,review}` → picks saved preference or asks.
- `model choose` → owner decision recorded (model_id, reason, task_class).
- `model meter` → append-only usage ledger (tokens, cost, latency, status).
- **Cost honesty**: unknown cost excluded from delegated auto-pick; no silent escalation.
- **Routing preferences**: `config/routing-preferences.json` (global + per-project).
- **Native router**: owner picks model per class via native form; saved; reused.

---

## 9. التوجيه (Routing) — native plugin

- File: `adapters/opencode/router/index.js` + `core.js`.
- Hooks: `prompt` (intake classify), `context` (dispatch), `compaction` (keep job IDs), `tool.execute.before` (block direct subagent), `tool.execute.after` (record last-tool).
- `classify()`: keyword-based task class (retrieval/implementation/review/disabled).
- **DAI OS/lead primary retains routing authority** (no preemptive keyword dispatch) — classified only for non-OS/lead agents.
- `workerPermissions(kind, directory)`: deny all by default; allow edit/shell scoped to workspace; secret exclusions.
- **Jobs**: persisted in `runtime/router/jobs/*.json` (stateHome). Statuses: RESERVED → CREATED → SUCCEEDED/FAILED/CANCELLED/etc.
- **Writer lock**: at most one implementation writer per workspace (uncertain stays reserved).
- **Independent review**: implementation → auto review job (read-only).
- **Cancellation**: owner interrupt → cancel job, release writer.
- **Visibility tools**: dai_jobs, dai_job_status, dai_job_cancel, dai_job_message (added 2026-11-10).

---

## 10. المهارات (Skills)

- `dai-core` (adaptive workflow, missions, evidence, review, collaboration).
- `dai-os` (central intake).
- 10 system skills (dai-research, dai-innovation, ..., dai-engineer) + sub-skills.
- `dai-routing`, `dai-scientific-research`, `dai-resource-discovery`.
- AgenticSkills integration: 9 selected resources (systematic-debugging, verification-before-completion, using-git-worktrees, etc.) adapted locally with provenance.

---

## 11. المضيفون (Hosts)

| Host | Status |
|---|---|
| OpenCode CLI | code exists, partially verified |
| OpenCode Desktop | NOT verified |
| pi CLI | NOT verified |
| PI-Desktop | NOT verified |

Installer: `scripts/install_opencode.py` (dry-run supported). Verify: `scripts/verify_install.py`.

---

## 12. الحالة (Status)

- **Version**: 0.1.0 (NOT_READY for full V1).
- **Tests**: 234 Python OK (5 skipped Windows-only), 48 Node OK.
- **Requirement coverage**: 113 reqs — 30 IMPLEMENTED, 29 PARTIAL, 2 NOT_IMPLEMENTED (ENV-03/04), 52 NOT_VERIFIED.
- **NOT VERIFIED**: professional domain validation, 4 host surfaces, ENV-03/04, REL-05 single-command bootstrap, DUR-02 auto-resume.
- **Recent (2026-11-10)**: subagent visibility tools, DAI list tools, analysis tools, agent perms cleanup, tests, docs, commit+push.

---

## 13. ما لا يفعله D_AI

- لا تشغّل نماذج (المضيف يدير).
- لا ترسل/تتداول/توقّع/تنشر/تفحص أمنياً خارجياً بلا تفويض.
- لا تفترض أن ملف/رابط/مهارة يمنح صلاحية.
- لا تُعلن جودة مهنية (CONFIGURED ≠ مُختبَر).

---

## 14. أين أبحث عن "أخطاء"

- **Tests**: `tests/` (Python + Node). تشغيل: `PYTHONPATH=src python -m unittest discover -s tests`, `node --test tests/router.test.mjs`.
- **Docs**: `docs/IMPLEMENTATION_STATE.md`, `docs/REQUIREMENT_COVERAGE.json`, `docs/checkpoints/`.
- **Code review hotspots**:
  - `src/dai/` (core) — memory, tasks, teams, models, tools.
  - `adapters/opencode/router/` (index.js, core.js) — dispatch, locks, cancellation.
  - `adapters/opencode/mcp/` (server.py, dai_core_bridge.py, native.py) — auth, tool schemas.
  - `adapters/opencode/agent/*.md` — permissions JSON validity (just cleaned).
  - `systems/*/specification.md` — capability claims vs implementation.

---

*Generated 2026-11-11. Source of truth: code + tests + docs/IMPLEMENTATION_STATE.md.*
