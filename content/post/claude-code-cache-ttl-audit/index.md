---
title: '掃了 95 天的 Claude Code 日誌，發現 Anthropic 還有第二波 cache TTL silent regression'
description: '社群在罵 Anthropic 3/6 偷改 cache TTL，但只看別人的 billing 不夠。我掃自己 95 天的 Claude Code 原生日誌，精準復現 3/6 那波 regression，並發現 4/9 起 sub-agent 100% 被降到 5m TTL—社群還沒人報告過的第二波。'
slug: claude-code-cache-ttl-audit
date: '2026-04-14T03:00:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- claude-code
- prompt-caching
- ai-agent
- python
draft: false
---

[前一篇](/2026/04/13/claude-code-session-cost-cache-misconception/)講過 prompt caching 的成本邏輯。寫完之後查到一個很有戲的爭議——2026 年 3 月 Anthropic **靜默把 Claude Code 的 cache TTL 從 1 小時改回 5 分鐘**，社群實測月成本暴漲 15–53%，Reddit 跟 HN 一片哀號。

但社群的證據都來自別人的 billing statement 跟 [issue #46829](https://github.com/anthropics/claude-code/issues/46829)，我想知道**自己機器有沒有被影響**。掃了 95 天的原生日誌之後，結果比想像中精彩：不只精準復現 3/6 那波 regression，還發現 **4/9 起的第二波**——5 天連續、4,840 個 API call、sub-agent 100% 被降到 5m，目前社群還沒人報告過。

## 證據在 ~/.claude/projects 的 JSONL 裡

Claude Code 把每個 session 完整 API 互動寫在：

```
~/.claude/projects/{project-path}/{session-uuid}.jsonl
```

每個 assistant response 的 `usage.cache_creation` 物件**直接告訴你這次寫進哪個 TTL bucket**：

```json
{
  "cache_creation": {
    "ephemeral_5m_input_tokens": 0,
    "ephemeral_1h_input_tokens": 6561
  }
}
```

這兩個欄位是 **Anthropic API 直接回傳的**，繞過 client 任何顯示邏輯。client 想騙你 server 不會配合——這份數據就是 server 給你的真相。

寫個 Python 掃過所有專案，按日期切，分主 agent / sub-agent：

```python
#!/usr/bin/env python3
import json
from pathlib import Path
from collections import defaultdict

ROOT = Path.home() / ".claude/projects"
main = defaultdict(lambda: {"5m":0,"1h":0,"calls":0})
sub  = defaultdict(lambda: {"5m":0,"1h":0,"calls":0})

for jsonl in ROOT.rglob("*.jsonl"):
    bucket = sub if "subagent" in jsonl.parent.name.lower() else main
    try:
        with jsonl.open() as fp:
            for line in fp:
                try: d=json.loads(line)
                except: continue
                ts=d.get("timestamp"); msg=d.get("message")
                if not isinstance(msg,dict) or not ts: continue
                u=msg.get("usage") or {}; cc=u.get("cache_creation") or {}
                w5=cc.get("ephemeral_5m_input_tokens",0)
                w1=cc.get("ephemeral_1h_input_tokens",0)
                if not (w5 or w1): continue
                day=ts[:10]
                bucket[day]["5m"]+=w5
                bucket[day]["1h"]+=w1
                bucket[day]["calls"]+=1
    except: pass

def pct(s):
    tot=s["5m"]+s["1h"]
    return s["1h"]/tot*100 if tot else 0

print(f"{'Date':<11} | {'M5m':>10} {'M1h':>11} {'M%':>4} | {'S5m':>11} {'S1h':>12} {'S%':>4} {'calls':>5}")
for d in sorted(set(main.keys())|set(sub.keys())):
    if d < '2026-01-01': continue
    m=main[d]; s=sub[d]
    print(f"{d} | {m['5m']:>10,} {m['1h']:>11,} {pct(m):>3.0f}% | "
          f"{s['5m']:>11,} {s['1h']:>12,} {pct(s):>3.0f}% {s['calls']:>5}")
```

## 95 天的完整 timeline

掃我自己機器 1 月 9 日到 4 月 13 日的數據，整理出 4 個 phase 三次轉折：

| Phase | 期間 | Sub-agent 狀態 | Main agent | 事件 |
|-------|------|---------------|-----------|------|
| 1 | 1/9 ~ 2/5 | **100% 5m**（28 天）| 沒資料 | 1h 還沒推出 |
| 2 | **2/6** | 79% 1h（轉折開始）| — | **2/1 公告的「升級到 1h」實際 rollout 日** |
| 3 | 2/7 ~ 3/5 | **100% 1h** 穩定（28 天）| 100% 1h | 1h 黃金期 |
| 4 | **3/6** ~ 4/8 | 1h ↔ 5m 混合搖擺（6%–97%）| 100% 1h | **第一次 regression**（cnighswonger 報告的）|
| 5 | **4/9** ~ now | **100% 5m** 穩定（5 天）| 100% 1h | **第二次 regression**（社群還沒人報告） |

每個轉折日附近的關鍵幾天：

```
Date        | MAIN 1h  calls | SUB 5m         SUB 1h         S1h%   calls
------------|----------------|-----------------------------------------
2026-02-05  | (no data)      |          0    7,974,898       100%   1392    ← 還是 1h
2026-02-06  | (no data)      |  2,886,030   10,753,834        79%   1684    ← 1h rollout 上線
2026-02-07  | (no data)      |          0    4,280,317       100%    639

2026-03-05  | 100%   1503    |          0    6,004,235       100%   2446    ← 還是 1h
2026-03-06  | 100%   3355    |    461,509    1,281,686        74%    608    ← 第一次 regression!
2026-03-07  | 100%   2753    |  9,810,771   10,465,251        52%   7548
2026-03-08  | 100%   4724    | 34,340,003   24,301,557        41%  17514

2026-04-08  | 100%   3041    |  2,650,760    5,533,277        68%   1301    ← 還有混合
2026-04-09  | 100%   4155    |  8,451,674            0         0%   1268    ← 第二次 regression!
2026-04-10  | 100%   5523    |  5,437,455            0         0%   1170
2026-04-11  | 100%   2579    |  3,325,195            0         0%    778
2026-04-12  | 100%   3738    |  2,981,213            0         0%    993
2026-04-13  | 100%   4443    |  2,648,132            0         0%    631
```

## 三次轉折拆解

### 轉折 1：2026-02-06，1h rollout 實際上線

Anthropic 2/1 公告「TTL 從 5m 升級到 1h」，**實際 rollout 在 2/6**。我這邊看到 sub-agent 從 100% 5m 一夜變成 79% 1h，跟公告吻合。

### 轉折 2：2026-03-06，[第一次 silent regression](https://github.com/anthropics/claude-code/issues/46829)

[cnighswonger 在 issue #46829](https://github.com/anthropics/claude-code/issues/46829) 用同樣方法掃 119,866 個 API call 報告的事件——**3/6 那天 sub-agent 從 100% 1h 變成 74%**。我這邊精準復現：3/5 還是 100% 1h，3/6 變 74%，3/7 暴衝到 9.8M tokens 5m 寫入。

之後一個月（3/6–4/8）sub-agent 在 1h ↔ 5m 之間瘋狂搖擺，從 6% 到 97% 都有。代表 server 的 TTL 決定**邏輯不穩定**。

Anthropic 員工 Jarred Sumner 在 [The Register 報導](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/)的回應辯稱「sub-agent 5m 對 one-shot 比較便宜」——對於 phase 4 的混合行為勉強說得通。但下面這個第二波就破功了。

### 轉折 3：2026-04-09，第二次 silent regression（獨家發現）

**4/9 起 sub-agent 1h 完全歸零**，5 連天 100% 5m，跨 **4,840 個 API call**。這目前社群沒人報告。

幾個關鍵點：

**這不是雜訊。** 4,840 個 call 裡一個 1h 都沒有，而 4/8 還有 68% 是 1h。這是**鋒利的 binary 切換**，不是漸進變化。

**這不是 quota 觸發降級。** Anthropic 文件說 5h quota 燒到 100%+ 會被 server 強制降級——但**主 agent 同期 100% 1h** 沒被降。如果是 quota 機制，主跟副會一起降。

**這不是 client 版本問題。** 同一個 client 同一天，主 agent 跟 sub-agent 兩種 TTL 行為。

**這不是工作流變化。** API call 量還在正常範圍（每天 631–1268 calls），跟 4 月初差不多。

**所以唯一合理的解釋：4/9 起 server 端對 sub-agent 預設 TTL 從 mixed 改成 hard-coded 5m。** 而且**沒有 changelog、沒有公告、沒有 issue 提到**——重複了 3/6 那波的「靜默調整」模式。

## 為什麼主 agent 完全沒被影響

整個 95 天，主 agent 沒有一次 5m 寫入。Anthropic 的所有 TTL 操作**只動 sub-agent**：

| 主張 | 我的數據是否驗證 |
|------|----------------|
| Reddit「3/6 靜默改 TTL」 | ✅ **強烈驗證**（精準對到 3/6）|
| Sumner 辯詞「主 agent 沒被影響」 | ✅ **驗證**（主 100% 1h 跨 95 天）|
| 「regression 只動 sub-agent」 | ✅ **驗證** |
| Sumner「sub-agent 5m 是 one-shot 優化」 | ⚠️ **部分反駁**（4/9 起 100% 5m 不是優化是強制降級）|
| **新發現：4/9 起 sub-agent 100% 5m** | 🆕 **獨家** |

## 任何人都能複製驗證

把上面那個 Python 存成 `~/bin/cc-ttl-timeline.py`，跑：

```bash
python3 ~/bin/cc-ttl-timeline.py
```

如果你看到自己 sub-agent 在 3/6、4/9 也有對應轉折——你也是 silent regression 受害者，建議去 issue #46829 補一筆數據；如果沒看到——代表 regression 不是 100% rollout，你剛好在控制組。

兩個結果都有意義。**重點是這份證據鏈不依賴任何人的說法**——資料源是 Claude Code 寫進你硬碟的本地 JSONL，`cache_creation` 物件結構是 Anthropic API spec 的一部分，server 想造假也得連自己的 API response 都改。

## 為什麼不用 cnighswonger 的 npm 包

[cnighswonger/claude-code-cache-fix](https://github.com/cnighswonger/claude-code-cache-fix) 是個很棒的工具，但它**只能看裝完之後的數據**——它的所有監控工具（status line、cost-report、quota-analysis）讀的是 `~/.claude/usage.jsonl`，這個檔案只在 interceptor 掛載期間才會寫。

要回頭看「**裝之前**」的歷史，只能用 Claude Code 自己寫的 `~/.claude/projects/*.jsonl`。本篇用的就是這個。

兩者用途互補：

| 場景 | 工具 |
|------|------|
| 回頭看歷史、找 regression 轉折日 | **本篇 Python 腳本** |
| 即時看當下 TTL 狀態 + 修 client cache bug | cnighswonger 包套件 |
| 一般 token 用量分析 | [ccusage](https://github.com/ryoppippi/ccusage) |

## 結語

「Anthropic 偷改 cache TTL 嗎？」這個爭議，每個人都該自己掃自己的數據。社群的傳聞跟 Anthropic 的官方說法都不夠——只有你硬碟上那份 JSONL 是不會說謊的。

掃完之後不管結果是什麼都有價值：看到 regression → 你是受害者，去補強社群的證據；沒看到 regression → 你在控制組，這也是「不是 100% rollout」的證據。

我會持續每幾天掃一次，看 4/9 這波會持續多久、會不會擴散到主 agent。如果你的數據也有 4/9 之後類似的 sub-agent 100% 5m 行為，歡迎在 [issue #46829](https://github.com/anthropics/claude-code/issues/46829) 留言或寄信給我。

## 參考資源

- [Cache TTL silently regressed from 1h to 5m — GitHub Issue #46829](https://github.com/anthropics/claude-code/issues/46829) — cnighswonger 的原始證據
- [Followup: Anthropic quietly switched the default — r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1sk3m12/followup_anthropic_quietly_switched_the_default/)
- [Anthropic: Claude quota drain not caused by cache tweaks — The Register](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/)
- [Anthropic downgraded cache TTL on March 6th — Hacker News](https://news.ycombinator.com/item?id=47736476)
- [cnighswonger/claude-code-cache-fix](https://github.com/cnighswonger/claude-code-cache-fix) — 修 client cache 失效 bug + 即時監控
- [Prompt Caching — Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [ccusage — Claude Code 用量分析 CLI](https://github.com/ryoppippi/ccusage)
