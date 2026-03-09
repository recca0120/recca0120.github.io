---
title: 'Query SQLite on GitHub Pages with sql.js-httpvfs'
description: 'Use sql.js-httpvfs to query SQLite databases hosted on static sites via HTTP Range Requests — no need to download the entire database file.'
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

I once had a 670 MB SQLite database and a simple requirement: put it on a static site so users could search it by keyword. Use a backend? The whole project was static — I didn't want to spin up a server just for this. Upload the raw DB and have the browser download it? Nobody is waiting for 670 MB.

That's when I found [sql.js-httpvfs](https://github.com/phiresky/sql.js-httpvfs), and the problem went away. It builds on [sql.js](https://github.com/sql-js/sql.js), adding an HTTP Range Request-based virtual file system so the browser only fetches the SQLite pages a query actually needs. That same 670 MB database? A simple key lookup transfers roughly 1 KB.

## How it works: fetching only what you need

SQLite stores data in fixed-size pages (4096 bytes by default). Every B-Tree node, every index entry, and every row maps to a specific page number. When you run an indexed query, SQLite only needs to read the pages along the B-Tree path — it never has to scan the whole table.

sql.js-httpvfs exploits this by replacing the Emscripten VFS (Virtual File System) layer. Where stock sql.js reads from an in-memory ArrayBuffer, this version issues HTTP Range Requests instead:

```
GET /data.sqlite HTTP/1.1
Range: bytes=4096-8191
```

The server returns just those 4096 bytes, which get handed to the SQLite engine. Everything runs inside a Web Worker, so the main thread is never blocked, and all queries are async.

To reduce round trips, the library implements 3 virtual read heads that each track access patterns. If a read head detects sequential page access, it automatically ramps up prefetching — from one page at a time to several pages per request. This matters a lot for full-text search, which traverses many tree nodes in sequence.

### Index design determines transfer size

The most important thing to understand about this approach: your queries must use indexes, or the benefits largely disappear.

A SCAN TABLE means SQLite has to read every page in the table — under HTTP Range Requests, that means downloading the whole table. A COVERING INDEX lets the query work entirely within the index B-Tree, without touching the data rows at all.

Use `EXPLAIN QUERY PLAN` to confirm:

```sql
-- Good: uses index
EXPLAIN QUERY PLAN
SELECT name, price FROM products WHERE sku = 'ABC123';
-- Output: SEARCH products USING INDEX idx_sku (sku=?)

-- Bad: full table scan
EXPLAIN QUERY PLAN
SELECT * FROM products WHERE description LIKE '%keyword%';
-- Output: SCAN products
```

## Installation and initialization

```bash
npm install sql.js-httpvfs
```

sql.js-httpvfs needs two additional static assets: `sql-wasm.wasm` and a Worker JS file. Both are included in the package — you just need to copy them into your public directory. With Vite:

```bash
# Copy the wasm and worker files into public/
cp node_modules/sql.js-httpvfs/dist/sql-wasm.wasm public/
cp node_modules/sql.js-httpvfs/dist/sqlite.worker.js public/
```

Initialize the worker:

```typescript
import { createDbWorker } from 'sql.js-httpvfs'

// workerUrl and wasmUrl must point to the static files in your public directory
const workerUrl = new URL('/sqlite.worker.js', import.meta.url)
const wasmUrl = new URL('/sql-wasm.wasm', import.meta.url)

const worker = await createDbWorker(
  [
    {
      from: 'url',                          // load from a URL (there's also an inline mode)
      config: {
        serverMode: 'full',                 // single-file mode
        url: '/data.sqlite',               // path to the database
        requestChunkSize: 4096,            // Range Request size, aligned to SQLite page size
      },
    },
  ],
  workerUrl.toString(),
  wasmUrl.toString()
)
```

`requestChunkSize` defaults to 4096, matching the SQLite default page size. If you set your database page size to 1024, adjust this value to match.

## Preparing the database

How the database is configured directly affects transfer efficiency. Do these steps before uploading:

```sql
-- Smaller page size means finer-grained Range Requests
-- Must be set before creating any tables — cannot be changed afterward
PRAGMA page_size = 1024;

-- Remove the WAL file, otherwise you'd need to keep two files in sync
PRAGMA journal_mode = delete;

-- Rebuild the database to apply the page size setting and remove fragmentation
VACUUM;
```

When designing indexes, think about your query patterns and use covering indexes wherever possible:

```sql
-- If the common query is WHERE category = ? ORDER BY created_at DESC LIMIT 20,
-- a covering index includes all columns needed by SELECT,
-- so the query never has to touch the data rows
CREATE INDEX idx_category_date_cover
  ON articles(category, created_at DESC, title, slug);
```

For full-text search, use FTS5:

```sql
CREATE VIRTUAL TABLE articles_fts USING fts5(
  title,
  content,
  content='articles',  -- reference the source table to avoid storing data twice
  content_rowid='id'
);

-- Populate the FTS index on initial data load
INSERT INTO articles_fts(articles_fts) VALUES('rebuild');
```

## Running queries

Once the worker is set up, querying looks similar to regular sql.js — but everything returns a Promise:

```typescript
// Standard query
const results = await worker.db.query(
  `SELECT title, slug, created_at
   FROM articles
   WHERE category = ?
   ORDER BY created_at DESC
   LIMIT 20`,
  ['frontend']
)

// results is { columns: string[], values: any[][] }
console.log(results.columns) // ['title', 'slug', 'created_at']
console.log(results.values)  // [['Article title', 'slug-here', '2024-01-01'], ...]
```

Full-text search:

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

## Monitoring transfer size

One of my favorite parts: you can see exactly how many bytes each query fetches.

```typescript
// Record stats before the query
const bytesBefore = worker.getStats().totalFetchedBytes

await worker.db.query('SELECT * FROM articles WHERE id = ?', [42])

// Compare after
const bytesAfter = worker.getStats().totalFetchedBytes
console.log(`Query transferred: ${bytesAfter - bytesBefore} bytes`)
```

`getStats()` returns an object with `totalFetchedBytes` (cumulative transfer) and `totalRequests` (cumulative request count). During development I display these numbers on screen to verify that indexes are actually working.

## Splitting the database into chunks

For large databases you can split the file into fixed-size chunks, which makes CDN caching much more effective:

```bash
# Split with the system split command (Linux/macOS)
split -b 10m data.sqlite data.sqlite.
# Produces data.sqlite.aa, data.sqlite.ab, ...

# Or use the tool bundled with sql.js-httpvfs
npx sql.js-httpvfs-tools split data.sqlite --chunk-size 10485760
# Produces split files and a JSON manifest describing the chunks
```

Switch to `serverMode: 'chunked'` in the config:

```typescript
{
  from: 'url',
  config: {
    serverMode: 'chunked',
    serverChunkSize: 10 * 1024 * 1024,   // 10 MB per chunk
    urlPrefix: '/db/data.sqlite.',        // prefix shared by all chunk files
    urlSuffix: '',
    fromCache: false,
    requestChunkSize: 4096,
  },
}
```

## Deploying to GitHub Pages

Put the database and static assets in your repo (or use Git LFS), then push. GitHub's static file server supports Range Requests out of the box — no special configuration needed.

S3, Cloudflare Pages, and Netlify all support Range Requests as well, so any of those work directly.

One thing to watch: CORS. If your frontend and database are on different origins, the server needs to return:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Range
Access-Control-Expose-Headers: Content-Range, Accept-Ranges
```

## Limitations

A few things worth knowing before you commit to this approach:

It is **read-only**. HTTP Range Requests are a read operation — writes require a backend. If you need both reads and writes in the browser, look at the [official SQLite Wasm with OPFS](https://sqlite.org/wasm/doc/trunk/index.md) or [wa-sqlite](https://github.com/rhashimoto/wa-sqlite).

There is **no cache eviction**. Pages downloaded during a session are cached in Worker memory, but that cache never shrinks. Users who run many different queries will see memory usage grow continuously.

It is **experimental**. The author describes this as demo-level code in the README, and it should not be used where high stability is required.

---

If you're new to sql.js, [Getting Started with sql.js: SQLite in the Browser](/post/sql-js-browser-sqlite/) covers the fundamentals. For use cases that need offline writes, [Offline Web Apps with sql.js and IndexedDB](/post/sql-js-offline-web-app/) walks through a complete implementation. If you want a broader comparison of browser storage options, [Browser Storage Solutions Compared](/post/browser-storage-comparison/) covers the landscape.

## References

- [sql.js-httpvfs GitHub Repository](https://github.com/phiresky/sql.js-httpvfs)
- [sql.js GitHub Repository](https://github.com/sql-js/sql.js)
- [SQLite FTS5 Full-Text Search Documentation](https://www.sqlite.org/fts5.html)
- [SQLite EXPLAIN QUERY PLAN](https://www.sqlite.org/eqp.html)
- [HTTP Range Requests (MDN Web Docs)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests)
- [Official SQLite Wasm with OPFS](https://sqlite.org/wasm/doc/trunk/index.md)
