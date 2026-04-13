---
title: 'claude-code-cache-fix：抓出並修復 Anthropic 靜默調降的 cache TTL regression'
description: '2026 年 3 月 Anthropic 靜默把 Claude Code cache TTL 從 1h 改回 5m，月成本暴漲 15-53%。社群開發者 cnighswonger 用 ~/.claude/projects JSONL 的 ephemeral_5m / ephemeral_1h 欄位精準抓出 3/6 是轉折日，並做了 npm package 直接修復。'
slug: claude-code-cache-ttl-audit
date: '2026-04-14T02:00:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- claude-code
- prompt-caching
- ai-agent
- npm
draft: true
---

[前一篇](/2026/04/13/claude-code-session-cost-cache-misconception/)講過 Claude Code 的 prompt cache 機制。寫完之後查到一個很有戲的事件：2026 年 3 月 Anthropic **靜默把 Claude Code 主 agent 的預設 cache TTL 從 1 小時改回 5 分鐘**，導致社群實測月成本暴漲 15–53%，Reddit 跟 HN 上一片哀號。

更糟的是 TTL 是 **client 自動決定，沒有用戶設定可調**。Anthropic 員工 Jarred Sumner 公開回應「拒絕加用戶設定」，理由是 sub-agent 本來就該用 5m。

但 [cnighswonger](https://github.com/cnighswonger/claude-code-cache-fix) 這位開發者做了兩件事：用 `~/.claude/projects` 的 JSONL 日誌**精準抓出 3/6 是 regression 轉折日**，然後乾脆做了個 npm package **直接修復這個 regression**。本文就是介紹這個工具。

## 事件回顧

- **2026/02/01**：Anthropic 把 Claude Code 預設 TTL 從 5 分鐘**升級**到 1 小時
- **2026/02/27 ~ 03/08**：靜默改回 5 分鐘
- **2026/03 中下旬**：用戶大量回報 quota 異常，$200/月 Max 用戶說「3 月之前從沒撞過 quota」
- **2026/04/13**：Anthropic 員工 Jarred Sumner 回應，主張 5m 對 one-shot 請求其實更便宜，**拒絕加用戶設定**

社群算出來：互動式長 session 工作流，5m TTL 讓月成本比 1h **多 15–53%**——每次思考停頓、看程式碼、切視窗超過 5 分鐘，回來就是 cache_creation 寫入而不是 cache_read。

## 為什麼 cache 會莫名失效

cnighswonger 在做修復時順手揭露了三個會默默打破 cache 的 client 端 bug：

1. **Attachment block 漂移**：resume session 時，skills、MCP servers、deferred tools、hooks 的 attachment block 會跑到後面的 message，而不是 `messages[0]`。前綴 hash 變了，cache 全失效
2. **cc_version fingerprint 不穩**：版本指紋從 `messages[0]` 含 meta/attachment 內容算出，attachment 一漂移指紋就變
3. **Tool 順序不穩**：tool definitions 在不同輪可能順序不同，前綴一致性破功

這三個都是 client 行為問題，跟 server 端 TTL 改不改沒關係——但合併起來會讓你**主觀感覺「為什麼 resume 後 cache hit rate 突然爆掉」**。

## 用 claude-code-cache-fix 修復

### 安裝

```bash
npm install -g claude-code-cache-fix
```

### 用法（三選一）

**方法 A：用 wrapper script（建議）**

```bash
claude-fixed [任何 claude 參數]
```

**方法 B：alias 取代 claude**

```bash
alias claude='NODE_OPTIONS="--import claude-code-cache-fix" node "$(npm root -g)/@anthropic-ai/claude-code/cli.js"'
```

**方法 C：每次手動加環境變數**

```bash
NODE_OPTIONS="--import claude-code-cache-fix" claude
```

底層原理是 Node.js preload module 攔截 API 請求，在送出前把 attachment block、fingerprint、tool 順序都正規化，恢復前綴一致性。

### 看到 TTL 即時狀態

裝好後，工具會把 quota 狀態寫到 `~/.claude/quota-status.json`，搭配 `quota-statusline.sh` 可以在 Claude Code 的 status line 看到：

- **Q5h%**（5 小時 quota 使用率）+ burn rate
- **Q7d%**（每週 quota 使用率）
- **TTL tier**：健康時顯示 `TTL:1h`，**被 server 降級時顯示紅色 `TTL:5m`**
- 尖峰時段標 `PEAK`（UTC 13:00–19:00 工作日）
- Cache hit rate

對於常用 Claude Code 又怕 quota 莫名爆掉的人，**這個 status line 比任何事後分析都直接**。

### 成本報告

```bash
node tools/cost-report.mjs                    # 今天
node tools/cost-report.mjs --date 2026-04-08  # 指定日期
node tools/cost-report.mjs --since 2h         # 過去 2 小時
node tools/cost-report.mjs --admin-key <key>  # 跟 Admin API 對帳
```

讀的是 `~/.claude/usage.jsonl`（interceptor 寫的，不是 Claude Code 原生 session 日誌）。

## 不想裝 npm 也想看歷史 TTL 分布？

cnighswonger 的工具只看裝了之後的資料。如果你想**回頭審視過去幾個月的 TTL 比例**，他在 issue #46829 用的方法是：直接掃 `~/.claude/projects` 的 JSONL，看每個 assistant message 的 `usage.cache_creation` 物件：

```json
{
  "cache_creation": {
    "ephemeral_5m_input_tokens": 0,
    "ephemeral_1h_input_tokens": 6561
  }
}
```

這兩個欄位是 Anthropic API 直接回傳的，繞過 client 顯示邏輯。

我把這方法縮成一個 60 行 Python，一鍵掃完全部專案：

```python
#!/usr/bin/env python3
"""Audit Claude Code prompt cache TTL across all projects.
Inspired by cnighswonger/claude-code-cache-fix's quota analysis."""
import json, sys
from pathlib import Path
from collections import defaultdict

ROOT = Path.home() / ".claude/projects"
TOP = 30
if "--top" in sys.argv:
    TOP = int(sys.argv[sys.argv.index("--top")+1])

stats = defaultdict(lambda: {"5m": 0, "1h": 0, "read": 0, "sessions": set()})

for jsonl in ROOT.rglob("*.jsonl"):
    proj = jsonl.parent.name
    try:
        with jsonl.open() as fp:
            for line in fp:
                try: d = json.loads(line)
                except: continue
                msg = d.get("message")
                if not isinstance(msg, dict): continue
                u = msg.get("usage") or {}
                cc = u.get("cache_creation") or {}
                w5 = cc.get("ephemeral_5m_input_tokens", 0)
                w1 = cc.get("ephemeral_1h_input_tokens", 0)
                if w5 or w1:
                    stats[proj]["5m"] += w5
                    stats[proj]["1h"] += w1
                    stats[proj]["read"] += u.get("cache_read_input_tokens", 0)
                    stats[proj]["sessions"].add(jsonl.stem)
    except Exception as e:
        print(f"skip {jsonl}: {e}", file=sys.stderr)

rows = []
for p, s in stats.items():
    tw = s["5m"] + s["1h"]
    if tw == 0: continue
    rows.append((p, tw, s["5m"], s["1h"], s["1h"]/tw*100, s["read"], len(s["sessions"])))
rows.sort(key=lambda r: -r[1])

w = 55
print(f"{'Project':<{w}} {'5m writes':>13} {'1h writes':>13} {'1h%':>6} {'sess':>5}")
print("-" * (w + 42))
for p, tw, w5, w1, pct, rd, sess in rows[:TOP]:
    print(f"{p[:w]:<{w}} {w5:>13,} {w1:>13,} {pct:>5.1f}% {sess:>5}")

t5 = sum(s["5m"] for s in stats.values())
t1 = sum(s["1h"] for s in stats.values())
tr = sum(s["read"] for s in stats.values())
print("-" * (w + 42))
print(f"TOTAL writes — 5m: {t5:,}  1h: {t1:,}  1h share: {t1/(t5+t1)*100:.1f}%")
print(f"TOTAL cache reads:  {tr:,}")
```

掃我自己機器 4 個月日誌跑出來：

```
Project                                  5m writes     1h writes    1h%   sess
-------------------------------------------------------------------------------
subagents                              369,275,664   825,966,925  69.1%  5261
work-project-a                                   0   238,986,709 100.0%    89
work-project-b                                   0   142,661,382 100.0%     2
side-project-c                                   0    50,753,727 100.0%     9
... (其他都是 0 / 100%)
-------------------------------------------------------------------------------
TOTAL writes — 5m: 369,275,664  1h: 1,344,488,569  1h share: 78.5%
```

按月切（只看主 agent，排除 subagents）：

| Month | 5m writes | 1h writes | 1h% |
|-------|-----------|-----------|-----|
| 2026-02 | 0 | 546K | 100% |
| 2026-03 | 0 | **390M** | 100% |
| 2026-04 | 0 | 128M | 100% |

## 為什麼我的數據沒被影響

我整個 3 月主 agent 一個 5m 寫入都沒有，這跟 cnighswonger 抓出來「3/6 之後 5m 暴增」的數據對不上。可能性：

1. Regression 從來沒影響主 agent，只影響 sub-agent（這跟 Sumner 的辯詞對得起來）
2. Regression 只 rolled out 給部分用戶，我剛好在控制組
3. 某個 client 版本 / 設定路徑剛好沒踩到 regression code path

光看一台機器**沒辦法區分這三種可能性**。所以結論不是「Anthropic 沒問題」也不是「Anthropic 一定有問題」——**結論是你必須掃自己的數據**。

如果你掃出來主專案 3 月份大量 5m 寫入，那你就是那波 regression 受害者，建議直接裝 cnighswonger 的工具：除了即時看 TTL 狀態，還能修復 attachment block 漂移那類副作用。

## 工具選型建議

| 場景 | 用什麼 |
|------|--------|
| 重度使用者、想即時看 TTL 跟 quota | `claude-code-cache-fix` 的 status line |
| 想修復 resume session 後 cache 失效問題 | `claude-code-cache-fix` 的 wrapper |
| 只想看歷史 TTL 比例、不想裝任何東西 | 上面那個 Python 腳本 |
| 看一般 token 用量、跟 ccusage 補強 | [ccusage](https://github.com/ryoppippi/ccusage) |

## 為什麼這方法可靠

不依賴任何 Anthropic 公開 API、不需要 admin 權限、不需要等帳單——資料源是 Claude Code 寫進你硬碟的本地 JSONL，而 `cache_creation` 物件結構是 Anthropic API 規格的一部分，client 再怎麼包裝顯示，這份原始資料**就是 server 回傳的真相**。

對於把 Claude Code 當生產力工具的人，這種 self-instrumentation 比信任 Anthropic 的 changelog 可靠太多——畢竟 Anthropic 自己 3/6 的改動就**沒有 changelog**。

## 參考資源

- [cnighswonger/claude-code-cache-fix](https://github.com/cnighswonger/claude-code-cache-fix) — 本文主角，npm package 修復 + 即時 TTL 監控
- [How to Monitor Claude Code Cache Statistics — BSWEN](https://docs.bswen.com/blog/2026-04-01-monitor-cache-stats/) — 較早期的 JSONL cache 解析文章
- [Followup: Anthropic quietly switched the default — r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1sk3m12/followup_anthropic_quietly_switched_the_default/)
- [Cache TTL silently regressed from 1h to 5m — GitHub Issue #46829](https://github.com/anthropics/claude-code/issues/46829)
- [Anthropic: Claude quota drain not caused by cache tweaks — The Register](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/)
- [Anthropic downgraded cache TTL on March 6th — Hacker News](https://news.ycombinator.com/item?id=47736476)
- [Prompt Caching — Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [ccusage — Claude Code 用量分析 CLI](https://github.com/ryoppippi/ccusage)
