from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from dai.contracts import Principal, Scope
from dai.decisions import DecisionService
from dai.errors import AccessDenied, Conflict, InvalidRequest, NotFound
from dai.memory import MemoryStore
from dai.teams import MAX_DEPTH, TeamService, project_state_fingerprint


class TeamTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dai-teams-")
        self.store = MemoryStore(Path(self.tmp.name) / "state")
        self.owner = Principal("owner")
        self.other = Principal("other")
        self.scope = self.store.create_project(self.owner, "the-team-project")
        self.teams = TeamService(self.store)
        self.team = self.teams.create_team(self.owner, self.scope,
                                           name="research team",
                                           roles=["lead", "researcher"])
        self.teams.add_agent(self.owner, self.scope, self.team.id,
                             agent_id="alice", role="lead")
        self.teams.add_agent(self.owner, self.scope, self.team.id,
                             agent_id="bob", role="researcher", parent_agent="alice")

    def tearDown(self):
        self.tmp.cleanup()

    def _count_everything(self) -> int:
        """Records in every plane plus the module's plain index tables."""
        total = 0
        for plane in ("person", "project", "global"):
            with self.store._db(plane) as db:
                total += db.execute("SELECT COUNT(*) FROM records").fetchone()[0]
        with self.store._db("project") as db:
            for table in ("team_agents", "team_messages", "team_assignments",
                          "team_idempotency", "component_versions"):
                total += db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        return total

    def test_create_team_records_team_and_index_row(self):
        self.assertEqual(self.team.kind, "team")
        self.assertEqual(self.team.content["name"], "research team")
        self.assertEqual(self.team.content["roles"], ["lead", "researcher"])
        self.assertEqual(self.team.version, 1)
        with self.store._db("project") as db:
            row = db.execute("SELECT COUNT(*) FROM team_agents WHERE project=? AND team=?",
                             (self.scope.project, self.team.id)).fetchone()
            self.assertEqual(row[0], 2)

    def test_create_team_idempotent_repeat_is_one_effect(self):
        first = self.teams.create_team(self.owner, self.scope, name="research team",
                                       roles=["lead", "researcher"],
                                       idempotency_key="team-1")
        second = self.teams.create_team(self.owner, self.scope, name="research team",
                                        roles=["lead", "researcher"],
                                        idempotency_key="team-1")
        self.assertEqual(first.id, second.id)
        self.assertEqual(first.version, second.version)
        with self.assertRaises(Conflict):
            self.teams.create_team(self.owner, self.scope, name="other team",
                                   roles=["lead"], idempotency_key="team-1")
        with self.store._db("project") as db:
            row = db.execute("SELECT COUNT(*) FROM team_idempotency WHERE key='team-1'").fetchone()
            self.assertEqual(row[0], 1)

    def test_create_team_requires_project_scope(self):
        with self.assertRaises(InvalidRequest):
            self.teams.create_team(self.owner, Scope("person", "owner"), name="x")

    def test_outsider_cannot_create_team(self):
        with self.assertRaises(AccessDenied) as raised:
            self.teams.create_team(self.other, self.scope, name="x")
        self.assertIn("scope", str(raised.exception))

    def test_add_agent_root_and_child_depths(self):
        root = self.teams.add_agent(self.owner, self.scope, self.team.id,
                                    agent_id="root", role="lead")
        self.assertEqual(root["depth"], 1)
        self.assertEqual(root["agent_id"], "root")
        child = self.teams.add_agent(self.owner, self.scope, self.team.id,
                                     agent_id="child", role="researcher", parent_agent="root")
        self.assertEqual(child["depth"], 2)
        grandchild = self.teams.add_agent(self.owner, self.scope, self.team.id,
                                          agent_id="grandchild", role="researcher",
                                          parent_agent="child")
        self.assertEqual(grandchild["depth"], 3)
        with self.assertRaises(InvalidRequest) as raised:
            self.teams.add_agent(self.owner, self.scope, self.team.id,
                                 agent_id="too-deep", role="researcher",
                                 parent_agent="grandchild")
        self.assertIn("depth", str(raised.exception))
        self.assertIn("MAX_DEPTH", str(raised.exception))

    def test_add_agent_parent_not_in_team_is_rejected(self):
        with self.assertRaises(InvalidRequest) as raised:
            self.teams.add_agent(self.owner, self.scope, self.team.id,
                                 agent_id="x", role="r", parent_agent="nobody")
        self.assertIn("not in team", str(raised.exception))

    def test_add_agent_parent_in_different_team_is_rejected(self):
        other_team = self.teams.create_team(self.owner, self.scope, name="other team")
        self.teams.add_agent(self.owner, self.scope, other_team.id,
                             agent_id="foreign", role="lead")
        with self.assertRaises(InvalidRequest) as raised:
            self.teams.add_agent(self.owner, self.scope, self.team.id,
                                 agent_id="x", role="r", parent_agent="foreign")
        self.assertIn("not in team", str(raised.exception))

    def test_add_agent_idempotent_same_definition_returns_existing(self):
        first = self.teams.add_agent(self.owner, self.scope, self.team.id,
                                     agent_id="alice", role="lead")
        second = self.teams.add_agent(self.owner, self.scope, self.team.id,
                                      agent_id="alice", role="lead")
        self.assertEqual(first, second)
        with self.store._db("project") as db:
            row = db.execute("SELECT COUNT(*) FROM team_agents WHERE agent_id='alice'").fetchone()
            self.assertEqual(row[0], 1)
        listed = self.teams.agents(self.owner, self.scope, self.team.id)
        self.assertEqual([a["agent_id"] for a in listed], ["alice", "bob"])

    def test_add_agent_different_definition_conflicts(self):
        with self.assertRaises(Conflict):
            self.teams.add_agent(self.owner, self.scope, self.team.id,
                                 agent_id="alice", role="researcher")

    def test_agents_and_tree_shape(self):
        listed = self.teams.agents(self.owner, self.scope, self.team.id)
        self.assertEqual(listed[0]["agent_id"], "alice")
        self.assertEqual(listed[0]["depth"], 1)
        self.assertIsNone(listed[0]["parent_agent"])
        self.assertEqual(listed[1]["agent_id"], "bob")
        self.assertEqual(listed[1]["depth"], 2)
        self.assertEqual(listed[1]["parent_agent"], "alice")
        tree = self.teams.tree(self.owner, self.scope, self.team.id)
        self.assertEqual(tree["team"], self.team.id)
        self.assertEqual(tree["max_depth"], MAX_DEPTH)
        self.assertEqual(len(tree["roots"]), 1)
        self.assertEqual(tree["roots"][0]["agent_id"], "alice")
        self.assertEqual(tree["roots"][0]["children"][0]["agent_id"], "bob")

    def test_assign_records_ownership_and_is_idempotent(self):
        first = self.teams.assign(self.owner, self.scope, self.team.id,
                                  agent_id="alice", task_id="task-1",
                                  idempotency_key="assign-1")
        second = self.teams.assign(self.owner, self.scope, self.team.id,
                                   agent_id="alice", task_id="task-1",
                                   idempotency_key="assign-1")
        self.assertEqual(first, second)
        with self.store._db("project") as db:
            row = db.execute("SELECT COUNT(*) FROM team_assignments WHERE task_id='task-1'").fetchone()
            self.assertEqual(row[0], 1)
        # Repeating the same assignment without a key is a no-op too.
        again = self.teams.assign(self.owner, self.scope, self.team.id,
                                  agent_id="alice", task_id="task-1")
        self.assertEqual(again, first)

    def test_assign_same_task_to_different_agent_conflicts(self):
        self.teams.assign(self.owner, self.scope, self.team.id,
                          agent_id="alice", task_id="task-1")
        with self.assertRaises(Conflict) as raised:
            self.teams.assign(self.owner, self.scope, self.team.id,
                              agent_id="bob", task_id="task-1")
        self.assertIn("two writers on one work", str(raised.exception))
        with self.store._db("project") as db:
            row = db.execute("SELECT agent_id FROM team_assignments WHERE task_id='task-1'").fetchone()
            self.assertEqual(row[0], "alice")

    def test_assign_unknown_agent_is_rejected(self):
        with self.assertRaises(NotFound):
            self.teams.assign(self.owner, self.scope, self.team.id,
                              agent_id="nobody", task_id="task-1")

    def test_assign_idempotency_key_rejects_different_payload(self):
        self.teams.assign(self.owner, self.scope, self.team.id,
                          agent_id="alice", task_id="task-1",
                          idempotency_key="assign-2")
        with self.assertRaises(Conflict):
            self.teams.assign(self.owner, self.scope, self.team.id,
                              agent_id="bob", task_id="task-2",
                              idempotency_key="assign-2")

    def test_message_leader_is_sent_not_applied(self):
        message = self.teams.message_leader(self.owner, self.scope,
                                            from_agent="alice", to_agent="bob",
                                            body="start the review")
        self.assertEqual(message.kind, "message")
        self.assertEqual(message.content["status"], "SENT")
        self.assertEqual(message.content["from_agent"], "alice")
        self.assertEqual(message.content["to_agent"], "bob")
        inbox = self.teams.inbox(self.owner, self.scope, agent_id="bob")
        self.assertEqual([m.id for m in inbox], [message.id])
        self.assertEqual(inbox[0].content["status"], "SENT")
        # Sending alone never applies: no acknowledge, status stays SENT.
        self.assertEqual(self.teams.inbox(self.owner, self.scope, agent_id="bob",
                                          status="APPLIED"), [])
        # Sending is visible but not applied.
        applied = self.teams.acknowledge(self.owner, self.scope, message.id,
                                         status="APPLIED", expected_version=1)
        self.assertEqual(applied.content["status"], "APPLIED")
        self.assertEqual(self.teams.inbox(self.owner, self.scope, agent_id="bob",
                                          status="SENT"), [])
        self.assertEqual(len(self.teams.inbox(self.owner, self.scope, agent_id="bob")), 1)

    def test_acknowledge_is_version_fenced(self):
        message = self.teams.message_leader(self.owner, self.scope,
                                            from_agent="alice", to_agent="bob",
                                            body="ping")
        with self.assertRaises(Conflict):
            self.teams.acknowledge(self.owner, self.scope, message.id,
                                   status="APPLIED", expected_version=99)
        self.assertEqual(message.content["status"], "SENT")

    def test_acknowledge_only_moves_sent_messages(self):
        message = self.teams.message_leader(self.owner, self.scope,
                                            from_agent="alice", to_agent="bob",
                                            body="ping")
        self.teams.acknowledge(self.owner, self.scope, message.id,
                               status="ACKNOWLEDGED", expected_version=1)
        with self.assertRaises(Conflict):
            self.teams.acknowledge(self.owner, self.scope, message.id,
                                   status="APPLIED", expected_version=2)
        self.assertEqual(self.teams.inbox(self.owner, self.scope, agent_id="bob",
                                          status="ACKNOWLEDGED")[0].id, message.id)

    def test_inbox_is_newest_last_and_filters_by_status(self):
        first = self.teams.message_leader(self.owner, self.scope,
                                          from_agent="alice", to_agent="bob", body="one")
        second = self.teams.message_leader(self.owner, self.scope,
                                           from_agent="alice", to_agent="bob", body="two")
        inbox = self.teams.inbox(self.owner, self.scope, agent_id="bob")
        self.assertEqual([m.content["body"] for m in inbox], ["one", "two"])
        self.assertEqual(len(self.teams.inbox(self.owner, self.scope,
                                              agent_id="bob", status="SENT")), 2)

    def test_outsider_cannot_send_message(self):
        with self.assertRaises(AccessDenied):
            self.teams.message_leader(self.other, self.scope,
                                      from_agent="alice", to_agent="bob", body="x")

    def test_open_consultation_ask_changes_nothing_but_the_consultation(self):
        before = self._count_everything()
        consultation = self.teams.open_consultation(self.owner, self.scope,
                                                    parent_session="session-a",
                                                    question="which model?",
                                                    mode="ask")
        after = self._count_everything()
        self.assertEqual(after, before + 1)
        self.assertEqual(consultation.kind, "consultation")
        self.assertEqual(consultation.content["status"], "OPEN")
        self.assertEqual(consultation.content["mode"], "ask")
        self.assertEqual(consultation.content["parent_session"], "session-a")
        self.assertIsInstance(consultation.content["context_version"], str)
        self.assertIsNone(consultation.content["answer"])
        self.assertIsNone(consultation.content["proposal"])
        # A reply on a read-only mode updates only the consultation record.
        replied = self.teams.consultation_reply(self.owner, self.scope,
                                                consultation.id, body="use opencode/test-free")
        self.assertEqual(replied.content["answer"], "use opencode/test-free")
        self.assertIsNone(replied.content["proposal"])
        self.assertEqual(self._count_everything(), after)

    def test_open_consultation_suggest_proposal_stays_a_proposal(self):
        before = self._count_everything()
        consultation = self.teams.open_consultation(self.owner, self.scope,
                                                    parent_session="session-a",
                                                    question="what should we do?",
                                                    mode="suggest")
        replied = self.teams.consultation_reply(self.owner, self.scope,
                                                consultation.id,
                                                body="adopt the cached pattern")
        self.assertEqual(replied.content["proposal"], "adopt the cached pattern")
        self.assertIsNone(replied.content["answer"])
        # Advancing the status never applies the proposal.
        received = self.teams.consult_consultation(self.owner, self.scope,
                                                   consultation.id, status="RECEIVED",
                                                   expected_version=replied.version)
        merging = self.teams.consult_consultation(self.owner, self.scope,
                                                  consultation.id, status="MERGING",
                                                  expected_version=received.version)
        applied = self.teams.consult_consultation(self.owner, self.scope,
                                                  consultation.id, status="APPLIED",
                                                  expected_version=merging.version)
        self.assertEqual(applied.content["status"], "APPLIED")
        self.assertEqual(applied.content["proposal"], "adopt the cached pattern")
        self.assertEqual(self._count_everything(), before + 1)

    def test_consult_consultation_transition_rules(self):
        consultation = self.teams.open_consultation(self.owner, self.scope,
                                                    parent_session="session-a",
                                                    question="q", mode="ask")
        with self.assertRaises(Conflict) as raised:
            self.teams.consult_consultation(self.owner, self.scope,
                                            consultation.id, status="MERGING",
                                            expected_version=1)
        self.assertIn("Illegal consultation transition OPEN -> MERGING",
                      str(raised.exception))
        with self.assertRaises(InvalidRequest):
            self.teams.consult_consultation(self.owner, self.scope,
                                            consultation.id, status="BOGUS",
                                            expected_version=1)
        with self.assertRaises(Conflict):
            self.teams.consult_consultation(self.owner, self.scope,
                                            consultation.id, status="RECEIVED",
                                            expected_version=99)
        received = self.teams.consult_consultation(self.owner, self.scope,
                                                   consultation.id, status="RECEIVED",
                                                   expected_version=1)
        with self.assertRaises(Conflict):
            self.teams.consult_consultation(self.owner, self.scope,
                                            consultation.id, status="RECEIVED",
                                            expected_version=received.version)
        # OPEN -> RECEIVED -> MERGING -> NEEDS_DECISION is the other legal path.
        merging = self.teams.consult_consultation(self.owner, self.scope,
                                                  consultation.id, status="MERGING",
                                                  expected_version=received.version)
        self.teams.consult_consultation(self.owner, self.scope,
                                        consultation.id, status="NEEDS_DECISION",
                                        expected_version=merging.version)

    def test_consultation_is_invisible_to_another_session(self):
        self.teams.open_consultation(self.owner, self.scope,
                                     parent_session="session-a", question="q-a", mode="ask")
        self.teams.open_consultation(self.owner, self.scope,
                                     parent_session="session-b", question="q-b", mode="ask")
        session_a = self.teams.list_consultations(self.owner, self.scope,
                                                  parent_session="session-a")
        session_b = self.teams.list_consultations(self.owner, self.scope,
                                                  parent_session="session-b")
        self.assertEqual(len(session_a), 1)
        self.assertEqual(session_a[0].content["question"], "q-a")
        self.assertEqual(len(session_b), 1)
        self.assertEqual(session_b[0].content["question"], "q-b")
        # Without a session the caller cannot tell which consultations are its
        # own, so none are returned rather than another session's.
        with self.assertRaises(InvalidRequest):
            self.teams.list_consultations(self.owner, self.scope)
        self.assertEqual(len(self.teams.list_consultations(self.owner, self.scope,
                                                           parent_session="session-a")), 1)

    def test_project_state_fingerprint_is_stable_and_changes(self):
        first = project_state_fingerprint(self.store, self.scope)
        second = project_state_fingerprint(self.store, self.scope)
        self.assertEqual(first, second)
        decisions = DecisionService(self.store)
        decisions.record(self.owner, self.scope, text="use model X",
                         meaning="owner decision", authorization_source="owner policy")
        third = project_state_fingerprint(self.store, self.scope)
        self.assertNotEqual(second, third)

    def test_outsider_cannot_open_consultation(self):
        with self.assertRaises(AccessDenied):
            self.teams.open_consultation(self.other, self.scope,
                                         parent_session="session-a", question="q")


if __name__ == "__main__":
    unittest.main()
