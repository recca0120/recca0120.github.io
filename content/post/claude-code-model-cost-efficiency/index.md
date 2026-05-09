---
title: '掃了 36 天 Claude Code 日誌：model 被靜默切換，效率差 11.5 倍'
description: '延續前兩篇 cache TTL audit，這次拆 model 維度。發現 server 端三次靜默切換 main agent model（Opus 4.6 → Sonnet 4.6 → Opus 4.7 → Sonnet 4.6），加上 sub-agent model 由 Claude Code 自主分配。跨 7 個時期比較「每百萬 main output 的總費用」，最有效率和最沒效率差 11.5 倍。'
slug: claude-code-model-cost-efficiency
date: '2026-05-09T16:00:00+08:00'
image: featured.png
categories:
- AI
tags:
- claude-code
- prompt-caching
- ai-agent
- python
draft: false
---

[第一篇]({{< ref "/post/claude-code-cache-ttl-audit" >}})掃了 95 天日誌，發現 sub-agent cache TTL 被靜默降到 5m。[第二篇]({{< ref "/post/claude-code-cache-ttl-17-days" >}})追蹤到連續 17 天 100% 5m，結論是「這已經是新預設值」。

這次我把 model 維度拆開來看。掃 3 月到 5 月 7 日的日誌，原本是想確認 cache TTL 有沒有回來（沒有），結果發現一件更大的事：**server 端不只控制 cache TTL，連 main agent 的 model 也被靜默切換過三次**。

## 證據來源

跟前兩篇一樣，掃 `~/.claude/projects/{project-path}/{session-uuid}.jsonl`。這次多看一個欄位——API response 裡的 `message.model`：

```json
{
  "message": {
    "model": "claude-opus-4-6",
    "usage": {
      "input_tokens": 142,
      "cache_read_input_tokens": 892041,
      "output_tokens": 3847,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 8234
      }
    }
  }
}
```

`model` 是 server 回傳的，不是 client 標的。API 說它用了什麼 model，那就是什麼 model。

## 全部只有四個 model

掃完所有 JSONL，出現的 model 只有四個：

| Model ID | 簡稱 | Input 定價 | Cache Read | Cache Write 5m | Cache Write 1h | Output |
|----------|------|-----------|------------|---------------|---------------|--------|
| opus-4-6 | O4.6 | $15/MTok | $1.50 | $18.75 | $30 | $75 |
| opus-4-7 | O4.7 | $15/MTok | $1.50 | $18.75 | $30 | $75 |
| sonnet-4-6 | S4.6 | $3/MTok | $0.30 | $3.75 | $6 | $15 |
| haiku-4-5 | H4.5 | $0.80/MTok | $0.08 | $1.00 | $1.60 | $4 |

Opus 跟 Sonnet 的 cache read 差 5 倍（$1.50 vs $0.30），output 差 5 倍（$75 vs $15）。Haiku 更便宜一個數量級。Claude Code 的 API call 裡 cache read 佔大宗，所以 **model 選擇直接決定費用量級**。

## Main Agent 被靜默切換三次

以 cc-office（我的主力專案）為例，main agent 的 model 時間線：

```
Date         O4.6     O4.7     S4.6     Total  Dominant
───────────────────────────────────────────────────────
2026-04-07   3,707        0        0    3,707  O4.6 100%
2026-04-13   2,821        0        0    2,821  O4.6 100%
2026-04-14   3,385        0      315    3,704  O4.6 91%   ← S4.6 開始出現
2026-04-15       0        0    3,445    3,449  S4.6 100%  ← 第一次切換
2026-04-16       0        0    5,949    5,949  S4.6 100%
2026-04-17       0    1,855    3,621    5,476  S4.6 66%
2026-04-18       0    1,973        0    1,973  O4.7 100%  ← 第二次切換
2026-04-25     211    5,386        0    5,597  O4.7 96%
2026-04-26   2,308        0        0    2,308  O4.6 100%  ← 回到 O4.6
2026-04-29   2,149        0        0    2,149  O4.6 100%
2026-04-30     514        0    1,213    1,727  S4.6 70%   ← 第三次切換
2026-05-01       0        0    3,492    3,492  S4.6 100%
2026-05-05     350        0    3,187    3,537  S4.6 90%
2026-05-06   2,347        0        0    2,347  O4.6 100%  ← 又回來
2026-05-07   4,197       44        0    4,241  O4.6 99%
```

我全程選 opus-4-6 1m context。但 server 回傳的 model 欄位三次變成別的東西：

1. **4/15-4/17**：被降到 sonnet-4-6（3 天）
2. **4/18-4/25**：被切到 opus-4-7（8 天）
3. **4/30-5/5**：又被降到 sonnet-4-6（6 天）

每次切換都是 binary——前一天還是 100% Opus 4.6，隔天就整個變了。跟 cache TTL regression 的行為模式一樣：鋒利的切換、沒有公告、client 完全無感知。

## Sub-Agent 的 model 不是你選的

Sub-agent 的 model 由 Claude Code 自主決定，不受使用者設定影響。各時期的分配差異非常大：

| 時期 | Main | Sub O4.6 | Sub O4.7 | Sub S4.6 | Sub H4.5 |
|------|------|---------|---------|---------|---------|
| 3/26-4/14 | O4.6 | **76%** | — | 4% | 19% |
| 4/15-4/17 | S4.6 | 0% | — | 7% | **92%** |
| 4/18-4/25 | O4.7 | — | 27% | 1% | **73%** |
| 4/26-4/30 | O4.6 | 34% | — | 28% | 37% |
| 5/01-5/05 | S4.6 | — | — | **64%** | 36% |
| 5/06-5/07 | O4.6 | **47%** | — | 30% | 23% |

當 main 是 Opus 時，sub 傾向也用 Opus（76%）。當 main 被降到 Sonnet 時，sub 幾乎全用 Haiku（92%）。這個連動不是巧合——server 端在調 main model 的同時，也調了 sub-agent 的 model 分配策略。

## 效率怎麼算

前兩篇用 cache TTL 當主軸。這次換個角度：**你花了多少錢，實際產出了多少 main agent output tokens**。

為什麼看 main output：

- Main agent 的 output 才是你要的東西——程式碼、修改、回答
- Sub-agent 是 overhead，它的工作是幫 main agent 找資料、搜程式碼
- Sub-agent 的 output 不是最終產物，而是 main agent 的 input

所以核心指標是：

> **每百萬 main output tokens 的總費用（main + sub 合計）**

這個數字越低，代表「花越少錢得到越多實際產出」。

## 七個時期效率排名

依 main agent 的 dominant model 分段，算每個時期的效率：

| 排名 | 時期 | Main | S/M ratio | $/M main output | $/日 | 評價 |
|------|------|------|-----------|----------------|------|------|
| 1 ⚡ | 5/01-5/05 | **S4.6** | 0.91 | **$167** | $319 | 最有效率 |
| 2 | 4/15-4/17 | S4.6 | 0.30 | $218 | $583 | |
| 3 | 3/09-3/21 | S4.6 | 2.04 | $875 | $144 | sub 空轉 |
| 4 | 4/26-4/30 | O4.6 | 0.47 | $896 | $1,450 | |
| 5 | 4/18-4/25 | **O4.7** | 0.23 | $1,134 | $3,148 | 最貴 |
| 6 | 5/06-5/07 | O4.6 | 0.35 | $1,554 | $2,836 | |
| 7 🐌 | 3/26-4/14 | **O4.6** | 0.55 | **$1,925** | $2,137 | 最沒效率 |

**最有效率跟最沒效率差 11.5 倍**——花 $167 能做到的事，換個 model 組合要花 $1,925。

## 最有效率：Main S4.6 + Sub S4.6/H4.5（5/01-5/05）

```
Main:  21,082 calls (4,216/day)  Model: S4.6 98%
Sub:   19,266 calls (3,853/day)  Model: S4.6 64%, H4.5 36%
Total: $1,596 ($319/day)
Main output: 9,559,468 (1,911,894/day)
$/M main output: $167
```

S/M ratio 0.91 看起來偏高——每個 main call 幾乎配一個 sub call。但 sub 全用 Sonnet 和 Haiku，overhead 只有 $56/M main output。便宜的 sub call 就算多跑幾次也不痛。

每花 $1 得到 5,991 個 main output tokens，是所有時期最高的 CP 值。

## 最沒效率：Main O4.6 + Sub 76% O4.6（3/26-4/14）

```
Main:  41,086 calls (2,162/day)  Model: O4.6 99%
Sub:   22,460 calls (1,182/day)  Model: O4.6 76%, S4.6 4%, H4.5 19%
Total: $40,594 ($2,137/day)
Main output: 21,092,340 (1,110,123/day)
$/M main output: $1,925
```

S/M ratio 只有 0.55，看起來很克制。但 sub 用了 76% Opus——每個 sub call 都是 Opus 價格的 cache read。Sub overhead 高達 $477/M main output。

而且 main output 每天只有 111 萬，是最有效率時期的 58%。花最多錢、產出最少。

## 最貴但不是最有效率：Opus 4.7（4/18-4/25）

```
Main:  31,204 calls (3,900/day)  Model: O4.7 99%
Sub:    7,233 calls (904/day)    Model: O4.7 27%, H4.5 73%
Total: $25,187 ($3,148/day)
Main output: 22,219,870 (2,777,484/day)
$/M main output: $1,134
```

Opus 4.7 時期的每日產出最高（277 萬 tokens），S/M ratio 最低（0.23），sub overhead 也只有 $15/M。看起來很精準，但 $3,148/日太貴了——同樣產出量的 Sonnet 時期（4/15-4/17，267 萬/日）只花 $583。

## Sub-Agent overhead 排名

把 sub 的費用除以 main output，可以單獨看 sub 造成多少 overhead：

| 排名 | 時期 | S/M ratio | Sub 組成 | Sub $/M main output |
|------|------|-----------|---------|-------------------|
| 1 ✅ | 4/15-4/17 | 0.30 | H4.5 92% | **$6** |
| 2 | 4/18-4/25 | 0.23 | H4.5 73%, O4.7 27% | $15 |
| 3 | 5/01-5/05 | 0.91 | S4.6 64%, H4.5 36% | $56 |
| 6 | 3/26-4/14 | 0.55 | **O4.6 76%** | **$477** |
| 7 ❌ | 3/09-3/21 | **2.04** | O4.6 20%, S4.6 71% | **$695** |

兩個規律：

1. **Sub 用 Haiku 就好**。4/15-4/17 sub 92% Haiku，overhead 只有 $6/M，是用 Opus 的 1/80
2. **S/M ratio 高不一定差**。5/01-5/05 ratio 0.91，但 sub 用便宜 model，overhead 才 $56。反而 3/26-4/14 ratio 0.55，因為 sub 76% Opus，overhead 衝到 $477

S/M ratio 本身不是問題，**sub 用什麼 model 才是問題**。

## 三種用法的完整比較

把所有數字攤開：

| 指標 | Main S4.6 最佳<br>(5/01-5/05) | Main O4.6<br>(3/26-4/14) | Main O4.7<br>(4/18-4/25) |
|------|-----|-----|-----|
| 每日費用 | **$319** | $2,137 | **$3,148** |
| 每日 main output | 1,911,894 | 1,110,123 | **2,777,484** |
| $/M main output | **$167** | $1,925 | $1,134 |
| CP 值 (tok/$) | **5,991** | 520 | 882 |
| Sub overhead/M | $56 | $477 | $15 |
| Sub 主要 model | S4.6+H4.5 | **O4.6 76%** | H4.5 73% |

Main Sonnet 時期花 $319/日，產出 191 萬 tokens。Main Opus 4.6 時期花 $2,137/日，產出反而更低（111 萬）。Opus 4.7 產出最高（277 萬），但每日 $3,148。

## 你沒辦法控制的事

這篇的所有分析有個前提：**model 的選擇不完全在你手上**。

你能控制的：
- 在 Claude Code 設定裡選 model（我選了 opus-4-6 1m）

你不能控制的：
- Server 端可能把你的 main agent model 靜默換成別的
- Sub-agent 的 model 由 Claude Code 自主分配
- Cache TTL 由 server 端決定（sub-agent 100% 5m，已連續 29 天）

這代表你在 Claude Code 裡看到的「使用 Opus 4.6」不一定是真的。要確認實際用了什麼 model，得掃 JSONL 看 API response。

## Cache TTL 現況：還是 100% 5m

順便更新 cache TTL 狀況。掃 4/30-5/7：

| 指標 | Main Agent | Sub Agent |
|------|-----------|-----------|
| 總 API calls | 37,366 | 26,160 |
| 1h cache write | **100%** | **0** |
| 5m cache write | 0 | **100%** |

從 [第一篇]({{< ref "/post/claude-code-cache-ttl-audit" >}}) 記錄的 4/9 算起，**sub-agent 已連續 29 天 100% 5m，0 個 1h 寫入**。沒有回歸跡象。

## 怎麼掃自己的數據

延續前兩篇的 Python，這次加上 model 維度：

```python
#!/usr/bin/env python3
import json
from pathlib import Path
from collections import defaultdict

ROOT = Path.home() / ".claude/projects"
data = defaultdict(lambda: defaultdict(lambda: defaultdict(
    lambda: {"calls":0, "input":0, "cache_read":0, "output":0}
)))

for jsonl in ROOT.rglob("*.jsonl"):
    agent = "sub" if "subagent" in str(jsonl) else "main"
    try:
        for line in jsonl.open():
            try: obj = json.loads(line)
            except: continue
            msg = obj.get("message", {})
            if not isinstance(msg, dict): continue
            u = msg.get("usage") or {}
            inp = u.get("input_tokens", 0)
            cr = u.get("cache_read_input_tokens", 0)
            out = u.get("output_tokens", 0)
            if not (inp or cr or out): continue
            day = (obj.get("timestamp") or "")[:10]
            model = (msg.get("model") or "unknown").replace("claude-", "")
            r = data[day][agent][model]
            r["calls"] += 1
            r["cache_read"] += cr
            r["output"] += out
    except: pass

for day in sorted(data):
    if day < "2026-03-01": continue
    for agent in ["main", "sub"]:
        models = data[day][agent]
        if not models: continue
        parts = [f"{m}={v['calls']}" for m, v in
                 sorted(models.items(), key=lambda x: -x[1]["calls"])]
        print(f"{day}  {agent:4}  {', '.join(parts)}")
```

跑完就能看到你的 main agent 實際用了什麼 model，跟你在 Claude Code 裡選的一不一樣。

## 結論

1. **Model 選擇是最大的成本因子**。Cache TTL 影響約 2 倍，model 影響 5-11 倍。Opus 對 Sonnet 的 cache read 價差 5 倍，是每天幾千美金的差別
2. **Server 端會靜默切換 model**。我選了 opus-4-6，但在 36 天裡有 17 天被切成 sonnet-4-6 或 opus-4-7。跟 cache TTL regression 一樣，沒有公告
3. **Sub-agent 用 Opus 是最大浪費源**。Sub 的工作是搜尋和探索，用 Haiku 就夠。Sub 76% Opus 的 overhead 是 92% Haiku 的 80 倍
4. **S/M ratio 高不一定差**。Sub 跑多跑少不重要，用什麼 model 才重要。便宜的 sub 多跑幾次也比一次 Opus sub 划算
5. **最有效率的組合**（$167/M main output）跟**最沒效率的組合**（$1,925/M）差 **11.5 倍**——完全相同的使用者、相同的專案、相同的工作類型

你在 Claude Code 裡選了什麼 model 不重要，重要的是 server 實際給你什麼。掃自己的 JSONL 確認，這是唯一可靠的方法。

## 參考資源

- [掃了 95 天的 Claude Code 日誌，發現第二波 cache TTL silent regression]({{< ref "/post/claude-code-cache-ttl-audit" >}})
- [再掃 12 天，連續 17 天 100% 5m——這不是 regression，是新預設值]({{< ref "/post/claude-code-cache-ttl-17-days" >}})
- [Claude Code session cost 跟 cache 成本的常見誤解]({{< ref "/post/claude-code-session-cost-cache-misconception" >}})
- [Anthropic Prompt Caching 官方文件](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Cache TTL silently regressed — GitHub Issue #46829](https://github.com/anthropics/claude-code/issues/46829)
