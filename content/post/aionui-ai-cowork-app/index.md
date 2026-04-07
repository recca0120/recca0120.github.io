---
title: 'AionUi：一個介面管 12 種 AI Agent，免費開源的 Cowork 桌面應用'
description: 'AionUi 是免費開源的 AI Cowork 桌面應用，用 Electron + React 打造，可在同一介面跑 Claude Code、Codex、Qwen Code 等 12+ 種 agent，支援 20+ 模型平台和排程任務。'
slug: aionui-ai-cowork-app
date: '2026-04-07T11:03:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- ai-agent
- electron
- claude-code
- MCP
draft: false
---

手上裝了 Claude Code，又裝了 Codex，偶爾還會切 Qwen Code 跑中文任務。每個工具各開一個 terminal，切來切去，MCP 設定各自一份，對話記錄散落各處。

[AionUi](https://github.com/iOfficeAI/AionUi) 想解決的就是這個問題：一個桌面應用，把所有 AI agent 收進同一個介面。免費、開源、Apache 2.0 授權。

## 它做了什麼

AionUi 是用 Electron + React 做的跨平台桌面應用，支援 macOS、Windows、Linux。核心功能是統一管理多種 AI coding agent。

### 支援的 Agent

AionUi 會自動偵測你機器上已安裝的 CLI 工具，目前支援：

- Claude Code、Codex、Qwen Code、Goose AI、OpenClaw、Augment Code
- iFlow CLI、CodeBuddy、Kimi CLI、OpenCode、Factory Droid、GitHub Copilot

總共 12 種以上。你不需要額外設定，裝好 CLI 就能在 AionUi 裡面用。沒裝任何 CLI 也沒關係，AionUi 內建了自己的 agent，支援 Google 登入或 API key 認證，開箱即用。

### 20+ 模型平台

模型選擇很寬：

- **主流平台**：Gemini、Claude、OpenAI
- **雲端**：AWS Bedrock
- **中文平台**：通義千問（Dashscope）、智譜、Moonshot（Kimi）、百度千帆、騰訊混元、ModelScope
- **本地模型**：Ollama、LM Studio

如果你在中國大陸，不方便用 OpenAI 或 Claude 的 API，直接切到通義或智譜就好。如果想完全離線，跑 Ollama 本地模型也行。

### MCP 設定一次同步全部

這是我覺得最實用的設計。在 AionUi 裡設定一次 MCP（Model Context Protocol）工具，所有 agent 自動同步。不用每個 agent 各設一份 `mcp.json`，改一個地方全部生效。

## 內建 12 個專業助手

AionUi 不只是 agent 的啟動器，它還預裝了 12 個專業助手：

| 助手 | 用途 |
|------|------|
| Cowork | 自動任務執行 |
| PPTX Generator | 簡報生成 |
| PDF to PPT | 格式轉換 |
| 3D Game | 單檔遊戲原型 |
| UI/UX Pro Max | 57 種樣式、95 色盤 |
| Beautiful Mermaid | 流程圖、序列圖 |
| Planning with Files | 檔案型專案規劃 |

其中 Office 相關的功能（PPT、Word、Excel）底層用 OfficeCLI 驅動，生成的是可編輯的 `.pptx`、`.docx`、`.xlsx`，不是 PDF 截圖。PPT 還支援 Morph 動畫過場。

## 排程任務：24/7 自動跑

這個功能比較少見。你可以用自然語言設定排程任務，例如「每天早上 9 點整理昨天的 Git commit log」，AionUi 會轉成 cron 表達式自動執行。

每個排程任務綁定一個對話，維持上下文。跑完之後結果直接送回對話視窗，也可以推到 Telegram、飛書、釘釘。

## 預覽面板

AionUi 內建了檔案預覽，支援的格式很多：

- **文件**：PDF、Word、Excel、PowerPoint
- **程式碼**：30+ 語言，語法高亮
- **圖片**：PNG、JPG、SVG、WebP 等
- **標記語言**：Markdown、HTML，支援即時編輯

還能追蹤檔案變更、查看 Git 版本歷史、一鍵復原。

## WebUI 遠端存取

桌面應用不一定要坐在電腦前面用。AionUi 可以開一個 WebUI，用 QR code 或密碼登入，從手機或其他電腦操作。支援 LAN 和跨網路存取。

搭配 Telegram、飛書、釘釘的 bot 整合，可以在手機上對 AI agent 下指令，結果推播回聊天群組。

## 技術棧

| 層 | 技術 |
|----|------|
| 框架 | Electron |
| UI | React |
| CSS | UnoCSS |
| 建置 | Vite |
| 測試 | Vitest + Playwright |
| 資料庫 | SQLite（本地） |
| 語言 | TypeScript |

所有資料存在本地 SQLite，不會上傳到任何伺服器。想用本地模型（Ollama）的話，整個流程可以完全離線。

## 安裝

從 [GitHub Releases](https://github.com/iOfficeAI/AionUi/releases) 下載對應平台的安裝檔。macOS 也支援 Homebrew。

裝好之後，開啟應用就能用。如果你機器上已經有 Claude Code 或 Codex，AionUi 會自動偵測到。沒有的話，用內建 agent 搭配 API key 或 Google 登入也可以直接開始。

## 跟單獨用 Claude Code 比

Claude Code 本身很強，但它就是一個 terminal 工具。AionUi 的定位不是取代它，而是把它跟其他 agent 放在同一個地方管理。

幾個明顯的差異：

- **多 agent**：Claude Code 只能跑 Claude，AionUi 可以同時跑多種 agent
- **GUI**：有完整的桌面介面，檔案預覽、Office 生成、圖片處理都在裡面
- **排程**：Claude Code 沒有內建排程，AionUi 可以 24/7 自動執行任務
- **價格**：Claude Code 需要 API 費用或 $100/月訂閱，AionUi 本身免費
- **模型選擇**：不綁定單一模型提供商，20+ 平台隨切

如果你對 AI Agent 工具生態有興趣，之前寫過一篇 [CLI-Anything：讓 AI Agent 操作任何軟體的通用橋樑](/2026/03/15/cli-anything-agent-native-cli/)，是從另一個角度切入——把既有軟體包成 CLI 讓 agent 呼叫。AionUi 則是反過來，從 agent 管理的角度出發。

## 目前的狀態

AionUi 還在快速迭代，GitHub 上有 4,400+ 次 commit。社群主要在 Discord（英文）和微信群（中文）。

要注意的是，雖然星數不少，但這類 Electron 應用的記憶體佔用通常不低。如果你只用一種 agent，開個 terminal 跑 CLI 可能更輕量。AionUi 的價值在於你真的同時需要多種 agent、想要 GUI 管理、或者需要排程和 Office 生成這些額外功能的時候。

## 參考資源

- [AionUi GitHub Repository](https://github.com/iOfficeAI/AionUi)
- [AionUi 官方網站](https://www.aionui.com)
- [Model Context Protocol 規範](https://modelcontextprotocol.io/)
- [Electron 官方文件](https://www.electronjs.org/)
