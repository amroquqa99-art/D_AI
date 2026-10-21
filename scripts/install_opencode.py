#!/usr/bin/env python3
"""Link the D_AI OpenCode definitions into an OpenCode configuration directory.

The installer only links or copies files that D_AI owns. It never overwrites a
file it did not create: an existing definition is reported and left alone
unless --force is given. Every change is written to a manifest so the whole
installation can be rolled back with --rollback.

A link is preferred over a copy so the installation follows the source tree,
but a copy is used when the target cannot hold a link (a different filesystem,
or Windows without developer mode).
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
ADAPTER = ROOT / "adapters" / "opencode"

AGENT_SOURCE = ADAPTER / "agent"
SKILL_SOURCE = ADAPTER / "skill"
COMMAND_SOURCE = ADAPTER / "command"
MCP_SOURCE = ADAPTER / "mcp"

MCP_ENTRY = {
    "type": "local",
    "command": ["python", "-m", "dai_mcp"],
    "enabled": True,
    "environment": {"DAI_PROJECT_ROOT": str(ROOT)},
}


def link_or_copy(source: Path, target: Path, dry_run: bool, force: bool) -> str:
    """Return one of: created, replaced, skipped, would-create."""
    if target.exists() or target.is_symlink():
        if not force:
            return "skipped"
        if dry_run:
            return "would-replace"
        if target.is_symlink() or target.is_file():
            target.unlink()
        else:
            shutil.rmtree(target)
    if dry_run:
        return "would-create"
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.symlink(source, target)
    except OSError:
        if source.is_dir():
            shutil.copytree(source, target)
        else:
            shutil.copy2(source, target)
    return "created"


def build_plan(target_root: Path) -> list[tuple[Path, Path]]:
    """The (source, target) pairs this installation owns."""
    plan: list[tuple[Path, Path]] = []
    for source in sorted(AGENT_SOURCE.glob("**/*.md")):
        relative = source.relative_to(AGENT_SOURCE)
        plan.append((source, target_root / "agent" / relative))
    for source in sorted(SKILL_SOURCE.iterdir()):
        if source.is_dir():
            plan.append((source, target_root / "skill" / source.name))
    for source in sorted(COMMAND_SOURCE.glob("*.md")):
        plan.append((source, target_root / "command" / source.name))
    return plan


def install(target_root: Path, dry_run: bool, force: bool) -> dict:
    report: list[dict] = []
    for source, target in build_plan(target_root):
        action = link_or_copy(source, target, dry_run, force)
        report.append({"source": str(source.relative_to(ROOT)), "target": str(target),
                       "action": action})
    return {"target": str(target_root), "changes": report,
            "applied": not dry_run,
            "mcp": {"name": "dai", "source": str(MCP_SOURCE),
                    "entry": MCP_ENTRY, "installed": False}}


def rollback(manifest_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    removed: list[str] = []
    skipped: list[str] = []
    for entry in manifest.get("changes", []):
        target = Path(entry["target"])
        if entry.get("action") != "created":
            skipped.append(str(target))
            continue
        if target.is_symlink() or target.is_file():
            target.unlink()
            removed.append(str(target))
        elif target.is_dir():
            shutil.rmtree(target)
            removed.append(str(target))
    return {"removed": removed, "skipped": skipped,
            "note": "User data under the D_AI data root is never touched by a rollback."}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="install_opencode",
        description="Link the D_AI OpenCode definitions into an OpenCode configuration")
    parser.add_argument("--target", type=Path, default=Path.home() / ".config" / "opencode",
                        help="OpenCode configuration directory")
    parser.add_argument("--dry-run", action="store_true", help="Report without changing anything")
    parser.add_argument("--force", action="store_true",
                        help="Replace definitions that already exist")
    parser.add_argument("--rollback", type=Path,
                        help="Undo an installation from its manifest")
    args = parser.parse_args(argv)
    if args.rollback:
        print(json.dumps(rollback(args.rollback), ensure_ascii=False, indent=2))
        return 0
    report = install(args.target.resolve(), args.dry_run, args.force)
    if not args.dry_run:
        manifest = args.target.resolve() / "dai-install-manifest.json"
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8")
        report["manifest"] = str(manifest)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
