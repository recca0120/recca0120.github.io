---
title: 'EmDash：用 Astro + Cloudflare 打造的全棧 TypeScript CMS，能取代 WordPress 嗎？'
description: 'EmDash 是基於 Astro 和 Cloudflare 的全棧 TypeScript CMS，主打外掛沙箱隔離、Portable Text 結構化內容、多資料庫支援，定位為現代版 WordPress 替代方案。'
slug: emdash-cms-astro-cloudflare
date: '2026-04-07T05:36:00+08:00'
image: featured.jpg
categories:
- Frontend
tags:
- Astro
- Cloudflare
- TypeScript
- CMS
draft: false
---

WordPress 佔了全球網站的 43%，但它是 2003 年的產物。PHP + MySQL、外掛可以直接碰資料庫、內容存成 HTML 跟 DOM 綁死。用了二十年，該有人重新想這件事了。

[EmDash](https://github.com/emdash-cms/emdash) 就是這個嘗試。全棧 TypeScript，跑在 Astro 上面，用 Cloudflare 的基礎設施。目前還在 beta，但架構設計值得看一看。

## 跟 WordPress 差在哪

先講最大的幾個差異。

### 外掛沙箱隔離

WordPress 96% 的安全漏洞來自外掛。原因很直接：外掛跟主程式跑在同一個 PHP process，對資料庫和檔案系統有完整的存取權限。裝了一個有問題的外掛，整個站就暴露了。

EmDash 用 Cloudflare Workers 的 Dynamic Worker Loaders 做隔離。每個外掛要宣告 capability manifest，明確列出它需要什麼權限：

```typescript
export default () =>
  definePlugin({
    id: "my-plugin",
    capabilities: ["read:content", "email:send"],
    hooks: {
      "content:afterSave": async (event, ctx) => {
        // 只能在宣告的權限範圍內操作
      }
    }
  });
```

沒有宣告 `write:content`，就不能寫入內容。這個設計從根本上限制了外掛的攻擊面。

### 內容格式：Portable Text 取代 HTML

WordPress 把內容存成 HTML。看起來很直覺，但問題在於 HTML 跟呈現方式綁死了。同一段內容要給 app、email、API 用，就得重新解析 DOM。

EmDash 用 [Portable Text](https://www.portabletext.org/)，內容存成結構化的 JSON。一份內容可以給不同的 renderer 處理，不需要從 HTML 反推語意。

### 全棧 TypeScript

WordPress 是 PHP，前端再加一層 JavaScript。EmDash 從 schema 定義到前端渲染全部都是 TypeScript，而且 schema 改了之後可以直接生成型別：

```bash
npx emdash types
```

這條指令會從資料庫 schema 產出 TypeScript 型別定義，IDE 裡改 schema 就會立刻看到型別錯誤。

## 技術架構

### 資料庫不綁死

EmDash 用 [Kysely](https://kysely.dev/) 做資料庫抽象層，支援多種 SQL 方言：

| 環境 | 資料庫 | 儲存 | Session | 外掛隔離 |
|------|--------|------|---------|----------|
| Cloudflare | D1 | R2 | KV | Worker isolates |
| 自架 | SQLite / PostgreSQL | S3 相容 / 本機 | Redis / 檔案 | 同程序模式 |

想跑在 Cloudflare 上就用 D1 + R2，想自架就用 SQLite + 本機檔案系統。不會被特定雲端綁住。

### Astro 整合

EmDash 是 Astro 的 integration，設定方式跟其他 Astro 外掛一樣：

```typescript
// astro.config.mjs
import emdash from "emdash/astro";
import { d1 } from "emdash/db";

export default defineConfig({
  integrations: [emdash({ database: d1() })]
});
```

查詢內容用 `getEmDashCollection`，語法跟 Astro 的 Content Collections 很像：

```astro
---
import { getEmDashCollection } from "emdash";
const { entries: posts } = await getEmDashCollection("posts");
---

{posts.map((post) => (
  <article>{post.data.title}</article>
))}
```

重點是這些資料是即時從資料庫撈的，不需要重新 build 整個站。

## 功能一覽

### 內容管理

- 可自訂的 content types（collections），在管理介面用 UI 拉就好
- TipTap 富文本編輯器
- 版本控制、草稿、排程發佈
- FTS5 全文搜尋

### 認證系統

預設用 Passkey（WebAuthn），也支援 OAuth 和 Magic link。權限分四層：Administrator、Editor、Author、Contributor。

### 外掛能做什麼

外掛能力不只是 hook 而已：

- KV 儲存
- 設定管理
- 管理員頁面
- Dashboard widgets
- 自訂 block 類型
- API 路由

### AI 整合

EmDash 原生支援 MCP（Model Context Protocol），可以直接用 Claude 或 ChatGPT 操作內容和 schema。也有 agent skills 幫忙做外掛和主題開發。

### WordPress 搬家

支援 WXR 匯出檔匯入、REST API 對接、WordPress.com 導入。還有一個 `gutenberg-to-portable-text` 套件把 Gutenberg block 轉成 Portable Text。

## 快速開始

```bash
npm create emdash@latest
```

這會跑一個 scaffold，選模板就能開始。有三種模板：

- **blog**：分類、標籤、全文搜尋、RSS、深色模式
- **marketing**：Hero section、定價卡片、FAQ、聯絡表單
- **portfolio**：專案網格、標籤篩選、案例研究頁面

本地開發：

```bash
git clone https://github.com/emdash-cms/emdash.git
cd emdash
pnpm install
pnpm build
pnpm --filter emdash-demo seed
pnpm --filter emdash-demo dev
```

管理介面在 `http://localhost:4321/_emdash/admin`。

## 目前的限制

EmDash 還在 beta，幾件事要注意：

- 外掛的 Worker isolate 是 Cloudflare 付費帳號功能，免費帳號只能跑同程序模式（沒有沙箱）
- 生態系剛起步，第三方外掛和主題數量跟 WordPress 沒得比
- 文件還在建置中，有些功能要翻原始碼才知道怎麼用
- Portable Text 的學習曲線比 HTML 高，特別是要自訂 block 的時候

## 適合誰

如果你是 WordPress 重度使用者、需要上千個外掛、客戶要自己裝佈景主題，EmDash 現階段還替代不了。

但如果你本來就在用 Astro，想要一個能讓非技術人員編輯內容的後台，又不想串 headless CMS 的 API，EmDash 的整合方式很直接。TypeScript 全棧、schema 改了型別跟著動、部署到 Cloudflare 幾乎零設定。

它不是要殺死 WordPress，但它示範了一個 2026 年的 CMS 可以長什麼樣子。

## 參考資源

- [EmDash GitHub Repository](https://github.com/emdash-cms/emdash)
- [Portable Text 官方網站](https://www.portabletext.org/)
- [Kysely - Type-safe SQL Query Builder](https://kysely.dev/)
- [Astro 官方文件](https://docs.astro.build/)
- [Cloudflare Workers 文件](https://developers.cloudflare.com/workers/)
