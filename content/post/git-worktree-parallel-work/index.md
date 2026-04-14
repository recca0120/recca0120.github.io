---
title: 'git worktree：一個 repo 同時開多份工作目錄，也是 AI agent 並行開發的關鍵'
description: '用 git worktree 避開 stash + branch switch 的切換成本，讓 hotfix、code review、長測試、多個 AI agent 並行跑在同一個 repo。整理常用指令、bare repo 模式，以及 2024–2026 新增的 relative paths 支援。'
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

手邊 feature 改到一半，PM 說 production 壞了要 hotfix。你的反射動作可能是 `git stash`、切 master、修、回來 `stash pop`——然後 dev server 重啟、IDE 重索引、未追蹤的 build 產物通通被 stash 吃掉。

這種情境 git worktree 解得漂亮：**同一個 repo 同時 checkout 多個分支到不同資料夾**，每個資料夾有自己的 HEAD、index、未追蹤檔案，但共用同一份物件庫。feature 留在原地不動，hotfix 在隔壁資料夾搞定。

## 跟 stash、多份 clone 比起來

| 方案 | 切換成本 | 磁碟 | 物件同步 |
|------|---------|------|---------|
| `git stash` + 切分支 | 高（dev server 重啟、IDE 重索引）| 省 | 同一個 repo |
| 多份 clone | 低 | 浪費（大 repo 幾 GB）| 要分別 fetch |
| `git worktree` | 低 | 省（物件共用）| 單一 fetch 全部生效 |

worktree 是兩者的綜合體:檔案系統隔離、物件庫統一。

## 核心指令

```bash
# 新增 worktree——用路徑的最後一段當新分支名
git worktree add ../hotfix                   # 從 HEAD 開 hotfix 分支
git worktree add ../review pr-123            # checkout 現有分支
git worktree add -b feat-x ../feat-x main    # 從 main 開 feat-x
git worktree add -d ../throwaway             # detached HEAD、不開分支

git worktree list                            # --porcelain 方便 script 解析
git worktree remove ../hotfix                # 乾淨才能 remove；髒的加 -f
git worktree prune                           # 清掉手動刪掉資料夾後的殘留 metadata
git worktree lock ../usb-drive --reason "removable drive"
git worktree unlock ../usb-drive
git worktree move ../old ../new              # 有 submodule 的 worktree 不能 move
git worktree repair                          # 主 repo 搬家後修復連結
```

**取個短 alias 用起來更順**:

```bash
git config --global alias.wta 'worktree add'
git config --global alias.wtl 'worktree list'
git config --global alias.wtr 'worktree remove'
```

## 常見實戰場景

**1. Hotfix 不打斷 feature**

```bash
git worktree add ../hotfix-prod origin/main
cd ../hotfix-prod
# 修 bug、commit、push、開 PR
cd ../myrepo
git worktree remove ../hotfix-prod
```

feature 的 dev server 沒停過,node_modules 沒動過,IDE 也沒重掃。

**2. 長跑測試 + 繼續寫**

`pytest` / `cargo test` 跑 10 分鐘,開一個 worktree 讓它慢慢跑,你在主 worktree 繼續改下一個 commit。兩邊互不干擾。

```bash
git worktree add ../ci-run branch-a
cd ../ci-run && pytest --slow &
cd -   # 回主 worktree 繼續寫
```

**3. Code review 不污染當下狀態**

```bash
git worktree add ../review-456 pr-456-branch
cd ../review-456
# 跑起來、翻程式、下 comment
cd - && git worktree remove ../review-456
```

**4. 多個 AI agent 平行跑**(2025 最被低估的用法)

Claude Code / Cursor / Aider 這類 AI 工具一次只能有一個在同個資料夾工作,檔案會互相蓋。一個分支一個 worktree,就能**三個 agent 同時跑三個 feature**,不互相踩腳、各自 dev server port、各自 node_modules:

```bash
git worktree add ../agent-a -b feat-a
git worktree add ../agent-b -b feat-b
git worktree add ../agent-c -b feat-c

# 三個 terminal pane / 三個 tmux window 各跑一個 claude
```

Claude Code 的 Agent tool 甚至內建 `isolation: "worktree"` 選項,sub-agent 自動開 worktree 跑,改完 merge 回來。

## 目錄佈局的三種流派

**兄弟資料夾(最簡單)**
```
~/code/myrepo
~/code/myrepo-hotfix
~/code/myrepo-review-123
```
編輯器「一個資料夾一個專案」模式最順。

**`.worktrees/` 子目錄**
```
myrepo/
├── src/
└── .worktrees/
    ├── feat-x/
    └── hotfix/
```
集中管理,記得加到 global gitignore。缺點是某些工具(ESLint、tsc)會遞迴掃進去。

**Bare repo 模式(多分支平行開發首選)**

```bash
mkdir myproj && cd myproj
git clone --bare git@github.com:org/repo.git .bare
echo "gitdir: ./.bare" > .git
git worktree add main
git worktree add feat-x
```

結果:
```
myproj/
├── .bare/           # 真正的物件庫
├── .git             # 檔案,內容指向 .bare
├── main/            # main 分支的 checkout
└── feat-x/          # feat-x 分支的 checkout
```

沒有「主 working copy」,每個分支都是一個 worktree,`cd` 就是切換分支。跟 tmux / AI agent 搭起來超乾淨。

## 踩過的雷

**`.git` 在 linked worktree 是檔案不是資料夾**。內容是 `gitdir: /path/to/main/.git/worktrees/<name>`。直接讀 `.git/` 當資料夾的工具會炸。

**同一個分支不能在兩個 worktree checkout**。預設擋下以防 index 漂移。硬要可以 `--force` 或用 detached HEAD。

**Submodule 是痛點**。`worktree move` 會拒絕,`remove` 要 `--force`。`.git/modules/` 是共用的,不同 worktree 切不同 submodule commit 會互相覆蓋。大量用 submodule 的專案要小心。

**`node_modules`、`venv`、`target/` 各自一份**。磁碟吃重。幾個省法:
- pnpm 有 content-addressable store,多個 worktree 重裝也幾乎不佔空間
- Rust 設 `CARGO_TARGET_DIR=~/.cache/cargo-target` 讓所有 worktree 共用
- uv、poetry 的 cache 也能跨 worktree 共用

**`.env` 不會複製**。用 direnv 的 `.envrc` 放進去,進入資料夾自動載入。

**hooks 是共用的**(`.git/hooks/` 在 common dir)。hook script 如果用相對路徑假設在 repo root,換 worktree 會壞。寫 hook 一律用 `git rev-parse --show-toplevel` 取當下 worktree 的根。

**IDE 索引各自跑**。VS Code / JetBrains 在每個 worktree 都建一份索引,CPU 跟磁碟會重複吃。這是結構限制沒得避。

## 編輯器整合

**VS Code**:用 multi-root workspace(`File → Add Folder to Workspace`)一次開多個 worktree,或乾脆每個開一個視窗。2024 年後 `GitHub.vscode-pull-request-github` 直接把 PR checkout 做成 worktree。

**JetBrains**:Git tool window 有原生 worktree UI 從 2023.2 開始能 GUI 操作。

**fzf 快速切換**:

```bash
wtcd() {
  cd "$(git worktree list --porcelain | awk '/^worktree /{print $2}' | fzf)"
}
```

敲 `wtcd` 跳 fzf 選單,fuzzy 搜 worktree 路徑,enter 直接 `cd` 過去。

## 2024–2026 的新功能

**Git 2.44(2024/2)**:`git worktree add --orphan` — 開一個 unborn branch 的 worktree,做 `gh-pages` 那種分開 deploy 分支很順。

**Git 2.46(2024/7)**:`worktree.useRelativePaths` config 跟 `--relative-paths` flag — worktree 內部連結改成相對路徑。好處是主 repo 搬家、或整個資料夾同步到 Dropbox / iCloud / docker volume,worktree 不會爛。

**Git 2.48(2025/1)**:`git worktree repair` 會自動修絕對/相對路徑不一致的狀況。

**Git 2.50(2025 年中)**:relative paths 跟 porcelain 輸出穩定化。

生態系:2025 年「AI agent 一分支一 worktree」模式變主流,`git-town`、`ghq`、`gh` CLI 都陸續加 first-class worktree 支援。

## 上手建議

1. 先在隨便一個 repo 跑 `git worktree add ../test-wt -b test-branch`,進去亂改
2. 回到主 worktree,觀察 `git branch` 看到但 `git status` 不受影響
3. `git worktree remove ../test-wt` 刪掉,檢查主 worktree 完全沒動
4. 加上 `wta` / `wtl` / `wtr` alias,肌肉記憶養起來
5. 下次 hotfix 時用 worktree 代替 stash,感受一下不用切分支的爽度

對用 AI coding agent 的人來說,worktree 不是加分項——是必備。一個 repo 一次只能跑一個 agent 這個限制,worktree 直接拿掉。

## 參考資源

- [git-worktree 官方文件](https://git-scm.com/docs/git-worktree)
- [Git 2.46 release notes — worktree.useRelativePaths](https://github.com/git/git/blob/master/Documentation/RelNotes/2.46.0.txt)
- [Claude Code Agent tool — isolation: worktree](https://code.claude.com/docs/en/agent-sdk)
- [git-town — high-level git workflow wrapper](https://www.git-town.com/)
