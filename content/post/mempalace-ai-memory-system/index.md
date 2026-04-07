---
title: 'MemPalace：170 tokens 回憶所有對話，AI Agent 的長期記憶系統'
description: 'MemPalace 是本地端的 AI 記憶系統，用記憶宮殿架構組織對話歷史，AAAK 壓縮格式達 30 倍壓縮率，啟動只需 170 tokens，LongMemEval 準確率 96.6%，完全離線。'
slug: mempalace-ai-memory-system
date: '2026-04-08T01:41:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- ai-agent
- claude-code
- MCP
- Python
draft: false
---

跟 AI 聊了半年，累計 1,950 萬 tokens 的對話。換個 session 之後，它什麼都不記得。你可以把重要的東西丟進 CLAUDE.md，但那個檔案很快就會膨脹到幾千行，每次啟動都要吃掉大量 context window。

[MemPalace](https://github.com/milla-jovovich/mempalace) 換了一個思路：不要把所有記憶塞進 prompt，而是建一個有結構的記憶庫，AI 需要的時候再去查。啟動時只載入 170 tokens，搜尋準確率 96.6%，完全離線，不需要任何 API call。

## 記憶宮殿架構

MemPalace 用古希臘記憶術的比喻來組織資料：

- **Wing**（翼）：專案、人物、主題。一個 wing 對應一個大分類
- **Room**（房間）：wing 裡的子主題，例如 auth、billing、deploy
- **Hall**（走廊）：跨 wing 共用的記憶類型
  - `hall_facts` — 已確定的決策
  - `hall_events` — session 和里程碑
  - `hall_discoveries` — 突破性發現
  - `hall_preferences` — 習慣和偏好
  - `hall_advice` — 建議
- **Closet**（衣櫃）：壓縮過的摘要，指向原始內容
- **Drawer**（抽屜）：原始檔案，一字不改保留
- **Tunnel**（隧道）：跨 wing 的連結，同一個 room 出現在不同 wing 時自動建立

這個結構本身就能提升搜尋準確率。實測數據：

| 搜尋範圍 | R@10 | 提升 |
|---------|------|------|
| 搜尋所有 closets | 60.9% | — |
| 限定 wing | 73.1% | +12% |
| wing + hall | 84.8% | +24% |
| wing + room | 94.8% | +34% |

光靠結構，不靠任何花式演算法，就多了 34% 的準確率。

## AAAK 壓縮格式

這是 MemPalace 最有意思的設計。AAAK 是一種 AI 可讀的速記格式，壓縮率 30 倍。

原文（約 1,000 tokens）：

```
Priya manages Driftwood team: Kai (backend, 3 years), Soren (frontend),
Maya (infrastructure), Leo (junior, started last month). Building SaaS
analytics platform. Current sprint: auth migration to Clerk. Kai
recommended Clerk over Auth0 based on pricing and DX.
```

AAAK 格式（約 120 tokens）：

```
TEAM: PRI(lead) | KAI(backend,3yr) SOR(frontend) MAY(infra) LEO(junior,new)
PROJ: DRIFTWOOD(saas.analytics) | SPRINT: auth.migration→clerk
DECISION: KAI.rec:clerk>auth0(pricing+dx) | ★★★★
```

重點是：這不需要 decoder。任何 LLM 都能直接讀懂——Claude、GPT、Llama、Mistral 都行。它本質上就是結構化的英文縮寫，不是二進位編碼。

## 記憶分層載入

MemPalace 把記憶分成四層，不是一次全載：

| 層 | 內容 | 大小 | 載入時機 |
|----|------|------|---------|
| L0 | 身份——這個 AI 是誰 | ~50 tokens | 永遠載入 |
| L1 | 關鍵事實——團隊、專案、偏好 | ~120 tokens (AAAK) | 永遠載入 |
| L2 | Room 回憶——最近的 session | 按需 | 話題浮現時 |
| L3 | 深度搜尋——語意搜尋所有 closets | 按需 | 明確要求時 |

啟動時只載 L0 + L1，共約 170 tokens。跟直接把半年的對話貼進去比：

| 做法 | 載入的 tokens | 年費 |
|------|-------------|------|
| 全部貼進去 | 1,950 萬——不可能 | 不可能 |
| LLM 摘要 | ~65 萬 | ~$507 |
| **MemPalace wake-up** | **~170** | **~$0.70** |
| **MemPalace + 5 次搜尋** | **~13,500** | **~$10** |

## 知識圖譜：事實有時效性

MemPalace 內建一個時序知識圖譜，存在本地 SQLite：

```python
kg.add_triple("Kai", "works_on", "Orion", valid_from="2025-06-01")
kg.add_triple("Maya", "assigned_to", "auth-migration", valid_from="2026-01-15")

# Kai 離開 Orion 專案
kg.invalidate("Kai", "works_on", "Orion", ended="2026-03-01")

# 查詢當前狀態
kg.query_entity("Kai")
# → [Kai → works_on → Orion (ended), Kai → recommended → Clerk]

# 查詢歷史狀態
kg.query_entity("Maya", as_of="2026-01-20")
# → [Maya → assigned_to → auth-migration (active)]
```

每個事實有效期窗口。失效的事實不會被刪除，而是標記結束日期。這解決了 CLAUDE.md 最常見的問題：過期資訊沒人清，AI 拿到的是舊的。

知識圖譜還能偵測矛盾——任務指派給錯的人、年資記錄不一致、sprint 結束日期過期。

## 跟 Claude Code 整合

### MCP Server

```bash
claude mcp add mempalace -- python -m mempalace.mcp_server
```

裝好之後 Claude Code 自動發現 19 個 MCP tools，涵蓋搜尋、新增、知識圖譜查詢、agent 日記等。

### Auto-Save Hooks

在 Claude Code 的 hooks 設定裡加兩個 hook：

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "",
      "hooks": [{"type": "command",
        "command": "/path/to/mempalace/hooks/mempal_save_hook.sh"}]
    }],
    "PreCompact": [{
      "matcher": "",
      "hooks": [{"type": "command",
        "command": "/path/to/mempalace/hooks/mempal_precompact_hook.sh"}]
    }]
  }
}
```

- **Save hook**：每 15 條訊息觸發一次，自動擷取主題、決策、程式碼變更
- **PreCompact hook**：context window 壓縮前觸發，緊急儲存當前記憶

這樣就不用手動告訴 AI「把這個記住」，它會自己存。

之前介紹的 [claude-view](/2026/04/07/claude-view-mission-control/) 是從外部監控 Claude Code 的 session 和成本。MemPalace 則是從內部擴展 AI 的記憶能力。兩者互補——claude-view 讓你看到 AI 做了什麼，MemPalace 讓 AI 記住它做過什麼。

## Specialist Agents

可以建立專門的 agent，各自維護獨立的記憶：

```
~/.mempalace/agents/
 ├── reviewer.json    # code review 模式、bug 記錄
 ├── architect.json   # 架構決策、trade-off
 └── ops.json         # 部署、事件、基礎設施
```

每個 agent 有自己的 wing 和 AAAK 日記，跨 session 累積專業知識：

```python
# agent 寫入發現
mempalace_diary_write("reviewer",
  "PR#42|auth.bypass.found|missing.middleware.check|pattern:3rd.quarter|★★★★")

# agent 讀取歷史
mempalace_diary_read("reviewer", last_n=10)
```

不用在 CLAUDE.md 裡塞一堆 agent 描述，一行就好：「You have MemPalace agents. Run mempalace_list_agents to see them.」

## 安裝和使用

```bash
pip install mempalace

# 初始化
mempalace init ~/projects/myapp

# 匯入不同來源的資料
mempalace mine ~/projects/myapp              # 專案程式碼
mempalace mine ~/chats/ --mode convos        # 對話記錄
mempalace mine ~/chats/ --mode convos --extract general  # 分類匯入

# 搜尋
mempalace search "why did we switch to GraphQL"

# 生成啟動 context
mempalace wake-up > context.txt
```

支援匯入 Claude 對話、ChatGPT 匯出、Slack 匯出。大檔案可以先拆分：

```bash
mempalace split ~/chats/ --dry-run   # 預覽
mempalace split ~/chats/             # 拆成單一 session
```

## 跟 CLAUDE.md 比

CLAUDE.md 是平面文字檔，所有資訊混在一起，沒有時效性，每次啟動全部載入。MemPalace 是結構化記憶庫，有分層載入、時序知識圖譜、語意搜尋。

不過 MemPalace 也不是完美的。它需要額外安裝 Python 環境，設定 MCP server 和 hooks。如果你的需求只是記幾條 coding convention，CLAUDE.md 就夠了。MemPalace 的價值在長期、大量、跨專案的記憶管理。

## 參考資源

- [MemPalace GitHub Repository](https://github.com/milla-jovovich/mempalace)
- [AAAK 壓縮格式規範](https://github.com/milla-jovovich/mempalace#aaak-compression)
- [LongMemEval 基準測試](https://github.com/milla-jovovich/mempalace#benchmarks)
- [Model Context Protocol 規範](https://modelcontextprotocol.io/)
