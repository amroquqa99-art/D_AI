from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class CliTests(unittest.TestCase):
    def run_cli(self, root, *args, ok=True):
        result = subprocess.run([sys.executable, "-m", "dai", "--data-root", str(root), *args],
                                capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0 if ok else 2, result.stderr)
        return json.loads(result.stdout if ok else result.stderr)

    def test_cli_persists_project_and_record_across_processes(self):
        with tempfile.TemporaryDirectory(prefix="dai-cli-") as directory:
            root = Path(directory) / "state"
            self.run_cli(root, "project", "create", "بحث علمي", "--id", "study")
            item = self.run_cli(root, "memory", "--project", "study", "create", "--json", '{"text":"قرار موثق"}')
            read = self.run_cli(root, "memory", "--project", "study", "get", item["id"])
            self.assertEqual(read["content"]["text"], "قرار موثق")
            self.assertEqual(len(self.run_cli(root, "project", "list")), 1)

    def test_cli_refuses_unattended_permanent_deletion_and_keeps_record(self):
        with tempfile.TemporaryDirectory(prefix="dai-cli-") as directory:
            root = Path(directory) / "state"
            self.run_cli(root, "project", "create", "Disposable test", "--id", "study")
            item = self.run_cli(root, "memory", "--project", "study", "create", "--json", '{"text":"keep"}')
            error = self.run_cli(root, "memory", "--project", "study", "purge", item["id"], "--version", "1", ok=False)
            self.assertEqual(error["error"], "InvalidRequest")
            self.assertEqual(self.run_cli(root, "memory", "--project", "study", "get", item["id"])["content"]["text"], "keep")


if __name__ == "__main__":
    unittest.main()
