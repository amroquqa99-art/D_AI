"""Durable task graph: every task is created against an approved, active
charter and advances only through declared legal transitions. COMPLETED is
reachable only through a recorded successful attempt; a lease is exclusive
and TTL-based, and expiry allows takeover."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from datetime import datetime, timedelta
from typing import Any

from .charters import CharterService
from .contracts import Principal, Record, Scope, identifier, json_bytes
from .errors import AccessDenied, Conflict, IntegrityFailure, InvalidRequest, NotFound
from .memory import MemoryStore, utc_now

STATES = ("DISCOVERING","WAITING_FOR_INPUT","PLAN_REVIEW","READY","RUNNING",
          "VERIFYING","REVIEWING","WAITING_FOR_HUMAN","WAITING_FOR_MODEL",
          "WAITING_FOR_DATA","WAITING_FOR_RESOURCES","PAUSED","RECOVERING",
          "COMPLETED","PARTIAL","FAILED","CANCELLED")

OUTCOMES = ("SUCCESS", "FAILURE", "PARTIAL", "CANCELLED")

OUTCOME_TARGET = {
    "SUCCESS": "COMPLETED",
    "FAILURE": "FAILED",
    "PARTIAL": "PARTIAL",
    "CANCELLED": "CANCELLED",
}

TERMINAL = ("COMPLETED", "FAILED", "CANCELLED")

WAITING_FOR = ("WAITING_FOR_INPUT", "WAITING_FOR_HUMAN", "WAITING_FOR_MODEL",
               "WAITING_FOR_DATA", "WAITING_FOR_RESOURCES")

LEGAL_TRANSITIONS: dict[str, set[str]] = {
    "DISCOVERING": {"WAITING_FOR_INPUT", "PLAN_REVIEW", "READY", "CANCELLED", "FAILED"},
    "PLAN_REVIEW": {"READY", "WAITING_FOR_HUMAN", "CANCELLED", "FAILED"},
    "READY": {"RUNNING", "PAUSED", "WAITING_FOR_RESOURCES", "CANCELLED", "FAILED"},
    "RUNNING": {"VERIFYING", "WAITING_FOR_HUMAN", "WAITING_FOR_MODEL", "WAITING_FOR_DATA",
                "WAITING_FOR_RESOURCES", "PAUSED", "RECOVERING", "PARTIAL", "FAILED", "CANCELLED"},
    "VERIFYING": {"REVIEWING", "COMPLETED", "PARTIAL", "FAILED", "RECOVERING"},
    "REVIEWING": {"COMPLETED", "PARTIAL", "FAILED", "WAITING_FOR_HUMAN", "RECOVERING"},
    "RECOVERING": {"RUNNING", "VERIFYING", "PARTIAL", "FAILED", "CANCELLED"},
    "PAUSED": {"RUNNING", "CANCELLED", "FAILED"},
    "WAITING_FOR_INPUT": {"RUNNING", "DISCOVERING", "READY", "CANCELLED", "FAILED"},
    "WAITING_FOR_HUMAN": {"RUNNING", "DISCOVERING", "READY", "CANCELLED", "FAILED"},
    "WAITING_FOR_MODEL": {"RUNNING", "DISCOVERING", "READY", "CANCELLED", "FAILED"},
    "WAITING_FOR_DATA": {"RUNNING", "DISCOVERING", "READY", "CANCELLED", "FAILED"},
    "WAITING_FOR_RESOURCES": {"RUNNING", "DISCOVERING", "READY", "CANCELLED", "FAILED"},
    "PARTIAL": {"RECOVERING", "COMPLETED", "FAILED", "CANCELLED"},
}


def transition_allowed(current: str, target: str) -> bool:
    """Waiting is a suspension of any live state, not a progression of one.

    A task may always report that it waits for input, a human, a model, data or
    resources while it is still running; it may never leave a terminal state.
    """
    if current in TERMINAL:
        return False
    if target in WAITING_FOR:
        return True
    return target in LEGAL_TRANSITIONS.get(current, set())


_INITIAL_CONTENT = {
    "state": "DISCOVERING", "objective": "", "acceptance": [], "charter_id": "",
    "depends_on": [], "responsibility": "", "inputs": [], "outputs": [],
    "attempts": [], "lease": None, "state_history": [],
}


def _instant(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _lease_is_live(lease: dict[str, Any], now: datetime) -> bool:
    try:
        return _instant(lease["expires_at"]) > now
    except (KeyError, TypeError, ValueError):
        return False


def _require_strings(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or not all(
            isinstance(item, str) and item.strip() for item in value):
        raise InvalidRequest(f"{field} must be a list of non-empty strings")
    return list(value)


def _history_entry(from_state: str, to_state: str, actor: str,
                   receipt: str | None, note: str) -> dict[str, Any]:
    return {"from": from_state, "to": to_state, "at": utc_now(), "actor": actor,
            "receipt": receipt, "note": note}


class TaskService:
    def __init__(self, store: MemoryStore) -> None:
        self.store = store
        with store._locked(), store._db("project") as db:
            db.execute("CREATE TABLE IF NOT EXISTS component_versions(name TEXT PRIMARY KEY, version INTEGER NOT NULL)")
            row = db.execute("SELECT version FROM component_versions WHERE name='tasks'").fetchone()
            if row and row[0] != 1:
                raise IntegrityFailure("Task schema requires a supported migration")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS task_index(
                    project TEXT NOT NULL, task_id TEXT NOT NULL, state TEXT NOT NULL,
                    version INTEGER NOT NULL, charter_id TEXT NOT NULL,
                    PRIMARY KEY(project, task_id));
                CREATE TABLE IF NOT EXISTS task_idempotency(
                    project TEXT NOT NULL, key TEXT NOT NULL, payload_hash TEXT NOT NULL,
                    task_id TEXT NOT NULL, task_version INTEGER NOT NULL,
                    PRIMARY KEY(project, key));
            """)
            db.execute("INSERT OR IGNORE INTO component_versions VALUES('tasks', 1)")

    def create_task(self, actor: Principal, scope: Scope, *, objective: str,
                    acceptance: list[str], charter_id: str | None = None,
                    responsibility: str | None = None,
                    inputs: list[str] | None = None,
                    outputs: list[str] | None = None,
                    depends_on: list[str] | None = None,
                    idempotency_key: str | None = None) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A task belongs to a project")
        if not isinstance(objective, str) or not objective.strip():
            raise InvalidRequest("A bounded objective is required")
        accepted = _require_strings(acceptance, "acceptance")
        responsibility = responsibility if isinstance(responsibility, str) else ""
        inputs = _require_strings(inputs, "inputs") if inputs is not None else []
        outputs = _require_strings(outputs, "outputs") if outputs is not None else []
        depends_on = list(depends_on or [])
        for dep in depends_on:
            identifier(dep)
        if idempotency_key is not None:
            identifier(idempotency_key)

        charter = CharterService(self.store).active(actor, scope)
        task_charter_id = charter.id if charter_id is None else charter_id
        identifier(task_charter_id)
        if task_charter_id != charter.id:
            raise Conflict("Task charter does not match the project's approved charter")

        payload_hash = hashlib.sha256(json_bytes([objective, accepted, task_charter_id,
                                                  responsibility, inputs, outputs,
                                                  depends_on])).hexdigest()

        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="task")
            if idempotency_key is not None:
                existing = db.execute(
                    "SELECT * FROM task_idempotency WHERE project=? AND key=?",
                    (scope.project, idempotency_key)).fetchone()
                if existing is not None:
                    if existing["payload_hash"] == payload_hash:
                        return self.store.get(actor, scope, existing["task_id"])
                    raise Conflict("Idempotency key was reused with a different task payload")
            for dep in depends_on:
                if not db.execute(
                        "SELECT 1 FROM task_index WHERE project=? AND task_id=?",
                        (scope.project, dep)).fetchone():
                    raise InvalidRequest(f"Unknown task dependency: {dep}")
            content = dict(_INITIAL_CONTENT)
            content.update(objective=objective, acceptance=accepted,
                           charter_id=task_charter_id, responsibility=responsibility,
                           inputs=inputs, outputs=outputs, depends_on=depends_on)
            record = self.store._insert(db, actor, scope, "task", content)
            db.execute("INSERT INTO task_index VALUES(?,?,?,?,?)",
                       (scope.project, record.id, "DISCOVERING", record.version,
                        task_charter_id))
            if idempotency_key is not None:
                db.execute("INSERT INTO task_idempotency VALUES(?,?,?,?,?)",
                           (scope.project, idempotency_key, payload_hash,
                            record.id, record.version))
            return record

    def get(self, actor: Principal, scope: Scope, task_id: str) -> Record:
        identifier(task_id)
        record = self.store.get(actor, scope, task_id)
        if record.kind != "task":
            raise NotFound("Task not found")
        return record

    def list(self, actor: Principal, scope: Scope, *, state: str | None = None,
             kind: str = "task", limit: int = 50) -> list[Record]:
        if kind is not None and kind != "task":
            raise InvalidRequest("TaskService lists task records")
        if state is not None:
            if state not in STATES:
                raise InvalidRequest("Unknown task state")
            self.store._authorize(actor, scope, "read")
            with self.store._locked(), self.store._db("project") as db:
                rows = db.execute(
                    "SELECT task_id FROM task_index WHERE project=? AND state=? "
                    "ORDER BY task_id LIMIT ?",
                    (scope.project, state, limit)).fetchall()
            return [self.get(actor, scope, row[0]) for row in rows]
        return self.store.list(actor, scope, kind="task", limit=limit)

    def set_state(self, actor: Principal, scope: Scope, task_id: str, *,
                  state: str, expected_version: int,
                  receipt: str | None = None, note: str = "") -> Record:
        identifier(task_id)
        if type(expected_version) is not int or expected_version < 1:
            raise InvalidRequest("An expected positive record version is required")
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="task")
            row = self.store._row(db, scope, task_id)
            previous = self.store._decode(row, scope)
            if previous.kind != "task":
                raise NotFound("Task not found")
            if previous.version != expected_version:
                raise Conflict("Task version changed; reload before updating")
            current = previous.content["state"]
            if current in TERMINAL:
                raise Conflict(f"Task {task_id} is {current}; no further transitions")
            if state not in STATES:
                raise InvalidRequest("Unknown task state")
            if state == current:
                return previous
            if state == "COMPLETED":
                raise InvalidRequest("COMPLETED is reachable only through record_attempt")
            if state != current and not transition_allowed(current, state):
                raise Conflict(f"Illegal task transition {current} -> {state}")
            if state.startswith("WAITING_FOR_") and not note.strip():
                raise InvalidRequest("A WAITING_FOR_* transition must record what is awaited")
            if state == "PARTIAL" and not note.strip():
                raise InvalidRequest("PARTIAL requires a note stating what is missing")
            content = dict(previous.content)
            content["state"] = state
            content["lease"] = None
            history = list(previous.content.get("state_history", []))
            history.append(_history_entry(current, state, actor.id, receipt, note))
            content["state_history"] = history
            meta = dict(row)
            meta.update(version=previous.version + 1, updated_at=utc_now())
            updated = self.store._save(db, meta, scope, content, actor, "SET_STATE")
            db.execute(
                "INSERT INTO task_index VALUES(?,?,?,?,?) "
                "ON CONFLICT(project, task_id) DO UPDATE SET "
                "state=excluded.state, version=excluded.version, charter_id=excluded.charter_id",
                (scope.project, task_id, state, updated.version, content["charter_id"]))
            return updated

    def lease(self, actor: Principal, scope: Scope, task_id: str, *,
              owner: str, ttl: int = 300) -> Record:
        identifier(task_id)
        identifier(owner)
        if type(ttl) is not int or ttl < 1:
            raise InvalidRequest("A positive lease TTL in seconds is required")
        now = _instant(utc_now())
        expires = (now + timedelta(seconds=ttl)).isoformat()
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="task")
            row = self.store._row(db, scope, task_id)
            previous = self.store._decode(row, scope)
            if previous.kind != "task":
                raise NotFound("Task not found")
            current_lease = previous.content.get("lease")
            if current_lease and _lease_is_live(current_lease, now):
                raise Conflict(f"Task {task_id} is leased by {current_lease['owner']}; "
                               f"wait for expiry or release")
            content = dict(previous.content)
            content["lease"] = {"owner": owner, "ttl": ttl,
                                "acquired_at": utc_now(), "expires_at": expires}
            history = list(previous.content.get("state_history", []))
            if current_lease:
                history.append(_history_entry(
                    previous.content["state"], previous.content["state"], actor.id, None,
                    f"lease taken over by {owner} after previous lease by "
                    f"{current_lease['owner']} expired"))
            content["state_history"] = history
            meta = dict(row)
            meta.update(version=previous.version + 1, updated_at=utc_now())
            updated = self.store._save(db, meta, scope, content, actor, "LEASE")
            db.execute(
                "INSERT INTO task_index VALUES(?,?,?,?,?) "
                "ON CONFLICT(project, task_id) DO UPDATE SET "
                "state=excluded.state, version=excluded.version, charter_id=excluded.charter_id",
                (scope.project, task_id, previous.content["state"], updated.version,
                 content["charter_id"]))
            return updated

    def release(self, actor: Principal, scope: Scope, task_id: str, *,
                owner: str) -> Record:
        identifier(task_id)
        identifier(owner)
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="task")
            row = self.store._row(db, scope, task_id)
            previous = self.store._decode(row, scope)
            if previous.kind != "task":
                raise NotFound("Task not found")
            current_lease = previous.content.get("lease")
            if not current_lease:
                raise Conflict(f"Task {task_id} has no active lease to release")
            now = _instant(utc_now())
            if not _lease_is_live(current_lease, now):
                raise Conflict(f"Task {task_id} lease has expired; lease it again to take over")
            if current_lease["owner"] != owner:
                raise AccessDenied(f"Lease on task {task_id} is held by another actor")
            content = dict(previous.content)
            content["lease"] = None
            meta = dict(row)
            meta.update(version=previous.version + 1, updated_at=utc_now())
            updated = self.store._save(db, meta, scope, content, actor, "RELEASE_LEASE")
            db.execute(
                "INSERT INTO task_index VALUES(?,?,?,?,?) "
                "ON CONFLICT(project, task_id) DO UPDATE SET "
                "state=excluded.state, version=excluded.version, charter_id=excluded.charter_id",
                (scope.project, task_id, previous.content["state"], updated.version,
                 content["charter_id"]))
            return updated

    def record_attempt(self, actor: Principal, scope: Scope, task_id: str, *,
                       attempt_id: str, outcome: str,
                       artifacts: list[str] | None = None,
                       receipt: str | None = None,
                       idempotency_key: str | None = None,
                       expected_version: int | None = None) -> Record:
        identifier(task_id)
        identifier(attempt_id)
        if outcome not in OUTCOMES:
            raise InvalidRequest("Outcome must be one of SUCCESS, FAILURE, PARTIAL, CANCELLED")
        artifacts = _require_strings(artifacts, "artifacts") if artifacts is not None else []
        if receipt is not None and (not isinstance(receipt, str) or not receipt.strip()):
            raise InvalidRequest("A receipt must be a non-empty string")
        if idempotency_key is not None:
            identifier(idempotency_key)
        target = OUTCOME_TARGET[outcome]
        payload_hash = hashlib.sha256(
            json_bytes([attempt_id, outcome, artifacts, receipt, target])).hexdigest()

        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="task")
            row = self.store._row(db, scope, task_id)
            previous = self.store._decode(row, scope)
            if previous.kind != "task":
                raise NotFound("Task not found")
            # The idempotency key is resolved before the version fence: a retry of
            # a request that already succeeded must return the original result,
            # not a stale-version conflict.
            if idempotency_key is not None:
                existing = db.execute(
                    "SELECT * FROM task_idempotency WHERE project=? AND key=?",
                    (scope.project, idempotency_key)).fetchone()
                if existing is not None:
                    if existing["payload_hash"] == payload_hash:
                        return self.store.get(actor, scope, existing["task_id"])
                    raise Conflict("Idempotency key was reused with a different attempt payload")
            if expected_version is not None:
                if type(expected_version) is not int or expected_version < 1:
                    raise InvalidRequest("An expected positive record version is required")
                if previous.version != expected_version:
                    raise Conflict("Task version changed; reload before attempting")
            current = previous.content["state"]
            if current in TERMINAL:
                raise Conflict(f"Task {task_id} is {current}; no further attempts")
            if target != current and not transition_allowed(current, target):
                raise Conflict(f"Illegal task transition {current} -> {target}")
            if outcome == "SUCCESS":
                acceptance = previous.content.get("acceptance") or []
                if not acceptance:
                    raise InvalidRequest("COMPLETED requires a non-empty acceptance list")
                if not receipt:
                    raise InvalidRequest("COMPLETED requires a receipt")
            attempts = list(previous.content.get("attempts", []))
            attempts.append({"attempt_id": attempt_id, "outcome": outcome,
                             "artifacts": artifacts, "receipt": receipt, "at": utc_now()})
            content = dict(previous.content)
            content["attempts"] = attempts
            history = list(previous.content.get("state_history", []))
            if target != current:
                history.append(_history_entry(current, target, actor.id,
                                              receipt if target == "COMPLETED" else None,
                                              f"attempt {attempt_id} outcome {outcome}"))
                content["state"] = target
            content["state_history"] = history
            meta = dict(row)
            meta.update(version=previous.version + 1, updated_at=utc_now())
            updated = self.store._save(db, meta, scope, content, actor, "RECORD_ATTEMPT")
            db.execute(
                "INSERT INTO task_index VALUES(?,?,?,?,?) "
                "ON CONFLICT(project, task_id) DO UPDATE SET "
                "state=excluded.state, version=excluded.version, charter_id=excluded.charter_id",
                (scope.project, task_id, content["state"], updated.version,
                 content["charter_id"]))
            if idempotency_key is not None:
                db.execute("INSERT INTO task_idempotency VALUES(?,?,?,?,?)",
                           (scope.project, idempotency_key, payload_hash,
                            task_id, updated.version))
            return updated

    def attempts(self, actor: Principal, scope: Scope, task_id: str) -> list[dict]:
        record = self.get(actor, scope, task_id)
        return [dict(entry) for entry in (record.content.get("attempts") or [])]

    def graph(self, actor: Principal, scope: Scope) -> dict:
        self.store._authorize(actor, scope, "read")
        with self.store._locked(), self.store._db("project") as db:
            task_ids = [row[0] for row in db.execute(
                "SELECT task_id FROM task_index WHERE project=? ORDER BY task_id",
                (scope.project,)).fetchall()]
        records = [self.get(actor, scope, task_id) for task_id in task_ids]
        by_id = {record.id: record for record in records}
        nodes = [{"id": record.id, "state": record.content["state"],
                  "objective": record.content["objective"], "version": record.version}
                 for record in records]
        edges: list[dict[str, str]] = []
        for record in records:
            for dep in record.content.get("depends_on") or []:
                if dep not in by_id:
                    raise InvalidRequest(f"Task {record.id} depends on unknown task {dep}")
                edges.append({"from": dep, "to": record.id})
        color: dict[str, str] = {}

        def visit(node: str) -> None:
            color[node] = "gray"
            for dep in by_id[node].content.get("depends_on") or []:
                mark = color.get(dep)
                if mark == "gray":
                    raise InvalidRequest(f"Dependency cycle involves task {node}")
                if mark is None:
                    visit(dep)
            color[node] = "black"

        for node in by_id:
            if color.get(node) is None:
                visit(node)
        nodes.sort(key=lambda node: node["id"])
        edges.sort(key=lambda edge: (edge["from"], edge["to"]))
        return {"nodes": nodes, "edges": edges}
