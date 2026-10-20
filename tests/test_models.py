from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from dai.contracts import Principal, Scope
from dai.errors import AccessDenied, Conflict, InvalidRequest, NotFound
from dai.memory import MemoryStore
from dai.models import ModelRegistry, COST_BASES, AVAILABILITY


class ModelRegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dai-models-")
        self.store = MemoryStore(Path(self.tmp.name) / "state")
        self.owner = Principal("owner")
        self.other = Principal("other")
        self.scope = self.store.create_project(self.owner, "the-model-project")
        self.registry = ModelRegistry(self.store)
        self.model_a = self.registry.register(
            self.owner, self.scope, model_id="model-a", provider="opencode-test-free",
            capabilities=["chat"], context_window=4096,
            cost_input_per_1k="0.10", cost_output_per_1k="0.20", cost_currency="USD",
            cost_basis="measured", availability="available", notes="primary chat model")
        self.model_b = self.registry.register(
            self.owner, self.scope, model_id="model-b", provider="opencode-test-free",
            capabilities=["chat", "vision"], cost_input_per_1k="0.05",
            cost_output_per_1k="0.10", cost_currency="USD", cost_basis="estimated",
            availability="limited")
        self.model_c = self.registry.register(
            self.owner, self.scope, model_id="model-c", provider="opencode-test-free",
            capabilities=["chat"], availability="available")  # unknown cost

    def tearDown(self):
        self.tmp.cleanup()

    def _count_everything(self) -> int:
        total = 0
        for plane in ("person", "project", "global"):
            with self.store._db(plane) as db:
                total += db.execute("SELECT COUNT(*) FROM records").fetchone()[0]
        with self.store._db("project") as db:
            for table in ("model_index", "model_roles", "model_idempotency",
                          "usage_ledger", "component_versions"):
                total += db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        return total

    def test_register_records_model_and_index_row(self):
        self.assertEqual(self.model_a.kind, "model")
        self.assertEqual(self.model_a.content["model_id"], "model-a")
        self.assertEqual(self.model_a.content["cost_basis"], "measured")
        self.assertEqual(self.model_a.version, 1)
        with self.store._db("project") as db:
            row = db.execute("SELECT cost_basis, availability FROM model_index WHERE model_id='model-a'").fetchone()
            self.assertEqual((row[0], row[1]), ("measured", "available"))
            version = db.execute("SELECT version FROM component_versions WHERE name='models'").fetchone()
            self.assertEqual(version[0], 1)

    def test_register_duplicate_model_conflicts(self):
        with self.assertRaises(Conflict) as raised:
            self.registry.register(self.owner, self.scope, model_id="model-a",
                                   provider="opencode-test-free", capabilities=["chat"])
        self.assertIn("already registered", str(raised.exception))

    def test_register_validates_cost_basis_and_availability(self):
        with self.assertRaises(InvalidRequest):
            self.registry.register(self.owner, self.scope, model_id="model-x",
                                   provider="p", capabilities=["chat"], cost_basis="free")
        with self.assertRaises(InvalidRequest):
            self.registry.register(self.owner, self.scope, model_id="model-y",
                                   provider="p", capabilities=["chat"], availability="maybe")

    def test_register_validates_decimal_amounts(self):
        with self.assertRaises(InvalidRequest):
            self.registry.register(self.owner, self.scope, model_id="model-x",
                                   provider="p", capabilities=["chat"], cost_input_per_1k="not-a-decimal")

    def test_route_prefers_known_cost_over_unknown(self):
        decision = self.registry.route(self.owner, self.scope, task_class="implementation")
        self.assertEqual(decision["model"], "model-b")
        self.assertFalse(decision["needs_decision"])
        model_ids = [c["model_id"] for c in decision["candidates"]]
        self.assertIn("model-a", model_ids)
        self.assertIn("model-b", model_ids)
        self.assertIn("model-c", model_ids)
        self.assertEqual([c["model_id"] for c in decision["unknown_cost_candidates"]], ["model-c"])
        self.assertNotEqual(decision["reason"], "")

    def test_route_never_selects_unknown_cost_when_max_cost_given(self):
        decision = self.registry.route(self.owner, self.scope, task_class="implementation",
                                       max_cost_per_1k="0.01")
        self.assertIsNone(decision["model"])
        self.assertTrue(decision["needs_decision"])
        self.assertIn("model-c", [c["model_id"] for c in decision["unknown_cost_candidates"]])

    def test_route_unknown_cost_not_treated_as_zero(self):
        decision = self.registry.route(self.owner, self.scope, task_class="implementation",
                                       max_cost_per_1k="1000.00")
        self.assertEqual(decision["model"], "model-b")  # known cost wins even though unknown is "free"
        self.assertEqual([c["model_id"] for c in decision["unknown_cost_candidates"]], ["model-c"])

    def test_route_excludes_unavailable_and_unknown_availability(self):
        self.registry.register(self.owner, self.scope, model_id="model-d",
                               provider="opencode-test-free", capabilities=["chat"],
                               cost_input_per_1k="0.01", cost_basis="measured",
                               availability="unavailable")
        self.registry.register(self.owner, self.scope, model_id="model-e",
                               provider="opencode-test-free", capabilities=["chat"],
                               availability="unknown")
        decision = self.registry.route(self.owner, self.scope, task_class="implementation")
        self.assertEqual(decision["model"], "model-b")
        availability = {c["model_id"]: c["availability"] for c in decision["candidates"]}
        self.assertNotIn("model-d", availability)
        self.assertNotIn("model-e", availability)
        self.assertEqual([c["model_id"] for c in decision["unknown_cost_candidates"]], ["model-c"])

    def test_route_no_eligible_model_returns_none_and_needs_decision(self):
        self.registry.register(self.owner, self.scope, model_id="model-d",
                               provider="opencode-test-free", capabilities=["chat", "vision", "edit"],
                               availability="unavailable")
        decision = self.registry.route(self.owner, self.scope, task_class="implementation",
                                       required_capabilities=["vision", "edit"])
        self.assertIsNone(decision["model"])
        self.assertTrue(decision["needs_decision"])
        self.assertIn("model-d", [c["model_id"] for c in decision["candidates"]])
        self.assertEqual(decision["unknown_cost_candidates"], [])

    def test_route_requires_capabilities(self):
        decision = self.registry.route(self.owner, self.scope, task_class="implementation",
                                       required_capabilities=["vision"])
        self.assertEqual(decision["model"], "model-b")
        decision = self.registry.route(self.owner, self.scope, task_class="implementation",
                                       required_capabilities=["vision", "edit"])
        self.assertIsNone(decision["model"])
        self.assertTrue(decision["needs_decision"])

    def test_route_max_cost_uses_decimal_on_strings(self):
        decision = self.registry.route(self.owner, self.scope, task_class="implementation",
                                       max_cost_per_1k="0.07")
        self.assertEqual(decision["model"], "model-b")
        decision = self.registry.route(self.owner, self.scope, task_class="implementation",
                                       max_cost_per_1k="0.04")
        self.assertIsNone(decision["model"])
        self.assertTrue(decision["needs_decision"])
        with self.assertRaises(InvalidRequest):
            self.registry.route(self.owner, self.scope, task_class="implementation",
                                max_cost_per_1k="not-a-decimal")

    def test_catalog_returns_registered_models(self):
        catalog = self.registry.catalog(self.owner, self.scope)
        self.assertEqual(len(catalog), 3)
        self.assertEqual({m["model_id"] for m in catalog}, {"model-a", "model-b", "model-c"})
        by_id = {m["model_id"]: m for m in catalog}
        self.assertEqual(by_id["model-a"]["cost_basis"], "measured")

    def test_get_returns_model_record(self):
        record = self.registry.get(self.owner, self.scope, "model-a")
        self.assertEqual(record.kind, "model")
        self.assertEqual(record.content["provider"], "opencode-test-free")
        with self.assertRaises(NotFound):
            self.registry.get(self.owner, self.scope, "no-such-model")

    def test_choose_records_model_role_assignment(self):
        chosen = self.registry.choose(self.owner, self.scope, model_id="model-a", role="coder",
                                      reason="owner picked the cheap known-cost model",
                                      task_class="implementation",
                                      idempotency_key="choose-1")
        self.assertEqual(chosen.kind, "model")
        self.assertEqual(chosen.id, self.model_a.id)
        with self.store._db("project") as db:
            row = db.execute("SELECT role, reason, task_class FROM model_roles WHERE model_id='model-a' AND role='coder'").fetchone()
            self.assertEqual((row[0], row[2]), ("coder", "implementation"))

    def test_choose_is_idempotent_through_key(self):
        first = self.registry.choose(self.owner, self.scope, model_id="model-a", role="coder",
                                     reason="reason one", task_class="implementation",
                                     idempotency_key="choose-2")
        second = self.registry.choose(self.owner, self.scope, model_id="model-a", role="coder",
                                      reason="reason one", task_class="implementation",
                                      idempotency_key="choose-2")
        self.assertEqual(first.id, second.id)
        self.assertEqual(first.version, second.version)
        with self.store._db("project") as db:
            row = db.execute("SELECT COUNT(*) FROM model_idempotency WHERE key='choose-2'").fetchone()
            self.assertEqual(row[0], 1)

    def test_choose_idempotency_key_rejects_different_payload(self):
        self.registry.choose(self.owner, self.scope, model_id="model-a", role="coder",
                             reason="reason one", task_class="implementation",
                             idempotency_key="choose-3")
        with self.assertRaises(Conflict):
            self.registry.choose(self.owner, self.scope, model_id="model-a", role="coder",
                                 reason="reason two", task_class="implementation",
                                 idempotency_key="choose-3")

    def test_choose_repeat_without_key_is_no_op(self):
        first = self.registry.choose(self.owner, self.scope, model_id="model-a", role="coder",
                                     reason="reason one", task_class="implementation")
        again = self.registry.choose(self.owner, self.scope, model_id="model-a", role="coder",
                                     reason="reason one", task_class="implementation")
        self.assertEqual(first.id, again.id)

    def test_choose_unknown_model_is_rejected(self):
        with self.assertRaises(NotFound):
            self.registry.choose(self.owner, self.scope, model_id="no-such-model", role="coder",
                                 reason="r", task_class="implementation")

    def test_meter_appends_ledger_row(self):
        before = self._count_everything()
        record = self.registry.meter(self.owner, self.scope, model_id="model-a",
                                     task_class="implementation", input_tokens=1000,
                                     output_tokens=200, cache_tokens=50, cost="0.15",
                                     cost_basis="measured", latency_ms=420, status="ok")
        self.assertEqual(record.kind, "model")
        after = self._count_everything()
        self.assertEqual(after, before + 1)  # only the append-only ledger row
        with self.store._db("project") as db:
            row = db.execute("SELECT input_tokens, output_tokens, cache_tokens, cost, cost_basis, status FROM usage_ledger WHERE model_id='model-a'").fetchone()
            self.assertEqual(tuple(row), (1000, 200, 50, "0.15", "measured", "ok"))

    def test_meter_unknown_model_is_rejected(self):
        with self.assertRaises(NotFound):
            self.registry.meter(self.owner, self.scope, model_id="no-such-model",
                                task_class="implementation")

    def test_meter_validates_inputs(self):
        with self.assertRaises(InvalidRequest):
            self.registry.meter(self.owner, self.scope, model_id="model-a",
                                task_class="implementation", input_tokens=-5)
        with self.assertRaises(InvalidRequest):
            self.registry.meter(self.owner, self.scope, model_id="model-a",
                                task_class="implementation", cost_basis="free")
        with self.assertRaises(InvalidRequest):
            self.registry.meter(self.owner, self.scope, model_id="model-a",
                                task_class="implementation", cost="not-a-decimal")

    def test_usage_splits_actual_estimated_and_unknown(self):
        self.registry.meter(self.owner, self.scope, model_id="model-a", task_class="implementation",
                            input_tokens=1000, output_tokens=200, cache_tokens=0, cost="0.15", cost_basis="measured")
        self.registry.meter(self.owner, self.scope, model_id="model-b", task_class="implementation",
                            input_tokens=500, output_tokens=100, cache_tokens=0, cost="0.03", cost_basis="estimated")
        self.registry.meter(self.owner, self.scope, model_id="model-c", task_class="implementation",
                            input_tokens=700, output_tokens=100, cache_tokens=0, cost_basis="unknown")
        usage = self.registry.usage(self.owner, self.scope)
        self.assertEqual(set(usage), {"actual", "estimated", "unknown"})
        self.assertEqual(usage["actual"]["records"], 1)
        self.assertEqual(usage["actual"]["input_tokens"], 1000)
        self.assertEqual(usage["actual"]["output_tokens"], 200)
        self.assertEqual(usage["actual"]["cost"], "0.15")
        self.assertEqual(usage["estimated"]["records"], 1)
        self.assertEqual(usage["estimated"]["cost"], "0.03")
        self.assertEqual(usage["unknown"]["records"], 1)
        self.assertIsNone(usage["unknown"]["cost"])  # unknown cost is never reported as zero

    def test_usage_keeps_none_tokens_out_of_totals(self):
        self.registry.meter(self.owner, self.scope, model_id="model-a", task_class="implementation",
                            input_tokens=None, output_tokens=100, cache_tokens=0, cost_basis="measured")
        self.registry.meter(self.owner, self.scope, model_id="model-a", task_class="implementation",
                            input_tokens=1000, output_tokens=None, cache_tokens=0, cost_basis="estimated")
        usage = self.registry.usage(self.owner, self.scope)
        self.assertEqual(usage["actual"]["records"], 0)
        self.assertEqual(usage["estimated"]["records"], 0)
        self.assertEqual(usage["unknown"]["records"], 2)
        # None token counts never enter the actual or estimated totals.
        self.assertEqual(usage["actual"]["input_tokens"], 0)
        self.assertEqual(usage["actual"]["output_tokens"], 0)
        self.assertEqual(usage["estimated"]["input_tokens"], 0)
        self.assertEqual(usage["estimated"]["output_tokens"], 0)
        self.assertEqual(usage["unknown"]["input_tokens"], 1000)
        self.assertEqual(usage["unknown"]["output_tokens"], 100)

    def test_outsider_cannot_register_or_route(self):
        with self.assertRaises(AccessDenied) as raised:
            self.registry.register(self.other, self.scope, model_id="model-x",
                                   provider="p", capabilities=["chat"])
        self.assertIn("scope", str(raised.exception))
        with self.assertRaises(AccessDenied):
            self.registry.route(self.other, self.scope, task_class="implementation")


if __name__ == "__main__":
    unittest.main()
