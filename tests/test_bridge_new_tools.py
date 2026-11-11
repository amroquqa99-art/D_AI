import importlib.util
import tempfile
import unittest
from pathlib import Path

from dai.contracts import Principal
from dai.memory import MemoryStore

REPO_ROOT = Path(__file__).resolve().parents[1]
ADAPTERS_OPCODE_MCP = REPO_ROOT / "adapters" / "opencode" / "mcp"
sys_path = str(ADAPTERS_OPCODE_MCP)
import sys
if sys_path not in sys.path:
    sys.path.insert(0, sys_path)

def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, str(path))
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m

bridge_mod = _load("dai_core_bridge2", ADAPTERS_OPCODE_MCP / "dai_core_bridge.py")
DaiCoreBridge = bridge_mod.DaiCoreBridge


class BridgeNewToolsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data_root = Path(self.tmp.name) / "state"
        self.project_root = Path(self.tmp.name) / "project"
        self.project_root.mkdir()
        self.bridge = DaiCoreBridge(data_root=self.data_root, project_root=self.project_root,
                                   native_client=None)
        # bypass native session resolution by using a fake actor via direct service? 
        # Bridge methods require actor; tests call service directly instead.
        self.store = self.bridge.store
        self.owner = Principal("dai-os")
        self.project = self.store.create_project(self.owner, "P")
        self.pid = self.project.project
        self.missions = self.bridge.missions
        self.created = self.missions.create(self.owner, self.pid, system="research",
                                           objective="obj", acceptance=["a"])

    def tearDown(self):
        self.tmp.cleanup()

    def test_mission_list(self):
        res = self.bridge.dai_mission_list(self.owner, self.pid)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["mission_id"], self.created["mission_id"])

    def test_evidence_and_claim_list(self):
        mid = self.created["mission_id"]
        src = self.missions.evidence_add(self.owner, self.pid, mid, title="t", locator="l", content="c")
        claim = self.missions.claim_add(self.owner, self.pid, mid, text="fact", claim_type="FACT",
                                       source_ids=[src["source_id"]])
        ev = self.bridge.dai_evidence_list(self.owner, self.pid, mid)
        cl = self.bridge.dai_claim_list(self.owner, self.pid, mid)
        self.assertEqual(len(ev), 1)
        self.assertEqual(len(cl), 1)

    def test_calculate_decimal(self):
        r = self.bridge.dai_calculate_decimal(self.owner, "sum", ["1", "2", "3"])
        self.assertEqual(r["result"], "6")

    def test_summarize_csv(self):
        r = self.bridge.dai_summarize_csv(self.owner, "a,b\n1,2\n3,4")
        self.assertEqual(r["rows"], 2)

    def test_extract_pdf_rejects_non_pdf(self):
        (self.project_root / "note.txt").write_text("x")
        with self.assertRaises(Exception):
            self.bridge.dai_extract_pdf(self.owner, self.pid, "note.txt")

    def test_crossref_search_validates(self):
        with self.assertRaises(Exception):
            self.bridge.dai_crossref_search(self.owner, "", rows=0)


if __name__ == "__main__":
    unittest.main()