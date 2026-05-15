---
title: 'Free Claude Code：把 Claude Code 的 API 請求轉到其他免費服務'
description: '介紹 free-claude-code 這個開源 proxy，讓你可以繼續用 Claude Code 的 CLI、VS Code、JetBrains 介面，但後端換成 NVIDIA NIM、OpenRouter、DeepSeek、本機模型等免費或便宜的替代方案。'
slug: free-claude-code-proxy
date: '2026-05-15T10:00:00+08:00'
image: featured.png
categories:
- DevTools
tags:
- claude-code
- AI
- proxy
- open-source
draft: false
---

Claude Code 的使用體驗很好，但費用很高。[free-claude-code](https://github.com/Alishahryar1/free-claude-code) 這個開源專案讓你繼續用 Claude Code 的 CLI、VS Code、JetBrains 等客戶端，但把背後的 API 請求轉到其他服務——包括有免費額度的雲端 API，以及跑在自己機器上的本機模型。

## 它怎麼運作

Claude Code 的所有操作都是透過 Anthropic API 進行的。這個 proxy 架在客戶端和 API 之間：

```
Claude Code CLI / VS Code / JetBrains
           ↓
    free-claude-code proxy
           ↓
  NVIDIA NIM / OpenRouter / Ollama / ...
```

Proxy 對外暴露和 Anthropic 相容的端點（`/v1/messages`、`/v1/models` 等），接到請求後翻譯成各家 provider 的格式，回應再翻譯回 Anthropic 格式。對 Claude Code 客戶端來說，它看到的就是一個普通的 Anthropic API。

## 支援的 Provider

目前支援 10 個後端：

| Provider | 說明 |
|----------|------|
| **NVIDIA NIM** | build.nvidia.com 有免費額度，包含 Kimi K2.5、GLM 4.7 等模型 |
| **OpenRouter** | 聚合多家模型，有些模型提供免費 tier |
| **DeepSeek** | deepseek-chat，價格遠低於 Opus |
| **Kimi** | Moonshot 的 platform.moonshot.ai |
| **Wafer** | wafer.ai，DeepSeek-V4-Pro、GLM-5.1 |
| **Z.ai** | GLM-5.1、GLM-5-turbo |
| **OpenCode Zen** | opencode.ai，包含 deepseek-v4-flash-free |
| **LM Studio** | 本機 server，預設 localhost:1234 |
| **llama.cpp** | 本機 server，預設 localhost:8080 |
| **Ollama** | 本機容器，預設 localhost:11434 |

## 分 Tier 路由

Claude Code 的請求分成三個 tier：Opus（主 agent）、Sonnet、Haiku（sub-agent）。Proxy 可以針對每個 tier 分別設定不同的 model：

```bash
MODEL_OPUS=openrouter/qwen/qwen3-235b-a22b:free
MODEL_SONNET=deepseek/deepseek-chat
MODEL_HAIKU=ollama/llama3.1
```

Opus 的請求（通常最貴）可以導向免費模型，Haiku 的請求直接跑本機。

## 安裝與啟動

需要先裝好 Claude Code CLI 和 Python uv：

```bash
# 安裝 proxy
uv tool install --force git+https://github.com/Alishahryar1/free-claude-code.git

# 啟動 proxy server
fcc-server
```

啟動後在瀏覽器打開顯示的 localhost 地址，進入 Admin UI 設定各家 provider 的 API key。

之後用 `fcc-claude` 取代原本的 `claude` 指令啟動 Claude Code，proxy 會自動注入必要的環境變數。

## 客戶端整合

### VS Code

在 `settings.json` 加入：

```json
{
  "claude.env": {
    "ANTHROPIC_BASE_URL": "http://localhost:8082",
    "ANTHROPIC_AUTH_TOKEN": "freecc",
    "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY": "1"
  }
}
```

### JetBrains

修改 ACP 設定檔（路徑因平台不同），加入相同的三個環境變數。

設定好之後，IDE 的 model picker 也能正常列出 proxy 支援的模型（透過 `/v1/models` 端點）。

## 額外功能

**Discord / Telegram bot**：把 Claude Code session 包進 bot，可以遠端發指令、看串流輸出、管理對話分支。需要自備 bot token 和 channel ID。

**語音輸入**：接 Whisper 或 NVIDIA NIM 的語音轉文字，透過 messaging platform 直接說話給 agent。

## 實際限制

這個做法有幾個明顯的限制需要考慮：

**模型能力差距**：Claude Code 的很多能力（長上下文、工具呼叫準確度、複雜推理）是 Claude 系列模型的強項。換成其他模型，這些能力可能打折。尤其是工具呼叫不穩定的模型，會讓 Claude Code 的 agentic 流程頻繁出錯。

**免費 tier 的限額**：NVIDIA NIM、OpenRouter 的免費模型通常有 RPM/TPD 限制，密集使用會碰到 rate limit。

**本機模型的資源需求**：跑 llama.cpp 或 Ollama 需要足夠的 VRAM/RAM，效能和雲端 API 有明顯差距。

## 適合什麼情境

- 想試用 Claude Code 但不想付 Anthropic 費用
- 主要做簡單任務（讀檔、改格式、小功能），不需要頂級模型
- 有自己的 GPU，想把 API 費用換成電費
- 想比較不同模型在 Claude Code 介面下的表現

如果你的工作依賴 Claude 的長上下文或複雜 agentic 任務，換模型後很可能踩到工具呼叫失敗或推理錯誤的問題。這種情況下，分析費用結構並善用 cache 可能比換模型更實際——可以參考系列的[前幾篇]({{< ref "/post/claude-code-model-cost-efficiency" >}})。

## 參考資源

- [free-claude-code GitHub](https://github.com/Alishahryar1/free-claude-code)
- [NVIDIA NIM 免費 API](https://build.nvidia.com/)
- [OpenRouter 免費模型列表](https://openrouter.ai/models?q=free)
