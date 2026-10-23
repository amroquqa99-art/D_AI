"""Per-record encryption keys deliberately excluded from ordinary snapshots.

Destroying a record key revokes every revision and old database-only backup.
This is application-level crypto-erasure, not a forensic claim about disks,
manually copied key directories or data already sent to an external provider.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .contracts import identifier
from .errors import Gone, IntegrityFailure, InvalidRequest
from .platform_fs import protect_windows_path


def sync_directory(path: Path) -> None:
    if os.name == "nt":
        # Windows does not support opening a directory for os.fsync via Python.
        # File contents are flushed separately; power-loss durability is not yet proven.
        return
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def private_directory(path: Path) -> Path:
    if path.is_symlink():
        raise InvalidRequest("Private state directories must not be symlinks")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not path.is_dir():
        raise InvalidRequest("A private state directory is required")
    if os.name == "nt":
        protect_windows_path(path, directory=True)
    else:
        os.chmod(path, 0o700)
        if path.stat().st_mode & 0o077:
            raise InvalidRequest("Private state requires Unix permissions; use a Linux filesystem")
    return path


class KeyVault:
    def __init__(self, path: Path, administrator: str):
        self.path = private_directory(path)
        identifier(administrator)
        self._put_new("installation.json", json.dumps({
            "id": secrets.token_hex(24), "administrator": administrator,
        }).encode(), exists_ok=True)
        self._put_new("index.key", secrets.token_bytes(32), exists_ok=True)
        try:
            self.installation = json.loads(self._read("installation.json"))
            identifier(self.installation["administrator"])
            self.index_key = self._read("index.key")
            if len(self.index_key) != 32:
                raise ValueError("key length")
        except (KeyError, ValueError, TypeError) as exc:
            raise IntegrityFailure("Invalid installation key metadata") from exc

    def _put_new(self, name: str, data: bytes, *, exists_ok: bool = False) -> None:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        try:
            fd = os.open(self.path / name, flags, 0o600)
        except FileExistsError:
            if exists_ok:
                return
            raise IntegrityFailure("Encryption key identifier collision") from None
        with os.fdopen(fd, "wb") as file:
            file.write(data)
            file.flush()
            os.fsync(file.fileno())
        if os.name == "nt":
            protect_windows_path(self.path / name, directory=False)
        sync_directory(self.path)

    def _read(self, name: str) -> bytes:
        try:
            target = self.path / name
            if target.is_symlink():
                raise IntegrityFailure("Encryption key path must not be a symlink")
            if os.name == "nt" and target.exists():
                protect_windows_path(target, directory=False)
            fd = os.open(target, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        except FileNotFoundError:
            raise Gone("Record encryption key is unavailable") from None
        with os.fdopen(fd, "rb") as file:
            return file.read()

    def create(self) -> str:
        key_id = secrets.token_hex(32)
        self._put_new(key_id + ".key", AESGCM.generate_key(bit_length=256))
        return key_id

    def has(self, key_id: str) -> bool:
        identifier(key_id)
        path = self.path / (key_id + ".key")
        return path.is_file() and not path.is_symlink()

    def destroy(self, key_id: str) -> None:
        identifier(key_id)
        (self.path / (key_id + ".key")).unlink(missing_ok=True)
        sync_directory(self.path)

    def encrypt(self, key_id: str, content: bytes, aad: bytes) -> bytes:
        identifier(key_id)
        nonce = secrets.token_bytes(12)
        return nonce + AESGCM(self._read(key_id + ".key")).encrypt(nonce, content, aad)

    def decrypt(self, key_id: str, content: bytes, aad: bytes) -> bytes:
        from cryptography.exceptions import InvalidTag
        identifier(key_id)
        try:
            return AESGCM(self._read(key_id + ".key")).decrypt(content[:12], content[12:], aad)
        except (InvalidTag, ValueError) as exc:
            raise IntegrityFailure("Record ciphertext or authenticated metadata changed") from exc
