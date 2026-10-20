# D_AI 1.0 — module contracts (authoritative interface)

Status: **binding for all implementation work in this repository.** A module that
does not match this contract is not accepted, regardless of how it was written.

Requirement ids refer to `docs/specifications/PRD_AR.md`.

## 0. Shared rules (every module)

- Package root: `src/dai/`. Existing modules are **frozen and read-only** for
  new work: `contracts.py`, `errors.py`, `memory.py`, `vault.py`, `charters.py`.
  A new module never edits them; it extends behaviour through its own tables.
- Errors: raise only from `dai.errors` (`DaiError`, `AccessDenied`, `Conflict`,
  `NotFound`, `Gone`, `IntegrityFailure`, `InvalidRequest`). Public failure
  messages carry identifiers and reasons, **never record contents**.
- Identity: every actor is a `dai.contracts.Principal`. Identity is assigned by
  a trusted local adapter, never parsed from model output or source text.
- Scope: every operation takes an explicit `dai.contracts.Scope`
  (`person` | `project` | `global`). No cross-scope reads.
- Storage: persistent state lives in the three SQLite planes of
  `dai.memory.MemoryStore` (`person.db`, `project.db`, `global.db`) or in a
  module-owned table inside `store._db("project")`. Module tables are created
  with `CREATE TABLE IF NOT EXISTS` in the module `__init__`, exactly like
  `dai.charters.CharterService` does, and guarded by a `component_versions` row.
- Encrypted content: private payloads go through `store.create` /
  `store.update` with a `kind`, so they are encrypted, versioned, searchable and
  auditable. Only non-sensitive indexes, counters and foreign keys live in plain
  columns.
- Writes are fenced: every mutation that targets an existing record requires
  `expected_version` and raises `Conflict` when the stored version differs.
- Idempotency: any operation that can cause an external side effect accepts an
  `idempotency_key`; a repeated key with the same payload returns the original
  result, and a repeated key with a different payload raises `Conflict`.
- No network, no subprocess, no clock-dependent assertions in unit tests.
- Style: `from __future__ import annotations`, module docstring stating the
  invariant, type hints, `unittest` tests in `tests/test_<module>.py`.
- Tests must run with:
  `PYTHONPATH=src python -m unittest discover -s tests`

## 1. `dai/tasks.py` — durable task graph (DUR-01..04, AGT-03, WFL-04, INV-06)

```python
STATES = ("DISCOVERING","WAITING_FOR_INPUT","PLAN_REVIEW","READY","RUNNING",
          "VERIFYING","REVIEWING","WAITING_FOR_HUMAN","WAITING_FOR_MODEL",
          "WAITING_FOR_DATA","WAITING_FOR_RESOURCES","PAUSED","RECOVERING",
          "COMPLETED","PARTIAL","FAILED","CANCELLED")

class TaskService:
    def __init__(self, store: MemoryStore) -> None: ...
    def create_task(self, actor: Principal, scope: Scope, *, objective: str,
                    acceptance: list[str], charter_id: str | None = None,
                    responsibility: str | None = None,
                    inputs: list[str] | None = None,
                    outputs: list[str] | None = None,
                    depends_on: list[str] | None = None,
                    idempotency_key: str | None = None) -> Record: ...
    def get(self, actor: Principal, scope: Scope, task_id: str) -> Record: ...
    def list(self, actor: Principal, scope: Scope, *, state: str | None = None,
             kind: str = "task", limit: int = 50) -> list[Record]: ...
    def set_state(self, actor: Principal, scope: Scope, task_id: str, *,
                  state: str, expected_version: int,
                  receipt: str | None = None, note: str = "") -> Record: ...
    def lease(self, actor: Principal, scope: Scope, task_id: str, *,
              owner: str, ttl: int = 300) -> Record: ...
    def release(self, actor: Principal, scope: Scope, task_id: str, *,
                owner: str) -> Record: ...
    def record_attempt(self, actor: Principal, scope: Scope, task_id: str, *,
                       attempt_id: str, outcome: str,
                       artifacts: list[str] | None = None,
                       receipt: str | None = None,
                       idempotency_key: str | None = None) -> Record: ...
    def attempts(self, actor: Principal, scope: Scope, task_id: str) -> list[dict]: ...
    def graph(self, actor: Principal, scope: Scope) -> dict: ...
```

Rules:
- A task record has `kind="task"`; its content carries `state`, `acceptance`,
  `charter_id`, `depends_on`, `attempts`, `lease`, `state_history`.
- Legal transitions are a declared map. An illegal transition raises
  `Conflict` and names both states. `COMPLETED` requires at least one
  successful attempt **and** a non-empty acceptance list **and** a receipt;
  otherwise `InvalidRequest`. `PARTIAL` never means success: it requires a
  `note` stating what is missing.
- **Waiting is a suspension, not a progression.** Any `WAITING_FOR_*` state
  (`WAITING_FOR_INPUT`, `WAITING_FOR_HUMAN`, `WAITING_FOR_MODEL`,
  `WAITING_FOR_DATA`, `WAITING_FOR_RESOURCES`) is reachable from any
  non-terminal state, and a waiting task may return to `RUNNING`,
  `DISCOVERING`, `READY`, `CANCELLED` or `FAILED`. A terminal state
  (`COMPLETED`, `FAILED`, `CANCELLED`) accepts no further transition at all.
  The base map is:
  `DISCOVERING -> {WAITING_FOR_INPUT, PLAN_REVIEW, READY, CANCELLED, FAILED}`;
  `PLAN_REVIEW -> {READY, WAITING_FOR_HUMAN, CANCELLED, FAILED}`;
  `READY -> {RUNNING, PAUSED, WAITING_FOR_RESOURCES, CANCELLED, FAILED}`;
  `RUNNING -> {VERIFYING, WAITING_FOR_*, PAUSED, RECOVERING, PARTIAL, FAILED, CANCELLED}`;
  `VERIFYING -> {REVIEWING, COMPLETED, PARTIAL, FAILED, RECOVERING}`;
  `REVIEWING -> {COMPLETED, PARTIAL, FAILED, WAITING_FOR_HUMAN, RECOVERING}`;
  `RECOVERING -> {RUNNING, VERIFYING, PARTIAL, FAILED, CANCELLED}`;
  `PAUSED -> {RUNNING, CANCELLED, FAILED}`;
  `PARTIAL -> {RECOVERING, COMPLETED, FAILED, CANCELLED}`.
- The order of checks in `set_state` is fixed: version fence -> terminal check
  -> "COMPLETED only through record_attempt" -> legality. A task already in a
  terminal state reports `Conflict`, never `InvalidRequest`.
- `set_state` to a `WAITING_FOR_*` state records what it waits for and never
  implies a model call was made.
- A lease is exclusive: a second `lease` on a live lease raises `Conflict`.
  A lease whose TTL expired may be taken over, and the takeover is recorded in
  `state_history`. A lease is released automatically by `set_state`.
- `record_attempt` is the only way a task can reach `COMPLETED`; `outcome` is
  one of `SUCCESS` | `FAILURE` | `PARTIAL` | `CANCELLED`. A repeated
  `idempotency_key` never double-counts an attempt.
- `graph()` returns `{"nodes":[{"id","state","objective","version"}],
  "edges":[{"from","to"}]}` built from `depends_on`. `depends_on` must reference
  existing tasks or raise `InvalidRequest`; cycles are rejected.
- A task may only be created against an **approved active charter**
  (`dai.charters.CharterService.active`); without one raise `NotFound`.

## 2. `dai/decisions.py` — versioned decisions (INT-06, MEM-02, MOD-04, A08)

```python
class DecisionService:
    def __init__(self, store: MemoryStore) -> None: ...
    def record(self, actor: Principal, scope: Scope, *, text: str, meaning: str,
               authorization_source: str, affects: list[str] | None = None,
               supersedes: str | None = None,
               idempotency_key: str | None = None) -> Record: ...
    def active(self, actor: Principal, scope: Scope) -> list[Record]: ...
    def get(self, actor: Principal, scope: Scope, decision_id: str) -> Record: ...
    def history(self, actor: Principal, scope: Scope) -> list[Record]: ...
    def supersede(self, actor: Principal, scope: Scope, decision_id: str, *,
                  text: str, authorization_source: str,
                  expected_version: int,
                  idempotency_key: str | None = None) -> Record: ...
    def withdraw(self, actor: Principal, scope: Scope, decision_id: str, *,
                 reason: str, expected_version: int) -> Record: ...
    def affected(self, actor: Principal, scope: Scope, unit: str) -> list[Record]: ...
```

Rules:
- A decision record has `kind="decision"` (already a protected kind in
  `dai.memory.PROTECTED_KINDS`, so only the `decide` capability can write it).
- Content carries `text`, `meaning`, `authorization_source`, `affects`,
  `state` (`ACTIVE` | `SUPERSEDED` | `WITHDRAWN`), `supersedes`,
  `decided_at`, `decided_by`.
- `supersede` creates a **new** record that points at the old one and marks the
  old one `SUPERSEDED`; the old content is never edited in place and never
  deleted, so its effect stays auditable.
- A withdrawn or superseded decision is **not** returned by `active()` and is
  never usable as a current decision.
- `authorization_source` is mandatory and non-empty: authority never comes from
  model text or from an agent's self-claim (`INV-04`).
- `record` with `supersedes` requires the referenced decision to exist and be
  `ACTIVE`.

## 3. `dai/teams.py` — team, agent tree, messages, consultations (AGT-01..05, SIDE-01..04, INV-08)

```python
MAX_DEPTH = 3   # basic -> sub -> sub-of-sub

class TeamService:
    def __init__(self, store: MemoryStore) -> None: ...
    def create_team(self, actor: Principal, scope: Scope, *, name: str,
                    roles: list[str] | None = None,
                    idempotency_key: str | None = None) -> Record: ...
    def add_agent(self, actor: Principal, scope: Scope, team_id: str, *,
                  agent_id: str, role: str,
                  parent_agent: str | None = None,
                  model: str | None = None,
                  budget: dict | None = None) -> Record: ...
    def agents(self, actor: Principal, scope: Scope, team_id: str) -> list[dict]: ...
    def tree(self, actor: Principal, scope: Scope, team_id: str) -> dict: ...
    def assign(self, actor: Principal, scope: Scope, team_id: str, *,
               agent_id: str, task_id: str,
               idempotency_key: str | None = None) -> Record: ...
    def message_leader(self, actor: Principal, scope: Scope, *,
                       from_agent: str, to_agent: str, body: str,
                       references: list[str] | None = None,
                       idempotency_key: str | None = None) -> Record: ...
    def inbox(self, actor: Principal, scope: Scope, *, agent_id: str,
              status: str | None = None) -> list[Record]: ...
    def acknowledge(self, actor: Principal, scope: Scope, message_id: str, *,
                    status: str, expected_version: int) -> Record: ...
    def open_consultation(self, actor: Principal, scope: Scope, *,
                          parent_session: str, question: str,
                          mode: str = "ask") -> Record: ...
    def consultation_reply(self, actor: Principal, scope: Scope,
                           consultation_id: str, *, body: str,
                           references: list[str] | None = None,
                           idempotency_key: str | None = None) -> Record: ...
    def consult_consultation(self, actor: Principal, scope: Scope,
                             consultation_id: str, *, status: str,
                             expected_version: int) -> Record: ...
```

Rules:
- Agents live in a module-owned `team_agents` table keyed by
  `(project, team, agent_id)` with `parent_agent` and `depth`.
- `depth` is 1 for a root agent and `parent.depth + 1` otherwise. Adding an
  agent deeper than `MAX_DEPTH` raises `InvalidRequest`.
- `add_agent` is idempotent per `(team, agent_id)`: adding the same agent with
  the same definition returns the existing row; a different definition raises
  `Conflict`.
- `message_leader` writes a message record with `kind="message"` and
  `status="SENT"`. The receiver sees it in `inbox`. Sending is **not** applying:
  `status` only becomes `ACKNOWLEDGED` or `APPLIED` through `acknowledge`.
- `open_consultation` creates a record with `kind="consultation"`, a
  `parent_session`, and `mode` in `ask` | `analyse` | `suggest`. `ask` and
  `analyse` are **read-only**: the consultation record must not create or modify
  any other record. Only `suggest` may carry a proposal, and the proposal stays
  a proposal: it is never applied by the consultation itself.
- A consultation carries `context_version` (the project state version it read)
  so a later read can detect that the project moved on.
- `consult_consultation` moves the status through
  `OPEN -> RECEIVED -> MERGING -> APPLIED` or `NEEDS_DECISION`; it never
  applies anything by itself and never bypasses `dai.charters`.
- A consultation is bound to one `parent_session`; a consultation from another
  session is not visible in a new session (it is simply not returned by
  `list_consultations` for a different session).

## 4. `dai/models.py` — model registry, routing, metering (MOD-01..04, RES-01..05)

```python
class ModelRegistry:
    def __init__(self, store: MemoryStore) -> None: ...
    def register(self, actor: Principal, scope: Scope, *, model_id: str,
                 provider: str, capabilities: list[str],
                 context_window: int | None = None,
                 cost_input_per_1k: str | None = None,
                 cost_output_per_1k: str | None = None,
                 cost_currency: str | None = None,
                 cost_basis: str = "unknown",
                 tool_support: list[str] | None = None,
                 availability: str = "unknown",
                 notes: str = "") -> Record: ...
    def catalog(self, actor: Principal, scope: Scope) -> list[dict]: ...
    def get(self, actor: Principal, scope: Scope, model_id: str) -> Record: ...
    def route(self, actor: Principal, scope: Scope, *, task_class: str,
              required_capabilities: list[str] | None = None,
              max_cost_per_1k: str | None = None) -> dict: ...
    def choose(self, actor: Principal, scope: Scope, *, model_id: str,
               role: str, reason: str, task_class: str,
               idempotency_key: str | None = None) -> Record: ...
    def meter(self, actor: Principal, scope: Scope, *, model_id: str,
              task_class: str, input_tokens: int | None = None,
              output_tokens: int | None = None, cache_tokens: int | None = None,
              cost: str | None = None, cost_basis: str = "unknown",
              latency_ms: int | None = None,
              status: str = "ok") -> Record: ...
    def usage(self, actor: Principal, scope: Scope) -> dict: ...
```

Rules:
- `cost_basis` is one of `measured` | `estimated` | `unknown`. `unknown` is
  **never** treated as zero (`MOD-02`): `route()` must not prefer an unknown-cost
  model and `usage()` must report unknown cost separately from zero cost.
- `route()` returns `{"model": ..., "reason": ..., "candidates": [...],
  "needs_decision": bool, "unknown_cost_candidates": [...]}`. If no eligible
  model exists, `model` is `None` and `needs_decision` is `True` — the caller
  waits for the owner; it never silently escalates or assumes a paid model.
- `availability` is `available` | `limited` | `unavailable` | `unknown`. Only
  `available`/`limited` may be routed to automatically.
- `meter()` appends to an append-only usage ledger; `usage()` returns
  `{"actual": {...}, "estimated": {...}, "unknown": {...}}` and never merges
  subscription limits with cash cost (`RES-02`).
- `choose()` records the assignment of a model to a role with its reason and
  the task class; the same `idempotency_key` returns the same receipt.

## 5. `dai/tools.py` — tool gateway and effect policy (ACT-05, SYS-04, EXT-04)

```python
class ToolGateway:
    def __init__(self, store: MemoryStore) -> None: ...
    def register(self, actor: Principal, scope: Scope, *, tool_id: str,
                 systems: list[str], effect: str,
                 required_capability: str | None = None,
                 side_effect: str = "none",
                 data_classes: list[str] | None = None,
                 provider: str = "local") -> Record: ...
    def catalog(self, actor: Principal, scope: Scope) -> list[dict]: ...
    def resolve(self, actor: Principal, scope: Scope, *, tool_id: str,
                system: str, action: str) -> dict: ...
    def invoke(self, actor: Principal, scope: Scope, *, tool_id: str,
               system: str, action: str,
               payload: dict | None = None,
               idempotency_key: str | None = None) -> dict: ...
    def attempts(self, actor: Principal, scope: Scope, tool_id: str) -> list[dict]: ...
```

Rules:
- `resolve()` returns `{"allowed": bool, "reason": str, "source": str}` where
  `source` names who decided (`owner-policy` | `provider` | `system`).
- A system identity alone **never** bans a tool class (`ACT-05`). A denial must
  come from an explicit registration, an authorization, or a provider refusal
  and must name that source.
- `invoke()` performs **no** external action; it records an authorized attempt
  and returns `{"status": "AUTHORIZED"|"DENIED", ...}`. The gateway is a
  policy and audit layer, not an execution engine.
- The same `idempotency_key` never produces a second attempt record.

## 6. `dai/components.py` — external component adoption registry (EXT-01..06, REP-05)

This is the mechanism that lets the owner hand over a GitHub repository later:
D_AI absorbs the repository's **instructions, contracts and working method**,
never the repository itself.

```python
DECISIONS = ("ADOPT_PATTERN", "ADOPT_PATTERN_AFTER_X", "REFERENCE_ONLY", "REJECT")

class ComponentRegistry:
    def __init__(self, store: MemoryStore) -> None: ...
    def propose(self, actor: Principal, scope: Scope, *, source_url: str,
                name: str, license: str = "UNKNOWN",
                commit: str | None = None,
                patterns: list[str], requirements: list[str] | None = None,
                abstraction: str | None = None,
                notes: str = "",
                idempotency_key: str | None = None) -> Record: ...
    def decide(self, actor: Principal, scope: Scope, component_id: str, *,
               decision: str, rationale: str,
               expected_version: int) -> Record: ...
    def adopt(self, actor: Principal, scope: Scope, component_id: str, *,
              capability_id: str, bindings: dict,
              files: list[str], verification: str,
              expected_version: int) -> Record: ...
    def catalog(self, actor: Principal, scope: Scope) -> list[dict]: ...
    def get(self, actor: Principal, scope: Scope, component_id: str) -> Record: ...
    def verify(self, actor: Principal, scope: Scope, component_id: str) -> dict: ...
```

Rules:
- `source_url` must be an `https://github.com/<owner>/<repo>` URL; anything else
  raises `InvalidRequest`.
- `license` is stored verbatim; `UNKNOWN` is allowed but then `decide()` may not
  choose `ADOPT_PATTERN` — it must choose `ADOPT_PATTERN_AFTER_X`,
  `REFERENCE_ONLY` or `REJECT` with a reason. A missing licence is a legal
  question for the owner, not a default to assume.
- `patterns` is a non-empty list of concrete, named, transferable patterns.
  Prose with no pattern raises `InvalidRequest`.
- `decide()` is version-fenced and may only move forward through the recorded
  decision, never silently overwrite a previous decision.
- `adopt()` records what was internalized: `capability_id` (a D_AI-native
  capability), `bindings` (which D_AI contract each pattern binds to),
  `files` (the D_AI files that now carry it) and `verification` (how it is
  checked). The external repository is **not** added as a dependency and its
  code is **not** copied: `adopt()` must reject a `files` entry that points
  outside the D_AI tree or a `bindings` value that is not a known D_AI contract
  name.
- `verify()` re-checks that the recorded files exist and that the recorded
  capability is reachable, returning `{"ok": bool, "missing": [...]}`.

Known D_AI contract names (the allowed `bindings` values):
`charter`, `workflow.step`, `memory.scope`, `decision`, `task`, `team.agent`,
`team.message`, `consultation`, `model.routing`, `tool.gateway`,
`update.check`, `component.registry`, `adapter.opencode`, `adapter.pi`,
`system.spec`.

## 7. `dai/updates.py` — weekly GitHub update watcher (UPD-01..05)

```python
CHECK_INTERVAL_DAYS = 7

class UpdateWatcher:
    def __init__(self, store: MemoryStore, state_dir: Path | None = None) -> None: ...
    def status(self, actor: Principal) -> dict: ...
    def due(self, actor: Principal, *, now: datetime | None = None) -> bool: ...
    def record_check(self, actor: Principal, *, success: bool,
                     detail: str, watched: str | None = None,
                     now: datetime | None = None) -> Record: ...
    def check(self, actor: Principal, *, source: str, channel: str = "default",
              ref: str | None = None,
              now: datetime | None = None) -> dict: ...
    def plan(self, actor: Principal, scope: Scope, *, source: str,
             version: str, commit: str, diff: str, impact: str,
             migration: str = "") -> Record: ...
    def decide(self, actor: Principal, scope: Scope, update_id: str, *,
               decision: str, expected_version: int) -> Record: ...
    def apply(self, actor: Principal, scope: Scope, update_id: str, *,
              expected_version: int, rollback_token: str | None = None) -> Record: ...
    def rollback(self, actor: Principal, scope: Scope, update_id: str, *,
                 expected_version: int) -> Record: ...
```

Rules:
- `due()` is true only when `now >= last_success + 7 days`. A failed check does
  **not** postpone the next check by a week and does **not** become
  `last_success` (`UPD-03`). No catch-up accumulation: ten idle days still mean
  one check, not ten (`UPD-02`).
- The watcher state is a single local file (`state_dir/updates.json`) so several
  environments do not multiply checks.
- `check()` performs an actual network request to `source` and records
  success/failure honestly; it never reports a network failure as success.
- `decide()` accepts `update` | `defer` | `ignore` and is version-fenced.
- `apply()` requires an explicit owner decision first, records a rollback
  token, and on failure restores the previous state instead of losing data.
- `rollback()` reverses an applied update and records the outcome.

## 8. `dai/cli.py` extension — operator commands (add, never replace)

Add these subcommands without changing existing behaviour:
`task`, `decision`, `team`, `model`, `tool`, `component`, `update`, `charter`,
`consultation`. Each prints one JSON object. Destructive operations keep the
existing interactive-confirmation rule.

## 9. Cross-cutting acceptance for every new module

1. `PYTHONPATH=src python -m unittest discover -s tests` passes with **zero**
   failures and the previous 28 tests still pass.
2. Each new module has `tests/test_<module>.py` with at least these cases:
   authorization outside scope is denied with the real reason; a stale
   `expected_version` raises `Conflict`; an idempotent repeat does not create a
   second effect; and the module's main invariant (no silent success, unknown
   cost is not zero, waiting is not doing) is asserted.
3. No test reaches the network, a subprocess, or a wall-clock assertion.
4. No file under `src/dai/` other than the module's own is modified.
