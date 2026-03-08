---
title: 'OpenSpec：讓 AI Coding Assistant 照規格做事，不要亂寫'
date: '2026-03-08T09:00:00+08:00'
slug: openspec-sdd
description: 'OpenSpec 是 spec-driven development 框架，在 AI 寫程式之前先對齊需求。propose 產出規格文件，apply 按規格實作，archive 歸檔完成的變更。支援 Claude Code、Cursor、Copilot 等 30+ 工具。'
categories:
  - DevTools
tags:
  - openspec
  - ai
  - sdd
  - claude-code
  - cursor
---

用 AI coding assistant 寫程式，最常見的問題不是它寫不出來，而是寫出來的東西跟你想的不一樣。

你說「加一個 dark mode」，它可能改了 CSS 變數、加了 toggle button、還順手重構了 layout——但你其實只想改顏色 token。下次新對話，上下文消失，它又從頭猜你的意圖。

[OpenSpec](https://openspec.dev/) 解決這個問題：在 AI 動手寫 code 之前，先產出一份規格文件，雙方對齊「要做什麼」和「怎麼做」，然後照規格實作。

## 核心概念

OpenSpec 是 Spec-Driven Development (SDD) 框架：

1. **Propose** — 描述你要改什麼，AI 產出 proposal、specs、design、tasks
2. **Apply** — AI 按照 tasks 清單一步步實作
3. **Archive** — 完成後歸檔，留下記錄

規格檔案直接存在你的 codebase 裡，用 Git 管理，跨對話不會消失。

## 安裝

需要 Node.js 20.19.0+：

```bash
npm install -g @fission-ai/openspec@latest
```

在專案裡初始化：

```bash
cd your-project
openspec init
```

這會在專案根目錄建立 `openspec/` 目錄結構，並註冊 slash commands 到你的 AI 工具。

支援 npm、pnpm、yarn、bun、nix。

## 基本工作流

### 1. Propose：提出變更

```
/opsx:propose add-dark-mode
```

AI 自動建立：

```
openspec/changes/add-dark-mode/
├── proposal.md       # 為什麼要做、改什麼
├── specs/            # 需求規格、使用者情境
├── design.md         # 技術方案
└── tasks.md          # 實作清單（checkbox）
```

`proposal.md` 記錄動機和範圍，`design.md` 記錄技術決策，`tasks.md` 是可追蹤的實作步驟。

你可以在這個階段審查、修改，確認方向對了再往下走。

### 2. Apply：按規格實作

```
/opsx:apply
```

AI 照著 `tasks.md` 的清單逐項實作，每完成一項打勾。不會跑去做清單以外的事。

### 3. Archive：歸檔

```
/opsx:archive
```

完成的變更搬到 `openspec/changes/archive/`，帶上日期前綴：

```
openspec/changes/archive/2026-03-09-add-dark-mode/
```

規格留在 codebase 裡，新人加入可以瀏覽 `openspec/specs/` 了解系統全貌。

## 為什麼需要這個

### 上下文不會消失

AI coding assistant 最大的問題是對話結束就失憶。OpenSpec 的規格存在檔案系統裡，新對話開始時 AI 可以讀取現有規格，知道系統長什麼樣。

```
openspec/specs/
├── auth-login/
├── auth-session/
├── checkout-cart/
└── checkout-payment/
```

### 審查意圖，不只審查程式碼

每次變更都產出 spec delta——需求層面的差異。Code review 看的是實作細節，spec review 看的是「這個變更改了系統的什麼行為」。

### 約束 AI 的行為範圍

沒有規格的時候，AI 會自己決定要做多少。有了 `tasks.md`，它就照清單做，不會「順手」重構你沒要它動的東西。

## 進階命令

除了基本的 propose → apply → archive，還有：

```bash
/opsx:continue       # 繼續上次未完成的工作
/opsx:ff             # 快進實作（跳過確認步驟）
/opsx:verify         # 驗證任務是否真的完成
/opsx:sync           # 同步規格（程式碼改了但規格沒更新時）
/opsx:bulk-archive   # 批量歸檔多個完成的變更
/opsx:onboard        # 新專案上線，掃描現有程式碼產出初始規格
```

`/opsx:onboard` 對 brownfield 專案特別有用——你不需要從零開始寫規格，AI 掃描現有程式碼幫你產出。

## 支援的工具

OpenSpec 不綁定特定 AI 工具，支援 30+ 個 coding assistant：

- **Claude Code** — 原生 slash command 整合
- **Cursor** — 透過 `.cursor/rules` 整合
- **GitHub Copilot** — 透過 Copilot Chat
- **Windsurf** / **Codex** / **Gemini CLI** 等

基本上任何支援讀取檔案和 slash command 的 AI 工具都能用。

## 設定 Profile

```bash
openspec config profile
```

可以選擇不同的工作流 profile，控制 AI 互動的風格和步驟細節度。

## 更新

```bash
# 更新全域 CLI
npm install -g @fission-ai/openspec@latest

# 更新專案內的 AI 指令
openspec update
```

## 跟其他工具的差別

| | OpenSpec | AI 內建 Plan Mode | 其他規劃工具 |
|---|---|---|---|
| 跨對話持久 | 規格存在檔案裡 | 對話結束就沒了 | 各有不同 |
| Brownfield 支援 | onboard 指令 | 不支援 | 通常要從零開始 |
| 工具綁定 | 30+ 工具 | 只在特定 IDE | 通常綁定 |
| 規格格式 | Markdown，Git 友善 | 不產出檔案 | 各有不同 |

## 實際使用感受

用了之後最大的感覺是：AI 不再亂跑了。

以前開一個新對話，要花很多時間重新解釋「這個專案長什麼樣、之前做了什麼決定」。現在 AI 讀 `openspec/specs/` 就知道了。

propose 階段的 `design.md` 也很有價值——它逼你（和 AI）在動手前先想清楚技術方案。很多時候在 design 階段就會發現「這個做法行不通，換一個」，省掉寫完才發現要重來的時間。

唯一的代價是多了一步：你不能直接跟 AI 說「幫我加 dark mode」然後等結果，你要先 propose、review、再 apply。但這個代價換來的是可預測性和可追蹤性，對稍微複雜一點的專案來說值得。

## 小結

OpenSpec 不是取代 AI coding assistant，而是在它前面加一層規格。

- **Propose** — 先對齊，不要讓 AI 猜
- **Apply** — 照規格做，不要多做
- **Archive** — 留記錄，下次不用重新解釋

v1.2.0（2026 年 2 月）是目前最新版，28k+ GitHub stars，MIT license。適合任何用 AI 寫 code 但覺得「它常常做的跟我想的不一樣」的人。
