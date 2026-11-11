import subprocess
import tempfile
import unittest
from pathlib import Path

from dai.contracts import Principal
from dai.memory import MemoryStore
from dai.charters import CharterService
from dai.tasks import TaskService
from tests.test_tasks import charter_content
from dai.worktrees import create_worktree


class TaskWorktreeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)
        subprocess.run(["git", "-C", str(self.repo), "config", "user.email", "t@t.com"], check=True)
        subprocess.run(["git", "-C", str(self.repo), "config", "user.name", "t"], check=True)
        (self.repo / "README.md").write_text("hi\n")
        subprocess.run(["git", "-C", str(self.repo), "add", "README.md"], check=True)
        subprocess.run(["git", "-C", str(self.repo), "commit", "-q", "-m", "init"], check=True)
        self.wt_root = self.root / "wts"
        self.wt_root.mkdir()
        self.store = MemoryStore(self.root / "state")
        self.owner = Principal("dai-os")
        self.scope = self.store.create_project(self.owner, "P")
        self.project = self.scope.project
        self.charters = CharterService(self.store)
        draft = self.charters.propose(self.owner, self.scope, charter_content())
        approved = self.charters.approve(self.owner, self.scope, draft.id, expected_version=1)
        self.tasks = TaskService(self.store)
        self.task = self.tasks.create_task(self.owner, self.scope, objective="t",
                                          acceptance=["a"], charter_id=approved.charter_id)

    def tearDown(self):
        self.tmp.cleanup()

    def test_assign_and_verify_worktree(self):
        wi = create_worktree(self.repo, self.wt_root, "taskwt")
        r = self.tasks.assign_worktree(self.owner, self.scope, self.task.id,
                                      repo_root=str(self.repo), worktree_path=wi["worktree_path"])
        self.assertEqual(r["worktree"]["status"], "assigned")
        wt = Path(wi["worktree_path"])
        (wt / "new.txt").write_text("new\n")
        subprocess.run(["git", "-C", str(wt), "add", "new.txt"], check=True)
        subprocess.run(["git", "-C", str(wt), "commit", "-q", "-m", "add"], check=True)
        head = subprocess.check_output(["git", "-C", str(wt), "rev-parse", "HEAD"]).decode().strip()
        v = self.tasks.verify_worktree_merge(self.owner, self.scope, self.task.id, head_ref=head)
        self.assertTrue(v["verification"]["clean"])


if __name__ == "__main__":
    unittest.main()