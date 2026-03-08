---
title: 'fetch 並發控制：用 p-limit 限制同時請求數量，避免打爆 API'
date: '2026-03-22T09:00:00+08:00'
slug: fetch-concurrent-requests
description: 'Promise.all 同時發出 100 個請求，server 很容易回 429 或直接掛掉。用 p-limit 搭配 fetch 限制同時執行的請求數量，只需要一行設定，不需要自己寫 semaphore。'
categories:
  - Frontend
tags:
  - fetch
  - javascript
  - typescript
  - concurrency
  - p-limit
  - api
  - rate-limiting
---

要批次打 100 個 API，`Promise.all` 一行搞定，全部同時發出去。
然後 server 回 `429 Too Many Requests`，或者直接慢到沒有回應。
用 [p-limit](https://github.com/sindresorhus/p-limit) 限制同時跑的請求數，三行解決。

## 問題：Promise.all 沒有節流

```typescript
const userIds = Array.from({ length: 100 }, (_, i) => i + 1);

// 100 個請求同時發出，server 吃不消
const users = await Promise.all(
  userIds.map(id =>
    fetch(`https://api.example.com/users/${id}`).then(r => r.json())
  )
);
```

`Promise.all` 會等所有請求完成才 resolve，但它不控制「同時跑幾個」。100 個 ID 就是 100 個請求同時出去。

瀏覽器對同一個 domain 有連線數限制（大約 6），多的會排隊等。但 Node.js 沒有這個限制，全部真的同時出去。Server 端的 rate limit 也不分瀏覽器或 Node。

## 解法：p-limit

```bash
npm install p-limit
```

```typescript
import pLimit from 'p-limit';

// 最多同時 5 個請求
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

`limit(() => fetch(...))` 把請求包起來，p-limit 確保同時執行的不超過 5 個。其他的在佇列裡等，有空位才往前。`Promise.all` 仍然等全部完成，但不是全部同時跑。

## 運作方式

```
concurrency = 3，有 6 個請求：

[請求 1] ──── 完成 ──→ [請求 4 開始]
[請求 2] ──────── 完成 ──→ [請求 5 開始]
[請求 3] ──────────── 完成 ──→ [請求 6 開始]
[請求 4] 等待...
[請求 5] 等待...
[請求 6] 等待...
```

任何時候最多 3 個在跑，有一個完成就從佇列裡拉下一個。

## 完整範例

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
console.log(`取得 ${users.length} 個使用者`);
```

## 監控進度

```typescript
const limit = pLimit(5);

const interval = setInterval(() => {
  console.log(`執行中: ${limit.activeCount}，等待中: ${limit.pendingCount}`);
}, 500);

const users = await Promise.all(
  userIds.map(id => limit(() => fetchUser(id)))
);

clearInterval(interval);
```

## 不要 fail fast：用 Promise.allSettled

`Promise.all` 只要有一個失敗就全部取消。用 `Promise.allSettled` 收集成功和失敗：

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
console.log(`成功: ${succeeded.length}，失敗: ${failed.length}`);
```

## 動態調整 concurrency

```typescript
const limit = pLimit(10);

// 發現 server 開始回 429，降速
limit.concurrency = 3;

// 恢復正常後加速
limit.concurrency = 10;
```

## limit.map 語法糖

```typescript
const limit = pLimit(5);

const users = await limit.map(
  Array.from({ length: 100 }, (_, i) => i + 1),
  (id) => fetchUser(id)
);
```

跟 `Promise.all(ids.map(id => limit(() => fetchUser(id))))` 等效，稍微短一點。

## 自己實作 Semaphore（零依賴）

不想加 p-limit 的話，可以自己寫：

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
      next();  // current 不變，直接給下一個
    } else {
      this.current--;
    }
  }
}

// 用法
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

邏輯跟 p-limit 一樣，只是自己管佇列。程式碼多一些，但不多一個依賴。

## 小結

`Promise.all` 同時打幾百個請求是很常見的意外。`p-limit` 三行設定就能控制同時執行的數量，不需要自己寫 semaphore，也不影響 `Promise.all` 收集結果的方式。

如果需要 retry 和 timeout，可以搭配 [ky 的並發控制](/p/ky-concurrent-requests/) 一起用。
