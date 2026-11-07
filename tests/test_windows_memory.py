"""Windows acceptance cases for private D_AI memory storage.

These tests are skipped on non-Windows hosts and run on GitHub's Windows runner.
"""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

from dai.contracts import Principal
from dai.memory import MemoryStore
from dai.platform_fs import exclusive_writer_lock, _windows_user_sid


@unittest.skipUnless(os.name == "nt", "Windows ACL/locking acceptance only")
class WindowsEncryptedMemoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="dai-win-memory-")
        self.root = Path(self.temp.name) / "state"
        self.owner = Principal("owner")

    def tearDown(self):
        self.temp.cleanup()

    def test_encrypted_data_survives_process_reopen(self):
        store = MemoryStore(self.root)
        scope = store.create_project(self.owner, "Windows test", project_id="win-project")
        item = store.create(self.owner, scope, "note", {"text": "Windows encrypted secret marker"})
        reopened = MemoryStore(self.root)
        self.assertEqual(reopened.get(self.owner, scope, item.id).content["text"],
                         "Windows encrypted secret marker")
        for path in self.root.glob("*.db*"):
            self.assertNotIn(b"Windows encrypted secret marker", path.read_bytes())

    def test_private_dacl_is_protected_and_excludes_everyone(self):
        import ctypes
        from ctypes import wintypes
        advapi = ctypes.WinDLL("advapi32", use_last_error=True)
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        get_info = advapi.GetNamedSecurityInfoW
        get_info.argtypes = [wintypes.LPWSTR, wintypes.DWORD, wintypes.DWORD,
                             ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
                             ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
        get_info.restype = wintypes.DWORD
        convert = advapi.ConvertSecurityDescriptorToStringSecurityDescriptorW
        convert.argtypes = [ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD,
                            ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.DWORD)]
        convert.restype = wintypes.BOOL
        kernel.LocalFree.argtypes = [ctypes.c_void_p]

        store = MemoryStore(self.root)
        key = next((self.root / "keys").glob("*.key"))
        for path in (self.root, self.root / "keys", key, self.root / "person.db"):
            descriptor = ctypes.c_void_p()
            status = get_info(str(path), 1, 4, None, None, None, None, ctypes.byref(descriptor))
            self.assertEqual(status, 0, f"Windows ACL query failed for {path}")
            try:
                serialized = ctypes.c_void_p()
                self.assertTrue(convert(descriptor, 1, 4, ctypes.byref(serialized), None))
                try:
                    acl = ctypes.wstring_at(serialized.value)
                finally:
                    kernel.LocalFree(serialized)
            finally:
                kernel.LocalFree(descriptor)
            self.assertTrue(acl.startswith("D:P"), acl)
            # Windows SDDL canonicalizes the built-in Administrator SID (-500) as LA.
            sid = _windows_user_sid()
            self.assertTrue(sid in acl or (sid.endswith("-500") and ";;;LA)" in acl), acl)
            self.assertNotIn(";;;WD)", acl)
            self.assertNotIn(";;;BU)", acl)

    def test_lock_is_released_across_processes(self):
        MemoryStore(self.root)
        path = self.root / ".writer.lock"
        fd = os.open(path, os.O_RDWR)
        process = None
        try:
            with exclusive_writer_lock(fd):
                child = ("import os,sys\n"
                         "from dai.platform_fs import exclusive_writer_lock\n"
                         "fd=os.open(sys.argv[1],os.O_RDWR)\n"
                         "with exclusive_writer_lock(fd): print('ACQUIRED',flush=True)\n"
                         "os.close(fd)\n")
                process = subprocess.Popen([sys.executable, "-c", child, str(path)],
                                           stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                           text=True)
                time.sleep(0.5)
                self.assertIsNone(process.poll(), "Child acquired lock while parent held it")
            out, err = process.communicate(timeout=15)
            self.assertEqual(process.returncode, 0, err)
            self.assertIn("ACQUIRED", out)
        finally:
            os.close(fd)
            if process and process.poll() is None:
                process.kill()
                process.communicate()


    def test_forced_process_exit_after_key_unlink_recovers_purge(self):
        """A hard exit between key deletion and DB updates must not resurrect data."""
        from dai.contracts import Scope
        from dai.errors import Gone

        store = MemoryStore(self.root)
        scope = store.create_project(self.owner, "Crash purge", project_id="crash-purge")
        record = store.create(self.owner, scope, "note", {"text": "never recover deleted bytes"})
        code = """
import os,sys
from dai.memory import MemoryStore
from dai.contracts import Principal,Scope
store=MemoryStore(sys.argv[1])
owner=Principal('owner')
scope=Scope('project','owner','crash-purge')
confirmation=store.request_purge(owner,scope,sys.argv[2],expected_version=1)
original=store.vault.destroy
def crash_after_destroy(key):
    original(key)
    os._exit(37)
store.vault.destroy=crash_after_destroy
store.confirm_purge(owner,confirmation)
"""
        child = subprocess.run([sys.executable, "-c", code, str(self.root), record.id],
                               timeout=20, capture_output=True, text=True)
        self.assertEqual(child.returncode, 37, child.stderr)
        reopened = MemoryStore(self.root)
        with self.assertRaises(Gone):
            reopened.get(self.owner, scope, record.id)
        self.assertEqual(reopened.search(self.owner, scope, "never recover deleted bytes"), [])

    def test_forced_process_exit_after_first_restore_plane_recovers_entire_snapshot(self):
        """A hard exit after restoring one DB plane must not expose mixed versions."""
        from dai.contracts import Scope

        store = MemoryStore(self.root)
        project = store.create_project(self.owner, "Crash restore", project_id="crash-restore")
        personal = Scope("person", "owner")
        records = [
            (personal, store.create(self.owner, personal, "note", {"value": "old-person"})),
            (project, store.create(self.owner, project, "note", {"value": "old-project"})),
        ]
        snapshot = store.snapshot(self.owner, Path(self.temp.name) / "snapshot")
        for scope, item in records:
            store.update(self.owner, scope, item.id, {"value": "new"},
                         expected_version=1)
        code = """
import os,sys
from dai.memory import MemoryStore
from dai.contracts import Principal
store=MemoryStore(sys.argv[1])
original=store._apply_restore_plane
def crash_after_one_plane(stage,plane):
    original(stage,plane)
    if plane=='person':
        os._exit(39)
store._apply_restore_plane=crash_after_one_plane
store.restore_snapshot(Principal('owner'),sys.argv[2])
"""
        child = subprocess.run([sys.executable, "-c", code, str(self.root), str(snapshot)],
                               timeout=20, capture_output=True, text=True)
        self.assertEqual(child.returncode, 39, child.stderr)
        reopened = MemoryStore(self.root)
        for scope, item in records:
            self.assertEqual(reopened.get(self.owner, scope, item.id).content["value"],
                             "old-person" if scope == personal else "old-project")
        self.assertFalse((self.root / ".restore.json").exists())


if __name__ == "__main__":
    unittest.main()
