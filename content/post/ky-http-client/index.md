---
title: 'ky：用 fetch 的人，不用再寫那些重複的樣板'
date: '2026-03-12T09:00:00+08:00'
slug: ky-http-client
image: featured.jpg
description: 'ky 是基於 fetch 的輕量 HTTP 客戶端，4KB gzip 零依賴，內建 retry 指數退避、timeout、hooks 攔截器、JSON 簡寫，比 axios 小 3 倍，比裸 fetch 少寫一半程式碼。'
categories:
  - Frontend
tags:
  - ky
  - fetch
  - http
  - typescript
  - javascript
---

用 `fetch` 發請求，每次都要手動 `if (!response.ok) throw new Error(...)`。
要加 retry 就要自己寫迴圈，要加 timeout 就要拉出 `AbortController`。
[ky](https://github.com/sindresorhus/ky) 把這些都包好了，4KB，零依賴。

## fetch 的麻煩在哪

fetch 有幾個惱人的地方：

**1. HTTP 錯誤不會自動丟出例外**

```typescript
const response = await fetch('/api/users/1');
if (!response.ok) {  // 404、500 不會自動 throw，要手動檢查
  throw new Error(`HTTP ${response.status}`);
}
const user = await response.json();  // 還要再 await 一次
```

**2. POST JSON 要寫很多**

```typescript
const response = await fetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },  // 要自己設 header
  body: JSON.stringify({ name: 'Alice' }),           // 要自己序列化
});
```

**3. retry 和 timeout 要自己實作**

沒有內建。要 retry 就包迴圈，要 timeout 就拉 `AbortController`，每個專案都在複製貼上同一段邏輯。

ky 解決這些，同時保持用 fetch 的感覺。

## 安裝

```bash
npm install ky
```

支援 Node.js 22+、Bun、Deno 和現代瀏覽器。

## 基本用法對比

```typescript
import ky from 'ky';

// GET + 自動解析 JSON（原本要兩個 await）
const users = await ky.get('/api/users').json();

// POST JSON（不用手動設 Content-Type 和 stringify）
const newUser = await ky.post('/api/users', {
  json: { name: 'Alice', role: 'admin' }
}).json();
```

裸 fetch 的同等寫法要多出六七行，這段每個檔案都要重複。

## 內建 retry

```typescript
// 失敗最多重試 3 次，預設指數退避
const data = await ky.get('/api/data', {
  retry: 3
}).json();

// 細部設定
const data = await ky.get('/api/data', {
  retry: {
    limit: 5,
    statusCodes: [408, 429, 500, 502, 503, 504],  // 哪些狀態碼觸發重試
    backoffLimit: 3000,   // 最多等 3 秒
    jitter: true,         // 加入隨機避免 thundering herd
  }
}).json();
```

遇到 `429 Too Many Requests` 時，ky 會自動讀 `Retry-After` header 決定等多久。

## 內建 timeout

預設 10 秒。超過丟 `TimeoutError`。

```typescript
const data = await ky.get('/api/slow', {
  timeout: 5000   // 5 秒
}).json();

// 不要 timeout
const data = await ky.get('/api/stream', {
  timeout: false
}).json();
```

## Hooks：攔截請求和回應

ky 的 hooks 是 axios interceptors 的對等品。有四個時間點可以掛：

### beforeRequest：加 auth header

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

每次請求前都會執行，token 是即時從 storage 讀的，不會用到舊的。

### afterResponse：處理 401 自動刷新 token

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

          // 用新 token 重發原始請求
          return ky(request);
        }
        return response;
      }
    ]
  }
});
```

### beforeError：把 server 錯誤訊息附到 Error 上

```typescript
const api = ky.create({
  hooks: {
    beforeError: [
      async (error) => {
        if (error instanceof HTTPError) {
          const body = await error.response.clone().json().catch(() => ({}));
          error.message = body.message ?? error.message;
          error.data = body;  // 把 response body 掛到 error 上
        }
        return error;
      }
    ]
  }
});
```

之後 catch 到 error 就能直接看 server 回的訊息，不用再 `await error.response.json()`。

### beforeRetry：重試時記 log

```typescript
hooks: {
  beforeRetry: [
    ({ request, error, retryCount }) => {
      console.warn(`重試 #${retryCount}：${request.url}，原因：${error.message}`);
    }
  ]
}
```

## 建立共用 instance

用 `ky.create()` 建立有預設值的 instance，整個專案共用：

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

// 用的地方
const users = await api.get('users').json();
const user  = await api.get('users/1').json();
await api.post('posts', { json: { title: 'Hello' } });
```

### extend：繼承 instance 再擴充

```typescript
// 繼承 api 的所有設定，再加管理員 header
const adminApi = api.extend({
  headers: { 'X-Admin-Key': 'secret' }
});
```

hooks 是合併的，不是覆蓋，所以 `api` 上的 beforeRequest 也還在。

## searchParams

```typescript
// 物件（undefined 會被省略，null 保留）
const results = await ky.get('/api/search', {
  searchParams: {
    query: 'typescript',
    page: 1,
    limit: 20,
    draft: undefined   // 省略，不會出現在 URL
  }
}).json();
// → GET /api/search?query=typescript&page=1&limit=20
```

## TypeScript 型別

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// 泛型參數，拿到型別安全的結果
const user = await api.get<User>('users/1').json();
// user 的型別是 User

// 搭配 [Zod](/p/zod-typescript-validation/) 做執行期驗證
import { z } from 'zod';
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email()
});

const user = await api.get('users/1').json(UserSchema);
// 格式不對就丟 SchemaValidationError
```

## 錯誤處理

```typescript
import { HTTPError, TimeoutError, isHTTPError } from 'ky';

try {
  const data = await api.get('users/999').json();
} catch (error) {
  if (error instanceof HTTPError) {
    console.log(error.response.status);  // 404、500 等
    console.log(error.data);             // 如果有設 beforeError hook，這裡有 server 回的 body
  } else if (error instanceof TimeoutError) {
    console.log('請求逾時');
  }
}
```

## ky vs axios

| 功能 | ky | axios |
|------|----|----|
| 大小 | ~4KB gzip | ~14KB gzip |
| 依賴 | 零 | 多個 |
| 底層 | fetch | XHR（瀏覽器）/ http（Node） |
| 內建 retry | ✓ | 需要 axios-retry |
| 內建 timeout | ✓（預設 10s） | ✓ |
| 攔截器 | hooks | interceptors |
| Node.js 支援 | 22+ | 全版本 |
| Schema 驗證 | ✓（Standard Schema） | ✗ |

選 ky 的時機：現代瀏覽器專案、Node 22+、想要小 bundle、喜歡 fetch 但不想寫樣板。

選 axios 的時機：需要支援舊版 Node、既有大型專案已用 axios、需要 XHR 的特殊功能。

## 小結

ky 的定位很清楚：用 fetch 的人，解決 fetch 的痛點，不增加不必要的複雜度。retry、timeout、hooks、JSON 簡寫，這些都是每個用 fetch 的專案遲早都要自己實作的東西，ky 4KB 就包好了。

如果你的專案在用 axios，但其實沒用到 axios 的特殊功能，換 ky 能讓 bundle 小三分之二，然後 API 長得幾乎一樣。

## 參考資源

- [ky GitHub Repository](https://github.com/sindresorhus/ky)
- [ky npm 套件頁面](https://www.npmjs.com/package/ky)
- [MDN Fetch API 官方文件](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [axios GitHub Repository](https://github.com/axios/axios)
