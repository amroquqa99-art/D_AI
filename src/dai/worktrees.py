"""Bounded, opt-in git worktree helpers for isolated implementation tasks.

These are *primitives*, not an automatic merge system: they create and remove
worktrees and perform read-only merge checks. No commit, merge, or push is ever
performed here. The caller (and the owner's authorization) decide when and
whether to integrate.

Security: every path is validated (real directory, no symlink, no traversal);
all git invocations use argument lists (no shell) with timeouts; force removal
requires an explicit flag.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any

from .errors import InvalidRequest

_TASK_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


def _real_dir(path: str | Path, name: str) -> Path:
    p = Path(path)
    if p.is_symlink() or not p.is_dir():
        raise InvalidRequest(f"{name} must be a real directory")
    return p.resolve(strict=True)


def _run_git(repo: Path, args: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            ["git", "-C", str(repo), *args],
            capture_output=True, text=True, timeout=timeout, check=False,
        )
    except FileNotFoundError as exc:
        raise InvalidRequest("git is not installed") from exc
    except subprocess.TimeoutExpired as exc:
        raise InvalidRequest(f"git timed out: {' '.join(args)}") from exc


def _is_git_repo(repo: Path) -> bool:
    r = _run_git(repo, ["rev-parse", "--is-inside-work-tree"])
    return r.returncode == 0 and r.stdout.strip() == "true"


def create_worktree(repo_root: str | Path, worktree_root: str | Path,
                    task_id: str, *, base_ref: str = "HEAD",
                    force: bool = False) -> dict[str, Any]:
    """Create an isolated worktree for task_id. Returns metadata; never merges."""
    if not _TASK_ID_RE.match(task_id):
        raise InvalidRequest("task_id must be a safe identifier")
    repo = _real_dir(repo_root, "repo_root")
    if not _is_git_repo(repo):
        raise InvalidRequest("repo_root is not a git worktree")
    wt_root = _real_dir(worktree_root, "worktree_root")
    # keep worktree under managed root, never inside repo itself
    target = (wt_root / task_id).resolve()
    if not str(target).startswith(str(wt_root) + "/"):
        raise InvalidRequest("worktree path escapes worktree_root")
    if target.exists() and not force:
        raise InvalidRequest("worktree target already exists; pass force=True to replace")
    branch = f"dai/{task_id}"
    # Ensure clean base ref exists
    ref_check = _run_git(repo, ["rev-parse", "--verify", base_ref])
    if ref_check.returncode != 0:
        raise InvalidRequest(f"base_ref not found: {base_ref}")
    args = ["worktree", "add", "-b", branch, str(target), base_ref]
    if force:
        args = ["worktree", "add", "--force", "-b", branch, str(target), base_ref]
    result = _run_git(repo, args)
    if result.returncode != 0:
        raise InvalidRequest(f"git worktree add failed: {result.stderr.strip()[:500]}")
    return {
        "task_id": task_id,
        "repo_root": str(repo),
        "worktree_path": str(target),
        "branch": branch,
        "base_ref": base_ref,
        "status": "created",
    }


def list_worktrees(repo_root: str | Path) -> list[dict[str, Any]]:
    repo = _real_dir(repo_root, "repo_root")
    if not _is_git_repo(repo):
        raise InvalidRequest("repo_root is not a git worktree")
    result = _run_git(repo, ["worktree", "list", "--porcelain"])
    if result.returncode != 0:
        raise InvalidRequest(f"git worktree list failed: {result.stderr.strip()[:500]}")
    entries: list[dict[str, Any]] = []
    current: dict[str, Any] = {}
    for line in result.stdout.splitlines():
        if line == "":
            if current:
                entries.append(current)
                current = {}
            continue
        if line.startswith("worktree "):
            current["path"] = line[len("worktree "):]
        elif line.startswith("HEAD "):
            current["head"] = line[len("HEAD "):]
        elif line.startswith("branch "):
            current["branch"] = line[len("branch "):]
        elif line == "bare":
            current["bare"] = True
        elif line == "detached":
            current["detached"] = True
    if current:
        entries.append(current)
    return entries


def remove_worktree(repo_root: str | Path, worktree_path: str | Path,
                    *, force: bool = False) -> dict[str, Any]:
    repo = _real_dir(repo_root, "repo_root")
    if not _is_git_repo(repo):
        raise InvalidRequest("repo_root is not a git worktree")
    target = Path(worktree_path)
    if target.is_symlink():
        raise InvalidRequest("worktree_path must not be a symlink")
    # ensure it is a registered worktree
    registered = {e.get("path") for e in list_worktrees(repo)}
    if str(target.resolve()) not in {str(Path(p).resolve()) for p in registered if p}:
        raise InvalidRequest("worktree_path is not a registered worktree of this repo")
    args = ["worktree", "remove", str(target)]
    if force:
        args.insert(2, "--force")
    result = _run_git(repo, args)
    if result.returncode != 0:
        raise InvalidRequest(f"git worktree remove failed: {result.stderr.strip()[:500]}")
    return {"worktree_path": str(target), "status": "removed"}


def verify_merge(repo_root: str | Path, base_ref: str, head_ref: str) -> dict[str, Any]:
    """Read-only check: can head_ref merge into base_ref without conflicts?

    Uses git merge-tree (modern) when available, falls back to merge-base + diff.
    Does NOT modify the working tree.
    """
    repo = _real_dir(repo_root, "repo_root")
    if not _is_git_repo(repo):
        raise InvalidRequest("repo_root is not a git worktree")
    for ref in (base_ref, head_ref):
        r = _run_git(repo, ["rev-parse", "--verify", ref])
        if r.returncode != 0:
            raise InvalidRequest(f"ref not found: {ref}")
    # Try modern git merge-tree (git >= 2.38)
    r = _run_git(repo, ["merge-tree", "--write-tree", "--no-messages", base_ref, head_ref])
    if r.returncode == 0:
        return {"base_ref": base_ref, "head_ref": head_ref, "clean": True,
                "merge_tree": r.stdout.strip() or None, "method": "merge-tree"}
    # If merge-tree reports conflict, return conflict info
    stderr = r.stderr.strip()
    if "conflict" in stderr.lower() or r.returncode == 1:
        return {"base_ref": base_ref, "head_ref": head_ref, "clean": False,
                "detail": stderr[:1000], "method": "merge-tree"}
    # Fallback: merge-base
    mb = _run_git(repo, ["merge-base", base_ref, head_ref])
    return {"base_ref": base_ref, "head_ref": head_ref,
            "merge_base": mb.stdout.strip() if mb.returncode == 0 else None,
            "clean": None, "method": "merge-base-fallback",
            "note": "git merge-tree unavailable; manual review required"}
