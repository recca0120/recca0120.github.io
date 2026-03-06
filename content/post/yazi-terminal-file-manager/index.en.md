---
title: 'yazi: Rust Terminal File Manager with Image Preview — Alacritty Fix Included'
date: '2026-03-26T09:00:00+08:00'
slug: yazi-terminal-file-manager
description: 'yazi is an async Rust terminal file manager with vim keybindings, image preview, Lua plugins, and fzf/zoxide integration. Alacritty has no native image protocol — use Überzug++ with X11/Wayland as the fix.'
categories:
  - Tools
tags:
  - yazi
  - terminal
  - rust
  - file-manager
  - alacritty
---

Managing files in the terminal means chaining `ls`, `cd`, `cp`, `mv` back and forth.
You want something like Finder — quick browsing, image previews — without leaving the terminal.
[yazi](https://github.com/sxyazi/yazi) is that. Vim keybindings, written in Rust, fast.

## What yazi Is

yazi (Chinese for "duck") is a terminal file manager written in Rust, built around non-blocking async I/O. File operations, previews, and thumbnails all run in the background — the UI doesn't freeze.

Key features:

- **Image preview**: kitty, iTerm2, WezTerm, Sixel, and more
- **Syntax highlighting**: built-in, no external tools needed
- **Multi-format preview**: video thumbnails (FFmpeg), PDF (poppler), archives, directory trees
- **Vim keybindings**: `h/j/k/l` navigation, `/` search, visual mode for batch selection
- **Lua plugins**: highly customizable UI, active plugin ecosystem
- **Tool integration**: fzf, zoxide, ripgrep, fd

## Installation

```bash
# macOS
brew install yazi ffmpeg sevenzip jq poppler fd ripgrep fzf zoxide imagemagick

# Arch Linux
pacman -S yazi ffmpeg p7zip jq poppler fd ripgrep fzf zoxide imagemagick

# Ubuntu / Debian (official packages are outdated — use the binary)
curl -LO https://github.com/sxyazi/yazi/releases/latest/download/yazi-x86_64-unknown-linux-musl.zip
unzip yazi-*.zip && sudo mv yazi-*/yazi /usr/local/bin/

# Cargo
cargo install yazi-fm yazi-cli
```

The only hard dependency is the `file` command (usually pre-installed). Everything else (ffmpeg, poppler, etc.) is optional — install what you need for the preview formats you want.

## Basic Usage

```bash
yazi
```

| Key | Action |
|---|---|
| `h / ←` | Parent directory |
| `l / →` | Enter directory / open file |
| `j / k` | Move down / up |
| `gg / G` | Jump to top / bottom |
| `Space` | Toggle selection |
| `y` | Copy |
| `d` | Cut |
| `p` | Paste |
| `D` | Move to trash |
| `r` | Rename |
| `/` | Search current directory |
| `f` | fzf jump |
| `z` | zoxide jump |
| `q` | Quit and cd to current directory |

## Shell Integration: cd on Exit

Add a wrapper function so your shell follows yazi to whatever directory you navigated to:

```bash
# ~/.bashrc or ~/.zshrc
function yy() {
    local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
    yazi "$@" --cwd-file="$tmp"
    if cwd="$(command cat -- "$tmp")" && [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]; then
        builtin cd -- "$cwd"
    fi
    rm -f -- "$tmp"
}
```

```fish
# ~/.config/fish/functions/yy.fish
function yy
    set tmp (mktemp -t "yazi-cwd.XXXXXX")
    yazi $argv --cwd-file="$tmp"
    if set cwd (command cat -- $tmp); and [ -n "$cwd" ]; and [ "$cwd" != "$PWD" ]
        builtin cd -- $cwd
    end
    rm -f -- $tmp
end
```

Use `yy` instead of `yazi`. When you quit, your shell is already in the right directory.

## Image Preview: Terminal Support

yazi auto-detects the terminal and picks the best image protocol. Check what it detected:

```bash
yazi --debug 2>&1 | grep Adapter
# Adapter.matches: Kgp    ← kitty protocol
# Adapter.matches: Iip    ← iTerm2/WezTerm inline protocol
# Adapter.matches: Sixel
```

| Terminal | Method |
|---|---|
| kitty | Kitty unicode placeholders (best) |
| iTerm2 / WezTerm / Ghostty | Inline images protocol |
| foot / Windows Terminal | Sixel |
| **Alacritty** | **No native support — needs Überzug++** |

## Alacritty Image Preview: Überzug++

Alacritty has no image protocol support at all — no kitty protocol, no Sixel. By default, yazi shows no images in Alacritty. The fix is [Überzug++](https://github.com/jstkdng/ueberzugpp), which overlays images directly on the terminal window via X11 or Wayland.

### Install Überzug++

```bash
# macOS
brew install jstkdng/programs/ueberzugpp

# Arch
pacman -S ueberzugpp

# Verify
ueberzug --version
```

### Verify yazi Detects It

```bash
yazi --debug 2>&1 | grep -i "adapter\|ueberzug"
# Adapter.matches: X11      ← X11 + Überzug++
# Adapter.matches: Wayland
```

Once Überzug++ is installed, yazi auto-detects X11/Wayland and uses it. No extra configuration required.

### Fine-tuning Image Position (Optional)

Überzug++ overlays images externally, so positioning can be slightly off. Adjust in `~/.config/yazi/yazi.toml`:

```toml
[preview]
# Preview resolution (larger = sharper but more CPU)
max_width = 600
max_height = 900

# Überzug++ scaling (> 1 enlarges, < 1 shrinks)
ueberzug_scale = 1.0

# Position offset in character cells [x, y, width, height]
ueberzug_offset = [0, 0, 0, 0]
```

Clear the cache after changes:

```bash
yazi --clear-cache
```

### Image Preview Inside tmux

Add to `~/.tmux.conf`:

```bash
set -g allow-passthrough on
set -ga update-environment TERM
set -ga update-environment TERM_PROGRAM
```

## Configuration Files

```
~/.config/yazi/
├── yazi.toml      # main config (preview, behavior)
├── keymap.toml    # keybindings
├── theme.toml     # colors and appearance
└── plugins/       # Lua plugins
```

Install themes and plugins with the `ya` package manager:

```bash
# Install a theme
ya pack -a yazi-rs/flavors#catppuccin-mocha

# Install git status plugin
ya pack -a yazi-rs/plugins#git
```

## Summary

yazi is noticeably faster than ranger or lf, mainly because of the async architecture. Once you're used to the vim keybindings, most file operations happen without leaving the terminal.

Alacritty users need Überzug++ as an extra step, but after that it works the same as any other terminal. If image sizing is off, tweak `ueberzug_scale` and `ueberzug_offset` until it looks right.
