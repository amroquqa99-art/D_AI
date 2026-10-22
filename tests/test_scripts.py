"""Tests for the release scripts: the installer and the verifier.

The installer is the only thing that writes into a host configuration, so its
ownership rules are tested for real: it never overwrites a definition it did
not create, a forced replacement is backed up, and a rollback removes only what
it installed.
"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import install_opencode  # noqa: E402
import verify_install  # noqa: E402


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dai-install-")
        self.target = Path(self.tmp.name) / "opencode"

    def tearDown(self):
        self.tmp.cleanup()

    def test_dry_run_changes_nothing(self):
        before = list(self.target.rglob("*")) if self.target.exists() else []
        report = install_opencode.install(self.target, dry_run=True, force=False)
        after = list(self.target.rglob("*")) if self.target.exists() else []
        self.assertEqual(before, after)
        self.assertTrue(all(change["action"].startswith("would")
                            for change in report["changes"]))

    def test_install_links_definitions_and_registers_the_mcp_server(self):
        report = install_opencode.install(self.target, dry_run=False, force=False)
        self.assertTrue(report["changes"])
        self.assertTrue(all(change["action"] == "created" for change in report["changes"]))
        self.assertTrue(any((self.target / "agent").rglob("*.md")))
        config = json.loads((self.target / "opencode.jsonc").read_text(encoding="utf-8"))
        entry = config["mcp"]["dai"]
        # The command must name a real module and the interpreter that runs it.
        self.assertIn("-m", entry["command"])
        self.assertIn("dai.mcp_server", entry["command"])
        self.assertTrue(Path(entry["command"][0]).exists())
        self.assertEqual(config["default_agent"], "dai-os")
        self.assertIn(str(install_opencode.ADAPTER / "router"), config["plugins"])
        self.assertTrue((self.target / "agent" / "dai-os.md").exists())

    def test_existing_primary_is_preserved_and_force_can_change_it(self):
        self.target.mkdir(parents=True)
        config_file = self.target / "opencode.jsonc"
        config_file.write_text(json.dumps({"default_agent": "build", "plugins": ["example"]}))
        install_opencode.install(self.target, dry_run=False, force=False)
        config = json.loads(config_file.read_text())
        self.assertEqual(config["default_agent"], "build")
        self.assertIn("example", config["plugins"])
        install_opencode.install(self.target, dry_run=False, force=True)
        self.assertEqual(json.loads(config_file.read_text())["default_agent"], "dai-os")

    def test_invalid_config_fails_closed(self):
        self.target.mkdir(parents=True)
        config_file = self.target / "opencode.jsonc"
        config_file.write_text("{ not valid JSONC", encoding="utf-8")
        with self.assertRaises(ValueError):
            install_opencode.install(self.target, dry_run=False, force=False)
        self.assertEqual(config_file.read_text(), "{ not valid JSONC")

    def test_existing_definition_is_left_alone_without_force(self):
        self.target.mkdir(parents=True)
        existing = self.target / "command" / "research.md"
        existing.parent.mkdir(parents=True)
        existing.write_text("the user's own file", encoding="utf-8")
        report = install_opencode.install(self.target, dry_run=False, force=False)
        skipped = [change for change in report["changes"] if change["action"] == "skipped"]
        self.assertTrue(skipped)
        self.assertEqual(existing.read_text(encoding="utf-8"), "the user's own file")

    def test_forced_replacement_backs_the_old_file_up(self):
        self.target.mkdir(parents=True)
        existing = self.target / "command" / "research.md"
        existing.parent.mkdir(parents=True)
        existing.write_text("the user's own file", encoding="utf-8")
        install_opencode.install(self.target, dry_run=False, force=True)
        backup = existing.with_name(existing.name + install_opencode.BACKUP_SUFFIX)
        self.assertTrue(backup.is_file())
        self.assertEqual(backup.read_text(encoding="utf-8"), "the user's own file")

    def test_rollback_removes_only_what_was_installed(self):
        report = install_opencode.install(self.target, dry_run=False, force=False)
        manifest = self.target / "dai-install-manifest.json"
        manifest.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
        kept = self.target / "command" / "mine.md"
        kept.write_text("not ours", encoding="utf-8")
        outcome = install_opencode.rollback(manifest)
        self.assertTrue(outcome["removed"])
        self.assertFalse(any(Path(path).exists() for path in outcome["removed"]))
        self.assertTrue(kept.is_file())

    def test_rollback_restores_original_config_byte_for_byte(self):
        self.target.mkdir(parents=True)
        config_file = self.target / "opencode.jsonc"
        original = b'{ // custom\n "default_agent": "build"\n}\n'
        config_file.write_bytes(original)
        report = install_opencode.install(self.target, dry_run=False, force=False)
        manifest = self.target / "dai-install-manifest.json"
        manifest.write_text(json.dumps(report))
        install_opencode.rollback(manifest)
        self.assertEqual(config_file.read_bytes(), original)

    def test_rollback_leaves_user_modified_config_untouched(self):
        report = install_opencode.install(self.target, dry_run=False, force=False)
        manifest = self.target / "dai-install-manifest.json"
        manifest.write_text(json.dumps(report))
        config_file = self.target / "opencode.jsonc"
        config_file.write_text('{"user":"changed"}')
        result = install_opencode.rollback(manifest)
        self.assertEqual(config_file.read_text(), '{"user":"changed"}')
        self.assertTrue(any("config changed" in x.get("reason", "") for x in result["kept"]))

    def test_rollback_keeps_a_copy_the_user_changed(self):
        report = install_opencode.install(self.target, dry_run=False, force=False)
        manifest = self.target / "dai-install-manifest.json"
        manifest.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
        changed = self.target / "command" / "research.md"
        changed.unlink()
        changed.write_text("edited by the user", encoding="utf-8")
        outcome = install_opencode.rollback(manifest)
        self.assertTrue(changed.is_file())
        self.assertTrue(outcome["kept"])


class VerifierTests(unittest.TestCase):
    def test_checks_run_reflects_what_actually_ran(self):
        report = verify_install.main_report(["--skip-data-root"]) if hasattr(
            verify_install, "main_report") else None
        if report is None:
            # The script prints its report; run it as a subprocess instead.
            with tempfile.TemporaryDirectory(prefix="dai-verify-") as directory:
                result = subprocess.run(
                    [sys.executable, str(SCRIPTS / "verify_install.py"), "--skip-data-root"],
                    capture_output=True, text=True, cwd=ROOT)
                report = json.loads(result.stdout)
        self.assertNotIn("data_root", report["checks_run"])
        self.assertTrue(report["skipped"])

    def test_a_real_tree_passes_the_release_checks(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "verify_install.py"), "--skip-data-root"],
            capture_output=True, text=True, cwd=ROOT)
        report = json.loads(result.stdout)
        self.assertTrue(report["ok"], report["failures"])

    def test_the_leak_scan_catches_an_absolute_local_path(self):
        with tempfile.TemporaryDirectory(prefix="dai-leak-") as directory:
            root = Path(directory)
            fragment = "/" + "home/" + "someone/private"
            (root / "leak.md").write_text(f"path: {fragment}\n", encoding="utf-8")
            original_root = verify_install.ROOT
            try:
                verify_install.ROOT = root
                findings = verify_install.check_no_secrets()
            finally:
                verify_install.ROOT = original_root
            self.assertTrue(any(finding["check"] == "no_leaked_paths_or_secrets"
                                for finding in findings))


if __name__ == "__main__":
    unittest.main()
