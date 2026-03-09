---
title: 'sql.js + IndexedDB: Building an Offline-First Web App'
description: 'Persist sql.js SQLite databases in the browser using IndexedDB to build offline-first web applications that work without a backend.'
slug: sql-js-offline-web-app
date: '2026-03-05T09:00:00+08:00'
image: featured.jpg
categories:
- Frontend
- Database
tags:
- sql.js
- SQLite
- IndexedDB
- JavaScript
draft: false
---

[sql.js](https://github.com/sql-js/sql.js) lets you run SQLite inside the browser with an API that feels nearly identical to the server-side version. But there is a catch I only discovered the first time I used it: close the tab and all your data is gone.

The reason is straightforward—sql.js keeps the entire database in memory with no automatic persistence. If you want to build an application that truly works offline and survives a browser restart, you have to handle the storage layer yourself.

## Why IndexedDB

The first instinct is usually `localStorage` because the API is dead simple. But it has two hard limitations that rule it out:

1. **The storage cap is around 5 MB**, and exceeding it throws an exception. A SQLite file with any real data can blow past that easily.
2. **It can only store strings**. sql.js exports a `Uint8Array`, so you would have to Base64-encode it before writing and decode it back on read. That is extra complexity, and the encoding alone inflates the binary size by roughly 33%.

IndexedDB has neither of those problems. Its quota is typically a fraction of available disk space—modern browsers generally allow hundreds of megabytes or more—and it stores binary data natively. A `Uint8Array` goes straight in.

## Architecture Overview

The overall design is clean:

- **sql.js** handles all SQL query logic, operating on an in-memory `SQL.Database` instance.
- **IndexedDB** handles persistence, storing a single key-value pair: a `Uint8Array` snapshot of the database.

The boundary between the two is explicit. sql.js has no knowledge of IndexedDB, and IndexedDB has no understanding of SQL.

## Wrapping IndexedDB Access

The native IndexedDB API is callback-based, which gets verbose fast. I find it cleaner to wrap it in a small Promise helper upfront. The following uses only the native API with no extra dependencies:

```javascript
// db-storage.js

const DB_NAME = 'app-storage';
const STORE_NAME = 'sqlite-db';
const DB_KEY = 'main';

// Open (or create) the IndexedDB database
function openStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      // Create the object store on first open
      event.target.result.createObjectStore(STORE_NAME);
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Write a Uint8Array to IndexedDB
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

// Read a Uint8Array from IndexedDB, returns null if nothing is stored yet
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

Only two public functions: `saveDatabase` and `loadDatabase`. The responsibilities are narrow and clear.

## Saving the Database

sql.js's `db.export()` serializes the current in-memory database into a `Uint8Array`. Pass that directly to `saveDatabase`:

```javascript
import initSqlJs from 'sql.js';
import { saveDatabase } from './db-storage.js';

const SQL = await initSqlJs({
  // Adjust the path to match your build setup
  locateFile: (file) => `/wasm/${file}`,
});

// Create a new in-memory database
const db = new SQL.Database();

// Create the schema
db.run(`
  CREATE TABLE IF NOT EXISTS todos (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT    NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  )
`);

// Insert some data
db.run('INSERT INTO todos (text) VALUES (?)', ['Buy milk']);

// Export and persist to IndexedDB
const data = db.export(); // returns Uint8Array
await saveDatabase(data);
```

## Loading the Database

On startup, try to read from IndexedDB first. If data exists, use it to initialize sql.js. If not (first run), create a fresh database:

```javascript
import initSqlJs from 'sql.js';
import { loadDatabase, saveDatabase } from './db-storage.js';

async function initDb() {
  const SQL = await initSqlJs({
    locateFile: (file) => `/wasm/${file}`,
  });

  // Attempt to restore from IndexedDB
  const saved = await loadDatabase();

  let db;
  if (saved) {
    // Initialize from the saved snapshot
    db = new SQL.Database(saved);
    console.log('Database restored from IndexedDB');
  } else {
    // First run, create a new database
    db = new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS todos (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT    NOT NULL,
        done INTEGER NOT NULL DEFAULT 0
      )
    `);
    console.log('New database created');
  }

  return db;
}
```

`new SQL.Database(saved)` accepts a `Uint8Array` as its initial data. That one line is the entire restore mechanism.

## Auto-Save Strategies

Manually calling `saveDatabase` after every operation is easy to forget. I typically combine a few strategies:

**Save immediately after each write**—suitable for low-frequency operations like inserting or deleting a single record:

```javascript
async function addTodo(db, text) {
  db.run('INSERT INTO todos (text) VALUES (?)', [text]);
  // Persist right after the write
  await saveDatabase(db.export());
}
```

**Periodic saves**—suitable for high-frequency writes (e.g., batch operations) where you want to avoid triggering an IndexedDB write on every single change:

```javascript
// Auto-save every 30 seconds
setInterval(async () => {
  await saveDatabase(db.export());
}, 30_000);
```

**`beforeunload` save**—a last-resort safety net that forces a save when the user closes the tab:

```javascript
window.addEventListener('beforeunload', () => {
  // async/await does not work reliably here
  // The browser does not guarantee IndexedDB writes complete before the tab closes,
  // but in practice this tends to succeed for small databases
  saveDatabase(db.export());
});
```

In practice, I use all three. `beforeunload` is the backstop; the real work is done by the post-write or interval saves.

## Complete Example: Todo App

Putting the pieces together into a working Todo App:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Offline Todo App</title>
</head>
<body>
  <h1>Todo</h1>
  <input id="input" type="text" placeholder="Add an item..." />
  <button id="add-btn">Add</button>
  <ul id="list"></ul>

  <script type="module">
    import initSqlJs from 'https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/sql-wasm.js';
    import { loadDatabase, saveDatabase } from './db-storage.js';

    const SQL = await initSqlJs({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/${file}`,
    });

    // Initialize (restore or create)
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

    // Render the list
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
          // Toggle completion status
          db.run('UPDATE todos SET done = ? WHERE id = ?', [done ? 0 : 1, id]);
          await saveDatabase(db.export()); // persist after write
          renderList();
        });
        list.appendChild(li);
      }
    }

    // Add a new todo
    document.getElementById('add-btn').addEventListener('click', async () => {
      const input = document.getElementById('input');
      const text = input.value.trim();
      if (!text) return;

      db.run('INSERT INTO todos (text) VALUES (?)', [text]);
      await saveDatabase(db.export()); // persist after write
      input.value = '';
      renderList();
    });

    // Last-resort save on tab close
    window.addEventListener('beforeunload', () => {
      saveDatabase(db.export());
    });

    renderList();
  </script>
</body>
</html>
```

Open it in a browser, add a few todos, refresh the page—the data should still be there. The first time I got this working end-to-end I found it genuinely satisfying: a data-driven application with zero backend.

## Performance Considerations

This approach works well as long as the database stays reasonably small, but there are limits worth knowing about.

**`db.export()` is a full snapshot**. It does not matter if you changed a single row—it serializes the entire database into a `Uint8Array` every time. Below a few megabytes this is imperceptible, but once the database grows into the tens of megabytes, writing to IndexedDB on every operation will visibly slow things down. For databases exceeding roughly 50 MB, I would restrict saves to specific moments—an explicit user action, a periodic snapshot at a longer interval—rather than after every write.

**IndexedDB has quota limits** that vary by browser and operating system, typically based on available disk space. Most applications will never hit the ceiling, but if you expect large data volumes it is worth checking (`navigator.storage.estimate()`) and handling the case gracefully.

---

If you have not covered the basics of sql.js yet, [Getting Started with sql.js: Running SQLite in the Browser](/post/sql-js-browser-sqlite/) is the place to start. If you want a broader look at how IndexedDB compares to other browser storage options—localStorage, sessionStorage, Cache API—see [Browser Storage Compared](/post/browser-storage-comparison/).

## References

- [sql.js GitHub Repository](https://github.com/sql-js/sql.js)
- [IndexedDB API (MDN Web Docs)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Storage API: Quota Estimation (MDN Web Docs)](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API)
- [beforeunload Event (MDN Web Docs)](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)
