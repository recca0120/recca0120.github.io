---
title: 'Run SQLite in the Browser with sql.js: A Complete Guide from Install to CRUD'
description: 'Learn how to use sql.js to run SQLite entirely in the browser — from installation and initialization to CRUD operations, import/export, and Web Workers.'
slug: sql-js-browser-sqlite
date: '2026-03-03T08:30:00+08:00'
image: featured.png
categories:
- Frontend
tags:
- sql.js
- SQLite
- JavaScript
- WebAssembly
draft: false
---

Have you ever needed to run complex queries on the frontend without spinning up a backend for it? I've run into this a few times — local tooling, offline apps, data analysis pages. Every time, I found myself wishing I could just run SQL directly in the browser.

[sql.js](https://github.com/sql-js/sql.js) is the answer. It compiles SQLite's C source code to WebAssembly using Emscripten, so the entire SQLite engine runs inside the browser. No server, no API — SQL executes locally.

## What sql.js Is and How It Works

At its core, sql.js uses the Emscripten toolchain to compile SQLite 3's C code into a `.wasm` binary. Once the browser loads this Wasm module, you have a full SQLite engine available to call.

**A few important characteristics to know upfront:**

- **In-memory by default**: The database lives in memory. A page refresh wipes it. For persistence, you need to serialize the data yourself and store it in IndexedDB or localStorage.
- **Synchronous API, asynchronous init**: Loading the Wasm module is async, but executing SQL is synchronous.
- **Full SQLite feature set**: Transactions, prepared statements, custom functions, triggers — nearly everything SQLite supports.
- **File size**: The `sql-wasm.wasm` file is around 1.5 MB, which has a real impact on initial page load.

Currently at v1.14.0, MIT licensed, 13.5k stars on GitHub — this is the standard solution for running SQL in the browser.

## Installation

### npm

```bash
npm install sql.js
```

After installing, the `.wasm` file lives at `node_modules/sql.js/dist/sql-wasm.wasm`. You need to make this static asset accessible to the browser. With Vite, you can use `assetsInclude` in `vite.config.js`, or just copy the file to your public directory.

### CDN

If you want to skip the build tool setup, CDN is the quickest path:

```html
<!-- Load from jsDelivr -->
<script src="https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/sql-wasm.js"></script>
```

The Wasm file is handled automatically by the CDN — no extra configuration needed.

## Initialization

sql.js needs to know where the `.wasm` file is. You provide this via the `locateFile` option:

```js
// Initialize sql.js and specify the wasm file location
async function initSqlJs() {
  const SQL = await initSqlJs({
    // locateFile returns the URL for the requested wasm file
    locateFile: (filename) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/${filename}`,
  });

  // Create an empty in-memory database
  const db = new SQL.Database();
  return db;
}

const db = await initSqlJs();
```

If you installed via npm and are bundling with Vite, point `locateFile` at your own static asset path:

```js
locateFile: (filename) => `/assets/${filename}`,
```

## CRUD Operations

### Creating a Table

```js
// Use run() for DDL statements
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT    NOT NULL,
    age  INTEGER
  )
`);
```

`run()` is for SQL that doesn't return results — DDL, INSERT, UPDATE, DELETE.

### Inserting Data

```js
// Don't concatenate strings — SQL injection risk
// db.run(`INSERT INTO users (name, age) VALUES ('Alice', 30)`);

// Use parameter binding instead
db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30]);
db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 25]);
db.run('INSERT INTO users (name, age) VALUES (?, ?)', ['Carol', 28]);
```

### Querying Data

Use `exec()` for SELECT statements — it returns an array of result sets:

```js
// exec() returns [{ columns: [...], values: [[...], [...]] }]
const results = db.exec('SELECT id, name, age FROM users WHERE age > ?', [26]);

if (results.length > 0) {
  const { columns, values } = results[0];

  // columns: ['id', 'name', 'age']
  // values:  [[1, 'Alice', 30], [3, 'Carol', 28]]

  // Convert to array of objects for easier use
  const rows = values.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]]))
  );

  console.log(rows);
  // [{ id: 1, name: 'Alice', age: 30 }, { id: 3, name: 'Carol', age: 28 }]
}
```

The split columns/values format that `exec()` returns means you'll need to do this conversion step every time — a minor annoyance.

### Update and Delete

```js
// UPDATE
db.run('UPDATE users SET age = ? WHERE name = ?', [31, 'Alice']);

// DELETE
db.run('DELETE FROM users WHERE age < ?', [27]);
```

### Checking Affected Rows

```js
db.run('DELETE FROM users WHERE age < ?', [27]);

// getRowsModified() returns the row count from the last operation
const affected = db.getRowsModified();
console.log(`Deleted ${affected} row(s)`);
```

## Prepared Statements and Parameter Binding

For queries you run repeatedly, prepared statements give you better performance:

```js
// Create a prepared statement
const stmt = db.prepare('INSERT INTO users (name, age) VALUES (?, ?)');

const users = [
  ['Dave', 22],
  ['Eve', 35],
  ['Frank', 29],
];

// Batch insert
for (const [name, age] of users) {
  stmt.run([name, age]);
}

// Always free statements when done — otherwise you get memory leaks
stmt.free();
```

Prepared statements also support named parameters:

```js
const stmt = db.prepare('SELECT * FROM users WHERE name = :name AND age > :minAge');

stmt.bind({ ':name': 'Alice', ':minAge': 25 });

// step() advances one row at a time, returns true while rows remain
while (stmt.step()) {
  const row = stmt.getAsObject();
  // row is { id: 1, name: 'Alice', age: 30 }
  console.log(row);
}

stmt.free();
```

## Custom Functions

sql.js lets you define SQLite custom functions in JavaScript, which is genuinely useful:

```js
// Create a custom function (SQLite has built-in length, this is just an example)
db.create_function('js_upper', (str) => str.toUpperCase());

// Use it directly in SQL
const results = db.exec("SELECT js_upper(name) AS upper_name FROM users");
// Returns [{ columns: ['upper_name'], values: [['ALICE'], ['BOB'], ...] }]
```

A more practical use case is filling in functions that SQLite doesn't have, like regex matching:

```js
// SQLite doesn't support REGEXP out of the box — add it yourself
db.create_function('regexp', (pattern, str) => {
  return new RegExp(pattern).test(str) ? 1 : 0;
});

// Now REGEXP works in queries
const results = db.exec("SELECT * FROM users WHERE regexp('^A', name)");
```

## Importing and Exporting .db Files

This is one of sql.js's most useful capabilities: you can serialize the entire database to a `Uint8Array`, or load an existing `.db` file.

### Export

```js
// export() returns a Uint8Array — the raw binary content of the .db file
const data = db.export();

// Prompt the user to download the file
const blob = new Blob([data], { type: 'application/octet-stream' });
const url = URL.createObjectURL(blob);

const a = document.createElement('a');
a.href = url;
a.download = 'mydb.sqlite';
a.click();

// Clean up
URL.revokeObjectURL(url);
```

### Import

```js
// Read a .db file from an <input type="file"> element
async function loadDatabase(file) {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  // Pass the binary data to the Database constructor
  const db = new SQL.Database(data);
  return db;
}

// Or fetch from a server
async function fetchDatabase(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const db = new SQL.Database(new Uint8Array(buffer));
  return db;
}
```

This feature makes sql.js a good fit for the pattern of "using SQLite as a read-only data format" — package your data as a SQLite file, load it in the frontend, query it directly. No REST API layer needed.

## Web Worker Usage

For large datasets, synchronous SQL operations will block the main thread. sql.js ships a Web Worker version for this:

```js
// main.js
// Use the official sql.js Worker script
const worker = new Worker(
  'https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/worker.sql-wasm.js'
);

// All operations go through message passing
worker.onmessage = (event) => {
  const { id, results, error } = event.data;
  if (error) {
    console.error('SQL error:', error);
    return;
  }
  console.log('Query results:', results);
};

// Initialize the database
worker.postMessage({ id: 1, action: 'open' });

// Execute SQL
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

The Worker API uses `id` to correlate requests and responses. In a real project, you'd typically wrap this in a Promise-based helper to make the call site cleaner.

## When Not to Use sql.js

sql.js is a browser solution. If you're in Node.js, use [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) instead — it uses native bindings, runs significantly faster, has a cleaner API, and doesn't carry the 1.5 MB Wasm overhead.

The other thing to weigh is initial load time. That 1.5 MB `.wasm` file is a real cost for users on slower connections. If you just need simple key-value storage, localStorage or IndexedDB is plenty — you don't need to pull in an entire SQL engine for that.

## Further Reading

If you want to pair sql.js with IndexedDB to build a genuinely offline-capable app — where data survives page refreshes — see [Building an Offline Web App with sql.js and IndexedDB](/post/sql-js-offline-web-app/).

For a comparison of sql.js against localStorage, IndexedDB, and Cache API across different use cases, check out [Browser Storage Comparison: How to Choose Between localStorage, IndexedDB, and sql.js](/post/browser-storage-comparison/).
