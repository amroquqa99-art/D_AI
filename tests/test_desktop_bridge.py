from __future__ import annotations
import http.client
import json
from pathlib import Path
import tempfile
from threading import Thread
import unittest
from dai.desktop_bridge import make_server, read_catalog

TOKEN = "0123456789abcdef0123456789abcdef"


class DesktopBridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        catalog = Path(self.tmp.name) / "systems.json"
        catalog.write_text(json.dumps({"schema_version": 1, "systems": {
            "engineer": {"primary": "dai-engineer", "roles": ["tester"],
                         "maturity": "CONFIGURED", "secret": "must-not-leak"}
        }}), encoding="utf-8")
        self.server = make_server(TOKEN, read_catalog(catalog), 0)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.thread.join, 2)
        self.addCleanup(self.server.shutdown)

    def request(self, method, path, token=TOKEN, host=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        headers = {"Host": host or f"127.0.0.1:{self.server.server_port}"}
        if token is not None:
            headers["X-DAI-Bridge-Token"] = token
        try:
            conn.request(method, path, headers=headers)
            response = conn.getresponse()
            body = json.loads(response.read())
            return response.status, body
        finally:
            conn.close()

    def test_read_only_catalog_excludes_unknown_fields(self):
        status, data = self.request("GET", "/v1/systems")
        self.assertEqual(status, 200)
        self.assertEqual(data["systems"][0]["id"], "engineer")
        self.assertNotIn("must-not-leak", str(data))

    def test_health_and_explicit_capabilities(self):
        code, data = self.request("GET", "/v1/health")
        self.assertEqual((code, data["mode"]), (200, "read_only"))
        code, data = self.request("GET", "/v1/capabilities")
        self.assertEqual((code, data["execution"]), (200, "not_wired"))

    def test_authentication_blocks_untrusted_clients(self):
        for token in (None, "bad"):
            code, data = self.request("GET", "/v1/systems", token=token)
            self.assertEqual((code, data["error"]), (401, "unauthorized"))

    def test_host_header_must_be_loopback(self):
        code, data = self.request("GET", "/v1/systems", host="evil.example")
        self.assertEqual((code, data["error"]), (403, "forbidden_host"))

    def test_mutation_and_cors_are_disabled(self):
        for method in ("POST", "PUT", "PATCH", "DELETE"):
            code, data = self.request(method, "/v1/systems")
            self.assertEqual((code, data["error"]), (405, "read_only"))
        code, data = self.request("OPTIONS", "/v1/systems", token=None)
        self.assertEqual((code, data["error"]), (405, "cors_disabled"))

    def test_rejects_bad_catalog(self):
        bad = Path(self.tmp.name) / "bad.json"
        bad.write_text('{"systems":{}}', encoding="utf-8")
        with self.assertRaises(ValueError):
            read_catalog(bad)
        bad.write_text("a" * (256 * 1024 + 1), encoding="utf-8")
        with self.assertRaises(ValueError):
            read_catalog(bad)

    def test_invalid_token_fails_closed(self):
        with self.assertRaises(ValueError):
            make_server("short", {"systems": []})


if __name__ == "__main__":
    unittest.main()
