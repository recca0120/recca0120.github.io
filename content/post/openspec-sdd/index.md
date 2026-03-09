---
title: 'OpenSpec：讓 AI Coding Assistant 照規格做事，不要亂寫'
date: '2026-03-08T09:00:00+08:00'
slug: openspec-sdd
image: cover.jpg
description: 'OpenSpec 是 spec-driven development 框架，在 AI 寫程式之前先對齊需求。propose 產出規格文件，apply 按規格實作，archive 歸檔完成的變更。支援 Claude Code、Cursor、Copilot 等 30+ 工具。'
categories:
  - Tools
  - DevOps
tags:
  - openspec
  - ai
  - sdd
  - claude-code
  - cursor
  - developer-tools
  - workflow
---

用 AI coding assistant 寫程式，最常見的問題不是它寫不出來，而是寫出來的東西跟你想的不一樣。

你說「加一個 dark mode」，它可能改了 CSS 變數、加了 toggle button、還順手重構了 layout——但你其實只想改顏色 token。下次新對話，上下文消失，它又從頭猜你的意圖。

[OpenSpec](https://openspec.dev/) 解決這個問題：在 AI 動手寫 code 之前，先產出一份規格文件，雙方對齊「要做什麼」和「怎麼做」，然後照規格實作。

## 核心架構

OpenSpec 把你的專案知識分成兩塊：

```
openspec/
├── specs/              ← 系統的 source of truth（目前行為）
│   ├── auth/
│   │   └── spec.md
│   └── payments/
│       └── spec.md
└── changes/            ← 進行中的修改（每個 change 一個資料夾）
    ├── add-dark-mode/
    └── archive/        ← 完成的修改歸檔在這
```

**Specs** 描述系統目前的行為。**Changes** 是對系統的修改提案。兩者分開管理，可以同時進行多個 change 不衝突。

## 安裝

需要 Node.js 20.19.0+：

```bash
npm install -g @fission-ai/openspec@latest
cd your-project
openspec init
```

支援 npm、pnpm、yarn、bun、nix。

## 基本工作流：propose → apply → archive

### 1. Propose：提出變更

```
/opsx:propose add-dark-mode
```

AI 一次產出四個 artifact：

```
openspec/changes/add-dark-mode/
├── proposal.md       # 為什麼要做、範圍（in/out of scope）
├── specs/            # Delta spec：這次修改加了/改了/刪了什麼行為
│   └── ui/
│       └── spec.md
├── design.md         # 技術方案、架構決策
└── tasks.md          # 實作清單（checkbox）
```

每個 artifact 有明確職責：

| Artifact | 回答的問題 |
|---|---|
| `proposal.md` | 為什麼做？範圍是什麼？ |
| `specs/` | 系統行為改了什麼？（Delta） |
| `design.md` | 技術上怎麼做？用什麼架構？ |
| `tasks.md` | 實作分幾步？做到哪了？ |

### 2. Apply：按規格實作

```
/opsx:apply
```

AI 照著 `tasks.md` 逐項實作，完成一項打一個勾：

```
Working on 1.1: Create ThemeContext...
✓ 1.1 Complete

Working on 1.2: Add CSS custom properties...
✓ 1.2 Complete
```

不會跑去做清單以外的事。中斷了下次可以繼續。

### 3. Archive：歸檔

```
/opsx:archive
```

歸檔時做兩件事：
1. **Delta spec 合併**進 `openspec/specs/`（更新 source of truth）
2. **Change 資料夾搬到** `openspec/changes/archive/2026-03-08-add-dark-mode/`

規格隨著每次歸檔逐步長大，形成完整的系統行為文件。

## Spec 的格式

Spec 是行為契約，不是實作細節。用 requirement + scenario 描述：

```markdown
# Auth Specification

## Purpose
Authentication and session management.

## Requirements

### Requirement: User Authentication
The system SHALL issue a JWT token upon successful login.

#### Scenario: Valid credentials
- GIVEN a user with valid credentials
- WHEN the user submits login form
- THEN a JWT token is returned
- AND the user is redirected to dashboard

#### Scenario: Invalid credentials
- GIVEN invalid credentials
- WHEN the user submits login form
- THEN an error message is displayed
- AND no token is issued
```

用 Given/When/Then 描述情境，每個 scenario 都是可測試的。RFC 2119 關鍵字（MUST/SHALL/SHOULD/MAY）表達需求強度。

## Delta Spec：描述「改了什麼」

這是 OpenSpec 最重要的概念。修改不重寫整份 spec，而是描述差異：

```markdown
# Delta for Auth

## ADDED Requirements

### Requirement: Two-Factor Authentication
The system MUST support TOTP-based two-factor authentication.

#### Scenario: 2FA login
- GIVEN a user with 2FA enabled
- WHEN the user submits valid credentials
- THEN an OTP challenge is presented

## MODIFIED Requirements

### Requirement: Session Expiration
The system MUST expire sessions after 15 minutes of inactivity.
(Previously: 30 minutes)

## REMOVED Requirements

### Requirement: Remember Me
(Deprecated in favor of 2FA.)
```

三個 section 各有意義：

| Section | 意思 | 歸檔時的動作 |
|---|---|---|
| `ADDED` | 新行為 | 加進 main spec |
| `MODIFIED` | 改了現有行為 | 取代原本的 requirement |
| `REMOVED` | 拿掉的行為 | 從 main spec 刪除 |

為什麼用 delta 而不是重寫整份 spec？**因為兩個平行的 change 可以各自修改同一份 spec 的不同 requirement，不會衝突。**

## 探索模式：不確定要做什麼的時候

```
/opsx:explore
```

先跟 AI 討論，它會分析 codebase、比較方案、畫架構圖。不產出任何 artifact，想清楚了再 `/opsx:propose`。

```
You: /opsx:explore
AI:  What would you like to explore?

You: How should we handle authentication for the mobile app?
AI:  Let me investigate your current auth setup...
     I see you're using session-based auth for the web app.
     For mobile, we have three options:
     1. JWT tokens (stateless, works offline)
     2. OAuth2 (third-party login)
     3. Extend current sessions (simpler)

You: Let's go with JWT.
AI:  Ready. Run /opsx:propose add-jwt-auth to begin.
```

## 進階命令

### Expanded Workflow（需切換 profile）

```bash
openspec config profile   # 選擇 expanded workflow
openspec update           # 更新 AI 指令
```

| 命令 | 用途 |
|---|---|
| `/opsx:new` | 只建資料夾，不產 artifact（手動控制節奏） |
| `/opsx:continue` | 按依賴順序產出下一個 artifact |
| `/opsx:ff` | 快進，一次產出所有 artifact |
| `/opsx:verify` | 驗證實作是否符合 spec |
| `/opsx:sync` | 手動合併 delta spec（不歸檔） |
| `/opsx:bulk-archive` | 批量歸檔多個 change |
| `/opsx:onboard` | 導覽教學，用你的 codebase 跑一遍完整流程 |

### continue vs ff

`/opsx:continue` 一次產一個 artifact，讓你逐步審查：

```
proposal → (review) → specs → (review) → design → (review) → tasks
```

`/opsx:ff` 全部一次產完，適合你已經很清楚要做什麼的時候。

### verify：三個維度的驗證

```
/opsx:verify
```

| 維度 | 驗證什麼 |
|---|---|
| **Completeness** | 所有 task 都做了？所有 requirement 都有對應實作？ |
| **Correctness** | 實作符合 spec 的意圖？邊界條件有處理？ |
| **Coherence** | 程式碼跟 design.md 的決策一致？命名慣例統一？ |

回報分三級：CRITICAL、WARNING、SUGGESTION。不會擋歸檔，但讓你知道有哪些問題。

## Schema：自訂 artifact 流程

預設的 `spec-driven` schema 流程是：

```
proposal → specs → design → tasks → implement
         ↘              ↗
          (design 只依賴 proposal，可以跟 specs 平行)
```

你可以自訂 schema，例如加一個 research 階段：

```yaml
# openspec/schemas/research-first/schema.yaml
name: research-first
artifacts:
  - id: research
    generates: research.md
    requires: []

  - id: proposal
    generates: proposal.md
    requires: [research]

  - id: tasks
    generates: tasks.md
    requires: [proposal]
```

```bash
openspec schema init research-first
```

## 支援的工具

OpenSpec 不綁定特定 AI 工具，支援 30+ 個 coding assistant：

| 工具 | 命令格式 |
|---|---|
| Claude Code | `/opsx:propose`, `/opsx:apply` |
| Cursor | `/opsx-propose`, `/opsx-apply` |
| Windsurf | `/opsx-propose`, `/opsx-apply` |
| GitHub Copilot (IDE) | `/opsx-propose`, `/opsx-apply` |
| Codex / Gemini CLI / Amazon Q | 各有整合方式 |

基本上任何支援讀取檔案和 slash command 的 AI 工具都能用。

## 跟其他工具的比較

| | OpenSpec | Spec Kit (GitHub) | Kiro (AWS) |
|---|---|---|---|
| 設計理念 | 輕量、流動 | 完整但重量級 | 功能強但綁 IDE |
| 階段控制 | 沒有 phase gate | 嚴格的階段門檻 | 綁定特定模型 |
| Brownfield | 原生支援（delta spec） | 需要完整重寫 | 有限 |
| 工具綁定 | 30+ 工具 | GitHub 生態系 | Kiro IDE only |
| 格式 | Markdown + Git | Markdown + Python | 內建格式 |

## 實際使用觀察

用了之後最大的感覺是：**AI 不再亂跑了。**

以前開一個新對話，要花很多時間重新解釋「這個專案長什麼樣、之前做了什麼決定」。現在 AI 讀 `openspec/specs/` 就知道了。

`proposal.md` 的 scope 區分（in scope / out of scope）特別有用。寫清楚「不做什麼」，AI 就不會「順手」做你沒要它做的事。

`design.md` 也有價值——它逼你在動手前先想清楚技術方案。很多時候在 design 階段就會發現「這個做法行不通，換一個」，省掉寫完才發現要重來的時間。

唯一的代價是多了一步：你不能直接跟 AI 說「幫我加 dark mode」然後等結果，要先 propose、review、再 apply。但這個代價換來的是可預測性和可追蹤性，對稍微有複雜度的專案來說值得。

**不適合的場景**：改一行 CSS、修一個 typo 這種程度的事，直接寫就好，不需要走 propose 流程。

## 小結

OpenSpec 不是取代 AI coding assistant，而是在它前面加一層規格。

核心概念：
- **Specs** — 系統行為的 source of truth
- **Changes** — 用 delta spec 描述修改，不重寫整份 spec
- **Artifacts** — proposal（為什麼）→ specs（改什麼）→ design（怎麼做）→ tasks（做什麼）
- **Archive** — 完成後合併 delta 進 main spec，形成系統的演化記錄

v1.2.0（2026 年 2 月），28k+ GitHub stars，MIT license。

## 參考資源

- [OpenSpec 官方網站](https://openspec.dev/) — 官方文件、快速入門與工具整合說明
- [OpenSpec npm 套件：@fission-ai/openspec](https://www.npmjs.com/package/@fission-ai/openspec) — 安裝與版本資訊
- [RFC 2119：需求強度關鍵字標準](https://www.rfc-editor.org/rfc/rfc2119) — MUST/SHALL/SHOULD/MAY 關鍵字的正式定義
- [Claude Code 官方文件](https://docs.anthropic.com/en/docs/claude-code) — 與 OpenSpec 整合的 AI coding assistant
