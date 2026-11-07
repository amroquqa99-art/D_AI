from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from dai.contracts import Principal, Scope
from dai.errors import AccessDenied, Conflict, InvalidRequest
from dai.memory import MemoryStore
from dai.tools import ToolGateway


class ToolGatewayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dai-tools-")
        self.store = MemoryStore(Path(self.tmp.name) / "state")
        self.owner = Principal("owner")
        self.member = Principal("member")
        self.outsider = Principal("outsider")
        self.scope = self.store.create_project(self.owner, "the-tool-project")
        self.store.grant(self.owner, self.scope, self.member, "contributor")
        self.gateway = ToolGateway(self.store)
        self.tool_local = self.gateway.register(
            self.owner, self.scope, tool_id="tool-a", systems=["alpha", "beta"],
            effect="write", required_capability="decide", side_effect="none",
            data_classes=["logs"], provider="local")
        self.tool_provider = self.gateway.register(
            self.owner, self.scope, tool_id="tool-b", systems=["gamma"],
            effect="read", side_effect="none", provider="github")

    def tearDown(self):
        self.tmp.cleanup()

    def _count_everything(self) -> int:
        total = 0
        for plane in ("person", "project", "global"):
            with self.store._db(plane) as db:
                total += db.execute("SELECT COUNT(*) FROM records").fetchone()[0]
        with self.store._db("project") as db:
            for table in ("tool_index", "tool_systems", "tool_data_classes",
                          "tool_idempotency", "tool_attempts", "component_versions"):
                total += db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        return total

    def test_register_records_tool_and_index_rows(self):
        self.assertEqual(self.tool_local.kind, "tool")
        self.assertEqual(self.tool_local.content["tool_id"], "tool-a")
        self.assertEqual(self.tool_local.content["systems"], ["alpha", "beta"])
        with self.store._db("project") as db:
            systems = db.execute("SELECT system FROM tool_systems WHERE tool_id='tool-a' ORDER BY system").fetchall()
            self.assertEqual([r[0] for r in systems], ["alpha", "beta"])
            row = db.execute("SELECT required_capability, provider FROM tool_index WHERE tool_id='tool-a'").fetchone()
            self.assertEqual(tuple(row), ("decide", "local"))

    def test_register_duplicate_tool_conflicts(self):
        with self.assertRaises(Conflict) as raised:
            self.gateway.register(self.owner, self.scope, tool_id="tool-a", systems=["alpha"],
                                  effect="write")
        self.assertIn("already registered", str(raised.exception))

    def test_resolve_is_allowed_by_owner_policy(self):
        decision = self.gateway.resolve(self.owner, self.scope, tool_id="tool-a",
                                        system="alpha", action="run")
        self.assertTrue(decision["allowed"])
        self.assertEqual(decision["source"], "owner-policy")
        self.assertIn("tool-a", decision["reason"])

    def test_two_systems_may_use_the_same_tool(self):
        first = self.gateway.resolve(self.owner, self.scope, tool_id="tool-a",
                                     system="alpha", action="run")
        second = self.gateway.resolve(self.owner, self.scope, tool_id="tool-a",
                                      system="beta", action="run")
        self.assertTrue(first["allowed"] and second["allowed"])
        self.assertEqual(first["source"], "owner-policy")
        self.assertEqual(second["source"], "owner-policy")

    def test_system_identity_alone_never_bans_a_tool_class(self):
        decision = self.gateway.resolve(self.owner, self.scope, tool_id="tool-a",
                                        system="gamma", action="run")
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["source"], "owner-policy")
        self.assertIn("registration", decision["reason"])
        self.assertIn("tool-a", decision["reason"])

    def test_resolve_names_its_source_on_denial(self):
        decision = self.gateway.resolve(self.member, self.scope, tool_id="tool-a",
                                        system="alpha", action="run")
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["source"], "owner-policy")
        self.assertIn("decide", decision["reason"])
        self.assertIn("member", decision["reason"])

    def test_provider_refusal_is_named_as_source(self):
        decision = self.gateway.resolve(self.owner, self.scope, tool_id="tool-b",
                                        system="gamma", action="read")
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["source"], "provider")
        self.assertIn("github", decision["reason"])

    def test_unregistered_tool_is_denied_by_owner_policy(self):
        decision = self.gateway.resolve(self.owner, self.scope, tool_id="no-such-tool",
                                        system="alpha", action="run")
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["source"], "owner-policy")

    def test_invoke_performs_no_external_effect_and_records_attempt(self):
        before = self._count_everything()
        result = self.gateway.invoke(self.owner, self.scope, tool_id="tool-a",
                                     system="alpha", action="run",
                                     payload={"command": "do something"},
                                     idempotency_key="invoke-1")
        self.assertEqual(result["status"], "AUTHORIZED")
        self.assertFalse(result["executed"])
        self.assertEqual(result["execution_status"], "NOT_EXECUTED")
        self.assertEqual(result["source"], "owner-policy")
        after = self._count_everything()
        self.assertEqual(after, before + 2)  # one attempt row, one idempotency row
        attempts = self.gateway.attempts(self.owner, self.scope, "tool-a")
        self.assertEqual(len(attempts), 1)
        self.assertEqual(attempts[0]["status"], "AUTHORIZED")
        self.assertEqual(attempts[0]["requested_by"], "owner")
        self.assertEqual(attempts[0]["system"], "alpha")
        self.assertEqual(attempts[0]["action"], "run")
        self.assertIsInstance(attempts[0]["created_at"], str)
        self.assertNotIn("payload", attempts[0])
        self.assertNotIn("command", str(attempts))

    def test_invoke_idempotency_key_allows_one_attempt_only(self):
        first = self.gateway.invoke(self.owner, self.scope, tool_id="tool-a",
                                    system="alpha", action="run",
                                    idempotency_key="invoke-2")
        second = self.gateway.invoke(self.owner, self.scope, tool_id="tool-a",
                                     system="alpha", action="run",
                                     idempotency_key="invoke-2")
        self.assertEqual(first["status"], "AUTHORIZED")
        self.assertTrue(second.get("idempotent"))
        attempts = self.gateway.attempts(self.owner, self.scope, "tool-a")
        self.assertEqual(len(attempts), 1)

    def test_invoke_idempotency_key_rejects_different_payload(self):
        self.gateway.invoke(self.owner, self.scope, tool_id="tool-a", system="alpha",
                            action="run", idempotency_key="invoke-3")
        with self.assertRaises(Conflict):
            self.gateway.invoke(self.owner, self.scope, tool_id="tool-a", system="alpha",
                                action="run", payload={"command": "different"},
                                idempotency_key="invoke-3")
        with self.store._db("project") as db:
            row = db.execute("SELECT COUNT(*) FROM tool_attempts WHERE idempotency_key='invoke-3'").fetchone()
            self.assertEqual(row[0], 1)

    def test_invoke_denied_principal_is_recorded_and_denied(self):
        result = self.gateway.invoke(self.member, self.scope, tool_id="tool-a",
                                     system="alpha", action="run")
        self.assertEqual(result["status"], "DENIED")
        self.assertEqual(result["source"], "owner-policy")
        attempts = self.gateway.attempts(self.owner, self.scope, "tool-a")
        self.assertEqual(len(attempts), 1)
        self.assertEqual(attempts[0]["status"], "DENIED")

    def test_invoke_denied_for_unregistered_tool(self):
        result = self.gateway.invoke(self.owner, self.scope, tool_id="no-such-tool",
                                     system="alpha", action="run")
        self.assertEqual(result["status"], "DENIED")
        self.assertEqual(result["source"], "owner-policy")

    def test_invoke_denied_for_provider_refusal(self):
        result = self.gateway.invoke(self.owner, self.scope, tool_id="tool-b",
                                     system="gamma", action="read")
        self.assertEqual(result["status"], "DENIED")
        self.assertEqual(result["source"], "provider")

    def test_catalog_returns_registered_tools(self):
        catalog = self.gateway.catalog(self.owner, self.scope)
        self.assertEqual(len(catalog), 2)
        self.assertEqual({t["tool_id"] for t in catalog}, {"tool-a", "tool-b"})

    def test_outsider_is_denied_with_access_denied(self):
        with self.assertRaises(AccessDenied):
            self.gateway.register(self.outsider, self.scope, tool_id="tool-x",
                                  systems=["alpha"], effect="write")
        with self.assertRaises(AccessDenied):
            self.gateway.invoke(self.outsider, self.scope, tool_id="tool-a",
                                system="alpha", action="run")


if __name__ == "__main__":
    unittest.main()
