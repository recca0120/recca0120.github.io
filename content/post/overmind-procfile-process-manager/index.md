---
title: '用 Overmind 管理本機多服務：比 foreman 好用在哪'
description: '介紹 Overmind 這個 Procfile 流程管理器，整合 tmux 讓每個 process 可以獨立連線、單獨重啟，解決 foreman 的 log 截斷和顏色問題，適合 Rails、全端開發的本機開發環境。'
slug: overmind-procfile-process-manager
date: '2026-04-16T18:45:00+08:00'
image: featured.png
categories:
- DevOps
tags:
- overmind
- tmux
- Procfile
- Rails
draft: false
---

本機開發跑 Rails 全端專案，至少要同時起四個服務：Rails server、Sidekiq、前端 build、CSS watch。以前的做法是開四個 terminal tab 分別跑，或是用 foreman 把它們包在一起。

foreman 用了一段時間後，有幾個地方讓我很煩：log 顏色常常不見、輸出有時候會 delay 好幾秒才出現、有一個 process 掛掉就全部停。[Overmind](https://github.com/DarthSim/overmind) 解決了這些問題，而且多了幾個讓人上癮的功能。

## Procfile 是什麼

Overmind 讀的是 `Procfile`，這個格式從 Heroku 時代就在用，定義應用程式有哪些服務、每個服務要跑什麼指令：

```Procfile
web: bin/rails server
worker: bundle exec sidekiq
assets: yarn build --watch
css: yarn tailwind --watch
```

一行一個服務，格式是 `名稱: 指令`。這個檔案同時也是 Heroku、Render、Railway 這些平台的部署設定，本機跟線上用同一份，減少環境差異。

## 安裝

macOS 先裝 tmux（Overmind 的核心依賴）：

```bash
brew install tmux
brew install overmind
```

Linux：

```bash
apt-get install tmux
# 下載最新 release binary 或
go install github.com/DarthSim/overmind/v2@latest
```

## 基本用法

在有 `Procfile` 的目錄跑：

```bash
overmind start
# 或縮寫
overmind s
```

所有服務就起來了，log 會集中在同一個輸出，每個 process 用不同顏色區分名稱。

## 讓 foreman 用戶馬上看到差異的功能

### 單獨重啟某個服務

這個功能我每天都在用。改了 Sidekiq worker，不用整個停掉重跑，直接：

```bash
overmind restart worker
```

只有 worker 重啟，web 和前端 build 繼續跑，不中斷。

### 連進去操作

某個服務需要輸入（比如跑 Rails console 在同一個 process 裡）或想直接看它的輸出：

```bash
overmind connect web
```

這會開一個 tmux window 連進去，可以打指令、看完整 log。離開用 `Ctrl+b d` 回到主畫面，不會把 process 停掉。

### 允許某個服務死掉不影響其他人

前端 build 跑完就結束了，不應該讓它把整個 stack 拉倒：

```bash
overmind start -c assets,npm_install
# 或用環境變數
OVERMIND_CAN_DIE=assets,npm_install overmind start
```

### 自動重啟

某些 process 偶爾會掛掉，設定讓它自動重來：

```bash
overmind start -r worker
OVERMIND_AUTO_RESTART=worker overmind start
```

加 `all` 就全部服務都自動重啟：

```bash
overmind start -r all
```

## 為什麼 log 顏色不會掉

foreman 的 log 問題來自 process 的輸出方式。大部分程式偵測到 stdout 不是 terminal 時，會切換成 buffered 模式輸出，結果就是顏色 escape code 被丟掉、log 延遲到 buffer 滿了才一次噴出來。

Overmind 用 tmux 的 **control mode** 來捕捉輸出，每個 process 都跑在真實的 tmux window 裡，對 process 來說它是在對著 terminal 說話，所以顏色、即時輸出全部正常。

## 環境變數設定

不想每次都打那麼長的指令，可以在專案目錄建 `.overmind.env`：

```bash
OVERMIND_PORT=3000
OVERMIND_AUTO_RESTART=worker
OVERMIND_CAN_DIE=assets
```

Overmind 啟動時自動讀這個檔，等於把常用設定存下來。

也可以放在 `~/.overmind.env`（home 目錄）做全域設定。

## Port 分配

Overmind 會自動設定 `PORT` 環境變數給每個 process：

- 第一個 process：`PORT=5000`
- 第二個：`PORT=5100`
- 以此類推（step 預設 100）

Procfile 可以直接用：

```Procfile
web: bin/rails server -p $PORT
```

改 base port：

```bash
overmind start -p 3000
```

不同 process 之間也可以互相引用 port：

```Procfile
web: bin/rails server -p $PORT
proxy: ngrok http $OVERMIND_PROCESS_web_PORT
```

## 只跑部分服務

有時候只需要跑 web 和 worker，不需要前端 build：

```bash
# 只跑指定服務
overmind start -l web,worker

# 排除指定服務
overmind start -x assets,css
```

## 服務 Scaling

需要跑多個 worker instance：

```bash
overmind start -m web=1,worker=3
```

worker 會起三個 instance，port 依序分配。

## 跟 foreman 的比較

| 功能 | foreman | Overmind |
|------|---------|----------|
| 基本 Procfile 支援 | ✓ | ✓ |
| Log 顏色保留 | 常掉 | 正常 |
| Log 即時輸出 | 有延遲 | 即時 |
| 單獨重啟 | ✗ | ✓ |
| 連進 process 操作 | ✗ | ✓ |
| Can-die 設定 | ✗ | ✓ |
| Auto-restart | ✗ | ✓ |
| 依賴 | 無 | tmux |

主要代價是多了 tmux 依賴。如果你的環境不能裝 tmux，或是只需要最基本的 Procfile 管理，Overmind 的作者也做了一個輕量版 [Hivemind](https://github.com/DarthSim/hivemind)，沒有 tmux 整合，但沒有 log 問題。

## 實際 Procfile 範例

Rails + Sidekiq + Vite：

```Procfile
web: bin/rails server -p $PORT
worker: bundle exec sidekiq -C config/sidekiq.yml
vite: bin/vite dev
```

搭配 `.overmind.env`：

```bash
OVERMIND_PORT=3000
OVERMIND_AUTO_RESTART=worker
OVERMIND_CAN_DIE=vite
```

跑起來：

```bash
overmind s
```

三個服務各自在 tmux window 裡，log 顏色正常，worker 掛掉自動重啟，vite 結束不影響其他服務。

## 參考資源

- [Overmind GitHub Repo](https://github.com/DarthSim/overmind)
- [Hivemind — 輕量版（無 tmux）](https://github.com/DarthSim/hivemind)
- [Introducing Overmind and Hivemind — Evil Martians](https://evilmartians.com/chronicles/introducing-overmind-and-hivemind)
- [Heroku Procfile 格式說明](https://devcenter.heroku.com/articles/procfile)
