from contextlib import closing
from __future__ import annotations

from dataclasses import replace
from pathlib import Path
import sqlite3
import os
import signal
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

from dai.contracts import Principal, Scope
from dai.errors import AccessDenied, Conflict, Gone, IntegrityFailure, NotFound
from dai.memory import MemoryStore


class MemoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="dai-memory-")
        self.base = Path(self.temp.name)
        self.owner = Principal("owner")
        self.other = Principal("other")
        self.store = MemoryStore(self.base / "state")
        self.project = self.store.create_project(self.owner, "مشروع البحث", project_id="research")
        self.person = Scope("person", "owner")

    def tearDown(self):
        self.temp.cleanup()

    def record(self, **content):
        return self.store.create(self.owner, self.project, "note", content)

    def test_private_content_survives_reopen_without_plaintext_on_disk(self):
        text = "Private health preference: deterministic-test-secret"
        record = self.store.create(self.owner, self.person, "preference", {"text": text})
        reopened = MemoryStore(self.base / "state")
        self.assertEqual(reopened.get(self.owner, self.person, record.id).content["text"], text)
        for path in (self.base / "state").glob("*.db*"):
            self.assertNotIn(text.encode(), path.read_bytes())

    def test_project_membership_does_not_grant_personal_or_other_project_memory(self):
        item = self.store.create(self.owner, self.person, "preference", {"text": "private"})
        self.store.grant(self.owner, self.project, self.other, "reader")
        with self.assertRaises(AccessDenied):
            self.store.get(self.other, self.person, item.id)
        second = self.store.create_project(self.owner, "Other project")
        with self.assertRaises(AccessDenied):
            self.store.list(self.other, second)

    def test_protected_decisions_require_explicit_decision_grant(self):
        self.store.grant(self.owner, self.project, self.other, "contributor")
        note = self.store.create(self.other, self.project, "note", {"text": "proposal"})
        self.assertEqual(note.created_by, "other")
        with self.assertRaises(AccessDenied):
            self.store.create(self.other, self.project, "decision", {"text": "new goal"})
        self.store.grant(self.owner, self.project, self.other, "coordinator", extra_capabilities={"decide"})
        decision = self.store.create(self.other, self.project, "decision", {"text": "explicitly delegated"})
        self.assertEqual(decision.version, 1)

    def test_reviewer_can_write_review_but_not_modify_implementation_notes(self):
        item = self.record(text="implementation")
        self.store.grant(self.owner, self.project, self.other, "reviewer")
        report = self.store.create(self.other, self.project, "review", {"findings": []})
        self.assertEqual(report.kind, "review")
        with self.assertRaises(AccessDenied):
            self.store.update(self.other, self.project, item.id, {"text": "changed"}, expected_version=1)

    def test_revocation_is_seen_by_an_already_open_store(self):
        self.store.grant(self.owner, self.project, self.other, "reader")
        second = MemoryStore(self.base / "state")
        self.assertTrue(second.list(self.other, self.project))
        self.store.revoke(self.owner, self.project, self.other)
        with self.assertRaises(AccessDenied):
            second.list(self.other, self.project)

    def test_version_fencing_prevents_lost_update_between_store_instances(self):
        item = self.record(text="initial")
        second = MemoryStore(self.base / "state")
        barrier = threading.Barrier(2)
        outcomes = []

        def writer(store, text):
            barrier.wait(timeout=5)
            try:
                store.update(self.owner, self.project, item.id, {"text": text}, expected_version=1)
                outcomes.append("written")
            except Conflict:
                outcomes.append("conflict")

        threads = [threading.Thread(target=writer, args=(s, str(i))) for i, s in enumerate((self.store, second))]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)
            self.assertFalse(thread.is_alive())
        self.assertCountEqual(outcomes, ["written", "conflict"])
        self.assertEqual(self.store.get(self.owner, self.project, item.id).version, 2)

    def test_text_forgetting_archives_and_is_explicitly_recoverable(self):
        item = self.record(text="علاج الذكاء الاصطناعي")
        self.assertEqual([r.id for r in self.store.search(self.owner, self.project, "الذكاء")], [item.id])
        archived = self.store.archive(self.owner, self.project, item.id, expected_version=1)
        self.assertEqual(archived.status, "ARCHIVED")
        self.assertEqual(self.store.search(self.owner, self.project, "الذكاء"), [])
        with self.assertRaises(NotFound):
            self.store.get(self.owner, self.project, item.id)
        self.assertEqual(self.store.get(self.owner, self.project, item.id, include_archived=True).content, item.content)
        restored = self.store.restore_record(self.owner, self.project, item.id, expected_version=2)
        self.assertEqual(restored.status, "ACTIVE")
        self.assertEqual(restored.version, 3)

    def test_tampered_authenticated_metadata_fails_instead_of_returning_content(self):
        item = self.record(text="not a plausible fallback")
        with closing(sqlite3.connect(self.base / "state/project.db")) as db, db:
            db.execute("UPDATE records SET kind='different' WHERE id=?", (item.id,))
        with self.assertRaises(IntegrityFailure):
            self.store.get(self.owner, self.project, item.id)

    def test_stale_purge_confirmation_cannot_delete_new_content(self):
        item = self.record(text="old")
        confirmation = self.store.request_purge(self.owner, self.project, item.id, expected_version=1)
        self.store.update(self.owner, self.project, item.id, {"text": "new"}, expected_version=1)
        with self.assertRaises(Conflict):
            self.store.confirm_purge(self.owner, confirmation)
        self.assertEqual(self.store.get(self.owner, self.project, item.id).content["text"], "new")

    def test_purge_confirmation_is_bound_to_actor_record_and_expiry(self):
        item = self.record(text="one")
        other_item = self.record(text="two")
        confirmation = self.store.request_purge(self.owner, self.project, item.id, expected_version=1)
        with self.assertRaises(AccessDenied):
            self.store.confirm_purge(self.other, confirmation)
        with self.assertRaises(Conflict):
            self.store.confirm_purge(self.owner, replace(confirmation, record_id=other_item.id))
        with patch("dai.memory.time.time", return_value=0):
            expired = self.store.request_purge(self.owner, self.project, item.id, expected_version=1)
        with self.assertRaises(Conflict):
            self.store.confirm_purge(self.owner, expired)

    def test_purge_destroys_revisions_and_cannot_be_restored_from_database_snapshot(self):
        item = self.record(text="erased-private-content")
        self.store.snapshot(self.owner, self.base / "before")
        self.assertEqual(sorted(p.name for p in (self.base / "before").iterdir()),
                         ["global.db", "person.db", "project.db", "snapshot.json"])
        confirmation = self.store.request_purge(self.owner, self.project, item.id, expected_version=1)
        self.store.confirm_purge(self.owner, confirmation)
        with self.assertRaises(Gone):
            self.store.get(self.owner, self.project, item.id, include_archived=True)
        self.store.restore_snapshot(self.owner, self.base / "before")
        with self.assertRaises(Gone):
            self.store.get(self.owner, self.project, item.id, include_archived=True)
        self.assertEqual(self.store.search(self.owner, self.project, "erased-private-content"), [])
        with closing(sqlite3.connect(self.base / "state/project.db")) as db, db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM revisions WHERE record_id=?", (item.id,)).fetchone()[0], 0)
            self.assertNotIn("erased-private-content", str(db.execute("SELECT * FROM audit").fetchall()))

    def test_process_restart_finishes_purge_after_key_destruction_boundary(self):
        item = self.record(text="must not return")
        confirmation = self.store.request_purge(self.owner, self.project, item.id, expected_version=1)
        destroy = self.store.vault.destroy

        def crash_after_key_delete(key_id):
            destroy(key_id)
            raise OSError("simulated abrupt boundary")

        with patch.object(self.store.vault, "destroy", side_effect=crash_after_key_delete):
            with self.assertRaises(OSError):
                self.store.confirm_purge(self.owner, confirmation)
        reopened = MemoryStore(self.base / "state")
        with self.assertRaises(Gone):
            reopened.get(self.owner, self.project, item.id)
        with closing(sqlite3.connect(self.base / "state/project.db")) as db, db:
            self.assertEqual(db.execute("SELECT state FROM purge_requests").fetchone()[0], "COMPLETED")

    def test_corrupt_snapshot_rejected_before_changing_live_record(self):
        item = self.record(text="live")
        backup = self.store.snapshot(self.owner, self.base / "backup")
        with (backup / "person.db").open("ab") as file:
            file.write(b"tampered")
        with self.assertRaises(IntegrityFailure):
            self.store.restore_snapshot(self.owner, backup)
        self.assertEqual(self.store.get(self.owner, self.project, item.id).content["text"], "live")

    def test_other_installation_snapshot_does_not_import_old_key_authority(self):
        self.record(text="one installation")
        backup = self.store.snapshot(self.owner, self.base / "backup")
        other = MemoryStore(self.base / "other-install")
        with self.assertRaises(IntegrityFailure):
            other.restore_snapshot(self.owner, backup)

    def test_partial_three_database_restore_is_completed_before_next_read(self):
        person = self.store.create(self.owner, self.person, "preference", {"value": "old-person"})
        project = self.record(value="old-project")
        global_scope = Scope("global", "owner")
        global_item = self.store.create(self.owner, global_scope, "note", {"value": "old-global"})
        backup = self.store.snapshot(self.owner, self.base / "backup")
        for scope, record in [(self.person, person), (self.project, project), (global_scope, global_item)]:
            self.store.update(self.owner, scope, record.id, {"value": "new"}, expected_version=1)
        apply_plane = self.store._apply_restore_plane

        def crash_after_first_plane(stage, plane):
            apply_plane(stage, plane)
            if plane == "person":
                raise OSError("simulated process boundary")

        with patch.object(self.store, "_apply_restore_plane", side_effect=crash_after_first_plane):
            with self.assertRaises(IntegrityFailure):
                self.store.restore_snapshot(self.owner, backup)
        self.assertTrue((self.base / "state/.restore.json").exists())
        # Existing processes also honor the journal, not just a fresh constructor.
        self.assertEqual(self.store.get(self.owner, self.project, project.id).content["value"], "old-project")
        self.assertEqual(self.store.get(self.owner, self.person, person.id).content["value"], "old-person")
        self.assertEqual(self.store.get(self.owner, global_scope, global_item.id).content["value"], "old-global")
        self.assertFalse((self.base / "state/.restore.json").exists())

    def test_fresh_process_recovers_interrupted_restore(self):
        item = self.record(text="old")
        backup = self.store.snapshot(self.owner, self.base / "backup")
        self.store.update(self.owner, self.project, item.id, {"text": "new"}, expected_version=1)
        with patch.object(self.store, "_apply_restore_plane", side_effect=OSError("crash")):
            with self.assertRaises(IntegrityFailure):
                self.store.restore_snapshot(self.owner, backup)
        reopened = MemoryStore(self.base / "state")
        self.assertEqual(reopened.get(self.owner, self.project, item.id).content["text"], "old")

    @unittest.skipUnless(os.name == "posix", "SIGKILL boundary is a POSIX acceptance case")
    def test_sigkill_after_key_unlink_recovers_without_revealing_deleted_record(self):
        item = self.record(text="unrecoverable after actual process kill")
        code = '''
import os,signal,sys
from dai.memory import MemoryStore
from dai.contracts import Principal,Scope
s=MemoryStore(sys.argv[1]); a=Principal('owner'); p=Scope('project','owner','research')
c=s.request_purge(a,p,sys.argv[2],expected_version=1)
original=s.vault.destroy
def destroy(key):
    original(key)
    os.kill(os.getpid(),signal.SIGKILL)
s.vault.destroy=destroy
s.confirm_purge(a,c)
'''
        child = subprocess.run([sys.executable, "-c", code, str(self.base / "state"), item.id], timeout=10)
        self.assertEqual(child.returncode, -signal.SIGKILL)
        reopened = MemoryStore(self.base / "state")
        with self.assertRaises(Gone):
            reopened.get(self.owner, self.project, item.id)

    @unittest.skipUnless(os.name == "posix", "SIGKILL boundary is a POSIX acceptance case")
    def test_sigkill_between_database_planes_recovers_complete_snapshot(self):
        item = self.record(text="before snapshot")
        backup = self.store.snapshot(self.owner, self.base / "backup")
        self.store.update(self.owner, self.project, item.id, {"text": "after snapshot"}, expected_version=1)
        code = '''
import os,signal,sys
from dai.memory import MemoryStore
from dai.contracts import Principal
s=MemoryStore(sys.argv[1]); original=s._apply_restore_plane
def apply(stage,plane):
    original(stage,plane)
    if plane=='person':os.kill(os.getpid(),signal.SIGKILL)
s._apply_restore_plane=apply
s.restore_snapshot(Principal('owner'),sys.argv[2])
'''
        child = subprocess.run([sys.executable, "-c", code, str(self.base / "state"), str(backup)], timeout=10)
        self.assertEqual(child.returncode, -signal.SIGKILL)
        reopened = MemoryStore(self.base / "state")
        self.assertEqual(reopened.get(self.owner, self.project, item.id).content["text"], "before snapshot")


if __name__ == "__main__":
    unittest.main()
