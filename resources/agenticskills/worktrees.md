# Worktree isolation — D_AI adaptation

Use for independent implementation branches, not for simultaneous writers in the same checkout.

1. Inspect `git status --short`, current branch, worktree list and submodule state. Preserve unrelated edits. A branch name alone is not isolation.
2. Prefer OpenCode's native worktree tools and list their actual receipts. A new worktree begins from a commit: uncommitted changes do not automatically transfer.
3. Give one worker explicit paths, base commit, inputs, acceptance and its worktree directory. Route using owner-selected models. Do not expose the whole conversation.
4. Run baseline and changed-path tests in that worktree. Retain failure details. Never auto-install unknown setup scripts solely because they appear in a repository.
5. Review the actual diff, coordinate merge against both revisions and rerun merged-result tests. Ask for material conflict decisions.
6. Cleanup is separate: only remove a worktree after checking for untracked or modified work. Never force removal or publish without applicable authorization.

Source: obra/superpowers, `skills/using-git-worktrees/SKILL.md`, commit `22f0b463e7a5e579904dd6211a520321035526f7`. Adapted under MIT; see `LICENSE-superpowers.txt`. This note does not assert automatic Git isolation is implemented by D_AI's router.
