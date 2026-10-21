"""Versioned decisions: every decision carries a mandatory, non-empty
authorization source; supersede creates a new auditable record and marks the
old one SUPERSEDED instead of editing it in place, so every effect stays
auditable."""

from __future__ import annotations

import hashlib
from typing import Any

from .contracts import Principal, Record, Scope, identifier, json_bytes
from .errors import Conflict, IntegrityFailure, InvalidRequest, NotFound
from .memory import MemoryStore, utc_now

DECISION_STATES = ("ACTIVE", "SUPERSEDED", "WITHDRAWN")

_INITIAL_CONTENT = {
    "text": "", "meaning": "", "authorization_source": "", "affects": [],
    "state": "ACTIVE", "supersedes": None, "decided_at": "", "decided_by": "",
}


def _require_strings(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or not all(
            isinstance(item, str) and item.strip() for item in value):
        raise InvalidRequest(f"{field} must be a list of non-empty strings")
    return list(value)


class DecisionService:
    def __init__(self, store: MemoryStore) -> None:
        self.store = store
        with store._locked(), store._db("project") as db:
            db.execute("CREATE TABLE IF NOT EXISTS component_versions(name TEXT PRIMARY KEY, version INTEGER NOT NULL)")
            row = db.execute("SELECT version FROM component_versions WHERE name='decisions'").fetchone()
            if row and row[0] != 1:
                raise IntegrityFailure("Decision schema requires a supported migration")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS decision_index(
                    project TEXT NOT NULL, decision_id TEXT NOT NULL, state TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    PRIMARY KEY(project, decision_id));
                CREATE TABLE IF NOT EXISTS decision_idempotency(
                    project TEXT NOT NULL, key TEXT NOT NULL, payload_hash TEXT NOT NULL,
                    decision_id TEXT NOT NULL, decision_version INTEGER NOT NULL,
                    PRIMARY KEY(project, key));
                CREATE TABLE IF NOT EXISTS decision_withdrawals(
                    decision_id TEXT PRIMARY KEY, reason TEXT NOT NULL, actor TEXT NOT NULL,
                    withdrawn_at TEXT NOT NULL);
            """)
            db.execute("INSERT OR IGNORE INTO component_versions VALUES('decisions', 1)")

    def _supersede_old(self, db: Any, scope: Scope, decision_id: str, actor: Principal) -> None:
        row = self.store._row(db, scope, decision_id)
        previous = self.store._decode(row, scope)
        if previous.content["state"] != "ACTIVE":
            raise InvalidRequest(f"Decision {decision_id} is not active; cannot supersede")
        content = dict(previous.content)
        content["state"] = "SUPERSEDED"
        meta = dict(row)
        meta.update(version=previous.version + 1, updated_at=utc_now())
        self.store._save(db, meta, scope, content, actor, "SUPERSEDE")
        db.execute(
            "INSERT INTO decision_index VALUES(?,?,?,?) "
            "ON CONFLICT(project, decision_id) DO UPDATE SET state=excluded.state, version=excluded.version",
            (scope.project, decision_id, "SUPERSEDED", previous.version + 1))

    def record(self, actor: Principal, scope: Scope, *, text: str, meaning: str,
               authorization_source: str, affects: list[str] | None = None,
               supersedes: str | None = None,
               idempotency_key: str | None = None) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A decision belongs to a project")
        if not isinstance(text, str) or not text.strip():
            raise InvalidRequest("A bounded decision text is required")
        if not isinstance(meaning, str) or not meaning.strip():
            raise InvalidRequest("A bounded decision meaning is required")
        if not isinstance(authorization_source, str) or not authorization_source.strip():
            raise InvalidRequest("An authorization source is required; authority never comes from model text or self-claim")
        affects = _require_strings(affects, "affects") if affects is not None else []
        if supersedes is not None:
            identifier(supersedes)
        if idempotency_key is not None:
            identifier(idempotency_key)
        payload_hash = hashlib.sha256(
            json_bytes([text, meaning, authorization_source, affects, supersedes])).hexdigest()

        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="decision")
            if idempotency_key is not None:
                existing = db.execute(
                    "SELECT * FROM decision_idempotency WHERE project=? AND key=?",
                    (scope.project, idempotency_key)).fetchone()
                if existing is not None:
                    if existing["payload_hash"] == payload_hash:
                        return self.store.get(actor, scope, existing["decision_id"])
                    raise Conflict("Idempotency key was reused with a different decision payload")
            if supersedes is not None:
                ref_row = self.store._row(db, scope, supersedes)
                ref_record = self.store._decode(ref_row, scope)
                if ref_record.kind != "decision":
                    raise NotFound("Decision not found")
                if ref_record.content["state"] != "ACTIVE":
                    raise InvalidRequest("Only an active decision can be superseded")
            content = dict(_INITIAL_CONTENT)
            content.update(text=text, meaning=meaning,
                           authorization_source=authorization_source, affects=affects,
                           state="ACTIVE", supersedes=supersedes,
                           decided_at=utc_now(), decided_by=actor.id)
            record = self.store._insert(db, actor, scope, "decision", content)
            db.execute("INSERT INTO decision_index VALUES(?,?,?,?)",
                       (scope.project, record.id, "ACTIVE", record.version))
            if supersedes is not None:
                self._supersede_old(db, scope, supersedes, actor)
            if idempotency_key is not None:
                db.execute("INSERT INTO decision_idempotency VALUES(?,?,?,?,?)",
                           (scope.project, idempotency_key, payload_hash,
                            record.id, record.version))
            return record

    def active(self, actor: Principal, scope: Scope) -> list[Record]:
        if scope.namespace != "project":
            raise InvalidRequest("A decision belongs to a project")
        self.store._authorize(actor, scope, "read")
        with self.store._locked(), self.store._db("project") as db:
            rows = db.execute(
                "SELECT decision_id FROM decision_index WHERE project=? AND state='ACTIVE' "
                "ORDER BY decision_id",
                (scope.project,)).fetchall()
        return [self.store.get(actor, scope, row[0]) for row in rows]

    def get(self, actor: Principal, scope: Scope, decision_id: str) -> Record:
        identifier(decision_id)
        record = self.store.get(actor, scope, decision_id)
        if record.kind != "decision":
            raise NotFound("Decision not found")
        return record

    def history(self, actor: Principal, scope: Scope) -> list[Record]:
        if scope.namespace != "project":
            raise InvalidRequest("A decision belongs to a project")
        return self.store.list(actor, scope, kind="decision", limit=200)

    def supersede(self, actor: Principal, scope: Scope, decision_id: str, *,
                  text: str, authorization_source: str,
                  expected_version: int,
                  idempotency_key: str | None = None) -> Record:
        identifier(decision_id)
        if not isinstance(text, str) or not text.strip():
            raise InvalidRequest("A bounded decision text is required")
        if not isinstance(authorization_source, str) or not authorization_source.strip():
            raise InvalidRequest("An authorization source is required; authority never comes from model text or self-claim")
        if type(expected_version) is not int or expected_version < 1:
            raise InvalidRequest("An expected positive record version is required")
        if idempotency_key is not None:
            identifier(idempotency_key)
        payload_hash = hashlib.sha256(
            json_bytes([decision_id, text, authorization_source])).hexdigest()

        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="decision")
            if idempotency_key is not None:
                existing = db.execute(
                    "SELECT * FROM decision_idempotency WHERE project=? AND key=?",
                    (scope.project, idempotency_key)).fetchone()
                if existing is not None:
                    if existing["payload_hash"] == payload_hash:
                        return self.store.get(actor, scope, existing["decision_id"])
                    raise Conflict("Idempotency key was reused with a different supersede payload")
            row = self.store._row(db, scope, decision_id)
            previous = self.store._decode(row, scope)
            if previous.kind != "decision":
                raise NotFound("Decision not found")
            # A decision that is no longer active cannot be superseded at all.
            # This is checked before the version fence so the caller learns the
            # real reason instead of a stale-version conflict.
            if previous.content["state"] != "ACTIVE":
                raise InvalidRequest("Only an active decision can be superseded")
            if previous.version != expected_version:
                raise Conflict("Decision version changed; reload before superseding")
            old_meaning = previous.content.get("meaning") or ""
            old_affects = previous.content.get("affects") or []
            content = dict(_INITIAL_CONTENT)
            content.update(text=text, meaning=old_meaning,
                           authorization_source=authorization_source, affects=list(old_affects),
                           state="ACTIVE", supersedes=decision_id,
                           decided_at=utc_now(), decided_by=actor.id)
            new_record = self.store._insert(db, actor, scope, "decision", content)
            db.execute("INSERT INTO decision_index VALUES(?,?,?,?)",
                       (scope.project, new_record.id, "ACTIVE", new_record.version))
            self._supersede_old(db, scope, decision_id, actor)
            if idempotency_key is not None:
                db.execute("INSERT INTO decision_idempotency VALUES(?,?,?,?,?)",
                           (scope.project, idempotency_key, payload_hash,
                            new_record.id, new_record.version))
            return new_record

    def withdraw(self, actor: Principal, scope: Scope, decision_id: str, *,
                 reason: str, expected_version: int) -> Record:
        identifier(decision_id)
        if not isinstance(reason, str) or not reason.strip():
            raise InvalidRequest("A withdrawal reason is required")
        if type(expected_version) is not int or expected_version < 1:
            raise InvalidRequest("An expected positive record version is required")
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="decision")
            row = self.store._row(db, scope, decision_id)
            previous = self.store._decode(row, scope)
            if previous.kind != "decision":
                raise NotFound("Decision not found")
            if previous.version != expected_version:
                raise Conflict("Decision version changed; reload before withdrawing")
            if previous.content["state"] != "ACTIVE":
                raise Conflict(f"Decision {decision_id} is {previous.content['state']}; only an active decision can be withdrawn")
            content = dict(previous.content)
            content["state"] = "WITHDRAWN"
            meta = dict(row)
            meta.update(version=previous.version + 1, updated_at=utc_now())
            updated = self.store._save(db, meta, scope, content, actor, "WITHDRAW")
            db.execute(
                "INSERT INTO decision_index VALUES(?,?,?,?) "
                "ON CONFLICT(project, decision_id) DO UPDATE SET state=excluded.state, version=excluded.version",
                (scope.project, decision_id, "WITHDRAWN", updated.version))
            db.execute(
                "INSERT INTO decision_withdrawals VALUES(?,?,?,?) "
                "ON CONFLICT(decision_id) DO UPDATE SET reason=excluded.reason, actor=excluded.actor, withdrawn_at=excluded.withdrawn_at",
                (decision_id, reason, actor.id, utc_now()))
            return updated

    def affected(self, actor: Principal, scope: Scope, unit: str) -> list[Record]:
        identifier(unit)
        return [record for record in self.active(actor, scope)
                if unit in (record.content.get("affects") or [])]
