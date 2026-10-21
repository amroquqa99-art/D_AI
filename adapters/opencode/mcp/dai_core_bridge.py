"""Bridge from the D_AI 1.0 core to the OpenCode MCP layer.

All core access goes through this module: one MemoryStore over DAI_DATA_ROOT
(default ~/.d-ai), the project root from DAI_PROJECT_ROOT, and the service
objects for charters, tasks, decisions, teams, consultations, models, tools,
components and updates.

The acting principal is resolved exclusively from the native OpenCode session
metadata supplied by the host ("ai.opencode/sessionID" on the request), read
through the same NativeClient pattern as the legacy MCP server. A session id
that is not a native "ses_" id, or a session whose agent is not a loaded DAI
agent, is refused: authority never comes from model text.

Core failures are only ever dai.errors exceptions; error_payload() converts
them into JSON-safe {"error", "message"} payloads that carry identifiers and
reasons, never private record content. Destructive operations (memory purge
and backup restore) are not exposed here and stay behind the interactive
local CLI, which enforces live confirmation.
"""

from __future__ import annotations

import os
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

from dai.charters import CharterService
from dai.components import ComponentRegistry
from dai.contracts import Principal, Scope
from dai.decisions import DecisionService
from dai.errors import AccessDenied, DaiError, InvalidRequest
from dai.memory import MemoryStore
from dai.models import ModelRegistry
from dai.tasks import TaskService
from dai.teams import TeamService
from dai.tools import ToolGateway
from dai.updates import UpdateWatcher

try:  # imported as adapters.opencode.mcp.dai_core_bridge
    from .native import NativeClient
except ImportError:  # run directly as a script
    from native import NativeClient  # type: ignore[no-redef]


def _json_safe(value: Any) -> Any:
    """Make a service receipt JSON-safe without touching private content."""
    if is_dataclass(value):
        return _json_safe(asdict(value))
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    return value


class DaiCoreBridge:
    def __init__(
        self,
        data_root: str | Path | None = None,
        project_root: str | Path | None = None,
        native_client: Any = None,
        administrator: str = "owner",
    ) -> None:
        self.data_root = Path(
            data_root or os.environ.get("DAI_DATA_ROOT") or Path.home() / ".d-ai"
        )
        self.project_root = Path(
            project_root or os.environ.get("DAI_PROJECT_ROOT") or self.data_root
        )
        self.native_client = native_client or NativeClient()
        self.store = MemoryStore(self.data_root, administrator=administrator)
        self.charters = CharterService(self.store)
        self.tasks = TaskService(self.store)
        self.decisions = DecisionService(self.store)
        self.teams = TeamService(self.store)
        self.models = ModelRegistry(self.store)
        self.tools = ToolGateway(self.store)
        self.components = ComponentRegistry(self.store)
        self.updates = UpdateWatcher(self.store)

    # ---- principal and scope -------------------------------------------

    def resolve_principal(self, session_id: str | None,
                          native_client: Any = None) -> Principal:
        """Resolve the acting principal from native session metadata only.

        Refuses any session id that is not a native "ses_" id and any session
        whose agent is not a loaded DAI agent. Never invents a principal.
        """
        if not isinstance(session_id, str) or not session_id.startswith("ses_") \
                or "/" in session_id:
            raise InvalidRequest(
                "The acting principal requires a native OpenCode session id "
                "(ai.opencode/sessionID, 'ses_...'); authority never comes "
                "from model text")
        client = native_client or self.native_client
        try:
            session = client.session(session_id)
        except DaiError:
            raise
        except Exception as exc:  # the host is absent or unreachable
            raise AccessDenied(
                f"Session {session_id} could not be read from the native host: "
                f"{type(exc).__name__}"
            ) from exc
        if not isinstance(session, dict):
            raise AccessDenied("Native session metadata is not an object")
        agent = session.get("agent", "")
        if not isinstance(agent, str) or not (
                agent.startswith("dai-") or agent.startswith("dai/")):
            raise AccessDenied(
                "The session's agent is not a loaded DAI agent; refusing to "
                "invent a principal")
        try:
            return Principal(agent)
        except InvalidRequest as exc:
            raise AccessDenied(
                f"Session agent identity is not a valid principal: {exc}"
            ) from exc

    def project_scope(self, actor: Principal, project_id: str) -> Scope:
        """Resolve a project scope; raises NotFound/AccessDenied explicitly."""
        return self.store.project_scope(actor, project_id)

    def person_scope(self, actor: Principal) -> Scope:
        return Scope("person", actor.id)

    # ---- error conversion ----------------------------------------------

    @staticmethod
    def error_payload(exc: Exception) -> dict[str, str]:
        """Convert a core failure into a JSON-safe error payload.

        dai.errors messages carry identifiers and reasons only; nothing else
        is added, so private record content never leaves through an error.
        """
        return {"error": type(exc).__name__, "message": str(exc)}

    # ---- project -------------------------------------------------------

    def dai_project_create(self, actor: Principal, name: str,
                           project_id: str | None = None) -> dict[str, Any]:
        return _json_safe(asdict(self.store.create_project(
            actor, name, project_id=project_id)))

    def dai_project_list(self, actor: Principal) -> list[dict[str, Any]]:
        return _json_safe([asdict(p) for p in self.store.projects(actor)])

    # ---- charter -------------------------------------------------------

    def dai_charter_propose(self, actor: Principal, project_id: str,
                            content: dict[str, Any]) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.charters.propose(actor, scope, content)))

    def dai_charter_assess(self, actor: Principal, project_id: str,
                           draft_id: str) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.charters.assess(actor, scope, draft_id))

    def dai_charter_approve(self, actor: Principal, project_id: str,
                            draft_id: str, expected_version: int
                            ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.charters.approve(
            actor, scope, draft_id, expected_version=expected_version)))

    def dai_charter_active(self, actor: Principal,
                           project_id: str) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.charters.active(actor, scope)))

    # ---- task ----------------------------------------------------------

    def dai_task_create(self, actor: Principal, project_id: str,
                        objective: str, acceptance: list[str] | None = None,
                        charter_id: str | None = None,
                        responsibility: str | None = None,
                        inputs: list[str] | None = None,
                        outputs: list[str] | None = None,
                        depends_on: list[str] | None = None,
                        idempotency_key: str | None = None
                        ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.tasks.create_task(
            actor, scope, objective=objective, acceptance=acceptance,
            charter_id=charter_id, responsibility=responsibility,
            inputs=inputs, outputs=outputs, depends_on=depends_on,
            idempotency_key=idempotency_key)))

    def dai_task_get(self, actor: Principal, project_id: str,
                     task_id: str) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.tasks.get(actor, scope, task_id)))

    def dai_task_list(self, actor: Principal, project_id: str,
                      state: str | None = None,
                      limit: int = 50) -> list[dict[str, Any]]:
        scope = self.project_scope(actor, project_id)
        return _json_safe([asdict(r) for r in self.tasks.list(
            actor, scope, state=state, limit=limit)])

    def dai_task_state(self, actor: Principal, project_id: str, task_id: str,
                       state: str, expected_version: int,
                       receipt: str | None = None,
                       note: str = "") -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.tasks.set_state(
            actor, scope, task_id, state=state,
            expected_version=expected_version, receipt=receipt, note=note)))

    def dai_task_lease(self, actor: Principal, project_id: str, task_id: str,
                       owner: str, ttl: int = 300) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.tasks.lease(
            actor, scope, task_id, owner=owner, ttl=ttl)))

    def dai_task_release(self, actor: Principal, project_id: str,
                         task_id: str, owner: str) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.tasks.release(
            actor, scope, task_id, owner=owner)))

    def dai_task_attempt(self, actor: Principal, project_id: str,
                         task_id: str, attempt_id: str, outcome: str,
                         artifacts: list[str] | None = None,
                         receipt: str | None = None,
                         expected_version: int | None = None,
                         idempotency_key: str | None = None
                         ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.tasks.record_attempt(
            actor, scope, task_id, attempt_id=attempt_id, outcome=outcome,
            artifacts=artifacts, receipt=receipt,
            expected_version=expected_version,
            idempotency_key=idempotency_key)))

    def dai_task_graph(self, actor: Principal,
                       project_id: str) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.tasks.graph(actor, scope))

    # ---- decision ------------------------------------------------------

    def dai_decision_record(self, actor: Principal, project_id: str,
                            text: str, meaning: str,
                            authorization_source: str,
                            affects: list[str] | None = None,
                            supersedes: str | None = None,
                            idempotency_key: str | None = None
                            ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.decisions.record(
            actor, scope, text=text, meaning=meaning,
            authorization_source=authorization_source, affects=affects,
            supersedes=supersedes, idempotency_key=idempotency_key)))

    def dai_decision_list(self, actor: Principal,
                          project_id: str) -> list[dict[str, Any]]:
        scope = self.project_scope(actor, project_id)
        return _json_safe([asdict(r) for r in self.decisions.active(actor, scope)])

    def dai_decision_supersede(self, actor: Principal, project_id: str,
                               decision_id: str, text: str,
                               authorization_source: str,
                               expected_version: int,
                               idempotency_key: str | None = None
                               ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.decisions.supersede(
            actor, scope, decision_id, text=text,
            authorization_source=authorization_source,
            expected_version=expected_version,
            idempotency_key=idempotency_key)))

    def dai_decision_withdraw(self, actor: Principal, project_id: str,
                              decision_id: str, reason: str,
                              expected_version: int) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.decisions.withdraw(
            actor, scope, decision_id, reason=reason,
            expected_version=expected_version)))

    def dai_decision_affected(self, actor: Principal, project_id: str,
                              unit: str) -> list[dict[str, Any]]:
        scope = self.project_scope(actor, project_id)
        return _json_safe([asdict(r) for r in self.decisions.affected(
            actor, scope, unit)])

    # ---- team ----------------------------------------------------------

    def dai_team_create(self, actor: Principal, project_id: str,
                        name: str, roles: list[str] | None = None,
                        idempotency_key: str | None = None
                        ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.teams.create_team(
            actor, scope, name=name, roles=roles,
            idempotency_key=idempotency_key)))

    def dai_team_add_agent(self, actor: Principal, project_id: str,
                           team_id: str, agent_id: str, role: str,
                           parent_agent: str | None = None,
                           model: str | None = None,
                           budget: dict[str, Any] | None = None
                           ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.teams.add_agent(
            actor, scope, team_id, agent_id=agent_id, role=role,
            parent_agent=parent_agent, model=model, budget=budget))

    def dai_team_agents(self, actor: Principal, project_id: str,
                        team_id: str) -> list[dict[str, Any]]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.teams.agents(actor, scope, team_id))

    def dai_team_tree(self, actor: Principal, project_id: str,
                      team_id: str) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.teams.tree(actor, scope, team_id))

    def dai_team_assign(self, actor: Principal, project_id: str,
                        team_id: str, agent_id: str, task_id: str,
                        idempotency_key: str | None = None
                        ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.teams.assign(
            actor, scope, team_id, agent_id=agent_id, task_id=task_id,
            idempotency_key=idempotency_key))

    def dai_team_message(self, actor: Principal, project_id: str,
                         from_agent: str, to_agent: str, body: str,
                         references: list[str] | None = None,
                         idempotency_key: str | None = None
                         ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.teams.message_leader(
            actor, scope, from_agent=from_agent, to_agent=to_agent, body=body,
            references=references, idempotency_key=idempotency_key)))

    def dai_team_inbox(self, actor: Principal, project_id: str,
                       agent_id: str,
                       status: str | None = None
                       ) -> list[dict[str, Any]]:
        scope = self.project_scope(actor, project_id)
        return _json_safe([asdict(r) for r in self.teams.inbox(
            actor, scope, agent_id=agent_id, status=status)])

    def dai_team_acknowledge(self, actor: Principal, project_id: str,
                             message_id: str, status: str,
                             expected_version: int) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.teams.acknowledge(
            actor, scope, message_id, status=status,
            expected_version=expected_version)))

    # ---- consultation --------------------------------------------------

    def dai_consultation_open(self, actor: Principal, project_id: str,
                              parent_session: str, question: str,
                              mode: str = "ask") -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.teams.open_consultation(
            actor, scope, parent_session=parent_session, question=question,
            mode=mode)))

    def dai_consultation_reply(self, actor: Principal, project_id: str,
                               consultation_id: str, body: str,
                               references: list[str] | None = None,
                               expected_version: int | None = None,
                               idempotency_key: str | None = None
                               ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.teams.consultation_reply(
            actor, scope, consultation_id, body=body, references=references,
            expected_version=expected_version,
            idempotency_key=idempotency_key)))

    def dai_consultation_status(self, actor: Principal, project_id: str,
                                consultation_id: str, status: str,
                                expected_version: int) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.teams.consult_consultation(
            actor, scope, consultation_id, status=status,
            expected_version=expected_version)))

    def dai_consultation_list(self, actor: Principal, project_id: str,
                              parent_session: str
                              ) -> list[dict[str, Any]]:
        scope = self.project_scope(actor, project_id)
        return _json_safe([asdict(r) for r in self.teams.list_consultations(
            actor, scope, parent_session=parent_session)])

    # ---- model ---------------------------------------------------------

    def dai_model_register(self, actor: Principal, project_id: str,
                           model_id: str, provider: str,
                           capabilities: list[str],
                           context_window: int | None = None,
                           cost_input_per_1k: str | None = None,
                           cost_output_per_1k: str | None = None,
                           cost_currency: str | None = None,
                           cost_basis: str = "unknown",
                           tool_support: list[str] | None = None,
                           availability: str = "unknown",
                           notes: str = "") -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.models.register(
            actor, scope, model_id=model_id, provider=provider,
            capabilities=capabilities, context_window=context_window,
            cost_input_per_1k=cost_input_per_1k,
            cost_output_per_1k=cost_output_per_1k,
            cost_currency=cost_currency, cost_basis=cost_basis,
            tool_support=tool_support, availability=availability,
            notes=notes)))

    def dai_model_list(self, actor: Principal,
                       project_id: str) -> list[dict[str, Any]]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.models.catalog(actor, scope))

    def dai_model_route(self, actor: Principal, project_id: str,
                        task_class: str,
                        required_capabilities: list[str] | None = None,
                        max_cost_per_1k: str | None = None
                        ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.models.route(
            actor, scope, task_class=task_class,
            required_capabilities=required_capabilities,
            max_cost_per_1k=max_cost_per_1k))

    def dai_model_choose(self, actor: Principal, project_id: str,
                         model_id: str, role: str, reason: str,
                         task_class: str,
                         idempotency_key: str | None = None
                         ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.models.choose(
            actor, scope, model_id=model_id, role=role, reason=reason,
            task_class=task_class, idempotency_key=idempotency_key)))

    def dai_model_meter(self, actor: Principal, project_id: str,
                        model_id: str, task_class: str,
                        input_tokens: int | None = None,
                        output_tokens: int | None = None,
                        cache_tokens: int | None = None,
                        cost: str | None = None,
                        cost_basis: str = "unknown",
                        latency_ms: int | None = None,
                        status: str = "ok") -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.models.meter(
            actor, scope, model_id=model_id, task_class=task_class,
            input_tokens=input_tokens, output_tokens=output_tokens,
            cache_tokens=cache_tokens, cost=cost, cost_basis=cost_basis,
            latency_ms=latency_ms, status=status))

    def dai_model_usage(self, actor: Principal,
                        project_id: str) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.models.usage(actor, scope))

    # ---- tool ----------------------------------------------------------

    def dai_tool_register(self, actor: Principal, project_id: str,
                          tool_id: str, systems: list[str], effect: str,
                          required_capability: str | None = None,
                          side_effect: str = "none",
                          data_classes: list[str] | None = None,
                          provider: str = "local") -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.tools.register(
            actor, scope, tool_id=tool_id, systems=systems, effect=effect,
            required_capability=required_capability, side_effect=side_effect,
            data_classes=data_classes, provider=provider)))

    def dai_tool_list(self, actor: Principal,
                      project_id: str) -> list[dict[str, Any]]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.tools.catalog(actor, scope))

    def dai_tool_resolve(self, actor: Principal, project_id: str,
                         tool_id: str, system: str, action: str
                         ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.tools.resolve(
            actor, scope, tool_id=tool_id, system=system, action=action))

    def dai_tool_invoke(self, actor: Principal, project_id: str,
                        tool_id: str, system: str, action: str,
                        payload: dict[str, Any] | None = None,
                        idempotency_key: str | None = None
                        ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.tools.invoke(
            actor, scope, tool_id=tool_id, system=system, action=action,
            payload=payload, idempotency_key=idempotency_key))

    # ---- component -----------------------------------------------------

    def dai_component_propose(self, actor: Principal, project_id: str,
                              source_url: str, name: str,
                              patterns: list[str],
                              license: str = "UNKNOWN",
                              commit: str | None = None,
                              requirements: list[str] | None = None,
                              abstraction: str | None = None,
                              notes: str = "",
                              idempotency_key: str | None = None
                              ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.components.propose(
            actor, scope, source_url=source_url, name=name,
            license=license, commit=commit, patterns=patterns,
            requirements=requirements, abstraction=abstraction, notes=notes,
            idempotency_key=idempotency_key)))

    def dai_component_decide(self, actor: Principal, project_id: str,
                             component_id: str, decision: str,
                             rationale: str,
                             expected_version: int) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.components.decide(
            actor, scope, component_id, decision=decision, rationale=rationale,
            expected_version=expected_version)))

    def dai_component_adopt(self, actor: Principal, project_id: str,
                            component_id: str, capability_id: str,
                            bindings: dict[str, str], files: list[str],
                            verification: str,
                            expected_version: int) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.components.adopt(
            actor, scope, component_id, capability_id=capability_id,
            bindings=bindings, files=files, verification=verification,
            expected_version=expected_version)))

    def dai_component_list(self, actor: Principal,
                           project_id: str) -> list[dict[str, Any]]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.components.catalog(actor, scope))

    def dai_component_verify(self, actor: Principal, project_id: str,
                             component_id: str) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(self.components.verify(actor, scope, component_id))

    def dai_component_import(self, actor: Principal, project_id: str,
                             manifest: str) -> list[dict[str, Any]]:
        scope = self.project_scope(actor, project_id)
        entries = ComponentRegistry.from_manifest(
            manifest, store=self.store, actor=actor, scope=scope)
        return _json_safe([asdict(r) for r in entries])

    # ---- update --------------------------------------------------------

    def dai_update_status(self, actor: Principal) -> dict[str, Any]:
        return _json_safe(self.updates.status(actor))

    def dai_update_check(self, actor: Principal, source: str,
                         channel: str = "default",
                         ref: str | None = None) -> dict[str, Any]:
        return _json_safe(self.updates.check(
            actor, source=source, channel=channel, ref=ref))

    def dai_update_plan(self, actor: Principal, project_id: str,
                        source: str, version: str, commit: str,
                        diff: str, impact: str,
                        migration: str = "") -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.updates.plan(
            actor, scope, source=source, version=version, commit=commit,
            diff=diff, impact=impact, migration=migration)))

    def dai_update_decide(self, actor: Principal, project_id: str,
                          update_id: str, decision: str,
                          expected_version: int) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.updates.decide(
            actor, scope, update_id, decision=decision,
            expected_version=expected_version)))

    def dai_update_apply(self, actor: Principal, project_id: str,
                         update_id: str, expected_version: int,
                         rollback_token: str | None = None
                         ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.updates.apply(
            actor, scope, update_id, expected_version=expected_version,
            rollback_token=rollback_token)))

    def dai_update_rollback(self, actor: Principal, project_id: str,
                            update_id: str,
                            expected_version: int) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.updates.rollback(
            actor, scope, update_id, expected_version=expected_version)))

    # ---- memory --------------------------------------------------------

    def dai_memory_create(self, actor: Principal, project_id: str,
                          kind: str, content: dict[str, Any]
                          ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.store.create(actor, scope, kind, content)))

    def dai_memory_get(self, actor: Principal, project_id: str,
                       record_id: str) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.store.get(actor, scope, record_id)))

    def dai_memory_list(self, actor: Principal, project_id: str,
                        kind: str | None = None,
                        limit: int = 50) -> list[dict[str, Any]]:
        scope = self.project_scope(actor, project_id)
        return _json_safe([asdict(r) for r in self.store.list(
            actor, scope, kind=kind, limit=limit)])

    def dai_memory_search(self, actor: Principal, project_id: str,
                          query: str, limit: int = 20
                          ) -> list[dict[str, Any]]:
        scope = self.project_scope(actor, project_id)
        return _json_safe([asdict(r) for r in self.store.search(
            actor, scope, query, limit=limit)])

    def dai_memory_archive(self, actor: Principal, project_id: str,
                           record_id: str, expected_version: int
                           ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.store.archive(
            actor, scope, record_id, expected_version=expected_version)))

    def dai_memory_restore(self, actor: Principal, project_id: str,
                           record_id: str, expected_version: int
                           ) -> dict[str, Any]:
        scope = self.project_scope(actor, project_id)
        return _json_safe(asdict(self.store.restore_record(
            actor, scope, record_id, expected_version=expected_version)))

    def dai_memory_history(self, actor: Principal, project_id: str,
                           record_id: str) -> list[dict[str, Any]]:
        scope = self.project_scope(actor, project_id)
        return _json_safe([asdict(r) for r in self.store.history(
            actor, scope, record_id)])

    # ---- backup --------------------------------------------------------

    def dai_backup_create(self, actor: Principal,
                          destination: str) -> dict[str, Any]:
        snapshot = self.store.snapshot(actor, destination)
        return _json_safe({
            "snapshot": str(snapshot),
            "contains_keys": False,
            "restore_requires": "the same live installation key authority",
        })
