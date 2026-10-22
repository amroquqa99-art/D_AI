from __future__ import annotations
import tempfile
import unittest
from pathlib import Path
from dai.contracts import Principal
from dai.errors import AccessDenied, Conflict, InvalidRequest
from dai.memory import MemoryStore
from dai.mission import MissionService


class MissionJournalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = MemoryStore(Path(self.tmp.name) / "state")
        self.owner = Principal("dai-os")
        self.other = Principal("dai-research")
        self.project = self.store.create_project(self.owner, "Test project")
        self.missions = MissionService(self.store)
        self.created = self.missions.create(
            self.owner, self.project.project, system="research",
            objective="Verify a research claim", acceptance=["Evidence", "Reviewed report"])

    def tearDown(self):
        self.tmp.cleanup()

    def test_original_sources_and_claims_are_encrypted_at_rest(self):
        mid = self.created["mission_id"]
        source = self.missions.evidence_add(
            self.owner, self.project.project, mid,
            title="Original", locator="https://example.org/data",
            content="confidential-evidence-marker")
        claim = self.missions.claim_add(
            self.owner, self.project.project, mid, text="Evidence-backed fact",
            claim_type="FACT", source_ids=[source["source_id"]])
        self.assertEqual(claim["type"], "FACT")
        self.assertEqual(self.missions.get(self.owner, self.project.project, mid)["claims_count_in_first_200"], 1)
        data = b"".join(p.read_bytes() for p in (Path(self.tmp.name) / "state").glob("*.db"))
        self.assertNotIn(b"confidential-evidence-marker", data)

    def test_unknown_or_cross_mission_evidence_is_rejected(self):
        with self.assertRaises(InvalidRequest):
            self.missions.claim_add(self.owner, self.project.project, self.created["mission_id"],
                                    text="Unproven", claim_type="FACT")
        other = self.missions.create(self.owner, self.project.project, system="research",
                                     objective="Different mission", acceptance=["report"])
        src = self.missions.evidence_add(
            self.owner, self.project.project, other["mission_id"],
            title="source", locator="file://source", content="original")
        with self.assertRaises(InvalidRequest):
            self.missions.claim_add(self.owner, self.project.project, self.created["mission_id"],
                                    text="Wrong provenance", claim_type="FACT",
                                    source_ids=[src["source_id"]])

    def test_checkpoints_require_receipts_and_version_and_review(self):
        mid = self.created["mission_id"]
        with self.assertRaises(InvalidRequest):
            self.missions.checkpoint(self.owner, self.project.project, mid,
                                     expected_version=1, status="COMPLETED",
                                     next_action="done")
        receipt = self.missions.checkpoint(
            self.owner, self.project.project, mid, expected_version=1,
            status="RUNNING", next_action="Collect data")
        self.assertEqual(receipt["version"], 2)
        with self.assertRaises(Conflict):
            self.missions.checkpoint(self.owner, self.project.project, mid,
                                     expected_version=1, status="RUNNING",
                                     next_action="again")

    def test_principal_isolation_is_enforced(self):
        with self.assertRaises(AccessDenied):
            self.missions.get(self.other, self.project.project, self.created["mission_id"])


if __name__ == "__main__":
    unittest.main()
