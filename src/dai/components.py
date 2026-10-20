"""External component adoption registry: D_AI absorbs a handed-over GitHub
repository's instructions, contracts and working method, never the repository
itself. A component is proposed, decided, adopted into D_AI-native files and
verified against the D_AI tree. The external repository is never a dependency
and its code is never copied into D_AI.

Invariant: source_url is always https://github.com/<owner>/<repo>; an UNKNOWN
or CONFLICT licence refuses ADOPT_PATTERN; patterns are concrete named strings
of at least 12 characters; one decision per component is version-fenced;
adopt() only records relative paths inside the D_AI tree and known contract
bindings; verify() re-checks the recorded files on disk.
"""

from __future__ import annotations

import hashlib
import re
import json
from pathlib import Path
from typing import Any

from .contracts import Principal, Record, Scope, identifier, json_bytes
from .errors import AccessDenied, Conflict, IntegrityFailure, InvalidRequest, NotFound
from .memory import MemoryStore, utc_now

DECISIONS = ("ADOPT_PATTERN", "ADOPT_PATTERN_AFTER_X", "REFERENCE_ONLY", "REJECT")

KNOWN_CONTRACT_NAMES = (
    "charter",
    "workflow.step",
    "memory.scope",
    "decision",
    "task",
    "team.agent",
    "team.message",
    "consultation",
    "model.routing",
    "tool.gateway",
    "update.check",
    "component.registry",
    "adapter.opencode",
    "adapter.pi",
    "system.spec",
)

_REFUSAL_LICENCES = ("UNKNOWN", "CONFLICT")

_GITHUB_URL = re.compile(r"^https://github.com/[^/?#]+/[^/?#]+/?$")
_URL_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")
_MIN_PATTERN_LENGTH = 12


def _repository_root() -> Path:
    """The directory that contains src/dai, derived from this module's file.

    Works no matter where the D_AI data lives: <root>/src/dai/components.py
    resolves to parents[2] == <root>.
    """
    return Path(__file__).resolve().parents[2]


def _require_strings(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or not all(
            isinstance(item, str) and item.strip() for item in value):
        raise InvalidRequest(f"{field} must be a list of non-empty strings")
    return list(value)


def _validate_source_url(source_url: Any) -> str:
    if not isinstance(source_url, str) or not _GITHUB_URL.fullmatch(source_url):
        raise InvalidRequest("source_url must be https://github.com/<owner>/<repo>")
    return source_url


def _validate_patterns(patterns: Any) -> list[str]:
    if not isinstance(patterns, list) or not patterns:
        raise InvalidRequest("patterns must be a non-empty list")
    cleaned: list[str] = []
    for pattern in patterns:
        if not isinstance(pattern, str) or not pattern.strip():
            raise InvalidRequest("each pattern must be a non-empty string")
        if len(pattern.strip()) < _MIN_PATTERN_LENGTH:
            raise InvalidRequest(
                "each pattern must be a concrete named string of at least "
                f"{_MIN_PATTERN_LENGTH} characters"
            )
        cleaned.append(pattern.strip())
    return cleaned


def _is_path_inside_dai_tree(value: Any, root: Path) -> bool:
    """True only for a relative path, without '..' or a URL, inside root."""
    if not isinstance(value, str) or not value.strip():
        return False
    if _URL_SCHEME.match(value):
        return False
    parts = Path(value).parts
    if Path(value).is_absolute() or ".." in parts:
        return False
    try:
        (root / value).resolve().relative_to(root)
    except ValueError:
        return False
    return True


class ComponentRegistry:
    def __init__(self, store: MemoryStore) -> None:
        self.store = store
        with store._locked(), store._db("project") as db:
            db.execute("CREATE TABLE IF NOT EXISTS component_versions(name TEXT PRIMARY KEY, version INTEGER NOT NULL)")
            row = db.execute("SELECT version FROM component_versions WHERE name='components'").fetchone()
            if row and row[0] != 1:
                raise IntegrityFailure("Component schema requires a supported migration")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS component_index(
                    project TEXT NOT NULL, component_id TEXT NOT NULL, record_id TEXT NOT NULL,
                    license TEXT NOT NULL, decision TEXT, version INTEGER NOT NULL,
                    PRIMARY KEY(project, component_id));
                CREATE TABLE IF NOT EXISTS component_idempotency(
                    project TEXT NOT NULL, key TEXT NOT NULL, payload_hash TEXT NOT NULL,
                    target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
                    PRIMARY KEY(project, key));
            """)
            db.execute("INSERT OR IGNORE INTO component_versions VALUES('components', 1)")

    def _component_row(self, db: Any, scope: Scope, component_id: str) -> Any:
        identifier(component_id)
        row = self.store._row(db, scope, component_id)
        if row["kind"] != "component":
            raise NotFound("Component not found")
        return row

    def propose(self, actor: Principal, scope: Scope, *, source_url: str,
                name: str, license: str = "UNKNOWN",
                commit: str | None = None,
                patterns: list[str], requirements: list[str] | None = None,
                abstraction: str | None = None,
                notes: str = "",
                idempotency_key: str | None = None) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A component belongs to a project")
        source_url = _validate_source_url(source_url)
        if not isinstance(name, str) or not name.strip():
            raise InvalidRequest("A bounded component name is required")
        if not isinstance(license, str) or not license.strip():
            raise InvalidRequest("A bounded license is required")
        license = license.strip()
        patterns = _validate_patterns(patterns)
        requirements = _require_strings(requirements, "requirements") if requirements is not None else []
        if abstraction is not None and (not isinstance(abstraction, str) or not abstraction.strip()):
            raise InvalidRequest("A bounded abstraction is required")
        if commit is not None and (not isinstance(commit, str) or not commit.strip()):
            raise InvalidRequest("A bounded commit is required")
        if not isinstance(notes, str):
            raise InvalidRequest("Notes must be a string")
        if idempotency_key is not None:
            identifier(idempotency_key)
        payload_hash = hashlib.sha256(
            json_bytes([source_url, name.strip(), license, commit, patterns,
                        requirements, abstraction, notes])).hexdigest()
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="component")
            if idempotency_key is not None:
                existing = db.execute(
                    "SELECT * FROM component_idempotency WHERE project=? AND key=?",
                    (scope.project, idempotency_key)).fetchone()
                if existing is not None:
                    if existing["payload_hash"] == payload_hash:
                        return self.store.get(actor, scope, existing["target_id"])
                    raise Conflict("Idempotency key was reused with a different component payload")
            content = {
                "source_url": source_url, "name": name.strip(), "license": license,
                "commit": commit.strip() if commit else None,
                "patterns": patterns, "requirements": requirements,
                "abstraction": abstraction.strip() if abstraction else None,
                "notes": notes.strip(), "decision": None, "rationale": None,
                "decided_at": None, "decided_by": None,
                "capability_id": None, "bindings": None, "files": None,
                "verification": None, "adopted_at": None, "adopted_by": None,
            }
            record = self.store._insert(db, actor, scope, "component", content)
            db.execute("INSERT INTO component_index VALUES(?,?,?,?,?,?)",
                       (scope.project, record.id, record.id, license, None, record.version))
            if idempotency_key is not None:
                db.execute("INSERT INTO component_idempotency VALUES(?,?,?,?,?)",
                           (scope.project, idempotency_key, payload_hash,
                            "component", record.id))
            return record

    def decide(self, actor: Principal, scope: Scope, component_id: str, *,
               decision: str, rationale: str,
               expected_version: int) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A component belongs to a project")
        identifier(component_id)
        if decision not in DECISIONS:
            raise InvalidRequest(f"Decision must be one of {', '.join(DECISIONS)}")
        if not isinstance(rationale, str) or not rationale.strip():
            raise InvalidRequest("A bounded rationale is required")
        if type(expected_version) is not int or expected_version < 1:
            raise InvalidRequest("An expected positive record version is required")
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="component")
            row = self._component_row(db, scope, component_id)
            previous = self.store._decode(row, scope)
            if previous.version != expected_version:
                raise Conflict("Component version changed; reload before deciding")
            current = previous.content.get("decision")
            if current is not None:
                if current == decision:
                    return previous  # same decision again: same record, no change
                raise Conflict(
                    f"Component {component_id} already decided {current}; "
                    "a different decision is not allowed"
                )
            license_value = previous.content.get("license")
            if license_value in _REFUSAL_LICENCES and decision == "ADOPT_PATTERN":
                raise InvalidRequest(
                    f"ADOPT_PATTERN is refused while the licence is {license_value}; "
                    "the owner must decide ADOPT_PATTERN_AFTER_X, REFERENCE_ONLY or REJECT "
                    "with a rationale"
                )
            content = dict(previous.content)
            content.update(decision=decision, rationale=rationale.strip(),
                           decided_at=utc_now(), decided_by=actor.id)
            meta = dict(row)
            meta.update(version=previous.version + 1, updated_at=utc_now())
            updated = self.store._save(db, meta, scope, content, actor, "DECIDE_COMPONENT")
            db.execute(
                "INSERT INTO component_index VALUES(?,?,?,?,?,?) "
                "ON CONFLICT(project, component_id) DO UPDATE SET "
                "record_id=excluded.record_id, license=excluded.license, "
                "decision=excluded.decision, version=excluded.version",
                (scope.project, component_id, updated.id, license_value,
                 decision, updated.version))
            return updated

    def adopt(self, actor: Principal, scope: Scope, component_id: str, *,
              capability_id: str, bindings: dict,
              files: list[str], verification: str,
              expected_version: int) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A component belongs to a project")
        identifier(component_id)
        identifier(capability_id)
        if not isinstance(bindings, dict) or not bindings:
            raise InvalidRequest("bindings must be a non-empty dict of contract names")
        for key, value in bindings.items():
            if not isinstance(key, str) or not key.strip():
                raise InvalidRequest("Binding keys must be non-empty strings")
            if value not in KNOWN_CONTRACT_NAMES:
                raise InvalidRequest(
                    f"Binding {value} is not a known D_AI contract name")
        if not isinstance(files, list) or not files:
            raise InvalidRequest("files must be a non-empty list of D_AI-relative paths")
        root = _repository_root()
        cleaned_files: list[str] = []
        for entry in files:
            if not _is_path_inside_dai_tree(entry, root):
                raise InvalidRequest(
                    f"File {entry} is not a relative path inside the D_AI tree "
                    "or points outside it"
                )
            cleaned_files.append(entry)
        if not isinstance(verification, str) or not verification.strip():
            raise InvalidRequest("A bounded verification string is required")
        if type(expected_version) is not int or expected_version < 1:
            raise InvalidRequest("An expected positive record version is required")
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="component")
            row = self._component_row(db, scope, component_id)
            previous = self.store._decode(row, scope)
            if previous.version != expected_version:
                raise Conflict("Component version changed; reload before adopting")
            content = dict(previous.content)
            content.update(capability_id=capability_id, bindings=dict(bindings),
                           files=cleaned_files, verification=verification.strip(),
                           adopted_at=utc_now(), adopted_by=actor.id)
            meta = dict(row)
            meta.update(version=previous.version + 1, updated_at=utc_now())
            updated = self.store._save(db, meta, scope, content, actor, "ADOPT_COMPONENT")
            db.execute(
                "INSERT INTO component_index VALUES(?,?,?,?,?,?) "
                "ON CONFLICT(project, component_id) DO UPDATE SET "
                "record_id=excluded.record_id, version=excluded.version",
                (scope.project, component_id, updated.id,
                 previous.content["license"], previous.content["decision"],
                 updated.version))
            return updated

    def catalog(self, actor: Principal, scope: Scope) -> list[dict]:
        if scope.namespace != "project":
            raise InvalidRequest("A component catalog belongs to a project")
        self.store._authorize(actor, scope, "read")
        records = self.store.list(actor, scope, kind="component")
        result: list[dict[str, Any]] = []
        for record in records:
            content = record.content
            result.append({
                "id": record.id, "name": content["name"],
                "source": content["source_url"], "license": content["license"],
                "decision": content["decision"], "version": record.version,
                "created_at": record.created_at,
            })
        return result

    def get(self, actor: Principal, scope: Scope, component_id: str) -> Record:
        identifier(component_id)
        record = self.store.get(actor, scope, component_id)
        if record.kind != "component":
            raise NotFound("Component not found")
        return record

    def verify(self, actor: Principal, scope: Scope, component_id: str) -> dict:
        record = self.get(actor, scope, component_id)
        content = record.content
        root = _repository_root()
        files = content.get("files") or []
        missing = [entry for entry in files
                   if not _is_path_inside_dai_tree(entry, root)
                   or not (root / entry).exists()]
        capability_id = content.get("capability_id")
        try:
            identifier(capability_id) if capability_id else None
            capability_reachable = bool(capability_id) and bool(content.get("adopted_at"))
        except InvalidRequest:
            capability_reachable = False
        return {"ok": (not missing) and capability_reachable, "missing": missing}

    @classmethod
    def from_manifest(cls, path: str | Path,
                      store: MemoryStore | None = None,
                      actor: Principal | None = None,
                      scope: Scope | None = None) -> list[Any]:
        """Load a manifest and return validated proposal entries.

        When store, actor and scope are given, each entry is registered through
        the normal propose() path and the resulting records are returned.
        """
        path = Path(path)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise InvalidRequest("Manifest is not a readable JSON file") from exc
        if not isinstance(data, dict) or not isinstance(data.get("components"), list):
            raise InvalidRequest("Manifest must be an object with a components list")
        entries: list[dict[str, Any]] = []
        for index, entry in enumerate(data["components"]):
            if not isinstance(entry, dict):
                raise InvalidRequest(f"Component {index} in the manifest is not an object")
            component_id = entry.get("id")
            if not isinstance(component_id, str) or not component_id.strip():
                raise InvalidRequest(f"Component {index} requires a non-empty id")
            source_url = _validate_source_url(entry.get("source"))
            patterns = _validate_patterns(entry.get("patterns"))
            license_value = entry.get("license", "UNKNOWN")
            if not isinstance(license_value, str) or not license_value.strip():
                raise InvalidRequest(f"Component {component_id} requires a license")
            requirements = _require_strings(entry.get("requirements"), "requirements") \
                if entry.get("requirements") is not None else []
            abstraction = entry.get("abstraction")
            if abstraction is not None and (not isinstance(abstraction, str) or not abstraction.strip()):
                raise InvalidRequest(f"Component {component_id} has an invalid abstraction")
            notes = entry.get("notes", "")
            if not isinstance(notes, str):
                raise InvalidRequest(f"Component {component_id} has invalid notes")
            entries.append({
                "id": component_id.strip(),
                "source_url": source_url,
                "name": (entry.get("name") or component_id).strip(),
                "license": license_value.strip(),
                "commit": entry.get("last_activity").strip() if entry.get("last_activity") else None,
                "patterns": patterns,
                "requirements": requirements,
                "abstraction": abstraction.strip() if isinstance(abstraction, str) else None,
                "notes": notes.strip(),
                "decision": entry.get("decision"),
            })
        if store is None or actor is None or scope is None:
            return entries
        registry = cls(store)
        return [registry.propose(
            actor, scope,
            source_url=entry["source_url"], name=entry["name"],
            license=entry["license"], commit=entry["commit"],
            patterns=entry["patterns"], requirements=entry["requirements"],
            abstraction=entry["abstraction"], notes=entry["notes"],
        ) for entry in entries]
