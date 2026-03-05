---
title: 'Fetch Concurrency Control: Limit Simultaneous Requests with p-limit'
date: '2026-03-22T09:00:00+08:00'
slug: fetch-concurrent-requests
description: 'Promise.all with 100 requests fires them all at once — servers respond with 429 or fall over. Use p-limit with fetch to cap the number of simultaneous requests. One line of setup, no custom semaphore required.'
categories:
  - Frontend
tags:
  - fetch
  - javascript
  - typescript
  - concurrency
  - p-limit
---

Batch-fetching 100 API endpoints with `Promise.all` is one line. All 100 requests fire simultaneously.
Then the server returns `429 Too Many Requests`, or just crawls.
[p-limit](https://github.com/sindresorhus/p-limit) caps how many run at once. Three lines to fix it.

## The Problem: Promise.all Has No Throttling

```typescript
const userIds = Array.from({ length: 100 }, (_, i) => i + 1);

// 100 requests fire at once — the server can't handle this
const users = await Promise.all(
  userIds.map(id =>
    fetch(`https://api.example.com/users/${id}`).then(r => r.json())
  )
);
```

`Promise.all` waits for every request to finish, but it doesn't control how many run simultaneously. 100 IDs means 100 requests go out at the same time.

Browsers limit connections per domain (roughly 6), so extras queue. Node.js has no such limit — all 100 TCP connections open at once. Server-side rate limits don't distinguish.

## The Solution: p-limit

```bash
npm install p-limit
```

```typescript
import pLimit from 'p-limit';

// At most 5 concurrent requests
const limit = pLimit(5);

const userIds = Array.from({ length: 100 }, (_, i) => i + 1);

const users = await Promise.all(
  userIds.map(id =>
    limit(() =>
      fetch(`https://api.example.com/users/${id}`)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
    )
  )
);
```

`limit(() => fetch(...))` wraps the request. p-limit ensures no more than 5 run simultaneously. The rest wait in a queue. `Promise.all` still waits for all results — they just don't all run at the same time.

## How It Works

```
concurrency = 3, 6 requests:

[Request 1] ──── done ──→ [Request 4 starts]
[Request 2] ──────── done ──→ [Request 5 starts]
[Request 3] ──────────── done ──→ [Request 6 starts]
[Request 4] waiting...
[Request 5] waiting...
[Request 6] waiting...
```

At most 3 run at any moment. When one finishes, the next dequeues.

## Full Example

```typescript
import pLimit from 'p-limit';

interface User {
  id: number;
  name: string;
  email: string;
}

async function fetchUser(id: number): Promise<User> {
  const response = await fetch(`https://api.example.com/users/${id}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}: user ${id}`);
  return response.json() as Promise<User>;
}

async function fetchAllUsers(ids: number[]): Promise<User[]> {
  const limit = pLimit(5);

  return Promise.all(
    ids.map(id => limit(() => fetchUser(id)))
  );
}

const userIds = Array.from({ length: 100 }, (_, i) => i + 1);
const users = await fetchAllUsers(userIds);
console.log(`Fetched ${users.length} users`);
```

## Monitor Progress

```typescript
const limit = pLimit(5);

const interval = setInterval(() => {
  console.log(`Active: ${limit.activeCount}, Pending: ${limit.pendingCount}`);
}, 500);

const users = await Promise.all(
  userIds.map(id => limit(() => fetchUser(id)))
);

clearInterval(interval);
```

## Don't Fail Fast: Use Promise.allSettled

`Promise.all` cancels everything on the first failure. `Promise.allSettled` collects both successes and failures:

```typescript
async function fetchAllUsersSafe(ids: number[]) {
  const limit = pLimit(5);

  const results = await Promise.allSettled(
    ids.map(id => limit(() => fetchUser(id)))
  );

  const succeeded: User[] = [];
  const failed: Array<{ id: number; error: Error }> = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      succeeded.push(result.value);
    } else {
      failed.push({ id: ids[index], error: result.reason });
    }
  });

  return { succeeded, failed };
}

const { succeeded, failed } = await fetchAllUsersSafe(userIds);
console.log(`Succeeded: ${succeeded.length}, Failed: ${failed.length}`);
```

## Dynamic Concurrency

```typescript
const limit = pLimit(10);

// Server starts returning 429 — slow down
limit.concurrency = 3;

// Back to normal — speed up
limit.concurrency = 10;
```

## limit.map Shorthand

```typescript
const limit = pLimit(5);

const users = await limit.map(
  Array.from({ length: 100 }, (_, i) => i + 1),
  (id) => fetchUser(id)
);
```

Equivalent to `Promise.all(ids.map(id => limit(() => fetchUser(id))))`, slightly shorter.

## DIY Semaphore (Zero Dependencies)

If you'd rather not add p-limit:

```typescript
class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    return new Promise(resolve => {
      if (this.current < this.max) {
        this.current++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();  // pass the slot directly — current stays the same
    } else {
      this.current--;
    }
  }
}

// Usage
const semaphore = new Semaphore(5);

const users = await Promise.all(
  userIds.map(async id => {
    await semaphore.acquire();
    try {
      return await fetchUser(id);
    } finally {
      semaphore.release();
    }
  })
);
```

Same logic as p-limit, managing the queue manually. More code, one fewer dependency.

## Summary

Firing hundreds of simultaneous requests with `Promise.all` is a common mistake. p-limit caps the concurrency in three lines without changing how `Promise.all` collects results.

If you also need retry and timeout, see [ky with concurrency control](/en/p/ky-concurrent-requests/).
