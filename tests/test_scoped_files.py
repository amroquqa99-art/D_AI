from __future__ import annotations
import tempfile
import unittest
from pathlib import Path
from dai.errors import InvalidRequest
from dai.scoped_files import search_scoped_files


class ScopedSearchTests(unittest.TestCase):
    def test_find_code_without_reading_hidden_secrets_or_escaping_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "src").mkdir()
            (root / "src" / "main.py").write_text("answer = 42\n")
            (root / ".env").write_text("verysecret = answer\n")
            (root / "credentials.json").write_text("answer = token\n")
            (root / "src" / "outside").symlink_to(root / ".env")
            out = search_scoped_files(root, "answer")
            self.assertEqual([x["path"] for x in out["matches"]], ["src/main.py"])
            self.assertEqual(out["matches"][0]["line"], 1)
            self.assertEqual(out["workspace"], "native-session")

    def test_bounds_and_unknown_workspace(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(InvalidRequest):
                search_scoped_files(root, "")
            with self.assertRaises(InvalidRequest):
                search_scoped_files(root, "x", limit=0)
            with self.assertRaises(InvalidRequest):
                search_scoped_files(Path(root) / "absent", "x")


if __name__ == "__main__":
    unittest.main()
