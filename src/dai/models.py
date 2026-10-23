"""Model registry, routing and metering for one project.

Invariant: registered models are records of kind "model"; unknown cost is
never free and is never routed to ahead of a known-cost model; only
available or limited models may be routed to automatically; metering appends
to an append-only ledger and usage splits actual, estimated and unknown cash
cost, never merging subscription limits with cash cost.
"""

from __future__ import annotations

import hashlib
import re
import sqlite3
from decimal import Decimal, InvalidOperation
from typing import Any

from .contracts import Principal, Record, Scope, identifier, json_bytes
from .errors import AccessDenied, Conflict, IntegrityFailure, InvalidRequest, NotFound
from .memory import MemoryStore, utc_now

COST_BASES = ("measured", "estimated", "unknown")
AVAILABILITY = ("available", "limited", "unavailable", "unknown")

# A model identity is either a plain bounded name or provider/model, optionally
# with a variant suffix. It is not a generic record identifier: the provider
# separator is part of the name when it is present.
MODEL_ID = re.compile(
    r"[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*"
    r"(?:#[A-Za-z0-9][A-Za-z0-9._-]*)?)?\Z")


def _model_id(value: str) -> str:
    if not isinstance(value, str) or not MODEL_ID.fullmatch(value):
        raise InvalidRequest(
            "A model id must be a bounded name or provider/model, optionally with #variant")
    return value
AUTO_AVAILABILITY = ("available", "limited")


def _require_strings(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or not all(
            isinstance(item, str) and item.strip() for item in value):
        raise InvalidRequest(f"{field} must be a list of non-empty strings")
    return list(value)


def _cost_text(value: str | None, field: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise InvalidRequest(f"{field} must be a decimal string amount")
    try:
        amount = Decimal(value)
    except InvalidOperation as exc:
        raise InvalidRequest(f"{field} must be a decimal string amount") from exc
    if not amount.is_finite() or amount < 0:
        raise InvalidRequest(f"{field} must be a non-negative finite decimal string amount")
    return value.strip()


def _cost_amount(value: str | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def _empty_ledger_bucket() -> dict[str, Any]:
    return {"records": 0, "records_with_incomplete_tokens": 0,
            "input_tokens": 0, "output_tokens": 0,
            "cache_tokens": 0, "cost_sum": None}


class ModelRegistry:
    def __init__(self, store: MemoryStore) -> None:
        self.store = store
        with store._locked(), store._db("project") as db:
            db.execute("CREATE TABLE IF NOT EXISTS component_versions(name TEXT PRIMARY KEY, version INTEGER NOT NULL)")
            row = db.execute("SELECT version FROM component_versions WHERE name='models'").fetchone()
            if row and row[0] != 1:
                raise IntegrityFailure("Model schema requires a supported migration")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS model_index(
                    project TEXT NOT NULL, model_id TEXT NOT NULL, record_id TEXT NOT NULL,
                    cost_basis TEXT NOT NULL, availability TEXT NOT NULL, version INTEGER NOT NULL,
                    PRIMARY KEY(project, model_id));
                CREATE TABLE IF NOT EXISTS model_roles(
                    project TEXT NOT NULL, model_id TEXT NOT NULL, role TEXT NOT NULL,
                    task_class TEXT NOT NULL, record_id TEXT NOT NULL,
                    PRIMARY KEY(project, model_id, role));
                CREATE TABLE IF NOT EXISTS model_idempotency(
                    project TEXT NOT NULL, key TEXT NOT NULL, payload_hash TEXT NOT NULL,
                    target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
                    PRIMARY KEY(project, key));
                CREATE TABLE IF NOT EXISTS usage_ledger(
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    project TEXT NOT NULL, model_id TEXT NOT NULL, task_class TEXT NOT NULL,
                    input_tokens INTEGER, output_tokens INTEGER, cache_tokens INTEGER,
                    cost TEXT, cost_basis TEXT NOT NULL, latency_ms INTEGER, status TEXT NOT NULL,
                    created_at TEXT NOT NULL);
            """)
            db.execute("INSERT OR IGNORE INTO component_versions VALUES('models', 1)")

    def _model_record(self, actor: Principal, scope: Scope, model_id: str) -> Record | None:
        with self.store._locked(), self.store._db("project") as db:
            row = db.execute(
                "SELECT record_id FROM model_index WHERE project=? AND model_id=?",
                (scope.project, model_id)).fetchone()
        if row is None:
            return None
        return self.store.get(actor, scope, row["record_id"])

    def _candidate(self, record: Record) -> dict[str, Any]:
        content = record.content
        cost_input = _cost_amount(content.get("cost_input_per_1k"))
        known = content.get("cost_basis") in ("measured", "estimated") and cost_input is not None
        return {
            "model_id": content["model_id"],
            "availability": content["availability"],
            "cost_basis": content["cost_basis"],
            "cost_input_per_1k": content.get("cost_input_per_1k"),
            "cost_output_per_1k": content.get("cost_output_per_1k"),
            "cost_currency": content.get("cost_currency"),
            "cost_known": known,
            "cost_input": cost_input,
        }

    @staticmethod
    def _public(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [{key: value for key, value in candidate.items() if key != "cost_input"}
                for candidate in candidates]

    def register(self, actor: Principal, scope: Scope, *, model_id: str,
                 provider: str, capabilities: list[str],
                 context_window: int | None = None,
                 cost_input_per_1k: str | None = None,
                 cost_output_per_1k: str | None = None,
                 cost_currency: str | None = None,
                 cost_basis: str = "unknown",
                 tool_support: list[str] | None = None,
                 availability: str = "unknown",
                 notes: str = "") -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A model belongs to a project")
        _model_id(model_id)
        identifier(provider)
        capabilities = _require_strings(capabilities, "capabilities")
        if context_window is not None and (type(context_window) is not int or context_window < 1):
            raise InvalidRequest("A positive context window is required")
        cost_input = _cost_text(cost_input_per_1k, "cost_input_per_1k")
        cost_output = _cost_text(cost_output_per_1k, "cost_output_per_1k")
        if cost_currency is not None and (not isinstance(cost_currency, str) or not cost_currency.strip()):
            raise InvalidRequest("A bounded cost currency is required")
        if cost_basis not in COST_BASES:
            raise InvalidRequest("cost_basis must be one of measured, estimated, unknown")
        tool_support = _require_strings(tool_support, "tool_support") if tool_support is not None else []
        if availability not in AVAILABILITY:
            raise InvalidRequest("availability must be one of available, limited, unavailable, unknown")
        if not isinstance(notes, str):
            raise InvalidRequest("Notes must be a string")
        content = {
            "model_id": model_id, "provider": provider.strip(),
            "capabilities": capabilities, "context_window": context_window,
            "cost_input_per_1k": cost_input, "cost_output_per_1k": cost_output,
            "cost_currency": cost_currency.strip() if cost_currency else None,
            "cost_basis": cost_basis, "tool_support": tool_support,
            "availability": availability, "notes": notes.strip(),
        }
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="model")
            if db.execute(
                    "SELECT 1 FROM model_index WHERE project=? AND model_id=?",
                    (scope.project, model_id)).fetchone() is not None:
                raise Conflict(f"Model {model_id} is already registered in this scope")
            record = self.store._insert(db, actor, scope, "model", content)
            db.execute("INSERT INTO model_index VALUES(?,?,?,?,?,?)",
                       (scope.project, model_id, record.id, cost_basis, availability,
                        record.version))
            return record

    def catalog(self, actor: Principal, scope: Scope) -> list[dict]:
        if scope.namespace != "project":
            raise InvalidRequest("A model catalog belongs to a project")
        records = self.store.list(actor, scope, kind="model")
        result: list[dict[str, Any]] = []
        for record in records:
            content = record.content
            result.append({
                "model_id": content["model_id"], "provider": content["provider"],
                "capabilities": content["capabilities"],
                "context_window": content["context_window"],
                "cost_input_per_1k": content["cost_input_per_1k"],
                "cost_output_per_1k": content["cost_output_per_1k"],
                "cost_currency": content["cost_currency"],
                "cost_basis": content["cost_basis"],
                "tool_support": content["tool_support"],
                "availability": content["availability"],
                "notes": content["notes"],
                "version": record.version,
            })
        return result

    def get(self, actor: Principal, scope: Scope, model_id: str) -> Record:
        _model_id(model_id)
        record = self._model_record(actor, scope, model_id)
        if record is None:
            raise NotFound(f"Model {model_id} is not registered in this scope")
        return record

    def route(self, actor: Principal, scope: Scope, *, task_class: str,
              required_capabilities: list[str] | None = None,
              max_cost_per_1k: str | None = None,
              free_only: bool = False) -> dict:
        if scope.namespace != "project":
            raise InvalidRequest("A model route belongs to a project")
        if type(free_only) is not bool:
            raise InvalidRequest("free_only must be a boolean")
        if not isinstance(task_class, str) or not task_class.strip():
            raise InvalidRequest("A bounded task class is required")
        required_capabilities = (_require_strings(required_capabilities, "required_capabilities")
                                 if required_capabilities is not None else [])
        cost_limit_text = _cost_text(max_cost_per_1k, "max_cost_per_1k") \
            if max_cost_per_1k is not None else None
        cost_limit = Decimal(cost_limit_text) if cost_limit_text is not None else None
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "read")
            rows = db.execute(
                "SELECT model_id, record_id FROM model_index WHERE project=? ORDER BY model_id",
                (scope.project,)).fetchall()
            eligible: list[dict[str, Any]] = []
            excluded: list[dict[str, Any]] = []
            for row in rows:
                record = self.store.get(actor, scope, row["record_id"])
                content = record.content
                if content["availability"] not in AUTO_AVAILABILITY:
                    excluded.append(self._candidate(record))
                    continue
                capabilities = set(content.get("capabilities") or [])
                if required_capabilities and not set(required_capabilities) <= capabilities:
                    continue
                candidate = self._candidate(record)
                if free_only:
                    # Fail closed: zero input *alone* is not free when output is
                    # charged. Estimates, unknown output and non-OpenCode
                    # providers are never auto-selected for a free-only task.
                    input_cost = _cost_amount(content.get("cost_input_per_1k"))
                    output_cost = _cost_amount(content.get("cost_output_per_1k"))
                    if not (content.get("provider") in ("opencode", "opencode-go")
                            and content.get("cost_basis") == "measured"
                            and input_cost == Decimal("0")
                            and output_cost == Decimal("0")):
                        continue
                eligible.append(candidate)
            eligible.sort(
                key=lambda candidate: (not candidate["cost_known"],
                                       candidate["cost_input"]
                                       if candidate["cost_input"] is not None else Decimal("inf")))
            unknown_cost_candidates = [c for c in eligible if not c["cost_known"]]
            known = [c for c in eligible if c["cost_known"]]
            if cost_limit is not None:
                known = [c for c in known
                         if c["cost_input"] is not None and c["cost_input"] <= cost_limit]
            if known:
                pick = min(known, key=lambda candidate: candidate["cost_input"])
                currency = pick["cost_currency"] or ""
                return {
                    "model": pick["model_id"],
                    "reason": (f"Routed to {pick['model_id']}: cheapest eligible model with "
                               f"known cost ({pick['cost_basis']} {currency} per 1k input)"),
                    "candidates": self._public(eligible),
                    "needs_decision": False,
                    "unknown_cost_candidates": self._public(unknown_cost_candidates),
                }
            if eligible:
                return {
                    "model": None,
                    "reason": ("Every eligible model has unknown cost; no automatic routing; "
                               "owner decision required"),
                    "candidates": self._public(eligible),
                    "needs_decision": True,
                    "unknown_cost_candidates": self._public(unknown_cost_candidates),
                }
            return {
                "model": None,
                "reason": ("No verified zero-input/zero-output OpenCode model is eligible; "
                           "free-only routing refuses paid or unknown-cost fallback"
                           if free_only else
                           f"No model is available or limited in this scope; "
                           f"{len(excluded)} registered model(s) need an owner decision"),
                "candidates": self._public(excluded),
                "needs_decision": True,
                "unknown_cost_candidates": [],
            }

    def choose(self, actor: Principal, scope: Scope, *, model_id: str,
               role: str, reason: str, task_class: str,
               idempotency_key: str | None = None) -> Record:
        if scope.namespace != "project":
            raise InvalidRequest("A model choice belongs to a project")
        _model_id(model_id)
        identifier(role)
        if not isinstance(reason, str) or not reason.strip():
            raise InvalidRequest("A bounded reason is required")
        identifier(task_class)
        if idempotency_key is not None:
            identifier(idempotency_key)
        payload_hash = hashlib.sha256(
            json_bytes([model_id, role, reason.strip(), task_class])).hexdigest()
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="model")
            row = db.execute(
                "SELECT record_id FROM model_index WHERE project=? AND model_id=?",
                (scope.project, model_id)).fetchone()
            if row is None:
                raise NotFound(f"Model {model_id} is not registered in this scope")
            if idempotency_key is not None:
                existing = db.execute(
                    "SELECT * FROM model_idempotency WHERE project=? AND key=?",
                    (scope.project, idempotency_key)).fetchone()
                if existing is not None:
                    if existing["payload_hash"] == payload_hash:
                        bound = db.execute(
                            "SELECT record_id FROM model_roles WHERE project=? AND model_id=? AND role=?",
                            (scope.project, model_id, role)).fetchone()
                        if bound is not None:
                            return self.store.get(actor, scope, bound["record_id"])
                    raise Conflict("Idempotency key was reused with a different model assignment payload")
            already = db.execute(
                "SELECT record_id FROM model_roles WHERE project=? AND model_id=? AND role=?",
                (scope.project, model_id, role)).fetchone()
            if already is not None:
                bound = self.store.get(actor, scope, already["record_id"])
                if (bound.content.get("reason") != reason.strip()
                        or bound.content.get("task_class") != task_class):
                    raise Conflict(
                        f"Model {model_id} is already bound to role {role} in this scope "
                        "with a different reason; a binding is never silently replaced")
                return bound
            # The reason is private text: it lives in the encrypted record, not
            # in a plain column.
            binding = {"model_id": model_id, "role": role, "reason": reason.strip(),
                       "task_class": task_class, "chosen_at": utc_now(),
                       "chosen_by": actor.id}
            bound = self.store._insert(db, actor, scope, "model_binding", binding)
            db.execute("INSERT INTO model_roles VALUES(?,?,?,?,?)",
                       (scope.project, model_id, role, task_class, bound.id))
            if idempotency_key is not None:
                db.execute("INSERT INTO model_idempotency VALUES(?,?,?,?,?)",
                           (scope.project, idempotency_key, payload_hash, "model_role",
                            model_id + "\u2029" + role))
            return bound

    def meter(self, actor: Principal, scope: Scope, *, model_id: str,
              task_class: str, input_tokens: int | None = None,
              output_tokens: int | None = None, cache_tokens: int | None = None,
              cost: str | None = None, cost_basis: str = "unknown",
              latency_ms: int | None = None, status: str = "ok",
              idempotency_key: str | None = None) -> dict[str, Any]:
        if scope.namespace != "project":
            raise InvalidRequest("Metering belongs to a project")
        _model_id(model_id)
        if not isinstance(task_class, str) or not task_class.strip():
            raise InvalidRequest("A bounded task class is required")
        if cost_basis not in COST_BASES:
            raise InvalidRequest("cost_basis must be one of measured, estimated, unknown")
        for name, value in (("input_tokens", input_tokens), ("output_tokens", output_tokens),
                            ("cache_tokens", cache_tokens), ("latency_ms", latency_ms)):
            if value is not None and (type(value) is not int or value < 0):
                raise InvalidRequest(f"{name} must be a non-negative integer")
        cost_text = _cost_text(cost, "cost") if cost is not None else None
        if not isinstance(status, str) or not status.strip():
            raise InvalidRequest("A bounded status is required")
        if idempotency_key is not None:
            identifier(idempotency_key)
        payload_hash = hashlib.sha256(json_bytes([
            model_id, task_class, input_tokens, output_tokens, cache_tokens,
            cost_text, cost_basis, latency_ms, status])).hexdigest()
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "write", kind="model")
            row = db.execute(
                "SELECT record_id FROM model_index WHERE project=? AND model_id=?",
                (scope.project, model_id)).fetchone()
            if row is None:
                raise NotFound(f"Model {model_id} is not registered in this scope")
            if idempotency_key is not None:
                existing = db.execute(
                    "SELECT * FROM model_idempotency WHERE project=? AND key=?",
                    (scope.project, idempotency_key)).fetchone()
                if existing is not None:
                    if existing["payload_hash"] != payload_hash:
                        raise Conflict("Idempotency key was reused with a different usage payload")
                    return self._usage_receipt(db, scope, existing["target_id"])
            db.execute(
                "INSERT INTO usage_ledger(project, model_id, task_class, input_tokens, "
                "output_tokens, cache_tokens, cost, cost_basis, latency_ms, status, created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (scope.project, model_id, task_class, input_tokens, output_tokens,
                 cache_tokens, cost_text, cost_basis, latency_ms, status, utc_now()))
            seq = db.execute("SELECT last_insert_rowid()").fetchone()[0]
            if idempotency_key is not None:
                db.execute("INSERT INTO model_idempotency VALUES(?,?,?,?,?)",
                           (scope.project, idempotency_key, payload_hash, "usage", str(seq)))
            return self._usage_receipt(db, scope, seq)

    @staticmethod
    def _usage_receipt(db: sqlite3.Connection, scope: Scope, seq: int) -> dict[str, Any]:
        row = db.execute("SELECT * FROM usage_ledger WHERE project=? AND seq=?",
                         (scope.project, seq)).fetchone()
        if row is None:
            raise NotFound("Usage ledger row not found")
        return {
            "seq": row["seq"], "model_id": row["model_id"], "task_class": row["task_class"],
            "cost_basis": row["cost_basis"], "input_tokens": row["input_tokens"],
            "output_tokens": row["output_tokens"], "cache_tokens": row["cache_tokens"],
            "cost": row["cost"], "latency_ms": row["latency_ms"], "status": row["status"],
        }

    def usage(self, actor: Principal, scope: Scope) -> dict:
        if scope.namespace != "project":
            raise InvalidRequest("Usage belongs to a project")
        with self.store._locked(), self.store._db("project") as db:
            self.store._authorize(actor, scope, "read")
            rows = db.execute(
                "SELECT * FROM usage_ledger WHERE project=? ORDER BY seq",
                (scope.project,)).fetchall()
        buckets: dict[str, dict[str, Any]] = {
            "actual": _empty_ledger_bucket(),
            "estimated": _empty_ledger_bucket(),
            "unknown": _empty_ledger_bucket(),
        }
        for row in rows:
            basis = row["cost_basis"]
            # A record with an incomplete token profile has no trustworthy cost
            # total, so it belongs to the unknown bucket: its known tokens are
            # still reported there, but they never enter an actual or estimated
            # total and an unknown cost is never shown as zero.
            if (basis == "unknown" or row["input_tokens"] is None
                    or row["output_tokens"] is None or row["cache_tokens"] is None):
                bucket = "unknown"
            elif basis == "measured":
                bucket = "actual"
            else:
                bucket = "estimated"
            b = buckets[bucket]
            b["records"] += 1
            if (row["input_tokens"] is None or row["output_tokens"] is None
                    or row["cache_tokens"] is None):
                b["records_with_incomplete_tokens"] += 1
            if row["input_tokens"] is not None:
                b["input_tokens"] += row["input_tokens"]
            if row["output_tokens"] is not None:
                b["output_tokens"] += row["output_tokens"]
            if row["cache_tokens"] is not None:
                b["cache_tokens"] += row["cache_tokens"]
            if row["cost"] is not None:
                amount = Decimal(row["cost"])
                b["cost_sum"] = amount if b["cost_sum"] is None else b["cost_sum"] + amount
        result: dict[str, dict[str, Any]] = {}
        for name, b in buckets.items():
            result[name] = {
                "records": b["records"],
                "records_with_incomplete_tokens": b["records_with_incomplete_tokens"],
                "input_tokens": b["input_tokens"],
                "output_tokens": b["output_tokens"],
                "cache_tokens": b["cache_tokens"],
                "cost": str(b["cost_sum"]) if b["cost_sum"] is not None else None,
            }
        return {"actual": result["actual"], "estimated": result["estimated"],
                "unknown": result["unknown"]}
