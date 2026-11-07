"""Encrypted mission/evidence journal backed by the scoped D_AI MemoryStore.

No independent plaintext evidence database, no model calls and no implicit
cross-project authority. Native MCP bridge resolves the caller identity.
"""
from __future__ import annotations

from hashlib import sha256
from typing import Any

from .contracts import Principal, json_bytes
from .errors import InvalidRequest, NotFound
from .memory import MemoryStore

SYSTEMS = frozenset(("research", "innovation", "teacher", "investor",
                     "assistant", "investigation", "cyber", "strategy", "advisors", "engineer"))
CLAIM_TYPES = frozenset(("FACT", "STATEMENT", "ANALYSIS", "INFERENCE", "HYPOTHESIS", "UNKNOWN"))
STATES = frozenset(("PLANNED", "RUNNING", "VERIFYING", "REVIEW", "COMPLETED",
                    "PAUSED", "FAILED", "CANCELLED", "WAITING_FOR_HUMAN",
                    "WAITING_FOR_DATA", "WAITING_FOR_SCHEDULE", "WAITING_FOR_RESOURCES"))


def _text(value: str, name: str, size: int = 12000) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > size:
        raise InvalidRequest(f"{name} must be nonempty and at most {size} characters")
    return value.strip()


def _strings(values: list[str], name: str) -> list[str]:
    if not isinstance(values, list) or not values or len(values) > 100:
        raise InvalidRequest(f"{name} needs 1-100 entries")
    return [_text(value, name) for value in values]


class MissionService:
    def __init__(self, store: MemoryStore):
        self.store = store

    def _scope(self, actor: Principal, project_id: str):
        return self.store.project_scope(actor, project_id)

    def _mission(self, actor: Principal, project_id: str, mission_id: str):
        scope = self._scope(actor, project_id)
        record = self.store.get(actor, scope, mission_id)
        if record.kind != "mission":
            raise NotFound("Record is not a mission")
        return scope, record

    def create(self, actor: Principal, project_id: str, *, system: str,
               objective: str, acceptance: list[str]) -> dict[str, Any]:
        if system not in SYSTEMS:
            raise InvalidRequest("Unknown D_AI specialist system")
        content = {
            "system": system,
            "objective": _text(objective, "objective"),
            "acceptance": _strings(acceptance, "acceptance"),
            "status": "PLANNED",
            "next_action": "inspect",
            "artifacts": [], "receipts": [], "review": None,
        }
        record = self.store.create(actor, self._scope(actor, project_id), "mission", content)
        return {"mission_id": record.id, "project_id": project_id,
                "version": record.version, **record.content}

    def get(self, actor: Principal, project_id: str, mission_id: str) -> dict[str, Any]:
        scope, record = self._mission(actor, project_id, mission_id)
        evidence = [r for r in self.store.list(actor, scope, kind="evidence", limit=200)
                    if r.content.get("mission_id") == mission_id]
        claims = [r for r in self.store.list(actor, scope, kind="claim", limit=200)
                  if r.content.get("mission_id") == mission_id]
        return {"mission_id": record.id, "project_id": project_id, "version": record.version,
                **record.content,
                "evidence_count_in_first_200": len(evidence),
                "claims_count_in_first_200": len(claims)}

    def checkpoint(self, actor: Principal, project_id: str, mission_id: str, *,
                   expected_version: int, status: str, next_action: str,
                   artifacts: list[str] | None = None, receipts: list[str] | None = None,
                   review: str | None = None) -> dict[str, Any]:
        scope, record = self._mission(actor, project_id, mission_id)
        if status not in STATES:
            raise InvalidRequest("Unknown mission status")
        content = dict(record.content)
        content["next_action"] = _text(next_action, "next_action")
        if artifacts is not None:
            content["artifacts"] = _strings(artifacts, "artifacts")
        if receipts is not None:
            content["receipts"] = _strings(receipts, "receipts")
        if review is not None:
            content["review"] = _text(review, "review")
        if status == "COMPLETED" and not (content["artifacts"] and content["receipts"]
                                          and content["review"]):
            raise InvalidRequest("Completion requires artifacts, receipts and independent review")
        content["status"] = status
        updated = self.store.update(actor, scope, mission_id, content,
                                    expected_version=expected_version)
        return {"mission_id": updated.id, "version": updated.version, **updated.content}

    def evidence_add(self, actor: Principal, project_id: str, mission_id: str, *,
                     title: str, locator: str, content: str,
                     source_kind: str = "provided_text") -> dict[str, Any]:
        scope, _ = self._mission(actor, project_id, mission_id)
        original = _text(content, "content", 2000000)
        data = {"mission_id": mission_id, "title": _text(title, "title", 500),
                "locator": _text(locator, "locator", 4000),
                "source_kind": _text(source_kind, "source_kind", 128),
                "content": original, "sha256": sha256(original.encode("utf-8")).hexdigest()}
        json_bytes(data)
        saved = self.store.create(actor, scope, "evidence", data)
        return {"source_id": saved.id, "mission_id": mission_id,
                "sha256": data["sha256"], "version": saved.version}

    def claim_add(self, actor: Principal, project_id: str, mission_id: str, *,
                  text: str, claim_type: str, source_ids: list[str] | None = None,
                  limitations: str = "") -> dict[str, Any]:
        scope, _ = self._mission(actor, project_id, mission_id)
        if claim_type not in CLAIM_TYPES:
            raise InvalidRequest("Unknown claim type")
        ids = source_ids or []
        if not isinstance(ids, list) or len(ids) > 100:
            raise InvalidRequest("source_ids must be a bounded list")
        if claim_type in {"FACT", "STATEMENT"} and not ids:
            raise InvalidRequest("A FACT or STATEMENT requires source evidence")
        for source_id in ids:
            src = self.store.get(actor, scope, source_id)
            if src.kind != "evidence" or src.content.get("mission_id") != mission_id:
                raise InvalidRequest("Evidence must belong to the same mission")
        payload = {"mission_id": mission_id, "text": _text(text, "text"),
                   "type": claim_type, "source_ids": ids,
                   "limitations": limitations, "semantic_verification": "NOT_REVIEWED"}
        saved = self.store.create(actor, scope, "claim", payload)
        return {"claim_id": saved.id, "mission_id": mission_id,
                "type": claim_type, "version": saved.version}
