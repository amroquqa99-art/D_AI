"""Portable exclusive writer locks and fail-closed Windows private ACLs.

Windows uses kernel byte-range locks plus an explicit protected DACL granting
the current logon SID and LocalSystem full access. Never interpret Windows
chmod bits as an ACL audit. All Windows APIs are loaded lazily.
"""
from __future__ import annotations

from contextlib import contextmanager
import errno
import os
from pathlib import Path
import stat
import time
from typing import Iterator


@contextmanager
def exclusive_writer_lock(fd: int) -> Iterator[None]:
    if os.name != "nt":
        import fcntl
        fcntl.flock(fd, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
        return

    import msvcrt
    deadline = time.monotonic() + 30
    while True:
        try:
            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
            break
        except OSError as exc:
            if exc.errno not in (errno.EACCES, errno.EAGAIN, errno.EDEADLOCK):
                raise
            if time.monotonic() >= deadline:
                raise TimeoutError("D_AI writer lock timed out") from exc
            time.sleep(0.05)
    try:
        yield
    finally:
        os.lseek(fd, 0, os.SEEK_SET)
        msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)


def _reject_reparse(path: Path) -> None:
    if path.is_symlink():
        raise ValueError("Private state must not use symlinks")
    if os.name == "nt" and path.exists():
        attrs = getattr(path.lstat(), "st_file_attributes", 0)
        if attrs & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0):
            raise ValueError("Private state must not use Windows reparse points")


def _windows_user_sid() -> str:
    import ctypes
    from ctypes import wintypes

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    advapi = ctypes.WinDLL("advapi32", use_last_error=True)
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    advapi.OpenProcessToken.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
    advapi.OpenProcessToken.restype = wintypes.BOOL
    advapi.GetTokenInformation.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p,
                                          wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
    advapi.GetTokenInformation.restype = wintypes.BOOL
    advapi.ConvertSidToStringSidW.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
    advapi.ConvertSidToStringSidW.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.LocalFree.argtypes = [ctypes.c_void_p]

    token = wintypes.HANDLE()
    if not advapi.OpenProcessToken(kernel.GetCurrentProcess(), 0x0008, ctypes.byref(token)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        size = wintypes.DWORD()
        advapi.GetTokenInformation(token, 1, None, 0, ctypes.byref(size))
        if not size.value:
            raise ctypes.WinError(ctypes.get_last_error())
        buffer = ctypes.create_string_buffer(size.value)
        if not advapi.GetTokenInformation(token, 1, buffer, size, ctypes.byref(size)):
            raise ctypes.WinError(ctypes.get_last_error())
        sid = ctypes.cast(buffer, ctypes.POINTER(ctypes.c_void_p))[0]
        sid_string = ctypes.c_void_p()
        if not advapi.ConvertSidToStringSidW(sid, ctypes.byref(sid_string)):
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            return ctypes.wstring_at(sid_string.value)
        finally:
            kernel.LocalFree(sid_string)
    finally:
        kernel.CloseHandle(token)


def protect_windows_path(path: Path, *, directory: bool) -> None:
    """Replace the DACL; never merely add an ACE to an unsafe inherited ACL."""
    if os.name != "nt":
        return
    _reject_reparse(path)
    if not path.exists():
        raise FileNotFoundError(path)

    import ctypes
    from ctypes import wintypes
    advapi = ctypes.WinDLL("advapi32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)

    inherit = "OICI" if directory else ""
    current_sid = _windows_user_sid()
    sddl = f"D:P(A;{inherit};FA;;;{current_sid})(A;{inherit};FA;;;SY)"
    convert = advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW
    convert.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(ctypes.c_void_p),
                        ctypes.POINTER(wintypes.DWORD)]
    convert.restype = wintypes.BOOL
    get_dacl = advapi.GetSecurityDescriptorDacl
    get_dacl.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.BOOL),
                         ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.BOOL)]
    get_dacl.restype = wintypes.BOOL
    set_info = advapi.SetNamedSecurityInfoW
    set_info.argtypes = [wintypes.LPWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                         ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
    set_info.restype = wintypes.DWORD
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    descriptor = ctypes.c_void_p()
    if not convert(sddl, 1, ctypes.byref(descriptor), None):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        present = wintypes.BOOL()
        dacl = ctypes.c_void_p()
        defaulted = wintypes.BOOL()
        if not get_dacl(descriptor, ctypes.byref(present), ctypes.byref(dacl),
                        ctypes.byref(defaulted)) or not present.value:
            raise ctypes.WinError(ctypes.get_last_error())
        # SE_FILE_OBJECT=1; DACL_SECURITY_INFORMATION=4;
        # PROTECTED_DACL_SECURITY_INFORMATION=0x80000000
        status = set_info(str(path), 1, 0x80000004, None, None, dacl, None)
        if status:
            raise OSError(status, "Cannot secure Windows private state ACL", str(path))
    finally:
        kernel.LocalFree(descriptor)


def protect_existing_windows_tree(root: Path) -> None:
    """Restrict preexisting state as well as files created under the new DACL."""
    if os.name != "nt":
        return
    _reject_reparse(root)
    for base, dirs, files in os.walk(root, followlinks=False):
        parent = Path(base)
        _reject_reparse(parent)
        protect_windows_path(parent, directory=True)
        for name in dirs + files:
            _reject_reparse(parent / name)
        for name in files:
            protect_windows_path(parent / name, directory=False)
