---
title: 'JetBrains Air：讓多個 AI Agent 同時幫你寫程式的 Agentic IDE'
description: '介紹 JetBrains Air 這個 agentic 開發環境，說明它如何讓 Claude、Codex、Gemini、Junie 四個 agent 並行處理任務，以及 Local / Git Worktree / Docker 三種執行環境的差異。'
slug: jetbrains-air-agentic-ide
date: '2026-05-06T10:00:00+08:00'
image: featured.png
categories:
- DevTools
tags:
- AI
- IDE
- JetBrains
draft: false
---

你手上有一個 bug 要修、一組測試要補、一段程式要重構。以前的做法是一個一個來，或者開多個 terminal 自己管。現在 JetBrains 做了一個工具叫 [Air](https://air.dev/)，讓你把這些任務分別丟給不同的 AI agent，它們同時跑，互不干擾。

Air 不是在現有 IDE 上加一個 AI 面板，而是一個全新的開發環境——專門為「委派任務給 agent」這件事設計的。

## 支援的 Agent

Air 內建四個 agent：

| Agent | 提供者 | 特色 |
|-------|--------|------|
| Claude Agent | Anthropic | 長上下文理解、程式碼生成 |
| OpenAI Codex | OpenAI | 程式碼專精模型 |
| Gemini CLI | Google | 支援 thinking mode 調整推理深度 |
| Junie | JetBrains | JetBrains 自家 agent，用 JetBrains AI 訂閱即可使用 |

一個任務啟動後可以換 model，但不能換 provider。例如用 Claude 開始的任務可以從 Sonnet 換到 Opus，但不能中途換成 Codex。

Air 也支援 Agent Client Protocol (ACP)，未來可以接更多第三方 agent。

## 三種執行環境

每個任務可以選擇在哪裡跑：

### Local Workspace

直接在你的工作目錄跑。啟動最快，不需要設定，但 agent 的修改會直接改到你的檔案。

適合：快速迭代、不怕改壞的情況。

### Git Worktree

在同一個 repo 開一個獨立的 working copy，改動隔離在另一個 branch。

設定檔放在 `.air/worktree.json`：

```json
{
  "environment": [
    {"type": "env", "key": "NODE_ENV", "value": "test"},
    {"type": "envFile", "path": "~/.env.test"}
  ],
  "setup": {
    "macos": ["npm install"]
  }
}
```

適合：多個任務同時跑但會改到相同檔案時，用 worktree 避免衝突。

### Docker

在 container 裡跑，完全隔離。需要 Docker Desktop。

設定檔放在 `.air/docker.json`：

```json
{
  "image": "ubuntu:24.04",
  "environment": [
    {"type": "env", "key": "TEST", "value": "12345"}
  ],
  "setup": ["apt-get update", "apt-get install -y jq"],
  "user": {"user": "node", "group": "node"}
}
```

自訂 image 必須包含 Git 和 `/bin/sh`。

適合：需要完全隔離、不想影響本機環境的場景。

### 比較

| | Local | Worktree | Docker |
|--|-------|----------|--------|
| 啟動速度 | 最快 | 快 | 較慢 |
| 隔離程度 | 無 | 檔案/branch | 完全隔離 |
| 需要設定 | 不用 | 可選 | 可選 |
| 依賴本機環境 | 是 | 是 | 否 |

## 任務的生命週期

一個任務從建立到完成會經過這些狀態：

1. **定義任務**：按 `⌘+\` 開新任務，用對話方式描述你要做什麼
2. **加入 context**：可以附加檔案、資料夾、Git commit、symbol、圖片、MCP server
3. **選擇權限模式**：
   - Ask Permission：每次改檔案或跑指令都問你
   - Auto-Edit：自動接受檔案修改
   - Plan：只分析不改動
   - Full Access：全部放行
4. **執行**：agent 開始工作
5. **等待輸入**：agent 需要你做決定時會暫停並通知
6. **完成**：檢視改動、commit、push

用 `⌘+1` 可以看所有任務的狀態，在多個任務之間切換。

## 多任務並行

這是 Air 的核心賣點。你可以同時跑好幾個任務：

- 一個 agent 在修 bug
- 另一個在補測試
- 第三個在重構某個 module

每個任務獨立運行，有自己的 agent session。當某個任務需要你介入時會跳通知，你處理完再回去做別的事。

如果多個任務會改到相同檔案，用 Git Worktree 或 Docker 隔離就不會互相踩。

## MCP Server 整合

Air 支援 Model Context Protocol，可以掛額外的工具給 agent 用：

1. 按 `⌘+,` 打開設定
2. 到 AI | MCP Servers
3. 點 Add Global MCP Server
4. 貼入 JSON 格式的 server 設定

這讓 agent 能存取資料庫、呼叫 API、操作外部系統。

## Web Preview

跑 web 專案時，Air 內建預覽功能。dev server 啟動後自動顯示預覽視窗，可以在 preview 和 source 之間切換，支援 responsive 模式。

## 定價與可用性

- **平台**：目前只有 macOS，Windows 和 Linux 預計 2026 年內支援
- **免費使用**：Air 本身免費下載
- **AI 費用**：
  - JetBrains AI Pro 訂閱者直接用所有 agent
  - 也可以自帶 API key（Anthropic、OpenAI、Google）
  - 如果兩者都設了，優先用你自己的 key

## 實際使用心得（來自 JetBrains 開發者）

JetBrains 自家開發者 Valerii Tepliakov 分享了他的使用經驗：

- 一開始持懷疑態度，對 AI 生成的程式碼品質有顧慮
- 從小任務開始試，搭配 IntelliJ IDEA 一起用
- 逐漸擴大範圍，開始同時委派多個任務
- 最後 Air 變成主力開發工具，IntelliJ 只剩 debug 和特殊操作時才用

他提到一個關鍵限制：**agent 不擅長架構設計**。基礎架構和設計決策還是要人先做好，再把實作細節委派出去。

## 跟 Claude Code / Cursor 的差異

Air 的定位不太一樣：

- **Claude Code**：單一 agent 在 terminal 裡跑，一次一個任務
- **Cursor**：在 IDE 裡嵌入 AI，augment 你的編輯體驗
- **Air**：多 agent 並行的任務管理器，你是 manager，agent 是 worker

Air 不取代你的 IDE。它處理 agent 的工作流，你照樣用 IntelliJ / VS Code 做精細編輯和 debug。

## 適合什麼場景

- 專案夠大，同時有多個獨立任務可以並行
- 你願意花時間審 code 而不是自己寫
- 需要在不同 agent 之間切換比較（例如同一個任務分別用 Claude 和 Codex 跑看哪個結果好）
- 團隊有明確的 task 分解習慣

如果你的工作方式是「一次專注一件事、邊寫邊想」，Air 的多任務架構可能不是你需要的。

## 參考資源

- [Air 官網](https://air.dev/)
- [JetBrains Air Documentation](https://www.jetbrains.com/help/air/)
- [Air Launches as Public Preview — The Air Blog](https://blog.jetbrains.com/air/2026/03/air-launches-as-public-preview-a-new-wave-of-dev-tooling-built-on-26-years-of-experience/)
- [My Journey to Agent-First Development With Air](https://blog.jetbrains.com/air/2026/04/my-journey-to-agent-first-development-with-air/)
