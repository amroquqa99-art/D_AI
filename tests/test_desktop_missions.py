"""Authenticated, read-only Desktop-to-OS mission contract tests.

Every test exercises HTTP over loopback, not merely the service functions.
"""
from __future__ import annotations

import http.client
import json
from pathlib import Path
import tempfile
from threading import Thread
import unittest

from dai.contracts import Principal
from dai.desktop_bridge import make_server
from dai.memory import MemoryStore
from dai.mission import MissionService

TOKEN = "test-local-main-process-token-32-bytes"


class DesktopMissionBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="dai-desktop-mission-")
        self.addCleanup(self.temp.cleanup)
        self.store = MemoryStore(Path(self.temp.name) / "state")
        self.owner = Principal("owner")
        self.project = self.store.create_project(self.owner, "Visible project", project_id="visible")
        self.other = Principal("other")
        self.store.create_project(self.other, "Private project", project_id="private")
        self.missions = MissionService(self.store)
        created = self.missions.create(self.owner, "visible",
                                       system="engineer", objective="Verify local build",
                                       acceptance=["Artifacts checked"])
        self.mission_id = created["mission_id"]
        self.missions.evidence_add(self.owner, "visible", self.mission_id,
                                   title="Raw secret source", locator="local-document",
                                   content="DO_NOT_LEAK_PRIVATE_EVIDENCE")
        self.server = make_server(TOKEN, {"schema_version": 1, "systems": []},
                                  store=self.store)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.thread.join, 2)
        self.addCleanup(self.server.shutdown)

    def call(self, path: str, token: str | None = TOKEN, method: str = "GET"):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        headers = {"Host": f"127.0.0.1:{self.server.server_port}"}
        if token:
            headers["X-DAI-Bridge-Token"] = token
        try:
            conn.request(method, path, headers=headers)
            response = conn.getresponse()
            return response.status, json.loads(response.read())
        finally:
            conn.close()

    def test_only_accessible_projects_are_enumerated(self):
        status, payload = self.call("/v1/projects")
        self.assertEqual(status, 200)
        self.assertEqual(payload, {"projects": [{"id": "visible", "name": "Visible project"}]})

    def test_mission_list_excludes_evidence_and_approval_material(self):
        status, payload = self.call("/v1/projects/visible/missions")
        self.assertEqual(status, 200)
        self.assertEqual(payload["project_id"], "visible")
        self.assertEqual(len(payload["missions"]), 1)
        mission = payload["missions"][0]
        self.assertEqual((mission["id"], mission["status"], mission["version"]),
                         (self.mission_id, "PLANNED", 1))
        self.assertEqual(mission["objective"], "Verify local build")
        self.assertEqual(set(mission), {"id", "system", "objective", "status",
                                       "next_action", "version"})
        self.assertNotIn("DO_NOT_LEAK_PRIVATE_EVIDENCE", str(payload))

    def test_other_project_and_invalid_identity_are_not_exposed(self):
        for path in ("/v1/projects/private/missions",
                     "/v1/projects/nonexistent/missions",
                     "/v1/projects/%2f/missions",
                     "/v1/projects/../missions"):
            status, payload = self.call(path)
            self.assertEqual(status, 404, (path, payload))
            self.assertEqual(payload, {"error": "not_found"})

    def test_untrusted_token_and_writes_cannot_read_or_modify_missions(self):
        for path in ("/v1/projects", "/v1/projects/visible/missions"):
            self.assertEqual(self.call(path, token=None)[0], 401)
            self.assertEqual(self.call(path, token="wrong")[0], 401)
            self.assertEqual(self.call(path, method="POST"),
                             (405, {"error": "read_only"}))
        self.assertEqual(len(self.store.list(self.owner, self.project, kind="mission")), 1)

    def test_capabilities_report_read_only_not_execution(self):
        status, payload = self.call("/v1/capabilities")
        self.assertEqual(status, 200)
        self.assertEqual(payload["missions"], "read_only")
        self.assertEqual(payload["execution"], "not_wired")


if __name__ == "__main__":
    unittest.main()
