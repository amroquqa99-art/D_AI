"""MCP server exposing the D_AI core as bounded tools over stdio.

Transport: stdio, via the official MCP SDK (mcp.server.fastmcp.FastMCP).
One bounded, named tool per core operation, grouped by prefix:
  dai_project_*      (create, list)
  dai_charter_*      (propose, assess, approve, active)
  dai_task_*         (create, get, list, state, lease, release, attempt, graph)
  dai_decision_*     (record, list, supersede, withdraw, affected)
  dai_team_*         (create, add_agent, agents, tree, assign, message, inbox, acknowledge)
  dai_consultation_* (open, reply, status, list)
  dai_model_*        (register, list, route, choose, meter, usage)
  dai_tool_*         (register, list, resolve, invoke)
  dai_component_*    (propose, decide, adopt, list, verify, import)
  dai_update_*       (status, check, plan, decide, apply, rollback)
  dai_memory_*       (create, get, list, search, archive, restore, history)
  dai_backup_*       (create)

Every tool takes explicit identifiers and returns a JSON-serialisable dict.
Project-scoped tools require an explicit project id and never silently fall
back to a global scope. Collection results are bounded (store defaults and
explicit limits); nothing dumps whole collections. Errors come only from
dai.errors and are returned to the host as {"error": "<Type>",
"message": "<reason>"}; no traceback and no private record content is ever
printed or returned by a tool.

NOT exposed as MCP tools: memory purge (MemoryStore.request_purge /
confirm_purge) and backup restore (MemoryStore.restore_snapshot). Both are
destructive and require live interactive confirmation, so they stay behind
the CLI exactly as the core CLI enforces.
"""

from __future__ import annotations

import os
from pathlib import Path

from dai.errors import DaiError
from mcp.server.fastmcp import Context, FastMCP

try:  # imported as adapters.opencode.mcp.server
    from .dai_core_bridge import DaiCoreBridge
except ImportError:  # imported standalone with the mcp directory on sys.path
    from dai_core_bridge import DaiCoreBridge  # type: ignore[no-redef]

DATA_ROOT = Path(os.environ.get("DAI_DATA_ROOT", Path.home() / ".d-ai"))
PROJECT_ROOT = Path(os.environ.get("DAI_PROJECT_ROOT", str(DATA_ROOT)))

mcp = FastMCP("dai")
_bridge: DaiCoreBridge | None = None


def _get_bridge() -> DaiCoreBridge:
    global _bridge
    if _bridge is None:
        _bridge = DaiCoreBridge(data_root=DATA_ROOT, project_root=PROJECT_ROOT)
    return _bridge


def _session_id(ctx: Context) -> str | None:
    """Read the host session id from native request metadata."""
    meta = getattr(getattr(ctx, "request_context", None), "meta", None)
    if meta is None:
        return None
    value = meta.model_dump() if hasattr(meta, "model_dump") else dict(meta)
    session_id = value.get("ai.opencode/sessionID")
    return session_id if isinstance(session_id, str) else None


def _actor(ctx: Context):
    """Resolve the acting principal from the host session; never from text."""
    return _get_bridge().resolve_principal(
        _session_id(ctx), _get_bridge().native_client)


def _call(tool, ctx: Context, *args, **kwargs):
    """Run one bridge helper through the server and never leak a traceback."""
    try:
        actor = _actor(ctx)
        return tool(actor, *args, **kwargs)
    except DaiError as exc:
        return DaiCoreBridge.error_payload(exc)


@mcp.tool()
def dai_search_files(ctx: Context, query: str, limit: int = 30) -> dict:
    """Search bounded text in the caller's verified native workspace; omit secrets."""
    try:
        actor = _actor(ctx)
        session_id = _session_id(ctx)
        native = _get_bridge().native_client.session(session_id)
        workspace = native["location"]["directory"]
        return _get_bridge().dai_search_files(actor, workspace, query, limit)
    except DaiError as exc:
        return DaiCoreBridge.error_payload(exc)
    except (KeyError, TypeError, OSError, ValueError):
        return {"error": "AccessDenied", "message": "Native workspace is unavailable"}


# ---- encrypted mission/evidence/claim tools ----------------------------

@mcp.tool()
def dai_mission_create(ctx: Context, project_id: str, system: str,
                       objective: str, acceptance: list[str]) -> dict:
    """Create an encrypted project mission with explicit acceptance criteria."""
    return _call(_get_bridge().dai_mission_create, ctx,
                 project_id, system, objective, acceptance)


@mcp.tool()
def dai_mission_get(ctx: Context, project_id: str, mission_id: str) -> dict:
    """Resume a durable encrypted mission and count attached evidence."""
    return _call(_get_bridge().dai_mission_get, ctx, project_id, mission_id)


@mcp.tool()
def dai_mission_checkpoint(ctx: Context, project_id: str, mission_id: str,
                           expected_version: int, status: str, next_action: str,
                           artifacts: list[str] | None = None,
                           receipts: list[str] | None = None,
                           review: str | None = None) -> dict:
    """Version-fenced checkpoint; COMPLETED requires artifacts/receipts/review."""
    return _call(_get_bridge().dai_mission_checkpoint, ctx, project_id, mission_id,
                 expected_version, status, next_action, artifacts, receipts, review)


@mcp.tool()
def dai_evidence_add(ctx: Context, project_id: str, mission_id: str,
                     title: str, locator: str, content: str,
                     source_kind: str = "provided_text") -> dict:
    """Encrypt an original source and tie it to one mission in the same project."""
    return _call(_get_bridge().dai_evidence_add, ctx, project_id, mission_id,
                 title, locator, content, source_kind)


@mcp.tool()
def dai_claim_add(ctx: Context, project_id: str, mission_id: str,
                  text: str, claim_type: str, source_ids: list[str] | None = None,
                  limitations: str = "") -> dict:
    """Store a typed claim; factual claims require original evidence in mission."""
    return _call(_get_bridge().dai_claim_add, ctx, project_id, mission_id,
                 text, claim_type, source_ids, limitations)


@mcp.tool()
def dai_project_grant(ctx: Context, project_id: str, member_agent: str,
                      role: str = "contributor") -> dict:
    """Owner-only explicit project grant to a named D_AI manager."""
    return _call(_get_bridge().dai_project_grant, ctx, project_id,
                 member_agent, role)


# ---- project -----------------------------------------------------------

@mcp.tool()
def dai_project_create(ctx: Context, name: str,
                       project_id: str | None = None) -> dict:
    """Create a project and return its scope (owner, namespace, project id)."""
    return _call(_get_bridge().dai_project_create, ctx, name,
                 project_id=project_id)


@mcp.tool()
def dai_project_list(ctx: Context) -> list[dict]:
    """List the projects the acting principal belongs to."""
    return _call(_get_bridge().dai_project_list, ctx)


# ---- charter -----------------------------------------------------------

@mcp.tool()
def dai_charter_propose(ctx: Context, project_id: str,
                        content: str) -> dict:
    """Propose a charter draft record. content is a JSON object string."""
    return _call(_get_bridge().dai_charter_propose, ctx, project_id, content)


@mcp.tool()
def dai_charter_assess(ctx: Context, project_id: str,
                       draft_id: str) -> dict:
    """Assess a charter draft and list missing fields."""
    return _call(_get_bridge().dai_charter_assess, ctx, project_id, draft_id)


@mcp.tool()
def dai_charter_approve(ctx: Context, project_id: str,
                        draft_id: str, expected_version: int) -> dict:
    """Approve a charter draft (version-fenced)."""
    return _call(_get_bridge().dai_charter_approve, ctx, project_id,
                 draft_id, expected_version)


@mcp.tool()
def dai_charter_active(ctx: Context, project_id: str) -> dict:
    """Show the project's approved active charter."""
    return _call(_get_bridge().dai_charter_active, ctx, project_id)


# ---- task --------------------------------------------------------------

@mcp.tool()
def dai_task_create(ctx: Context, project_id: str, objective: str,
                    acceptance: list[str] | None = None,
                    charter_id: str | None = None,
                    responsibility: str | None = None,
                    inputs: list[str] | None = None,
                    outputs: list[str] | None = None,
                    depends_on: list[str] | None = None,
                    idempotency_key: str | None = None) -> dict:
    """Create a task against the approved active charter."""
    return _call(_get_bridge().dai_task_create, ctx, project_id, objective,
                 acceptance, charter_id=charter_id,
                 responsibility=responsibility, inputs=inputs,
                 outputs=outputs, depends_on=depends_on,
                 idempotency_key=idempotency_key)


@mcp.tool()
def dai_task_get(ctx: Context, project_id: str,
                 task_id: str) -> dict:
    """Show a task record."""
    return _call(_get_bridge().dai_task_get, ctx, project_id, task_id)


@mcp.tool()
def dai_task_list(ctx: Context, project_id: str,
                  state: str | None = None,
                  limit: int = 50) -> list[dict]:
    """List task records, optionally filtered by state."""
    return _call(_get_bridge().dai_task_list, ctx, project_id,
                 state=state, limit=limit)


@mcp.tool()
def dai_task_state(ctx: Context, project_id: str, task_id: str,
                   state: str, expected_version: int,
                   receipt: str | None = None,
                   note: str = "") -> dict:
    """Advance a task state (version-fenced)."""
    return _call(_get_bridge().dai_task_state, ctx, project_id, task_id,
                 state, expected_version, receipt=receipt, note=note)


@mcp.tool()
def dai_task_lease(ctx: Context, project_id: str, task_id: str,
                   owner: str, ttl: int = 300) -> dict:
    """Take an exclusive lease on a task."""
    return _call(_get_bridge().dai_task_lease, ctx, project_id, task_id,
                 owner, ttl=ttl)


@mcp.tool()
def dai_task_release(ctx: Context, project_id: str, task_id: str,
                     owner: str) -> dict:
    """Release a task lease."""
    return _call(_get_bridge().dai_task_release, ctx, project_id, task_id,
                 owner)


@mcp.tool()
def dai_task_attempt(ctx: Context, project_id: str, task_id: str,
                     attempt_id: str, outcome: str,
                     artifacts: list[str] | None = None,
                     receipt: str | None = None,
                     expected_version: int | None = None,
                     idempotency_key: str | None = None) -> dict:
    """Record a task attempt (the only path to COMPLETED)."""
    return _call(_get_bridge().dai_task_attempt, ctx, project_id, task_id,
                 attempt_id, outcome, artifacts=artifacts, receipt=receipt,
                 expected_version=expected_version,
                 idempotency_key=idempotency_key)


@mcp.tool()
def dai_task_graph(ctx: Context, project_id: str) -> dict:
    """Return the task dependency graph."""
    return _call(_get_bridge().dai_task_graph, ctx, project_id)


# ---- decision ----------------------------------------------------------

@mcp.tool()
def dai_decision_record(ctx: Context, project_id: str, text: str,
                        meaning: str, authorization_source: str,
                        affects: list[str] | None = None,
                        supersedes: str | None = None,
                        idempotency_key: str | None = None) -> dict:
    """Record a new decision."""
    return _call(_get_bridge().dai_decision_record, ctx, project_id, text,
                 meaning, authorization_source, affects=affects,
                 supersedes=supersedes, idempotency_key=idempotency_key)


@mcp.tool()
def dai_decision_list(ctx: Context, project_id: str) -> list[dict]:
    """List active decisions."""
    return _call(_get_bridge().dai_decision_list, ctx, project_id)


@mcp.tool()
def dai_decision_supersede(ctx: Context, project_id: str,
                           decision_id: str, text: str,
                           authorization_source: str,
                           expected_version: int,
                           idempotency_key: str | None = None) -> dict:
    """Supersede an active decision with a new record."""
    return _call(_get_bridge().dai_decision_supersede, ctx, project_id,
                 decision_id, text, authorization_source,
                 expected_version, idempotency_key=idempotency_key)


@mcp.tool()
def dai_decision_withdraw(ctx: Context, project_id: str,
                          decision_id: str, reason: str,
                          expected_version: int) -> dict:
    """Withdraw an active decision."""
    return _call(_get_bridge().dai_decision_withdraw, ctx, project_id,
                 decision_id, reason, expected_version)


@mcp.tool()
def dai_decision_affected(ctx: Context, project_id: str,
                          unit: str) -> list[dict]:
    """List active decisions affecting a unit."""
    return _call(_get_bridge().dai_decision_affected, ctx, project_id, unit)


# ---- team --------------------------------------------------------------

@mcp.tool()
def dai_team_create(ctx: Context, project_id: str, name: str,
                    roles: list[str] | None = None,
                    idempotency_key: str | None = None) -> dict:
    """Create a team."""
    return _call(_get_bridge().dai_team_create, ctx, project_id, name,
                 roles=roles, idempotency_key=idempotency_key)


@mcp.tool()
def dai_team_add_agent(ctx: Context, project_id: str, team_id: str,
                       agent_id: str, role: str,
                       parent_agent: str | None = None,
                       model: str | None = None,
                       budget: str | None = None) -> dict:
    """Add an agent to a team. budget is a JSON object string."""
    return _call(_get_bridge().dai_team_add_agent, ctx, project_id, team_id,
                 agent_id, role, parent_agent=parent_agent, model=model,
                 budget=_json_object(budget, "team budget") if budget else None)


@mcp.tool()
def dai_team_agents(ctx: Context, project_id: str,
                    team_id: str) -> list[dict]:
    """List agents in a team."""
    return _call(_get_bridge().dai_team_agents, ctx, project_id, team_id)


@mcp.tool()
def dai_team_tree(ctx: Context, project_id: str,
                  team_id: str) -> dict:
    """Show the agent tree."""
    return _call(_get_bridge().dai_team_tree, ctx, project_id, team_id)


@mcp.tool()
def dai_team_assign(ctx: Context, project_id: str, team_id: str,
                    agent_id: str, task_id: str,
                    idempotency_key: str | None = None) -> dict:
    """Assign a task to an agent."""
    return _call(_get_bridge().dai_team_assign, ctx, project_id, team_id,
                 agent_id, task_id, idempotency_key=idempotency_key)


@mcp.tool()
def dai_team_message(ctx: Context, project_id: str,
                     from_agent: str, to_agent: str, body: str,
                     references: list[str] | None = None,
                     idempotency_key: str | None = None) -> dict:
    """Send a message from one agent to another."""
    return _call(_get_bridge().dai_team_message, ctx, project_id,
                 from_agent, to_agent, body, references=references,
                 idempotency_key=idempotency_key)


@mcp.tool()
def dai_team_inbox(ctx: Context, project_id: str, agent_id: str,
                   status: str | None = None) -> list[dict]:
    """List an agent's inbox."""
    return _call(_get_bridge().dai_team_inbox, ctx, project_id, agent_id,
                 status=status)


@mcp.tool()
def dai_team_acknowledge(ctx: Context, project_id: str,
                         message_id: str, status: str,
                         expected_version: int) -> dict:
    """Acknowledge a SENT message."""
    return _call(_get_bridge().dai_team_acknowledge, ctx, project_id,
                 message_id, status, expected_version)


# ---- consultation ------------------------------------------------------

@mcp.tool()
def dai_consultation_open(ctx: Context, project_id: str,
                          parent_session: str, question: str,
                          mode: str = "ask") -> dict:
    """Open a consultation."""
    return _call(_get_bridge().dai_consultation_open, ctx, project_id,
                 parent_session, question, mode=mode)


@mcp.tool()
def dai_consultation_reply(ctx: Context, project_id: str,
                           consultation_id: str, body: str,
                           references: list[str] | None = None,
                           expected_version: int | None = None,
                           idempotency_key: str | None = None) -> dict:
    """Reply to a consultation."""
    return _call(_get_bridge().dai_consultation_reply, ctx, project_id,
                 consultation_id, body, references=references,
                 expected_version=expected_version,
                 idempotency_key=idempotency_key)


@mcp.tool()
def dai_consultation_status(ctx: Context, project_id: str,
                            consultation_id: str, status: str,
                            expected_version: int) -> dict:
    """Advance a consultation status."""
    return _call(_get_bridge().dai_consultation_status, ctx, project_id,
                 consultation_id, status, expected_version)


@mcp.tool()
def dai_consultation_list(ctx: Context, project_id: str,
                          parent_session: str) -> list[dict]:
    """List the consultations of one parent session."""
    return _call(_get_bridge().dai_consultation_list, ctx, project_id,
                 parent_session=parent_session)


# ---- model -------------------------------------------------------------

@mcp.tool()
def dai_model_register(ctx: Context, project_id: str, model_id: str,
                       provider: str, capabilities: list[str],
                       context_window: int | None = None,
                       cost_input_per_1k: str | None = None,
                       cost_output_per_1k: str | None = None,
                       cost_currency: str | None = None,
                       cost_basis: str = "unknown",
                       tool_support: list[str] | None = None,
                       availability: str = "unknown",
                       notes: str = "") -> dict:
    """Register a model."""
    return _call(_get_bridge().dai_model_register, ctx, project_id, model_id,
                 provider, capabilities, context_window=context_window,
                 cost_input_per_1k=cost_input_per_1k,
                 cost_output_per_1k=cost_output_per_1k,
                 cost_currency=cost_currency, cost_basis=cost_basis,
                 tool_support=tool_support, availability=availability,
                 notes=notes)


@mcp.tool()
def dai_model_list(ctx: Context, project_id: str) -> list[dict]:
    """List registered models."""
    return _call(_get_bridge().dai_model_list, ctx, project_id)


@mcp.tool()
def dai_model_route(ctx: Context, project_id: str, task_class: str,
                    required_capabilities: list[str] | None = None,
                    max_cost_per_1k: str | None = None,
                    free_only: bool = True) -> dict:
    """Recommend a model; D_AI automatic routing defaults to free-only.

    Explicit free_only=False is a *recommendation*, not a spending authorization.
    Actual inference must apply host/provider permissions and billing checks.
    """
    return _call(_get_bridge().dai_model_route, ctx, project_id, task_class,
                 required_capabilities=required_capabilities,
                 max_cost_per_1k=max_cost_per_1k, free_only=free_only)


@mcp.tool()
def dai_model_choose(ctx: Context, project_id: str, model_id: str,
                     role: str, reason: str, task_class: str,
                     idempotency_key: str | None = None) -> dict:
    """Choose a model for a role."""
    return _call(_get_bridge().dai_model_choose, ctx, project_id, model_id,
                 role, reason, task_class,
                 idempotency_key=idempotency_key)


@mcp.tool()
def dai_model_meter(ctx: Context, project_id: str, model_id: str,
                    task_class: str,
                    input_tokens: int | None = None,
                    output_tokens: int | None = None,
                    cache_tokens: int | None = None,
                    cost: str | None = None,
                    cost_basis: str = "unknown",
                    latency_ms: int | None = None,
                    status: str = "ok") -> dict:
    """Meter model usage (append-only ledger)."""
    return _call(_get_bridge().dai_model_meter, ctx, project_id, model_id,
                 task_class, input_tokens=input_tokens,
                 output_tokens=output_tokens, cache_tokens=cache_tokens,
                 cost=cost, cost_basis=cost_basis, latency_ms=latency_ms,
                 status=status)


@mcp.tool()
def dai_model_usage(ctx: Context, project_id: str) -> dict:
    """Return actual, estimated and unknown usage."""
    return _call(_get_bridge().dai_model_usage, ctx, project_id)


# ---- tool --------------------------------------------------------------

@mcp.tool()
def dai_tool_register(ctx: Context, project_id: str, tool_id: str,
                      systems: list[str], effect: str,
                      required_capability: str | None = None,
                      side_effect: str = "none",
                      data_classes: list[str] | None = None,
                      provider: str = "local") -> dict:
    """Register a tool."""
    return _call(_get_bridge().dai_tool_register, ctx, project_id, tool_id,
                 systems, effect, required_capability=required_capability,
                 side_effect=side_effect, data_classes=data_classes,
                 provider=provider)


@mcp.tool()
def dai_tool_list(ctx: Context, project_id: str) -> list[dict]:
    """List registered tools."""
    return _call(_get_bridge().dai_tool_list, ctx, project_id)


@mcp.tool()
def dai_tool_resolve(ctx: Context, project_id: str, tool_id: str,
                     system: str, action: str) -> dict:
    """Resolve whether a tool is authorized."""
    return _call(_get_bridge().dai_tool_resolve, ctx, project_id, tool_id,
                 system, action)


@mcp.tool()
def dai_tool_invoke(ctx: Context, project_id: str, tool_id: str,
                    system: str, action: str,
                    payload: str | None = None,
                    idempotency_key: str | None = None) -> dict:
    """Record an authorized or denied tool attempt."""
    return _call(_get_bridge().dai_tool_invoke, ctx, project_id, tool_id,
                 system, action,
                 payload=_json_object(payload, "tool invocation payload")
                 if payload else None,
                 idempotency_key=idempotency_key)


# ---- component ---------------------------------------------------------

@mcp.tool()
def dai_component_propose(ctx: Context, project_id: str, source_url: str,
                          name: str, patterns: list[str],
                          license: str = "UNKNOWN",
                          commit: str | None = None,
                          requirements: list[str] | None = None,
                          abstraction: str | None = None,
                          notes: str = "",
                          idempotency_key: str | None = None) -> dict:
    """Propose an external component."""
    return _call(_get_bridge().dai_component_propose, ctx, project_id,
                 source_url, name, patterns, license=license, commit=commit,
                 requirements=requirements, abstraction=abstraction,
                 notes=notes, idempotency_key=idempotency_key)


@mcp.tool()
def dai_component_decide(ctx: Context, project_id: str,
                         component_id: str, decision: str,
                         rationale: str,
                         expected_version: int) -> dict:
    """Decide a component (version-fenced, one decision)."""
    return _call(_get_bridge().dai_component_decide, ctx, project_id,
                 component_id, decision, rationale, expected_version)


@mcp.tool()
def dai_component_adopt(ctx: Context, project_id: str,
                        component_id: str, capability_id: str,
                        bindings: str, files: list[str],
                        verification: str,
                        expected_version: int) -> dict:
    """Adopt a decided component into D_AI-native files. bindings is JSON."""
    return _call(_get_bridge().dai_component_adopt, ctx, project_id,
                 component_id, capability_id,
                 bindings=_json_object(bindings, "component bindings"),
                 files=files, verification=verification,
                 expected_version=expected_version)


@mcp.tool()
def dai_component_list(ctx: Context, project_id: str) -> list[dict]:
    """List proposed and adopted components."""
    return _call(_get_bridge().dai_component_list, ctx, project_id)


@mcp.tool()
def dai_component_verify(ctx: Context, project_id: str,
                         component_id: str) -> dict:
    """Verify adopted files still exist and the capability is reachable."""
    return _call(_get_bridge().dai_component_verify, ctx, project_id,
                 component_id)


@mcp.tool()
def dai_component_import(ctx: Context, project_id: str,
                         manifest: str) -> list[dict]:
    """Import and propose components from a manifest."""
    return _call(_get_bridge().dai_component_import, ctx, project_id,
                 manifest)


# ---- update ------------------------------------------------------------

@mcp.tool()
def dai_update_status(ctx: Context) -> dict:
    """Show watcher state and whether a check is due."""
    return _call(_get_bridge().dai_update_status, ctx)


@mcp.tool()
def dai_update_check(ctx: Context, source: str,
                     channel: str = "default",
                     ref: str | None = None) -> dict:
    """Perform a real network check of a source."""
    return _call(_get_bridge().dai_update_check, ctx, source,
                 channel=channel, ref=ref)


@mcp.tool()
def dai_update_plan(ctx: Context, project_id: str, source: str,
                    version: str, commit: str, diff: str,
                    impact: str, migration: str = "") -> dict:
    """Plan an update (project-scoped)."""
    return _call(_get_bridge().dai_update_plan, ctx, project_id, source,
                 version, commit, diff, impact, migration=migration)


@mcp.tool()
def dai_update_decide(ctx: Context, project_id: str, update_id: str,
                      decision: str, expected_version: int) -> dict:
    """Decide a planned update (project-scoped)."""
    return _call(_get_bridge().dai_update_decide, ctx, project_id, update_id,
                 decision, expected_version)


@mcp.tool()
def dai_update_apply(ctx: Context, project_id: str, update_id: str,
                     expected_version: int,
                     rollback_token: str | None = None) -> dict:
    """Apply a decided update (project-scoped)."""
    return _call(_get_bridge().dai_update_apply, ctx, project_id, update_id,
                 expected_version, rollback_token=rollback_token)


@mcp.tool()
def dai_update_rollback(ctx: Context, project_id: str, update_id: str,
                        expected_version: int) -> dict:
    """Roll back an applied update (project-scoped)."""
    return _call(_get_bridge().dai_update_rollback, ctx, project_id,
                 update_id, expected_version)


# ---- memory ------------------------------------------------------------

@mcp.tool()
def dai_memory_create(ctx: Context, project_id: str, kind: str,
                      content: str) -> dict:
    """Create an encrypted, versioned memory record. content is JSON."""
    return _call(_get_bridge().dai_memory_create, ctx, project_id, kind,
                 content=_json_object(content, "memory content"))


@mcp.tool()
def dai_memory_get(ctx: Context, project_id: str,
                   record_id: str) -> dict:
    """Read a memory record."""
    return _call(_get_bridge().dai_memory_get, ctx, project_id, record_id)


@mcp.tool()
def dai_memory_list(ctx: Context, project_id: str,
                    kind: str | None = None,
                    limit: int = 50) -> list[dict]:
    """List memory records (bounded by limit)."""
    return _call(_get_bridge().dai_memory_list, ctx, project_id,
                 kind=kind, limit=limit)


@mcp.tool()
def dai_memory_search(ctx: Context, project_id: str, query: str,
                      limit: int = 20) -> list[dict]:
    """Search memory records (bounded by limit)."""
    return _call(_get_bridge().dai_memory_search, ctx, project_id,
                 query, limit=limit)


@mcp.tool()
def dai_memory_archive(ctx: Context, project_id: str,
                       record_id: str, expected_version: int) -> dict:
    """Archive a memory record (version-fenced)."""
    return _call(_get_bridge().dai_memory_archive, ctx, project_id,
                 record_id, expected_version)


@mcp.tool()
def dai_memory_restore(ctx: Context, project_id: str,
                       record_id: str, expected_version: int) -> dict:
    """Restore an archived memory record (version-fenced)."""
    return _call(_get_bridge().dai_memory_restore, ctx, project_id,
                 record_id, expected_version)


@mcp.tool()
def dai_memory_history(ctx: Context, project_id: str,
                       record_id: str) -> list[dict]:
    """Explicit historical access to a record's revisions."""
    return _call(_get_bridge().dai_memory_history, ctx, project_id,
                 record_id)


# ---- backup ------------------------------------------------------------

@mcp.tool()
def dai_backup_create(ctx: Context, destination: str) -> dict:
    """Snapshot the live state to a destination outside it."""
    return _call(_get_bridge().dai_backup_create, ctx, destination)


def _json_object(text: str, what: str) -> dict:
    """Parse a JSON object from a string without leaking record content."""
    import json
    try:
        value = json.loads(text)
    except ValueError as exc:
        raise InvalidRequest(f"{what} must be a JSON object") from exc
    if not isinstance(value, dict):
        raise InvalidRequest(f"{what} must be a JSON object")
    return value


from dai.errors import InvalidRequest  # noqa: E402  (used by _json_object)


if __name__ == "__main__":
    mcp.run(transport="stdio")
