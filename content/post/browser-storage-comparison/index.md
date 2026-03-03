---
title: '瀏覽器端儲存方案比較：sql.js vs IndexedDB vs localStorage'
description: '比較 sql.js、IndexedDB、localStorage 等瀏覽器端儲存方案的容量、查詢能力、效能與適用場景，附完整比較表格。'
slug: browser-storage-comparison
date: '2026-03-03T08:34:00+08:00'
image: featured.png
categories:
- Frontend
tags:
- sql.js
- SQLite
- IndexedDB
- JavaScript
draft: false
---

前端要在瀏覽器存資料，選擇比想像中多。localStorage 最簡單但限制最大，IndexedDB 功能強但 API 難用，[sql.js](https://github.com/sql-js/sql.js) 直接給你完整的 SQL 查詢能力。每個方案都有它適合的場景，選錯了後期很痛苦。

這篇文章從容量、API 型態、查詢能力、效能幾個維度把三者並排比較，最後整理出一個決策流程，讓你在動工前就確定要用哪個。

---

## 各方案簡介

### localStorage / sessionStorage

最老牌的瀏覽器儲存機制。key-value 字串儲存，API 同步，幾乎不需要學習成本：

```js
// 存資料
localStorage.setItem('user', JSON.stringify({ name: 'Alice' }))

// 取資料
const user = JSON.parse(localStorage.getItem('user'))
```

`sessionStorage` 和 `localStorage` API 完全一樣，差別只在於前者關掉分頁就清空。

限制很明顯：只能存字串、容量上限約 5 MB、沒有任何查詢能力。要找特定資料，你只能自己 `JSON.parse` 然後在 JavaScript 裡過濾。

### IndexedDB

瀏覽器內建的 NoSQL 物件儲存。非同步 API，支援索引（index）和交易（transaction），可以存 JavaScript 物件（包含 Blob、ArrayBuffer），容量彈性大得多。

原生 API 的問題是極度囉嗦。光是開啟資料庫就要寫一堆事件監聽：

```js
// 開啟資料庫（原生 API）
const request = indexedDB.open('mydb', 1)

request.onupgradeneeded = (event) => {
  const db = event.target.result
  // 建立 object store 並設定索引
  const store = db.createObjectStore('users', { keyPath: 'id' })
  store.createIndex('name', 'name', { unique: false })
}

request.onsuccess = (event) => {
  const db = event.target.result
  // 才能開始做事...
}

request.onerror = (event) => {
  console.error('開啟資料庫失敗', event.target.error)
}
```

實務上幾乎都會搭配 [idb](https://github.com/jakearchibald/idb) 這個封裝函式庫，讓 API 變成 Promise-based。

### sql.js（SQLite via Wasm）

sql.js 把 SQLite 編譯成 WebAssembly，讓你在瀏覽器裡跑完整的關聯式資料庫。你可以用標準 SQL 建表、JOIN、GROUP BY、子查詢，全部支援。

```js
// 初始化 sql.js 並建立資料表
const SQL = await initSqlJs({ locateFile: file => `/wasm/${file}` })
const db = new SQL.Database()

db.run(`
  CREATE TABLE orders (
    id      INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    amount  REAL    NOT NULL,
    status  TEXT    NOT NULL
  )
`)
```

最大的限制：資料庫存在記憶體裡，頁面關閉就消失。要持久化，你需要把整個 `.db` 檔案（`Uint8Array`）序列化存進 IndexedDB，下次載入時再讀回來。

### OPFS + SQLite Wasm（新選項）

[Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) 是較新的瀏覽器 API，提供一個對使用者隱藏的私有檔案系統。官方 [SQLite Wasm](https://sqlite.org/wasm/doc/trunk/index.md) 支援把資料庫直接存到 OPFS，解決了 sql.js 的持久化問題，不需要靠 IndexedDB 中繼。

瀏覽器支援度（2025 年底）尚可，但 OPFS 的同步 I/O 操作（`createSyncAccessHandle`）只能在 Web Worker 裡使用，架構複雜度比 sql.js 高一階。

---

## 完整比較表格

| 方案 | 容量上限 | API 型態 | 查詢能力 | 持久化 | 適合場景 |
|------|----------|----------|----------|--------|----------|
| localStorage | ~5 MB | 同步 | 無（需自行過濾） | 持久 | 設定、少量 key-value |
| sessionStorage | ~5 MB | 同步 | 無（需自行過濾） | 分頁關閉即清空 | 暫存表單、頁面狀態 |
| IndexedDB | 磁碟 10–50%（依瀏覽器） | 非同步（event / Promise） | 索引查詢、範圍掃描 | 持久 | 大量物件、二進位資料、離線快取 |
| sql.js | 受限於可用記憶體 | 同步（Wasm 呼叫） | 完整 SQL（JOIN、聚合、子查詢） | 需手動序列化 | 複雜查詢、分析、現有 SQLite 資料 |
| SQLite Wasm + OPFS | 磁碟空間 | 非同步（Worker） | 完整 SQL | 持久（原生） | 需要原生持久化的 SQL 場景 |

---

## 容量限制詳解

**localStorage**：各瀏覽器大多限制在 5 MB，存的是 UTF-16 字元串，超過會丟 `QuotaExceededError`。

**IndexedDB**：容量由瀏覽器動態管理。Chrome 最多可用磁碟空間的 80%，但會先進入 `"best-effort"` 儲存模式，系統磁碟不足時可能被清除。若需保證不被清除，要呼叫 `navigator.storage.persist()` 申請 `"persistent"` 模式。

**sql.js**：整個資料庫存在 `ArrayBuffer`，上限是 JavaScript 引擎允許的最大記憶體。實測在現代桌機瀏覽器，幾百 MB 的資料庫跑起來沒問題，但行動裝置要小心。

---

## 查詢能力比較

用同一個需求說明：**找出金額超過 1000 的訂單，並依使用者分組加總。**

### localStorage 做法

```js
// localStorage 沒有查詢能力，只能全撈再過濾
const orders = JSON.parse(localStorage.getItem('orders') || '[]')

const result = orders
  .filter(o => o.amount > 1000)
  .reduce((acc, o) => {
    acc[o.userId] = (acc[o.userId] || 0) + o.amount
    return acc
  }, {})
```

資料量大時，每次查詢都要反序列化整包資料，效能差。

### IndexedDB 做法

```js
// 用 idb 封裝，仍需在 JS 層做聚合
import { openDB } from 'idb'

const db = await openDB('shop', 1)
// 利用索引拿到 amount > 1000 的資料
const tx = db.transaction('orders', 'readonly')
const index = tx.store.index('amount')

// IDBKeyRange 只支援範圍，不支援複雜 GROUP BY
const orders = await index.getAll(IDBKeyRange.lowerBound(1000))

const result = orders.reduce((acc, o) => {
  acc[o.userId] = (acc[o.userId] || 0) + o.amount
  return acc
}, {})
```

IndexedDB 的索引讓範圍查詢快很多，但聚合運算還是要在 JavaScript 層完成。

### sql.js 做法

```js
// 一行 SQL 搞定
const rows = db.exec(`
  SELECT   user_id,
           SUM(amount) AS total
  FROM     orders
  WHERE    amount > 1000
  GROUP BY user_id
`)
```

查詢邏輯清楚，資料庫引擎負責優化執行計畫。

---

## 效能考量

**sql.js 初始載入**：Wasm 二進位檔約 1 MB，瀏覽器需要下載、編譯並初始化。首次載入通常需要 100–500 ms，之後可以快取。如果你的應用程式本身就很輕量，這個啟動成本會很明顯。

我在實作時會把 `initSqlJs()` 的 Promise 放在頁面初始化流程裡，和其他資源一起並行載入，避免阻塞使用者操作。

**IndexedDB 大量寫入**：每個 transaction 有開銷，批量寫入要把資料塞進同一個 transaction，不要一筆一筆開 transaction：

```js
// 正確：一個 transaction 批次寫入
const tx = db.transaction('orders', 'readwrite')
for (const order of orders) {
  tx.store.put(order) // 不需要 await 每一次
}
await tx.done // 等整個 transaction 完成
```

**sql.js 大量讀取**：因為是記憶體內操作，掃表速度非常快，但要注意把 `db.exec()` 傳回的 `Uint8Array` 結果轉成 JS 物件有額外成本，大結果集要做分頁或串流處理。

---

## 該怎麼選？

以下是我自己的決策流程：

1. **只存設定、token、少量 key-value，且資料 &lt; 5 MB** → `localStorage`
2. **需要存物件、二進位檔（圖片、音訊）、或資料量較大** → `IndexedDB`
3. **需要複雜 JOIN、聚合、全文搜尋，且接受頁面關閉後重新載入資料庫** → `sql.js`
4. **需要複雜 SQL 查詢 + 原生持久化，且目標瀏覽器支援 OPFS** → `SQLite Wasm + OPFS`
5. **需要 SQL 查詢且資料要跨頁面存活** → `sql.js` 搭配 IndexedDB 做持久化

組合 sql.js + IndexedDB 是目前相容性最好的「持久化 SQL」方案：

```js
// 儲存：把整個資料庫序列化存進 IndexedDB
const data = db.export() // 回傳 Uint8Array
await idbSet('sqliteDb', data)

// 讀取：從 IndexedDB 還原資料庫
const saved = await idbGet('sqliteDb')
const db = new SQL.Database(saved ?? [])
```

---

## 延伸閱讀

這篇是本系列的第三篇，其他兩篇：

- [sql.js 入門：在瀏覽器裡跑 SQLite](/post/sql-js-browser-sqlite/)：從安裝到第一個查詢的完整教學
- [用 sql.js + IndexedDB 打造離線 Web App](/post/sql-js-offline-web-app/)：實際做一個離線可用的應用程式，示範持久化整合

三篇讀完，瀏覽器端資料庫的眉角應該夠清楚了。
