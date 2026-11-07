"""Tool gateway and effect policy for one project.

Invariant: registered tools are records of kind "tool"; resolve() names the
decider (owner-policy, provider or system) and a system identity alone never
bans a tool class; invoke() performs no external action and records at most
one attempt per idempotency key; attempts never carry private payload content.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .contracts import Principal, Record, Scope, identifier, json_bytes
from .errors import AccessDenied, Conflict, IntegrityFailure, InvalidRequest, NotFound
from .memory import MemoryStore, utc_now


def _require_strings(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or not all(
            isinstance(item, str) and item.strip() for item in value):
        raise InvalidRequest(f"{field} must be a list of non-empty strings")
    return list(value)


class ToolGateway:
    def __init__(self, store: MemoryStore) -> None:
        self.store = store
        with store._locked(), store._db("project") as db:
            db.execute("CREATE TABLE IF NOT EXISTS component_versions(name TEXT PRIMARY KEY, version INTEGER NOT NULL)")
            row = db.execute("SELECT version FROM component_versions WHERE name='tools'").fetchone()
            if row and row[0] != 1:
                raise IntegrityFailure("Tool schema requires a supported migration")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS tool_index(
                    project TEXT NOT NULL, tool_id TEXT NOT NULL, record_id TEXT NOT NULL,
                    effect TEXT NOT NULL, required_capability TEXT, side_effect TEXT NOT NULL,
                    provider TEXT NOT NULL, version INTEGER NOT NULL,
                    PRIMARY KEY(project, tool_id));
                CREATE TABLE IF NOT EXISTS tool_systems(
                    project TEXT NOT NULL, tool_id TEXT NOT NULL, system TEXT NOT NULL,
                    PRIMARY KEY(project, tool_id, system));
                CREATE TABLE IF NOT EXISTS tool_data_classes(
                    project TEXT NOT NULL, tool_id TEXT NOT NULL, data_class TEXT NOT NULL,
                    PRIMARY KEY(project, tool_id, data_class));
                CREATE TABLE IF NOT EXISTS tool_idempotency(
                    project TEXT NOT NULL, key TEXT NOT NULL, payload_hash TEXT NOT NULL,
                    target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
                    status TEXT NOT NULL, reason TEXT NOT NULL, source TEXT NOT NULL,
                    PRIMARY KEY(project, key));
                CREATE TABLE IF NOT EXISTS tool_attempts(
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    project TEXT NOT NULL, tool_id TEXT NOT NULL, system TEXT NOT NULL,
                    action TEXT NOT NULL, status TEXT NOT NULL, requested_by TEXT NOT NULL,
                    created_at TEXT NOT NULL, idempotency_key TEXT);
            """)
            db.execute("INSERT OR IGNORE INTO component_versions VALUES('tools', 1)")

    def _tool_record(self, actor: Principal, scope: Scope, tool_id: str) -> Record | None:
        with self.store._locked(), self.store._db("project") as db:
            row = db.execute(
                "SELECT record_id FROM tool_index WHERE project=? AND tool_id=?",
                (scope.project, tool_id)).fetchone()
        if row is None:
            return None
        return self.store.get(actor, scope, row["record_id"])

    def _principal_capabilities(self, db: Any, scope: Scope, actor: Principal) -> set[str]:
        row = db.execute(
            "SELECT capabilities FROM memberships WHERE project=? AND principal=?",
            (scope.project, actor.id)).fetchone()
        if row is None:
            return set()
        try:
            return set(json.loads(row["capabilities"]))
        except (ValueError, TypeError):
            return set()

    def _resolve_check(self, actor: Principal, scope: Scope, tool_id: str,
                       system: str, action: str) -> tuple[bool, str, str]:
        record = self._tool_record(actor, scope, tool_id)
        if record is None:
            return False, f"Tool {tool_id} is not registered in this scope", "owner-policy"
        content = record.content
        systems = content.get("systems") or []
        if system not in systems:
            return (False,
                    f"System {system} is not authorized for tool {tool_id}; the registration allows {systems}",
                    "owner-policy")
        provider = content.get("provider") or "local"
        if provider != "local":
            return (False,
                    f"Provider {provider} did not authorize action {action} on tool {tool_id}; "
                    f"the gateway makes no provider call",
                    "provider")
        required = content.get("required_capability")
        if required is not None:
            with self.store._locked(), self.store._db("project") as db:
                capabilities = self._principal_capabilities(db, scope, actor)
            if required not in capabilities:
                return (False,
                        f"Principal {actor.id} lacks required capability {required} for tool {tool_id}",
                        "owner-policy")
        return True, f"Tool {tool_id} is authorized for system {system} and action {action} by owner policy", "owner-policy"

    def register(self, actor: Principal, scope: Scope, *, tool_id: str,
                 systems: list[str], effect: str,
                 required_capability: str | None = None,
                 side_effect: str = "none",
                 data_classes: list[str] | None = None,
                 provider: str = "local") -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A tool belongs to a project")
        identifier(tool_id)
        systems = _require_strings(systems, "systems")
        if not isinstance(effect, str) or not effect.strip():
            raise InvalidRequest("A bounded effect is required")
        if required_capability is not None:
            identifier(required_capability)
        if not isinstance(side_effect, str) or not side_effect.strip():
            raise InvalidRequest("A bounded side effect is required")
        data_classes = _require_strings(data_classes, "data_classes") if data_classes is not None else []
        identifier(provider)
        if not isinstance(actor, Principal):
            raise AccessDenied("A trusted principal is required")
        content = {
            "tool_id": tool_id, "systems": systems, "effect": effect.strip(),
            "required_capability": required_capability,
            "side_effect": side_effect.strip(),
            "data_classes": data_classes, "provider": provider,
        }
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="tool")
            if db.execute(
                    "SELECT 1 FROM tool_index WHERE project=? AND tool_id=?",
                    (scope.project, tool_id)).fetchone() is not None:
                raise Conflict(f"Tool {tool_id} is already registered in this scope")
            record = self.store._insert(db, actor, scope, "tool", content)
            db.execute("INSERT INTO tool_index VALUES(?,?,?,?,?,?,?,?)",
                       (scope.project, tool_id, record.id, effect.strip(),
                        required_capability, side_effect.strip(), provider,
                        record.version))
            for system in systems:
                db.execute("INSERT INTO tool_systems VALUES(?,?,?)",
                           (scope.project, tool_id, system))
            for data_class in data_classes:
                db.execute("INSERT INTO tool_data_classes VALUES(?,?,?)",
                           (scope.project, tool_id, data_class))
            return record

    def catalog(self, actor: Principal, scope: Scope) -> list[dict]:
        if scope.namespace != "project":
            raise InvalidRequest("A tool catalog belongs to a project")
        records = self.store.list(actor, scope, kind="tool")
        result: list[dict[str, Any]] = []
        for record in records:
            content = record.content
            result.append({
                "tool_id": content["tool_id"], "systems": content["systems"],
                "effect": content["effect"],
                "required_capability": content["required_capability"],
                "side_effect": content["side_effect"],
                "data_classes": content["data_classes"],
                "provider": content["provider"],
                "version": record.version,
            })
        return result

    def resolve(self, actor: Principal, scope: Scope, *, tool_id: str,
                system: str, action: str) -> dict:
        if scope.namespace != "project":
            raise InvalidRequest("A tool resolution belongs to a project")
        identifier(tool_id)
        identifier(system)
        identifier(action)
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "read")
            allowed, reason, source = self._resolve_check(actor, scope, tool_id, system, action)
        return {"allowed": allowed, "reason": reason, "source": source}

    def invoke(self, actor: Principal, scope: Scope, *, tool_id: str,
               system: str, action: str,
               payload: dict | None = None,
               idempotency_key: str | None = None) -> dict:
        if scope.namespace != "project":
            raise InvalidRequest("A tool invocation belongs to a project")
        identifier(tool_id)
        identifier(system)
        identifier(action)
        if idempotency_key is not None:
            identifier(idempotency_key)
        if payload is not None:
            if not isinstance(payload, dict):
                raise InvalidRequest("A payload must be a JSON object")
            json_bytes(payload)
            payload_hash_part = hashlib.sha256(json_bytes(payload)).hexdigest()
        else:
            payload_hash_part = ""
        payload_hash = hashlib.sha256(
            json_bytes([tool_id, system, action, payload_hash_part])).hexdigest()
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="tool")
            allowed, reason, source = self._resolve_check(actor, scope, tool_id, system, action)
            status = "AUTHORIZED" if allowed else "DENIED"
            if idempotency_key is not None:
                existing = db.execute(
                    "SELECT * FROM tool_idempotency WHERE project=? AND key=?",
                    (scope.project, idempotency_key)).fetchone()
                if existing is not None:
                    if existing["payload_hash"] != payload_hash:
                        raise Conflict("Idempotency key was reused with a different invocation payload")
                    return {"status": existing["status"], "tool_id": tool_id,
                            "system": system, "action": action, "reason": existing["reason"],
                            "source": existing["source"], "idempotent": True,
                            "executed": False, "execution_status": "NOT_EXECUTED"}
            db.execute(
                "INSERT INTO tool_attempts(project, tool_id, system, action, status, "
                "requested_by, created_at, idempotency_key) VALUES(?,?,?,?,?,?,?,?)",
                (scope.project, tool_id, system, action, status, actor.id, utc_now(),
                 idempotency_key))
            if idempotency_key is not None:
                db.execute("INSERT INTO tool_idempotency VALUES(?,?,?,?,?,?,?,?)",
                           (scope.project, idempotency_key, payload_hash, "tool_invoke",
                            tool_id + "\u2029" + system + "\u2029" + action,
                            status, reason, source))
            return {"status": status, "tool_id": tool_id, "system": system, "action": action,
                    "reason": reason, "source": source,
                    "executed": False, "execution_status": "NOT_EXECUTED"}

    def attempts(self, actor: Principal, scope: Scope, tool_id: str) -> list[dict]:
        if scope.namespace != "project":
            raise InvalidRequest("Attempts belong to a project")
        identifier(tool_id)
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "read")
            rows = db.execute(
                "SELECT seq, system, action, status, requested_by, created_at, idempotency_key "
                "FROM tool_attempts WHERE project=? AND tool_id=? ORDER BY seq",
                (scope.project, tool_id)).fetchall()
        result: list[dict[str, Any]] = []
        for row in rows:
            result.append({
                "seq": row["seq"], "tool_id": tool_id, "system": row["system"],
                "action": row["action"], "status": row["status"],
                "requested_by": row["requested_by"], "created_at": row["created_at"],
                "idempotency_key": row["idempotency_key"],
            })
        return result
