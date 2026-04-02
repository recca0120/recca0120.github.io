---
title: '我用 Vibe Coding 做了一個全球開發者排行榜'
description: '分享用 Astro + Svelte 5 + Three.js vibe coding 出 CodeAtlas 全球開發者排行榜的過程，從 GitHub API 資料收集到 3D 地球儀互動體驗。'
slug: codeatlas-vibe-coding-developer-ranking
date: '2026-04-03T02:57:00+08:00'
image: featured.png
categories:
- Frontend
tags:
- Astro
- Svelte
- Three.js
- GitHub API
- Vibe Coding
draft: false
---

GitHub 上有超過一億個開發者帳號，但你有沒有想過——你在自己國家排第幾名？

這個念頭讓我花了幾天時間，用 vibe coding 的方式做出了 [CodeAtlas](https://recca0120.github.io/codeatlas/)，一個涵蓋 130 多個國家的全球開發者排行榜，還附帶一顆可以轉的 3D 地球。

## 什麼是 Vibe Coding

Vibe coding 是 Andrej Karpathy 在 2025 年初提出的概念：把需求用自然語言丟給 AI，讓 AI 產出程式碼，開發者負責方向和驗收。整個過程更像在「導演」一個專案，而不是逐行寫 code。

CodeAtlas 就是這樣生出來的。我定義好資料來源、排名邏輯、UI 互動，剩下的交給 AI 去實作。最後出來的技術組合超出我原本預期——Astro 6 搭 Svelte 5 Islands、Three.js 3D 地球、GitHub GraphQL API 自動收集——這些如果要從零手刻，光是學習成本就很可觀。

## 技術架構

整個專案分成兩個部分：資料收集 pipeline 和前端展示。

### 資料收集

資料來源是 GitHub GraphQL API。每個國家在設定檔裡有對應的地點關鍵字，例如 Taiwan 對應 `["Taiwan", "Taipei", "Kaohsiung", "Taichung"]`。收集腳本會用這些關鍵字搜尋 GitHub 使用者，依照 followers 數量由高到低分頁抓取。

```typescript
// 搜尋查詢：用 location 加上 followers 排序
// query: "location:Taiwan sort:followers-desc"
const result = await octokit.graphql(searchQuery, {
  searchQuery: `location:${location} sort:followers-desc`,
  first: 20,
  after: cursor,
});
```

每位開發者會收集以下資料：

- 公開 / 私人貢獻數
- Follower 數量
- 前 5 名使用的程式語言
- 前 5 個星星最多的 repo
- 個人資訊（公司、bio、Twitter、blog）

收集過程有幾個眉角。GitHub API 有 rate limit，所以用了 `@octokit/plugin-throttling` 控制請求頻率，每頁之間加 500-1000ms 延遲。遇到 secondary rate limit 會自動重試最多 3 次。整個收集跑完 130 多個國家大概要兩小時。

### 模糊地點過濾

GitHub 使用者的 location 是自由填寫的欄位，這會產生誤判。最經典的例子是 Georgia——它既是美國的州，也是一個國家。`location-filter.ts` 用排除規則處理這類情況，避免把美國喬治亞州的開發者算進喬治亞共和國。

### 自動化排程

資料收集透過 GitHub Actions 每天凌晨跑一次。設計了 checkpoint 機制，每次只處理一部分國家，中斷了可以續跑。跑完自動 commit 到 repo，GitHub Pages 就會更新。

```yaml
# .github/workflows/collect-data.yml
on:
  schedule:
    - cron: '17 3 * * *'  # 每天 UTC 3:17
  workflow_dispatch:        # 也可以手動觸發
```

## 排名機制

排名邏輯刻意做得簡單。三個維度，各自獨立排序：

| 維度 | 說明 |
|------|------|
| Public Contributions | 只計算公開貢獻 |
| Total Contributions | 公開 + 私人貢獻 |
| Followers | GitHub 追蹤者數量 |

```typescript
function rankUsers(users: GitHubUser[], dimension: RankingDimension) {
  return [...users].sort(
    (a, b) => getRankValue(b, dimension) - getRankValue(a, dimension)
  );
}
```

沒有加權、沒有複合評分。使用者可以在頁面上切換維度，自己判斷哪個指標對他有意義。做過 ranking system 的人都知道，一旦開始加權就會有無止盡的爭議，不如把選擇權交給使用者。

## 前端展示

### 3D 互動地球

首頁最搶眼的是一顆可以旋轉、縮放的 3D 地球，用 [Globe.gl](https://globe.gl/) 搭配 Three.js 做的。已收錄的國家會在地球上高亮顯示，點擊就能直接跳到該國的排行榜。

這顆地球在手機上也能跑，不過做了 responsive 處理——小螢幕上會調整 canvas 尺寸和互動行為，避免吃太多效能。

### Astro Islands 架構

前端框架選了 Astro 6，搭配 Svelte 5 做互動元件。Astro 的 Islands 架構很適合這種「大部分靜態 + 少量互動」的場景。頁面 HTML 是 build time 產好的靜態檔，只有需要互動的元件（地球、篩選器、搜尋框）才會在 client 端 hydrate。

```
src/components/
├── AppRouter.svelte        # Client-side SPA 路由
├── HomePage.svelte         # 首頁 + 3D 地球
├── CountryPage.svelte      # 國家排行榜
├── ProfilePage.svelte      # 個人開發者頁面
├── RankingFilter.svelte    # 維度切換 + 搜尋 + 語言篩選
└── CountrySearch.svelte    # 國家搜尋
```

### 篩選與搜尋

國家排行榜頁面可以：

- 用名字搜尋開發者
- 按程式語言篩選（列出最常見的 12 種）
- 按城市 / 地區篩選
- 切換三種排名維度

所有篩選條件會同步到 URL query string，分享連結時對方看到的是一樣的篩選結果。

### 個人 Profile 頁

點擊任何開發者可以進入 profile 頁面，顯示排名、貢獻統計、使用的程式語言（帶顏色標籤）、星星最多的 repo，還有 GitHub / Twitter / 個人網站的連結。

## 多語系與暗色模式

網站支援英文和繁體中文兩種語言，翻譯檔用 TypeScript 管理，有型別檢查。語言偏好存在 localStorage，下次進來會自動跳轉。

暗色模式跟著系統偏好走，也可以手動切換。狀態同樣存在 localStorage。

## OG 圖片自動產生

分享到社群時需要 Open Graph 圖片。用 [Satori](https://github.com/vercel/satori) 在 build time 把 HTML 模板轉成 SVG 再轉 PNG，每個國家頁面和個人 profile 都會自動產生對應的 OG 圖。

## Vibe Coding 的體驗

回頭看這個專案，vibe coding 最大的好處是降低「嘗試的成本」。3D 地球聽起來很酷但我對 Three.js 不熟——沒關係，先讓 AI 生一版，跑起來再調。GraphQL 查詢要處理 cursor pagination 和 rate limit——讓 AI 寫初版，我來 review 和補邊界條件。

實際感受到的幾個特點：

**速度確實快。** 從有想法到第一版能跑，大概兩天。如果要手寫 Three.js 地球加上 GitHub API 整合，光研究文件就不止這個時間。

**品質需要自己把關。** AI 產出的 code 跑得動不代表寫得好。code review 還是得自己做，尤其是 error handling 和 edge case。GitHub API 的 secondary rate limit、模糊地點過濾這些，都是 review 時補上的。

**架構決策要自己做。** AI 不會主動幫你想「這個功能要不要做成 static、要不要用 Islands 架構」。技術選型和架構決策還是開發者的工作。

## 技術棧總覽

| 類別 | 技術 |
|------|------|
| 框架 | Astro 6 (SSG) + Svelte 5 |
| 3D | Globe.gl + Three.js |
| 樣式 | Tailwind CSS v4 |
| 資料 | GitHub GraphQL API + Octokit |
| 驗證 | Zod v4 |
| 測試 | Vitest + Testing Library + Playwright |
| 圖片 | Satori + Resvg-js |
| CI/CD | GitHub Actions + GitHub Pages |
| 語言 | TypeScript 5.9, Node.js 22+ |

## 參考資源

- [CodeAtlas 線上版](https://recca0120.github.io/codeatlas/)
- [Astro 官方文件](https://docs.astro.build/)
- [Globe.gl — WebGL Globe Data Visualization](https://globe.gl/)
- [Satori — Enlightened library to convert HTML and CSS to SVG](https://github.com/vercel/satori)
- [GitHub GraphQL API 文件](https://docs.github.com/en/graphql)
- [Svelte 5 官方文件](https://svelte.dev/docs)
