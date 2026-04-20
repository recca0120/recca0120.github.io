---
title: 'ky + p-limit: Concurrency Control With Built-in Retry for Batch Requests'
date: '2026-03-23T09:00:00+08:00'
slug: ky-concurrent-requests
image: featured.jpg
description: 'ky handles per-request retry, timeout, and auth hooks. p-limit caps simultaneous requests. Two tools, two responsibilities — batch-fetching 100 endpoints without hitting 429 or losing data to network hiccups.'
categories:
  - Frontend
tags:
  - ky
  - typescript
  - javascript
  - concurrency
  - p-limit
  - api
  - rate-limiting
---

Batch 100 API calls with `Promise.all` and the server returns `429`.
Add retry and transient network errors self-heal — but there's still no cap on how many run at once.
[ky](https://github.com/sindresorhus/ky) handles per-request reliability. [p-limit](https://github.com/sindresorhus/p-limit) controls overall throughput. Both together is the complete solution.

## Two Problems, Two Tools

**What ky solves**: per-request reliability
- Automatic retry with exponential backoff
- Request timeout
- Auth header injection via hooks
- Consistent error handling

**What p-limit solves**: global concurrency control
- At most N requests running simultaneously
- The rest wait in a queue
- Each slot opens as requests complete

The two problems are independent. Combining them handles both.

## Installation

```bash
npm install ky p-limit
```

## Basic Usage

```typescript
import ky from 'ky';
import pLimit from 'p-limit';

interface User {
  id: number;
  name: string;
  email: string;
}

// ky instance: retry, timeout, auth configured once
const api = ky.create({
  prefixUrl: 'https://api.example.com/v1',
  timeout: 10_000,
  retry: {
    limit: 3,
    statusCodes: [408, 429, 500, 502, 503, 504],
    backoffLimit: 3000,
  },
});

// p-limit: at most 5 concurrent requests
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

p-limit controls "how many run at once" at the outer level. ky handles "what to do when this request fails" at the inner level. Clear separation of concerns.

## Full Instance With Auth Hook

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
        console.warn(`Retry #${retryCount}: ${request.url} — ${error.message}`);
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

Every request automatically carries the auth token, retries on failure with logging, and surfaces the server's error message when it ultimately fails.

## Don't Fail Fast: Promise.allSettled

One failed request shouldn't abort the whole batch:

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
console.log(`Succeeded: ${succeeded.length}, Failed: ${failed.length}`);
if (failed.length > 0) {
  console.error('Failed IDs:', failed.map(f => f.id));
}
```

`Promise.allSettled` waits for everything regardless of outcome. `Promise.all` cancels on the first failure — use that when you need all-or-nothing.

## Monitor Progress

```typescript
const limit = pLimit(5);

const interval = setInterval(() => {
  console.log(`Active: ${limit.activeCount}, Pending: ${limit.pendingCount}`);
}, 1000);

const users = await Promise.all(
  userIds.map(id => limit(() => api.get(`users/${id}`).json<User>()))
);

clearInterval(interval);
```

## Dynamic Concurrency

Back off when the server starts rate-limiting, then recover:

```typescript
const limit = pLimit(10);

// 429s increasing — slow down
limit.concurrency = 3;

// Back to normal
limit.concurrency = 10;
```

## Cancel Queued Requests

In a React component, cancel pending requests on unmount:

```typescript
// rejectOnClear: true rejects cancelled tasks instead of silently dropping them
const limit = pLimit({ concurrency: 5, rejectOnClear: true });

useEffect(() => {
  const tasks = ids.map(id =>
    limit(() => api.get(`users/${id}`).json<User>())
  );

  Promise.allSettled(tasks).then(setResults);

  return () => {
    // Cancel queued requests on unmount (running ones finish normally)
    limit.clearQueue();
  };
}, [ids]);
```

## ky vs fetch: Comparison

| | fetch + p-limit | ky + p-limit |
|---|---|---|
| Concurrency control | ✓ p-limit | ✓ p-limit |
| Auto retry | Write it yourself | ✓ built-in |
| Timeout | Manual AbortController | ✓ built-in |
| Auth header | Add manually each time | ✓ beforeRequest hook |
| Error messages | Parse manually | ✓ beforeError hook |
| Bundle size | fetch is native | +4KB |

If you only need concurrency control, [fetch + p-limit]({{< ref "/post/fetch-concurrent-requests" >}}) is enough.
If you also need retry and auth handling, ky removes a lot of boilerplate.

## Summary

ky and p-limit don't overlap: ky manages the lifecycle of each request, p-limit manages how many requests run at the same time. Batch API calls run into both problems. Using them together is the natural fit.

## References

- [ky GitHub Repository](https://github.com/sindresorhus/ky)
- [p-limit GitHub Repository](https://github.com/sindresorhus/p-limit)
- [MDN Promise.allSettled Documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)
- [MDN Promise.all Documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)
