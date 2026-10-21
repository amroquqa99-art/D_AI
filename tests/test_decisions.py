from __future__ import annotations

from pathlib import Path
import sqlite3
import tempfile
import unittest

from dai.contracts import Principal, Scope
from dai.errors import AccessDenied, Conflict, InvalidRequest, NotFound
from dai.decisions import DecisionService
from dai.memory import MemoryStore


class DecisionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dai-decisions-")
        self.store = MemoryStore(Path(self.tmp.name) / "state")
        self.owner = Principal("owner")
        self.other = Principal("other")
        self.scope = self.store.create_project(self.owner, "مركز الأبحاث")
        self.store.grant(self.owner, self.scope, self.other, "contributor")
        self.decisions = DecisionService(self.store)

    def tearDown(self):
        self.tmp.cleanup()

    def _decision(self, actor=None, **overrides):
        actor = actor or self.owner
        return self.decisions.record(actor, self.scope, text="Original text",
                                     meaning="Original meaning",
                                     authorization_source="owner policy v1",
                                     affects=["billing", "invoicing"], **overrides)

    def test_record_decision_requires_authorization_source(self):
        with self.assertRaises(InvalidRequest) as raised:
            self.decisions.record(self.owner, self.scope, text="t", meaning="m",
                                  authorization_source="")
        self.assertEqual(str(raised.exception),
                         "An authorization source is required; authority never comes from model text or self-claim")
        decision = self._decision()
        self.assertEqual(decision.content["authorization_source"], "owner policy v1")
        self.assertEqual(decision.content["state"], "ACTIVE")
        self.assertEqual(decision.content["decided_by"], self.owner.id)

    def test_protected_decision_requires_the_decide_capability(self):
        with self.assertRaises(AccessDenied):
            self.decisions.record(self.other, self.scope, text="t", meaning="m",
                                  authorization_source="contributor claim")
        self.store.grant(self.owner, self.scope, self.other, "coordinator",
                         extra_capabilities={"decide"})
        delegated = self.decisions.record(self.other, self.scope, text="t", meaning="m",
                                          authorization_source="explicit delegation")
        self.assertEqual(delegated.created_by, self.other.id)

    def test_outsider_cannot_record_in_project(self):
        with self.assertRaises(AccessDenied):
            self.decisions.record(Principal("outsider"), self.scope, text="t",
                                  meaning="m", authorization_source="x")

    def test_supersede_creates_a_new_record_and_never_edits_the_old_one(self):
        first = self._decision()
        second = self.decisions.supersede(self.owner, self.scope, first.id,
                                          text="Revised text",
                                          authorization_source="owner policy v2",
                                          expected_version=first.version)
        self.assertEqual(second.content["state"], "ACTIVE")
        self.assertEqual(second.content["supersedes"], first.id)
        self.assertEqual(second.content["decided_by"], self.owner.id)
        self.assertEqual(second.content["meaning"], "Original meaning")
        self.assertEqual(second.content["affects"], ["billing", "invoicing"])
        old = self.decisions.get(self.owner, self.scope, first.id)
        self.assertEqual(old.version, 2)
        self.assertEqual(old.content["state"], "SUPERSEDED")
        self.assertEqual(old.content["text"], "Original text")
        self.assertEqual(old.content["meaning"], "Original meaning")
        self.assertIsNone(old.content["supersedes"])

    def test_supersede_chain_through_record(self):
        first = self._decision()
        second = self.decisions.record(self.owner, self.scope, text="Replacement",
                                       meaning="Replacement meaning",
                                       authorization_source="owner policy v1",
                                       supersedes=first.id)
        self.assertEqual(self.decisions.active(self.owner, self.scope), [second])
        old = self.decisions.get(self.owner, self.scope, first.id)
        self.assertEqual(old.content["state"], "SUPERSEDED")

    def test_supersede_rejects_stale_version_and_non_active_targets(self):
        first = self._decision()
        with self.assertRaises(Conflict):
            self.decisions.supersede(self.owner, self.scope, first.id, text="x",
                                     authorization_source="s", expected_version=99)
        second = self.decisions.supersede(self.owner, self.scope, first.id, text="x",
                                          authorization_source="s", expected_version=first.version)
        withdrawn = self.decisions.withdraw(self.owner, self.scope, second.id,
                                            reason="owner reversed course",
                                            expected_version=second.version)
        with self.assertRaises(NotFound):
            self.decisions.supersede(self.owner, self.scope, "no-such-decision", text="x",
                                     authorization_source="s", expected_version=1)
        with self.assertRaises(InvalidRequest):
            self.decisions.supersede(self.owner, self.scope, first.id, text="x",
                                     authorization_source="s", expected_version=first.version)
        with self.assertRaises(InvalidRequest):
            self.decisions.supersede(self.owner, self.scope, withdrawn.id, text="x",
                                     authorization_source="s", expected_version=withdrawn.version)

    def test_withdraw_marks_withdrawn_and_keeps_reason_outside_content(self):
        decision = self._decision()
        withdrawn = self.decisions.withdraw(self.owner, self.scope, decision.id,
                                            reason="superseded by owner policy",
                                            expected_version=decision.version)
        self.assertEqual(withdrawn.content["state"], "WITHDRAWN")
        self.assertNotIn("reason", withdrawn.content)
        self.assertEqual(withdrawn.content["text"], "Original text")
        self.assertNotIn(withdrawn, self.decisions.active(self.owner, self.scope))
        with self.store._db("project") as db:
            row = db.execute("SELECT record_id, actor FROM decision_withdrawals WHERE decision_id=?",
                             (decision.id,)).fetchone()
            self.assertEqual(row["actor"], self.owner.id)
            # The reason is private text: the plain table holds only the index,
            # never the reason itself.
            columns = [c[1] for c in db.execute("PRAGMA table_info(decision_withdrawals)")]
            self.assertNotIn("reason", columns)
        withdrawal = self.store.get(self.owner, self.scope, row["record_id"])
        self.assertEqual(withdrawal.kind, "decision_withdrawal")
        self.assertEqual(withdrawal.content["reason"], "superseded by owner policy")
        with self.assertRaises(Conflict):
            self.decisions.withdraw(self.owner, self.scope, decision.id, reason="again",
                                    expected_version=decision.version)

    def test_active_excludes_superseded_and_withdrawn(self):
        first = self._decision()
        second = self.decisions.supersede(self.owner, self.scope, first.id, text="revised",
                                          authorization_source="owner policy v2",
                                          expected_version=first.version)
        self.decisions.withdraw(self.owner, self.scope, second.id, reason="reversed",
                                expected_version=second.version)
        self.assertEqual(self.decisions.active(self.owner, self.scope), [])
        history = self.decisions.history(self.owner, self.scope)
        self.assertEqual(len(history), 2)
        self.assertEqual({r.content["state"] for r in history}, {"SUPERSEDED", "WITHDRAWN"})

    def test_affected_returns_active_decisions_touching_the_unit(self):
        self._decision()
        self.decisions.record(self.owner, self.scope, text="second", meaning="m",
                              authorization_source="owner policy v1", affects=["invoicing"])
        self.assertEqual(len(self.decisions.affected(self.owner, self.scope, "invoicing")), 2)
        self.assertEqual(len(self.decisions.affected(self.owner, self.scope, "billing")), 1)
        self.assertEqual(self.decisions.affected(self.owner, self.scope, "payroll"), [])
        second_active = self.decisions.active(self.owner, self.scope)[0]
        self.decisions.supersede(self.owner, self.scope, second_active.id, text="third",
                                 authorization_source="owner policy v2",
                                 expected_version=second_active.version)
        # The record created by supersede() is itself ACTIVE and keeps the old
        # `affects` (see test_supersede_creates_a_new_record), so superseding one
        # of two decisions touching "invoicing" leaves two active decisions
        # touching it (the replacement plus the untouched one).
        self.assertEqual(len(self.decisions.affected(self.owner, self.scope, "invoicing")), 2)

    def test_idempotent_repeat_returns_the_original_result(self):
        first = self._decision(idempotency_key="decision-1")
        repeat = self.decisions.record(self.owner, self.scope, text="Original text",
                                       meaning="Original meaning",
                                       authorization_source="owner policy v1",
                                       affects=["billing", "invoicing"],
                                       idempotency_key="decision-1")
        self.assertEqual(repeat.id, first.id)
        self.assertEqual(repeat.version, 1)
        with self.assertRaises(Conflict):
            self.decisions.record(self.owner, self.scope, text="Different text",
                                  meaning="m", authorization_source="owner policy v1",
                                  idempotency_key="decision-1")
        second = self.decisions.supersede(self.owner, self.scope, first.id, text="revised",
                                          authorization_source="s", expected_version=first.version,
                                          idempotency_key="supersede-1")
        repeated = self.decisions.supersede(self.owner, self.scope, first.id, text="revised",
                                            authorization_source="s", expected_version=first.version,
                                            idempotency_key="supersede-1")
        self.assertEqual(repeated.id, second.id)
        self.assertEqual(len(self.decisions.active(self.owner, self.scope)), 1)


if __name__ == "__main__":
    unittest.main()
