---
title: 'GitButler: A Modern Git Client That Redesigns How You Work with Branches'
description: 'GitButler is a Git-based version control client with parallel branches, stacked branches, unlimited undo, and AI integration. Work on multiple branches simultaneously without switching, manage commits by dragging and dropping — built for modern development workflows.'
slug: gitbutler-modern-git-client
date: '2026-04-17T17:00:00+08:00'
image: featured.png
categories:
- DevOps
tags:
- git
- GitButler
draft: false
---

`git rebase -i` is the Git command I find most awkward to use. Every time I need to reorder commits, split, or squash them, I end up editing that list in vim and hoping the rebase doesn't stop halfway through on a conflict. When it does, the repo state gets hard to reason about.

[GitButler](https://github.com/gitbutlerapp/gitbutler) starts from the premise that Git's concepts are sound, but the interface can be much better. It's a full Git client with both a GUI and a `but` CLI, built on Tauri + Svelte + Rust. The underlying storage is still standard Git — but the hardest parts of the daily workflow have been redesigned.

## The Core Difference: Parallel Branches

The standard Git workflow is: switch to a branch, do your work, switch to another. For two simultaneous tasks you context-switch constantly, or open [multiple worktrees]({{< ref "/post/git-worktree-parallel-work" >}}) and manage them manually.

GitButler's **Parallel Branches** let you work on multiple branches at once without switching. Drag a file's changes to whichever branch it belongs to — that's it.

This is particularly useful for AI agent workflows, where an agent touches multiple areas simultaneously. Different tasks can be split into different branches without waiting for one to finish before starting the next.

## Stacked Branches

Building on top of another in-progress branch is common — open `feat/api`, then start `feat/ui` on top of it. The traditional approach is to rebase `feat/ui` onto `feat/api`, then manually rebase again every time the base branch changes.

GitButler's **Stacked Branches** automate this. Edit any commit in the stack and everything above it automatically restacks.

## Commit Management Without `rebase -i`

This is the most immediately noticeable improvement. Every commit operation in GitButler is drag-and-drop:

- **Uncommit**: send a commit back to the working directory
- **Reword**: edit a commit message inline
- **Amend**: fold working-directory changes into any commit
- **Move**: reorder commits by dragging
- **Split**: break one commit into multiple
- **Squash**: merge commits together

Everything that used to require `git rebase -i` is now a drag-and-drop operation.

## Unlimited Undo

Every operation is recorded in the **Undo Timeline** — commits, rebases, all mutations. You can go back to any point, so there's no fear of unrecoverable states.

The `but` CLI has matching commands:

```bash
but operations-log     # view operation history
but undo               # undo the last operation
```

## Conflicts Don't Block Your Flow

Standard `git rebase` stops on the first conflict and waits. Multiple conflicts mean multiple interruptions before the rebase can complete.

GitButler's **First Class Conflicts** make rebase always succeed. Conflicted commits are marked and can be resolved later, in any order — they don't block the rest of the work.

## GitHub / GitLab Integration

Without leaving GitButler:

- Open and update PRs
- Check CI status
- Browse branch lists

CLI:

```bash
but forge pr create    # open a PR
but forge pr list      # list PRs
```

## AI Integration

Built-in AI generates:
- Commit messages
- Branch names
- PR descriptions

You can also install hooks that let Claude Code or other AI agents manage Git through GitButler directly.

## Installation

```bash
# macOS
brew install gitbutler

# or download the GUI directly
# https://gitbutler.com/downloads
```

The `but` CLI installs alongside the GUI app.

```bash
but --help
```

## How It Compares to git worktree

I've written before about [using git worktree to work on multiple branches in parallel]({{< ref "/post/git-worktree-parallel-work" >}}). Both solve the "parallel work" problem, but from different angles:

| | git worktree | GitButler |
|---|---|---|
| Nature | Native Git feature | Full Git client |
| Interface | CLI | GUI + CLI |
| Parallel branches | Multiple directories | Single directory |
| Commit management | Requires rebase -i | Drag and drop |
| Learning curve | Low (works like Git) | New UI to learn |

Worktree fits people comfortable with the CLI who want minimal tooling. GitButler fits workflows involving complex commit manipulation or teams who want a polished GUI.

## License

GitButler uses a **Fair Source** license — use it, read the source, contribute, but don't build a competing product with it. **It converts to MIT after 2 years** — open source with an expiring non-compete clause.

## References

- [GitButler GitHub](https://github.com/gitbutlerapp/gitbutler)
- [GitButler Documentation](https://docs.gitbutler.com)
- [GitButler Website](https://gitbutler.com)
- [Fair Source License](https://fair.io/)
