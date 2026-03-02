---
title: 'msw-fetch-mock: Undici-Style Fetch Mocking for MSW'
description: 'Compare msw-fetch-mock, MSW, nock, fetch-mock, and 3 other HTTP mocking libraries — with architecture analysis and concrete use-case recommendations for each.'
slug: msw-fetch-mock
date: '2026-03-03T06:00:00+08:00'
image: featured.png
categories:
  - Testing
  - Frontend
tags:
  - Testing
  - MSW
  - JavaScript
draft: false
---

When writing frontend or Node.js tests, mocking HTTP requests is practically mandatory. But choosing a mock solution is overwhelming: [MSW](https://mswjs.io), [nock](https://github.com/nock/nock), [fetch-mock](https://github.com/wheresrhys/fetch-mock), jest-fetch-mock… each has a different API style, interception level, and environment support. If you work on both Cloudflare Workers and Node.js projects, you'll find the mock APIs are completely different and test code can't be shared.

[msw-fetch-mock](https://github.com/recca0120/msw-fetch-mock) solves exactly this: it provides the same API style as undici's `MockAgent` and Cloudflare Workers' `fetchMock`, with MSW handling network-level interception underneath. One API, every environment.

## Why Existing Solutions Fall Short

Here are the 6 mainstream HTTP mock solutions today:

| Solution | npm Weekly Downloads | Interception Level | Node native fetch | Browser | Maintenance |
|----------|---------------------|-------------------|-------------------|---------|-------------|
| MSW | ~10.5M | Service Worker / Node internals | ✅ | ✅ | Active |
| nock | ~5.5M | Node `http` module | ❌ | ❌ | Active |
| fetch-mock | ~1.0M | Replaces `globalThis.fetch` | ✅ | ✅ | Active |
| jest-fetch-mock | ~1.3M | Replaces `global.fetch` | ✅ | ❌ | Abandoned |
| vitest-fetch-mock | ~240K | Replaces `globalThis.fetch` | ✅ | ❌ | Active |
| undici MockAgent | Built-in | undici Dispatcher | ✅ | ❌ | Node core |

Each has clear limitations:

- **MSW** is the most complete, but verbose. Every endpoint needs `http.get(url, resolver)`, and it lacks `times()`, `persist()`, `assertNoPendingInterceptors()` — essentials for testing.
- **nock** is the Node.js veteran with a clean API, but **doesn't support Node 18+ native `fetch`**. Native fetch uses undici, which bypasses the `http` module entirely.
- **fetch-mock** replaces `globalThis.fetch` directly — it works, but it's not network-level interception, so behavior may differ from production.
- **jest-fetch-mock** hasn't been updated in 6 years. No URL matching — responses are returned by call order only.
- **vitest-fetch-mock** is jest-fetch-mock ported to Vitest. Same limitation: no URL matching.
- **undici MockAgent** is the native Node.js solution, but doesn't work in browsers.

## Where msw-fetch-mock Fits

msw-fetch-mock doesn't build a mock engine from scratch. It stands on MSW's shoulders — using MSW for network-level interception (Service Worker in browser, `@mswjs/interceptors` in Node) — and wraps it with an undici-style API.

The architecture has three layers:

```
┌─────────────────────────────────────┐
│  FetchMock (User API)               │
│  .get(origin).intercept().reply()   │
├─────────────────────────────────────┤
│  Adapter (Environment)              │
│  NodeMswAdapter / BrowserMswAdapter │
│  NativeFetchAdapter (no MSW)        │
├─────────────────────────────────────┤
│  HandlerFactory                     │
│  MSW v2 / MSW v1 Legacy / Native   │
└─────────────────────────────────────┘
```

![msw-fetch-mock three-layer architecture](msw-fetch-mock-architecture.png)

The key is the **single catch-all handler**. MSW's standard approach registers one handler per endpoint, but in browser environments this causes Service Worker timing issues (each `worker.use()` requires SW communication). msw-fetch-mock registers just one `http.all('*', ...)` catch-all, running all matching logic in the main thread, avoiding Service Worker round-trip latency.

## Quick Start API

### Basic Setup

```typescript
import { fetchMock } from 'msw-fetch-mock';

beforeAll(() => fetchMock.activate({ onUnhandledRequest: 'error' }));
afterAll(() => fetchMock.deactivate());
afterEach(() => {
  fetchMock.assertNoPendingInterceptors(); // Unused mocks = broken test
  fetchMock.reset();
});
```

### Chain Builder

```typescript
const base = 'https://api.example.com';

// GET request
fetchMock.get(base)
  .intercept({ path: '/users' })
  .reply(200, [{ id: 1, name: 'Alice' }]);

// POST + body matching
fetchMock.get(base)
  .intercept({
    path: '/users',
    method: 'POST',
    headers: { Authorization: /^Bearer / },
    body: (b) => JSON.parse(b).role === 'admin',
  })
  .reply(201, { id: 2 });

// Dynamic response
fetchMock.get(base)
  .intercept({ path: '/echo', method: 'POST' })
  .reply(200, ({ body }) => JSON.parse(body));
```

### Behavior Control

```typescript
// Respond only 3 times
fetchMock.get(base).intercept({ path: '/api' }).reply(200, data).times(3);

// Never consumed (e.g., health check)
fetchMock.get(base).intercept({ path: '/health' }).reply(200, 'ok').persist();

// Simulate latency
fetchMock.get(base).intercept({ path: '/slow' }).reply(200, data).delay(500);

// Simulate network error
fetchMock.get(base).intercept({ path: '/fail' }).replyWithError();
```

### Call History

```typescript
const last = fetchMock.calls.lastCall();
expect(last.method).toBe('POST');
expect(last.json()).toEqual({ name: 'Alice' });

// Filter specific calls
fetchMock.calls.filterCalls({ method: 'POST', path: '/users' });
fetchMock.calls.called({ path: '/users' }); // boolean
```

### Net Connect Control

```typescript
fetchMock.disableNetConnect();              // Block all unmatched requests
fetchMock.enableNetConnect('localhost');     // Allow localhost
fetchMock.enableNetConnect(/\.internal$/);  // Allow hosts matching regex
```

## Full Comparison of All 6 Solutions

### Feature Comparison

| Feature | msw-fetch-mock | MSW | nock | fetch-mock | jest-fetch-mock | undici MockAgent |
|---------|:-:|:-:|:-:|:-:|:-:|:-:|
| URL pattern matching | ✅ | ✅ | ✅ | ✅ | ❌ | Partial |
| Method matching | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Header matching | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Body matching | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `times(n)` | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| `persist()` | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `delay(ms)` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `assertNoPendingInterceptors()` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Call history + filtering | ✅ | ❌ | ❌ | ✅ | Partial | ❌ |
| Network error simulation | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| GraphQL support | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Record & Replay | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |

### Environment Support

| Environment | msw-fetch-mock | MSW | nock | fetch-mock | jest-fetch-mock | undici MockAgent |
|-------------|:-:|:-:|:-:|:-:|:-:|:-:|
| Jest | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vitest | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Node native fetch | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Node http/axios | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Browser | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Cloudflare Workers API compat | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Interception Level

The interception level determines how closely mock behavior matches production:

| Solution | Interception Level | Description |
|----------|-------------------|-------------|
| MSW (browser) | Service Worker | Zero patching, closest to production |
| MSW (Node) | Node internals + undici | Extends `ClientRequest`, not monkey-patching |
| msw-fetch-mock | Same as MSW | MSW under the hood |
| nock | `http.request` | Monkey-patches Node http module |
| fetch-mock | `globalThis.fetch` | Replaces the fetch function |
| jest-fetch-mock | `global.fetch` | Replaces fetch with jest.fn() |
| undici MockAgent | undici Dispatcher | Replaces undici's dispatcher |

## The Real Advantages of msw-fetch-mock

After reviewing the comparison tables, msw-fetch-mock's advantages boil down to three points:

### 1. One API, Three Environments

The APIs for undici `MockAgent`, Cloudflare Workers `fetchMock`, and msw-fetch-mock are nearly identical:

```typescript
// undici MockAgent
const pool = mockAgent.get('https://api.example.com');
pool.intercept({ path: '/users', method: 'GET' }).reply(200, []);

// Cloudflare Workers fetchMock (cloudflare:test)
const pool = fetchMock.get('https://api.example.com');
pool.intercept({ path: '/users', method: 'GET' }).reply(200, []);

// msw-fetch-mock
const pool = fetchMock.get('https://api.example.com');
pool.intercept({ path: '/users', method: 'GET' }).reply(200, []);
```

If your code runs on both Node.js and Cloudflare Workers, your test mocks can share the same patterns — just change the import.

### 2. MSW's Interception Quality + undici's API Simplicity

MSW has the highest interception quality available (Service Worker in browser, `@mswjs/interceptors` in Node), but its API is verbose:

```typescript
// Raw MSW: one handler per endpoint
server.use(
  http.get('https://api.example.com/users', () => {
    return HttpResponse.json([{ id: 1 }]);
  }),
  http.post('https://api.example.com/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(body, { status: 201 });
  })
);

// msw-fetch-mock: chain builder, much less code
fetchMock.get('https://api.example.com')
  .intercept({ path: '/users' })
  .reply(200, [{ id: 1 }]);

fetchMock.get('https://api.example.com')
  .intercept({ path: '/users', method: 'POST' })
  .reply(201, ({ body }) => JSON.parse(body));
```

Plus, the features MSW lacks — `times()`, `persist()`, `assertNoPendingInterceptors()`, call history filtering — msw-fetch-mock has them all.

### 3. Works Alongside Existing MSW Setups

If your project already has an MSW server (e.g., for Storybook or integration tests), msw-fetch-mock can plug right in:

```typescript
import { setupServer } from 'msw/node';
import { createFetchMock } from 'msw-fetch-mock';

const server = setupServer(/* your existing handlers */);
const fetchMock = createFetchMock(server);
```

No need to tear down your existing MSW setup. No conflicts.

### 4. Works Without MSW Too

If you don't want to install MSW, msw-fetch-mock has a `native` mode that patches `globalThis.fetch` directly:

```typescript
import { fetchMock } from 'msw-fetch-mock/native';
```

Same API, just a different interception level. When you're ready to migrate to MSW, change the import path.

## Recommendations by Use Case

| Your Need | Recommended Solution |
|-----------|---------------------|
| Cross Node.js + Cloudflare Workers, unified mock API | **msw-fetch-mock** |
| Already using MSW, but find the API too verbose | **msw-fetch-mock** (plug into existing server) |
| Full-stack project, need browser + Node mocking | **MSW** or **msw-fetch-mock** |
| Node.js only + axios/http | **nock** |
| Node.js only + native fetch, no MSW | **undici MockAgent** |
| Vitest simple scenarios, no URL matching needed | **vitest-fetch-mock** |
| Jest simple scenarios | **fetch-mock** (avoid jest-fetch-mock — abandoned) |

msw-fetch-mock's sweet spot: you want MSW's interception quality with undici/Cloudflare's clean API, plus `times()`, `persist()`, and `assertNoPendingInterceptors()` for proper test lifecycle management.
