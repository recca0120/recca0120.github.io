---
title: 'sql.js + IndexedDB：打造離線優先的 Web App'
description: '用 sql.js 搭配 IndexedDB 實現瀏覽器端 SQLite 資料持久化，打造不需後端也能離線運作的 Web 應用。'
slug: sql-js-offline-web-app
date: '2026-03-05T09:00:00+08:00'
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

[sql.js](https://github.com/sql-js/sql.js) 讓你在瀏覽器裡跑 SQLite，用法和伺服器端幾乎一樣。但有一個問題我在第一次用的時候才發現：關掉分頁，資料就不見了。

原因很直接——sql.js 把整個資料庫存在記憶體裡，沒有任何自動持久化機制。如果你想做一個真正能離線運作、重開瀏覽器資料還在的應用，你需要自己處理儲存這一層。

## 為什麼選 IndexedDB

第一個念頭通常是 `localStorage`，因為 API 簡單。但它有兩個致命限制：

1. **容量上限約 5MB**，超過就會拋出例外。一個稍微有點資料量的 SQLite 檔案輕鬆超過。
2. **只能存字串**，sql.js 匯出的是 `Uint8Array`，你得先轉 Base64 再存、讀的時候再轉回來，不只麻煩，轉換本身也會讓資料膨脹約 33%。

IndexedDB 沒有這兩個問題。它的儲存上限通常是磁碟空間的一定比例（現代瀏覽器一般允許幾百 MB 甚至更多），而且原生支援二進位資料，`Uint8Array` 直接存進去就好。

## 架構概述

整體架構非常清楚：

- **sql.js**：負責所有 SQL 查詢邏輯，資料存在記憶體中的 `SQL.Database` 實例
- **IndexedDB**：負責持久化，只存一個 key-value pair——資料庫的 `Uint8Array` 快照

兩者的邊界很明確，sql.js 不需要知道 IndexedDB 的存在，IndexedDB 也不需要理解 SQL。

## 封裝 IndexedDB 存取

原生 IndexedDB API 是基於事件回調的，直接用有點囉嗦。我習慣先包一個簡單的 Promise helper，省去後面的心智負擔。以下用原生 API 示範，不依賴任何額外套件：

```javascript
// db-storage.js

const DB_NAME = 'app-storage';
const STORE_NAME = 'sqlite-db';
const DB_KEY = 'main';

// 開啟（或建立）IndexedDB
function openStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      // 第一次開啟時建立 object store
      event.target.result.createObjectStore(STORE_NAME);
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// 將 Uint8Array 存入 IndexedDB
export async function saveDatabase(data) {
  const idb = await openStorage();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(data, DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
  });
}

// 從 IndexedDB 讀取 Uint8Array，若不存在則回傳 null
export async function loadDatabase() {
  const idb = await openStorage();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(DB_KEY);
    request.onsuccess = (event) => resolve(event.target.result ?? null);
    request.onerror = (event) => reject(event.target.error);
  });
}
```

這個 helper 只有兩個公開函式：`saveDatabase` 和 `loadDatabase`，職責清楚。

## 儲存資料庫

sql.js 的 `db.export()` 會把當前記憶體中的資料庫序列化成 `Uint8Array`，直接丟給 `saveDatabase` 就好：

```javascript
import initSqlJs from 'sql.js';
import { saveDatabase } from './db-storage.js';

const SQL = await initSqlJs({
  // Wasm 檔案路徑，視你的打包設定調整
  locateFile: (file) => `/wasm/${file}`,
});

// 建立一個新的記憶體資料庫
const db = new SQL.Database();

// 建立資料表
db.run(`
  CREATE TABLE IF NOT EXISTS todos (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT    NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  )
`);

// 新增資料
db.run('INSERT INTO todos (text) VALUES (?)', ['買牛奶']);

// 匯出並儲存到 IndexedDB
const data = db.export(); // 回傳 Uint8Array
await saveDatabase(data);
```

## 載入資料庫

應用程式啟動時，先嘗試從 IndexedDB 讀取。如果有資料，就用它初始化 sql.js；如果沒有（第一次使用），就建立一個全新的資料庫：

```javascript
import initSqlJs from 'sql.js';
import { loadDatabase, saveDatabase } from './db-storage.js';

async function initDb() {
  const SQL = await initSqlJs({
    locateFile: (file) => `/wasm/${file}`,
  });

  // 嘗試從 IndexedDB 還原
  const saved = await loadDatabase();

  let db;
  if (saved) {
    // 用既有快照初始化，資料完整還原
    db = new SQL.Database(saved);
    console.log('資料庫已從 IndexedDB 還原');
  } else {
    // 第一次使用，建立新資料庫
    db = new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS todos (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT    NOT NULL,
        done INTEGER NOT NULL DEFAULT 0
      )
    `);
    console.log('建立新資料庫');
  }

  return db;
}
```

`new SQL.Database(saved)` 接受一個 `Uint8Array` 作為初始資料，這就是整個還原機制的核心。

## 自動儲存策略

手動在每次操作後呼叫 `saveDatabase` 很容易忘記，我通常會組合以下幾種策略：

**操作後立即儲存**——適合低頻操作，像是新增或刪除一筆記錄：

```javascript
async function addTodo(db, text) {
  db.run('INSERT INTO todos (text) VALUES (?)', [text]);
  // 操作完成後立刻持久化
  await saveDatabase(db.export());
}
```

**定時儲存**——適合高頻操作（如批次寫入），避免每次操作都觸發 IndexedDB 寫入：

```javascript
// 每 30 秒自動儲存一次
setInterval(async () => {
  await saveDatabase(db.export());
}, 30_000);
```

**`beforeunload` 儲存**——作為最後一道防線，在使用者關閉分頁前強制存一次：

```javascript
window.addEventListener('beforeunload', () => {
  // 注意：beforeunload 裡不能用 async/await
  // saveDatabase 內部的 IndexedDB 操作是非同步的，
  // 瀏覽器不保證在分頁關閉前完成，但實務上通常沒問題
  saveDatabase(db.export());
});
```

實務上我會把三者都加上，`beforeunload` 是補底用的，主要依賴操作後存或定時存。

## 完整範例：Todo App

把上面的部分組合成一個可以運作的 Todo App：

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <title>離線 Todo App</title>
</head>
<body>
  <h1>Todo</h1>
  <input id="input" type="text" placeholder="新增項目..." />
  <button id="add-btn">新增</button>
  <ul id="list"></ul>

  <script type="module">
    import initSqlJs from 'https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/sql-wasm.js';
    import { loadDatabase, saveDatabase } from './db-storage.js';

    const SQL = await initSqlJs({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/${file}`,
    });

    // 初始化資料庫（還原或新建）
    const saved = await loadDatabase();
    const db = saved ? new SQL.Database(saved) : new SQL.Database();

    if (!saved) {
      db.run(`
        CREATE TABLE todos (
          id   INTEGER PRIMARY KEY AUTOINCREMENT,
          text TEXT    NOT NULL,
          done INTEGER NOT NULL DEFAULT 0
        )
      `);
    }

    // 渲染清單
    function renderList() {
      const list = document.getElementById('list');
      list.innerHTML = '';
      const results = db.exec('SELECT id, text, done FROM todos ORDER BY id');
      if (!results.length) return;

      for (const [id, text, done] of results[0].values) {
        const li = document.createElement('li');
        li.textContent = `${done ? '✓' : '○'} ${text}`;
        li.style.cursor = 'pointer';
        li.addEventListener('click', async () => {
          // 切換完成狀態
          db.run('UPDATE todos SET done = ? WHERE id = ?', [done ? 0 : 1, id]);
          await saveDatabase(db.export()); // 操作後立即存
          renderList();
        });
        list.appendChild(li);
      }
    }

    // 新增 Todo
    document.getElementById('add-btn').addEventListener('click', async () => {
      const input = document.getElementById('input');
      const text = input.value.trim();
      if (!text) return;

      db.run('INSERT INTO todos (text) VALUES (?)', [text]);
      await saveDatabase(db.export()); // 操作後立即存
      input.value = '';
      renderList();
    });

    // 關閉前補存一次
    window.addEventListener('beforeunload', () => {
      saveDatabase(db.export());
    });

    renderList();
  </script>
</body>
</html>
```

打開瀏覽器、新增幾筆 Todo、重新整理頁面，資料應該還在。第一次做到這一步的時候我覺得還挺有趣的——一個完全不需要後端的資料應用。

## 效能注意事項

這套方案在資料庫不大的情況下很好用，但有幾個邊界要留意：

**`db.export()` 是全量快照**。不管你只改了一筆資料，它都會把整個資料庫序列化成 `Uint8Array`。資料庫很小（幾 MB 以內）時感覺不到，但如果資料量長到幾十 MB，每次操作後存一次就會變得很慢。超過 50MB 的資料庫，建議改成只在特定時機（如使用者明確儲存、定時快照）才寫入 IndexedDB，避免頻繁的大型二進位寫入拖慢 UI。

**IndexedDB 本身也有配額限制**，各瀏覽器和作業系統的上限不一樣，通常是可用磁碟空間的某個百分比。一般應用不會碰到，但如果你預期資料量很大，最好加上配額檢查（`navigator.storage.estimate()`）。

---

如果你還沒看過 sql.js 的基本用法，可以先看 [sql.js 在瀏覽器跑 SQLite 的入門教學](/post/sql-js-browser-sqlite/)。如果你對瀏覽器儲存機制的整體比較感興趣（localStorage、sessionStorage、IndexedDB、Cache API），可以參考 [瀏覽器儲存方案全比較](/post/browser-storage-comparison/)。
