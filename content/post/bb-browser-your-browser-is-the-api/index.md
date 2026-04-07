---
title: 'bb-browser：不寫爬蟲、不用 API key，你的瀏覽器就是 API'
description: 'bb-browser 直接在真實瀏覽器標籤裡跑程式碼，用你已登入的 cookie 發 fetch。36 個平台、103 條命令，還能當 MCP server 讓 Claude Code 存取整個網際網路。'
slug: bb-browser-your-browser-is-the-api
date: '2026-04-07T11:34:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- ai-agent
- MCP
- browser-automation
- cli
draft: false
---

想拿 Twitter 的搜尋結果，傳統做法有三條路：申請 API key（限制一堆）、寫爬蟲（被封 IP）、用 Playwright 開 headless browser（被偵測到不是真人）。

[bb-browser](https://github.com/epiral/bb-browser) 走第四條路：直接用你已經開著的 Chrome。你登入過 Twitter，cookie 已經在那邊了，bb-browser 就在那個標籤裡跑 `fetch()`，從網站的角度看，這就是你本人在瀏覽。

## 跟爬蟲和 Playwright 差在哪

先把差異講清楚。

| | bb-browser | Playwright / Selenium | 爬蟲（requests、Scrapy） |
|---|---|---|---|
| 瀏覽器 | 你真實的 Chrome | 隔離的無頭瀏覽器 | 沒有瀏覽器 |
| 登入狀態 | 已經登入，直接用 | 要重新登入或注入 cookie | 要手動帶 cookie |
| 反爬偵測 | 隱形（就是真人） | 容易被偵測 | 容易被封 |
| 指紋 | 你的真實指紋 | 無頭瀏覽器指紋 | 沒有指紋 |

關鍵在於 bb-browser 不啟動新的瀏覽器實例。它透過 CDP（Chrome DevTools Protocol）連到你正在用的 Chrome，在標籤裡注入程式碼。網站看到的 User-Agent、cookie、TLS 指紋全部都是真的，因為本來就是你的瀏覽器。

## 架構

```
AI Agent (Claude Code, Codex, Cursor)
         │ CLI 或 MCP (stdio)
         ▼
bb-browser CLI ──HTTP──▶ Daemon ──CDP WebSocket──▶ 真實瀏覽器
                            │
                     ┌──────┴──────┐
                     │ 每標籤事件快取│
                     │ (網路、控制台)│
                     └─────────────┘
```

bb-browser 會起一個 daemon（預設 `127.0.0.1:19824`），透過 CDP WebSocket 跟 Chrome 溝通。CLI 指令送到 daemon，daemon 在對應的標籤裡執行。

## 安裝和基本用法

```bash
npm install -g bb-browser
```

拉取社群適配器：

```bash
bb-browser site update
```

跑一條命令試試：

```bash
bb-browser site zhihu/hot
```

這會打開知乎的標籤（如果你已經登入），用你的 cookie 去撈熱門問題列表。

### 結構化輸出

所有命令都支援 `--json` 和 `--jq`：

```bash
bb-browser site xueqiu/hot-stock 5 --jq '.items[] | {name, changePercent}'
# {"name":"云天化","changePercent":"2.08%"}
# {"name":"东芯股份","changePercent":"-7.60%"}
```

### 瀏覽器操作

除了跑適配器，也能直接操作瀏覽器：

```bash
bb-browser open https://example.com     # 開啟 URL
bb-browser snapshot -i                  # 無障礙樹快照
bb-browser click @3                     # 點擊元素
bb-browser fill @5 "hello"             # 填入文字
bb-browser eval "document.title"       # 執行 JavaScript
bb-browser fetch URL --json            # 帶認證的 fetch
bb-browser screenshot                  # 截圖
```

## 36 個平台、103 條命令

bb-browser 的適配器涵蓋的平台很廣：

- **搜尋**：Google、百度、Bing、DuckDuckGo
- **社交**：Twitter/X、Reddit、微博、小紅書、LinkedIn
- **開發**：GitHub、StackOverflow、Hacker News、npm、PyPI、arXiv、V2EX、Dev.to
- **新聞**：BBC、Reuters、36kr、今日頭條
- **影片**：YouTube、Bilibili
- **金融**：雪球、Yahoo Finance、東方財富
- **知識**：Wikipedia、知乎

每個適配器就是一個 JavaScript 檔案，社群驅動。要加新平台，寫一個 JS 檔丟到 `bb-sites` repo 就好。

## 適配器的三種複雜度

不是每個網站都一樣好搞。bb-browser 把適配器分成三層：

| 層級 | 做法 | 範例 | 開發時間 |
|------|------|------|----------|
| Level 1 | 直接用 cookie 發 fetch | Reddit、GitHub | ~1 分鐘 |
| Level 2 | 需要抓 Bearer token + CSRF | Twitter、知乎 | ~3 分鐘 |
| Level 3 | 注入 Webpack 模組或讀 Pinia store | Twitter 搜尋 | ~10 分鐘 |

Level 1 最簡單，有些網站的 API 只要帶 cookie 就能用。Level 3 最複雜，要反向工程前端打包的模組，從 Webpack 的 `__webpack_require__` 或 Vue 的 Pinia store 裡撈資料。

## 當 MCP Server 給 AI Agent 用

這是 bb-browser 最有意思的用法。設定成 MCP server 之後，Claude Code 或 Cursor 就能直接存取你的瀏覽器能看到的所有網站。

```json
{
  "mcpServers": {
    "bb-browser": {
      "command": "npx",
      "args": ["-y", "bb-browser", "--mcp"]
    }
  }
}
```

設好之後，你可以跟 Claude Code 說「幫我查一下 arXiv 上最近的 RAG 論文」，它就會透過 bb-browser 去 arXiv 搜尋，用你的真實瀏覽器。

沒有 bb-browser 的 AI agent 只能操作檔案和終端。有了 bb-browser，它能存取整個網際網路——用你的身份。

之前寫的 [CLI-Anything](/2026/03/15/cli-anything-agent-native-cli/) 是把桌面軟體包成 CLI 給 agent 呼叫，[AionUi](/2026/04/07/aionui-ai-cowork-app/) 是統一管理多個 agent 的介面。bb-browser 則是從另一個角度擴展 agent 能力：讓它直接用你的瀏覽器上網。

## 注意事項

幾件事要想清楚再用：

- **用的是你的真實帳號**。bb-browser 代你操作，如果操作頻率太高，帳號可能被平台標記。它不是隱形的爬蟲，它就是你
- **安全性**。daemon 預設只綁 localhost，但如果開到 `0.0.0.0`，任何能連到你機器的人都能操作你的瀏覽器。搭配 Tailscale 或 ZeroTier 用比較安全
- **適配器品質不一**。社群驅動的好處是覆蓋廣，壞處是有些適配器可能跟不上網站改版
- **macOS 用戶**注意 IPv6 問題，daemon 要加 `--host 127.0.0.1`

## 適合什麼場景

bb-browser 不是拿來大規模爬資料的。如果你要爬百萬筆資料，還是用 Scrapy。

它適合的場景是：

- 讓 AI agent 能查網路資料，不需要一個一個申請 API key
- 快速從某個已登入的平台撈結構化資料
- 跨平台研究——一分鐘內同時查 arXiv、Twitter、GitHub、知乎、StackOverflow

一條指令就能完成以前要寫爬蟲才能做的事，而且不會被擋。

## 參考資源

- [bb-browser GitHub Repository](https://github.com/epiral/bb-browser)
- [bb-sites 社群適配器](https://github.com/nicepkg/bb-sites)
- [Chrome DevTools Protocol 文件](https://chromedevtools.github.io/devtools-protocol/)
- [Model Context Protocol 規範](https://modelcontextprotocol.io/)
