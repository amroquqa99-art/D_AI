import importlib.util
import tempfile
import unittest
from pathlib import Path

from dai.contracts import Principal
from dai.memory import MemoryStore

REPO_ROOT = Path(__file__).resolve().parents[1]
ADAPTERS_OPCODE_MCP = REPO_ROOT / "adapters" / "opencode" / "mcp"
import sys
if str(ADAPTERS_OPCODE_MCP) not in sys.path:
    sys.path.insert(0, str(ADAPTERS_OPCODE_MCP))

def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, str(path))
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m

bridge_mod = _load("dai_core_bridge3", ADAPTERS_OPCODE_MCP / "dai_core_bridge.py")
DaiCoreBridge = bridge_mod.DaiCoreBridge


class BridgeMoreToolsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data_root = Path(self.tmp.name) / "state"
        self.project_root = Path(self.tmp.name) / "project"
        self.project_root.mkdir()
        self.bridge = DaiCoreBridge(data_root=self.data_root, project_root=self.project_root)
        self.owner = Principal("dai-os")
        self.project = self.bridge.store.create_project(self.owner, "P")
        self.pid = self.project.project

    def tearDown(self):
        self.tmp.cleanup()

    def test_charter_propose_assess_active(self):
        from tests.test_tasks import charter_content
        d = self.bridge.dai_charter_propose(self.owner, self.pid, charter_content())
        self.assertIn("id", d)
        draft_id = d["id"]
        a = self.bridge.dai_charter_assess(self.owner, self.pid, draft_id)
        # approve (version 1)
        self.bridge.dai_charter_approve(self.owner, self.pid, draft_id, 1)
        active = self.bridge.dai_charter_active(self.owner, self.pid)
        self.assertIsNotNone(active)

    def test_decision_record_list(self):
        r = self.bridge.dai_decision_record(self.owner, self.pid, text="dec", meaning="m",
                                            authorization_source="owner", affects=[])
        self.assertIn("id", r)
        lst = self.bridge.dai_decision_list(self.owner, self.pid)
        self.assertEqual(len(lst), 1)

    def test_update_status(self):
        r = self.bridge.dai_update_status(self.owner)
        self.assertIsInstance(r, dict)

    def test_model_list(self):
        ml = self.bridge.dai_model_list(self.owner, self.pid)
        self.assertIsInstance(ml, list)

    def test_tool_list(self):
        tl = self.bridge.dai_tool_list(self.owner, self.pid)
        self.assertIsInstance(tl, list)

    def test_memory_create_list(self):
        import json as _j
        rec = self.bridge.dai_memory_create(self.owner, self.pid, kind="note",
                                           content={"x": 1})
        self.assertIn("id", rec)
        lst = self.bridge.dai_memory_list(self.owner, self.pid, kind="note")
        self.assertEqual(len(lst), 1)

    def test_project_list(self):
        pl = self.bridge.dai_project_list(self.owner)
        self.assertTrue(any((p.get("scope") or {}).get("project") == self.pid for p in pl))


def _json(obj):
    import json
    return json.dumps(obj)


if __name__ == "__main__":
    unittest.main()