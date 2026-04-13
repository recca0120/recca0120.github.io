---
title: 'zoxide：讓 cd 有記憶，打兩個字就跳到常用目錄'
description: 'zoxide 是一款 Rust 寫的 smart cd，用 frecency 演算法記住你常去的目錄。搭配 --cmd cd 直接取代原生 cd，再配 fzf 做互動式選擇，終端導航變成打兩個字就到。'
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

我的專案散在好幾個資料夾，路徑又長又分散。以前每次切目錄不是 `cd ~/some/long/path<TAB>` 就是開 finder 拖進 terminal。後來裝了 [zoxide](https://github.com/ajeetdsouza/zoxide)，現在打兩三個字就直接跳過去。

關鍵是我的 `cd` 已經不是 shell builtin 了，是 zoxide 接管的版本——原本的 cd 功能全保留，只是多了記憶能力。

## frecency 是什麼

zoxide 用的演算法叫 frecency（frequency + recency）。每個去過的目錄都有分數，去得越頻繁、越近期，分數越高。打 `cd foo`，它會在資料庫裡找名字含 `foo` 的目錄，選分數最高的那個跳過去。

看一下資料庫長相：

```bash
$ zoxide query --score | head -5
 230.0 /Users/demo/projects/frontend
 215.3 /Users/demo/work/api-server
 198.7 /Users/demo/blog
 142.1 /Users/demo/oss/some-tool
  98.5 /Users/demo/Downloads
```

常去的專案分數飆高，久沒碰的自然下沉。資料存在本地 SQLite-like 的檔案，離線、零網路。

## 安裝跟初始化

macOS 用 Homebrew：

```bash
brew install zoxide
```

Linux 一行搞定：

```bash
curl -sSfL https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | sh
```

接著要在 shell 設定裡初始化。**最關鍵的一步是選要不要用 `--cmd cd`**：

| 做法 | 指令 | 效果 |
|------|------|------|
| 預設 | `zoxide init <shell>` | 新增 `z`、`zi` 指令，原 `cd` 不動 |
| 取代 cd | `zoxide init --cmd cd <shell>` | 直接把 `cd` 換成 zoxide |

我選後者。因為我平常用 [fish shell](/2024/auto-venv-fish/)，config 長這樣：

```fish
# ~/.config/fish/config.fish
zoxide init --cmd cd fish | source
```

zsh / bash 用 eval：

```bash
# ~/.zshrc
eval "$(zoxide init --cmd cd zsh)"
```

為什麼敢把 `cd` 整個換掉？因為 zoxide 的 `cd` 行為是**原 cd 的超集**：絕對路徑、相對路徑、`cd -`、`cd ..` 都正常運作，只有當參數不是合法路徑時才啟動 frecency 查詢。所以沒有 regression 風險。

## 日常用法三件事

**一、打關鍵字直接跳。** 不用打完整路徑，只要目錄名一部分：

```bash
cd blog            # → ~/work/personal-blog
cd api             # → ~/work/api-server
cd dotfiles        # → ~/config/dotfiles
```

**二、多關鍵字過濾。** 名字會撞到的時候，加第二個字串縮小範圍：

```bash
cd work blog       # → ~/work/personal-blog
cd client api      # → ~/work/client-project/api
```

match 的規則是「所有關鍵字都要出現在路徑中，最後一個要在最後一段 segment」。

**三、互動式選擇用 `zi`。** 想不起來關鍵字、或有多個候選時：

```bash
cdi               # 因為我用了 --cmd cd，zi 變成 cdi
```

會開 [fzf](https://github.com/junegunn/fzf) 介面列出所有候選，即時 fuzzy filter。沒裝 fzf 的話先 `brew install fzf`。

## 進階技巧

**空格觸發補全。** 在 fish 裡輸入 `cd mydir<SPACE>` 會列出多個候選讓你選，對於同名目錄很實用。fish 用戶可以裝強化版補全：

```bash
fisher install icezyclon/zoxide.fish
```

**查詢不跳轉。** 想看 zoxide 會把你帶去哪，但不真的切過去：

```bash
zoxide query blog
# → /Users/demo/work/personal-blog

zoxide query --list blog      # 列所有符合的
zoxide query --score          # 看 frecency 分數
```

**手動加入目錄。** 新 clone 的專案還沒去過，想預先讓 zoxide 知道：

```bash
zoxide add ~/projects/new-repo
```

**排除不想被記住的目錄。** `/tmp`、`node_modules` 之類的雜訊可以排掉：

```fish
set -gx _ZO_EXCLUDE_DIRS "/tmp/*" "*/node_modules/*" "$HOME/.cache/*"
```

**回聲目標路徑。** 跳之前印出要去哪，避免跳錯：

```fish
set -gx _ZO_ECHO 1
```

**從舊工具遷移。** 之前用 autojump、fasd、z.lua 的可以匯入：

```bash
zoxide import --from=autojump ~/.local/share/autojump/autojump.txt
zoxide import --from=z ~/.z
```

## 跟 yazi、tmux 的組合

我在 `.zshrc` 裡還有另一個 function `y`，讓 [yazi](https://github.com/sxyazi/yazi) 退出時把當前目錄同步回 shell：

```fish
function y
    set tmp (mktemp -t "yazi-cwd.XXXXXX")
    yazi $argv --cwd-file="$tmp"
    set cwd (cat -- "$tmp")
    if [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]
        cd -- "$cwd"  # 這個 cd 是 zoxide
    end
    rm -f -- "$tmp"
end
```

重點在最後那個 `cd` 是 zoxide 接管的版本，所以 yazi 裡瀏覽過的目錄也會自動進 zoxide 的 frecency 資料庫。兩個工具互相餵資料，越用越聰明。

tmux 裡每個 pane 都是獨立 shell，但 zoxide 的資料庫是全局共享的，在 pane A 去過的目錄，pane B 打 `cd foo` 一樣跳得到。

## 什麼時候不該用 --cmd cd

老實說，`--cmd cd` 不是沒有爭議。有些人會反對覆蓋 builtin，理由是：

- 寫 shell script 時會意外吃到 zoxide 的行為
- 共享終端給別人用會混淆
- 某些 `cd` 的 edge case（如 `CDPATH`）行為可能不完全一樣

zoxide 的實作只在**互動 shell**裡覆蓋 `cd`，script 執行時不會生效，所以第一個問題基本不存在。但如果你在乎純粹性，改用預設的 `z` / `zi` 一樣能達到 95% 的效果，只是每次要多想一下「這次是 `cd` 還是 `z`」。

我個人偏好 `--cmd cd`——肌肉記憶懶得改，讓工具適應人而不是人適應工具。

## 參考資源

- [zoxide GitHub Repository](https://github.com/ajeetdsouza/zoxide)
- [zoxide 官方教學站](https://zoxide.org/)
- [zoxide: Tips and Tricks — Bozhidar Batsov](https://batsov.com/articles/2025/06/12/zoxide-tips-and-tricks/)
- [fzf Fuzzy Finder](https://github.com/junegunn/fzf)
- [icezyclon/zoxide.fish — fish 補全強化](https://github.com/icezyclon/zoxide.fish)
