---
title: 'yazi：Rust 寫的終端機檔案管理器，vim 鍵位、圖片預覽、Alacritty 解法'
date: '2026-03-26T09:00:00+08:00'
slug: yazi-terminal-file-manager
description: 'yazi 是 Rust 寫的非同步終端機檔案管理器，vim 鍵位、圖片預覽、Lua 外掛、整合 fzf/zoxide。Alacritty 不支援圖片協議，macOS 用 Chafa，Linux 用 Überzug++ 搭配 X11/Wayland。'
categories:
  - Tools
tags:
  - yazi
  - terminal
  - rust
  - file-manager
  - alacritty
---

在終端機裡管檔案，`ls` 加 `cd` 加 `cp` 來來去去。
想要一個像 Finder 一樣可以快速瀏覽、看圖預覽的界面，但又不想離開 terminal。
[yazi](https://github.com/sxyazi/yazi) 就是這個東西，vim 鍵位，Rust 寫的，快。

## 什麼是 yazi

yazi（中文「鴨子」）是用 Rust 寫的終端機檔案管理器，設計上強調非阻塞的非同步 I/O。所有檔案操作、預覽、縮圖都在背景處理，不卡 UI。

主要功能：

- **圖片預覽**：支援 kitty、iTerm2、WezTerm、Sixel 等多種終端圖片協議
- **程式碼高亮**：內建語法高亮，不需要外部工具
- **多格式預覽**：影片縮圖（需 FFmpeg）、PDF（需 poppler）、壓縮檔、目錄樹
- **vim 鍵位**：`h/j/k/l` 導航，`/` 搜尋，visual mode 批量選取
- **Lua 外掛**：UI 可客製，外掛生態活躍
- **整合工具**：fzf、zoxide、ripgrep、fd 深度整合

## 安裝

```bash
# macOS
brew install yazi ffmpeg sevenzip jq poppler fd ripgrep fzf zoxide imagemagick

# Arch Linux
pacman -S yazi ffmpeg p7zip jq poppler fd ripgrep fzf zoxide imagemagick

# Ubuntu / Debian（官方套件較舊，建議用 binary）
curl -LO https://github.com/sxyazi/yazi/releases/latest/download/yazi-x86_64-unknown-linux-musl.zip
unzip yazi-*.zip && sudo mv yazi-*/yazi /usr/local/bin/

# Cargo
cargo install yazi-fm yazi-cli
```

必要依賴只有 `file` 指令（通常已內建）。其他（ffmpeg、poppler 等）都是可選的，裝了就能預覽對應格式。

## 啟動與基本操作

```bash
yazi
```

| 按鍵 | 動作 |
|---|---|
| `h / ←` | 上層目錄 |
| `l / →` | 進入目錄 / 開啟檔案 |
| `j / k` | 上下移動 |
| `gg / G` | 移到頂/底 |
| `Space` | 選取（多選） |
| `y` | 複製 |
| `d` | 剪下 |
| `p` | 貼上 |
| `D` | 刪到資源回收筒 |
| `r` | 重新命名 |
| `/` | 搜尋（當前目錄） |
| `f` | fzf 快速跳轉 |
| `z` | zoxide 跳轉 |
| `q` | 離開，`cd` 到目前目錄 |

## shell 整合：離開後 cd 到當前目錄

這個功能需要在 shell 裡加一行 wrapper function，讓 yazi 離開時自動 `cd` 到你最後瀏覽的目錄：

```bash
# ~/.bashrc 或 ~/.zshrc
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

之後用 `yy` 代替 `yazi` 啟動，離開時就會自動跳到你所在的目錄。

## 圖片預覽：各終端的支援

yazi 啟動時自動偵測終端機，選擇最適合的圖片協議。用 `yazi --debug` 可以看到偵測結果：

```bash
yazi --debug 2>&1 | grep Adapter
# Adapter.matches: Kgp  ← kitty protocol
# Adapter.matches: Iip  ← iTerm2/WezTerm inline protocol
# Adapter.matches: Sixel
```

| 終端機 | 支援方式 |
|---|---|
| kitty | Kitty unicode placeholders（最佳） |
| iTerm2 / WezTerm / Ghostty | Inline images protocol |
| foot / Windows Terminal | Sixel |
| **Alacritty** | **不支援原生協議（見下方）** |

## Alacritty 圖片預覽

Alacritty 不支援任何終端圖片協議（kitty protocol、Sixel 都沒有），yazi 預設在 Alacritty 裡看不到圖片。解法依平台不同：

### macOS：用 Chafa

macOS 上 Überzug++ 的 X11/Wayland backend 被停用，所以沒辦法疊圖。yazi 會自動 fallback 到 [Chafa](https://hpjansson.org/chafa/)，用 ASCII/Unicode 字符在 terminal 裡模擬圖片。

Chafa 通常裝 yazi 時已一起裝，確認：

```bash
which chafa  # /opt/homebrew/bin/chafa
```

沒裝的話：

```bash
brew install chafa
```

確認 yazi 偵測到 Chafa：

```bash
yazi --debug 2>&1 | grep Adapter
# Adapter.matches: Chafa
```

看到 `Chafa` 就代表圖片預覽已啟用，直接開 yazi 就能看到效果。畫質是字符模擬，不是真正的像素圖，但在 terminal 裡已經夠用。

### Linux：用 Überzug++

Linux 有 X11 或 Wayland，可以用 [Überzug++](https://github.com/jstkdng/ueberzugpp) 把真正的圖片疊在 terminal 視窗上，畫質比 Chafa 好很多。

```bash
# Arch
pacman -S ueberzugpp

# Ubuntu（從 openSUSE 套件庫，參考 https://github.com/jstkdng/ueberzugpp）
```

裝完後 yazi 自動偵測：

```bash
yazi --debug 2>&1 | grep Adapter
# Adapter.matches: X11
# 或
# Adapter.matches: Wayland
```

**微調圖片位置（選用）**

Überzug++ 用 overlay 方式疊圖，位置或大小有時會偏，在 `~/.config/yazi/yazi.toml` 調整：

```toml
[preview]
ueberzug_scale = 1.0           # > 1 放大，< 1 縮小
ueberzug_offset = [0, 0, 0, 0] # 位置微調，單位字元格（x, y, width, height）
```

改完清快取：`yazi --clear-cache`

### tmux 內的圖片預覽

不論 Chafa 或 Überzug++，tmux 裡需要在 `~/.tmux.conf` 加：

```bash
set -g allow-passthrough on
set -ga update-environment TERM
set -ga update-environment TERM_PROGRAM
```

## 設定檔

設定檔放在 `~/.config/yazi/`：

```
~/.config/yazi/
├── yazi.toml      # 主設定（預覽、行為）
├── keymap.toml    # 鍵位設定
├── theme.toml     # 主題
└── plugins/       # Lua 外掛
```

用 [ya](https://yazi-rs.github.io/docs/cli) 套件管理器安裝主題和外掛：

```bash
# 安裝熱門主題
ya pack -a yazi-rs/flavors#catppuccin-mocha

# 安裝 git 狀態外掛
ya pack -a yazi-rs/plugins#git
```

## 小結

yazi 比起 ranger 或 lf，速度快很多，主要是非同步架構的差異。vim 鍵位習慣之後，大部分的檔案操作都不需要離開終端。

Alacritty 使用者：macOS 裝 Chafa 就夠，yazi 自動偵測。Linux 用 Überzug++ 效果更好，畫質是真正的圖片而不是字符模擬。兩者都不需要額外設定，裝完開 yazi 就能看到圖片預覽。
