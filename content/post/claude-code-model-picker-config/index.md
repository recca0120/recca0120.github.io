---
title: 'Claude Code /model 選單怎麼加舊版 model？3 種方法實測與踩坑紀錄'
description: 'Opus 4.7 自動升級後想切回 4.6，但 /model 選單沒選項。實測 availableModels、modelOverrides、ANTHROPIC_CUSTOM_MODEL_OPTION 三種設定，整理 GitHub 社群討論與推薦配置。'
slug: claude-code-model-picker-config
date: '2026-04-27T01:07:00+08:00'
image: featured.png
categories:
- AI
tags:
- claude-code
- cost-optimization
draft: false
---

Opus 4.7 上線那天，Claude Code 的 `opus` alias 自動指向新版。沒有通知、沒有 changelog 提醒，打開 `/model` 選單一看——舊版 Opus 4.6 消失了。

之前寫過[三個月帳單分析]({{< ref "/post/claude-code-3-month-billing-postmortem" >}})，結論是 4.7 的 quota burn 是 4.6 的 2.4 倍。想切回去，但 picker 裡就是沒有。花了一個下午把所有設定方式都試過，順便把 GitHub 上的相關討論整理起來。

## 三種設定機制

Claude Code 目前有三種方式可以動 `/model` 選單的內容。

### 1. `availableModels`：取代，不是擴充

在 `~/.claude/settings.json` 加：

```json
{
  "availableModels": [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5"
  ]
}
```

效果是 `/model` 選單**只剩這三個**。預設的 opus / sonnet / haiku alias 全部消失，被你列的清單取代。

這是最大的坑：很多人以為 `availableModels` 是「在預設清單上面再加幾個」，結果一設完發現原本的選項全不見了。

### 2. `modelOverrides`：給 Bedrock / Vertex 用的

```json
{
  "modelOverrides": {
    "claude-opus-4-7": "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-opus-4-7-v1:0"
  }
}
```

它的用途是把 model ID 映射到其他 provider 的 endpoint。如果你直連 Anthropic API，這個設定沒用。

### 3. `ANTHROPIC_CUSTOM_MODEL_OPTION`：加一個，只能一個

v2.1.78 開始支援的環境變數，會在 `/model` 選單底部多一個自訂選項：

```bash
export ANTHROPIC_CUSTOM_MODEL_OPTION="claude-opus-4-6[1m]"
export ANTHROPIC_CUSTOM_MODEL_OPTION_NAME="Opus 4.6 (1M)"
export ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION="Opus 4.6 with 1M context window"
```

不會動到預設選單，但**只能加一個**。想同時加 Opus 4.6 和 Sonnet 4.6 1M？沒辦法，沒有 `ANTHROPIC_CUSTOM_MODEL_OPTION_2` 這種東西。

## 踩過的坑

### aliases 在 availableModels 裡會被忽略

直覺上會想這樣寫：

```json
{
  "availableModels": ["opus", "sonnet", "haiku", "claude-opus-4-6[1m]"]
}
```

結果 picker 只出現 4 個選項，而且 `opus`、`sonnet`、`haiku` 跟內建的重複時行為不一致。aliases 不是合法的 model ID，放進去要看運氣。要放就放完整的 model ID。

### 同系列 model 只顯示一個

`availableModels` 如果放了 `claude-opus-4-6` 和 `claude-opus-4-7`，同系列會被 dedup，可能只出現一個。這個行為沒有文件記載。

### 鎖版本要用 `model`，不是 `availableModels`

`availableModels` 控制的是選單裡有什麼，但啟動時用哪個 model 是 `model` 欄位決定的：

```json
{
  "model": "claude-opus-4-6[1m]",
  "availableModels": ["claude-opus-4-6[1m]", "claude-sonnet-4-6", "claude-haiku-4-5"]
}
```

兩個要一起設。只設 `availableModels` 不設 `model`，啟動時還是用預設 alias 指向的最新版。

## GitHub 社群怎麼說

這不是只有我遇到的問題。GitHub 上一堆相關 issue，整理如下：

### [#14443](https://github.com/anthropics/claude-code/issues/14443) — 要求 picker 可配置多個自訂 model

使用者 joerivwijn 提出希望 `/model` picker 能透過 settings.json 自由配置。特別是 Bedrock 用戶，model ID 格式不同（需要 `us.` 前綴和 `:0` 後綴），預設 picker 完全對不上。

**結果：** 被 bot 標為 #12969 的 duplicate 後自動關閉。

### [#12738](https://github.com/anthropics/claude-code/issues/12738) — Opus 4.5 從 picker 消失

使用者 grigb 回報 Max plan 在 CLI 看不到 Opus 4.5，Web app 有但 CLI 沒有。後續多人跟進：

- **cleanspin** 指出 `/model opus` 指向 Opus 4.1 而非 4.5，alias 映射過時。Workaround：打完整 model ID `/model claude-opus-4-5-20251101`
- **todddrinkwater** 回報 VS Code extension 也開始出現同樣問題
- **zerzerzerz**、**PavelProdan** 附截圖，確認「昨天還在，今天消失」

這個 pattern 在每次新 model 發布後都會重演：alias 指向新版，舊版從 picker 消失，沒有任何通知。

**結果：** 因長期不活躍被 bot 自動關閉。

### [#35630](https://github.com/anthropics/claude-code/issues/35630) — ANTHROPIC_CUSTOM_MODEL_OPTION 文件缺失

使用者 coygeek 發現 v2.1.78 的 changelog 提到這組環境變數，但官方文件完全沒寫。

**結果：** 已修復，env-vars 和 model-config 兩個文件頁面都補上了說明。

### 其他相關 open issues

| Issue | 問題 |
|---|---|
| [#52310](https://github.com/anthropics/claude-code/issues/52310) | Bedrock 上 `availableModels` 被忽略，每個系列只顯示一個 |
| [#47164](https://github.com/anthropics/claude-code/issues/47164) | 企業自訂 model ID 無法出現在互動式 picker |
| [#40501](https://github.com/anthropics/claude-code/issues/40501) | settings.json 的 model 與內建選項重複時出現雙重項目 |
| [#49566](https://github.com/anthropics/claude-code/issues/49566) | `ANTHROPIC_DEFAULT_*_MODEL` 在 Bedrock 上導致重複的 "Custom" 項目 |
| [#53006](https://github.com/anthropics/claude-code/issues/53006) | VS Code extension 缺少 Sonnet 4.6 |
| [#38238](https://github.com/anthropics/claude-code/issues/38238) | WSL2 環境下 1M context model 不顯示 |

可以看出問題集中在兩個方向：**alias 映射延遲**和**沒有「擴充預設清單」的機制**。

## 推薦設定

綜合以上，目前最務實的做法：

**`~/.claude/settings.json`**（全域）：

```json
{
  "model": "claude-opus-4-6[1m]",
  "availableModels": [
    "claude-opus-4-6[1m]",
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5"
  ]
}
```

**`~/.zshrc`**（用 `ANTHROPIC_CUSTOM_MODEL_OPTION` 多加一個 Sonnet 1M）：

```bash
export ANTHROPIC_CUSTOM_MODEL_OPTION="claude-sonnet-4-6[1m]"
export ANTHROPIC_CUSTOM_MODEL_OPTION_NAME="Sonnet 4.6 (1M)"
export ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION="Sonnet 4.6 with 1M context window"
```

這樣 `/model` 選單會有 5 個選項：4 個來自 `availableModels`，1 個來自環境變數。

如果你只是想鎖版本不管選單，最簡單的方式是只加一行：

```json
{
  "model": "claude-opus-4-6[1m]"
}
```

預設選單不動，但每次啟動都用 Opus 4.6。需要臨時切換時用 `/model claude-opus-4-7` 手打完整 ID。

## 結論

Claude Code 的 model picker 設計假設是「大家都想用最新版」，沒有考慮到版本鎖定和回退的需求。目前沒有「保留預設選單 + 額外加自訂」的乾淨方案，`availableModels` 是取代式、`ANTHROPIC_CUSTOM_MODEL_OPTION` 只能一個。

GitHub 上相關 issue 開了不少，但大部分被 bot 標 duplicate 或 stale 關掉，官方沒有明確表示要改善。

如果你也在掙扎 quota，先把 `model` 鎖住是最直接的。選單的事，等官方吧。

## 參考資源

- [Claude Code Model Configuration](https://docs.anthropic.com/en/docs/claude-code/settings#model-configuration) — 官方 model 設定文件
- [Claude Code Environment Variables](https://docs.anthropic.com/en/docs/claude-code/settings#environment-variables) — 環境變數參考
- [#14443 — Configure custom models in /model picker](https://github.com/anthropics/claude-code/issues/14443)
- [#12738 — Opus 4.5 missing from model picker](https://github.com/anthropics/claude-code/issues/12738)
- [#35630 — ANTHROPIC_CUSTOM_MODEL_OPTION env var missing from docs](https://github.com/anthropics/claude-code/issues/35630)
- [#52310 — Bedrock availableModels ignored](https://github.com/anthropics/claude-code/issues/52310)
