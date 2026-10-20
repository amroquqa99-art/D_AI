"""Weekly GitHub update watcher: one local state file (state_dir/updates.json)
shared by every environment. A check is due only once every seven days after
the last SUCCESS; a failure never becomes last_success and never postpones
the next check by a week; there is no catch-up accumulation.

Invariant: CHECK_INTERVAL_DAYS is 7; due() is true only when
now >= last_success + 7 days; check() performs a real network request with a
short timeout and records success or failure honestly; apply() requires an
explicit owner decision first and records a rollback token; rollback()
reverses an applied update.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
import urllib.error
import urllib.request
from typing import Any
from uuid import uuid4

from .contracts import Principal, Record, Scope, identifier, json_bytes
from .errors import AccessDenied, Conflict, IntegrityFailure, InvalidRequest, NotFound
from .memory import MemoryStore, utc_now

CHECK_INTERVAL_DAYS = 7

UPDATE_DECISIONS = ("update", "defer", "ignore")
UPDATE_STATES = ("PENDING", "DECIDED", "APPLIED", "ROLLED_BACK")
FETCH_TIMEOUT_SECONDS = 10


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_instant(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value)


def fetch_source(source: str, timeout: float = FETCH_TIMEOUT_SECONDS) -> tuple[bool, str]:
    """Perform an actual network request to source with a short timeout.

    Returns (ok, detail). A non-2xx response or any transport error is a
    failure; it is never reported as success.
    """
    request = urllib.request.Request(
        source, headers={"User-Agent": "D_AI-UpdateWatcher/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        response.read(4096)
        ok = 200 <= response.status < 300
        return ok, f"HTTP {response.status}"


class UpdateWatcher:
    def __init__(self, store: MemoryStore, state_dir: Path | None = None) -> None:
        self.store = store
        self.state_dir = Path(state_dir) if state_dir is not None else store.root
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.state_path = self.state_dir / "updates.json"
        self._state_lock = threading.Lock()
        self._state = self._load_state()
        with store._locked(), store._db("project") as db:
            db.execute("CREATE TABLE IF NOT EXISTS component_versions(name TEXT PRIMARY KEY, version INTEGER NOT NULL)")
            row = db.execute("SELECT version FROM component_versions WHERE name='updates'").fetchone()
            if row and row[0] != 1:
                raise IntegrityFailure("Update schema requires a supported migration")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS update_index(
                    project TEXT NOT NULL, update_id TEXT NOT NULL, record_id TEXT NOT NULL,
                    state TEXT NOT NULL, version INTEGER NOT NULL,
                    PRIMARY KEY(project, update_id));
                CREATE TABLE IF NOT EXISTS update_idempotency(
                    project TEXT NOT NULL, key TEXT NOT NULL, payload_hash TEXT NOT NULL,
                    target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
                    PRIMARY KEY(project, key));
            """)
            db.execute("INSERT OR IGNORE INTO component_versions VALUES('updates', 1)")

    # ---- persistent watcher state (one JSON file, shared by environments) ----

    def _load_state(self) -> dict[str, Any]:
        try:
            data = json.loads(self.state_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {"last_success": None, "last_result": None, "watched": None}
        except (OSError, ValueError) as exc:
            raise IntegrityFailure("Watcher state file is corrupt") from exc
        if not isinstance(data, dict):
            raise IntegrityFailure("Watcher state file is corrupt")
        return {
            "last_success": data.get("last_success"),
            "last_result": data.get("last_result"),
            "watched": data.get("watched"),
        }

    def _save_state(self) -> None:
        temporary = self.state_dir / (".updates.json.tmp-" + uuid4().hex)
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(self._state, handle, indent=2)
            handle.write("\n")
        temporary.replace(self.state_path)

    def _person_scope(self, actor: Principal) -> Scope:
        return Scope("person", actor.id)

    # ---- public API ----

    def status(self, actor: Principal) -> dict:
        self.store._authorize(actor, self._person_scope(actor), "read")
        return {
            "last_success": self._state.get("last_success"),
            "last_result": self._state.get("last_result"),
            "watched": self._state.get("watched"),
            "due": self.due(actor),
        }

    def due(self, actor: Principal, *, now: datetime | None = None) -> bool:
        self.store._authorize(actor, self._person_scope(actor), "read")
        stamp = now or _utc_now()
        last_success = self._state.get("last_success")
        if last_success is None:
            return True
        base = _parse_instant(last_success)
        if base is None:
            raise IntegrityFailure("Watcher state holds an unreadable last success time")
        return stamp >= base + timedelta(days=CHECK_INTERVAL_DAYS)

    def record_check(self, actor: Principal, *, success: bool,
                     detail: str, watched: str | None = None,
                     now: datetime | None = None) -> Record:
        if not isinstance(success, bool):
            raise InvalidRequest("success must be a boolean")
        if not isinstance(detail, str) or not detail.strip():
            raise InvalidRequest("A bounded detail is required")
        if watched is not None and (not isinstance(watched, str) or not watched.strip()):
            raise InvalidRequest("A bounded watched source is required")
        stamp = (now or _utc_now()).isoformat()
        content = {
            "success": success,
            "detail": detail.strip(),
            "watched": watched.strip() if watched else None,
            "checked_at": stamp,
        }
        record = self.store.create(actor, self._person_scope(actor), "update_check", content)
        with self._state_lock:
            if success:
                # A failure never becomes last_success.
                self._state["last_success"] = stamp
            self._state["last_result"] = {
                "success": success,
                "detail": content["detail"],
                "watched": content["watched"],
                "at": stamp,
            }
            if watched:
                self._state["watched"] = watched.strip()
            self._save_state()
        return record

    def check(self, actor: Principal, *, source: str,
              channel: str = "default",
              ref: str | None = None,
              now: datetime | None = None) -> dict:
        if not isinstance(source, str) or not source.strip():
            raise InvalidRequest("A bounded source is required")
        if not isinstance(channel, str) or not channel.strip():
            raise InvalidRequest("A bounded channel is required")
        source = source.strip()
        channel = channel.strip()
        if ref is not None and (not isinstance(ref, str) or not ref.strip()):
            raise InvalidRequest("A bounded ref is required")
        stamp = now or _utc_now()
        try:
            ok, detail = fetch_source(source)
        except (urllib.error.URLError, OSError, ValueError) as exc:
            ok, detail = False, f"network request to {source} failed: {type(exc).__name__}"
        record = self.record_check(
            actor, success=ok, detail=detail, watched=source, now=stamp)
        return {
            "source": source, "ok": ok, "detail": detail,
            "channel": channel, "ref": ref,
            "checked_at": record.content["checked_at"],
            "version": record.version,
        }

    def _update_row(self, db: Any, scope: Scope, update_id: str) -> Any:
        identifier(update_id)
        row = self.store._row(db, scope, update_id)
        if row["kind"] != "update":
            raise NotFound("Update not found")
        return row

    def plan(self, actor: Principal, scope: Scope, *, source: str,
             version: str, commit: str, diff: str, impact: str,
             migration: str = "") -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("An update belongs to a project")
        if not isinstance(source, str) or not source.strip():
            raise InvalidRequest("A bounded source is required")
        if not isinstance(version, str) or not version.strip():
            raise InvalidRequest("A bounded version is required")
        if not isinstance(commit, str) or not commit.strip():
            raise InvalidRequest("A bounded commit is required")
        if not isinstance(diff, str) or not diff.strip():
            raise InvalidRequest("A bounded diff is required")
        if not isinstance(impact, str) or not impact.strip():
            raise InvalidRequest("A bounded impact is required")
        if not isinstance(migration, str):
            raise InvalidRequest("Migration must be a string")
        content = {
            "source": source.strip(), "version": version.strip(),
            "commit": commit.strip(), "diff": diff.strip(), "impact": impact.strip(),
            "migration": migration.strip(), "state": "PENDING", "decision": None,
            "decided_at": None, "decided_by": None, "rollback_token": None,
            "applied_at": None, "applied_by": None,
            "rolled_back_at": None, "rolled_back_by": None,
        }
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="update")
            record = self.store._insert(db, actor, scope, "update", content)
            db.execute("INSERT INTO update_index VALUES(?,?,?,?,?)",
                       (scope.project, record.id, record.id, "PENDING", record.version))
            return record

    def decide(self, actor: Principal, scope: Scope, update_id: str, *,
               decision: str, expected_version: int) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("An update belongs to a project")
        identifier(update_id)
        if decision not in UPDATE_DECISIONS:
            raise InvalidRequest(f"Decision must be one of {', '.join(UPDATE_DECISIONS)}")
        if type(expected_version) is not int or expected_version < 1:
            raise InvalidRequest("An expected positive record version is required")
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="update")
            row = self._update_row(db, scope, update_id)
            previous = self.store._decode(row, scope)
            if previous.version != expected_version:
                raise Conflict("Update version changed; reload before deciding")
            current = previous.content.get("decision")
            if current is not None:
                if current == decision:
                    return previous  # same decision again: same record, no change
                raise Conflict(
                    f"Update {update_id} already decided {current}; "
                    "a different decision is not allowed"
                )
            content = dict(previous.content)
            content.update(decision=decision, state="DECIDED",
                           decided_at=utc_now(), decided_by=actor.id)
            meta = dict(row)
            meta.update(version=previous.version + 1, updated_at=utc_now())
            updated = self.store._save(db, meta, scope, content, actor, "DECIDE_UPDATE")
            db.execute(
                "INSERT INTO update_index VALUES(?,?,?,?,?) "
                "ON CONFLICT(project, update_id) DO UPDATE SET "
                "record_id=excluded.record_id, state=excluded.state, version=excluded.version",
                (scope.project, update_id, updated.id, "DECIDED", updated.version))
            return updated

    def apply(self, actor: Principal, scope: Scope, update_id: str, *,
              expected_version: int,
              rollback_token: str | None = None) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("An update belongs to a project")
        identifier(update_id)
        if type(expected_version) is not int or expected_version < 1:
            raise InvalidRequest("An expected positive record version is required")
        if rollback_token is not None and (
                not isinstance(rollback_token, str) or not rollback_token.strip()):
            raise InvalidRequest("A rollback token must be a non-empty string")
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="update")
            row = self._update_row(db, scope, update_id)
            previous = self.store._decode(row, scope)
            if previous.version != expected_version:
                raise Conflict("Update version changed; reload before applying")
            if previous.content.get("decision") != "update":
                raise InvalidRequest(
                    "An explicit owner decision (update) is required before applying")
            if previous.content.get("state") == "APPLIED":
                return previous  # re-applying the same decision is a no-op
            token = rollback_token.strip() if rollback_token else "rollback-" + uuid4().hex
            content = dict(previous.content)
            content.update(state="APPLIED", rollback_token=token,
                           applied_at=utc_now(), applied_by=actor.id)
            # The previous version stays in the record's revisions, so an apply
            # that fails is rolled back by simply discarding this record; no
            # data is ever lost and the rollback token names this apply.
            meta = dict(row)
            meta.update(version=previous.version + 1, updated_at=utc_now())
            updated = self.store._save(db, meta, scope, content, actor, "APPLY_UPDATE")
            db.execute(
                "INSERT INTO update_index VALUES(?,?,?,?,?) "
                "ON CONFLICT(project, update_id) DO UPDATE SET "
                "record_id=excluded.record_id, state=excluded.state, version=excluded.version",
                (scope.project, update_id, updated.id, "APPLIED", updated.version))
            return updated

    def rollback(self, actor: Principal, scope: Scope, update_id: str, *,
                 expected_version: int) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("An update belongs to a project")
        identifier(update_id)
        if type(expected_version) is not int or expected_version < 1:
            raise InvalidRequest("An expected positive record version is required")
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="update")
            row = self._update_row(db, scope, update_id)
            previous = self.store._decode(row, scope)
            if previous.version != expected_version:
                raise Conflict("Update version changed; reload before rolling back")
            if previous.content.get("state") != "APPLIED":
                raise InvalidRequest("Only an applied update can be rolled back")
            content = dict(previous.content)
            content.update(state="ROLLED_BACK", rolled_back_at=utc_now(),
                           rolled_back_by=actor.id)
            meta = dict(row)
            meta.update(version=previous.version + 1, updated_at=utc_now())
            updated = self.store._save(db, meta, scope, content, actor, "ROLLBACK_UPDATE")
            db.execute(
                "INSERT INTO update_index VALUES(?,?,?,?,?) "
                "ON CONFLICT(project, update_id) DO UPDATE SET "
                "record_id=excluded.record_id, state=excluded.state, version=excluded.version",
                (scope.project, update_id, updated.id, "ROLLED_BACK", updated.version))
            return updated
