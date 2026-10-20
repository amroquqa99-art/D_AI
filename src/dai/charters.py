"""Task/project founding contracts: discovery is separate from approval.

Drafts never silently acquire missing goals, budget authorizations or models.
Approval is version-fenced, scoped and idempotent; the active charter and its
receipt commit together in the project database.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re
from typing import Any

from .contracts import Principal, Record, Scope, identifier, json_bytes
from .errors import Conflict, IntegrityFailure, InvalidRequest, NotFound
from .memory import MemoryStore, utc_now


@dataclass(frozen=True)
class CharterApproval:
    id: str
    project: str
    draft_id: str
    draft_version: int
    charter_id: str
    charter_version: int
    approved_by: str
    approved_at: str


def _strings(value: Any, *, empty_allowed: bool = False) -> bool:
    return isinstance(value, list) and (empty_allowed or bool(value)) and all(
        isinstance(item, str) and bool(item.strip()) for item in value)


def gaps(content: dict[str, Any]) -> list[str]:
    """Return actionable missing/invalid field paths without choosing for owner."""
    missing: list[str] = []
    if not isinstance(content.get("objective"), str) or not content["objective"].strip():
        missing.append("objective")
    for name in ["deliverables", "acceptance", "stop_conditions", "allowed_models"]:
        if not _strings(content.get(name)):
            missing.append(name)
    if _strings(content.get("allowed_models")):
        if any(not re.fullmatch(r"[^\s/]+/[^\s]+", x) for x in content["allowed_models"]):
            missing.append("allowed_models: explicit provider/model identities required")
    for name in ["data_exceptions", "external_actions"]:
        if not _strings(content.get(name), empty_allowed=True):
            missing.append(name)
    if content.get("autonomy") not in ["plan_once", "per_stage", "manual"]:
        missing.append("autonomy")
    scope = content.get("scope", {})
    if not isinstance(scope, dict):
        missing.append("scope")
    else:
        if not _strings(scope.get("include")):
            missing.append("scope.include")
        if not _strings(scope.get("exclude"), empty_allowed=True):
            missing.append("scope.exclude")
    budgets = content.get("budgets", {})
    if not isinstance(budgets, dict):
        missing.append("budgets")
        budgets = {}
    for unit in ["money", "tokens", "time"]:
        policy = budgets.get(unit, {})
        if not isinstance(policy, dict) or policy.get("mode") not in ["limit", "owner_unbounded", "not_applicable"]:
            missing.append(f"budgets.{unit}.mode")
            continue
        if policy["mode"] != "limit":
            continue
        amount = policy.get("amount")
        if unit == "money":
            try:
                if not isinstance(amount, str) or not re.fullmatch(r"\d+(?:\.\d{1,8})?", amount):
                    raise InvalidOperation
                if not Decimal(amount).is_finite() or Decimal(amount) < 0:
                    raise InvalidOperation
            except InvalidOperation:
                missing.append("budgets.money.amount: nonnegative decimal string required")
            if not isinstance(policy.get("currency"), str) or not re.fullmatch(r"[A-Z]{3}", policy["currency"]):
                missing.append("budgets.money.currency")
        elif type(amount) is not int or amount < 0:
            missing.append(f"budgets.{unit}.amount")
    workflow = content.get("workflow", {})
    if not isinstance(workflow, dict):
        missing.append("workflow")
        return missing
    for name in ["method", "basis"]:
        if not isinstance(workflow.get(name), str) or not workflow[name].strip():
            missing.append("workflow." + name)
    if workflow.get("method_status") not in ["candidate", "verified"]:
        missing.append("workflow.method_status")
    if workflow.get("method_status") == "verified" and not _strings(workflow.get("method_evidence")):
        missing.append("workflow.method_evidence")
    steps = workflow.get("steps")
    if not isinstance(steps, list) or not steps:
        missing.append("workflow.steps")
        return missing
    by_id = {}
    for index, step in enumerate(steps):
        prefix = f"workflow.steps[{index}]"
        if not isinstance(step, dict):
            missing.append(prefix)
            continue
        try:
            sid = identifier(step.get("id"))
        except InvalidRequest:
            missing.append(prefix + ".id")
            continue
        if sid in by_id:
            missing.append(prefix + ".id: duplicate")
        by_id[sid] = step
        for name in ["objective", "responsibility", "failure_policy"]:
            if not isinstance(step.get(name), str) or not step[name].strip():
                missing.append(prefix + "." + name)
        for name in ["acceptance", "outputs"]:
            if not _strings(step.get(name)):
                missing.append(prefix + "." + name)
        for name in ["dependencies", "tools"]:
            if not _strings(step.get(name), empty_allowed=True):
                missing.append(prefix + "." + name)
    edges: dict[str, list[str]] = {}
    for sid, step in by_id.items():
        dependencies = step.get("dependencies")
        if not _strings(dependencies, empty_allowed=True):
            continue
        if any(dep not in by_id for dep in dependencies):
            missing.append(f"workflow.steps.{sid}.dependencies: unknown step")
        edges[sid] = dependencies
    visiting, visited = set(), set()

    def visit(sid: str) -> bool:
        if sid in visiting:
            return False
        if sid in visited:
            return True
        visiting.add(sid)
        for dep in edges.get(sid, []):
            if dep in by_id and not visit(dep):
                return False
        visiting.remove(sid)
        visited.add(sid)
        return True

    if any(not visit(sid) for sid in by_id):
        missing.append("workflow.steps: dependency cycle")
    return list(dict.fromkeys(missing))


class CharterService:
    def __init__(self, store: MemoryStore):
        self.store = store
        with store._locked(), store._db("project") as db:
            db.execute("CREATE TABLE IF NOT EXISTS component_versions(name TEXT PRIMARY KEY,version INTEGER NOT NULL)")
            row = db.execute("SELECT version FROM component_versions WHERE name='charters'").fetchone()
            if row and row[0] != 1:
                raise IntegrityFailure("Charter schema requires a supported migration")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS active_charters(
                    project TEXT PRIMARY KEY REFERENCES projects(id), record_id TEXT NOT NULL REFERENCES records(id));
                CREATE TABLE IF NOT EXISTS charter_approvals(
                    id TEXT PRIMARY KEY, project TEXT NOT NULL REFERENCES projects(id),
                    draft_id TEXT NOT NULL, draft_version INTEGER NOT NULL,
                    charter_id TEXT NOT NULL, charter_version INTEGER NOT NULL,
                    approved_by TEXT NOT NULL, approved_at TEXT NOT NULL,
                    UNIQUE(project,draft_id,draft_version));
                INSERT OR IGNORE INTO component_versions VALUES('charters',1);
            """)

    def propose(self, actor: Principal, scope: Scope, content: dict[str, Any]) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A charter belongs to a project")
        return self.store.create(actor, scope, "charter_draft", content)

    def assess(self, actor: Principal, scope: Scope, draft_id: str) -> dict[str, Any]:
        draft = self.store.get(actor, scope, draft_id)
        if draft.kind != "charter_draft":
            raise InvalidRequest("This record is not a charter draft")
        missing = gaps(draft.content)
        return {"draft_id": draft.id, "version": draft.version, "ready_for_approval": not missing,
                "missing": missing, "execution_authorized": False}

    def approve(self, actor: Principal, scope: Scope, draft_id: str, *, expected_version: int) -> CharterApproval:
        if scope.namespace != "project" or type(expected_version) is not int or expected_version < 1:
            raise InvalidRequest("A project and expected draft version are required")
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="charter")
            previous = db.execute("SELECT * FROM charter_approvals WHERE project=? AND draft_id=? AND draft_version=?",
                                  (scope.project, draft_id, expected_version)).fetchone()
            if previous:
                return CharterApproval(**dict(previous))
            row = self.store._row(db, scope, draft_id)
            draft = self.store._decode(row, scope)
            if draft.kind != "charter_draft" or draft.status != "ACTIVE":
                raise InvalidRequest("An active charter draft is required")
            if draft.version != expected_version:
                raise Conflict("Draft changed after the approval preview")
            missing = gaps(draft.content)
            if missing:
                raise InvalidRequest("Resolve charter fields before approval: " + ", ".join(missing))
            if draft.content["workflow"]["method_status"] == "verified":
                for ref in draft.content["workflow"]["method_evidence"]:
                    evidence = self.store._row(db, scope, ref)
                    self.store._decode(evidence, scope)
                    if evidence["kind"] != "evidence" or evidence["status"] != "ACTIVE":
                        raise InvalidRequest("Verified methodology requires active evidence records")
            pointer = db.execute("SELECT record_id FROM active_charters WHERE project=?", (scope.project,)).fetchone()
            if pointer:
                old = dict(self.store._row(db, scope, pointer[0]))
                self.store._decode(old, scope)
                old.update(version=old["version"] + 1, updated_at=utc_now())
                active = self.store._save(db, old, scope, draft.content, actor, "APPROVE_CHARTER")
            else:
                active = self.store._insert(db, actor, scope, "charter", draft.content)
                db.execute("INSERT INTO active_charters VALUES(?,?)", (scope.project, active.id))
            approval_id = hashlib.sha256(json_bytes([scope.key, draft_id, expected_version])).hexdigest()
            receipt = CharterApproval(approval_id, scope.project, draft_id, expected_version,
                                      active.id, active.version, actor.id, utc_now())
            db.execute("INSERT INTO charter_approvals VALUES(?,?,?,?,?,?,?,?)", tuple(receipt.__dict__.values()))
            return receipt

    def active(self, actor: Principal, scope: Scope) -> Record:
        self.store._authorize(actor, scope, "read")
        with self.store._locked(), self.store._db("project") as db:
            row = db.execute("SELECT record_id FROM active_charters WHERE project=?", (scope.project,)).fetchone()
            if not row:
                raise NotFound("Project has no approved charter; execution must wait")
            return self.store._decode(self.store._row(db, scope, row[0]), scope)
