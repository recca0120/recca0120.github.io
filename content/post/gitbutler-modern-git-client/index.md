---
title: 'GitButler：重新設計 Git 操作體驗的現代版本控制工具'
description: 'GitButler 是一個基於 Git 的版本控制介面，支援平行分支、疊加分支、無限復原和 AI 整合。不用切換分支就能同時處理多個任務，拖拉就能完成 commit 管理，專為現代開發工作流程設計。'
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

`git rebase -i` 是我用得最不順手的指令。每次要調整 commit 順序、拆分或合併，都要在 vim 裡面操作那個清單，然後祈禱 rebase 過程中不要有衝突中斷。衝突一發生，狀態就變得很難掌握。

[GitButler](https://github.com/gitbutlerapp/gitbutler) 的出發點就是「Git 的概念是對的，但操作介面可以做得更好」。它是一個完整的 Git 用戶端，有 GUI 和 `but` CLI，Tauri + Svelte + Rust 架構，底層還是標準 Git，但把幾個最難用的地方重新設計了。

## 最核心的差異：平行分支

一般用 Git 的方式是：切到某個 branch 做事，做完再切到另一個。兩件事要同時進行就要切來切去，或者開[多個 worktree]({{< ref "/post/git-worktree-parallel-work" >}}) 手動管理。

GitButler 的**平行分支（Parallel Branches）**讓你不用切換，直接在同一個工作目錄同時處理多個分支。把某個檔案的變更拖到哪個分支，它就屬於那個分支。

這對 AI agent 工作流程特別有用——agent 同時修多個地方，不同任務的改動可以拆到不同分支，不用等一個做完再開始下一個。

## 疊加分支

依賴另一個分支的功能開發很常見，例如先開一個 `feat/api` 分支，再從上面開 `feat/ui` 繼續做。

傳統做法是 `feat/ui` rebase 在 `feat/api` 上，但一旦 `feat/api` 有更動，就要手動重新 rebase 整個鏈。

GitButler 的**疊加分支（Stacked Branches）**把這件事自動化。修改任何一層的 commit，上面的分支自動 restack，不需要手動操作。

## Commit 管理不需要 `rebase -i`

這是讓我最直接有感的部分。GitButler 的 commit 管理全部可以拖拉：

- **Uncommit**：把 commit 拆回工作區
- **Reword**：直接改 commit message
- **Amend**：把工作區的改動加進某個 commit
- **Move**：把 commit 移到其他位置
- **Split**：把一個 commit 拆成多個
- **Squash**：合併 commit

以前需要 `git rebase -i` 的操作，現在拖一拖就完成。

## 無限復原

所有操作都被記錄在 **Undo Timeline** 裡，包括 commit、rebase、各種變更。任何時間點都可以回去，不用擔心操作錯了回不去。

`but` CLI 也有對應指令：

```bash
but operations-log     # 查看所有操作記錄
but undo               # 復原上一個操作
```

## 衝突不再中斷流程

一般 `git rebase` 遇到衝突會直接停下來，要你當場解決才能繼續。如果有多個衝突，要一個一個處理完，整個 rebase 流程才能走完。

GitButler 的**First Class Conflicts** 讓 rebase 永遠成功。衝突的 commit 被標記起來，可以之後再處理，也可以按任意順序解決，不會卡住整個工作流程。

## GitHub / GitLab 整合

不用切換到瀏覽器，在 GitButler 裡面直接：

- 開 PR、更新 PR
- 看 CI 狀態
- 列出 branch 清單

CLI 版：

```bash
but forge pr create    # 開 PR
but forge pr list      # 列出 PR
```

## AI 整合

內建 AI 可以幫你生成：
- Commit message
- Branch name
- PR description

也可以安裝 hooks 讓 Claude Code 或其他 AI agent 直接操作 GitButler，讓 agent 的 Git 管理能力升級。

## 安裝

```bash
# macOS
brew install gitbutler

# 或直接下載 GUI
# https://gitbutler.com/downloads
```

CLI 工具：

```bash
# 裝好 GUI 後，but CLI 也一起裝好了
but --help
```

## 跟 git worktree 的差別

之前寫過[用 git worktree 同時處理多個分支]({{< ref "/post/git-worktree-parallel-work" >}})，兩者都是解決「平行工作」的問題，但角度不同：

| | git worktree | GitButler |
|---|---|---|
| 本質 | Git 原生功能 | 完整 Git 用戶端 |
| 操作方式 | 命令列 | GUI + CLI |
| 多分支平行 | 多個目錄 | 同一個目錄 |
| Commit 管理 | 需要 rebase -i | 拖拉操作 |
| 學習成本 | 低（懂 Git 就會） | 需要熟悉新介面 |

worktree 適合已經習慣 CLI、想要最小化工具依賴的人。GitButler 適合想要完整 GUI 體驗、處理複雜 commit 操作的場景。

## 授權說明

GitButler 用 **Fair Source** 授權——可以用、看源碼、貢獻，但不能用它做競品產品。**2 年後自動轉為 MIT**，算是開源但加了一個到期的競業條款。

## 參考資源

- [GitButler GitHub](https://github.com/gitbutlerapp/gitbutler)
- [GitButler 官方文件](https://docs.gitbutler.com)
- [GitButler 官網](https://gitbutler.com)
- [Fair Source 授權說明](https://fair.io/)
