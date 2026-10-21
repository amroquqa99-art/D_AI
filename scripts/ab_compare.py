#!/usr/bin/env python3
"""A/B comparison harness for D_AI 0.1.

Invariant: the baseline arm and the system arm run the SAME task text with the
SAME model under genuinely comparable conditions. Each arm runs in an isolated
per-arm sandbox: HOME = <sandbox>/home, so the host resolves its global
configuration from the sandbox and never sees the owner's global opencode.json
(its default agent "dai-engineer" and its live MCP server); XDG_DATA_HOME is
the REAL shared directory, so provider authentication keeps working;
XDG_STATE_HOME, XDG_CONFIG_HOME and XDG_CACHE_HOME are per-arm, so the owner's
state and cache are never touched.

The ONLY difference between the arms is the D_AI definitions: the system
arm's WORKSPACE contains .opencode/agent, .opencode/skill and
.opencode/command copied from adapters/opencode, plus a workspace-root
opencode.json that registers the D_AI MCP server
([sys.executable, "-m", "dai.mcp_server"], DAI_PROJECT_ROOT, PYTHONPATH and a
per-arm, per-repeat DAI_DATA_ROOT). The baseline arm's WORKSPACE contains
nothing: no .opencode directory, no opencode.json, no agents, no skills, no
commands, no MCP.

A free control run in the baseline arm with --agent dai-research must fail
with {"type":"error","error":{"type":"unknown","message":"Agent not found:
\"dai-research\""}} before any model call, proving the D_AI agents are absent
from the baseline arm; the system arm's real run with --agent dai-research
proves the agent was resolved inside the sandbox.

This module collects facts only. It never scores quality and never claims the
system is better or worse. Scoring is the independent reviewer's job
(ab_score.py).

Public CLI:
    python scripts/ab_compare.py --task <task file> --model provider/model \
        [--out <run dir>] [--timeout 900] [--reverse] [--dry-run] \
        [--keep-sandboxes] [--repeats 1]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Make `import dai` work whether the package is installed or used from the
# source tree of this repository.
ROOT = Path(__file__).resolve().parents[1]
_SRC = ROOT / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from dai.errors import DaiError, InvalidRequest  # noqa: E402

ADAPTER = ROOT / "adapters" / "opencode"
AGENT_SOURCE = ADAPTER / "agent"
SKILL_SOURCE = ADAPTER / "skill"
COMMAND_SOURCE = ADAPTER / "command"
DEFAULT_TASK = ROOT / "docs" / "evaluation" / "REFERENCE_TASK_SCI.md"
OPENCODE = os.path.expanduser("~/.opencode/bin/opencode")

# --------------------------------------------------------------------------- #
# Exceptions                                                                  #
# --------------------------------------------------------------------------- #


class HarnessError(DaiError):
    """Base failure of the A/B harness (safe to present at the boundary)."""


class ArmFailed(HarnessError):
    """An arm run failed before or during the host execution."""


# --------------------------------------------------------------------------- #
# Task text                                                                   #
# --------------------------------------------------------------------------- #

_FENCE_LINE = re.compile(r"^```+\s*\S*\s*$")


def _is_fence_line(line: str) -> bool:
    return bool(_FENCE_LINE.match(line.rstrip("\r\n")))


def strip_task_fence(text: str) -> str:
    """Strip a single wrapping markdown fence, if the text is wrapped in one.

    Only the outermost opening/closing fence lines are removed; nothing else
    is added, translated, summarised or decorated.
    """
    lines = text.splitlines(keepends=True)
    if not lines or not _is_fence_line(lines[0]):
        return text
    body = lines[1:]
    if body and _is_fence_line(body[-1]):
        body = body[:-1]
    return "".join(body)


def read_task_text(path: Path) -> tuple[bytes, str, str]:
    """Read the task file verbatim and return (raw bytes, sha256, sent text).

    The sent text is the file content with a wrapping markdown fence stripped,
    if present. Otherwise it is the file content byte for byte.
    """
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    sent = strip_task_fence(text)
    return raw, hashlib.sha256(raw).hexdigest(), sent


# --------------------------------------------------------------------------- #
# Sandbox building                                                            #
# --------------------------------------------------------------------------- #


@dataclass
class SandboxPaths:
    root: Path  # <sandbox root>/<arm>/repeat-<n>
    home: Path  # HOME: isolated global configuration for the arm
    state: Path  # XDG_STATE_HOME: the arm's own state
    cache: Path  # XDG_CACHE_HOME: the arm's own cache
    config: Path  # XDG_CONFIG_HOME: sandbox home/.config dir
    opencode_config: Path  # OPENCODE_CONFIG_DIR: sandbox home/.config/opencode
    workspace: Path  # cwd for the arm
    data: Path  # DAI_DATA_ROOT for the arm (per arm, per repeat)


def link_or_copy(source: Path, target: Path) -> dict[str, Any]:
    """Install one item into the sandbox workspace (link preferred, copy fallback)."""
    if target.exists() or target.is_symlink():
        return {"action": "skipped", "reason": "target already exists"}
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
    return {"action": "created", "mode": mode}


def write_workspace_opencode_json(opencode_json: Path, mcp_entry: dict[str, Any]) -> dict[str, Any]:
    """Write the workspace-root opencode.json registering the D_AI MCP server.

    Same command shape as scripts/install_opencode.py:
    [sys.executable, "-m", "dai.mcp_server], plus the per-arm data root so
    arms can never contaminate each other or the owner's real data root
    (~/.d-ai is the D_AI default when DAI_DATA_ROOT is unset).
    """
    document = {"mcp": {"servers": {"dai": mcp_entry}}}
    text = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    opencode_json.parent.mkdir(parents=True, exist_ok=True)
    opencode_json.write_text(text, encoding="utf-8")
    return {"config": str(opencode_json), "entry": mcp_entry, "action": "created"}


def build_sandbox(root: Path, arm: str, repeat: int) -> tuple[SandboxPaths, dict[str, Any]]:
    """Build one workspace sandbox for one arm of one repeat.

    Layout under <root>/<arm>/repeat-<n>:
        home/                  -> HOME (isolated global configuration)
        home/.config/          -> XDG_CONFIG_HOME
        home/.config/opencode/ -> OPENCODE_CONFIG_DIR (kept empty: nothing of
                                  the owner's global config is visible)
        state/                 -> XDG_STATE_HOME
        cache/                 -> XDG_CACHE_HOME
        workspace/             -> cwd; the system arm receives the D_AI
                                  definitions under .opencode/ and a workspace
                                  root opencode.json registering the D_AI MCP;
                                  the baseline arm receives nothing.
        data/                  -> DAI_DATA_ROOT (per arm, per repeat)
    """
    sandbox = root / arm / f"repeat-{repeat}"
    home = sandbox / "home"
    config = home / ".config"          # XDG_CONFIG_HOME
    opencode_config = config / "opencode"  # OPENCODE_CONFIG_DIR
    state = sandbox / "state"          # XDG_STATE_HOME
    cache = sandbox / "cache"          # XDG_CACHE_HOME
    workspace = sandbox / "workspace"  # cwd
    data = sandbox / "data"            # DAI_DATA_ROOT
    for directory in (home, config, opencode_config, state, cache, workspace, data):
        directory.mkdir(parents=True, exist_ok=True)

    report: dict[str, Any] = {
        "sandbox": str(sandbox),
        "arm": arm,
        "repeat": repeat,
        "changes": [],
        "mcp": None,
    }

    if arm == "system":
        for source in sorted(AGENT_SOURCE.glob("**/*.md")):
            relative = source.relative_to(AGENT_SOURCE)
            target = workspace / ".opencode" / "agent" / relative
            report["changes"].append(
                {"source": str(source.relative_to(ROOT)), "target": str(target),
                 **link_or_copy(source, target)})
        for source in sorted(SKILL_SOURCE.iterdir()):
            if source.is_dir():
                target = workspace / ".opencode" / "skill" / source.name
                report["changes"].append(
                    {"source": str(source.relative_to(ROOT)), "target": str(target),
                     **link_or_copy(source, target)})
        for source in sorted(COMMAND_SOURCE.glob("*.md")):
            target = workspace / ".opencode" / "command" / source.name
            report["changes"].append(
                {"source": str(source.relative_to(ROOT)), "target": str(target),
                 **link_or_copy(source, target)})
        mcp_entry = {
            "type": "local",
            "command": [sys.executable, "-m", "dai.mcp_server"],
            "enabled": True,
            "environment": {
                "DAI_PROJECT_ROOT": str(ROOT),
                "PYTHONPATH": str(_SRC),
                "DAI_DATA_ROOT": str(data),
            },
        }
        report["mcp"] = write_workspace_opencode_json(workspace / "opencode.json", mcp_entry)
    else:
        report["mcp"] = {"config": str(workspace / "opencode.json"),
                         "entry": None, "action": "absent"}
    return SandboxPaths(root=sandbox, home=home, state=state, cache=cache,
                        config=config, opencode_config=opencode_config,
                        workspace=workspace, data=data), report


def workspace_mcp_entry(workspace: Path) -> dict[str, Any] | None:
    """Read the workspace-root opencode.json MCP registration, if any."""
    path = workspace / "opencode.json"
    if not path.is_file():
        return None
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"error": "unreadable opencode.json"}
    servers: Any = {}
    if isinstance(document, dict):
        servers = document.get("mcp", {}).get("servers", {}) or {}
    dai = None
    if isinstance(servers, dict):
        dai = servers.get("dai")
    return {"servers": sorted(servers) if isinstance(servers, dict) else None,
            "dai": dai}


def workspace_contents(workspace: Path) -> dict[str, Any]:
    """Describe what a workspace contains (isolation proof)."""
    opencode = workspace / ".opencode"

    def list_dir(directory: Path) -> list[str]:
        if not directory.is_dir():
            return []
        return sorted(str(p.relative_to(directory)) for p in directory.iterdir())

    return {"agent": list_dir(opencode / "agent"),
            "skill": list_dir(opencode / "skill"),
            "command": list_dir(opencode / "command"),
            "opencode_json": (workspace / "opencode.json").is_file(),
            "mcp": workspace_mcp_entry(workspace)}


def workspace_files(workspace: Path) -> list[str]:
    """All files under the workspace, as paths relative to the workspace."""
    if not workspace.is_dir():
        return []
    return sorted(str(p.relative_to(workspace)) for p in workspace.rglob("*")
                  if p.is_file())


# --------------------------------------------------------------------------- #
# Host execution                                                              #
# --------------------------------------------------------------------------- #


@dataclass
class ArmResult:
    arm: str
    label: str | None
    repeat: int
    model_requested: str
    model_reported: str | None
    status: str  # "ok" | "timeout" | "error"
    exit_code: int | None
    duration_seconds: float
    assistant_text: str
    tool_calls: list[dict[str, Any]]
    event_counts: dict[str, int]
    stdout_tail: str
    stderr_tail: str
    isolation: dict[str, Any]
    system_artifacts: dict[str, Any] | None = None


def _parse_host_stream(stdout: str) -> dict[str, Any]:
    assistant_text: list[str] = []
    tool_calls: list[dict[str, Any]] = []
    event_counts: dict[str, int] = {}
    model_reported: str | None = None
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if not isinstance(event, dict):
            continue
        event_type = event.get("type")
        event_counts[event_type] = event_counts.get(event_type, 0) + 1
        part = event.get("part") if isinstance(event.get("part"), dict) else {}
        if event_type == "text" and isinstance(part.get("text"), str):
            assistant_text.append(part["text"])
        elif event_type in ("tool", "tool_use"):
            tool_calls.append({
                "title": part.get("title"),
                "tool": part.get("tool") or part.get("name"),
                "state": part.get("state"),
                "time": part.get("time"),
            })
        elif event_type in ("step_finish", "step-finish"):
            tokens = part.get("tokens") if isinstance(part.get("tokens"), dict) else {}
            if tokens:  # the stream does not disclose the model used
                model_reported = None
    return {
        "assistant_text": "".join(assistant_text),
        "tool_calls": tool_calls,
        "event_counts": event_counts,
        "model_reported": model_reported,
    }


def run_host(model: str, task_text: str, cwd: Path, env: dict[str, str],
             agent: str | None, timeout: float) -> ArmResult:
    """Run one host arm and capture stdout, stderr, exit code and duration.

    Exactly: [opencode, "run", "--standalone", "--auto", "--format", "json",
    "--model", <model>, ("--agent", <agent>)?, <task text>] with cwd = the arm
    workspace and the per-arm environment above. The system arm passes
    --agent dai-research; the baseline arm passes no --agent, so the host's
    default agent runs. "--auto" auto-approves permissions that are not
    explicitly denied, so both arms get the same permission posture.

    A timeout is recorded as status "timeout" — never as a success and never
    as an empty answer. Partial output captured before the timeout is kept.
    """
    cmd = [OPENCODE, "run", "--standalone", "--auto", "--format", "json",
           "--model", model]
    if agent:
        cmd += ["--agent", agent]
    cmd.append(task_text)

    start = time.monotonic()
    status = "ok"
    exit_code: int | None = None
    stdout = ""
    stderr = ""
    try:
        proc = subprocess.run(
            cmd, cwd=str(cwd), env=env, capture_output=True, text=True,
            timeout=timeout)
        exit_code = proc.returncode
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
        if proc.returncode != 0:
            status = "error"
    except subprocess.TimeoutExpired as exc:
        status = "timeout"
        exit_code = None
        stdout = exc.stdout.decode("utf-8", "replace") if isinstance(exc.stdout,
                                                                    (bytes, bytearray)) else (exc.stdout or "")
        stderr = exc.stderr.decode("utf-8", "replace") if isinstance(exc.stderr,
                                                                     (bytes, bytearray)) else (exc.stderr or "")
        try:
            exc.kill()
        except OSError:
            pass
        try:
            out, err = exc.communicate(timeout=10)
            stdout = out.decode("utf-8", "replace") if isinstance(out, (bytes, bytearray)) else (out or "")
            stderr = err.decode("utf-8", "replace") if isinstance(err, (bytes, bytearray)) else (err or "")
        except subprocess.TimeoutExpired:
            pass
    except (OSError, subprocess.SubprocessError) as exc:
        status = "error"
        stdout = ""
        stderr = str(exc)
    duration = time.monotonic() - start

    parsed = _parse_host_stream(stdout)
    return ArmResult(
        arm="", label="", repeat=0, model_requested=model, status=status,
        exit_code=exit_code, duration_seconds=duration,
        assistant_text=parsed["assistant_text"], tool_calls=parsed["tool_calls"],
        event_counts=parsed["event_counts"],
        stdout_tail=stdout[-2000:], stderr_tail=stderr[-2000:],
        isolation={}, model_reported=parsed["model_reported"])


def host_env(paths: SandboxPaths) -> dict[str, str]:
    """Environment for one host arm: an isolated per-arm sandbox.

    HOME = <sandbox>/home -> the host's global configuration is isolated and
    the owner's global opencode.json (default agent, live MCP server) is not
    visible. XDG_DATA_HOME is deliberately left at the real value so provider
    authentication keeps working. XDG_STATE_HOME, XDG_CONFIG_HOME and
    XDG_CACHE_HOME point at the sandbox so the owner's state and cache are
    never touched. OPENCODE_CONFIG_DIR is set as belt and braces.

    PWD is set to the arm's workspace because the host resolves its location
    from PWD rather than from getcwd(); an inherited PWD makes it look at the
    wrong directory and report an existing agent as missing.
    """
    env = os.environ.copy()
    env["HOME"] = str(paths.home)
    env["XDG_STATE_HOME"] = str(paths.state)
    env["XDG_CONFIG_HOME"] = str(paths.config)
    env["XDG_CACHE_HOME"] = str(paths.cache)
    env["OPENCODE_CONFIG_DIR"] = str(paths.opencode_config)
    # The host resolves its location from PWD, not from getcwd(). A stale PWD
    # inherited from the parent shell makes the host read the agent catalog of
    # the WRONG directory, and an agent that exists is then reported as
    # "Agent not found". PWD must therefore name the arm's workspace.
    env["PWD"] = str(paths.workspace)
    return env


def debug_paths(env: dict[str, str], cwd: Path) -> dict[str, Any]:
    """`opencode debug paths` for the arm: the sandbox paths in use.

    Works without the shared background service. Best-effort supporting
    evidence; a failure is recorded, not fatal.
    """
    cmd = [OPENCODE, "debug", "paths"]
    try:
        proc = subprocess.run(cmd, cwd=str(cwd), env=env, capture_output=True,
                              text=True, timeout=60)
        return {"exit_code": proc.returncode, "stdout": proc.stdout,
                "stderr": proc.stderr, "observable": proc.returncode == 0}
    except (OSError, subprocess.SubprocessError, subprocess.TimeoutExpired) as exc:
        return {"exit_code": None, "stdout": "", "stderr": str(exc),
                "observable": False}


def observe_mcp(env: dict[str, str]) -> dict[str, Any]:
    """Best-effort observation of the MCP servers the host CLI sees for a config.

    MCP servers are directly observable via `opencode mcp list` and are
    recorded here. A failed observation is recorded, not fatal.
    """
    cmd = [OPENCODE, "mcp", "list"]
    try:
        proc = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=60)
        return {"exit_code": proc.returncode, "stdout": proc.stdout,
                "stderr": proc.stderr, "observable": proc.returncode == 0}
    except (OSError, subprocess.SubprocessError, subprocess.TimeoutExpired) as exc:
        return {"exit_code": None, "stdout": "", "stderr": str(exc),
                "observable": False}


def _extract_agent_not_found(stdout_tail: str, stderr_tail: str) -> str:
    """Pull the "Agent not found" error message out of a probe's output."""
    combined = (stdout_tail + "\n" + stderr_tail).strip()
    for line in combined.splitlines():
        line = line.strip()
        if line.startswith("{") and "Agent not found" in line:
            try:
                event = json.loads(line)
                message = event.get("error", {}).get("message") if isinstance(
                    event.get("error"), dict) else None
                return message or line
            except ValueError:
                return line
    return combined[-500:]


# --------------------------------------------------------------------------- #
# Data-root inspection (read-only)                                            #
# --------------------------------------------------------------------------- #

_KINDS_OF_INTEREST = ("decision", "task", "charter")


def inspect_data_root(data_root: Path) -> dict[str, Any]:
    """Read-only snapshot of D_AI records under a per-arm data root.

    Opens the plane databases read-only so the snapshot can never modify the
    data root. Returns record counts by kind and the ids of decisions,
    tasks and charters that exist. Absence of databases means zero records.
    """
    import sqlite3

    result: dict[str, Any] = {"data_root": str(data_root),
                              "databases": {}, "totals_by_kind": {},
                              "of_interest": {}}
    for plane in ("person", "project", "global"):
        db = data_root / f"{plane}.db"
        entry: dict[str, Any] = {"exists": db.is_file(), "records": 0, "by_kind": {}}
        if db.is_file():
            uri = f"file:{db}?mode=ro"
            try:
                conn = sqlite3.connect(uri, uri=True)
                try:
                    count = conn.execute("SELECT COUNT(*) FROM records").fetchone()[0]
                    entry["records"] = int(count)
                    rows = conn.execute(
                        "SELECT kind, COUNT(*) AS c FROM records GROUP BY kind"
                    ).fetchall()
                    entry["by_kind"] = {str(k): int(c) for k, c in rows}
                    result["totals_by_kind"].update(entry["by_kind"])
                    interested = conn.execute(
                        "SELECT id, kind FROM records WHERE kind IN (?, ?, ?)"
                        " ORDER BY kind, id", _KINDS_OF_INTEREST).fetchall()
                    for rid, kind in interested:
                        result["of_interest"].setdefault(str(kind), []).append(str(rid))
                finally:
                    conn.close()
            except sqlite3.Error as exc:  # pragma: no cover - defensive
                entry["error"] = str(exc)
        result["databases"][plane] = entry
    result["total_records"] = sum(e["records"] for e in result["databases"].values())
    return result


# --------------------------------------------------------------------------- #
# Run orchestration                                                           #
# --------------------------------------------------------------------------- #

_ARM_LABELS = ("baseline", "system")


def random_blind_map(repeats: int) -> dict[str, Any]:
    """A randomised label -> arm mapping per repeat; both labels always mapped."""
    import random as _random

    seed = hashlib.sha256(f"{uuid.uuid4().hex}:{repeats}".encode("utf-8")).hexdigest()
    rng = _random.Random(seed)
    mapping: dict[str, dict[str, str]] = {}
    for n in range(1, repeats + 1):
        arms = list(_ARM_LABELS)
        rng.shuffle(arms)
        mapping[str(n)] = {"A": arms[0], "B": arms[1]}
    return {"schema": "blind-map-v1", "randomized": True, "seed": seed,
            "repeats": mapping}


def default_out_dir() -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return ROOT / "docs" / "evaluation" / "runs" / stamp


def run_repeat(repeat: int, task_text: str, task_sha256: str, model: str,
               sandbox_root: Path, timeout: float, reverse: bool,
               blind: dict[str, str], keep: bool) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run both arms for one repeat and return (repeat record, sandbox reports).

    Isolation proof per arm:
      * system arm: the real run uses --agent dai-research; a successful run
        proves the agent was resolved inside the sandbox (recorded as
        isolation["agent_resolved"]).
      * baseline arm: the real run passes no --agent (host default agent). A
        separate probe runs the same command with --agent dai-research; the
        missing agent errors before any model call with "Agent not found" and
        is recorded under isolation["probe"]. The probe is NOT the arm's real
        result and is not counted as one.
    """
    order = ["system", "baseline"] if reverse else ["baseline", "system"]
    results: dict[str, ArmResult] = {}
    sandbox_reports: dict[str, Any] = {}

    for arm in order:
        paths, report = build_sandbox(sandbox_root, arm, repeat)
        sandbox_reports[arm] = report
        env = host_env(paths)
        debug = debug_paths(env, paths.workspace)
        mcp_observation = observe_mcp(env)
        agent = "dai-research" if arm == "system" else None
        result = run_host(model, task_text, paths.workspace, env, agent, timeout)
        result.arm = arm
        # The blind map is label -> arm; find the label that names this arm.
        labels = blind[str(repeat)]
        result.label = next((label for label, mapped in labels.items() if mapped == arm), None)
        result.repeat = repeat

        isolation: dict[str, Any] = {
            "home": str(paths.home),
            "xdg_data_home": os.environ.get("XDG_DATA_HOME"),
            "xdg_state_home": str(paths.state),
            "xdg_config_home": str(paths.config),
            "xdg_cache_home": str(paths.cache),
            "opencode_config_dir": str(paths.opencode_config),
            "workspace": str(paths.workspace),
            "workspace_contents": workspace_contents(paths.workspace),
            "mcp_entry": report["mcp"],
            "mcp_observation": mcp_observation,
            "debug_paths": debug,
            "agent": agent,
        }
        if arm == "baseline":
            probe = run_host(model, task_text, paths.workspace, env, "dai-research",
                             timeout)
            isolation["probe"] = {
                "agent": "dai-research",
                "expected": 'Agent not found: "dai-research"',
                "status": probe.status,
                "exit_code": probe.exit_code,
                "error": _extract_agent_not_found(probe.stdout_tail, probe.stderr_tail),
                "note": "the probe is not the arm's real result: an agent that "
                        "is not present errors before any model call, so it "
                        "costs nothing and proves the D_AI agents are absent "
                        "from the baseline arm",
            }
        else:
            isolation["agent_resolved"] = (result.status == "ok"
                                           and result.exit_code == 0)
            result.system_artifacts = inspect_data_root(paths.data)
        result.isolation = isolation
        results[arm] = result

    repeat_record: dict[str, Any] = {
        "repeat": repeat,
        "order": order,
        "arms": {},
    }
    for arm in _ARM_LABELS:
        result = results[arm]
        artifacts = result.system_artifacts or {}
        repeat_record["arms"][arm] = {
            "label": result.label,
            "status": result.status,
            "exit_code": result.exit_code,
            "duration_seconds": result.duration_seconds,
            "model_requested": result.model_requested,
            "model_reported": result.model_reported,
            "assistant_text": result.assistant_text,
            "assistant_chars": len(result.assistant_text),
            "tool_calls": result.tool_calls,
            "tool_call_count": len(result.tool_calls),
            "event_counts": result.event_counts,
            "stdout_tail": result.stdout_tail,
            "stderr_tail": result.stderr_tail,
            "isolation": result.isolation,
            "system_artifacts": {
                "total_records": artifacts.get("total_records", 0),
                "totals_by_kind": artifacts.get("totals_by_kind", {}),
                "of_interest": artifacts.get("of_interest", {}),
            },
        }
    return repeat_record, sandbox_reports


def write_run_outputs(out_dir: Path, task_path: Path, raw: bytes, sent_text: str,
                      task_sha256: str, model: str, timeout: float, reverse: bool,
                      repeats: int, blind: dict[str, Any],
                      repeat_records: list[dict[str, Any]]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "task.md").write_bytes(raw)

    manifest: dict[str, Any] = {
        "schema": "run-manifest-v1",
        "task": str(task_path),
        "task_sha256": task_sha256,
        "model_requested": model,
        "note_on_model": "The OpenCode JSON stream does not disclose the model "
                         "used; the requested --model identifier is recorded.",
        "timeout_seconds": timeout,
        "repeats": repeats,
        "reverse": reverse,
        "blind_map": str(out_dir / "blind-map.json"),
        "repeats_records": repeat_records,
    }
    (out_dir / "run.json").write_text(json.dumps(manifest, ensure_ascii=False,
                                                 indent=2) + "\n", encoding="utf-8")

    comparison_lines: list[str] = [
        "# تقرير حقائق المقارنة الخام — لا درجات",
        "",
        "هذا التقرير يسجّل وقائع فقط (مدد، مخرجات، أدوات، مُنتَجات). لا يحتوي على "
        "أي درجة جودة؛ الدرجات تُحدَّد حصراً من المراجع المستقل عبر ab_score.py.",
        "",
        f"المهمة: {task_path}  (sha256={task_sha256})",
        f"النموذج المطلوب: {model}",
        f"عدد التكرارات: {repeats}  (زوج واحد لكل تكرار، والعكس عند --reverse)",
        "",
    ]
    for rec in repeat_records:
        comparison_lines.append(f"## التكرار {rec['repeat']} (ترتيب التنفيذ: {' → '.join(rec['order'])})")
        comparison_lines.append("")
        comparison_lines.append("| العلامة | الذراع | الحالة | مخرج الأمر | المدة (ث) | الأحرف | استدعاءات الأدوات | مُنتَجات النظام |")
        comparison_lines.append("|---|---|---|---|---|---|---|---|")
        for arm in _ARM_LABELS:
            a = rec["arms"][arm]
            artifacts = a["system_artifacts"] or {}
            art = (f"{artifacts.get('total_records', 0)} سجل "
                   f"({', '.join(f'{k}={v}' for k, v in sorted(artifacts.get('totals_by_kind', {}).items())) or 'صفر'})" if arm == "system" else "—")
            comparison_lines.append(
                f"| {a['label']} | {arm} | {a['status']} | {a['exit_code']} | "
                f"{a['duration_seconds']:.2f} | {a['assistant_chars']} | "
                f"{a['tool_call_count']} | {art} |")
        comparison_lines.append("")

    comparison_lines.extend([
        "## إثبات العزل",
        "",
        "- يُحدَّد لكل ذراع `HOME` معزول (`<الصندوق>/home`)، وتُقرأ إعدادات المضيف "
        "من المجلد `home/.config/opencode`؛ وتُترك بيانات المالك الحقيقية "
        "(`XDG_DATA_HOME`) كما هي لتعمل المصادقة مع مقدّمي الخدمة، مع "
        "`XDG_STATE_HOME` و`XDG_CACHE_HOME` و`XDG_CONFIG_HOME` داخل الصندوق.",
        "- تظل الإعدادات العالمية للمالك، بما فيها خادم MCP المباشر والوكيل "
        "الافتراضي، غير مرئية لأي من الذراعين.",
        "- تُنصَّب تعريفات D_AI (الوكلاء والمهارات والأوامر) في مساحة عمل ذراع النظام "
        "فقط، تحت `.opencode/`، مع ملف `opencode.json` في جذر مساحة العمل يسجِّل "
        "خادم MCP `dai` ويشير إلى `DAI_DATA_ROOT` خاص بكل ذراع وتكرار. مساحة عمل "
        "ذراع الأساس خالية تماماً: لا `.opencode` ولا `opencode.json` ولا وكلاء ولا "
        "مهارات ولا أوامر ولا خادم MCP.",
        "- الدليل المجاني والصلب: يُنفَّذ الأمر نفسه في ذراع الأساس مع `--agent "
        "dai-research`، وتسبق نتيجته أي استدعاء للنموذج بخطأ "
        "`Agent not found: \"dai-research\"`؛ وهذا يثبت غياب وكلاء D_AI عن ذراع "
        "الأساس. في ذراع النظام يستخدم التشغيل الحقيقي `--agent dai-research`، "
        "ونجاحه يثبت أن الوكيل حُلَّل داخل الصندوق.",
        "- مخرج `opencode debug paths` لكل ذراع مسجَّل كدليل مساند على مسارات "
        "الصندوق المعزول.",
        "",
        "ملاحظات: زوج واحد لكل ذراع ليس تجربة (انظر HARNESS.md)؛ الفرق قد يأتي من "
        "سياق الأدوات المتاحة وليس من النظام ذاته.",
    ])
    (out_dir / "COMPARISON.md").write_text("\n".join(comparison_lines) + "\n",
                                           encoding="utf-8")


def run_compare(task: Path, model: str, out_dir: Path, timeout: float,
                reverse: bool, dry_run: bool, keep: bool, repeats: int) -> int:
    if not model or "/" not in model:
        raise InvalidRequest("--model provider/model is required and must never be chosen by the harness")
    if not task.is_file():
        raise InvalidRequest(f"task file not found: {task}")
    raw, task_sha256, sent_text = read_task_text(task)
    blind = random_blind_map(repeats)

    if dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)
        sandbox_root = out_dir / ".sandboxes"
        plans = []
        for n in range(1, repeats + 1):
            for arm in _ARM_LABELS:
                paths, report = build_sandbox(sandbox_root, arm, n)
                plans.append(report)
        plan = {"schema": "dry-run-plan-v1", "task": str(task),
                "task_sha256": task_sha256, "model": model, "repeats": repeats,
                "reverse": reverse, "timeout": timeout, "sandboxes": plans,
                "note": "no host was invoked"}
        (out_dir / "plan.json").write_text(json.dumps(plan, ensure_ascii=False,
                                                      indent=2) + "\n", encoding="utf-8")
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0

    sandbox_root = out_dir / ".sandboxes"
    repeat_records = []
    try:
        for n in range(1, repeats + 1):
            repeat_record, _ = run_repeat(n, sent_text, task_sha256, model,
                                          sandbox_root, timeout, reverse,
                                          blind["repeats"], keep)
            repeat_records.append(repeat_record)
            for arm in _ARM_LABELS:
                payload = {
                    "repeat": n, "arm": arm,
                    "label": repeat_record["arms"][arm]["label"],
                    "status": repeat_record["arms"][arm]["status"],
                    "exit_code": repeat_record["arms"][arm]["exit_code"],
                    "duration_seconds": repeat_record["arms"][arm]["duration_seconds"],
                    "model_requested": repeat_record["arms"][arm]["model_requested"],
                    "model_reported": repeat_record["arms"][arm]["model_reported"],
                    "assistant_text": repeat_record["arms"][arm]["assistant_text"],
                    "tool_calls": repeat_record["arms"][arm]["tool_calls"],
                    "event_counts": repeat_record["arms"][arm]["event_counts"],
                    "isolation": repeat_record["arms"][arm]["isolation"],
                    "system_artifacts": repeat_record["arms"][arm]["system_artifacts"],
                }
                (out_dir / f"{arm}-{n}.json").write_text(
                    json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    finally:
        if not keep and sandbox_root.is_dir():
            shutil.rmtree(sandbox_root, ignore_errors=True)

    write_run_outputs(out_dir, task, raw, sent_text, task_sha256, model, timeout,
                      reverse, repeats, blind, repeat_records)
    (out_dir / "blind-map.json").write_text(
        json.dumps(blind, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"run_dir": str(out_dir), "repeats": repeats,
                      "blind_map": str(out_dir / "blind-map.json")},
                     ensure_ascii=False))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ab_compare",
        description="Run the same task twice (baseline vs D_AI system) under comparable conditions")
    parser.add_argument("--task", type=Path, default=DEFAULT_TASK,
                        help="task file (default docs/evaluation/REFERENCE_TASK_SCI.md)")
    parser.add_argument("--model", type=str, required=True,
                        help="provider/model (required; the harness never chooses a model)")
    parser.add_argument("--out", type=Path, default=None,
                        help="output directory (default docs/evaluation/runs/<UTC timestamp>)")
    parser.add_argument("--timeout", type=float, default=900.0,
                        help="seconds per arm (default 900)")
    parser.add_argument("--reverse", action="store_true",
                        help="run the system arm first")
    parser.add_argument("--dry-run", action="store_true",
                        help="build sandboxes and print the plan without running the host")
    parser.add_argument("--keep-sandboxes", action="store_true",
                        help="do not delete the per-arm sandboxes")
    parser.add_argument("--repeats", type=int, default=1,
                        help="fresh pairs of sessions per repeat (default 1)")
    args = parser.parse_args(argv)
    out_dir = args.out if args.out is not None else default_out_dir()
    # The run directory must be absolute: the host resolves its location from
    # PWD, and a relative sandbox path makes it fail to change directory.
    out_dir = out_dir.resolve()
    try:
        return run_compare(args.task, args.model, out_dir, args.timeout,
                           args.reverse, args.dry_run, args.keep_sandboxes,
                           args.repeats)
    except (HarnessError, InvalidRequest) as exc:
        print(f"ab_compare: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
