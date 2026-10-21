#!/usr/bin/env python3
"""Verify a D_AI installation and print one JSON report.

The check is about what can be PROVEN from the machine: the tree layout, the
permissions of the private data directory, the absence of secrets in the
release tree, and that every core module imports. It never claims that a
domain was professionally validated, and it never contacts a network.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import stat
import sys

ROOT = Path(__file__).resolve().parents[1]
CORE_MODULES = ("contracts", "errors", "vault", "memory", "charters", "tasks",
                "decisions", "teams", "models", "tools", "components", "updates", "cli")
REQUIRED_FILES = ("README.md", "README.en.md", "INSTALL.md", "CONTRIBUTING.md",
                  "SECURITY.md", "THIRD_PARTY.md", "LICENSE", "GLOSSARY.md",
                  "pyproject.toml")
SECRET_PATTERNS = (".env", ".key", ".pem", "id_rsa", "credentials")
# Content patterns that must never appear in the release tree. The credential
# shapes are precise so that an ordinary word ending in "-sk" is not a finding.
_HOME = "/" + "home/"
_MEDIA = "/" + "run/" + "media/"
_RSA = "BEGIN RSA " + "PRIVATE KEY"
_SSH = "BEGIN OPENSSH " + "PRIVATE KEY"
LEAK_PATTERNS = (_HOME, _MEDIA, _RSA, _SSH)
LEAK_REGEX = (r"\bsk-[A-Za-z0-9]{20,}", r"\bghp_[A-Za-z0-9]{30,}", r"\bAKIA[0-9A-Z]{16}",
              r"\bxox[baprs]-[A-Za-z0-9-]{10,}", r"\bAIza[0-9A-Za-z_-]{30,}")
SKIPPED_DIRS = {".git", "__pycache__", "node_modules", ".venv",
                # Local state, never part of the release: comparison run
                # artefacts, sandboxes, runtime state and backups.
                "runs", ".sandboxes", "runtime", "data", "backups"}


def check_tree() -> list[dict]:
    findings = []
    for name in REQUIRED_FILES:
        if not (ROOT / name).is_file():
            findings.append({"check": "required_file", "target": name, "ok": False,
                             "detail": "a published file is missing"})
    for folder in ("src/dai", "adapters/opencode", "systems", "packs", "config",
                   "scripts", "tests", "docs"):
        if not (ROOT / folder).is_dir():
            findings.append({"check": "required_folder", "target": folder, "ok": False,
                             "detail": "a required folder is missing"})
    return findings


def check_core_imports() -> list[dict]:
    findings = []
    sys.path.insert(0, str(ROOT / "src"))
    for module in CORE_MODULES:
        try:
            __import__(f"dai.{module}")
        except Exception as exc:  # noqa: BLE001 - the report must name the real failure
            findings.append({"check": "core_import", "target": module, "ok": False,
                             "detail": f"{type(exc).__name__}: {exc}"})
    return findings


def check_no_secrets() -> list[dict]:
    """Filename patterns AND a content scan for leaked paths and credentials."""
    findings = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or SKIPPED_DIRS.intersection(path.parts):
            continue
        name = path.name.lower()
        if any(token in name for token in SECRET_PATTERNS):
            findings.append({"check": "no_secret_files", "target": str(path.relative_to(ROOT)),
                             "ok": False, "detail": "a credential-like file is present"})
        if path.suffix in (".db", ".sqlite", ".sqlite3"):
            findings.append({"check": "no_database_files", "target": str(path.relative_to(ROOT)),
                             "ok": False, "detail": "a database file is present in the tree"})
            continue
        if path.suffix.lower() not in (".md", ".json", ".py", ".js", ".mjs", ".yml", ".yaml",
                                      ".txt", ".toml", ".cfg", ".ini"):
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for pattern in LEAK_PATTERNS:
            if pattern in content:
                findings.append({"check": "no_leaked_paths_or_secrets",
                                 "target": str(path.relative_to(ROOT)), "ok": False,
                                 "detail": f"the file contains the local path fragment {pattern!r}"})
                break
        else:
            for expression in LEAK_REGEX:
                if re.search(expression, content):
                    findings.append({"check": "no_leaked_paths_or_secrets",
                                     "target": str(path.relative_to(ROOT)), "ok": False,
                                     "detail": "the file contains a credential-shaped string"})
                    break
    return findings


def check_data_root(data_root: Path) -> list[dict]:
    findings = []
    if not data_root.exists():
        return [{"check": "data_root", "target": str(data_root), "ok": False,
                 "detail": "the data root does not exist; run 'dai init'"}]
    mode = stat.S_IMODE(data_root.stat().st_mode)
    if mode & 0o077:
        findings.append({"check": "data_root_permissions", "target": str(data_root), "ok": False,
                         "detail": f"the data root is group/world accessible ({oct(mode)})"})
    if data_root.is_symlink():
        findings.append({"check": "data_root_not_symlink", "target": str(data_root), "ok": False,
                         "detail": "the data root must not be a symlink"})
    for plane in ("person.db", "project.db", "global.db"):
        if not (data_root / plane).is_file():
            findings.append({"check": "memory_plane", "target": plane, "ok": False,
                             "detail": "a memory plane is missing"})
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="verify_install",
                                     description="Verify a D_AI installation")
    parser.add_argument("--data-root", type=Path, default=Path.home() / ".d-ai")
    parser.add_argument("--skip-data-root", action="store_true",
                        help="Do not check the private data directory")
    args = parser.parse_args(argv)

    findings: list[dict] = []
    checks_run = ["required_file", "required_folder", "core_import",
                  "no_secret_files", "no_database_files", "no_leaked_paths_or_secrets"]
    skipped: list[str] = []
    findings += check_tree()
    findings += check_core_imports()
    findings += check_no_secrets()
    if not args.skip_data_root:
        findings += check_data_root(args.data_root)
        checks_run += ["data_root", "data_root_permissions", "data_root_not_symlink",
                       "memory_plane"]
    else:
        skipped.append("the data-root checks (use without --skip-data-root to run them)")

    failures = [finding for finding in findings if not finding["ok"]]
    report = {
        "repository": str(ROOT),
        "data_root": str(args.data_root),
        "checks_run": checks_run,
        "skipped": skipped,
        "failures": failures,
        "ok": not failures,
        "limits": [
            "The leak scan matches known path and credential patterns in text files; it is "
            "a guard against accidents, not a proof that no secret exists.",
            "This check proves structure, permissions and imports only.",
            "It does not prove professional domain validation or host compatibility.",
            "The four host surfaces need their own installed-copy verification.",
        ],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
