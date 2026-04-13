---
title: 'zoxide: Give cd a Memory — Jump to Any Directory in Two Keystrokes'
description: 'zoxide is a Rust-powered smart cd that remembers directories via a frecency algorithm. Pair it with --cmd cd to replace the builtin, add fzf for interactive selection, and terminal navigation becomes a two-letter affair.'
slug: zoxide-smarter-cd
date: '2026-04-13T10:00:00+08:00'
image: featured.jpg
categories:
- DevOps
tags:
- zoxide
- fish
- terminal
- productivity
draft: false
---

My projects are scattered across a handful of directories with long, inconsistent paths. For years I either mashed `cd ~/some/long/path<TAB>` or dragged folders from Finder into the terminal. Then I installed [zoxide](https://github.com/ajeetdsouza/zoxide). Now two or three characters is all it takes.

The trick is that my `cd` is no longer a shell builtin. It's zoxide's replacement — same behavior as the original, plus memory.

## What frecency Means

zoxide's algorithm is called frecency (frequency + recency). Every directory you visit earns a score that climbs with use and decays over time. Type `cd foo` and zoxide searches its database for paths containing `foo`, then jumps to the highest-scoring one.

Here's what the database looks like:

```bash
$ zoxide query --score | head -5
 230.0 /Users/demo/projects/frontend
 215.3 /Users/demo/work/api-server
 198.7 /Users/demo/blog
 142.1 /Users/demo/oss/some-tool
  98.5 /Users/demo/Downloads
```

Frequently visited projects float to the top; stale ones sink. Data lives in a local file — fully offline, no network calls.

## Install and Init

macOS via Homebrew:

```bash
brew install zoxide
```

Linux one-liner:

```bash
curl -sSfL https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | sh
```

Then initialize in your shell config. **The key decision is whether to use `--cmd cd`**:

| Mode | Command | Effect |
|------|---------|--------|
| Default | `zoxide init <shell>` | Adds `z`, `zi` commands. Builtin `cd` untouched |
| Replace cd | `zoxide init --cmd cd <shell>` | Replaces `cd` outright |

I went with the latter. I use [fish shell](/en/2024/auto-venv-fish/), so my config reads:

```fish
# ~/.config/fish/config.fish
zoxide init --cmd cd fish | source
```

For zsh / bash, use eval:

```bash
# ~/.zshrc
eval "$(zoxide init --cmd cd zsh)"
```

Why replace `cd` wholesale? Because zoxide's `cd` is a **superset** of the builtin: absolute paths, relative paths, `cd -`, `cd ..` all still work. Frecency lookup only kicks in when the argument isn't a valid path. No regression risk.

## Three Daily Workflows

**1. Keyword jumps.** Skip full paths — just type a fragment of the directory name:

```bash
cd blog            # → ~/work/personal-blog
cd api             # → ~/work/api-server
cd dotfiles        # → ~/config/dotfiles
```

**2. Multi-keyword filtering.** When names collide, chain keywords to narrow down:

```bash
cd work blog       # → ~/work/personal-blog
cd client api      # → ~/work/client-project/api
```

Match rule: every keyword must appear in the path, and the last one must be in the final segment.

**3. Interactive selection via `zi`.** When you can't recall the keyword or have multiple candidates:

```bash
cdi               # since I used --cmd cd, zi becomes cdi
```

This opens an [fzf](https://github.com/junegunn/fzf) UI listing all candidates with live fuzzy filtering. Install fzf first if you haven't: `brew install fzf`.

## Advanced Tricks

**Space-triggered completion.** In fish, typing `cd mydir<SPACE>` lists multiple candidates — handy when directories share names. Fish users can also install an enhanced completion pack:

```bash
fisher install icezyclon/zoxide.fish
```

**Query without jumping.** Preview where zoxide would take you, without actually going:

```bash
zoxide query blog
# → /Users/demo/work/personal-blog

zoxide query --list blog      # list all matches
zoxide query --score          # view frecency scores
```

**Manually register a directory.** For a freshly cloned project you haven't visited yet:

```bash
zoxide add ~/projects/new-repo
```

**Exclude noise.** `/tmp`, `node_modules`, and friends clutter the database:

```fish
set -gx _ZO_EXCLUDE_DIRS "/tmp/*" "*/node_modules/*" "$HOME/.cache/*"
```

**Echo destination before jumping.** Helps catch wrong jumps:

```fish
set -gx _ZO_ECHO 1
```

**Migrate from older tools.** autojump, fasd, z.lua all have import paths:

```bash
zoxide import --from=autojump ~/.local/share/autojump/autojump.txt
zoxide import --from=z ~/.z
```

## Combining with yazi and tmux

My `.zshrc` has a function `y` that syncs [yazi](https://github.com/sxyazi/yazi)'s final directory back to the shell on exit:

```fish
function y
    set tmp (mktemp -t "yazi-cwd.XXXXXX")
    yazi $argv --cwd-file="$tmp"
    set cwd (cat -- "$tmp")
    if [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]
        cd -- "$cwd"  # this cd is zoxide
    end
    rm -f -- "$tmp"
end
```

The trailing `cd` is zoxide's version, so directories I browse through yazi also feed into the frecency database. The two tools cross-pollinate — both get smarter with use.

In tmux, each pane is its own shell, but zoxide's database is shared globally. Visit a directory in pane A and pane B can jump there with `cd foo`.

## When Not to Use --cmd cd

Honestly, `--cmd cd` isn't uncontroversial. Arguments against overriding the builtin:

- Shell scripts might accidentally inherit zoxide behavior
- Shared terminals could confuse other users
- Certain `cd` edge cases (like `CDPATH`) may behave differently

zoxide's implementation only overrides `cd` in **interactive shells**, so the first concern is mostly academic. But if you value purity, sticking with the default `z` / `zi` gets you 95% of the benefit — you just have to pause each time to pick `cd` vs. `z`.

Personally, I prefer `--cmd cd`. Muscle memory doesn't want to change, so the tool should adapt to the human, not the other way around.

## References

- [zoxide GitHub Repository](https://github.com/ajeetdsouza/zoxide)
- [zoxide Official Tutorials](https://zoxide.org/)
- [zoxide: Tips and Tricks — Bozhidar Batsov](https://batsov.com/articles/2025/06/12/zoxide-tips-and-tricks/)
- [fzf Fuzzy Finder](https://github.com/junegunn/fzf)
- [icezyclon/zoxide.fish — enhanced fish completions](https://github.com/icezyclon/zoxide.fish)

