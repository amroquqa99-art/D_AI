from __future__ import annotations

from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from dai.charters import CharterService
from dai.contracts import Principal, Scope
from dai.errors import AccessDenied, Conflict, InvalidRequest, NotFound
from dai.memory import MemoryStore
from dai.tasks import STATES, TaskService


def charter_content():
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


class TaskTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dai-tasks-")
        self.store = MemoryStore(Path(self.tmp.name) / "state")
        self.owner = Principal("owner")
        self.other = Principal("other")
        self.scope = self.store.create_project(self.owner, "مركز الأبحاث")
        self.charters = CharterService(self.store)
        draft = self.charters.propose(self.owner, self.scope, charter_content())
        self.charter_id = self.charters.approve(self.owner, self.scope, draft.id,
                                                expected_version=1).charter_id
        self.tasks = TaskService(self.store)

    def tearDown(self):
        self.tmp.cleanup()

    def _task(self, **overrides):
        content = dict(charter_content())
        content.update(overrides)
        draft = self.charters.propose(self.owner, self.scope, content)
        self.charters.approve(self.owner, self.scope, draft.id, expected_version=1)
        return self.tasks.create_task(self.owner, self.scope, objective="Analyze sources",
                                      acceptance=["sources cited"], depends_on=[])

    def test_create_task_requires_approved_active_charter(self):
        empty = MemoryStore(Path(self.tmp.name) / "other-state")
        scope = empty.create_project(self.owner, "Unchartered")
        service = TaskService(empty)
        with self.assertRaises(NotFound) as raised:
            service.create_task(self.owner, scope, objective="x", acceptance=["y"])
        self.assertEqual(str(raised.exception),
                         "Project has no approved charter; execution must wait")

    def test_task_against_other_project_charter_is_rejected(self):
        second = self.store.create_project(self.owner, "Other")
        draft = self.charters.propose(self.owner, second, charter_content())
        other_charter = self.charters.approve(self.owner, second, draft.id,
                                              expected_version=1).charter_id
        with self.assertRaises(Conflict):
            self.tasks.create_task(self.owner, self.scope, objective="x",
                                   acceptance=["y"], charter_id=other_charter)

    def test_create_task_records_content_and_index_row(self):
        task = self.tasks.create_task(self.owner, self.scope, objective="Analyze sources",
                                      acceptance=["sources cited"], responsibility="researcher",
                                      inputs=["paper-1"], outputs=["summary"], depends_on=[])
        self.assertEqual(task.kind, "task")
        self.assertEqual(task.content["state"], "DISCOVERING")
        self.assertEqual(task.content["acceptance"], ["sources cited"])
        self.assertEqual(task.content["charter_id"], self.charter_id)
        self.assertEqual(task.content["attempts"], [])
        self.assertIsNone(task.content["lease"])
        self.assertEqual(task.content["state_history"], [])
        fetched = self.tasks.get(self.owner, self.scope, task.id)
        self.assertEqual(fetched.version, 1)
        with self.store._db("project") as db:
            row = db.execute("SELECT state, version, charter_id FROM task_index WHERE task_id=?",
                             (task.id,)).fetchone()
            self.assertEqual((row["state"], row["version"], row["charter_id"]),
                             ("DISCOVERING", 1, self.charter_id))

    def test_unknown_dependency_is_rejected_at_creation(self):
        with self.assertRaises(InvalidRequest) as raised:
            self.tasks.create_task(self.owner, self.scope, objective="x",
                                   acceptance=["y"], depends_on=["no-such-task"])
        self.assertIn("no-such-task", str(raised.exception))

    def test_outsider_cannot_create_task_in_project(self):
        with self.assertRaises(AccessDenied):
            self.tasks.create_task(Principal("outsider"), self.scope, objective="x",
                                   acceptance=["y"])

    def test_task_scope_must_be_project(self):
        with self.assertRaises(InvalidRequest):
            self.tasks.create_task(self.owner, Scope("person", "owner"), objective="x",
                                   acceptance=["y"])

    def test_illegal_transition_conflict_names_both_states(self):
        task = self._task()
        with self.assertRaises(Conflict) as raised:
            self.tasks.set_state(self.owner, self.scope, task.id, state="RUNNING",
                                 expected_version=1)
        self.assertEqual(str(raised.exception),
                         f"Illegal task transition DISCOVERING -> RUNNING")

    def test_legal_transition_chain_and_version_fencing(self):
        task = self._task()
        self.assertEqual(self.tasks.set_state(self.owner, self.scope, task.id,
                                              state="PLAN_REVIEW", expected_version=1).version, 2)
        self.assertEqual(self.tasks.set_state(self.owner, self.scope, task.id,
                                              state="READY", expected_version=2).version, 3)
        self.assertEqual(self.tasks.set_state(self.owner, self.scope, task.id,
                                              state="RUNNING", expected_version=3).version, 4)
        with self.assertRaises(Conflict):
            self.tasks.set_state(self.owner, self.scope, task.id, state="VERIFYING",
                                 expected_version=2)
        self.assertEqual(self.tasks.get(self.owner, self.scope, task.id).version, 4)

    def test_set_state_releases_live_lease(self):
        task = self._task()
        self.tasks.lease(self.owner, self.scope, task.id, owner="researcher", ttl=300)
        updated = self.tasks.set_state(self.owner, self.scope, task.id, state="READY",
                                       expected_version=2)
        self.assertIsNone(updated.content["lease"])

    def test_completed_only_through_record_attempt(self):
        task = self._task()
        with self.assertRaises(InvalidRequest) as raised:
            self.tasks.set_state(self.owner, self.scope, task.id, state="COMPLETED",
                                 expected_version=1)
        self.assertEqual(str(raised.exception),
                         "COMPLETED is reachable only through record_attempt")
        empty_acceptance = self.tasks.create_task(self.owner, self.scope, objective="x",
                                                  acceptance=[])
        with self.assertRaises(InvalidRequest) as raised:
            self.tasks.record_attempt(self.owner, self.scope, empty_acceptance.id,
                                      attempt_id="a-1", outcome="SUCCESS",
                                      receipt="receipt-1")
        self.assertEqual(str(raised.exception),
                         "COMPLETED requires a non-empty acceptance list")
        with self.assertRaises(InvalidRequest) as raised:
            self.tasks.record_attempt(self.owner, self.scope, task.id, attempt_id="a-1",
                                      outcome="SUCCESS")
        self.assertEqual(str(raised.exception), "COMPLETED requires a receipt")
        finished = self.tasks.record_attempt(self.owner, self.scope, task.id,
                                             attempt_id="a-1", outcome="SUCCESS",
                                             receipt="receipt-1")
        self.assertEqual(finished.content["state"], "COMPLETED")
        self.assertEqual(finished.content["attempts"][0]["outcome"], "SUCCESS")
        self.assertEqual(finished.content["attempts"][0]["receipt"], "receipt-1")
        self.assertEqual(finished.content["state_history"][-1]["to"], "COMPLETED")
        with self.assertRaises(Conflict):
            self.tasks.record_attempt(self.owner, self.scope, task.id, attempt_id="a-2",
                                      outcome="SUCCESS")

    def test_record_attempt_idempotent_repeat_does_not_double_count(self):
        task = self._task()
        first = self.tasks.record_attempt(self.owner, self.scope, task.id,
                                          attempt_id="a-1", outcome="FAILURE",
                                          idempotency_key="attempt-1")
        second = self.tasks.record_attempt(self.owner, self.scope, task.id,
                                           attempt_id="a-1", outcome="FAILURE",
                                           idempotency_key="attempt-1")
        self.assertEqual(first.id, second.id)
        self.assertEqual(len(self.tasks.attempts(self.owner, self.scope, task.id)), 1)
        self.assertEqual(first.version, second.version)
        with self.assertRaises(Conflict):
            self.tasks.record_attempt(self.owner, self.scope, task.id,
                                      attempt_id="a-1", outcome="SUCCESS",
                                      idempotency_key="attempt-1")

    def test_partial_requires_note_and_records_attempt(self):
        task = self._task()
        ready = self.tasks.set_state(self.owner, self.scope, task.id, state="READY",
                                     expected_version=1)
        running = self.tasks.set_state(self.owner, self.scope, task.id, state="RUNNING",
                                       expected_version=ready.version)
        with self.assertRaises(InvalidRequest) as raised:
            self.tasks.set_state(self.owner, self.scope, task.id, state="PARTIAL",
                                 expected_version=running.version, note="")
        self.assertEqual(str(raised.exception),
                         "PARTIAL requires a note stating what is missing")
        partial = self.tasks.set_state(self.owner, self.scope, task.id, state="PARTIAL",
                                       expected_version=running.version,
                                       note="missing the review stage")
        self.assertEqual(partial.content["state"], "PARTIAL")
        self.assertEqual(partial.content["state_history"][-1]["note"],
                         "missing the review stage")

    def test_waiting_transition_records_what_it_awaits(self):
        task = self._task()
        reviewed = self.tasks.set_state(self.owner, self.scope, task.id, state="PLAN_REVIEW",
                                        expected_version=1)
        ready = self.tasks.set_state(self.owner, self.scope, task.id, state="READY",
                                     expected_version=reviewed.version)
        waiting = self.tasks.set_state(self.owner, self.scope, task.id, state="WAITING_FOR_INPUT",
                                       expected_version=ready.version,
                                       note="awaiting the source dataset")
        self.assertEqual(waiting.content["state"], "WAITING_FOR_INPUT")
        self.assertEqual(waiting.content["state_history"][-1]["note"],
                         "awaiting the source dataset")
        with self.assertRaises(InvalidRequest):
            self.tasks.set_state(self.owner, self.scope, task.id, state="WAITING_FOR_INPUT",
                                 expected_version=waiting.version, note="")
        resumed = self.tasks.set_state(self.owner, self.scope, task.id, state="RUNNING",
                                       expected_version=waiting.version)
        self.assertEqual(resumed.content["state"], "RUNNING")

    def test_lease_is_exclusive_and_expired_lease_can_be_taken_over(self):
        task = self._task()
        # A fixed clock keeps the expiry test independent of the wall clock.
        with patch("dai.tasks.utc_now", return_value="2026-01-01T00:00:00+00:00"):
            first = self.tasks.lease(self.owner, self.scope, task.id, owner="researcher", ttl=300)
            self.assertEqual(first.content["lease"]["owner"], "researcher")
            with self.assertRaises(Conflict) as raised:
                self.tasks.lease(self.owner, self.scope, task.id, owner="other")
            self.assertIn("researcher", str(raised.exception))
            with patch("dai.tasks.utc_now", return_value="2026-01-01T00:10:00+00:00"):
                taken = self.tasks.lease(self.owner, self.scope, task.id, owner="reviewer", ttl=300)
        self.assertEqual(taken.content["lease"]["owner"], "reviewer")
        notes = [entry["note"] for entry in taken.content["state_history"]
                 if "lease taken over" in entry.get("note", "")]
        self.assertEqual(len(notes), 1)
        self.assertIn("reviewer", notes[0])

    def test_release_requires_the_lease_holder(self):
        task = self._task()
        self.tasks.lease(self.owner, self.scope, task.id, owner="researcher", ttl=300)
        with self.assertRaises(AccessDenied):
            self.tasks.release(self.owner, self.scope, task.id, owner="reviewer")
        released = self.tasks.release(self.owner, self.scope, task.id, owner="researcher")
        self.assertIsNone(released.content["lease"])
        with self.assertRaises(Conflict):
            self.tasks.release(self.owner, self.scope, task.id, owner="researcher")

    def test_list_filters_by_state_through_plaintext_index(self):
        task = self._task()
        self.assertEqual([t.id for t in self.tasks.list(self.owner, self.scope)],
                         [task.id])
        self.assertEqual([t.id for t in self.tasks.list(self.owner, self.scope,
                                                        state="DISCOVERING")], [task.id])
        self.assertEqual(self.tasks.list(self.owner, self.scope, state="RUNNING"), [])

    def test_graph_nodes_and_edges(self):
        first = self.tasks.create_task(self.owner, self.scope, objective="first",
                                       acceptance=["a"], depends_on=[])
        second = self.tasks.create_task(self.owner, self.scope, objective="second",
                                        acceptance=["a"], depends_on=[first.id])
        third = self.tasks.create_task(self.owner, self.scope, objective="third",
                                       acceptance=["a"], depends_on=[first.id, second.id])
        graph = self.tasks.graph(self.owner, self.scope)
        self.assertEqual({node["id"] for node in graph["nodes"]},
                         {first.id, second.id, third.id})
        self.assertEqual({(edge["from"], edge["to"]) for edge in graph["edges"]},
                         {(first.id, second.id), (first.id, third.id), (second.id, third.id)})
        self.assertEqual({node["objective"] for node in graph["nodes"]},
                         {"first", "second", "third"})

    def test_idempotent_create_task_repeat_is_one_effect(self):
        first = self.tasks.create_task(self.owner, self.scope, objective="x",
                                       acceptance=["y"], idempotency_key="key-1")
        second = self.tasks.create_task(self.owner, self.scope, objective="x",
                                        acceptance=["y"], idempotency_key="key-1")
        self.assertEqual(first.id, second.id)
        self.assertEqual(first.version, 1)
        with self.assertRaises(Conflict):
            self.tasks.create_task(self.owner, self.scope, objective="z",
                                   acceptance=["y"], idempotency_key="key-1")

    def test_terminal_states_reject_further_transitions(self):
        task = self._task()
        finished = self.tasks.record_attempt(self.owner, self.scope, task.id,
                                             attempt_id="a-1", outcome="SUCCESS",
                                             receipt="receipt-1")
        for target in ("READY", "RUNNING", "DISCOVERING", "COMPLETED"):
            with self.assertRaises(Conflict):
                self.tasks.set_state(self.owner, self.scope, task.id, state=target,
                                     expected_version=finished.version)


if __name__ == "__main__":
    unittest.main()
