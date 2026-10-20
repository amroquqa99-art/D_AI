"""Shared identity, scope and memory contracts independent of a host/model."""

from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Any, Literal

from .errors import InvalidRequest

Namespace = Literal["person", "project", "global"]
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}\Z")


def identifier(value: str) -> str:
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise InvalidRequest("Invalid identifier")
    return value


def json_bytes(value: Any) -> bytes:
    try:
        data = json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True,
                          separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError, UnicodeError) as exc:
        raise InvalidRequest("A finite JSON value is required") from exc
    if len(data) > 4 * 1024 * 1024:
        raise InvalidRequest("Record exceeds 4 MiB; use an artifact reference")
    return data


@dataclass(frozen=True)
class Principal:
    """Identity assigned by a trusted local adapter, never by source/model text."""

    id: str

    def __post_init__(self) -> None:
        identifier(self.id)


@dataclass(frozen=True)
class Scope:
    namespace: Namespace
    owner: str
    project: str | None = None

    def __post_init__(self) -> None:
        if self.namespace not in ("person", "project", "global"):
            raise InvalidRequest("Unknown memory namespace")
        identifier(self.owner)
        if self.namespace == "project":
            if self.project is None:
                raise InvalidRequest("Project memory requires a project identity")
            identifier(self.project)
        elif self.project is not None:
            raise InvalidRequest("Only project memory accepts a project identity")

    @property
    def key(self) -> str:
        return f"{self.namespace}/{self.owner}/{self.project or '-'}"


@dataclass(frozen=True)
class Record:
    id: str
    scope: Scope
    kind: str
    status: str
    version: int
    created_by: str
    created_at: str
    updated_at: str
    content: dict[str, Any]


@dataclass(frozen=True)
class PurgeConfirmation:
    """Single-use confirmation tied to an actor, record, scope and version."""

    token: str
    record_id: str
    scope: Scope
    version: int
    expires_at: float
    recoverable_after_success: bool = False
