---
title: 'yazi: Rust Terminal File Manager with Image Preview — Alacritty Fix Included'
date: '2026-03-26T09:00:00+08:00'
slug: yazi-terminal-file-manager
image: featured.jpg
description: 'yazi is an async Rust terminal file manager with vim keybindings, image preview, Lua plugins, and fzf/zoxide integration. Alacritty has no native image protocol — macOS uses Chafa, Linux uses Überzug++ with X11/Wayland.'
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
| **Alacritty** | **No native protocol support (see below)** |

## Alacritty Image Preview

Alacritty supports no image protocol — no kitty, no Sixel. yazi shows no images by default. The fix depends on your platform:

### macOS: Chafa

On macOS, Überzug++'s X11/Wayland backend is disabled at compile time, so it can't overlay images. yazi automatically falls back to [Chafa](https://hpjansson.org/chafa/), which renders images using Unicode block characters inside the terminal.

Chafa is usually installed alongside yazi. Check:

```bash
which chafa  # /opt/homebrew/bin/chafa
```

If not installed:

```bash
brew install chafa
```

Verify yazi picks it up:

```bash
yazi --debug 2>&1 | grep Adapter
# Adapter.matches: Chafa
```

`Chafa` in the output means image preview is active. Open yazi and you'll see it. Quality is character-based simulation rather than real pixels, but it works fine in a terminal.

### Linux: Überzug++

Linux has X11 or Wayland, so [Überzug++](https://github.com/jstkdng/ueberzugpp) can overlay actual images on top of the terminal window — much better quality than Chafa.

```bash
# Arch
pacman -S ueberzugpp

# Ubuntu (via openSUSE repo — see https://github.com/jstkdng/ueberzugpp)
```

yazi auto-detects after installation:

```bash
yazi --debug 2>&1 | grep Adapter
# Adapter.matches: X11
# or
# Adapter.matches: Wayland
```

**Fine-tuning (optional)**

Überzug++ overlays externally, so positioning can drift slightly. Adjust in `~/.config/yazi/yazi.toml`:

```toml
[preview]
ueberzug_scale = 1.0           # > 1 enlarges, < 1 shrinks
ueberzug_offset = [0, 0, 0, 0] # position offset in character cells [x, y, w, h]
```

Then: `yazi --clear-cache`

### Image Preview Inside tmux

Works for both Chafa and Überzug++. Add to `~/.tmux.conf`:

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

Alacritty users: on macOS, install Chafa and yazi picks it up automatically. On Linux, Überzug++ gives real image quality instead of character simulation. Either way, no extra configuration — install the tool and open yazi.

## References

- [yazi official documentation](https://yazi-rs.github.io/docs/)
- [yazi GitHub repository](https://github.com/sxyazi/yazi)
- [Chafa official website (character-based image renderer)](https://hpjansson.org/chafa/)
- [Überzug++ GitHub repository (Linux image overlay tool)](https://github.com/jstkdng/ueberzugpp)
