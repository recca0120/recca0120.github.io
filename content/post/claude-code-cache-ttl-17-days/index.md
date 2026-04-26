---
title: '再掃 12 天，Claude Code sub-agent cache TTL 已連續 17 天 100% 5m——這不是 regression，是新預設值'
description: '4/14 我報告 5 連天 sub-agent 100% 5m，結論留在「持續觀察」。今天 4/26 再掃，連續變 17 天、15,727 個 API call、0 個 1h 寫入。Anthropic 把主 issue 關了沒解決，社群一片火。'
slug: claude-code-cache-ttl-17-days
date: '2026-04-26T05:55:00+08:00'
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

[兩週前那篇]({{< ref "/post/claude-code-cache-ttl-audit" >}}) 我掃了 95 天 Claude Code 日誌，發現 4/9 起 sub-agent 100% 被降到 5m TTL，連續 5 天、4,840 個 API call，主 agent 完全沒事。當時保留結論為「持續觀察」，因為 5 天還可能是 rollout 抖動。

今天 4/26 再掃同一支 Python，連續變成 **17 天**，**15,727 個 API call，0 個 1h 寫入**。這不是抖動了——server 端對 sub-agent 的預設 TTL **已經悄悄改成 hard-coded 5m**，沒 changelog、沒公告，主 issue 還被 Anthropic 在沒解決的狀況下關掉。

這篇是 follow-up：最新數據、cost 數學、社群與媒體現況、為什麼 cnighswonger 的 proxy 也救不了這波。

## 過去兩週數據

掃 4/13–4/25（前一篇截止日後到今天）：

| 指標 | Main agent | Sub-agent |
|------|-----------|-----------|
| 總 API calls | 60,291 | 15,727 |
| 1h 寫入 | **100%**（150.7M tokens）| **0** |
| 5m 寫入 | 0 | **100%**（60.4M tokens）|
| 1h 寫入連續天數 | 13 天 | 0 天 |
| 5m 寫入連續天數 | 0 天 | 13 天 |

加上 4/9–4/12 那 4 天，**4/9 起 sub-agent 已連續 17 天 100% 5m，0 個 1h 寫入**。期間 sub-agent 工作量沒少——4/14（前一篇發文當天）2,648 calls、4/17 衝到 2,821 calls，是兩週高峰。被降級的 cost 衝擊全部吃下去。

關鍵反差：**主 agent 同期 100% 1h，沒被動到一根毛**。所以這明確是 server 對「sub-agent 這個身份」做的差別待遇，不是 quota 觸發、不是 client 版本、不是工作流變化。

## sub-agent 變貴多少：實際算

Anthropic 官方的 cache 定價：

- Cache write to 5m TTL: **1.25× base input price**
- Cache write to 1h TTL: **2× base input price**
- Cache read（兩者一樣）: **0.1× base input price**

直覺上 5m 寫入比 1h 便宜——1.25× vs 2×，省 37.5%。但 sub-agent 的實際工作模式會把這個直覺打回來。

典型 sub-agent 跑 30 分鐘、5 個 turn，turn 之間因為要等 LLM 思考、跑工具、解析結果，**3 次間隔超過 5 分鐘**很常見。每次間隔超過 TTL，cache 就 expire，下次得重寫。

算總 cost（以 base input 為 1×）：

```
舊（1h TTL）：
  1 次 cache write @ 2× = 2.0
  4 次 cache read  @ 0.1× = 0.4
  總計 = 2.4×

新（5m TTL）：
  4 次 cache write @ 1.25× = 5.0
  1 次 cache read  @ 0.1× = 0.1
  總計 = 5.1×
```

**約 2.1 倍**。一個重 sub-agent 的工作流（平行 Task fan-out、長 plan-execute、code review pipeline）原本花 \$10 的，現在要 \$21。

> 這個算法假設 turn 之間平均間隔超過 5m。如果你的 sub-agent 每個 turn 都在 5m 內完成（例如純 retrieval），影響會小很多。受傷最重的是「會跑久、會等 tool result」的 sub-agent。

## GitHub 過去一週動態

### Issue #46829：被 Anthropic 關了

cnighswonger 開的 [#46829](https://github.com/anthropics/claude-code/issues/46829)，Anthropic **在沒給解法的狀況下關閉**。社群留言一面倒在罵：

- **DaQue**：「I don't like the stealth nerf.」
- **rinchen**：「Yet another issue closed without resolution by Anthropic.」
- **lizthegrey**（Honeycomb 工程總監，4/25 跳進來）：貼自己的 grep 腳本掃日誌，列出受影響的版本日期（4/01 v2.1.81、4/09 v2.1.85、4/13–4/17 v2.1.92、4/21 v2.1.114），明確說**已經把脫敏的 jsonl 提供給 Anthropic**。這是目前最有份量的證據提交

```bash
# lizthegrey 的單行驗證腳本
grep -h -r -E 'ephemeral_.*_input_tokens' ~/.claude | \
  jq 'select(.isSidechain == false and (.message.model | startswith("claude-haiku") | not) and .message.usage.cache_creation.ephemeral_5m_input_tokens > 0) | .timestamp + "," + .version' 2>/dev/null | \
  sed 's/T.*,/,/' | sort | uniq -c
```

這支跟前一篇我那 60 行 Python 是同一個資料源，更精煉。可以直接用。

### Issue #50213：sub-agent trailing block 沒掛 cache_control

ofekron 在 [#50213](https://github.com/anthropics/claude-code/issues/50213) 4/17 補了實測：所有內建 sub-agent（Explore、Plan、general-purpose）spawn 第二次都還是有 nonzero `cache_creation`，代表 trailing system-context block 沒掛 cache_control marker，每次 fresh spawn 都浪費 ~4.7K tokens 重寫。**過去一週 0 新留言**——這個 issue 沒人理。

兩個 issue 加起來說的是同一件事：**Anthropic 對 sub-agent cache 的態度，整體傾向「能省就省」，不是「能優化就優化」**。

### Anthropic 員工沒新動作

- **bcherny** 之前提的「per-request env var/flag for TTL」——**還沒出**
- **Jarred Sumner** 之前在 The Register 辯護「sub-agent 5m 是 one-shot 優化」——**沒回應 4/9 那波 100% 5m 的數據**
- 過去一週 Anthropic 沒在這兩個 issue 發言

## Update（2026-04-26）：官方立場 vs 我的數據

文章發出後再查了一輪，發現 Boris Cherny（Claude Code 作者）透過 The Register 的公開說法：

> "**One-hour cache has been implemented in some places for subscribers**, while a **five-minute cache is the true default.**"

也就是 Anthropic 的官方姿態是「5m 才是真正的預設值，1h 只在某些場景對訂閱用戶開放」——這跟本文「這是新預設值，不是 regression」的結論其實**一致**。

但官方說法**無法解釋一件事**：[第一篇 audit]({{< ref "/post/claude-code-cache-ttl-audit" >}}) 的時間序列證據顯示，2026-02-07 到 03-05 連續 28 天，sub-agent 拿到的是 100% 1h（不是 mixed、不是 50%）。這 28 天的「1h 待遇」如果是「特例」，那也是穩定發放的特例，而不是偶爾發生的恩賜。

本文 17 天 100% 5m 的真正意義因此可以重新定位：**訂閱用戶過去拿到的 sub-agent 1h 待遇，正在被穩定收回**。Anthropic 沒「改 default」，但「曾經發放給 sub-agent 的 1h 特例」實質上消失了。這個事實官方說法擋不住。

## 媒體報導與另一條更大的線

這波不是只有 GitHub 在炸：

- **The Register（4/13）**：[Anthropic: Claude quota drain not caused by cache tweaks](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/)——Anthropic 公開否認 quota drain 跟 cache 有關，同篇引述 Sumner 的辯詞
- **XDA Developers**：[Anthropic quietly nerfed Claude Code's 1-hour cache](https://www.xda-developers.com/anthropic-quietly-nerfed-claude-code-hour-cache-token-budget/)
- **DevOps.com**：[Developers Using Anthropic Claude Code Hit by Token Drain Crisis](https://devops.com/claude-code-quota-limits-usage-problems/)

更值得注意的是 [Issue #41930](https://github.com/anthropics/claude-code/issues/41930)——**3/23 起所有付費 tier 都遇到 quota 異常爆掉**，Pro / Max 5× / Max 20× 全中。單一 prompt 吃掉 3–7% session quota，5h 視窗最快 19 分鐘燒光。社群把 cache TTL regression、autocompact cascade、subagent fan-out 視為**多重根因疊加**。我的 4/9 第二波發現算是補上了「sub-agent 這條線在 4/9 又惡化一次」的關鍵 timeline。

## cnighswonger 的 proxy 救得了嗎？我的看法

[cnighswonger/claude-code-cache-fix](https://github.com/cnighswonger/claude-code-cache-fix) v3.0.3 在 CC v2.1.117 的 A/B 測試漂亮：透過 proxy **95.5% cache hit rate**，直連 **82.3%**。它有 7 個 hot-reloadable extension，其中 `ttl-management` 會「偵測 server TTL tier 並注入正確的 cache_control marker」。

但對「server 強制把 sub-agent 寫到 5m」這個問題，**proxy 不一定救得了**。我的判斷：

- proxy 能修的是**「該命中的 cache 因為 client bug 沒命中」**（fingerprint 不穩、tool 排序非 deterministic、cache_control marker 不一致）
- 它不能修**「client 標 1h marker、server 還是寫到 5m」**——這是 server side 行為，proxy 改不了 response
- 從我們 17 天 100% 5m / 0 個 1h 的數據看，server 對 sub-agent 走的就是後者

要驗證很簡單：裝完 proxy 跑同一支腳本掃 `~/.claude/projects/*.jsonl`，看 sub-agent 的 `ephemeral_1h_input_tokens` 會不會從 0 變成非 0。如果還是 0，就確認 server 端改死了。

> 這不是說 cnighswonger 的 proxy 沒用——它對 main agent 跟所有 cache miss 場景都有實證效果。只是想用它「救回 sub-agent 1h TTL」可能會失望。

## 結論：這已經是新預設值

4/14 那篇我把 4/9 那波歸類為「第二次 silent regression」。今天 4/26 我要修正用詞：**這不再是 regression，這是 Anthropic 對 sub-agent 的新預設值**。

證據強度：

- **17 天連續**（4/9–4/25）
- **15,727 個 API call**（光過去 13 天）
- **0 個 1h 寫入**（不是低，是真的 0）
- **主 agent 同期完全沒被動**（差別待遇明確）
- **媒體 + GitHub + 社群都在炸**，Anthropic 維持沉默

如果你重 sub-agent，建議：

1. **先掃自己的數據確認**——用前一篇的 Python 或上面 lizthegrey 的 jq 一行
2. **算清楚 cost 影響**——不是「貴一點」，是約 2 倍
3. **重新評估 sub-agent 工作流**——能在主 agent 完成的就不要 fan-out 給 sub-agent
4. **去 [issue #46829](https://github.com/anthropics/claude-code/issues/46829) 補一筆數據**——issue 雖被關，留言還會被搜到。社群已經有 Honeycomb 等級的人施壓，數據越多、外部報導越容易跟進

[前情提要：Claude Code session cost 跟 cache 成本的常見誤解]({{< ref "/post/claude-code-session-cost-cache-misconception" >}}) 講的是 cache 成本邏輯，[第一篇 audit]({{< ref "/post/claude-code-cache-ttl-audit" >}}) 講的是怎麼掃自己日誌驗證。配著看完整。

## 參考資源

- [Cache TTL silently regressed — GitHub Issue #46829](https://github.com/anthropics/claude-code/issues/46829) — 已被關閉，社群仍在留言
- [Subagent trailing block 沒掛 cache_control — Issue #50213](https://github.com/anthropics/claude-code/issues/50213)
- [Widespread quota drain since 2026-03-23 — Issue #41930](https://github.com/anthropics/claude-code/issues/41930) — 多重根因的母 issue
- [Anthropic: Claude quota drain not caused by cache tweaks — The Register](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/)
- [Anthropic quietly nerfed Claude Code's 1-hour cache — XDA Developers](https://www.xda-developers.com/anthropic-quietly-nerfed-claude-code-hour-cache-token-budget/)
- [Developers Hit by Token Drain Crisis — DevOps.com](https://devops.com/claude-code-quota-limits-usage-problems/)
- [The 5-Minute TTL Change That's Costing You Money — dev.to](https://dev.to/whoffagents/claude-prompt-caching-in-2026-the-5-minute-ttl-change-thats-costing-you-money-4363)
- [cnighswonger/claude-code-cache-fix](https://github.com/cnighswonger/claude-code-cache-fix) — proxy + extension 套件
