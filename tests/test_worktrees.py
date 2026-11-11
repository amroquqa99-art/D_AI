import subprocess
import tempfile
import unittest
from pathlib import Path

from dai.worktrees import create_worktree, list_worktrees, remove_worktree, verify_merge
from dai.errors import InvalidRequest


def _init_repo(root: Path) -> None:
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    subprocess.run(["git", "-C", str(root), "config", "user.email", "t@t.com"], check=True)
    subprocess.run(["git", "-C", str(root), "config", "user.name", "t"], check=True)
    (root / "README.md").write_text("hello\n")
    subprocess.run(["git", "-C", str(root), "add", "README.md"], check=True)
    subprocess.run(["git", "-C", str(root), "commit", "-q", "-m", "init"], check=True)


class WorktreeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        _init_repo(self.repo)
        self.wt_root = self.root / "worktrees"
        self.wt_root.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_create_and_list_and_remove(self):
        info = create_worktree(self.repo, self.wt_root, "task1")
        self.assertEqual(info["status"], "created")
        self.assertTrue(Path(info["worktree_path"]).is_dir())
        listed = list_worktrees(self.repo)
        paths = [e.get("path") for e in listed]
        self.assertIn(info["worktree_path"], paths)
        remove_worktree(self.repo, info["worktree_path"])
        listed2 = list_worktrees(self.repo)
        self.assertNotIn(info["worktree_path"], [e.get("path") for e in listed2])

    def test_verify_merge_clean(self):
        info = create_worktree(self.repo, self.wt_root, "task2")
        wt = Path(info["worktree_path"])
        (wt / "new.txt").write_text("new\n")
        subprocess.run(["git", "-C", str(wt), "add", "new.txt"], check=True)
        subprocess.run(["git", "-C", str(wt), "commit", "-q", "-m", "add"], check=True)
        head = subprocess.check_output(["git", "-C", str(wt), "rev-parse", "HEAD"]).decode().strip()
        res = verify_merge(self.repo, "HEAD", head)
        self.assertTrue(res["clean"])

    def test_create_rejects_bad_task_id(self):
        with self.assertRaises(InvalidRequest):
            create_worktree(self.repo, self.wt_root, "../evil")

    def test_remove_rejects_unregistered(self):
        bogus = self.wt_root / "nope"
        bogus.mkdir()
        with self.assertRaises(InvalidRequest):
            remove_worktree(self.repo, bogus)


if __name__ == "__main__":
    unittest.main()