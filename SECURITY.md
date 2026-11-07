# Security Policy

## Reporting

Please report a security issue privately to the repository owner rather than
opening a public issue. Include: what you found, the version or commit, the
exact steps to reproduce, and the impact you believe it has.

There is no published security contact address in this repository; use the
owner's usual private channel.

## What D_AI holds

D_AI stores data that can be sensitive by nature:

- three encrypted SQLite planes (`person.db`, `project.db`, `global.db`);
- per-record AES-GCM keys in the installation key directory;
- charters, decisions, agent trees, messages and consultations;
- capability packs and their pinned sources.

The key directory is what makes a record recoverable. A snapshot of the
databases alone cannot decrypt anything, and a destroyed record key cannot be
recovered from any database backup.

## Security properties this repository implements

| Property | Where |
|---|---|
| Every record encrypted with its own key (AES-GCM, AAD over authenticated metadata) | `src/dai/vault.py`, `src/dai/memory.py` |
| Tampered metadata or ciphertext fails as `IntegrityFailure` instead of returning content | `src/dai/memory.py` |
| Permanent purge destroys the key, so the content is unrecoverable from managed copies | `MemoryStore._finish_purge` |
| Purge requires an interactive local confirmation bound to actor, record, scope and version | `src/dai/cli.py` |
| Private state uses `0700` Unix permissions or protected Windows per-user/System DACLs; symlinks/reparse points are rejected on Windows | `src/dai/vault.py`, `src/dai/platform_fs.py` |
| Version fencing on every mutation; conflicts are refused, never merged | all core modules |
| Only identifiers and reasons appear in error messages, never record content | all core modules |
| Authority comes from a trusted local adapter, never from source or model text | `src/dai/contracts.py` |
| A tool gateway records and authorises; it executes no external action | `src/dai/tools.py` |

## What D_AI deliberately does not do

- It does not run models itself, so it holds no model credentials.
- It does not send mail, trade, sign, publish, or test external systems
  without explicit, scoped authorization.
- It does not treat an external file, link, skill or repository instruction as
  authorization. **Source text is not authorization.**
- It does not publish user data: the release tree contains no user data, no
  secrets and no archive.

## Known limits

- Cryptographic erasure is application-level. It cannot reach copies D_AI does
  not control: an earlier manual export, a backup taken outside D_AI, or
  content already sent to an external model provider. These limits are shown
  before a purge confirmation and are not promised away.
- Windows ACL and cross-process locking code is under acceptance testing; see
  `docs/WINDOWS_MEMORY_ACCEPTANCE.md`. Unsupported filesystems must fail closed.
  Windows power-loss recovery has not been independently verified.
- The tool gateway is a policy layer. Enforcement of an allowed external
  action still rests with the host and the provider behind it.

## Out of scope

D_AI is not a hardened multi-tenant service. V1 is single-user or small-team
on one local installation; a multi-tenant deployment needs a separate security
design.
