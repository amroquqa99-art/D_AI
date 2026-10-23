# Windows encrypted-memory acceptance — development checkpoint

This document describes the native Windows implementation introduced on
`feat/central-orchestrator-integrations`. It is **not a GA support declaration**.

## Portability and security changes

- File locking uses `msvcrt.locking` on Windows, with a bounded wait, while
  Unix retains `fcntl.flock`. Both lock the single `.writer.lock` for all
  three SQLite memory planes, including cross-process recovery operations.
- Windows private directories and existing files receive a *replacement*,
  protected DACL via the native Windows security API. Only the current logon
  SID and LocalSystem are granted access; existing inherited or explicit
  third-party ACEs are removed. Child files inherit the private directory ACL.
- Native Win32 access-control failures are fatal; the code does **not** treat
  `os.chmod(0o700)` as proof of privacy on Windows.
- Symlinks and reparse points inside the private store are rejected during
  the initial protection walk.
- The encrypted SQLite record schema, AES-GCM associated data, version fencing,
  key destruction and purge recovery contract are unchanged.

## Acceptance evidence still required

1. GitHub Actions job `Windows encrypted memory acceptance` on Python
   3.11 and 3.12 must pass (tests for protected DACL, interprocess writer
   contention, encrypted reopen and existing memory/mission recovery).
2. Run GUI side-by-side installers under a non-admin local user profile, check
   Windows file ownership/ACLs against an unrelated local account, and verify
   userData/profile isolation from OpenCode. The CLI CI tests are not substitutes.
3. Power-loss durability is **not proved**: Windows does not expose
   directory `fsync` through Python's `os.open` in this implementation.
   File `fsync` and SQLite `PRAGMA synchronous=FULL` remain in place, but a
   hardware power failure requires independent destructive fault-injection tests.
4. Test crash at every restore-journal boundary, encryption-key deletion and
   snapshot restoration on NTFS, including sudden process termination.
5. Audit behavior on network shares, FAT/exFAT, roaming profiles and junctions
   separately. If the filesystem cannot apply a protected DACL, fail closed.

## Run locally

```powershell
py -3.12 -m pip install -e .
py -3.12 -m unittest discover -s tests -p test_windows_memory.py -v
py -3.12 -m unittest discover -s tests -p test_memory.py -v
py -3.12 -m unittest discover -s tests -p test_mission.py -v
```

Do not integrate this branch into an installer or claim Windows memory is
production-ready until the acceptance evidence is recorded.
