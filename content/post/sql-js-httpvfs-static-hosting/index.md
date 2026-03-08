---
title: '用 sql.js-httpvfs 在 GitHub Pages 上查詢 SQLite 資料庫'
description: '介紹 sql.js-httpvfs，透過 HTTP Range Request 在靜態網站上直接查詢 SQLite，不需要下載整個資料庫檔案。'
slug: sql-js-httpvfs-static-hosting
date: '2026-03-07T09:00:00+08:00'
image: featured.jpg
categories:
- Frontend
- Database
tags:
- sql.js
- SQLite
- JavaScript
- WebAssembly
draft: false
---

有次我拿到一份 670MB 的 SQLite 資料庫，需求很簡單：放到靜態網站上，讓使用者輸入關鍵字就能查詢。用後端？這個專案本來就是純靜態的，不想為了這件事架一台伺服器。直接把 DB 丟上去讓瀏覽器下載？670MB，沒人會等。

後來找到 [sql.js-httpvfs](https://github.com/phiresky/sql.js-httpvfs)，問題就解決了。它基於 [sql.js](https://github.com/sql-js/sql.js)，但多了一層 HTTP Range Request 的虛擬檔案系統，讓瀏覽器只下載查詢需要的那幾個 SQLite 頁面。同樣那個 670MB 的資料庫，一次簡單的 key lookup 只傳輸了約 1KB。

## 原理：為什麼可以只抓部分資料

SQLite 的儲存結構是以「頁（page）」為單位，預設每頁 4096 bytes。每個 B-Tree 節點、每筆索引、每頁資料都對應到特定的頁編號。當你執行一條有索引的查詢，SQLite 只需要讀取 B-Tree 路徑上的幾個頁面，不需要掃描整個資料表。

sql.js-httpvfs 利用這個特性，把 Emscripten 的 VFS（Virtual File System）層替換掉。原本 sql.js 的 VFS 是讀記憶體中的 ArrayBuffer，改版後變成發出 HTTP Range Request：

```
GET /data.sqlite HTTP/1.1
Range: bytes=4096-8191
```

伺服器只回傳那 4096 bytes，瀏覽器就把它交給 SQLite 引擎處理。整個流程跑在 Web Worker 裡，不會阻塞主執行緒，所有查詢都是非同步的。

為了減少來回次數，它實作了 3 個虛擬讀取頭（virtual read heads），各自追蹤存取模式。如果發現某個讀取頭在連續存取頁面，就會自動加速預讀（prefetch）——從每次抓 1 頁變成一次抓更多頁。這對全文搜尋這類需要讀多個節點的查詢特別有效。

### Index 設計決定傳輸量

這個方案最需要注意的地方是：你的查詢一定要走 index，否則效果會很差。

SCAN TABLE 意味著 SQLite 需要讀整個資料表的所有頁面，在 HTTP Range Request 的環境下就等於把整張表都下載回來。COVERING INDEX 則讓查詢只需要讀 index 的 B-Tree，連資料行都不用碰。

用 `EXPLAIN QUERY PLAN` 確認：

```sql
-- 好的：走 index
EXPLAIN QUERY PLAN
SELECT name, price FROM products WHERE sku = 'ABC123';
-- 輸出：SEARCH products USING INDEX idx_sku (sku=?)

-- 不好的：全表掃描
EXPLAIN QUERY PLAN
SELECT * FROM products WHERE description LIKE '%keyword%';
-- 輸出：SCAN products
```

## 安裝與初始化

```bash
npm install sql.js-httpvfs
```

sql.js-httpvfs 需要兩個額外的靜態資源：sql-wasm.wasm 和一個 Worker JS 檔。套件本身包含這些檔案，但你需要把它們複製到你的 public 目錄。以 Vite 為例：

```bash
# 把 wasm 和 worker 複製到 public 目錄
cp node_modules/sql.js-httpvfs/dist/sql-wasm.wasm public/
cp node_modules/sql.js-httpvfs/dist/sqlite.worker.js public/
```

初始化 worker：

```typescript
import { createDbWorker } from 'sql.js-httpvfs'

// workerUrl 和 wasmUrl 需要指向你 public 目錄中的靜態檔案
const workerUrl = new URL('/sqlite.worker.js', import.meta.url)
const wasmUrl = new URL('/sql-wasm.wasm', import.meta.url)

const worker = await createDbWorker(
  [
    {
      from: 'url',                          // 從 URL 載入（另有 inline 模式）
      config: {
        serverMode: 'full',                 // 單一檔案模式
        url: '/data.sqlite',               // 資料庫位置
        requestChunkSize: 4096,            // 每次 Range Request 的大小，對齊 SQLite page size
      },
    },
  ],
  workerUrl.toString(),
  wasmUrl.toString()
)
```

`requestChunkSize` 預設是 4096，對齊 SQLite 預設頁面大小。如果你資料庫的頁面大小設成 1024，這裡也要對應調整。

## 準備資料庫

資料庫的設定直接影響傳輸效率。有幾個步驟在上傳之前要做：

```sql
-- 縮小頁面大小，讓每次 Range Request 取得更細粒度的資料
-- 必須在建表前設定，建表後無法更改
PRAGMA page_size = 1024;

-- 刪除 WAL 檔，否則上傳時會有兩個檔案需要同步
PRAGMA journal_mode = delete;

-- 重建資料庫，讓頁面大小設定生效，並消除碎片
VACUUM;
```

建立索引要考慮查詢模式，能用 covering index 就用：

```sql
-- 假設常見查詢是 WHERE category = ? ORDER BY created_at DESC LIMIT 20
-- Covering index 包含所有 SELECT 需要的欄位，查詢不需要回頭讀資料行
CREATE INDEX idx_category_date_cover
  ON articles(category, created_at DESC, title, slug);
```

全文搜尋可以用 FTS5：

```sql
CREATE VIRTUAL TABLE articles_fts USING fts5(
  title,
  content,
  content='articles',  -- 指向原始資料表，避免資料重複儲存
  content_rowid='id'
);

-- 建立 FTS index（初次填資料時）
INSERT INTO articles_fts(articles_fts) VALUES('rebuild');
```

## 查詢範例

worker 建立後，查詢語法和一般 sql.js 差不多，但全部都是 Promise：

```typescript
// 一般查詢
const results = await worker.db.query(
  `SELECT title, slug, created_at
   FROM articles
   WHERE category = ?
   ORDER BY created_at DESC
   LIMIT 20`,
  ['frontend']
)

// results 是 { columns: string[], values: any[][] } 格式
console.log(results.columns) // ['title', 'slug', 'created_at']
console.log(results.values)  // [['文章標題', 'slug-here', '2024-01-01'], ...]
```

全文搜尋：

```typescript
const ftsResults = await worker.db.query(
  `SELECT a.title, a.slug, snippet(articles_fts, 1, '<mark>', '</mark>', '...', 20) AS excerpt
   FROM articles_fts
   JOIN articles a ON articles_fts.rowid = a.id
   WHERE articles_fts MATCH ?
   ORDER BY rank
   LIMIT 10`,
  [keyword]
)
```

## 監控傳輸量

這是我很喜歡的功能：可以直接看每次查詢實際抓了多少 bytes。

```typescript
// 查詢前記錄
const bytesBefore = worker.getStats().totalFetchedBytes

await worker.db.query('SELECT * FROM articles WHERE id = ?', [42])

// 查詢後比對
const bytesAfter = worker.getStats().totalFetchedBytes
console.log(`此次查詢傳輸：${bytesAfter - bytesBefore} bytes`)
```

`getStats()` 回傳的物件包含 `totalFetchedBytes`（累計傳輸量）和 `totalRequests`（累計請求數）。在開發階段我會把這個數字顯示在畫面上，確認 index 有沒有發揮作用。

## 分割資料庫（chunked mode）

如果你的資料庫很大，可以把它分割成固定大小的 chunk，讓 CDN 可以快取各個小檔案：

```bash
# 使用 split 指令切割（Linux/macOS）
split -b 10m data.sqlite data.sqlite.
# 產生 data.sqlite.aa, data.sqlite.ab, ...

# 或用 sql.js-httpvfs 提供的工具
npx sql.js-httpvfs-tools split data.sqlite --chunk-size 10485760
# 會產生 data.sqlite 的分割檔和一個描述 chunk 的 JSON
```

初始化時改用 `serverMode: 'chunked'`：

```typescript
{
  from: 'url',
  config: {
    serverMode: 'chunked',
    serverChunkSize: 10 * 1024 * 1024,   // 10MB per chunk
    urlPrefix: '/db/data.sqlite.',        // chunk 檔案的前綴
    urlSuffix: '',
    fromCache: false,
    requestChunkSize: 4096,
  },
}
```

## 部署到 GitHub Pages

把資料庫和靜態資源都放進 repo（或用 Git LFS），確認 GitHub Pages 的伺服器支援 Range Request——GitHub 的靜態伺服器本身支援，所以不需要特別設定。

S3、Cloudflare Pages、Netlify 同樣支援 Range Request，都可以直接用。

一個需要注意的地方：CORS。如果你的前端和資料庫不在同一個 origin，伺服器需要回傳：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Range
Access-Control-Expose-Headers: Content-Range, Accept-Ranges
```

## 限制

sql.js-httpvfs 有幾個實際使用時要了解的限制：

它是**唯讀**的。HTTP Range Request 只能讀，寫入需要後端支援。如果你需要讀寫，可以看看 [OPFS + 官方 SQLite Wasm](https://sqlite.org/wasm/doc/trunk/index.md)，或是 [wa-sqlite](https://github.com/rhashimoto/wa-sqlite)。

它**沒有 cache eviction**。瀏覽器會快取下載過的頁面（在 Worker 的記憶體裡），但這些快取不會自動清除。如果使用者做了很多不同的查詢，記憶體用量會持續上升。

它是**實驗性質**的程式碼。作者在 README 也說這是 demo 等級的實作，不建議用在需要高穩定性的生產環境。

---

如果你是第一次接觸 sql.js，可以先看[《在瀏覽器裡跑 SQLite：sql.js 入門》](/post/sql-js-browser-sqlite/)從基礎開始。需要離線寫入的場景，[《sql.js + IndexedDB 打造離線 Web 應用》](/post/sql-js-offline-web-app/)有完整的做法。想比較各種瀏覽器儲存方案的話，[《瀏覽器儲存方案全比較》](/post/browser-storage-comparison/)有更系統性的整理。
