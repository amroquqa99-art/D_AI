#!/usr/bin/env python3
"""Link the D_AI OpenCode definitions into an OpenCode configuration directory.

The installer only touches files D_AI owns. An existing definition is reported
and left alone unless --force is given, and a forced replacement is backed up
first. Every change is written to a manifest that records WHAT was installed
and HOW, so --rollback can prove ownership before it removes anything: a file
the user edited after the installation is left in place and reported.

A link is preferred over a copy so the installation follows the source tree,
but a copy is used when the target cannot hold a link (a different filesystem,
or a host without symlink support).
"""

from __future__ import annotations

import argparse
import hashlib
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

BACKUP_SUFFIX = ".dai-backup"


def digest(path: Path) -> str | None:
    """The sha256 of a regular file, or None when it is not one."""
    try:
        if not path.is_file() or path.is_symlink():
            return None
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


def install_mcp(target_root: Path, dry_run: bool, force: bool = False) -> dict:
    """Register the D_AI MCP server in the host configuration.

    The command uses the interpreter that runs this installer, so a virtual
    environment is honoured and the server resolves the installed package.
    """
    config = target_root / "opencode.jsonc"
    entry = {
        "type": "local",
        "command": [sys.executable, "-m", "dai.mcp_server"],
        "enabled": True,
        "environment": {"DAI_PROJECT_ROOT": str(ROOT)},
    }
    if dry_run:
        return {"config": str(config), "entry": entry, "action": "would-write",
                "router": str(ADAPTER / "router"), "default_agent": "dai-os"}
    original_bytes = config.read_bytes() if config.is_file() else None
    document: dict = {}
    if config.is_file():
        text = config.read_text(encoding="utf-8")
        # A minimal JSONC reader: strip comments, then parse.
        import re
        stripped = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
        stripped = re.sub(r"^\s*//.*$", "", stripped, flags=re.M)
        stripped = re.sub(r",(\s*[}\]])", r"\1", stripped)
        try:
            document = json.loads(stripped)
        except ValueError as exc:
            raise ValueError(f"Cannot safely parse existing OpenCode config: {config}") from exc
    servers = document.setdefault("mcp", {})
    if not isinstance(servers, dict):
        servers = {}
        document["mcp"] = servers
    action = "updated" if "dai" in servers else "created"
    servers["dai"] = entry
    # The native router is an actual plugin directory, not just a set of files.
    plugins = document.setdefault("plugins", [])
    if not isinstance(plugins, list):
        raise ValueError("OpenCode plugins setting must be an array")
    router_path = str(ADAPTER / "router")
    if router_path not in plugins:
        plugins.append(router_path)
    # Keep a user-chosen primary unless --force explicitly replaces it.
    if force or not document.get("default_agent"):
        document["default_agent"] = "dai-os"
    # Preserve the literal original JSONC (including comments) for safe rollback.
    config.parent.mkdir(parents=True, exist_ok=True)
    backup_suffix = hashlib.sha256(original_bytes).hexdigest()[:12] if original_bytes is not None else "none"
    backup_path = config.with_name(config.name + ".dai-original-" + backup_suffix)
    if original_bytes is not None and not backup_path.exists():
        with backup_path.open("xb") as handle:
            handle.write(original_bytes)
        os.chmod(backup_path, 0o600)
    updated_bytes = (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    with config.open("wb") as handle:
        handle.write(updated_bytes)
    return {"config": str(config), "entry": entry, "action": action,
            "created": original_bytes is None,
            "backup_path": str(backup_path) if original_bytes is not None else None,
            "before_sha256": hashlib.sha256(original_bytes).hexdigest() if original_bytes is not None else None,
            "after_sha256": hashlib.sha256(updated_bytes).hexdigest()}


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


def link_or_copy(source: Path, target: Path, dry_run: bool, force: bool) -> dict:
    """Install one item and describe what happened."""
    if target.exists() or target.is_symlink():
        if not force:
            return {"action": "skipped", "reason": "an existing definition was left alone"}
        if dry_run:
            return {"action": "would-replace"}
        backup = target.with_name(target.name + BACKUP_SUFFIX)
        if backup.exists():
            if backup.is_dir():
                shutil.rmtree(backup)
            else:
                backup.unlink()
        if target.is_symlink():
            target.unlink()
        else:
            shutil.move(str(target), str(backup))
    if dry_run:
        return {"action": "would-create"}
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.symlink(source, target)
        mode = "link"
    except OSError:
        if source.is_dir():
            shutil.copytree(source, target)
        else:
            shutil.copy2(source, target)
        mode = "copy"
    return {"action": "created", "mode": mode,
            "sha256": digest(target) if mode == "copy" else None}


def install(target_root: Path, dry_run: bool, force: bool) -> dict:
    report: list[dict] = []
    for source, target in build_plan(target_root):
        outcome = link_or_copy(source, target, dry_run, force)
        report.append({"source": str(source.relative_to(ROOT)), "target": str(target), **outcome})
    mcp = install_mcp(target_root, dry_run, force)
    return {"target": str(target_root), "changes": report, "mcp": mcp,
            "applied": not dry_run}


def rollback(manifest_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    removed: list[str] = []
    kept: list[dict] = []
    for entry in manifest.get("changes", []):
        target = Path(entry["target"])
        if entry.get("action") != "created":
            kept.append({"target": str(target), "reason": "not created by this installation"})
            continue
        mode = entry.get("mode")
        recorded = entry.get("sha256")
        if mode == "link":
            # Ownership proof: the target must still be the link we created.
            source = entry.get("source")
            expected = ROOT / source if source else None
            if not (target.is_symlink() and expected is not None
                    and target.resolve() == expected.resolve()):
                kept.append({"target": str(target),
                             "reason": "the link was replaced by the user; it was kept"})
                continue
        elif mode == "copy" and recorded:
            current = digest(target)
            if current is not None and current != recorded:
                kept.append({"target": str(target),
                             "reason": "the file changed after the installation; it was kept"})
                continue
        if target.is_symlink() or target.is_file():
            target.unlink()
            removed.append(str(target))
        elif target.is_dir():
            shutil.rmtree(target)
            removed.append(str(target))
    # Restore host configuration only when it still matches our installed bytes.
    mcp = manifest.get("mcp", {})
    config_value = mcp.get("config")
    if config_value and mcp.get("after_sha256"):
        config = Path(config_value)
        current = digest(config)
        if current != mcp["after_sha256"]:
            kept.append({"target": str(config),
                         "reason": "config changed since install; keeping user changes"})
        elif mcp.get("backup_path") and Path(mcp["backup_path"]).is_file():
            backup = Path(mcp["backup_path"])
            if hashlib.sha256(backup.read_bytes()).hexdigest() != mcp.get("before_sha256"):
                kept.append({"target": str(config), "reason": "original config backup changed"})
            else:
                backup.replace(config)
                removed.append("D_AI changes restored from original: " + str(config))
        elif mcp.get("created"):
            config.unlink()
            removed.append(str(config))
    return {"removed": removed, "kept": kept,
            "note": "User data under the D_AI data root is never touched by a rollback."}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="install_opencode",
        description="Link the D_AI OpenCode definitions into an OpenCode configuration")
    parser.add_argument("--target", type=Path, default=Path.home() / ".config" / "opencode",
                        help="OpenCode configuration directory")
    parser.add_argument("--dry-run", action="store_true", help="Report without changing anything")
    parser.add_argument("--force", action="store_true",
                        help="Replace definitions that already exist (the old one is backed up)")
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
