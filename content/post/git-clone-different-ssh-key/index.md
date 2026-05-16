---
title: '用不同 SSH Key Clone GitHub 專案的三種方法'
description: '當你有多個 GitHub 帳號或需要用特定 SSH key clone 某個 repo 時，介紹三種解法：GIT_SSH_COMMAND 一次性用法、git config core.sshCommand 設定單一 repo、以及 ~/.ssh/config Host 別名搭配 url.insteadOf 的多帳號管理。'
slug: git-clone-different-ssh-key
date: '2026-05-16T10:00:00+08:00'
image: featured.png
categories:
- DevTools
tags:
- git
- ssh
- github
draft: false
---

手上有個 GitHub repo 的存取權，但 SSH key 不是預設的 `~/.ssh/id_rsa` 或 `~/.ssh/id_ed25519`，直接 `git clone` 就噴 `Repository not found`。這篇記錄三種指定 SSH key 的方式，以及 `~/.ssh/config` Host 別名的常見陷阱。

## 問題場景

我想要 clone 一個私有 repo：

```bash
git clone git@github.com:client-org/project.git
```

但存取這個 repo 需要的 SSH key 是 `~/.ssh/client_key`，不是系統預設的那把。直接 clone 會得到：

```
ERROR: Repository not found.
fatal: Could not read from remote repository.
```

這個錯誤訊息很誤導——不是 repo 不存在，而是 GitHub 收到的 SSH key 沒有存取權，所以回傳跟「找不到」一樣的結果（刻意隱藏 repo 是否存在）。

我試過先在 `~/.ssh/config` 設 Host 別名再 clone，還是噴一樣的錯誤。最後是下面兩個方法解決的。

## 方法一：GIT_SSH_COMMAND（一次性）

最快的做法，前綴加一個環境變數：

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/client_key' git clone git@github.com:client-org/project.git
```

`GIT_SSH_COMMAND` 讓 Git 改用你指定的 SSH 指令，`-i ~/.ssh/client_key` 指定用哪把 private key。這個設定只對這次指令有效，clone 完之後 push/pull 不會自動套用。

## 方法二：git config core.sshCommand（單一 repo）

Clone 完之後，進到 repo 目錄設定：

```bash
cd project
git config core.sshCommand 'ssh -i ~/.ssh/client_key'
```

這個設定寫進 `.git/config`，之後在這個 repo 內的所有 git 操作（pull、push、fetch）都會用 `~/.ssh/client_key`，不用每次加環境變數。

兩步合一：

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/client_key' git clone git@github.com:client-org/project.git
cd project
git config core.sshCommand 'ssh -i ~/.ssh/client_key'
```

這是單一 repo 最省事的做法。

## 方法三：~/.ssh/config Host 別名（有陷阱）

理論上可以在 `~/.ssh/config` 設 Host 別名來管多帳號：

```
Host github-client
    HostName github.com
    User git
    IdentityFile ~/.ssh/client_key
    IdentitiesOnly yes
```

然後 clone 時換成別名：

```bash
git clone git@github-client:client-org/project.git
```

### 陷阱：已有 Host github.com 設定時別名會失效

如果你的 `~/.ssh/config` 已經有 `Host github.com` 的區塊（例如個人帳號），SSH 可能不走別名，導致還是用錯 key，clone 一樣失敗。

驗證別名是否正確生效：

```bash
ssh -T git@github-client
```

回傳 `Hi <username>!` 且帳號正確才算設定成功。如果帳號不對，表示走到別的 key 了。

### 搭配 url.insteadOf 讓整個 org 自動走別名

如果你有整個 org 底下多個 repo 都需要用同一把 key，可以設 URL 重寫，讓 git 自動換別名：

```bash
git config --global url."git@github-client:client-org/".insteadOf "git@github.com:client-org/"
```

設定之後，對 `client-org` 下的任何 repo 進行 git 操作，URL 都會自動換成走 `github-client` 別名，不用每個 repo clone 完都手動設一次。

> 如果只是單一 repo，用方法二的 `core.sshCommand` 更直接，不需要動全域設定。

## 三種方法比較

| 方法 | 適用場景 | 設定範圍 |
|------|----------|----------|
| `GIT_SSH_COMMAND` 環境變數 | 臨時用，只 clone 一次 | 單次指令 |
| `git config core.sshCommand` | 單一 repo 長期使用 | 單一 repo |
| `~/.ssh/config` + `url.insteadOf` | 整個 org 多個 repo | 全域 |

## 參考資源

- [GitHub Docs — Managing multiple accounts](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-your-personal-account/managing-multiple-accounts)
- [GitHub Docs — About SSH](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/about-ssh)
- [Git Documentation — GIT_SSH_COMMAND](https://git-scm.com/docs/git#Documentation/git.txt-codeGITSSHCOMMANDcode)
