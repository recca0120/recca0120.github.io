---
title: 'chezmoi：用一份 dotfiles 打通 macOS、Linux、Windows 三個作業系統'
description: 'chezmoi 是 Go 寫的 dotfiles 管理工具。用 Go template 處理機器差異、用 age 加密私密檔、用 run_onchange 自動裝套件。我跨三個作業系統同步 dotfiles 用的方法整理。'
slug: chezmoi-dotfiles-management
date: '2026-04-13T15:30:00+08:00'
image: featured.jpg
categories:
- DevOps
tags:
- chezmoi
- dotfiles
- age
- Go
draft: false
---

我工作機是 MacBook、家裡有台 Linux 桌機、公司還丟了一台 Windows NUC 過來。三台機器的 `.gitconfig`、`.zshrc`、`.tmux.conf` 要同步，但每台 OS 的細節又不一樣——Windows 需要額外指定 `sslCAInfo` 指到 scoop 裝的 git 憑證路徑，macOS 要跑 Homebrew，Linux 要跑 apt。

以前我用 symlink + shell script 硬搞，現在改用 [chezmoi](https://github.com/twpayne/chezmoi)。同一份 dotfiles repo，三台機器 `chezmoi init --apply` 一行搞定。

## 為什麼不是 stow、yadm 或 dotbot

dotfiles 管理器很多，chezmoi 勝出的點在三個：

1. **Go template**：同一個檔案在不同 OS 會展開成不同內容，不用維護三份 `.gitconfig`
2. **加密原生整合**：age、gpg 直接接，私密檔案能放進公開 repo
3. **onchange script**：裝 Homebrew package 的 script 只在清單變更時跑，不會每次 apply 都重裝

stow 是純 symlink，沒模板；yadm 是 git wrapper，模板靠外掛；dotbot 要寫 YAML 清單。chezmoi 把這些整合在一個 binary 裡。

## 安裝與初始化

```bash
# macOS
brew install chezmoi

# Linux
sh -c "$(curl -fsLS get.chezmoi.io)"

# Windows
winget install twpayne.chezmoi
```

新機器從既有 repo 拉下來並直接套用：

```bash
chezmoi init --apply https://github.com/YOUR_USERNAME/dotfiles.git
```

這行會做三件事：clone repo → 跑 template engine → 把結果寫到 `$HOME`。

## 檔名命名規則

chezmoi 靠**檔名前綴**決定套用時的行為。這設計讓 repo 裡的檔案本身就是設定，不需要額外的 manifest。

| 前綴 | 作用 | 範例 |
|------|------|------|
| `dot_` | 目標是隱藏檔 | `dot_zshrc` → `~/.zshrc` |
| `private_` | 只留 user 權限（0600） | `private_dot_ssh` → `~/.ssh` |
| `executable_` | 加可執行權限 | `executable_bin_foo` |
| `encrypted_` | 用 age/gpg 加密 | `encrypted_dot_env` |
| `symlink_` | 建 symlink | `symlink_dot_bashrc` |
| `readonly_` | 拿掉寫入權限 | `readonly_dot_config.toml` |
| 檔尾 `.tmpl` | 套 template 引擎 | `dot_gitconfig.tmpl` |

前綴可以疊加。我的 repo 裡有這樣的組合：

```
private_executable_dot_php-cs-fixer.dist.php  → ~/.php-cs-fixer.dist.php（0700）
private_dot_ssh/                              → ~/.ssh（0700 整個資料夾）
```

## 用 template 處理機器差異

這是 chezmoi 最實用的功能。我的 `dot_gitconfig.tmpl` 長這樣：

```gotmpl
[user]
    name = {{ .name | quote }}
    email = {{ .email | quote }}

[http]
    sslBackend = openssl
{{ if eq .chezmoi.os "windows" -}}
    sslCAInfo = {{- .chezmoi.homeDir | replace "\\" "/" -}}/scoop/apps/git/current/mingw64/ssl/certs/ca-bundle.crt
{{ end }}

[core]
    autocrlf = false
    symlinks = true
```

`.name` 和 `.email` 從 `~/.config/chezmoi/chezmoi.toml` 讀，不同機器可以有不同值；`{{ if eq .chezmoi.os "windows" }}` 只在 Windows 展開。apply 的時候 chezmoi 會把 `.tmpl` 吃掉，寫出乾淨的 `.gitconfig`。

chezmoi 內建很多變數：

```gotmpl
{{ .chezmoi.os }}              # "darwin" / "linux" / "windows"
{{ .chezmoi.arch }}            # "amd64" / "arm64"
{{ .chezmoi.hostname }}        # 機器名
{{ .chezmoi.username }}        # 登入帳號
{{ .chezmoi.homeDir }}         # 家目錄
```

要看某台機器展開後的結果，不用真的 apply：

```bash
chezmoi execute-template < dot_gitconfig.tmpl
```

## 用 age 加密私密檔

我 repo 是公開的，但裡面有 SSH key 跟資料庫密碼備份檔。這些用 [age](https://github.com/FiloSottile/age) 加密後才進 commit。

先產 age key：

```bash
age-keygen -o ~/key.txt
# Public key: age1examplepublickeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

接著在 `~/.config/chezmoi/chezmoi.toml` 設定：

```toml
encryption = "age"

[age]
    identity = "~/key.txt"
    recipient = "age1examplepublickeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

然後用 `--encrypt` 加檔：

```bash
chezmoi add --encrypt ~/.ssh/id_ed25519
```

repo 裡只會看到 `private_dot_ssh/encrypted_private_id_ed25519.age`，打開是亂碼。apply 時 chezmoi 會用 `~/key.txt` 解密後寫到目標位置。

**唯一的天大陷阱**：`key.txt` 本身**絕對不能放進 repo**。我的作法是把它 GPG 加密後放到密碼管理器，新機器要先手動還原 `key.txt`，然後才能 `chezmoi init --apply`。

## run_onchange script：套件清單變才重裝

我的 repo 有個 `.chezmoiscripts/darwin/run_onchange_00_install-packages.sh.tmpl`，裡面長這樣：

```bash
{{ if eq .chezmoi.os "darwin" -}}
#!/bin/bash

brew install mas
brew install asdf

asdf plugin add nodejs
asdf install nodejs latest
asdf set nodejs latest

# ... 一大堆 asdf install
{{ end -}}
```

檔名的 `run_onchange_` 是關鍵：chezmoi 只有在這個 script **內容 hash 變了**才會執行。套件清單沒改就不重跑，避免每次 `chezmoi apply` 都花五分鐘在 `brew install` 已裝好的東西。

script 命名有四種：

| 前綴 | 觸發時機 |
|------|---------|
| `run_once_` | 同內容一輩子只跑一次 |
| `run_onchange_` | 內容變了才跑 |
| `run_onchange_before_` | 套檔案**之前**跑（裝 package manager） |
| `run_onchange_after_` | 套檔案**之後**跑（啟用 fish plugin） |

檔名前面的數字（`00_`、`01_`、`02_`）控制執行順序。

## .chezmoiroot：repo 子目錄當 source

看了我 repo 有注意到所有檔案都在 `home/` 底下：

```
dotfiles/
├── .chezmoiroot        # 內容只有 "home"
├── Readme.md
├── install.sh
├── install.ps1
└── home/
    ├── dot_zshrc.tmpl
    ├── dot_gitconfig.tmpl
    └── .chezmoiscripts/
```

`.chezmoiroot` 這個檔案告訴 chezmoi「source 在子目錄 `home/`」，這樣 repo 根目錄就能放 README、install script 之類的專案檔案，不會被 chezmoi 當成 dotfiles 處理。

對於想把 dotfiles repo 當正常專案維護的人很實用。

## .chezmoiignore：跳過某些檔案

跟 `.gitignore` 語法一樣，但支援 template。範例：

```
README.md
LICENSE
{{ if ne .chezmoi.os "darwin" }}
.aerospace.toml
Library/
{{ end }}
```

非 macOS 的機器就會忽略 aerospace 視窗管理器設定跟 Library 資料夾。

## 常用指令

```bash
chezmoi add ~/.vimrc              # 把現有檔案加入 repo
chezmoi add --encrypt ~/.env      # 加密後加入
chezmoi edit ~/.zshrc             # 直接編輯 source 檔
chezmoi diff                      # 看 source 和 target 的差異
chezmoi apply                     # 套用到 $HOME
chezmoi apply --dry-run -v        # 預覽要做什麼
chezmoi cd                        # 進入 source 目錄
chezmoi update                    # git pull + apply
chezmoi doctor                    # 檢查環境
```

`chezmoi doctor` 會列出加密工具、template 引擎、git 等的可用狀態，新機器出問題先跑這個。

## 跟 [zoxide](/2026/04/13/zoxide-smarter-cd/)、fish 的整合

我的 fish shell 設定、zoxide 初始化、tmux plugin 都在 chezmoi 管理下。每次換新機器：

1. 還原 age key
2. `sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply recca0120`
3. run_onchange script 自動跑 brew / apt / scoop 裝所有 CLI 工具
4. 設定檔全部就位
5. 打開 fish，zoxide、starship、fzf 都是設定好的

整個新機 setup 大概 20 分鐘，主要時間花在等 `brew install` 下載。

## 缺點與注意事項

chezmoi 不是萬靈丹：

- **Template 學習曲線**：Go template 語法對新手有點硬，`{{- }}` 跟 `{{ }}` 的空白處理要花時間搞懂
- **Debug 痛苦**：template 展開錯的時候錯誤訊息很簡略，常要 `chezmoi execute-template` 單獨測
- **age key 管理**：key 掉了所有加密檔都解不開，務必另外備份（我 GPG 加密後放密碼管理器）
- **初次 apply 要小心**：如果 `$HOME` 已經有手改過的 dotfiles，apply 會覆蓋掉，先 `chezmoi diff` 確認

## 參考資源

- [chezmoi GitHub Repository](https://github.com/twpayne/chezmoi)
- [chezmoi 官方文件](https://www.chezmoi.io/)
- [chezmoi Quick Start](https://www.chezmoi.io/quick-start/)
- [age — Simple File Encryption](https://github.com/FiloSottile/age)
- [Managing Dotfiles With Chezmoi — Nathaniel Landau](https://natelandau.com/managing-dotfiles-with-chezmoi/)
