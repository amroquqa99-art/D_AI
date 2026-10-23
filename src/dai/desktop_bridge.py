"""Read-only loopback bridge for future D_AI Desktop Electron main process.

Only reports the real runtime status and sanitized system catalog.
No model calls, mutations, CORS, or renderer access are provided.
"""
from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import json
import os
from pathlib import Path
import sys
from typing import Any
from urllib.parse import urlsplit

from . import __version__
from .contracts import Principal, identifier
from .errors import DaiError
from .memory import MemoryStore

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG = ROOT / "config" / "systems.json"
TOKEN_VARIABLE = "DAI_DESKTOP_BRIDGE_TOKEN"
MAX_CATALOG_BYTES = 256 * 1024


def read_catalog(path: Path) -> dict[str, Any]:
    """Return only the published system identity and maturity metadata."""
    if not path.is_file() or path.stat().st_size > MAX_CATALOG_BYTES:
        raise ValueError("Missing or oversized D_AI system catalog")
    try:
        source = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeError, ValueError) as exc:
        raise ValueError("Invalid D_AI system catalog") from exc
    systems = source.get("systems")
    if not isinstance(systems, dict) or not systems:
        raise ValueError("Invalid D_AI system inventory")
    output = []
    for name, meta in sorted(systems.items()):
        if not isinstance(name, str) or not isinstance(meta, dict):
            raise ValueError("Invalid D_AI system entry")
        output.append({
            "id": name,
            "primary": meta.get("primary"),
            "roles": meta.get("roles", []),
            "maturity": meta.get("maturity", "UNKNOWN"),
            "professional_validation": meta.get("professional_validation", "UNKNOWN"),
        })
    return {"schema_version": source.get("schema_version"), "systems": output}


def make_server(token: str, catalog: dict[str, Any], port: int = 0,
                store: MemoryStore | None = None) -> ThreadingHTTPServer:
    if not isinstance(token, str) or len(token) < 32:
        raise ValueError("A 32+ character random bridge token is required")
    if not isinstance(port, int) or not 0 <= port <= 65535:
        raise ValueError("Invalid bridge port")
    token_bytes = token.encode("utf-8")
    # The child is started by this OS account. Never trust a principal
    # supplied by an HTTP caller or renderer IPC arguments.
    actor = Principal(store.vault.installation["administrator"]) if store is not None else None

    class Handler(BaseHTTPRequestHandler):
        server_version = "DAI-Desktop-Bridge"
        sys_version = ""

        def log_message(self, fmt: str, *args: Any) -> None:
            # Avoid recording secrets or untrusted request paths.
            pass

        def respond(self, status: int, data: dict[str, Any]) -> None:
            payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def allowed(self) -> bool:
            if self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}":
                self.respond(403, {"error": "forbidden_host"})
                return False
            supplied = self.headers.get("X-DAI-Bridge-Token", "")
            if not hmac.compare_digest(supplied.encode("utf-8"), token_bytes):
                self.respond(401, {"error": "unauthorized"})
                return False
            return True

        def do_GET(self) -> None:
            if not self.allowed():
                return
            path = urlsplit(self.path)
            if path.query or path.fragment:
                self.respond(400, {"error": "invalid_request"})
            elif path.path == "/v1/health":
                self.respond(200, {"service": "dai-desktop-bridge",
                                   "status": "ok", "version": __version__, "mode": "read_only"})
            elif path.path == "/v1/systems":
                self.respond(200, catalog)
            elif path.path == "/v1/capabilities":
                self.respond(200, {"schema_version": 1, "catalog": "available",
                                   "missions": "read_only" if store is not None else "not_wired",
                                   "execution": "not_wired",
                                   "desktop_ui": "not_wired"})
            elif path.path == "/v1/projects":
                if store is None or actor is None:
                    self.respond(503, {"error": "missions_not_wired"})
                    return
                try:
                    projects = store.projects(actor)
                    self.respond(200, {"projects": [
                        {"id": item.scope.project, "name": item.content.get("name", "")}
                        for item in projects if item.scope.project
                    ]})
                except DaiError:
                    self.respond(403, {"error": "not_available"})
            elif path.path.startswith("/v1/projects/") and path.path.endswith("/missions"):
                if store is None or actor is None:
                    self.respond(503, {"error": "missions_not_wired"})
                    return
                parts = path.path.split("/")
                if len(parts) != 5 or parts[1:3] != ["v1", "projects"] or parts[4] != "missions":
                    self.respond(404, {"error": "not_found"})
                    return
                try:
                    project_id = identifier(parts[3])
                    scope = store.project_scope(actor, project_id)
                    missions = store.list(actor, scope, kind="mission", limit=50)
                    self.respond(200, {"project_id": project_id, "missions": [
                        {
                            "id": item.id, "system": item.content.get("system", ""),
                            "objective": item.content.get("objective", ""),
                            "status": item.content.get("status", "UNKNOWN"),
                            "next_action": item.content.get("next_action", ""),
                            "version": item.version,
                        } for item in missions
                    ]})
                except DaiError:
                    # Both nonexistent and unauthorized projects return the same response.
                    self.respond(404, {"error": "not_found"})
            else:
                self.respond(404, {"error": "not_found"})

        def do_POST(self) -> None:
            if self.allowed():
                self.respond(405, {"error": "read_only"})

        do_PUT = do_POST
        do_PATCH = do_POST
        do_DELETE = do_POST

        def do_OPTIONS(self) -> None:
            self.respond(405, {"error": "cors_disabled"})

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    return server


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="D_AI read-only Desktop development bridge")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    options = parser.parse_args(argv)
    token = os.environ.get(TOKEN_VARIABLE, "")
    if len(token) < 32:
        print(f"ERROR: Set {TOKEN_VARIABLE} to a securely generated 32+ character token",
              file=sys.stderr)
        return 2
    try:
        catalog = read_catalog(options.catalog)
        data_root = Path(os.environ.get("DAI_DATA_ROOT") or Path.home() / ".d-ai")
        store = MemoryStore(data_root)
        with make_server(token, catalog, options.port, store=store) as server:
            print(json.dumps({"event": "READY", "address": "127.0.0.1",
                              "port": server.server_port}), flush=True)
            server.serve_forever(poll_interval=0.2)
    except (OSError, ValueError) as exc:
        print(f"ERROR: Desktop bridge unavailable ({exc})", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
