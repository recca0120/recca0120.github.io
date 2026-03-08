---
title: '用 Biome 取代 ESLint + Prettier：快 35 倍，一個工具搞定'
date: '2026-03-10T09:00:00+08:00'
slug: biome-eslint-prettier-replacement
description: 'Biome 是用 Rust 寫的前端工具鏈，formatter 比 Prettier 快 35 倍，455 條 lint 規則涵蓋 ESLint + TypeScript ESLint，一個 biome.json 取代五個設定檔，支援自動遷移。'
categories:
  - Tools
tags:
  - biome
  - eslint
  - prettier
  - typescript
  - developer-tools
---

專案根目錄一堆設定檔：`.eslintrc.json`、`.eslintignore`、`.prettierrc`、`.prettierignore`、`lint-staged.config.js`。
改一條規則，要跑完整個 ESLint 再跑 Prettier，commit 前等個五秒。
[Biome](https://biomejs.dev/) 一個工具、一個設定檔、快 35 倍。

## Biome 是什麼

Biome 是用 Rust 寫的前端工具鏈，把 formatter 和 linter 合進一個 CLI。它的 formatter 跟 Prettier 有 97% 的相容性，linter 有 455 條規則，涵蓋原本要裝 ESLint + TypeScript ESLint + 好幾個 plugin 才能有的功能。

支援的語言：JavaScript、TypeScript、JSX、TSX、JSON、CSS、HTML、GraphQL。

AWS、Google、Microsoft、Discord、Vercel、Cloudflare 都在用。

## 安裝

```bash
# npm（-E 固定版本號，避免不同機器行為不一致）
npm i -D -E @biomejs/biome

# pnpm
pnpm add -D -E @biomejs/biome

# yarn
yarn add -D -E @biomejs/biome
```

初始化設定檔：

```bash
npx @biomejs/biome init
```

會產生一個 `biome.json`：

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  }
}
```

## 三個核心指令

```bash
# 格式化（改動檔案）
npx @biomejs/biome format --write .

# Lint 並自動修正
npx @biomejs/biome lint --write .

# 一次全做：format + lint + 整理 import
npx @biomejs/biome check --write .
```

CI 環境用 `biome ci`，它在有問題時會回傳 non-zero exit code，讓 pipeline 失敗：

```bash
npx @biomejs/biome ci .
```

## 設定檔 biome.json

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",  // "space" 或 "tab"
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",        // 單引號
      "trailingCommas": "all",       // 尾隨逗號
      "semicolons": "asNeeded"       // 不強制加分號
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noDebugger": "error"
      },
      "correctness": {
        "noUnusedVariables": {
          "level": "warn",
          "fix": "none"            // 偵測但不自動修正
        }
      }
    }
  },
  "organizeImports": {
    "enabled": true
  },
  "files": {
    "ignore": ["dist/**", "node_modules/**", "*.min.js"]
  }
}
```

### 語言特定設定

不同語言可以有不同規則，例如 JSON 不需要 format：

```json
{
  "json": {
    "formatter": {
      "enabled": false
    }
  }
}
```

### Lint 規則分類

Biome 把規則分成八個群組：

- **correctness**：保證會出錯或沒用的程式碼
- **suspicious**：可能有問題的寫法
- **style**：一致的程式碼風格
- **complexity**：過度複雜的寫法
- **performance**：效能問題
- **security**：安全漏洞
- **a11y**：無障礙性問題
- **nursery**：新的實驗性規則

關掉某個群組：

```json
{
  "linter": {
    "rules": {
      "a11y": "off"
    }
  }
}
```

## 從 ESLint + Prettier 遷移

Biome 提供自動遷移指令：

```bash
# 從 Prettier 遷移
npx @biomejs/biome migrate prettier --write

# 從 ESLint 遷移
npx @biomejs/biome migrate eslint --write
```

`migrate prettier` 會把 `.prettierrc` 的設定轉成 `biome.json` 的 formatter 設定。

`migrate eslint` 會讀 `.eslintrc.json`（或 flat config），把能對應的規則轉過來，無法對應的會留下註解說明。

遷移完之後：

```bash
# 移除舊工具
npm uninstall eslint prettier @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-config-prettier eslint-plugin-prettier

# 刪掉舊設定檔
rm .eslintrc.json .eslintignore .prettierrc .prettierignore
```

然後跑一次確認：

```bash
npx @biomejs/biome check --write .
```

## package.json scripts 更新

遷移前：

```json
{
  "scripts": {
    "lint": "eslint --ext .ts,.tsx src",
    "format": "prettier --write src"
  }
}
```

遷移後：

```json
{
  "scripts": {
    "lint": "biome lint --write .",
    "format": "biome format --write .",
    "check": "biome check --write ."
  }
}
```

## 配合 Lefthook 用

如果有裝 [Lefthook 管理 Git hooks](/p/lefthook-git-hooks/)，把 husky + lint-staged 換成：

```yaml
# lefthook.yml
pre-commit:
  commands:
    biome:
      glob: "*.{js,ts,jsx,tsx,json,css}"
      run: npx @biomejs/biome check --write {staged_files}
      stage_fixed: true
```

一個指令取代原本的 ESLint + Prettier + lint-staged 三個工具。

## 效能實測

官方數據：在 Intel Core i7 1270P 上，格式化 171,127 行程式碼（2,104 個檔案），Biome 比 Prettier 快 **35 倍**。

實際感受：大型專案跑 `biome check` 通常在 1 秒內完成，原本 ESLint + Prettier 要 10-15 秒的，差距很明顯。

## 小結

不是所有 ESLint plugin 都有對應的 Biome 規則，如果你依賴特定 plugin（例如 `eslint-plugin-import` 的某些規則），要先確認 Biome 有沒有等效的。多數常見的 TypeScript ESLint 規則都有，遷移成功率高。

試一個小專案，如果沒問題再推到主要專案。
