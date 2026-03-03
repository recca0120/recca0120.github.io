---
title: 'Browser Storage Comparison: sql.js vs IndexedDB vs localStorage'
description: 'Compare browser-side storage solutions including sql.js, IndexedDB, and localStorage by capacity, query capabilities, performance, and use cases.'
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

Browser-side storage has more options than most developers expect. localStorage is the simplest but the most limited. IndexedDB is powerful but its API is notoriously verbose. [sql.js](https://github.com/sql-js/sql.js) gives you a full SQL engine running entirely in the browser. Each has its place, and picking the wrong one early costs you later.

This article compares the three across capacity, API style, query capability, and performance, then wraps up with a decision framework you can use before you write a single line of storage code.

---

## Overview of Each Option

### localStorage / sessionStorage

The veteran of browser storage. Key-value string storage with a synchronous API and virtually no learning curve:

```js
// Store data
localStorage.setItem('user', JSON.stringify({ name: 'Alice' }))

// Retrieve data
const user = JSON.parse(localStorage.getItem('user'))
```

`sessionStorage` shares the same API but clears when the tab is closed.

The limitations are hard to ignore: strings only, ~5 MB cap, and zero query capability. Finding a specific record means parsing the whole JSON blob and filtering in JavaScript.

### IndexedDB

The browser's built-in NoSQL object store. Asynchronous API, indexes, transactions, and support for JavaScript objects including Blobs and ArrayBuffers. The capacity ceiling is far more generous.

The raw API is aggressively verbose. Just opening a database requires wiring up multiple event listeners:

```js
// Opening a database with the native API
const request = indexedDB.open('mydb', 1)

request.onupgradeneeded = (event) => {
  const db = event.target.result
  // Create an object store with an index
  const store = db.createObjectStore('users', { keyPath: 'id' })
  store.createIndex('name', 'name', { unique: false })
}

request.onsuccess = (event) => {
  const db = event.target.result
  // Now you can actually do things...
}

request.onerror = (event) => {
  console.error('Failed to open database', event.target.error)
}
```

In practice, nearly everyone wraps this with [idb](https://github.com/jakearchibald/idb) to get a clean Promise-based API.

### sql.js (SQLite via Wasm)

sql.js compiles SQLite to WebAssembly so you can run a complete relational database in the browser. Standard SQL, JOINs, GROUP BY, subqueries — all of it works.

```js
// Initialize sql.js and create a table
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

The main limitation: the database lives in memory and disappears when the page closes. To persist it, you serialize the entire `.db` file as a `Uint8Array` and store it in IndexedDB, then reload it on next visit.

### OPFS + SQLite Wasm (The Newer Option)

The [Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) is a relatively recent browser API that provides a private file system hidden from the user. The official [SQLite Wasm](https://sqlite.org/wasm/doc/trunk/index.md) build supports writing the database directly to OPFS, which eliminates the need to use IndexedDB as an intermediary for persistence.

Browser support is reasonable as of late 2025, but the synchronous I/O path (`createSyncAccessHandle`) is only available inside a Web Worker, which adds architectural complexity compared to sql.js.

---

## Full Comparison Table

| Solution | Capacity | API Style | Query Power | Persistence | Best For |
|----------|----------|-----------|-------------|-------------|----------|
| localStorage | ~5 MB | Synchronous | None (filter in JS) | Persistent | Settings, small key-value pairs |
| sessionStorage | ~5 MB | Synchronous | None (filter in JS) | Cleared on tab close | Temporary form state, page state |
| IndexedDB | 10–50% of disk (browser-dependent) | Async (event / Promise) | Index lookups, range scans | Persistent | Large object sets, binary data, offline cache |
| sql.js | Limited by available RAM | Synchronous (Wasm calls) | Full SQL (JOINs, aggregates, subqueries) | Manual serialization required | Complex queries, analytics, existing SQLite data |
| SQLite Wasm + OPFS | Disk space | Async (Worker) | Full SQL | Native persistent | SQL with native persistence, modern browsers |

---

## Capacity in Detail

**localStorage**: Most browsers cap it at 5 MB of UTF-16 encoded string data. Exceeding it throws a `QuotaExceededError`.

**IndexedDB**: Capacity is managed dynamically by the browser. Chrome can use up to 80% of disk space, but data starts in `"best-effort"` mode and may be evicted if the system is low on storage. To protect against eviction, call `navigator.storage.persist()` to request `"persistent"` mode.

**sql.js**: The entire database lives in an `ArrayBuffer`, so the practical limit is however much memory the JavaScript engine will allocate. On modern desktop browsers, databases in the hundreds of megabytes work fine. Mobile devices deserve more caution.

---

## Query Capability Comparison

Same requirement across all three: **find orders with amount over 1000 and sum them by user.**

### localStorage Approach

```js
// localStorage has no query API — load everything, then filter in JS
const orders = JSON.parse(localStorage.getItem('orders') || '[]')

const result = orders
  .filter(o => o.amount > 1000)
  .reduce((acc, o) => {
    acc[o.userId] = (acc[o.userId] || 0) + o.amount
    return acc
  }, {})
```

At scale, every query deserializes the entire payload. Performance degrades quickly.

### IndexedDB Approach

```js
// Using the idb wrapper; aggregation still happens in JS
import { openDB } from 'idb'

const db = await openDB('shop', 1)
const tx = db.transaction('orders', 'readonly')
const index = tx.store.index('amount')

// IDBKeyRange handles range conditions, but not GROUP BY
const orders = await index.getAll(IDBKeyRange.lowerBound(1000))

const result = orders.reduce((acc, o) => {
  acc[o.userId] = (acc[o.userId] || 0) + o.amount
  return acc
}, {})
```

The index makes the range scan significantly faster, but you still do the aggregation yourself in JavaScript.

### sql.js Approach

```js
// One SQL statement handles everything
const rows = db.exec(`
  SELECT   user_id,
           SUM(amount) AS total
  FROM     orders
  WHERE    amount > 1000
  GROUP BY user_id
`)
```

The query logic is explicit and the database engine handles optimization.

---

## Performance Considerations

**sql.js initial load**: The Wasm binary is around 1 MB. The browser has to download, compile, and initialize it — typically 100–500 ms on first load, then cached. For lightweight applications, this startup cost is noticeable.

My approach is to kick off `initSqlJs()` in parallel with other initialization work at page load, so it is not on the critical path blocking user interaction.

**IndexedDB bulk writes**: Each transaction has overhead. Batch writes belong in a single transaction — do not open one transaction per record:

```js
// Correct: batch everything into one transaction
const tx = db.transaction('orders', 'readwrite')
for (const order of orders) {
  tx.store.put(order) // no need to await each call individually
}
await tx.done // wait for the full transaction to commit
```

**sql.js large reads**: In-memory table scans are fast, but converting `db.exec()` results from the Wasm-side representation to plain JavaScript objects carries cost at large result sizes. Apply pagination or streaming for big datasets.

---

## How to Choose

Here is the decision flow I follow:

1. **Storing settings, tokens, or a small number of key-value pairs under 5 MB** → `localStorage`
2. **Storing objects, binary files, or larger datasets that need to survive page reloads** → `IndexedDB`
3. **Need complex JOINs, aggregates, or full-text search, and can reload the database from IndexedDB on each visit** → `sql.js`
4. **Need complex SQL with native persistence and your target browsers support OPFS** → `SQLite Wasm + OPFS`
5. **Need SQL queries and cross-session persistence today with broad compatibility** → `sql.js` + IndexedDB for persistence

The sql.js + IndexedDB combination is currently the most compatible way to get persistent SQL in the browser:

```js
// Save: serialize the entire database into IndexedDB
const data = db.export() // returns Uint8Array
await idbSet('sqliteDb', data)

// Load: restore the database from IndexedDB
const saved = await idbGet('sqliteDb')
const db = new SQL.Database(saved ?? [])
```

---

## Further Reading

This is the third article in the series. The other two:

- [sql.js: Run SQLite in the Browser](/post/sql-js-browser-sqlite/) — a complete walkthrough from installation to your first query
- [Building an Offline Web App with sql.js and IndexedDB](/post/sql-js-offline-web-app/) — a real application demonstrating the persistence integration end to end

The three together cover the full picture of browser-side databases.
