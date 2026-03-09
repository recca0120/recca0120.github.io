---
title: '拋棄 Husky，用 Lefthook 讓 Git Hooks 快一倍'
date: '2026-03-08T09:00:00+08:00'
slug: lefthook-git-hooks
image: cover.jpg
description: '用 Go 寫的 Lefthook 一個 YAML 搞定所有 Git hooks，平行執行省掉一半 commit 等待時間，支援 monorepo、跨語言、本地覆寫，比 Husky + lint-staged 更快更簡單。'
categories:
  - Tools
  - DevOps
tags:
  - git
  - lefthook
  - husky
  - developer-tools
  - devops
---

每次 commit，就要等 ESLint、Prettier、TypeScript 檢查一個個跑完。
三個工具，三倍的等待。
[Lefthook](https://github.com/evilmartians/lefthook) 平行跑，省掉一半時間。

## 為什麼換掉 Husky

Husky 搭配 lint-staged 是目前最常見的 Git hooks 方案，但用久了會發現幾個問題。

**設定分散**：Husky v8 把 hook 邏輯放在 `.husky/` 目錄的 shell script 裡，lint-staged 的規則卻在 `package.json` 或 `.lintstagedrc`。想知道 pre-commit 到底跑了什麼，要翻好幾個地方。

**Node.js 啟動成本**：每次 commit，Husky 要先啟動 Node.js runtime，才能執行 lint-staged。在大型專案裡，這個啟動時間加起來很可觀。

**循序執行**：lint-staged 預設一個一個跑，ESLint 跑完才輪到 Prettier，完全沒用到現代 CPU 的多核心能力。

**依賴膨脹**：Husky + lint-staged 加起來大約 1,500 個依賴進 `node_modules`。

Lefthook 解決了這四個問題：Go binary 無需 runtime、一個 `lefthook.yml` 管所有 hooks、預設平行執行、零額外依賴。

## 安裝

Lefthook 支援多種安裝方式，不綁定任何語言或 runtime。

```bash
# npm（前端專案最方便）
npm install lefthook --save-dev

# Homebrew（macOS）
brew install lefthook

# Go
go install github.com/evilmartians/lefthook/v2@latest

# Python（用 pipx 安裝，不污染全域環境）
pipx install lefthook
```

安裝完後，在專案根目錄初始化：

```bash
lefthook install
```

這個指令會在 `.git/hooks/` 建立對應的 hook 檔，讓 Git 知道要透過 Lefthook 執行。

## 基本設定

所有設定都在根目錄的 `lefthook.yml`。

```yaml
# lefthook.yml
pre-commit:
  parallel: true          # 平行執行所有 commands
  commands:
    lint:
      glob: "*.{ts,tsx}"
      run: npx eslint {staged_files} --fix
      stage_fixed: true   # 自動把修正後的檔案加回 staging

    format:
      glob: "*.{ts,tsx,json,md}"
      run: npx prettier --write {staged_files}
      stage_fixed: true

    typecheck:
      run: npx tsc --noEmit

commit-msg:
  commands:
    lint-message:
      run: npx commitlint --edit {1}
```

幾個重點：

- **`{staged_files}`**：Lefthook 內建的 template variable，自動帶入 staged 檔案清單
- **`glob`**：只對符合 pattern 的檔案執行，如果沒有符合的 staged 檔案，這個 command 直接跳過
- **`stage_fixed: true`**：lint 或 format 工具自動修改檔案後，重新 `git add`，不需要手動再加
- **`parallel: true`**：lint、format、typecheck 三個同時跑

## Template Variables

Lefthook 提供幾個常用的 placeholder，會在執行時自動展開：

| Variable | 說明 |
|----------|------|
| `{staged_files}` | 目前 staging area 的檔案（pre-commit 用） |
| `{push_files}` | 這次 push 包含的檔案（pre-push 用） |
| `{all_files}` | 符合 glob 的所有檔案 |
| `{files}` | 由 `files` 選項自訂的檔案清單 |
| `{1}`, `{2}` | Hook 傳入的參數（例如 commit-msg 的訊息檔路徑） |

## Monorepo 支援

`root` 選項讓 Lefthook 特別適合 monorepo。只有對應目錄有變更時，對應的 command 才會執行：

```yaml
pre-commit:
  parallel: true
  commands:
    frontend-lint:
      root: "packages/frontend/"     # 只在這個目錄內生效
      glob: "*.{ts,tsx}"
      run: yarn workspace frontend lint {staged_files}
      stage_fixed: true

    backend-lint:
      root: "packages/backend/"
      glob: "*.go"
      run: golangci-lint run --fix {staged_files}
      stage_fixed: true

    shared-typecheck:
      root: "packages/shared/"
      glob: "*.ts"
      run: npx tsc --noEmit
```

commit 的檔案在 `packages/frontend/` 時，`backend-lint` 自動跳過，不浪費時間。

## 依序執行：piped

某些情況需要確保前一步成功後才執行下一步，例如先 install 再 migrate：

```yaml
post-merge:
  piped: true               # 前一個失敗，後面全停
  commands:
    install:
      glob: "{package.json,yarn.lock}"
      run: yarn install
      priority: 1           # 數字小的先跑

    migrate:
      glob: "prisma/migrations/*"
      run: npx prisma migrate deploy
      priority: 2
```

`piped: true` 加上 `priority` 可以控制執行順序，而且任一步失敗就中斷，避免 `migrate` 在依賴沒裝好的情況下跑。

## 跳過執行：skip

Lefthook 支援幾種跳過的方式。

**跳過特定 Git 操作**（merge、rebase 時常用）：

```yaml
pre-commit:
  commands:
    lint:
      run: npx eslint {staged_files}
      skip:
        - merge    # merge 時不跑 lint
        - rebase   # rebase 時也跳過
```

**本地覆寫**：如果某個 command 在你的機器上跑不了（例如缺少某個 CLI tool），可以用 `lefthook-local.yml` 覆寫，這個檔案不進 git：

```yaml
# lefthook-local.yml（不 commit 進 repo）
pre-commit:
  commands:
    some-heavy-check:
      skip: true    # 本地暫時關掉
```

## 互動式 Hook

需要使用者輸入的工具（例如 commitizen），可以加 `interactive: true`：

```yaml
prepare-commit-msg:
  commands:
    commitizen:
      interactive: true
      run: npx cz
      env:
        LEFTHOOK: "0"    # 避免遞迴觸發
```

## 共用設定：remotes

團隊有多個 repo，可以把 hooks 設定集中到一個 repo，各專案引用：

```yaml
# lefthook.yml
remotes:
  - git_url: https://github.com/your-org/lefthook-configs
    ref: main
    configs:
      - lefthook-common.yml    # 從遠端拉設定合併
```

每次 `lefthook install` 時會自動同步，hook 規則有更新所有 repo 一起更新。

## 從 Husky 遷移

如果現有專案用 Husky，遷移步驟如下：

```bash
# 移除 Husky 和 lint-staged
npm uninstall husky lint-staged

# 刪除 Husky 設定目錄
rm -rf .husky

# 移除 package.json 裡的 prepare script 和 lint-staged 設定
# 安裝 Lefthook
npm install lefthook --save-dev
lefthook install
```

接著把 `.husky/pre-commit` 的 shell script 和 `package.json` 裡的 lint-staged 設定整合進一個 `lefthook.yml`。

常見的 lint-staged 設定：

```json
// package.json（舊）
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

對應的 Lefthook 設定：

```yaml
# lefthook.yml（新）
pre-commit:
  parallel: true
  commands:
    eslint:
      glob: "*.{ts,tsx}"
      run: npx eslint --fix {staged_files}
      stage_fixed: true

    prettier:
      glob: "*.{ts,tsx,json,md}"
      run: npx prettier --write {staged_files}
      stage_fixed: true
```

## 小結

Lefthook 適合這些情境：

- 厭倦了 Husky + lint-staged 設定分散
- Monorepo 需要按目錄觸發不同工具
- 專案用多種語言，不想被 Node.js 綁死
- 想要 CI-like 的 post-merge 自動化

單純前端小專案用 Husky 也完全夠用，但專案規模一大或 commit 等待時間讓你煩了，換 Lefthook 值得。

## 參考資源

- [Lefthook GitHub 倉庫](https://github.com/evilmartians/lefthook)
- [Lefthook 官方文件](https://lefthook.dev/docs/)
- [Husky 官方文件](https://typicode.github.io/husky/)
- [lint-staged GitHub 倉庫](https://github.com/lint-staged/lint-staged)
- [Evil Martians 技術部落格：Lefthook 介紹](https://evilmartians.com/chronicles/lefthook-knock-your-team-hooks-into-shape)
