---
title: 'claude-view：Claude Code 的 Mission Control，即時監控 session、成本、token 用量'
description: 'claude-view 是 Rust 打造的 Claude Code 監控 dashboard，即時追蹤所有 session 的對話、成本、token 用量、sub-agent 樹狀圖，內建 85 個 MCP tools 和全文搜尋。'
slug: claude-view-mission-control
date: '2026-04-07T17:30:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- claude-code
- ai-agent
- MCP
- Rust
draft: false
---

用 Claude Code 一段時間之後，最常被問的問題是「你這個月花了多少錢？」。老實說我答不出來。Claude Code 的 terminal 介面不會告訴你累計花了多少 token，跑了幾個 sub-agent，哪個 session 最燒錢。

[claude-view](https://github.com/tombelieber/claude-view) 就是來補這個缺口的。一行指令打開一個 dashboard，即時監控你機器上所有的 Claude Code session。

```bash
npx claude-view
```

## 它能看到什麼

### Session 即時監控

打開 dashboard 之後，你會看到所有正在跑的 Claude Code session，每張卡片顯示：

- 最後一條訊息
- 使用的模型（Opus、Sonnet、Haiku）
- 當前花費和 token 數
- Context window 使用率（即時百分比）
- Prompt cache 倒數計時

卡片有多種排列方式：Grid、List、Kanban、Monitor。Kanban 模式會按 project/branch 分 swimlane，很適合同時跑多個專案的時候。

### 對話瀏覽

點進任何一個 session，可以看到完整的對話記錄。跟在 terminal 裡看不一樣的是，claude-view 會把 tool call 視覺化——檔案讀取、編輯、bash 指令、MCP 呼叫都有獨立的卡片。

有個 Developer Mode 開關，打開之後會顯示 hook metadata、event 卡片、raw JSON。debug 的時候很有用。

對話可以匯出成 Markdown，方便貼到文件或丟回去讓 Claude 繼續。

### Sub-agent 樹狀圖

Claude Code 會 spawn sub-agent 來處理子任務。在 terminal 裡你只看到一層，claude-view 會畫出完整的樹狀結構，每個 sub-agent 各自的 cost/token 一目了然。

### 全文搜尋

搜尋引擎用的是 [Tantivy](https://github.com/quickwit-oss/tantivy)，Rust 寫的，Lucene 等級的全文索引。搜尋 1,500 個 session 的回應時間在 50ms 以內。

`Cmd+K` 打開 command palette，可以快速跳轉 session 或切換 view。

## Analytics：錢花到哪裡去了

這是我覺得最有價值的部分。

### Dashboard 指標

- 週對週的 session 數、token 用量、花費比較
- 90 天 GitHub 風格的活動 heatmap
- 最常用的 skills、commands、MCP tools 排行
- 最活躍的 project 長條圖
- 跨 session 的總 edits、reads、bash commands 統計

### AI 貢獻追蹤

這個功能把 Claude Code 的產出量化了：

- 新增/刪除行數、修改檔案數、commit 數
- 每個 commit 的成本、每個 session 的成本、每行程式碼的 ROI
- Opus vs Sonnet vs Haiku 的比較
- Re-edit rate：你下的 prompt 品質有沒有在進步

還有一個實驗性的 AI Fluency Score（0-100），根據你的 session 歷史算出你用 AI 的熟練程度。

## 85 個 MCP Tools

claude-view 有一個 plugin（`@claude-view/plugin`），裝了之後 Claude Code 每次啟動都會自動載入。

```bash
claude plugin add @claude-view/plugin
```

這個 plugin 提供 85 個 MCP tools：8 個手寫的核心工具加上 77 個從 OpenAPI spec 自動生成的工具。

核心的 8 個：

- `list_sessions`、`get_session`、`search_sessions`
- `get_stats`、`get_fluency_score`、`get_token_stats`
- `list_live_sessions`、`get_live_summary`

裝了之後，你可以在 Claude Code 裡直接問「今天花了多少錢」「上週最花時間的 session 是哪個」，它會透過 MCP 去 claude-view 查。

### 9 個 Skills

除了 MCP tools，還有 9 個內建 skill：

| Skill | 用途 |
|-------|------|
| `/session-recap` | 摘要 commit、指標、時間 |
| `/daily-cost` | 今天的花費和 token |
| `/standup` | 多 session 工作日誌 |
| `/coaching` | AI 使用建議 |
| `/insights` | 行為模式分析 |
| `/project-overview` | 跨 session 專案摘要 |
| `/search` | 自然語言搜尋 |
| `/export-data` | CSV/JSON 匯出 |
| `/team-status` | 團隊活動概覽 |

## 技術架構

claude-view 用 Rust 寫後端，React 寫前端。

| 層 | 技術 |
|----|------|
| Web 框架 | Axum |
| 資料庫 | SQLite |
| 搜尋引擎 | Tantivy |
| 檔案 I/O | Memory-mapped I/O |
| 即時通訊 | SSE + WebSocket |
| 前端 | React + Vite + Dockview |
| Monorepo | Turbo + Bun |

效能數據（M 系列 Mac，1,493 sessions）：

| 指標 | claude-view | 一般 Electron Dashboard |
|------|-------------|------------------------|
| 下載大小 | ~10 MB | 150-300 MB |
| 磁碟佔用 | ~27 MB | 300-500 MB |
| 啟動時間 | <500 ms | 3-8 s |
| 記憶體 | ~50 MB | 300-800 MB |
| 索引 1,500 sessions | <1 s | N/A |

Rust 的 mmap + SIMD 加速 JSONL 解析，從 parse 到 response 全程 zero-copy。跟 Electron 做的 dashboard 比，體積差 10 倍以上，記憶體差 6 倍。

## 安裝

三種方式：

```bash
# 推薦
curl -fsSL https://get.claudeview.ai/install.sh | sh

# 或用 npx
npx claude-view

# 裝 plugin（自動跟 Claude Code 一起啟動）
claude plugin add @claude-view/plugin
```

唯一的前提是你已經裝了 Claude Code。開了之後 dashboard 在 `http://localhost:47892`。

所有資料存在本地，零 telemetry，不需要帳號。

## 跟其他工具比

同類的工具不少，但定位不太一樣：

- **ccusage**：CLI 工具，只看 token 統計，沒有 GUI，沒有即時監控
- **opcode**：Tauri 做的 GUI，有 session 管理但沒有多 session 對話瀏覽和搜尋
- **CodePilot**：Electron 做的 chat UI，是用來「跟」Claude Code 對話的，不是監控

claude-view 的定位是監控和分析。如果你已經習慣在 terminal 跑 Claude Code，它不會改變你的工作流，只是幫你看到更多資訊。

之前介紹的 [AionUi](/2026/04/07/aionui-ai-cowork-app/) 是把多個 agent 統一到一個 GUI 裡跑，claude-view 則是讓你繼續在 terminal 跑，但多一個 dashboard 來追蹤。兩個可以同時用。

## 誰適合用

如果你用 Claude Code 的頻率不高，偶爾跑一下，其實不需要這個工具。

但如果你每天都在用，同時開好幾個 session，想知道錢花去哪裡、哪個模型 CP 值最高、prompt 品質有沒有進步，claude-view 給的資訊密度是 terminal 做不到的。

## 參考資源

- [claude-view GitHub Repository](https://github.com/tombelieber/claude-view)
- [claude-view 官方網站](https://claudeview.ai)
- [Tantivy 全文搜尋引擎](https://github.com/quickwit-oss/tantivy)
- [Axum Web Framework](https://github.com/tokio-rs/axum)
