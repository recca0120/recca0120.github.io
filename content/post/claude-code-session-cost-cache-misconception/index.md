---
title: 'Claude Code 的 session 開太久很浪費 token？一個多數人搞錯的成本模型'
description: '很多人以為 Claude Code session 開太久會浪費 token，於是頻繁 /clear。但因為 prompt caching 給 10% 的價格折扣，頻繁 clear 反而更貴。拆解真正影響成本的三個變數。'
slug: claude-code-session-cost-cache-misconception
date: '2026-04-13T18:00:00+08:00'
image: featured.jpg
categories:
- AI
tags:
- claude-code
- prompt-caching
- ai-agent
- cost-optimization
draft: false
---

身邊開發者常有這個直覺：Claude Code 的 session 開太久，context 會越滾越大，每一次對話都把前面所有歷史重送一次，token 費用也就線性疊加。結論：要省錢就勤勞 `/clear`，每個任務開新 session。

這個推論**對了一半，錯了另一半**。錯的那半，是因為多數人沒把 prompt caching 算進成本模型。實際上用下來，**頻繁 `/clear` 可能比保持長 session 還貴**。

## 累積 context 的成本是真的

先說對的部分。LLM 的 API 是 stateless 的——每次 API call，整個 conversation history 都要完整重送一次。你跟 Claude 講了 10 輪對話，第 11 輪送出去的 input 就是前 10 輪的全部內容加上你這次的問題。

所以單次 API call 的 input token 數，確實會隨 session 變長而線性膨脹。看到這裡很合理地會得出「session 越久越貴」的結論。

## 但 prompt caching 把遊戲規則改了

Anthropic 從 2024 年開始提供 prompt caching，Claude Code 預設就開啟。規則很簡單：**相同前綴的內容只算 10% 的錢**。

Sonnet 4.6 的定價：

| 類型 | 價格（每百萬 token） | 相對價 |
|------|---------------------|--------|
| Base input（未 cached） | $3.00 | 100% |
| 5 分鐘 cache write | $3.75 | 125% |
| 1 小時 cache write | $6.00 | 200% |
| Cache read | **$0.30** | **10%** |

Opus 更誇張，base input $5，cache read 只要 $0.50。

這代表：你第一次送出一大段 context 會被寫入 cache，付寫入成本（比 base 稍貴 25%）；接下來 5 分鐘內，同樣的前綴重送一次只收 10%。會話越長、cache hit 越多次，平均單價就越低。

## 「前綴」是什麼意思

理解 cache 之前先搞懂「前綴」這個詞。prompt 是一長串有順序的 token，cache 的規則是**從開頭往下比對，一個 token 都不能差**，比對到哪裡就能讀到哪裡。

多輪對話時每一輪都**只往尾端追加**新內容，前面的歷史原封不動：

```
Turn 1: [system] [CLAUDE.md] [Q1]
Turn 2: [system] [CLAUDE.md] [Q1] [A1] [Q2]
         ↑ 跟 Turn 1 完全一樣的前綴，cache 命中 10% 價
                                    ↑ 新的部分，寫入 cache
Turn 3: [system] [CLAUDE.md] [Q1] [A1] [Q2] [A2] [Q3]
         ↑ 前面更長一段都命中
```

所以長對話在 cache 機制下**不是劣勢而是優勢**——累積越多，每輪被折扣的 token 就越多。

但這只對「一直往尾端加」的情境成立。如果你能**回頭改 Turn 5 的內容**，Turn 5 之後的所有 token 雖然字面上沒變，cache 也全部失效——因為前綴 hash 從 Turn 5 那個位置就對不上了。這就是「前綴」的殘忍之處：中間改一個字，後面全毀。

類比：git 的 commit hash chain，任何歷史 commit 動一下，後面每個 hash 都跟著變。

## 轉議題時 cache 怎麼計價

實務上最常忽略的情境：你跟 Claude 討論 A，做完後轉去問 B，再轉去問 C——**如果中間沒 `/clear`**，A 跟 B 的歷史會一直黏在 prompt 前綴裡，每一輪都被 10% 計費陪跑。

展開看：

```
討論 A（10 輪後累積 30K token）
  → A 的 30K 寫入 cache

轉到 B（不 clear）
  Turn 11 = [A 的 30K] + [B 新問題]
            ↑ 30K × $0.30/M = $0.009 從 cache 讀

討論 B 又累積 20K

轉到 C（還是不 clear）
  每一輪 = [A 的 30K] + [B 的 20K] + [C 新問題]
           ↑ 50K 從 cache 讀 ≈ $0.015 / turn
```

C 討論 20 輪，就是額外付 20 × $0.015 = $0.30 在「運屍體」。A、B 對 C 可能毫無幫助，但你一直在為它們陪跑付錢。

**判斷該不該 `/clear` 的原則**：

- **A、B、C 互相獨立**（早上改前端 / 下午寫 SQL / 晚上改 CI）→ 轉議題就 `/clear`
- **A、B、C 互相有引用**（A 定規格 / B 寫實作 / C 除錯 B）→ 不要 clear，歷史的 10% 很便宜也很有用
- **歷史佔比重但結論可濃縮**（A 是讀完 50K 的技術文件）→ clear 後用自己的話把 A 的結論貼過來當新 context

很多人誤以為「Claude Code 會自動判斷議題轉換、聰明地丟舊內容」。**並不會**。cache 是機械性的前綴比對，它不懂語意、看不出話題切換。丟棄舊內容的決定**完全是人類的責任**——要嘛手動 `/clear`，要嘛等 auto-compact 觸發（這是看 context 使用率，不是議題）。

## 真正決定成本的三個變數

所以成本模型不是「context 大小 × 對話次數」，而是三個更關鍵的因素：

### 一、cache hit rate

長 session 連續工作時，每一次 turn 的前綴都能命中前一次寫進去的 cache。假設 session 已累積 50K token，第 11 輪新增 2K 輸入：

- 無 cache：51K × $3 = $0.153
- 有 cache：50K × $0.30 + 2K × $3 = $0.021

差距大約 **7 倍**。

**頻繁 `/clear` 最糟的地方**：每次新 session 都要重新讀 `CLAUDE.md`、重新認識專案檔案、重新暖 cache。這些動作加總起來，可能比維持同一個 session 連續工作還貴。

### 二、cache invalidation

cache 需要**前綴 100% 相同**才會命中。下面這些動作會讓 cache 失效——有些很顯眼，有些很默默：

| 狀況 | 影響範圍 |
|------|---------|
| 編輯第 N 輪訊息 | 第 N 輪之後全失效（前面還在） |
| 加／拿掉 MCP tool | 全段失效（tool schema 在最前面） |
| 切 Sonnet → Opus | 不同 model 不同 cache，等於重來 |
| 開關 web search、citations | system + message cache 失效 |
| idle > 5 分鐘（TTL 過期） | cache 蒸發，下一發付 100% 重新寫入 |
| 觸發 auto-compact | 壓縮後前綴被換成摘要，後續輪數從新前綴重暖 cache |
| `/clear` | 全部歸零 |

idle 超過 5 分鐘是最容易忽略的一個——去吃個飯回來繼續打字，那一輪其實已經偷偷付了全額寫入稅，只是 UI 沒告訴你。

auto-compact 的細節值得多說兩句：官方實作下，**壓縮那一次 API call 本身**的前綴跟壓縮前完全相同，所以是 cache hit；真正的代價是壓縮**之後**——新 session 用「摘要」取代了原本的完整歷史當前綴，從那一刻起後面每一輪都在從新前綴重暖 cache。所以結果上一樣要付重暖成本，只是機制不是「cache 被炸掉」而是「前綴被換掉」。

### 三、TTL（5 分鐘／1 小時）

預設 cache TTL 是 5 分鐘。如果你中斷 5 分鐘以上才回來繼續，cache 過期，下一發第一次 call 要付全額 base input。

Anthropic 另有 1 小時 TTL 選項，寫入成本變 2 倍（$6 vs $3），換更長的保存時間。用不用得到看使用節奏——斷斷續續工作、每 10-30 分鐘回來一次，可能 1h TTL 反而划算；連續工作根本不會 timeout，5m 就夠。

## 直覺反轉：什麼時候 long session 最划算

把上面三件事整合起來，就能得出跟「session 越久越貴」相反的結論。

**Long session 最便宜的情境**：

- 連續工作，每次互動間隔都在 5 分鐘內
- 不動歷史訊息、不切 model、不頻繁加減 MCP tools
- context 還沒逼近壓縮門檻（~155K 以下安全區）

**Short session / 頻繁 clear 最貴的情境**：

- 每次進來都要重新讀大量 context（CLAUDE.md、多個檔案、skill 定義）
- 每個新 session 都付一次「暖 cache 稅」
- 完全享受不到 cache read 的 10% 折扣

我自己的經驗：在同一個專案上連續開發 2 小時的成本，往往比把它切成 4 個獨立 30 分鐘 session 還低，因為後者要付 4 次冷啟動。

## 什麼時候 context 大**確實**是問題

但這不代表 context 無限滾下去沒差。有兩個門檻會讓「context 大」從成本問題變成**品質問題**：

**1. 接近 context window 上限**（Sonnet 200K / 1M、Opus 200K）

模型的注意力在 100K token 以上會開始下降，尤其是中間位置的內容（所謂 "lost in the middle" 現象）。這時候問題不是貴，而是模型**找不到或用錯了你前面給的資訊**。

**2. Auto-compact 觸發**

Claude Code 會在接近上限前自動壓縮。壓縮本身是一次大手術，cache 全毀，費用跳高，而且壓縮結果是摘要，細節可能丟失。

所以 context 不該無限長，但該 reset 的時機是「任務結束」或「即將觸發 compact」，不是「session 開了幾小時」。

## 實務建議

| 情境 | 建議 |
|------|------|
| 一個任務做到一半 | 不要 `/clear`，continue session |
| 任務做完、要開新任務 | `/clear`，讓下個 session cache 乾淨 |
| 中斷超過 5 分鐘 | 用 `/resume` 而不是重開新 session（前者觸發 cache TTL 失效但保留 history） |
| 常開 Claude Code 又常沒事做 | 考慮 1h TTL，寫入 2x 但 idle 時間有保障 |
| Context 超過 155K | 準備主動結束 session，別等 auto-compact |

想精確算你自己的成本，推薦用 [ccusage](https://github.com/ryoppippi/ccusage) 或 [claude-view](/2026/04/07/claude-view-mission-control/) 這類工具。看到 `cache_read_input_tokens` 佔比越高，代表你越會用；`cache_creation_input_tokens` 一直衝高而 read 不多，代表你 cache 常常失效、正在燒錢。

「session 越久越浪費」是個 stateless 世代的直覺，但 prompt caching 已經把遊戲規則改掉兩年了。檢查一下自己的 Claude Code 用法，說不定你省下來的 token 費用比你想像得多。

## 參考資源

- [Prompt Caching — Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Manage Costs Effectively — Claude Code Docs](https://code.claude.com/docs/en/costs)
- [How Prompt Caching Actually Works in Claude Code — Claude Code Camp](https://www.claudecodecamp.com/p/how-prompt-caching-actually-works-in-claude-code)
- [How Context Compounding Works in Claude Code — MindStudio](https://www.mindstudio.ai/blog/claude-code-context-compounding-explained-2)
- [ccusage — Claude Code Token Usage CLI](https://github.com/ryoppippi/ccusage)
