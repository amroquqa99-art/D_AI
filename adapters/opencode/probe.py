"""Honest capability probe for the OpenCode host surface.

Reports, per capability, what was actually observed: session identity, agent
catalog, model catalog, "/" command availability, message sending,
cancellation, compaction, tool exposure and MCP connection status.
When the OpenCode host is absent or unreachable, capabilities report
NOT_INSTALLED or UNAVAILABLE with the real reason; the probe never claims a
capability it did not observe.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

DEFAULT_BINARY = os.environ.get(
    "OPENCODE_BINARY", str(Path.home() / ".opencode" / "bin" / "opencode"))

try:  # imported as adapters.opencode.probe
    from .mcp.native import NativeClient
except ImportError:
    try:  # run directly / on path: mcp namespace package next to this file
        from mcp.native import NativeClient
    except ImportError:  # fall back to locating native.py beside this file
        _mcp_dir = str(Path(__file__).resolve().parent / "mcp")
        if _mcp_dir not in sys.path:
            sys.path.insert(0, _mcp_dir)
        from native import NativeClient  # type: ignore[no-redef]


def _entry(status: str, reason: str = "",
           observed: Any = None) -> dict[str, Any]:
    entry: dict[str, Any] = {"status": status}
    if reason:
        entry["reason"] = reason
    if observed is not None:
        entry["observed"] = observed
    return entry


def run_probe(binary: str | None = None,
              directory: str | None = None,
              session_id: str | None = None) -> dict[str, Any]:
    """Probe the OpenCode host and return one capability report."""
    binary = binary or os.environ.get("OPENCODE_BINARY") or DEFAULT_BINARY
    path = Path(binary)
    installed = path.is_file() and os.access(path, os.X_OK)
    host: dict[str, Any] = {"binary": str(path), "installed": installed}
    capabilities: dict[str, dict[str, Any]] = {
        "session_identity": _entry(
            "UNVERIFIED",
            "no native session was presented to the probe"),
        "agent_catalog": _entry(
            "UNVERIFIED",
            "the agent catalog requires a live OpenCode location directory"),
        "model_catalog": _entry(
            "UNVERIFIED",
            "the model catalog requires the OpenCode binary"),
        "slash_commands": _entry(
            "UNVERIFIED",
            "slash commands are observed inside a session; not probed "
            "externally"),
        "message_sending": _entry(
            "UNVERIFIED",
            "message sending requires an active session; the probe does not "
            "send messages"),
        "cancellation": _entry(
            "UNVERIFIED",
            "cancellation requires an active session; not probed externally"),
        "compaction": _entry(
            "UNVERIFIED",
            "compaction requires an active session; not probed externally"),
        "tool_exposure": _entry(
            "UNVERIFIED",
            "tool exposure requires the native MCP connection"),
        "mcp_connection": _entry(
            "UNVERIFIED",
            "the MCP connection requires a live OpenCode location directory"),
    }
    if not installed:
        host["reason"] = f"OpenCode binary is not installed at {binary}"
        reason = host["reason"]
        for name in capabilities:
            capabilities[name] = _entry("NOT_INSTALLED", reason)
        return {"host": host, "capabilities": capabilities}

    client = NativeClient(binary)

    # The model catalog works without a running service.
    try:
        ids = client.models()
        capabilities["model_catalog"] = _entry(
            "SUPPORTED",
            observed={"count": len(ids), "sample": ids[:5]},
        )
    except Exception as exc:
        capabilities["model_catalog"] = _entry(
            "UNAVAILABLE",
            f"model catalog failed: {type(exc).__name__}: {exc}",
        )

    # The agent catalog and the MCP connection need a location directory.
    if directory:
        try:
            catalog = client.agents(directory)
            agents = catalog.get("data", []) if isinstance(catalog, dict) else []
            capabilities["agent_catalog"] = _entry(
                "SUPPORTED", observed={"count": len(agents)})
            try:
                info = client.ready(directory)
                dai = next(
                    (x for x in (info.get("data") or [])
                     if x.get("name") == "dai"), None)
                status = dai.get("status", {}) if isinstance(dai, dict) else {}
                mcp_status = status.get("status") if isinstance(status, dict) else None
                capabilities["mcp_connection"] = _entry(
                    "SUPPORTED" if mcp_status == "connected" else "UNAVAILABLE",
                    f"native DAI MCP status: {mcp_status!r}",
                    observed={"mcp_status": mcp_status},
                )
            except Exception as exc:
                capabilities["mcp_connection"] = _entry(
                    "UNAVAILABLE",
                    f"MCP connection check failed: {type(exc).__name__}: {exc}",
                )
        except Exception as exc:
            reason = f"{type(exc).__name__}: {exc}"
            capabilities["agent_catalog"] = _entry("UNAVAILABLE",
                                                   f"agent catalog failed: {reason}")
            capabilities["mcp_connection"] = _entry(
                "UNAVAILABLE", f"MCP connection unavailable: {reason}")
    # Session identity needs a concrete session id.
    if session_id:
        try:
            session = client.session(session_id)
            agent = session.get("agent", "") if isinstance(session, dict) else ""
            is_dai = isinstance(agent, str) and (
                agent.startswith("dai-") or agent.startswith("dai/"))
            capabilities["session_identity"] = _entry(
                "SUPPORTED" if is_dai else "UNAVAILABLE",
                "" if is_dai else f"agent is not a loaded DAI agent: {agent!r}",
                observed={"session_id": session_id, "agent": agent},
            )
        except Exception as exc:
            capabilities["session_identity"] = _entry(
                "UNAVAILABLE",
                f"session {session_id} failed: {type(exc).__name__}: {exc}",
            )
    return {"host": host, "capabilities": capabilities}


if __name__ == "__main__":
    print(json.dumps(run_probe(), ensure_ascii=False, indent=2))
