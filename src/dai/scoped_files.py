"""Bounded read-only workspace discovery with secret and symlink exclusions."""
from __future__ import annotations

import os
from pathlib import Path

from .errors import InvalidRequest

BLOCKED_DIRS = frozenset((".git", ".svn", ".hg", ".env", "secrets", "credentials",
                          "node_modules", ".venv", "venv", "__pycache__"))
BLOCKED_NAMES = frozenset(("auth.json", "service.json", "id_rsa", "id_ed25519"))
BLOCKED_PARTS = ("credential", "secret", ".env", "private.key", ".pem")


def _safe_file(name: str) -> bool:
    lower = name.casefold()
    return (not name.startswith(".") and lower not in BLOCKED_NAMES
            and not any(part in lower for part in BLOCKED_PARTS))


def search_scoped_files(workspace: str | Path, query: str,
                        *, limit: int = 30, max_scan: int = 4000) -> dict:
    """Search names and bounded text; no shell, traversal, symlinks or secret reads."""
    if not isinstance(query, str) or not query.strip() or len(query) > 200:
        raise InvalidRequest("A non-empty search query (max 200 chars) is required")
    if type(limit) is not int or not 1 <= limit <= 100:
        raise InvalidRequest("Search limit must be an integer from 1 to 100")
    root = Path(workspace)
    if root.is_symlink() or not root.is_dir():
        raise InvalidRequest("Native workspace must be a real directory")
    root = root.resolve(strict=True)
    matches = []
    scanned = 0
    term = query.strip().casefold()
    for current, directories, filenames in os.walk(root, followlinks=False):
        directories[:] = sorted(d for d in directories
                                if d not in BLOCKED_DIRS and _safe_file(d)
                                and not (Path(current) / d).is_symlink())
        for filename in sorted(filenames):
            if scanned >= max_scan:
                return {"matches": matches, "scanned": scanned, "truncated": True,
                        "workspace": "native-session"}
            if not _safe_file(filename):
                continue
            path = Path(current) / filename
            if path.is_symlink() or not path.is_file():
                continue
            try:
                if not path.resolve(strict=True).is_relative_to(root):
                    continue
                if path.stat().st_size > 2_000_000:
                    continue
                scanned += 1
                relative = path.relative_to(root).as_posix()
                if term in relative.casefold():
                    matches.append({"path": relative, "line": None, "excerpt": "filename match"})
                else:
                    with path.open("rb") as file:
                        block = file.read(65536)
                    if b"\0" in block:
                        continue
                    text = block.decode("utf-8", errors="replace")
                    for line_number, line in enumerate(text.splitlines(), start=1):
                        if term in line.casefold():
                            matches.append({"path": relative, "line": line_number,
                                            "excerpt": line.strip()[:240]})
                            break
                if len(matches) >= limit:
                    return {"matches": matches, "scanned": scanned, "truncated": True,
                            "workspace": "native-session"}
            except (OSError, UnicodeError):
                continue
    return {"matches": matches, "scanned": scanned, "truncated": False,
            "workspace": "native-session"}
