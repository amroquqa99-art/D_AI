from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest

import dai.updates as updates_module
from dai.contracts import Principal, Scope
from dai.errors import Conflict, InvalidRequest, NotFound
from dai.memory import MemoryStore
from dai.updates import CHECK_INTERVAL_DAYS, UpdateWatcher, fetch_source


class FixedClock:
    """An injected, monotonically advanceable clock for deterministic tests."""

    def __init__(self, start: datetime) -> None:
        self.now = start

    def advance(self, days: float = 0, seconds: float = 0) -> datetime:
        self.now += timedelta(days=days, seconds=seconds)
        return self.now


class UpdateWatcherTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dai-updates-")
        self.store = MemoryStore(Path(self.tmp.name) / "state")
        self.owner = Principal("owner")
        self.scope = self.store.create_project(self.owner, "the-update-project")
        self.state_dir = Path(self.tmp.name) / "watcher-state"
        self.watcher = UpdateWatcher(self.store, state_dir=self.state_dir)
        self.clock = FixedClock(datetime(2026, 1, 5, 12, 0, 0, tzinfo=timezone.utc))
        self.success_source = "https://github.com/acme/repo"
        self.fail_source = "https://github.com/acme/repo-fail"

    def tearDown(self):
        self.tmp.cleanup()

    def _succeed(self, source: str, timeout: float = 10.0) -> tuple[bool, str]:
        return True, "HTTP 200"

    def _fail(self, source: str, timeout: float = 10.0) -> tuple[bool, str]:
        return False, "connection refused"

    def test_due_is_false_before_seven_days_and_true_at_seven_days(self):
        self.watcher.record_check(self.owner, success=True, detail="HTTP 200",
                                  watched=self.success_source, now=self.clock.now)
        self.assertFalse(self.watcher.due(self.owner, now=self.clock.now))
        self.clock.advance(days=6, seconds=23 * 3600 + 59 * 60 + 59)
        self.assertFalse(self.watcher.due(self.owner, now=self.clock.now))
        self.clock.advance(seconds=1)  # exactly 7 days after the last success
        self.assertTrue(self.watcher.due(self.owner, now=self.clock.now))
        self.clock.advance(days=1)
        self.assertTrue(self.watcher.due(self.owner, now=self.clock.now))

    def test_due_is_true_when_no_check_has_ever_succeeded(self):
        self.assertTrue(self.watcher.due(self.owner, now=self.clock.now))

    def test_failed_check_does_not_become_last_success(self):
        self.watcher.record_check(self.owner, success=True, detail="HTTP 200",
                                  watched=self.success_source, now=self.clock.now)
        updates_module.fetch_source = self._fail
        try:
            result = self.watcher.check(self.owner, source=self.fail_source,
                                        now=self.clock.now + timedelta(days=3))
        finally:
            updates_module.fetch_source = fetch_source
        self.assertFalse(result["ok"])
        self.assertEqual(result["detail"], "connection refused")
        # The failure did not become last_success: a check is still due at day 7.
        self.assertFalse(self.watcher.due(self.owner, now=self.clock.now + timedelta(days=3)))
        self.assertTrue(self.watcher.due(self.owner, now=self.clock.now + timedelta(days=7)))

    def test_ten_idle_days_still_produce_exactly_one_due_check(self):
        self.watcher.record_check(self.owner, success=True, detail="HTTP 200",
                                  watched=self.success_source, now=self.clock.now)
        self.clock.advance(days=10)  # ten idle days
        self.assertTrue(self.watcher.due(self.owner, now=self.clock.now))
        # Exactly one check is due; running it once moves last_success.
        updates_module.fetch_source = self._succeed
        try:
            result = self.watcher.check(self.owner, source=self.success_source,
                                        now=self.clock.now)
        finally:
            updates_module.fetch_source = fetch_source
        self.assertTrue(result["ok"])
        check_time = self.clock.now.isoformat()
        self.assertFalse(self.watcher.due(self.owner, now=self.clock.now))
        self.clock.advance(days=7)
        self.assertTrue(self.watcher.due(self.owner, now=self.clock.now))
        # The single state file holds one last_success (the check at day 10),
        # not ten accumulated checks.
        data = json.loads((self.state_dir / "updates.json").read_text(encoding="utf-8"))
        self.assertEqual(data["last_success"], check_time)

    def test_check_records_success_and_failure_honestly(self):
        updates_module.fetch_source = self._succeed
        try:
            result = self.watcher.check(self.owner, source=self.success_source,
                                        now=self.clock.now)
        finally:
            updates_module.fetch_source = fetch_source
        self.assertTrue(result["ok"])
        self.assertEqual(self.watcher.status(self.owner)["last_success"],
                         self.clock.now.isoformat())
        updates_module.fetch_source = self._fail
        try:
            result = self.watcher.check(self.owner, source=self.fail_source,
                                        now=self.clock.now + timedelta(days=1))
        finally:
            updates_module.fetch_source = fetch_source
        self.assertFalse(result["ok"])
        # The failure does not move last_success.
        self.assertEqual(self.watcher.status(self.owner)["last_success"],
                         self.clock.now.isoformat())

    def test_check_validates_source_and_uses_injected_now(self):
        # A source that cannot be fetched is a failure, never a success.
        updates_module.fetch_source = self._fail
        try:
            result = self.watcher.check(self.owner, source=self.fail_source,
                                        now=self.clock.now)
        finally:
            updates_module.fetch_source = fetch_source
        self.assertFalse(result["ok"])
        updates_module.fetch_source = self._succeed
        try:
            result = self.watcher.check(self.owner, source=self.success_source,
                                        now=self.clock.now)
        finally:
            updates_module.fetch_source = fetch_source
        self.assertEqual(result["checked_at"], self.clock.now.isoformat())

    def test_status_shape(self):
        status = self.watcher.status(self.owner)
        self.assertEqual(set(status), {"last_success", "last_result", "watched", "due"})
        self.assertIsNone(status["last_success"])
        self.assertIsNone(status["last_result"])
        self.assertIsNone(status["watched"])
        self.assertTrue(status["due"])

    def test_plan_records_pending_update(self):
        record = self.watcher.plan(self.owner, self.scope, source=self.success_source,
                                   version="v1.2.3", commit="abc1234",
                                   diff="+ one line", impact="minor",
                                   migration="run migrations")
        self.assertEqual(record.kind, "update")
        self.assertEqual(record.content["state"], "PENDING")
        self.assertEqual(record.content["decision"], None)
        self.assertEqual(record.version, 1)
        with self.store._db("project") as db:
            row = db.execute(
                "SELECT state, version FROM update_index WHERE update_id=?",
                (record.id,)).fetchone()
            self.assertEqual((row[0], row[1]), ("PENDING", 1))

    def test_plan_requires_project_scope(self):
        with self.assertRaises(InvalidRequest):
            self.watcher.plan(self.owner, Scope("person", "owner"), source="x",
                              version="v", commit="c", diff="d", impact="i")

    def test_decide_accepts_update_defer_and_ignore(self):
        # One decision per update: a fresh plan per decision.
        for decision in ("update", "defer", "ignore"):
            record = self.watcher.plan(self.owner, self.scope, source="s",
                                       version="v", commit="c", diff="d", impact="i")
            decided = self.watcher.decide(self.owner, self.scope, record.id,
                                          decision=decision, expected_version=1)
            self.assertEqual(decided.content["decision"], decision)
            self.assertEqual(decided.content["state"], "DECIDED")

    def test_decide_is_version_fenced_and_one_per_update(self):
        record = self.watcher.plan(self.owner, self.scope, source="s", version="v",
                                   commit="c", diff="d", impact="i")
        first = self.watcher.decide(self.owner, self.scope, record.id,
                                    decision="update", expected_version=1)
        # The same decision again returns the same record.
        again = self.watcher.decide(self.owner, self.scope, record.id,
                                    decision="update", expected_version=2)
        self.assertEqual(again.id, first.id)
        self.assertEqual(again.version, 2)
        # A different decision raises Conflict.
        with self.assertRaises(Conflict):
            self.watcher.decide(self.owner, self.scope, record.id,
                                decision="ignore", expected_version=2)
        # A stale expected_version raises Conflict.
        with self.assertRaises(Conflict):
            self.watcher.decide(self.owner, self.scope, record.id,
                                decision="defer", expected_version=1)
        # An invalid decision is rejected.
        with self.assertRaises(InvalidRequest):
            self.watcher.decide(self.owner, self.scope, record.id,
                                decision="approve", expected_version=2)

    def test_apply_requires_a_prior_owner_decision(self):
        record = self.watcher.plan(self.owner, self.scope, source="s", version="v",
                                   commit="c", diff="d", impact="i")
        with self.assertRaises(InvalidRequest):
            self.watcher.apply(self.owner, self.scope, record.id,
                               expected_version=1)
        self.watcher.decide(self.owner, self.scope, record.id,
                            decision="update", expected_version=1)

    def test_apply_records_rollback_token_and_idempotent_reapply(self):
        record = self.watcher.plan(self.owner, self.scope, source="s", version="v",
                                   commit="c", diff="d", impact="i")
        self.watcher.decide(self.owner, self.scope, record.id,
                            decision="update", expected_version=1)
        applied = self.watcher.apply(self.owner, self.scope, record.id,
                                     expected_version=2,
                                     rollback_token="owner-token-42")
        self.assertEqual(applied.content["state"], "APPLIED")
        self.assertEqual(applied.content["rollback_token"], "owner-token-42")
        self.assertEqual(applied.content["applied_by"], self.owner.id)
        # Re-applying the same applied decision returns the same record.
        again = self.watcher.apply(self.owner, self.scope, record.id,
                                   expected_version=3,
                                   rollback_token="owner-token-42")
        self.assertEqual(again.id, applied.id)
        self.assertEqual(again.version, 3)

    def test_apply_generates_a_rollback_token_when_none_is_given(self):
        record = self.watcher.plan(self.owner, self.scope, source="s", version="v",
                                   commit="c", diff="d", impact="i")
        self.watcher.decide(self.owner, self.scope, record.id,
                            decision="update", expected_version=1)
        applied = self.watcher.apply(self.owner, self.scope, record.id,
                                     expected_version=2)
        self.assertIsInstance(applied.content["rollback_token"], str)
        self.assertTrue(applied.content["rollback_token"])

    def test_apply_is_version_fenced(self):
        record = self.watcher.plan(self.owner, self.scope, source="s", version="v",
                                   commit="c", diff="d", impact="i")
        self.watcher.decide(self.owner, self.scope, record.id,
                            decision="update", expected_version=1)
        with self.assertRaises(Conflict):
            self.watcher.apply(self.owner, self.scope, record.id,
                               expected_version=1)

    def test_rollback_reverses_an_applied_update(self):
        record = self.watcher.plan(self.owner, self.scope, source="s", version="v",
                                   commit="c", diff="d", impact="i")
        self.watcher.decide(self.owner, self.scope, record.id,
                            decision="update", expected_version=1)
        applied = self.watcher.apply(self.owner, self.scope, record.id,
                                     expected_version=2,
                                     rollback_token="owner-token-42")
        reversed_update = self.watcher.rollback(self.owner, self.scope, record.id,
                                                expected_version=3)
        self.assertEqual(reversed_update.content["state"], "ROLLED_BACK")
        self.assertEqual(reversed_update.content["rollback_token"],
                         applied.content["rollback_token"])
        # Rollback of a non-applied update is refused.
        fresh = self.watcher.plan(self.owner, self.scope, source="s", version="v",
                                  commit="c", diff="d", impact="i")
        with self.assertRaises(InvalidRequest):
            self.watcher.rollback(self.owner, self.scope, fresh.id,
                                  expected_version=1)
        # A stale expected_version raises Conflict.
        with self.assertRaises(Conflict):
            self.watcher.rollback(self.owner, self.scope, record.id,
                                  expected_version=1)

    def test_check_interval_days_is_seven(self):
        self.assertEqual(CHECK_INTERVAL_DAYS, 7)


if __name__ == "__main__":
    unittest.main()
