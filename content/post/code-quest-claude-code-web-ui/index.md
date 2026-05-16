---
title: 'Code Quest：用互動模式跑 Claude Code 的 Web UI，6/15 收費新制剛好避開'
description: '介紹 code-quest 這個開源專案——直接 spawn Claude Code CLI 並完整解析 NDJSON protocol，支援 session fork/resume/worktree、Split deployment、File explorer 與 Git 整合。分析為何互動模式在 6/15 新制後比 SDK / claude -p 更划算，以及架構上的核心差異。'
slug: code-quest-claude-code-web-ui
date: '2026-05-16T14:00:00+08:00'
image: featured.png
categories:
- DevTools
tags:
- claude-code
- AI
- open-source
- web-ui
draft: false
---

2026 年 6 月 15 日，Anthropic 宣布 `claude -p` 和 Agent SDK 的用量不再計入訂閱額度，改成每月獨立的 Agent SDK credit，用完就走 API 計費。換句話說，你現在跑的自動化腳本、headless pipeline，6/15 之後有可能開始另計費用。

[code-quest](https://github.com/recca0120/code-quest) 走的是不同的路：直接 spawn Claude Code CLI，完整解析 NDJSON 互動 protocol，在瀏覽器裡做 session 管理、檔案瀏覽和 Git 整合。互動模式不在新收費範圍內，這個架構選擇在政策改變的時間點上剛好站到了有利的位置。

## 6/15 新制：什麼用法開始另計費？

Anthropic 官方文件的說明（原文）：

> Starting June 15, 2026, Agent SDK and `claude -p` usage on subscription plans will draw from a new monthly Agent SDK credit, separate from your interactive usage limits.

簡單說：SDK 和 `claude -p` 的用量從原本的訂閱額度裡分出去，改用獨立的 credit 池，用完才走 API 計費。

受影響的：
- `claude -p`（pipe / headless mode）
- Agent SDK（Python / TypeScript）
- Claude Code GitHub Actions
- 第三方 app 透過 Agent SDK 呼叫

**不受影響的**：互動模式的 Claude Code session。

credit 用完之後就走 API 計費，按 token 付費。如果你的工作流程是透過 `claude -p` 餵指令，或者用 SDK 包一個自動化 agent，6/15 之後的成本需要重新估算。

## code-quest 怎麼跑

架構分三層：

```
瀏覽器 (React 19 + Tailwind v4)
    ↓ WebSocket /ws
Server (Express + Drizzle ORM)
    ↓ WebSocket /summoner
Summoner（本機 binary，Bun 編譯）
    ↓ child_process spawn
Claude Code CLI
```

**Summoner** 是核心。它用 Bun 編譯成獨立的 binary，跑在本機，負責：

- spawn Claude Code CLI，帶上 `--output-format stream-json --input-format stream-json`
- 逐行解析 CLI 輸出的 NDJSON（`system`、`assistant`、`user`、`result`、`stream_event`、`control_request`）
- 把 permission / elicitation 請求透過 WebSocket 送到 browser，等使用者回應後透過 stdin 回寫給 CLI
- 處理本機的檔案系統、Git 和 OpenSpec 操作

**Server** 部署在雲端，只做路由和持久化（SQLite 或 MySQL），不碰任何本機資源。Browser 透過 WebSocket 連 Server，Server 再透過另一條 WebSocket 連本機的 Summoner。

這個 Split deployment 設計讓 Server 可以跑在任何地方，不需要和 Claude Code CLI 在同一台機器。

## 和其他 Web UI 的差異

現有的 Claude Code Web UI 大致走兩種路線。

第一種是**介面層**：UI 管理 config 檔和 session 歷史，實際的 Claude Code 執行還是靠使用者自己在 terminal 跑。這類工具適合瀏覽和管理，但沒辦法從 UI 接管 permission prompts，session fork / resume 也是手動的。

第二種是**橋接模式**：讓 CLI 透過 SDK WebSocket 路徑主動連回 server，UI 接收串流輸出。這個做法讓 UI 和 CLI 之間建立了連線，但底層走的是 SDK 模式——6/15 之後這類用量會進入 Agent SDK credit 的計算。

code-quest 選的是第三條路：**直接 spawn CLI，走互動模式**。

- **6/15 收費不影響**：互動模式的用量繼續算在訂閱額度，不進 Agent SDK credit
- **完整 protocol 控制**：所有 `control_request`（permission prompts、elicitation）都能在 browser 裡即時處理，不是只看輸出
- **Split deployment**：Server 可以部署在雲端，Summoner 跑在本機，不需要同一台機器
- **Session 操作完整**：fork、resume、rename 是一等功能，狀態持久化到 DB，不靠手動管理

## 主要功能

### Session 管理

每個 Claude Code session 對應一個 channel，可以：

- **Spawn**：建立新 session
- **Resume**：從 DB 恢復上次的 session，CLI 帶 `--resume <session-id>` 重啟
- **Fork**：從現有 session 的某個狀態分支出去，走不同的解法
- **Rename**：替 session 命名方便找

Session 的完整 NDJSON event 歷史存在 DB。其中 `content_block_delta`（串流 delta）佔所有事件約 80% 的流量，code-quest 把它拆到獨立的表，讀取 session 歷史時預設不載入，讓 DB 查詢保持輕量。

### Git Worktree 支援

code-quest 對 Git Worktree 有完整的生命週期支援：建立、列出、刪除、封存、重命名。每個 session 可以綁定一個 worktree，讓多個任務同時跑在不同的 branch，不互相干擾。

這個功能在跑多個 Claude Code 任務時特別有用——不同 session 各自在獨立的 worktree 操作，改動不會踩在一起。

### 檔案瀏覽器

- 瀏覽目錄、讀取檔案、顯示 diff
- 整合 git status（哪些檔案改過、新增、刪除）
- 模糊搜尋（Fuse.js）
- RootGuard 防止 directory traversal，`EXPLORER_ROOTS` 設定可瀏覽的根目錄

### 即時推送

檔案、Git 狀態、OpenSpec 的變動不需要輪詢。`packages/broadcaster` 用 DataSource / pub-sub pattern，底層透過 chokidar 監聽檔案變動，狀態一變就從 Summoner 推到 Server，再推到 browser。

### WebSocket 斷線恢復

自訂的 ResumableSocket 維護 sequence number，斷線重連後會 replay 遺漏的事件（500 事件的 circular buffer）。如果 gap 太大補不回來，改成要求 client 重新整理整個 state。

### OpenSpec 整合

code-quest 內建對 OpenSpec 格式的支援，可以直接從介面建立、封存、切換 spec 任務，並且即時同步 spec 狀態到瀏覽器，不需要手動重整。

## 快速上手

```bash
git clone https://github.com/recca0120/code-quest.git
cd code-quest
pnpm install
pnpm dev
```

開啟 `http://localhost:5173`。

設定檔複製自 `apps/server/.env.example`，主要的環境變數：

| 變數 | 預設 | 說明 |
|------|------|------|
| `APP_PORT` | `3000` | Server 埠號 |
| `DATABASE_SQLITE_URL` | — | SQLite 路徑，例如 `file:./data/code-quest.db` |
| `SUMMONER_MODE` | `local` | `local`（同機）或 `remote`（分機部署） |
| `SUMMONER_TOKEN` | — | remote 模式的 bearer token |
| `CLI_AUTO_MODE` | `true` | 傳遞 `--auto-mode` 給 Claude Code |
| `EXPLORER_ROOTS` | 家目錄 | 可瀏覽的根目錄，逗號分隔 |

Remote 模式（Server 在雲端、Summoner 在本機）：Server 設 `SUMMONER_MODE=remote`，Summoner 設 `SUMMONER_TOKEN` 並指向 Server 的 WebSocket endpoint。

## 往 API 方向延伸

code-quest 的架構天然支援這個擴展方向。Server 已經是所有請求的中樞，在 Server 這層加 HTTP API endpoint，收到請求後透過既有的 WebSocket channel 轉給 Summoner，Summoner 再寫進 CLI stdin——整條路徑已經通了，只差一個對外的介面。

這樣的 API 底層走互動模式，不進 Agent SDK credit 的計算。如果你需要用程式驅動 Claude Code 但不想走 SDK 計費，code-quest 的架構提供了一條可行的路徑。

## 小結

互動模式、完整 protocol 實作、Split deployment——這三個架構選擇讓 code-quest 的定位在 6/15 新制之後更清楚。訂閱用量繼續算在互動額度裡，permission prompts 在 browser 裡處理，Server 和本機 Summoner 分開部署。如果你在找一個可以從瀏覽器完整操作 Claude Code 的方案，這個專案值得試試。

## 參考資源

- [code-quest GitHub](https://github.com/recca0120/code-quest)
- [Claude Agent SDK 文件](https://code.claude.com/docs/en/agent-sdk/overview)
- [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
