"""Local operator interface. Host/model tools use separately authenticated APIs.

Destructive purge and workspace restore require a live local confirmation;
normal natural-language forgetting is the distinct reversible archive action.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
import getpass
import json
import os
from pathlib import Path
import sys

from . import __version__
from .contracts import Principal, Scope
from .errors import DaiError, InvalidRequest
from .memory import MemoryStore


def local_principal() -> Principal:
    value = f"uid-{os.getuid()}" if hasattr(os, "getuid") else "local-" + getpass.getuser()
    return Principal(value)


def confirm(prompt: str, expected: str) -> None:
    if not sys.stdin.isatty():
        raise InvalidRequest("This operation requires interactive local confirmation")
    print(prompt, file=sys.stderr)
    if input(f"Type {expected!r} to confirm: ") != expected:
        raise InvalidRequest("Operation cancelled; confirmation did not match")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="dai", description="D_AI local project and memory operator")
    root.add_argument("--data-root", type=Path, default=Path.home() / ".d-ai")
    root.add_argument("--version", action="version", version=__version__)
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("init")
    commands.add_parser("status")
    project = commands.add_parser("project").add_subparsers(dest="action", required=True)
    project.add_parser("list")
    create = project.add_parser("create")
    create.add_argument("name")
    create.add_argument("--id")
    memory = commands.add_parser("memory")
    memory.add_argument("--project")
    memory.add_argument("--scope", choices=["person", "project", "global"], default="project")
    actions = memory.add_subparsers(dest="action", required=True)
    create = actions.add_parser("create")
    create.add_argument("--kind", default="note")
    content = create.add_mutually_exclusive_group(required=True)
    content.add_argument("--json")
    content.add_argument("--file", type=Path)
    actions.add_parser("list")
    search = actions.add_parser("search")
    search.add_argument("query")
    for operation in ["get", "archive", "restore", "history", "purge"]:
        action = actions.add_parser(operation)
        action.add_argument("id")
        if operation in ["archive", "restore", "purge"]:
            action.add_argument("--version", type=int, required=True)
    backup = commands.add_parser("backup").add_subparsers(dest="action", required=True)
    for operation in ["create", "restore"]:
        action = backup.add_parser(operation)
        action.add_argument("path", type=Path)
    return root


def dispatch(args: argparse.Namespace):
    actor = local_principal()
    store = MemoryStore(args.data_root, administrator=actor.id)
    if args.command in ("init", "status"):
        return {"version": __version__, "data_root": str(store.root), "principal": actor.id,
                "projects": len(store.projects(actor)), "release_status": "NOT_READY",
                "note": "Full host/domain acceptance remains in progress; memory checks do not prove D_AI 1.0 complete."}
    if args.command == "project":
        return ([asdict(p) for p in store.projects(actor)] if args.action == "list" else
                asdict(store.create_project(actor, args.name, project_id=args.id)))
    if args.command == "backup":
        if args.action == "create":
            return {"snapshot": str(store.snapshot(actor, args.path)), "contains_keys": False,
                    "restore_requires": "the same live installation key authority"}
        confirm("Restore replaces the three live database states. Permanently purged keys are not restored.", "RESTORE")
        store.restore_snapshot(actor, args.path)
        return {"restored": True}
    scope = (store.project_scope(actor, args.project) if args.project else
             Scope(args.scope, actor.id) if args.scope != "project" else None)
    if scope is None:
        raise InvalidRequest("Project memory requires --project; use --scope person or global explicitly")
    if args.action == "create":
        try:
            content = json.loads(args.json if args.json is not None else args.file.read_text())
        except (OSError, ValueError) as exc:
            raise InvalidRequest("Could not read a JSON content object") from exc
        return asdict(store.create(actor, scope, args.kind, content))
    if args.action == "list":
        return [asdict(r) for r in store.list(actor, scope)]
    if args.action == "search":
        return [asdict(r) for r in store.search(actor, scope, args.query)]
    if args.action == "history":
        return [asdict(r) for r in store.history(actor, scope, args.id)]
    if args.action == "get":
        return asdict(store.get(actor, scope, args.id))
    if args.action == "archive":
        return asdict(store.archive(actor, scope, args.id, expected_version=args.version))
    if args.action == "restore":
        return asdict(store.restore_record(actor, scope, args.id, expected_version=args.version))
    preview = store.request_purge(actor, scope, args.id, expected_version=args.version)
    confirm(f"Permanently erase {scope.key}/{args.id} version {args.version}, its revisions and managed recall. "
            "Old database snapshots cannot recover its key. Manually exported keys/data or provider copies "
            "are outside this operation. It cannot be undone through D_AI.", f"DELETE {args.id}")
    store.confirm_purge(actor, preview)
    return {"id": args.id, "purged": True, "recoverable": False}


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        result = dispatch(args)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except DaiError as exc:
        print(json.dumps({"error": type(exc).__name__, "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
