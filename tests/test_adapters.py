from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from dai.contracts import Principal
from dai.errors import AccessDenied, InvalidRequest, NotFound
from dai.memory import MemoryStore

REPO_ROOT = Path(__file__).resolve().parents[1]
ADAPTERS_OPCODE_MCP = REPO_ROOT / "adapters" / "opencode" / "mcp"
ADAPTERS_OPCODE = REPO_ROOT / "adapters" / "opencode"
ADAPTERS_PI = REPO_ROOT / "adapters" / "pi"

for p in (str(ADAPTERS_OPCODE_MCP), str(ADAPTERS_OPCODE), str(ADAPTERS_PI)):
    if p not in sys.path:
        sys.path.insert(0, p)


def _load_module(file_path, module_name):
    spec = importlib.util.spec_from_file_location(module_name, str(file_path))
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


dai_core_bridge = _load_module(
    ADAPTERS_OPCODE_MCP / "dai_core_bridge.py", "dai_core_bridge")
DaiCoreBridge = dai_core_bridge.DaiCoreBridge
error_payload = DaiCoreBridge.error_payload

server = _load_module(ADAPTERS_OPCODE_MCP / "server.py", "server")
mcp = server.mcp

opencode_probe = _load_module(
    ADAPTERS_OPCODE / "probe.py", "opencode_probe_mod")
run_probe = opencode_probe.run_probe

# Load the pi probe under the bare name 'probe' so pi_adapter's
# `from probe import probe` resolves to the pi host probe (not the opencode
# probe, which shares the same top-level module name).
_pi_probe_mod = _load_module(ADAPTERS_PI / "probe.py", "probe")
pi_adapter = _load_module(ADAPTERS_PI / "pi_adapter.py", "pi_adapter")
probe_capabilities = pi_adapter.probe_capabilities
operation_descriptor = pi_adapter.operation_descriptor
SUPPORTED = pi_adapter.SUPPORTED
UNVERIFIED = pi_adapter.UNVERIFIED
NOT_INSTALLED = pi_adapter.NOT_INSTALLED


class _FakeNativeClient:
    def __init__(self, session=None, exc=None):
        self._session = session
        self._exc = exc

    def session(self, session_id):
        if self._exc is not None:
            raise self._exc
        return self._session


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dai-adapters-")
        self.store = MemoryStore(Path(self.tmp.name) / "state")
        self.actor = Principal("owner")
        self.scope = self.store.create_project(self.actor, "Research")

    def tearDown(self):
        self.tmp.cleanup()

    # ---- Case 1: bridge refuses unknown / non-native session ids ----

    def test_bridge_refuses_unknown_and_non_native_session_ids(self):
        bridge = DaiCoreBridge(data_root=self.tmp.name)
        with self.assertRaises(InvalidRequest):
            bridge.resolve_principal(None)
        with self.assertRaises(InvalidRequest):
            bridge.resolve_principal("not-a-session")
        with self.assertRaises(InvalidRequest):
            bridge.resolve_principal("ses/with/slash")
        # An unreadable native session is refused (AccessDenied), never fabricated.
        with self.assertRaises(AccessDenied):
            bridge.resolve_principal(
                "ses_unknown",
                native_client=_FakeNativeClient(exc=OSError("host absent")),
            )
        # A well-formed native session with a DAI agent resolves to a real principal.
        principal = bridge.resolve_principal(
            "ses_valid",
            native_client=_FakeNativeClient(session={"agent": "dai-agent"}),
        )
        self.assertEqual(principal.id, "dai-agent")

    # ---- Case 2: core exception -> JSON-safe error payload ----

    def test_core_exception_converts_to_json_safe_error_payload(self):
        payload = error_payload(NotFound("Project not found"))
        self.assertEqual(payload, {"error": "NotFound", "message": "Project not found"})
        self.assertNotIn("traceback", payload)
        self.assertIsInstance(payload["message"], str)
        payload = error_payload(AccessDenied("Memory is outside the actor's scope"))
        self.assertEqual(payload["error"], "AccessDenied")
        self.assertEqual(set(payload.keys()), {"error", "message"})
        self.assertNotIn("private", payload["message"].lower())

    # ---- Case 3: OpenCode probe reports NOT_INSTALLED with a reason ----

    def test_opencode_probe_reports_not_installed_with_reason(self):
        result = run_probe(binary="/nonexistent/opencode-binary-xyz")
        self.assertFalse(result["host"]["installed"])
        self.assertIn("reason", result["host"])
        for name, cap in result["capabilities"].items():
            self.assertEqual(cap["status"], "NOT_INSTALLED", msg=name)
            self.assertIn("reason", cap)

    # ---- Case 4: pi capability map marks unobserved as UNVERIFIED ----

    def test_pi_capability_map_marks_unobserved_unverified_never_supported(self):
        # Binary absent -> every capability NOT_INSTALLED with a reason.
        result = probe_capabilities(binary="/nonexistent/pi-binary-xyz")
        self.assertFalse(result["pi"]["installed"])
        for name, cap in result["capabilities"].items():
            self.assertEqual(cap["status"], NOT_INSTALLED, msg=name)
            self.assertIn("reason", cap)
        # Binary present but no session observed -> every capability UNVERIFIED.
        result = probe_capabilities(binary="/bin/true")
        self.assertTrue(result["pi"]["installed"])
        for name, cap in result["capabilities"].items():
            self.assertIn("status", cap)
            self.assertIn("reason", cap)
            self.assertEqual(cap["status"], UNVERIFIED, msg=name)
            self.assertNotEqual(cap["status"], SUPPORTED)

    # ---- Case 5: pi operation descriptor performs no action ----

    def test_pi_operation_descriptor_performs_no_action(self):
        descriptor = operation_descriptor("dai_task_create")
        self.assertEqual(descriptor["host"], "pi")
        self.assertEqual(descriptor["action"], "subagent.spawn")
        self.assertEqual(descriptor["request"]["kind"], "subagent.spawn")
        self.assertEqual(
            descriptor["request"]["metadata"]["dai_operation"], "dai_task_create")
        self.assertIn("params", descriptor)
        self.assertIs(descriptor["executed"], False)
        self.assertIn("no external action", descriptor["note"])
        # No subprocess/network call happens: force subprocess.run to raise if called.
        original_run = subprocess.run

        def _boom(*a, **k):
            raise AssertionError("subprocess must not be called by operation_descriptor")

        subprocess.run = _boom
        try:
            operation_descriptor("dai_project_create")
        finally:
            subprocess.run = original_run
        with self.assertRaises(InvalidRequest):
            operation_descriptor("dai_no_such_operation")

    # ---- Case 6: MCP server imports and registers expected tools ----

    def _tool_names(self):
        tm = getattr(mcp, "_tool_manager", None)
        if tm is None:
            return set()
        tools = getattr(tm, "_tools", None) or getattr(tm, "tools", None)
        if tools is None:
            return set()
        return set(tools.keys())

    def test_mcp_server_imports_and_registers_expected_tools(self):
        tool_names = self._tool_names()
        self.assertTrue(tool_names, "FastMCP _tool_manager should expose registered tools")
        expected = {
            "dai_project_create", "dai_charter_approve",
            "dai_task_create", "dai_task_state",
            "dai_decision_record", "dai_team_message",
            "dai_consultation_open", "dai_model_route",
            "dai_tool_resolve", "dai_component_decide",
            "dai_update_status", "dai_memory_search",
            "dai_mission_create", "dai_mission_get", "dai_mission_checkpoint",
            "dai_evidence_add", "dai_claim_add", "dai_search_files",
            "dai_project_grant",
        }
        missing = expected - tool_names
        self.assertFalse(missing, f"missing MCP tools: {sorted(missing)}")

    # ---- Case 7: round trip through the bridge on a temp data root ----

    def test_bridge_round_trip_project_and_memory_record(self):
        with tempfile.TemporaryDirectory(prefix="dai-adapter-roundtrip-") as tmp:
            bridge = DaiCoreBridge(data_root=tmp)
            actor = Principal("owner")
            project = bridge.dai_project_create(actor, "Adapter Round Trip")
            self.assertEqual(project["namespace"], "project")
            self.assertEqual(project["owner"], "owner")
            project_id = project["project"]
            self.assertIn(
                project_id,
                [p["scope"]["project"] for p in bridge.dai_project_list(actor)])
            record = bridge.dai_memory_create(
                actor, project_id, "note", {"text": "round-trip payload"})
            self.assertEqual(record["kind"], "note")
            self.assertEqual(record["status"], "ACTIVE")
            self.assertEqual(record["version"], 1)
            self.assertEqual(record["content"], {"text": "round-trip payload"})
            read_back = bridge.dai_memory_get(actor, project_id, record["id"])
            self.assertEqual(read_back["id"], record["id"])
            self.assertEqual(read_back["content"], {"text": "round-trip payload"})
            self.assertEqual(read_back["scope"]["project"], project_id)

    def test_project_owner_can_share_mission_with_known_manager(self):
        with tempfile.TemporaryDirectory(prefix="dai-sharing-") as directory:
            bridge = DaiCoreBridge(data_root=directory)
            owner = Principal("dai-os")
            specialist = Principal("dai-research")
            created = bridge.dai_project_create(owner, "Coordinated research")
            project_id = created["project"]
            mission = bridge.dai_mission_create(
                owner, project_id, "research", "Review claims", ["checked sources"])
            from dai.errors import AccessDenied
            with self.assertRaises(AccessDenied):
                bridge.dai_mission_get(specialist, project_id, mission["mission_id"])
            bridge.dai_project_grant(owner, project_id, "dai-research", "contributor")
            record = bridge.dai_mission_get(specialist, project_id, mission["mission_id"])
            self.assertEqual(record["objective"], "Review claims")
            with self.assertRaises(AccessDenied):
                bridge.dai_project_grant(specialist, project_id, "dai-cyber", "contributor")

    # ---- Case 8: destructive operations not exposed as MCP tools ----

    def test_destructive_operations_not_exposed_as_mcp_tools(self):
        tool_names = self._tool_names()
        self.assertFalse(any("purge" in name for name in tool_names))
        self.assertNotIn("dai_backup_restore", tool_names)
        self.assertIn("dai_backup_create", tool_names)


if __name__ == "__main__":
    unittest.main()
