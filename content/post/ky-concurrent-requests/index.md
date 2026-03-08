---
title: 'ky + p-limit：並發控制加上內建 retry，批次請求的完整解法'
date: '2026-03-23T09:00:00+08:00'
slug: ky-concurrent-requests
description: 'ky 處理單一請求的 retry、timeout、auth hook，p-limit 控制同時執行的數量。兩個工具各司其職，批次打 100 個 API 不怕 429 也不怕網路抖動。'
categories:
  - 前端
tags:
  - ky
  - typescript
  - javascript
  - concurrency
  - p-limit
  - api
  - rate-limiting
---

批次打 API，`Promise.all` 同時發 100 個請求，server 回 `429`。
加了 retry，網路抖動導致的錯誤自動重試，但還是沒有限制同時跑幾個。
[ky](https://github.com/sindresorhus/ky) 處理每個請求的可靠性，[p-limit](https://github.com/sindresorhus/p-limit) 控制整體吞吐量，兩個一起用才完整。

## 兩個問題，兩個工具

**ky 解決的**：單一請求的可靠性
- 失敗自動 retry（指數退避）
- 請求逾時
- auth header 注入
- 統一的錯誤處理

**p-limit 解決的**：整體並發控制
- 最多同時 N 個請求在跑
- 其他的在佇列等待
- 有空位才往前

兩個問題是獨立的，組合起來才是完整方案。

## 安裝

```bash
npm install ky p-limit
```

## 基本用法

```typescript
import ky from 'ky';
import pLimit from 'p-limit';

interface User {
  id: number;
  name: string;
  email: string;
}

// ky instance：統一設定 retry、timeout、auth
const api = ky.create({
  prefixUrl: 'https://api.example.com/v1',
  timeout: 10_000,
  retry: {
    limit: 3,
    statusCodes: [408, 429, 500, 502, 503, 504],
    backoffLimit: 3000,
  },
});

// p-limit：最多同時 5 個請求
const limit = pLimit(5);

async function fetchUser(id: number): Promise<User> {
  return api.get(`users/${id}`).json<User>();
}

async function fetchAllUsers(ids: number[]): Promise<User[]> {
  return Promise.all(
    ids.map(id => limit(() => fetchUser(id)))
  );
}

const userIds = Array.from({ length: 100 }, (_, i) => i + 1);
const users = await fetchAllUsers(userIds);
```

p-limit 在外層控制「幾個同時跑」，ky 在內層處理「這個請求失敗要怎麼辦」，職責清楚。

## 加上 auth hook 的完整 instance

```typescript
import ky, { HTTPError } from 'ky';
import pLimit from 'p-limit';

const api = ky.create({
  prefixUrl: 'https://api.example.com/v1',
  timeout: 15_000,
  retry: {
    limit: 3,
    statusCodes: [408, 429, 500, 502, 503, 504],
    backoffLimit: 3000,
  },
  hooks: {
    beforeRequest: [
      (request) => {
        const token = localStorage.getItem('authToken');
        if (token) request.headers.set('Authorization', `Bearer ${token}`);
      },
    ],
    beforeRetry: [
      ({ request, error, retryCount }) => {
        console.warn(`重試 #${retryCount}：${request.url}，原因：${error.message}`);
      },
    ],
    beforeError: [
      async (error) => {
        if (error instanceof HTTPError) {
          const body = await error.response.clone().json().catch(() => ({}));
          error.message = body.message ?? `HTTP ${error.response.status}`;
        }
        return error;
      },
    ],
  },
});
```

每個請求都自動帶 token，失敗時會 retry 並 log，最終失敗的 error 有 server 回的訊息。

## 不 fail fast：用 Promise.allSettled

一個請求失敗不應該讓整批都失敗：

```typescript
async function fetchAllUsersSafe(ids: number[]) {
  const limit = pLimit(5);

  const results = await Promise.allSettled(
    ids.map(id =>
      limit(() => api.get(`users/${id}`).json<User>())
    )
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
if (failed.length > 0) {
  console.error('失敗的 ID:', failed.map(f => f.id));
}
```

`Promise.allSettled` 等所有請求結束才 resolve，不論成功或失敗。`Promise.all` 只要一個失敗就整批取消，適合「要嘛全部成功要嘛都不要」的情境。

## 監控進度

```typescript
const limit = pLimit(5);

const interval = setInterval(() => {
  console.log(`執行中: ${limit.activeCount}，等待中: ${limit.pendingCount}`);
}, 1000);

const users = await Promise.all(
  userIds.map(id => limit(() => api.get(`users/${id}`).json<User>()))
);

clearInterval(interval);
```

## 動態調整 concurrency

發現 server 開始限速時降速，恢復後加回來：

```typescript
const limit = pLimit(10);

// 429 增加，降速
limit.concurrency = 3;

// 恢復正常
limit.concurrency = 10;
```

## 取消佇列中的請求

在 React 元件 unmount 時取消還沒開始的請求：

```typescript
// rejectOnClear: true 讓取消的請求 reject，不是靜默丟棄
const limit = pLimit({ concurrency: 5, rejectOnClear: true });

useEffect(() => {
  const tasks = ids.map(id =>
    limit(() => api.get(`users/${id}`).json<User>())
  );

  Promise.allSettled(tasks).then(setResults);

  return () => {
    // 元件 unmount，取消還在佇列的請求（正在跑的跑完為止）
    limit.clearQueue();
  };
}, [ids]);
```

## ky vs fetch 的組合比較

| | fetch + p-limit | ky + p-limit |
|---|---|---|
| 並發控制 | ✓ p-limit | ✓ p-limit |
| 自動 retry | 要自己寫 | ✓ 內建 |
| timeout | 要自己用 AbortController | ✓ 內建 |
| auth header | 每次手動加 | ✓ beforeRequest hook |
| 錯誤訊息 | 要自己 parse | ✓ beforeError hook |
| bundle 大小 | fetch 是內建 | +4KB |

如果只需要並發控制，[fetch + p-limit](/p/fetch-concurrent-requests/) 就夠了。
如果同時需要 retry 和 auth，加 ky 省很多重複程式碼。

## 小結

ky 和 p-limit 解決的問題不重疊：ky 管「這個請求的生命週期」，p-limit 管「同時有幾個請求在跑」。批次呼叫 API 兩個問題都會遇到，組合起來用是最自然的做法。
