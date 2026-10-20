from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

from dai.charters import CharterService, gaps
from dai.contracts import Principal
from dai.errors import AccessDenied, Conflict, InvalidRequest, NotFound
from dai.memory import MemoryStore


def charter():
    return {"objective": "Produce sourced research proposals", "deliverables": ["proposal cards"],
            "acceptance": ["every factual claim supported"], "stop_conditions": ["approved scope delivered"],
            "allowed_models": ["opencode/test-free"], "autonomy": "plan_once",
            "data_exceptions": [], "external_actions": [],
            "scope": {"include": ["literature research"], "exclude": ["perform medical experiments"]},
            "budgets": {"money": {"mode": "limit", "amount": "0", "currency": "USD"},
                        "tokens": {"mode": "limit", "amount": 10000},
                        "time": {"mode": "limit", "amount": 3600}},
            "workflow": {"method": "candidate literature gap protocol", "basis": "Owner-approved pilot",
                         "method_status": "candidate", "steps": [
                             {"id": "sources", "objective": "Find source papers", "responsibility": "researcher",
                              "failure_policy": "request unavailable data", "dependencies": [], "tools": ["search"],
                              "outputs": ["source records"], "acceptance": ["sources actually accessible"]},
                             {"id": "review", "objective": "Review source support", "responsibility": "reviewer",
                              "failure_policy": "report unsupported claims", "dependencies": ["sources"], "tools": [],
                              "outputs": ["review"], "acceptance": ["source locators checked"]}]}}


class CharterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dai-charters-")
        self.store = MemoryStore(Path(self.tmp.name) / "state")
        self.actor = Principal("owner")
        self.scope = self.store.create_project(self.actor, "Research")
        self.service = CharterService(self.store)

    def tearDown(self):
        self.tmp.cleanup()

    def test_incomplete_request_is_preserved_and_blocks_approval_without_inventing_answers(self):
        draft = self.service.propose(self.actor, self.scope, {"objective": "Make ideas"})
        report = self.service.assess(self.actor, self.scope, draft.id)
        self.assertFalse(report["ready_for_approval"])
        self.assertIn("budgets.money.mode", report["missing"])
        with self.assertRaises(InvalidRequest):
            self.service.approve(self.actor, self.scope, draft.id, expected_version=1)
        self.assertEqual(self.store.get(self.actor, self.scope, draft.id).content, {"objective": "Make ideas"})
        with self.assertRaises(NotFound):
            self.service.active(self.actor, self.scope)

    def test_approval_is_idempotent_and_reopening_keeps_the_same_charter(self):
        draft = self.service.propose(self.actor, self.scope, charter())
        receipt = self.service.approve(self.actor, self.scope, draft.id, expected_version=1)
        self.assertEqual(receipt, self.service.approve(self.actor, self.scope, draft.id, expected_version=1))
        reopened = CharterService(MemoryStore(Path(self.tmp.name) / "state"))
        self.assertEqual(reopened.active(self.actor, self.scope).id, receipt.charter_id)
        self.assertEqual(reopened.active(self.actor, self.scope).version, 1)

    def test_stale_preview_cannot_approve_a_changed_goal(self):
        draft = self.service.propose(self.actor, self.scope, charter())
        changed = charter()
        changed["objective"] = "Different goal"
        self.store.update(self.actor, self.scope, draft.id, changed, expected_version=1)
        with self.assertRaises(Conflict):
            self.service.approve(self.actor, self.scope, draft.id, expected_version=1)

    def test_contributor_can_propose_but_cannot_approve(self):
        worker = Principal("worker")
        self.store.grant(self.actor, self.scope, worker, "contributor")
        draft = self.service.propose(worker, self.scope, charter())
        with self.assertRaises(AccessDenied):
            self.service.approve(worker, self.scope, draft.id, expected_version=1)

    def test_new_approval_supersedes_old_without_replaying_old_approval(self):
        first = self.service.propose(self.actor, self.scope, charter())
        old_receipt = self.service.approve(self.actor, self.scope, first.id, expected_version=1)
        changed = charter()
        changed["objective"] = "Owner chose a revised goal"
        second = self.service.propose(self.actor, self.scope, changed)
        new_receipt = self.service.approve(self.actor, self.scope, second.id, expected_version=1)
        self.assertEqual(new_receipt.charter_id, old_receipt.charter_id)
        self.assertEqual(new_receipt.charter_version, 2)
        self.service.approve(self.actor, self.scope, first.id, expected_version=1)
        self.assertEqual(self.service.active(self.actor, self.scope).content["objective"], changed["objective"])

    def test_dependency_cycles_unknown_dependencies_and_duplicate_nodes_are_rejected(self):
        value = charter()
        value["workflow"]["steps"][0]["dependencies"] = ["review"]
        self.assertIn("workflow.steps: dependency cycle", gaps(value))
        value = charter()
        value["workflow"]["steps"][0]["dependencies"] = ["not-present"]
        self.assertTrue(any("unknown step" in gap for gap in gaps(value)))
        value = charter()
        value["workflow"]["steps"].append(deepcopy(value["workflow"]["steps"][0]))
        self.assertTrue(any("duplicate" in gap for gap in gaps(value)))

    def test_money_is_explicit_and_nan_or_unknown_budget_does_not_mean_free(self):
        value = charter()
        value["budgets"]["money"]["amount"] = "NaN"
        self.assertTrue(any("money.amount" in gap for gap in gaps(value)))
        value = charter()
        value["budgets"]["tokens"] = None
        self.assertIn("budgets.tokens.mode", gaps(value))

    def test_verified_method_claim_needs_real_referenced_evidence_record(self):
        value = charter()
        value["workflow"].update(method_status="verified", method_evidence=["made-up-record"])
        draft = self.service.propose(self.actor, self.scope, value)
        with self.assertRaises(NotFound):
            self.service.approve(self.actor, self.scope, draft.id, expected_version=1)


if __name__ == "__main__":
    unittest.main()
