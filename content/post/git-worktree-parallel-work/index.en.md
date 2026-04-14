---
title: 'git worktree: Multiple Working Directories Per Repo, and the Key to Parallel AI Agents'
description: 'Use git worktree to skip the stash-and-switch dance: keep feature work untouched, run hotfixes, code reviews, long test runs, and multiple AI agents side-by-side in the same repo. Commands, the bare-repo layout, and the 2024–2026 relative paths support.'
slug: git-worktree-parallel-work
date: '2026-04-14T22:00:00+08:00'
image: featured.jpg
categories:
- DevOps
tags:
- git
- worktree
- productivity
- ai-agent
draft: false
---

You're mid-feature when PM says prod is on fire. The reflex move: `git stash`, check out master, fix, come back, `stash pop`. But then the dev server restarts, the IDE re-indexes, and stash silently ate your untracked build artifacts.

git worktree fixes this cleanly: **one repo, many checked-out branches in separate directories**, each with its own HEAD, index, and untracked files — all sharing the same object database. The feature stays exactly where you left it; the hotfix happens next door.

## vs stash, vs multiple clones

| Approach | Switch cost | Disk | Object sync |
|----------|-------------|------|-------------|
| `git stash` + checkout | High (dev server restarts, IDE reindex) | Cheap | Single repo |
| Multiple clones | Low | Wasteful (GBs on large repos) | Each fetches separately |
| `git worktree` | Low | Cheap (shared objects) | One fetch updates all |

Worktree is the synthesis — filesystem isolation with a unified object store.

## Core Commands

```bash
# Add — last path segment becomes the new branch name
git worktree add ../hotfix                   # branch "hotfix" from HEAD
git worktree add ../review pr-123            # checkout existing branch
git worktree add -b feat-x ../feat-x main    # new branch from main
git worktree add -d ../throwaway             # detached HEAD, no branch

git worktree list                            # --porcelain for scripts
git worktree remove ../hotfix                # clean only; -f for dirty
git worktree prune                           # clean metadata for manually deleted dirs
git worktree lock ../usb-drive --reason "removable drive"
git worktree unlock ../usb-drive
git worktree move ../old ../new              # won't move worktrees w/ submodules
git worktree repair                          # fix links after moving the main repo
```

**Short aliases make it muscle memory**:

```bash
git config --global alias.wta 'worktree add'
git config --global alias.wtl 'worktree list'
git config --global alias.wtr 'worktree remove'
```

## Real Workflows

**1. Hotfix without disturbing feature work**

```bash
git worktree add ../hotfix-prod origin/main
cd ../hotfix-prod
# fix, commit, push, open PR
cd ../myrepo
git worktree remove ../hotfix-prod
```

The feature's dev server never stopped. node_modules untouched. IDE didn't re-index.

**2. Long test run + keep coding**

`pytest` / `cargo test` takes 10 minutes. Open a worktree to run it there while you keep editing the next commit. Zero interference.

```bash
git worktree add ../ci-run branch-a
cd ../ci-run && pytest --slow &
cd -   # back to main worktree, keep coding
```

**3. Code review without polluting your state**

```bash
git worktree add ../review-456 pr-456-branch
cd ../review-456
# run it, read code, leave comments
cd - && git worktree remove ../review-456
```

**4. Multiple AI agents in parallel** (the most underrated 2025 use case)

Claude Code / Cursor / Aider only work in one directory at a time — running two in the same folder means they overwrite each other's files. One branch per worktree and you can **run three agents on three features simultaneously**, each with its own dev server port and node_modules, no collisions:

```bash
git worktree add ../agent-a -b feat-a
git worktree add ../agent-b -b feat-b
git worktree add ../agent-c -b feat-c

# three tmux panes / three terminal windows, one claude each
```

Claude Code's Agent tool even has a built-in `isolation: "worktree"` option — sub-agents automatically run in a worktree and merge back when done.

## Three Directory Layouts

**Sibling dirs (simplest)**
```
~/code/myrepo
~/code/myrepo-hotfix
~/code/myrepo-review-123
```
Plays well with editors' "one folder, one project" mental model.

**`.worktrees/` subdir**
```
myrepo/
├── src/
└── .worktrees/
    ├── feat-x/
    └── hotfix/
```
Everything co-located. Add `.worktrees/` to global gitignore. Downside: some tools (ESLint, tsc) recurse into it.

**Bare repo pattern (best for heavy multi-branch work)**

```bash
mkdir myproj && cd myproj
git clone --bare git@github.com:org/repo.git .bare
echo "gitdir: ./.bare" > .git
git worktree add main
git worktree add feat-x
```

Result:
```
myproj/
├── .bare/           # actual object store
├── .git             # file, pointing to .bare
├── main/            # main branch checkout
└── feat-x/          # feat-x branch checkout
```

No "primary working copy" — every branch is a worktree, `cd` is the branch switch. Pairs beautifully with tmux and AI agents.

## Gotchas

**`.git` in a linked worktree is a file, not a directory.** Contents are `gitdir: /path/to/main/.git/worktrees/<name>`. Tools that read `.git/` as a directory will break.

**You can't check out the same branch in two worktrees.** By design — prevents index divergence. Override with `--force` or use detached HEAD.

**Submodules are painful.** `worktree move` refuses; `remove` needs `--force`. `.git/modules/` is shared, so switching submodule commits in one worktree affects the others. Heavy-submodule repos need care.

**`node_modules`, `venv`, `target/` are per-worktree.** Disk gets hungry. Mitigations:
- pnpm's content-addressable store — reinstalling across worktrees uses almost no extra space
- Rust: `CARGO_TARGET_DIR=~/.cache/cargo-target` shares target dirs
- uv, poetry caches are shareable too

**`.env` doesn't get copied.** Use direnv — drop a `.envrc` in each worktree and it auto-loads on cd.

**Hooks are shared** (`.git/hooks/` is in the common dir). If a hook assumes repo root via a hardcoded path, it breaks in linked worktrees. Always use `git rev-parse --show-toplevel` for the current worktree's root.

**IDE indexes run per worktree.** VS Code / JetBrains index each one independently — duplicate CPU and disk. Structural limit, no way around it.

## Editor Integration

**VS Code**: use multi-root workspace (`File → Add Folder to Workspace`) to open multiple worktrees at once, or just open each in its own window. Since 2024, `GitHub.vscode-pull-request-github` checks out PRs as worktrees.

**JetBrains**: native worktree UI in the Git tool window since 2023.2 — create, switch, remove from the GUI.

**fzf quick-switch**:

```bash
wtcd() {
  cd "$(git worktree list --porcelain | awk '/^worktree /{print $2}' | fzf)"
}
```

Type `wtcd`, fuzzy-search worktree paths, enter to cd.

## What's New in 2024–2026

**Git 2.44 (2024/2)**: `git worktree add --orphan` — creates a worktree with an unborn branch. Handy for `gh-pages`-style split deploy branches.

**Git 2.46 (2024/7)**: `worktree.useRelativePaths` config + `--relative-paths` flag — internal links use relative paths. The main repo (or the whole dir tree) can move without breaking worktrees. Huge for Dropbox/iCloud sync and containerized dev.

**Git 2.48 (2025/1)**: `git worktree repair` auto-fixes absolute/relative path mismatches.

**Git 2.50 (mid-2025)**: relative paths and porcelain output have stabilized.

Ecosystem: "one worktree per AI agent branch" went mainstream in 2025. `git-town`, `ghq`, and the `gh` CLI all picked up first-class worktree support.

## Getting Started

1. In any repo, try `git worktree add ../test-wt -b test-branch` and poke around
2. Back in the main worktree, notice `git branch` sees it but `git status` is untouched
3. `git worktree remove ../test-wt` — main worktree is completely unchanged
4. Add `wta` / `wtl` / `wtr` aliases, build muscle memory
5. Next hotfix, use worktree instead of stash — feel the difference

For anyone using AI coding agents, worktree isn't a bonus — it's required. The "only one agent per repo" limitation is the exact thing worktree removes.

## References

- [git-worktree Official Docs](https://git-scm.com/docs/git-worktree)
- [Git 2.46 Release Notes — worktree.useRelativePaths](https://github.com/git/git/blob/master/Documentation/RelNotes/2.46.0.txt)
- [Claude Code Agent tool — isolation: worktree](https://code.claude.com/docs/en/agent-sdk)
- [git-town — high-level git workflow wrapper](https://www.git-town.com/)
