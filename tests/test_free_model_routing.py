"""Fail-closed zero-cost candidate policy for D_AI model recommendations.

The registry is not an OpenCode billing authority; availability and cost data
must be verified against the connected provider before any future execution.
"""
from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from dai.contracts import Principal
from dai.errors import InvalidRequest
from dai.memory import MemoryStore
from dai.models import ModelRegistry


class FreeOnlyRoutingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="dai-free-models-")
        self.addCleanup(self.temp.cleanup)
        self.store = MemoryStore(Path(self.temp.name) / "state")
        self.owner = Principal("owner")
        self.scope = self.store.create_project(self.owner, "Free models", project_id="free-models")
        self.models = ModelRegistry(self.store)

    def add(self, name, *, provider="opencode", input="0", output="0",
            basis="measured", availability="available", capabilities=None):
        return self.models.register(
            self.owner, self.scope, model_id=name, provider=provider,
            capabilities=["chat"] if capabilities is None else capabilities,
            cost_input_per_1k=input, cost_output_per_1k=output,
            cost_basis=basis, cost_currency="USD", availability=availability)

    def route(self, **kwargs):
        return self.models.route(self.owner, self.scope, task_class="chat",
                                 free_only=True, **kwargs)

    def test_only_verified_zero_input_and_output_opencode_candidates_are_selected(self):
        self.add("truly-free")
        self.add("paid-output", input="0", output="1")
        self.add("paid-input-free-name", input="0.01", output="0")
        self.add("estimated-free", basis="estimated")
        self.add("unverified-cost", basis="unknown")
        self.add("other-provider-free", provider="another")
        self.add("opencode-go-free", provider="opencode-go")
        decision = self.route()
        self.assertFalse(decision["needs_decision"])
        self.assertIn(decision["model"], {"truly-free", "opencode-go-free"})
        self.assertEqual({c["model_id"] for c in decision["candidates"]},
                         {"truly-free", "opencode-go-free"})
        self.assertEqual(decision["unknown_cost_candidates"], [])

    def test_never_falls_back_to_paid_or_unknown_model(self):
        self.add("looks-free", input="0", output="0.1")
        self.add("unknown-output", input="0", output=None)
        self.add("unknown-cost", input=None, output=None, basis="unknown")
        decision = self.route()
        self.assertIsNone(decision["model"])
        self.assertTrue(decision["needs_decision"])
        self.assertIn("free-only", decision["reason"])
        self.assertEqual(decision["candidates"], [])

    def test_unavailable_and_capabilities_fail_closed(self):
        self.add("disabled", availability="unavailable")
        self.add("no-vision", capabilities=["chat"])
        self.assertIsNone(self.route(required_capabilities=["vision"])["model"])
        self.assertEqual(self.route(required_capabilities=["chat"])["model"], "no-vision")

    def test_invalid_free_only_never_coerces_strings(self):
        self.add("truly-free")
        for invalid in ("true", "false", 1, 0, None):
            with self.assertRaises(InvalidRequest):
                self.models.route(self.owner, self.scope, task_class="chat",
                                  free_only=invalid)

    def test_existing_paid_routing_requires_explicit_non_free_mode(self):
        self.add("paid", input="0.2", output="0.5")
        self.assertIsNone(self.route()["model"])
        original = self.models.route(self.owner, self.scope, task_class="chat",
                                     free_only=False)
        self.assertEqual(original["model"], "paid")


if __name__ == "__main__":
    unittest.main()
