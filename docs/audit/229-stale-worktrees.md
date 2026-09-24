# Stale worktrees, 2026-09-24

Checked against `origin/main` `503d678`. `git merge-base --is-ancestor <ref> origin/main` returned 0 for every row. Open pull requests at the check: only #291 on `fix/dsh-lanmode-batch-3`. Each named checkout was clean.

## Removed

| Checkout | HEAD | Why |
| --- | --- | --- |
| `.worktrees/feat-lan-token` | `70f42d6` | Ancestor of main, no open PR, clean. Worktree removed, local branch `feat/lan-token` deleted with `git branch -d`. |
| `.worktrees/fix-23-models-tab` | `7070d1a` | Same proof. Local and `origin/fix-23-models-tab` deleted. |
| `.worktrees/fix/dsh-lanmode-async-apply` | `7c40c34` | Already merged as #33. Local and `origin/fix/dsh-lanmode-async-apply` deleted after the remote ref was gone, so `git branch -d` could see the merge into HEAD. |
| `.worktrees/neutral-example` | `51e09d5` | Same proof. Local and `origin/neutral-example` deleted. |

`github/feat/lan-token` is still on the GitHub remote. It was not deleted from there.

## Left in place

Detached publication checkouts stay until the owner confirms removal:

| Checkout | HEAD |
| --- | --- |
| `.worktrees/pub-0.6.2` | `440b1be` |
| `.worktrees/pub-0.6.3` | `92965d1` |
| `.worktrees/pub-0.6.4` | `6ec91c5` |
| `/tmp/pub-lm2` | `3b90be6` |

All four commits are already in `origin/main`. They were not removed.

Batch worktrees `fix-dsh-lanmode-batch-1`, `fix-dsh-lanmode-batch-2`, and `fix-dsh-lanmode-batch-3` are this release and stay.
