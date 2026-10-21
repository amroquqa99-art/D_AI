"""Entry point for the D_AI MCP server.

The server implementation lives with its host adapter, because it speaks the
host's own tool protocol. This module is the stable, installable name a host
configuration can point at, so the adapter can move without the host
configuration changing.

It also refuses to start when the core cannot be imported: an MCP server that
answers with an import error is worse than one that refuses to start.
"""

from __future__ import annotations

import os
from pathlib import Path
import sys


def _adapter_directory() -> Path:
    """The MCP adapter directory that ships with this installation."""
    override = os.environ.get("DAI_MCP_ADAPTER")
    if override:
        return Path(override).expanduser().resolve()
    # src/dai/mcp_server.py -> repository root -> adapters/opencode/mcp
    root = Path(__file__).resolve().parents[2]
    return root / "adapters" / "opencode" / "mcp"


def main(argv: list[str] | None = None) -> int:
    try:
        import dai  # noqa: F401  - fail fast when the core is missing
    except Exception as exc:  # noqa: BLE001 - the message must name the real cause
        print(f"D_AI MCP server cannot start: the core is not importable ({exc}).",
              file=sys.stderr)
        return 2

    directory = _adapter_directory()
    if not (directory / "server.py").is_file():
        print(f"D_AI MCP server cannot start: no adapter at {directory}.",
              file=sys.stderr)
        return 2
    sys.path.insert(0, str(directory))
    os.environ.setdefault("DAI_PROJECT_ROOT", str(directory.parents[2]))

    from server import mcp  # noqa: PLC0415 - the adapter is loaded on purpose

    mcp.run(transport="stdio")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
