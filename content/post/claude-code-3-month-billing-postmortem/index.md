---
title: '掃完三個月 Claude Code 帳單，社群在傳的省錢建議大多沒效'
description: '$127K 等價成本、127K turns、四個模型、三個月。把自己當資料集驗證後，「長 session 是元兇」「skill 太多」這些常見直覺被數據打臉，真正能省的只有兩條。'
slug: claude-code-3-month-billing-postmortem
date: '2026-04-26T07:55:00+08:00'
image: featured.png
categories:
- AI
tags:
- claude-code
- prompt-caching
- ai-agent
- cost-optimization
draft: false
---

過去一週為了一個「最近 quota 燒得快」的感覺，我把自己 Claude Code 三個月的日誌全掃了一遍。等價成本約 \$127K、127K turns、跨四個 model、上百個 session。

掃完發現一件有點難堪的事：**Reddit、HN、Twitter 一直在傳的省錢建議，拿真實數據對照後大多沒效**。「session 太長要 `/clear`」「skill 太多要清」「MCP 要精簡」——這些直覺聽起來都對，但放到三個月實際數據裡，**幾乎沒一條經得起驗證**。真正能讓帳單變小的只有兩件事，而且都跟「優化你的使用習慣」沒關係。

> 之前寫過 [掃了 95 天的 Claude Code 日誌，發現第二波 cache TTL silent regression]({{< ref "/post/claude-code-cache-ttl-audit" >}}) 跟 [17 天追蹤更新]({{< ref "/post/claude-code-cache-ttl-17-days" >}})，討論 server side 行為。本篇是延伸：當 server 行為已經確定救不了，user side 還有什麼可以做。

## 三個月帳單

主力開發專案（單一 codebase、單人開發）的 Claude Code 月帳：

| 月份 | 等價 \$ | 主要模型 | 關鍵事件 |
|------|--------|---------|---------|
| 2026-02 | \$1,015 | 5 個模型混用 | 試用期，量小 |
| 2026-03 | \$48,623 | **99.6% Opus 4.6** | 進入重度使用，per-call prefix 一次性從 58K 跳到 417K |
| 2026-04 | \$77,754 | Opus 4.6 \$51K + Opus 4.7 \$25K | 4/16 Opus 4.7 release，alias 自動升級 |

兩個關鍵觀察：

1. **3 月 → 4 月，Opus 4.6 的成本幾乎沒變**（\$48K → \$51K，+7%）。\$/turn 從 \$0.692 → \$0.713，差 3%。代表使用習慣穩定。
2. **4 月多出來的 \$25K，幾乎完全是 Opus 4.7 那層**。

也就是說，「最近變貴」不是因為我做了什麼新事情，是 **4/16 Anthropic 發佈 Opus 4.7、`opus` alias 自動指向新版**，settings 沒鎖版本就自動跟上去了。

> 這是 alias 機制的正常行為，不是隱蔽舉動。但對訂閱用戶 quota 影響很實在——後面會看到，新版 adaptive thinking 燒 quota 是舊版的 2.4 倍。

## 4 月全模型多維分析

把 4 月一個月的數據按 model 拆完整：

| 維度 | Opus 4.6 | Opus 4.7 | Sonnet 4.6 | Haiku |
|------|---------|---------|-----------|-------|
| **使用份額** | | | | |
| Sessions（主/Sub）| 24/138 | 18/84 | 5/46 | 1/376 |
| 總 turns | 72,431 | 31,621 | 15,182 | 16,138 |
| 占總 turns | 47.4% | 20.7% | 9.9% | 10.6% |
| Wall-clock 小時 | 635 | 270 | 72 | 14 |
| Active 小時（去 idle）| 237.9 | 106.5 | 40.2 | 6.2 |
| **產出特徵** | | | | |
| Turns/active hour | 305 | 297 | **378** | 2,614 |
| Tools/turn | 0.62 | 0.63 | 0.64 | 0.68 |
| Output tokens/turn | 227 | **667** | 456 | 101 |
| Sub:Main turn 比 | 1:1.32 | **1:15.56** | 1:14.95 | n/a |
| **成本** | | | | |
| 等價 \$ | \$51,700 | \$24,595 | \$773 | \$114 |
| 占成本 | **67.0%** | 31.9% | 1.0% | 0.1% |
| Quota burn 倍率 | 1.0× | **2.4×** | 0.2× | 0.05× |
| \$/turn | \$0.714 | \$0.778 | \$0.051 | \$0.007 |

幾個跨欄位才看得出來的事實：

**Opus 4.7 每個 turn 多輸出 2.9 倍 token**（667 vs 227）。這不是它廢話多——adaptive thinking 的 reasoning chain 也算 output token。同樣完成一個任務，4.7 燒掉的 output 是 4.6 的 ~3 倍。

**Opus 4.7 不愛 delegate**。Sub:Main turn 比從 4.6 的 1:1.32 跳到 1:15.56——4.6 是「丟一半給 sub-agent」的協作型，4.7 變「自己想到底」的 lone wolf。這直接呼應它每 turn 多 3 倍 output 的特徵：思考都自己做。

**Sonnet 4.6 的 \$/turn 是 Opus 的 1/16**。但只占了 9.9% 的 turn——明顯被低估。

**Haiku 是隱形主力**。0 個主 session、376 個 sub session、16K turn 只花 \$114——全部都是 Claude Code 內建的 Explore / Plan agent 自動觸發。完全不需要管，它替你扛了 10% 的 turn 量。

## 五個常見「省錢建議」實證打臉

社群（Reddit / HN / Discord）流傳的常見優化建議，逐條對自己的數據打分。

### ❌「長 session 是元兇」

直覺：session 跑越久、conversation history 越長，每個 turn 都要重讀全部 cache prefix，越後面越貴。

數據反證：3 月跟 4 月的 Opus 4.6 使用模式幾乎一樣（69,980 turn vs 72,510 turn），但 \$/turn 從 \$0.692 → \$0.713 只變了 3%。如果長 session 真是主因，**月對月應該越來越貴才對**。沒有。

更精確說：cache_read 在 Opus 兩個版本裡都佔 77–88% 的成本，數字大沒錯，但這個比例**從重度使用 Claude Code 那天就是這樣**——它是「你跟 LLM 對話」這件事的本質成本，不是「session 沒切短」的代價。`/clear` 救不了多少。

### ❌「idle > 5 分鐘就該 `/clear`」

直覺：cache TTL 5 分鐘，閒置一下就 expire，下個 turn 要重寫 cache。

數據反證：[第二篇 audit]({{< ref "/post/claude-code-cache-ttl-17-days" >}}) 的數據顯示主 agent 從 4/9 起連續 17 天 100% 寫 1h TTL，**沒有一個 5m 寫入**。也就是說 idle 一陣子回來，cache 還在，沒有額外 write 成本。

被 5m 強制降級的只有 sub-agent（同篇主題）。但 sub-agent 4 月只佔總成本的小頭（粗估 \$1,500），跟 \$25K 的 4.7 差兩個量級。

### ❌「Skill 太多」

直覺：載很多 skill 會把 metadata 灌進每個 turn 的 system prompt。

數據反證：實際算過，40 個 skill 的描述加起來大概 5–10K token。在 425K 的 per-call prefix 裡占 1–2%。**全砍光月省不到 \$1K**，根本不值得花時間整理。

### ❌「MCP server 太多」

直覺：MCP tool definition 每個 turn 都進 prefix。

數據反證：實測設定就 3–4 個 MCP（pixel-mcp、Google Workspace 三件套），其中幾個還連不上根本沒載。已經很精簡，沒得省。

### ❌「CLAUDE.md 太長」

直覺：CLAUDE.md 每個 turn 重讀。

數據反證：根目錄那個 CLAUDE.md 是 **1 byte**（基本是空的），全域那個 0 byte。零影響。

> 這五條建議不是說在所有情境都錯。對某些 case 可能有效——例如真的塞了 50K token CLAUDE.md、或載了 20 個 MCP server。但作為**通用建議**到處傳，預設大家都該照做，數據顯示對重度使用的 single-project workflow 幫助微乎其微。

## ✅ 真正有效的兩件事

打臉完直覺，剩下兩條在數據上站得住：

### 1. settings.json 鎖具體 model 版本

別用 `opus` / `sonnet` 這種 alias。Anthropic 發新版時 alias 會自動指過去——對使用者完全透明，但 quota 行為差很多。

```json
{
  "model": "claude-opus-4-6",
  "permissions": { "...你原本的..." }
}
```

這樣下次有 opus-4.8 / 4.9 出來不會自動跟。新版**不一定更划算**——以 4.6 vs 4.7 來說：

- \$/turn 多 9%
- Output/turn 多 190%
- Quota burn 多 140%
- 完成同樣事的 turn 數只少 12%

CP 值反而是 4.6 高 1.9 倍。每次新 model release 該主動看 [cnighswonger 的 advisory](https://github.com/cnighswonger/claude-code-cache-fix) 跟自己跑一陣子量數據再決定要不要升。

> **關於 adaptive thinking**：4.7 燒得兇主要是因為 adaptive thinking 把 reasoning chain 計入 output token。Opus 4.6 / Sonnet 4.6 可以用 `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` 關掉，但 **Opus 4.7 強制開、不能關**——這是「鎖 4.6」比「想辦法救 4.7」更可行的根本原因。Auto mode 跟 adaptive thinking 是兩件獨立的事，鎖回 4.6 不影響 auto mode 使用。

### 2. 把 review / fix / test 切到 Sonnet

\$/turn 差 16 倍是真的（Opus \$0.71 vs Sonnet \$0.045）。我 4 月 14K turn 用 Sonnet 完成只花 \$643，同樣 turn 用 Opus 4.6 會是 \$10K。

值得切到 Sonnet 的場景：

- Code review、看 PR diff
- 修小 bug、補 type、補 null check
- 寫測試、補測試 case
- 文件、commit message、changelog
- 重命名、簡單 refactor

需要 Opus 的場景：

- 跨多個檔案的架構重寫
- 需要長 reasoning chain 的設計決策
- 複雜 debug（race condition、memory leak）
- 第一次接觸的陌生 codebase 摸索

操作方式：在 session 裡 `/model claude-sonnet-4-6` 切過去做幾輪，做完 `/model claude-opus-4-6` 切回來。**不要在 settings 鎖死 Sonnet**——你會在需要 Opus 時忘記切。

## 對照真實量級

把上面兩條動手做完，預期月成本變化（以 4 月 \$77K 為基準）：

| 動作 | 預期省 | 占月帳比例 |
|------|-------|-----------|
| settings 鎖 4.6（取消 4.7 自動跟）| \$25K/月 | 32% |
| review/fix/test 切 Sonnet（擴到 30% turn）| \$10–15K/月 | 13–20% |
| **合計** | **\$35–40K/月** | **45–52%** |

剩下的 50% 是「重度用 Opus 4.6 寫主力專案」的本質成本，沒得省也不該省——那是工作本身。

## 教訓

把自己當 dataset 做完事後驗證，最大的收穫不是省了多少錢，是看到**社群常見直覺有多不可靠**。

「session 短 = 省錢」「skill 少 = 乾淨」這些建議在某些場景可能對，但**對 single-project heavy-use 的工作流完全錯**。如果不是把整段成本拆解到 model × session × turn，根本不會發現「Opus 4.7 alias 升級」是 4 月變貴的單一最大原因。

更廣的教訓：

1. **流傳的優化 tips 是雜訊**——沒數據支撐的「省錢建議」很多時候會讓你優化錯地方
2. **依賴 alias 等於把 cost control 交給供應商**——alias 機制本身不是壞事，但對訂閱用戶 quota 規劃是潛在風險
3. **多模型策略比單一模型優化更有效**——同樣一塊錢，Sonnet 能做 16 倍的 turn 量

如果你也想自己掃，[第一篇文章]({{< ref "/post/claude-code-cache-ttl-audit" >}}) 那段 60 行 Python 直接拿去用，改一下 cost 計算就能跑出本篇的數據。把自己當 dataset，再確認過一次社群在傳的事是不是真的。

[前情提要：Claude Code session cost 跟 cache 成本的常見誤解]({{< ref "/post/claude-code-session-cost-cache-misconception" >}})

## 參考資源

- [Cache TTL silently regressed — GitHub Issue #46829](https://github.com/anthropics/claude-code/issues/46829)
- [Subagent trailing block missing cache_control — Issue #50213](https://github.com/anthropics/claude-code/issues/50213)
- [Widespread quota drain since 2026-03-23 — Issue #41930](https://github.com/anthropics/claude-code/issues/41930)
- [cnighswonger/claude-code-cache-fix](https://github.com/cnighswonger/claude-code-cache-fix) — Opus 4.7 quota burn advisory + cache fix proxy
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Anthropic: Claude quota drain not caused by cache tweaks — The Register](https://www.theregister.com/2026/04/13/claude_code_cache_confusion/)
