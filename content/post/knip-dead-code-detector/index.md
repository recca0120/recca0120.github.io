---
title: '用 Knip 找出專案裡的死碼：ESLint 和 depcheck 都看不到的盲點'
description: '介紹 Knip 這個 JavaScript/TypeScript 死碼偵測工具，說明 ESLint 和 depcheck 各自的盲點，以及 Knip 怎麼用完整 module graph 一次找出未使用的檔案、export 和依賴。'
slug: knip-dead-code-detector
date: '2026-05-02T16:06:00+08:00'
image: featured.png
categories:
- Testing
tags:
- Node.js
- TypeScript
draft: false
---

專案跑了兩年，package.json 裡有 80 個依賴，但你說不清楚哪些還在用。某個 `utils.ts` 三個月沒人動過，不知道還有沒有人 import 它。`shared/helpers.ts` 裡 export 了十幾個函式，有幾個已經被新寫法取代，舊的卻沒人刪。

這些死碼不是一天堆出來的。每次 refactor 留一點，每次換依賴忘刪一個，累積下來專案越來越重，但從來沒有工具告訴你哪裡出問題。

[Knip](https://github.com/webpro-nl/knip) 就是為了解決這件事。一個指令，找出所有你以為在用但其實沒用到的東西。

## ESLint 和 depcheck 各自的盲點

大多數人會用 ESLint 和 depcheck 處理這類問題，但它們都有明確的邊界。

**ESLint** 只看單一檔案。它能告訴你「這個函式裡有個 `const x` 沒被用到」，但如果整個 `utils.ts` 沒有任何地方 import 它，ESLint 不會告訴你。它的視野就是一個檔案的範圍，看不到跨檔案的引用關係。

**depcheck** 只看 `package.json`。它掃描程式碼裡有沒有 `require` 或 `import` 某個套件，告訴你哪些裝了但沒用。但它不懂 TypeScript 的 export/import 語義，也不知道哪些檔案根本從來沒被引用過。

兩個工具加起來還是有缺口：跨檔案的 export 引用關係，沒有任何工具在管。

Knip 的做法不同。它從設定的 entry points 出發，建一張完整的 module graph，追蹤每個 import、export、依賴的實際使用狀況。這張圖建好之後，任何沒被連到的節點就是死碼。

## 能找到什麼

一次跑 `knip`，可以找到：

- **未使用的 npm 依賴**：裝了但程式碼裡沒有任何地方用到
- **unlisted dependencies**：程式碼裡有用到，但沒有寫進 `package.json`（隱式依賴第三方套件的子依賴）
- **未使用的 export**：export 出去但沒有任何地方 import
- **未使用的檔案**：整個檔案從來沒被引用過
- **unresolved imports**：import 了不存在的路徑或模組

這些問題以前要靠幾個工具拼起來，還有盲點。Knip 一次全包。

Vercel 在導入 Knip 後刪掉了將近 30 萬行程式碼。不是 Knip 誇大，是他們自己說的。

## 安裝與使用

不需要事先安裝，直接跑：

```bash
npx knip
```

或者加進 devDependencies：

```bash
npm install -D knip
npx knip
```

Knip 支援約 150 個 plugins，包含 Vite、Vitest、Next.js、Astro、ESLint、GitHub Actions 等。大多數情況下不需要任何設定，它會自動偵測專案用了哪些工具。

## 看懂輸出

跑完之後，輸出大概長這樣：

```
Unused files (2)
src/legacy/old-helper.ts
src/utils/deprecated.ts

Unused dependencies (3)
lodash
moment
@types/node  (devDependencies)

Unused exports (5)
src/shared/helpers.ts: formatDate, parseQuery
src/utils/string.ts: capitalize, truncate, slugify
```

每個分類都很清楚：哪些檔案整個沒人用、哪些 npm 套件可以移除、哪些 export 沒有任何地方 import。

> 第一次跑通常會有一堆東西，不用急著全刪。先處理確定沒用到的依賴，再慢慢清 export，最後才處理整個檔案。

## 設定檔

如果需要調整，在專案根目錄建 `knip.json`（或在 `package.json` 裡加 `knip` 欄位）：

```json
{
  "entry": ["src/index.ts", "src/pages/**/*.tsx"],
  "project": ["src/**/*.{ts,tsx}"],
  "ignore": ["src/legacy/**", "**/*.stories.ts"],
  "ignoreDependencies": ["some-cli-tool"]
}
```

- `entry`：從哪些檔案開始追蹤引用
- `project`：哪些檔案算在這個專案裡
- `ignore`：不要掃的路徑
- `ignoreDependencies`：已知沒有 import 但需要保留的依賴（例如 CLI 工具）

## 自動修復

部分問題可以加 `--fix` 自動處理：

```bash
npx knip --fix
```

目前 `--fix` 可以自動移除 `package.json` 裡未使用的依賴，以及部分未使用的 export。不是所有問題都能自動修，但至少不用手動一個個處理依賴。

## VSCode Extension 和 MCP

Knip 有 [VSCode extension](https://marketplace.visualstudio.com/items?itemName=knip.vscode-knip)，可以在編輯器裡直接看到哪些 export 沒被使用，不用每次跑 CLI 才知道。

另外也有 `@knip/mcp`，可以讓 AI assistant 在分析專案時直接呼叫 Knip，幫助 AI 了解哪些程式碼是真的有在用的。

## 死碼是技術債的來源

刪掉沒用的東西不只是讓專案變小。每一個沒在用的 export 都是潛在的認知負擔——新進開發者不知道這個函式是不是還重要，要花時間去追。每一個沒在用的依賴都是潛在的安全風險和更新負擔。

Knip 把「找死碼」這件事從手動變成自動。跑一次，清一批，可以加進 CI 讓每次 PR 都檢查一遍，防止死碼繼續堆積。

## 參考資源

- [Knip 官網](https://knip.dev/)
- [GitHub — webpro-nl/knip](https://github.com/webpro-nl/knip)
- [Effective TypeScript — 推薦使用 Knip 偵測死碼](https://effectivetypescript.com/2023/07/29/knip/)
