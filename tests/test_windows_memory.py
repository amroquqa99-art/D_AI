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
            self.assertIn(_windows_user_sid(), acl)
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


if __name__ == "__main__":
    unittest.main()
