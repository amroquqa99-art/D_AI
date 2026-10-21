"""Team, agent tree, messages and consultations for one project.

Invariant: every team, agent, message and consultation is bound to a single
project scope; agents form a tree no deeper than MAX_DEPTH; a message is
SENT before it is acknowledged (sending is not applying); ask and analyse
consultations are read-only and create or modify no record but the
consultation itself; a suggestion stays a proposal and is never applied by
the consultation layer.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .contracts import Principal, Record, Scope, identifier, json_bytes
from .errors import AccessDenied, Conflict, IntegrityFailure, InvalidRequest, NotFound
from .memory import MemoryStore, utc_now

MAX_DEPTH = 3  # basic -> sub -> sub-of-sub

_CONSULTATION_MODES = ("ask", "analyse", "suggest")
_CONSULTATION_STATUSES = ("OPEN", "RECEIVED", "MERGING", "APPLIED", "NEEDS_DECISION")
_CONSULTATION_ADVANCES: dict[str, set[str]] = {
    "OPEN": {"RECEIVED"},
    "RECEIVED": {"MERGING"},
    "MERGING": {"APPLIED", "NEEDS_DECISION"},
}
_MESSAGE_STATUSES = ("SENT", "ACKNOWLEDGED", "APPLIED", "NEEDS_DECISION")
_ACK_STATUSES = ("ACKNOWLEDGED", "APPLIED", "NEEDS_DECISION")
_ASSIGNMENT_STATE = "ACTIVE"


def project_state_fingerprint(store: MemoryStore, scope: Scope) -> str:
    """Deterministic fingerprint of the current project state.

    sha256 over the active charter record id and version plus the updated_at
    of every project record. Stable while the project state is unchanged and
    changed as soon as any project record (charter, decision, task, ...) is
    created or updated.
    """
    if scope.namespace != "project":
        raise InvalidRequest("project_state_fingerprint requires a project scope")
    with store._locked(), store._db("project") as db:
        parts: list[str] = []
        pointer = None
        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='active_charters'").fetchone():
            pointer = db.execute("SELECT record_id FROM active_charters WHERE project=?",
                                 (scope.project,)).fetchone()
        if pointer:
            row = db.execute("SELECT version FROM records WHERE id=? AND scope=?",
                             (pointer[0], scope.key)).fetchone()
            parts.extend([pointer[0], str(row["version"]) if row else ""])
        else:
            parts.extend(["", ""])
        rows = db.execute("SELECT updated_at FROM records WHERE scope=? "
                          "ORDER BY updated_at DESC, id", (scope.key,)).fetchall()
        parts.extend(r[0] for r in rows)
    return hashlib.sha256(json_bytes(parts)).hexdigest()


def _require_strings(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or not all(
            isinstance(item, str) and item.strip() for item in value):
        raise InvalidRequest(f"{field} must be a list of non-empty strings")
    return list(value)


def _budget_text(budget: Any) -> str | None:
    if budget is None:
        return None
    if not isinstance(budget, dict):
        raise InvalidRequest("budget must be a JSON object")
    return json_bytes(budget).decode("utf-8")


def _budget_obj(value: str | None) -> Any:
    if value is None:
        return None
    return json.loads(value)


def _same_agent_definition(existing: dict[str, Any], role: str, parent_agent: str | None,
                           model: str | None, budget: Any,
                           stored_budget: Any = None) -> bool:
    """Compare an agent definition. The budget is read from the encrypted record."""
    return (existing["role"] == role
            and existing["parent_agent"] == parent_agent
            and existing["model"] == model
            and stored_budget == budget)


def _agent_view(row: dict[str, Any]) -> dict[str, Any]:
    """The observable agent: no private content, only the agent's definition."""
    return {"agent_id": row["agent_id"], "role": row["role"],
            "parent_agent": row["parent_agent"], "depth": row["depth"],
            "model": row["model"]}


class TeamService:
    def __init__(self, store: MemoryStore) -> None:
        self.store = store
        with store._locked(), store._db("project") as db:
            db.execute("CREATE TABLE IF NOT EXISTS component_versions(name TEXT PRIMARY KEY, version INTEGER NOT NULL)")
            row = db.execute("SELECT version FROM component_versions WHERE name='teams'").fetchone()
            if row and row[0] != 1:
                raise IntegrityFailure("Team schema requires a supported migration")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS team_agents(
                    project TEXT NOT NULL, team TEXT NOT NULL, agent_id TEXT NOT NULL,
                    role TEXT NOT NULL, parent_agent TEXT, depth INTEGER NOT NULL,
                    model TEXT, budget TEXT,
                    PRIMARY KEY(project, team, agent_id));
                CREATE TABLE IF NOT EXISTS team_messages(
                    project TEXT NOT NULL, team TEXT NOT NULL, message_id TEXT NOT NULL,
                    from_agent TEXT NOT NULL, to_agent TEXT NOT NULL, status TEXT NOT NULL,
                    created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS team_assignments(
                    project TEXT NOT NULL, team TEXT NOT NULL, agent_id TEXT NOT NULL,
                    task_id TEXT NOT NULL, state TEXT NOT NULL,
                    PRIMARY KEY(project, team, agent_id, task_id));
                CREATE TABLE IF NOT EXISTS team_idempotency(
                    project TEXT NOT NULL, key TEXT NOT NULL, payload_hash TEXT NOT NULL,
                    target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
                    PRIMARY KEY(project, key));
            """)
            db.execute("INSERT OR IGNORE INTO component_versions VALUES('teams', 1)")

    def create_team(self, actor: Principal, scope: Scope, *, name: str,
                    roles: list[str] | None = None,
                    idempotency_key: str | None = None) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A team belongs to a project")
        if not isinstance(name, str) or not name.strip():
            raise InvalidRequest("A bounded team name is required")
        roles = _require_strings(roles, "roles") if roles is not None else []
        if idempotency_key is not None:
            identifier(idempotency_key)
        payload_hash = hashlib.sha256(json_bytes([name, roles])).hexdigest()
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="team")
            if idempotency_key is not None:
                existing = db.execute(
                    "SELECT * FROM team_idempotency WHERE project=? AND key=?",
                    (scope.project, idempotency_key)).fetchone()
                if existing is not None:
                    if existing["payload_hash"] == payload_hash:
                        return self.store.get(actor, scope, existing["target_id"])
                    raise Conflict("Idempotency key was reused with a different team payload")
            record = self.store._insert(db, actor, scope, "team",
                                        {"name": name.strip(), "roles": roles})
            if idempotency_key is not None:
                db.execute("INSERT INTO team_idempotency VALUES(?,?,?,?,?)",
                           (scope.project, idempotency_key, payload_hash, "team", record.id))
            return record

    def add_agent(self, actor: Principal, scope: Scope, team_id: str, *,
                  agent_id: str, role: str,
                  parent_agent: str | None = None,
                  model: str | None = None,
                  budget: dict | None = None) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("An agent belongs to a project")
        identifier(team_id)
        identifier(agent_id)
        identifier(role)
        if parent_agent is not None:
            identifier(parent_agent)
        if model is not None:
            identifier(model)
        budget_text = _budget_text(budget)
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="team")
            row = self.store._row(db, scope, team_id)
            team = self.store._decode(row, scope)
            if team.kind != "team":
                raise NotFound("Team not found")
            existing = db.execute(
                "SELECT * FROM team_agents WHERE project=? AND team=? AND agent_id=?",
                (scope.project, team_id, agent_id)).fetchone()
            stored_budget = None
            for entry in (team.content.get("agents") or []):
                if entry.get("agent_id") == agent_id:
                    stored_budget = entry.get("budget")
                    break
            if existing is not None:
                if _same_agent_definition(existing, role, parent_agent, model, budget, stored_budget):
                    return _agent_view(dict(existing))
                raise Conflict(f"Agent {agent_id} already exists in team {team_id} "
                               "with a different definition")
            if parent_agent is None:
                depth = 1
            else:
                parent = db.execute(
                    "SELECT depth FROM team_agents WHERE project=? AND team=? AND agent_id=?",
                    (scope.project, team_id, parent_agent)).fetchone()
                if parent is None:
                    raise InvalidRequest(f"Parent agent {parent_agent} is not in team {team_id}")
                depth = parent["depth"] + 1
                if depth > MAX_DEPTH:
                    raise InvalidRequest(f"Agent depth {depth} exceeds MAX_DEPTH {MAX_DEPTH}")
            # The budget stays in the encrypted team record. The plain table keeps
            # only indexes, counters and foreign keys.
            db.execute("INSERT INTO team_agents(project,team,agent_id,role,parent_agent,depth,model) "
                       "VALUES(?,?,?,?,?,?,?)",
                       (scope.project, team_id, agent_id, role, parent_agent, depth, model))
            content = dict(team.content)
            agents = list(content.get("agents") or [])
            agents.append({"agent_id": agent_id, "role": role, "parent_agent": parent_agent,
                           "depth": depth, "model": model, "budget": budget})
            content["agents"] = agents
            meta = dict(row)
            meta.update(version=team.version + 1, updated_at=utc_now())
            self.store._save(db, meta, scope, content, actor, "ADD_AGENT")
            return {"agent_id": agent_id, "role": role, "parent_agent": parent_agent,
                    "depth": depth, "model": model}

    def agents(self, actor: Principal, scope: Scope, team_id: str) -> list[dict]:
        if scope.namespace != "project":
            raise InvalidRequest("An agent list belongs to a project")
        identifier(team_id)
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "read")
            row = self.store._row(db, scope, team_id)
            team = self.store._decode(row, scope)
            if team.kind != "team":
                raise NotFound("Team not found")
            rows = db.execute(
                "SELECT agent_id, role, parent_agent, depth, model, budget "
                "FROM team_agents WHERE project=? AND team=? ORDER BY depth, agent_id",
                (scope.project, team_id)).fetchall()
            result: list[dict[str, Any]] = []
            for r in rows:
                result.append({"agent_id": r["agent_id"], "role": r["role"],
                               "parent_agent": r["parent_agent"], "depth": r["depth"],
                               "model": r["model"],
                               "budget": _budget_obj(r["budget"])})
            return result

    def tree(self, actor: Principal, scope: Scope, team_id: str) -> dict:
        if scope.namespace != "project":
            raise InvalidRequest("A team tree belongs to a project")
        identifier(team_id)
        agent_list = self.agents(actor, scope, team_id)
        by_id: dict[str, dict[str, Any]] = {a["agent_id"]: dict(a) for a in agent_list}
        for a in by_id.values():
            a["children"] = []
        roots: list[dict[str, Any]] = []
        for a in by_id.values():
            parent = a["parent_agent"]
            if parent is None or parent not in by_id:
                roots.append(a)
            else:
                by_id[parent]["children"].append(a)
        for a in by_id.values():
            a["children"].sort(key=lambda x: x["agent_id"])
        roots.sort(key=lambda x: x["agent_id"])
        return {"team": team_id, "max_depth": MAX_DEPTH, "roots": roots}

    def assign(self, actor: Principal, scope: Scope, team_id: str, *,
               agent_id: str, task_id: str,
               idempotency_key: str | None = None) -> dict[str, Any]:
        if scope.namespace != "project":
            raise InvalidRequest("An assignment belongs to a project")
        identifier(team_id)
        identifier(agent_id)
        identifier(task_id)
        if idempotency_key is not None:
            identifier(idempotency_key)
        payload_hash = hashlib.sha256(json_bytes([agent_id, task_id])).hexdigest()
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="team")
            row = self.store._row(db, scope, team_id)
            team = self.store._decode(row, scope)
            if team.kind != "team":
                raise NotFound("Team not found")
            member = db.execute(
                "SELECT 1 FROM team_agents WHERE project=? AND team=? AND agent_id=?",
                (scope.project, team_id, agent_id)).fetchone()
            if member is None:
                raise NotFound(f"Agent {agent_id} is not in team {team_id}")
            if idempotency_key is not None:
                existing = db.execute(
                    "SELECT * FROM team_idempotency WHERE project=? AND key=?",
                    (scope.project, idempotency_key)).fetchone()
                if existing is not None:
                    if existing["payload_hash"] != payload_hash:
                        raise Conflict("Idempotency key was reused with a different assignment payload")
                    return {"team": team_id, "agent_id": agent_id, "task_id": task_id,
                            "state": _ASSIGNMENT_STATE}
            current = db.execute(
                "SELECT * FROM team_assignments WHERE project=? AND team=? AND task_id=?",
                (scope.project, team_id, task_id)).fetchone()
            if current is not None:
                if current["agent_id"] == agent_id:
                    return {"team": team_id, "agent_id": agent_id, "task_id": task_id,
                            "state": current["state"]}
                raise Conflict(f"Task {task_id} is already assigned to agent {current['agent_id']} "
                               f"in team {team_id}; two writers on one work are not allowed")
            db.execute("INSERT INTO team_assignments VALUES(?,?,?,?,?)",
                       (scope.project, team_id, agent_id, task_id, _ASSIGNMENT_STATE))
            if idempotency_key is not None:
                db.execute("INSERT INTO team_idempotency VALUES(?,?,?,?,?)",
                           (scope.project, idempotency_key, payload_hash, "assignment",
                            f"{agent_id}\u2029{task_id}"))
            return {"team": team_id, "agent_id": agent_id, "task_id": task_id,
                    "state": _ASSIGNMENT_STATE}

    def message_leader(self, actor: Principal, scope: Scope, *,
                       from_agent: str, to_agent: str, body: str,
                       references: list[str] | None = None,
                       idempotency_key: str | None = None) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A message belongs to a project")
        identifier(from_agent)
        identifier(to_agent)
        if not isinstance(body, str) or not body.strip():
            raise InvalidRequest("A bounded message body is required")
        references = _require_strings(references, "references") if references is not None else []
        if idempotency_key is not None:
            identifier(idempotency_key)
        payload_hash = hashlib.sha256(
            json_bytes([from_agent, to_agent, body, references])).hexdigest()
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="message")
            team = db.execute(
                "SELECT team FROM team_agents WHERE project=? AND agent_id=? ORDER BY team LIMIT 1",
                (scope.project, from_agent)).fetchone()
            if team is None:
                raise InvalidRequest(f"From agent {from_agent} is not in any team of this project")
            team_id = team[0]
            self._require_may_act_for(actor, scope, from_agent)
            receiver = db.execute(
                "SELECT 1 FROM team_agents WHERE project=? AND team=? AND agent_id=?",
                (scope.project, team_id, to_agent)).fetchone()
            if receiver is None:
                raise InvalidRequest(
                    f"Agent {to_agent} is not a member of team {team_id}; "
                    "a message never crosses a team boundary")
            if idempotency_key is not None:
                existing = db.execute(
                    "SELECT * FROM team_idempotency WHERE project=? AND key=?",
                    (scope.project, idempotency_key)).fetchone()
                if existing is not None:
                    if existing["payload_hash"] != payload_hash:
                        raise Conflict("Idempotency key was reused with a different message payload")
                    return self.store.get(actor, scope, existing["target_id"])
            stamp = utc_now()
            content = {"from_agent": from_agent, "to_agent": to_agent, "body": body,
                       "references": references, "status": "SENT", "created_at": stamp}
            record = self.store._insert(db, actor, scope, "message", content)
            db.execute("INSERT INTO team_messages VALUES(?,?,?,?,?,?,?)",
                       (scope.project, team_id, record.id, from_agent, to_agent, "SENT", stamp))
            if idempotency_key is not None:
                db.execute("INSERT INTO team_idempotency VALUES(?,?,?,?,?)",
                           (scope.project, idempotency_key, payload_hash, "message", record.id))
            return record

    def inbox(self, actor: Principal, scope: Scope, *, agent_id: str,
              status: str | None = None) -> list[Record]:
        if scope.namespace != "project":
            raise InvalidRequest("An inbox belongs to a project")
        identifier(agent_id)
        if status is not None and status not in _MESSAGE_STATUSES:
            raise InvalidRequest("Unknown message status")
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "read")
            self._require_may_act_for(actor, scope, agent_id)
            query = "SELECT message_id FROM team_messages WHERE project=? AND to_agent=?"
            args: list[Any] = [scope.project, agent_id]
            if status is not None:
                query += " AND status=?"
                args.append(status)
            query += " ORDER BY created_at ASC, message_id ASC"
            rows = db.execute(query, args).fetchall()
            return [self.store.get(actor, scope, row[0]) for row in rows]

    def acknowledge(self, actor: Principal, scope: Scope, message_id: str, *,
                    status: str, expected_version: int) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A message belongs to a project")
        identifier(message_id)
        if status not in _ACK_STATUSES:
            raise InvalidRequest("Status must be one of ACKNOWLEDGED, APPLIED, NEEDS_DECISION")
        if type(expected_version) is not int or expected_version < 1:
            raise InvalidRequest("An expected positive record version is required")
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="message")
            row = self.store._row(db, scope, message_id)
            previous = self.store._decode(row, scope)
            if previous.kind != "message":
                raise NotFound("Message not found")
            if previous.version != expected_version:
                raise Conflict("Message version changed; reload before acknowledging")
            if previous.content["status"] != "SENT":
                raise Conflict(f"Message {message_id} is {previous.content['status']}; "
                               "only SENT messages can be acknowledged")
            content = dict(previous.content)
            content["status"] = status
            content["acknowledged_at"] = utc_now()
            meta = dict(row)
            meta.update(version=previous.version + 1, updated_at=utc_now())
            updated = self.store._save(db, meta, scope, content, actor, "ACKNOWLEDGE")
            db.execute("UPDATE team_messages SET status=? WHERE project=? AND message_id=?",
                       (status, scope.project, message_id))
            return updated

    def _require_may_act_for(self, actor: Principal, scope: Scope, agent_id: str) -> None:
        """An actor may act for an agent only as that agent or with delegation.

        Authority to speak as another agent is a scoped capability, never an
        accident of the caller's position.
        """
        if actor.id == agent_id:
            return
        try:
            self.store._authorize(actor, scope, "delegate")
        except AccessDenied:
            raise AccessDenied(
                f"Principal {actor.id} may not act for agent {agent_id} in project {scope.project}"
            ) from None

    def open_consultation(self, actor: Principal, scope: Scope, *,
                          parent_session: str, question: str,
                          mode: str = "ask") -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A consultation belongs to a project")
        identifier(parent_session)
        if not isinstance(question, str) or not question.strip():
            raise InvalidRequest("A bounded question is required")
        if mode not in _CONSULTATION_MODES:
            raise InvalidRequest("Mode must be one of ask, analyse, suggest")
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="consultation")
            # The fingerprint reads project records, so it is taken only after
            # the actor is authorised for this scope.
            context_version = project_state_fingerprint(self.store, scope)
            content = {"parent_session": parent_session, "question": question, "mode": mode,
                       "context_version": context_version, "status": "OPEN", "answer": None,
                       "proposal": None}
            record = self.store._insert(db, actor, scope, "consultation", content)
            return record

    def consultation_reply(self, actor: Principal, scope: Scope,
                           consultation_id: str, *, body: str,
                           references: list[str] | None = None,
                           expected_version: int | None = None,
                           idempotency_key: str | None = None) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A consultation belongs to a project")
        identifier(consultation_id)
        if not isinstance(body, str) or not body.strip():
            raise InvalidRequest("A bounded reply body is required")
        if expected_version is not None and (type(expected_version) is not int or expected_version < 1):
            raise InvalidRequest("An expected positive record version is required")
        references = _require_strings(references, "references") if references is not None else []
        if idempotency_key is not None:
            identifier(idempotency_key)
        payload_hash = hashlib.sha256(
            json_bytes([consultation_id, body, references])).hexdigest()
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="consultation")
            row = self.store._row(db, scope, consultation_id)
            previous = self.store._decode(row, scope)
            if previous.kind != "consultation":
                raise NotFound("Consultation not found")
            if expected_version is not None and previous.version != expected_version:
                raise Conflict("Consultation version changed; reload before replying")
            if idempotency_key is not None:
                existing = db.execute(
                    "SELECT * FROM team_idempotency WHERE project=? AND key=?",
                    (scope.project, idempotency_key)).fetchone()
                if existing is not None:
                    if existing["payload_hash"] != payload_hash:
                        raise Conflict("Idempotency key was reused with a different consultation reply payload")
                    return self.store.get(actor, scope, consultation_id)
            mode = previous.content["mode"]
            content = dict(previous.content)
            if mode == "suggest":
                content["proposal"] = body  # a proposal stays a proposal; never applied here
            else:
                content["answer"] = body  # ask/analyse: an answer only, no side effects elsewhere
            content["references"] = references
            meta = dict(row)
            meta.update(version=previous.version + 1, updated_at=utc_now())
            updated = self.store._save(db, meta, scope, content, actor, "CONSULTATION_REPLY")
            if idempotency_key is not None:
                db.execute("INSERT INTO team_idempotency VALUES(?,?,?,?,?)",
                           (scope.project, idempotency_key, payload_hash, "consultation_reply",
                            consultation_id))
            return updated

    def consult_consultation(self, actor: Principal, scope: Scope,
                             consultation_id: str, *, status: str,
                             expected_version: int) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A consultation belongs to a project")
        identifier(consultation_id)
        if status not in _CONSULTATION_STATUSES:
            raise InvalidRequest("Unknown consultation status")
        if type(expected_version) is not int or expected_version < 1:
            raise InvalidRequest("An expected positive record version is required")
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="consultation")
            row = self.store._row(db, scope, consultation_id)
            previous = self.store._decode(row, scope)
            if previous.kind != "consultation":
                raise NotFound("Consultation not found")
            if previous.version != expected_version:
                raise Conflict("Consultation version changed; reload before updating")
            current = previous.content["status"]
            if status == current:
                raise Conflict(f"Consultation {consultation_id} is already {status}")
            allowed = _CONSULTATION_ADVANCES.get(current, set())
            if status not in allowed:
                raise Conflict(f"Illegal consultation transition {current} -> {status}")
            # Advances the consultation record only: it never applies a
            # proposal and never bypasses dai.charters.
            content = dict(previous.content)
            content["status"] = status
            meta = dict(row)
            meta.update(version=previous.version + 1, updated_at=utc_now())
            return self.store._save(db, meta, scope, content, actor, "CONSULT_CONSULTATION")

    def list_consultations(self, actor: Principal, scope: Scope,
                           parent_session: str | None = None) -> list[Record]:
        if scope.namespace != "project":
            raise InvalidRequest("Consultations belong to a project")
        if parent_session is None:
            # A consultation is bound to one session. Without that session the
            # caller cannot know which consultations are its own, so none are
            # returned rather than another session's.
            raise InvalidRequest(
                "A parent session is required to list consultations; "
                "consultations never cross a session boundary")
        identifier(parent_session)
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "read")
            rows = db.execute(
                "SELECT id FROM records WHERE scope=? AND kind='consultation' "
                "AND status='ACTIVE' ORDER BY updated_at ASC, id", (scope.key,)).fetchall()
            result: list[Record] = []
            for row in rows:
                record = self.store.get(actor, scope, row[0])
                if record.content["parent_session"] == parent_session:
                    result.append(record)
            return result
