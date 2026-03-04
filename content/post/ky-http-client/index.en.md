---
title: 'ky: Stop Writing Fetch Boilerplate'
date: '2026-03-12T09:00:00+08:00'
slug: ky-http-client
description: 'ky is a tiny fetch-based HTTP client — 4KB gzip, zero dependencies. Built-in retry with exponential backoff, timeout, hooks (like interceptors), JSON shorthand. 3x smaller than axios, half the code of raw fetch.'
categories:
  - Frontend
tags:
  - ky
  - fetch
  - http
  - typescript
  - javascript
---

Every project using `fetch` ends up with the same boilerplate: `if (!response.ok) throw new Error(...)`.
Add retry and you're writing a loop. Add timeout and you're pulling out `AbortController`.
[ky](https://github.com/sindresorhus/ky) wraps all of that. 4KB, zero dependencies.

## What's Annoying About fetch

The Fetch API has a few friction points that come up in every project:

**1. HTTP errors don't throw automatically**

```typescript
const response = await fetch('/api/users/1');
if (!response.ok) {  // 404 and 500 don't throw — you have to check manually
  throw new Error(`HTTP ${response.status}`);
}
const user = await response.json();  // second await required
```

**2. Posting JSON requires boilerplate**

```typescript
const response = await fetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },  // must set manually
  body: JSON.stringify({ name: 'Alice' }),           // must serialize manually
});
```

**3. No built-in retry or timeout**

Neither exists. Want retry? Write a loop. Want timeout? Wire up `AbortController`. Every project copy-pastes the same logic.

ky solves all of this while keeping the familiar fetch feel.

## Installation

```bash
npm install ky
```

Supports Node.js 22+, Bun, Deno, and modern browsers.

## Basic Usage Comparison

```typescript
import ky from 'ky';

// GET + automatic JSON parsing (used to require two awaits)
const users = await ky.get('/api/users').json();

// POST JSON (no manual Content-Type or JSON.stringify)
const newUser = await ky.post('/api/users', {
  json: { name: 'Alice', role: 'admin' }
}).json();
```

The raw fetch equivalent is six to seven extra lines — repeated in every file.

## Built-in Retry

```typescript
// Retry up to 3 times with exponential backoff
const data = await ky.get('/api/data', {
  retry: 3
}).json();

// Fine-grained control
const data = await ky.get('/api/data', {
  retry: {
    limit: 5,
    statusCodes: [408, 429, 500, 502, 503, 504],  // which status codes trigger retry
    backoffLimit: 3000,   // cap wait at 3 seconds
    jitter: true,         // add randomness to prevent thundering herd
  }
}).json();
```

On `429 Too Many Requests`, ky automatically reads the `Retry-After` header to determine how long to wait.

## Built-in Timeout

Default is 10 seconds. Throws `TimeoutError` when exceeded.

```typescript
const data = await ky.get('/api/slow', {
  timeout: 5000   // 5 seconds
}).json();

// Disable timeout
const data = await ky.get('/api/stream', {
  timeout: false
}).json();
```

## Hooks: Intercept Requests and Responses

ky's hooks are the equivalent of axios interceptors. Four lifecycle points are available:

### beforeRequest: Add auth headers

```typescript
const api = ky.create({
  baseUrl: 'https://api.example.com/v1',
  hooks: {
    beforeRequest: [
      (request) => {
        const token = localStorage.getItem('token');
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
      }
    ]
  }
});
```

Runs before every request. The token is read fresh from storage each time — never stale.

### afterResponse: Silent token refresh on 401

```typescript
const api = ky.create({
  hooks: {
    afterResponse: [
      async (request, options, response) => {
        if (response.status === 401) {
          const { accessToken } = await ky.post('/auth/refresh', {
            json: { refreshToken: localStorage.getItem('refreshToken') }
          }).json();

          localStorage.setItem('token', accessToken);
          request.headers.set('Authorization', `Bearer ${accessToken}`);

          // Retry the original request with the new token
          return ky(request);
        }
        return response;
      }
    ]
  }
});
```

### beforeError: Attach server error message to the Error object

```typescript
const api = ky.create({
  hooks: {
    beforeError: [
      async (error) => {
        if (error instanceof HTTPError) {
          const body = await error.response.clone().json().catch(() => ({}));
          error.message = body.message ?? error.message;
          error.data = body;  // attach the response body to the error
        }
        return error;
      }
    ]
  }
});
```

After this hook, catching the error gives you the server's message directly — no need to call `await error.response.json()` in every catch block.

### beforeRetry: Log retries

```typescript
hooks: {
  beforeRetry: [
    ({ request, error, retryCount }) => {
      console.warn(`Retry #${retryCount}: ${request.url} — ${error.message}`);
    }
  ]
}
```

## Shared Instance

Use `ky.create()` to build a configured instance and share it across the project:

```typescript
// lib/api.ts
import ky, { HTTPError } from 'ky';

export const api = ky.create({
  baseUrl: 'https://api.example.com/v1',
  timeout: 15_000,
  retry: {
    limit: 2,
    statusCodes: [500, 502, 503, 504]
  },
  hooks: {
    beforeRequest: [
      (request) => {
        const token = localStorage.getItem('authToken');
        if (token) request.headers.set('Authorization', `Bearer ${token}`);
      }
    ],
    beforeError: [
      async (error) => {
        if (error instanceof HTTPError) {
          const body = await error.response.clone().json().catch(() => ({}));
          error.message = body.message ?? `HTTP ${error.response.status}`;
          error.data = body;
        }
        return error;
      }
    ]
  }
});

// Usage
const users = await api.get('users').json();
const user  = await api.get('users/1').json();
await api.post('posts', { json: { title: 'Hello' } });
```

### extend: Inherit and add to an existing instance

```typescript
// Inherit everything from api, add admin header
const adminApi = api.extend({
  headers: { 'X-Admin-Key': 'secret' }
});
```

Hooks are merged, not replaced — the `beforeRequest` from `api` still runs.

## searchParams

```typescript
// Object (undefined is omitted, null is kept)
const results = await ky.get('/api/search', {
  searchParams: {
    query: 'typescript',
    page: 1,
    limit: 20,
    draft: undefined   // omitted — won't appear in URL
  }
}).json();
// → GET /api/search?query=typescript&page=1&limit=20
```

## TypeScript Types

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// Generic parameter gives you a typed result
const user = await api.get<User>('users/1').json();
// user is typed as User

// Combine with [Zod](/en/p/zod-typescript-validation/) for runtime validation
import { z } from 'zod';
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email()
});

const user = await api.get('users/1').json(UserSchema);
// Throws SchemaValidationError if response doesn't match the schema
```

## Error Handling

```typescript
import { HTTPError, TimeoutError } from 'ky';

try {
  const data = await api.get('users/999').json();
} catch (error) {
  if (error instanceof HTTPError) {
    console.log(error.response.status);  // 404, 500, etc.
    console.log(error.data);             // parsed server error body (if beforeError hook is set)
  } else if (error instanceof TimeoutError) {
    console.log('Request timed out');
  }
}
```

## ky vs axios

| Feature | ky | axios |
|---------|----|----|
| Bundle size | ~4KB gzip | ~14KB gzip |
| Dependencies | Zero | Several |
| Underlying | fetch | XHR (browser) / http (Node) |
| Built-in retry | ✓ | Needs axios-retry |
| Built-in timeout | ✓ (10s default) | ✓ |
| Interceptors | hooks | interceptors |
| Node.js support | 22+ | All versions |
| Schema validation | ✓ (Standard Schema) | ✗ |

**Choose ky when**: modern browser project, Node 22+, want a smaller bundle, like fetch but want less boilerplate.

**Choose axios when**: need legacy Node support, existing large codebase using axios, need XHR-specific features.

## Summary

ky has a clear purpose: solve fetch's pain points without adding complexity. Retry, timeout, hooks, JSON shorthand — these are things every fetch-based project eventually implements itself. ky bundles it all in 4KB.

If your project uses axios but doesn't actually use anything axios-specific, switching to ky cuts bundle size by two-thirds, and the API looks almost identical.
