"""Encrypted, versioned three-scope memory with recoverable archive and purge.

All mutations cooperate through one process-released file lock. Each record's
revision, term index and audit event commit in its own SQLite transaction.
Purge commits an intent before key destruction so restart completes the exact
operation; snapshots contain databases but never the live key authority.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import threading
import time
import unicodedata
from typing import Any, Iterator
from uuid import uuid4

from .contracts import Principal, PurgeConfirmation, Record, Scope, identifier, json_bytes
from .errors import AccessDenied, Conflict, Gone, IntegrityFailure, InvalidRequest, NotFound
from .platform_fs import exclusive_writer_lock, protect_existing_windows_tree
from .vault import KeyVault, private_directory, sync_directory

PLANES = ("person", "project", "global")
ROLES = {
    "owner": {"read", "write", "review", "decide", "delegate", "manage"},
    "coordinator": {"read", "write", "review", "delegate"},
    "contributor": {"read", "write"},
    "reviewer": {"read", "review"},
    "reader": {"read"},
}
PROTECTED_KINDS = {"project", "decision", "charter", "budget", "policy", "approval"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def terms(content: str) -> set[str]:
    normalized = unicodedata.normalize("NFKD", content.casefold())
    normalized = "".join(c for c in normalized if not unicodedata.combining(c))
    return {t for t in re.findall(r"[^\W_]+", normalized, flags=re.UNICODE) if len(t) > 1}


class MemoryStore:
    def __init__(self, root: str | Path, *, administrator: str = "owner"):
        self.root = private_directory(Path(root).absolute())
        protect_existing_windows_tree(self.root)
        self._thread_lock = threading.RLock()
        self._local = threading.local()
        with self._locked():
            self.vault = KeyVault(self.root / "keys", administrator)
            for plane in PLANES:
                self._initialize(plane)
            # New SQLite database files inherit the private root ACL, but also
            # protect their own DACL explicitly after first schema creation.
            protect_existing_windows_tree(self.root)
            self._recover_restore()
            self._recover_purges()

    @contextmanager
    def _locked(self) -> Iterator[None]:
        with self._thread_lock:
            depth = getattr(self._local, "depth", 0)
            if depth:
                self._local.depth = depth + 1
                try:
                    yield
                finally:
                    self._local.depth -= 1
                return
            lock_path = self.root / ".writer.lock"
            if lock_path.is_symlink():
                raise InvalidRequest("Writer lock must not be a symlink")
            fd = os.open(lock_path, os.O_CREAT | os.O_RDWR |
                         getattr(os, "O_NOFOLLOW", 0), 0o600)
            try:
                with exclusive_writer_lock(fd):
                    self._local.depth = 1
                    try:
                        if hasattr(self, "vault") and not getattr(self._local, "recovering", False):
                            self._recover_restore()
                        yield
                    finally:
                        self._local.depth = 0
            finally:
                os.close(fd)

    @contextmanager
    def _db(self, plane: str) -> Iterator[sqlite3.Connection]:
        if plane not in PLANES:
            raise InvalidRequest("Unknown memory plane")
        db = sqlite3.connect(self.root / f"{plane}.db", timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA synchronous=FULL")
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def _initialize(self, plane: str) -> None:
        with self._db(plane) as db:
            db.execute("PRAGMA journal_mode=WAL")
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise IntegrityFailure("Unsupported memory schema; migration required")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS records(
                    id TEXT PRIMARY KEY, scope TEXT NOT NULL, owner TEXT NOT NULL,
                    project TEXT, kind TEXT NOT NULL, status TEXT NOT NULL,
                    version INTEGER NOT NULL, created_by TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    key_id TEXT NOT NULL, ciphertext BLOB);
                CREATE INDEX IF NOT EXISTS records_scope ON records(scope,status);
                CREATE TABLE IF NOT EXISTS revisions(
                    record_id TEXT NOT NULL REFERENCES records(id), version INTEGER NOT NULL,
                    metadata TEXT NOT NULL, ciphertext BLOB NOT NULL,
                    PRIMARY KEY(record_id,version));
                CREATE TABLE IF NOT EXISTS search_terms(
                    record_id TEXT NOT NULL REFERENCES records(id), term TEXT NOT NULL,
                    PRIMARY KEY(record_id,term));
                CREATE INDEX IF NOT EXISTS terms_hash ON search_terms(term);
                CREATE TABLE IF NOT EXISTS audit(
                    seq INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT NOT NULL,
                    actor TEXT NOT NULL, action TEXT NOT NULL, version INTEGER NOT NULL,
                    created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS purge_requests(
                    token_hash TEXT PRIMARY KEY, actor TEXT NOT NULL,
                    record_id TEXT NOT NULL, scope TEXT NOT NULL, version INTEGER NOT NULL,
                    expires REAL NOT NULL, state TEXT NOT NULL, key_id TEXT NOT NULL);
                PRAGMA user_version=1;
            """)
            if plane == "project":
                db.executescript("""
                    CREATE TABLE IF NOT EXISTS projects(
                        id TEXT PRIMARY KEY, owner TEXT NOT NULL, record_id TEXT NOT NULL);
                    CREATE TABLE IF NOT EXISTS memberships(
                        project TEXT NOT NULL REFERENCES projects(id), principal TEXT NOT NULL,
                        role TEXT NOT NULL, capabilities TEXT NOT NULL,
                        PRIMARY KEY(project,principal));
                """)

    def _authorize(self, actor: Principal, scope: Scope, capability: str,
                   *, kind: str | None = None, created_by: str | None = None) -> None:
        if not isinstance(actor, Principal):
            raise AccessDenied("A trusted principal is required")
        if scope.namespace in ("person", "global"):
            if actor.id != scope.owner:
                raise AccessDenied("Memory is outside the actor's scope")
            return
        with self._db("project") as db:
            project = db.execute("SELECT owner FROM projects WHERE id=?", (scope.project,)).fetchone()
            member = db.execute("SELECT capabilities FROM memberships WHERE project=? AND principal=?",
                                (scope.project, actor.id)).fetchone()
        if not project or project["owner"] != scope.owner or not member:
            raise AccessDenied("Project is outside the actor's scope")
        caps = set(json.loads(member["capabilities"]))
        required = "decide" if capability == "write" and kind in PROTECTED_KINDS else capability
        if kind == "review" and capability == "write":
            required = "review"
            if created_by and actor.id not in (created_by, scope.owner):
                raise AccessDenied("Another reviewer's report is not writable")
        if required not in caps:
            raise AccessDenied("The scoped capability was not granted")

    def create_project(self, actor: Principal, name: str, *, project_id: str | None = None) -> Scope:
        if not isinstance(actor, Principal):
            raise AccessDenied("A trusted principal is required")
        if not isinstance(name, str) or not name.strip() or len(name) > 300:
            raise InvalidRequest("A bounded project name is required")
        project_id = identifier(project_id or "project-" + uuid4().hex)
        scope = Scope("project", actor.id, project_id)
        with self._locked(), self._db("project") as db:
            if db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
                raise Conflict("Project identity already exists")
            record = self._insert(db, actor, scope, "project", {"name": name})
            db.execute("INSERT INTO projects VALUES(?,?,?)", (project_id, actor.id, record.id))
            db.execute("INSERT INTO memberships VALUES(?,?,?,?)",
                       (project_id, actor.id, "owner", json.dumps(sorted(ROLES["owner"]))))
        return scope

    def grant(self, actor: Principal, scope: Scope, member: Principal, role: str,
              *, extra_capabilities: set[str] | None = None) -> None:
        if scope.namespace != "project" or actor.id != scope.owner:
            raise AccessDenied("Only the project owner can grant roles")
        if role not in ROLES or role == "owner":
            raise InvalidRequest("Choose a non-owner team role; ownership transfer is a separate action")
        extra = extra_capabilities or set()
        if not extra <= ROLES["owner"]:
            raise InvalidRequest("Unknown capability")
        with self._locked():
            self._authorize(actor, scope, "manage")
            with self._db("project") as db:
                db.execute("INSERT INTO memberships VALUES(?,?,?,?) ON CONFLICT(project,principal) "
                           "DO UPDATE SET role=excluded.role,capabilities=excluded.capabilities",
                           (scope.project, member.id, role, json.dumps(sorted(ROLES[role] | extra))))

    def revoke(self, actor: Principal, scope: Scope, member: Principal) -> None:
        if scope.namespace != "project" or actor.id != scope.owner or member.id == scope.owner:
            raise AccessDenied("Only the project owner can revoke a non-owner membership")
        with self._locked():
            self._authorize(actor, scope, "manage")
            with self._db("project") as db:
                db.execute("DELETE FROM memberships WHERE project=? AND principal=?", (scope.project, member.id))

    def project_scope(self, actor: Principal, project_id: str) -> Scope:
        identifier(project_id)
        with self._locked(), self._db("project") as db:
            row = db.execute("SELECT owner FROM projects WHERE id=?", (project_id,)).fetchone()
            if not row:
                raise NotFound("Project not found")
            scope = Scope("project", row["owner"], project_id)
            self._authorize(actor, scope, "read")
            return scope

    def projects(self, actor: Principal) -> list[Record]:
        with self._locked(), self._db("project") as db:
            rows = db.execute("SELECT p.id,p.owner,p.record_id FROM projects p JOIN memberships m "
                              "ON m.project=p.id WHERE m.principal=? ORDER BY p.id", (actor.id,)).fetchall()
            result = []
            for row in rows:
                scope = Scope("project", row["owner"], row["id"])
                self._authorize(actor, scope, "read")
                record = self._row(db, scope, row["record_id"])
                if record["status"] == "ACTIVE":
                    result.append(self._decode(record, scope))
            return result

    @staticmethod
    def _aad(meta: dict[str, Any]) -> bytes:
        return json_bytes({k: meta[k] for k in (
            "id", "scope", "owner", "project", "kind", "status", "version",
            "created_by", "created_at", "updated_at", "key_id")})

    def _decode(self, row: sqlite3.Row | dict[str, Any], scope: Scope) -> Record:
        meta = dict(row)
        if meta["scope"] != scope.key:
            raise NotFound("Record not found in the requested scope")
        if meta["status"] == "PURGED":
            raise Gone("Record was permanently purged")
        try:
            content = json.loads(self.vault.decrypt(meta["key_id"], meta["ciphertext"], self._aad(meta)))
            if not isinstance(content, dict):
                raise ValueError("object required")
        except (ValueError, TypeError) as exc:
            raise IntegrityFailure("Decrypted record is not a JSON object") from exc
        return Record(meta["id"], scope, meta["kind"], meta["status"], meta["version"],
                      meta["created_by"], meta["created_at"], meta["updated_at"], content)

    def _term_hashes(self, scope: Scope, text: str) -> set[str]:
        return {hmac.new(self.vault.index_key, (scope.key + "\0" + t).encode(), hashlib.sha256).hexdigest()
                for t in terms(text)}

    def _index(self, db: sqlite3.Connection, meta: dict[str, Any], scope: Scope,
               content: dict[str, Any]) -> None:
        db.execute("DELETE FROM search_terms WHERE record_id=?", (meta["id"],))
        if meta["status"] == "ACTIVE":
            hashes = self._term_hashes(scope, json_bytes(content).decode())
            db.executemany("INSERT INTO search_terms VALUES(?,?)", [(meta["id"], h) for h in hashes])

    @staticmethod
    def _audit(db: sqlite3.Connection, record_id: str, actor: str, action: str, version: int) -> None:
        db.execute("INSERT INTO audit(record_id,actor,action,version,created_at) VALUES(?,?,?,?,?)",
                   (record_id, actor, action, version, utc_now()))

    def _save(self, db: sqlite3.Connection, meta: dict[str, Any], scope: Scope,
              content: dict[str, Any], actor: Principal, action: str) -> Record:
        cipher = self.vault.encrypt(meta["key_id"], json_bytes(content), self._aad(meta))
        meta["ciphertext"] = cipher
        db.execute("INSERT INTO records VALUES(:id,:scope,:owner,:project,:kind,:status,:version,"
                   ":created_by,:created_at,:updated_at,:key_id,:ciphertext) ON CONFLICT(id) DO UPDATE SET "
                   "status=excluded.status,version=excluded.version,updated_at=excluded.updated_at,"
                   "ciphertext=excluded.ciphertext", meta)
        revision = {k: v for k, v in meta.items() if k != "ciphertext"}
        db.execute("INSERT INTO revisions VALUES(?,?,?,?)",
                   (meta["id"], meta["version"], json_bytes(revision).decode(), cipher))
        self._index(db, meta, scope, content)
        self._audit(db, meta["id"], actor.id, action, meta["version"])
        return self._decode(meta, scope)

    def _insert(self, db: sqlite3.Connection, actor: Principal, scope: Scope, kind: str,
                content: dict[str, Any]) -> Record:
        identifier(kind)
        if not isinstance(content, dict):
            raise InvalidRequest("Record content must be a JSON object")
        json_bytes(content)
        stamp = utc_now()
        meta = dict(id="memory-" + uuid4().hex, scope=scope.key, owner=scope.owner,
                    project=scope.project, kind=kind, status="ACTIVE", version=1,
                    created_by=actor.id, created_at=stamp, updated_at=stamp,
                    key_id=self.vault.create())
        return self._save(db, meta, scope, content, actor, "CREATE")

    def create(self, actor: Principal, scope: Scope, kind: str, content: dict[str, Any]) -> Record:
        with self._locked():
            self._authorize(actor, scope, "write", kind=kind)
            with self._db(scope.namespace) as db:
                return self._insert(db, actor, scope, kind, content)

    @staticmethod
    def _row(db: sqlite3.Connection, scope: Scope, record_id: str) -> sqlite3.Row:
        identifier(record_id)
        row = db.execute("SELECT * FROM records WHERE id=? AND scope=?", (record_id, scope.key)).fetchone()
        if not row:
            raise NotFound("Record not found in the requested scope")
        return row

    def get(self, actor: Principal, scope: Scope, record_id: str, *, include_archived: bool = False) -> Record:
        with self._locked():
            self._authorize(actor, scope, "read")
            with self._db(scope.namespace) as db:
                row = self._row(db, scope, record_id)
                if row["status"] == "ARCHIVED" and not include_archived:
                    raise NotFound("Record is archived; request an explicit archive read")
                return self._decode(row, scope)

    def list(self, actor: Principal, scope: Scope, *, include_archived: bool = False,
             kind: str | None = None, limit: int = 50) -> list[Record]:
        if not isinstance(limit, int) or not 1 <= limit <= 200:
            raise InvalidRequest("Limit must be between 1 and 200")
        with self._locked():
            self._authorize(actor, scope, "read")
            with self._db(scope.namespace) as db:
                query = "SELECT * FROM records WHERE scope=? AND status IN (" + (
                    "'ACTIVE','ARCHIVED'" if include_archived else "'ACTIVE'") + ")"
                args: list[Any] = [scope.key]
                if kind is not None:
                    query += " AND kind=?"
                    args.append(identifier(kind))
                rows = db.execute(query + " ORDER BY updated_at DESC,id LIMIT ?", (*args, limit)).fetchall()
                return [self._decode(row, scope) for row in rows]

    def update(self, actor: Principal, scope: Scope, record_id: str, content: dict[str, Any],
               *, expected_version: int) -> Record:
        return self._change(actor, scope, record_id, expected_version, "UPDATE", content=content)

    def history(self, actor: Principal, scope: Scope, record_id: str) -> list[Record]:
        """Explicit historical access; never used by ordinary active recall."""
        with self._locked(), self._db(scope.namespace) as db:
            self._authorize(actor, scope, "read")
            current = self._row(db, scope, record_id)
            self._decode(current, scope)
            revisions = db.execute("SELECT metadata,ciphertext FROM revisions WHERE record_id=? ORDER BY version",
                                   (record_id,)).fetchall()
            return [self._decode({**json.loads(row["metadata"]), "ciphertext": row["ciphertext"]}, scope)
                    for row in revisions]

    def archive(self, actor: Principal, scope: Scope, record_id: str, *, expected_version: int) -> Record:
        return self._change(actor, scope, record_id, expected_version, "ARCHIVE", status="ARCHIVED")

    def restore_record(self, actor: Principal, scope: Scope, record_id: str, *, expected_version: int) -> Record:
        return self._change(actor, scope, record_id, expected_version, "RESTORE", status="ACTIVE")

    def _change(self, actor: Principal, scope: Scope, record_id: str, expected_version: int,
                action: str, *, content: dict[str, Any] | None = None, status: str | None = None) -> Record:
        if type(expected_version) is not int or expected_version < 1:
            raise InvalidRequest("An expected positive record version is required")
        with self._locked(), self._db(scope.namespace) as db:
            self._authorize(actor, scope, "read")
            row = self._row(db, scope, record_id)
            self._authorize(actor, scope, "write", kind=row["kind"], created_by=row["created_by"])
            previous = self._decode(row, scope)
            if previous.version != expected_version:
                raise Conflict("Record version changed; reload before updating")
            if action == "UPDATE" and previous.status != "ACTIVE":
                raise Conflict("Restore an archived record before modifying it")
            if action == "RESTORE" and previous.status != "ARCHIVED":
                raise Conflict("Only archived records can be restored")
            if action == "ARCHIVE" and previous.status != "ACTIVE":
                raise Conflict("Record is already archived")
            if content is not None and not isinstance(content, dict):
                raise InvalidRequest("Record content must be a JSON object")
            meta = dict(row)
            meta.update(version=expected_version + 1, updated_at=utc_now(), status=status or previous.status)
            return self._save(db, meta, scope, previous.content if content is None else content, actor, action)

    def search(self, actor: Principal, scope: Scope, query: str, *, limit: int = 20) -> list[Record]:
        if not isinstance(query, str) or not query.strip() or len(query) > 1000:
            raise InvalidRequest("A bounded search query is required")
        if type(limit) is not int or not 1 <= limit <= 100:
            raise InvalidRequest("Search limit must be between 1 and 100")
        with self._locked():
            self._authorize(actor, scope, "read")
            hashes = sorted(self._term_hashes(scope, query))[:32]
            if not hashes:
                return []
            with self._db(scope.namespace) as db:
                placeholders = ",".join("?" for _ in hashes)
                rows = db.execute(
                    "SELECT r.* FROM records r JOIN search_terms t ON t.record_id=r.id "
                    f"WHERE r.scope=? AND r.status='ACTIVE' AND t.term IN ({placeholders}) "
                    "GROUP BY r.id ORDER BY COUNT(*) DESC,r.updated_at DESC,r.id LIMIT ?",
                    (scope.key, *hashes, limit)).fetchall()
                return [self._decode(row, scope) for row in rows]

    def request_purge(self, actor: Principal, scope: Scope, record_id: str,
                      *, expected_version: int, expires_in: int = 300) -> PurgeConfirmation:
        if type(expires_in) is not int or not 1 <= expires_in <= 900:
            raise InvalidRequest("Confirmation lifetime must be between 1 and 900 seconds")
        if actor.id != scope.owner:
            raise AccessDenied("Permanent purge requires the scope owner")
        with self._locked(), self._db(scope.namespace) as db:
            self._authorize(actor, scope, "write")
            row = self._row(db, scope, record_id)
            self._decode(row, scope)
            if row["version"] != expected_version:
                raise Conflict("Record changed before purge preview")
            token = secrets.token_urlsafe(32)
            expires = time.time() + expires_in
            db.execute("INSERT INTO purge_requests VALUES(?,?,?,?,?,?,?,?)",
                       (hashlib.sha256(token.encode()).hexdigest(), actor.id, record_id, scope.key,
                        expected_version, expires, "PENDING", row["key_id"]))
            return PurgeConfirmation(token, record_id, scope, expected_version, expires)

    def confirm_purge(self, actor: Principal, confirmation: PurgeConfirmation) -> None:
        scope = confirmation.scope
        if actor.id != scope.owner:
            raise AccessDenied("Permanent purge requires the scope owner")
        token_hash = hashlib.sha256(confirmation.token.encode()).hexdigest()
        with self._locked():
            self._authorize(actor, scope, "write")
            with self._db(scope.namespace) as db:
                req = db.execute("SELECT * FROM purge_requests WHERE token_hash=?", (token_hash,)).fetchone()
                row = self._row(db, scope, confirmation.record_id)
                if not req or req["state"] != "PENDING" or req["expires"] < time.time():
                    raise Conflict("Confirmation is absent, expired or already consumed")
                if (req["actor"], req["scope"], req["record_id"], req["version"]) != (
                        actor.id, scope.key, confirmation.record_id, confirmation.version):
                    raise Conflict("Confirmation does not match this deletion scope")
                if row["version"] != req["version"] or row["status"] == "PURGED":
                    raise Conflict("Record changed after confirmation preview")
                db.execute("UPDATE purge_requests SET state='RUNNING' WHERE token_hash=?", (token_hash,))
            self._finish_purge(scope.namespace, dict(req))

    def _finish_purge(self, plane: str, req: dict[str, Any]) -> None:
        self.vault.destroy(req["key_id"])
        with self._db(plane) as db:
            row = db.execute("SELECT version,status FROM records WHERE id=?", (req["record_id"],)).fetchone()
            if row and row["status"] != "PURGED":
                db.execute("UPDATE records SET status='PURGED',ciphertext=NULL,version=version+1,"
                           "updated_at=? WHERE id=?", (utc_now(), req["record_id"]))
                db.execute("DELETE FROM revisions WHERE record_id=?", (req["record_id"],))
                db.execute("DELETE FROM search_terms WHERE record_id=?", (req["record_id"],))
                self._audit(db, req["record_id"], req["actor"], "PURGE", row["version"] + 1)
            db.execute("UPDATE purge_requests SET state='COMPLETED' WHERE token_hash=?", (req["token_hash"],))

    def _recover_purges(self) -> None:
        for plane in PLANES:
            with self._db(plane) as db:
                pending = [dict(r) for r in db.execute("SELECT * FROM purge_requests WHERE state='RUNNING'")]
                rows = [dict(r) for r in db.execute("SELECT id,key_id,version FROM records WHERE status!='PURGED'")]
            for req in pending:
                self._finish_purge(plane, req)
            # Restoring an old database cannot restore a destroyed live key.
            for row in rows:
                if not self.vault.has(row["key_id"]):
                    with self._db(plane) as db:
                        db.execute("UPDATE records SET status='PURGED',ciphertext=NULL WHERE id=?", (row["id"],))
                        db.execute("DELETE FROM revisions WHERE record_id=?", (row["id"],))
                        db.execute("DELETE FROM search_terms WHERE record_id=?", (row["id"],))

    def snapshot(self, actor: Principal, destination: str | Path) -> Path:
        self._require_administrator(actor)
        path = Path(destination).absolute()
        if path == self.root or path.is_relative_to(self.root):
            raise InvalidRequest("Snapshots must be outside the live state directory")
        if path.exists():
            raise Conflict("Snapshot destination already exists")
        with self._locked():
            private_directory(path)
            manifest: dict[str, Any] = {"installation": self.vault.installation["id"],
                                        "created_at": utc_now(), "contains_keys": False, "databases": {}}
            for plane in PLANES:
                target = path / f"{plane}.db"
                with self._db(plane) as source:
                    dest = sqlite3.connect(target)
                    try:
                        source.backup(dest)
                    finally:
                        dest.close()
                os.chmod(target, 0o600)
                manifest["databases"][plane] = hashlib.sha256(target.read_bytes()).hexdigest()
            (path / "snapshot.json").write_bytes(json_bytes(manifest))
            os.chmod(path / "snapshot.json", 0o600)
            sync_directory(path)
        return path

    def restore_snapshot(self, actor: Principal, source: str | Path) -> None:
        self._require_administrator(actor)
        path = Path(source).absolute()
        try:
            manifest = json.loads((path / "snapshot.json").read_bytes())
            if manifest["installation"] != self.vault.installation["id"] or manifest["contains_keys"] is not False:
                raise IntegrityFailure("Snapshot does not belong to this live key authority")
        except (OSError, KeyError, ValueError, sqlite3.Error) as exc:
            raise IntegrityFailure("Snapshot could not be validated") from exc
        with self._locked():
            stage = self.root / (".restore-" + secrets.token_hex(16))
            private_directory(stage)
            journal_written = False
            try:
                for plane in PLANES:
                    original = path / f"{plane}.db"
                    if original.is_symlink():
                        raise IntegrityFailure("Snapshot database must not be a symlink")
                    payload = original.read_bytes()
                    if hashlib.sha256(payload).hexdigest() != manifest["databases"][plane]:
                        raise IntegrityFailure("Snapshot database fingerprint changed")
                    target = stage / f"{plane}.db"
                    with target.open("xb") as file:
                        file.write(payload)
                        file.flush()
                        os.fsync(file.fileno())
                    os.chmod(target, 0o600)
                    self._check_restore_plane(target)
                sync_directory(stage)
                journal = {"stage": stage.name, "installation": self.vault.installation["id"],
                           "databases": manifest["databases"]}
                temporary = self.root / ".restore.json.tmp"
                flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0)
                with os.fdopen(os.open(temporary, flags, 0o600), "wb") as file:
                    file.write(json_bytes(journal))
                    file.flush()
                    os.fsync(file.fileno())
                temporary.replace(self.root / ".restore.json")
                sync_directory(self.root)
                journal_written = True
                self._recover_restore()
            except (OSError, KeyError, ValueError, sqlite3.Error) as exc:
                if not journal_written:
                    shutil.rmtree(stage)
                    raise IntegrityFailure("Snapshot staging failed before live state changed") from exc
                # The durable journal must survive: the next authorized operation
                # finishes this restore before exposing any partly restored state.
                raise
            except BaseException:
                if not journal_written:
                    shutil.rmtree(stage)
                raise

    @staticmethod
    def _check_restore_plane(path: Path) -> None:
        check = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            if check.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise IntegrityFailure("Snapshot database is corrupt")
            if check.execute("PRAGMA user_version").fetchone()[0] != 1:
                raise IntegrityFailure("Snapshot schema requires a supported migration")
            for table in ("records", "revisions", "audit", "search_terms", "purge_requests"):
                check.execute(f"SELECT 1 FROM {table} LIMIT 1")
        finally:
            check.close()

    def _apply_restore_plane(self, stage: Path, plane: str) -> None:
        src = sqlite3.connect(f"file:{stage / (plane + '.db')}?mode=ro", uri=True)
        try:
            with self._db(plane) as dest:
                src.backup(dest)
        finally:
            src.close()

    def _recover_restore(self) -> None:
        journal_path = self.root / ".restore.json"
        if not journal_path.exists():
            return
        if journal_path.is_symlink():
            raise IntegrityFailure("Restore journal must not be a symlink")
        self._local.recovering = True
        try:
            journal = json.loads(journal_path.read_bytes())
            name = journal["stage"]
            if not isinstance(name, str) or not re.fullmatch(r"\.restore-[a-f0-9]{32}", name):
                raise IntegrityFailure("Invalid restore staging identity")
            if journal["installation"] != self.vault.installation["id"]:
                raise IntegrityFailure("Restore journal belongs to another installation")
            stage = self.root / name
            if stage.is_symlink():
                raise IntegrityFailure("Restore staging must not be a symlink")
            for plane in PLANES:
                target = stage / f"{plane}.db"
                if target.is_symlink() or hashlib.sha256(target.read_bytes()).hexdigest() != journal["databases"][plane]:
                    raise IntegrityFailure("Restore staging fingerprint changed")
                self._check_restore_plane(target)
            for plane in PLANES:
                self._apply_restore_plane(stage, plane)
            self._recover_purges()
            journal_path.unlink()
            sync_directory(self.root)
            shutil.rmtree(stage)
        except (OSError, KeyError, ValueError, sqlite3.Error) as exc:
            raise IntegrityFailure("Restore recovery could not complete; live reads remain blocked") from exc
        finally:
            self._local.recovering = False

    def _require_administrator(self, actor: Principal) -> None:
        if actor.id != self.vault.installation["administrator"]:
            raise AccessDenied("This installation's administrator is required")
