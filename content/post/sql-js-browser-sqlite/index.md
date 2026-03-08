---
title: '用 sql.js 在瀏覽器跑 SQLite：安裝到 CRUD 完整教學'
description: '介紹 sql.js 套件，從安裝、初始化、CRUD 操作到匯入匯出 .db 檔案和 Web Worker 用法，在瀏覽器端直接使用 SQLite。'
slug: sql-js-browser-sqlite
date: '2026-03-04T09:00:00+08:00'
image: featured.jpg
categories:
- Frontend
tags:
- sql.js
- SQLite
- JavaScript
- WebAssembly
draft: false
---

你有沒有需要在前端做複雜查詢，但又不想為了這件事多架一個後端？我遇過幾次這種情況：本地工具、離線應用、資料分析頁面。每次都在想，要是能直接在瀏覽器裡跑 SQL 就好了。

[sql.js](https://github.com/sql-js/sql.js) 就是這個問題的答案。它把 SQLite 的 C 原始碼用 Emscripten 編譯成 WebAssembly，整個 SQLite 引擎直接在瀏覽器裡執行。不需要伺服器，不需要 API，SQL 就在本地跑。

## sql.js 是什麼，怎麼運作

sql.js 的核心是 Emscripten 工具鏈把 SQLite 3 的 C 程式碼編譯成 `.wasm` 二進位檔。瀏覽器載入這個 Wasm 模組之後，你就有了完整的 SQLite 引擎可以呼叫。

**幾個重要特性要先知道：**

- **預設 in-memory**：資料庫存在記憶體裡，頁面重新整理就消失。如果需要持久化，要自己把資料序列化存到 IndexedDB 或 localStorage。
- **同步 API，非同步初始化**：載入 Wasm 是非同步的，但實際執行 SQL 是同步的。
- **完整 SQLite 功能**：支援 transaction、prepared statement、自訂函式、觸發器，幾乎完整的 SQLite 功能集。
- **檔案大小**：`sql-wasm.wasm` 約 1.5 MB，對頁面初次載入有影響，這點要注意。

目前 v1.14.0，MIT 授權，GitHub 上 13.5k stars，算是這個需求的標準解法。

## 安裝

### npm

```bash
npm install sql.js
```

安裝後，`.wasm` 檔案在 `node_modules/sql.js/dist/sql-wasm.wasm`，需要額外處理讓瀏覽器能取得這個靜態資源。用 Vite 的話，可以在 `vite.config.js` 裡用 `assetsInclude` 或直接 copy 到 public 目錄。

### CDN

不想搞建置工具，直接用 CDN 最快：

```html
<!-- 從 jsDelivr 載入 -->
<script src="https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/sql-wasm.js"></script>
```

Wasm 檔案 CDN 會自動處理，不需要另外設定。

## 初始化

sql.js 初始化需要告訴它 `.wasm` 檔案的位置，用 `locateFile` 選項指定：

```js
// 初始化 sql.js，指定 wasm 檔案路徑
async function initSqlJs() {
  const SQL = await initSqlJs({
    // locateFile 回傳 wasm 檔案的 URL
    locateFile: (filename) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/${filename}`,
  });

  // 建立一個空的 in-memory 資料庫
  const db = new SQL.Database();
  return db;
}

const db = await initSqlJs();
```

如果是用 npm 安裝、Vite 打包，`locateFile` 要指向你自己的靜態資源路徑：

```js
locateFile: (filename) => `/assets/${filename}`,
```

## CRUD 操作

### 建立資料表

```js
// 執行 DDL，用 run() 方法
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT    NOT NULL,
    age  INTEGER
  )
`);
```

`run()` 用來執行不需要回傳結果的 SQL（DDL、INSERT、UPDATE、DELETE）。

### 插入資料

```js
// 直接拼字串（不要這樣做，有 SQL injection 風險）
// db.run(`INSERT INTO users (name, age) VALUES ('Alice', 30)`);

// 用參數綁定，安全的做法
db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30]);
db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 25]);
db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Carol', 28]);
```

### 查詢資料

`exec()` 用來執行 SELECT，回傳結果陣列：

```js
// exec() 回傳 [{ columns: [...], values: [[...], [...]] }]
const results = db.exec('SELECT id, name, age FROM users WHERE age > ?', [26]);

if (results.length > 0) {
  const { columns, values } = results[0];

  // columns: ['id', 'name', 'age']
  // values:  [[1, 'Alice', 30], [3, 'Carol', 28]]

  // 轉成物件陣列比較好用
  const rows = values.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]]))
  );

  console.log(rows);
  // [{ id: 1, name: 'Alice', age: 30 }, { id: 3, name: 'Carol', age: 28 }]
}
```

`exec()` 的回傳格式是欄位和值分開的，每次都要自己轉成物件陣列，稍微麻煩一點。

### 更新與刪除

```js
// UPDATE
db.run('UPDATE users SET age = ? WHERE name = ?', [31, 'Alice']);

// DELETE
db.run('DELETE FROM users WHERE age < ?', [27]);
```

### 查詢受影響的列數

```js
db.run('DELETE FROM users WHERE age < ?', [27]);

// getRowsModified() 回傳最後一次操作影響的列數
const affected = db.getRowsModified();
console.log(`刪除了 ${affected} 筆`);
```

## Prepared Statements 與參數綁定

對於重複執行的查詢，用 prepared statement 效率更好：

```js
// 建立 prepared statement
const stmt = db.prepare('INSERT INTO users (name, age) VALUES (?, ?)');

const users = [
  ['Dave', 22],
  ['Eve', 35],
  ['Frank', 29],
];

// 批次插入
for (const [name, age] of users) {
  stmt.run([name, age]);
}

// 用完要釋放，否則會 memory leak
stmt.free();
```

Prepared statement 也支援具名參數：

```js
const stmt = db.prepare('SELECT * FROM users WHERE name = :name AND age > :minAge');

stmt.bind({ ':name': 'Alice', ':minAge': 25 });

// step() 每次往前一列，回傳 true 表示還有資料
while (stmt.step()) {
  const row = stmt.getAsObject();
  // row 是 { id: 1, name: 'Alice', age: 30 }
  console.log(row);
}

stmt.free();
```

## 自訂函式

sql.js 支援用 JavaScript 定義 SQLite 的自訂函式，這個功能很實用：

```js
// 建立一個計算字串長度的自訂函式（SQLite 內建 length，這只是示範）
db.create_function('js_upper', (str) => str.toUpperCase());

// 在 SQL 裡直接使用
const results = db.exec("SELECT js_upper(name) AS upper_name FROM users");
// 回傳 [{ columns: ['upper_name'], values: [['ALICE'], ['BOB'], ...] }]
```

比較實用的場景是補上 SQLite 沒有的函式，像是正則表達式比對：

```js
// SQLite 本身不支援 REGEXP，自己加上
db.create_function('regexp', (pattern, str) => {
  return new RegExp(pattern).test(str) ? 1 : 0;
});

// 現在可以用 REGEXP 了
const results = db.exec("SELECT * FROM users WHERE regexp('^A', name)");
```

## 匯入匯出 .db 檔案

這是 sql.js 很有用的功能：可以把整個資料庫序列化成 `Uint8Array`，或是從現有的 `.db` 檔案載入。

### 匯出

```js
// export() 回傳 Uint8Array，就是 .db 的二進位內容
const data = db.export();

// 讓使用者下載這個檔案
const blob = new Blob([data], { type: 'application/octet-stream' });
const url = URL.createObjectURL(blob);

const a = document.createElement('a');
a.href = url;
a.download = 'mydb.sqlite';
a.click();

// 用完清理
URL.revokeObjectURL(url);
```

### 匯入

```js
// 從 <input type="file"> 讀取使用者上傳的 .db 檔案
async function loadDatabase(file) {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  // 把二進位資料傳給 Database 建構子
  const db = new SQL.Database(data);
  return db;
}

// 也可以從伺服器 fetch
async function fetchDatabase(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const db = new SQL.Database(new Uint8Array(buffer));
  return db;
}
```

這個特性讓 sql.js 很適合做「把 SQLite 當作唯讀資料格式」的應用場景，比如把資料用 SQLite 打包，前端直接載入查詢，省掉 REST API 那層。

## Web Worker 用法

如果資料量大，同步的 SQL 操作會卡住主執行緒。sql.js 提供了 Web Worker 版本：

```js
// main.js
// 使用 sql.js 官方提供的 Worker 腳本
const worker = new Worker(
  'https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/worker.sql-wasm.js'
);

// 所有操作都透過訊息傳遞
worker.onmessage = (event) => {
  const { id, results, error } = event.data;
  if (error) {
    console.error('SQL error:', error);
    return;
  }
  console.log('Query results:', results);
};

// 初始化資料庫
worker.postMessage({ id: 1, action: 'open' });

// 執行 SQL
worker.postMessage({
  id: 2,
  action: 'exec',
  sql: 'CREATE TABLE test (id INTEGER, val TEXT)',
});

worker.postMessage({
  id: 3,
  action: 'exec',
  sql: 'INSERT INTO test VALUES (?, ?)',
  params: [1, 'hello'],
});

worker.postMessage({
  id: 4,
  action: 'exec',
  sql: 'SELECT * FROM test',
});
```

Worker API 用 `id` 來對應請求和回應，實際專案裡通常需要包一層 Promise 讓呼叫端更好用。

## 什麼時候不應該用 sql.js

sql.js 是瀏覽器環境的解法。如果你在 Node.js 跑，用 [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) 就好，它直接用 native binding，速度快很多，API 也更簡潔，沒有那個 1.5 MB Wasm 的負擔。

另一個要評估的點是初次載入時間。1.5 MB 的 `.wasm` 對頻寬有限的使用者是個門檻。如果只是要做簡單的鍵值存取，用 localStorage 或 IndexedDB 就夠了，不需要動用整個 SQLite 引擎。

## 延伸閱讀

如果你想把 sql.js 搭配 IndexedDB 做成真正能離線使用的應用，讓資料在頁面重新整理後還能保留，可以看 [用 sql.js + IndexedDB 打造離線可用的 Web App](/post/sql-js-offline-web-app/)。

要比較 sql.js 和 localStorage、IndexedDB、Cache API 在不同使用場景的優劣，可以參考 [瀏覽器儲存方案比較：localStorage、IndexedDB、sql.js 怎麼選](/post/browser-storage-comparison/)。
