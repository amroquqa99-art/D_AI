"""pi (pi.dev) host probe: observes the pi host only, never acts.

The probe reports the real observed state of a pi installation: whether the
pi binary is available and whether it answers a bounded version command. It
never spawns agents, never selects models and never sends messages.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from typing import Any


def find_pi_binary() -> str | None:
    """Locate the pi binary from PI_BINARY or PATH; never invents a path."""
    return os.environ.get("PI_BINARY") or shutil.which("pi")


def probe(binary: str | None = None) -> dict[str, Any]:
    """Probe the pi host and return the real observed state."""
    binary = binary or find_pi_binary()
    result: dict[str, Any] = {"binary": binary or "", "installed": False}
    if not binary:
        result["reason"] = (
            "pi binary is not on PATH and the PI_BINARY environment variable "
            "is not set")
        return result
    if not (os.path.isfile(binary) and os.access(binary, os.X_OK)):
        result["reason"] = f"pi binary is not installed at {binary}"
        return result
    result["installed"] = True
    try:
        completed = subprocess.run(
            [binary, "--version"], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError) as exc:
        result["reason"] = (
            f"pi binary at {binary} is present but not executable: "
            f"{type(exc).__name__}")
        return result
    result["exit_code"] = completed.returncode
    result["version_stdout"] = completed.stdout.strip()
    result["version_stderr"] = completed.stderr.strip()
    if completed.returncode == 0:
        result["ok"] = True
    else:
        result["reason"] = (
            f"pi --version exited with code {completed.returncode}")
    return result


if __name__ == "__main__":
    print(json.dumps(probe(), ensure_ascii=False, indent=2))
